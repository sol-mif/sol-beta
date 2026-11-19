// The release (#418, part of #413, team flow v2): each morning at the project's release hour the release runner on the
// NucBox tags what went into main overnight as `dev-YYYYMMDD`, moves the branch `dev` to it, and tells every Sol on
// the relay (`stable { sha, tag, by, channel: "dev" }`, the kind the hub already carries, PROTOCOL.md round 67). Dev
// Sols install it by themselves at a quiet moment (ship.ts). It closes the day: hand in by 8pm, the dev night at 9pm, the
// release at 9am. Stamping is gone: nothing reaches `dev` but this runner, and `stable` moves only by the beta pass
// (#419), which takes a whole dev-* release a day old.
//   the hour  the project's rhythm (`.sol/rhythm.json` on the default branch, tonight.ts rhythmOf), in its zone. The
//             runner refuses before that hour, so a timer that fires early or a hand that runs it at 7 changes nothing.
//   once      a day: `dev-YYYYMMDD` standing already is "released"; nothing merged since the last dev-* is no release
//   broke     a PR marked `broke` holds nothing but itself (#1562, part of #1559): the night pass opens its revert PR
//             (broke.ts) and the day's release goes out; `sol/release --back` stays the brake
//   urgent    an off-cycle `dev-YYYYMMDD-HHMM` (--urgent <pr>), refused unless the PR is merged into main and the day's
//             dev reviewer (any login under `dev` in the rhythm) wrote a comment on it starting "**Urgent OK**" that day
//             (in the rhythm's zone), after the PR's last commit. A comment, not a label: GitHub says who wrote a comment, and a label says nothing
//             of who put it there, while anyone who can triage can put one on. It releases main as it is then, and only
//             once the workflow runs that pushing that commit to main started have all ended green (#1231): none yet,
//             one still running or one red refuses it and names them. A run is there from the push on, before its jobs
//             are, and a rerun updates its run, so the newest attempt counts; a schedule's or a hand's runs on the same
//             commit are not read.
// Who may push `dev`: the runner's own identity (a deploy key or a GitHub App, set up by hand, PR #418's "To turn on");
// the ruleset (#439) lets nothing else move it. Run by the timer `sol-release.timer` through `sol/release`, which also
// promotes the NucBox's live checkout after a release. GitHub, git and the relay are deps, so the tests fake them.
//   owners    before the release, the CODEOWNERS PR written from the project's owners (codeowners.ts, #438) is merged
//             when it changes CODEOWNERS alone, says what the table says and is green; otherwise it is written again
//             and waits for the next run. The table is read from the project's record on GitHub; a cloud record's is
//             written by the Sol that applied the change. A failure here never stops the release.
//   the count (#1150) an hour after a release (a timer of its own, `sol-release-count-<tag>`, set by systemd-run when
//             the release is made), `release.js --count <tag>` reads what each Sol runs from this machine's engine (GET
//             /runs, the words it heard on the relay, runs.ts) and pings each team person still behind, with the reason
//             their Sol gave: one ping a person, the night's way (relayLink). Everyone on it: nothing is said to anyone.
//   drift     (#1153) a few minutes after a release, the drift run for it (`sol-drift-<tag>`, the same way), so a late
//             release is measured the same day; sol-drift.timer stays as the fallback
import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { clockIn, rhythmOf, defaultBranchOf, type Rhythm } from "./tonight.js";
import { makeGithubRecord, runGh } from "./record.js";
import { ghHelper, ownGhOnPath } from "./gh.js";
import { activeRoom, recordOf, connectedRepos } from "./settings.js";
import { isGithubRecord } from "./record.js";
import { mergeOwners, type Table } from "./codeowners.js";
import { parseProject, PROJECT_PATH } from "./project.js";
import { readTeam, relayLink, type Run } from "./night.js";
import { whoHas, peopleOf, COUNT_MS, type Has, type RunsWord } from "./runs.js";
import { quietPush } from "../quiet.js";

export type ReleaseDeps = {
  git: (args: string[]) => Promise<Run>;     // never throws: the exit code is part of the answer
  gh: (args: string[]) => Promise<string>;   // the GitHub CLI (the PR and its comments, for an urgent fix)
  now: () => Date;
  dryRun: boolean;
  say: (line: string) => void;
  /** the word to every Sol on the relay; false when it could not go (each Sol asks GitHub within the hour anyway) */
  tell?: (p: { sha: string; tag: string; by: string; channel: "dev" }) => boolean | Promise<boolean>;
};
export type Released =
  | { ok: true; tag: string; sha: string; already?: true; nothing?: true; dry?: true; told?: boolean }
  | { ok?: false; error: string };

const pad = (n: number) => String(n).padStart(2, "0");
const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const short = (s: string) => s.slice(0, 7);

// ---- pure ----

export type CheckRun = { id?: number; name?: string; status?: string; conclusion?: string | null };
const PASSED = new Set(["success", "skipped", "neutral"]);
/** the workflow runs a push to main started on one commit, read (pure, #1231): green only when there is at least one
 *  and each has ended in success, skipped or neutral (startup_failure, cancelled, action_required and the rest are not).
 *  A rerun updates its run (a new attempt, the same id); two of one name, the newer id counts */
export function checksOn(runs: CheckRun[]): { green: true } | { green: false; why: string } {
  const newest = new Map<string, CheckRun>();
  for (const r of runs) {
    const name = String(r.name ?? "");
    const had = newest.get(name);
    if (!had || (r.id ?? 0) > (had.id ?? 0)) newest.set(name, r);
  }
  if (!newest.size) return { green: false, why: "GitHub shows no checks on it yet" };
  const running = [...newest.values()].filter((r) => r.status !== "completed").map((r) => r.name);
  if (running.length) return { green: false, why: `its checks are still running (${running.join(", ")})` };
  const red = [...newest.values()].filter((r) => !PASSED.has(String(r.conclusion ?? ""))).map((r) => `${r.name}: ${r.conclusion ?? "no result"}`);
  if (red.length) return { green: false, why: `its checks did not pass (${red.join(", ")})` };
  return { green: true };
}

export const DEV_TAG = /^dev-(\d{8})(?:-(\d{4}))?$/;
/** a dev release's tag (pure): dev-YYYYMMDD for the day's, dev-YYYYMMDD-HHMM for an urgent fix */
export function devTag(day: string, hhmm?: string): string {
  return `dev-${day.replace(/-/g, "")}${hhmm ? `-${hhmm.replace(":", "")}` : ""}`;
}
/** the timer's OnCalendar for a rhythm (pure): the release hour every day, in the rhythm's zone when it names one */
export function calendarOf(r: Pick<Rhythm, "release" | "zone">): string {
  return `*-*-* ${r.release}:00${r.zone ? ` ${r.zone}` : ""}`;
}
/** the day whose release is due at `now` (pure): today in the rhythm's zone once its release hour has come, else null */
export function dueDay(r: Pick<Rhythm, "release" | "zone">, now: Date): string | null {
  const c = clockIn(now, r.zone);
  return c.minutes >= mins(r.release) ? c.day : null;
}

export const URGENT_OK = /^\s*\*\*urgent ok\*\*/i;
export type PrComment = { author?: { login?: string }; body?: string; createdAt?: string; includesCreatedEdit?: boolean; lastEditedAt?: string | null };
/** who OK'd an urgent fix today (pure): the login of a dev reviewer whose comment starts "**Urgent OK**", written on
 *  `day` in the rhythm's zone and, given `after` (the PR's last commit), after it: an OK covers what it saw; the latest
 *  such; null when none */
export function urgentOk(comments: PrComment[], r: Pick<Rhythm, "dev" | "zone">, day: string, after = 0): string | null {
  const reviewers = new Set(r.dev.map((x) => x.toLowerCase()));
  let who: string | null = null;
  for (const c of comments) {
    const login = String(c.author?.login ?? "");
    const t = Date.parse(String(c.createdAt ?? ""));
    if (!login || !reviewers.has(login.toLowerCase()) || Number.isNaN(t) || t < after || !URGENT_OK.test(String(c.body ?? ""))) continue;
    if (clockIn(new Date(t), r.zone).day === day) who = login;
  }
  return who;
}

/** the words of a reason, for a ping (pure) */
const BEHIND: Record<NonNullable<Has["why"]>, string> = {
  busy: "a session's turn was in flight each time it looked since",
  paused: "its updates are paused",
  clash: "your own changes clash with it, and a session is carrying them over",
  changes: "it has changes not kept yet",
  pinned: "it is pinned to an older release",
  build: "its new code did not build",
  off: "Sol has not heard from it since",
};
/** the pings an hour after a release (pure): one to each person still behind, saying why when their Sol said */
export function behindPings(who: Has[], tag: string): { to: string; line: string }[] {
  return who.filter((p) => !p.has).map((p) => ({ to: p.to, line: `your Sol is not on ${tag} yet, an hour after it was released${p.why ? `: ${BEHIND[p.why]}` : ""}` }));
}

// ---- the run ----

export const firstLine = (s: string) => s.trim().split("\n").map((l) => l.replace(/^(fatal|error|hint): /, "").trim()).filter(Boolean)[0] ?? "it failed";

/** origin's branches, the dev-* tags and the beta releases' numbers (v1, v2…, #1300), fetched; over https with gh's
 *  sign-in when origin cannot be reached itself */
export async function fetchAll(d: Pick<ReleaseDeps, "git">, repo: string): Promise<string | null> {
  const refs = ["+refs/heads/*:refs/remotes/origin/*", "+refs/tags/dev-*:refs/tags/dev-*", "+refs/tags/v*:refs/tags/v*"];
  let f = await d.git(["fetch", "-q", "--prune", "origin", ...refs]);
  if (f.code !== 0) f = await d.git([...ghHelper(), "fetch", "-q", "--prune", `https://github.com/${repo}.git`, ...refs]);
  return f.code === 0 ? null : `could not fetch origin: ${firstLine(f.out)}`;
}

export const rev = async (d: Pick<ReleaseDeps, "git">, ref: string) => { const r = await d.git(["rev-parse", "--verify", "-q", ref]); return r.code === 0 ? r.out.trim() : ""; };

/** the newest dev release: its tag and commit, or null (two made in one second: the later name, an urgent one after the day's) */
async function lastDev(d: ReleaseDeps, hour: string): Promise<{ tag: string; sha: string } | null> {
  return (await devTags(d, hour))[0] ?? null;
}

/** a dev release's place in time, read from its name alone (pure): YYYYMMDDHHMM, the day's at the rhythm's release
 *  hour, then 1 for an urgent one so that, made in the same minute, it comes after the day's. Never the tag's creation
 *  date (#639): a tag made or re-made later must not pass for the newest release */
export function releaseKey(tag: string, hour: string): string {
  const m = DEV_TAG.exec(tag);
  if (!m) return "";
  return `${m[1]}${m[2] ?? hour.replace(":", "").padStart(4, "0")}${m[2] ? 1 : 0}`;
}

/** the dev-* releases, newest first by name (releaseKey): tag and commit */
async function devTags(d: Pick<ReleaseDeps, "git">, hour: string): Promise<{ tag: string; sha: string }[]> {
  const r = await d.git(["for-each-ref", "--format=%(refname:short)%09%(*objectname)%09%(objectname)", "refs/tags/dev-*"]);
  if (r.code !== 0) return [];
  return r.out.split("\n").map((l) => l.split("\t")).filter(([t]) => t && DEV_TAG.test(t))
    .map(([tag, peeled, obj]) => ({ tag, sha: peeled || obj, key: releaseKey(tag, hour) }))
    .sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
    .map(({ tag, sha }) => ({ tag, sha }));
}

/** the tag and `dev`, in one atomic push; a push cut off after GitHub took it is asked of GitHub, and a refused one
 *  takes the local tag back */
export async function publish(d: Pick<ReleaseDeps, "git">, tag: string, sha: string, msg: string): Promise<string | null> {
  // the tagger: the machine's own name for git, else the runner's
  const who = (await d.git(["var", "GIT_COMMITTER_IDENT"])).code === 0 ? [] : ["-c", "user.name=Sol release runner", "-c", "user.email=release@sol.invalid"];
  const t = await d.git([...who, "tag", "-a", tag, "-m", msg, sha]);
  if (t.code !== 0) return `could not make the tag ${tag}: ${firstLine(t.out)}`;
  quietPush();   // a quiet Sol pushes nothing (#1293)
  const p = await d.git(["push", "-q", "--atomic", "origin", `refs/tags/${tag}:refs/tags/${tag}`, `+${sha}:refs/heads/dev`]);
  if (p.code === 0) return null;
  const up = (await d.git(["ls-remote", "origin", "refs/heads/dev", `refs/tags/${tag}`])).out;
  if (up.includes(`${sha}\trefs/heads/dev`) && up.includes(`\trefs/tags/${tag}`)) return null;
  await d.git(["tag", "-d", tag]);
  return `GitHub did not take it: ${firstLine(p.out)}`;
}

/** the release of the day, or with `urgent` an urgent fix's off-cycle release (see the top of this file) */
export async function release(d: ReleaseDeps, o: { repo: string; rhythm: Rhythm; urgent?: number }): Promise<Released> {
  const now = d.now();
  const fetched = await fetchAll(d, o.repo);
  if (fetched) return { error: fetched };
  const base = await defaultBranchOf(d, o.repo).catch(() => "main");
  const sha = await rev(d, `refs/remotes/origin/${base}`);
  if (!sha) return { error: `GitHub's ${base} is not known here` };
  const last = await lastDev(d, o.rhythm.release);
  const c = clockIn(now, o.rhythm.zone);
  let tag: string, by = "";

  if (o.urgent !== undefined) {
    if (!o.rhythm.dev.length) return { error: "the rhythm names no dev reviewer, so no urgent fix can be OK'd" };
    let pr: { state?: string; mergeCommit?: { oid?: string } | null; baseRefName?: string; comments?: PrComment[]; commits?: { committedDate?: string }[] };
    try { pr = JSON.parse(await d.gh(["pr", "view", String(o.urgent), "--repo", o.repo, "--json", "state,mergeCommit,baseRefName,comments,commits"]) || "{}"); }
    catch (e) { return { error: `could not read #${o.urgent}: ${firstLine(String((e as Error)?.message ?? e))}` }; }
    if (pr.state !== "MERGED" || pr.baseRefName !== base) return { error: `#${o.urgent} is not merged into ${base}; an urgent release carries a fix that is` };
    const merged = pr.mergeCommit?.oid ?? "";
    if (!merged || (await d.git(["merge-base", "--is-ancestor", merged, sha])).code !== 0) return { error: `#${o.urgent}'s merge is not on GitHub's ${base} as fetched here` };
    const lastCommit = Math.max(0, ...(pr.commits ?? []).map((x) => Date.parse(String(x.committedDate ?? "")) || 0));
    const ok = urgentOk(pr.comments ?? [], o.rhythm, c.day, lastCommit);
    if (!ok) return { error: `#${o.urgent} has no "**Urgent OK**" from the day's dev reviewer (${o.rhythm.dev.join(" or ")}) today, after its last commit; an urgent release waits for it` };
    if (last && last.sha === sha) return { error: `nothing merged since ${last.tag}: there is nothing to release` };
    let runs: CheckRun[], total = 0;
    try {
      const j = JSON.parse(await d.gh(["api", `repos/${o.repo}/actions/runs?head_sha=${sha}&event=push&branch=${base}&per_page=100`]) || "{}");
      runs = (j.workflow_runs ?? []) as CheckRun[]; total = Number(j.total_count ?? runs.length);
    } catch (e) { return { error: `GitHub did not say how ${base}'s checks on ${short(sha)} went (${firstLine(String((e as Error)?.message ?? e))}), so no urgent release` }; }
    if (total > runs.length) return { error: `GitHub has ${total} runs on ${short(sha)} and gave ${runs.length}, so no urgent release` };
    const checks = checksOn(runs);
    if (!checks.green) return { error: `${base} at ${short(sha)} is not green: ${checks.why}; an urgent release waits until it is (#1231)` };
    tag = devTag(c.day, `${pad(Math.floor(c.minutes / 60))}${pad(c.minutes % 60)}`);
    if (await rev(d, `refs/tags/${tag}`)) return { error: `${tag} stands already; try again in a minute` };
    by = ok;
  } else {
    const day = dueDay(o.rhythm, now);
    if (!day) return { error: `not yet: the release hour is ${o.rhythm.release}${o.rhythm.zone ? ` (${o.rhythm.zone})` : ""}` };
    tag = devTag(day);
    const had = await rev(d, `refs/tags/${tag}^{commit}`);
    if (had) { d.say(`already released today: ${tag} at ${short(had)}`); return { ok: true, tag, sha: had, already: true }; }
    if (last && last.sha === sha) { d.say(`nothing merged since ${last.tag}: no dev release today`); return { ok: true, tag: last.tag, sha, nothing: true }; }
  }

  if (d.dryRun) { d.say(`would tag ${tag} at ${short(sha)}, move dev to it, and tell every Sol`); return { ok: true, tag, sha, dry: true }; }
  const msg = by ? `urgent dev release ${tag}, OK'd by ${by} (#${o.urgent})` : `dev release ${tag}`;
  const no = await publish(d, tag, sha, msg);
  if (no) return { error: no };
  d.say(`released ${tag} at ${short(sha)}; dev moved to it`);
  const told = d.tell ? await Promise.resolve(d.tell({ sha, tag, by, channel: "dev" })).catch(() => false) : false;
  d.say(told ? "every Sol on the relay was told" : "the relay was not in sight: each Sol finds it within the hour");
  return { ok: true, tag, sha, told };
}

// ---- the rollback (#638) ----

export const BACK_TAG = /^back-(\d{8})-(\d{4})$/;
export type Back =
  | { ok: true; tag: string; sha: string; from: string; log: string; dry?: true; told?: boolean }
  | { ok?: false; error: string };

/** a rollback (`sol/release --back [tag] --why "<text>"`): dev goes back to the dev-* release before the one it is on
 *  (or the one named), in one atomic push with a `back-YYYYMMDD-HHMM` tag whose message says from, to, who and why, as
 *  a release's tag says what and who; every Sol on the relay is told. `stable` is never touched. Refused without a why,
 *  for a tag that is not a dev-* release, or one not older than dev's own */
export async function back(d: ReleaseDeps, o: { repo: string; rhythm: Pick<Rhythm, "zone" | "release">; to?: string; why: string; by: string }): Promise<Back> {
  const why = o.why.trim().replace(/\s+/g, " ");
  if (!why) return { error: 'a rollback says why: --why "<what went wrong>"' };
  const by = o.by.trim() || "someone";
  if (o.to !== undefined && !DEV_TAG.test(o.to)) return { error: `${o.to || "(empty)"} is not a dev release; name a dev-YYYYMMDD tag` };
  const fetched = await fetchAll(d, o.repo);
  if (fetched) return { error: fetched };
  const dev = await rev(d, "refs/remotes/origin/dev");
  if (!dev) return { error: "GitHub's dev is not known here: there is no release to go back from" };
  const tags = await devTags(d, o.rhythm.release);
  const at = tags.findIndex((t) => t.sha === dev);
  if (at < 0) return { error: `dev is at ${short(dev)}, which no dev-* release names; go back by hand` };
  const from = tags[at].tag;
  let to: { tag: string; sha: string } | undefined;
  if (o.to !== undefined) {
    const i = tags.findIndex((t) => t.tag === o.to);
    if (i < 0) return { error: `there is no release ${o.to}` };
    if (i <= at || tags[i].sha === dev) return { error: `${o.to} is not older than ${from}, where dev is; a rollback only goes back` };
    to = tags[i];
  } else {
    to = tags.slice(at + 1).find((t) => t.sha !== dev);
    if (!to) return { error: `there is no release before ${from} to go back to` };
  }
  if ((await d.git(["merge-base", "--is-ancestor", to.sha, dev])).code !== 0) return { error: `${to.tag} is not in dev's history; go back by hand` };

  const c = clockIn(d.now(), o.rhythm.zone);
  const log = `back-${c.day.replace(/-/g, "")}-${pad(Math.floor(c.minutes / 60))}${pad(c.minutes % 60)}`;
  if (await rev(d, `refs/tags/${log}`)) return { error: `${log} stands already; try again in a minute` };
  if (d.dryRun) { d.say(`would move dev back from ${from} to ${to.tag} (${short(to.sha)}), log it as ${log}, and tell every Sol`); return { ok: true, tag: to.tag, sha: to.sha, from, log, dry: true }; }
  const no = await publish(d, log, to.sha, `dev back from ${from} to ${to.tag}, by ${by}: ${why}`);
  if (no) return { error: no };
  d.say(`dev moved back from ${from} to ${to.tag} at ${short(to.sha)}; logged as ${log}`);
  const told = d.tell ? await Promise.resolve(d.tell({ sha: to.sha, tag: to.tag, by, channel: "dev" })).catch(() => false) : false;
  d.say(told ? "every Sol on the relay was told" : "the relay was not in sight: each Sol finds it within the hour");
  return { ok: true, tag: to.tag, sha: to.sha, from, log, told };
}

/** the project's owners table as its GitHub record holds it, or why not (the record's default branch) */
export async function recordOwners(gh: (args: string[]) => Promise<string>, record: string): Promise<Table | string> {
  if (!isGithubRecord(record)) return "the project's record is not on GitHub; the Sol that applies a change writes the PR";
  let text: string;
  try { text = await gh(["api", `repos/${record}/contents/${PROJECT_PATH}`, "-H", "Accept: application/vnd.github.raw"]); }
  catch (e) { return /404|not found/i.test(String((e as Error)?.message ?? e)) ? "the record has no project settings yet" : `couldn't read the record's settings: ${firstLine(String((e as Error)?.message ?? e))}`; }
  const f = parseProject(text);
  return f.owners ?? "the record holds no owners yet: CODEOWNERS is the starting value";
}

// ---- run as a program: node dist/team/release.js [--dry-run] [--urgent <pr>] [--back [tag] --why <text>] [--calendar] [--repo owner/name] ----

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** what a runner program on the NucBox needs, shared with the beta pass (beta.ts): git and gh in the checkout, the
 *  repository, its rhythm, and the word on the relay. A string is the reason it cannot run */
export async function runnerOf(argv: string[], name: string): Promise<string | {
  root: string; git: ReleaseDeps["git"]; gh: ReleaseDeps["gh"]; repo: string; rhythm: Rhythm;
  tell: (kind: "stable" | "ping" | "drift", p: Record<string, unknown>) => Promise<boolean>; stop: () => Promise<void>;
}> {
  const team = readTeam();
  const root = resolve(ENGINE, "..", "..");
  ownGhOnPath();   // a job's PATH is short: Sol's own gh, as the engine finds it (gh.ts)
  const gh = (args: string[]) => runGh(args, root);
  const git = (args: string[]) => new Promise<Run>((ok) =>
    execFile("git", args, { cwd: root, timeout: 120_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
      (err, out, errOut) => ok({ code: err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 128) : 0, out: String(out) || String(errOut) })));
  const at = argv.indexOf("--repo");
  const repo = (at >= 0 ? argv[at + 1] ?? "" : await makeGithubRecord(gh).members.room().catch(() => "")).trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return `${name}: no repository (origin is not on GitHub; --repo owner/name)`;
  const rhythm = await rhythmOf({ gh, now: () => new Date() }, repo, true);
  if (!rhythm) return `${name}: ${repo} has no rhythm (.sol/rhythm.json on its default branch, naming a reviewer)`;
  let link: Awaited<ReturnType<typeof relayLink>> = null;
  const tell = async (kind: "stable" | "ping" | "drift", p: Record<string, unknown>) => {
    const login = team.me.login || (await makeGithubRecord(gh).who.login().catch(() => "")).trim();
    link ??= await relayLink(login, activeRoom(team).code);
    return !!link && link.send(kind, p);
  };
  const stop = async () => {
    const l = link as Awaited<ReturnType<typeof relayLink>>;
    if (l) { await new Promise((ok) => setTimeout(ok, 500)); l.stop(); }   // the word leaves before the socket closes
  };
  return { root, git, gh, repo, rhythm, tell, stop };
}

async function main(argv: string[]): Promise<number> {
  const r0 = await runnerOf(argv, "release");
  if (typeof r0 === "string") { console.error(r0); return 2; }
  const { root, git, gh, repo, rhythm, tell, stop } = r0;
  if (argv.includes("--calendar")) { process.stdout.write(`${calendarOf(rhythm)}\n`); return 0; }
  const k = argv.indexOf("--count");
  if (k >= 0) {
    const tag = argv[k + 1] ?? "";
    if (!DEV_TAG.test(tag)) { console.error("release: --count takes the release's dev-* tag"); return 2; }
    try { return await count(root, tag, (p) => tell("ping", p)); } finally { await stop(); }
  }
  const b = argv.indexOf("--back");
  if (b >= 0) {
    const named = argv[b + 1] !== undefined && !argv[b + 1].startsWith("--") ? argv[b + 1] : undefined;
    const w = argv.indexOf("--why");
    const why = w >= 0 && argv[w + 1] !== undefined && !argv[w + 1].startsWith("--") ? argv[w + 1] : "";
    const by = (await makeGithubRecord(gh).who.login().catch(() => "")).trim()
      || (await git(["config", "user.name"])).out.trim();
    const dryRun = argv.includes("--dry-run");
    console.log(`release --back${dryRun ? " (dry run: nothing moves)" : ""}, ${new Date().toISOString()}, ${repo}`);
    try {
      const r = await back({ git, gh, now: () => new Date(), dryRun, say: (l) => console.log(l), tell: (p) => tell("stable", p) }, { repo, rhythm, to: named, why, by });
      if (!r.ok) { console.error(`release: ${r.error}`); return 1; }
      console.log(`release: ${r.tag} ${r.sha}`);   // the last line, as a release's
      return 0;
    } finally { await stop(); }
  }
  const u = argv.indexOf("--urgent");
  const urgent = u >= 0 ? Number(argv[u + 1]) : undefined;
  if (urgent !== undefined && !(Number.isInteger(urgent) && urgent > 0)) { console.error("release: --urgent takes the fix's PR number"); return 2; }
  const dryRun = argv.includes("--dry-run");
  console.log(`release${dryRun ? " (dry run: nothing moves)" : ""}${urgent ? `, urgent #${urgent}` : ""}, ${new Date().toISOString()}, ${repo}, the hour ${rhythm.release}${rhythm.zone ? ` ${rhythm.zone}` : ""}`);
  // the owners first (#438), so a merged CODEOWNERS PR goes out with this release; never a reason to stop
  // and only at the release hour, as the release itself: a hand that runs it at 7 merges nothing
  if (urgent === undefined && dueDay(rhythm, new Date())) {
    const room = activeRoom(readTeam());
    if (connectedRepos(room).some((x) => x.toLowerCase() === repo.toLowerCase())) {
      const table = await recordOwners(gh, recordOf(room)).catch((e) => `couldn't read the owners: ${firstLine(String(e))}`);
      if (typeof table === "string") console.log(`owners: ${table}`);
      else { const f = await mergeOwners({ gh, dryRun, say: (l) => console.log(l) }, repo, table); if ("error" in f) console.log(`owners: not merged: ${f.error}`); }
    }
  }
  try {
    const r = await release({ git, gh, now: () => new Date(), dryRun, say: (l) => console.log(l), tell: (p) => tell("stable", p) }, { repo, rhythm, urgent });
    if (!r.ok) { console.error(`release: ${r.error}`); return 1; }
    if (!r.already && !r.nothing && !r.dry) { await countLater(root, r.tag); await driftLater(root, r.tag); }
    console.log(`release: ${r.tag} ${r.sha}`);   // the last line: sol/release reads it
    return 0;
  } finally { await stop(); }
}

/** the count in an hour (#1150): a transient systemd timer on this machine, the timers' own way; never a sleep here */
function countLater(root: string, tag: string): Promise<void> {
  const args = ["--user", `--on-active=${COUNT_MS / 1000}`, `--unit=sol-release-count-${tag}`, `--description=Sol release: who has ${tag}`,
    `--working-directory=${root}`, `--setenv=PATH=${process.env.PATH ?? ""}`, "--setenv=GIT_TERMINAL_PROMPT=0", "--setenv=MISE_QUIET=1",
    "/usr/bin/env", "bash", join(root, "sol", "release"), "--count", tag];
  return new Promise((ok) => execFile("systemd-run", args, { timeout: 20_000 }, (e, _out, err) => {
    console.log(e ? `count: not set for an hour from now (${firstLine(String(err || e.message))}); bash sol/release --count ${tag} says it by hand` : `count: who has ${tag} is asked in an hour`);
    ok();
  }));
}

/** the drift run a few minutes after a release (#1153): measured against it the same day, however late it went out */
const DRIFT_AFTER_S = 5 * 60;
function driftLater(root: string, tag: string): Promise<void> {
  const args = ["--user", `--on-active=${DRIFT_AFTER_S}`, `--unit=sol-drift-${tag}`, `--description=Sol drift: each person against ${tag}`,
    `--working-directory=${root}`, `--setenv=PATH=${process.env.PATH ?? ""}`, "--setenv=GIT_TERMINAL_PROMPT=0", "--setenv=MISE_QUIET=1",
    "/usr/bin/env", "bash", join(root, "sol", "drift")];
  return new Promise((ok) => execFile("systemd-run", args, { timeout: 20_000 }, (e, _out, err) => {
    console.log(e ? `drift: not set for ${DRIFT_AFTER_S / 60} minutes from now (${firstLine(String(err || e.message))}); sol-drift.timer measures it` : `drift: each person against ${tag} is measured in ${DRIFT_AFTER_S / 60} minutes`);
    ok();
  }));
}

/** who has `tag`, as this machine's engine heard it (GET /runs), and a ping to each team person still behind */
async function count(root: string, tag: string, ping: (p: Record<string, unknown>) => Promise<boolean>): Promise<number> {
  const port = Number(process.env.SOL_PORT ?? 7777);
  let words: RunsWord[];
  try { words = ((await (await fetch(`http://127.0.0.1:${port}/runs`, { signal: AbortSignal.timeout(10_000) })).json()) as { words?: RunsWord[] }).words ?? []; }
  catch (e) { console.error(`release: this machine's engine did not say who runs what (${firstLine(String((e as Error)?.message ?? e))})`); return 1; }
  const who = whoHas(peopleOf(root), tag, words);
  console.log(`count: ${tag}: ${who.map((p) => p.has ? `${p.name} ✓` : `${p.name} waiting${p.why ? ` (${p.why})` : ""}`).join(" · ") || "no team people known"}`);
  for (const p of behindPings(who, tag)) {
    const sent = await ping({ to: p.to, pingKind: "chat", line: p.line });
    console.log(`count: ${sent ? "pinged" : "could not ping"} ${p.to}`);
  }
  return 0;
}

const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(`release: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
}
