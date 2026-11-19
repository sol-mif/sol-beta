// Cowork ways, step 4b (docs/cowork-ways-2026-11-10/reports/step4-plan.md §1 and §3): the door from a project's team
// trail to the way engine. Pure but for readTrail(): it takes every row the trail holds for the project and checks them
// itself (trail.ts verify, the project's rows alone), then hands the engine its events, a team's book and the way files
// the trail carries. Two Sols that hold the same events of a project hand the engine the same, whatever order the events
// came in and whatever other projects each holds: so the door asks nothing of the store (not check(), which looks a
// `prev` up in every project, round 15), and applies the `erase` events itself (the store erases only an event it
// already holds when the erase comes). Nothing is written here (way-files.ts keeps the files).
// Loaded only behind the ways' switch (SOL_COWORK_WAYS, on unless set off), like everything of the wiring.
//   which         every event of the project counts for the chains; only kinds of the family `way` are handed over,
//                 each to the way its `value.way` names (one this Sol cannot read, or an erased note, that names none:
//                 to every way)
//   by            `by.agent` set: `agent:<person>`. Else the signed `field` is `auto` (the runner's loop, the only writer
//                 of it): `machine:<machine>@<person>`. Else `person:<person>`. One that does not fit the engine's WHO,
//                 or an `auto` with no machine, is dropped and named, never guessed
//   n, after      the event's place along its key's `prev` chain in this project, counted over every kind that checks,
//                 and the `at` of its `prev` (none for the chain's first event). One whose chain cannot be walked back
//                 through checked events to its start (a row of this Sol's disk that does not check) has no place
//                 (`no_place`): set aside here, never a guess (a second event at one place reads as a fork)
//   erased        an event its own person's `erase` event names (a kind whose content may be erased: trail-kinds.ts),
//                 whether the store erased it yet or not; or one this Sol holds erased
//   unread        a way event among the trail's not understood; and, refused at this door, one whose `at`, `tick` or
//                 `value.at` is no time, whose `base` names more than 256 events, or whose `checks` more than 64. Its
//                 key's later events still stand (the engine passes it over and keeps its place)
//   seen          not filled: a team's book never reads it
//   roles         `member` events folded by Cowork v3's own rule (standing.ts, #1100, as port5.ts recordOf): in the order
//                 every Sol agrees on, each counting only when its writer could make it then; a member one whatever the
//                 case of their login; the role at a moment the last that counted at or before it
//   ways.start    a `setting` event, `item: project`, field `ways.start`, signed by a person (no agent) who is an owner at
//                 its time: `owner` or `member`, or nothing (null, "": back to the default, as people.ts reads it); the
//                 last at or before a moment. None: `owner`
import { isTime } from "../../way/clock.js";
import { WHO, type StartRule, type TeamBook, type TeamRole, type WayEvent } from "../../way/types.js";
import { createHash } from "node:crypto";
import { canonical } from "../../canonical.js";
import { ERASE, order, verify, type TrailEvent, type VerifyOpts } from "./trail.js";
import { erasable } from "./trail-kinds.js";
import { counts, inOrder, seatAfter, seatWrite } from "./standing.js";

/** the most events a `base` may name, and a press's `checks`, at this door (the engine's pages hold 256) */
export const BASE_MAX = 256, CHECKS_MAX = 64;
/** the kind a way file travels as: `item` its ver, `value` the file (a family the trail does not check) */
export const WAYFILE = "wayfile";
/** the field the runner's loop signs on what it writes by itself */
export const AUTO = "auto";

/** what a project's trail gives the way engine (pure): each way's events, the team's book, the way files it carries,
 *  and what was dropped at the door */
export type WayRead = {
  ways: Map<string, WayEvent[]>; book: TeamBook; files: { ver: string; file: unknown; id: string }[];
  dropped: { id: string; why: string }[];
  /** each key's last placed event in the project: its place and time (what this key's next event follows) */
  tips: Map<string, { n: number; at: number }>;
  /** how the role events that counted spell a member's login (roleFold) */
  nameOf: (login: string) => string | undefined;
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const familyOf = (kind: string): string => { const dot = kind.indexOf("."); return dot < 0 ? kind : kind.slice(0, dot); };

/** who signed an event, in a role's `who` form, or null when it cannot be said (pure) */
export function whoOf(e: Pick<TrailEvent, "by" | "field">): string | null {
  const { person, machine, agent } = e.by;
  const who = agent ? `agent:${person}` : e.field === AUTO ? (machine !== undefined ? `machine:${machine}@${person}` : null) : `person:${person}`;
  return who !== null && WHO.test(who) ? who : null;
}

/** each event's place along its key's `prev` chain, over every kind (pure): `n` from 0, `after` the `at` of its `prev`.
 *  A chain starts at an event with no `prev`, or at a version 1 event whose `prev` is not here (it pointed into another
 *  project, trail.ts). An event whose `prev` is not among these otherwise has no place, nor has anything after it in its
 *  chain: null, never a guess. `events` are checked ones: an id names one body, so a chain has no loop and no twin */
export function places(events: readonly Pick<TrailEvent, "id" | "key" | "prev" | "at" | "v">[]): Map<string, { n: number; after?: number } | null> {
  type E = (typeof events)[number];
  const byId = new Map<string, E>(), out = new Map<string, { n: number; after?: number } | null>();
  for (const e of events) if (!byId.has(e.id)) byId.set(e.id, e);
  for (const e of byId.values()) {
    if (out.has(e.id)) continue;
    // walked back to the chain's first here, then forward: no recursion, however long the chain; a walk that comes
    // back to an event it passed (only rows that are not what they say can) gives no place
    const run: E[] = [], seen = new Set<string>();
    let loop = false;
    for (let x: E | undefined = e; x && !out.has(x.id); ) {
      if (seen.has(x.id)) { loop = true; break; }
      seen.add(x.id); run.push(x);
      const p: E | undefined = x.prev ? byId.get(x.prev) : undefined;
      x = p && p.key === x.key ? p : undefined;
    }
    if (loop) { for (const x of run) out.set(x.id, null); continue; }
    for (const x of run.reverse()) {
      const p = x.prev ? byId.get(x.prev) : undefined;
      if (p && p.key === x.key) { const before = out.get(p.id); out.set(x.id, before ? { n: before.n + 1, after: p.at } : null); }
      else out.set(x.id, x.prev === "" || (x.v === 1 && !p) ? { n: 0 } : null);
    }
  }
  return out;
}

/** the trail's order, with a key's own events at one time by their place along its chain (pure): a key that writes
 *  twice in one millisecond wrote them in its chain's order, which the ids do not tell */
export const chainOrder = (at: ReadonlyMap<string, { n: number } | null>) => (a: TrailEvent, b: TrailEvent): number => {
  if (a.at === b.at && a.key === b.key) { const x = at.get(a.id), y = at.get(b.id); if (x && y && x.n !== y.n) return x.n - y.n; }
  return order(a, b);
};

/** why this door refuses a way event the trail took, or "" (pure): a time that is no time, a `base` or `checks` too long */
export function refused(e: Pick<TrailEvent, "at" | "base" | "value">): string {
  if (!isTime(e.at)) return "no_time";
  if ((e.base?.length ?? 0) > BASE_MAX) return "base_too_long";
  const v = e.value;
  if (isObj(v)) {
    if (v.tick !== undefined && !isTime(v.tick)) return "no_time";
    if (v.at !== undefined && !isTime(v.at)) return "no_time";
    if (Array.isArray(v.checks) && v.checks.length > CHECKS_MAX) return "checks_too_long";
  }
  return "";
}

/** a trail event as the engine reads it (pure), or why it is dropped. With no place it goes without `key` and `n`: the
 *  engine sets it aside (`no_place`). `erased`: its content is gone (the store's, or an erase event the door read) */
export function wayEvent(e: TrailEvent, place: { n: number; after?: number } | null | undefined, unread: boolean, erased = e.erased === true): WayEvent | { why: string } {
  const by = whoOf(e);
  if (by === null) return { why: "no_writer" };
  const out: WayEvent = { kind: e.kind, at: e.at, id: e.id, by, ...(place ? { key: e.key, n: place.n, ...(place.after !== undefined ? { after: place.after } : {}) } : {}) };
  if (e.item !== undefined) out.item = e.item;
  if (e.base?.length) out.base = [...e.base];
  if (erased) out.erased = true;
  else if (isObj(e.value)) out.value = e.value;
  if (unread || refused(e)) out.unread = true;
  return out;
}

/** the role table (pure): a login's role at a moment, folded by Cowork v3's own rule (standing.ts, #1049/#1100), as
 *  port5.ts recordOf folds it: the `member` events among these in the order every Sol agrees on (`inOrder`: time,
 *  writer's key, the place in its chain, id), each counting only when its writer could make it then (an owner sets
 *  anyone's seat; anyone else only takes themself out; no agent; never the last owner out), in the one shape both
 *  folds read (`seatWrite`). A member is one whatever the case of their login. The role at a moment is the last that
 *  counted at or before it; null before the first, and once out */
export function roleTable(events: readonly TrailEvent[], gone: (e: TrailEvent) => boolean = (e) => e.erased === true): (login: string, at: number) => TeamRole | null {
  return roleFold(events, gone).roleOf;
}
/** the role table, and how the role events that counted spell each member (pure): the spelling of the last one that
 *  counted for them. Only an owner's word (or a member's own leaving) counts, so nobody else can set it (#987's
 *  seventeenth review, F3 and its security note) */
export function roleFold(events: readonly TrailEvent[], gone: (e: TrailEvent) => boolean = (e) => e.erased === true): { roleOf: (login: string, at: number) => TeamRole | null; nameOf: (login: string) => string | undefined } {
  const by = new Map<string, { at: number; role: TeamRole | null }[]>(), names = new Map<string, string>();
  const owners = new Set<string>();   // logins in lower case, kept as the fold goes
  for (const e of inOrder([...events], (x) => Math.trunc(x.at), (x) => x.key ?? x.by.person)) {
    if (e.kind !== "member" || !e.item || gone(e)) continue;
    const f = e.field !== undefined ? { [e.field]: e.value ?? null } : isObj(e.value) ? e.value : {};
    const seat = seatWrite(f), who = e.item.toLowerCase(), l = by.get(who);
    const before = l?.length ? l[l.length - 1].role : null, after = seat ? seatAfter(before, seat) : null;
    if (!seat || (seat.in === undefined && !before) || !counts({ owners, writer: e.by.person, agent: !!e.by.agent, who: e.item, before, after })) continue;
    if (after === "owner") owners.add(who); else owners.delete(who);
    names.set(who, e.item);
    // the moment in whole ms, as the fold orders it (inOrder above): two events of one millisecond stand in the fold's order
    const t = Math.trunc(e.at);
    if (l) l.push({ at: t, role: after }); else by.set(who, [{ at: t, role: after }]);
  }
  return {
    roleOf: (login, at) => {
      if (!isTime(at)) return null;
      let r: TeamRole | null = null;
      for (const x of by.get(String(login).toLowerCase()) ?? []) { if (x.at > at) break; r = x.role; }
      return r;
    },
    nameOf: (login) => names.get(String(login).toLowerCase()),
  };
}

/** the project's `ways.start` at each moment (pure): from `setting` events (`item: project`, field `ways.start`, or an
 *  object of fields carrying it), each signed by a person who is an owner at its time, in the order `cmp` gives, the
 *  last at or before the moment. `owner` or `member`; nothing (null, "") is back to the default; any other value is
 *  passed over. None: `owner` */
export function startRule(events: readonly TrailEvent[], roleOf: (login: string, at: number) => TeamRole | null, cmp: (a: TrailEvent, b: TrailEvent) => number = chainOrder(places(events)), gone: (e: TrailEvent) => boolean = (e) => e.erased === true): (at: number) => StartRule {
  const said: { at: number; rule: StartRule }[] = [];
  for (const e of [...events].sort(cmp)) {
    if (e.kind !== "setting" || e.item !== "project" || gone(e) || e.by.agent) continue;
    const has = e.field !== undefined ? e.field === "ways.start" : isObj(e.value) && Object.hasOwn(e.value, "ways.start");
    if (!has) continue;
    const v = e.field !== undefined ? e.value : (e.value as Record<string, unknown>)["ways.start"];
    const rule: StartRule | undefined = v === "owner" || v === "member" ? v : v === null || v === "" ? "owner" : undefined;
    if (rule === undefined) continue;
    if (roleOf(e.by.person, e.at) !== "owner") continue;
    said.push({ at: e.at, rule });
  }
  return (at) => {
    let r: StartRule = "owner";
    for (const x of said) { if (x.at > at) break; r = x.rule; }
    return r;
  };
}

/** a project's trail read for the way engine (pure): `rows`, every event the trail holds for the project as it reads
 *  them (`since(project, 0, …, { raw: true })`), checked here on their own (verify: a `prev` in another project is
 *  never looked up, so a version 1 event that points there starts its chain on every Sol, and any other event that
 *  does is refused on every Sol). Pins: each person's first key in the trail's order, here, not the store's */
export function readWays(rows: readonly TrailEvent[], signed?: VerifyOpts["signed"]): WayRead {
  const v = verify(rows as unknown[], signed ? { signed } : {});
  const good = [...v.ok, ...v.notUnderstood];
  const at = places(good), cmp = chainOrder(at), odd = new Set(v.notUnderstood.map((e) => e.id));
  // the erase events, applied here: an event its own person erased, of a kind whose content may be erased
  const byId = new Map(good.map((e) => [e.id, e])), erased = new Set<string>();
  for (const e of v.ok) {
    if (e.kind !== ERASE || !e.item) continue;
    const x = byId.get(e.item);
    if (x && erasable(x.kind) && x.by.person.toLowerCase() === e.by.person.toLowerCase()) erased.add(x.id);
  }
  const gone = (e: TrailEvent) => e.erased === true || erased.has(e.id);
  const { roleOf, nameOf } = roleFold(v.ok, gone);
  const book: TeamBook = { book: "team", start: startRule(v.ok, roleOf, cmp, gone), roleOf };
  const ways = new Map<string, WayEvent[]>(), dropped: WayRead["dropped"] = [], everywhere: WayEvent[] = [];
  const files: WayRead["files"] = [], tips: WayRead["tips"] = new Map();
  for (const e of good) {
    const x = at.get(e.id), t = e.key ? tips.get(e.key) : undefined;
    if (x && e.key && (!t || x.n > t.n)) tips.set(e.key, { n: x.n, at: e.at });
  }
  for (const e of good.sort(cmp)) {
    if (e.kind === WAYFILE && !odd.has(e.id)) {
      if (typeof e.item === "string" && e.value !== undefined && !gone(e)) files.push({ ver: e.item, file: e.value, id: e.id });
      continue;
    }
    if (familyOf(e.kind) !== "way") continue;
    const w = wayEvent(e, at.get(e.id), odd.has(e.id), gone(e));
    if ("why" in w) { dropped.push({ id: e.id, why: w.why }); continue; }
    const id = !w.erased && isObj(e.value) && typeof e.value.way === "string" ? e.value.way : "";
    // (an erased note carries no value here, so no way's name: it erases where it was folded, and nowhere else)
    if (!id) { if (w.unread || w.erased) everywhere.push(w); else dropped.push({ id: e.id, why: "no_way" }); continue; }
    const l = ways.get(id);
    if (l) l.push(w); else ways.set(id, [w]);
  }
  // an event this Sol cannot read and that names no way it can read stands in every way's book: its key's later
  // events wait on it there as anywhere
  if (everywhere.length) for (const l of ways.values()) l.push(...everywhere);
  return { ways, book, files, dropped, tips, nameOf };
}

/** every row a trail holds for a project, as the reader takes them (reads the trail) */
export const rowsOf = (trail: { since(project: string, seq?: number, limit?: number, o?: { raw?: boolean }): TrailEvent[] }, project: string): TrailEvent[] =>
  trail.since(project, 0, Number.MAX_SAFE_INTEGER, { raw: true });
/** a project's trail read for the way engine (reads the trail) */
export const readTrail = (trail: Parameters<typeof rowsOf>[0], project: string): WayRead => readWays(rowsOf(trail, project));

// The fold cache (step 4b part 5, step4-plan.md §7; FORMAT §10, "折疊的快取"): local to this Sol, never on the trail, and
// giving exactly what readWays(rowsOf(...)) gives (test/way-cache.test.ts compares the two). Two layers:
//   signatures    an event's signature and certificate are checked once a process (`id \n sig`, the id still worked
//                 out again each read: trail.ts verify `signed`); the rest of the check, the chains and the fold run
//                 over every row each time, as before. Kept in two halves of SIGNED_MAX each: when the newer is full it
//                 becomes the older and the older is let go, so a read never forgets what it just checked (grade18 F3)
//   the read      a project's read kept with a fingerprint of its rows as the store holds them (each row's seq, the
//                 type and the bytes of its stored text, in seq order): the same rows give the same read without
//                 parsing them again. Any change of the rows (an event added, an erase done in place, a row changed
//                 on the disk, grade18 F1) is a new read. What is kept is the read and each row's id, key and time
//                 (what the writer asks of the rows), not the rows' contents (grade18 F2); PROJECTS_MAX projects a
//                 trail, the one read longest ago let go first
/** the most signatures each half of the cache keeps, and the most projects a trail keeps the read of */
export const SIGNED_MAX = 250_000, PROJECTS_MAX = 16;
let newer = new Set<string>(), older = new Set<string>();
export const signed: NonNullable<VerifyOpts["signed"]> = {
  has: (k) => newer.has(k) || older.has(k),
  add: (k) => { if (newer.size >= SIGNED_MAX) { older = newer; newer = new Set(); } newer.add(k); },
};
/** what the writer asks of a row: its id, key and time */
export type Head = Readonly<Pick<TrailEvent, "id" | "key" | "at">>;
type Kept = { print: string; rows: readonly Head[]; r: WayRead };
let kept = new WeakMap<object, Map<string, Kept>>();
/** a value frozen through (pure but for that) */
const deep = <T>(x: T): T => { if (x && typeof x === "object" && !Object.isFrozen(x)) { for (const v of Object.values(x)) deep(v); Object.freeze(x); } return x; };
const headsOf = (rows: readonly TrailEvent[]): readonly Head[] => Object.freeze(rows.map((e) => Object.freeze({ id: e.id, key: e.key, at: e.at })));
/** a project's rows (each one's id, key and time) and their read, from the cache when the rows are the ones it was made
 *  of (reads the trail). What is handed back is shared with the next caller, so frozen: the rows, the lists, the way
 *  events and their values, the files, the book. The two Maps are not: a caller only reads them */
export function readCached(trail: Parameters<typeof rowsOf>[0] & { raw: { prepare(sql: string): { iterate(...a: unknown[]): Iterable<unknown> } } }, project: string): { rows: readonly Head[]; r: WayRead } {
  const h = createHash("sha256");
  for (const x of trail.raw.prepare("SELECT seq, typeof(body) AS t, body FROM event WHERE project = ? ORDER BY seq").iterate(project)) {
    const row = x as { seq: number | bigint; t: string; body: string | Uint8Array | null };
    const b = row.body ?? "";
    h.update(`${row.seq}\n${row.t}\n${b.length}\n`).update(b);
  }
  const print = h.digest("hex");
  let m = kept.get(trail);
  if (!m) kept.set(trail, (m = new Map()));
  const k = m.get(project);
  if (k) { m.delete(project); m.set(project, k); }   // the one read last, kept last
  if (k?.print === print) return checked(k, trail, project);
  const all = rowsOf(trail, project), r = readWays(all, signed);
  for (const l of r.ways.values()) { for (const e of l) deep(e); Object.freeze(l); }
  deep(r.files); deep(r.dropped); Object.freeze(r.book);
  const out = { print, rows: headsOf(all), r };
  m.delete(project);
  m.set(project, out);
  while (m.size > PROJECTS_MAX) m.delete(m.keys().next().value!);
  return checked(out, trail, project);
}
/** with SOL_WAY_CACHE_CHECK set (the tests'), every cached read is held against readWays over the rows read again */
function checked(k: Kept, trail: Parameters<typeof rowsOf>[0], project: string): Kept {
  if (!process.env.SOL_WAY_CACHE_CHECK) return k;
  const rows = rowsOf(trail, project), why = sameRead(k.r, readWays(rows), rows);
  if (why || canonical(k.rows) !== canonical(headsOf(rows))) throw new Error(`the way cache differs from readWays: ${why || "rows"}`);
  return k;
}
/** where two reads of the same rows differ, or "" (pure): every part, and the book, the role table and the spellings
 *  asked of every login the rows name (as written, upper and lower case) at every time they carry and one ms either side */
export function sameRead(a: WayRead, b: WayRead, rows: readonly TrailEvent[]): string {
  const plain = (r: WayRead) => canonical({ ways: [...r.ways], files: r.files, dropped: r.dropped, tips: [...r.tips], book: r.book.book });
  if (plain(a) !== plain(b)) return "parts";
  const logins = new Set<string>(), times = new Set<number>([0, Number.MAX_SAFE_INTEGER]);
  for (const e of rows) {
    for (const l of [e.by?.person, e.item]) if (typeof l === "string") { logins.add(l); logins.add(l.toLowerCase()); logins.add(l.toUpperCase()); }
    if (typeof e.at === "number") for (const t of [e.at - 1, e.at, e.at + 1, e.at + 0.5]) times.add(t);
  }
  for (const l of logins) {
    if (a.nameOf(l) !== b.nameOf(l)) return `nameOf ${l}`;
    for (const t of times) if (a.book.roleOf(l, t) !== b.book.roleOf(l, t)) return `roleOf ${l} ${t}`;
  }
  const start = (r: WayRead, t: number) => (typeof r.book.start === "function" ? r.book.start(t) : r.book.start);
  for (const t of times) if (start(a, t) !== start(b, t)) return `start ${t}`;
  return "";
}
/** the cache emptied (tests) */
export function forget(): void { newer = new Set(); older = new Set(); kept = new WeakMap(); }
