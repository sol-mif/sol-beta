// Going back over conversion steps (#426, B3 of #413). Decided on #413: a release from before a step cannot read what
// the step wrote, so going back to it puts back the copy taken before that step (run.ts takeBackup), and whatever was
// saved in those files since is lost. Sol says so first, in plain words (pin.ts), and only then does it.
//
//   planBack   what going back to data-version `to` would put back: for each step past `to`, newest first, the copy
//              taken before it (when, which files). Reads only.
//   backTo     does it: the files as they are now are copied first (`convert-backup/back-<stamp>/`, a manifest of the
//              same shape, so they can be put back), then each step's copy is put back, newest step first, so a file
//              two steps touched ends as it was before the earlier one; then data-version says `to`. Anything that
//              fails puts the files as they were (that first copy) and the version back, and says why: never half-moved.
//   undoBack   the files as they were before backTo, from that first copy (pin.ts, when the code could not move after).
//
// A step that touched nothing left no copy (0001, or 0002 on a team.json without `night`): there is nothing of it to put
// back, and the plan says so. A step whose copy should be there and is not cannot be gone back over: refused.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BACKUP_DIR, readVersion, writeVersion, type Ctx, type Manifest } from "./run.js";

export type BackStep = { id: number; step: string; at: string | null; files: { path: string; existed: boolean }[] };
export type BackPlan = { from: number; to: number; steps: BackStep[]; error?: string };

const four = (n: number) => String(n).padStart(4, "0");
function manifestOf(dotSol: string, id: number): Manifest | null {
  const f = join(dotSol, BACKUP_DIR, four(id), "manifest.json");
  try { return JSON.parse(readFileSync(f, "utf8")) as Manifest; } catch { return null; }
}

/** what going back to data-version `to` puts back; `touched(id)` says whether step `id` copies anything on this home
 *  (a step with nothing to copy leaves no copy, and that is no gap). Never throws: trouble is `error` */
export function planBack(c: Ctx, to: number, touched: (id: number) => boolean = () => false): BackPlan {
  let from = 0;
  try { from = readVersion(c.dotSol); } catch (e) { return { from: 0, to, steps: [], error: String((e as Error).message) }; }
  const plan: BackPlan = { from, to, steps: [] };
  for (let id = from; id > to; id--) {
    const m = manifestOf(c.dotSol, id);
    if (!m) {
      // no copy: the step had nothing to copy then, or the copy is gone. With files the step would touch now, a copy
      // should have been taken, so it is gone (older than thirty days and past the last few): refused
      if (touched(id)) return { ...plan, error: `the copy taken before step ${four(id)} is not kept any more, so this Sol cannot go back over it` };
      plan.steps.push({ id, step: four(id), at: null, files: [] });
      continue;
    }
    plan.steps.push({ id, step: m.step, at: m.at, files: m.files.map((f) => ({ path: f.path, existed: f.existed })) });
  }
  return plan;
}

/** every file the plan puts back, once each, with the earliest copy's moment: "changes since <at> are lost" */
export function lostOf(p: BackPlan): { path: string; since: string | null }[] {
  const out = new Map<string, string | null>();
  for (const s of p.steps) for (const f of s.files) out.set(f.path, s.at);   // newest first, so the last write is the earliest copy
  return [...out.entries()].map(([path, since]) => ({ path, since }));
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");

/** the copy of how things are now, before backTo changes anything; its folder, for undoBack */
function keepNow(c: Ctx, p: BackPlan): string {
  const dir = join(c.dotSol, BACKUP_DIR, `back-${stamp()}-${process.pid}`);
  mkdirSync(join(dir, "files"), { recursive: true });
  const m: Manifest & { version: number } = { step: `back-to-${four(p.to)}`, at: new Date().toISOString(), version: p.from, files: [] };
  lostOf(p).forEach(({ path }, i) => {
    const copy = join(dir, "files", String(i));
    const existed = existsSync(path);
    if (existed) cpSync(path, copy, { recursive: true });
    m.files.push({ path, existed, copy });
  });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
  return dir;
}
function putBack(files: Manifest["files"]) {
  for (const f of files) {
    rmSync(f.path, { recursive: true, force: true });
    if (f.existed) cpSync(f.copy, f.path, { recursive: true });
  }
}

/** the files as they were before backTo, and the version they had (from the copy backTo took first) */
export function undoBack(c: Ctx, kept: string): boolean {
  try {
    const m = JSON.parse(readFileSync(join(kept, "manifest.json"), "utf8")) as Manifest & { version: number };
    putBack(m.files);
    writeVersion(c.dotSol, m.version);
    return true;
  } catch { return false; }
}

/** go back to data-version `to`: the plan's copies put back, newest step first. Never half-done: a failure puts
 *  everything as it was. `kept` is the copy of before, for undoBack */
export function backTo(c: Ctx, p: BackPlan): { ok: true; kept: string } | { ok: false; error: string } {
  if (p.error) return { ok: false, error: p.error };
  let now: number;
  try { now = readVersion(c.dotSol); } catch (e) { return { ok: false, error: String((e as Error).message) }; }
  if (now !== p.from) return { ok: false, error: `the saved data moved since the plan (version ${now}, not ${p.from}); look again` };
  if (p.to >= p.from) return { ok: true, kept: "" };   // nothing to go back over
  let kept = "";
  try { kept = keepNow(c, p); } catch (e) { return { ok: false, error: `could not copy the files as they are first: ${String((e as Error).message)}` }; }
  try {
    for (const s of p.steps) {
      const m = manifestOf(c.dotSol, s.id);
      if (!m && s.files.length) throw new Error(`the copy taken before step ${four(s.id)} went missing`);
      if (m) putBack(m.files);
    }
    writeVersion(c.dotSol, p.to);
    return { ok: true, kept };
  } catch (e) {
    undoBack(c, kept);
    return { ok: false, error: String((e as Error).message).split("\n")[0] };
  }
}

/** the newest step a build knows, from the names in its convert folder (`NNNN-name.ts`); none (a build from before
 *  #422) is 0 */
export function latestIn(names: string[]): number {
  let n = 0;
  for (const x of names) { const m = /(?:^|\/)(\d{4})-[a-z0-9-]+\.ts$/.exec(x); if (m) n = Math.max(n, Number(m[1])); }
  return n;
}
