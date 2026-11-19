// What this Sol runs (#417, part of #413): the release it sits on plus its own layer, for example "release
// stable-20261030-0900 + 12 of mine" or "main 0c02970c, 3 behind". Read from git with a handful of cheap calls (no
// fetch: the refs are as fresh as the last update or fetch), in the background after start, kept, and read again after
// an update run and every ten minutes. Said in /health, on the relay's hello and presence, and to the faces (team.state).
//
// The base is whichever of stable, dev and main (origin's first, then the local branch) has the fewest of HEAD's commits
// outside it; a tie goes to stable, then dev. On main that is main itself (none of mine); on a */mine branch rebased onto
// stable or dev (#529: a dev-channel Sol) it is that branch, and its commits over it are mine. The release is a release
// tag on the base's commit (stable-*, dev-*, beta-*, release-*, and the beta pass's v1, v2… #1300), picked by releaseTag as ship.ts picks the offer's, or, in a tester's clone of the beta repo, the "Sol stable-..." its main's
// export commit says; else the branch's own name.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SolVersion } from "./hub/index.js";

export type { SolVersion };
const run = promisify(execFile);
const BASES = ["refs/remotes/origin/stable", "refs/heads/stable", "refs/remotes/origin/dev", "refs/heads/dev", "refs/remotes/origin/main", "refs/heads/main"];
const TAG = /^(?:(stable|dev|beta|release)-[\w.-]+|v[1-9]\d*)$/;

type Git = (args: string[]) => Promise<string>;
/** of the release tags on one commit, the one it is (#529, shared with ship.ts askOrigin so the offer and Settings
 * name the same release): any dev-* before any other, then the newest by the date in the name (dev-YYYYMMDD-HHMM
 * after dev-YYYYMMDD), then by name; none: "". A beta release's number (v1, v2…, #1300) sits on a dev-* commit and
 * never stands for it: it comes after the dated names, and of two the higher number (productTag says it) */
export function releaseTag(tags: string[]): string {
  const when = (t: string) => { const m = /(\d{8})(?:-(\d{4}))?/.exec(t); return m ? m[1] + (m[2] ?? "0000") : ""; };
  const num = (t: string) => Number(PRODUCT_TAG.exec(t)?.[1] ?? 0);
  const rank = (a: string, b: string) => (Number(a.startsWith("dev-")) - Number(b.startsWith("dev-"))) || (Number(!num(a)) - Number(!num(b)))
    || num(a) - num(b) || when(a).localeCompare(when(b)) || a.localeCompare(b);
  return [...new Set(tags)].sort(rank).at(-1) ?? "";
}

/** a beta release's number (#1300): v1, v2… on the same commit as the dev-* tag the beta pass moved stable to */
export const PRODUCT_TAG = /^v([1-9]\d*)$/;
/** the number a commit carries among its tags, the highest when it has two (pure); none: "" */
export const productTag = (tags: string[]) => tags.filter((t) => PRODUCT_TAG.test(t)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).at(-1) ?? "";
/** the next number after the ones there are (pure): v1 when there is none */
export const nextProduct = (tags: string[]) => `v${Number(productTag(tags).slice(1) || 0) + 1}`;

const gitIn = (cwd: string): Git => (args) => run("git", args, { cwd, timeout: 5000 }).then((r) => r.stdout.trim());

/** the version of the checkout at `cwd`, or null when it is not a git checkout or has neither stable nor main */
export async function computeVersion(cwd: string, git: Git = gitIn(cwd)): Promise<SolVersion | null> {
  const head = await git(["rev-parse", "--verify", "-q", "HEAD"]).catch(() => "");
  if (!head) return null;
  let best: { ref: string; ahead: number } | null = null;
  for (const ref of BASES) {
    if (!(await git(["rev-parse", "--verify", "-q", ref]).catch(() => ""))) continue;
    const ahead = Number(await git(["rev-list", "--count", `${ref}..HEAD`]).catch(() => "NaN"));
    if (Number.isFinite(ahead) && (!best || ahead < best.ahead)) best = { ref, ahead };
  }
  if (!best) return null;
  const at = await git(["merge-base", "HEAD", best.ref]).catch(() => "");
  if (!at) return null;
  const behind = Number(await git(["rev-list", "--count", `HEAD..${best.ref}`]).catch(() => "0")) || 0;
  const tags = (await git(["tag", "--points-at", at]).catch(() => "")).split("\n").map((t) => t.trim()).filter((t) => TAG.test(t));
  let release = releaseTag(tags);
  if (!release) {
    const subject = await git(["log", "-1", "--format=%s", at]).catch(() => "");
    const m = /^Sol ((?:stable|dev|beta)-[\w.-]+)/.exec(subject);
    release = m && TAG.test(m[1]) ? m[1] : best.ref.split("/").pop()!;
  }
  return { release: release.slice(0, 60), commit: at.slice(0, 8), ...(behind > 0 ? { behind } : {}), ...(best.ahead > 0 ? { mine: best.ahead } : {}) };
}

/** the words for a version (pure): "release stable-20261030-0900 + 12 of mine", "main 0c02970c, 3 behind"; none: "unknown" */
export function versionLine(v: SolVersion | null | undefined): string {
  if (!v) return "unknown";
  const base = TAG.test(v.release) ? `release ${v.release}` : `${v.release} ${v.commit}`;
  return `${base}${v.mine ? ` + ${v.mine} of mine` : ""}${v.behind ? `, ${v.behind} behind` : ""}`;
}

// ---- the engine's one ----
let now: SolVersion | null = null;
let dir = "";
let reading: Promise<void> | null = null;
const heard = new Set<(v: SolVersion | null) => void>();
export const versionNow = () => now;
/** told each time the version read differs from the last (the relay's presence, the faces) */
export const onVersion = (fn: (v: SolVersion | null) => void) => { heard.add(fn); return () => heard.delete(fn); };

/** read it again now (after an update run); a read already going is joined, never doubled */
export function refreshVersion(): Promise<void> {
  if (!dir) return Promise.resolve();
  reading ??= computeVersion(dir).catch(() => null).then((v) => {
    const changed = JSON.stringify(v) !== JSON.stringify(now);
    now = v;
    if (changed) for (const fn of heard) { try { fn(v); } catch { /* a listener's own trouble */ } }
  }).finally(() => { reading = null; });
  return reading;
}

/** start reading the checkout this engine runs from: never blocks the start, then every ten minutes */
export function watchVersion(engineDir: string, every = 10 * 60_000) {
  if (dir) return;
  dir = engineDir;
  setTimeout(() => void refreshVersion(), 0).unref?.();
  setInterval(() => void refreshVersion(), every).unref();
}
