// What each Sol runs (#1150): every team Sol on the same release, and everyone can see it. "Every Sol on the relay was
// told" never said any of them installed it; this does.
//   the word   each Sol says on the relay `runs { person, machine, tag, sha, branch, why? }`: the release it sits on
//              (tag, by the same releaseTag pick /health and Settings make, version.ts), its HEAD, its person (team.json's
//              GitHub login: on a cloud the hub's name is a Sol name), whether it follows dev or is a `*/mine` Sol, and
//              its channel (dev or beta, the switch in Settings › me, ship.ts channelOf; said again when it changes).
//              Said once the relay is up (and on every reconnect) and after every install (ship.ts installDev). A dev
//              release that did not install itself says why, one word: busy (a turn was in flight each time it looked,
//              #1566), paused (pause updates is on, #1566), clash (a carry has it, carry.ts), changes (changes not
//              kept), pinned (#426), build (its new code did not build: built aside, npm ci or tsc failed, or npm ci
//              failed and it moved back, ship.ts, or the build watcher holds errors, health.ts). The tag is the
//              release this engine runs (versionNow, what /health says); a Sol that says build is never ✓, whatever its
//              tag. A Sol never says `off`: the counter does, for a person none of whose Sols spoke within STALE_MS.
//   the count  every Sol keeps each Sol's latest word (person and machine), on disk so a renew forgets nothing, and
//              whoHas turns the team's people (docs/people/*.md), the release and those words into one line a person:
//              Marco ✓ dev · Frank ✓ dev · Isaac waiting (busy) beta. A person is ✓ when each of their Sols runs that release or a
//              newer one. The face shows it under the release word for an hour (StableLine); the runner on the NucBox
//              reads the same words an hour after a release (GET /runs) and pings each person still behind (release.ts).
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { onRelay, onRelayStatus, relayUp, sendRelay } from "./relay.js";
import { getTeam } from "./settings.js";
import { computeVersion, releaseTag, versionNow, onVersion } from "../version.js";
import { healthNow, onHealth } from "../health.js";
import { pinNow } from "./pin.js";
import { STATE_DIR } from "../work/state.js";
import { iterationKnown } from "./iteration.js";   // the iteration the count names (#1153)
import { driftFor } from "./drift.js";             // each person's drift beside their ✓ (#1153)

const run = promisify(execFile);

export type Why = "busy" | "paused" | "clash" | "changes" | "pinned" | "build";
export const WHYS: Why[] = ["busy", "paused", "clash", "changes", "pinned", "build"];
/** one Sol's word: `login` is the name the hub knows it by (a ping goes there), `person` its GitHub login */
export type Channel = "dev" | "beta";
export type RunsWord = { login: string; person: string; machine: string; tag: string; sha: string; branch: "dev" | "mine"; channel?: Channel; why?: Why; at: number };
export type Person = { login: string; name: string; prefix?: string };   // prefix: the page's name, docs/people/<prefix>.md (#1153)
/** a person against a release: ✓, or waiting with the reason their Sol said (off: none of their Sols spoke), and the
 *  channel their Sols follow ("dev/beta" when theirs differ; none when no Sol said, a word from before the switch) */
export type Has = { login: string; name: string; has: boolean; why?: Why | "off"; to: string; channel?: string };

/** a word older than this is not heard: a Sol retired, or off for a week, reads as off */
export const STALE_MS = 7 * 24 * 3600_000;
/** how long after a release its count stands under the release word, and when the runner pings who is behind */
export const COUNT_MS = 60 * 60_000;

const LOGIN = /^[A-Za-z0-9-]{1,39}$/;
const DEV_TAG = /^dev-\d{8}(-\d{4})?$/;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** a relay `runs` made into a word, or null when it is not one (pure) */
export function runsOf(m: Record<string, any>): RunsWord | null {
  const login = typeof m?.from?.login === "string" ? m.from.login : "";
  const person = typeof m?.person === "string" && LOGIN.test(m.person) ? m.person : login;
  if (!LOGIN.test(login) || !LOGIN.test(person)) return null;
  const tag = typeof m.tag === "string" && /^[\w.-]{0,60}$/.test(m.tag) ? m.tag : "";
  const sha = typeof m.sha === "string" && /^[0-9a-f]{40}$/.test(m.sha) ? m.sha : "";
  if (!sha) return null;
  const machine = typeof m.machine === "string" ? m.machine.replace(/[^\w.-]/g, "").slice(0, 60) : "";
  const at = typeof m.at === "number" && Number.isFinite(m.at) ? m.at : Date.now();
  return { login, person, machine, tag, sha, branch: m.branch === "mine" ? "mine" : "dev", ...(m.channel === "dev" || m.channel === "beta" ? { channel: m.channel as Channel } : {}), ...(WHYS.includes(m.why) ? { why: m.why as Why } : {}), at };
}

/** does a Sol on `mine` have `tag`: the same release, or a newer dev release by its name (pure) */
const runsIt = (mine: string, tag: string) => !!mine && (mine === tag || (DEV_TAG.test(mine) && DEV_TAG.test(tag) && releaseTag([mine, tag]) === mine));

/** who has the release (pure; the face's line and the runner's pings): each person, in the order given, ✓ when every
 *  one of their Sols (its latest word, by machine) heard within STALE_MS runs it; else waiting, with the first behind
 *  Sol's reason, or off */
export function whoHas(people: Person[], tag: string, words: RunsWord[], now = Date.now()): Has[] {
  const latest = new Map<string, RunsWord>();
  for (const w of words) { const k = `${w.person.toLowerCase()}/${w.machine}`, was = latest.get(k); if (!was || w.at >= was.at) latest.set(k, w); }
  return people.map((p) => {
    const own = [...latest.values()].filter((w) => same(w.person, p.login) && now - w.at < STALE_MS);
    if (!own.length) return { login: p.login, name: p.name, has: false, why: "off" as const, to: p.login };
    const chs = [...new Set(own.map((w) => w.channel).filter((c): c is Channel => !!c))].sort();
    const channel = chs.length ? { channel: chs.join("/") } : {};
    const behind = own.find((w) => w.why === "build" || !runsIt(w.tag, tag));   // moved but not built: not running it
    if (!behind) return { login: p.login, name: p.name, has: true, to: own[0].login, ...channel };
    return { login: p.login, name: p.name, has: false, ...(behind.why ? { why: behind.why } : {}), to: behind.login, ...channel };
  });
}

/** the release to count (pure): the newest dev release any Sol says it runs, or the one offered here */
export const countedTag = (words: RunsWord[], offered = "") => releaseTag([...words.map((w) => w.tag), offered].filter((t) => DEV_TAG.test(t)));

/** the team's people (docs/people/*.md, each with a `login:` line and a `# Name` heading), by name. None in a tester's
 *  checkout: the export leaves docs out, so a tester's Sol counts nobody */
export function peopleOf(top: string): Person[] {
  const dir = join(top, "docs", "people");
  let files: string[] = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith(".md")); } catch { return []; }
  const out: Person[] = [];
  for (const f of files) {
    let text = "";
    try { text = readFileSync(join(dir, f), "utf8"); } catch { continue; }
    const login = /^login:\s*(\S+)/m.exec(text)?.[1] ?? "";
    if (!LOGIN.test(login)) continue;
    out.push({ login, name: /^#\s+(.+?)\s*$/m.exec(text)?.[1] ?? login, prefix: f.replace(/\.md$/, "") });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ---- the engine's one ----
let ROOT = "";
let words: Record<string, RunsWord> = {};
let last: Why | undefined;   // the reason said last, said again on a reconnect until an install clears it
let tell: (m: object) => void = () => {};
let offered: () => string = () => "";
let channelNow: () => Promise<Channel | null> = async () => null;
let listening = false;
/** the build watcher holds errors (health.ts): the dist running is not the checkout's code */
const buildHeld = () => (healthNow()?.build?.errors ?? 0) > 0;
const FILE = () => process.env.SOL_RUNS_FILE ?? join(STATE_DIR, "runs.json");
const MACHINE = hostname().split(".")[0];

/** every Sol's latest word, mine among them (GET /runs, the runner's read) */
export const runsNow = (): RunsWord[] => Object.values(words);
/** what the faces are told: the release counted, each person, and until when it stands under the release word */
export function countMsg(now = Date.now()) {
  const list = runsNow(), tag = countedTag(list, offered());
  if (!tag) return { type: "team.runs", tag: null };
  const first = Math.min(...list.filter((w) => w.tag === tag).map((w) => w.at), now);
  // #1153: the iteration it names, and each person's drift against the counted release as the runner last said it
  const who = whoHas(peopleOf(resolve(ROOT, "..")), tag, list, now).map((p) => ({ ...p, ...(driftFor(p.login, tag) ?? {}) }));
  const it = iterationKnown()?.name;
  return { type: "team.runs", tag, ...(it ? { iteration: it } : {}), who, until: first + COUNT_MS };
}

function keep(w: RunsWord) {
  words = { ...words, [`${w.person.toLowerCase()}/${w.machine}`]: w };
  try { mkdirSync(dirname(FILE()), { recursive: true }); writeFileSync(FILE(), JSON.stringify(words) + "\n"); } catch { /* kept in memory */ }
  tell(countMsg());
}

/** say on the relay what this Sol runs. `why`: the reason a dev release did not install itself here, or none after
 *  an install (ship.ts); a reconnect says the last one again */
export async function sayRuns(why?: Why) {
  last = why;
  await say();
}
async function say() {
  if (!ROOT) return;
  // what this engine runs (/health's versionNow, read again after every update), the checkout's own read before that
  const v = versionNow() ?? await computeVersion(ROOT).catch(() => null);
  const sha = await run("git", ["rev-parse", "HEAD"], { cwd: ROOT, timeout: 5000 }).then((r) => r.stdout.trim()).catch(() => "");
  const branch = await run("git", ["branch", "--show-current"], { cwd: ROOT, timeout: 5000 }).then((r) => r.stdout.trim()).catch(() => "");
  if (!sha) return;
  const tag = v && /^(stable|dev|beta|release)-/.test(v.release) ? v.release : "";
  const why = pinNow() ? "pinned" : buildHeld() ? "build" : last;
  const person = getTeam().me.login;
  const channel = await channelNow().catch(() => null);
  const p = { person, machine: MACHINE, tag, sha, branch: /\/mine$/.test(branch) ? "mine" : "dev", ...(channel ? { channel } : {}), ...(why ? { why } : {}) };
  sendRelay("runs", p);   // false while the relay is down: the reconnect says it
  const mine = runsOf({ ...p, from: { login: person || "me" }, at: Date.now() });
  if (mine) keep(mine);
}

/** index.ts: start once with the repo's sol/ folder, every face, the release offered here, and this Sol's channel */
export function startRuns(root: string, everyone: (m: object) => void, offer: () => string = () => "", channel: () => Promise<Channel | null> = async () => null) {
  ROOT = root;
  tell = everyone;
  offered = offer;
  channelNow = channel;
  try { words = JSON.parse(readFileSync(FILE(), "utf8")) ?? {}; } catch { words = {}; }
  if (listening) return;
  listening = true;
  onRelay("runs", (m) => { const w = runsOf(m); if (w) keep(w); });
  // up already (the relay came up before this part started): said now, not at the next reconnect
  let wasUp = relayUp();
  if (wasUp) void say();
  onRelayStatus(() => { const up = relayUp(); if (up && !wasUp) void say(); wasUp = up; });
  // said again when what it runs is read anew, and when the build watcher starts or stops holding errors
  onVersion(() => { if (relayUp()) void say(); });
  let held = buildHeld();
  onHealth(() => { const h = buildHeld(); if (h !== held && relayUp()) void say(); held = h; });
}
