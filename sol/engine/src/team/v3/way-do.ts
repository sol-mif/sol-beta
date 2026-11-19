// Cowork ways, a person's agent presses the moves its person set to "do" (#1309, part of #1219;
// docs/cowork-ways-2026-11-10/AGENT-PRESS.md section 10, step 4): no AI, the engine presses, signed with the agent's key
// (`agent:<me>` on the trail, so only a role naming my agent lets it). Loaded only behind the ways' switch (way-wire.ts).
//   where          the person's own machine for the project: the one their "which of my machines answers for me" setting
//                  names (floor.ts setAnswers, a me-layer event signed by them). Not named, nothing runs: every machine
//                  reads an unset one as itself, so two would press. The trail does not yet set aside a press by another
//                  machine's agent key (section 2, 1b: a format change); this keeps one machine pressing, nothing more
//   the setting    on this machine only (`<state>/cowork-v3/way-do.json`), per project (and the login that set it),
//                  per way: off by default, and each move (`<kind>/<move>`) put in "do" one at a time. Only a move with a condition (`when`) that sets no value and
//                  starts no thing: one without a condition would be pressed the moment it opened. Never a change of
//                  version (agreeing, applying, reverting stays a person's own press). The version it was set on is
//                  kept: a change of version pauses the way until the person sets it on again (one person alone can
//                  change where a move goes). Setting a move does not lift that pause; a revert to the version it was set on does
//   what it reads  only what the way's runner has ordered (spine.ts: the open tail is not folded without a clock), and a
//                  thing with an event in the open tail waits for the next pass. The press carries that version
//                  (`ver`): a newer version still in the tail answers it `old_version`
//   a press        judged first, nothing written (way-writer.ts press, write "none"); written only when it passes again
//                  (write "ok"): a refusal on the trail is permanent and reaches every teammate. A rule that asks a
//                  seam is never answered here (no plugin runs yet, and another's `way.checked` is never taken as
//                  mine), so such a move is refused before anything is written. A trial refused on a state is not
//                  tried again on that same state within the hour (a condition of time can come true meanwhile)
//   whose things   by default only those I or my agent started; `all` on a move takes my teammates' too
//   the limits     per way per day in the way's zone: presses, those that cannot be taken back, one press a thing a day
//                  and three refusals in a row stop the way for the day. Each has a default the person may
//                  change (section 4, point 7)
//   what is kept   each press, refused or not, with the acts its move owes (said, never run: nothing runs a seam's act
//                  yet), on this machine (`way-do-log.json`), for the screen's "done for you" and "waits on you"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { dayOf } from "../../way/clock.js";
import { place } from "../../way/fold.js";
import { rolesOf } from "../../way/moves.js";
import { ID, fromList, isObj, lifeOf, own, personOf, type Move, type Way, type WayEvent } from "../../way/types.js";
import { LOGIN } from "./keys.js";
import { projectFor } from "./project-id.js";
import { PROJECT } from "./trail.js";
import { readCached, rowsOf } from "./way-reader.js";
import { UNDO, fold as foldRecord } from "./record.js";
import { filesOf, press, type WaySol } from "./way-writer.js";

/** the agent key the engine presses with: Sol's own under my login (pair.ts PAIR_AGENTS) */
export const DO_AGENT = "sol";

export type Limits = { perWay: number; backless: number; perThing: number; refusals: number };
/** section 4, point 7 */
export const LIMITS: Limits = { perWay: 20, backless: 5, perThing: 1, refusals: 3 };
export type DoMove = { scope: "mine" | "all"; since: number };
export type DoWay = { on: boolean; ver: string; since: number; moves: Record<string, DoMove> };
/** a project's setting, the login it was set by (another login signed in on this machine presses nothing of it), each
 *  way's moves keyed `<kind>/<move>` (a move id is one kind's life's: two kinds may each have one of that id) */
export type DoProject = { login: string; ways: Record<string, DoWay> };
export type DoSettings = { projects: Record<string, DoProject>; limits?: Partial<Limits> };
export const keyOf = (kind: string, move: string): string => `${kind}/${move}`;
/** one press the engine made, or tried and was refused at the write */
export type DoEntry = {
  at: number; day: number; project: string; way: string; thing: string; move: string; ok: boolean; why: string;
  back: boolean; written: number; acts: { seam: string; thing: string; because: string }[];
};
/** what one pass says of one way: pressed, or why nothing was */
export type DoPassed = { way: string; why?: string; pressed: DoEntry[] };

/** how many presses the log keeps */
export const LOG_MAX = 500;

/** the setting and the log on disk: plain files of this machine, never on the trail */
export class DoStore {
  constructor(private dir: string) {}
  private read<T>(name: string, empty: T): T {
    const f = join(this.dir, name);
    if (!existsSync(f)) return empty;
    try { return JSON.parse(readFileSync(f, "utf8")) as T; } catch { return empty; }
  }
  private write(name: string, x: unknown): void {
    const f = join(this.dir, name);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(`${f}.tmp`, JSON.stringify(x, null, 1) + "\n", { mode: 0o600 });
    renameSync(`${f}.tmp`, f);
  }
  settings(): DoSettings { const s = this.read<DoSettings>("way-do.json", { projects: {} }); return isObj(s.projects) ? s : { projects: {} }; }
  save(s: DoSettings): void { this.write("way-do.json", s); }
  log(): DoEntry[] { const l = this.read<DoEntry[]>("way-do-log.json", []); return Array.isArray(l) ? l : []; }
  add(e: DoEntry[]): void { if (e.length) this.write("way-do-log.json", [...this.log(), ...e].slice(-LOG_MAX)); }
  limits(): Limits { return { ...LIMITS, ...pickLimits(this.settings().limits) }; }
}
const pickLimits = (x: unknown): Partial<Limits> => {
  if (!isObj(x)) return {};
  const out: Partial<Limits> = {};
  for (const k of Object.keys(LIMITS) as (keyof Limits)[]) {
    const n = x[k];
    if (typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 1000) out[k] = n;
  }
  return out;
};

/** why a move cannot be put in "do", or "" (pure): it needs a condition, sets no value, starts no thing, and a role of
 *  it names my agent */
export function doable(way: Way, m: Move, me: string): string {
  if (m.from === null) return "starts_a_thing";
  if (m.set?.length) return "sets_values";
  if (!m.when) return "no_condition";
  const agents = rolesOf(way, `agent:${me}`);
  if (!m.by.some((b) => agents.includes(b))) return "not_my_agent";
  return "";
}

/** whether a move from a state can be taken back (pure; section 2, the four things): it ends nowhere and enters no
 *  state with an act, it fixes no value and sets none, it starts no thing, no trigger names where it goes or the move,
 *  and from where it goes a move I or my agent may press with no condition comes straight back. Even then a teammate
 *  can later change the way and take the way back out: this is said at the press, not promised */
export function backable(way: Way, kind: string, m: Move, from: string, me: string): boolean {
  const life = lifeOf(way, kind);
  if (!life || m.from === null || m.set?.length || (m.fix && Object.keys(m.fix).length)) return false;
  const to = m.to === "same" ? from : m.to, st = own(life.states, to);
  if (!st || st.end || st.enter) return false;
  const named = (x: unknown): boolean => JSON.stringify(x).includes(JSON.stringify(to)) || JSON.stringify(x).includes(JSON.stringify(m.id));
  if (Object.values(way.triggers).some((t) => named(t))) return false;
  if (to === from) return true;
  if (own(life.states, from)?.enter) return false;   // the way back enters a state with an act: it runs again
  const mine = [...rolesOf(way, `person:${me}`), ...rolesOf(way, `agent:${me}`)];
  return life.moves.some((b) => b.from !== null && fromList(b.from).includes(to) && b.to === from && !b.when && !b.set?.length
    && !(b.fix && Object.keys(b.fix).length) && b.by.some((x) => mine.includes(x)));
}

/** the machine my "answers for me" setting names in a project, or "" when none (reads the trail): my own me-layer
 *  setting, signed by me (never my agent), folded as the record folds it (an undo of mine takes a write back, an erased
 *  one names nothing) */
export function namedMachine(s: Pick<WaySol, "trail">, project: string, me: string): string {
  const lc = me.toLowerCase(), mineOnly = (e: { by: { person: string; agent?: string } }) => e.by.person.toLowerCase() === lc && !e.by.agent;
  const rows = rowsOf(s.trail, projectFor(project)).filter((e) => mineOnly(e) && ((e.kind === "setting" && e.item === `me:${lc}`) || e.kind === UNDO));
  const v = foldRecord(rows).settings.me[lc]?.answers;
  return typeof v === "string" ? v : "";
}

/** the things the way's runner has not ordered an event of yet (an event in the open tail) */
const tailThings = (events: readonly WayEvent[], pending: readonly string[]): Set<string> => {
  const ids = new Set(pending), out = new Set<string>();
  for (const e of events) if (e.id && ids.has(e.id)) { const t = e.value?.thing; out.add(typeof t === "string" ? t : (e.item ?? "").split(".")[0]); }
  return out;
};
/** who started each thing: the signer of its taken way.made */
const makers = (seq: readonly { e: WayEvent; taken: boolean }[]): Map<string, string> => {
  const out = new Map<string, string>();
  for (const x of seq) {
    const t = x.e.value?.thing;
    if (x.taken && x.e.kind === "way.made" && typeof t === "string" && x.e.by && !out.has(t)) out.set(t, x.e.by);
  }
  return out;
};

/** trials refused, by thing and move, with the state they were refused on (in memory: a restart tries each again) */
const refusedAt = new Map<string, string>();

/** one pass over a project: each way set on, each open move in "do" on each thing it may take, pressed when it passes
 *  (reads and writes the trail, reads and writes the store) */
export function doPass(s: WaySol, store: DoStore, project: string, me: string, clock: () => number): DoPassed[] {
  if (!LOGIN.test(me)) return [];
  const id = projectFor(project);
  const set = store.settings().projects[id];
  if (set && set.login !== me) return [];
  const ways = Object.entries(set?.ways ?? {}).filter(([, w]) => w.on && Object.keys(w.moves).length).sort(([a], [b]) => (a < b ? -1 : 1));
  if (!ways.length) return [];
  const named = namedMachine(s, id, me);
  if (named !== s.keys.machineName) return ways.map(([way]) => ({ way, why: named ? "other_machine" : "no_machine_named", pressed: [] }));
  const { r } = readCached(s.trail, id);
  s.files.keep(r.files);
  const files = filesOf(s, r), lim = store.limits(), who = { person: me, agent: DO_AGENT };
  const out: DoPassed[] = [];
  const log = store.log();
  for (const [way, w] of ways) {
    const events = r.ways.get(way);
    if (!events) { out.push({ way, why: "no_events", pressed: [] }); continue; }
    // only what the runner has ordered: no clock, so the open tail is not folded (spine.ts)
    const sealed = place(way, events, files, r.book, { now: NaN }), p = sealed.p;
    if (!p.ver) { out.push({ way, why: "not_applied", pressed: [] }); continue; }
    if (p.ver !== w.ver) { out.push({ way, why: "version_changed", pressed: [] }); continue; }
    const file = files(p.ver);
    if (!file) { out.push({ way, why: "no_file", pressed: [] }); continue; }
    const now = Math.floor(clock()), day = dayOf(now, file.zone);
    const today = log.filter((e) => e.project === id && e.day === day);
    const ofWay = () => today.filter((e) => e.way === way);
    const refusedInARow = () => { let n = 0; for (const e of [...ofWay()].reverse()) { if (e.ok) break; n++; } return n; };
    const waiting = tailThings(events, sealed.pending), madeBy = makers(sealed.seq);
    const pressed: DoEntry[] = [];
    let why: string | undefined;
    for (const t of Object.values(p.things).sort((a, b) => (a.id < b.id ? -1 : 1))) {
      if (t.state === null || waiting.has(t.id)) continue;
      const life = lifeOf(file, t.kind);
      for (const m of life?.moves ?? []) {
        const dm = own(w.moves, keyOf(t.kind, m.id));
        if (!dm || m.from === null || !fromList(m.from).includes(t.state) || doable(file, m, me)) continue;
        if (dm.scope !== "all" && personOf(madeBy.get(t.id) ?? "person:") !== `person:${me}`) continue;
        if (today.filter((e) => e.ok && e.thing === t.id && e.way === way).length >= lim.perThing) continue;
        const done = ofWay().filter((e) => e.ok);
        if (done.length >= lim.perWay) { why = "day_limit"; break; }
        if (refusedInARow() >= lim.refusals) { why = "refused_too_often"; break; }
        const back = backable(file, t.kind, m, t.state, me);
        if (!back && done.filter((e) => !e.back).length >= lim.backless) continue;
        const ask = { thing: t.id, move: m.id, ver: p.ver };
        // a trial refused on this very state is not tried again within the hour (a condition of time can come true)
        const memo = `${id}|${way}|${t.id}|${m.id}`, mark = `${p.ver}|${JSON.stringify([t.state, t.fields, t.fired])}|${Math.floor(now / 3_600_000)}`;
        if (refusedAt.get(memo) === mark) continue;
        if (!press(s, id, way, who, ask, clock, {}, { write: "none" }).ok) { refusedAt.set(memo, mark); continue; }
        refusedAt.delete(memo);
        const x = press(s, id, way, who, ask, clock, {}, { write: "ok" });
        const e: DoEntry = { at: x.at ?? now, day, project: id, way, thing: t.id, move: m.id, ok: x.ok && x.whole, why: x.ok ? (x.whole ? "" : "not_written_whole") : x.why,
          back, written: x.written.length, acts: x.acts.map((a) => ({ seam: a.seam, thing: a.thing, because: a.because })) };
        pressed.push(e); today.push(e); log.push(e);
        store.add([e]);   // kept as soon as written: a throw after it must not lose it from the day's counts
        if (e.ok) break;   // one press a thing a pass: what it wrote waits in the open tail until the runner orders it
      }
      if (why) break;
    }
    out.push({ way, ...(why ? { why } : {}), pressed });
  }
  return out;
}

/** what the person is told when they set a move to "do": whether it can be taken back, and how many things it would
 *  press on now (open and judged to pass), and how many of those a teammate started (section 2, the rules for opening a
 *  step: with scope "mine" those are left out of `now`) */
export type DoSaid = { back: boolean; now: number; theirs: number };

/** the setting changed by the person (pure but for the store and a read of the trail): a way on or off (on takes the
 *  version in force as the one looked at), a move in "do" or out, its scope, the limits. One move at a time */
export function setDo(s: WaySol, store: DoStore, project: string, me: string, a: { way?: string; on?: boolean; kind?: string; move?: string; do?: boolean; scope?: string; limits?: unknown }, now: number): { ok: boolean; why: string; said?: DoSaid } {
  const id = projectFor(project);
  if (!PROJECT.test(id)) return { ok: false, why: "which_project" };
  const st = store.settings();
  if (a.limits !== undefined) { st.limits = { ...pickLimits(st.limits), ...pickLimits(a.limits) }; store.save(st); return { ok: true, why: "" }; }
  const way = a.way ?? "";
  if (!ID.test(way)) return { ok: false, why: "which_way" };
  const { r } = readCached(s.trail, id);
  s.files.keep(r.files);
  const files = filesOf(s, r), events = r.ways.get(way) ?? [];
  const sealed = place(way, events, files, r.book, { now: NaN }), p = sealed.p, file = p.ver ? files(p.ver) : undefined;
  if (!file) return { ok: false, why: "not_applied" };
  // another login's setting on this machine is not taken over: it is started again for me
  if (st.projects[id] && st.projects[id].login !== me) st.projects[id] = { login: me, ways: {} };
  const proj = (st.projects[id] ??= { login: me, ways: {} });
  const w: DoWay = (proj.ways[way] ??= { on: false, ver: p.ver, since: now, moves: {} });
  if (a.on !== undefined) {
    w.on = a.on === true;
    if (w.on) { w.ver = p.ver; w.since = now; }
  }
  let said: DoSaid | undefined;
  if (a.move !== undefined) {
    const lives = Object.entries(file.life).filter(([k, l]) => (a.kind === undefined || k === a.kind) && l.moves.some((m) => m.id === a.move));
    if (lives.length > 1) return { ok: false, why: "which_kind" };
    const life = lives[0], m = life?.[1].moves.find((x) => x.id === a.move);
    if (!life || !m) return { ok: false, why: "no_such_move" };
    const k = keyOf(life[0], m.id);
    if (a.do === false) delete w.moves[k];
    else {
      const bad = doable(file, m, me);
      if (bad) return { ok: false, why: bad };
      const scope = a.scope === "all" ? "all" : "mine";
      // a way paused by a change of version stays paused: only turning the way on again looks at the new version
      w.moves[k] = { scope, since: now };
      // the things it would press on now: open there, and judged to pass (nothing written)
      const madeBy = makers(sealed.seq), who = { person: me, agent: DO_AGENT };
      const open = Object.values(p.things).filter((t) => t.kind === life[0] && t.state !== null && fromList(m.from).includes(t.state)
        && press(s, id, way, who, { thing: t.id, move: m.id, ver: p.ver }, () => now, {}, { write: "none" }).ok);
      const theirs = open.filter((t) => personOf(madeBy.get(t.id) ?? "person:") !== `person:${me}`).length;
      said = { back: fromList(m.from).every((f) => backable(file, life[0], m, f, me)), now: scope === "all" ? open.length : open.length - theirs, theirs };
    }
  }
  store.save(st);
  return { ok: true, why: "", ...(said ? { said } : {}) };
}

/** what the screen reads: the machine named, this project's setting, the limits, and its presses, the last first */
export function readDo(s: WaySol, store: DoStore, project: string, me: string): Record<string, unknown> {
  const id = projectFor(project), named = namedMachine(s, id, me);
  return {
    machine: { named, here: s.keys.machineName, runs: named === s.keys.machineName },
    ways: store.settings().projects[id]?.login === me ? store.settings().projects[id].ways : {}, limits: store.limits(),
    pressed: store.log().filter((e) => e.project === id).reverse().slice(0, 100),
  };
}
