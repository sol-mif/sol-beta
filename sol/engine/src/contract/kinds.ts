// The kinds of event the local log holds (the event format v1, the v2 backend design §6.2, step 0a): one row a kind,
// and the log refuses a kind that has no row (log.ts append).
//   the name     family.action: the family is the part before the dot (plugin, tool, undo, seat, key, engine, log, run,
//                rung, ...). A name that is not two lowercase words with one dot does not load.
//   who          who writes it: the kernel, the shell (the engine around it: the seats, the face's doors), the core, a
//                source plugin. Said, not checked: only the engine writes the log.
//   carries      what its value holds, field by field, so it can be checked (fits) and so the log knows where the value
//                goes (placeOf): a value with no free text stays on the day's line; one with free text (a `text` field:
//                words a person or a program wrote, an error's message, a file's path) goes to a value file, where it
//                can be erased without touching the line. A value that does not fit its row is kept as free text, not
//                refused: a line the log cannot take is a step nobody can see afterwards.
//                  name      a word of the engine's own or an id: a string on one line, 200 characters at most
//                  text      anything that may hold free text: any JSON
//                  number    a finite number            boolean   true or false
//                  names     a list of names            numbers   an object of numbers ({ in, out })
//                a "?" after it: the field may be left out. `null` for the whole row: its writer comes in a later
//                unit, which says what it carries then; until it does the value is kept as free text.
//   old          the name the same step had before v1 (a v0 line, written by the beta and by main with sol.frame on).
//                Those lines stay as they are on disk and are read through this column (nameOfOld). Two old names
//                stood for more than one step (`step`, `key`): `when` tells them apart.
//   fsync        it says "about to do": the line is on the disk before append returns (log.ts)
//   ignorable    a reader that does not know the kind may pass over it: it changed nothing that is kept
//   hear         whether a block's engine half may be handed it (record.ts): "open" for a block that listens and wrote
//                no `hears`, and for one that names it; "card" only for one that names it, and a person presses its
//                card first (a seat's own steps, card.ts); not written: never handed
//   kv           the version of what it carries, written on the event once it is past 1
// To add a kind: one line in the table below, in its family, e.g.
//   k("rung.asked", "core", { rung: "name", what: "text" }, { fsync: true }),
// Nothing else changes: the log takes it from the next start, GET /log hands it, and `hears` accepts it when the row
// says `hear`. No import of the log or the kernel here: record.ts and card.ts read this file.
import { createHash } from "node:crypto";

export type Carry = "name" | "text" | "number" | "boolean" | "names" | "numbers";
export type Shape = Record<string, Carry | `${Carry}?`>;
export type Who = "kernel" | "shell" | "core" | "source";
/** what tells one old name's steps apart: who wrote the line, whether it names an item, its value's `op` */
export type When = { by?: string; item?: boolean; op?: string };
export type More = { old?: string; when?: When; fsync?: true; ignorable?: true; hear?: "open" | "card"; kv?: number };
export type KindRow = { kind: string; family: string; who: Who; carries: Shape | null } & More;

const NAME = /^[a-z]+\.[a-z]+$/;
function k(kind: string, who: Who, carries: Shape | null, more: More = {}): KindRow {
  if (!NAME.test(kind)) throw new Error(`contract/kinds.ts: "${kind}" is not family.action (two lowercase words, one dot)`);
  return { kind, family: kind.slice(0, kind.indexOf(".")), who, carries, ...more };
}

/** every kind the log takes, by family */
export const KINDS: readonly KindRow[] = [
  // plugin: a block (the design's plugin) and what the kernel does with it
  k("plugin.load", "kernel", { v: "number", engine: "name?", room: "name?" }, { old: "load", hear: "open" }),
  k("plugin.release", "kernel", { from: "number", to: "number" }, { old: "release", hear: "open" }),
  k("plugin.broken", "kernel", { why: "text" }, { old: "broken", hear: "open" }),
  k("plugin.unload", "kernel", { why: "name" }, { old: "unload", hear: "open" }),
  k("plugin.line", "kernel", { line: "text" }, { old: "line", hear: "open", ignorable: true }),
  k("plugin.trouble", "kernel", { where: "name", why: "text" }, { old: "trouble", ignorable: true }),   // never handed: two blocks throwing on each other's trouble would ring forever
  k("plugin.write", "kernel", { what: "name", own: "boolean?" }, { old: "write", hear: "open" }),
  k("plugin.data", "kernel", { from: "number", to: "number", back: "boolean?", restored: "boolean?", aside: "text?", shared: "names?", said: "text?" }, { old: "data", hear: "open" }),
  k("plugin.refused", "kernel", { op: "name", what: "text", why: "text" }, { old: "refused", hear: "open" }),
  k("plugin.suspect", "kernel", { refused: "number", why: "text" }, { old: "suspect", hear: "open" }),
  k("plugin.approve", "kernel", { print: "name", asks: "text", screen: "boolean?" }, { old: "pressed", hear: "open" }),
  k("plugin.off", "kernel", {}, { old: "off", hear: "open" }),
  k("plugin.factory", "kernel", { off: "names" }, { old: "factory", hear: "open" }),
  k("plugin.ran", "kernel", { program: "name", key: "name?", code: "number?", signal: "name?", out: "boolean" }, { old: "run", hear: "open" }),
  k("plugin.fetched", "kernel", { host: "name", key: "name?", status: "number", out: "boolean" }, { old: "fetch", hear: "open" }),
  k("plugin.called", "kernel", { tool: "name", out: "boolean" }, { old: "step", when: { by: "engine" }, hear: "open" }),   // a big room called one of Sol's own tools (sol.call)
  k("plugin.wake", "kernel", { why: "name", pid: "number?" }, { old: "wake", hear: "open", ignorable: true }),
  k("plugin.sleep", "kernel", { why: "name" }, { old: "sleep", hear: "open", ignorable: true }),
  k("plugin.seat", "kernel", { provided: "boolean", why: "text?" }, { old: "seat", hear: "open" }),
  k("plugin.altered", "kernel", { hash: "name", now: "name" }, { hear: "open", ignorable: true }),   // its record says a fingerprint (§10 `hash`) its folder is not: said at load, not refused (fingerprint.ts, step M1)
  k("plugin.edited", "kernel", { page: "boolean", ask: "boolean" }, { ignorable: true }),   // its page or its ask.md changed in place, nothing loads again: the face reads /things again (logKinds, #691 step 3); never handed
  k("plugin.tools", "kernel", { tools: "names" }, { ignorable: true }),   // a tool registered after its load: the tools it has now (logKinds, #691 step 3); never handed
  // tool: a seat's step through a block's tool
  k("tool.call", "kernel", { tool: "name" }, { old: "step", when: { by: "seat", item: true }, hear: "open", ignorable: true }),
  // undo
  k("undo.did", "kernel", { from: "number", to: "number", putBack: "boolean?", stable: "boolean?", gone: "number?", said: "text?" }, { old: "undo", hear: "open" }),
  // seat: a seat's own steps (seatlog.ts), never its words
  k("seat.turn", "shell", { session: "name", model: "name?", mode: "name?" }, { old: "turn", hear: "card", ignorable: true }),
  k("seat.done", "shell", { session: "name", ok: "boolean", turns: "number?", tokens: "numbers?", tokensTotal: "numbers?", costTotal: "number?" }, { old: "done", hear: "card", ignorable: true }),
  k("seat.step", "shell", { session: "name", tool: "name", file: "text?", files: "number?", bytes: "number?", ok: "boolean?", agent: "boolean?" }, { old: "step", when: { by: "seat", item: false }, hear: "card", ignorable: true }),
  k("seat.sent", "shell", { session: "name", what: "name", name: "text?", bytes: "number?" }, { old: "sent", hear: "card", ignorable: true }),
  k("seat.usage", "shell", { session: "name", in: "number", out: "number", cacheRead: "number?", cacheWrite: "number?" }, { hear: "card", ignorable: true }),   // what a turn spent, as a seat the shell starts says it (acp.ts, step A2)
  // key: a key a person pasted for the blocks, or took away (index.ts)
  k("key.pasted", "shell", { hosts: "names" }, { old: "key", when: { op: "pasted" }, hear: "open" }),
  k("key.removed", "shell", {}, { old: "key", when: { op: "removed" }, hear: "open" }),
  // team: between the two books (the v2 design §6.4, step C1): a local action in a Cowork project is kept in the team
  // trail only, and the log says which of its events it was (team/v3/pointer.ts): the item is that event's id
  k("team.pointer", "shell", { project: "name", kind: "name" }, { ignorable: true }),
  // engine, log: the log's own
  k("engine.start", "kernel", { release: "name?", commit: "name?", mine: "number?", head: "name?", kinds: "name", os: "name", node: "name", tz: "name", offset: "number" }),
  k("engine.tz", "kernel", { tz: "name", offset: "number" }),
  k("log.erase", "kernel", { hash: "name" }, { fsync: true }),
  // what an older Sol wrote to the old file, carried in (log.ts carryOld, #1678): an opening and a closing (`done`) around the lines
  k("log.merged", "kernel", { from: "name", lines: "number", file: "text", done: "boolean?" }, { fsync: true }),
  k("log.carried", "kernel", { line: "text" }),   // an old line kept whole: history to read, never the kind it names (a seat can write the old file)
  // Home (#790 to #874, home/): every Home kind registered at once by Home 1, so no later Home unit edits this file. Home
  // writes them only through home/log.ts, only with its switch on (settings.ts homeWhole()). `ver` is the SHA-256 of a
  // stored Thing's (or the policy's) canonical JSON, `from` the version before; `undo` marks the reverse event of an
  // act (its cause is the act's id). A `words` field is free text (what a person typed, what would have been done): the
  // value goes to a value file and the line keeps its hash. None is handed to a block (no `hear`), but today.pick (A3)
  // thing: the Thing store, <HOME>/items/<id>/
  k("thing.new", "core", { ver: "name", read: "name", waitsOn: "name", state: "name" }),
  k("thing.state", "core", { ver: "name", from: "name", state: "name", waitsOn: "name", gone: "boolean?", undo: "boolean?" }),
  k("thing.done", "core", { ver: "name", from: "name", undo: "boolean?" }),
  k("thing.file", "core", { n: "number", made: "number?", undo: "boolean?", words: "text?" }),
  k("thing.refile", "core", { ver: "name", from: "name", undo: "boolean?" }),
  k("thing.open", "core", { mode: "name" }),
  // today: the one list (home/today.ts)
  k("today.shown", "core", { order: "name", dumb: "name", sorter: "name", n: "number" }, { ignorable: true }),
  k("today.answer", "core", { which: "number", words: "text?" }),
  k("today.later", "core", { undo: "boolean?" }),
  // a person picked a card: the item is the Thing, `cause` the today.shown it was picked from. Registered only (pressing
  // an edge is the face's own, no message), and the one Home kind a block may hear: a block may name it in
  // needs.history (sol.since, step A3), the design's own example of a past a plugin learns from; a person's picks are
  // heard as a seat's steps are, only by a block that names them, once pressed
  k("today.pick", "core", null, { hear: "card" }),
  // judge: the read of a sentence (#827)
  k("judge.read", "core", { question: "name", verdict: "name", read: "name", p: "numbers", judge: "name", ms: "number" }),
  k("judge.override", "core", { question: "name", from: "name", to: "name", words: "text?" }),
  k("judge.line", "core", null),   // registered only: no face control sets a threshold
  // policy, source: the paragraph and the sources (#828)
  k("policy.write", "core", { ver: "name", from: "name", undo: "boolean?" }),
  k("policy.learned", "core", { what: "name", undo: "boolean?", words: "text?" }),
  k("source.set", "core", { from: "name", to: "name", undo: "boolean?" }),
  k("source.health", "core", { state: "name", words: "text?" }),
  // rung: the upper limit at position two (design §8); run: a Home Run (design §9). "about to do" is on the disk first
  k("rung.ceiling", "core", { from: "name", to: "name", policy: "name", undo: "boolean?" }),
  k("rung.asked", "core", { act: "name", rung: "name", words: "text?" }, { fsync: true }),
  k("rung.answered", "core", { yes: "boolean" }),
  k("rung.did", "core", { act: "name", rung: "name", source: "name?" }),
  k("rung.would", "core", { act: "name", rung: "name", at: "name", source: "name?", words: "text?" }),
  k("rung.refused", "core", { act: "name", why: "name" }),
  k("run.start", "core", { thing: "name", step: "number?", act: "name?" }),
  k("run.about", "core", { thing: "name", step: "number?", act: "name?" }, { fsync: true }),
  k("run.did", "core", { thing: "name", step: "number?", act: "name?" }),
  k("run.unknown", "core", { thing: "name", step: "number?", act: "name?" }),
  k("run.end", "core", { thing: "name", step: "number?", act: "name?" }),
  // way: a team's way of working (docs/cowork-ways-2026-11-10/FORMAT.md §5), registered before its writer: a change to
  // a way (proposed, previewed, agreed, applied, reverted) and a thing's life under one (made, move, refused, checked,
  // acted, fired). `way` is the way's id, `ver` (and `from`, `to`) a version's print, `thing` a thing's id, `by` and
  // `role` a role's name, `because` the id of the event the step answers (the team trail has no `cause`). Every field
  // is an id (a `name` of this family is never prose: IDS below), a number or a true/false, so a fact never needs
  // erasing and is never erased; the one free text is a way.note's `words`, which goes to a value file. Not Home's
  // (HOME_FAMILIES), never handed to a block. The team trail checks the same rows (team/v3/trail-kinds.ts).
  // FORMAT's third version (step 3's fix round): a press, a refusal and a firing name the way.checked events they were
  // judged on (`checks`, their ids), and way.set, the thirteenth, is the fact of one value a press set that is not
  // free text (`about` "<thing>.<field>", `because` the press, the value in the one field of its type: a time is a
  // number). way.note keeps only a `text` field's words and stays the one kind that may be erased.
  // FORMAT's fourth version (step 4, the runner's spine): way.seen, the fourteenth, is the runner's receipt: it says
  // which events of other writers the runner had seen (the trail's own signed `base`, not a field of the value) under
  // the version it names, and changes nothing of any thing. It answers nothing, so it carries no `because`. One that
  // says `more: true` is a page: it only carries names for the runner's next firing or receipt (256 an event).
  // A way.checked that says a `tick` is a lead check: asked for the firing of that tick, written right before it, and
  // in a team's book folded only there (way/spine.ts); one that says none was asked for a press
  k("way.proposed", "core", { way: "name", from: "name", slots: "names", map: "names?", because: "name?" }),
  k("way.previewed", "core", { way: "name", from: "name", to: "name", things: "number", differ: "number", because: "name?" }),
  k("way.agreed", "core", { way: "name", to: "name", role: "name", because: "name?" }),
  k("way.applied", "core", { way: "name", from: "name", to: "name", reader: "number", because: "name?" }),
  k("way.reverted", "core", { way: "name", from: "name", to: "name", because: "name?" }),
  k("way.made", "core", { way: "name", ver: "name", thing: "name", kind: "name", by: "name", because: "name?" }),
  k("way.move", "core", { way: "name", ver: "name", thing: "name", move: "name", from: "name", to: "name", by: "name", checks: "names?", because: "name?" }),
  k("way.refused", "core", { way: "name", ver: "name", thing: "name?", move: "name?", why: "name", checks: "names?", because: "name?" }),
  k("way.checked", "core", { way: "name", ver: "name", thing: "name", rule: "name", seam: "name", pv: "number", pkg: "name", pass: "boolean", at: "number", tick: "number?", because: "name?" }),
  k("way.acted", "core", { way: "name", ver: "name", thing: "name", seam: "name", pv: "number", pkg: "name", ok: "boolean", because: "name?" }),
  k("way.fired", "core", { way: "name", ver: "name", trigger: "name", thing: "name?", tick: "number", checks: "names?", because: "name?" }),
  k("way.note", "core", { way: "name", about: "name", words: "text", because: "name?" }),
  k("way.set", "core", { way: "name", about: "name", because: "name", name: "name?", number: "number?", boolean: "boolean?", names: "names?", numbers: "numbers?" }),
  k("way.seen", "core", { way: "name", ver: "name", more: "boolean?" }),
];

const BY_NAME = new Map<string, KindRow>();
for (const r of KINDS) { if (BY_NAME.has(r.kind)) throw new Error(`contract/kinds.ts: "${r.kind}" has two rows`); BY_NAME.set(r.kind, r); }

/** Home's families (home/log.ts reads only these, and plugin.trouble lines whose `where` starts "home."): the kinds
 *  Home writes and its projections read */
export const HOME_FAMILIES: readonly string[] = ["thing", "today", "judge", "policy", "source", "rung", "run"];
export const isHomeKind = (kind: string): boolean => HOME_FAMILIES.includes(kind.slice(0, kind.indexOf("."))) && BY_NAME.has(kind);

/** a kind's row, or undefined for one that is not registered */
export const kindRow = (kind: string): KindRow | undefined => BY_NAME.get(kind);
export const isKind = (kind: string): boolean => BY_NAME.has(kind);
/** the registry's print: it changes when a row is added or changed (engine.start says which registry wrote what follows) */
export const KINDS_PRINT = createHash("sha256").update(JSON.stringify(KINDS)).digest("hex").slice(0, 16);
/** the kinds a block's engine half may be handed; of those the ones a person presses a card for (a seat's steps, a
 *  person's picks); and of those the seats' own */
export const HEARD: readonly string[] = KINDS.filter((r) => r.hear).map((r) => r.kind);
export const CARD_KINDS: readonly string[] = KINDS.filter((r) => r.hear === "card").map((r) => r.kind);
export const SEAT_KINDS: readonly string[] = CARD_KINDS.filter((k) => k.startsWith("seat."));

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const isName = (x: unknown): boolean => typeof x === "string" && x.length <= 200 && !/[\n\r]/.test(x);
const HOLDS: Record<Carry, (x: unknown) => boolean> = {
  name: isName,
  text: (x) => x !== undefined && x !== null,
  number: (x) => typeof x === "number" && Number.isFinite(x),
  boolean: (x) => typeof x === "boolean",
  names: (x) => Array.isArray(x) && x.every(isName),
  numbers: (x) => isObj(x) && Object.values(x).every((n) => typeof n === "number" && Number.isFinite(n)),
};
const typeOf = (c: string): { type: Carry; optional: boolean } => ({ type: c.replace(/\?$/, "") as Carry, optional: c.endsWith("?") });

/** a family whose names are ids, never prose: a way's facts (FORMAT.md §5) carry no free text, so there a `name` (and
 *  each of `names`) is letters, digits and `_ . : > -`, 120 at most ("" for none: a way's first version has no `from`).
 *  Every other family's `name` is as it was */
const IDS: Record<string, RegExp> = { way: /^[\w.:>-]{0,120}$/ };
const isId = (re: RegExp) => (x: unknown): boolean => typeof x === "string" && re.test(x);

/** whether a value is what a shape carries (pure): null when it is, else what does not hold, said of `kind`. A field
 *  counts only when it is the shape's own (`constructor`, `__proto__` and the rest are no field of any row) */
export function fitsShape(kind: string, family: string, carries: Shape, value: unknown): string | null {
  if (value === undefined) { const need = Object.keys(carries).find((f) => !carries[f].endsWith("?")); return need ? `${kind} carries ${need}, and there is no value` : null; }
  if (!isObj(value)) return `${kind}'s value is not an object`;
  const odd = Object.keys(value).find((f) => value[f] !== undefined && !Object.hasOwn(carries, f));
  if (odd) return `${kind} does not carry ${odd}`;
  const ids = IDS[family], holds: Record<Carry, (x: unknown) => boolean> = ids ? { ...HOLDS, name: isId(ids), names: (x) => Array.isArray(x) && x.every(isId(ids)) } : HOLDS;
  for (const [f, c] of Object.entries(carries)) {
    const { type, optional } = typeOf(c), x = value[f];
    if (x === undefined || x === null) { if (optional) continue; return `${kind} carries ${f}, which is missing`; }
    if (!holds[type](x)) return `${kind}'s ${f} is not a ${type}`;
  }
  return null;
}

/** whether a value is what its kind carries (pure): null when it is, else what does not hold. A kind whose row does
 *  not say yet (`carries: null`) fits anything */
export function fits(kind: string, value: unknown): string | null {
  const row = BY_NAME.get(kind);
  if (!row) return `${kind} is not a kind`;
  return row.carries ? fitsShape(kind, row.family, row.carries, value) : null;
}

/** where a value goes (pure): nowhere when there is none; on the day's line when it fits its row and holds no free
 *  text; else a value file */
export function placeOf(kind: string, value: unknown): "none" | "line" | "file" {
  if (value === undefined) return "none";
  const row = BY_NAME.get(kind);
  if (!row?.carries || fits(kind, value) !== null) return "file";
  const v = value as Record<string, unknown>;
  return Object.entries(row.carries).some(([f, c]) => typeOf(c).type === "text" && v[f] !== undefined && v[f] !== null) ? "file" : "line";
}

/** the name a v0 line's step has now (pure), through the rows' `old` and `when`; null for a name no row knows */
export function nameOfOld(e: { kind: string; by?: { person?: string }; item?: unknown; value?: unknown }): string | null {
  for (const r of KINDS) {
    if (r.old !== e.kind) continue;
    const w = r.when;
    if (!w) return r.kind;
    if (w.by !== undefined && e.by?.person !== w.by) continue;
    if (w.item !== undefined && (e.item !== undefined) !== w.item) continue;
    if (w.op !== undefined && (e.value as { op?: unknown } | undefined)?.op !== w.op) continue;
    return r.kind;
  }
  return null;
}
/** the old names (v0) that a kind's row names: what a record or a press written before v1 may still say */
export const oldNames = (kind: string): string[] => (BY_NAME.get(kind)?.old ? [BY_NAME.get(kind)!.old!] : []);
/** the kinds an old name stands for now (one, or several for `step` and `key`) */
export const newNames = (old: string): string[] => KINDS.filter((r) => r.old === old).map((r) => r.kind);
