// Releases (#1299, anchor 3 of 4 of #1194): each release, who ran it, what joined and its knots, who is behind; a
// relayed decision on the line where it was said. One read, GET /team/releases and the socket's team.releases
// (parts/releases.ts), for Cowork › Releases (mac/src/cowork/Releases.tsx).
//
// It stands on the timeline's line (timeline.ts releasesNow: the one kept line, shared with analytics): the dev-*/stable-* tags, main's first-parent
// commits between them, beta, the PRs' `broke` label. To that it adds only what the line lacks:
//   by        who pressed: "OK'd by <login>" in the tag's message (an urgent one), else the tagger (the 9am timer's machine)
//   prs       each PR's issue (its body's "Fixes #n" / "Part of #n", night.ts issueOf) and the agent that wrote it
//             (the body signed "— <login>'s agent", or Claude Code's line: the author's agent)
//   knots     the night pass's findings (#1128): a PR in the release that wears `broke`, its "**This broke**" comment as
//             the line already read it (timeline.ts brokeSaid); where (file:line) and how serious parsed from the words
//             sol/review/lib.mjs brokeWhy writes, else "#n" and "serious" for a person's own words
//   behind    per person in docs/people: the release their Sol says it runs (its runs word) placed on the line by
//             timeline.ts placePeople (its tag against main: the releases after it), and their open PRs into main; on
//             the newest release only. Never a <prefix>/mine branch: a personal line, not what a Sol runs (#1299)
//   decisions issue and PR comments since the oldest release shown (GET repos/{r}/issues/comments, paginated), by
//             one of the people or signed "— <login>'s agent", with a line starting "<Name>'s call" or "Decision,":
//             who said it (the person the call names, else the signer), when, the session if it names one, the words,
//             the comment as the proof
//   waits     the press the newest release waits on: the beta pass (the rhythm's beta reviewers) while it has not
//             reached beta; past main, the release the night held (a `broke` PR not yet released)
// Pure builders first (test/releases.test.ts); the reading after; kept as the timeline is: never at engine start, in
// memory and in releases.json beside Work's state, an ask older than five minutes answered at once and read again
// behind it, and releasesStale() for a pause or a comment wake to read again.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { releasesNow, placePeople, type Line, type Release, type Night } from "./timeline.js";
import { issueOf, type Pr } from "./night.js";
import type { Person, RunsWord } from "./runs.js";

const run = promisify(execFile);

// ---- the shape ----
export type Channel = "dev" | "beta" | "stable";
export type ReleasePr = { n: number; title: string; issue?: number; by: string; agentOf?: string };
export type Knot = { what: string; where: string; severity: string };
/** a person against main (timeline.ts placePeople, from what their Sol says it runs): the release they are on ("main" past
 *  the last release), how many releases came after it; null both when their Sol has not said */
export type Behind = { login: string; name: string; on: string | null; releases: number | null; prs: { n: number; title: string }[] };
/** what the release waits on: a press (who may make it), or held by the night (its knots say why) */
export type Waits = { press: "beta"; who: string[] } | { held: true };
export type ReleaseRow = {
  tag: string; when: string; by: string; channel: Channel; prs: ReleasePr[]; knots: Knot[]; behind: Behind[];
  /** main past the newest release: what joined and is not released yet */
  next?: true; latest?: true; waits?: Waits;
};
export type Decision = { issue: number; title: string; when: string; saidBy: string; signedBy: string; /** signed "— <signedBy>'s agent"; else a person typed it */ agent?: true; session?: string; words: string; proof?: { url: string } };
export type ReleasesRead = { at: string; me?: string; releases: ReleaseRow[]; decisions: Decision[]; error?: string };

export const MAX = 12;   // releases shown, newest first
const DECISION_DAYS = 14;
const DAY = 86_400_000;
const ms = (s?: string) => (s ? Date.parse(s) || 0 : 0);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// ---- pure ----

/** the channel a release reached (pure): a stable-* before the dev tags is stable; a dev one that reached beta, beta */
export const channelOf = (r: Pick<Release, "kind" | "beta">): Channel => (r.kind === "stable" ? "stable" : r.beta ? "beta" : "dev");

/** who pressed a release (pure): the login an urgent one was OK'd by, else the tagger's name, else the machine */
export function pressedBy(subject: string, tagger: string): string {
  const m = /OK'd by ([A-Za-z0-9-]{1,39})/.exec(subject);
  return m ? m[1] : tagger.trim() || "the release timer";
}

/** the agent that wrote a PR (pure): its body signed "— <login>'s agent", or Claude Code's line (the author's agent) */
export function agentOf(body: string, author: string): string | undefined {
  const lines = String(body ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  for (const l of [...lines].reverse()) {
    const m = /^—\s*([A-Za-z0-9-]{1,39})'s agent\b/.exec(l);
    if (m) return m[1];
  }
  return /Generated with \[Claude Code\]/.test(body ?? "") && author ? author : undefined;
}

/** a release's knot from a PR's "**This broke**" words (pure). The night pass writes them as sol/review/lib.mjs brokeWhy
 *  does, "the night's review found a serious thing: <what> (<file>:<line>, <severity>) <url>": where and how serious are
 *  read from there; a person's own words are where "#n", "serious" (Frank's agent on #1299: the comment, which readLine
 *  already fetches, and not the night pass's record, which is on the one machine that ran it) */
export function knotOfBroke(said: string, n: number, title = ""): Knot {
  const m = /^the night's review found (?:a serious thing|\d+ serious things; the worst): (.+) \(([^()\s]+:\d+), (\w+)\)(?:\s+\S+)?$/.exec(said.trim());
  if (m) return { what: m[1].slice(0, 240), where: `#${n} ${m[2]}`, severity: m[3] };
  return { what: said.trim().slice(0, 240) || `#${n} ${title} was marked broke`, where: `#${n}`, severity: "serious" };
}

/** a comment as GitHub's REST API gives it, GET repos/{r}/issues/comments (the endpoint team/wake.ts polls) */
export type IssueComment = { body?: string; created_at?: string; html_url?: string; issue_url?: string; user?: { login?: string } };
/** the issue (or PR) a comment is on, from its issue_url (pure) */
export const issueOfComment = (c: IssueComment) => Number(/\/issues\/(\d+)$/.exec(String(c?.issue_url ?? ""))?.[1] ?? 0);

/** the line a decision starts with (pure): "<Name>'s call" for one of the people, or "Decision,"; markdown's bold and a
 *  quote's ">" before it do not count. The person whose call it is, "" for "Decision,", null when the line is neither */
export function callOf(line: string, people: Pick<Person, "login" | "name">[]): string | null {
  const l = line.replace(/^[\s>*_]+/, "");
  if (/^Decision,/.test(l)) return "";
  const m = /^([A-Z][A-Za-z]+)'s call\b/.exec(l);
  return (m && people.find((p) => same(p.name.split(/\s+/)[0], m[1]))?.login) ?? null;
}

/** the decisions on the issues (pure; the lead took Frank's agent's match, #1299): a comment since `since` whose author is
 *  one of the people or which is signed "— <login>'s agent" on its last line, with a line that starts "<Name>'s call" or
 *  "Decision,". Never a bare "decided". Said by the person the call names, else the signer, else the author; the words
 *  are that line's paragraph; titles by issue number (read after, for the few that are decisions). Newest first */
export function decisionsOf(comments: IssueComment[], since: number, people: Pick<Person, "login" | "name">[], titles: Record<number, string> = {}): Decision[] {
  const out: Decision[] = [];
  for (const c of comments) {
    const at = ms(c.created_at), issue = issueOfComment(c);
    if (!at || at < since || !issue) continue;
    const body = String(c.body ?? "").replace(/\r\n?/g, "\n").trim();
    const lines = body.split("\n");
    const sig = /^—\s*([A-Za-z0-9-]{1,39})'s agent\b/.exec(lines[lines.length - 1]?.trim() ?? "");
    const author = String(c.user?.login ?? "");
    const person = people.some((p) => same(p.login, author));
    if (!sig && !person) continue;
    const text = sig ? lines.slice(0, -1) : lines;
    const i = text.findIndex((l) => callOf(l, people) !== null);
    if (i < 0) continue;
    const call = callOf(text[i], people)!;
    const signedBy = sig?.[1] ?? author;
    let end = i;
    while (end + 1 < text.length && text[end + 1].trim()) end++;
    const words = text.slice(i, end + 1).join(" ").replace(/\s+/g, " ").replace(/\*\*/g, "").replace(/^[\s>]+/, "").trim();
    const session = /\bsession[\s:`#]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{6,12})\b/i.exec(body)?.[1];
    out.push({
      issue, title: titles[issue] ?? "", when: new Date(at).toISOString(), saidBy: call || signedBy, signedBy, ...(sig ? { agent: true as const } : {}),
      ...(session ? { session } : {}), words: words.length > 280 ? `${words.slice(0, 279)}…` : words, ...(c.html_url ? { proof: { url: c.html_url } } : {}),
    });
  }
  return out.sort((a, b) => ms(b.when) - ms(a.when));
}

export type PrMeta = { n: number; body: string; author: string };
export type TagMeta = { tag: string; subject: string; tagger: string };

/** the releases newest first (pure): the line's, each with who pressed, its PRs, its knots; behind on the newest */
export function buildReleases(a: { line: Line; tags: TagMeta[]; prs: PrMeta[]; behind: Behind[]; decisions: Decision[]; now: Date; me?: string; max?: number }): ReleasesRead {
  const tagOf = new Map(a.tags.map((t) => [t.tag, t]));
  const prOf = new Map(a.prs.map((p) => [p.n, p]));
  const rows: ReleaseRow[] = [];
  const shown = [...a.line.releases].reverse().slice(0, a.max ?? MAX);
  const newest = shown.find((r) => r.kind !== "next");
  for (const r of shown) {
    const next = r.kind === "next";
    const prs: ReleasePr[] = [], knots: Knot[] = [];
    for (const c of r.changes) {
      const m = prOf.get(c.number);
      const by = c.author || m?.author || "";
      const issue = m ? issueOf({ number: c.number, body: m.body } as Pr) : c.number;
      const agent = m ? agentOf(m.body, by) : undefined;
      prs.push({ n: c.number, title: c.title, ...(issue !== c.number ? { issue } : {}), by, ...(agent ? { agentOf: agent } : {}) });
      if (c.broke) knots.push(knotOfBroke(c.brokeSaid ?? "", c.number, c.title));
    }
    const t = tagOf.get(r.tag);
    const row: ReleaseRow = {
      tag: r.tag, when: r.at, by: next ? "" : pressedBy(t?.subject ?? "", t?.tagger ?? ""), channel: next ? "dev" : channelOf(r),
      prs, knots, behind: r === newest ? a.behind : [],
      ...(next ? { next: true as const } : {}), ...(r === newest ? { latest: true as const } : {}),
    };
    if (next && knots.length) row.waits = { held: true };
    else if (r === newest && r.kind === "dev" && !r.beta && a.line.night?.beta?.length) row.waits = { press: "beta", who: a.line.night.beta };
    rows.push(row);
  }
  return { at: a.now.toISOString(), ...(a.me ? { me: a.me } : {}), releases: rows, decisions: a.decisions, ...(a.line.error ? { error: a.line.error } : {}) };
}

/** a person against main (pure): the release their Sol says it runs, from the runs words, newest word first */
export const runsOf = (login: string, words: RunsWord[]) => [...words].filter((w) => same(w.person || w.login, login) || same(w.login, login)).sort((x, y) => y.at - x.at)[0];

// ---- reading it ----
export type ReleasesDeps = {
  dir: string;                                   // Sol's own checkout: git runs here
  gh?: (args: string[]) => Promise<string>;
  repo?: () => Promise<string>;
  people: () => Person[];
  words?: () => RunsWord[];                      // what each Sol said it runs (runs.ts runsNow)
  night?: (repo: string) => Promise<Night | null>;
  me?: () => string;
  now?: () => Date;
  fetch?: boolean;
};

const ENV = () => ({ ...process.env, GIT_TERMINAL_PROMPT: "0" });
const tryGit = (dir: string, args: string[], timeout = 15_000) => run("git", args, { cwd: dir, env: ENV(), timeout, maxBuffer: 16 << 20 }).then((r) => r.stdout.trim()).catch(() => "");
const within = <T>(p: Promise<T>, msT: number, or: T) => Promise.race([p.catch(() => or), new Promise<T>((ok) => setTimeout(() => ok(or), msT).unref?.())]);
const json = <T>(s: string, or: T): T => { try { return (JSON.parse(s || "null") as T) ?? or; } catch { return or; } };

/** every issue and PR comment since `since` (ISO), oldest first: GET repos/{r}/issues/comments, the endpoint
 *  team/wake.ts polls, a page of 100 at a time up to PAGES (Frank's agent on #1299: 50 issues with --json comments
 *  cut the list and gave each issue's oldest 100 comments) */
export const PAGES = 10;
const TITLES = 20;   // the decisions' issues whose titles are read, newest first
export async function commentsSince(gh: (args: string[]) => Promise<string>, repo: string, since: string): Promise<IssueComment[]> {
  const out: IssueComment[] = [];
  for (let page = 1; page <= PAGES; page++) {
    const got = json<IssueComment[]>(await within(gh(["api", `repos/${repo}/issues/comments?since=${encodeURIComponent(since)}&sort=created&direction=asc&per_page=100&page=${page}`]), 20_000, ""), []);
    if (!Array.isArray(got)) break;
    out.push(...got);
    if (got.length < 100) break;
  }
  return out;
}

/** read everything and build it; never throws */
export async function readReleases(d: ReleasesDeps): Promise<ReleasesRead> {
  const now = d.now?.() ?? new Date();
  const repo = d.repo ? await within(d.repo(), 5000, "") : "";
  // the timeline's kept line, shared (Frank's agent on #1299: releasesNow already feeds analytics; no second read of it)
  const shared = await releasesNow({ dir: d.dir, gh: d.gh, repo: d.repo, night: d.night, now: () => now, fetch: d.fetch });
  const night = repo && d.night ? await within(d.night(repo), 10_000, null) : null;
  const line: Line = { at: now.toISOString(), source: "dev", releases: shared.releases, sides: [], waiting: [], developer: true, ...(night ? { night } : {}), ...(shared.error ? { error: shared.error } : {}) };
  const people = d.people();
  // the tags: who pressed
  const refs = await tryGit(d.dir, ["for-each-ref", "--format=%(refname:short)%09%(taggername)%09%(contents:subject)", "refs/tags/dev-*", "refs/tags/stable-*"]);
  const tags: TagMeta[] = refs.split("\n").filter(Boolean).map((l) => { const [tag, tagger = "", subject = ""] = l.split("\t"); return { tag, tagger, subject }; });
  const words = d.words?.() ?? [];
  let open: { number: number; title: string; author?: { login?: string } }[] = [];
  let merged: { number: number; body?: string; author?: { login?: string } }[] = [];
  let comments: IssueComment[] = [];
  const shown = [...line.releases].reverse().slice(0, MAX).filter((r) => r.kind !== "next");
  const oldest = shown.length ? ms(shown[shown.length - 1].at) : 0;
  const since = Math.max(oldest, now.getTime() - DECISION_DAYS * DAY);
  if (d.gh && repo) {
    const [o, m, c] = await Promise.all([
      within(d.gh(["pr", "list", "--repo", repo, "--state", "open", "--base", "main", "--limit", "100", "--json", "number,title,author"]), 20_000, ""),
      within(d.gh(["pr", "list", "--repo", repo, "--state", "merged", "--base", "main", "--limit", "100", "--json", "number,body,author"]), 25_000, ""),
      commentsSince(d.gh, repo, new Date(since).toISOString().replace(/\.\d{3}Z$/, "Z")),
    ]);
    open = json(o, []); merged = json(m, []); comments = c;
  }
  // each person against main: the release their Sol runs, placed on the line as the timeline places everyone
  const placed = placePeople(line, people.map((p) => { const w = runsOf(p.login, words); return { login: p.login, version: w ? { release: w.tag, commit: w.sha } : null }; }), d.me?.() ?? "", shared.spots);
  const behind: Behind[] = people.map((p) => {
    const at = placed.find((x) => same(x.login, p.login));
    const prs = open.filter((x) => same(x.author?.login ?? "", p.login)).map((x) => ({ n: Number(x.number), title: String(x.title ?? "") }));
    return { login: p.login, name: p.name, on: at?.on ?? null, releases: at?.on ? at.behind : null, prs };
  });
  // the PRs: issue and agent (their knots are on the line: readLine read each broke PR's comments)
  const metas: PrMeta[] = merged.map((p) => ({ n: Number(p.number), body: String(p.body ?? ""), author: String(p.author?.login ?? "") }));
  const found = decisionsOf(comments, since, people);
  const titles: Record<number, string> = {};
  if (d.gh && repo) await Promise.all([...new Set(found.map((x) => x.issue))].slice(0, TITLES).map(async (n) => {
    titles[n] = (await within(d.gh!(["api", `repos/${repo}/issues/${n}`, "--jq", ".title"]), 10_000, "")).trim();
  }));
  const decisions = found.map((x) => ({ ...x, title: titles[x.issue] ?? "" }));
  return buildReleases({ line, tags, prs: metas, behind, decisions, now, ...(d.me ? { me: d.me() } : {}) });
}

// ---- kept: in memory and on disk, read again behind a stale answer ----
export const TTL = 5 * 60_000;
let kept: (ReleasesRead & { t: number }) | null = null;
let reading: Promise<ReleasesRead> | null = null;
let file = "";
/** where it is kept on disk (parts/releases.ts: beside Work's state); read at the first ask, never at start */
export function keepReleasesIn(path: string) { file = path; }
function readKept() {
  if (kept || !file) return;
  try { const k = JSON.parse(readFileSync(file, "utf8")); if (k && Array.isArray(k.releases)) kept = k; } catch { /* none yet */ }
}
function readAgain(d: ReleasesDeps): Promise<ReleasesRead> {
  reading ??= readReleases(d).then((r) => {
    if (kept?.releases.length && (!r.releases.length || r.error)) {   // a worse read never replaces a good one
      kept = { ...kept, error: `the last read failed (${r.error ?? "git said nothing"}); this is the one before it` };
      return kept;
    }
    kept = { ...r, t: Date.now() };
    if (file) try { mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file + ".tmp", JSON.stringify(kept)); renameSync(file + ".tmp", file); } catch { /* in memory */ }
    return r;
  }).finally(() => { reading = null; });
  return reading;
}
/** the kept read (read now when there is none, or `fresh`); a stale one answers at once and is read again behind it */
export async function releasesRead(d: ReleasesDeps, fresh = false): Promise<ReleasesRead> {
  readKept();
  if (!kept || fresh) return readAgain(d);
  if (Date.now() - kept.t > TTL) void readAgain(d).catch(() => {});
  const { t: _t, ...r } = kept;
  return r;
}
/** a pause or a comment wake: the next ask reads again */
export const releasesStale = () => { if (kept) kept = { ...kept, t: 0 }; };
/** for the tests: forget what is kept */
export const forgetReleases = () => { kept = null; reading = null; file = ""; };

