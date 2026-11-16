// The hand-in session (#420, part of #413, team flow v2): at the project's hand-in hour (the rhythm's `handIn`, 20:00 by
// default, `.sol/rhythm.json` read through tonight.ts) each developer's Sol opens a Work session in that person's folder
// for the project, if they have open changes there. Its first turn is a list, and asks nothing (#476): their open PRs
// (theirs only), what goes in tonight and what is held (a draft, red or running checks, Not tonight pressed on its card, a
// base that is not the default branch), each with its clashes with the others (night.ts findClashes, on the folder's own
// origin refs) and what it misses for the review (no "What to try", red checks).
//   handed in   an open PR marked ready (not a draft), based on the default branch, by the review hour. tonight.ts's
//               handedIn() is the one rule; the 9pm summary says of each change whether it was handed in during the
//               hand-in (tonight.ts handInOf, from GitHub's own "ready for review" time, so every reviewer's Sol reads the same)
//   the card    (#476) once a change is ready (readyToHandIn: GitHub's checks green on its latest commit; once the gate,
//               #481, lands, those checks and the gate both), at any hour, the Work session that worked on it shows a
//               card: its folder on the PR's branch, or (#579) the session that opened the PR, itself or through the
//               background agents it started (their `gh pr create` in its transcripts, openedIn). "fr-12 is
//               ready. Bring it into sol-dev tonight so Sol developers can try it?", Bring it in / Not tonight. Only that
//               press hands a change in (the PR marked ready); Not tonight leaves it a draft and is not asked again for
//               that commit that day. A press carries the card's key, which only Sol's own window gets, as the review's
//   picking     the session's agent never hands a change in (#476). The tool hand_in only takes one back to draft, and only
//               when the project lets agents pick: a project setting, off by default, read through agentsMayPick
//   merge       (#579) the wrap-up box's merge button, the person's press through the card's keyed route (mergePress):
//               the PR marked ready if it is a draft, then merged. The only merge here, and never an agent's
// Never a merge from here but that press. The same fences as the review session (#416): the tool works only in a hand-in session, on
// the person's own open PRs, after asking GitHub and the project again; the guard refuses `gh pr ready` in a shell (the
// card is the way) and the hand-in opened by hand (POST /tonight); the words say it.
// Everything that touches GitHub, git, the clock or the session is handed in (HandInDeps), so the tests run with fakes.
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { open } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { STATE_DIR } from "../work/state.js";
import { fence } from "./start.js";
import { findClashes, type Clash, type Pr, type Run } from "./night.js";
import type { Item } from "../work/items.js";
import {
  clockIn, rhythmOf, defaultBranchOf, tryOf, feltOf, wasOpened, markOpened, halfOpened, hourWords, RHYTHM_PATH,
  type Rhythm, type RawPr, type TonightDeps,
} from "./tonight.js";

export const PROJECT_PATH = ".sol/project.json";
const LOGIN = /^[A-Za-z0-9-]{1,39}$/;
const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

// ---- when (pure) ----

/** the day a moment is a hand-in day (pure): from the hand-in hour up to the review hour, in the rhythm's zone; else
 *  none. A Sol that opens after the review hour opens no hand-in: the review has begun */
export function handInDay(r: Pick<Rhythm, "handIn" | "review" | "zone">, now: Date): string | null {
  const c = clockIn(now, r.zone), a = mins(r.handIn), b = mins(r.review);
  return (a < b ? c.minutes >= a && c.minutes < b : c.minutes >= a) ? c.day : null;
}
/** the review night a moment's card asks about (pure, #476): today's date before the review hour, in the rhythm's zone;
 *  from the review hour on, the next day's. A card's `day`, and what Not tonight and "asked already" are kept under, so a
 *  card declined at 22:00 for tomorrow night is not asked again at 00:05 about that same night */
export function reviewNightOf(r: Pick<Rhythm, "review" | "zone">, now: Date): string {
  const c = clockIn(now, r.zone);
  return c.minutes >= mins(r.review) ? new Date(Date.parse(`${c.day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : c.day;
}
export { hourWords, readyAt, handInOf } from "./tonight.js";   // what "handed in" means, read by the 9pm summary too
export const handInKey = (repo: string, day: string) => `${repo.toLowerCase()}|hand-in|${day}`;

// ---- my changes (pure) ----

export type Checks = "passing" | "failing" | "pending" | "none";
export type Mine = {
  number: number; title: string; url: string; branch: string; draft: boolean; base: string;
  handedIn: boolean; checks: Checks; try: string; felt: string; missing: string[]; clashes: string[];
  sha: string;            // its latest commit (#476)
  notTonight?: true;      // Not tonight was pressed on its card, on this commit, for tonight's review (#476)
};
export type RawMine = RawPr & { headRefName?: string; statusCheckRollup?: { status?: string; conclusion?: string; state?: string }[] };
export const MINE_FIELDS = "number,title,url,body,isDraft,headRefName,headRefOid,baseRefName,author,statusCheckRollup";

/** a PR's checks as one word (pure): failing when any failed, pending while any runs, passing when all went and at
 *  least one passed, none when there are none or every one was skipped or neutral (nothing ran, so nothing passed) */
export function checksOf(rollup: RawMine["statusCheckRollup"]): Checks {
  const xs = Array.isArray(rollup) ? rollup : [];
  if (!xs.length) return "none";
  const word = (x: { status?: string; conclusion?: string; state?: string }) => String(x.conclusion || x.state || "").toUpperCase();
  if (xs.some((x) => ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(word(x)))) return "failing";
  if (xs.some((x) => (x.status && String(x.status).toUpperCase() !== "COMPLETED") || ["PENDING", "EXPECTED", "QUEUED", "IN_PROGRESS"].includes(word(x)))) return "pending";
  return xs.some((x) => word(x) === "SUCCESS") ? "passing" : "none";
}

const oneLine = (s: unknown, n: number) => { const t = String(s ?? "").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

/** one of my PRs as the hand-in lists it (pure): its state, what it misses for the review, its clashes */
export function mineOf(p: RawMine, base: string, clashes: Clash[]): Mine {
  const draft = !!p.isDraft, on = String(p.baseRefName ?? ""), checks = checksOf(p.statusCheckRollup);
  const tr = tryOf(p.body ?? ""), felt = feltOf(p.body ?? "");
  const missing: string[] = [];
  if (on !== base) missing.push(`it is based on ${on || "another branch"}, not ${base}, so it cannot be handed in: its base changes first`);
  if (!tr) missing.push(`no "What to try" in its description, for the reviewer`);
  if (!felt) missing.push(`no "Felt or silent" line in its description`);
  if (checks === "failing") missing.push("its checks are red");
  if (checks === "pending") missing.push("its checks are still running");
  const said = clashes.filter((c) => c.a.number === p.number || c.b?.number === p.number).map((c) => {
    const other = c.a.number === p.number ? c.b : c.a;
    return `${other ? `#${other.number} (${other.login})` : base} on ${c.files.join(", ")}`;
  });
  return {
    number: p.number, title: oneLine(p.title, 160), url: String(p.url ?? ""), branch: String(p.headRefName ?? ""), draft, base: on,
    handedIn: !draft && on === base, checks, try: tr, felt, missing, clashes: said, sha: String(p.headRefOid ?? ""),
  };
}

// ---- the first turn (pure but for the fence's mark) ----

/** why a change is held tonight (pure, #476): the first thing that keeps it out, in a few words */
export function heldWhy(x: Mine, base: string): string {
  if (x.base !== base) return `based on ${x.base || "another branch"}, not ${base}: its base changes first`;
  if (x.notTonight) return "Not tonight was pressed on its card";
  if (x.checks === "failing") return "a draft, its checks are red";
  if (x.checks === "pending") return "a draft, its checks are still running";
  if (x.checks === "none") return "a draft, no checks have run on it";
  return "a draft, its checks are green: a card asks in the Work session on its branch or the one that opened it, if one was used in the last three days; else \"Ready for review\" on GitHub brings it in";
}

/** the hand-in's first turn (#420, a list since #476): what goes in tonight and what is held, and nothing asked */
export function handInWords(a: { repo: string; day: string; me: string; base: string; rhythm: Rhythm; mine: Mine[]; pick: boolean; clashesChecked: boolean }, nonce?: string): string {
  const r = a.rhythm, clock = r.zone ? `${r.zone} time` : "this machine's clock";
  const one = (x: Mine) => [
    `#${x.number} ${x.title}`,
    `  ${x.draft ? "draft" : "ready"} · based on ${x.base || "?"} · checks ${x.checks} · ${x.handedIn ? "handed in" : `held: ${heldWhy(x, a.base)}`}`,
    `  what to try: ${x.try || "the PR does not say"}`,
    ...(x.missing.length ? [`  missing for the review: ${x.missing.join("; ")}`] : []),
    `  clashes: ${x.clashes.length ? x.clashes.join("; ") : a.clashesChecked ? "none" : "not checked (the folder's origin could not be read)"}`,
    `  ${x.url}`,
  ].join("\n");
  const going = a.mine.filter((x) => x.handedIn), held = a.mine.filter((x) => !x.handedIn);
  const list = [
    `Going in tonight (${going.length}):`, "", ...(going.length ? [going.map(one).join("\n\n")] : ["nothing yet"]), "",
    `Held (${held.length}):`, "", ...(held.length ? [held.map(one).join("\n\n")] : ["nothing"]),
  ].join("\n");
  const n = a.mine.length;
  const back = a.pick
    ? `This project lets agents take a change back to draft (its setting, ${PROJECT_PATH}): the tool hand_in with ready false, only on ${a.me}'s word.`
    : `To take a change back out, ${a.me} presses "Convert to draft" under Reviewers on GitHub.`;
  return [
    `This is tonight's hand-in for ${a.repo}, ${a.day}: the list of what goes into tonight's dev review and what is held. Sol opened it at the project's hand-in hour (${hourWords(r.handIn)}, ${clock}; ${RHYTHM_PATH}) because ${a.me} has ${n} open change${n === 1 ? "" : "s"} there. A change goes in when it is ready on GitHub (not a draft) and based on ${a.base} by the review hour, ${hourWords(r.review)}; the dev review then takes it in or sends it back.`, "",
    fence(list, nonce), "",
    `Only ${a.me}'s press hands a change in: Bring it in, on the card the session that worked on it shows once its checks are green, or "Ready for review" at the foot of the PR on GitHub. You never hand a change in or mark one ready, never close a PR and never merge. ${back}`,
    `You may read a change (gh pr view / gh pr diff), and fix what it misses on ${a.me}'s own branch when asked.`,
    `Start now with the list in a few lines: what goes in tonight, what is held and why, and for a held one what would bring it in. Ask nothing about what goes in: each change's card asks. In everything you write, say "hand in" and "send back"; never "merge" or "push".`,
  ].join("\n");
}

// ---- the project's word on picking ----

const picks = new Map<string, { v: boolean; at: number }>();
/** whether the project lets agents take a person's PRs back to draft (#420; marking one ready is the person's press only
 *  since #476): `agents.pick` in the project's
 *  settings, the record's `.sol/project.json` first (#428, project.ts), else the file of that name on its default branch;
 *  off when the file, the word or GitHub is missing. #428 builds the project
 *  settings at the same time: this function is the one place that reads it, so its shape changes here only */
// where the word comes from first (#428): the project's settings in its record (project.ts sets this). It answers the
// record's agents.pick, or undefined when the record has no agent rules of its own (or the repo is in no project here):
// then the file below is read as before. A record that cannot be read is no: off, never guessed on
let pickSource: ((repo: string) => Promise<boolean | undefined>) | null = null;
export const setPickSource = (fn: typeof pickSource) => { pickSource = fn; picks.clear(); };
export const forgetPicks = () => picks.clear();
export async function agentsMayPick(d: Pick<TonightDeps, "gh" | "now">, repo: string, fresh = false): Promise<boolean> {
  const had = picks.get(repo), t = d.now().getTime();
  if (!fresh && had && t - had.at < 10 * 60_000) return had.v;
  let v = false;
  try {
    const own = pickSource ? await pickSource(repo) : undefined;
    if (own !== undefined) { picks.set(repo, { v: own, at: t }); return own; }
  } catch { return false; }
  try { const j = JSON.parse(await d.gh(["api", `repos/${repo}/contents/${PROJECT_PATH}`, "-H", "Accept: application/vnd.github.raw"])); v = j?.agents?.pick === true; }
  catch { v = false; }
  picks.set(repo, { v, at: t });
  return v;
}

// ---- kept: which sessions are hand-ins, and whose ----

type Kept = { repo: string; me: string; day: string; base: string; numbers: number[] };
const DIR = join(STATE_DIR, "tonight");
let kept: Record<string, Kept> | null = null;
const keptFile = () => join(DIR, "handin.json");
function keptMap() {
  if (kept) return kept;
  try { kept = JSON.parse(readFileSync(keptFile(), "utf8")); if (!kept || typeof kept !== "object") kept = {}; } catch { kept = {}; }
  return kept!;
}
function keep(id: string, k: Kept) {
  keptMap()[id] = k;
  // written whole or not at all (#11)
  try { mkdirSync(DIR, { recursive: true }); writeFileSync(keptFile() + ".tmp", JSON.stringify(keptMap())); renameSync(keptFile() + ".tmp", keptFile()); } catch { /* it stays live */ }
}
export const handInOfSession = (id: string): Kept | undefined => keptMap()[id];
/** for tests */
export function forgetHandIn() { kept = null; picks.clear(); trying.clear(); cardStore = null; cardKeys.clear(); folderRepos.clear(); reads.clear(); lastScan = 0; }

// ---- the run ----

export type HandInDeps = TonightDeps & {
  git: (cwd: string, args: string[]) => Promise<Run>;   // never throws: the exit code is part of the answer
};

/** my open PRs in the project with their clashes against everyone's (the folder's origin, fetched first) */
export async function mineFor(d: HandInDeps, repo: string, folder: string, me: string): Promise<{ mine: Mine[]; base: string; clashesChecked: boolean }> {
  const base = await defaultBranchOf(d, repo);
  const raw = JSON.parse(await d.gh(["pr", "list", "--repo", repo, "--state", "open", "--limit", "100", "--json", MINE_FIELDS]) || "[]") as RawMine[];
  const ofMe = (p: RawMine) => (p.author?.login ?? "").toLowerCase() === me.toLowerCase();
  const mineRaw = raw.filter(ofMe).sort((a, b) => a.number - b.number);
  if (!mineRaw.length) return { mine: [], base, clashesChecked: false };
  let clashes: Clash[] = [], clashesChecked = false;
  try {
    const f = await d.git(folder, ["fetch", "--quiet", "origin"]);
    if (f.code !== 0) throw new Error("fetch");
    const prs: Pr[] = raw.map((p) => ({ number: p.number, branch: String(p.headRefName ?? ""), login: p.author?.login ?? "?", title: p.title, body: p.body ?? "", isDraft: !!p.isDraft }));
    const mineSet = new Set(mineRaw.map((p) => p.number));
    clashes = await findClashes({ git: (args: string[]) => d.git(folder, args) }, prs, { base, only: (p) => mineSet.has(p.number) });
    clashesChecked = true;
  } catch { /* said as "not checked" */ }
  return { mine: mineRaw.map((p) => mineOf(p, base, clashes)), base, clashesChecked };
}

/** one hand-in session opened: null-ish when the person has no open change there (no session for that) */
export async function openHandIn(d: HandInDeps, a: { repo: string; folder: string; day: string; rhythm: Rhythm; key?: string; force?: boolean }): Promise<{ session?: string; empty?: true }> {
  const me = d.me();
  const { mine, base, clashesChecked } = await mineFor(d, a.repo, a.folder, me);
  if (!mine.length && !a.force) return { empty: true };
  const night = reviewNightOf(a.rhythm, d.now());   // Not tonight is kept under the review night (#476)
  for (const x of mine) if (x.draft && heldToday(a.repo, x.number, x.sha, night)) x.notTonight = true;
  const pick = await agentsMayPick(d, a.repo, true);
  let session = a.key ? halfOpened(a.key) : "";
  if (!session) {
    session = await d.start({ cwd: a.folder, repo: a.repo, title: `hand-in · ${a.day}`, text: handInWords({ repo: a.repo, day: a.day, me, base, rhythm: a.rhythm, mine, pick, clashesChecked }) });
    if (a.key) markOpened(a.key, session, d.now(), false);
  }
  keep(session, { repo: a.repo, me, day: a.day, base, numbers: mine.map((x) => x.number) });
  return { session };
}

async function projects(d: HandInDeps): Promise<{ repo: string; folder: string; rhythm: Rhythm }[]> {
  const out: { repo: string; folder: string; rhythm: Rhythm }[] = [];
  for (const [repo, folder] of Object.entries(await d.folders())) {
    if (!REPO.test(repo) || !folder) continue;
    const rhythm = await rhythmOf(d, repo);
    if (rhythm) out.push({ repo, folder, rhythm });
  }
  return out;
}

const trying = new Map<string, number>();
let busy = false;
/** once a minute (team/wire.ts, beside the review's): at the hand-in hour, my hand-in opens once a day a project, on the
 *  engine my window is on */
export async function tick(d: HandInDeps): Promise<string[]> {
  if (busy) return [];
  busy = true;
  const done: string[] = [];
  try {
    const me = d.me();
    if (!me || !LOGIN.test(me) || (d.present && !d.present())) return done;
    for (const p of await projects(d)) {
      const day = handInDay(p.rhythm, d.now());
      if (!day) continue;
      const key = handInKey(p.repo, day);
      if (wasOpened(key)) continue;
      const failed = trying.get(key);
      if (failed && d.now().getTime() - failed < 10 * 60_000) continue;
      try {
        const r = await openHandIn(d, { ...p, day, key });
        markOpened(key, r.session ?? "", d.now());
        trying.delete(key);
        d.say?.(r.session ? `tonight: the hand-in of ${p.repo} opened (${r.session})` : `tonight: no open change of mine in ${p.repo}, no hand-in`);
        if (r.session) done.push(r.session);
      } catch (e) {
        trying.set(key, d.now().getTime());
        d.say?.(`tonight: the hand-in of ${p.repo} did not open: ${String((e as Error)?.message ?? e).split("\n")[0]}`);
      }
    }
  } finally { busy = false; }
  return done;
}

/** a hand-in opened now, by the person (POST /tonight { role: "hand-in" }): the first project with a rhythm (or `repo`),
 *  today, whether or not one was opened already */
export async function openHandInNow(d: HandInDeps, a: { repo?: string }): Promise<{ session?: string; error?: string }> {
  const all = await projects(d);
  const p = a.repo ? all.find((x) => x.repo.toLowerCase() === a.repo!.toLowerCase()) : all[0];
  if (!p) return { error: a.repo ? `no folder here holds ${a.repo} with a ${RHYTHM_PATH}` : `no project here has a rhythm (${RHYTHM_PATH})` };
  const r = await openHandIn(d, { ...p, day: clockIn(d.now(), p.rhythm.zone).day, force: true });
  // opened by hand inside the hour: the tick does not open a second one that day
  const day = handInDay(p.rhythm, d.now());
  if (day && r.session) markOpened(handInKey(p.repo, day), r.session, d.now());
  return { session: r.session };
}

/** the tool hand_in (work/tools.ts): the session's agent takes one of the person's PRs back to draft. Marking one ready
 *  hands it in, and that is the person's press only (#476): refused here, whatever the project's setting. Only in a
 *  hand-in session, only the person's own open PRs listed there, only when the project lets agents pick (asked again
 *  now); else the words say what the person presses. Never a merge */
export async function pick(d: HandInDeps, a: { sessionId: string; number: number; ready: boolean }): Promise<string> {
  const k = handInOfSession(a.sessionId);
  if (!k) return "not done: hand_in works only in a hand-in session, the one Sol opens at the project's hand-in hour";
  const me = d.me();
  if (!me || me.toLowerCase() !== k.me.toLowerCase()) return `not done: this hand-in is ${k.me}'s, and this Sol is ${me || "signed out of GitHub"}`;
  if (!k.numbers.includes(a.number)) return `not done: #${a.number} is not one of ${k.me}'s changes in this hand-in (${k.numbers.map((n) => `#${n}`).join(", ") || "none"})`;
  const now = JSON.parse(await d.gh(["pr", "view", String(a.number), "--repo", k.repo, "--json", "state,isDraft,author,baseRefName,url"]) || "{}") as
    { state?: string; isDraft?: boolean; author?: { login?: string }; baseRefName?: string; url?: string };
  const url = now.url || `https://github.com/${k.repo}/pull/${a.number}`;
  const press = a.ready ? `"Ready for review" at the foot of ${url}` : `"Convert to draft" under Reviewers on ${url}`;
  if (a.ready) return `not done: only ${k.me}'s press hands a change in, never an agent: Bring it in on its card in the session that worked on it, or ${press}. Tell ${k.me}.`;
  if (!(await agentsMayPick(d, k.repo, true))) return `not done: ${k.repo} does not let agents pick (${PROJECT_PATH}, agents.pick, off by default). Tell ${k.me} to press ${press}.`;
  if (now.state !== "OPEN") return `not done: #${a.number} is ${String(now.state ?? "not open").toLowerCase()} on GitHub`;
  if ((now.author?.login ?? "").toLowerCase() !== k.me.toLowerCase()) return `not done: #${a.number} is ${now.author?.login ?? "someone else"}'s, not ${k.me}'s`;
  if (now.isDraft) return `#${a.number} is a draft already`;
  await d.gh(["pr", "ready", String(a.number), "--repo", k.repo, "--undo"]);
  return `#${a.number} is a draft again: not handed in tonight`;
}

// ---- the hand-in card (#476): "fr-12 is ready. Bring it into sol-dev tonight so Sol developers can try it?" ----

/** whether a change is ready to hand in (pure, #476). Until the gate exists: GitHub's checks green on the PR's latest
 *  commit (the rollup gh gives is the head commit's); no checks at all is not ready, nothing passed. When the gate (#481)
 *  lands, this is the one line that changes, and it becomes the checks AND the gate (`gateGreen()` on the PR's head),
 *  never the gate alone: the gate runs no unit tests, the checks do. Nothing else decides when the card shows */
export function readyToHandIn(pr: Pick<RawMine, "statusCheckRollup">): boolean {
  return checksOf(pr.statusCheckRollup) === "passing";
}

// the feature map, specs/features.json (#480, CONTRACTS). #480 writes the reader at team/features.ts (readFeatures,
// featureOf); until it is on main, these few lines read the same shape. Once it lands, featureFor uses its featureOf
type Feature = { id: string; name: string; paths: string[] };
/** a path under a feature's glob (pure): `*` within a folder, `**` across folders, a plain path is itself or a folder */
export function underGlob(glob: string, path: string): boolean {
  const g = glob.replace(/^\.\//, "").replace(/\/+$/, "");
  if (!g) return false;
  if (!/[*?]/.test(g)) return path === g || path.startsWith(g + "/");
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*" && g[i + 1] === "*") { if (g[i + 2] === "/") { re += "(?:.*/)?"; i += 2; } else { re += ".*"; i += 1; } }
    else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`).test(path);
}
/** the feature most of a change's files belong to (pure): the map as read, the PR's paths; the first in the map wins a
 *  tie; null with no map or no match */
export function featureFor(map: unknown, files: string[]): { id: string; name: string } | null {
  const fs = (map as { features?: unknown })?.features;
  if (!Array.isArray(fs)) return null;
  let best: Feature | null = null, most = 0;
  for (const f of fs as Feature[]) {
    if (!f || typeof f.id !== "string" || !/^fr-\d{2,}$/.test(f.id) || !Array.isArray(f.paths)) continue;
    const n = files.filter((p) => f.paths.some((g) => typeof g === "string" && underGlob(g, p))).length;
    if (n > most) { most = n; best = f; }
  }
  return best ? { id: best.id, name: oneLine(best.name, 80) } : null;
}
const readMap = (top: string): unknown => { try { return JSON.parse(readFileSync(join(top, "specs", "features.json"), "utf8")); } catch { return null; } };

/** the issue a PR names (pure): "Part of / Closes / Fixes #N" in its description, else the number its branch ends in */
export function issueOf(body: string, branch: string): number | null {
  const m = /\b(?:part of|closes|close|closed|fixes|fix|fixed|resolves|resolve|resolved)\s+#(\d+)/i.exec(body) ?? /-(\d+)$/.exec(branch);
  return m ? Number(m[1]) : null;
}

export type CardState = "busy" | "in" | "held" | "gone";
export type HandInCard = Item & {
  kind: "handin"; repo: string; base: string; number: number; sha: string; title: string; url: string; author: string;
  feature?: { id: string; name: string }; issue?: number;
  ask: string;            // the card's question, whole
  day: string; zone: string;   // day: the review night it asks about (reviewNightOf), not the calendar day it was put
  state?: CardState; why?: string; error?: string;
  after: string;          // the item it was put after: where it sits when the session is opened again
};
const repoName = (repo: string) => repo.split("/")[1] ?? repo;
/** who tries it once it is in (pure): the audience by name for Sol's own repository, else the project's people */
const triers = (repo: string) => (/\/sol-dev$/i.test(repo) ? "Sol developers" : "the team");
/** the card's question (pure): the feature's id, else the issue, else the PR; tonight, or tomorrow night once the
 *  review hour has passed */
export function askOf(a: { repo: string; number: number; feature?: { id: string } | null; issue?: number | null; late?: boolean }): string {
  const who = a.feature ? a.feature.id : `#${a.issue ?? a.number}`;
  return `${who} is ready. Bring it into ${repoName(a.repo)} ${a.late ? "tomorrow night" : "tonight"} so ${triers(a.repo)} can try it?`;
}

/** one card (pure) */
export function cardOfHandIn(a: { repo: string; base: string; pr: RawMine; feature: { id: string; name: string } | null; day: string; zone: string; late: boolean; after: string }): HandInCard {
  const p = a.pr, sha = String(p.headRefOid ?? ""), issue = issueOf(p.body ?? "", String(p.headRefName ?? ""));
  return {
    id: `handin:${p.number}:${sha.slice(0, 12)}:${a.day}`, kind: "handin", repo: a.repo, base: a.base, number: p.number, sha,
    title: oneLine(p.title, 160), url: String(p.url ?? ""), author: p.author?.login ?? "",
    ...(a.feature ? { feature: a.feature } : {}), ...(issue ? { issue } : {}),
    ask: askOf({ repo: a.repo, number: p.number, feature: a.feature, issue, late: a.late }), day: a.day, zone: a.zone, after: a.after,
  };
}

// kept beside the review's cards: the cards of each session, and the Not tonight presses (a PR, its commit, the review
// night declined)
type CardFile = { cards: Record<string, HandInCard[]>; held: Record<string, { sha: string; day: string }> };
let cardStore: CardFile | null = null;
const cardFile = () => join(DIR, "handin-cards.json");
function store(): CardFile {
  if (cardStore) return cardStore;
  try { cardStore = JSON.parse(readFileSync(cardFile(), "utf8")); } catch { cardStore = null; }
  if (!cardStore || typeof cardStore !== "object" || typeof cardStore.cards !== "object" || typeof cardStore.held !== "object") cardStore = { cards: {}, held: {} };
  // read from disk, nothing is being done: a press the engine stopped in the middle of is open again
  for (const list of Object.values(cardStore.cards)) for (const c of list) if (c.state === "busy") delete c.state;
  return cardStore;
}
function saveCards() {
  // written whole or not at all (#11)
  try { mkdirSync(DIR, { recursive: true }); writeFileSync(cardFile() + ".tmp", JSON.stringify(store())); renameSync(cardFile() + ".tmp", cardFile()); } catch { /* it stays live */ }
}
const heldKey = (repo: string, n: number) => `${repo.toLowerCase()}#${n}`;
/** Not tonight was pressed on this change, on this commit, for that review night */
export function heldToday(repo: string, n: number, sha: string, day: string): boolean {
  const h = store().held[heldKey(repo, n)];
  return !!h && !!sha && h.sha === sha && h.day === day;
}
export const handInCardsOf = (id: string): HandInCard[] => store().cards[id] ?? [];
export function putHandIn(id: string, card: HandInCard, bus: (m: object) => void) {
  const list = store().cards[id] ?? [];
  const i = list.findIndex((x) => x.id === card.id);
  if (i >= 0) list[i] = card; else list.push(card);
  store().cards[id] = list.slice(-12);   // a session keeps its last dozen cards
  saveCards();
  bus({ type: "work.item", sessionId: id, item: card });
}

// a card's key, as the review's (tonight.ts keyOf): made in this engine's memory, never written down; the face asks for
// it (team.handin.key, answered to Sol's own window only) and a press must carry it, so the session's own agent, which
// reads the transcript and the disk, cannot press
const cardKeys = new Map<string, string>();
/** the key of a session's presses, made once it has a card, or (`box`, #579) once its wrap-up box offers a merge */
export function cardKeyOf(id: string, box = false): string {
  if (!id || (!box && !handInCardsOf(id).length)) return "";
  let k = cardKeys.get(id);
  if (!k) { k = randomBytes(16).toString("hex"); cardKeys.set(id, k); }
  return k;
}

/** a thread's items with its hand-in cards in place (pure but for the store): each after the item it was put after,
 *  else at the end */
export function withHandIn(id: string, items: Item[]): Item[] {
  const cs = handInCardsOf(id);
  if (!cs.length) return items;
  const out = items.filter((i) => i.kind !== "handin");
  const tail: Item[] = [];
  for (const c of cs) {
    const at = c.after ? out.findIndex((i) => i.id === c.after) : -1;
    if (at < 0) { tail.push(c); continue; }
    let j = at + 1;
    while (j < out.length && out[j].kind === "handin") j++;   // two cards after the same item keep their order
    out.splice(j, 0, c);
  }
  return [...out, ...tail];
}

// ---- which session opened a PR (#579) ----
// A session that hands work to background builders in /tmp side copies never sits on their branches, so the branch alone
// never found it. The honest link is the transcripts: a Bash call whose command is `gh pr create`, and its result naming
// the PR's page, in the session's own transcript or in one of the agents it started (Claude Code keeps theirs beside
// it, work/sessions.ts transcriptFiles). A session that only read a PR (gh pr view, a link in a message) opened nothing.
const PR_URL = /github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/pull\/(\d+)/g;
export type Opened = { pending: Set<string>; found: Set<string> };
/** the PRs a transcript's lines opened, as `owner/repo#n` with the repository in lower case (pure). `seen` carries the
 *  calls still waiting for their result and what was found, from one read of a growing file to the next */
export function openedIn(lines: Iterable<string>, seen: Opened = { pending: new Set(), found: new Set() }): Opened {
  for (const line of lines) {
    if (!line.includes("/pull/") && !/\bgh\s+pr\s+create\b/.test(line)) continue;   // the rest is never parsed
    let j: { message?: { content?: unknown } };
    try { j = JSON.parse(line); } catch { continue; }
    const content = j?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const b of content as { type?: string; id?: string; name?: string; input?: { command?: unknown }; tool_use_id?: string; content?: unknown }[]) {
      if (b?.type === "tool_use" && b.name === "Bash" && typeof b.id === "string" && /\bgh\s+pr\s+create\b/.test(String(b.input?.command ?? ""))) seen.pending.add(b.id);
      else if (b?.type === "tool_result" && typeof b.tool_use_id === "string" && seen.pending.has(b.tool_use_id)) {
        seen.pending.delete(b.tool_use_id);
        const text = typeof b.content === "string" ? b.content
          : Array.isArray(b.content) ? (b.content as { text?: unknown }[]).map((x) => String(x?.text ?? "")).join("\n") : "";
        for (const m of text.matchAll(PR_URL)) seen.found.add(`${m[1].toLowerCase()}#${Number(m[2])}`);
      }
    }
  }
  return seen;
}
// each transcript read once, then only what was added since (a transcript only grows): its offset, what it found
const reads = new Map<string, Opened & { at: number }>();
/** the PRs these transcripts opened (openedIn over the files, read in chunks so the engine keeps answering) */
export async function openedInFiles(files: string[]): Promise<string[]> {
  const out = new Set<string>();
  for (const f of files) {
    let r = reads.get(f);
    try {
      const fh = await open(f, "r");
      try {
        const size = (await fh.stat()).size;
        if (!r || size < r.at) { r = { at: 0, pending: new Set(), found: new Set() }; reads.set(f, r); }
        // in bytes, never decoded halves: only whole lines are read, the rest waits for its end
        let tail = Buffer.alloc(0);
        while (r.at + tail.length < size) {
          const buf = Buffer.alloc(1 << 20);
          const { bytesRead } = await fh.read(buf, 0, buf.length, r.at + tail.length);
          if (bytesRead <= 0) break;
          const bytes = Buffer.concat([tail, buf.subarray(0, bytesRead)]);
          const cut = bytes.lastIndexOf(0x0a);
          if (cut < 0) { tail = bytes; if (tail.length > 64 << 20) break; continue; }   // one line longer than 64 MB: let it be
          openedIn(bytes.toString("utf8", 0, cut).split("\n"), r);
          r.at += cut + 1;
          tail = bytes.subarray(cut + 1);
        }
      } finally { await fh.close(); }
    } catch { /* gone or unreadable: what was found stays */ }
    for (const k of r?.found ?? []) out.add(k);
  }
  return [...out];
}

export const CARD_FIELDS = "number,title,url,body,isDraft,isCrossRepository,headRefName,headRefOid,baseRefName,author,statusCheckRollup,files";
export type CardDeps = HandInDeps & {
  /** the Work sessions on this machine (work/sessions.ts) */
  sessions: () => Promise<{ id: string; cwd: string; updatedAt: number; archived?: boolean; gone?: boolean }[]>;
  /** the id of a session's last item, "" when it has none */
  lastItem: (id: string) => Promise<string>;
  /** the session's row says something new */
  unread?: (id: string) => void;
  /** the PRs a session opened, itself or through the background agents it started, as `owner/repo#n` (#579;
   *  openedInFiles over work/sessions.ts transcriptFiles) */
  opened?: (id: string, cwd: string) => Promise<string[]>;
};

/** where a ready change's card goes (pure, #579): the latest session touched among those on its branch and those that
 *  opened it (itself or through its agents); none when no session worked on it */
export function cardSessionOf<S extends { id: string; updatedAt: number }>(a: { repo: string; number: number; branch: string; onBranch: (S & { branch: string })[]; openers: (S & { opened: string[] })[] }): S | undefined {
  const key = `${a.repo.toLowerCase()}#${a.number}`;
  const all: S[] = [...a.onBranch.filter((w) => w.branch === a.branch), ...a.openers.filter((s) => s.opened.includes(key))];
  return all.sort((x, y) => y.updatedAt - x.updatedAt)[0];
}

const folderRepos = new Map<string, { repo: string; top: string }>();
const SINCE = 3 * 86_400_000, EVERY = 2 * 60_000;
/** a folder's repository, top and branch, from git (the repository and top kept for the engine's run) */
async function folderOf(d: HandInDeps, cwd: string): Promise<{ repo: string; top: string; branch: string } | null> {
  const head = await d.git(cwd, ["rev-parse", "--abbrev-ref", "HEAD", "--show-toplevel"]);
  if (head.code !== 0) return null;
  const [branch, top] = head.out.trim().split("\n").map((x) => x.trim());
  let known = folderRepos.get(cwd);
  if (!known) {
    const r = await d.git(cwd, ["remote", "get-url", "origin"]);
    const repo = r.code === 0 ? (/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\s*$/.exec(r.out)?.[1] ?? "") : "";
    known = { repo, top: top || cwd };
    if (repo) folderRepos.set(cwd, known);   // a folder with no origin yet is asked again next time
  }
  return branch && branch !== "HEAD" && known.repo ? { ...known, branch } : null;
}

let lastScan = 0, scanning = false;
/** every two minutes (team/wire.ts, beside the hand-in's tick), at any hour: each of my draft PRs that is ready to hand
 *  in gets one card, in the Work session that worked on it (the latest touched in the last three days among those in a
 *  folder on its branch and those that opened it, cardSessionOf, #579); a card whose change moved on (a newer commit, checks no longer green, handed in or closed on GitHub) is
 *  marked so. Only on the engine my window is on. The ids of the cards put */
export async function scan(d: CardDeps, force = false): Promise<string[]> {
  const t = d.now().getTime();
  if (scanning || (!force && t - lastScan < EVERY)) return [];
  scanning = true; lastScan = t;
  const put: string[] = [];
  try {
    const me = d.me();
    if (!me || !LOGIN.test(me) || (d.present && !d.present())) return put;
    const ps = await projects(d);
    if (!ps.length) return put;
    const recent = (await d.sessions()).filter((s) => !s.archived && !s.gone && s.cwd && t - s.updatedAt < SINCE);
    const where: { id: string; updatedAt: number; repo: string; top: string; branch: string }[] = [];
    const seen = new Map<string, Awaited<ReturnType<typeof folderOf>>>();
    for (const s of recent) {
      if (!seen.has(s.cwd)) seen.set(s.cwd, await folderOf(d, s.cwd).catch(() => null));
      const f = seen.get(s.cwd);
      if (f) where.push({ id: s.id, updatedAt: s.updatedAt, ...f });
    }
    // the PRs each recent session opened (#579), read only once a ready change looks for its session
    type At = { id: string; updatedAt: number; top: string };
    let openers: (At & { opened: string[] })[] | null = null;
    const openersNow = async () => openers ??= await Promise.all(recent.map(async (s) => ({
      id: s.id, updatedAt: s.updatedAt, top: seen.get(s.cwd)?.top ?? s.cwd,
      opened: d.opened ? await d.opened(s.id, s.cwd).catch(() => [] as string[]) : [],
    })));
    const st = store();
    for (const p of ps) {
      const lower = p.repo.toLowerCase();
      const mineHere = where.filter((w) => w.repo.toLowerCase() === lower);
      const openCards = Object.entries(st.cards).flatMap(([sid, cs]) => cs.filter((c) => c.repo.toLowerCase() === lower && !c.state).map((c) => ({ sid, c })));
      if (!mineHere.length && !openCards.length && !(d.opened && recent.length)) continue;
      try {
        const base = await defaultBranchOf(d, p.repo);
        const prs = JSON.parse(await d.gh(["pr", "list", "--repo", p.repo, "--state", "open", "--author", me, "--limit", "100", "--json", CARD_FIELDS]) || "[]") as (RawMine & { files?: { path?: string }[]; isCrossRepository?: boolean })[];
        const ofMe = prs.filter((x) => (x.author?.login ?? "").toLowerCase() === me.toLowerCase());
        // a card still asking whose change moved on says so, and its buttons go. Read again from the store: a press may
        // have answered it while GitHub was asked
        for (const { sid, c: was } of openCards) {
          const c = handInCardsOf(sid).find((x) => x.id === was.id);
          if (!c || c.state) continue;
          const now = ofMe.find((x) => x.number === c.number);
          const why = !now ? "it is no longer open on GitHub"
            : !now.isDraft ? "it was handed in on GitHub"
            : now.headRefOid !== c.sha ? "a newer commit came in: a new card asks once its checks are green"
            : !readyToHandIn(now) ? "its checks are not green any more: a new card asks once they are"
            : "";
          if (why) putHandIn(sid, { ...c, state: "gone", why }, d.bus);
        }
        // the review night the card asks about: after the review hour that is tomorrow's, so "asked" and Not tonight
        // are kept under the night, never the calendar day (past midnight it is still the night declined)
        const day = reviewNightOf(p.rhythm, d.now());
        const late = day !== clockIn(d.now(), p.rhythm.zone).day;
        for (const pr of ofMe) {
          const sha = String(pr.headRefOid ?? "");
          if (!pr.isDraft || pr.isCrossRepository || pr.baseRefName !== base || !sha || !readyToHandIn(pr)) continue;
          if (heldToday(p.repo, pr.number, sha, day)) continue;
          // asked already for this night and commit: a card still asking, or brought in (a send back the same night waits
          // for the next night or a new commit, as Not tonight does). A card left unanswered asks again for the next
          // night, in the session working on it then, and the old one stops asking
          const asked = Object.values(st.cards).some((cs) => cs.some((c) => c.repo.toLowerCase() === lower && c.number === pr.number && c.sha === sha && c.day === day && (!c.state || c.state === "busy" || c.state === "in")));
          if (asked) continue;
          const on = cardSessionOf<At>({ repo: p.repo, number: pr.number, branch: String(pr.headRefName ?? ""), onBranch: mineHere, openers: await openersNow() });
          if (!on) continue;   // no session here worked on it or opened it: the 8pm list still says it
          const files = (pr.files ?? []).map((f) => String(f?.path ?? "")).filter(Boolean);
          const card = cardOfHandIn({ repo: p.repo, base, pr, feature: featureFor(readMap(on.top), files), day, zone: p.rhythm.zone, late, after: await d.lastItem(on.id).catch(() => "") });
          for (const [sid, cs] of Object.entries(st.cards)) for (const c of cs) {
            if (c.repo.toLowerCase() === lower && c.number === pr.number && !c.state) putHandIn(sid, { ...c, state: "gone", why: sid === on.id ? "asked again below" : "asked again in another session" }, d.bus);
          }
          putHandIn(on.id, card, d.bus);
          d.unread?.(on.id);
          d.say?.(`hand-in: the card for #${pr.number} of ${p.repo} is in session ${on.id}`);
          put.push(card.id);
        }
      } catch (e) {
        d.say?.(`hand-in: the cards of ${p.repo} were not read: ${String((e as Error)?.message ?? e).split("\n")[0]}`);
      }
    }
  } finally { scanning = false; }
  return put;
}

/** a press on a card (team.handin.press): checked (Sol's own window, the card's key, the change's author, still asking),
 *  then done. Bring it in marks the PR ready on GitHub, what "handed in" means (tonight.ts handedIn), after checking that
 *  it is still open, a draft, ready to hand in (readyToHandIn, asked again), based on the default branch and on the
 *  commit the card asked about. Not tonight writes nothing on GitHub: it stays a draft, and this card's commit is not
 *  asked about again for the night the card named. Errors stay on the card */
export async function bring(d: HandInDeps, a: { sessionId: string; id: string; choice: "in" | "not"; key?: string; window?: boolean }): Promise<{ ok?: true; already?: true; error?: string }> {
  if (a.window !== true) return { error: "only Sol's own window presses this" };
  const card = handInCardsOf(a.sessionId).find((c) => c.id === a.id);
  if (!card) return { error: "that card is not in this session" };
  if (!a.key || a.key !== cardKeys.get(a.sessionId)) return { error: "this card was opened again since; press once more" };
  const me = d.me();
  if (!me || me.toLowerCase() !== card.author.toLowerCase()) return { error: `only ${card.author} hands this change in` };
  if (card.state === "busy") return { error: "it is being done" };
  if (card.state) return { already: true };
  const put = (c: HandInCard) => putHandIn(a.sessionId, c, d.bus);
  if (a.choice === "not") {
    // kept under the night the card asked about (its day), so past midnight it is still that night that was declined.
    // Presses older than a week are let go: they can never match again
    const held = store().held, weekAgo = new Date(Date.parse(`${card.day}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
    for (const [k, h] of Object.entries(held)) if (!h || typeof h.day !== "string" || h.day < weekAgo) delete held[k];
    held[heldKey(card.repo, card.number)] = { sha: card.sha, day: card.day };
    put({ ...card, state: "held", why: "it stays a draft; its card asks again on a new commit, or for the next night", error: undefined });
    return { ok: true };
  }
  if (a.choice !== "in") return { error: "no such button" };
  put({ ...card, state: "busy", error: undefined });
  try {
    const now = JSON.parse(await d.gh(["pr", "view", String(card.number), "--repo", card.repo, "--json", "state,isDraft,author,baseRefName,headRefOid,statusCheckRollup"]) || "{}") as
      { state?: string; isDraft?: boolean; author?: { login?: string }; baseRefName?: string; headRefOid?: string; statusCheckRollup?: RawMine["statusCheckRollup"] };
    if (now.state !== "OPEN") { put({ ...card, state: "gone", why: `it is ${String(now.state ?? "not open").toLowerCase()} on GitHub` }); return { error: `#${card.number} is not open` }; }
    if ((now.author?.login ?? "").toLowerCase() !== me.toLowerCase()) throw new Error(`#${card.number} is ${now.author?.login ?? "someone else"}'s`);
    if (now.isDraft === false) { put({ ...card, state: "in", why: "it was marked ready on GitHub already" }); return { already: true }; }
    if (now.headRefOid !== card.sha) { put({ ...card, state: "gone", why: "a newer commit came in: a new card asks once its checks are green" }); return { error: "a newer commit came in since this card" }; }
    if (!readyToHandIn(now)) { put({ ...card, state: "gone", why: "its checks are not green any more: a new card asks once they are" }); return { error: `#${card.number}'s checks are not green any more` }; }
    const base = await defaultBranchOf(d, card.repo);
    if (now.baseRefName !== base) throw new Error(`#${card.number} is based on ${now.baseRefName ?? "another branch"}, not ${base}: its base changes first`);
    await d.gh(["pr", "ready", String(card.number), "--repo", card.repo]);
    put({ ...card, state: "in", why: `handed in: ready for the dev review, based on ${base}` });
    return { ok: true };
  } catch (e) {
    const error = String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200);
    put({ ...card, error });
    return { error };
  }
}

// ---- the wrap-up box's merge (#579): ready if it is a draft, then merged; the person's press, never the agent's ----

const keyOfPr = (k: string) => ({ repo: k.slice(0, k.lastIndexOf("#")), number: Number(k.slice(k.lastIndexOf("#") + 1)) });
/** which PR a box's merge means (pure): the one the box names (a page or a number), else the session's latest card's,
 *  else the one open PR its folder's branch has, else the one PR it opened; null when none, or more than one, is meant */
export function mergeTargetOf(a: { pr?: unknown; repo?: string; cards: Pick<HandInCard, "repo" | "number" | "state">[]; branchPr?: { repo: string; number: number } | null; opened: string[] }): { repo: string; number: number } | null {
  const said = String(a.pr ?? "").trim();
  const url = /github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/pull\/(\d+)/.exec(said);
  if (url) return { repo: url[1], number: Number(url[2]) };
  const n = /^#?(\d+)$/.exec(said);
  if (n) {
    const num = Number(n[1]);
    const repo = [...a.cards].reverse().find((c) => c.number === num)?.repo
      ?? (a.branchPr?.number === num ? a.branchPr.repo : undefined)
      ?? a.opened.map(keyOfPr).find((k) => k.number === num)?.repo
      ?? a.repo;
    return repo ? { repo, number: num } : null;
  }
  if (said) return null;
  const card = [...a.cards].reverse().find((c) => c.state !== "gone");
  if (card) return { repo: card.repo, number: card.number };
  if (a.branchPr) return a.branchPr;
  return a.opened.length === 1 ? keyOfPr(a.opened[0]) : null;
}

const merging = new Set<string>();
/** a press on the wrap-up box's merge: checked as a card's press is (Sol's own window, the session's key, the change's
 *  author), then the PR asked again: open, mine, its checks green on its latest commit. A draft is marked ready first
 *  (handed in), then it is merged on that same commit. GitHub's own rules (a required read, a protected base) still
 *  hold: their refusal is the answer. A card of that PR in the session says it was brought in */
export async function mergePress(d: CardDeps, a: { sessionId: string; key?: string; window?: boolean; pr?: unknown }): Promise<{ ok?: true; number?: number; url?: string; error?: string }> {
  if (a.window !== true) return { error: "only Sol's own window presses this" };
  if (!a.key || a.key !== cardKeys.get(a.sessionId)) return { error: "this box was opened again since; press once more" };
  const me = d.me();
  if (!me || !LOGIN.test(me)) return { error: "this Sol is signed out of GitHub" };
  const s = (await d.sessions()).find((x) => x.id === a.sessionId);
  const f = s?.cwd ? await folderOf(d, s.cwd).catch(() => null) : null;
  let branchPr: { repo: string; number: number } | null = null;
  if (f && !/^(main|master|stable|live|dev|beta)$/.test(f.branch)) {
    const list = JSON.parse(await d.gh(["pr", "list", "--repo", f.repo, "--state", "open", "--head", f.branch, "--json", "number"]).catch(() => "[]") || "[]") as { number: number }[];
    if (list.length === 1) branchPr = { repo: f.repo, number: list[0].number };
  }
  const opened = s && d.opened ? await d.opened(s.id, s.cwd).catch(() => [] as string[]) : [];
  const t = mergeTargetOf({ pr: a.pr, repo: f?.repo, cards: handInCardsOf(a.sessionId), branchPr, opened });
  if (!t) return { error: "which PR? Say its number in the session, and the next box names it" };
  const tag = `${t.repo.toLowerCase()}#${t.number}`;
  if (merging.has(tag)) return { error: "it is being merged" };
  merging.add(tag);
  try {
    const now = JSON.parse(await d.gh(["pr", "view", String(t.number), "--repo", t.repo, "--json", "state,isDraft,author,headRefOid,statusCheckRollup,url"]) || "{}") as
      { state?: string; isDraft?: boolean; author?: { login?: string }; headRefOid?: string; statusCheckRollup?: RawMine["statusCheckRollup"]; url?: string };
    const url = now.url || `https://github.com/${t.repo}/pull/${t.number}`;
    if (now.state === "MERGED") return { ok: true, number: t.number, url };
    if (now.state !== "OPEN") return { error: `#${t.number} is ${String(now.state ?? "not open").toLowerCase()} on GitHub` };
    if ((now.author?.login ?? "").toLowerCase() !== me.toLowerCase()) return { error: `#${t.number} is ${now.author?.login ?? "someone else"}'s: its author merges it` };
    const checks = checksOf(now.statusCheckRollup);
    if (checks !== "passing") return { error: `#${t.number}'s checks are ${checks === "failing" ? "red" : checks === "pending" ? "still running" : "not run yet"}: it merges once they are green` };
    if (now.isDraft) await d.gh(["pr", "ready", String(t.number), "--repo", t.repo]);
    await d.gh(["pr", "merge", String(t.number), "--repo", t.repo, "--merge", ...(now.headRefOid ? ["--match-head-commit", now.headRefOid] : [])]);
    for (const c of handInCardsOf(a.sessionId)) {
      if (c.repo.toLowerCase() === t.repo.toLowerCase() && c.number === t.number && !c.state) putHandIn(a.sessionId, { ...c, state: "in", why: "merged from the wrap-up box" }, d.bus);
    }
    d.say?.(`hand-in: #${t.number} of ${t.repo} merged by ${me}'s press`);
    return { ok: true, number: t.number, url };
  } catch (e) {
    return { error: String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200) };
  } finally { merging.delete(tag); }
}
