// What makes two windows read as one object (#1090), drawn over the window with `screens.two` on. Design round 1
// (S/design/design.md): nothing is said, the thing itself goes.
//   the seam     alone: a ghost (a dashed pearl hairline) on the edge toward the other screen; a block carried past it,
//                or a press on it, opens the second window there. Two windows: a solid 2 px light on the facing edge
//                only, breathing on the clock so both windows breathe together; lit in the jelly's bands, 160 px, where a
//                block is carried toward it (here, or on the other window toward this one).
//   the peek     a block carried toward this window on the other one comes out of this seam as its own frame, at the
//                height it left, as much of it showing as has crossed (Peek.tsx).
//   the map      top centre, the same on every window: the windows as their screens stand, what each holds as a shape,
//                how many wait and how many run (ScreenMap.tsx). Press the other rect: the windows trade.
//   the keys     ⌃⌥ + the arrow toward the other window throws the block under the pointer; ⌃⌥ Return gathers
//                everything here; ⌃⌥ Tab trades.
//   gather       a double press on the seam brings everything on the other window here.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useScreensOn } from "./flag";
import { keptKindFor, tellAt, changedAt, record, ME, useScreens, many, swap, gather, put, roleNow, crossed, askWhere, askFollow, forgetOffer, forgetFollow, talkTo, letGoFar, useSessionNow } from "./store";
import { otherWins, drawnOn, type Edge, type ScreensState } from "./model";
import { throwByKey, alone, ghostEdge, onRefused, seams as seamsNow } from "./throw";
import { openScreenNow } from "./open";
import { Peek } from "./Peek";
import { Names, REST_MS, LEAVE_MS, NEAR_PX } from "./Names";
import { store as stageStore } from "../stage/engineStore";
import { screensState as screensStateNow } from "./store";
import "./seam.css";
import "./peek.css";
import "./lift.css";   // design NOW 05:08 #1: the edge answers a lifted block

export const meta = {
  Seam: {
    job: "two windows of Jelly read as one object: the seam on the facing edge, the peek, the map, gather and the keys",
    flow: "mine",
    states: ["switch off: nothing", "alone: the ghost seam", "two: the seam at rest, breathing", "a block carried toward the seam: lit where it is", "a block coming in from the other window: its peek", "a popup refused: the ghost shakes"],
    keys: [
      { press: "drag a block off the seam", does: "it lands on the other window; alone, the second window opens holding it" },
      { press: "click the ghost seam", does: "the second window opens holding this session's blocks" },
      { press: "⌃⌥ and the arrow toward the other window", does: "the block under the pointer goes there" },
      { press: "⌃⌥ Return", does: "everything on the other window comes here" },
      { press: "⌃⌥ Tab", does: "the two windows trade what they hold" },
      { press: "double-click the seam", does: "everything on the other window comes here" },
    ],
    listens: ["screens.state, screens.carry (screens/store.ts)", "the pointer while a block is carried"],
  },
};

// the session Build has open in this window (home/Home.tsx keeps it in sol.home.open), and its blocks as the engine has them
const openSession = (): string | null => { try { const o = JSON.parse(localStorage.getItem("sol.home.open") ?? "null"); return o?.kind === "session" && typeof o.id === "string" ? o.id : null; } catch { return null; } };
const blocksNow = () => { const sid = openSession(); return sid ? stageStore.read(sid).blocks : []; };
/** the open session's blocks drawn on another window: what gather brings here */
const elsewhere = (s: ScreensState) => blocksNow().map((b) => b.id).filter((id) => drawnOn(s, id) !== ME);
/** the open session's blocks drawn here: what the ghost's press sends to the new window */
const here = (s: ScreensState) => blocksNow().map((b) => b.id).filter((id) => drawnOn(s, id) === ME);
/** the open session's blocks drawn on another window, with their names: what the names at the seam offer */
const overThere = (s: ScreensState) => blocksNow().filter((b) => drawnOn(s, b.id) !== ME).map((b) => ({ id: b.id, title: b.title || b.kind }));
const PHASE = `-${Date.now() % 4800}ms`;   // the breath's phase from the clock: every window breathes at once

/** the box as drawn (design NOW 05:08 #2a: the chip stands on its drawn edge, not on the wrapper's) */
const boxEl = () => document.querySelector(".hc-barbox .ask-inner") ?? document.querySelector(".hc-barbox");

export function Seams() {
  const on = useScreensOn();
  const { s, carry, offer, follow, pointed } = useScreens();
  const sessionNow = useSessionNow();   // the seam's watches follow the session shown here
  const [lit, setLit] = useState<{ edge: Edge; y: number } | null>(null);
  // alone, from any block's drag start to its end: the ghost seam goes solid and the other screen's shape stands at the
  // pointer's height (design NOW 05:08 #1); the share of the edge along it, 0..1
  const [lifted, setLifted] = useState<number | null>(null);
  const [bright, setBright] = useState(false);
  const [shake, setShake] = useState(0);
  // the seam pulses once (pearl, 850 ms) when a block over on the other window changes: felt here, not seen
  const [pulse, setPulse] = useState(0);
  // its height on the seam (0..1) when the window that draws the block said it; null: the whole seam (design NOW 05:08 #8)
  const [pulseY, setPulseY] = useState<number | null>(null);
  const lastPulse = useRef(0);
  const toldAt = useRef(new Map<string, number>());   // a block's height told at most once a second
  const pulseWait = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(pulseWait.current), []);
  const pointer = useRef<{ x: number; y: number }>({ x: -1, y: -1 });
  // the names at the seam: out after the pointer rests near it, gone after it leaves (Names.tsx's timers)
  const [names, setNames] = useState<{ edge: Edge; y: number } | null>(null);
  const overNames = useRef(false);
  const two = on && many(s);
  const lone = on && !two && alone();
  // one seam per stretch of an edge another screen touches (more than two screens: seams.ts, design rules 1, 2, 6)
  const edges: { win: string; edge: Edge; from: number; upto: number }[] = two ? seamsNow().filter((x) => x.to).map((x) => ({ win: x.to!.win, edge: x.edge, from: x.from, upto: x.upto }))
    : lone ? [{ win: "", edge: ghostEdge(), from: 0, upto: 1 }] : [];
  const edgeKey = edges.map((e) => `${e.edge}:${e.from.toFixed(2)}-${e.upto.toFixed(2)}`).join(",");

  // the seam lights where a block is carried toward it, in the last 8% before it or past it
  useEffect(() => {
    if (!edges.length) return;
    let carrying = false;   // the press began on a block's head: a carry, not a text selection
    const along = (x: number, y: number) => { const e = edges[0]?.edge; return e === "top" || e === "bottom" ? x / window.innerWidth : y / window.innerHeight; };
    const dn = (ev: PointerEvent) => {
      carrying = !!(ev.target as HTMLElement | null)?.closest?.("[data-block] .st-head, [data-block] .st-grip");
      if (carrying && lone) setLifted(along(ev.clientX, ev.clientY));
    };
    const mv = (ev: PointerEvent) => {
      pointer.current = { x: ev.clientX, y: ev.clientY };
      if (!ev.buttons || !carrying) { setLit(null); if (!ev.buttons) setLifted(null); return; }
      if (lone) setLifted(along(ev.clientX, ev.clientY));
      const W = window.innerWidth, H = window.innerHeight, x = ev.clientX, y = ev.clientY;
      const e = edges.find(({ edge }) => (edge === "right" ? x > W * 0.92 : edge === "left" ? x < W * 0.08 : edge === "top" ? y < H * 0.08 : y > H * 0.92));
      setLit(e ? { edge: e.edge, y: e.edge === "left" || e.edge === "right" ? y / H : x / W } : null);
    };
    const up = () => { carrying = false; setLit(null); setLifted(null); };
    const key = (k: KeyboardEvent) => { if (k.key === "Escape") { carrying = false; setLifted(null); } };   // Esc puts the carry back
    window.addEventListener("pointerdown", dn, true);
    window.addEventListener("pointermove", mv, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointerdown", dn, true); window.removeEventListener("pointermove", mv, true); window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true); window.removeEventListener("keydown", key, true); setLifted(null);
    };
  }, [edgeKey, lone]); // eslint-disable-line react-hooks/exhaustive-deps

  // the keys: ⌃⌥ + an arrow throws the block under the pointer (or holding the focus); ⌃⌥ Return gathers; ⌃⌥ Tab trades
  useEffect(() => {
    if (!two) return;
    const down = (ev: KeyboardEvent) => {
      if (!ev.ctrlKey || !ev.altKey || ev.metaKey) return;
      if (ev.key === "Enter") { if (roleNow(s) === "anchor") return; ev.preventDefault(); ev.stopPropagation(); gather(ME, elsewhere(s)); return; }
      if (ev.key === "Tab") { const o = otherWins(s, ME)[0]; if (o) { ev.preventDefault(); ev.stopPropagation(); swap(ME, o.win); } return; }
      const edge = ({ ArrowLeft: "left", ArrowRight: "right", ArrowUp: "top", ArrowDown: "bottom" } as const)[ev.key as "ArrowLeft"];
      if (!edge) return;
      const { x, y } = pointer.current;
      const el = (x >= 0 ? document.elementFromPoint(x, y) : null)?.closest<HTMLElement>("[data-block]") ?? (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-block]");
      const id = el?.dataset.block;
      if (id && throwByKey(id, edge)) { ev.preventDefault(); ev.stopPropagation(); }
    };
    window.addEventListener("keydown", down, true);   // before Build's own arrows
    return () => window.removeEventListener("keydown", down, true);
  }, [two, s]);

  useEffect(() => onRefused(() => setShake((n) => n + 1)), []);
  // Jev pick 1 (design JEV, NOW 02:07 #2): on the window with the talk, a block the session just made is asked about once
  const role = two ? roleNow(s) : null, talking = role === "whole" || role === "stage";
  useEffect(() => {
    if (!talking) return;
    const sid = openSession();
    if (!sid) return;
    let known: Set<string> | null = null;
    const look = () => {
      const seen = stageStore.read(sid);
      if (seen.ready === false) return;
      const ids = seen.blocks.map((b) => b.id);
      if (known === null) { known = new Set(ids); return; }
      for (const b of seen.blocks) {
        if (known.has(b.id)) continue;
        known.add(b.id);
        const by = seen.ledger[b.id]?.[0]?.by ?? "";
        if (by === "you" || crossed(b.id)) continue;   // the person's own, or one that came from the other window
        const st = screensStateNow();
        // as you left it (design JEV 3, Jev said act): a kind that lived on a window last time opens there, no ask
        const kw = keptKindFor(sid, b.kind);
        if (kw && kw !== drawnOn(st, b.id) && st.windows.some((w) => w.live && w.win === kw)) { put(b.id, kw); continue; }
        askWhere({ block: b.id, title: b.title, kind: b.kind, ask: document.title || "",
          here: seen.blocks.filter((x) => drawnOn(st, x.id) === ME).map((x) => x.title), there: seen.blocks.filter((x) => drawnOn(st, x.id) !== ME).map((x) => x.title) });
      }
    };
    look();
    return stageStore.subscribe(sid, look);
  }, [talking, sessionNow]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!two) return;
    const sid = openSession();
    if (!sid) return;
    let last = new Map<string, unknown>();
    const look = () => {
      const seen = stageStore.read(sid), st = screensStateNow(), now = new Map<string, unknown>();
      let changed: string | null = null;
      for (const b of seen.blocks) {
        now.set(b.id, b);
        if (!last.has(b.id) || last.get(b.id) === b || crossed(b.id)) continue;
        if (drawnOn(st, b.id) !== ME) { changed = b.id; continue; }
        // drawn here: say at what height, so the other window's seam pulses there
        const el = document.querySelector<HTMLElement>(`[data-block="${CSS.escape(b.id)}"]`);
        const was = toldAt.current.get(b.id) ?? 0;
        if (el && Date.now() - was >= 1000) { toldAt.current.set(b.id, Date.now()); const r = el.getBoundingClientRect(); tellAt(b.id, (r.top + r.height / 2) / window.innerHeight); }
      }
      last = now;
      if (!changed) return;
      // at most one a second; the drawing window's word comes within a moment (both hear the same change)
      const id = changed;
      window.clearTimeout(pulseWait.current);
      pulseWait.current = window.setTimeout(() => {
        if (Date.now() - lastPulse.current < 1000) return;
        lastPulse.current = Date.now();
        setPulseY(changedAt(id)); setPulse((n) => n + 1);
      }, 150);
    };
    look();
    return stageStore.subscribe(sid, look);
  }, [two, sessionNow]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!pulse) return; const t = window.setTimeout(() => setPulse(0), 900); return () => window.clearTimeout(t); }, [pulse]);
  // the offer's ghost goes after its time
  useEffect(() => { if (!offer) return; const t = window.setTimeout(forgetOffer, Math.max(0, offer.until - Date.now())); return () => window.clearTimeout(t); }, [offer]);
  // follow-me (Jev 6): on a window without the talk, the pointer staying 10 s with presses here asks once (then not for
  // 30 s). A ghost: the box's outline at the bottom left; "act": the same, and the next key typed takes the talk here
  const talkless = two && (role === "wall" || role === "anchor");
  useEffect(() => {
    if (!talkless) { forgetFollow(); return; }
    let since = 0, presses = 0, asked = 0;
    const t = window.setInterval(() => {
      if (!since || Date.now() - asked < 30_000) return;
      const secs = (Date.now() - since) / 1000;
      if (secs < 10 || presses < 2) return;
      asked = Date.now();
      askFollow({ seconds: secs, presses, blocks: blocksNow().filter((b) => drawnOn(screensStateNow(), b.id) === ME).map((b) => b.title) });
    }, 1000);
    const enter = () => { if (!since) since = Date.now(); };
    const leave = () => { since = 0; presses = 0; };
    const press = () => { enter(); presses++; };
    document.addEventListener("pointermove", enter, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave); window.addEventListener("blur", leave);
    window.addEventListener("pointerdown", press, true);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("pointermove", enter);
      document.documentElement.removeEventListener("pointerleave", leave); window.removeEventListener("blur", leave);
      window.removeEventListener("pointerdown", press, true);
    };
  }, [talkless]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (follow !== "act") return;
    const key = (ev: KeyboardEvent) => { if (ev.key.length === 1 && !ev.metaKey && !ev.ctrlKey) { forgetFollow(); talkTo(ME); } };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [follow]);
  useEffect(() => {
    if (!two) return;
    let rest: number | undefined, leave: number | undefined;
    const mv = (ev: PointerEvent) => {
      if (ev.buttons) { window.clearTimeout(rest); return; }   // not during a carry
      const W = window.innerWidth, H = window.innerHeight, x = ev.clientX, y = ev.clientY;
      const near = edges.find(({ edge }) => (edge === "right" ? x > W - NEAR_PX : edge === "left" ? x < NEAR_PX : edge === "top" ? y < NEAR_PX : y > H - NEAR_PX));
      if (near || overNames.current) {
        window.clearTimeout(leave); leave = undefined;
        if (near) { window.clearTimeout(rest); rest = window.setTimeout(() => setNames((n) => n ?? { edge: near.edge, y }), REST_MS); }
      } else {
        window.clearTimeout(rest);
        if (leave === undefined) leave = window.setTimeout(() => { leave = undefined; setNames(null); }, LEAVE_MS);
      }
    };
    window.addEventListener("pointermove", mv, true);
    return () => { window.removeEventListener("pointermove", mv, true); window.clearTimeout(rest); window.clearTimeout(leave); };
  }, [two, edgeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // the map in the head is hovered: both windows' seams brighten while it lasts (HeadMap.tsx)
  useEffect(() => { const f = (e: Event) => setBright(!!(e as CustomEvent<boolean>).detail); window.addEventListener("sol:screens-bright", f); return () => window.removeEventListener("sol:screens-bright", f); }, []);

  if (!on || !edges.length) return null;
  // the ghost's press: the second window opens holding this session's blocks; this window keeps its side and talk
  const openWith = () => {
    const ids = here(s);
    ids.forEach((id) => put(id, "two"));
    if (!openScreenNow("two", "wall")) { ids.forEach((id) => put(id, null)); setShake((n) => n + 1); }
  };
  // a block carried toward this window on another one: lit at its height on the seam that faces that window
  const inEdge = carry ? edges.find((e) => e.win === carry.from)?.edge : undefined;
  const peeking = !!(two && inEdge && carry);
  // the offer's ghost stands at the seam toward the window with the talk
  const inEdgeOf = (_o: { block: string }) => edges.find((e) => { const w = s.windows.find((x) => x.win === e.win); return w && (w.role === "whole" || w.role === "stage"); })?.edge ?? edges[0]?.edge;
  if (peeking !== (document.documentElement.dataset.peek === "1")) { if (peeking) document.documentElement.dataset.peek = "1"; else delete document.documentElement.dataset.peek; }
  return (
    <div className="sc-layer" data-part="screens" data-state={two ? "two" : "alone"} style={{ "--sc-phase": PHASE } as CSSProperties}>
      {edges.map(({ win, edge, from, upto }) => {
        const inside = (y: number) => y >= from - 0.02 && y <= upto + 0.02;
        const at = lit?.edge === edge && inside(lit.y) ? lit.y : inEdge === edge && win === carry?.from ? carry!.y : lone && lifted !== null ? lifted : null;
        // a stretch, not the whole edge: the seam is drawn only along it (inside the edge's own 6% ends)
        const part = from > 0.001 || upto < 0.999;
        const span: CSSProperties = !part ? {} : edge === "left" || edge === "right" ? { top: `${Math.max(6, from * 100).toFixed(1)}%`, bottom: `${Math.max(6, (1 - upto) * 100).toFixed(1)}%` } : { left: `${Math.max(6, from * 100).toFixed(1)}%`, right: `${Math.max(6, (1 - upto) * 100).toFixed(1)}%` };
        const shape = lone ? record().other : undefined;
        return (
          <div key={`${win || "ghost"}-${edge}-${from.toFixed(2)}`} className={`sc-seam ${edge} ${lone ? "ghost" : ""} ${lone && lifted !== null ? "lift" : ""} ${lit?.edge === edge || inEdge === edge ? "carrying" : ""} ${bright ? "bright" : ""} ${lone && shake ? "refused" : ""} ${pulse && !lone ? "sc-pulse" : ""} ${pulse && !lone && pulseY !== null ? "sc-pulse-at" : ""}`}
            data-seam={edge} data-to={win || undefined} style={{ ...span, ...(at !== null ? ({ "--sc-y": `${(((at - (part ? Math.max(0.06, from) : 0.06)) / ((part ? Math.min(0.94, upto) : 0.94) - (part ? Math.max(0.06, from) : 0.06))) * 100).toFixed(1)}%` } as CSSProperties) : pulse && pulseY !== null ? ({ "--sc-y": `${(pulseY * 100).toFixed(1)}%` } as CSSProperties) : {}) }}
            onClick={lone ? openWith : undefined} onDoubleClick={two && roleNow(s) !== "anchor" ? () => gather(ME, elsewhere(s)) : undefined}
            onAnimationEnd={() => setShake(0)} role={lone ? "button" : undefined} aria-label={lone ? "open Jelly on your other screen" : undefined}>
            {!lone && <i className="sc-lit" />}
            {!lone && pulse > 0 && pulseY !== null && <i key={pulse} className="sc-pulseat" />}
            {lone && <i className="sc-dest" style={shape ? { aspectRatio: `${shape.w} / ${shape.h}` } : undefined} />}
          </div>
        );
      })}
      {two && inEdge && carry && <Peek carry={carry} edge={inEdge} />}
      {two && offer && inEdgeOf(offer) && <Peek ghost carry={{ block: offer.block, title: offer.title, kind: offer.kind, w: 440, h: 300, y: 0.5, over: 0 }} edge={inEdgeOf(offer)!} onPress={() => { forgetOffer(); put(offer.block, ME); }} />}
      {talkless && follow && role !== "anchor" && (
        <button type="button" className="sc-boxghost" data-part="the box, offered" aria-label="bring the talk here" onClick={() => { forgetFollow(); talkTo(ME); }} />
      )}
      {talking && pointed && boxEl() && createPortal(
        <div className="sc-pointed" data-part="pointed at, over there">
          {pointed.on.map((o) => (
            <button key={o.id} type="button" className="sc-pchip" onClick={letGoFar} aria-label={`let go of ${o.title}`}>
              <svg viewBox="0 0 22 14" width="18" height="12" aria-hidden><rect x=".5" y=".5" width="21" height="13" rx="2.5" fill="none" stroke="currentColor" /></svg>
              <span>{o.title || "a block"}</span>
            </button>
          ))}
        </div>, boxEl()!)}
      {two && names && overThere(s).length > 0 && (
        <div onPointerEnter={() => { overNames.current = true; }} onPointerLeave={() => { overNames.current = false; }}>
          <Names open edge={names.edge} blocks={overThere(s)} pointerY={names.y} onPull={(id) => { put(id, ME); setNames(null); }} />
        </div>
      )}
    </div>
  );
}
