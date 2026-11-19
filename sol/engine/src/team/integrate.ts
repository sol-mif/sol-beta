// The nightly integration (#1153, one definitive version): the night job (night.ts) predicts clashes pair by pair with
// merge-tree; this is the other half, everyone's open PRs into one tree, in order, the way main will take them. Run on
// the NucBox by sol-integrate.timer two hours before the release (after the night job and the night pass, before the
// cut), from the live checkout:
//   the tree   a scratch worktree at STATE_DIR/integrate (~/.local/share/sol/integrate/ on Linux), made once by `git
//              worktree add --detach` of the checkout it runs from and reused; each run resets it to a local branch
//              `integrate` at origin/main. The open PRs against main from the team's own repository (no forks), the
//              ready ones first, then the drafts, each by number, are merged into it one after the other (--no-ff)
//   a clash    a merge that conflicts is aborted and the run goes on. Its other side is the PR(s) merged earlier in
//              this run whose changes touch the conflicted files, else main. Each clash between two PRs is one comment
//              on the later PR naming both owners, with each side's change to each file, marked so it is said once per
//              pair of heads, and one `decision` ping to each owner with the comment's link (night.ts's relay,
//              release.ts runnerOf). A clash with main is written in the word only: one owner, and GitHub already says
//              the PR cannot merge
//   the word   STATE_DIR/integrate.json: { at, base, merged: [n], clashes: [{ a, b, files }] }, a null `a` for main
// It never pushes, never merges into anything but its own local `integrate` branch, and never touches the release, a
// tag or dev: a clash is a card for two people, never a hold on the release. --dry-run (and Settings, my agent, with
// GitHub off) posts and pings nothing; the merging is local and runs either way.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { STATE_DIR } from "../work/state.js";
import { sign } from "./note.js";
import { makeGithubRecord } from "./record.js";
import { ghHelper } from "./gh.js";
import { readTeam, type Run } from "./night.js";
import { calendarOf, firstLine, runnerOf } from "./release.js";
import type { Rhythm } from "./tonight.js";

export type IntegrateDeps = {
  git: (args: string[], cwd?: string) => Promise<Run>;   // never throws; cwd: the checkout (default) or the scratch tree
  gh: (args: string[]) => Promise<string>;
  login: string;                                         // whose agent signs and merges
  now: () => Date;
  dryRun: boolean;
  say: (line: string) => void;
  /** a relay ping to an owner; false when it could not go */
  ping?: (p: { to: string; kind: "decision"; line: string; issue: number }) => boolean | Promise<boolean>;
};
export type OpenPr = { number: number; branch: string; sha: string; login: string; title: string; isDraft: boolean };
export type IntegrationClash = { a: OpenPr | null; b: OpenPr; files: string[] };
export type Integration = { at: string; base: string; merged: number[]; clashes: { a: number | null; b: number; files: string[] }[] };

export const TREE = join(STATE_DIR, "integrate");
export const OUT = join(STATE_DIR, "integrate.json");
const BRANCH = "integrate";
/** a side's diff of one file in the comment, at most so many lines; at most so many files a clash */
const DIFF_LINES = 60, FILES_SHOWN = 8;
/** new cards a run (clashes between two PRs), at most: the rest wait for the next night. GitHub's secondary rate limit stopped the night job
 *  after a burst of comments (2026-11-12, the registry's day/night); a first run over a long-open list finds dozens */
export const CARDS_A_RUN = 10;
export const SETTLE = "A person's word settles it: say here which side stays, or rebase one on the other. This never holds the release.";

// ---- pure ----

/** the timer's OnCalendar: two hours before the rhythm's release, in its zone (pure) */
export function integrateCalendar(r: Pick<Rhythm, "release" | "zone">): string {
  const [h, m] = r.release.split(":").map(Number);
  const t = (((h * 60 + m - 120) % 1440) + 1440) % 1440;
  return calendarOf({ release: `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`, zone: r.zone });
}

/** the order of the run (pure): the ready PRs first, then the drafts, each by number */
export const inOrder = (prs: OpenPr[]) => [...prs].sort((x, y) => Number(x.isDraft) - Number(y.isDraft) || x.number - y.number);

/** the clashes one conflicted merge makes (pure): each earlier PR of the run that touched some of the files is the other
 *  side for those; the files none touched are against main */
export function sidesOf(b: OpenPr, conflicted: string[], earlier: { pr: OpenPr; files: Set<string> }[]): IntegrationClash[] {
  const out: IntegrationClash[] = [];
  const left = new Set(conflicted);
  for (const e of earlier) {
    const files = conflicted.filter((f) => e.files.has(f));
    if (!files.length) continue;
    out.push({ a: e.pr, b, files });
    for (const f of files) left.delete(f);
  }
  if (left.size) out.push({ a: null, b, files: [...left] });
  return out;
}

const s7 = (s: string) => s.slice(0, 7);
/** the line that says a clash was said, once per pair of heads (pure): a new push on either side is a new clash */
export const marker = (c: IntegrationClash) => `<!-- integrate:${c.a ? `${c.a.number}@${s7(c.a.sha)}` : "main"}:${c.b.number}@${s7(c.b.sha)} -->`;

/** a diff cut to DIFF_LINES, in a fence no line of it can close (pure) */
export function fenced(diff: string): string {
  const all = diff.replace(/\s+$/, "").split("\n");
  const body = all.length > DIFF_LINES ? [...all.slice(0, DIFF_LINES), `… ${all.length - DIFF_LINES} more lines`] : all;
  const ticks = "`".repeat(Math.max(3, ...[...body.join("\n").matchAll(/`+/g)].map((m) => m[0].length + 1)));
  return `${ticks}diff\n${body.join("\n") || "(no change on this side)"}\n${ticks}`;
}

/** the card: one comment on the later PR, both owners named, each side's change to each file (pure) */
export function clashCard(c: IntegrationClash, diffs: { file: string; a: string; b: string }[], login: string): string {
  const side = (p: OpenPr | null) => (p ? `#${p.number} (@${p.login}, \`${p.branch}\`)` : "main");
  const who = [...new Set([c.a?.login, c.b.login].filter((x): x is string => !!x && x !== "?"))].map((l) => `@${l}`).join(" and ");
  const shown = diffs.slice(0, FILES_SHOWN);
  return [
    `**Clash** in tonight's integration (#1153): ${side(c.a)} and ${side(c.b)} cannot both go into main as they are; they meet in ${c.files.map((f) => `\`${f}\``).join(", ")}. ${who}: this is for you${c.a && c.a.login !== c.b.login ? " both" : ""}.`,
    "",
    ...shown.flatMap((d) => [
      `#### \`${d.file}\``, "",
      `${c.a ? `#${c.a.number}` : "main"}'s side:`, "", fenced(d.a), "",
      `#${c.b.number}'s side:`, "", fenced(d.b), "",
    ]),
    ...(diffs.length > shown.length ? [`And ${diffs.length - shown.length} more files.`, ""] : []),
    SETTLE,
    "",
    marker(c),
    "",
    `${sign(login)} (integrate, #1153)`,
  ].join("\n").slice(0, 60_000);
}

// ---- the run ----

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
/** every call that lists or takes paths: read unquoted, and a path taken as it is, never as a pattern */
const NAMES = ["-c", "core.quotePath=false", "--literal-pathspecs"];

/** the open PRs against main from this repository (a fork's branch is not on origin), with their heads */
export async function openPrsOnMain(d: Pick<IntegrateDeps, "gh">): Promise<OpenPr[]> {
  const raw = JSON.parse(await d.gh(["pr", "list", "--state", "open", "--base", "main", "--limit", "200", "--json",
    "number,headRefName,headRefOid,author,title,isDraft,isCrossRepository"]) || "[]") as
    { number: number; headRefName: string; headRefOid?: string; author?: { login?: string }; title: string; isDraft?: boolean; isCrossRepository?: boolean }[];
  return raw.filter((p) => !p.isCrossRepository).map((p) => ({
    number: p.number, branch: p.headRefName, sha: p.headRefOid ?? "", login: p.author?.login ?? "?", title: p.title, isDraft: !!p.isDraft,
  }));
}

/** is `at` a worktree of this checkout, at its own top: its top-level is `at` itself, and its repository the checkout's */
async function ownTree(d: IntegrateDeps, at: string): Promise<boolean> {
  if (!existsSync(at)) return false;
  const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
  const top = await d.git(["rev-parse", "--show-toplevel"], at);
  if (top.code !== 0 || real(top.out.trim()) !== real(at)) return false;
  const common = async (cwd?: string) => { const r = await d.git(["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd); return r.code === 0 ? real(r.out.trim()) : null; };
  const [mine, ours] = [await common(at), await common()];
  return !!mine && mine === ours;
}

/** the scratch tree, made once (a detached worktree of the checkout) and reused; reset to `integrate` at origin/main */
async function tree(d: IntegrateDeps, at: string): Promise<string | null> {
  if (!(await ownTree(d, at))) {
    // a folder there that is not this checkout's worktree at its own top (a run cut short, or a folder inside another
    // repository) is Sol's own scratch path: removed and made again, never reset or cleaned
    if (existsSync(at)) { rmSync(at, { recursive: true, force: true }); d.say(`${at} was not a worktree: removed`); }
    await d.git(["worktree", "prune"]);
    mkdirSync(dirname(at), { recursive: true });
    const r = await d.git(["worktree", "add", "-q", "--detach", at, "origin/main"]);
    if (r.code !== 0) return `could not make the scratch tree at ${at}: ${firstLine(r.out)}`;
    d.say(`the scratch tree made at ${at}`);
  }
  await d.git(["merge", "--abort"], at);   // a run cut short leaves a merge half done
  await d.git(["reset", "-q", "--hard"], at);
  await d.git(["clean", "-q", "-fd"], at);
  const r = await d.git(["checkout", "-q", "-f", "-B", BRANCH, "origin/main"], at);
  return r.code === 0 ? null : `could not reset ${BRANCH} to origin/main: ${firstLine(r.out)}`;
}

/** origin, fetched; over https with gh's sign-in when origin cannot be reached itself (night.ts's way) */
async function fetched(d: IntegrateDeps): Promise<string | null> {
  let f = await d.git(["fetch", "-q", "--prune", "origin"]);
  if (f.code !== 0) {
    const repo = (await makeGithubRecord(d.gh).members.room().catch(() => "")).trim();
    f = await d.git([...ghHelper(), "fetch", "-q", "--prune", `https://github.com/${repo}.git`, "+refs/heads/*:refs/remotes/origin/*"]);
  }
  return f.code === 0 ? null : `could not fetch origin: ${firstLine(f.out)}`;
}

/** everyone's open PRs into one tree, in order: what merged, and each clash with its two sides */
export async function integrate(d: IntegrateDeps, o: { tree?: string } = {}): Promise<Integration & { error?: string; found: IntegrationClash[] }> {
  const at = o.tree ?? TREE;
  const empty = (error: string) => ({ at: d.now().toISOString(), base: "", merged: [], clashes: [], found: [], error });
  const f = await fetched(d);
  if (f) return empty(f);
  const t = await tree(d, at);
  if (t) return empty(t);
  const base = (await d.git(["rev-parse", "origin/main"], at)).out.trim();
  const prs = inOrder(await openPrsOnMain(d));
  d.say(`${prs.length} open PRs against main, onto main ${s7(base)}`);
  const id = ["-c", `user.name=${d.login}'s agent (integrate)`, "-c", `user.email=${d.login}@users.noreply.github.com`,
    "-c", "core.hooksPath=/dev/null", "-c", "rerere.enabled=false", "-c", "commit.gpgsign=false"];
  const merged: { pr: OpenPr; files: Set<string> }[] = [];
  const found: IntegrationClash[] = [];
  for (const p of prs) {
    const head = `origin/${p.branch}`;
    if ((await d.git(["rev-parse", "--verify", "-q", head], at)).code !== 0) { d.say(`#${p.number}: ${head} is not on origin; left out`); continue; }
    const r = await d.git([...id, "merge", "-q", "--no-ff", "--no-edit", head], at);
    if (r.code === 0) {
      merged.push({ pr: p, files: new Set(lines((await d.git([...NAMES, "diff", "--name-only", `origin/main...${head}`], at)).out)) });
      d.say(`#${p.number} merged${p.isDraft ? " (draft)" : ""}`);
      continue;
    }
    const conflicted = lines((await d.git([...NAMES, "diff", "--name-only", "--diff-filter=U"], at)).out);
    await d.git(["merge", "--abort"], at);
    await d.git(["reset", "-q", "--hard"], at);   // a merge refused before it began leaves nothing to abort
    if (!conflicted.length) { d.say(`#${p.number}: not merged: ${firstLine(r.out)}`); continue; }
    for (const c of sidesOf(p, conflicted, merged)) {
      found.push(c);
      d.say(`#${p.number} clashes with ${c.a ? `#${c.a.number}` : "main"} on ${c.files.join(", ")}`);
    }
  }
  return {
    at: d.now().toISOString(), base, merged: merged.map((m) => m.pr.number), found,
    clashes: found.map((c) => ({ a: c.a?.number ?? null, b: c.b.number, files: c.files })),
  };
}

/** each clash between two PRs said once on its later PR, both owners pinged with its link; nothing in a dry run. A
 *  clash with main is in integrate.json only: no card, no ping */
export async function tell(d: IntegrateDeps, clashes: IntegrationClash[], cwd: string): Promise<number> {
  const rec = makeGithubRecord(d.gh);
  const two = clashes.filter((c) => c.a);
  if (clashes.length > two.length) d.say(`${clashes.length - two.length} clashes with main: in ${OUT} only, no card (GitHub says those PRs cannot merge)`);
  let n = 0;
  for (const [i, c] of two.entries()) {
    if (n >= CARDS_A_RUN) { d.say(`${two.length - i} more clashes wait for the next run (at most ${CARDS_A_RUN} new cards a run)`); break; }
    let said: boolean;
    try { said = lines(await rec.notes.lines(c.b.number)).some((l) => l.includes(marker(c))); }
    catch (e) { d.say(`#${c.b.number}'s comments were not read (${firstLine(String((e as Error)?.message ?? e))}): its card waits for the next run`); continue; }
    if (said) { d.say(`already said on #${c.b.number}: ${c.a ? `#${c.a.number}` : "main"} and #${c.b.number}`); continue; }
    const diffs = [];
    for (const file of c.files) {
      const of = async (ref: string, against: string) => (await d.git([...NAMES, "diff", `${against}...${ref}`, "--", file], cwd)).out;
      diffs.push({ file, a: await of(c.a ? `origin/${c.a.branch}` : "origin/main", c.a ? "origin/main" : `origin/${c.b.branch}`), b: await of(`origin/${c.b.branch}`, "origin/main") });
    }
    const body = clashCard(c, diffs, d.login);
    const to = [...new Set([c.a?.login, c.b.login].filter((x): x is string => !!x && x !== "?"))];
    if (d.dryRun) {
      d.say(`would post on #${c.b.number} and ping ${to.join(", ")} (decision):\n${body.split("\n").slice(0, 3).join("\n").replace(/^/gm, "    ")}\n    …`);
      n++;
      continue;
    }
    const got = await rec.notes.post(c.b.number, body);
    let url = "";
    try { url = String(JSON.parse(got).html_url ?? ""); } catch { /* the link is a help, not a need */ }
    d.say(`posted on #${c.b.number}${url ? ` (${url})` : ""}`);
    n++;
    const line = `a clash for you to settle: ${c.a ? `#${c.a.number}` : "main"} and #${c.b.number} on ${c.files.slice(0, 3).join(", ")}${c.files.length > 3 ? "…" : ""}: ${url || `#${c.b.number}`}`.slice(0, 300);
    for (const who of to) {
      if (!(d.ping && await d.ping({ to: who, kind: "decision", line, issue: c.b.number }))) d.say(`${who} not pinged: the relay is not in sight`);
    }
  }
  return n;
}

function write(r: Integration) {
  mkdirSync(dirname(OUT), { recursive: true, mode: 0o700 });
  const tmp = `${OUT}.tmp`;
  writeFileSync(tmp, JSON.stringify(r, null, 2) + "\n");
  renameSync(tmp, OUT);   // never a half-written file
}

// ---- run as a program: node dist/team/integrate.js [--dry-run] [--calendar] [--repo owner/name] ----

async function main(argv: string[]): Promise<number> {
  const r0 = await runnerOf(argv, "integrate");
  if (typeof r0 === "string") { console.error(r0); return 2; }
  const { root, gh, rhythm, tell: relay, stop } = r0;
  if (argv.includes("--calendar")) { process.stdout.write(`${integrateCalendar(rhythm)}\n`); return 0; }
  const team = readTeam();
  const dryRun = argv.includes("--dry-run") || !team.speak.github;
  if (!team.speak.github && !argv.includes("--dry-run")) console.log("my agent may not speak on GitHub (Settings, my agent): nothing is posted");
  const login = team.me.login || (await makeGithubRecord(gh).who.login().catch(() => "")).trim();
  const git = (args: string[], cwd = root) => new Promise<Run>((ok) =>
    execFile("git", args, { cwd, timeout: 300_000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
      (err, out, errOut) => ok({ code: err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 128) : 0, out: `${out}${errOut}` })));
  console.log(`integrate${dryRun ? " (dry run: nothing is posted)" : ""}, ${new Date().toISOString()}, as ${login}'s agent, into ${TREE}`);
  const d: IntegrateDeps = {
    git, gh, login, now: () => new Date(), dryRun, say: (l) => console.log(l),
    ping: (p) => relay("ping", { to: p.to, pingKind: p.kind, line: p.line, issue: p.issue, repo: r0.repo }),
  };
  try {
    const r = await integrate(d);
    if (r.error) { console.error(`integrate: ${r.error}`); return 1; }
    const { found, error: _e, ...out } = r;
    write(out);
    console.log(`integrate: ${out.merged.length} merged, ${found.length} clashes, onto main ${s7(out.base)}; written to ${OUT}`);
    const n = await tell(d, found, TREE);
    console.log(`${n} clash cards ${dryRun ? "would be posted" : "posted"}`);
    return 0;
  } finally { await stop(); }
}

const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(`integrate: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
}
