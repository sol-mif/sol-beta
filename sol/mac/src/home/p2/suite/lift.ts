// Lift (#692 suite step 1, sticky.html's dashed line): a Home block past a sticky's bounds goes to the stage or to Build.
// To the stage: the stand-in marks it lifted and names its address, sol://home/block/<id>; a page block at that address
// is composed on the stage the window shows (kinds/here.ts: OneStage's store and session), as Stage.tsx's own adds do.
// To Build: the stand-in writes the seed (its words, its folder's path, its shelf) and a session starts from it the way
// a proposal card's start does (work.start, from the stage's session, in the folder's directory): on the engine when the
// window has one (engineStore.asker), else Home's own socket (the stand-in names a session so the lift completes).
// The sticky stays in Home as a chip pointing at it (Piece.tsx); the chip's ring is the session's (useRunBusy).
import { useEffect, useState, useSyncExternalStore } from "react";
import { store as stageStore } from "../../../stage/engineStore";
import type { Here } from "../../../stage/kinds/here";
import type { Block2, Home2Api } from "../pass2";

// ---- the say line: what the last move did, under the stickies (sticky.html's line under the board) ----
let said = "", saidAt = 0;
const sub = new Set<() => void>();
let t: ReturnType<typeof setTimeout> | undefined;
export function say(line: string, ms = 4200) {
  said = line; saidAt = Date.now(); sub.forEach((f) => f());
  clearTimeout(t); t = setTimeout(() => { said = ""; sub.forEach((f) => f()); }, ms);
}
export const useSaid = () => useSyncExternalStore((f) => { sub.add(f); return () => { sub.delete(f); }; }, () => said);
export const saidSince = () => saidAt;

type Lifted = { type: string; error?: string; block?: Block2; src?: string; title?: string; seed?: { title: string; cwd: string; prompt: string; shelf: string[] } };

/** a block lifted to the stage: the page block at its address, beside Home on the same stage */
export async function liftToStage(b: Block2, h: Home2Api, here: Here | null): Promise<boolean> {
  if (!here) { say("lift to the stage needs Home on a stage: open it as a block (sol://home)"); return false; }
  const r = await h.ask<Lifted>({ type: "home.block.lift", id: b.id, to: "stage" });
  if (!r?.src) { say(r?.error ?? "Home's engine did not answer the lift"); return false; }
  const id = `home-${b.id}`;
  here.store.compose(here.session, { id, kind: "page", title: r.title ?? b.words.slice(0, 60), state: "live", versions: [], sessions: [here.session], body: { src: r.src } });
  h.send({ type: "home.block.lift", id: b.id, to: "stage", ref: id });
  say("lifted: a block on the stage; the sticky stays here as a chip pointing at it");
  return true;
}

/** a block lifted to Build: a session seeded with its words, its folder's path and its shelf */
export async function liftToBuild(b: Block2, h: Home2Api, here: Here | null): Promise<string | null> {
  const r = await h.ask<Lifted>({ type: "home.block.lift", id: b.id, to: "build" });
  if (!r?.seed) { say(r?.error ?? "Home's engine did not answer the lift"); return null; }
  const a = { from: here?.session ?? "", title: r.seed.title, prompt: r.seed.prompt, cwd: r.seed.cwd };
  const engine = stageStore.asker();
  say("starting a session in Build…", 60_000);
  const s = engine && here
    ? await engine<{ sessionId?: string; error?: string }>("work.start", a, 60_000)
    : await h.ask<{ sessionId?: string; error?: string }>({ type: "work.start", ...a });
  if (!s?.sessionId) {
    h.send({ type: "home.block.lift", id: b.id, to: "home" });
    say(`not started: ${s?.error ?? "nothing answered work.start"}`);
    return null;
  }
  h.send({ type: "home.block.lift", id: b.id, to: "build", ref: s.sessionId });
  say(`in Build: a session in ${r.seed.cwd.split("/").slice(-2).join("/")}, with its shelf (${r.seed.shelf.join(" · ")})`);
  return s.sessionId;
}

/** back to a sticky in Home: the block on the stage stays as it is (the stage's own close takes it off) */
export function foldHome(b: Block2, h: Home2Api) { h.send({ type: "home.block.lift", id: b.id, to: "home" }); say("back to a sticky"); }

/** whether a Build session runs now (work.run on the window's engine); null when no engine says */
export function useRunBusy(sessionId: string | undefined): boolean | null {
  const [busy, setBusy] = useState<boolean | null>(null);
  useEffect(() => {
    const l = stageStore.link();
    if (!sessionId || !l) return;
    return l.listen((m: { type?: string; sessionId?: string; busy?: boolean; working?: boolean; runs?: { sessionId: string; busy?: boolean; working?: boolean }[] }) => {
      if (m.type === "work.run" && m.sessionId === sessionId) setBusy(!!(m.busy ?? m.working));
      else if (m.type === "work.sessions" && m.runs) { const r = m.runs.find((x) => x.sessionId === sessionId); setBusy(r ? !!(r.busy ?? r.working) : false); }
    });
  }, [sessionId]);
  return busy;
}
