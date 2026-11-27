// The store's shapes (#1604, docs/port/slices.md "The contract every slice keeps"): the mockup's data model
// (mine/look/merge/engine.js: mk, R, P, A, session, fresh) as types, the names kept. A piece carries more than is typed
// here (each slice's own fields: parts, made, checked, arrivals…), so every shape stays open.
// Signed: marcocyl04-ux's agent, the port's prep (#1615).

/** a folder on the plane (engine.js calls it a region): code, life or mixed, as it was made; parent: the folder it sits
 *  in (BR1, folders in folders), none at the top of the canvas; parentBy: who put it there, as Pos.by */
export type Region = { id: string; name: string; kind: "code" | "life" | "mixed"; parent?: string; parentBy?: "person" | "ai" | "rule"; [more: string]: unknown };
/** a terminal's face: its last lines, what it waits for, its state in words */
export type Term = { lines: string[]; waiting: string | null; stateWord: string };
/** a side copy in a copies piece */
export type Copy = { name: string; state: string };
/** an AI's arrival, not yet placed (folded per AI per day) */
export type Arrival = { day: number; ai: string; what: string; accepted: boolean };
/** one thing on the plane: a session, a side copies list, arrivals, a page, a list, a sticky, a block, a row… */
export type Piece = {
  id: string; region: string; kind: string; name: string;
  ai?: string; copy?: string; branch?: string; files?: number; state?: string; term?: Term; talk?: string[];
  text?: string; copies?: Copy[]; items?: Arrival[]; parts?: Piece[]; part?: boolean; inside?: string; splitBy?: string;
  words?: string; by?: string;
  [more: string]: unknown;
};
/** one ask: ranked across everything, on a piece, answered in place or at Near */
export type Ask = {
  id: string; rank: number; piece: string; kind: "code" | "life"; source: string; text: string; how: "inplace" | "near";
  answered: boolean; serious?: boolean; same?: string; part?: string;
  /** the keys of the facts the session that asked knew (the engine's next.needs): its because… (because/Because.tsx) */
  because?: string[];
  /** the engine's judgment (next.raises, wire/raises.ts): the most its folder's raise says at rest (0 silence, 1 dot,
   *  2 line, 3 question) and why, one sentence, the because… */
  care?: { level: 0 | 1 | 2 | 3; why: string };
  [more: string]: unknown;
};
/** an AI and the piece it works in */
export type Ai = { name: string; piece: string; [more: string]: unknown };
/** what an AI does on its own, on a clock */
export type Routine = { ai: string; what: string; when: string };
/** where a thing sits on the plane, in plane units, and who put it there. A folder inside a folder (BR1) is drawn in one of
 *  its folder's cells at scale `s` (its pieces too); `in` is the folder the person put it in (null: the person took it to
 *  the top), kept by the engine (pos.ts). `hand: "fold"`: the person only folded it, where the rule put it; a fold is not an
 *  arrangement, so it holds nothing (layout.ts byHand) */
export type Pos = { x: number; y: number; w: number; h: number; by: "person" | "ai" | "rule"; touched: boolean; at: number; cols?: number; fresh?: boolean; folded?: boolean; s?: number; in?: string | null; hand?: "fold" };
/** today's page on the canvas (BR1, #1615: no zones, only folders; the name is kept for the slices that read D.zones.page):
 *  the Diary's span across x, its page, the page's foot, the zoom of the person's scale at Far */
export type Zones = { diary: { x: number; w: number }; page: { x: number; y: number; w: number; h: number }; bottom: number; fit: number };

/** D: everything the face draws. regions are the folders (the plan's "places"); sessions and stickies are pieces of
 *  their kind (sessions(), stickies()); pos and zones (today's page) are written by the plane's layout (slice 1); diary is the diary's
 *  book (slice 4). Views read it through useNext and never change it; moves and wires do */
export type Data = {
  regions: Region[]; pieces: Record<string, Piece>; asks: Record<string, Ask>; ais: Ai[];
  routines?: Routine[]; pos?: Record<string, Pos>; zones?: Zones; diary?: unknown;
  /** the move-in's answers the plane reads (BR1, #1615): `lead`, what the person sees first (next.movein.lead) */
  movein?: { lead?: "day" | "work" | "both" | null };
  [more: string]: unknown;
};

export type Cam = { x: number; y: number; z: number };
export type Dist = "far" | "middle" | "near" | "needs";
/** the counts' tally (engine.js fresh().c): the suite reads it */
export type Tally = {
  moves: number; presses: number; answers: number; order: number[]; secs: number;
  crossings: { from: string; to: string; steps: number; far: boolean }[];
  peeks: number; wrong: number; demoted: number; sent: number; recv: number; stolen: number; delayed: number; tooMuch: number; mapPath: number; log: string[];
};
/** S: where the person is (engine.js fresh(), its names kept), and `page`, the shell's page over the canvas
 *  (ais, settings, cowork, social; null on the canvas) */
export type State = {
  dist: Dist; region: string | null; piece: string | null; pane: string; beside: string | null; part: string | null;
  keysSide: string; sel: number; cam: Cam; page: string | null;
  hist: string[]; fwd: string[]; recent: string[];
  askHere: string | null; askLine: string | null; peek: string | null; pending: string[]; pendAt: Record<string, number>;
  calm: boolean; fix: string | null; follow: string | null; tmStep?: number;
  term: Record<string, unknown>; doc: Record<string, string>;
  sig: Record<string, number | boolean | null>;
  c: Tally;
  lastKind: string | null; crossFrom: { kind: string | null; steps: number; far: boolean } | null;
  sawFar?: boolean; camSet?: boolean; camRule?: Cam; camLine?: number;
  [more: string]: unknown;
};

/** what every move returns (slices.md): ok, the id it made or touched, and its one undo. A move whose engine row is
 *  "no" (map.md) returns { ok: false, why: "not yet" } in a real Sol */
export type Done = { ok: boolean; id?: string; why?: string; undo: () => void };
export type Move = (...args: any[]) => Done;
export type Moves = Record<string, Move>;

/** one phrase of the talk pill's chain: the words it hears and the move it makes (the first that answers wins) */
export type Phrase = { hears: RegExp; run: (m: RegExpMatchArray, words: string) => Done | null | undefined };

/** a scenario of the fixture (engine.js SCEN): its data and where it starts */
export type Scen = { label: string; data: () => Data; start: "far" | { piece?: string; region?: string } };
