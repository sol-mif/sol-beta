// Drift (#1153): each developer's work either reaches the next iteration (iteration.ts: main at the newest dev-* tag) or
// shows as drift against it, measured every day on the NucBox and said beside the ✓ in the release word.
//   the mine rule  a `<you>/mine` branch holds only its owner's own files: MINE.md and anything under mine/ (inMine).
//                  Every other change in it is drift
//   the age        of a change, in iterations: how many dev-* tags were made after its author time (never the committer
//                  time: */mine branches are rebased onto every release since #1150, which resets it). A file's age is
//                  its oldest own commit's. 0: made since the iteration was cut; 1: one iteration went out without it
//   a person's     the files off the iteration, each once, from origin/<prefix>/mine: the files its own commits touched
//   drift          (merge-base(iteration, mine)..mine, no merges), outside the mine rule, whose change has not reached the
//                  iteration: merging mine into it would change the file or clash in it (#1199; never "its content
//                  differs", which a mine that is only behind does in every file main changed; and not a clash in a
//                  file main took whole and then built on, undoing none of it). `off` the count,
//                  `iterations` the largest age (0 when nothing is off).
//                  Their open PRs against main (not forks, not the drift agent's own) are measured too, the files each
//                  changes, and kept beside it (`openOff`, `openIterations`, `open`) in drift.json and the run's log, but
//                  not in the word: an open PR is already on its way. A person whose mine could not be read is left out
//                  of the word and the log says why; never reported as nothing off
//   the run        `sol/drift` (sol-drift.timer, 15 minutes after the rhythm's release, so the release word's count, which
//                  stands for an hour, carries it): fetch origin, the iteration, each person (docs/people/*.md), written
//                  whole to drift.json beside work.json, then said on the relay `drift { iteration, people }`. Every Sol
//                  keeps the latest word (drift-word.json), heard only from a team person and only newer than the one
//                  kept, and #1150's count adds `off` and `iterations` to each person (runs.ts countMsg): Frank ✓ dev (3
//                  off, 1 iteration). A late release starts a run itself a few minutes after it (release.ts driftLater);
//                  the timer stays as the fallback, and a second run against the same iteration says so. One run at
//                  a time: sol/drift takes ~/.local/share/sol/drift.lock first, and a run that cannot get it stops
//   the agent      at the end of the run, for each person whose */mine files are CUT_AGE iterations old or more (not
//                  their open PRs: those are already on their way), unless --dry-run or the runner's agent may not speak
//                  on GitHub (night.ts's rule), or the fetch failed (the word goes out, the log says it is stale).
//                  Each file it covers is marked by a short hash of `path:blob` at mine's tip, all in one marker line: a file marked by any earlier PR from its own branch
//                  (`<runner>/base-drift-<owner>-1153`), open, merged or closed (a closed one is the owner's word that it
//                  stays), or by any earlier question on #1153, is never cut or asked about again. The rest, if any (a
//                  file whose base..tip diff is empty is no change), it cuts onto the iteration in a scratch worktree
//                  (drift-cut/, git apply --3way) with the files its open PR still holds: clean, one commit pushed to its
//                  own branch and a draft PR naming the owner. Not clean, the new files alone, one by one: the ones that go
//                  on are cut, and one question on #1153 asks the owner why the rest stay. Then one ping to the owner. It
//                  pushes only its own branch, and only when that branch is one commit of its own on a dev-* tag's
//                  commit (or not there yet): it never overwrites anyone's commits. It never merges, never closes.
// The pure parts are exported with git, gh and the clock as deps, as release.ts's are, so the tests need no repository.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { onRelay } from "./relay.js";
import { peopleOf, type Person } from "./runs.js";
import { iterationOf, devTagsOf, TAG_FORMAT, type Iteration, type DevTag } from "./iteration.js";
import { STATE_DIR } from "../work/state.js";
import type { Run } from "./night.js";
import { quietPush } from "../quiet.js";

/** the issue the agent's PRs and questions belong to */
export const ISSUE = 1153;
/** a <you>/mine file this many iterations old or more gets the agent: an iteration went out without it */
export const CUT_AGE = 1;

/** the mine rule (pure): MINE.md and anything under mine/, at the repo root */
export const inMine = (path: string) => path === "MINE.md" || path.startsWith("mine/");

/** a change's age in iterations (pure): the dev-* tags made after its author time (both unix ms) */
export const ageOf = (authorAt: number, tagTimes: number[]) => tagTimes.filter((t) => t > authorAt).length;

/** git log's format for touchedOf: a line per commit with its author and committer times, then its files */
export const LOG_FORMAT = "%x01%at%x09%ct";
/** each path the commits in `git log --format=LOG_FORMAT --name-only` touched, with the oldest author time (unix ms)
 *  among them (pure). The committer time is read past: a rebase resets it */
export function touchedOf(log: string): Map<string, number> {
  const out = new Map<string, number>();
  let at = NaN;
  for (const l of log.split("\n")) {
    if (l.startsWith("\x01")) { at = Number(l.slice(1).split("\t")[0]) * 1000; continue; }
    const p = l.trim();
    if (!p || !Number.isFinite(at)) continue;
    const was = out.get(p);
    if (was === undefined || at < was) out.set(p, at);
  }
  return out;
}

export type Aged = { path: string; age: number };
export type OpenDrift = { pr: number; branch: string; files: Aged[] };
export type PersonDrift = { login: string; name: string; prefix: string; off: number; iterations: number; mine: Aged[]; openOff: number; openIterations: number; open: OpenDrift[] };

/** one person's drift (pure). mine: the files its own commits touched (oldest author time each) and the ones whose
 *  change has not reached the iteration (`differs`); open: each open PR's changed files and its own commits' times.
 *  `off` and `iterations` count mine alone; `openOff` and `openIterations` the open PRs' files, each once */
export function driftOf(
  p: { login: string; name: string; prefix: string },
  mine: { touched: Map<string, number>; differs: Set<string> } | null,
  open: { pr: number; branch: string; files: string[]; touched: Map<string, number> }[],
  tagTimes: number[],
): PersonDrift {
  const age = (t: number | undefined) => (t === undefined ? 0 : ageOf(t, tagTimes));
  const mineAged: Aged[] = mine ? [...mine.touched].filter(([f]) => !inMine(f) && mine.differs.has(f)).map(([path, t]) => ({ path, age: age(t) })).sort((a, b) => a.path.localeCompare(b.path)) : [];
  const openAged: OpenDrift[] = open.map((o) => ({ pr: o.pr, branch: o.branch, files: [...new Set(o.files)].filter((f) => !inMine(f)).sort().map((path) => ({ path, age: age(o.touched.get(path)) })) }));
  const opened = new Map<string, number>();
  for (const f of openAged.flatMap((o) => o.files)) opened.set(f.path, Math.max(opened.get(f.path) ?? 0, f.age));
  return {
    ...p, off: mineAged.length, iterations: Math.max(0, ...mineAged.map((f) => f.age)), mine: mineAged,
    openOff: opened.size, openIterations: Math.max(0, ...opened.values()), open: openAged,
  };
}

/** the files the agent takes from a person's mine (pure): CUT_AGE iterations old or more */
export const toCut = (d: PersonDrift) => d.mine.filter((f) => f.age >= CUT_AGE);

/** one file's mark (pure): a short hash of `path:blob` at mine's tip, "-" for a file mine deleted. A PR's or a
 *  question's marker line holds one for each file it covered */
export function fingerprint(b: { path: string; blob: string }): string {
  return createHash("sha256").update(`${b.path}:${b.blob || "-"}`).digest("hex").slice(0, 12);
}
/** the marker line for the files covered (pure): `<!-- drift:<owner>:<mark> <mark> … -->`; drift-ask for a question */
export const markerOf = (kind: "drift" | "drift-ask", owner: string, marks: string[]) => `<!-- ${kind}:${owner}:${[...new Set(marks)].sort().join(" ")} -->`;
/** every file mark `owner`'s markers say was covered, in PR bodies or #1153's comments (pure) */
export function coveredOf(texts: string[], owner: string): Set<string> {
  const out = new Set<string>();
  const re = /<!-- drift(?:-ask)?:([A-Za-z0-9-]+):([0-9a-f ]+) -->/g;
  for (const t of texts) for (const m of (t ?? "").matchAll(re)) if (m[1].toLowerCase() === owner.toLowerCase()) for (const h of m[2].split(" ")) if (h) out.add(h);
  return out;
}

/** two runs measured the same (pure): the same iteration, each person's off and iterations, mine and open, alike */
export function sameDrift(a: Pick<DriftFile, "iteration" | "people">, b: Pick<DriftFile, "iteration" | "people">): boolean {
  const key = (f: Pick<DriftFile, "people">) => JSON.stringify(f.people.map((p) => [p.login, p.off, p.iterations, p.openOff, p.openIterations, p.mine]));
  return a.iteration?.name === b.iteration.name && key(a) === key(b);
}

/** the timer's OnCalendar line (pure): 15 minutes after the rhythm's release, in its zone */
export function driftCalendar(r: { release: string; zone?: string }): string {
  const [h, m] = r.release.split(":").map(Number);
  const t = ((h * 60 + m + 15) % 1440 + 1440) % 1440;
  return `*-*-* ${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}:00${r.zone ? ` ${r.zone}` : ""}`;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
/** a person's drift in one line, for the run's log (pure): the word's count (mine alone) with mine's files each with its
 *  age (what the agent takes), then the open PRs' count beside it (drift.json holds every file) */
export function driftLine(d: PersonDrift): string {
  const head = d.off ? `${d.name}: ${d.off} off, ${plural(d.iterations, "iteration")} · ${d.prefix}/mine: ${d.mine.map((f) => `${f.path} (${f.age})`).join(", ")}` : `${d.name}: nothing off`;
  const prs = d.open.filter((o) => o.files.length).length;
  return d.openOff ? `${head} · open PRs (not in the word): ${d.openOff} off, ${plural(d.openIterations, "iteration")} in ${plural(prs, "PR")}` : head;
}

/** the draft PR's body (pure) */
export function prBody(o: { owner: string; name: string; prefix: string; iteration: string; tip: string; files: Aged[]; marks: string[]; runner: string }): string {
  return [
    `Part of #${ISSUE}.`,
    "",
    `@${o.owner}, this is ${o.name}'s change in \`${o.prefix}/mine\` (at ${o.tip.slice(0, 7)}), cut onto the iteration ${o.iteration} so it can reach main. At least one iteration went out without it:`,
    "",
    ...o.files.map((f) => `- \`${f.path}\`: ${plural(f.age, "iteration")} old`),
    "",
    "## What to try",
    "",
    `Read the diff: each file is as \`${o.prefix}/mine\` holds it. If it belongs on main, bring it into a branch of your own (\`git cherry-pick\` this PR's one commit) and open your PR from there; the review goes as for any PR, and this one can be closed. The drift agent's branch is its own: do not push to it. If it stays in your mine, close this PR: a closed PR is your word that it stays, and the drift agent does not ask again about these files as they are.`,
    "",
    markerOf("drift", o.owner, o.marks),
    "",
    `— ${o.runner || "<login>"}'s agent (drift, #${ISSUE})`,
  ].join("\n");
}

/** the question on #1153 for a change that does not go onto the iteration cleanly (pure) */
export function askBody(o: { owner: string; name: string; prefix: string; iteration: string; files: Aged[]; marks: string[]; runner: string }): string {
  return [
    `@${o.owner}, your change in \`${o.prefix}/mine\` is off the iteration ${o.iteration} and does not go onto it cleanly, so the drift agent cannot cut it into a PR for you:`,
    "",
    ...o.files.map((f) => `- \`${f.path}\`: ${plural(f.age, "iteration")} old`),
    "",
    "Why does it stay? Reply here: either it belongs to main (bring it over in a PR of your own), or it stays in your mine, and the agent does not ask again about these files as they are.",
    "",
    markerOf("drift-ask", o.owner, o.marks),
    "",
    `— ${o.runner || "<login>"}'s agent (drift, #${ISSUE})`,
  ].join("\n");
}

// ---- the word, kept by every engine ----

/** off, iterations: from mine alone (the count); openOff, openIterations: the open PRs', kept beside it (GET /drift) */
export type DriftWord = { iteration: string; people: { person: string; off: number; iterations: number; openOff: number; openIterations: number; prs?: number; mine?: Aged[]; open?: { pr: number; files: number }[] }[]; at: number };
const LOGIN = /^[A-Za-z0-9-]{1,39}$/;
const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e6 ? v : 0);

/** a person's files and open PRs as the word carries them (#1167, the team strip), kept only when said and sound */
const PATH = /^[^\0\n]{1,300}$/;
function detailOf(p: any): { prs?: number; mine?: Aged[]; open?: { pr: number; files: number }[] } {
  const mine = Array.isArray(p.mine) ? p.mine.filter((f: any) => typeof f?.path === "string" && PATH.test(f.path)).slice(0, DETAIL).map((f: any) => ({ path: f.path, age: count(f.age) })) : null;
  const open = Array.isArray(p.open) ? p.open.filter((o: any) => count(o?.pr) > 0).slice(0, DETAIL).map((o: any) => ({ pr: count(o.pr), files: count(o.files) })) : null;
  return { ...(typeof p.prs === "number" ? { prs: count(p.prs) } : {}), ...(mine ? { mine } : {}), ...(open ? { open } : {}) };
}
/** how many files and PRs a word carries per person, at most */
export const DETAIL = 60;
/** the word's people as said on the relay (pure): the counts always; then each person's open PRs and mine files, one by
 *  one, while the whole stays under `budget` bytes (the hub drops a message over MSG_MAX, 4 KB, and the count must
 *  never be lost to the detail). A list cut short is still a true part of it; `prs` and `off` say how many in all */
export function saidPeople(people: PersonDrift[], budget = 2800) {
  const out = people.map((p) => ({ person: p.login, off: p.off, iterations: p.iterations, openOff: p.openOff, openIterations: p.openIterations, prs: p.open.length,
    open: [] as { pr: number; files: number }[], mine: [] as Aged[] }));
  const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v));   // the hub's MSG_MAX is bytes, not UTF-16 units
  let size = bytes(out);
  const add = <T,>(list: T[], v: T) => { const n = bytes(v) + 1; if (size + n > budget) return false; list.push(v); size += n; return true; };
  for (const [i, p] of people.entries()) for (const o of p.open.slice(0, DETAIL)) if (!add(out[i].open, { pr: o.pr, files: o.files.length })) break;
  for (const [i, p] of people.entries()) for (const f of p.mine.slice(0, DETAIL)) if (!add(out[i].mine, { path: f.path, age: f.age })) break;
  return out;
}

/** a relay `drift` made into a word, or null when it is not one (pure) */
export function driftWordOf(m: Record<string, any>): DriftWord | null {
  const iteration = typeof m?.iteration === "string" && /^dev-\d{8}(-\d{4})?$/.test(m.iteration) ? m.iteration : "";
  if (!iteration || !Array.isArray(m.people)) return null;
  const people = m.people.filter((p: any) => p && typeof p.person === "string" && LOGIN.test(p.person)).slice(0, 100)
    .map((p: any) => ({ person: p.person, off: count(p.off), iterations: count(p.iterations), openOff: count(p.openOff), openIterations: count(p.openIterations), ...detailOf(p) }));
  return { iteration, people, at: typeof m.at === "number" && Number.isFinite(m.at) ? m.at : Date.now() };
}

/** a relay `drift` heard (pure): a word only from a team person (`from.login`, which the hub stamps with the login the
 *  sender signed in as) and only newer than the one kept; null drops it */
export function driftHeard(m: Record<string, any>, kept: DriftWord | null, team: string[]): DriftWord | null {
  const from = typeof m?.from?.login === "string" ? m.from.login.toLowerCase() : "";
  if (!from || !team.some((l) => l.toLowerCase() === from)) return null;
  const w = driftWordOf(m);
  return w && (!kept || w.at > kept.at) ? w : null;
}

let word: DriftWord | null = null;
let listening = false;
const WORD_FILE = () => process.env.SOL_DRIFT_WORD_FILE ?? join(STATE_DIR, "drift-word.json");
/** the latest drift word this engine heard (GET /drift, the count) */
export const driftKept = (): DriftWord | null => word;
/** a person's drift against `iteration` as the kept word says it, or null when it is off nothing or measured against
 *  another iteration (runs.ts countMsg) */
export function driftFor(login: string, iteration: string): { off: number; iterations: number } | null {
  if (!word || word.iteration !== iteration) return null;
  const p = word.people.find((x) => x.person.toLowerCase() === login.toLowerCase());
  return p && p.off > 0 ? { off: p.off, iterations: p.iterations } : null;
}
/** parts/drift.ts: keep each word heard from a team person (`team`: their logins, docs/people), on disk so a renew
 *  forgets nothing, and tell `heard` */
export function startDrift(heard: () => void, team: () => string[]) {
  try { word = driftWordOf(JSON.parse(readFileSync(WORD_FILE(), "utf8"))); } catch { word = null; }
  if (listening) return;
  listening = true;
  onRelay("drift", (m) => {
    const w = driftHeard(m, word, team());
    if (!w) return;
    word = w;
    try { mkdirSync(dirname(WORD_FILE()), { recursive: true }); writeFileSync(WORD_FILE(), JSON.stringify(w) + "\n"); } catch { /* kept in memory */ }
    heard();
  });
}

// ---- the run ----

export type DriftDeps = {
  git: (args: string[]) => Promise<Run>;   // never throws: the exit code is part of the answer
  gh: (args: string[]) => Promise<string>; // throws on a failure
  now: () => Date;
  say: (line: string) => void;
};
export type People = (Person & { prefix: string })[];
/** people: each one measured; left: each one whose mine could not be read, and why (not in the word) */
export type DriftFile = { at: number; iteration: Iteration; people: PersonDrift[]; left: { login: string; name: string; why: string }[] };

const ok = async (d: DriftDeps, args: string[]) => { const r = await d.git(args); return r.code === 0 ? r.out.trim() : null; };
// every call that lists paths: no C-quoting of unusual names, pathspecs taken as they are
const lit = (args: string[]) => ["-c", "core.quotePath=false", "--literal-pathspecs", ...args];
/** paths in batches, so a long list never passes the command line's limit */
const BATCH = 200;
const batches = (paths: string[]) => Array.from({ length: Math.ceil(paths.length / BATCH) }, (_, i) => paths.slice(i * BATCH, (i + 1) * BATCH));
/** a git call over many paths, batched: every batch's output joined, or the first failure's words */
async function overPaths(d: Pick<DriftDeps, "git">, args: string[], paths: string[]): Promise<{ out: string } | { error: string }> {
  let out = "";
  for (const b of batches(paths)) {
    const r = await d.git(lit([...args, "--", ...b]));
    if (r.code !== 0) return { error: firstOf(r.out) };
    out += r.out.endsWith("\n") || !r.out ? r.out : r.out + "\n";
  }
  return { out };
}
const pathsIn = (out: string) => out.split("\n").map((l) => l.trim()).filter(Boolean);
const DRIFT_BRANCH = /\/base-drift-[\w.-]+-1153$/;
const firstOf = (s: string) => s.trim().split("\n").map((l) => l.replace(/^(fatal|error|hint): /, "").trim()).filter(Boolean)[0] ?? "it failed";

/** a ref's sha; null only when git says plainly it is not there (`rev-parse --verify -q`: exit 1, nothing said); any
 *  other failure is { error } */
async function refOf(d: Pick<DriftDeps, "git">, ref: string): Promise<string | null | { error: string }> {
  const r = await d.git(["rev-parse", "--verify", "-q", ref]);
  if (r.code === 0 && r.out.trim()) return r.out.trim();
  if (r.code === 1 && !r.out.trim()) return null;
  return { error: firstOf(r.out || `exit ${r.code}`) };
}

/** the iteration and every dev-* tag's time, from the checkout's tags */
export async function tagsNow(d: Pick<DriftDeps, "git">): Promise<DevTag[]> {
  const r = await d.git(["for-each-ref", `--format=${TAG_FORMAT}`, "refs/tags/dev-*"]);
  return r.code === 0 ? devTagsOf(r.out) : [];
}

// asked once a run, not once a person
const versions = new WeakMap<DriftDeps, Promise<Run>>();
const versionOf = (d: DriftDeps) => versions.get(d) ?? (versions.set(d, d.git(["version"])), versions.get(d)!);

/** git 2.50 is the first whose in-memory merge takes merge.renames=false: before it, merge-tree follows a rename
 *  whatever is set, and a change to a file main renamed would read as arrived (it lands in the new name) */
export function mergeKeepsNames(version: string): boolean {
  const m = /(\d+)\.(\d+)/.exec(version);
  return !!m && (Number(m[1]) > 2 || (Number(m[1]) === 2 && Number(m[2]) >= 50));
}

/** what a one-file diff (-U0) adds and takes out, by the line's own words, a line of only spaces left out; null where
 *  there are no lines to go by: a binary file, or a diff that deletes the file */
export function linesOf(diff: string): { added: Set<string>; gone: Set<string> } | null {
  if (/^(Binary files |deleted file mode )/m.test(diff)) return null;
  const added = new Set<string>(), gone = new Set<string>();
  let body = false;
  for (const l of diff.split("\n")) {
    if (l.startsWith("@@")) { body = true; continue; }
    if (!body || !l.slice(1).trim()) continue;
    if (l[0] === "+") added.add(l.slice(1)); else if (l[0] === "-") gone.add(l.slice(1));
  }
  return { added, gone };
}

/** among files the merge clashed in, the ones whose change has arrived all the same. Two things, both needed:
 *  main's own line held the file exactly as mine's tip has it (content and mode) at some commit since the merge-base
 *  (main took it whole: a squashed PR, a commit picked both ways), and what main did to the file since undoes none of
 *  it: it took out no line mine's change added and put back none it took out. So main changing the next line is a
 *  file arrived, which git's merge can only call a clash; main putting mine's line back is not, nor main changing
 *  mine's own line again (which of the two that is cannot be told, so it stays off), nor a binary file, nor a file
 *  the iteration no longer has, nor one mine deleted. Not seen: a change main took together with another to the same
 *  file in one commit of its own line, a whole merged PR counted as one: that file stays off */
async function arrived(d: DriftDeps, it: Iteration, base: string, tip: string, clashed: string[]): Promise<Set<string> | { error: string }> {
  const out = new Set<string>();
  if (!clashed.length) return out;
  const mine = await overPaths(d, ["ls-tree", tip], clashed);
  if ("error" in mine) return mine;
  const has = new Map<string, string>();
  for (const l of mine.out.split("\n")) { const m = /^(\d+) blob ([0-9a-f]+)\t(.+)$/.exec(l); if (m) has.set(m[3], `${m[1]} ${m[2]}`); }
  if (!has.size) return out;
  // main's line only, a merge read against its first parent: what main itself held, commit by commit
  const log = await overPaths(d, ["log", "--first-parent", "-m", "--raw", "--no-abbrev", "--no-renames", "--format=", `${base}..${it.sha}`], [...has.keys()]);
  if ("error" in log) return log;
  const held = new Set<string>();
  for (const l of log.out.split("\n")) { const m = /^:\d+ (\d+) [0-9a-f]+ ([0-9a-f]+) \S+\t(.+)$/.exec(l); if (m && has.get(m[3]) === `${m[1]} ${m[2]}`) held.add(m[3]); }
  const diff = ["diff", "-U0", "--no-renames", "--no-ext-diff", "--no-textconv", "--no-color"];
  for (const f of held) {
    // mine's change, and main's since it held the file as mine has it (the tip's content is that state's)
    const own = await overPaths(d, [...diff, base, tip], [f]);
    if ("error" in own) return own;
    const since = await overPaths(d, [...diff, tip, it.sha], [f]);
    if ("error" in since) return since;
    const a = linesOf(own.out), b = linesOf(since.out);
    if (a && b && ![...a.added].some((l) => b.gone.has(l)) && ![...a.gone].some((l) => b.added.has(l))) out.add(f);
  }
  return out;
}

/** the files among `paths` that mine's own change has not brought to the iteration (#1199): the ones merging mine into
 *  the iteration would change, or would clash in (unless the clash is main building on a file it took whole and
 *  undid nothing of, arrived()). A file mine's commits touched and left as the merge-base had it, or whose change the iteration already
 *  holds, is not one, however far main moved since: differing from the iteration is not enough, a mine that is only
 *  behind differs in every file main changed. git's own merge, in memory and with no rename followed, as everything
 *  here (merge-tree, as night.ts's clashes; it writes only loose objects, so it needs the object store writable).
 *  Where that merge is not usable (a git before 2.50, which follows renames in it, or the merge failed for any
 *  reason), the files that differ from the iteration and that mine changed at all since the merge-base, said in the
 *  log with git's reason: that only counts more, a change the iteration took and then built on is still in it */
async function unreached(d: DriftDeps, it: Iteration, base: string, tip: string, paths: string[]): Promise<Set<string> | { error: string }> {
  const v = await versionOf(d);
  const usable = v.code === 0 && mergeKeepsNames(v.out);
  const m = usable ? await d.git(["-c", "core.quotePath=false", "-c", "merge.renames=false", "merge-tree", "--write-tree", "--name-only", "--no-messages", it.sha, tip]) : { code: -1, out: "" };
  const [first = "", ...rest] = m.out.split("\n");
  const tree = first.trim();
  if ((m.code === 0 || m.code === 1) && /^[0-9a-f]{40,64}$/.test(tree)) {
    const changed = await overPaths(d, ["diff", "--name-only", "--no-renames", it.sha, tree], paths);
    if ("error" in changed) return changed;
    // 1: the files it clashes in, listed after the tree up to the first empty line. The diff alone misses the ones the
    // tree keeps as main has them: a file mine deleted and main changed, a binary file both changed
    const end = rest.findIndex((l) => !l.trim());
    const asked = new Set(paths);
    const clashed = m.code === 1 ? [...new Set(pathsIn((end < 0 ? rest : rest.slice(0, end)).join("\n")))].filter((f) => asked.has(f)) : [];
    const here = await arrived(d, it, base, tip, clashed);
    if ("error" in here) return here;
    const clash = new Set(clashed);
    return new Set([...pathsIn(changed.out), ...clashed].filter((f) => !(clash.has(f) && here.has(f))));
  }
  const why = usable ? firstOf(m.out || `exit ${m.code}`) : `${firstOf(v.out || `exit ${v.code}`)}: before git 2.50 it follows renames`;
  d.say(`drift: git merge-tree was not usable here (${why}): counted by content, which also counts a change the iteration already took and built on`);
  const differs = await overPaths(d, ["diff", "--name-only", "--no-renames", it.sha, tip], paths);
  if ("error" in differs) return differs;
  const own = await overPaths(d, ["diff", "--name-only", "--no-renames", base, tip], pathsIn(differs.out));
  return "error" in own ? own : new Set(pathsIn(own.out));
}

/** one person's mine against the iteration: its own commits' files, the ones whose change has not reached it, and the
 *  merge-base (null: no origin/<prefix>/mine; a string: why it could not be measured) */
async function mineOf(d: DriftDeps, prefix: string, it: Iteration) {
  const ref = `refs/remotes/origin/${prefix}/mine`;
  const t = await refOf(d, ref);
  if (t === null) return null;
  if (typeof t !== "string") return `${prefix}/mine was not read (${t.error})`;
  const tip = t;
  const mb = await d.git(["merge-base", it.sha, tip]);
  if (mb.code !== 0) return `no merge-base of ${prefix}/mine and ${it.name} (${firstOf(mb.out)})`;
  const base = mb.out.trim();
  const log = await d.git(lit(["log", "--no-merges", "--no-renames", `--format=${LOG_FORMAT}`, "--name-only", `${base}..${tip}`]));
  if (log.code !== 0) return `${prefix}/mine's log was not read (${firstOf(log.out)})`;
  const touched = touchedOf(log.out);
  const outside = [...touched.keys()].filter((f) => !inMine(f));
  const differs = await unreached(d, it, base, tip, outside);
  if ("error" in differs) return `${prefix}/mine's change against ${it.name} was not read (${differs.error})`;
  return { tip, base, touched, differs };
}

/** one person's open PRs against main (not the drift agent's own): each one's changed files and own commits' times */
async function openOf(d: DriftDeps, repo: string, login: string) {
  const prs = JSON.parse(await d.gh(["pr", "list", "--repo", repo, "--state", "open", "--author", login, "--base", "main", "--limit", "100", "--json", "number,headRefName,isCrossRepository"])) as { number: number; headRefName: string; isCrossRepository?: boolean }[];
  const out: { pr: number; branch: string; files: string[]; touched: Map<string, number> }[] = [];
  for (const p of prs) {
    if (DRIFT_BRANCH.test(p.headRefName) || p.isCrossRepository) continue;   // the agent's own; a fork's branch is not on origin
    const head = await refOf(d, `refs/remotes/origin/${p.headRefName}`);
    if (typeof head !== "string") { d.say(`drift: #${p.number}'s branch ${p.headRefName} ${head ? `was not read (${head.error})` : "is not on origin"}: left out`); continue; }
    const files = await d.git(lit(["diff", "--name-only", "--no-renames", `refs/remotes/origin/main...${head}`]));
    const log = await d.git(lit(["log", "--no-merges", "--no-renames", `--format=${LOG_FORMAT}`, "--name-only", `refs/remotes/origin/main..${head}`]));
    if (files.code !== 0 || log.code !== 0) { d.say(`drift: #${p.number} was not read (${firstOf(files.code !== 0 ? files.out : log.out)}): left out`); continue; }
    out.push({ pr: p.number, branch: p.headRefName, files: pathsIn(files.out), touched: touchedOf(log.out) });
  }
  return out;
}

/** stale: the fetch failed, so this is what the checkout had (the word may go out, said stale; the agent does nothing) */
export type Measured = { file: DriftFile; bases: Map<string, { base: string; tip: string }>; stale: boolean };

/** fetch origin, then each person's drift against the iteration; null when there is no iteration */
export async function measure(d: DriftDeps, repo: string, people: People): Promise<Measured | null> {
  const f = await d.git(["fetch", "--prune", "--tags", "origin"]);
  const stale = f.code !== 0;
  if (stale) d.say(`drift: the fetch failed (${firstOf(f.out)}); measured against what this checkout has, stale`);
  const tags = await tagsNow(d);
  const it = iterationOf(tags);
  if (!it) return null;
  const times = tags.map((t) => t.at);
  const bases = new Map<string, { base: string; tip: string }>();
  const out: PersonDrift[] = [], left: DriftFile["left"] = [];
  for (const p of people) {
    const mine = await mineOf(d, p.prefix, it);
    if (typeof mine === "string") { d.say(`drift: ${p.name} was not measured: ${mine}; left out of the word`); left.push({ login: p.login, name: p.name, why: mine }); continue; }
    if (mine) bases.set(p.login, { base: mine.base, tip: mine.tip });
    let open: Awaited<ReturnType<typeof openOf>> = [];
    try { open = await openOf(d, repo, p.login); }
    catch (e) { d.say(`drift: ${p.name}'s open PRs were not read (${firstOf(String((e as Error)?.message ?? e))}): left out`); }
    out.push(driftOf({ login: p.login, name: p.name, prefix: p.prefix }, mine, open, times));
  }
  return { file: { at: d.now().getTime(), iteration: it, people: out, left }, bases, stale };
}

/** the identity the agent's commits carry, and the only author its branch may hold (pure) */
export const agentIdent = (runner: string) => ({ name: `${runner}'s agent (drift)`, email: `${runner}@users.noreply.github.com` });

/** may the agent push its branch (pure): not there yet, or exactly one commit, by the agent, whose one parent is a
 *  dev-* tag's commit, authored and committed by it (an owner's --amend keeps the author). `head`: `git log -1
 *  --format=OWN_FORMAT` of origin/<branch>, "" when it is not there */
export const OWN_FORMAT = "%H%x09%P%x09%an%x09%ae%x09%cn%x09%ce";
export function ownBranch(head: string, tagShas: string[], runner: string): string | null {
  if (!head.trim()) return null;
  const [sha, parents, an, ae, cn, ce] = head.trim().split("\t");
  const me = agentIdent(runner), ps = (parents ?? "").split(" ").filter(Boolean);
  if (an !== me.name || ae !== me.email) return `its tip ${(sha ?? "").slice(0, 7)} is by ${an} <${ae}>, not the agent`;
  if (cn !== me.name || ce !== me.email) return `its tip ${(sha ?? "").slice(0, 7)} was committed by ${cn} <${ce}>, not the agent`;
  if (ps.length !== 1 || !tagShas.includes(ps[0])) return `its tip ${(sha ?? "").slice(0, 7)} is not one commit on a dev-* tag's commit`;
  return null;
}

/** the agent for one person's <you>/mine files CUT_AGE iterations old or more that no earlier PR or question covered: a
 *  draft PR from its own branch, or one question on #1153; then one ping. Returns what it did, in words */
export async function cut(d: DriftDeps & { ping: (p: Record<string, unknown>) => Promise<boolean> }, o: {
  repo: string; runner: string; runnerPrefix: string; it: Iteration; tagShas: string[]; person: PersonDrift; base: string; tip: string; dir: string;
}): Promise<string> {
  const p = o.person, old = toCut(p);
  if (!old.length) return `${p.name}: nothing old enough to cut`;
  // a file whose base..tip diff is empty is no change to cut
  const changed = await overPaths(d, ["diff", "--name-only", "--no-renames", o.base, o.tip], old.map((f) => f.path));
  if ("error" in changed) return `${p.name}: the change was not read (${changed.error}): nothing done`;
  const real = new Set(pathsIn(changed.out));
  const files = old.filter((f) => real.has(f.path));
  if (!files.length) return `${p.name}: no change between ${p.prefix}/mine's base and tip in its old files: nothing to cut`;
  const tree = await overPaths(d, ["ls-tree", o.tip], files.map((f) => f.path));
  if ("error" in tree) return `${p.name}: mine's tree was not read (${tree.error}): nothing done`;
  const blobOf = new Map(tree.out.split("\n").map((l) => /^\S+ \S+ (\S+)\t(.+)$/.exec(l)).filter((m): m is RegExpExecArray => !!m).map((m) => [m[2], m[1]]));
  const markOf = new Map(files.map((f) => [f.path, fingerprint({ path: f.path, blob: blobOf.get(f.path) ?? "" })]));

  // what was covered before: every PR from the agent's branch for this owner, and every question on #1153
  const branch = `${o.runnerPrefix}/base-drift-${p.prefix}-${ISSUE}`;
  const prs = JSON.parse(await d.gh(["pr", "list", "--repo", o.repo, "--head", branch, "--state", "all", "--limit", "100", "--json", "number,state,body,url"])) as { number: number; state: string; body: string; url: string }[];
  const asked = (await d.gh(["api", "--paginate", `repos/${o.repo}/issues/${ISSUE}/comments`, "--jq", ".[].body"]));
  const covered = coveredOf([...prs.map((x) => x.body ?? ""), asked], p.login);
  const fresh = files.filter((f) => !covered.has(markOf.get(f.path)!));
  if (!fresh.length) return `${p.name}: each old file was covered before (a PR from ${branch} or a question on #${ISSUE}): nothing more`;

  // an open PR keeps the files it holds that are still as mine has them: the new commit carries them and the new ones
  const open = prs.find((x) => x.state === "OPEN");
  const kept = open ? coveredOf([open.body ?? ""], p.login) : new Set<string>();
  const take = files.filter((f) => fresh.includes(f) || kept.has(markOf.get(f.path)!));

  const title = `drift: ${p.name}'s change in ${p.prefix}/mine, cut for main (#${ISSUE})`;
  const wt = join(o.dir, p.prefix), patch = join(o.dir, `${p.prefix}.patch`), bodyFile = join(o.dir, `${p.prefix}.md`);
  mkdirSync(o.dir, { recursive: true });
  await d.git(["worktree", "remove", "--force", wt]);
  rmSync(wt, { recursive: true, force: true });
  await d.git(["worktree", "prune"]);
  const made = await d.git(["worktree", "add", "--detach", wt, o.it.sha]);
  if (made.code !== 0) return `${p.name}: no scratch worktree (${firstOf(made.out)})`;
  try {
    // the change as a patch onto the scratch worktree, staged; false (and the worktree as it was) when it does not apply
    const ident = agentIdent(o.runner);
    const as = ["-c", `user.name=${ident.name}`, "-c", `user.email=${ident.email}`, "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false"];
    const back = async () => { await d.git(["-C", wt, "reset", "-q", "--hard"]); await d.git(["-C", wt, "clean", "-fdq"]); };
    const applies = async (fs: Aged[]): Promise<boolean | string> => {
      const diff = await overPaths(d, ["diff", "--binary", "--no-renames", o.base, o.tip], fs.map((f) => f.path));
      if ("error" in diff) return `the change was not read (${diff.error})`;
      if (!diff.out.trim()) return "the change is empty";   // never read as "not clean"
      writeFileSync(patch, diff.out);
      if ((await d.git(["-C", wt, "apply", "--3way", "--index", patch])).code === 0) return true;
      await back();
      return false;
    };
    // the new files with the open PR's kept ones; when that does not apply, the new files alone, each one in turn: the
    // ones that apply are cut, only the ones that still do not are asked about
    let cutFiles: Aged[] = take, askFiles: Aged[] = [];
    const whole = await applies(take);
    if (typeof whole === "string") return `${p.name}: ${whole}: nothing to cut`;
    if (!whole) {
      cutFiles = [];
      for (const f of fresh) {
        const one = await applies([f]);
        if (typeof one === "string") return `${p.name}: ${one} (${f.path}): nothing done`;
        if (!one) { askFiles.push(f); continue; }
        // a step of its own, so the next file's failure goes back only to here; folded into one commit below
        const step = await d.git(["-C", wt, ...as, "commit", "-q", "-m", `drift step: ${f.path}`]);
        if (step.code !== 0) return `${p.name}: the commit failed (${firstOf(step.out)})`;
        cutFiles.push(f);
      }
      if (cutFiles.length) await d.git(["-C", wt, "reset", "-q", "--soft", o.it.sha]);
    }

    const said: string[] = [], lines: string[] = [], urls: string[] = [];
    if (cutFiles.length) {
      // the branch is the agent's alone: one commit of its own on a dev-* tag's commit, or not there yet; else hands off
      const was = await refOf(d, `refs/remotes/origin/${branch}`);
      const head = typeof was === "string" ? await ok(d, ["log", "-1", `--format=${OWN_FORMAT}`, was]) : was === null ? "" : null;
      const theirs = head === null ? "it was not read" : ownBranch(head, o.tagShas, o.runner);
      const cutMarks = cutFiles.map((f) => markOf.get(f.path)!);
      if (theirs) said.push(`${branch} holds more than the agent's own commit or was not read (${theirs}): not pushed, nothing edited`);
      else {
        quietPush();
        const c = await d.git(["-C", wt, ...as, "commit", "-q", "-m", title]);
        const push = c.code !== 0 ? c : await d.git(["-C", wt, "push", "-q", `--force-with-lease=refs/heads/${branch}:${typeof was === "string" ? was : ""}`, "origin", `HEAD:refs/heads/${branch}`]);
        if (push.code !== 0) said.push(`${c.code !== 0 ? "the commit failed" : `${branch} was not pushed`} (${firstOf(push.out)})`);
        else {
          writeFileSync(bodyFile, prBody({ owner: p.login, name: p.name, prefix: p.prefix, iteration: o.it.name, tip: o.tip, files: cutFiles, marks: cutMarks, runner: o.runner }));
          let url = open?.url ?? "";
          if (open) await d.gh(["pr", "edit", String(open.number), "--repo", o.repo, "--title", title, "--body-file", bodyFile]);
          else url = (await d.gh(["pr", "create", "--repo", o.repo, "--draft", "--base", "main", "--head", branch, "--title", title, "--body-file", bodyFile])).trim().split("\n").pop() ?? "";
          said.push(`cut as ${open ? `#${open.number}, updated` : "a new draft PR"} ${url}`);
          lines.push(`the drift agent cut ${plural(cutFiles.length, "file")} for main as a draft PR`); urls.push(url);
        }
      }
    }
    if (askFiles.length) {
      // not clean: one question on #1153 for the new files that do not go on
      writeFileSync(bodyFile, askBody({ owner: p.login, name: p.name, prefix: p.prefix, iteration: o.it.name, files: askFiles, marks: askFiles.map((f) => markOf.get(f.path)!), runner: o.runner }));
      const url = (await d.gh(["issue", "comment", String(ISSUE), "--repo", o.repo, "--body-file", bodyFile])).trim().split("\n").pop() ?? "";
      said.push(`${plural(askFiles.length, "file")} ${askFiles.length === 1 ? "does" : "do"} not go on cleanly; asked on #${ISSUE} ${url}`);
      lines.push(`${plural(askFiles.length, "file")} ${askFiles.length === 1 ? "does" : "do"} not go onto ${o.it.name} cleanly; the drift agent asks why ${askFiles.length === 1 ? "it stays" : "they stay"}`); urls.push(url);
    }
    // one ping to the owner for whatever was posted
    if (lines.length) {
      const line = `your change in ${p.prefix}/mine went out without an iteration: ${lines.join("; ")}`;
      const sent = await d.ping({ to: p.login, pingKind: "decision", line: `${line}: ${urls.filter(Boolean).join(" ")}`.replace(/: $/, ""), issue: ISSUE, repo: o.repo });
      said.push(sent ? "pinged" : "not pinged (no relay)");
    }
    return `${p.name}: ${said.join("; ")}`;
  } finally {
    await d.git(["worktree", "remove", "--force", wt]);
    rmSync(patch, { force: true });
  }
}

// ---- run as a program: node dist/team/drift.js [--dry-run] [--calendar] [--iteration] [--repo owner/name] ----

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = () => process.env.SOL_DRIFT_FILE ?? join(STATE_DIR, "drift.json");

async function main(argv: string[]): Promise<number> {
  const root = resolve(ENGINE, "..", "..");
  if (argv.includes("--iteration")) {
    const { iterationNow } = await import("./iteration.js");
    const it = await iterationNow(root);
    if (!it) { console.error("drift: no dev-* tag here: no iteration yet"); return 1; }
    console.log(`${it.name} ${it.sha}`);
    return 0;
  }
  const { runnerOf } = await import("./release.js");
  const { readTeam } = await import("./night.js");
  const r0 = await runnerOf(argv, "drift");
  if (typeof r0 === "string") { console.error(r0); return 2; }
  const { git, gh, repo, rhythm, tell, stop } = r0;
  if (argv.includes("--calendar")) { process.stdout.write(`${driftCalendar(rhythm)}\n`); return 0; }
  const team = readTeam();
  const dryRun = argv.includes("--dry-run");
  const d: DriftDeps = { git, gh, now: () => new Date(), say: (l) => console.log(l) };
  try {
    const people = peopleOf(root).filter((p): p is Person & { prefix: string } => /^[\w.-]+$/.test(p.prefix ?? ""));
    const m = await measure(d, repo, people);
    if (!m) { console.error("drift: no dev-* tag: no iteration to measure against"); return 1; }
    const { file, bases, stale } = m;
    console.log(`drift: iteration ${file.iteration.name} ${file.iteration.sha.slice(0, 7)}`);
    for (const p of file.people) console.log(`drift: ${driftLine(p)}`);
    for (const p of file.left) console.log(`drift: ${p.name}: not measured, left out of the word (${p.why})`);
    // a second run against the same iteration (the release's own start, then the timer): said, and nothing new posted
    let before: DriftFile | null = null;
    try { before = JSON.parse(readFileSync(FILE(), "utf8")) as DriftFile; } catch { /* the first run */ }
    if (before && sameDrift(before, file)) console.log(`drift: ${file.iteration.name} was measured already and nobody's drift changed: the word is said again, nothing new is posted`);
    if (dryRun) {
      for (const p of file.people) { const c = toCut(p); if (c.length) console.log(`drift: old enough for the agent, ${p.name}: ${c.map((f) => f.path).join(", ")} (each one covered before is left)`); }
      console.log("drift: a dry run: drift.json, the relay and GitHub are left as they are");
      return 0;
    }
    mkdirSync(dirname(FILE()), { recursive: true });
    writeFileSync(FILE() + ".tmp", JSON.stringify(file, null, 2) + "\n");
    renameSync(FILE() + ".tmp", FILE());
    const told = await tell("drift", { iteration: file.iteration.name, people: saidPeople(file.people) });
    console.log(told ? "drift: said on the relay" : "drift: the relay was not in sight: the word waits for tomorrow's run");
    if (stale) { console.log("drift: the word above is stale (the fetch failed): the agent does nothing, no cut, no post, no ping"); return 0; }
    if (!team.speak.github) { console.log("drift: my agent may not speak on GitHub (Settings, my agent): no cut, nothing posted"); return 0; }
    const runner = team.me.login || (await gh(["api", "user", "--jq", ".login"]).catch(() => "")).trim();
    const runnerPrefix = people.find((p) => p.login.toLowerCase() === runner.toLowerCase())?.prefix ?? "";
    if (!runnerPrefix) { console.log(`drift: ${runner || "this runner"} has no page in docs/people: no branch of its own, no cut`); return 0; }
    const tagShas = (await tagsNow(d)).map((t) => t.sha);
    for (const p of file.people) {
      const b = bases.get(p.login);
      if (!b || !toCut(p).length) continue;
      try { console.log(`drift: ${await cut({ ...d, ping: (x) => tell("ping", x) }, { repo, runner, runnerPrefix, it: file.iteration, tagShas, person: p, base: b.base, tip: b.tip, dir: join(STATE_DIR, "drift-cut") })}`); }
      catch (e) { console.log(`drift: ${p.name}: the agent stopped (${firstOf(String((e as Error)?.message ?? e))})`); }
    }
    return 0;
  } finally { await stop(); }
}

const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(`drift: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
}
