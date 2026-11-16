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
  // tool: a seat's step through a block's tool
  k("tool.call", "kernel", { tool: "name" }, { old: "step", when: { by: "seat", item: true }, hear: "open", ignorable: true }),
  // undo
  k("undo.did", "kernel", { from: "number", to: "number", putBack: "boolean?", stable: "boolean?", gone: "number?", said: "text?" }, { old: "undo", hear: "open" }),
  // seat: a seat's own steps (seatlog.ts), never its words
  k("seat.turn", "shell", { session: "name", model: "name?", mode: "name?" }, { old: "turn", hear: "card", ignorable: true }),
  k("seat.done", "shell", { session: "name", ok: "boolean", turns: "number?", tokens: "numbers?", tokensTotal: "numbers?", costTotal: "number?" }, { old: "done", hear: "card", ignorable: true }),
  k("seat.step", "shell", { session: "name", tool: "name", file: "text?", files: "number?", bytes: "number?", ok: "boolean?", agent: "boolean?" }, { old: "step", when: { by: "seat", item: false }, hear: "card", ignorable: true }),
  k("seat.sent", "shell", { session: "name", what: "name", name: "text?", bytes: "number?" }, { old: "sent", hear: "card", ignorable: true }),
  // key: a key a person pasted for the blocks, or took away (index.ts)
  k("key.pasted", "shell", { hosts: "names" }, { old: "key", when: { op: "pasted" }, hear: "open" }),
  k("key.removed", "shell", {}, { old: "key", when: { op: "removed" }, hear: "open" }),
  // engine, log: the log's own
  k("engine.start", "kernel", { release: "name?", commit: "name?", mine: "number?", head: "name?", kinds: "name", os: "name", node: "name", tz: "name", offset: "number" }),
  k("engine.tz", "kernel", { tz: "name", offset: "number" }),
  k("log.erase", "kernel", { hash: "name" }, { fsync: true }),
  // run, rung: "about to do", on the disk before the doing. Their writers come in later units, which say what they carry
  k("run.about", "core", null, { fsync: true }),
  k("rung.asked", "core", null, { fsync: true }),
];

const BY_NAME = new Map<string, KindRow>();
for (const r of KINDS) { if (BY_NAME.has(r.kind)) throw new Error(`contract/kinds.ts: "${r.kind}" has two rows`); BY_NAME.set(r.kind, r); }

/** a kind's row, or undefined for one that is not registered */
export const kindRow = (kind: string): KindRow | undefined => BY_NAME.get(kind);
export const isKind = (kind: string): boolean => BY_NAME.has(kind);
/** the registry's print: it changes when a row is added or changed (engine.start says which registry wrote what follows) */
export const KINDS_PRINT = createHash("sha256").update(JSON.stringify(KINDS)).digest("hex").slice(0, 16);
/** the kinds a block's engine half may be handed, and of those the seats' own, which a person presses a card for */
export const HEARD: readonly string[] = KINDS.filter((r) => r.hear).map((r) => r.kind);
export const SEAT_KINDS: readonly string[] = KINDS.filter((r) => r.hear === "card").map((r) => r.kind);

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

/** whether a value is what its kind carries (pure): null when it is, else what does not hold. A kind whose row does
 *  not say yet (`carries: null`) fits anything */
export function fits(kind: string, value: unknown): string | null {
  const row = BY_NAME.get(kind);
  if (!row) return `${kind} is not a kind`;
  if (!row.carries) return null;
  if (value === undefined) { const need = Object.keys(row.carries).find((f) => !row.carries![f].endsWith("?")); return need ? `${kind} carries ${need}, and there is no value` : null; }
  if (!isObj(value)) return `${kind}'s value is not an object`;
  const odd = Object.keys(value).find((f) => value[f] !== undefined && !Object.hasOwn(row.carries!, f));   // own fields only: `in` let constructor, __proto__ and the like through
  if (odd) return `${kind} does not carry ${odd}`;
  for (const [f, c] of Object.entries(row.carries)) {
    const { type, optional } = typeOf(c), x = value[f];
    if (x === undefined || x === null) { if (optional) continue; return `${kind} carries ${f}, which is missing`; }
    if (!HOLDS[type](x)) return `${kind}'s ${f} is not a ${type}`;
  }
  return null;
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
