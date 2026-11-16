// "I'm on" and overlap, pushed (#432, part of #413, area C6). When someone takes an issue (sol/take), the others hear
// it at once, not at the night job: one `on` fact to each teammate, and to anyone whose open PR overlaps, an overlap
// fact instead, which they hear and the taker reads in Take's own answer at the same moment.
//   on        "on: #N <title> (<login>, <branch>)" to every teammate but me: the org's members (team.json `org`, else
//             the repository's owner when it is an org) and the authors of open PRs. Kind claim, no issue and no repo,
//             so a dial of "when it matters" keeps it for their agent and writes nothing on GitHub
//   overlap   another person's open PR that names the same issue, or whose files git's merge-tree says would clash with
//             my branch's (night.ts openPrs and findClashes, the night job's own). To them: kind claim (the issue) or
//             clash (files), on their issue, so their dial routes it as any claim or clash. To me: printed by Take.
// Every line is built here from typed parts, a fact (facts.ts); the issue's title is the one free text, quoted and cut,
// and left out when it does not read as a fact. At a first take the new branch is main, so only the same issue can
// overlap; files clash once the branch has commits (Take again on it, or the night job).
// Run as a program by sol/take: node dist/team/on.js <issue> <branch> [<title>]. GitHub, git and the relay are the
// deps below, so the tests fake them.
import { realpathSync } from "node:fs";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openPrs, findClashes, issueOf as namedIssue, readTeam, relayLink, type NightDeps, type Pr, type Clash, type Run } from "./night.js";
import { makeGithubRecord, runGh } from "./record.js";
import { loginsOf } from "./members.js";
import { activeRoom, mayAgentSpeak } from "./settings.js";
import { ownGhOnPath } from "./gh.js";
import type { PingKind } from "./pings.js";
import { notAFact } from "./facts.js";

export type On = { issue: number; title: string; branch: string; login: string };
export type Overlap = { login: string; pr: number; branch: string; issue: number; why: "issue" | "files"; files: string[] };
export type Push = { to: string; pingKind: PingKind; line: string; issue?: number; repo?: string };
export type OnDeps = Pick<NightDeps, "gh" | "git"> & {
  /** a relay ping, signed as my agent; false when it could not go */
  send?: (p: Push) => boolean | Promise<boolean>;
  /** the org whose members are the team ("" for none) */
  org: string;
};

const BOT = /\[bot\]$|^(?:github-actions|dependabot|renovate)$/i;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
/** one line of free text made safe to pass on: no control characters, one line, cut (pure) */
export const clip = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
/** the issue a branch made by Take names: its last part ends -N (pure) */
const branchIssue = (b: string) => Number((/-(\d{1,6})$/.exec(b.split("/").pop() ?? "") ?? [])[1]) || 0;
/** the issue a PR is about: what its body names ("Part of #n"), else its branch's number, else none (pure) */
export function prIssue(p: Pr): number {
  const n = namedIssue(p);
  return n !== p.number ? n : branchIssue(p.branch);
}
const files = (f: string[]) => (f.length > 3 ? `${f.slice(0, 3).join(", ")} and ${f.length - 3} more` : f.join(", "));

/** the `on` fact (pure) */
export function onLine(o: On): string {
  // the title is anyone's words (whoever wrote the issue): one that does not read as a fact is left out, under any rule
  const t = clip(o.title, 120);
  return `on: #${o.issue}${t && !notAFact(t) ? ` "${t}"` : ""} (${o.login}, ${clip(o.branch, 100)})`;
}

/** the overlap fact as the other person's agent hears it (pure) */
export function theirLine(o: On, x: Overlap): string {
  const what = x.why === "issue" ? `your #${x.pr} also names #${o.issue}` : `its files would clash with your #${x.pr}: ${files(x.files)}`;
  return `overlap: ${o.login} is now on #${o.issue} (${clip(o.branch, 100)}); ${what}.`.slice(0, 300);
}

/** the overlap fact as Take prints it for me (pure) */
export function myLine(o: On, x: Overlap): string {
  const what = x.why === "issue" ? `also names #${o.issue}` : `would clash with yours in ${files(x.files)}`;
  return `overlap: #${x.pr} (${x.login}, ${x.branch}) ${what}; ${x.login} is told now. Read it (gh pr diff ${x.pr}) and build on it, or say in your PR how yours differs.`;
}

/** the other people's PRs that overlap mine: the same issue, or files that would clash with my branch; one each, the
 *  issue first (pure) */
export function overlapsOf(o: On, prs: Pr[], clashes: Clash[]): Overlap[] {
  const theirs = (p: Pr) => p.branch !== o.branch && !same(p.login, o.login) && !BOT.test(p.login);
  const out = new Map<number, Overlap>();
  for (const p of prs) if (theirs(p) && prIssue(p) === o.issue)
    out.set(p.number, { login: p.login, pr: p.number, branch: p.branch, issue: o.issue, why: "issue", files: [] });
  for (const c of clashes) {
    if (!c.b) continue;   // against main: nobody else's
    const other = c.a.branch === o.branch ? c.b : c.b.branch === o.branch ? c.a : null;
    if (!other || !theirs(other)) continue;
    const had = out.get(other.number);
    if (had) { had.files = [...new Set([...had.files, ...c.files])]; continue; }
    out.set(other.number, { login: other.login, pr: other.number, branch: other.branch, issue: prIssue(other) || other.number, why: "files", files: c.files });
  }
  return [...out.values()];
}

/** who hears `on`: the org's members and the authors of open PRs, never me, never a bot (pure) */
export function othersOf(me: string, org: string[], prs: Pr[]): string[] {
  return loginsOf([...org, ...prs.map((p) => p.login)].join(" ")).filter((l) => !same(l, me) && !BOT.test(l));
}

/** the whole move: fetch, read the open PRs and the clashes with my branch, push `on` and the overlaps; gives back the
 *  overlaps (for Take to print) and whom it told */
export async function onNow(d: OnDeps, o: On): Promise<{ overlaps: Overlap[]; told: string[]; missed: string[] }> {
  await d.git(["fetch", "-q", "--prune", "origin"]);
  const prs = await openPrs(d);
  // my branch with no PR yet is still mine: weighed against the others as if it were one (number 0)
  const mine: Pr = prs.find((p) => p.branch === o.branch) ?? { number: 0, branch: o.branch, login: o.login, title: o.title, body: `Part of #${o.issue}`, isDraft: true };
  const all = prs.some((p) => p.branch === o.branch) ? prs : [...prs, mine];
  const clashes = await findClashes(d, all, { only: (p) => p.branch === o.branch }).catch(() => [] as Clash[]);
  const overlaps = overlapsOf(o, prs, clashes);
  const org = d.org ? loginsOf(await makeGithubRecord(d.gh).members.ofOrg(d.org).catch(() => "")) : [];
  const repo = (await makeGithubRecord(d.gh).members.room().catch(() => "")).trim();
  const told: string[] = [], missed: string[] = [];
  if (!d.send) return { overlaps, told, missed };
  const hit = new Set(overlaps.map((x) => x.login.toLowerCase()));
  const go = async (p: Push) => ((await d.send!(p)) ? told : missed).push(p.to);
  for (const x of overlaps)
    await go({ to: x.login, pingKind: x.why === "files" ? "clash" : "claim", line: theirLine(o, x), ...(x.issue ? { issue: x.issue } : {}), ...(repo ? { repo } : {}) });
  for (const to of othersOf(o.login, org, prs)) if (!hit.has(to.toLowerCase())) await go({ to, pingKind: "claim", line: onLine(o) });
  return { overlaps, told: [...new Set(told)], missed: [...new Set(missed)] };
}

// ---- run as a program: node dist/team/on.js <issue> <branch> [<title>], from sol/take, in the repository ----

async function main(argv: string[]) {
  const [n, branch, ...rest] = argv;
  const issue = Number(n);
  if (!Number.isInteger(issue) || issue <= 0 || !branch) { console.error("on: node on.js <issue> <branch> [<title>]"); process.exit(2); }
  const root = process.cwd();
  ownGhOnPath();
  const team = readTeam();
  const gh = (args: string[]) => runGh(args, root);
  const git = (args: string[]) => new Promise<Run>((ok) =>
    execFile("git", args, { cwd: root, timeout: 120_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
      (err, out, errOut) => ok({ code: err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 128) : 0, out: String(out) || String(errOut) })));
  const rec = makeGithubRecord(gh);
  const login = team.me.login || (await rec.who.login().catch(() => "")).trim();
  if (!login) { console.error("on: gh is not signed in"); process.exit(2); }
  const repo = (await rec.members.room().catch(() => "")).trim();
  const owner = repo.split("/")[0] ?? "";
  // the team: team.json's org, else the repository's owner when GitHub says it is an org
  const org = team.org || (owner && (await gh(["api", `orgs/${owner}`, "--jq", ".login"]).catch(() => "")).trim() ? owner : "");
  const may = mayAgentSpeak(team, "cowork");
  const relay = may ? await relayLink(login, activeRoom(team).code) : null;
  try {
    const r = await onNow({ gh, git, org, ...(relay ? { send: (p) => relay.send("ping", { ...p }) } : {}) }, { issue, title: rest.join(" "), branch, login });
    for (const x of r.overlaps) console.log(`take: ${myLine({ issue, title: "", branch, login }, x)}`);
    if (!may) console.log("take: my agent may not speak in Cowork (Settings, my agent): nobody was told; the night job says the clashes");
    else if (!relay) console.log("take: the team relay is not in sight: nobody was told now; the night job says the clashes");
    else console.log(`take: told ${r.told.length ? r.told.join(", ") : "nobody (no teammate known)"} that you are on #${issue}${r.missed.length ? `; could not reach ${r.missed.join(", ")}` : ""}`);
  } finally {
    if (relay) { await new Promise((ok) => setTimeout(ok, 500)); relay.stop(); }   // the last pings leave before the socket closes
  }
}

const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((e) => { console.error(`on: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
}
