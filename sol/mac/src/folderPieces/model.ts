// What the face knows of a folder's pieces (#1092; the engine's half is sol/engine/src/work/pieces.ts). Pure, so the
// face's tests reach it: the row's one figure, its state as behaviour, what a press does, where a drop lands.
export type PieceState = "live" | "working" | "waits" | "frozen" | "dead";
export type PieceInfo = {
  name: string; title: string; view: "list" | "table" | "card"; id: string; state: PieceState; wants: number; total: number; open?: number; line?: string;
  /** what wants him and came since he last looked: only this earns the yellow */
  fresh?: number;
  /** new and wanting, Jev only half sure it needs him: a dashed rim, no yellow */
  doubt?: number;
  at: number; every: number; ceiling: "look" | "draft" | "act" | "spend"; verbs: string[]; about?: string; from: string; error?: string; sessions: string[];
  /** a script piece waiting for his yes to run the folder's scripts: a dashed chip, not a red one */
  asks?: string;
  /** the built-in source it reads ("due"): Home's sticky press belongs to the built-in due only */
  builtin?: string;
  /** what the yes covers, in words ("sol-dev and its worktrees", "this folder") */
  scope?: string;
  /** the recipe's sentence for what its agent does between his visits: his to rewrite on the back */
  tend?: string;
  /** a session's agent asked to go past the ceiling: the rung it needs, and that session (the "let it act" chip) */
  may?: "draft" | "act" | "spend"; mayFrom?: string;
  /** who asks: the session's name when it fits whole, else "an agent" */
  mayBy?: string;
};
export type Step = { t: string; st: "done" | "half" | "wait" | ""; note?: string; id?: string; href?: string; group?: string; press?: string;
  /** the row's own figure ("2 d"), where the note says where it is from */
  fig?: string;
  /** Jev's pick for the front, half sure (the engine's jevFront): drawn as a name with a dashed hairline */
  ghost?: boolean };

/** a row whose press keeps what is in effect ("keep", the night's questions): the press puts it away and opens nothing;
 *  its link is the quiet "change it" beside the button (pure) */
export const keepsOnly = (s: { press?: string }) => s.press === "keep";

/** a block is drawn as a piece's only with a pieces switch on and a piece's id (pieces.ts idOf); off, it is any list
 *  (pure; the reviewer's 3) */
export const isPieceId = (id: string, on: boolean) => on && id.startsWith("piece-");

/** the backing-off wait before a folder that answered with an error is asked again: 1.5 s, doubling, at most a minute
 *  (pure; the reviewer's 10: never every 1.5 s forever) */
export const againIn = (tries: number) => Math.min(60_000, 1500 * 2 ** Math.max(0, Math.min(tries, 10)));

/** the row's state, drawn as behaviour: rest (quiet square), working (it breathes), you (the person's yellow), broken */
export type Look = "rest" | "working" | "you" | "broken";
export function lookOf(p: Pick<PieceInfo, "state" | "wants" | "error" | "at" | "fresh" | "asks">): Look {
  if (p.asks) return "rest";
  if (p.error) return "broken";
  if (p.state === "working" || p.at === 0) return "working";
  // yellow is earned (the design's NOW 1 of 01:26): only what came since he last looked; the count stays, in ink
  if ((p.fresh ?? p.wants) > 0) return "you";
  return "rest";
}

/** the one figure at the row's right: what wants you, else the piece's own line cut short, else how many rows are still
 *  open (answered ones are not counted); never a sentence */
export function figureOf(p: Pick<PieceInfo, "wants" | "total" | "line" | "error" | "at" | "open" | "asks">): string {
  if (p.asks) return "";
  if (p.error) return "!";
  if (p.at === 0) return "";
  if (p.wants > 0) return String(p.wants);
  if (p.line && p.line.length <= 8) return p.line;
  const n = p.open ?? p.total;
  return n ? String(n) : "";
}

/** the ceiling in plain words: what the agent may do on it without asking */
export const CEILING_WORDS: Record<PieceInfo["ceiling"], string> = {
  look: "reads only",
  draft: "reads and drafts; asks before acting",
  act: "acts; asks before spending",
  spend: "acts and spends within its budget",
};

/** how long ago, short: "now", "4 min", "2 h" (pure) */
export function ago(at: number, now = Date.now()): string {
  if (!at) return "reading…";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86_400)} d ago`;
}

/** a pulse in words: "every 5 min" (pure) */
export const everyWords = (s: number) => (s < 90 ? `every ${s} s` : s < 5400 ? `every ${Math.round(s / 60)} min` : `every ${Math.round(s / 3600)} h`);

/** where a dragged piece lands, from what is under the hand: a session row in the side, or a session's stage (pure over
 *  the two attributes the side and the stage wear: data-sid, data-stage) */
export function dropTarget(under: { sid?: string | null; stage?: string | null; main?: boolean; live?: string | null }): { session: string; on: "row" | "stage" } | null {
  if (under.sid) return { session: under.sid, on: "row" };
  if (under.stage) return { session: under.stage, on: "stage" };
  // over the open session's room (its talk, before it has a stage): that session
  if (under.main && under.live) return { session: under.live, on: "stage" };
  return null;
}

/** a list body's steps, from the block's json (the engine's work.pieces.open seen.body) */
export function stepsIn(text?: string): { steps: Step[]; line?: string } {
  try { const v = JSON.parse(text ?? ""); return { steps: Array.isArray(v?.steps) ? v.steps : [], ...(typeof v?.line === "string" ? { line: v.line } : {}) }; } catch { return { steps: [] }; }
}

/** which row is in front (pure): one brought forward by hand while it is still open, else the first that wants you,
 *  else none (the front then says nothing waits on you) */
export function frontOf(steps: Step[], hand: number | null): number | null {
  if (hand !== null && steps[hand] && steps[hand].st !== "done") return hand;
  const i = steps.findIndex((s) => s.st === "wait");
  return i >= 0 ? i : null;
}

/** the front button's word, named by what it does (pure): the recipe's own, else "open" with a link, else "done";
 *  never "yes" */
export function pressOf(s: Pick<Step, "press" | "href">): string {
  const w = s.press?.trim();
  if (w && w.toLowerCase() !== "yes") return w.slice(0, 16);
  return s.href ? "open" : "done";
}

/** a piece that never asks (no row wants him): its own line as its front, "15 changed today" from a line that is a
 *  count; none when it has neither (pure) */
export function ownLine(title: string, line: string | undefined, steps: { st: string }[]): string | null {
  // a row that waits, or one he answered, means the piece asks: its front is its rows, or "nothing waits on you"
  if (steps.some((s) => s.st === "wait" || s.st === "done")) return null;
  const l = (line ?? "").trim();
  if (/^\d+$/.test(l)) return `${l} ${one(Number(l), title)}`;
  if (l) return l;
  return steps.length ? `${steps.length} ${one(steps.length, title)}` : null;
}
/** a title after a count of one says its last word once (pure): "1 recent file", never "1 recent files" (#1125); a
 *  word whose s is its own (status, class, this) stays; classes, boxes lose their es */
export const one = (n: number, title: string) => (n !== 1 ? title : /(ss|x|ch|sh)es$/.test(title) ? title.slice(0, -2) : title.replace(/([^sui])s$/, "$1"));
/** true when every row carries the same note (it says nothing about any one row) (pure) */
export const sameNoteOf = (steps: { note?: string }[]) => steps.length > 1 && !!steps[0].note && steps.every((s) => s.note === steps[0].note);

/** the folder's rows in his morning's order (the designer's NOW 1 of 06:31; pure): what is new for him (the yellow), then
 *  what wants him, then the rest; inside a group the night, picks, waits on me first, then by title. Never the alphabet
 *  alone */
const FIRST = ["night", "picks", "waits-on-me"];
export function orderOf<P extends Pick<PieceInfo, "name" | "title" | "wants" | "fresh">>(ps: P[]): P[] {
  const group = (p: P) => ((p.fresh ?? 0) > 0 ? 0 : p.wants > 0 ? 1 : 2);
  const first = (p: P) => { const i = FIRST.indexOf(p.name); return i < 0 ? FIRST.length : i; };
  return [...ps].sort((a, b) => group(a) - group(b) || first(a) - first(b) || a.title.localeCompare(b.title));
}
/** five rows at most; the rest fold into one dim row by name. A folded piece that earns the yellow, or the one open in
 *  the room, takes a shown place (pure) */
export const SHOWN = 5;
export function shownOf<P extends Pick<PieceInfo, "name" | "fresh">>(ordered: P[], unfolded: boolean, open: string | null = null): { shown: P[]; folded: P[] } {
  if (unfolded || ordered.length <= SHOWN) return { shown: ordered, folded: [] };
  const keep = (p: P, i: number) => i < SHOWN || (p.fresh ?? 0) > 0 || p.name === open;
  return { shown: ordered.filter(keep), folded: ordered.filter((p, i) => !keep(p, i)) };
}
