// Cowork v3, slice 6 (fr-30, #559): the face's team.v3.studio.* answered as work.v3.studio.* by rid. wire.ts loads this
// file only with the switch on (settings.ts coworkV3), so with it off nothing here loads and nothing answers (F7).
//   team.v3.studio.list   { project? }                      → { automations, nights, asks, me } | { counts } with no project
//   team.v3.studio.parse  { words }                         → { parsed }   (the flow drawn from words; nothing written)
//   team.v3.studio.make   { project, words? | flow?, name? } → { automation }
//   team.v3.studio.change { project, id, words? | flow? | name? | on? | spend? } → { automation }
//   team.v3.studio.copy   { project, id }                   → { automation }   (my own copy, a night's too)
//   team.v3.studio.run    { project, id, resume? }          → { run }
//   team.v3.studio.yes    { project, ask }                  → { ok }
//   team.v3.studio.log    { project, id }                   → { runs }
import { execFile } from "node:child_process";
import { hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { STATE_DIR } from "../../work/state.js";
import { getTeam, connectedRepos } from "../settings.js";
import { runGh } from "../record.js";
import { rhythmOf, type Rhythm } from "../tonight.js";
import { nightNow } from "../nightfile.js";
import { fromV3, type StudioTrail } from "./studio-trail.js";
import { door } from "./door.js";
import { studioOf, parse, type Automation, type Call, type Studio } from "./studio.js";
import { nights } from "./nights.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");   // src|dist/team/v3 → the checkout
/** how long a script may take when pressed by hand: the morning's gate and first-timer take longest */
const TIMEOUT: Record<Call["script"], number> = { "sol/night": 15 * 60_000, "sol/release": 15 * 60_000, "sol/morning": 75 * 60_000 };

let trail: StudioTrail | null = null;
/** the trail the studio writes to: slice 0's, through door.ts (studio-trail.ts fromV3); a test hands its own */
export const useStudioTrail = (t: StudioTrail) => { trail = t; studio = null; };
let studio: Studio | null = null;

/** today's script, niced, from the checkout this engine runs in; never throws */
export const runScript = (c: Call) => new Promise<{ code: number; out: string }>((ok) =>
  execFile("nice", ["-n", "10", "bash", join(ROOT, ...c.script.split("/")), ...c.args], { cwd: ROOT, timeout: TIMEOUT[c.script], maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
    (err, out, errOut) => ok({ code: err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1) : 0, out: `${String(out ?? "")}\n${String(errOut ?? "")}` })));

/** who connected a place: the last `place` event that says so (slice 4 writes them) */
function placeOwnerOf(t: StudioTrail) {
  return (project: string, place: string): string | null => {
    let who: string | null = null;
    for (const e of t.since(project, 0)) {
      if (e.kind !== "place") continue;
      const v = (e.value ?? {}) as { kind?: string; place?: string; by?: string; revoked?: boolean };
      if ((v.kind ?? v.place ?? e.item) !== place) continue;
      who = v.revoked ? null : String(v.by ?? e.by.person);
    }
    return who;
  };
}

function open(): Studio {
  if (studio) return studio;
  trail ??= fromV3(door());
  studio = studioOf({ trail, placeOwner: placeOwnerOf(trail), script: runScript });
  return studio;
}

export type Env = { me: string; rhythm: (project: string) => Promise<Pick<Rhythm, "release" | "zone" | "dev"> | null>; nightHour: () => number; now: () => Date; projects: () => string[] };
const ghNow = { gh: (a: string[]) => runGh(a), now: () => new Date() };
/** the project's rhythm: of the first of its repositories that has one (SOL's project: sol-dev's .sol/rhythm.json) */
async function rhythmFor(project: string) {
  const room = getTeam().rooms.find((r) => r.id === project);
  if (!room) return null;
  for (const repo of connectedRepos(room)) { const r = await rhythmOf(ghNow, repo).catch(() => null); if (r) return r; }
  return null;
}
const realEnv = (): Env => ({ me: getTeam().me.login || "me", rhythm: rhythmFor, nightHour: () => nightNow().hour, now: () => new Date(), projects: () => getTeam().rooms.map((r) => r.id) });

/** the nights show only in a project whose repository has a rhythm: the dev module, never the default */
async function nightsOf(env: Env, project: string): Promise<Automation[]> {
  const rhythm = await env.rhythm(project);
  return rhythm ? nights({ project, nightHour: env.nightHour(), rhythm, me: env.me, now: env.now() }) : [];
}

export async function handleStudio(m: any, envIn?: Env): Promise<Record<string, unknown>> {
  const env = envIn ?? realEnv();
  const s = open();
  const type = String(m.type).replace(/^team\./, "work.");
  const out = { type, ...(m.rid !== undefined ? { rid: m.rid } : {}) };
  const by = { person: env.me, machine: hostname().split(".")[0].toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40) || "this-mac" };
  const project = typeof m.project === "string" ? m.project : "";
  const shown = (au: Automation) => ({ ...au, spendNow: s.spendOf(project, au), last: s.runs(project, au.id)[0] ?? null, needsYes: s.needsYes(project, au), mine: au.owner.toLowerCase() === env.me.toLowerCase() });
  const find = async (id: string) => s.get(project, id) ?? (await nightsOf(env, project)).find((a) => a.id === id) ?? null;
  try {
    switch (m.type) {
      case "team.v3.studio.parse": return { ...out, parsed: parse(String(m.words ?? "")) };
      case "team.v3.studio.list": {
        if (!project) {
          const counts: Record<string, number> = {};
          for (const p of env.projects()) counts[p] = s.list(p).length + (await nightsOf(env, p)).length;
          return { ...out, counts };
        }
        return { ...out, project, me: env.me, automations: s.list(project).map(shown), nights: (await nightsOf(env, project)).map(shown), asks: s.asksFor(project, env.me) };
      }
      case "team.v3.studio.log": {
        const au = await find(String(m.id ?? ""));
        return au ? { ...out, id: au.id, runs: s.runs(project, au.id) } : { ...out, error: "no such automation" };
      }
    }
    if (!project) return { ...out, error: "which project?" };
    switch (m.type) {
      case "team.v3.studio.make": return { ...out, automation: shown(s.make({ project, by, words: typeof m.words === "string" ? m.words : undefined, flow: m.flow, name: typeof m.name === "string" ? m.name : undefined })) };
      case "team.v3.studio.change": {
        if (String(m.id ?? "").startsWith("night-")) return { ...out, error: "the nights are today's timers and scripts; they change in their own PR, not here. Make your own copy to play with" };
        const r = s.change({ project, id: String(m.id ?? ""), by, words: typeof m.words === "string" ? m.words : undefined, flow: m.flow, name: typeof m.name === "string" ? m.name : undefined, on: typeof m.on === "boolean" ? m.on : undefined, spend: m.spend && typeof m.spend === "object" ? m.spend : undefined });
        return "error" in r ? { ...out, error: r.error } : { ...out, automation: shown(r) };
      }
      case "team.v3.studio.copy": {
        const from = await find(String(m.id ?? ""));
        return from ? { ...out, automation: shown(s.copy({ project, from, by })) } : { ...out, error: "no such automation" };
      }
      case "team.v3.studio.run": {
        const au = await find(String(m.id ?? ""));
        if (!au) return { ...out, error: "no such automation" };
        const r = await s.run({ project, au, by, resume: typeof m.resume === "string" ? m.resume : undefined });
        return "error" in r ? { ...out, error: r.error } : { ...out, run: r, automation: shown(au) };
      }
      case "team.v3.studio.yes": {
        const r = s.yes({ project, ask: String(m.ask ?? ""), by: { person: env.me } });
        return "error" in r ? { ...out, error: r.error } : { ...out, ...r };
      }
      default: return { ...out, error: "no such call" };
    }
  } catch (e) { return { ...out, error: String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200) }; }
}
