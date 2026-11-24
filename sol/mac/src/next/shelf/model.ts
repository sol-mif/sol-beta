// The shelf (BR1 item 7, #1615; sol/PROTOCOL.md next.shelf, P's engine half next/movein-place.ts shelfNow): the folders
// Sol judged one-time at the move-in and the ones the person hid, newest first, never emptied by time and nothing on it
// deleted. One changed since it went there is awake: proposed back. Live, the engine answers next.shelf { shelf, n,
// awake } after next.shelf, .put and .take, and after a move-in's keep or Back it is asked again; on the fixture (the dev
// page, tests) it is FIXTURE, and Take back only takes it off here. Shelf.tsx draws it. Invented folders only.
// Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { MODE, render } from "../cv/core.ts";
import type { Engine } from "../cv/wire/types.ts";
import { forget } from "../bar/undo.ts";

export type Shelved = { folder: string; name: string; by: "sol" | "person"; why: string; at: string; batch?: string; awake?: true };
export type ShelfNow = { shelf: Shelved[]; n: number };

/** the dev page's shelf: two Sol put there at a move-in (one changed since), one the person hid */
export const FIXTURE: Shelved[] = [
  { folder: "w:/Users/you/code/hackathon-demo", name: "hackathon-demo", by: "sol", why: "it was changed on one day only, 2026-09-12, and three in four of your folders were used more", at: "2026-11-20T09:00:00.000Z", batch: "movein-dev", awake: true },
  { folder: "h:flyer-draft", name: "flyer-draft", by: "person", why: "you put it there", at: "2026-11-19T17:30:00.000Z" },
  { folder: "w:/Users/you/code/tutorial-copy", name: "tutorial-copy", by: "sol", why: "it was changed on one day only, 2026-08-03, and three in four of your folders were used more", at: "2026-11-18T08:00:00.000Z", batch: "movein-dev" },
];

let now: ShelfNow = { shelf: [], n: 0 };
let fixed = false;   // the fixture's copy made once, so a Take back on the dev page stays taken
let e: Engine | null = null;
let answered = false;   // the engine's next.shelf heard once: before, a folder on the Shelf still reads as on the canvas
/** what is on the Shelf is known: the engine answered (outside live, always) (BR1 hold 1: the nest line waits on it) */
export const shelfKnown = (): boolean => MODE !== "live" || answered;
const subs = new Set<() => void>();
const tell = () => subs.forEach((f) => f());

export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** the shelf as it stands: the engine's live, the fixture's otherwise */
export function shelfNow(): ShelfNow {
  if (MODE === "fixture" && !fixed) { fixed = true; now = { shelf: [...FIXTURE], n: FIXTURE.length }; }
  return now;
}
/** the awake ones first (proposed back), then the rest, each group newest first as the engine sent them */
export const inOrder = (s: Shelved[]): Shelved[] => [...s.filter((x) => x.awake), ...s.filter((x) => !x.awake)];

const day = (at: string) => { const t = Date.parse(at); return Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""; };
/** who put it there and why, in one line; an awake one is proposed back */
export function lineOf(x: Shelved): string {
  if (x.awake) return "Changed since it was archived, so it may be in use again. Bring it back?";
  const d = day(x.at), on = d ? ` on ${d}` : "";
  return x.by === "person" ? `You put it here${on}` : `Sol put it here${on}: ${x.why}`;
}

/** the folder a Diary line is about while it is on the shelf, else null: a live move-in row's id is its folder's id
 *  (movein/live.ts) and the line's key is "movein:<who>:<row>" (movein/data.ts linesOf); its Bring back is takeBack */
export function shelvedOf(key: string | null | undefined, shelf: Shelved[]): string | null {
  const m = key ? /^movein:[^:]+:(.+)$/.exec(key) : null;
  return m && shelf.some((x) => x.folder === m[1]) ? m[1] : null;
}

/** a folder on the shelf is not on the canvas (plane/layout.ts isOff reads this), at once and after a reload, since the
 *  shelf is the engine's (BR1 order 2) */
export const onShelf = (folder: string): boolean => shelfNow().shelf.some((x) => x.folder === folder);
/** the shelf changed: its row and the canvas both drawn again */
const changed = (shelf: Shelved[]) => { now = { shelf, n: shelf.length }; tell(); render(); };

/** the engine's next.shelf, taken whole; anything else is not the shelf */
export function heard(m: { type?: unknown; shelf?: unknown }): boolean {
  if (m?.type !== "next.shelf" || !Array.isArray(m.shelf)) return false;
  changed(m.shelf.filter((x): x is Shelved => !!x && typeof x.folder === "string" && typeof x.name === "string"));
  answered = true;
  return true;
}

/** a folder off the shelf, back on the canvas where it was, at once (BR1 hold H1: it waited for a reload); live the
 *  engine's next.shelf.take too, its answer the shelf as it stands. The Undo line that put it there goes with it */
export function takeBack(folder: string): void {
  changed(shelfNow().shelf.filter((x) => x.folder !== folder));
  forget(`shelf:${folder}`);
  if (MODE === "live") e?.send({ type: "next.shelf.take", folder });
}

/** the person puts a folder on the shelf (the ⋯ menu's Put on the Shelf), kept there as theirs and off the canvas at
 *  once; live the engine's next.shelf.put too, its answer the shelf as it stands */
export function putOn(folder: string, name: string): void {
  const was = shelfNow().shelf.filter((x) => x.folder !== folder);
  changed([{ folder, name, by: "person", why: "you put it there", at: new Date().toISOString() }, ...was]);
  if (MODE === "live") e?.send({ type: "next.shelf.put", folder, name });
}

/** the wire (cv/wire/index.ts): the shelf asked once, again after anything that can put a folder on it or take one off */
export function attach(en: Engine): () => void {
  e = en;
  const off = en.subscribe((m: { type?: unknown; shelf?: unknown }) => {
    if (heard(m)) return;
    if (m?.type === "next.movein.kept" || m?.type === "next.placed" || m?.type === "next.shelf.take" || m?.type === "next.shelf.put") en.send({ type: "next.shelf" });
  });
  en.send({ type: "next.shelf" });
  return () => { off(); if (e === en) e = null; now = { shelf: [], n: 0 }; tell(); };
}

/** tests: back to before anything was heard */
export function reset(): void { now = { shelf: [], n: 0 }; fixed = false; e = null; tell(); }
