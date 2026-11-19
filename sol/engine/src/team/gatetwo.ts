// Gate two as a report (#1563, step 6 of Frank's update-system decision #1559): the seven questions of gate two
// (docs/how-we-work/gates.md, "Gate two") answered by machines and agents for one dev release, said on GitHub beside
// Frank's own press. It reports only: nothing acts on it until five release days agree with Frank (#1559, principle 6).
//   which     the newest dev release at least a day old (beta.ts aDayOld, the pass's own rule), or --tag
//   the seven, each pass / short / not read, and why, from what is already there:
//     1 gate one      the switches still standing at concept at the release's commit: its stations.json (#1545) when
//                     its versions.ts reads one, else the "concept" entries of its STAGES
//     2 a stranger    the morning run's first-timer on this machine (.sol-gate/morning/<tag>.json, morning.ts); it
//                     tries only the features a release touched, and no from-nothing install run exists yet
//     3 an upgrade    the newest "**Catch-up passed|failed** on <machine>" per machine on the open catch-up issue
//                     (catchup.ts ISSUE_TITLE) whose release holds this one
//     4 lived on      a day old (aDayOld), with who has it as this machine's engine heard it (GET /runs) when it answers
//     5 no leak       the newest "leak check" run on the release's commit (ci.yml), read as checksOn reads a push's runs
//     6 a rollback    to the newest v* in its history; the converter steps added since (src/convert/NNNN-*.ts) are
//                     what a rollback has to put back (convert/back.ts)
//     7 what changed  the PRs merged since that v*, their titles and "What to try", on a page on this machine
//                     (.sol-gate/gate2/<tag>.md); the report carries the count and the first three
//   the report one comment on the open "Night digest" issue, `**Gate two**, <tag>: N of 7`, a line per question, then
//              Frank's press as beta.ts reads it (passed / held / none yet), signed by the runner's login. Once a
//              release: one there already is left (--again writes it anew, in the same comment).
// Run by sol/release after the beta pass (its failure is one line, never the pass's exit), or alone with
// `bash sol/release --gate-two [--dry-run]`. GitHub, git, the engine's /runs and the clock are deps, so the tests fake them.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DIGEST_TITLE, REPO, oneLine, tryOf, clockIn, type Rhythm } from "./tonight.js";
import { aDayOld, backupOf, devReleases, readVerdicts, MIN_AGE, type DevRelease, type Verdict } from "./beta.js";
import { DEV_TAG, checksOn, fetchAll, firstLine, rev, runnerOf, type CheckRun, type ReleaseDeps, type PrComment } from "./release.js";
import { ISSUE_TITLE as CATCHUP_TITLE } from "./catchup.js";
import { whoHas, peopleOf, type Person, type RunsWord } from "./runs.js";
import { morningFile, type Morning } from "./morning.js";
import { writeInGate } from "./firsttimer.js";
import { PRODUCT_TAG } from "../version.js";

export type GateTwoDeps = Pick<ReleaseDeps, "git" | "gh" | "now" | "dryRun" | "say"> & {
  root: string;
  /** the runner's GitHub login, who signs the report */
  by: () => Promise<string>;
  /** what each Sol runs, as this machine's engine heard it (GET /runs); absent or throwing, who has it is not said */
  runs?: () => Promise<RunsWord[]>;
  /** the team's people (runs.ts peopleOf); absent, read from the checkout */
  people?: Person[];
  /** how many paths the export keeps (ship.ts BETA_KEEP), said beside the leak check */
  keep?: number;
  write?: (file: string, text: string) => void;
};
export type Mark = "pass" | "short" | "not read";
export type Answer = { n: number; mark: Mark; line: string };
export type GateTwo = { tag: string; sha: string; answers: Answer[]; press: "passed" | "held" | "none yet"; page?: string };
export type Reported =
  | { ok: true; report: GateTwo; posted?: number; already?: true; dry?: true }
  | { ok?: false; error: string };

const short = (s: string) => s.slice(0, 7);
const HOUR = 3_600_000;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : /(s|sh|ch|x)$/.test(w) ? "es" : "s"}`;
export const HEAD = /^\*\*Gate two\*\*, (\S+?):/;
const QUESTION = ["", "gate one", "a stranger installs it", "an upgrade keeps everything", "the team lived on it", "nothing team-only leaks", "it can be rolled back", "the Sol user knows what changed"];

// ---- pure ----

/** the switches standing at concept in a release (pure): its stations.json when its versions.ts reads one (#1545),
 *  else the "concept" entries of the STAGES its versions.ts writes by hand. null when neither can be read */
export function conceptsOf(versions: string, stations: string | null): string[] | null {
  if (/from\s+["']\.\/stations\.json["']/.test(versions)) {
    if (stations === null) return null;
    let j: unknown;
    try { j = JSON.parse(stations); } catch { return null; }
    if (!j || typeof j !== "object" || Array.isArray(j)) return null;
    return Object.entries(j as Record<string, { station?: unknown }>).filter(([, r]) => r && r.station === "concept").map(([n]) => n).sort();
  }
  const block = /export const STAGES[^=]*=\s*\{([\s\S]*?)\n\};/.exec(versions)?.[1];
  if (block === undefined) return null;
  return [...block.matchAll(/^\s*"([^"]+)":\s*"concept"/gm)].map((m) => m[1]).sort();
}

export type CatchUp = { machine: string; passed: boolean; tried: boolean; to: string; at: number; head: string };
const CATCHUP = /^\*\*Catch-up (passed|failed)\*\* on ([\w.-]+): (.*)$/;
const TO = /\b(?:to|before) ((?:dev|stable)-\d{8}(?:-\d{4})?)\b/;
/** who posts the catch-up reports: the workflow (catchup.yml), as GitHub names its bot */
export const CATCHUP_BY = /^github-actions(\[bot\])?$/i;
/** the catch-up reports on the issue (pure): each comment's first line, its machine, whether it passed and the release
 *  it updated to; only the workflow's own, and an edited one says nothing (as beta.ts reads verdicts) */
export function catchUpsOf(comments: PrComment[]): CatchUp[] {
  const out: CatchUp[] = [];
  for (const c of comments) {
    if (c.includesCreatedEdit === true || c.lastEditedAt || !CATCHUP_BY.test(String(c.author?.login ?? ""))) continue;
    const head = String(c.body ?? "").trimStart().split("\n")[0];
    const m = CATCHUP.exec(head), to = m ? TO.exec(m[3])?.[1] : undefined;
    const at = Date.parse(String(c.createdAt ?? ""));
    if (m && to && !Number.isNaN(at)) out.push({ machine: m[2], passed: m[1] === "passed", tried: !/nothing to catch up from/.test(m[3]), to, at, head });
  }
  return out;
}
/** the newest report per machine among those whose release holds this one (pure) */
export function newestPerMachine(all: CatchUp[], holds: (to: string) => boolean): CatchUp[] {
  const by = new Map<string, CatchUp>();
  for (const x of all) if (holds(x.to) && (!by.has(x.machine) || by.get(x.machine)!.at <= x.at)) by.set(x.machine, x);
  return [...by.values()].sort((a, b) => a.machine.localeCompare(b.machine));
}

/** the PRs a run of first-parent subjects merged (pure): "Merge pull request #N from …", or a squash's "… (#N)" */
export function prsOf(subjects: string[]): number[] {
  const out: number[] = [];
  for (const s of subjects) {
    const n = Number(/^Merge pull request #(\d+) /.exec(s)?.[1] ?? /\(#(\d+)\)\s*$/.exec(s)?.[1] ?? 0);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

export type Change = { number: number; title: string; try: string };
/** the what's-new page (pure): each change merged since the last product release, its title and what to try */
export function pageOf(tag: string, from: string, commits: number, changes: Change[]): string {
  const out = [`# What changed in ${tag}, since ${from}`, "", `${plural(changes.length, "change")}, ${plural(commits, "commit")}. Written by gate two (#1563) from each change's title and "What to try".`, ""];
  for (const c of changes) out.push(`- #${c.number} ${oneLine(c.title, 140) || "(no title read)"}${c.try ? `: ${oneLine(c.try, 300)}` : ""}`);
  return out.join("\n") + "\n";
}

/** Frank's press, as the beta pass reads it (pure): the last signed verdict on the release, written after it was made */
export const pressOf = (v: Verdict | undefined, made: number): GateTwo["press"] => !v || v.at < made ? "none yet" : v.verdict === "pass" ? "passed" : "held";

/** the report (pure) */
export function reportOf(r: GateTwo, by: string): string {
  const passed = r.answers.filter((a) => a.mark === "pass").length;
  return [
    `**Gate two**, ${r.tag}: ${passed} of 7`,
    "",
    ...r.answers.map((a) => `${a.n}. ${QUESTION[a.n]}: **${a.mark}**, ${a.line}`),
    "",
    `Frank's press: ${r.press}`,
    "",
    `A report only (#1563): nothing acts on it until five release days agree with Frank's press (#1559). The release is ${short(r.sha)}.`,
    "",
    `— ${by || "the release runner"}'s agent`,
  ].join("\n");
}

// ---- the seven ----

type Rel = DevRelease;
const show = async (d: Pick<GateTwoDeps, "git">, sha: string, path: string) => { const r = await d.git(["show", `${sha}:${path}`]); return r.code === 0 ? r.out : null; };
const ancestor = async (d: Pick<GateTwoDeps, "git">, a: string, b: string) => (await d.git(["merge-base", "--is-ancestor", a, b])).code === 0;

async function q1(d: GateTwoDeps, rel: Rel): Promise<Answer> {
  const v = await show(d, rel.sha, "sol/engine/src/versions.ts");
  const c = v === null ? null : conceptsOf(v, await show(d, rel.sha, "sol/engine/src/stations.json"));
  if (c === null) return { n: 1, mark: "not read", line: `where the switches stand could not be read at ${short(rel.sha)}` };
  if (!c.length) return { n: 1, mark: "pass", line: "no switch in it stands at concept" };
  return { n: 1, mark: "short", line: `${plural(c.length, "switch")} still ${c.length === 1 ? "stands" : "stand"} at concept (${c.slice(0, 6).join(", ")}${c.length > 6 ? ", …" : ""})` };
}

function q2(d: GateTwoDeps, rel: Rel): Answer {
  const f = morningFile(d.root, rel.tag, "json");
  let m: Morning | null = null;
  try { if (existsSync(f)) m = JSON.parse(readFileSync(f, "utf8")) as Morning; } catch { /* below */ }
  if (!m) return { n: 2, mark: "not read", line: `no first-timer run of ${rel.tag} on this machine (.sol-gate/morning/)` };
  const ft = m.firstTimer;
  const what = ft ? `the first-timer ran ${plural(ft.runs, "time")} over the features it touched (${plural(ft.findings, "finding")}${ft.stuck ? `, stuck ${ft.stuck}` : ""})` : "the morning run tried nothing";
  return { n: 2, mark: "short", line: `${what}; no run installs it from nothing yet` };
}

async function q3(d: GateTwoDeps, repo: string, rel: Rel): Promise<Answer> {
  let comments: PrComment[] = [];
  try {
    const found = JSON.parse(await d.gh(["issue", "list", "--repo", repo, "--state", "open", "--search", `"${CATCHUP_TITLE}" in:title`, "--json", "number,title", "--limit", "20"]) || "[]") as { number: number; title?: string }[];
    const n = found.find((x) => String(x.title ?? "").trim() === CATCHUP_TITLE)?.number;
    if (!n) return { n: 3, mark: "not read", line: `no open "${CATCHUP_TITLE}" issue` };
    comments = (JSON.parse(await d.gh(["issue", "view", String(n), "--repo", repo, "--json", "comments"]) || "{}") as { comments?: PrComment[] }).comments ?? [];
  } catch (e) { return { n: 3, mark: "not read", line: `GitHub did not answer (${firstLine(String((e as Error)?.message ?? e))})` }; }
  const all = catchUpsOf(comments);
  const holds = new Map<string, boolean>();
  for (const to of new Set(all.map((x) => x.to))) {
    const sha = await rev(d, `refs/tags/${to}^{commit}`);
    holds.set(to, !!sha && (sha === rel.sha || await ancestor(d, rel.sha, sha)));
  }
  const got = newestPerMachine(all, (to) => holds.get(to) === true);
  if (!got.length) return { n: 3, mark: "not read", line: `no catch-up test has updated to ${rel.tag} or later yet` };
  // "nothing to catch up from" passes the catch-up test and tries no upgrade: not a pass here
  const said = got.map((x) => { const of = /\d+ of \d+/.exec(x.head)?.[0]; return !x.tried ? `${x.machine} had nothing to catch up from to ${x.to}` : `${x.machine} ${x.passed ? "passed" : "failed"}${of ? ` ${of}` : ""} to ${x.to}`; }).join(", ");
  return { n: 3, mark: got.every((x) => x.passed && x.tried) ? "pass" : "short", line: said };
}

async function q4(d: GateTwoDeps, rel: Rel, zone: string): Promise<Answer> {
  const now = d.now(), hours = Math.floor((now.getTime() - rel.made) / HOUR);
  const old = aDayOld(rel.made, now, zone);
  let who = "";
  if (d.runs) {
    try {
      const has = whoHas(d.people ?? peopleOf(d.root), rel.tag, await d.runs(), now.getTime());
      who = has.length ? `; ${has.map((p) => p.has ? `${p.name} has it` : `${p.name} not yet${p.why ? ` (${p.why})` : ""}`).join(", ")}` : "";
    } catch { who = "; who has it was not heard (this machine's engine did not answer)"; }
  }
  const age = rel.made ? `made ${clockIn(new Date(rel.made), zone).day}, ${plural(Math.max(0, hours), "hour")} ago` : "its date was not read";
  return { n: 4, mark: old ? "pass" : "short", line: `${age} (the rule for now: an earlier day and ${MIN_AGE / HOUR} hours, #1559)${who}` };
}

async function q5(d: GateTwoDeps, repo: string, rel: Rel): Promise<Answer> {
  let runs: CheckRun[];
  try { runs = (JSON.parse(await d.gh(["api", `repos/${repo}/commits/${rel.sha}/check-runs?check_name=leak%20check&per_page=100`]) || "{}") as { check_runs?: CheckRun[] }).check_runs ?? []; }
  catch (e) { return { n: 5, mark: "not read", line: `GitHub did not answer (${firstLine(String((e as Error)?.message ?? e))})` }; }
  runs = runs.filter((r) => r.name === "leak check");
  const keep = d.keep ? `; the export keeps ${plural(d.keep, "path")} (BETA_KEEP)` : "";
  if (!runs.length) return { n: 5, mark: "not read", line: `GitHub shows no leak check on ${short(rel.sha)}${keep}` };
  const c = checksOn(runs);
  return c.green ? { n: 5, mark: "pass", line: `the leak check on ${short(rel.sha)} passed${keep}` } : { n: 5, mark: "short", line: `the leak check: ${c.why.replace(/^its checks /, "")}${keep}` };
}

/** the product release a rollback goes to: the newest v* in the release's history, not on it */
async function lastProduct(d: GateTwoDeps, rel: Rel): Promise<{ tag: string; sha: string; day: string } | null> {
  const r = await d.git(["for-each-ref", "--format=%(refname:short)%09%(*objectname)%09%(objectname)", "refs/tags/v*"]);
  if (r.code !== 0) return null;
  const all = r.out.split("\n").map((l) => l.trim().split("\t")).filter((x) => x.length === 3 && PRODUCT_TAG.test(x[0]))
    .map(([tag, peeled, obj]) => ({ tag, sha: peeled || obj })).sort((a, b) => Number(b.tag.slice(1)) - Number(a.tag.slice(1)));
  for (const v of all) {
    if (v.sha === rel.sha || !(await ancestor(d, v.sha, rel.sha))) continue;
    // the day GitHub's search starts from: a day before the commit, in UTC, so no zone leaves a PR out (prsOf picks)
    const ct = Number((await d.git(["log", "-1", "--format=%ct", v.sha])).out.trim()) || 0;
    const day = ct ? new Date((ct - 86_400) * 1000).toISOString().slice(0, 10) : "";
    return { ...v, day };
  }
  return null;
}

async function q6(d: GateTwoDeps, rel: Rel, v: Awaited<ReturnType<typeof lastProduct>>): Promise<Answer> {
  if (!v) return { n: 6, mark: "short", line: "no product release (v*) is in its history to roll back to" };
  const diff = await d.git(["diff", "--name-only", "--diff-filter=A", v.sha, rel.sha, "--", "sol/engine/src/convert/"]);
  if (diff.code !== 0) return { n: 6, mark: "not read", line: `the converter steps since ${v.tag} could not be read` };
  const steps = diff.out.split("\n").map((l) => l.trim()).filter((l) => /\/\d{4}-[^/]+\.ts$/.test(l)).map((l) => l.split("/").pop()!);
  if (!steps.length) return { n: 6, mark: "pass", line: `a rollback goes to ${v.tag} (${short(v.sha)}); no converter step was added since, so nothing saved needs putting back (not yet tried for real)` };
  return { n: 6, mark: "short", line: `a rollback goes to ${v.tag}, past ${plural(steps.length, "converter step")} it has to put back (${steps.join(", ")}, convert/back.ts)` };
}

async function q7(d: GateTwoDeps, repo: string, rel: Rel, v: Awaited<ReturnType<typeof lastProduct>>): Promise<{ answer: Answer; page?: string }> {
  if (!v) return { answer: { n: 7, mark: "not read", line: "no product release before it to say what changed since" } };
  const count = Number((await d.git(["rev-list", "--count", `${v.sha}..${rel.sha}`])).out.trim()) || 0;
  const log = await d.git(["log", "--first-parent", "--format=%s", `${v.sha}..${rel.sha}`]);
  if (log.code !== 0) return { answer: { n: 7, mark: "not read", line: `the history since ${v.tag} could not be read` } };
  const prs = prsOf(log.out.split("\n"));
  const known = new Map<number, { title?: string; body?: string }>();
  let titles = true;
  try {
    const got = JSON.parse(await d.gh(["pr", "list", "--repo", repo, "--state", "merged", ...(v.day ? ["--search", `merged:>=${v.day}`] : []), "--json", "number,title,body", "--limit", "1000"]) || "[]") as { number: number; title?: string; body?: string }[];
    for (const p of got) known.set(p.number, p);
  } catch { titles = false; }
  const changes = prs.map((n) => ({ number: n, title: known.get(n)?.title ?? "", try: tryOf(known.get(n)?.body ?? "") }));
  const page = pageOf(rel.tag, v.tag, count, changes);
  const file = join(d.root, ".sol-gate", "gate2", `${rel.tag}.md`);
  const first = changes.slice(0, 3).map((c) => `#${c.number} ${oneLine(c.title, 60)}`.trim()).join(" · ");
  const lead = `${plural(changes.length, "change")} (${plural(count, "commit")}) since ${v.tag}${first ? `: ${first}${changes.length > 3 ? " …" : ""}` : ""}`;
  if (d.dryRun) return { answer: { n: 7, mark: titles ? "pass" : "short", line: `would write .sol-gate/gate2/${rel.tag}.md, ${lead}` } };
  try { (d.write ?? ((f, t) => writeInGate(d.root, f, t)))(file, page); }
  catch (e) { return { answer: { n: 7, mark: "short", line: `the page was not written (${firstLine(String(e))}); ${lead}` } }; }
  return { answer: { n: 7, mark: titles ? "pass" : "short", line: `.sol-gate/gate2/${rel.tag}.md on this machine, ${lead}${titles ? "" : "; GitHub gave no titles"}` }, page: file };
}

// ---- the report ----

/** the release to report on: --tag, or the newest dev release a day old (pure over the list) */
export function pickRelease(all: Rel[], now: Date, zone: string, tag?: string): Rel | string {
  if (tag !== undefined) {
    if (!DEV_TAG.test(tag)) return `${tag || "that"} is not a dev release (a dev-* tag)`;
    return all.find((x) => x.tag === tag) ?? `${tag} is not a dev release here`;
  }
  return all.find((x) => aDayOld(x.made, now, zone)) ?? "no dev release is a day old yet";
}

/** gate two over one release, said on the open Night digest; never throws */
export async function gateTwo(d: GateTwoDeps, o: { repo: string; rhythm: Rhythm; tag?: string; again?: boolean }): Promise<Reported> {
  if (!REPO.test(o.repo)) return { error: `not a repository: ${o.repo}` };
  const fetched = await fetchAll(d, o.repo);
  if (fetched) d.say(`gate two: ${fetched} (going on with what is here)`);
  const rel = pickRelease(await devReleases(d), d.now(), o.rhythm.zone, o.tag);
  if (typeof rel === "string") return { error: rel };

  // it goes on the open Night digest; whether it was said already is asked of the recent ones too, open or closed: each
  // night has its own, and a release that stays the newest a day old for two nights is reported once
  // a report counts as there only when the runner wrote it and nobody edited it: anyone's look-alike line holds nothing back
  const by = (await d.by().catch(() => "")).trim();
  let open: number | undefined, had: { issue: number; id: string; at: number } | undefined;
  try {
    const found = JSON.parse(await d.gh(["issue", "list", "--repo", o.repo, "--state", "all", "--search", `"${DIGEST_TITLE}" in:title`, "--json", "number,title,state", "--limit", "10"]) || "[]") as { number: number; title?: string; state?: string }[];
    for (const i of found.filter((x) => String(x.title ?? "").trim() === DIGEST_TITLE)) {
      if (open === undefined && String(i.state ?? "").toUpperCase() === "OPEN") open = i.number;
      const cs = (JSON.parse(await d.gh(["issue", "view", String(i.number), "--repo", o.repo, "--json", "comments"]) || "{}") as { comments?: (PrComment & { url?: string })[] }).comments ?? [];
      for (const c of cs) {
        if (HEAD.exec(String(c.body ?? "").trimStart())?.[1] !== rel.tag) continue;
        if (!by || String(c.author?.login ?? "").toLowerCase() !== by.toLowerCase() || c.includesCreatedEdit === true || c.lastEditedAt) continue;
        const at = Date.parse(String(c.createdAt ?? "")) || 0;
        if (!had || at >= had.at) had = { issue: i.number, id: /#issuecomment-(\d+)$/.exec(String(c.url ?? ""))?.[1] ?? "", at };
      }
    }
  } catch (e) { return { error: `could not read the Night digests: ${firstLine(String((e as Error)?.message ?? e))}` }; }
  if (had && !o.again) {
    d.say(`gate two: ${rel.tag} has its report on #${had.issue} already; --again writes it anew`);
    return { ok: true, already: true, report: { tag: rel.tag, sha: rel.sha, answers: [], press: "none yet" } };
  }
  if (had && !had.id) return { error: `the report on #${had.issue} has no comment id GitHub gave back, so it cannot be written anew` };

  const v = await lastProduct(d, rel);
  const seven = await q7(d, o.repo, rel, v);
  const answers = [await q1(d, rel), q2(d, rel), await q3(d, o.repo, rel), await q4(d, rel, o.rhythm.zone), await q5(d, o.repo, rel), await q6(d, rel, v), seven.answer];
  let press: GateTwo["press"] = "none yet";
  try { press = pressOf((await readVerdicts(d, o.repo, o.rhythm.beta, backupOf(o.rhythm))).get(rel.tag), rel.made); }
  catch (e) { d.say(`gate two: Frank's press was not read (${firstLine(String((e as Error)?.message ?? e))})`); }
  const report: GateTwo = { tag: rel.tag, sha: rel.sha, answers, press, ...(seven.page ? { page: seven.page } : {}) };
  const body = reportOf(report, by);

  const on = had?.issue ?? open;
  if (on === undefined) { d.say(`gate two: no open "${DIGEST_TITLE}" issue to post on (the night job opens it)`); return { ok: true, report }; }
  if (d.dryRun) { d.say(`gate two: would ${had ? "write anew its comment" : "post"} on #${on}:\n${body.replace(/^/gm, "    ")}`); return { ok: true, report, dry: true }; }
  try {
    if (had) await d.gh(["api", "-X", "PATCH", `repos/${o.repo}/issues/comments/${had.id}`, "-f", `body=${body}`]);
    else await d.gh(["issue", "comment", String(on), "--repo", o.repo, "--body", body]);
  } catch (e) { return { error: `the report was not posted on #${on}: ${firstLine(String((e as Error)?.message ?? e))}` }; }
  d.say(`gate two: ${had ? "written anew" : "posted"} on #${on}`);
  return { ok: true, report, posted: on };
}

// ---- run as a program: node dist/team/gatetwo.js [--tag dev-…] [--again] [--dry-run] [--repo owner/name] ----

async function main(argv: string[]): Promise<number> {
  const r0 = await runnerOf(argv, "gate two");
  if (typeof r0 === "string") { console.error(r0); return 2; }
  const { root, git, gh, repo, rhythm, stop } = r0;
  try {
    const t = argv.indexOf("--tag");
    const tag = t >= 0 ? argv[t + 1] ?? "" : undefined;
    const dryRun = argv.includes("--dry-run");
    console.log(`gate two${dryRun ? " (dry run: nothing is posted or written)" : ""}, ${new Date().toISOString()}, ${repo}`);
    const { makeGithubRecord } = await import("./record.js");
    const { BETA_KEEP } = await import("./ship.js");
    const port = Number(process.env.SOL_PORT ?? 7777);
    const r = await gateTwo({
      root, git, gh, now: () => new Date(), dryRun, say: (l) => console.log(l),
      by: () => makeGithubRecord(gh).who.login(),
      runs: async () => ((await (await fetch(`http://127.0.0.1:${port}/runs`, { signal: AbortSignal.timeout(10_000) })).json()) as { words?: RunsWord[] }).words ?? [],
      keep: BETA_KEEP.length,
    }, { repo, rhythm, ...(tag !== undefined ? { tag } : {}), again: argv.includes("--again") });
    if (!r.ok) { console.error(`gate two: ${r.error}`); return 1; }
    if (!r.already) console.log(`gate two: ${r.report.tag}, ${r.report.answers.filter((a) => a.mark === "pass").length} of 7`);
    return 0;
  } finally { await stop(); }
}

const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(`gate two: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
}
