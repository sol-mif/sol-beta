// The night job (#99, docs/how-we-work/PRD.md sections 7, 10 and 12): one run a night on the always-on machine (the
// NucBox's live checkout, by sol-night.timer), nowhere else. It fetches origin and reads origin/<branch> refs only,
// never checking anything out, then does three things and writes each to GitHub the moment it happens:
//   clashes  every pair of open PR branches (and each against main) merged in memory by git's own merge-tree; a
//            predicted conflict is one comment on each of the two issues the PRs name, never the same one twice
//   claims   an issue wearing `now` whose branch has no commit and whose issue has no word for staleDays loses `now`
//   digest   one comment a night on the open issue "Night digest" (label cowork): what landed, what is open, who
//            holds what
// and the two rules of the leads (#118, leads.ts), read off origin/main's .github/CODEOWNERS:
//   routing  an open issue wearing one of the six labels gets its missing leads assigned and pinged
//   flags    a PR merged since the last digest without its labels' leads' word gets one signed line and a ping
// and done issues (#440): one a PR merged since the last run says it fixes, left open, is closed with a signed line.
// Run by hand: bash sol/night --dry-run (prints what it would post, posts nothing). The hour and the days are team
// values, `night` in sol/engine/team.json. GitHub and git are the deps below, so the tests fake them.
import { readFileSync, realpathSync } from "node:fs";
import { execFile } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanTeam, readTeam as fromDisk, activeRoom, type TeamSettings } from "./settings.js";
import { sign } from "./note.js";
import { makeGithubRecord, runGh } from "./record.js";
import { ghHelper, ownGhOnPath } from "./gh.js";
import { owners, type Owners } from "./claims.js";
import { leads, routeIssues, mergeFlag, flagText, FLAG, type Leads, type MergedPr, type OpenIssue } from "./leads.js";
import type { PingKind } from "./pings.js";
import { nightFileBeside, nightNow } from "./nightfile.js";

export type Run = { code: number; out: string };
export type NightDeps = {
  gh: (args: string[]) => Promise<string>;   // the GitHub CLI, in the checkout (gh's own sign-in)
  git: (args: string[]) => Promise<Run>;     // never throws: the exit code is part of the answer (merge-tree: 1 = a clash)
  login: string;                             // whose agent signs
  now: () => Date;
  dryRun: boolean;
  say: (line: string) => void;               // what the run prints
  /** a relay ping to a teammate (the hub keeps it while none of their Sols is on); false when it could not go */
  ping?: (p: { to: string; kind: PingKind; line: string; issue: number }) => boolean | Promise<boolean>;
};
export type Pr = { number: number; branch: string; login: string; title: string; body: string; isDraft: boolean };
export type Clash = { a: Pr; b: Pr | null; files: string[] };   // b null: a against main
export type Claim = { issue: number; title: string; login: string };
type Comment = { body: string; at: string; login: string };

const DAY = 86_400_000;
const TITLE = "Night digest";
export const nightSign = (login: string) => `${sign(login)} (night job)`;

/** the issue a PR names ("Part of #n", "Fixes #n", ...), else the PR itself */
export function issueOf(pr: Pr): number {
  const m = /\b(?:part of|fixes|fixed|fix|closes|closed|close|resolves|resolved|resolve)\s+#(\d+)/i.exec(pr.body ?? "");
  return m ? Number(m[1]) : pr.number;
}

/** every pair once, the lower number first */
export function pairs<T extends { number: number }>(xs: T[]): [T, T][] {
  const s = [...xs].sort((x, y) => x.number - y.number);
  const out: [T, T][] = [];
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) out.push([s[i], s[j]]);
  return out;
}

/** `git merge-tree --write-tree --name-only --no-messages`: 0 is clean, 1 lists the conflicted files after the tree */
export function parseMergeTree(r: Run): string[] {
  if (r.code === 0) return [];
  if (r.code !== 1) throw new Error(`git merge-tree failed: ${r.out.trim().split("\n")[0] || `exit ${r.code}`}`);
  const lines = r.out.split("\n").slice(1);
  const end = lines.findIndex((l) => !l.trim());
  return [...new Set((end < 0 ? lines : lines.slice(0, end)).map((l) => l.trim()).filter(Boolean))].sort();
}

/** git 2.38 is the first with merge-tree --write-tree */
export function gitOk(version: string): boolean {
  const m = /(\d+)\.(\d+)/.exec(version);
  return !!m && (Number(m[1]) > 2 || (Number(m[1]) === 2 && Number(m[2]) >= 38));
}

const who = (p: Pr) => `#${p.number} (${p.login}, ${p.branch})`;
export function clashText(c: Clash, login: string): string {
  const files = c.files.join(", ");
  if (!c.b) return `**Clash predicted** between ${who(c.a)} and main on: ${files}. Bring main into your branch and settle it there.\n\n${nightSign(login)}`;
  return `**Clash predicted** between ${who(c.a)} and ${who(c.b)} on: ${files}. One of you builds on the other's branch or waits.\n\n${nightSign(login)}`;
}
/** the same pair on the same files was already said there */
export function saidBefore(c: Clash, comments: { body: string }[]): boolean {
  const on = `on: ${c.files.join(", ")}.`;
  return comments.some((x) => x.body.includes("**Clash predicted**") && x.body.includes(`#${c.a.number} (`) &&
    x.body.includes(c.b ? `#${c.b.number} (` : " and main on:") && x.body.includes(on));
}

/** stale: nothing from the person (a commit, a word, the claim itself) for days */
export function isStale(last: (string | undefined)[], now: Date, days: number): boolean {
  const t = Math.max(0, ...last.filter(Boolean).map((x) => Date.parse(x!)).filter((n) => !Number.isNaN(n)));
  return now.getTime() - t > days * DAY;
}
/** the newest branch on origin made by Take for this issue (<first>/<label>-...-<n>) */
export function branchOf(issue: number, refs: { ref: string; at: string }[]): { ref: string; at: string } | undefined {
  const re = new RegExp(`^origin/[^/]+/.+-${issue}$`);
  return refs.filter((r) => re.test(r.ref)).sort((x, y) => Date.parse(y.at) - Date.parse(x.at))[0];
}

const stamp = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
const list = (xs: string[], max = 12) => (!xs.length ? "none" : xs.slice(0, max).join("; ") + (xs.length > max ? `; and ${xs.length - max} more` : ""));
export function digestText(o: {
  login: string; now: Date; since: Date;
  merged: { number: number; title: string; login: string }[];
  opened: { number: number; title: string; login: string }[];
  waiting: Pr[]; clashes: Clash[]; dropped: Claim[]; holds: Claim[];
}): string {
  const pr = (p: { number: number; title: string; login: string }) => `#${p.number} ${p.title} (${p.login})`;
  return [
    `**Night digest**, ${o.now.toISOString().slice(0, 10)} (since ${stamp(o.since)})`,
    "",
    `Merged into main: ${list(o.merged.map(pr))}`,
    `Opened, still open: ${list(o.opened.filter((p) => !o.merged.some((m) => m.number === p.number)).map(pr))}`,
    `Waiting for review: ${list(o.waiting.map((p) => `#${p.number} (${p.login})`))}`,
    `Clashes found: ${list(o.clashes.map((c) => `#${c.a.number} and ${c.b ? `#${c.b.number}` : "main"} on ${c.files.join(", ")}`))}`,
    `Claims dropped: ${list(o.dropped.map((c) => `#${c.issue} (${c.login})`))}`,
    `Who holds what: ${o.holds.length ? "" : "nobody"}`,
    ...o.holds.map((c) => `- #${c.issue} ${c.title}: ${c.login}`),
    "",
    nightSign(o.login),
  ].join("\n");
}

// ---- the run ----

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const json = <T>(s: string): T[] => lines(s).map((l) => JSON.parse(l) as T);
const rec = (d: Pick<NightDeps, "gh">) => makeGithubRecord(d.gh);

async function comments(d: NightDeps, n: number): Promise<Comment[]> {
  return json<Comment>(await rec(d).notes.lines(n));
}
async function post(d: NightDeps, n: number, body: string) {
  if (d.dryRun) { d.say(`would post on #${n}:\n${body.replace(/^/gm, "    ")}`); return; }
  await rec(d).notes.post(n, body);
  d.say(`posted on #${n}`);
}

export async function openPrs(d: Pick<NightDeps, "gh">): Promise<Pr[]> {   // also "I'm on" (#432, on.ts)
  const raw = JSON.parse(await rec(d).code.openPrs() || "[]") as
    { number: number; headRefName: string; author?: { login?: string }; title: string; body?: string; isDraft?: boolean }[];
  return raw.map((p) => ({ number: p.number, branch: p.headRefName, login: p.author?.login ?? "?", title: p.title, body: p.body ?? "", isDraft: !!p.isDraft }));
}

/** `o.base`: the branch PRs fold into (main by default); `o.only`: only the clashes that touch these PRs (the hand-in
 *  session, #420, asks for one person's), so the pairs of two other people's PRs are never merged */
export async function findClashes(d: Pick<NightDeps, "git">, prs: Pr[], o: { base?: string; only?: (p: Pr) => boolean } = {}): Promise<Clash[]> {
  const here: Pr[] = [];
  for (const p of prs) if (p.branch && (await d.git(["rev-parse", "--verify", "-q", `origin/${p.branch}`])).code === 0) here.push(p);
  const mt = async (x: string, y: string) => parseMergeTree(await d.git(["merge-tree", "--write-tree", "--name-only", "--no-messages", x, y]));
  const out: Clash[] = [];
  const withMain = new Map<number, string[]>();
  for (const p of here) {
    const files = await mt(`origin/${o.base ?? "main"}`, `origin/${p.branch}`);
    withMain.set(p.number, files);
    if (files.length && (!o.only || o.only(p))) out.push({ a: p, b: null, files });
  }
  // a file one side already fights main over is said once, against main, not again for every pair
  for (const [a, b] of pairs(here)) {
    if (o.only && !o.only(a) && !o.only(b)) continue;
    const known = new Set([...(withMain.get(a.number) ?? []), ...(withMain.get(b.number) ?? [])]);
    const files = (await mt(`origin/${a.branch}`, `origin/${b.branch}`)).filter((f) => !known.has(f));
    if (files.length) out.push({ a, b, files });
  }
  return out;
}

export async function postClashes(d: NightDeps, clashes: Clash[]): Promise<number> {
  const seen = new Map<number, Comment[]>();
  let n = 0;
  for (const c of clashes) {
    for (const issue of [...new Set([issueOf(c.a), ...(c.b ? [issueOf(c.b)] : [])])]) {
      if (!seen.has(issue)) seen.set(issue, await comments(d, issue));
      if (saidBefore(c, seen.get(issue)!)) { d.say(`already said on #${issue}: ${c.a.number} and ${c.b ? c.b.number : "main"}`); continue; }
      const body = clashText(c, d.login);
      await post(d, issue, body);
      seen.get(issue)!.push({ body, at: d.now().toISOString(), login: d.login });
      n++;
    }
  }
  return n;
}

export async function staleClaims(d: NightDeps, days: number): Promise<{ dropped: Claim[]; holds: Claim[] }> {
  const issues = JSON.parse(await rec(d).cards.held() || "[]") as
    { number: number; title: string; assignees?: { login: string }[] }[];
  const refs = lines((await d.git(["for-each-ref", "--format=%(refname:short) %(committerdate:iso-strict)", "refs/remotes/origin"])).out)
    .map((l) => { const [ref, at] = l.split(" "); return { ref, at }; });
  const dropped: Claim[] = [], holds: Claim[] = [];
  for (const i of issues) {
    const people = (i.assignees ?? []).map((a) => a.login).filter(Boolean);
    if (!people.length) continue;
    const claim: Claim = { issue: i.number, title: i.title, login: people.join(", ") };
    const words = (await comments(d, i.number)).filter((c) => !c.body.includes("(night job)")).map((c) => c.at);
    const taken = lines(await rec(d).cards.takenAt(i.number));
    if (!isStale([branchOf(i.number, refs)?.at, ...words, ...taken], d.now(), days)) { holds.push(claim); continue; }
    if (d.dryRun) d.say(`would take \`now\` off #${i.number}`);
    else await rec(d).cards.unlabel(i.number, "now");
    await post(d, i.number, `**Claim dropped**: no commit or word in ${days} days; Take it again when you pick it up.\n\n${nightSign(d.login)}`);
    dropped.push(claim);
  }
  return { dropped, holds };
}

/** the digest issue and when the night job last spoke there: the last run (a day ago when there is none) */
export async function lastRun(d: NightDeps): Promise<{ n: number; since: Date }> {
  const found = JSON.parse(await rec(d).cards.find(TITLE) || "[]") as
    { number: number; title: string }[];
  const n = found.find((i) => i.title.trim() === TITLE)?.number ?? 0;
  const last = n ? (await comments(d, n)).filter((c) => c.body.includes("(night job)")).map((c) => c.at).sort().pop() : undefined;
  return { n, since: last ? new Date(last) : new Date(d.now().getTime() - DAY) };
}
const isoOf = (since: Date) => since.toISOString().replace(/\.\d+Z$/, "Z");

/** the PRs merged since a moment, with who merged, the reviews, the files and the body (the flag's read; the digest's
 * list; the done issues) */
export async function mergedSince(d: NightDeps, since: Date): Promise<(MergedPr & { body: string })[]> {
  type P = { number: number; title: string; body?: string; author?: { login?: string }; mergedBy?: { login?: string } | null;
    reviews?: { author?: { login?: string }; state?: string; submittedAt?: string }[]; files?: { path?: string }[] };
  const raw = JSON.parse(await rec(d).code.prSearch("merged", `merged:>=${isoOf(since)}`, "number,title,author,mergedBy,reviews,files,body") || "[]") as P[];
  return raw.map((p) => ({
    number: p.number, title: p.title, body: p.body ?? "", author: p.author?.login ?? "?", mergedBy: p.mergedBy?.login ?? "",
    files: (p.files ?? []).map((f) => String(f.path ?? "")).filter(Boolean),
    reviews: (p.reviews ?? []).map((r) => ({ login: r.author?.login ?? "", state: String(r.state ?? ""), at: r.submittedAt })),
  }));
}

export async function digest(d: NightDeps, o: { prs: Pr[]; clashes: Clash[]; dropped: Claim[]; holds: Claim[]; last?: { n: number; since: Date }; merged?: MergedPr[] }): Promise<string> {
  const last = o.last ?? await lastRun(d);
  let n = last.n;
  const since = last.since;
  const now = d.now();
  const iso = isoOf(since);
  type P = { number: number; title: string; author?: { login?: string } };
  const flat = (s: string) => (JSON.parse(s || "[]") as P[]).map((p) => ({ number: p.number, title: p.title, login: p.author?.login ?? "?" }));
  const merged = o.merged ? o.merged.map((p) => ({ number: p.number, title: p.title, login: p.author }))
    : flat(await rec(d).code.prSearch("merged", `merged:>=${iso}`, "number,title,author"));
  const opened = flat(await rec(d).code.prSearch("all", `created:>=${iso}`, "number,title,author"));
  const body = digestText({ login: d.login, now, since, merged, opened, waiting: o.prs.filter((p) => !p.isDraft), clashes: o.clashes, dropped: o.dropped, holds: o.holds });
  if (!n) {
    if (d.dryRun) { d.say(`would open the issue "${TITLE}" (label cowork) and post there:\n${body.replace(/^/gm, "    ")}`); return body; }
    const url = await rec(d).cards.open(TITLE, "cowork",
      `One comment a night from the night job (sol/night, docs/how-we-work/PRD.md section 7): what landed, what clashes, who holds what.\n\n${nightSign(d.login)}`);
    n = Number(/\/issues\/(\d+)/.exec(url)?.[1] ?? 0);
    if (!n) throw new Error(`could not open the digest issue: ${url.trim()}`);
  }
  await post(d, n, body);
  return body;
}

/** CODEOWNERS as main has it (fetched, never checked out): the paths' labels and the labels' leads */
export async function codeownersOnMain(d: NightDeps): Promise<{ own: Owners; leads: Leads }> {
  const r = await d.git(["show", "origin/main:.github/CODEOWNERS"]);
  const text = r.code === 0 ? r.out : "";
  return { own: owners(text), leads: leads(text) };
}

/** routing: every open issue with one of the six labels gets its missing leads (leads.ts) */
export async function routeAll(d: NightDeps, l: Leads): Promise<number> {
  const raw = JSON.parse(await rec(d).cards.openIssues() || "[]") as
    { number: number; title: string; labels?: { name: string }[]; assignees?: { login: string }[] }[];
  const issues: OpenIssue[] = raw.map((i) => ({ number: i.number, title: i.title, labels: (i.labels ?? []).map((x) => x.name), assignees: (i.assignees ?? []).map((a) => a.login) }));
  const done = await routeIssues({ gh: d.gh, repo: "{owner}/{repo}", dryRun: d.dryRun, say: d.say, ping: d.ping }, issues, l);
  return done.length;
}

/** the PR body's risk (the risk-rating skill's `**Risk:** <level>` line), "" when it has none */
export function riskLine(body: string): string {
  return (/\*\*Risk:\*\*\s*(critical|high|medium|low)\b/i.exec(body ?? "")?.[1] ?? "").toLowerCase();
}
/** the night press took it in (#544): the press's own comment on the PR (tonight.ts prComment "fold", sentback.ts
 * the re-check), written by the login that merged it, so the same words from anyone else count for nothing */
export function nightPressed(p: Pick<MergedPr, "mergedBy">, cs: Comment[]): boolean {
  const by = p.mergedBy.replace(/\[bot\]$/i, "").toLowerCase();
  return !!by && cs.some((c) => (c.login ?? "").toLowerCase() === by
    && /^\*\*(?:Into [^*\n]+\*\* in the dev review of |Re-checked\*\*, and into )/.test(c.body ?? ""));
}
/** the night press counts as the lead's read on a small PR (Marco 2026-10-31, #544): low or medium risk, or no Risk
 * line at all; a high or critical one is still flagged */
export const pressCovers = (p: Pick<MergedPr, "mergedBy"> & { body?: string }, cs: Comment[]) =>
  !["high", "critical"].includes(riskLine(p.body ?? "")) && nightPressed(p, cs);

/** the flags: each PR merged since the last run without its leads' word, one signed line (never twice) and a ping to
 * the leads and the author. A small PR the night press took in is not flagged (#544) */
export async function flagMerges(d: NightDeps, merged: (MergedPr & { body?: string })[], own: Owners, l: Leads): Promise<number> {
  let n = 0;
  for (const p of merged) {
    const f = mergeFlag(p, own, l);
    if (!f) continue;
    const cs = await comments(d, p.number);
    if (cs.some((c) => c.body.includes(FLAG))) { d.say(`already flagged #${p.number}`); continue; }
    if (pressCovers(p, cs)) { d.say(`#${p.number} went in by the night press: the lead's read`); continue; }
    await post(d, p.number, `${flagText(f)}\n\n${nightSign(d.login)}`);
    const line = `#${p.number} ${p.title} was merged without the lead's approval (${f.unmet.map((u) => u.label).join(", ")})`.slice(0, 300);
    const to = [...new Set([...f.unmet.flatMap((u) => u.leads), p.author].filter((x) => x && x !== "?"))];
    for (const who of to) {
      if (d.dryRun) { d.say(`would ping ${who} (decision): ${line}`); continue; }
      if (!(d.ping && await d.ping({ to: who, kind: "decision", line, issue: p.number }))) d.say(`${who} not pinged: the relay is not in sight`);
    }
    n++;
  }
  return n;
}

/** the issues a PR body says it finishes ("Fixes #n", "Closes #n", "Resolves #n"; never "Part of #n") */
export function fixedIssues(body: string): number[] {
  const re = /\b(?:fix|fixes|fixed|close|closes|closed|resolve|resolves|resolved)\s+#(\d+)\b/gi;
  return [...new Set([...(body ?? "").matchAll(re)].map((m) => Number(m[1])))];
}

/** done issues (#440): an issue a PR merged since the last run says it fixes, still open (GitHub closes on the default
 * branch only), is closed with one signed line naming the PR. Only merges since the last run, so a reopen stays. */
export async function closeFixed(d: NightDeps, merged: { number: number; body?: string }[]): Promise<number> {
  let n = 0;
  for (const p of merged) {
    for (const i of fixedIssues(p.body ?? "")) {
      if (i === p.number) continue;
      const state = (await d.gh(["issue", "view", String(i), "--json", "state", "--jq", ".state"]).catch(() => "")).trim();
      if (state !== "OPEN") continue;
      const body = `Closed: #${p.number} fixes it and was merged.\n\n${nightSign(d.login)}`;
      if (d.dryRun) { d.say(`would close #${i} (fixed by #${p.number})`); n++; continue; }
      await d.gh(["issue", "close", String(i), "--comment", body]);
      d.say(`closed #${i} (fixed by #${p.number})`);
      n++;
    }
  }
  return n;
}

/** the whole night: fetch, routing, clashes, claims, flags, done issues, digest; a line for each step */
export async function night(d: NightDeps, o: { staleDays: number }): Promise<void> {
  const v = (await d.git(["--version"])).out;
  if (!gitOk(v)) throw new Error(`this git is too old for the night job (${v.trim() || "unknown"}); it needs git 2.38 or newer for merge-tree --write-tree`);
  // the live checkout has no key of its own on GitHub: then fetch over https with gh's sign-in
  let f = await d.git(["fetch", "-q", "--prune", "origin"]);
  if (f.code !== 0) {
    const repo = (await rec(d).members.room()).trim();
    f = await d.git([...ghHelper(), "fetch", "-q", "--prune",
      `https://github.com/${repo}.git`, "+refs/heads/*:refs/remotes/origin/*"]);
    if (f.code !== 0) throw new Error(`could not fetch origin: ${f.out.trim().split("\n")[0]}`);
  }
  const { own, leads: l } = await codeownersOnMain(d);
  const named = Object.values(l).filter((x) => x.length).length;
  if (!named) d.say("CODEOWNERS on main names no lead: nothing routed, nothing flagged");
  else d.say(`${await routeAll(d, l)} issues ${d.dryRun ? "would be routed" : "routed"} to their leads`);
  const prs = await openPrs(d);
  const clashes = await findClashes(d, prs);
  d.say(`${prs.length} open PRs, ${clashes.length} clashes predicted`);
  const posted = await postClashes(d, clashes);
  d.say(`${posted} clash comments ${d.dryRun ? "would be posted" : "posted"}`);
  const { dropped, holds } = await staleClaims(d, o.staleDays);
  d.say(`${holds.length} claims held, ${dropped.length} dropped`);
  const last = await lastRun(d);
  const merged = await mergedSince(d, last.since);
  const flagged = named ? await flagMerges(d, merged, own, l) : 0;
  d.say(`${merged.length} merged since the last run, ${flagged} ${d.dryRun ? "would be flagged" : "flagged"} for no lead's approval`);
  const closed = await closeFixed(d, merged);
  d.say(`${closed} done issues ${d.dryRun ? "would be closed" : "closed"}`);
  await digest(d, { prs, clashes, dropped, holds, last, merged });
}

// ---- run as a program: node dist/team/night.js [--dry-run] [--hour] ----

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEAM_FILE = () => process.env.SOL_TEAM ?? process.env.SOL_TEAM_FILE ?? join(ENGINE, "team.json");
export function readTeam(): TeamSettings {
  try { return fromDisk(JSON.parse(readFileSync(TEAM_FILE(), "utf8"))); }
  catch { return cleanTeam({}); }
}

async function main(argv: string[]) {
  const team = readTeam();
  // the hour and the still-claim days are the project's rhythm (#428): night.json beside team.json, which the engine
  // keeps as the project's record says (nightfile.ts); 3:00 and 7 days when there is none
  const nightly = nightNow(nightFileBeside(TEAM_FILE()), TEAM_FILE());
  if (argv.includes("--hour")) { process.stdout.write(`${nightly.hour}\n`); return; }
  const root = resolve(ENGINE, "..", "..");
  ownGhOnPath();   // a job's PATH is short too: Sol's own gh, as the engine finds it (gh.ts)
  const dryRun = argv.includes("--dry-run") || !team.speak.github;
  if (!team.speak.github && !argv.includes("--dry-run")) console.log("my agent may not speak on GitHub (Settings, my agent): a dry run, nothing is posted");
  const gh = (args: string[]) => runGh(args, root);
  const git = (args: string[]) => new Promise<Run>((ok) =>
    execFile("git", args, { cwd: root, timeout: 120_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
      (err, out, errOut) => ok({ code: err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 128) : 0, out: String(out) || String(errOut) })));
  const login = team.me.login || (await makeGithubRecord(gh).who.login()).trim();
  console.log(`night job${dryRun ? " (dry run: nothing is posted)" : ""}, ${new Date().toISOString()}, as ${login}'s agent, claims still after ${nightly.staleDays} days`);
  const relay = dryRun ? null : relayPinger(login, activeRoom(team).code);
  try {
    await night({ gh, git, login, now: () => new Date(), dryRun, say: (l) => console.log(l), ...(relay ? { ping: relay.ping } : {}) }, { staleDays: nightly.staleDays });
  } finally { await relay?.close(); }
}

/** one relay connection for a job that runs alone (the night, the release runner #418): signed as `login`'s agent in the
 *  room whose share code is `room` (#157), null when the relay is not in sight within ten seconds */
export async function relayLink(login: string, room = ""): Promise<{ send: (kind: "ping" | "stable", p: Record<string, unknown>) => boolean; stop: () => void } | null> {
  const { RelayClient, relayUrl, relayAuth } = await import("./relay.js");
  const c = new RelayClient(() => relayUrl(), () => ({ login, state: "away" as const, room }), "night", () => relayAuth());
  c.start();
  const ok = await new Promise<boolean>((done) => {
    if (c.up) return done(true);
    const t = setTimeout(() => { off(); done(false); }, 10_000);
    const off = c.onStatus(() => { if (c.up) { clearTimeout(t); off(); done(true); } });
  });
  if (!ok) { c.stop(); return null; }
  return { send: (kind, p) => c.send(kind, p, true), stop: () => c.stop() };
}

/** the night's pings: one relay connection, opened at the first ping (the hub, this machine's engine, keeps a ping for
 * a person none of whose Sols is on), closed at the end of the run */
function relayPinger(login: string, room = "") {   // room: the share code of the room it reads (#157), so a ping meets its person there
  let up: Promise<{ send: (p: Record<string, unknown>) => boolean; stop: () => void } | null> | null = null;
  const open = async () => {
    const c = await relayLink(login, room);
    if (!c) { console.log("the relay is not in sight: no pings tonight"); return null; }
    const repo = (await makeGithubRecord((args) => runGh(args, resolve(ENGINE, "..", ".."))).members.room().catch(() => "")).trim();
    return { send: (p: Record<string, unknown>) => c.send("ping", { ...p, ...(repo ? { repo } : {}) }), stop: () => c.stop() };
  };
  return {
    ping: async (p: { to: string; kind: PingKind; line: string; issue: number }) => {
      const c = await (up ??= open());
      return !!c && c.send({ to: p.to, pingKind: p.kind, line: p.line, issue: p.issue });
    },
    close: async () => {
      const c = up ? await up : null;
      if (!c) return;
      await new Promise((r) => setTimeout(r, 500));   // the last pings leave before the socket closes
      c.stop();
    },
  };
}

const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((e) => { console.error(`night job: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
}
