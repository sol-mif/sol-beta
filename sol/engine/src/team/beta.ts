// The beta pass (#419, part of #413, team flow v2): `stable` is the beta release, and it moves to whole dev releases
// only. The beta reviewer (the rhythm's `beta`, Frank) passes or holds yesterday's dev release in the review session
// (tonight.ts): one comment on a "Night digest" issue, "**Beta passed**" or "**Beta held**", written by their own
// GitHub login. At the next release hour the release runner on the NucBox (sol/release, after the dev release) reads
// that and, for a pass, moves `stable` to exactly that release's dev-* tag, exports it to sol-beta (ship.ts mirror) and
// tells every Sol on the relay (`stable { sha, tag, by }`, no channel: a beta release, PROTOCOL.md round 67).
// A pass is refused, and `stable` stays where it is, unless all of these hold (passRule):
//   whole     the release is a dev-* tag; never a commit, a branch or a single change
//   signed    the last verdict on that release is a pass, written by a login under `beta`, after the tag was made; or
//             by the beta night's backup (`betaBackup`, #478), from that night's handover hour on. An edited comment
//             signs nothing, whoever wrote it
//   a day     the tag was made on an earlier day (in the rhythm's zone) and at least 20 hours ago: the 9am of the day
//             after, with slack for the timer and for the 23-hour day when the clocks go forward
//   not broke no merged change the release holds wears `broke` (#421, broke.ts brokenIn; GitHub not answering refuses)
//   forward   `stable` as it is now is in the release's history: it only moves forward
// Hold leaves `stable` as it is. Releases build on each other, so the next night's pass carries the held day with it.
// `beta-guard.yml` asks the same questions again of every push to `stable` (checkStable), so a push by any other
// way goes red where everyone sees it. Who may push `stable` at all is the ruleset (#439, F2), not this file.
// GitHub, git, the export and the relay are deps, so the tests fake them.
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { clockIn, handoverOf, backupsOf, edited, REPO, DIGEST_TITLE, type Rhythm } from "./tonight.js";
import { brokenIn } from "./broke.js";
import { DEV_TAG, devTag, fetchAll, firstLine, rev, runnerOf, type ReleaseDeps, type PrComment } from "./release.js";

export type BetaDeps = Pick<ReleaseDeps, "git" | "gh" | "now" | "dryRun" | "say"> & {
  /** the export to sol-beta (ship.ts mirror); absent, nothing is exported */
  mirror?: (sha: string, tag: string) => Promise<{ beta?: string }>;
  /** the word to every Sol on the relay; false when it could not go (each Sol asks GitHub within the hour anyway) */
  tell?: (p: { sha: string; tag: string; by: string }) => boolean | Promise<boolean>;
};
export type Passed =
  | { ok: true; tag: string; sha: string; by: string; already?: true; dry?: true; told?: boolean; beta?: string }
  | { ok: true; nothing: true; held?: string }
  | { ok?: false; error: string };

export type Verdict = { verdict: "pass" | "hold"; release: string; by: string; at: number };
export type DevRelease = { tag: string; sha: string; made: number };

const short = (s: string) => s.slice(0, 7);
const HOUR = 3_600_000;
export const MIN_AGE = 20 * HOUR;
const VERDICT = /^\*\*Beta (passed|held)\*\*: the dev release of (\S+?) /;

// ---- pure ----

/** the dev-* tag a verdict names (pure): the release's day "YYYY-MM-DD" is that day's dev-YYYYMMDD, a tag is itself */
export function tagOf(release: string): string {
  if (DEV_TAG.test(release)) return release;
  return /^\d{4}-\d{2}-\d{2}$/.test(release) ? devTag(release) : "";
}

/** the signed verdicts (pure): each "**Beta passed**" or "**Beta held**" comment written by a login under the rhythm's
 *  `beta`, the last one per release, keyed by its dev-* tag. GitHub says who wrote a comment; the words alone sign nothing */
export function verdictsOf(comments: PrComment[], beta: string[], backup: Backup = NO_BACKUP): Map<string, Verdict> {
  const who = new Set(beta.map((x) => x.toLowerCase()));
  const backs = new Set(backup.who.map((x) => x.toLowerCase()).filter((x) => !who.has(x)));
  const out = new Map<string, Verdict>();
  const sorted = comments
    .map((c) => ({ c, at: Date.parse(String(c.createdAt ?? "")) }))
    .filter((x) => !Number.isNaN(x.at))
    .sort((a, b) => a.at - b.at);
  for (const { c, at } of sorted) {
    const login = String(c.author?.login ?? "");
    // an edited comment signs nothing, the reviewer's too (#478): anyone with write access can edit another's comment,
    // and GitHub keeps the first writer as its author and time
    if (edited(c)) continue;
    if (!login || !(who.has(login.toLowerCase()) || backs.has(login.toLowerCase()))) continue;
    const m = VERDICT.exec(String(c.body ?? "").trimStart());
    const tag = m ? tagOf(m[2]) : "";
    // the backup signs from that night's handover on (#478), as their card opens: one written earlier, by hand on
    // GitHub or any other way, signs nothing
    if (tag && !who.has(login.toLowerCase()) && at < backup.from(tag)) continue;
    if (tag) out.set(tag, { verdict: m![1] === "passed" ? "pass" : "hold", release: m![2], by: login, at });
  }
  return out;
}

/** why a dev release may not go to beta now, or null when it may (pure; the list at the top of this file) */
export function passRule(a: { tag: string; made: number; verdict?: Verdict; broken: { number: number }[]; now: Date; rhythm: Pick<Rhythm, "beta" | "zone"> }): string | null {
  if (!DEV_TAG.test(a.tag)) return `only a whole dev release goes to beta, and ${a.tag || "that"} is not one (a dev-* tag)`;
  const v = a.verdict;
  if (!v || v.at < a.made) return `${a.tag} has no pass from the beta reviewer (${a.rhythm.beta.join(" or ") || "nobody is named"}) written after it was made`;
  if (v.verdict === "hold") return `${a.tag} was held by ${v.by}: it stays off beta`;
  const t = a.now.getTime();
  if (!a.made || clockIn(new Date(a.made), a.rhythm.zone).day >= clockIn(a.now, a.rhythm.zone).day || t - a.made < MIN_AGE) {
    return `${a.tag} is not a day old yet: it goes to beta at the release hour of the day after it was made`;
  }
  if (a.broken.length) return `${a.tag} holds ${a.broken.map((b) => `#${b.number}`).join(", ")}, marked broke: it stays off beta until the label comes off`;
  return null;
}

// ---- reading GitHub and git ----

/** who signs a beta verdict: the beta reviewer, and the beta night's backup (#478), whose card opens at the handover */
export const signersOf = (r: Pick<Rhythm, "beta" | "betaBackup">) => [...r.beta, ...(r.betaBackup ?? [])];
/** the beta night's backup and when each release's night hands over to them (#478): the release of day D is
 *  reviewed on the night of D (tonight.ts betaWindow), so its backup signs from that night's handover hour */
export type Backup = { who: string[]; from: (tag: string) => number };
const NO_BACKUP: Backup = { who: [], from: () => Infinity };
export const backupOf = (r: Rhythm): Backup => ({
  who: backupsOf(r, "beta"),
  from: (tag) => { const m = DEV_TAG.exec(tag); return m ? handoverOf(r, `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`).getTime() : Infinity; },
});

/** the verdicts written on the recent "Night digest" issues (open or closed; each night has its own) */
export async function readVerdicts(d: Pick<BetaDeps, "gh">, repo: string, beta: string[], backup: Backup = NO_BACKUP): Promise<Map<string, Verdict>> {
  const found = JSON.parse(await d.gh(["issue", "list", "--repo", repo, "--state", "all", "--search", `"${DIGEST_TITLE}" in:title`, "--json", "number,title", "--limit", "10"]) || "[]") as { number: number; title?: string }[];
  const comments: PrComment[] = [];
  for (const i of found.filter((x) => String(x.title ?? "").trim() === DIGEST_TITLE)) {
    const v = JSON.parse(await d.gh(["issue", "view", String(i.number), "--repo", repo, "--json", "comments"]) || "{}") as { comments?: PrComment[] };
    comments.push(...(v.comments ?? []));
  }
  return verdictsOf(comments, beta, backup);
}

/** the dev releases as fetched: tag, commit, and when the tag was made (an annotated tag's own date), newest first */
export async function devReleases(d: Pick<BetaDeps, "git">): Promise<DevRelease[]> {
  const r = await d.git(["for-each-ref", "--sort=-creatordate", "--format=%(refname:short)%09%(*objectname)%09%(objectname)%09%(creatordate:unix)", "refs/tags/dev-*"]);
  if (r.code !== 0) return [];
  return r.out.split("\n").map((l) => l.trim().split("\t")).filter((x) => x.length === 4 && DEV_TAG.test(x[0]))
    .map(([tag, peeled, obj, at]) => ({ tag, sha: peeled || obj, made: Number(at) * 1000 || 0 }));
}

const ancestor = async (d: Pick<BetaDeps, "git">, a: string, b: string) => (await d.git(["merge-base", "--is-ancestor", a, b])).code === 0;

/** brokenIn, with a GitHub that does not answer counted as broken: a pass is refused, never let through by a hiccup */
async function broken(d: Pick<BetaDeps, "gh">, repo: string, tag: string): Promise<{ number: number }[] | string> {
  try { return await brokenIn(d, repo, tag); } catch (e) { return `GitHub did not say which changes are marked broke (${firstLine(String((e as Error)?.message ?? e))}), so nothing goes to beta`; }
}

// ---- the pass ----

/** the beta pass: `tag` (or, without one, the newest dev release whose last signed verdict is a pass) to `stable`,
 *  then the export and the word. Refused as the top of this file says; a hold, or nothing passed, leaves it as it is */
export async function passBeta(d: BetaDeps, o: { repo: string; rhythm: Rhythm; tag?: string }): Promise<Passed> {
  if (!REPO.test(o.repo)) return { error: `not a repository: ${o.repo}` };
  if (!o.rhythm.beta.length) return { error: "the rhythm names no beta reviewer, so nothing can be passed to beta" };
  if (o.tag !== undefined && !DEV_TAG.test(o.tag)) return { error: `only a whole dev release goes to beta, and ${o.tag || "that"} is not one (a dev-* tag)` };
  const fetched = await fetchAll(d, o.repo);
  if (fetched) return { error: fetched };
  let verdicts: Map<string, Verdict>;
  try { verdicts = await readVerdicts(d, o.repo, o.rhythm.beta, backupOf(o.rhythm)); }
  catch (e) { return { error: `could not read the beta verdicts on the night digests: ${firstLine(String((e as Error)?.message ?? e))}` }; }
  const all = await devReleases(d);

  const named = o.tag ? all.find((x) => x.tag === o.tag) : undefined;
  if (o.tag && !named) return { error: `${o.tag} is not a dev release on GitHub` };
  // named, that one; else each passed release, newest first: a newer one not yet allowed (an urgent fix not a day old,
  // a change marked broke) leaves an older passed one free to go. One already on stable, or behind it, ends the look
  const passed = named ? [named] : all.filter((x) => { const v = verdicts.get(x.tag); return v && v.verdict === "pass" && v.at >= x.made; });
  if (!passed.length) {
    const held = all.find((x) => verdicts.get(x.tag)?.verdict === "hold");
    d.say(held ? `${held.tag} was held: stable stays as it is` : "no dev release was passed to beta: stable stays as it is");
    return { ok: true, nothing: true, ...(held ? { held: held.tag } : {}) };
  }
  const stable = await rev(d, "refs/remotes/origin/stable");
  let pick: DevRelease | undefined, refused = "";
  for (const x of passed) {
    const by = verdicts.get(x.tag)?.by ?? "";
    if (stable === x.sha) {
      if (refused) return { error: refused };
      d.say(`stable is at ${x.tag} already`); return { ok: true, tag: x.tag, sha: x.sha, by, already: true };
    }
    if (stable && !(await ancestor(d, stable, x.sha))) { refused ||= `stable (${short(stable)}) has what ${x.tag} does not: stable only moves forward, to a newer dev release`; break; }
    const b = await broken(d, o.repo, x.tag);
    const no = typeof b === "string" ? b : passRule({ tag: x.tag, made: x.made, verdict: verdicts.get(x.tag), broken: b, now: d.now(), rhythm: o.rhythm });
    if (!no) { pick = x; break; }
    refused ||= no;
    if (typeof b === "string") break;   // GitHub not answering: no older one is asked either
  }
  if (!pick) return { error: refused };
  const { tag, sha } = pick;
  const by = verdicts.get(tag)!.by;

  if (d.dryRun) { d.say(`would move stable to ${tag} (${short(sha)}), passed by ${by}, export it to sol-beta and tell every Sol`); return { ok: true, tag, sha, by, dry: true }; }
  // forward only, never forced: GitHub refuses a push that is not a fast-forward
  const p = await d.git(["push", "-q", "origin", `${sha}:refs/heads/stable`]);
  if (p.code !== 0) {
    const up = (await d.git(["ls-remote", "origin", "refs/heads/stable"])).out;
    if (!up.startsWith(`${sha}\t`)) return { error: `GitHub did not take stable: ${firstLine(p.out)}` };
  }
  d.say(`stable moved to ${tag} (${short(sha)}), passed by ${by}`);
  const beta = d.mirror ? (await d.mirror(sha, tag).catch((e) => ({ beta: `the beta repo did not take it: ${firstLine(String((e as Error)?.message ?? e))}` }))).beta : undefined;
  if (beta) d.say(beta);
  const told = d.tell ? await Promise.resolve(d.tell({ sha, tag, by })).catch(() => false) : false;
  d.say(told ? "every Sol on the relay was told" : "the relay was not in sight: each Sol finds it within the hour");
  return { ok: true, tag, sha, by, told, ...(beta ? { beta } : {}) };
}

/** beta-guard.yml: is `stable` at `sha` a pass that the rules allow? `before`, the commit stable was at, must be in its
 *  history. The same questions as passBeta, asked of whatever pushed it */
export async function checkStable(d: Pick<BetaDeps, "git" | "gh" | "now">, o: { repo: string; rhythm: Rhythm; sha: string; before?: string }): Promise<{ ok: true; tag: string; by: string } | { ok?: false; error: string }> {
  if (!/^[0-9a-f]{40}$/.test(o.sha)) return { error: `not a commit: ${o.sha}` };
  if (!o.rhythm.beta.length) return { error: "the rhythm names no beta reviewer, so nothing may be on beta" };
  const fetched = await fetchAll(d, o.repo);
  if (fetched) return { error: fetched };
  const at = (await devReleases(d)).filter((x) => x.sha === o.sha);
  if (!at.length) return { error: `stable is at ${short(o.sha)}, which is no dev release: only a whole dev-* release goes to beta` };
  if (o.before && /^[0-9a-f]{40}$/.test(o.before) && !/^0+$/.test(o.before) && !(await ancestor(d, o.before, o.sha))) {
    return { error: `stable went from ${short(o.before)} to ${short(o.sha)}, which does not hold it: stable only moves forward` };
  }
  let verdicts: Map<string, Verdict>;
  try { verdicts = await readVerdicts(d, o.repo, o.rhythm.beta, backupOf(o.rhythm)); }
  catch (e) { return { error: `could not read the beta verdicts on the night digests: ${firstLine(String((e as Error)?.message ?? e))}` }; }
  const why: string[] = [];
  for (const x of at) {
    const b = await broken(d, o.repo, x.tag);
    const no = typeof b === "string" ? b : passRule({ tag: x.tag, made: x.made, verdict: verdicts.get(x.tag), broken: b, now: d.now(), rhythm: o.rhythm });
    if (!no) return { ok: true, tag: x.tag, by: verdicts.get(x.tag)!.by };
    why.push(no);
  }
  return { error: why.join("; ") };
}

// ---- run as a program: node dist/team/beta.js [--dry-run] [--tag dev-YYYYMMDD] [--check <sha> [--before <sha>]] [--repo owner/name] ----

const arg = (argv: string[], k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] ?? "" : undefined; };

async function main(argv: string[]): Promise<number> {
  const r0 = await runnerOf(argv, "beta");
  if (typeof r0 === "string") { console.error(r0); return 2; }
  const { root, git, gh, repo, rhythm, tell, stop } = r0;
  const check = arg(argv, "--check");
  if (check !== undefined) {
    const r = await checkStable({ git, gh, now: () => new Date() }, { repo, rhythm, sha: check, before: arg(argv, "--before") });
    if (!r.ok) { console.error(`beta-guard: ${r.error}`); return 1; }
    console.log(`beta-guard: stable is ${r.tag}, passed by ${r.by}`);
    return 0;
  }
  const dryRun = argv.includes("--dry-run");
  const tag = arg(argv, "--tag");
  console.log(`beta pass${dryRun ? " (dry run: nothing moves)" : ""}, ${new Date().toISOString()}, ${repo}, beta reviewer ${rhythm.beta.join(", ") || "nobody"}`);
  const { mirror } = await import("./ship.js");
  try {
    const r = await passBeta({
      git, gh, now: () => new Date(), dryRun, say: (l) => console.log(l),
      mirror: (sha, t) => mirror({ root: resolve(root, "sol") }, sha, t),
      tell: (p) => tell("stable", p),
    }, { repo, rhythm, tag });
    if (!r.ok) { console.error(`beta: ${r.error}`); return 1; }
    if ("tag" in r) console.log(`beta: ${r.tag} ${r.sha}`);
    return 0;
  } finally { await stop(); }
}

const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(`beta: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
}
