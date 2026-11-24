// See what's at work (BR1 item 7, mine/look/br1/at-work.html): Pause everything and Go on. The face sends the sessions
// and automations it shows (its scope: everything, or one folder's), so the engine holds exactly what the person saw:
// each session working finishes its step, then waits (work/runs.ts hold), and each automation that was on skips its runs
// (automations.ts set on: false). What was held is kept in SOL_HOME/next/atwork.json, so Go on turns back on only
// those, never an automation the person had paused by hand, and a restart still knows it.
//   next.atwork.get                                  → next.atwork { held, paused } to the asker
//   next.atwork.pause { sessionId }                  one session held; → next.atwork to every window
//   next.atwork.go    { sessionId }                  that session goes on
//   next.atwork.hold  { folder?, sessions?, autos? } everything shown held, kept as `held`; → next.atwork, next.autos
//   next.atwork.go    {}                             what `held` holds goes on, and `held` is gone
// Signed: marcocyl04-ux's agent (builder F), BR1 item 7 (#1615).
import { join } from "node:path";
import { nextDir, readJson, writeJson } from "./file.js";
import * as autos from "./automations.js";

export type Held = { at: number; folder: string | null; sessions: string[]; autos: string[] };
/** a run as the hold sees it (work/runs.ts Run) */
export type Holdable = { id: string; working: boolean; paused: boolean; hold(on: boolean): void };

export const heldFile = (home: string) => join(nextDir(home), "atwork.json");
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x).slice(0, 500) : []);

export function readHeld(home: string): Held | null {
  const h = readJson(heldFile(home)).data.held as Partial<Held> | undefined;
  if (!h || typeof h.at !== "number") return null;
  return { at: h.at, folder: typeof h.folder === "string" ? h.folder : null, sessions: ids(h.sessions), autos: ids(h.autos) };
}

export const atworkMsg = (home: string, runs: Holdable[]) =>
  ({ type: "next.atwork", held: readHeld(home), paused: runs.filter((r) => r.paused).map((r) => r.id) });

/** Pause everything shown: the sessions working among `sessions`, the automations on among `autos`. Joins a hold already
 *  kept (a folder's, then everything's). Nothing to hold: { ok: false } and nothing is written */
export function holdAll(home: string, m: { folder?: unknown; sessions?: unknown; autos?: unknown }, runOf: (id: string) => Holdable | undefined, now = Date.now()):
  { ok: true; held: Held } | { ok: false; why: string } {
  const was = readHeld(home);
  const ses = ids(m.sessions).filter((id) => { const r = runOf(id); return !!r && r.working && !r.paused; });
  const on = new Set(autos.readAutos(home).filter((a) => a.on).map((a) => a.id));
  const aus = ids(m.autos).filter((id) => on.has(id));
  if (!ses.length && !aus.length) return { ok: false, why: "Nothing shown is running or due, so nothing was held." };
  for (const id of ses) runOf(id)!.hold(true);
  for (const id of aus) autos.set(home, { id, on: false });
  const f = typeof m.folder === "string" ? m.folder : null;
  const held: Held = {
    at: was?.at ?? now, folder: !was || was.folder === f ? f : null,   // two folders held: it holds more than one, said as everything's
    sessions: [...new Set([...(was?.sessions ?? []), ...ses])], autos: [...new Set([...(was?.autos ?? []), ...aus])],
  };
  writeJson(heldFile(home), { held });
  return { ok: true, held };
}

/** Go on: every session and automation the hold kept goes on; one removed since is skipped */
export function goAll(home: string, runOf: (id: string) => Holdable | undefined): { sessions: number; autos: number } {
  const h = readHeld(home);
  writeJson(heldFile(home), {});
  if (!h) return { sessions: 0, autos: 0 };
  let s = 0, a = 0;
  for (const id of h.sessions) { const r = runOf(id); if (r?.paused) { r.hold(false); s++; } }
  const there = new Set(autos.readAutos(home).map((x) => x.id));
  for (const id of h.autos) if (there.has(id) && autos.set(home, { id, on: true }).ok) a++;
  return { sessions: s, autos: a };
}
