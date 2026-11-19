// A team's way of working (docs/cowork-ways-2026-11-10/FORMAT.md, step 3): the shapes the way engine works on. The
// engine is pure: it reads a way file (load.ts), judges a rule (rules.ts) and a move (moves.ts), folds the way.* events
// into what each thing is now (fold.ts), lists the triggers due (triggers.ts) and replays a thing's life under another
// version (replay.ts). Nothing here reads a clock, a zone, a file or the network: time comes in as ms, the zone from the
// way itself, a seam's answer as a value handed in. What it gives back are drafts, { kind, item, value, at }, each value
// fitting its way.* row (contract/kinds.ts) once its writer fills in the ids it points at; writing them is the caller's.
import { canonical } from "../canonical.js";

/** the format version this engine reads (FORMAT §7): a way whose `way` is higher loads read-only */
export const FORMAT = 1;

/** an id in a way file (a role, thing, state, move, rule, trigger, seam, part): letters, digits, `_ . -`, never a `:` or
 *  a `>` (those join ids in events: `trigger:expire`, `to_remove>removed`), never a name every object has
 *  (`__proto__`, `constructor`, `prototype`: ids are keys of plain objects here), so every id fits the way family's rule */
export const ID = /^(?!(?:__proto__|constructor|prototype)$)[A-Za-z0-9_][\w.-]{0,79}$/;
/** a thing's id: no dot either, so a note's `about` "<thing>.<field>" names one field of one thing; at most 64, and a
 *  field's name at most FIELD_MAX, so "<thing>.<field>" is never longer than the 120 an id may be (F16) */
export const THING = /^(?!(?:__proto__|constructor|prototype)$)[A-Za-z0-9_][\w-]{0,63}$/;
export const FIELD_MAX = 55;
/** a state's id at most 59 long, so a proposal's map entry "<old>><new>" is at most 119 */
export const STATE_MAX = 59;
/** the most seams a way may name that give "check": a press names at most one way.checked a seam */
export const CHECKS_MAX = 64;
/** a person's login, as the team trail's keys (team/v3/keys.ts LOGIN) */
export const LOGIN = /^[A-Za-z0-9-]{1,39}$/;
/** who may press (FORMAT §1.1): a person, a person's agent, a machine signed by a person. Never a stand-in for another */
export const WHO = /^(?:person:[A-Za-z0-9-]{1,39}|agent:[A-Za-z0-9-]{1,39}|machine:[a-z0-9][a-z0-9-]{0,39}@[A-Za-z0-9-]{1,39})$/;
/** a way's runner (FORMAT §1.5): one Sol, `<machine>@<login>`, what follows `machine:` in WHO's machine form. Never a
 *  bare login (a person has many Sols), never a `person:` or a `machine:` prefix. That Sol signs as `machine:<runner>` */
export const RUNNER = /^[a-z0-9][a-z0-9-]{0,39}@[A-Za-z0-9-]{1,39}$/;
/** what a way.* event's names must be (contract/kinds.ts IDS for the way family) */
export const EVENT_ID = /^[\w.:>-]{0,120}$/;
/** a seam's package print: a SHA-256, or `sha256:tbd` while its plugin is not built (such a way cannot be applied) */
export const PKG = /^sha256:(?:[0-9a-f]{64}|tbd)$/;

export type Rule = Record<string, unknown>;
export type Role = { name: string; who: string[] };
export type ThingDef = { name: string; fields: Record<string, string> };
export type State = { name: string; end?: boolean; enter?: string };
export type Move = { id: string; from: string | string[] | null; to: string; by: string[]; set?: string[]; fix?: Record<string, unknown>; when?: string };
export type Life = { states: Record<string, State>; moves: Move[] };
export type Do = { ping: string; say?: string } | { move: string } | { act: string };
export type Trigger = { on: string; if?: Rule; do: Do };
export type Seam = { plugin: string; pv: number; pkg: string; gives: "check" | "act" | "page" | "carry" };
export type Part = { id: string; part: string; of: string; where?: Rule; show?: string[] };
export type Way = {
  way: number; id: string; name: string; prev: string; zone: string; runner: string;
  roles: Record<string, Role>; things: Record<string, ThingDef>; life: Record<string, Life>; rules: Record<string, Rule>;
  triggers: Record<string, Trigger>; record: { home: "team" | "local"; pings: string };
  views: { auto: string[]; parts: Part[]; pages: string[] }; seams: Record<string, Seam>;
};

/** one thing wrong with a way file: where (a path in it) and why (an id the face turns into words) */
export type Problem = { at: string; why: string };
/** a way file as read: the way (null when it is not even an object), its print, what is wrong, whether every seam's
 *  package is pinned, and whether it runs: nothing wrong and everything pinned. A way with problems is shown read-only
 *  with them (FORMAT §7); a clean one not pinned yet can be read and replayed, never applied nor run */
export type Loaded = { way: Way | null; ver: string; problems: Problem[]; pinned: boolean; runs: boolean };

/** one event to write: a way.* kind, the thing (or the way) it is about, a value that fits its row, and when. Ids exist
 *  only once written, so the writer fills them in: `cause`, the index in the same list of the draft whose id goes
 *  into this one's `because`; `checks`, the indexes of the way.checked drafts whose ids go into its `checks`. `base`:
 *  the ids the writer signs as the event's `base` in a team's book, outside its value (a runner's frontier: spine.ts) */
export type Draft = { kind: string; item: string; value: Record<string, unknown>; at: number; cause?: number; checks?: number[]; base?: string[] };
/** an event read back: a draft as written, with its id when the book gave one, `erased` for a note whose words are
 *  gone, `by`, who signed it, in a role's `who` form (`person:<login>`, `agent:<login>`, `machine:<name>@<login>`), and
 *  `seen`, when this Sol's book first had it, when the book says (read on a person's own log only).
 *  From a team's book the wiring also fills, all from the trail's signed fields (spine.ts orders by them, and by
 *  nothing this Sol measured): `key`, the writer's key; `n`, the event's place along that key's `prev` chain, counted
 *  over every kind the key wrote; `after`, the `at` of its `prev` (none for a chain's first event); `base`, the trail's
 *  signed `base` (a runner's frontier, an agreement's head); `unread`, true when the trail keeps the event but this
 *  Sol's build cannot read it */
export type WayEvent = {
  kind: string; item?: string; value?: Record<string, unknown>; at: number; id?: string; erased?: boolean; by?: string; seen?: number;
  key?: string; n?: number; after?: number; base?: string[]; unread?: boolean;
};

/** a thing as the events make it: its kind, state (null before its birth move), fields (the `set` ones from its
 *  way.set and way.note, the `fix` ones from its moves), when it was born, the last tick each trigger fired for it, the
 *  `enter` acts that failed and were not yet done again (the face marks it red), and the required `set` fields a taken
 *  move named whose value never came (an `enter` act of such a thing fails closed) */
export type ThingNow = { id: string; kind: string; state: string | null; fields: Record<string, unknown>; born: number; fired: Record<string, number>; red: string[]; missing: string[] };
/** an event the fold passed over, and why (old_version: written under a version no longer current). `index`: where the
 *  event stood in the list handed in on a person's own log; in a team's book, where it stands in the team's plain order
 *  (spine.ts), the same on every Sol that holds the same events (an event with no place: where it was handed in) */
export type Skipped = { index: number; id?: string; kind: string; thing?: string; why: string };
/** a way.move as the fold keeps it, by its event id: the thing, the version it was taken under, the fields its move
 *  sets and those a way.set or way.note set already, who signed it (when the book said), where it went and whether it
 *  entered a new state there */
export type Folded = { thing: string; ver: string; set: string[]; done: string[]; by?: string; to: string; entered: boolean };
/** a way.checked as the fold keeps it, by its event id, until a press or a firing names it */
export type Checked = { thing: string; ver: string; seam: string; pass: boolean; by?: string };
/** a way.fired as the fold keeps it, by its event id: what a trigger's move or act answers */
export type Fired = { thing: string; ver: string; trigger: string; tick: number; at: number; by?: string; used: boolean };
/** how far a signed time may run ahead: of the moment the book first had the event (a person's own log, `ahead`), of
 *  the runner's event that says it saw it, and of now in the open tail (a team's book, spine.ts) */
export const SKEW = 10 * 60_000;
/** how the fold treats an event the book does not say who signed: refused (`unsigned`), the default and the only
 *  setting for a book; trusted, only for the engine's own drafts it folds before they are written (triggers.ts,
 *  replay.ts) and for a caller that says so */
export type FoldOptions = { unsigned?: "refuse" | "trust" };
/** a member's role in a team's project, as the team's book says (team/v3/people.ts Role, written again here: the way
 *  engine imports nothing of the team's) */
export type TeamRole = "owner" | "editor" | "guest";
/** a team's book, as a fold needs it (FORMAT §3, who may start a way): the project's `ways.start` setting, `owner` (only
 *  an owner starts a way) or `member` (an owner or an editor does; never a guest), and the role a login had at a moment
 *  (null: not in the project then). `roleOf` is handed in and must be pure: the engine reads no file and no clock, and
 *  two Sols that hold the same book must be given the same answer. The engine has no default for `start`: the wiring
 *  reads the setting and says it, one value or what it was at each moment (StartRule) */
export type TeamBook = { book: "team"; start: StartRule | ((at: number) => StartRule); roleOf: (login: string, at: number) => TeamRole | null };
/** the project's `ways.start`: who may start a way. As a function, what it said at a moment (4b: the setting is an
 *  event of the team's book, so turning it back to `owner` leaves the ways an editor started under `member` as they are);
 *  pure, as `roleOf` */
export type StartRule = "owner" | "member";
/** which book a fold reads: a person's own log (one writer: a way there is under no start rule), or a team's. Every
 *  fold is told, there is no default: what is not exactly one of the two takes no first apply, so no way ever starts
 *  under it (`book_unread`). The team book is never folded as OWN: that would let anyone start any way there */
export type Book = OwnBook | TeamBook;
/** a person's own log */
export type OwnBook = { book: "own" };
export const OWN: OwnBook = Object.freeze({ book: "own" });
/** a way.agreed as the fold keeps it: the role, who signed, and the version that was current when it was given */
export type Agreed = { role: string; by?: string; from: string };
/** one way as its events make it: the version current now ("" before the first way.applied), the id of the taken
 *  way.applied or way.reverted that put it in force (`head`: "" before the first, or when that event had no id), every
 *  version it has been on, each thing, what was skipped. The rest is the fold's own bookkeeping, keyed by event id */
export type Projection = {
  way: string; ver: string; head: string; vers: string[]; things: Record<string, ThingNow>; skipped: Skipped[];
  moves: Record<string, Folded>; fires: Record<string, Fired>; checks: Record<string, Checked>; agreed: Record<string, Agreed[]>;
  notes: Record<string, string>; last: Record<string, string>; local: number;
};

/** a seam's answer, handed in: whether it passed, and its reason (an id) */
export type Answer = { pass: boolean; why?: string };
export type Answers = Record<string, Answer>;

export const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
/** a move's `from` as a list (pure); null (a birth) is [] */
export const fromList = (from: Move["from"]): string[] => (from === null ? [] : Array.isArray(from) ? from : [from]);
/** the life a thing kind lives by, or undefined (pure) */
export const lifeOf = (way: Way, kind: string): Life | undefined => (Object.hasOwn(way.life, kind) ? way.life[kind] : undefined);
/** an own key of a record, never an inherited name (pure) */
export const own = <T>(r: Record<string, T> | undefined, k: string): T | undefined => (r && Object.hasOwn(r, k) ? r[k] : undefined);
/** a record with no prototype, for keys that come from events */
export const bare = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;

/** the most a `text` value may be, as canonical JSON in UTF-8, and the most entries a `names` or `numbers` value may
 *  hold: so one press's every event fits the trail's 64 KB (load.ts proves the rest) */
export const TEXT_MAX = 32 * 1024;
export const LIST_MAX = 64;
/** whether a value is what a field's type holds (pure): the registry's carries, and `time` (ms). A `name` is a way id
 *  (EVENT_ID: it is written into a way.set fact, where the way family takes ids, never prose) */
export function holds(type: string, x: unknown): boolean {
  const name = (v: unknown) => typeof v === "string" && EVENT_ID.test(v);
  switch (type.replace(/\?$/, "")) {
    case "name": return name(x);
    case "text": return x !== undefined && x !== null && Buffer.byteLength(canonical(x)) <= TEXT_MAX;
    case "number": case "time": return typeof x === "number" && Number.isFinite(x);
    case "boolean": return typeof x === "boolean";
    case "names": return Array.isArray(x) && x.length <= LIST_MAX && x.every(name);
    case "numbers": return isObj(x) && Object.keys(x).length <= LIST_MAX && Object.entries(x).every(([k, n]) => EVENT_ID.test(k) && typeof n === "number" && Number.isFinite(n));
    default: return false;
  }
}
/** the person behind a `who` entry (pure): `person:x`, `agent:x` and `machine:m@x` are all x's */
export const personOf = (who: string): string => `person:${who.startsWith("machine:") ? who.slice(who.indexOf("@") + 1) : who.slice(who.indexOf(":") + 1)}`;
/** the way.set field a value of this field type rides in (pure): a time is a number; text rides in no way.set (a note) */
export const setKey = (type: string): string | null => { const t = type.replace(/\?$/, ""); return t === "text" ? null : t === "time" ? "number" : t; };
export const SET_KEYS = ["name", "number", "boolean", "names", "numbers"];
