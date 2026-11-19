// Cowork v3, slice 8 (fr-30, #561): the switch, the import and the sync timer, as the engine wires them. wire.ts and
// the agent's tool (work/tools.ts) load this file only with the switch on (settings.ts coworkV3), so with it off nothing
// here is loaded, no timer runs and no trail is opened (F7).
//   team.v3.migrate.dry {}        → { report, line }   what the import would write, per group; nothing written
//   team.v3.migrate.run {}        → { report, line }   the import: signed "imported" events; the old record untouched
//   team.v3.on { project? }       → { on, projects }   whether v3 is on, per project (env, then the project's layers)
// The switch per project: SOL_COWORK_V3=on turns it on for every project, =off for none; else my setting cowork.v3 must
// be on (it loads v3 at all), and then a project is on when its record's settings say `cowork.v3` (me, then the
// project, then the team layer: settingOf), off by default. The import turns it on at the project layer for SOL's
// project only.
// The sync: while the switch is on, every minute each cloud project's waiting events are pushed and what the cloud kept
// since the cursor pulled (sync.ts); with the switch off a tick does nothing at all.
import { coworkV3, coworkV3Env } from "../../settings.js";
import { getTeam, type Room } from "../settings.js";
import { hubHttp, hubTicket } from "../relay.js";
import { v3 } from "./index.js";
import { fold, settingOf } from "./record.js";
import { Sync, httpCloud, type Cloud } from "./sync.js";
import { PROJECT, type Trail } from "./trail.js";
import { dryRun, runImport, reportText, cardLine, SWITCH_KEY, type Report, type Source } from "./migrate.js";
import { todaySource, groupsOf, projectOf } from "./today.js";

/** whether Cowork v3 is on for one project, for one person (env first, then my switch, then the record's layers) */
export function v3OnFor(trail: Trail, project: string, login: string, sw: { env: "on" | "off" | ""; mine: boolean } = { env: coworkV3Env(), mine: coworkV3() }): boolean {
  if (sw.env) return sw.env === "on";
  if (!sw.mine) return false;
  return settingOf(fold(trail.check(project).ok), SWITCH_KEY, login) === true;
}

let source: () => Source = () => todaySource({ me: () => getTeam().me.login });
/** tests: another source of today's record */
export const _setSource = (f: (() => Source) | null) => { source = f ?? (() => todaySource({ me: () => getTeam().me.login })); };

let busy: Promise<Report> | null = null;
/** the dry run, or the import (one at a time: a second press waits for the first and reads what it wrote) */
export async function migrate(run: boolean, me: string): Promise<Report> {
  if (!coworkV3()) return { groups: [], total: 0, run, error: "Cowork v3 is off: turn it on in Settings first" };
  if (run && !me) return { groups: [], total: 0, run, error: "sign in to GitHub first: every imported event is signed as you" };
  while (busy) await busy.catch(() => null);
  const { trail, keys } = v3();
  const p = run ? runImport(trail, source(), { person: me, machine: keys.machineName }) : dryRun(trail, source());
  busy = p;
  try { return await p; } finally { busy = null; }
}

/** one team.v3.migrate.* or team.v3.on message answered */
export async function answerSwitch(m: Record<string, unknown>, me: string): Promise<Record<string, unknown>> {
  startV3Sync();
  const out = { type: String(m.type), ...(m.rid !== undefined ? { rid: m.rid } : {}) };
  try {
    switch (m.type) {
      case "team.v3.migrate.dry":
      case "team.v3.migrate.run": {
        const report = await migrate(m.type === "team.v3.migrate.run", me);
        return report.error ? { ...out, error: report.error } : { ...out, report, line: cardLine(report) };
      }
      case "team.v3.on": {
        const { trail } = v3();
        const want = typeof m.project === "string" ? m.project : "";
        if (want && !PROJECT.test(want)) return { ...out, error: "which project?" };
        const projects = groupsOf(getTeam().rooms).filter((g) => !want || g.project === want).map((g) => ({ project: g.project, name: g.name, on: v3OnFor(trail, g.project, me) }));
        return { ...out, on: coworkV3(), env: coworkV3Env() || undefined, projects };
      }
      default: return { ...out, error: "no such call" };
    }
  } catch (e) { return { ...out, error: String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200) }; }
}

/** the agent's migrate_v3: the dry run unless run is true */
export async function migrateTool(run: boolean): Promise<string> { return reportText(await migrate(run, getTeam().me.login)); }

// ---- the sync timer ----
const EVERY = () => Math.max(1000, Number(process.env.SOL_COWORK_V3_SYNC_MS) || 60_000);
let timer: NodeJS.Timeout | null = null;
let ticking = false;
/** the cloud a room's trail syncs with, or null (not a cloud room, no ticket yet) */
export type CloudOf = (room: Room) => Cloud | null;
const cloudOfRoom: CloudOf = (room) => {
  const http = room.hub ? hubHttp(room.hub) : "";
  if (!http || !room.code) return null;
  let base = "";
  try { base = new URL(http).origin; } catch { return null; }
  return httpCloud({ base, ticket: () => hubTicket(http).catch(() => "") });
};
let cloudOf: CloudOf = cloudOfRoom;
const syncs = new Map<string, Sync>();
/** who hears that a pull brought events (the ways' runner loop, #987): each once, never throwing into the tick */
const pulled = new Set<() => void>();
export const onPulled = (f: () => void): void => { pulled.add(f); };
export type Tick = { project: string; sent: number; added: number; away?: string }[];

/** one round: with the switch off, nothing; else each cloud room's project pushed, then pulled */
export async function syncTick(): Promise<Tick> {
  if (!coworkV3() || ticking) return [];
  ticking = true;
  const done: Tick = [];
  try {
    const { trail } = v3();
    for (const room of getTeam().rooms) {
      const project = projectOf(room);
      if (project !== room.code) continue;   // the cloud's trail is a room's code
      const cloud = cloudOf(room);
      if (!cloud) continue;
      let s = syncs.get(project);
      if (!s) { s = new Sync(trail, cloud); syncs.set(project, s); }
      const r = await s.run(project);
      done.push({ project, sent: r.push.sent, added: r.pull.added.length, ...(r.push.away || r.pull.away ? { away: r.push.away || r.pull.away } : {}) });
    }
  } catch { /* a tick never throws: the events wait for the next */ }
  finally { ticking = false; }
  if (done.some((x) => x.added > 0)) for (const f of pulled) { try { f(); } catch { /* a listener never breaks the sync */ } }
  return done;
}
/** the timer, started once (by the first v3 message, or at start with the switch on); a tick checks the switch itself */
export function startV3Sync(o: { cloudOf?: CloudOf } = {}): void {
  if (o.cloudOf) { cloudOf = o.cloudOf; syncs.clear(); }
  if (timer) return;
  timer = setInterval(() => { void syncTick(); }, EVERY());
  timer.unref();
}
export function stopV3Sync(): void { if (timer) clearInterval(timer); timer = null; syncs.clear(); cloudOf = cloudOfRoom; }
/** whether the timer runs (/health and the tests) */
export const syncRunning = () => !!timer;
