// The timeline (B1, #424, part of #413): every release drawn, who runs which, what never made it. Read by the v3 people
// wire and team.releases (releases.ts); its own wire message and Cowork's drawing went with #1299 and #1376.
//
// What it is built from:
// - the releases: the `dev-*` tags (#418's 9am release). Before the first of them, and while there is none at all, the
//   `stable-*` tags are the history. A stable tag on the same commit as a dev tag is that release reaching beta.
// - main's first-parent history: what was folded between two releases, as "Merge pull request #N" or "... (#N)" commits.
// - beta: the commits `stable` has stood on (its tags, origin's stable now, its reflog here) and the review session's
//   "**Beta passed**" words on the "Night digest" issue (#416).
// - the side branches, what never made it: a PR sent back severe (the review session's comment) that has not folded
//   since, a PR closed without going in, and a dev release held from beta ("**Beta held**" on the digest).
// - the people: each Sol's version from #417 (the roster's, mine from version.ts), placed on the release it runs.
//
// buildLine and placePeople are pure (test/timeline.test.ts). Reading is never at engine start: the first ask reads git
// (and GitHub, each read with a timeout), the answer is kept in memory and on disk (timeline.json beside Work's state),
// and an ask while the kept one is older than five minutes answers it at once and reads again behind it.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SolVersion } from "../hub/index.js";
import { SENT_SEVERE } from "./tonight.js";
import { BROKE } from "./broke.js";

const run = promisify(execFile);

// ---- the shapes ----
export type TagRef = { tag: string; sha: string; at: string };
/** one commit of main's first-parent line */
export type MainCommit = { sha: string; at: string; subject: string; body?: string };
/** a PR as GitHub says it; sentBack: the last severe send-back by the review session */
export type PrRead = {
  number: number; title: string; author?: string; url?: string; state: "open" | "closed" | "merged";
  createdAt?: string; closedAt?: string; mergedAt?: string; sentBack?: { at: string; by?: string }; draft?: boolean; broke?: boolean;
  /** a PR that wears broke: its latest "**This broke**: …" words (the night pass writes file:line and severity there) */
  brokeSaid?: string;
};
/** the review session's beta word on the digest: "the dev release of <release>" passed or held */
export type BetaWord = { release: string; verdict: "pass" | "hold"; at: string; by?: string };

/** a change folded into a release, and its way: handed in → folded → the release it came out in → beta */
export type Change = { number: number; title: string; author?: string; url?: string; handedIn?: string; folded: string; broke?: true; brokeSaid?: string; release?: string; releaseAt?: string; beta?: string; betaAt?: string };
export type Release = { tag: string; sha: string; at: string; kind: "dev" | "stable" | "next"; beta: boolean; held?: boolean; latest?: true; changes: Change[] };
/** a side branch: it left the line at `from` (a release's tag) and stopped there. Looked at, never run. */
export type Side = { kind: "severe" | "closed" | "held"; from: string; at: string; title: string; why: string; number?: number; author?: string; url?: string; by?: string };
/** the night's rhythm as the project says it (tonight.ts rhythmOf: its settings in the record first, #428, else .sol/rhythm.json): HH:MM each, in `zone` ("" = this Mac's clock) */
export type Night = { handIn: string; review: string; until: string; release: string; zone: string;
  /** who reviews tonight and who backs up from `handover` (#478); absent from an engine before it */
  dev?: string[]; beta?: string[]; devBackup?: string[]; betaBackup?: string[]; handover?: string };
/** handed in and waiting for tonight's review: an open PR into main, ready (not a draft), not sent back severe */
export type Waiting = { number: number; title: string; author?: string; url?: string; at?: string };
export type Line = { at: string; source: "dev" | "stable" | "none"; releases: Release[]; sides: Side[]; waiting: Waiting[]; night?: Night; repo?: string; developer: boolean; error?: string };
/** where a person stands: `on` the tag of the release they run ("main" for the line past the last release), null when
 *  their Sol says no version or one off this line */
export type Placed = { login: string; you: boolean; on: string | null; mine: number; behind: number; line: string };
export type Timeline = Line & { me: string; people: Placed[] };

const DEV = /^dev-(\d{8})(?:-(\d{4}))?$/;
const STABLE = /^stable-(\d{8})(?:-(\d{4}))?$/;
export const DAYS = 30;   // the line drawn: the last thirty days (B3 pins within thirty days too)
export const MAX_RELEASES = 40;
const DAY = 86_400_000;

const ms = (s?: string) => (s ? Date.parse(s) || 0 : 0);
/** a tag's moment: its date, else the one its name says (UTC; only for ordering) */
function tagAt(t: TagRef): number {
  const a = ms(t.at);
  if (a) return a;
  const m = DEV.exec(t.tag) ?? STABLE.exec(t.tag);
  if (!m) return 0;
  const d = m[1], hm = m[2] ?? "0000";
  return Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +hm.slice(0, 2), +hm.slice(2, 4));
}

/** a commit of main as a folded PR, or null: "Merge pull request #N from a/b" (its title the body's first line) or a
 *  squash "Title (#N)" (pure) */
export function foldOf(c: MainCommit): { number: number; title: string } | null {
  const m = /^Merge pull request #(\d+) from \S+/.exec(c.subject);
  if (m) return { number: +m[1], title: (c.body ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? `#${m[1]}` };
  const s = /^(.*\S)\s+\(#(\d+)\)$/.exec(c.subject);
  return s ? { number: +s[2], title: s[1] } : null;
}

/** "the dev release of X" names a release: its tag, or its day ("2026-10-30" for dev-20261030) (pure) */
export function namesRelease(said: string, tag: string): boolean {
  if (said === tag) return true;
  const day = said.replace(/-/g, "");
  const m = DEV.exec(tag) ?? STABLE.exec(tag);
  return !!m && /^\d{8}$/.test(day) && m[1] === day && !m[2];
}

const sameSha = (a: string, b: string) => !!a && !!b && (a.startsWith(b) || b.startsWith(a));

/** the line (pure): the releases oldest first, what folded into each, beta, and the side branches */
export function buildLine(a: { tags: TagRef[]; commits: MainCommit[]; betaShas?: string[]; prs?: PrRead[]; words?: BetaWord[]; now: Date; days?: number; developer?: boolean; repo?: string; night?: Night | null }): Line {
  const now = a.now.getTime(), from = now - (a.days ?? DAYS) * DAY;
  // main's line, oldest first; where each commit sits on it
  const line = [...a.commits].reverse();   // given as git log gives it, newest first
  const pos = new Map<string, number>();
  line.forEach((c, i) => pos.set(c.sha, i));
  const posOf = (sha: string) => pos.get(sha) ?? [...pos.entries()].find(([s]) => sameSha(s, sha))?.[1];

  // the releases: every dev tag; before the first dev tag (or with none) the stable tags
  const dev = a.tags.filter((t) => DEV.test(t.tag)), stable = a.tags.filter((t) => STABLE.test(t.tag));
  const firstDev = dev.length ? Math.min(...dev.map(tagAt)) : Infinity;
  const all: Release[] = [];
  for (const t of dev) all.push({ tag: t.tag, sha: t.sha, at: new Date(tagAt(t)).toISOString(), kind: "dev", beta: false, changes: [] });
  for (const t of stable) {
    if (all.some((r) => r.kind === "dev" && sameSha(r.sha, t.sha))) continue;   // the dev release reached beta: drawn once
    if (tagAt(t) >= firstDev) continue;   // after the switch, a stable tag is a beta mark, never a release of its own
    if (all.some((r) => r.kind === "stable" && sameSha(r.sha, t.sha))) continue;   // two stamps of one commit
    all.push({ tag: t.tag, sha: t.sha, at: new Date(tagAt(t)).toISOString(), kind: "stable", beta: true, changes: [] });
  }
  all.sort((x, y) => {
    const px = posOf(x.sha), py = posOf(y.sha);
    if (px !== undefined && py !== undefined && px !== py) return px - py;
    return ms(x.at) - ms(y.at) || x.tag.localeCompare(y.tag);
  });

  // beta: stable stood on it, a stable tag is on its commit, or the digest said passed (and not held after)
  const betaShas = [...(a.betaShas ?? []), ...stable.map((t) => t.sha)];
  const lastWord = (tag: string) => (a.words ?? []).filter((w) => namesRelease(w.release, tag)).sort((x, y) => ms(x.at) - ms(y.at)).pop();
  for (const r of all) {
    const w = lastWord(r.tag);
    if (r.kind === "dev") r.beta = betaShas.some((s) => sameSha(s, r.sha)) || w?.verdict === "pass";
    if (w?.verdict === "hold" && !r.beta) r.held = true;
  }

  // the window: the last thirty days, at most forty; the one before it bounds what folded into the first
  let first = all.findIndex((r) => ms(r.at) >= from);
  if (first < 0) first = all.length;
  first = Math.max(first, all.length - MAX_RELEASES);
  const shown = all.slice(first);
  const bound = first > 0 ? all[first - 1] : undefined;

  // what folded into each: main's commits after the release before it, up to and with its own
  const prOf = new Map((a.prs ?? []).map((p) => [p.number, p]));
  const change = (c: MainCommit): Change | null => {
    const f = foldOf(c);
    if (!f) return null;
    const p = prOf.get(f.number);
    return { number: f.number, title: p?.title || f.title, ...(p?.author ? { author: p.author } : {}), ...(p?.url ? { url: p.url } : {}), ...(p?.createdAt ? { handedIn: p.createdAt } : {}), folded: c.at, ...(p?.broke ? { broke: true as const } : {}), ...(p?.broke && p.brokeSaid ? { brokeSaid: p.brokeSaid } : {}) };
  };
  let prev = bound ? posOf(bound.sha) : undefined;
  for (const r of shown) {
    const p = posOf(r.sha);
    if (p === undefined) continue;   // a tag off main's line: drawn, nothing counted into it
    const start = prev !== undefined ? prev + 1 : 0;
    for (let i = start; i <= p; i++) {
      if (prev === undefined && ms(line[i].at) < from) continue;   // nothing bounds the first: only the window's own
      const ch = change(line[i]);
      if (ch) r.changes.push({ ...ch, release: r.tag, releaseAt: r.at });
    }
    prev = p;
  }
  // the line past the last release: folded, not released yet
  const lastPos = shown.length ? posOf(shown[shown.length - 1].sha) : undefined;
  const after = shown.length ? (lastPos !== undefined ? line.slice(lastPos + 1) : []) : line.filter((c) => ms(c.at) >= from);
  const next = after.map(change).filter((c): c is Change => !!c);
  if (shown.length) shown[shown.length - 1].latest = true;
  // each change's beta: the first release at or after its own that reached beta
  for (let i = 0; i < shown.length; i++) {
    const b = shown.slice(i).find((r) => r.beta);
    if (b) for (const c of shown[i].changes) { c.beta = b.tag; c.betaAt = b.at; }
  }
  if (next.length && line.length) shown.push({ tag: "main", sha: line[line.length - 1].sha, at: line[line.length - 1].at, kind: "next", beta: false, changes: next });

  // the side branches, each from the last release before it stopped
  const released = shown.filter((r) => r.kind !== "next");
  const fromAt = (t: number) => [...released].reverse().find((r) => ms(r.at) <= t)?.tag;
  const sides: Side[] = [];
  for (const p of a.prs ?? []) {
    if (p.state === "merged") continue;   // it made it after all
    if (p.sentBack && ms(p.sentBack.at) >= from) {
      const f = fromAt(ms(p.sentBack.at));
      if (f) sides.push({ kind: "severe", from: f, at: p.sentBack.at, title: p.title, why: "sent back · severe", number: p.number, ...(p.author ? { author: p.author } : {}), ...(p.url ? { url: p.url } : {}), ...(p.sentBack.by ? { by: p.sentBack.by } : {}) });
      continue;
    }
    if (p.state === "closed" && p.closedAt && ms(p.closedAt) >= from) {
      const f = fromAt(ms(p.closedAt));
      if (f) sides.push({ kind: "closed", from: f, at: p.closedAt, title: p.title, why: "closed without going in", number: p.number, ...(p.author ? { author: p.author } : {}), ...(p.url ? { url: p.url } : {}) });
    }
  }
  for (const r of released) if (r.held) {
    const w = lastWord(r.tag)!;
    sides.push({ kind: "held", from: r.tag, at: w.at, title: `the dev release of ${r.tag.replace(/^dev-/, "")}`, why: "held from beta", ...(w.by ? { by: w.by } : {}) });
  }
  sides.sort((x, y) => ms(x.at) - ms(y.at));

  // handed in, waiting for the review: oldest first
  const waiting: Waiting[] = (a.prs ?? []).filter((p) => p.state === "open" && !p.draft && !p.sentBack).sort((x, y) => ms(x.createdAt) - ms(y.createdAt))
    .map((p) => ({ number: p.number, title: p.title, ...(p.author ? { author: p.author } : {}), ...(p.url ? { url: p.url } : {}), ...(p.createdAt ? { at: p.createdAt } : {}) }));

  const source = dev.length ? "dev" : released.length ? "stable" : "none";
  return { at: a.now.toISOString(), source, releases: shown, sides, waiting, developer: a.developer ?? true, ...(a.night ? { night: a.night } : {}), ...(a.repo ? { repo: a.repo } : {}) };
}

/** where a commit of main stands (pure, kept beside the line, never sent): the release it came out in (the last one at
 *  or before it), or "main" past the last release; commits are newest first, as git log gives them */
export function spotsOf(line: Line, commits: MainCommit[]): Record<string, string> {
  const rel = line.releases.filter((r) => r.kind !== "next");
  const out: Record<string, string> = {};
  let on: string | null = null;
  for (const c of [...commits].reverse()) {
    const t = rel.find((r) => sameSha(r.sha, c.sha));
    if (t) on = t.tag;
    if (on) out[c.sha.slice(0, 8)] = on;
  }
  const last = rel[rel.length - 1];
  const i = last ? commits.findIndex((c) => sameSha(c.sha, last.sha)) : commits.length;
  for (const c of commits.slice(0, Math.max(0, i))) out[c.sha.slice(0, 8)] = "main";
  return out;
}

/** each person on the release they run (pure): by the release's name, else its commit, else the commit's place on
 *  main's line; mine first. behind: the releases after theirs */
export function placePeople(line: Line, people: { login: string; version?: SolVersion | null }[], me: string, spots: Record<string, string> = {}): Placed[] {
  const rel = line.releases.filter((r) => r.kind !== "next");
  const hasNext = line.releases.some((r) => r.kind === "next");
  const seen = new Set<string>();
  const out: Placed[] = [];
  for (const p of people) {
    const k = p.login.toLowerCase();
    if (!p.login || seen.has(k)) continue;
    seen.add(k);
    const v = p.version ?? null;
    const you = k === me.toLowerCase();
    if (!v) { out.push({ login: p.login, you, on: null, mine: 0, behind: 0, line: "unknown" }); continue; }
    let on: string | null = rel.find((r) => r.tag === v.release)?.tag ?? rel.find((r) => sameSha(r.sha, v.commit))?.tag ?? spots[v.commit.slice(0, 8)] ?? null;
    if (on === "main" && !hasNext) on = rel.length ? rel[rel.length - 1].tag : null;   // nothing folded past the last release: it is the last
    if (!on && v.release === "main" && hasNext) on = "main";
    const i = on ? rel.findIndex((r) => r.tag === on) : -1;
    const behind = on === "main" ? 0 : i >= 0 ? rel.length - 1 - i : v.behind ?? 0;
    const mine = v.mine ?? 0;
    const words = on === "main" ? "main, not released yet" : on ?? `${v.release} ${v.commit}`;
    out.push({ login: p.login, you, on, mine, behind, line: `${words}${mine ? ` + ${mine} of mine` : ""}${behind ? `, ${behind} behind` : ""}` });
  }
  return out.sort((x, y) => Number(y.you) - Number(x.you));
}

// ---- reading it (git here, GitHub with gh) ----
export type TimelineDeps = {
  dir: string;                                          // a folder of Sol's own checkout: git runs here
  gh?: (args: string[]) => Promise<string>;             // GitHub, for the PRs and the digest; none: git alone
  repo?: () => Promise<string>;                          // "owner/name" of the checkout's origin
  developer?: (repo: string) => Promise<boolean>;        // whether I review dev (the rhythm); unknown: yes
  night?: (repo: string) => Promise<Night | null>;       // the project's rhythm (tonight.ts rhythmOf); none: not drawn
  now?: () => Date;
  fetch?: boolean;                                       // fetch the tags, main and stable first (default yes)
};

const ENV = () => ({ ...process.env, GIT_TERMINAL_PROMPT: "0" });
const gitIn = (dir: string, args: string[], timeout = 15_000) => run("git", args, { cwd: dir, env: ENV(), timeout, maxBuffer: 32 << 20 }).then((r) => r.stdout.trim());
const tryGit = (dir: string, args: string[], timeout?: number) => gitIn(dir, args, timeout).catch(() => "");
const within = <T>(p: Promise<T>, msT: number, or: T) => Promise.race([p.catch(() => or), new Promise<T>((ok) => setTimeout(() => ok(or), msT).unref?.())]);

/** a PR's comments as the review session wrote them: the last "**Sent back** (severe)" (pure) */
export function severeOf(comments: { body?: string; createdAt?: string; author?: { login?: string } }[]): { at: string; by?: string } | undefined {
  let s: { at: string; by?: string } | undefined;
  for (const c of comments) {
    const b = String(c.body ?? "").trim();
    if (/^\*\*Sent back\*\* \(severe\)/.test(b)) s = { at: String(c.createdAt ?? ""), ...(c.author?.login ? { by: c.author.login } : {}) };
    else if (/^\*\*(Folded|Into [A-Za-z0-9_.-]{1,100})\*\*/.test(b) || /^\*\*Sent back\*\* \(slight\)/.test(b)) s = undefined;   // a later word moves it on (Into sol-dev, #477; "Folded" before it)
  }
  return s?.at ? s : undefined;
}

/** a PR's label names (pure) */
/** a PR's latest "**This broke**: …" words, its first line (pure; broke.ts brokeWords, the night pass's brokeWhy) */
export function brokeSaidOf(comments: { body?: string }[]): string {
  let w = "";
  for (const c of comments) {
    const m = /^\*\*This broke\*\*:\s*(.+)/.exec(String(c?.body ?? "").trim());
    if (m) w = m[1].split("\n")[0].trim();
  }
  return w;
}
export const labelsOf = (p: { labels?: { name?: string }[] }) => (Array.isArray(p.labels) ? p.labels : []).map((l) => String(l?.name ?? ""));
/** sent back severe (pure): #421's label `sent-back:severe` says so (a slight one the morning made severe has no severe
 *  comment), when from the last severe comment, else the PR's last update; without the label, the comments alone */
export function sentBackOf(comments: Parameters<typeof severeOf>[0], labels: string[], updated: string): { at: string; by?: string } | undefined {
  const c = severeOf(comments);
  if (!labels.includes(SENT_SEVERE)) return c;
  return c ?? (updated ? { at: updated } : undefined);
}

/** the digest's beta words (pure): "**Beta passed**: the dev release of X" / "**Beta held**: ..." */
export function wordsOf(comments: { body?: string; createdAt?: string; author?: { login?: string } }[]): BetaWord[] {
  const out: BetaWord[] = [];
  for (const c of comments) {
    const m = /^\*\*Beta (passed|held)\*\*: the dev release of (\S+?)[\s,]/.exec(String(c.body ?? "").trim() + " ");
    if (m) out.push({ release: m[2], verdict: m[1] === "passed" ? "pass" : "hold", at: String(c.createdAt ?? ""), ...(c.author?.login ? { by: c.author.login } : {}) });
  }
  return out;
}

type Built = { line: Line; spots: Record<string, string> };

/** read everything and build the line; never throws */
export async function readLine(d: TimelineDeps): Promise<Built> {
  const now = d.now?.() ?? new Date();
  const dir = d.dir;
  if (!(await tryGit(dir, ["rev-parse", "--verify", "-q", "HEAD"]))) return { line: { at: now.toISOString(), source: "none", releases: [], sides: [], waiting: [], developer: false, error: "no git history here" }, spots: {} };
  if (d.fetch !== false)
    await tryGit(dir, ["fetch", "-q", "--no-tags", "origin", "+refs/heads/main:refs/remotes/origin/main", "+refs/heads/stable:refs/remotes/origin/stable", "refs/tags/dev-*:refs/tags/dev-*", "refs/tags/stable-*:refs/tags/stable-*"], 20_000);
  const refs = await tryGit(dir, ["for-each-ref", "--format=%(refname:short)%09%(*objectname)%09%(objectname)%09%(taggerdate:iso-strict)", "refs/tags/dev-*", "refs/tags/stable-*", "refs/tags/beta-*"]);
  const tagsAll = refs.split("\n").filter(Boolean).map((l) => { const [tag, peeled, obj, at] = l.split("\t"); return { tag, sha: peeled || obj, at }; });
  const tags = tagsAll.filter((t) => DEV.test(t.tag) || STABLE.test(t.tag));
  let main = "";
  for (const r of ["refs/remotes/origin/main", "refs/heads/main"]) if ((main = await tryGit(dir, ["rev-parse", "--verify", "-q", r]))) break;
  const since = new Date(now.getTime() - (DAYS + 30) * DAY).toISOString();
  const raw = main ? await tryGit(dir, ["log", "--first-parent", "--max-count=3000", `--since=${since}`, "--format=%H%x1f%cI%x1f%s%x1f%b%x1e", main], 20_000) : "";
  const commits: MainCommit[] = raw.split("\x1e").map((x) => x.replace(/^\n/, "")).filter(Boolean).map((x) => { const [sha, at, subject, body] = x.split("\x1f"); return { sha, at, subject, body: (body ?? "").slice(0, 400) }; });
  const beta = new Set<string>(tagsAll.filter((t) => /^beta-/.test(t.tag)).map((t) => t.sha));
  const st = await tryGit(dir, ["rev-parse", "--verify", "-q", "refs/remotes/origin/stable"]);
  if (st) beta.add(st);
  for (const s of (await tryGit(dir, ["reflog", "show", "--format=%H", "-n", "200", "refs/remotes/origin/stable"])).split("\n")) if (/^[0-9a-f]{40}$/.test(s)) beta.add(s);
  // GitHub: the PRs into main (each one's comments, for a severe send-back) and the digest's beta words
  const repo = d.repo ? await within(d.repo(), 5000, "") : "";
  let prs: PrRead[] = [], words: BetaWord[] = [], error = "";
  if (d.gh && repo) {
    const list = await within(d.gh(["pr", "list", "--repo", repo, "--state", "all", "--base", "main", "--limit", "100", "--json", "number,title,author,url,state,isDraft,labels,createdAt,closedAt,mergedAt,updatedAt,comments"]), 25_000, "");
    if (!list) error = "GitHub did not answer: what was sent back or closed is not drawn";
    try {
      prs = (JSON.parse(list || "[]") as any[]).map((p) => ({
        number: Number(p.number), title: String(p.title ?? ""), author: String(p.author?.login ?? ""), url: String(p.url ?? ""),
        state: String(p.state ?? "").toUpperCase() === "MERGED" ? "merged" as const : String(p.state ?? "").toUpperCase() === "CLOSED" ? "closed" as const : "open" as const,
        ...(p.isDraft === true ? { draft: true } : {}), ...(p.createdAt ? { createdAt: String(p.createdAt) } : {}), ...(p.closedAt ? { closedAt: String(p.closedAt) } : {}), ...(p.mergedAt ? { mergedAt: String(p.mergedAt) } : {}),
        ...((s) => (s ? { sentBack: s } : {}))(sentBackOf(Array.isArray(p.comments) ? p.comments : [], labelsOf(p), String(p.updatedAt ?? p.createdAt ?? ""))),
        ...(labelsOf(p).includes(BROKE) ? { broke: true, ...((w) => (w ? { brokeSaid: w } : {}))(brokeSaidOf(Array.isArray(p.comments) ? p.comments : [])) } : {}),
      }));
    } catch { prs = []; }
    const found = await within(d.gh(["issue", "list", "--repo", repo, "--state", "all", "--search", `"Night digest" in:title`, "--json", "number,title", "--limit", "5"]), 15_000, "");
    try {
      const n = (JSON.parse(found || "[]") as { number: number; title: string }[]).find((i) => i.title.trim() === "Night digest")?.number;
      if (n) {
        const said = await within(d.gh(["issue", "view", String(n), "--repo", repo, "--json", "comments"]), 15_000, "");
        words = wordsOf((JSON.parse(said || "{}") as { comments?: any[] }).comments ?? []);
      }
    } catch { words = []; }
  }
  const developer = repo && d.developer ? await within(d.developer(repo), 10_000, true) : true;
  const night = repo && d.night ? await within(d.night(repo), 10_000, null) : null;
  const line = buildLine({ tags, commits, betaShas: [...beta], prs, words, now, developer, night, ...(repo ? { repo } : {}) });
  if (error) line.error = error;
  return { line, spots: spotsOf(line, commits) };
}

// ---- kept: in memory and on disk, read again behind a stale answer ----
export const TTL = 5 * 60_000;
let kept: (Built & { t: number }) | null = null;
let reading: Promise<Built> | null = null;
let file = "";
/** where it is kept on disk (wire.ts: beside Work's state); read at the first ask, never at start */
export function keepTimelineIn(path: string) { file = path; }
function readKept() {
  if (kept || !file) return;
  try {
    const k = JSON.parse(readFileSync(file, "utf8"));
    if (k && Array.isArray(k.line?.releases)) kept = { line: k.line, spots: k.spots ?? {}, t: Number(k.t) || 0 };
  } catch { /* none yet */ }
}
function keep(b: Built) {
  kept = { ...b, t: Date.now() };
  if (!file) return;
  try { mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file + ".tmp", JSON.stringify(kept)); renameSync(file + ".tmp", file); } catch { /* it stays in memory */ }
}
/** a read that came back worse than the kept one (pure): GitHub or git failed under it. It never replaces a good line:
 *  the kept one stays, says the newer read failed, and is read again on the next ask */
export function worse(b: Line, had: Line | undefined): boolean {
  if (!had || !had.releases.length) return false;
  return !!b.error || !b.releases.length;
}
function readAgain(d: TimelineDeps): Promise<Built> {
  reading ??= readLine(d).then((b) => {
    if (kept && worse(b.line, kept.line)) {
      kept = { ...kept, line: { ...kept.line, error: `the last read failed (${b.line.error ?? "git said nothing"}); this is the one before it` } };
      return kept;
    }
    keep(b);
    return b;
  }).finally(() => { reading = null; });
  return reading;
}

/** the kept line (read now when there is none, or `fresh`), with everyone placed on it as they are now */
export async function timelineNow(d: TimelineDeps, a: { me: string; people: { login: string; version?: SolVersion | null }[]; fresh?: boolean }): Promise<Timeline> {
  readKept();
  if (!kept || a.fresh) await readAgain(d);
  else if (Date.now() - kept.t > TTL) void readAgain(d).catch(() => {});
  const b = kept!;
  return { ...b.line, me: a.me, people: placePeople(b.line, a.people, a.me, b.spots) };
}
/** the releases and where each commit of main stands (#437, analytics' version adoption): the kept line, read now when
 *  there is none, behind a stale one as timelineNow does; never anyone placed on it */
export async function releasesNow(d: TimelineDeps): Promise<{ releases: Release[]; spots: Record<string, string>; error?: string }> {
  readKept();
  if (!kept) await readAgain(d);
  else if (Date.now() - kept.t > TTL) void readAgain(d).catch(() => {});
  const b = kept!;
  return { releases: b.line.releases, spots: b.spots, ...(b.line.error ? { error: b.line.error } : {}) };
}
/** a short commit as the release it came out in (pure): the release made at it, else its spot on main's line ("main"
 *  past the last release), else null (a build of its own, not on main) */
export function releaseOfCommit(commit: string, releases: Pick<Release, "tag" | "sha" | "kind">[], spots: Record<string, string>): string | null {
  if (!/^[0-9a-f]{7,40}$/.test(commit)) return null;
  const r = releases.find((x) => x.kind !== "next" && sameSha(x.sha, commit));
  if (r) return r.tag;
  const k = Object.keys(spots).find((x) => sameSha(x, commit));
  return k ? spots[k] : null;
}
/** for the tests: forget what is kept */
export const forgetTimeline = () => { kept = null; reading = null; file = ""; };
