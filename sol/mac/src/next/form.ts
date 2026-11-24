// BR1 root part 3 (#1615, mine/look/br1/strategy/root.html "A piece at each distance"): what a piece draws at the size it
// has on screen. Every piece kind has three forms: far (its name and a count, or a state in a word), near (its name and
// its line) and whole (all of it). formOf picks the largest form whose words fit the piece's width, whole; a name is never
// cut (no ellipsis, no clamp): when it does not fit, the piece drops to the next form down, and below far its words are
// not drawn at all (the shape stays, its name on the shape's title). The camera picks nothing by a zoom number: an
// opened folder is a folder in its whole form (plane/layout.ts camMoved).
// Sizes are the kit's (kit/tokens.ts TYPE, the scale's label/head/read); a text's width is the window's own measure of it
// in the face's font, or, outside a window (the tests), an even width a letter.
// Signed: marcocyl04-ux's agent (builder E), BR1 root (#1615).
import { TYPE } from "../kit/tokens.ts";
import type { Place } from "./place.ts";   // a type only: place.ts reads plane/layout.ts, which reads this file

/** a quiet folder's word on its line (BR1 words, #1615): "Nothing running · 38 sessions"; here, not in place.ts, so that
 *  layout.ts → form.ts never runs place.ts first (a FACE_PX read before it was set, next-group.test.ts) */
export const QUIET = "Nothing running";

export type Form = "far" | "near" | "whole";
/** what a form says, in the sizes it is set at: [text, type size] lines, set one under the other */
export type Says = { far: [string, keyof typeof TYPE][]; near: [string, keyof typeof TYPE][] };

/** a session's face is designed at this width or more; below it, it is its line (the old band's 280px, now the face's
 *  own least width: a folder opens when its pieces can draw whole) */
export const FACE_PX = 280;
/** a piece's padding either side, and its gap between lines (the scale's --s3 and --s1) */
const PAD = 12, GAP = 4;
/** a name and a line wrap to this many lines at most; more, and the piece drops a form */
export const LINES = 2;
/** outside a window: the face's font averages about this much of its size a letter (SF Pro Text, mixed case) */
const EM = 0.56;

let ctx: CanvasRenderingContext2D | null | undefined;
const seen = new Map<string, number>();
/** how wide a text is set at a size, in screen px */
export function widthOf(text: string, size: number, bold = false): number {
  const k = `${bold ? 1 : 0}${size}|${text}`;
  let w = seen.get(k);
  if (w !== undefined) return w;
  if (ctx === undefined) ctx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  if (ctx) { ctx.font = `${bold ? 700 : 400} ${size}px ${TYPE.family}`; w = ctx.measureText(text).width; }
  else w = text.length * size * EM * (bold ? 1.06 : 1);
  if (seen.size > 4000) seen.clear();
  seen.set(k, w);
  return w;
}

/** the words of a text and where it may break: after a space, a dash, a slash, an underscore or a dot ("clean-room"
 *  breaks after its dash, never inside "clean") */
export const wordsOf = (text: string) => text.split(/(?<=[\s\-/_.])/).filter(Boolean);

/** how many lines a text takes set in `room` px, word by word; Infinity when one word is wider than the room (it would
 *  be cut) */
export function linesOf(text: string, size: number, room: number, bold = false): number {
  if (!text) return 0;
  if (room <= 0) return Infinity;
  let n = 1, at = 0;
  for (const w of wordsOf(text)) {
    const ww = widthOf(w.trimEnd(), size, bold), sp = widthOf(w, size, bold);
    if (ww > room) return Infinity;
    if (at && at + ww > room) { n++; at = sp; } else at += sp;
  }
  return n;
}

/** a form's lines set in a box of `w` × `h` screen px: does each line fit, whole, in LINES lines or fewer, and all of
 *  them in the height (when the box has one)? */
export function fits(lines: [string, keyof typeof TYPE][], w: number, h = Infinity, padX = PAD, padY = PAD): boolean {
  const room = w - 2 * padX;
  let tall = 2 * padY;
  for (const [i, [text, size]] of lines.entries()) {
    const t = TYPE[size] as readonly [number, number], n = linesOf(text, t[0], room, i === 0);
    if (n > LINES) return false;
    tall += n * t[1] + (i ? GAP : 0);
  }
  return tall <= h;
}

/** the form a piece draws at `w` screen px wide (and `h` tall, when its box has a height): whole when it can draw whole
 *  (`whole`: its whole form's least width), else near when its near words fit, else far; `far` has its words only when
 *  `drawn` says they fit (wordsShown) */
export function formOf(says: Says, w: number, h = Infinity, whole = FACE_PX, padX = PAD): Form {   // padX: a box whose edge is not a piece's (the Diary's page, BR1 23+Q4)
  if (w >= whole) return "whole";
  return fits(says.near, w, h, padX) ? "near" : "far";
}
/** how many of far's lines are drawn: all when they fit; else its name alone (its word goes first, the name is what a
 *  person finds a thing by); else none, the shape alone */
export const wordsShown = (says: Says, w: number, h = Infinity): number =>
  fits(says.far, w, h) ? says.far.length : says.far.length > 1 && fits(says.far.slice(0, 1), w, h) ? 1 : 0;

// ---------------------------------------------------------------- the kinds

/** a folder far off: one state in a word and its count ("2 ask", "3 working", "38 sessions", "2 done"); one with nothing to count, its line ("Nothing in it yet",
 *  "Reading…"), the line its card says near, so no view draws it blank (try 5's first-timer, BR1 #1615).
 *  At rest the count is its sessions' one count (place.ts sessionsOf, BR1 hold 3), the number its line and its page say,
 *  in its line's words: "Nothing running · 38 sessions" near, "38 sessions" far (Place.count); a folder with no session
 *  counts its things the same way ("3 notes") */
export function farWord(pl: Place): string {
  const c = pl.counts, n = pl.sessions || c.pieces;
  if (c.asks) return `${c.asks} ask`;
  if (c.working) return `${c.working} working`;
  if (pl.state === "done" || pl.state === "kept") return `${n} ${pl.state}`;
  if (c.done && !c.quiet && c.done === c.pieces && pl.sessions <= c.done) return `${c.done} done`;
  return n ? pl.count || `${n} ${n === 1 ? "thing" : "things"}` : pl.line;
}
/** a folder: far, its name and its word; near, its name and its line (place.ts); whole, opened with its pieces. Given its
 *  card's box (`w` × `h` screen px), near's line is the whole line where it fits, else the line without the folders
 *  inside (Place.bare), so naming them never drops a card a form (BR1, orchestrator 07:32) */
export const folderSays = (pl: Place, leads: string[] = [], w?: number, h?: number): Says => {
  const word = farWord(pl), head = [[pl.name, "read"], ...leads.map((l) => [l, "head"] as [string, "head"])] as Says["near"];
  const near = (line: string): Says["near"] => [...head, [line, "head"]];
  // a quiet folder's card too small for its word keeps its count ("495 sessions"), never dropping a form for the word
  const lines = [pl.line, pl.bare, pl.bare.startsWith(`${QUIET} · `) ? pl.bare.slice(QUIET.length + 3) : pl.bare];
  const line = w === undefined ? pl.line : lines.find((l) => fits(near(l), w, h)) ?? pl.bare;
  return { far: word ? [[pl.name, "head"], [word, "label"]] : [[pl.name, "head"]], near: near(line) };
};
/** the line a folder's near form says (folderSays: the whole line, or its bare line where the whole does not fit) */
export const nearLine = (s: Says): string => s.near[s.near.length - 1][0];
/** a folder is whole (opened, its pieces drawn) once its pieces are wide enough to draw whole: a folder `w` units wide
 *  whose pieces are `pieceW` wide, at zoom `z` */
export const opened = (w: number, z: number, pieceW: number) => w * z >= (FACE_PX * w) / pieceW;
/** a piece drawn as its line: far, its name; near, its name and its state in a word */
export const lineSays = (name: string, state: string): Says => ({ far: [[name, "head"]], near: state ? [[name, "head"], [state, "label"]] : [[name, "head"]] });
