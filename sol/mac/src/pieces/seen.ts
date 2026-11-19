// The agent's eyes on its stage (#1435), the face's half: what the one space drew, sent to the engine as
// `work.stage.seen` (engine work/eyes.ts), so the agent's tools can say where a block landed and whether it fits, its
// next turn can say what the person did, and `look` can crop a still of the real window to the stage. Behind the switch
// stage.eyes (a row in Build's settings › switches, SpaceRow.tsx), off unless set. Nothing here leaves the Mac but this
// report to the engine on the same Mac.
//   measure(...)   reads the drawn pieces from the DOM: each [data-piece] box in window pixels, a page's scale, whether it
//                  is a still, how much of its body is below what shows, the data-part at the top of what shows
//   useSeen(...)   sends one report 300 ms after the space settles, and on the window's focus, blur and hiding; the
//                  switch turned off sends { off: true }, and the engine forgets every report at once (#1532)
import { useEffect, useRef, useSyncExternalStore } from "react";
import { buildSwitch } from "../flag.ts";
import { BOX } from "./arrange";

export const STAGE_EYES = "stage.eyes";
const sw = buildSwitch(STAGE_EYES);
export const stageEyes = () => sw.get();
export const setStageEyes = (v: boolean) => sw.set(v);
export const useStageEyes = () => useSyncExternalStore(sw.sub, sw.get);

export type Box = { x: number; y: number; w: number; h: number };
export type SeenPiece = { id: string; box: Box; large?: boolean; held?: boolean; scale?: number; still?: boolean; cut?: number; part?: string };
/** what the hand did, in the engine's words for it (eyes.ts Did) */
export type Did = { ev: "opened" | "away" | "closed" | "large" | "back" | "moved" | "widths" | "chat-less" | "chat-more"; id?: string };
export type SeenReport = {
  window: { w: number; h: number; visible: boolean; focused: boolean };
  stage: Box; pieces: SeenPiece[]; away: string[]; chat?: "col" | "lines" | "line" | "asks"; did: Did[];
  /** the agent may arrange this stage (#1437, the switch stage.hands): the engine refuses its moves in words when not */
  hands?: boolean;
};
/** the switch went off: the engine forgets what it was told (eyes.ts setSeen) */
export type SeenOff = { off: true };

// the switch turned off (Settings, with or without a space drawn): one word to the engine through the last way a report
// went, so the agent reads and takes nothing more of this window (#1532)
let lastSend: ((r: SeenOff) => void) | undefined;
sw.sub(() => { if (!sw.get() && lastSend) { const f = lastSend; lastSend = undefined; f({ off: true }); } });

const box = (r: DOMRect): Box => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });

/** how a piece's body fits it: a page from its frame's size report (Page.tsx keepSize), anything else from the most
 *  overflowing scroll box inside it (a list, a table) */
function fitOf(el: HTMLElement): Pick<SeenPiece, "scale" | "still" | "cut" | "part"> {
  const frame = el.querySelector<HTMLIFrameElement>("iframe.st-page");
  if (frame) {
    const drawn = frame.getBoundingClientRect().height, laid = frame.offsetHeight || 1, scale = Math.round((drawn / laid) * 100) / 100;
    const still = !!frame.closest(".st-pagebox.still");
    let cut = 0, part: string | undefined;
    try {
      const z = JSON.parse(frame.dataset.size ?? "{}") as { h?: number; top?: number; vh?: number; part?: string };
      if (Number.isFinite(z.h) && Number.isFinite(z.vh)) cut = Math.max(0, Math.round((z.h! - (z.top ?? 0) - z.vh!) * scale));
      if (typeof z.part === "string" && z.part) part = z.part;
    } catch { /* no size yet */ }
    return { ...(scale < 0.99 || still ? { scale } : {}), ...(still ? { still } : {}), ...(cut >= 8 ? { cut } : {}), ...(part ? { part } : {}) };
  }
  let cut = 0, n = 0;
  for (const e of el.querySelectorAll<HTMLElement>(".pc-in *")) {
    if (++n > 400) break;
    const over = e.scrollHeight - e.clientHeight - e.scrollTop;
    if (over > cut && e.clientHeight > 40) { const o = getComputedStyle(e).overflowY; if (o === "auto" || o === "scroll" || o === "hidden") cut = over; }
  }
  return cut >= 8 ? { cut: Math.round(cut) } : {};
}

/** what the space drew now (reads the DOM; the arrangement's facts come from Space) */
export function measure(space: HTMLElement, o: { large: string | null; held: string[]; names: string[]; chat?: SeenReport["chat"]; hands?: boolean; did: Did[] }): SeenReport {
  const pieces: SeenPiece[] = [];
  for (const el of space.querySelectorAll<HTMLElement>("[data-piece]")) {
    const id = el.dataset.piece!;
    if (id === BOX) continue;
    pieces.push({ id, box: box(el.getBoundingClientRect()), ...(o.large === id ? { large: true } : {}), ...(o.held.includes(id) ? { held: true } : {}), ...fitOf(el) });
  }
  return {
    window: { w: innerWidth, h: innerHeight, visible: document.visibilityState === "visible", focused: document.hasFocus() },
    stage: box(space.getBoundingClientRect()), pieces, away: o.names, ...(o.chat ? { chat: o.chat } : {}), did: o.did, ...(o.hands ? { hands: true } : {}),
  };
}

/** one report 300 ms after what is drawn settles (`key` changes), and on the window's focus, blur and hiding. `did` is
 *  read and emptied at each send */
export function useSeen(space: React.RefObject<HTMLElement | null>, key: string, facts: () => Omit<Parameters<typeof measure>[1], "did">, did: React.MutableRefObject<Did[]>, send?: (r: SeenReport | SeenOff) => void) {
  const on = useStageEyes();
  const t = useRef(0), f = useRef(facts); f.current = facts;
  useEffect(() => {
    if (!on || !send) return;
    const go = () => { clearTimeout(t.current); t.current = window.setTimeout(() => {
      const el = space.current; if (!el || !stageEyes()) return;
      const r = measure(el, { ...f.current(), did: did.current }); did.current = [];
      send(r); lastSend = send;
    }, 300); };
    go();
    // a page scrolled says so through its frame (Page.tsx keepSize: sol-size); the window's focus and hiding count too
    const el = space.current;
    el?.addEventListener("sol-size", go);
    addEventListener("focus", go); addEventListener("blur", go); document.addEventListener("visibilitychange", go);
    return () => { clearTimeout(t.current); el?.removeEventListener("sol-size", go); removeEventListener("focus", go); removeEventListener("blur", go); document.removeEventListener("visibilitychange", go); };
  }, [on, send, key, space, did]);
}
