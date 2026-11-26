// Conversion steps for saved data (#422, part of #413). When a change to Sol changes the shape of something it keeps on
// disk, it adds one step here, `NNNN-name.ts`, and every Sol runs the steps it has not run yet, in order, at engine
// start, before anything reads saved data (src/convert/start.ts is the engine's first import).
//
// - `<home>/.sol/data-version` holds the number of the last step done; none yet reads as 0 (a fresh home, or a home
//   from before the steps). A home whose number is past the newest step this build knows (a build that went back) is
//   left alone.
// - Before each step, the files it says it touches are copied to `<home>/.sol/convert-backup/<NNNN>/` with a manifest;
//   the last KEEP copies are kept, and every copy younger than thirty days (going back to a release restores them, #426).
// - A step is safe to run twice: the engine can stop between the step and the version written after it.
// - A step that throws has its files put back from that copy, the steps after it do not run, and the engine comes up
//   anyway: /health says so under `data`. Nothing here throws out of runConversions.
// - A step is synchronous (it runs before the engine's other modules load) and has no code at its top level.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

/** where a step finds saved data: the home (SOL_HOME), its `.sol`, and the engine's folder (settings.json, team.json) */
export type Ctx = { home: string; dotSol: string; engine: string };
export type Step = {
  id: number;
  name: string;
  /** the absolute paths (files or folders) the step may change, copied before it runs; none = nothing to copy */
  touches: (c: Ctx) => string[];
  run: (c: Ctx) => void;
};
export type ConvertState = {
  ok: boolean;
  version: number;      // the data's version after this run
  latest: number;       // the newest step this build knows
  ran: string[];        // the steps that ran this time, "0001-baseline"
  ahead?: boolean;      // the data is newer than this build: nothing ran
  skipped?: string;     // why nothing was looked at (no home folder)
  failed?: { step: string; error: string; restored: boolean };
  /** the data was ahead and the keeper had gone back (engine/.went-back): put back to `to` at start (back.ts
   *  backAtStart), `kept` the copy taken first; or why it could not be, and the data stays ahead */
  back?: { from: number; to: number; kept: string } | { from: number; to: number; error: string };
  /** stores under next/ newer than this engine knows: read-only here, and `say` is what Sol tells the person */
  newer?: { stores: string[]; say: string };
  ms: number;
};

export const KEEP = 5;
export const VERSION_FILE = "data-version";
export const BACKUP_DIR = "convert-backup";
export const label = (s: Pick<Step, "id" | "name">) => `${String(s.id).padStart(4, "0")}-${s.name}`;
const said = (e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 300);

/** the data's version: none is 0; anything but a whole number is an error (never guessed) */
export function readVersion(dotSol: string): number {
  const f = join(dotSol, VERSION_FILE);
  if (!existsSync(f)) return 0;
  const t = readFileSync(f, "utf8").trim();
  if (!/^\d+$/.test(t)) throw new Error(`${VERSION_FILE} reads "${t.slice(0, 40)}", not a number`);
  return Number(t);
}
export function writeVersion(dotSol: string, v: number) {
  const f = join(dotSol, VERSION_FILE);
  writeFileSync(f + ".tmp", `${v}\n`);
  renameSync(f + ".tmp", f);
}

export type Manifest = { step: string; at: string; files: { path: string; existed: boolean; copy: string }[] };

/** the files a step touches, copied before it runs. A copy already there for this step (a run stopped before) is
 *  moved aside, never overwritten, and kept with the rest */
function takeBackup(c: Ctx, s: Step): Manifest {
  const touched = s.touches(c);
  const m: Manifest = { step: label(s), at: new Date().toISOString(), files: [] };
  if (!touched.length) return m;   // a step that touches nothing (0001) leaves no copy behind
  const root = join(c.dotSol, BACKUP_DIR);
  const dir = join(root, String(s.id).padStart(4, "0"));
  if (existsSync(dir)) renameSync(dir, `${dir}-${Date.now()}`);
  mkdirSync(join(dir, "files"), { recursive: true });
  touched.forEach((p, i) => {
    if (!isAbsolute(p)) throw new Error(`touches gave a relative path: ${p}`);
    const copy = join(dir, "files", String(i));
    const existed = existsSync(p);
    if (existed) cpSync(p, copy, { recursive: true });
    m.files.push({ path: p, existed, copy });
  });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(m, null, 2) + "\n");   // last: a copy without one is unfinished
  return m;
}
/** a failed step's files put back as they were; false when one could not be */
function restore(m: Manifest): boolean {
  let ok = true;
  for (const f of m.files) {
    try {
      rmSync(f.path, { recursive: true, force: true });
      if (f.existed) cpSync(f.copy, f.path, { recursive: true });
    } catch { ok = false; }
  }
  return ok;
}
/** the last `keep` copies kept, and every copy younger than KEEP_DAYS (going back to a release, #426, restores the copy
 *  taken before each step it crosses, and it reaches back thirty days); the rest, the oldest, gone */
export const KEEP_DAYS = 30;
function prune(dotSol: string, keep: number, now = Date.now()) {
  const root = join(dotSol, BACKUP_DIR);
  if (!existsSync(root)) return;
  const all = readdirSync(root).map((n) => ({ n, t: statSync(join(root, n)).mtimeMs })).sort((a, b) => a.t - b.t || a.n.localeCompare(b.n));
  const young = now - KEEP_DAYS * 86_400_000;
  for (const { n, t } of all.slice(0, Math.max(0, all.length - keep))) if (t < young) rmSync(join(root, n), { recursive: true, force: true });
}

/** the steps in order, each once; what is wrong with the list, or "" */
export function checkSteps(steps: Step[]): string {
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!Number.isInteger(s.id) || s.id < 1) return `step ${label(s)}: its number must be 1 or more`;
    if (i > 0 && s.id <= steps[i - 1].id) return `step ${label(s)} comes after ${label(steps[i - 1])}: out of order`;
  }
  return "";
}

/** the steps this home has not run, in order. Never throws: a failure is in the state it returns */
export function runConversions(c: Ctx, steps: Step[], keep = KEEP): ConvertState {
  const t0 = Date.now();
  const latest = steps.length ? steps[steps.length - 1].id : 0;
  const state: ConvertState = { ok: true, version: 0, latest, ran: [], ms: 0 };
  const fail = (step: string, error: string, restored = true) => { state.ok = false; state.failed = { step, error, restored }; };
  try {
    if (!existsSync(c.home)) { state.skipped = "no home folder"; return state; }
    const bad = checkSteps(steps);
    if (bad) { fail("(the list)", bad); return state; }
    mkdirSync(c.dotSol, { recursive: true });
    try { state.version = readVersion(c.dotSol); } catch (e) { fail(VERSION_FILE, said(e)); return state; }
    if (state.version > latest) { state.ahead = true; return state; }
    for (const s of steps) {
      if (s.id <= state.version) continue;
      let m: Manifest;
      try { m = takeBackup(c, s); } catch (e) { fail(label(s), `the copy before it: ${said(e)}`); break; }   // nothing changed yet
      try {
        const r: unknown = s.run(c);
        if (r && typeof (r as { then?: unknown }).then === "function") throw new Error("a step must be synchronous");
      } catch (e) { fail(label(s), said(e), restore(m)); break; }
      // the step ran; if its number cannot be written it runs again next start, which a step must allow
      try { writeVersion(c.dotSol, s.id); } catch (e) { fail(label(s), `${VERSION_FILE} not written: ${said(e)}`, false); break; }
      state.version = s.id;
      state.ran.push(label(s));
    }
    try { prune(c.dotSol, keep); } catch { /* an old copy left over is no failure */ }
  } catch (e) { fail("(the runner)", said(e), false); }
  finally { state.ms = Date.now() - t0; }
  return state;
}
