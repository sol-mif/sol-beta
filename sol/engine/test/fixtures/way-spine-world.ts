// A small world for the team-book tests of the way engine (way-spine*.test.ts): several Sols, each with its own key
// and the events it holds so far, writing into one team's book. It does what the wiring (step 4b) will do and nothing
// more: gives every event its place (`key`, `n`, `after`), gives an agreement the way's head as its writer had it
// (`base`), and writes the runner's events only through the engine's own turn (turn, due, sealedDue). No I/O, no clock:
// every time is handed in. The events a Sol holds are kept in the order they reached it, so a fold is always handed an
// order that is not the team's.
import { load as loadWay } from "../../src/way/load.ts";
import { decide, type Ask, type Decision } from "../../src/way/moves.ts";
import { place, sealedDue, turn, written, type Placed, type Turn } from "../../src/way/fold.ts";
import { due, type Due } from "../../src/way/triggers.ts";
import { personOf, type Answers, type Draft, type Loaded, type TeamBook, type TeamRole, type Way, type WayEvent } from "../../src/way/types.ts";
import { DRAFTS_WAY } from "./sol-drafts-way.ts";

export const WAY = "sol.drafts";
export const MARCO = "person:marco", FRANK = "person:frank", ISAAC = "person:isaac";
export const ME = "nucbox@frank", RUNNER = `machine:${ME}`, MINI = "machine:mini@marco";
const PRINT = "0123456789abcdef".repeat(4);
const PINNED = DRAFTS_WAY.replaceAll('"sha256:tbd"', `"sha256:${PRINT}"`);
/** the drafts way, its seams pinned, as an object a test may change */
export const raw = (): Record<string, any> => JSON.parse(PINNED);
/** New York wall time on day `n` after 2026-11-10 (winter: five hours behind UTC), in ms */
export const day = (n: number, h: number, m = 0): number => Date.UTC(2026, 10, 10 + n, h + 5, m);
/** the 09:30 tick of day `n` */
export const TICK = (n: number): number => day(n, 9, 30);
/** a clock far past every test's events: a fold that is not about the clock is handed this */
export const FAR = day(900, 0);
export const SOLID: Answers = { "contract.written": { pass: true }, "undo.works": { pass: true }, "data.ok": { pass: true }, "gate.green": { pass: true }, "used.enough": { pass: true } };
export const MAKE = (thing: string, title = "one", sw = `s-${thing}`): Omit<Ask, "asker"> => ({ thing, kind: "draft", move: "make", set: { title, switch: sw } });

/** every event a world wrote through the engine's own drafts: the last test of a file checks each fits its kind's row */
export const kept: WayEvent[] = [];

type Roles = Record<string, TeamRole | ((at: number) => TeamRole | null)>;
/** an event in the book: it has its id and its place */
export type Ev = WayEvent & { id: string; key: string; n: number };

export class World {
  all: Ev[] = [];
  byId = new Map<string, Ev>();
  ways = new Map<string, Way>();
  loaded = new Map<string, Loaded>();
  heads = new Map<string, { n: number; at: number }>();
  asked: [string, number][] = [];
  book: TeamBook;
  private count = 0;
  constructor(public roles: Roles = { frank: "owner", marco: "editor", isaac: "editor" }, start: "owner" | "member" = "owner") {
    this.book = { book: "team", start, roleOf: (login, at) => { this.asked.push([login, at]); const r = Object.hasOwn(this.roles, login) ? this.roles[login] : null; return typeof r === "function" ? r(at) : r; } };
  }
  /** a way file read and kept by its ver (applied or not: a file anyone holds can be read) */
  add(file: unknown): Loaded {
    const l = loadWay(file);
    if (!l.way) throw new Error(`way file does not load: ${JSON.stringify(l.problems)}`);
    this.ways.set(l.ver, l.way); this.loaded.set(l.ver, l);
    return l;
  }
  /** ids as a trail's are: a hash, so their order says nothing of the order they were written in */
  nextId(): string { return `e${((++this.count * 2654435761) >>> 0).toString(16).padStart(8, "0")}`; }
  put(e: Ev): Ev { this.all.push(e); this.byId.set(e.id, e); return e; }
  /** these events folded as a team's book, with this clock */
  fold(events: readonly WayEvent[], now = FAR, o: { before?: string } = {}): Placed { return place(WAY, events, this.ways, this.book, { now, ...o }); }
  /** the whole book */
  full(now = FAR): Placed { return this.fold(this.all, now); }
}

type WriteOptions = { by?: string; base?: string[]; holds?: ReadonlySet<string>; now?: number; keep?: boolean };

export class Sol {
  /** the ids this Sol holds, in the order they reached it */
  holds = new Set<string>();
  constructor(readonly w: World, readonly by: string, readonly key = `k:${by}`) {}
  /** everything written so far reaches this Sol (or just these ids) */
  sync(ids?: Iterable<string>): this { for (const id of ids ?? this.w.all.map((e) => e.id)) this.holds.add(id); return this; }
  evs(holds: ReadonlySet<string> = this.holds): Ev[] { return [...holds].map((id) => this.w.byId.get(id)!); }
  mine(): Ev[] { return this.w.all.filter((e) => e.key === this.key); }
  /** what this Sol shows at `now`, from what it holds (or from `holds`: an older or a doctored set) */
  view(now = FAR, o: { holds?: ReadonlySet<string>; before?: string } = {}): Placed { return this.w.fold(this.evs(o.holds), now, o.before ? { before: o.before } : {}); }
  /** drafts written as this Sol's key writes them: an id, the next place of its chain, `because` and `checks` from the
   *  drafts' own indexes. A draft's own `base` is kept (the turn's frontier); `base` goes on the first firing or
   *  receipt (a writer signing a frontier of its choice); an agreement gets the way's head as this Sol has it. Nothing
   *  is dated for the writer: `at` is what the draft says, also when that is before the key's last event */
  write(drafts: readonly Draft[], o: WriteOptions = {}): Ev[] {
    const ids = drafts.map(() => this.w.nextId()), out: Ev[] = [];
    const first = drafts.findIndex((d) => d.kind === "way.fired" || d.kind === "way.seen");
    drafts.forEach((d, i) => {
      let base = d.base ?? (i === first ? o.base : undefined);
      if (d.kind === "way.agreed" && base === undefined) { const head = this.view(o.now ?? d.at, { holds: o.holds }).p.head; if (head) base = [head]; }
      const e = this.sign({ kind: d.kind, item: d.item, value: written(d, ids), at: d.at, id: ids[i], by: o.by ?? this.by, ...(base ? { base: [...base] } : {}) });
      if (o.keep !== false) kept.push(e);
      out.push(e);
    });
    return out;
  }
  /** one event given this key's next place and put in the book */
  sign(e: WayEvent & { id: string }, o: { n?: number; after?: number | null } = {}): Ev {
    const h = this.w.heads.get(this.key);
    const n = o.n ?? (h?.n ?? -1) + 1, after = o.after === null ? undefined : o.after ?? h?.at;
    const ev: Ev = { ...e, key: this.key, n, ...(after !== undefined ? { after } : {}) };
    if (o.n === undefined) this.w.heads.set(this.key, { n, at: e.at });
    this.holds.add(ev.id);
    return this.w.put(ev);
  }
  /** one event written by hand (an apply, a proposal, a forged receipt): the value as given */
  raw(kind: string, value: Record<string, unknown>, at: number, o: { by?: string; base?: string[]; item?: string; n?: number; after?: number | null; unread?: boolean; id?: string; keep?: boolean } = {}): Ev {
    let base = o.base;
    if (kind === "way.agreed" && base === undefined) { const head = this.view(at).p.head; if (head) base = [head]; }
    const e = this.sign({ kind, item: o.item ?? WAY, value, at, id: o.id ?? this.w.nextId(), by: o.by ?? this.by, ...(base ? { base } : {}), ...(o.unread ? { unread: true } : {}) }, o);
    if (o.keep) kept.push(e);
    return e;
  }
  /** a press: decided on what this Sol shows at `now` (its clock: `at` unless said), written whatever the answer (a
   *  refusal is written too) */
  press(ask: Omit<Ask, "asker">, at: number, answers: Answers = {}, o: WriteOptions = {}): { d: Decision; evs: Ev[] } {
    const v = this.view(o.now ?? at, { holds: o.holds });
    const l = this.w.loaded.get(v.p.ver) ?? [...this.w.loaded.values()][0];
    const d = decide(l, v.p, { ...ask, asker: o.by ?? this.by }, at, answers);
    return { d, evs: this.write(d.drafts, o) };
  }
  /** this Sol as a runner */
  get me(): { runner: string; key: string } { return { runner: this.by.slice("machine:".length), key: this.key }; }
  turn(now: number, holds?: ReadonlySet<string>): Turn { return turn(WAY, this.evs(holds), this.w.ways, this.w.book, this.me, now); }
  /** the runner's turn at `now`, whole: the engine's turn on what this Sol holds, `due()` on the turn's projection,
   *  and what `sealedDue()` says to write (the turn's pages, then the first firing carrying the frontier, or a receipt,
   *  or nothing). `acts`: the acts to run, each `after` the index in `evs` of the move it follows */
  run(now: number, answers: Answers = {}, acts: Record<string, boolean> = {}, o: { holds?: ReadonlySet<string> } = {}): { t: Turn; d: Due; evs: Ev[]; acts: Due["acts"] } {
    const t = this.turn(now, o.holds);
    const l = this.w.loaded.get(t.ver);
    const d: Due = t.ok && l ? due(l, t.p, now, this.me.runner, answers, acts) : { drafts: [], acts: [], pings: [] };
    const out = l?.way ? sealedDue(t, d, l.way, now) : { drafts: [], acts: [] };
    return { t, d, evs: out.drafts.length ? this.write(out.drafts, { holds: o.holds }) : [], acts: out.acts };
  }
  /** a receipt written now whether one is owed or not (the loop writing one each period): the turn's pages, then its
   *  frontier on a way.seen. Nothing when the turn may not write */
  seal(now: number): { t: Turn; evs: Ev[] } {
    const t = this.turn(now);
    if (!t.ok) return { t, evs: [] };
    const seen = (base: string[], more: boolean): Draft => ({ kind: "way.seen", item: WAY, value: { way: WAY, ver: t.ver, ...(more ? { more: true } : {}) }, at: now, ...(base.length ? { base } : {}) });
    return { t, evs: this.write([...t.pages.map((ids) => seen(ids, true)), seen(t.frontier, false)]) };
  }
}

/** a way started in the team's book: every person the version names agrees to each role from their own Sol (one is
 *  made for a person who has none among `sols`), then Frank applies it a minute later; all of `sols` then hold it */
export function start(w: World, l: Loaded, at: number, sols: Sol[]): Ev {
  const extra: Sol[] = [];
  const solOf = (person: string): Sol => sols.find((s) => s.by === person) ?? extra.find((s) => s.by === person) ?? (extra.push(new Sol(w, person)), extra.at(-1)!);
  for (const [role, r] of Object.entries(l.way!.roles)) for (const person of new Set(r.who.map(personOf)))
    solOf(person).write([{ kind: "way.agreed", item: WAY, value: { way: WAY, to: l.ver, role }, at }]);
  const ap = solOf(FRANK).sync().write([{ kind: "way.applied", item: WAY, value: { way: WAY, from: "", to: l.ver, reader: 1 }, at: at + 60_000 }])[0];
  for (const s of sols) s.sync();
  return ap;
}

/** the usual start: the drafts way applied the day before, Marco, Frank and the runner each on a Sol, d1 made at
 *  09:00 on day 0, everyone holding everything */
export function setup(file: unknown = raw(), o: { roles?: Roles; d1?: number } = {}) {
  const w = new World(o.roles);
  const l = w.add(file);
  const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER);
  const all = [marco, frank, runner];
  start(w, l, day(-1, 12), all);
  marco.press(MAKE("d1", "one", "s1"), o.d1 ?? day(0, 9));
  const sync = () => { for (const s of all) s.sync(); };
  sync();
  return { w, l, marco, frank, runner, all, sync };
}

/** what a fold shows of one thing, for comparing two folds */
export const snap = (p: Placed["p"], thing: string): string => {
  const t = p.things[thing];
  return JSON.stringify({ ver: p.ver.slice(0, 8), t: t ? { state: t.state, fields: t.fields, fired: t.fired, born: t.born, missing: t.missing, red: t.red } : null });
};
/** a fold as one string: the version, the things, what was taken */
export const canon = (r: Placed): string => JSON.stringify({ v: r.p.ver, t: r.p.things, k: r.seq.filter((s) => s.taken).map((s) => s.e.id).sort() });
export const taken = (r: Placed, id: string): boolean => r.seq.some((s) => s.e.id === id && s.taken);
/** where an event was folded (the time it was judged at, as what), or why it was not */
export const seatOf = (r: Placed, id: string) => r.seq.find((s) => s.e.id === id);
export const whyOf = (r: Placed, id: string): string[] => r.p.skipped.filter((s) => s.id === id).map((s) => s.why);
export const stateOf = (r: Placed, thing: string): string | null | undefined => r.p.things[thing]?.state;
/** a seeded generator (the reviewer's) */
export const lcg = (seed: number) => () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
