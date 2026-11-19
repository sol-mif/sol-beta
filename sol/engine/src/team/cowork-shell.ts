// Cowork, whole (#1173): the engine's reads for the anchor's tabs. Cowork is where a person opens Jelly for the big
// decisions; these are what its tabs show, read through what the engine already has: gh (team/record.ts runGh, in the
// team's checkout so gh knows the repository), git's dev-* tags (team/iteration.ts), every Sol's word of what it runs
// (team/runs.ts), the people pages (docs/people) and the guard's own log of what it held (sol/harness/guard logLock).
//
//   foryou    only what is this person's to decide: open PRs that ask their review, and open `decision` issues given to
//             them, each said as what it does for users (a PR's "What to try" line, else its title), never a number
//   who       neglected work: open issues nobody touched in 3 days or more (what each person holds is People's read,
//             team/people.ts, #1297)
//   (versions, the releases, moved to team/releases.ts and Cowork › Releases, #1299)
//   guard     what the guard held and let through today, by rule, from its log; the log missing, the strict rules
//
// The functions named *Of are pure (test/cowork-shell.test.ts); the readers run gh and git and keep a GitHub answer a
// minute, so a person pressing between tabs does not spend the rate limit.
import { readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { runGh } from "./record.js";
import { openIssues } from "./people.js";
import { peopleOf, type Person } from "./runs.js";

// ---- the words: what a person reads ----

/** a title or a line said for a person: no issue or PR numbers, no "area: " lead, no trailing period */
export function plainOf(s: string): string {
  return s
    .replace(/\s*\((?:#\d+(?:,\s*)?)+[^)]*\)/g, "")   // "(#1165)", "(#937, part of #936)"
    .replace(/\s*\b(?:part of|closes|fixes|for)\s+#\d+/gi, "")
    .replace(/#\d+\s*/g, "")
    .replace(/\s*\(\s*\)/g, "")                         // what was left of "(#1, #2)" in another shape
    .replace(/^\s*(?:[a-z][a-z ·-]{1,24}:\s+)+/, "")      // "cowork: ", "product: engine: "
    .replace(/\s+/g, " ").replace(/[\s.]+$/, "").trim();
}

/** a PR body's "What to try" first line (the person who tries it reads it), "" when it has none */
export function tryLineOf(body: string): string {
  const m = /^#{1,4}\s*What to try\s*$/im.exec(body ?? "");
  if (!m) return "";
  const rest = body.slice(m.index + m[0].length).split("\n").map((l) => l.trim()).filter(Boolean);
  const first = rest.find((l) => !/^#{1,4}\s/.test(l)) ?? "";
  if (!first || /^#{1,4}\s/.test(rest[0] ?? "")) return "";
  return first.replace(/^[-*\d.)\s]+/, "").replace(/`/g, "").trim();
}

// ---- for you ----

/** a "What to try" that says there is nothing to see is not what a change does for users: the title says it then */
const NOTHING_SEEN = /^nothing (to see|on (a|the) screen)/i;
/** a line's first sentence (a period followed by a space and more words ends it) */
export const firstSentence = (s: string) => s.split(/(?<=[.!?])\s+(?=[A-Z])/)[0] ?? "";

export type GhPr = { number: number; title: string; body?: string; url?: string; author?: { login?: string }; isDraft?: boolean; updatedAt?: string; reviewRequests?: { login?: string }[] };
export type GhIssue = { number: number; title: string; url?: string; assignees?: { login: string }[]; labels?: { name: string }[]; updatedAt?: string; createdAt?: string };
export type ForYou = { what: string; ask: string; url?: string; kind: "try" | "decide" };

/** what waits on this person: PRs asking their review (said as what it does for users) and decisions given to them */
export function forYouOf(prs: GhPr[], decisions: GhIssue[]): ForYou[] {
  const out: ForYou[] = [];
  for (const p of prs) {
    if (p.isDraft) continue;
    const tried = firstSentence(tryLineOf(p.body ?? ""));
    const t = plainOf(tried && !NOTHING_SEEN.test(tried) ? tried : p.title);
    if (t) out.push({ what: t, ask: "Keep it in the release?", url: p.url, kind: "try" });
  }
  for (const i of decisions) {
    const t = plainOf(i.title);
    if (t) out.push({ what: t, ask: "Yours to decide", url: i.url, kind: "decide" });
  }
  return out;
}

// ---- who has what ----

export type Held = { n: number; title: string; url?: string; draft?: boolean };
export type Neglected = Held & { days: number; holder: string };
export const NEGLECT_DAYS = 3;
const DAY = 24 * 3600_000;

/** the open issues nobody touched in 3+ days, oldest touch first (who holds it, or "nobody"). What each person holds is
 *  People's read now (team/people.ts, #1297): this read kept only the part People does not say */
export function neglectedOf(people: Person[], issues: GhIssue[], now = Date.now()): { neglected: Neglected[] } {
  const held = (x: { number: number; title: string; url?: string }): Held => ({ n: x.number, title: plainOf(x.title) || x.title, url: x.url });
  const nameOf = (l: string) => people.find((p) => p.login === l)?.name ?? l;
  const neglected = issues
    .map((i) => ({ i, t: Date.parse(i.updatedAt ?? i.createdAt ?? "") }))
    .filter(({ t }) => Number.isFinite(t) && now - t >= NEGLECT_DAYS * DAY)
    .sort((a, b) => a.t - b.t)
    .map(({ i, t }) => ({ ...held(i), days: Math.floor((now - t) / DAY), holder: (i.assignees ?? []).map((a) => nameOf(a.login)).join(", ") || "nobody" }));
  return { neglected };
}

// ---- guardrails ----

export type GuardRow = { rule: string; what: string; held: number; let: number };
/** the rules the guard holds, said for a person; a rule the log names and this does not is shown by its name */
export const RULE_WORDS: Record<string, string> = {
  // every refuse("...") in sol/harness/guard, said for a person (review R2: the words name the guard's real rules, only those)
  "merge": "an agent merging a PR",
  "main-by-api": "an agent writing to main through GitHub's API",
  "main-commit": "a commit on main (main is reached only by a merge)",
  "main-push": "a push to main",
  "branch-without-take": "a branch made without taking its issue",
  "others-branch": "working on another person's branch",
  "pr-without-note": "a PR without its \"What to try\"",
  "eval-sealed": "an agent pressing an eval's Approved or Scoped",
  "stable-move": "moving the stable release",
  "remote": "a push or a remote change the guard cannot follow",
  "unparsed": "a command the guard could not read",
  "window": "a change to a running Sol's window",
  "home-data": "writing into a person's own Sol data",
  "key": "touching a key or a handed-out secret",
  "fence": "a command that steps over a fence of the harness",
  "guard-state": "writing the guard's own state",
  "let-through": "a rule let through by a person's own setting",
  "tonight": "editing during the night's review",
  "sent-back": "editing work that was sent back",
  "hand-in-card": "a hand-in without its card",
};
/** the strict rules as a list, for when no log is kept on this machine */
export const STRICT = ["main-commit", "main-by-api", "main-push", "merge", "branch-without-take", "others-branch", "eval-sealed", "pr-without-note", "key"];

/** the guard's log lines from `since` on, counted by rule: held (refused) and let through, most first */
export function guardOf(text: string, since: number): GuardRow[] {
  const by = new Map<string, GuardRow>();
  for (const l of text.split("\n")) {
    if (!l.trim()) continue;
    let o: { at?: string; rule?: string; outcome?: string };
    try { o = JSON.parse(l); } catch { continue; }
    const at = Date.parse(o.at ?? "");
    if (!o.rule || !Number.isFinite(at) || at < since) continue;
    const r = by.get(o.rule) ?? { rule: o.rule, what: RULE_WORDS[o.rule] ?? o.rule, held: 0, let: 0 };
    if (o.outcome === "let-through") r.let++; else if (o.outcome === "refused") r.held++;
    by.set(o.rule, r);
  }
  return [...by.values()].sort((a, b) => b.held + b.let - (a.held + a.let) || a.rule.localeCompare(b.rule));
}

// ---- the readers (gh, git, the disk) ----

/** where the guard keeps its log: beside the engine's state, as the guard finds it (sol/harness/guard STATE_DIR) */
export const locksFile = () => process.env.SOL_LOCKS_LOG
  || join(process.env.SOL_STATE ? dirname(process.env.SOL_STATE)
    : platform() === "darwin" ? join(homedir(), "Library", "Application Support", "com.marcol04.sol") : join(homedir(), ".local", "share", "sol"), "locks.jsonl");

const kept = new Map<string, { at: number; v: unknown }>();
const KEEP_MS = 60_000;
async function once<T>(key: string, f: () => Promise<T>): Promise<T> {
  const k = kept.get(key);
  if (k && Date.now() - k.at < KEEP_MS) return k.v as T;
  const v = await f();
  kept.set(key, { at: Date.now(), v });
  return v;
}
const ghJson = <T>(top: string, args: string[]) => once(`${top} ${args.join(" ")}`, async () => JSON.parse(await runGh(args, top)) as T);

export async function readForYou(top: string) {
  const me = await once(`me ${top}`, async () => (await runGh(["api", "user", "-q", ".login"], top)).trim());
  const [prs, decisions] = await Promise.all([
    ghJson<GhPr[]>(top, ["pr", "list", "--state", "open", "--search", "review-requested:@me", "--json", "number,title,body,url,isDraft", "--limit", "30"]),
    ghJson<GhIssue[]>(top, ["issue", "list", "--state", "open", "--label", "decision", "--assignee", "@me", "--json", "number,title,url", "--limit", "30"]),
  ]);
  return { me, items: forYouOf(prs, decisions) };
}

export async function readWho(top: string) {
  const issues = await ghJson<GhIssue[]>(top, openIssues("number,title,url,assignees,updatedAt,createdAt"));   // every one: neglect is the oldest
  return neglectedOf(peopleOf(top), issues);
}

export function readGuard(now = Date.now()) {
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  let text: string | null = null;
  try { text = readFileSync(locksFile(), "utf8"); } catch { /* no log on this machine */ }
  if (text === null) return { log: false, rows: [] as GuardRow[], strict: STRICT.map((r) => RULE_WORDS[r]) };
  return { log: true, rows: guardOf(text, day.getTime()), strict: STRICT.map((r) => RULE_WORDS[r]) };
}
