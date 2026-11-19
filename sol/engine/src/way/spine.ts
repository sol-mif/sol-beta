// The one order a team's book is folded in (FORMAT §5, "the runner's spine"). Pure: the way's events as this Sol holds
// them, in any order, come in; the same events on two Sols give the same sequence out, whatever order each received
// them in. Nothing here reads this Sol's clock or when it received anything (`seen` is a person's own log's).
//   the idea          the runner's own events are the spine of a way's history. Every other event falls into the
//                     stretch that ends at the first spine event that had seen it. Inside a stretch, signed order.
//                     Nothing is thrown away for being dated early or late: it waits
//   a place           an event has one when it has an id, its writer's key, its place along that key's chain (`n`) and
//                     a time that is a time; one that lacks any of them is passed over (`no_place`)
//   plain order       (`at`, `key`, `n`); an event dated before the one its key wrote before it (`at < after`) is set
//                     aside (`before_its_prev`): it stays held, so an id that names it is not missing
//   one chain a key   `n` stands for a key's ancestry: a frontier that names an event takes in everything of that key
//                     up to its place. That is right only when a key has one chain, and this engine cannot walk `prev`
//                     itself (a chain runs over every kind, the engine holds one way's events), so the door that hands
//                     the events in (step 4b) must hand one verified chain a key. A guard, not the answer: a key that
//                     holds two different ids at one place is forked, and every event of it from the first doubled
//                     place on is set aside (`forked`), still held; what it wrote before that place stands; a candidate
//                     among them orders nothing; the result lists the forked keys. A fork whose two branches do not
//                     both put an event of this way at one place cannot be seen from here
//   one event an id   the door hands in one event for an id. Handed two that differ under one id, the first handed in
//                     is kept; and an event with no place is listed where it was handed in. Those are the two places
//                     here where the order of arrival shows, and the door lets neither happen
//   a candidate       every way.fired and way.seen of the way, never an ordinary event. Its `base` is its frontier:
//                     ids of events of this way other keys wrote. Checked cheaply first: it names a version, and when
//                     this Sol holds that version's file it is signed `machine:<runner>` of it, else `not_spine` at
//                     once, nothing folded for it; then its frontier must be a list of at most 256 different ids, else
//                     `bad_frontier`. Either way its frontier counts for nothing, on every Sol and for good. One that
//                     passes both is well formed
//   a page            a way.seen that says `more: true`, well formed or not: it is never walked, is no spine event
//                     and orders nothing. What a well-formed one names is seen by the candidates after it in its own
//                     chain, as any earlier candidate's frontier is; one that is not well formed counts for nothing. So a turn with more than 256 names writes pages first. It
//                     has no batch, on any build: whether a way.seen is a page is read as signed, so one this build
//                     cannot read is a page all the same (and stops its key, as below)
//   its batch         the run right after it in its own chain (n+1, n+2, no gap) of events that answer it: each one's
//                     `because` is the candidate's id or an earlier member's. Folded only right after the candidate,
//                     when that is a spine event; else it shares the candidate's fate. A member this build cannot
//                     read is a member all the same, and so is the batch or the lead of a candidate it cannot read
//                     (`because`, `checks` and `tick` are read as signed): what an event is, a candidate, a batch
//                     member, a lead check or an ordinary event, never depends on the build that reads it, and never
//                     on an event written after it: each says it of itself
//   a lead check      a way.checked that says a `tick`: asked for a firing, to judge its trigger's `if` (the runner's
//                     turn writes them so, triggers.ts). Never an ordinary event: no frontier's place takes it in, no
//                     turn names it, and it is folded only as its firing's lead. One with no firing (`no_firing`) is
//                     set aside, still held; it comes in with its firing, where that firing stands
//   its lead          the lead checks a firing names (`checks`) that say its `tick` and stand right before it in its
//                     own chain (n-1, n-2, no gap): what the turn asked to judge that firing (a receipt has none).
//                     Folded only right before the candidate, after everything it had seen, at its time: the runner
//                     asked them on the state it judged, so no event it had seen may stand between them and it,
//                     whatever its date. Else they share its fate. A check that says no `tick` is an ordinary event
//                     (or a batch member) whatever names it later: a firing cannot claim it, so what a spine event
//                     placed is not taken out again by an event written afterwards.
//                     Everything else the key writes is an ordinary event
//   what it has seen  of its own key, every event before it in the chain; of another key, every ordinary event up to
//                     the latest place its frontier names for that key, or the frontier of an earlier well-formed
//                     candidate of its own key. So a frontier names only what is new, and a runner never unsees
//   another's spine   a way can have had more than one runner, so more than one key's candidates. A frontier that names
//                     another key's candidate, or a member of its batch, says: that candidate stood on the spine
//                     before this one (the walk that judged this one had placed it)
//   waiting           a well-formed candidate waits when it names an id this Sol does not hold, when it names a version
//                     whose file this Sol does not hold (it cannot be checked yet: a file can arrive after the event),
//                     when the candidate before it in its own chain waits, or when a candidate of another key that it
//                     names (itself or by its batch) waits. It is left out with its lead and its batch, and listed;
//                     each entry lists the ids that event itself names and this Sol lacks, and the version (`file`)
//                     when it is the file that is lacking (neither: it waits behind another). A fold is from scratch:
//                     it comes in when the event, or the file, arrives. What makes a candidate count for nothing is
//                     read from the event alone or from a file held, so it never turns into waiting later
//   the walk          the candidates that do not wait, in plain order, over P (the projection so far), U (the ordinary
//                     events not placed yet) and T (the time of the last spine event). S = what the candidate has seen
//                     of U, in plain order. S holds an event dated more than SKEW after the candidate: it is not a
//                     spine event (`before_its_base`). Else S is folded, each event judged at min(max(at, T), the
//                     candidate's at), and the candidate is a spine event when the version in force is then the one it
//                     names: S is placed, its lead is folded at its time, the candidate at its own time (passed over
//                     or not, it has ordered what it saw), its batch at that time, T moves. Otherwise `not_spine`, and S stays in U. The fold
//                     is tried on a copy only when S holds an apply or a revert that could change the answer
//   the open tail     the rest of U in plain order, each judged at max(at, T), and never without a clock: `now` is
//                     this Sol's time, one dated more than SKEW after it is not folded and is listed (`pending`), and
//                     with no `now` (or one that is no time) nothing of the tail is folded, all of it is listed. What
//                     the spine placed never depends on `now`
//   unread            an event this build cannot read is placed like any other and passed over (`unread`); the result
//                     lists them. A way.fired or way.seen this build cannot read is not placed: a build that reads it
//                     may find it waits, so here it stops its key as a waiting candidate does (the candidates after it
//                     in its chain, and whoever names it or its batch, wait) and is listed `unread`, not `waiting`;
//                     its lead and its batch wait behind it
// The runner's turn (turnOf) is the writer's side of the same walk: from one snapshot, the frontier to sign and the
// projection to judge on, so the state just before a spine event is, on every Sol that holds what it had seen, the
// state the runner judged. A person's own log is not ordered here: it folds in the order it is given (fold.ts).
import { dayOf, isTime } from "./clock.js";
import { age } from "./rules.js";
import { SKEW, isObj, type Book, type Draft, type FoldOptions, type Projection, type Way, type WayEvent } from "./types.js";

type Ways = (ver: string) => Way | undefined;
/** what the order is built over, handed in by fold.ts (the only holder of `take`, the fold of one event): so a team's
 *  book cannot be folded in another order from outside */
export type Kit = {
  empty: (way: string) => Projection;
  copy: (p: Projection) => Projection;
  take: (p: Projection, e: WayEvent, ways: Ways, book: Book, index: number, o: FoldOptions) => boolean;
};
/** one event where it was folded: the time it was judged at, whether it was taken, and as what (`seen`: before the
 *  spine event that had seen it; `lead`: a check its firing names, right before it; `spine`; `batch`; `tail`; `given`:
 *  a person's own log, the order handed in) */
export type Seat = { e: WayEvent; at: number; taken: boolean; as: "seen" | "lead" | "spine" | "batch" | "tail" | "given" };
/** a way's events placed and folded: the projection; every event folded, in the order it was folded; the spine events'
 *  ids; the time of the last one (none: no spine yet); the candidates left out with their batches, each with the ids
 *  this Sol lacks; the tail events not folded yet (dated past now, or no clock was given); the ids of the events this
 *  build cannot read; the keys that hold two events at one place (forked: set aside from there on); how many copies of
 *  the projection the fold made; with `before`, the projection just before that spine event */
export type Placed = {
  p: Projection; seq: Seat[]; spine: string[]; last?: number;
  waiting: { id: string; missing: string[]; file?: string }[]; pending: string[]; unread: string[]; forked: string[]; copies: number; before?: Projection;
};
/** `now`: this Sol's clock, for the open tail only. `before`: the id of a spine event whose state just before it is
 *  wanted (what its runner judged on) */
export type PlaceOptions = FoldOptions & { now?: number; before?: string };
/** a team's book is never folded without a clock: `now` is not optional there */
export type TeamPlaceOptions = PlaceOptions & { now: number };
/** this Sol as a runner: `<machine>@<login>`, and the key it signs with */
export type Me = { runner: string; key: string };
/** a runner's turn: the projection to judge on, the version in force there, the frontier to sign, the pages to write
 *  before it (the names one frontier does not hold, 256 a page), and whether this Sol writes at all (`why` when not);
 *  `news`: whether the turn's event would order an ordinary event of another key, one no spine event has ordered yet:
 *  one the turn names, or one a page of its key named whose receipt was never written (a receipt is owed for that;
 *  another key's spine event alone is not answered with a receipt: the next event the turn writes names it); `last`:
 *  the time of the last spine event before the turn (none: no spine yet) */
export type Turn = { p: Projection; ver: string; frontier: string[]; pages: string[][]; news: boolean; ok: boolean; why?: string; last?: number };

/** how many ids a frontier may name */
export const FRONTIER_MAX = 256;

type Node = {
  e: WayEvent; id: string; key: string; n: number; at: number; rank: number;
  role: "ordinary" | "candidate" | "batch" | "lead";
  /** why it is set aside, or "waiting" */
  fate?: string;
  /** a candidate's: the version it names (set when it is well formed), its lead and its batch (each in chain order),
   *  how far its chain's names reach once its own are in (`g`: a length of the chain's `named` list, so what a
   *  candidate has seen takes no room of its own), the ids it names itself that this Sol lacks, the version it names
   *  when this Sol lacks that file, whether it is a page */
  ver?: string; lead?: Node[]; batch?: Node[]; g?: number; missing?: string[]; file?: string; page?: boolean;
  /** a batch member's: its candidate; a lead check's: its firing (none: it has no firing) */
  of?: Node;
};
type Order = {
  /** every event with a place, in plain order */
  nodes: Node[]; held: Map<string, Node>;
  /** per key, its ordinary events in chain order; the candidates to walk, in plain order */
  ord: Map<string, Node[]>; cands: Node[];
  /** per key, each time one of its well-formed candidates (pages and waiting ones too: what each names counts for
   *  those after it) named further along another key: [that key, the place], in chain order. A key's places only rise
   *  along the list, so what a candidate had seen of a key is that key's last entry before the candidate's `g` */
  named: Map<string, [string, number][]>;
  /** per key, its latest well-formed candidate, what that has seen of other keys, and how far along each other key's
   *  spine its key has named (key to latest place) */
  heirs: Map<string, { last: Node; limits: ReadonlyMap<string, number>; spines: ReadonlyMap<string, number> }>;
  noPlace: { e: WayEvent; index: number }[]; unread: string[];
  /** the keys that hold two different ids at one place */
  forked: string[];
};

const NOTHING: Map<string, number> = new Map();
const str = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const plain = (a: Node, b: Node): number => a.at - b.at || str(a.key, b.key) || a.n - b.n || str(a.id, b.id);
const byRank = (a: Node, b: Node): number => a.rank - b.rank;
const thingOf = (e: WayEvent): string | undefined => (isObj(e.value) && typeof e.value.thing === "string" ? e.value.thing : undefined);
const passed = (p: Projection, x: { e: WayEvent; rank: number }, why: string): void => {
  const thing = thingOf(x.e);
  p.skipped.push({ index: x.rank, ...(x.e.id ? { id: x.e.id } : {}), kind: x.e.kind, ...(thing ? { thing } : {}), why });
};
const isVersion = (x: Node): boolean => x.e.unread !== true && (x.e.kind === "way.applied" || x.e.kind === "way.reverted");

/** a frontier read from a signed `base` (pure): the ids, or null when it is not a list of at most 256 different ids.
 *  No base at all is an empty frontier */
function frontierOf(base: unknown): string[] | null {
  if (base === undefined) return [];
  if (!Array.isArray(base) || base.length > FRONTIER_MAX) return null;
  if (base.some((id) => typeof id !== "string" || !id) || new Set(base).size !== base.length) return null;
  return base as string[];
}

/** the way's events given their places (pure): plain order, each key's chain, the candidates with their batches and
 *  what each has seen. Rules 1 to 3 */
function orderOf(way: string, events: readonly WayEvent[], get: Ways): Order {
  const held = new Map<string, Node>(), noPlace: Order["noPlace"] = [], unread = new Set<string>();
  events.forEach((e, index) => {
    if (typeof e.kind !== "string" || !e.kind.startsWith("way.")) return;
    if (isObj(e.value) && e.value.way !== way) return;   // another way's
    if (e.unread === true && typeof e.id === "string" && e.id) unread.add(e.id);
    const placed = typeof e.id === "string" && e.id !== "" && typeof e.key === "string" && e.key !== "" && Number.isSafeInteger(e.n) && (e.n as number) >= 0 && isTime(e.at);
    if (!placed) { noPlace.push({ e, index }); return; }
    if (!held.has(e.id as string)) held.set(e.id as string, { e, id: e.id as string, key: e.key as string, n: e.n as number, at: e.at, rank: -1, role: "ordinary" });
  });
  const nodes = [...held.values()].sort(plain);
  nodes.forEach((x, i) => { x.rank = i; });
  // the guard for one chain a key: the first place where a key holds two different ids
  const at = new Map<string, Set<number>>(), forkAt = new Map<string, number>();
  for (const x of nodes) {
    const places = at.get(x.key) ?? at.set(x.key, new Set()).get(x.key)!;
    if (places.has(x.n)) forkAt.set(x.key, Math.min(forkAt.get(x.key) ?? Infinity, x.n));
    else places.add(x.n);
  }
  const chains = new Map<string, Node[]>();
  for (const x of nodes) {
    if (x.n >= (forkAt.get(x.key) ?? Infinity)) { x.fate = "forked"; continue; }
    if (typeof x.e.after === "number" && x.at < x.e.after) { x.fate = "before_its_prev"; continue; }
    const c = chains.get(x.key);
    if (c) c.push(x); else chains.set(x.key, [x]);
    if (x.e.kind === "way.fired" || x.e.kind === "way.seen") x.role = "candidate";
  }
  // each key's chain: its candidates' batches and leads first (a frontier may name a batch), all keys
  for (const chain of chains.values()) {
    chain.sort((a, b) => a.n - b.n || str(a.id, b.id));
    // a lead check says so itself (a `tick`), read as signed: no later event makes one of an ordinary event
    for (const x of chain) if (x.e.kind === "way.checked" && isObj(x.e.value) && typeof x.e.value.tick === "number") x.role = "lead";
    for (let i = 0; i < chain.length; i++) {
      const c = chain[i];
      if (c.role !== "candidate") continue;
      // its batch: the run right after it, no gap, each answering it or an earlier member (a page has none)
      const batch: Node[] = [], answers = new Set([c.id]);
      c.page = c.e.kind === "way.seen" && isObj(c.e.value) && c.e.value.more === true;
      for (let j = i + 1; j < chain.length && !c.page; j++) {
        const x = chain[j], because = isObj(x.e.value) ? x.e.value.because : undefined;
        if (x.n !== c.n + (j - i) || x.role !== "ordinary" || typeof because !== "string" || !answers.has(because)) break;
        x.role = "batch"; x.of = c; batch.push(x); answers.add(x.id);
      }
      c.batch = batch;
      // its lead: the lead checks a firing names, of its tick, that stand right before it, no gap
      const lead: Node[] = [], v = isObj(c.e.value) ? c.e.value : {}, asked = new Set<unknown>(c.e.kind === "way.fired" && Array.isArray(v.checks) ? v.checks : []);
      for (let j = i - 1; j >= 0 && asked.size; j--) {
        const x = chain[j];
        if (x.n !== c.n - (i - j) || x.role !== "lead" || !asked.has(x.id) || (x.e.value as Record<string, unknown>).tick !== v.tick) break;
        x.of = c; lead.push(x);
      }
      c.lead = lead.reverse();
    }
    for (const x of chain) if (x.role === "lead" && !x.of) x.fate = "no_firing";
  }
  // then what each candidate has seen, and what it stands after: [a candidate, one that waits when it waits]
  const heirs: Order["heirs"] = new Map(), after: [Node, Node][] = [], lacking: Node[] = [], named: Order["named"] = new Map();
  for (const [key, chain] of chains) {
    // one map and one list a chain, grown as its candidates name further; a candidate keeps only how long the list
    // was once its own names were in (`g`)
    const limits = new Map<string, number>(), spines = new Map<string, number>(), names: [string, number][] = [];
    let last: Node | undefined;
    for (const c of chain) {
      if (c.role !== "candidate") continue;
      // one this build cannot read stops its key here
      if (c.e.unread === true) { lacking.push(c); last = c; heirs.set(key, { last: c, limits, spines }); continue; }
      // the cheap check (with no file held for the version it names it cannot fail yet: it waits), then the frontier
      const ver = isObj(c.e.value) && typeof c.e.value.ver === "string" ? c.e.value.ver : "";
      const w = ver ? get(ver) : undefined;
      if (!ver || (w && c.e.by !== `machine:${w.runner}`)) { c.fate = "not_spine"; continue; }
      const frontier = frontierOf(c.e.base);
      if (!frontier) { c.fate = "bad_frontier"; continue; }
      const missing: string[] = [];
      for (const id of frontier) {
        const x = held.get(id);
        if (!x) { missing.push(id); continue; }   // a frontier's ids differ, so each is listed once
        if (x.key === key) continue;
        if ((limits.get(x.key) ?? -1) < x.n) { limits.set(x.key, x.n); names.push([x.key, x.n]); }
        // another key's candidate, named itself or by its batch: this one stands after it
        const named = x.role === "candidate" ? x : x.role === "batch" ? x.of : undefined;
        if (!named) continue;
        after.push([named, c]);
        if ((spines.get(x.key) ?? -1) < x.n) spines.set(x.key, x.n);
      }
      c.ver = ver; c.g = names.length; c.missing = missing;
      if (!w) c.file = ver;
      if (missing.length || !w) lacking.push(c);
      if (last) after.push([last, c]);
      last = c;
      heirs.set(key, { last: c, limits, spines });
    }
    if (names.length) named.set(key, names);
  }
  // waiting spreads from the candidates that lack an id or a file, and from the unread ones, to every well-formed one
  // that stands after one that waits (one that is not well formed never lacks and never waits, so nothing spreads
  // through it)
  const then = new Map<Node, Node[]>();
  for (const [a, b] of after) {
    const list = then.get(a);
    if (list) list.push(b); else then.set(a, [b]);
  }
  for (const c of lacking) c.fate = "waiting";
  while (lacking.length) {
    for (const b of then.get(lacking.pop() as Node) ?? []) if (!b.fate) { b.fate = "waiting"; lacking.push(b); }
  }
  const ord = new Map<string, Node[]>(), cands: Node[] = [];
  for (const [key, chain] of chains) {
    const list = chain.filter((x) => x.role === "ordinary");
    if (list.length) ord.set(key, list);
  }
  for (const x of nodes) {
    if (x.role !== "candidate") continue;
    if (x.fate) for (const b of [...(x.lead ?? []), ...(x.batch ?? [])]) b.fate = x.fate;
    else if (!x.page) cands.push(x);   // a page is never walked
  }
  return { nodes, held, ord, cands, named, heirs, noPlace, unread: [...unread].sort(), forked: [...forkAt.keys()].sort() };
}

/** what a candidate has seen of the events not placed yet (pure): of its own key those up to place `own`, of each key
 *  in `limits` those up to its place there, in plain order; and where each key's unplaced events would then start */
function seenBy(o: Order, next: ReadonlyMap<string, number>, key: string, own: number, limits: Iterable<readonly [string, number]>): { S: Node[]; ends: [string, number][] } {
  const S: Node[] = [], ends: [string, number][] = [];
  const upTo = (k: string, lim: number) => {
    const list = o.ord.get(k);
    if (!list) return;
    const from = next.get(k) ?? 0;
    let i = from;
    while (i < list.length && list[i].n <= lim) S.push(list[i++]);
    if (i > from) ends.push([k, i]);
  };
  upTo(key, own);
  for (const [k, lim] of limits) if (k !== key) upTo(k, lim);
  S.sort(byRank);
  return { S, ends };
}

/** `tails`: per key, the last event of its latest spine event's turn (its batch's last member, or itself) */
type Walked = { P: Projection; T: number; next: Map<string, number>; tails: Map<string, Node>; seq: Seat[]; spine: string[]; copies: number; before?: Projection };

/** the walk (rule 4) up to a point (pure but for the nodes' fates): `stop` says where a turn's own event would stand */
function walk(kit: Kit, o: Order, way: string, get: Ways, book: Book, opt: FoldOptions, stop?: (c: Node) => boolean, before?: string): Walked {
  const w: Walked = { P: kit.empty(way), T: -Infinity, next: new Map(), tails: new Map(), seq: [], spine: [], copies: 0 };
  for (const x of o.noPlace) passed(w.P, { e: x.e, rank: x.index }, "no_place");
  const aside = (c: Node, why: string) => { c.fate = why; for (const b of [...(c.lead ?? []), ...(c.batch ?? [])]) b.fate = why; };
  // per key that has a candidate walked, along its chain's `named` list: how far the furthest spine event of the chain
  // walked so far reaches (`done`), how far the list has been read (`upto`), and the names between the two, the later
  // place of a key over the earlier (`pend`). A spine event has placed all its chain had seen up to it, of every key:
  // of the keys named since the spine event before it by looking, of the others because that one had. So a candidate
  // looks at its own key and at the keys named between `done` and itself, not at every key its chain ever named
  const chains = new Map<string, { done: number; upto: number; pend: Map<string, number> }>();
  for (const F of o.cands) {
    if (stop?.(F)) break;   // in plain order: everything after it is after the turn too
    const names = o.named.get(F.key) ?? [], g = F.g as number;
    const st = chains.get(F.key) ?? chains.set(F.key, { done: 0, upto: 0, pend: new Map() }).get(F.key)!;
    let limits: Map<string, number>;
    // at or before a spine event of its chain already walked (it is dated after a later one of its chain): all it
    // had seen is placed
    if (g <= st.done) limits = NOTHING;
    // in its chain's order (always, for a key that never dates an event before its last one): the list is read up to it
    else if (g >= st.upto) { for (; st.upto < g; st.upto++) st.pend.set(names[st.upto][0], names[st.upto][1]); limits = st.pend; }
    // walked after a later one of its chain that is no spine event (one dated back, set aside): only the names up to
    // its own, read again from `done`. One such costs what its chain named since its last spine event, no more
    else { limits = new Map(); for (let i = st.done; i < g; i++) limits.set(names[i][0], names[i][1]); }
    const { S, ends } = seenBy(o, w.next, F.key, F.n - 1, limits);
    if (S.some((x) => x.at > F.at + SKEW)) { aside(F, "before_its_base"); continue; }
    const vers = S.filter(isVersion);
    if (!vers.length) {
      if (w.P.ver !== F.ver) { aside(F, "not_spine"); continue; }
      for (const x of S) one(kit, w.P, x, Math.min(Math.max(x.at, w.T), F.at), "seen", w.seq, get, book, opt);
    } else {
      // only an apply or a revert to the version it names can make it a spine event when that version is not in force
      if (w.P.ver !== F.ver && !vers.some((x) => isObj(x.e.value) && x.e.value.to === F.ver)) { aside(F, "not_spine"); continue; }
      const c = kit.copy(w.P), seq: Seat[] = [];
      w.copies++;
      for (const x of S) one(kit, c, x, Math.min(Math.max(x.at, w.T), F.at), "seen", seq, get, book, opt);
      if (c.ver !== F.ver) { aside(F, "not_spine"); continue; }
      w.P = c;
      for (const x of seq) w.seq.push(x);   // one at a time: a spread of a long S runs out of stack
    }
    for (const [k, i] of ends) w.next.set(k, i);
    // it is a spine event: what is left between it and `upto` are the names after its own
    if (g > st.done) {
      if (limits === st.pend) st.pend.clear();
      else for (const [k, n] of limits) if (st.pend.get(k) === n) st.pend.delete(k);
      st.done = g;
    }
    if (before !== undefined && before === F.id) w.before = kit.copy(w.P);
    for (const b of F.lead ?? []) one(kit, w.P, b, F.at, "lead", w.seq, get, book, opt);
    one(kit, w.P, F, F.at, "spine", w.seq, get, book, opt);
    for (const b of F.batch ?? []) one(kit, w.P, b, F.at, "batch", w.seq, get, book, opt);
    w.T = F.at; w.spine.push(F.id); w.tails.set(F.key, F.batch?.length ? F.batch[F.batch.length - 1] : F);
  }
  return w;
}

/** one event folded where it stands, judged at `at` (pure but for `p` and `seq`); an unread one is passed over */
function one(kit: Kit, p: Projection, x: Node, at: number, as: Seat["as"], seq: Seat[], get: Ways, book: Book, opt: FoldOptions): void {
  let taken = false;
  if (x.e.unread === true) passed(p, x, "unread");
  else taken = kit.take(p, at === x.e.at ? x.e : { ...x.e, at }, get, book, x.rank, opt);
  seq.push({ e: x.e, at, taken, as });
}

/** a way's events in a team's book, placed and folded (pure). Called by fold.ts alone (it holds the kit). The open
 *  tail is folded only against a clock: with no `now`, or one that is no time, every tail event is listed `pending`
 *  and passed over (a caller that forgot the clock takes no far-dated press as if its time had come) */
export function spineFold(kit: Kit, way: string, events: readonly WayEvent[], get: Ways, book: Book, o: TeamPlaceOptions): Placed {
  const ord = orderOf(way, events, get);
  const w = walk(kit, ord, way, get, book, o, undefined, o.before);
  // the open tail
  const now = isTime(o.now) ? o.now : undefined;
  const rest: Node[] = [], pending: string[] = [];
  for (const [k, list] of ord.ord) for (let i = w.next.get(k) ?? 0; i < list.length; i++) rest.push(list[i]);
  rest.sort(byRank);
  for (const x of rest) {
    if (now === undefined || x.at > now + SKEW) { pending.push(x.id); passed(w.P, x, "pending"); continue; }
    one(kit, w.P, x, Math.max(x.at, w.T), "tail", w.seq, get, book, o);
  }
  // what was set aside or waits, named once each, in plain order
  const waiting: Placed["waiting"] = [];
  for (const x of ord.nodes) {
    if (!x.fate) continue;
    const unread = x.role === "candidate" && x.e.unread === true;
    passed(w.P, x, unread ? "unread" : x.fate);
    if (x.fate === "waiting" && !unread) waiting.push({ id: x.id, missing: [...(x.missing ?? [])], ...(x.file ? { file: x.file } : {}) });
  }
  return { p: w.P, seq: w.seq, spine: w.spine, ...(Number.isFinite(w.T) ? { last: w.T } : {}), waiting, pending, unread: ord.unread, forked: ord.forked, copies: w.copies, ...(w.before ? { before: w.before } : {}) };
}

/** the runner's turn (rule 5; pure): from what this Sol holds, the projection the runner judges on and the frontier it
 *  must sign, both from the same events. `now` is the time its event will be signed with (the trail never dates an
 *  event before its key's last one, so the wiring hands in the later of its clock and that). The frontier names, per
 *  other key: the end of that key's latest spine event the turn's walk placed (its batch's last member, or itself),
 *  when the runner's key has not named that far along that key's spine already; and the latest of that key's unplaced
 *  ordinary events, in chain order, before the first one dated more than SKEW after `now`, when the runner's key has
 *  not named that far already. The stop is a time and nothing else: an event is named whatever its own `base` says
 *  (an agreement that reached the runner before the apply it was given on goes in before that apply, and is spent).
 *  Every one of them is named in this turn: the walk has placed those spine events, so a turn that left one out would
 *  be judged on more than it says it saw. More than 256 names: the first ones go on pages, 256 each, the rest (the
 *  last 256 or fewer) is the frontier.
 *  It writes nothing (`ok` false, `why`) when the version in force there does not name `me` as runner
 *  (`not_runner`), when `now` is no time (`no_time`: nothing of the tail is folded then), when its own key is forked
 *  (`forked`: what it wrote would be set aside on every Sol), when its own key holds an event dated after `now`
 *  (`clock_back`), when its own key's latest candidate waits (`waiting`), or when something it already named is dated
 *  more than SKEW after `now` (`before_its_base`) */
export function spineTurn(kit: Kit, way: string, events: readonly WayEvent[], get: Ways, book: Book, me: Me, now: number, o: FoldOptions = {}): Turn {
  const ord = orderOf(way, events, get);
  const no = (why: string): Turn => { const p = spineFold(kit, way, events, get, book, { ...o, now }).p; return { p, ver: p.ver, frontier: [], pages: [], news: false, ok: false, why }; };
  if (!isTime(now)) return no("no_time");
  if (ord.forked.includes(me.key)) return no("forked");
  if (ord.nodes.some((x) => x.key === me.key && x.at > now)) return no("clock_back");
  const heir = ord.heirs.get(me.key);
  if (heir?.last.fate === "waiting") return no("waiting");
  const w = walk(kit, ord, way, get, book, o, (F) => F.at > now || (F.at === now && F.key > me.key));
  const had = heir?.limits ?? new Map<string, number>(), far = heir?.spines ?? new Map<string, number>();
  const ends: Node[] = [], news: Node[] = [];
  for (const [k, x] of w.tails) if (k !== me.key && x.n > (far.get(k) ?? -1)) ends.push(x);
  for (const [k, list] of ord.ord) {
    if (k === me.key) continue;
    let latest: Node | undefined;
    for (let i = w.next.get(k) ?? 0; i < list.length && list[i].at <= now + SKEW; i++) latest = list[i];
    if (latest && latest.n > (had.get(k) ?? -1)) news.push(latest);
  }
  ends.sort(byRank); news.sort(byRank);
  const named = [...ends, ...news];
  const limits = new Map(had);
  for (const x of named) if (x.n > (limits.get(x.key) ?? -1)) limits.set(x.key, x.n);
  const { S } = seenBy(ord, w.next, me.key, Infinity, limits);
  if (S.some((x) => x.at > now + SKEW)) return no("before_its_base");
  for (const x of S) one(kit, w.P, x, Math.min(Math.max(x.at, w.T), now), "seen", w.seq, get, book, o);
  const last = Number.isFinite(w.T) ? { last: w.T } : {};
  const run = w.P.ver ? get(w.P.ver) : undefined;
  if (!run || run.runner !== me.runner) return { p: w.P, ver: w.P.ver, frontier: [], pages: [], news: false, ok: false, why: "not_runner", ...last };
  const ids = named.map((x) => x.id), pages: string[][] = [];
  const cut = Math.max(0, Math.ceil(ids.length / FRONTIER_MAX) - 1) * FRONTIER_MAX;
  for (let i = 0; i < cut; i += FRONTIER_MAX) pages.push(ids.slice(i, i + FRONTIER_MAX));
  return { p: w.P, ver: w.P.ver, frontier: ids.slice(cut), pages, news: S.some((x) => x.key !== me.key), ok: true, ...last };
}

const HOUR = 3_600_000;
/** whether a way's file uses an hour age (`Nh`) anywhere (pure) */
function hours(x: unknown, depth = 0): boolean {
  if (depth > 600 || !x || typeof x !== "object") return false;
  if (Array.isArray(x)) return x.some((y) => hours(y, depth + 1));
  const o = x as Record<string, unknown>;
  if (typeof o.older === "string" && age(o.older)?.unit === "h") return true;
  return Object.values(o).some((y) => hours(y, depth + 1));
}

/** whether the runner owes a receipt at `now` though nothing new came (rule 7; pure). `last`: the time of the way's
 *  last spine event (none: no spine yet, so the first turn seals the start). True in the first turn after each
 *  midnight of the way's zone, and, when the file uses an hour age anywhere, in the first turn of each hour (hours of
 *  the clock, counted from the epoch: an hour age is a length of time, not a time of day) */
export function sealDue(way: Way, last: number | undefined, now: number): boolean {
  if (last === undefined || !isTime(last)) return true;
  if (dayOf(now, way.zone) > dayOf(last, way.zone)) return true;
  return Math.floor(now / HOUR) > Math.floor(last / HOUR) && hours(way);
}

/** what a turn writes (pure): the drafts `due()` gave on the turn's projection, the first way.fired carrying the
 *  frontier (further firings carry none); or, when nothing fires, the receipt (way.seen) carrying it, written only
 *  when the turn's event would order an ordinary event of another key (`news`) or sealDue says so: two keys that both
 *  run a way do not answer each other's receipts for ever. The turn's pages (way.seen, `more: true`) go before
 *  everything else it writes, so a draft's index in what comes out is not its index in what went in: `cause` and
 *  `checks` are moved here; an act's `after` is not this function's to move (sealedDue does). Nothing when the turn
 *  may not write. How often a turn runs is the loop's (step 4b) */
export function sealed(t: Turn, drafts: readonly Draft[], way: Way, now: number): Draft[] {
  if (!t.ok) return [];
  const first = drafts.findIndex((d) => d.kind === "way.fired");
  if (first < 0 && !t.news && !sealDue(way, t.last, now)) return [...drafts];
  const seen = (base: readonly string[], more: boolean): Draft => ({ kind: "way.seen", item: way.id, value: { way: way.id, ver: t.ver, ...(more ? { more: true } : {}) }, at: now, ...(base.length ? { base: [...base] } : {}) });
  // the pages go first, then the receipt when nothing fires: the drafts' indexes into their own list move by as many
  const head = [...t.pages.map((ids) => seen(ids, true)), ...(first < 0 ? [seen(t.frontier, false)] : [])], by = head.length;
  return [...head, ...drafts.map((d, i) => ({
    ...d, ...(i === first && t.frontier.length ? { base: [...t.frontier] } : {}),
    ...(d.cause !== undefined ? { cause: d.cause + by } : {}), ...(d.checks ? { checks: d.checks.map((j) => j + by) } : {}),
  }))];
}

/** a turn's drafts and its acts together (pure): what sealed() writes, and each act's `after` (the index of the draft
 *  it follows, in the drafts handed in: its move, or the way.fired when the trigger's `do` is the act) moved by as
 *  many as sealed() put first, so it names that same draft in what is written. The runner's loop calls this one, and it is the only one of the two fold.ts hands out: an act's answer
 *  whose `because` is read from the unmoved index names a page or a check, and is refused (`not_caused`) */
export function sealedDue<A extends { after: number }>(t: Turn, d: { drafts: readonly Draft[]; acts: readonly A[] }, way: Way, now: number): { drafts: Draft[]; acts: A[] } {
  const drafts = sealed(t, d.drafts, way, now), by = drafts.length - d.drafts.length;
  return { drafts, acts: t.ok ? d.acts.map((a) => ({ ...a, after: a.after + by })) : [] };
}
