// Cowork ways, step 4b part 4 (docs/cowork-ways-2026-11-10/reports/step4-plan.md §9.4): the messages, and the runner's
// loop at the engine's start. team/wire.ts hands every team.v3.way.* here, and starts the loop, only with the ways'
// switch on (way-switch.ts: SOL_COWORK_WAYS and Cowork v3 both on); off, this file is never imported, nothing answers,
// no timer runs. Every message but read writes as me, or (preview) holds a worker for up to a minute, so team/wire.ts
// takes it from Sol's own window only (#1074, #1076); the login is the one Sol keeps, exactly (a key signs it in that
// case: another, or one the project's trail spells otherwise, is `login_case`).
//   team.v3.way.read    { project, way? }                    → { ways: [ what this Sol folds of each way ] }
//   team.v3.way.press   { project, way, thing, move, kind?, set?, ver? } → { pressed }   (way-writer.ts press)
//   team.v3.way.propose { project, way, file, map? }         → { versioned }   (the file, then way.proposed)
//   team.v3.way.agree   { project, way, to, role }           → { versioned }
//   team.v3.way.apply   { project, way, to }                 → { versioned }
//   team.v3.way.revert  { project, way, to }                 → { versioned }
//   team.v3.way.preview { project, way, to }                 → { preview }    (a worker of its own, this Sol's clock, one at a time)
//   team.v3.way.do.read { project }                          → { do }         (way-do.ts readDo: my "do" setting, what my agent pressed)
//   team.v3.way.do.set  { project, way?, on?, move?, do?, scope?, limits? } → { set }   (way-do.ts setDo, this machine only)
//   team.v3.way.room.read { project }                        → { room }       (way-room.ts readRoom: my "AI decides" setting, what the room decided)
//   team.v3.way.room.set  { project, terms?, way?, on?, move?, decide?, scope?, limits? } → { set }   (way-room.ts setRoom, this machine only)
// Each answer carries the message's type and rid; a question it cannot take is { error }. The runner's loop says what a
// turn wrote to Sol's faces as team.v3.way.turned { project, turns }, and what my agent pressed of the moves I set to
// "do" (#1309) as team.v3.way.done { project, pressed }; a room woken for the moves I put in "AI decides" (#1311) as
// team.v3.way.room.woke { project, ways }, and what it decided, when it ends, as team.v3.way.room.decided { project, way, decided }.
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { RUNNER_ROLE, heldBy, place } from "../../way/fold.js";
import { rolesOf } from "../../way/moves.js";
import { ID, SKEW, isObj, type Way } from "../../way/types.js";
import { V3_DIR, v3 } from "./index.js";
import { projectFor } from "./project-id.js";
import { PROJECT } from "./trail.js";
import { WayFiles } from "./way-files.js";
import type { PreviewIn, PreviewOut } from "./way-preview.js";
import { WAYFILE, readCached, rowsOf } from "./way-reader.js";
import { teamWaysOn } from "./way-switch.js";
import { WayLoop, changesOf, filesOf, press, version, type Turned, type VersionAsk, type WaySol } from "./way-writer.js";
import { DoStore, doPass, readDo, setDo } from "./way-do.js";
import { RoomStore, readRoom, roomPass, setRoom } from "./way-room.js";

/** what the messages need from the engine: the login Sol keeps (exactly), the clock, this Sol, how a preview runs */
export type WayDeps = { me: () => string; clock?: () => number; sol?: () => WaySol; preview?: (i: PreviewIn) => Promise<PreviewOut>; store?: () => DoStore; room?: () => RoomStore };

let opened: WaySol | null = null;
/** this Sol as the ways read and write it: the trail and keys of Cowork v3, the way files under `<state>/cowork-v3/ways` */
export function waySol(): WaySol {
  if (opened) return opened;
  const { trail, keys } = v3();
  return (opened = { trail, keys, files: new WayFiles(join(V3_DIR, "ways")) });
}
/** my "do" setting and what my agent pressed, on this machine (way-do.ts) */
let doStore: DoStore | null = null;
export const wayDo = (): DoStore => (doStore ??= new DoStore(V3_DIR));
/** my "AI decides" setting and what the room decided, on this machine (way-room.ts) */
let roomStore: RoomStore | null = null;
export const wayRoom = (): RoomStore => (roomStore ??= new RoomStore(V3_DIR));

/** one preview at a time on this Sol: another asked meanwhile is `busy` */
let previewing = false;
/** the longest a preview may run before it is ended */
export const PREVIEW_MS = 60_000;
const WORKER = new URL(import.meta.url.endsWith(".ts") ? "./way-preview-worker.ts" : "./way-preview-worker.js", import.meta.url);
/** a preview in a worker of its own, ended when it answers or after `ms` (`too_long`) */
export function previewOff(i: PreviewIn, ms = PREVIEW_MS): Promise<PreviewOut> {
  return new Promise((done) => {
    const w = new Worker(WORKER, { name: "sol-way-preview", workerData: i });
    let over = false;
    const end = (x: PreviewOut) => { if (over) return; over = true; clearTimeout(t); void w.terminate(); done(x); };
    const t = setTimeout(() => end({ ok: false, why: "too_long" }), ms);
    w.on("message", (x: PreviewOut) => end(x));
    w.on("error", () => end({ ok: false, why: "failed" }));
    w.on("exit", () => end({ ok: false, why: "failed" }));
  });
}

const str = (x: unknown): string => (typeof x === "string" ? x : "");
const names = (x: unknown): string[] | undefined => (Array.isArray(x) && x.every((y) => typeof y === "string") ? (x as string[]) : undefined);

/** how many of a way's changes of version a read hands back, the last ones */
export const CHANGES_SHOWN = 20;
/** what this Sol folds of each way of a project, at its own clock (reads the trail; keeps the way files it carries) */
export function readOf(s: WaySol, project: string, me: string, now: number, only?: string): Record<string, unknown>[] {
  const { r } = readCached(s.trail, projectFor(project));
  s.files.keep(r.files);
  const get = filesOf(s, r);
  const out: Record<string, unknown>[] = [];
  for (const [way, events] of [...r.ways].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (only && way !== only) continue;
    const placed = place(way, events, get, r.book, { now }), p = placed.p;
    const cur: Way | undefined = p.ver ? get(p.ver) : undefined;
    // the proposals made on the version in force, each version once, the last said; `mine`: the roles I may agree in
    // (those I hold in it or in the version in force; `:runner` when it names a machine of mine as runner and I hold none)
    const proposals = new Map<string, Record<string, unknown>>();
    for (const x of placed.seq) {
      const v = x.e.value;
      if (!(x.taken && x.e.kind === "way.proposed" && x.e.item && isObj(v) && v.from === p.ver && x.e.item !== p.ver)) continue;
      const nw = get(x.e.item), roles = [...new Set([...(cur ? rolesOf(cur, `person:${me}`) : []), ...(nw ? rolesOf(nw, `person:${me}`) : [])])].sort();
      if (nw && !roles.length && nw.runner.slice(nw.runner.indexOf("@") + 1) === me) roles.push(RUNNER_ROLE);
      proposals.set(x.e.item, { ver: x.e.item, by: x.e.by, at: x.at, slots: v.slots, ...(v.map ? { map: v.map } : {}), file: nw ?? null, mine: roles });
    }
    out.push({
      way, ver: p.ver, head: p.head, vers: p.vers, file: cur ?? null, runner: cur?.runner ?? null,
      standing: r.book.roleOf(me, now), mine: cur ? heldBy(cur, `person:${me}`, r.book, now) : [],
      things: p.things, agreed: p.agreed, proposals: [...proposals.values()],
      // a firing whose move was never answered (a turn cut short): its move for that tick is not made
      unanswered: Object.entries(p.fires).filter(([, f]) => !f.used && (cur?.triggers[f.trigger]?.do as { move?: string } | undefined)?.move).map(([id, f]) => ({ id, ...f })),
      skipped: p.skipped, waiting: placed.waiting, pending: placed.pending, unread: placed.unread, forked: placed.forked,
      // the changes of version, the last CHANGES_SHOWN, each with what everyone of the way is told (way/notice.ts)
      changes: changesOf(placed, get).slice(-CHANGES_SHOWN),
      runnerAhead: placed.last !== undefined && placed.last > now + SKEW,
    });
  }
  return out;
}

/** one team.v3.way.* message answered, or null with the ways' switch off (then nothing answers) */
export async function answerWay(m: Record<string, unknown>, d: WayDeps): Promise<Record<string, unknown> | null> {
  if (!teamWaysOn()) return null;
  const out = { type: String(m.type), ...(m.rid !== undefined ? { rid: m.rid } : {}) };
  const project = str(m.project), way = str(m.way);
  if (!PROJECT.test(project)) return { ...out, error: "which project?" };
  if (m.type !== "team.v3.way.read" && !String(m.type).startsWith("team.v3.way.do.") && !String(m.type).startsWith("team.v3.way.room.") && !ID.test(way)) return { ...out, error: "which way?" };
  const me = d.me();
  if (!me) return { ...out, error: "sign in to GitHub first: a way's events are signed as you" };
  const s = (d.sol ?? waySol)(), clock = d.clock ?? Date.now;
  const change = (ask: VersionAsk) => ({ ...out, versioned: version(s, project, way, me, ask, clock) });
  try {
    switch (m.type) {
      case "team.v3.way.read": return { ...out, ways: readOf(s, project, me, Math.floor(clock()), way || undefined) };
      case "team.v3.way.do.read": return { ...out, do: readDo(s, (d.store ?? wayDo)(), project, me) };
      case "team.v3.way.do.set": {
        const b = (x: unknown) => (typeof x === "boolean" ? x : undefined);
        return { ...out, set: setDo(s, (d.store ?? wayDo)(), project, me, { ...(way ? { way } : {}), on: b(m.on), ...(typeof m.move === "string" ? { move: m.move } : {}), do: b(m.do),
          ...(typeof m.scope === "string" ? { scope: m.scope } : {}), ...(m.limits !== undefined ? { limits: m.limits } : {}) }, Math.floor(clock())) };
      }
      case "team.v3.way.room.read": return { ...out, room: readRoom(s, (d.room ?? wayRoom)(), project, me) };
      case "team.v3.way.room.set": {
        const b = (x: unknown) => (typeof x === "boolean" ? x : undefined);
        return { ...out, set: setRoom(s, (d.room ?? wayRoom)(), project, me, { terms: b(m.terms), ...(way ? { way } : {}), on: b(m.on), ...(typeof m.kind === "string" ? { kind: m.kind } : {}),
          ...(typeof m.move === "string" ? { move: m.move } : {}), decide: b(m.decide), ...(typeof m.scope === "string" ? { scope: m.scope } : {}), ...(m.limits !== undefined ? { limits: m.limits } : {}) }, Math.floor(clock())) };
      }
      case "team.v3.way.press": {
        const thing = str(m.thing), move = str(m.move);
        if (!thing || !move) return { ...out, error: "which thing, which move?" };
        const ask = { thing, move, ...(typeof m.kind === "string" ? { kind: m.kind } : {}), ...(isObj(m.set) ? { set: m.set } : {}), ...(typeof m.ver === "string" ? { ver: m.ver } : {}) };
        return { ...out, pressed: press(s, project, way, { person: me }, ask, clock) };
      }
      case "team.v3.way.propose":
        if (!isObj(m.file)) return { ...out, error: "which file?" };
        return change({ kind: "propose", file: m.file, ...(names(m.map) ? { map: names(m.map) } : {}) });
      case "team.v3.way.agree":
        if (!str(m.to) || !str(m.role)) return { ...out, error: "which version, which role?" };
        return change({ kind: "agree", to: str(m.to), role: str(m.role) });
      case "team.v3.way.apply": case "team.v3.way.revert":
        if (!str(m.to)) return { ...out, error: "which version?" };
        return change({ kind: m.type === "team.v3.way.apply" ? "apply" : "revert", to: str(m.to) });
      case "team.v3.way.preview": {
        if (!str(m.to)) return { ...out, error: "which version?" };
        if (previewing) return { ...out, preview: { ok: false, why: "busy" } };
        previewing = true;
        try {
          // the rows as stored (one read), the files this Sol holds of this way: the worker checks both (way-preview.ts)
          const rows = rowsOf(s.trail, projectFor(project)), now = Math.floor(clock());
          const held = s.files.vers().flatMap((ver) => { const w = s.files.get(ver); return w && w.id === way ? [{ ver, way: w }] : []; });
          return { ...out, preview: await (d.preview ?? previewOff)({ rows, held, way, to: str(m.to), now, until: now }) };
        } finally { previewing = false; }
      }
      default: return { ...out, error: "no such call" };
    }
  } catch (e) { return { ...out, error: String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200) }; }
}

let loop: WayLoop | null = null;
/** the runner's loop, started once at the engine's start (and when Cowork v3 is turned on), only with the ways' switch
 *  on; a pull that brought events turns it soon (way-writer.ts WayLoop.poke). What a turn wrote is said to Sol's faces */
export function startWays(o: { me: () => string; push: (m: object) => void; clock?: () => number }): WayLoop | null {
  if (!teamWaysOn()) return null;
  if (!loop) {
    loop = new WayLoop({
      sol: waySol(), person: o.me, clock: o.clock ?? Date.now,
      said: (project, x) => {
        if (x instanceof Error) { console.error(`ways, ${project}:`, x.message); return; }
        const turns = x.filter((t) => t.written.length || t.pings.length || t.acts.length);
        if (turns.length) o.push({ type: "team.v3.way.turned", project, turns: turns.map(brief) });
      },
      // a press of this person's answered as of an old version: their faces ask them to press again
      refused: (project, x) => {
        for (const r of x) if (r.error) console.error(`ways, ${project}: an old version's answer not written:`, r.error);
        const said = x.filter((r) => r.refused.length);   // nothing written, nothing to tell (grade20 F6)
        if (said.length) o.push({ type: "team.v3.way.refused", project, refused: said.map((r) => ({ way: r.way, because: r.refused, whole: r.whole })) });
      },
      after: (project, person) => {
        told(waySol(), project, o.push, o.clock ?? Date.now);
        // the moves I set to "do", pressed by my agent on the machine I named (#1309)
        const done = doPass(waySol(), wayDo(), project, person, o.clock ?? Date.now).filter((x) => x.pressed.length);
        if (done.length) o.push({ type: "team.v3.way.done", project, pressed: done });
        // the moves I put in "AI decides", a room of my own AI's on the same machine (#1311)
        const woke = roomPass(waySol(), wayRoom(), project, person, o.clock ?? Date.now, undefined,
          (way, decided) => o.push({ type: "team.v3.way.room.decided", project, way, decided })).filter((x) => x.session);
        if (woke.length) o.push({ type: "team.v3.way.room.woke", project, ways: woke });
      },
    });
  }
  loop.start();
  return loop;
}
/** the changes of version each project's faces were told of, by event id; the first look at a project tells nothing (a
 *  start does not tell again what a read already shows), only what the fold takes after it */
const toldOf = new WeakMap<object, Map<string, Set<string>>>();
/** every change of version the fold took since the last look, told to Sol's faces (`team.v3.way.changed`): to everyone
 *  of the way (FORMAT §3, the cost of rule B), its `notice` naming the roles and people, the parts, and the moves in
 *  words. Reads the trail (the kept read: way-reader.ts readCached) */
export function told(s: WaySol, project: string, push: (m: object) => void, clock: () => number): void {
  const id = projectFor(project);
  // a project that carries no way file has no change to tell: not read (grade20 F2)
  if (!s.trail.raw.prepare("SELECT 1 FROM event WHERE project = ? AND kind = ? LIMIT 1").get(id, WAYFILE)) return;
  const { r } = readCached(s.trail, id), now = Math.floor(clock());
  s.files.keep(r.files);
  const get = filesOf(s, r);
  let m = toldOf.get(s.trail);
  if (!m) toldOf.set(s.trail, (m = new Map()));
  const first = !m.has(project), seen = m.get(project) ?? new Set<string>();
  m.set(project, seen);
  for (const way of [...r.ways.keys()].sort()) {
    for (const c of changesOf(place(way, r.ways.get(way)!, get, r.book, { now }), get)) {
      if (seen.has(c.id) || !c.ordered) continue;   // one in the open tail may still be set aside: told once ordered (grade20 F3)
      seen.add(c.id);
      if (!first) push({ type: "team.v3.way.changed", project, way, change: c });
    }
  }
}
/** a pull brought events: the loop turns soon (nothing when it was never started) */
export const pokeWays = (): void => loop?.poke();
/** what a face is told of one way's turn */
const brief = (t: Turned) => ({ way: t.way, ok: t.ok, ...(t.why ? { why: t.why } : {}), at: t.at, written: t.written.length, whole: t.whole, pings: t.pings, acts: t.acts.map((a) => ({ seam: a.seam, thing: a.thing, because: a.because })) });
