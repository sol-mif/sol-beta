// The four lenses (#701, sitting 7; play.html's setLens and lensFolded): placement rules over the same blocks, never
// another app. Pure, so the face's tests run them (src/stage-lens.test.ts); the lens itself is kept in stage.json.
//   app   the stage, the strip, the side: as you left it
//   TUI   a terminal block (part 5) full on the stage, every other block folded to a line inside it; ⌘1-9 opens one
//   CLI   the strip alone (the talk lifted); an artifact opens the stage when it asks (waits)
//   IDE   the search-first file column at the left (FilePane), the same artifacts, the talk beside
// Leaving a lens restores what it folded; the TUI's own terminal folds when you leave it, a terminal it borrowed goes
// back to where it sat.
import { isRunBody } from "./kinds/runs.ts";
import type { Block, Lens, Place, Rect, StageJson } from "./model";

export const LENSES: Lens[] = ["app", "tui", "cli", "ide"];
/** as the pill says them */
export const LENS_NAMES: Record<Lens, string> = { app: "app", tui: "TUI", cli: "CLI", ide: "IDE" };
/** the toast a lens says when you pick it (play.html's) */
export const LENS_WORDS: Record<Lens, string> = {
  app: "app: the talk beside the stage",   // #1001: the strip went in #742
  tui: "TUI: a terminal on the stage, the blocks fold to lines",
  cli: "CLI: the talk alone; an artifact opens the stage when it asks",
  ide: "IDE: files on the left, the same artifacts, the talk beside",
};
/** the TUI lens's own terminal, when it has to make one */
export const TUI_TITLE = "terminal · this session";

const alive = (live: Block[], id: string) => live.some((b) => b.id === id);
const strip = (p: Place, ...keys: (keyof Place)[]) => { const q = { ...p }; for (const k of keys) delete q[k]; return q; };

/** the terminal the TUI shows: its own if it is still alive, else one already on the stage (not popped out) */
export function tuiTerminal(places: Place[], live: Block[]): Place | null {
  const terms = places.filter((p) => !p.popped && live.some((b) => b.id === p.id && b.kind === "terminal"));
  return terms.find((p) => p.tui) ?? terms.find((p) => !p.folded) ?? terms[0] ?? null;
}

/** leaving a lens: what it folded unfolds where it was; its own terminal folds; a borrowed one goes back */
export function leave(places: Place[]): Place[] {
  return places.map((p) => {
    if (p.lensed) return { ...strip(p, "lensed"), folded: false };
    if (p.was) return { ...strip(p, "was"), ...p.was };
    if (p.tui && !p.folded) return { ...p, folded: true };
    return p;
  });
}

/** the stage as it is in lens `to`, from whatever lens it was in; `want` says the TUI needs a terminal made (the face
 *  composes one, and `adopt` puts it full when it arrives). `full` is the stage's whole slot (zoneRect full). */
export function switchLens(stage: StageJson, live: Block[], to: Lens, full: Rect): { stage: StageJson; want: "terminal" | null } {
  let places = leave(stage.blocks);
  if (to !== "tui") return { stage: { ...stage, lens: to, blocks: places }, want: null };
  const z = Math.max(0, ...places.map((p) => p.z)) + 1;
  const t = tuiTerminal(places, live);
  places = places.map((p) => {
    if (t && p.id === t.id) return { ...p, ...full, folded: false, z, ...(p.tui ? {} : { was: { x: p.x, y: p.y, w: p.w, h: p.h } }) };
    if (!p.folded && !p.popped && alive(live, p.id)) return { ...p, folded: true, lensed: true };
    return p;
  });
  return { stage: { ...stage, lens: "tui", blocks: places }, want: t ? null : "terminal" };
}

/** a terminal composed for the TUI arrived: it is the lens's own, full and on top */
export function adopt(stage: StageJson, id: string, full: Rect): StageJson {
  const z = Math.max(0, ...stage.blocks.map((p) => p.z)) + 1;
  return { ...stage, blocks: stage.blocks.map((p) => (p.id === id ? { ...strip(p, "was", "lensed"), ...full, folded: false, tui: true, z } : p)) };
}

/** the TUI's lines: every other block on this stage, one line each, in the order ⌘1-9 opens them. A run (#703) is
 *  no line: in every lens it is its chip by the talk. */
export function tuiLines(places: Place[], live: Block[], term: string): Block[] {
  return live.filter((b) => b.id !== term && !isRunBody(b.body) && places.some((p) => p.id === b.id && !p.popped));
}

/** CLI hides the stage until a block asks (waits on you): then the stage opens for it. A run asks by its chip by the
 *  talk (yellow), not by the stage, while it is folded; opened from its chip, it opens the stage. */
export function cliAsks(live: Block[], places: Place[]): boolean {
  return live.some((b) => {
    const p = places.find((q) => q.id === b.id && !q.popped);
    if (!p) return false;
    if (isRunBody(b.body)) return !p.folded;
    return b.state === "waits";
  });
}

/** #954, stage.whole (whole.md pain 8: "TUI, CLI and IDE are drawings of the same blocks"): a lens only redraws. The
 *  blocks keep their places; what an older lens folded or moved comes back (leave) */
export function drawLens(stage: StageJson, to: Lens): StageJson {
  return { ...stage, lens: to, blocks: leave(stage.blocks) };
}

/** #954, the IDE lens behind stage.whole (whole.html scene 12): the blocks as editor groups, each block a tab. Up to
 *  three groups fill the stage: one alone; two side by side; three as a tall group at the left and two stacked at the
 *  right. The blocks in reading order go one to a group, then round again as more tabs. Pure */
export type Group = { ids: string[]; r: Rect };
export function ideGroups(order: string[], room: { w: number; h: number }, pad: number, gap: number, foot = 0): Group[] {
  const n = Math.min(3, order.length), W = room.w - 2 * pad, H = room.h - pad - Math.max(pad, foot);
  if (!n || W <= 0 || H <= 0) return [];
  const half = Math.floor((W - gap) / 2), top = Math.floor((H - gap) / 2);
  const rects: Rect[] = n === 1 ? [{ x: pad, y: pad, w: W, h: H }]
    : n === 2 ? [{ x: pad, y: pad, w: half, h: H }, { x: pad + half + gap, y: pad, w: W - half - gap, h: H }]
    : [{ x: pad, y: pad, w: half, h: H }, { x: pad + half + gap, y: pad, w: W - half - gap, h: top }, { x: pad + half + gap, y: pad + top + gap, w: W - half - gap, h: H - top - gap }];
  const groups: Group[] = rects.map((r) => ({ ids: [], r }));
  order.forEach((id, i) => groups[i % n].ids.push(id));
  return groups;
}

/** #1001: leaving a lens that narrowed the stage (the IDE's file column): each block back at the place and size it had
 *  before the lens, which the narrower stage shrank to fit (Stage.tsx fitInto) and nothing gave back. A block the hand
 *  moved or sized meanwhile, or one folded or popped since, stays as it is (pure) */
export function backFromLens(now: Place[], was: Place[], moved: ReadonlySet<string>): Place[] {
  return now.map((p) => {
    const w = was.find((x) => x.id === p.id);
    if (!w || w.folded || moved.has(p.id) || p.folded || p.popped) return p;
    return { ...p, x: w.x, y: w.y, w: w.w, h: w.h };
  });
}
