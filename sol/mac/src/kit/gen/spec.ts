// The generator's vocabulary (#1245, item 1): what an agent may ask for when it composes a block for a person's stage at
// run time. A spec is JSON, `{ piece, props?, state?, children? }`, and names only the pieces below, each with the props,
// states and children it takes. Anything else is rewritten into this table by lint.ts (a rewriter, never a refusal:
// brand.md, "How the system is worked on"), and drawn by render.tsx with the real kit pieces (kit/Accent.tsx), so what an
// agent composes always reads as the same Sol. The states are the kit's own (checked against Accent.tsx's types below);
// the props are written by hand where the kit takes a ReactNode or a style a spec could not carry.
// No React here: lint.ts and its tests run under plain node.
import type { FileState, HaloState, PingState, Press, RowState, RunState } from "../Accent.tsx";
import { LOOKS, SYSTEM } from "../tokens.ts";

// ---- the system's closed sets ----------------------------------------------------------------------------------
/** the five depths (rule 1), shallowest to highest; lint moves any other to the nearest */
export const DEPTHS = ["well", "card", "control", "lifted", "sticker"] as const;
export type Depth = (typeof DEPTHS)[number];
const _depths: readonly (keyof typeof SYSTEM.depth)[] = DEPTHS;   // the same five as tokens.json palette.system.depth
void _depths;
/** the roles a colour may have (rules 13 to 20): grey at rest, pearl picked, Sol's bands, the three meanings */
export const ROLES = ["rest", "picked", "sol", "done", "ask", "wrong"] as const;
export type Role = (typeof ROLES)[number];
export const MEANINGS = ["done", "ask", "wrong"] as const;
export type Meaning = (typeof MEANINGS)[number];
/** the space scale (tokens.json palette.scale.space: s1 s2 s3 s4 s6 s8 s12); a Stack's gap is one of these */
export const GAPS = [0, 4, 8, 12, 16, 24, 32, 48] as const;
/** the grey a word may wear (rule 13): ink, dim, mute */
export const TONES = ["ink", "dim", "mute"] as const;
/** the file kinds (tokens.json looks.file.kinds), by their extension */
export const KINDS = LOOKS.file.kinds.map((k) => k[0]) as readonly string[];
/** a sticker's tilt, at most (rule 36) */
export const MAX_TILT = 3;
/** the widest a generated thing may be: the stage of the whole window, less its margins */
export const MAX_W = 960;

// ---- the spec -------------------------------------------------------------------------------------------------
export type Value = string | number | boolean | readonly string[];
export type Spec = { piece: PieceName; props: Record<string, Value>; state?: string; children?: Spec[] };

/** how a prop is checked: words, a number in a range, a flag, one of a list, a list of words, a colour's role, a depth,
 *  a gap on the scale, a sticker's tilt, a file kind */
export type Prop =
  | { t: "text"; max: number }
  | { t: "num"; min: number; max: number }
  | { t: "bool" }
  | { t: "enum"; of: readonly string[] }
  | { t: "words"; max: number }
  | { t: "role"; of: readonly Role[] }
  | { t: "depth"; of: readonly Depth[] }
  | { t: "gap" }
  | { t: "tilt" }
  | { t: "kind" };
export type PieceDef = {
  /** what it is, one line, for the README and an agent's prompt */
  is: string;
  props: Record<string, Prop>;
  /** its states, the kit's own; the first is its default */
  states?: readonly string[];
  /** which pieces it may hold: none, any, or a list */
  holds: "none" | "any" | readonly string[];
  /** the prop that carries its words: where a string child goes, and what an unknown piece's words become */
  words?: string;
  /** whether, in this state, it moves in the set's colours (rule 20: one at a time) */
  moves?: (s: string | undefined) => boolean;
};

const text = (max = 80): Prop => ({ t: "text", max });
const num = (min: number, max: number): Prop => ({ t: "num", min, max });
const one = (...of: string[]): Prop => ({ t: "enum", of });
const W = (min: number) => num(min, MAX_W);
/** a stilled piece (rule 20): it keeps its state and holds its bands still; set by lint, never asked for */
const still: Prop = { t: "bool" };

// the kit's states, as values, each checked against the kit's type both ways (a state the kit adds fails tsc here)
const ROW_STATES = ["rest", "hover", "press", "active", "active-running"] as const satisfies readonly RowState[];
const PRESS_STATES = ["rest", "hover", "press", "picked", "picked-hover", "sol", "sol-working"] as const satisfies readonly Press[];
const RUN_STATES = ["queued", "running", "slow", "done", "failed"] as const satisfies readonly RunState[];
const HALO_STATES = ["rest", "working", "arriving"] as const satisfies readonly HaloState[];
const PING_STATES = ["seen", "one", "three", "fanned"] as const satisfies readonly PingState[];
const FILE_STATES = ["rest", "hover", "press", "dragged", "made"] as const satisfies readonly FileState[];
type All<T, L extends readonly string[]> = [Exclude<T, L[number]>] extends [never] ? true : false;
const _all: [All<RowState, typeof ROW_STATES>, All<Press, typeof PRESS_STATES>, All<RunState, typeof RUN_STATES>,
  All<HaloState, typeof HALO_STATES>, All<PingState, typeof PING_STATES>, All<FileState, typeof FILE_STATES>] = [true, true, true, true, true, true];
void _all;
/** a block's states, the frame's (stage-whole.tsx): each said by its shape first (rule 17) */
export const BLOCK_STATES = ["resting", "working", "waiting", "done", "broken"] as const;

export const PIECES = {
  Block: {
    is: "the frame's card: a title, a mark at its right, what it holds below; the default home of a generated thing",
    props: { title: text(48), w: W(200), depth: { t: "depth", of: ["card", "lifted"] }, mark: text(8), still },
    states: BLOCK_STATES, holds: "any", words: "title",
    moves: (s) => s === "working",
  },
  Card: {
    is: "a solid card with no title, holding pieces",
    props: { w: W(120), depth: { t: "depth", of: ["well", "card", "control", "lifted"] }, gap: { t: "gap" } },
    holds: "any",
  },
  Stack: {
    is: "a row or a column of pieces, the gap from the scale",
    props: { direction: one("column", "row"), gap: { t: "gap" }, align: one("start", "center", "end", "stretch", "between") },
    holds: "any",
  },
  List: {
    is: "a card of rows, an optional title above them",
    props: { title: text(40), w: W(200), count: text(6) },
    holds: ["Row", "SessionRow"], words: "title",
  },
  Row: {
    is: "a line in a list: a title, a note under it, an aside; picked is pearl",
    props: { title: text(60), note: text(80), aside: text(12), picked: { t: "bool" }, w: W(160) },
    holds: ["Coin"], words: "title",
  },
  SessionRow: {
    is: "a session in the side: where you are is pearl, running adds Sol's small drifting mark",
    props: { title: text(48), aside: text(8), w: W(160), still },
    states: ROW_STATES, holds: ["Coin"], words: "title",
    moves: (s) => s === "active-running",
  },
  Pill: {
    is: "the one control: one word, or several with the picked one in pearl",
    props: { words: { t: "words", max: 5 }, picked: num(-1, 4), h: one("32", "36", "44") },
    states: PRESS_STATES, holds: ["Coin"], words: "words",
    moves: (s) => s === "sol-working",
  },
  Field: {
    is: "a place to write: a well, its words or a placeholder",
    props: { words: text(80), placeholder: text(60), w: W(120) },
    holds: "none", words: "words",
  },
  Meter: {
    is: "how full something is: the bar and its percent, a caption above",
    props: { value: num(0, 1), label: text(40), w: W(120) },
    holds: "none", words: "label",
  },
  MeterBar: {
    is: "the bar alone: a well with Sol's warm bands poured to the level",
    props: { value: num(0, 1), w: W(40), h: one("8", "10", "14") },
    holds: "none",
  },
  RunMark: {
    is: "an agent at work: a small well where Sol's bands drift; it ends green or red",
    props: { w: num(20, 64), still },
    states: RUN_STATES, holds: "none",
    moves: (s) => s === "running" || s === "slow",
  },
  Sticker: {
    is: "what Sol says on a card: mono capitals on pearl or a meaning, a little askew; at the edge, the corner or in line",
    props: { words: text(24), role: { t: "role", of: ["picked", "done", "ask", "wrong"] }, tilt: { t: "tilt" }, at: one("inline", "edge", "corner") },
    holds: "none", words: "words",
  },
  Coin: {
    is: "a round sticker: a meaning's flat colour, or Sol's still bands; a glyph on it",
    props: { role: { t: "role", of: ["done", "ask", "wrong", "sol"] }, d: num(8, 30), glyph: one("auto", "tick", "ask", "wrong", "said", "none") },
    holds: "none",
  },
  Num: {
    is: "a number as a mark: tabular, one size above its words",
    props: { value: text(10), tone: one(...TONES) },
    holds: "none", words: "value",
  },
  Text: {
    is: "words: a heading or a big number in the display cut, words, or a caption",
    props: { words: text(240), role: one("words", "heading", "number", "caption"), tone: one(...TONES) },
    holds: "none", words: "words",
  },
  FileTile: {
    is: "a file: a small card, its kind's colour on its sticker alone, the name under it",
    props: { kind: { t: "kind" }, name: text(28) },
    states: FILE_STATES, holds: "none", words: "name",
  },
  HaloDial: {
    is: "the jelly in its seat: rest breathes, working fills the seat with Sol's drift",
    props: { d: num(32, 96), still },
    states: HALO_STATES, holds: "none",
    moves: (s) => s === "working",
  },
  Ping: {
    is: "what came while you were away: a coin each, the count a number",
    props: {},
    states: PING_STATES, holds: "none",
  },
} as const satisfies Record<string, PieceDef>;

export type PieceName = keyof typeof PIECES;
export const NAMES = Object.keys(PIECES) as PieceName[];
export const def = (p: PieceName): PieceDef => PIECES[p];
