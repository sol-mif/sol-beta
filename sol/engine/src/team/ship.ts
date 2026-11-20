// Ship (#33, then #418): every Sol hears a new release and takes it, and the beta repo's export.
//
// Two channels (#418, team flow v2). A release is a tag on main made by the release runner on the NucBox (release.ts):
//   dev    `dev-YYYYMMDD` each morning at the rhythm's release hour (and `dev-YYYYMMDD-HHMM` for an urgent fix), the
//          branch `dev` moved to it. A dev Sol follows `dev` and installs it by itself (#1566): at the word, or the
//          ten-minute ask, the release is fetched and built aside (`prepare`: its engine and the face's package files
//          in <git-common-dir>/sol-next, `npm ci` only where its lock differs, tsc only where its engine does), and
//          between two turns (no turn in flight for QUIET_MS; background agents do not count, busy.ts) the checkout
//          moves and takes what was built, so the quiet moment carries the swap, seconds. At most one install every
//          EVERY_MS (30 min), the newest; past CAP_MS of waiting, one breath between turns is enough; `pause updates`
//          (Settings › me, settings.ts updatesPaused) holds the swap, never the build. A `*/mine` Sol too since #1150,
//          its own commits on top, and a clash leaves it where it was while #425's carry takes it over with no press.
//          Each says what it runs after (runs.ts).
//   beta   `stable`, moved by the beta pass (#419) to a whole dev release. A beta Sol follows `stable` and is offered it
//          with Update and Later, as before.
// A Sol's channel is its setting (`channel` in team.json); left empty, a developer (any checkout whose origin is not
// the beta repo) is dev and a tester (origin sol-beta) is beta (channelOf).
// every Sol learns: the relay's `stable { sha, tag, by, channel }` (channel absent: beta), whose sha is not this
// checkout's branch for that channel, or is not in HEAD's history, becomes `team.stable` to every face, while `behind`
// (HEAD does not hold it). A word for the other channel is not this Sol's. The live Sol (branch `live`) is never offered
// one: the release runner promotes it. The engine also asks GitHub itself (ls-remote): 20 s after start, for a release
// made while it was off, and every ten minutes after (#353, #1566), for one whose word on the relay it missed. GitHub's answer names no
// releaser: for the sha already standing, the name and tag heard before stay said. An ask that finds the offer already
// standing tells the faces nothing new; one that finds HEAD holding the offered sha (a pull by hand) stands it answered.
// A Sol from before #418 reads a `{ channel: "dev" }` word as a stable: it may offer it, and its Update then
// fast-forwards to GitHub's `stable`, never to dev, so the word is harmless there.
// update: fast-forward only, on main, the channel's branch or stable, on a clean tree; the build watcher and renew do the
// rest. On a */mine branch (MY SOL, since sol/mine/live, #116) it runs sol/mine/rebase instead: his own commits go onto
// the channel's new release (SOL_CHANNEL), and a conflict leaves the checkout as it was, its places named (#425 reshapes this path).
// the switch (#1150): Settings › me writes `channel` in team.json and the engine reads it live (onTeam). dev → beta never
// moves a Sol backwards: a beta release HEAD already holds is neither offered nor installed, so it stays on its release
// and joins beta when beta reaches it. beta → dev asks GitHub at once, so dev installs at the next quiet minute.
// the beta repo (#79): a checkout with a remote named `beta` (the testers' repo, sol-mif/sol-beta) gets an export of a
// release as that repo's main (mirror, called by the beta pass, #419): a fresh commit holding only what runs
// (BETA_KEEP) and a README for testers, chained on the previous export so a tester's `git pull` moves, with no parent in
// this repo's history. Nothing else crosses: no docs, no memos, no design, no team pages, no commit history. Anything on
// beta's main that is not an export (the full mirror of the first day) is replaced. No `beta` remote: nothing happens.
// An update joins the busy counter (busy.ts): a renew never lands mid-fetch.
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { join as joinBusy, betweenTurns, onBusy } from "../busy.js";
import { onRelay } from "./relay.js";
import { getTeam, onTeam } from "./settings.js";
import { noteChannel, versionMode, updatesPaused } from "../settings.js";
import type { Mode } from "../versions.js";
import { refreshVersion, releaseTag, versionNow } from "../version.js";
import { carryOver, carryNow, stayedOn, clearStay, type Carry } from "./carry.js";   // own changes that clash with a release (#425)
import { pinNow } from "./pin.js";   // a pinned Sol takes no new release (#426)
import { sayRuns, type Why } from "./runs.js";   // what this Sol runs, said on the relay (#1150)
import { leakIn, guardProbe, isTeamFile, teamNames, notYetPublic, NOT_YET_PUBLIC, readText, commitLeak, EXPORT_IDENT, NEUTRAL_HOME, type ExportFile } from "./leak.js";   // nothing team-only reaches testers (#479)
import { isQuiet, quietPush } from "../quiet.js";

const run = promisify(execFile);
const ENV = () => ({ ...process.env, GIT_TERMINAL_PROMPT: "0" });   // never a password prompt nobody can answer

export type Channel = "dev" | "beta";
/** the branch a channel follows on origin, and its tags' prefix */
export const BRANCH: Record<Channel, string> = { dev: "dev", beta: "stable" };
export type Ship = {
  root: string;                                   // sol/: git runs here, the pathspecs are relative to it
  channel: () => Promise<Channel>;                // this Sol's channel (channelOf)
  origin?: () => Promise<string>;                 // the checkout's origin, for the version's channel (versionChannelOf)
  auto?: boolean;                                 // a dev release installs itself between turns (default yes)
  quietMs?: number;                               // how long no turn may be in flight before it does (default QUIET_MS)
  everyMs?: number;                               // #1566: the least time between two installs by itself (default EVERY_MS)
  capMs?: number;                                 // #1566: past this much waiting, a breath between turns is enough (CAP_MS)
  pollMs?: number;                                // #1566: how often a waiting install looks again (default a second)
  paused?: () => boolean;                         // #1566: pause updates (default the setting, settings.ts updatesPaused)
  build?: (dir: string) => Promise<void>;         // #1566: tsc in a release's engine built aside (default its own tsc)
  updated?: () => void;                           // after an update: what this Sol runs is said again (#417)
  // #425: a */mine Sol whose own changes clash with the release: a side copy and a session carry them over (carry.ts).
  // Absent (a bare Ship, the older tests): the clash is said as sol/mine/rebase says it, and nothing more happens.
  // follow: the branch that follows the release here once it is used (dev or stable); auto (#1150): the release came
  // by itself, so once carried over the Sol moves to it with no press
  carry?: (release: string, tag: string, follow: string, auto?: boolean) => Promise<Carry>;
  runs?: (why?: Why) => void;                     // #1150: what this Sol runs is said on the relay, with why it did not install
  ci?: (dir: string) => Promise<void>;            // #1150: `npm ci` in a folder whose lock file the release changed (default npm)
};
export type Offer = { type: "team.stable"; sha: string; tag: string; by: string; mine: string; behind: boolean; channel: Channel; count?: number; back?: true };
// back (#638, #639, dev only): dev went back (sol/release --back) to a release older than the one this Sol runs; it stands
// as behind, so a dev Sol installs it at a quiet moment as it would a new one
// count (#425, a */mine Sol only): how many of the release's changes this Sol does not have, "N behind"

const firstLine = (e: unknown) => {
  const x = e as { stderr?: unknown; message?: unknown };
  const s = String(x?.stderr || x?.message || e).trim().split("\n").map((l) => l.replace(/^(fatal|error|hint): /, "").trim()).filter(Boolean);
  return s[0] ?? "it failed";
};
const git = (cwd: string, args: string[], timeout = 60_000) =>
  run("git", args, { cwd, env: ENV(), timeout, maxBuffer: 16 << 20 }).then((r) => r.stdout.trim());
const tryGit = (d: Pick<Ship, "root">, args: string[], timeout?: number) => git(d.root, args, timeout).catch(() => null);
const ENGINE_SRC = ["engine/src", "engine/package.json", "engine/package-lock.json", "engine/tsconfig.json"];
/** the lock files an update installs again when a release changes them (#1150), by their folder under sol/ */
export const LOCKS = ["engine/package-lock.json", "mac/package-lock.json"];
// A move kept for going back (#1576): every update that moves the checkout leaves engine/.swap, plain lines the keeper
// (engine/keep, bash) reads, tab between words (a path may hold a space): `from <sha>` `to <sha>` `at <iso>`, `nm <live node_modules> <the one it replaced>` for a
// folder whose packages were moved in, `ci <folder>` for one installed in place. The keeper deletes it, and the kept
// node_modules, once the engine has stayed up its minute; at the third start that dies it moves the checkout back to
// `from`, puts each folder's packages back, and writes engine/.skip, the release that did not start here. A release
// in .skip is not installed by itself again (installDev); Update still can, and a newer release clears it.
export const SWAP = ".swap", SKIP = ".skip";
/** the swap record's text (pure) */
export function swapText(o: { from: string; to: string; at: string; nm: [string, string][]; ci: string[] }): string {
  return [["from", o.from], ["to", o.to], ["at", o.at], ...o.nm.map(([live, was]) => ["nm", live, was]), ...o.ci.map((f) => ["ci", f])].map((l) => l.join("\t")).join("\n") + "\n";
}
/** the release this Sol went back from (engine/.skip), "" for none */
export const skippedIn = (root: string): string => { try { return readFileSync(join(root, "engine", SKIP), "utf8").trim(); } catch { return ""; } };
/** the folders that need `npm ci` after a move (pure): those whose lock file is among the changed paths
 *  (`git diff --relative --name-only <was> HEAD -- ...LOCKS`, run in sol/: paths from there), in LOCKS' order, each once */
export function lockedFolders(changed: string[]): string[] {
  const got = new Set(changed.map((l) => l.trim()).filter(Boolean));
  return LOCKS.filter((l) => got.has(l)).map((l) => l.slice(0, -"/package-lock.json".length));
}
/** the folders under sol/ whose node_modules is older than their lock (#1187): an install a move missed. A Sol that took
 *  #1146 on an engine from before #1150 never got `three`, and no later move changed mac's lock, so Home's world broke
 *  the whole face for good. npm writes node_modules/.package-lock.json at every install (the test team/try.ts uses);
 *  a folder with no node_modules at all is not this Sol's to install */
export function staleFolders(sol: string): string[] {
  return LOCKS.filter((l) => {
    const lock = join(sol, l), mods = join(sol, l.slice(0, -"package-lock.json".length), "node_modules");
    if (!existsSync(lock) || !existsSync(mods)) return false;
    try { return statSync(join(mods, ".package-lock.json")).mtimeMs < statSync(lock).mtimeMs; } catch { return true; }
  }).map((l) => l.slice(0, -"/package-lock.json".length));
}
const npmCi = (dir: string) => run("npm", ["ci", "--no-audit", "--no-fund"], { cwd: dir, env: ENV(), timeout: 600_000, maxBuffer: 16 << 20 }).then(() => {});
// tsc says its errors on stdout: the first one is the reason
const tscIn = (dir: string) => run(join(dir, "node_modules", ".bin", "tsc"), ["-p", "."], { cwd: dir, env: ENV(), timeout: 600_000, maxBuffer: 16 << 20 }).then(() => {}, (e: any) => {
  const first = String(e?.stdout ?? "").split("\n").find((l) => /error TS\d+/.test(l));
  throw new Error(first ? first.trim() : firstLine(e));
});
const BETA_ORIGIN = /[/:]sol-beta(\.git)?\/?$/i;

/** a Sol's channel (pure): its setting, else dev for a developer and beta for a tester, whose origin is the beta repo */
export function channelOf(setting: unknown, origin: string): Channel {
  if (setting === "dev" || setting === "beta") return setting;
  return BETA_ORIGIN.test(origin.trim()) ? "beta" : "dev";
}
const DEV_ORIGIN = /[/:]sol-dev(\.git)?\/?$/i;
/** the channel the version follows (pure, versions.ts): as channelOf where someone picked, but by the checkout only when it
 *  clearly is sol-dev. A checkout whose source is not clear (a copy, a fork, a first-time user's stage engine) is beta and
 *  runs as product, never concept: a thing on its way is shown only where it is sure to be the team's. channelOf, which says where
 *  updates come from, is left as it was */
export function versionChannelOf(setting: unknown, origin: string): Channel {
  if (setting === "dev" || setting === "beta") return setting;
  return DEV_ORIGIN.test(origin.trim()) ? "dev" : "beta";
}
/** the channel a relay word is for (pure): `dev`, else beta (a word from before #418 carries none) */
export const channelIn = (m: { channel?: unknown }): Channel => (m.channel === "dev" ? "dev" : "beta");

// ---- the beta repo: an export, never the house ----

/** what a tester's Sol needs and nothing more: the engine, the face, setup and help, the three scripts the engine runs
 * on itself, the two design files the face builds from. Not sol/home: sol-dev's is the team's, and the export writes the
 * neutral home instead (leak.ts NEUTRAL_HOME, #479). And the user's door (#124): what makes
 * it theirs, sol/mine/setup, rebase and the commit-msg hook, with the harness that keeps a session off their window
 * (the guard and the settings that wire it). The dev's door stays here: the workshop's take and brief, the stage,
 * the night job's script (Try's and the night's code ride inside the engine, unused by a tester). Everything else stays. */
export const BETA_KEEP = [
  "sol/engine", "sol/mac", "sol/setup", "sol/setup.d", "sol/HELP.md", "sol/.gitignore",
  "sol/back", "sol/undo", "sol/mutate", "sol/design/tempo.json", "sol/design/system/tokens.json", "sol/design/system/tokens.mjs", ".gitignore",
  "sol/mine/setup", "sol/mine/rebase", "sol/mine/hooks", "sol/harness", ".claude/settings.json",
  // the install (#169): the one line's script, the page that serves it, and the two workflows that run only in the
  // public repo (by exact path: ci and apart stay home)
  "sol/install", "site", ".github/workflows/release.yml", ".github/workflows/pages.yml",
  // the sol skill (#133): setup links it for Claude and Codex, and it is how a Sol changes itself from the inside;
  // without it a tester's links point at nothing and setup's skill test fails (#300)
  "sol/skills/sol",
];
const kept = (path: string) => BETA_KEEP.some((k) => path === k || path.startsWith(k + "/"));
const EXPORT_MSG = /^Sol (stable|dev)-/;   // an export of a stamp (before #418) or of a dev release (the beta pass, #419)
/** the README a tester finds at the root of the beta repo: Sol's own front door, no owner, no team */
export const betaReadme = (tag: string) => `# Sol

One window for all your AI. Sol is a face on your own machine that talks to a local engine: your chats, your
work with coding agents, your browser, a desk for notes and cards, voice, and the tools you make, in one place
that is yours. The engine runs on your computer, your data stays in your folder, and Sol changes itself from the
inside when you ask it to.

The idea: today each AI lives in its own tab and knows nothing of the others. Sol is the one surface you sit
at, and the AIs are its hands. Over time it becomes the system you need, built by being talked to.

This is the version beta testers run: ${tag}. It is made from the development repository when a whole day's
release passes to beta, and holds only what runs. Nothing here is edited by hand; the next version replaces it.

## Install

**Mac**, one line in Terminal. It asks what to call you, puts Sol in \`~/Sol\`, and opens Sol.app:

\`\`\`
curl -fsSL https://sol.matterfold.tech/install | sh
\`\`\`

Or download \`Sol-mac.zip\` from the [latest release](https://github.com/sol-mif/sol-beta/releases/latest),
unzip it and open Sol. It is not signed with Apple yet: the first time, macOS says it cannot check it, and
System Settings → Privacy & Security has an **Open Anyway** button; click it once. Sol then asks the same
question and sets itself up.

**Linux**, and **Windows** inside Ubuntu under WSL (\`wsl --install\` once in PowerShell): the same line; there is
no app, the face opens in your browser at http://localhost:1420.

Both offer a sign-in to Claude (a Claude Pro or Max plan). ChatGPT (Plus or Pro, through Codex) works too: a
chat starts on Codex, which signs you in the first time you talk to it, and a coding session in Work runs on
Claude unless you pick GPT. Rooms you share with others (Cowork) meet on Sol's cloud, signed in with your Google
account; what only the people who build Sol use is not in a beta Sol.

## Make it yours

Sol changes itself when you ask it to. To keep those changes yours across new versions, give them a branch once:

\`\`\`
git switch -c <you>/mine && bash sol/mine/setup
\`\`\`

Every commit there gets \`mine: \` in front. The harness comes along (\`sol/harness/guard\`, wired by
\`.claude/settings.json\`): it refuses, before it runs, what a session in your Sol should never do.

## Keep it current

A new version: Sol says so in its own window within the hour, with an **Update** button; press it and Sol
fetches the new version and rebuilds its engine and face from it. The Mac app's own shell comes from the
[latest release](https://github.com/sol-mif/sol-beta/releases/latest) when it changed; the release notes say so. On your own branch, \`bash sol/mine/rebase\` instead:
it puts your changes on top of the new version, and if one does not fit it names the place and changes nothing. When something breaks, \`sol/HELP.md\`.
Something wrong, or a thought: say it in the beta testers' Discord, https://discord.gg/f2CHmYDDZV (in Sol, **Tell us…**
in the menu bar menu opens it), or open an issue on this repository.
`;

/** git with something on stdin (update-index --index-info, hash-object --stdin) */
function gitIn(cwd: string, args: string[], input: string, env: NodeJS.ProcessEnv = ENV()): Promise<string> {
  return new Promise((ok, no) => {
    const p = spawn("git", args, { cwd, env });
    let out = "", err = "";
    p.stdout.on("data", (b) => { out += b; });
    p.stderr.on("data", (b) => { err += b; });
    p.on("error", no);
    p.on("close", (code) => code === 0 ? ok(out.trim()) : no(new Error(err.trim() || `git ${args[0]} failed`)));
    p.stdin.end(input);
  });
}

/** the blobs named, read in one git call: sha → bytes */
function blobs(top: string, shas: string[]): Promise<Map<string, Buffer>> {
  return new Promise((ok, no) => {
    const p = spawn("git", ["cat-file", "--batch"], { cwd: top, env: ENV() });
    const parts: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (b) => parts.push(b));
    p.stderr.on("data", (b) => { err += b; });
    p.on("error", no);
    p.on("close", (code) => {
      if (code !== 0) return no(new Error(err.trim() || "git cat-file failed"));
      const out = Buffer.concat(parts), m = new Map<string, Buffer>();
      let at = 0;
      while (at < out.length) {
        const nl = out.indexOf(10, at);
        const [id, , size] = out.subarray(at, nl).toString().split(" ");
        const n = Number(size);
        if (!Number.isFinite(n)) { if (nl < 0) break; at = nl + 1; continue; }   // "<sha> missing": its line only, the rest still read
        m.set(id, out.subarray(nl + 1, nl + 1 + n));
        at = nl + 1 + n + 1;
      }
      ok(m);
    });
    p.stdin.end(shas.join("\n") + "\n");
  });
}
/** what must never leave the house (#169), in a file about to be exported: the first offence as "file:line: what" */
const PLACEHOLDER = /(^|\.)example\.ts\.net$/;
const HOST = /[\w-]+(?:\.[\w-]+)*\.ts\.net/g;
export function exportOffence(path: string, body: Buffer): string | null {
  const base = path.slice(path.lastIndexOf("/") + 1);
  if (base === ".env" || base.startsWith(".env.") && base !== ".env.example" || base === "team.json" || base === "team.cloud.json") return `${path}: a private file`;
  const read = readText(path, body);   // UTF-8 or UTF-16; an image, a font: no words in it; what cannot be read, leakIn refuses
  if (!("text" in read)) return null;
  const lines = read.text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], host = [...l.matchAll(HOST)].map((m) => m[0]).find((h) => !PLACEHOLDER.test(h));
    if (host) return `${path}:${i + 1}: a tailnet address, ${host}`;
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(l)) return `${path}:${i + 1}: a private key`;
    if (/@gmail\.com/i.test(l)) return `${path}:${i + 1}: a personal address`;
  }
  return null;
}

type Out = ExportFile & { mode: string; type: string; id?: string };   // type: blob, or commit for a submodule
/** what the export of `sha` holds, every file with its bytes, checked: BETA_KEEP, the install twice, the neutral home and
 * the README. A known team file inside a kept folder (a REVIEW.md, GLOSSARY.md, CLAUDE.md or AGENTS.md, a specs/ or
 * .claude/ folder, any case: leak.ts isTeamFile) is left out, named in `left`. Throws, nothing written, when a kept file
 * names a private machine, a key, or a person's address (exportOffence), or what is left still holds a team file, a team
 * rule, a team word or a word marketing keeps back (leak.ts leakIn and guardProbe, #479, #1323), the backstop for what is
 * not known yet */
async function exportFiles(root: string, sha: string, tag: string): Promise<{ top: string; out: Out[]; left: string[] }> {
  const top = await git(root, ["rev-parse", "--show-toplevel"]);
  const all = (await git(top, ["ls-tree", "-r", "-z", sha])).split("\0").filter(Boolean);
  const at = (e: string) => ({ mode: e.split(" ")[0], type: e.split(" ")[1], id: e.split(" ")[2].split("\t")[0], path: e.slice(e.indexOf("\t") + 1) });
  const entries = all.map(at).filter((e) => kept(e.path) && !e.path.startsWith("sol/home/"));
  if (!entries.length) throw new Error("nothing to export: the release holds none of what a tester runs");
  // a submodule (a gitlink) has no bytes here to check, so it is never exported (#479)
  const link = entries.find((e) => e.type !== "blob");
  if (link) throw new Error(`not exported: ${link.path}: a ${link.type === "commit" ? "submodule" : link.type}, which the leak check cannot read; the beta repo gets nothing until it is out`);
  const people = all.map(at).filter((e) => /^docs\/people\/[^/]+\.md$/.test(e.path));
  const list = all.map(at).filter((e) => e.path === NOT_YET_PUBLIC && e.type === "blob");   // marketing's words kept back (#1323)
  const read = await blobs(top, [...entries, ...people, ...list].map((e) => e.id));
  const files: Out[] = entries.map((e) => ({ ...e, body: read.get(e.id) ?? Buffer.alloc(0) }));
  for (const e of files) {   // before anything is left out: a key in a team file still stops it
    const why = exportOffence(e.path, e.body);
    if (why) throw new Error(`not exported: ${why}; the beta repo gets nothing until it is out`);
  }
  // the team's own files inside a kept folder (an area's REVIEW.md, #482) stay home, said, never a refusal (#479)
  const left = files.filter((e) => isTeamFile(e.path)).map((e) => e.path);
  const out = files.filter((e) => !isTeamFile(e.path));
  // the site serves the install line's script: the same file as sol/install, so the two doors never drift
  const install = out.find((e) => e.path === "sol/install");
  if (install) out.push({ ...install, path: "site/install", mode: "100644", type: "blob" });
  for (const [path, text] of Object.entries(NEUTRAL_HOME)) out.push({ path, mode: "100644", type: "blob", body: Buffer.from(text) });
  out.push({ path: "README.md", mode: "100644", type: "blob", body: Buffer.from(betaReadme(tag)) });
  const names = teamNames(people.map((e) => ({ path: e.path, body: read.get(e.id) ?? Buffer.alloc(0) })));
  const back = notYetPublic(list.map((e) => ({ path: e.path, body: read.get(e.id) ?? Buffer.alloc(0) }))[0]);
  const leak = leakIn(out, names, back) ?? await guardProbe(out, names);   // the files, then the guard run for real outside sol-dev
  if (leak) throw new Error(`not exported: ${leak}; the beta repo gets nothing until it is out`);
  return { top, out, left };
}
/** the leak check alone (ci.yml, leak.ts --check): the export of `sha` built and checked, nothing written; how many files
 * it holds, and the team files it left out */
export const exportCheck = (root: string, sha: string) => exportFiles(root, sha, "check").then((x) => ({ files: x.out.length, left: x.left }));

/** the export of `sha` for the beta repo: a commit with only BETA_KEEP, the neutral home and the README, on the previous
 * export. Refused, nothing written, when exportFiles refuses it. */
export async function exportTree(root: string, sha: string, tag: string): Promise<{ commit: string; prev: string }> {
  const { top, out } = await exportFiles(root, sha, tag);
  for (const e of out) if (!e.id) e.id = await gitIn(top, ["hash-object", "-w", "--stdin"], e.body.toString("utf8"));
  const dir = mkdtempSync(join(tmpdir(), "sol-beta-"));
  try {
    const env = { ...ENV(), GIT_INDEX_FILE: join(dir, "index") };
    await gitIn(top, ["update-index", "-z", "--index-info"], out.map((e) => `${e.mode} ${e.type} ${e.id}\t${e.path}\0`).join(""), env);
    const tree = await run("git", ["write-tree"], { cwd: top, env }).then((r) => r.stdout.trim());
    // the previous export is the parent (a tester's pull moves); anything else there (the full mirror) is replaced
    await run("git", ["fetch", "-q", "beta", "+refs/heads/main:refs/remotes/beta/main"], { cwd: top, env: ENV(), timeout: 60_000 }).catch(() => {});
    const prev = await run("git", ["rev-parse", "--verify", "-q", "refs/remotes/beta/main"], { cwd: top, env: ENV() }).then((r) => r.stdout.trim()).catch(() => "");
    const prevMsg = prev ? await run("git", ["log", "-1", "--format=%s", prev], { cwd: top, env: ENV() }).then((r) => r.stdout.trim()).catch(() => "") : "";
    const parent = prev && EXPORT_MSG.test(prevMsg) ? ["-p", prev] : [];
    // the export commit names no one (#479): the release runner's neutral name, the time in UTC, no signature
    const when = `${Math.floor(Date.now() / 1000)} +0000`;
    const who = { GIT_AUTHOR_NAME: EXPORT_IDENT.name, GIT_AUTHOR_EMAIL: EXPORT_IDENT.email, GIT_AUTHOR_DATE: when,
      GIT_COMMITTER_NAME: EXPORT_IDENT.name, GIT_COMMITTER_EMAIL: EXPORT_IDENT.email, GIT_COMMITTER_DATE: when };
    const commit = await run("git", ["-c", "commit.gpgSign=false", "commit-tree", "--no-gpg-sign", tree, ...parent, "-m", `Sol ${tag}`], { cwd: top, env: { ...ENV(), ...who } }).then((r) => r.stdout.trim());
    const raw = await run("git", ["cat-file", "commit", commit], { cwd: top, env: ENV() }).then((r) => r.stdout);
    const why = commitLeak(raw);
    if (why) throw new Error(`not exported: ${why}; the beta repo gets nothing until it is out`);
    return { commit, prev };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** whether this checkout has the remote `beta` the export goes to */
export const hasBeta = (root: string) => git(root, ["remote", "get-url", "beta"]).then(() => true, () => false);
/** said by a pass with no `beta` remote, where the export was skipped without a word until #1305 */
export const NO_BETA = "export skipped: no beta remote";

/** the beta repo's main follows stable as an export: the remote `beta`, when this checkout has one (without it the
 * export is skipped and said, NO_BETA). The beta pass (#419) calls it with the dev release it passes, `tag` that
 * release's dev-* name */
export async function mirror(d: Pick<Ship, "root">, sha: string, tag: string): Promise<{ beta?: string }> {
  if (!(await hasBeta(d.root))) return { beta: NO_BETA };
  try {
    const { commit, prev } = await exportTree(d.root, sha, tag);
    // the lease: main must still be what the export was built on (another pass in between refuses, never overwrites).
    // `stable` moves with main: a tester's engine asks its origin for refs/heads/stable every ten minutes (askOrigin) and Update
    // fast-forwards to it; with main alone the tester never hears a new version and Update has nothing to fetch
    // --atomic: the lease is checked per ref, so without it a refused main would still move stable and the tag, and a
    // tester would be offered a stable that split from main
    quietPush();   // a quiet Sol pushes nothing (#1293)
    await git(d.root, ["push", "-q", "--atomic", `--force-with-lease=refs/heads/main:${prev}`, "beta", `${commit}:refs/heads/main`, `+${commit}:refs/heads/stable`, `+${commit}:refs/tags/${tag}`], 120_000);
    return { beta: `the beta repo runs it too` };
  } catch (e) {
    return { beta: `the beta repo did not take it: ${firstLine(e)}` };
  }
}

// ---- every Sol learns, and updates ----

/** a `stable` heard on the relay or read from GitHub: the offer for every face, or null when there is nothing to offer
 * here (a word for the other channel, the live Sol, a sha HEAD holds and the channel's branch is on) */
export async function heardStable(d: Ship, m: { sha?: unknown; tag?: unknown; by?: unknown; channel?: unknown }, channel?: Channel): Promise<Offer | null> {
  const sha = String(m.sha ?? "");
  if (!/^[0-9a-f]{40}$/.test(sha)) return null;
  if (pinNow()) return null;   // #426: pinned, it takes no new release until back to latest
  const ch = channel ?? await d.channel();
  if (channelIn(m) !== ch) return null;
  const branch = (await tryGit(d, ["branch", "--show-current"])) ?? "";
  if (branch === "live") return null;   // the live Sol moves by the release runner only
  const B = BRANCH[ch];
  const mine = (await tryGit(d, ["rev-parse", "--verify", "-q", `refs/heads/${B}`])) ?? (await tryGit(d, ["rev-parse", "--verify", "-q", `refs/remotes/origin/${B}`])) ?? "";
  // HEAD holds it already (an older release, or main ahead of it): nothing to update to. An unknown sha is behind.
  const behind = (await tryGit(d, ["merge-base", "--is-ancestor", sha, "HEAD"])) === null;
  const offer: Offer = { type: "team.stable", sha, tag: String(m.tag ?? ""), by: String(m.by ?? ""), mine, behind, channel: ch };
  // on a */mine branch only HEAD's history says whether it has the release (#166): it shares its branches with the
  // checkout of main beside it
  // #425: a release it chose to stay behind is not offered again; a newer one is, with how far behind it is
  if (/\/mine$/.test(branch)) {
    if (!behind) return null;
    const stayed = stayedOn();
    if (stayed === sha) return null;
    if (stayed) clearStay();
    const n = Number(await tryGit(d, ["rev-list", "--count", `HEAD..${sha}`]));
    return Number.isFinite(n) && n > 0 ? { ...offer, count: n } : offer;
  }
  // my branch for the channel is that sha already and HEAD holds it: nothing to say. The branch alone never hides an
  // offer while HEAD is behind (#344)
  if (mine === sha && !behind) return null;
  // beta has no going back (#1150): a beta release HEAD already holds (a Sol switched from dev, ahead of beta) is never
  // offered; it stays on its release until beta reaches it
  if (ch === "beta" && !behind) return null;
  // a rollback (#638): this Sol runs its dev release exactly (HEAD is its dev) and the word is a release before it
  if (ch === "dev" && !behind && await wentBack(d, sha, mine)) return { ...offer, behind: true, back: true };
  return offer;
}

/** dev went back to `sha` (#638): this Sol runs its own dev exactly, `mine`, and `sha` is an older commit of it. A
 *  checkout with work of its own on top (HEAD is not its dev) is never moved back */
async function wentBack(d: Ship, sha: string, mine: string): Promise<boolean> {
  if (!mine || mine === sha) return false;
  if ((await tryGit(d, ["rev-parse", "HEAD"])) !== mine) return false;
  return (await tryGit(d, ["merge-base", "--is-ancestor", sha, mine])) !== null;
}

/** HEAD holds `sha` (it is HEAD or in its history) */
const holds = async (d: Pick<Ship, "root">, sha: string) => (await tryGit(d, ["merge-base", "--is-ancestor", sha, "HEAD"])) !== null;

let updating = false;
/** team.update: fast-forward to the channel's branch on GitHub (`dev` or `stable`); then the build watcher rebuilds and
 * renew goes live at a quiet moment */
export async function update(d: Ship, channel?: Channel, auto = false, ready?: Prepared): Promise<{ ok: true; sha: string; renews: boolean } | { ok?: false; error: string; carry?: Carry; why?: Why }> {
  if (updating) return { error: "an update is already running" };
  const pin = pinNow();
  if (pin) return { error: `your Sol is pinned to ${pin.tag || pin.sha.slice(0, 8)}; press back to latest to take new releases` };   // #426
  updating = true;
  const ch = channel ?? await d.channel().catch((): Channel => "beta");
  const B = BRANCH[ch];
  const leave = joinBusy("update", B, `update to ${B}`);
  try {
    const dirty = (await git(d.root, ["status", "--porcelain", "--untracked-files=no"])).split("\n").filter(Boolean);
    const branch = (await tryGit(d, ["branch", "--show-current"])) ?? "";
    const mine = /\/mine$/.test(branch);
    // #425: a */mine Sol is a person's own, and what they read says change and keep, never commit
    if (dirty.length) return { error: mine ? "you have changes not kept yet in your Sol; keep them first" : "you have changes; commit or stash first", why: "changes" };
    if (mine && carryNow()?.stage === "moving") return { error: "your Sol is moving over to your carried-over changes; a moment" };
    if (branch !== "main" && branch !== B && branch !== "stable" && !mine) return { error: `you are on ${branch || "a detached head"}; switch to main first` };
    // a release built aside (#1566) was fetched then: it is the target, nothing is fetched now
    if (!ready) {
      try { await git(d.root, ["fetch", "-q", "origin", `+refs/heads/${B}:refs/remotes/origin/${B}`], 120_000); }
      catch (e) { return { error: `could not fetch ${B}: ${firstLine(e)}` }; }
    }
    const target = await git(d.root, ["rev-parse", `refs/remotes/origin/${B}`]);
    // built aside for GitHub's dev as it was then: still dev's, or nothing moves (the next word or ask builds the newest)
    if (ready && ready.sha !== target) return { error: `the release built aside, ${short(ready.sha)}, is not GitHub's ${B} now` };
    const was = await git(d.root, ["rev-parse", "HEAD"]);
    // beta never moves a Sol backwards (#1150): HEAD holds beta's release already (switched from dev, ahead of it), so
    // nothing moves, not even its own layer onto the older release; it joins beta when beta reaches it
    if (ch === "beta" && await holds(d, target)) return { ok: true, sha: target, renews: false };
    if (mine) {
      // the own layer's path (#425 reshapes it): sol/mine/rebase goes onto the channel's branch, SOL_CHANNEL says which
      try { await run("bash", [join(d.root, "mine", "rebase")], { cwd: d.root, env: { ...ENV(), SOL_CHANNEL: ch }, timeout: 120_000 }); }
      catch (e: any) {
        const said = `${e?.stdout ?? ""}\n${e?.stderr ?? ""}`.split("\n").map((l) => l.replace(/^mine\/rebase: /, "").trim()).filter(Boolean).join("; ");
        // #425: it stopped on a clash and left the folder as it was; the carry over takes it from there, in a side copy
        if (d.carry && /does not go onto/.test(said) && (await tryGit(d, ["rev-parse", "HEAD"])) === was) {
          const c = await d.carry(target, offer?.sha === target ? offer.tag : "", B, auto).catch(() => null);
          if (c) return { error: c.said, carry: c };
          // the carry could not even begin: the folder is as it was, said in plain words
          return { error: "your own changes do not go onto today's release by themselves, and Sol could not start carrying them over; nothing changed" };
        }
        return { error: said ? said.slice(0, 400) : `sol/mine/rebase did not finish: ${firstLine(e)}` };
      }
    } else if (ch === "dev" && target !== was && await wentBack(d, target, (await tryGit(d, ["rev-parse", "--verify", "-q", `refs/heads/${B}`]))
      ?? (offer?.back && offer.sha === target ? offer.mine : ""))) {
      // (no dev of its own: the dev it was heard on, the rollback offer's, since the fetch has moved origin/dev already)
      // dev went back (#638): GitHub's dev is a release before the one this Sol runs; the tree is clean, so it goes back
      try { await git(d.root, ["reset", "-q", "--keep", target]); }
      catch (e) { return { error: `could not go back to ${B}: ${firstLine(e)}` }; }
    } else {
      try { await git(d.root, ["merge", "--ff-only", "-q", `refs/remotes/origin/${B}`]); }
      catch (e) { return { error: `${branch} has commits ${B} does not, so it cannot move forward to it: ${firstLine(e)}` }; }
    }
    // the release changed what it installs (#1150): tsc (noEmitOnError) and the face's Vite would fail on the old
    // node_modules while the old dist kept running. A folder that does not install moves the Sol back where it was
    // (a */mine Sol: its own tip, its commits kept), installs that again, and says "build"
    const now = await git(d.root, ["rev-parse", "HEAD"]);
    const nm: [string, string][] = [], inPlace: string[] = [];
    if (now !== was) {
      const ci = d.ci ?? npmCi;
      const changed = lockedFolders((await tryGit(d, ["diff", "--relative", "--name-only", was, "HEAD", "--", ...LOCKS]) ?? "").split("\n"));
      const behind = staleFolders(d.root);   // and what an earlier move missed (#1187), in LOCKS' order, each once
      const dirs = LOCKS.map((l) => l.slice(0, -"/package-lock.json".length)).filter((f) => changed.includes(f) || behind.includes(f));
      const done: string[] = [];
      for (const f of dirs) {
        done.push(f);
        // installed aside for this lock (#1566): moved in, seconds, the one it replaced kept for going back (#1576);
        // anything else installs here, as before
        const kept = ready ? await tookAside(d, ready, f) : null;
        if (kept) { nm.push([join(d.root, f, "node_modules"), kept]); continue; }
        inPlace.push(join(d.root, f));
        try { await ci(join(d.root, f)); }
        catch (e) {
          const why = firstLine(e);
          try { await git(d.root, ["reset", "-q", "--keep", was]); }
          catch (e2) { return { error: `npm ci in sol/${f} failed (${why}), and Sol could not go back: ${firstLine(e2)}`, why: "build" }; }
          for (const g of done) await ci(join(d.root, g)).catch(() => {});   // what was installed before, again
          return { error: `the release's sol/${f} did not install (npm ci: ${why}); your Sol stays where it was`, why: "build" };
        }
      }
    }
    // the engine built aside (#1566) is the engine HEAD holds now: its dist goes in, and renew finds it there; a */mine
    // Sol's own engine changes, or a dev that moved since, are the build watcher's, as before
    if (ready?.built && now !== was && await sameAt(d, "HEAD", ready.sha, ENGINE_SRC)) {
      try { cpSync(join(ready.dir, "engine", "dist"), join(d.root, "engine", "dist"), { recursive: true, force: true }); }
      catch (e) { console.log(`ship: the engine built aside did not go in (${firstLine(e)}); the build watcher builds it`); }
    }
    if (branch !== B) await tryGit(d, ["branch", "-f", B, target]);   // my dev (or stable) is the team's now
    // the way back, should the new engine not start (#1576): the keeper reads it, and deletes it once this one stays up
    if (now !== was) {
      try {
        writeFileSync(join(d.root, "engine", SWAP), swapText({ from: was, to: now, at: new Date().toISOString(), nm, ci: inPlace }));
        if (skippedIn(d.root) && skippedIn(d.root) !== now) rmSync(join(d.root, "engine", SKIP), { force: true });   // a newer release
      } catch (e) { console.log(`ship: the way back was not written (${firstLine(e)}); a release that does not start keeps only the engine's last good build`); }
    }
    const renews = (await tryGit(d, ["diff", "--quiet", was, "HEAD", "--", ...ENGINE_SRC])) === null;
    return { ok: true, sha: target, renews };
  } catch (e) {
    return { error: firstLine(e) };
  } finally { updating = false; leave(); }
}

// ---- built aside (#1566) ----

/** a release built aside: its engine and the face's package files in `dir`, with node_modules installed there for the
 *  folders in `mods` (their lock differs from HEAD's), and `built`: its engine's dist made there */
export type Prepared = { sha: string; dir: string; mods: string[]; built: boolean };
/** the repo's top and sol/'s place in it ("sol"), for git archive, which reads a tree from the top */
async function placeOf(d: Pick<Ship, "root">): Promise<{ top: string; prefix: string; common: string }> {
  const [top, prefix, common] = await Promise.all([git(d.root, ["rev-parse", "--show-toplevel"]), git(d.root, ["rev-parse", "--show-prefix"]), git(d.root, ["rev-parse", "--git-common-dir"])]);
  return { top, prefix: prefix.replace(/\/+$/, ""), common: resolve(d.root, common) };
}
/** the object at `rev:sol/<path>`, "" when there is none */
const idAt = async (d: Pick<Ship, "root">, rev: string, path: string) => (await tryGit(d, ["rev-parse", "-q", "--verify", `${rev}:./${path}`])) ?? "";
/** `paths` (under sol/) are the same at both commits */
async function sameAt(d: Pick<Ship, "root">, a: string, b: string, paths: string[]): Promise<boolean> {
  for (const p of paths) if (await idAt(d, a, p) !== await idAt(d, b, p)) return false;
  return true;
}
/** where a release is built aside, and the file that keeps when the last install by itself was */
export const asideIn = async (d: Pick<Ship, "root">) => { const c = (await placeOf(d)).common; return { dir: join(c, "sol-next"), at: join(c, "sol-next.at") }; };

/** fetch dev and build the release `sha` aside (#1566): `git archive` of its engine and the face's package files into
 *  sol-next/, `npm ci` there for a folder whose lock differs from HEAD's (the same lock: the live node_modules, linked),
 *  and tsc there when its engine differs from HEAD's (a release with no tsconfig has nothing to build). The live
 *  checkout is not touched. An error says why, and the Sol says `build` (runs.ts) */
export async function prepare(d: Ship, sha: string): Promise<Prepared | { error: string; silent?: true }> {
  // offline is no build failure: nothing is said, and the next word or ask tries again
  try { await git(d.root, ["fetch", "-q", "origin", `+refs/heads/${BRANCH.dev}:refs/remotes/origin/${BRANCH.dev}`], 120_000); }
  catch (e) { return { error: `could not fetch ${BRANCH.dev}: ${firstLine(e)}`, silent: true }; }
  // only what GitHub's dev is now is ever built or installed, as Update installs origin/dev: a relay word names a sha,
  // and a sha that is not dev's (an old word, or one nobody released) is not this Sol's to run
  if ((await tryGit(d, ["rev-parse", `refs/remotes/origin/${BRANCH.dev}`])) !== sha) return { error: `the release ${short(sha)} is not GitHub's ${BRANCH.dev} now`, silent: true };
  const place = await placeOf(d);
  const dir = join(place.common, "sol-next");
  // what an earlier swap left, unless the engine it brought has not yet stayed up its minute (#1576: the way back)
  if (!existsSync(join(d.root, "engine", SWAP))) void rm(join(place.common, "sol-was"), { recursive: true, force: true }).catch(() => {});
  try {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const paths: string[] = [];
    for (const p of ["engine", "mac/package.json", "mac/package-lock.json"]) if (await idAt(d, sha, p)) paths.push(p);
    if (paths.length) {
      const tar = join(place.common, "sol-next.tar");
      await git(place.top, ["archive", "--format=tar", "-o", tar, `${sha}:${place.prefix}`, ...paths], 120_000);
      try { await run("tar", ["-xf", tar, "-C", dir], { timeout: 120_000 }); } finally { rmSync(tar, { force: true }); }
    }
  } catch (e) { return { error: `the release ${short(sha)} could not be set aside: ${firstLine(e)}` }; }
  const mods: string[] = [];
  const stale = staleFolders(d.root);
  for (const lock of LOCKS) {
    const f = lock.slice(0, -"/package-lock.json".length);
    const there = await idAt(d, sha, lock);
    if (!there || !existsSync(join(dir, f))) continue;
    const live = join(d.root, f, "node_modules");
    if (there === await idAt(d, "HEAD", lock) && !stale.includes(f) && existsSync(live)) {
      try { symlinkSync(live, join(dir, f, "node_modules"), "dir"); continue; } catch { /* installed aside instead */ }
    }
    try { await (d.ci ?? npmCi)(join(dir, f)); mods.push(f); }
    catch (e) { return { error: `the release's sol/${f} did not install (npm ci: ${firstLine(e)})` }; }
  }
  let built = false;
  if (existsSync(join(dir, "engine", "tsconfig.json")) && !(await sameAt(d, "HEAD", sha, ENGINE_SRC))) {
    try { await (d.build ?? tscIn)(join(dir, "engine")); built = existsSync(join(dir, "engine", "dist")); }
    catch (e) { return { error: `the release's engine did not build (${firstLine(e)})` }; }
  }
  return { sha, dir, mods, built };
}

/** the swap of a folder's node_modules for the one installed aside, when HEAD's lock is the one it was installed for;
 *  where the one it replaced is kept (#1576: the keeper puts it back if the new engine does not start, and deletes it
 *  once it does), or null when it was not installed aside, or the move did not work (the caller installs it in place) */
async function tookAside(d: Ship, ready: Prepared, f: string): Promise<string | null> {
  const lock = `${f}/package-lock.json`;
  if (!ready.mods.includes(f) || await idAt(d, "HEAD", lock) !== await idAt(d, ready.sha, lock)) return null;
  // the one it replaces goes out of the checkout (beside sol-next), never left there for a git add -A when a renew ends
  // its removal halfway; prepare clears what is left
  const live = join(d.root, f, "node_modules"), was = join(ready.dir, "..", "sol-was", `${f}-${Date.now()}`), next = join(ready.dir, f, "node_modules");
  if (!existsSync(next)) return null;
  try {
    mkdirSync(join(was, ".."), { recursive: true });
    if (existsSync(live)) renameSync(live, was);
    try { renameSync(next, live); }
    catch (e) { if (existsSync(was) && !existsSync(live)) renameSync(was, live); throw e; }
  } catch (e) { console.log(`ship: sol/${f}'s node_modules built aside did not move in (${firstLine(e)}); installing it in place`); return null; }
  return existsSync(was) ? was : null;
}

// ---- the engine's one instance ----

let D: Ship | null = null;
let offer: Offer | null = null;
let tell: (m: object) => void = () => {};
let listening = false;
let asking: NodeJS.Timeout | null = null;
let heard = 0;   // every word hear() took, counted: an ask of GitHub that a relay word overtook drops its answer
let installing = "";   // the dev release waiting for a quiet moment, or being installed
export const shipNow = () => D;
/** the standing offer (a face that connects asks for it with team.stable.get) */
export const offerNow = () => offer;

/** what the engine does with a `stable` heard on the relay, or read from GitHub (exported for the tests). The same
 * offer heard again (the ten-minute ask, #353) is not told again: the faces have it, and a face that connects later asks. */
export async function hear(m: { sha?: unknown; tag?: unknown; by?: unknown; channel?: unknown }) {
  if (!D) return;
  heard++;
  const o = await heardStable(D, m).catch(() => null);
  if (!o) {
    // nothing to offer for the sha standing as behind: HEAD came to hold it some other way (a pull by hand), so the
    // offer stands answered, as after Update, and no face that connects later is shown an Update for it
    if (offer?.behind && offer.sha === String(m.sha ?? "")) answered(offer.sha);
    return;
  }
  // GitHub's answer names no releaser and may name no tag: for the sha already standing, what was heard before stays said
  const next: Offer = offer && offer.sha === o.sha ? { ...o, tag: o.tag || offer.tag, by: o.by || offer.by } : o;
  // nothing new (the ten-minute ask): the faces have it. A dev release still behind is tried again: its last try may have
  // been refused (a dirty tree since cleaned)
  if (!offer || JSON.stringify(next) !== JSON.stringify(offer)) { offer = next; tell(next); }
  if (next.channel === "dev" && next.behind) void installDev(next.sha);
}
/** a pin (#426): the standing offer goes, every face hears there is none; unpinned, GitHub is asked again at once */
export function pinChanged(pinned: boolean) {
  if (pinned) { offer = null; tell({ type: "team.stable", sha: null }); return; }
  void askOrigin().catch(() => {});
}
/** after an update: the offer stands answered, every face hears it is no longer behind */
export function answered(sha: string) {
  if (!offer) return;
  const { back: _, ...rest } = offer;
  offer = { ...rest, mine: sha, behind: false };
  tell(offer);
}

/** the waits of a dev release that installs itself (#1566): no turn in flight for QUIET_MS (background agents do not
 *  count, busy.ts), at most one install every EVERY_MS, and past CAP_MS of waiting one breath between turns is enough */
export const QUIET_MS = 5000, EVERY_MS = 30 * 60_000, CAP_MS = 30 * 60_000, CAPPED_QUIET_MS = 1000;
const nap = (ms: number) => new Promise<void>((r) => { setTimeout(r, Math.max(0, ms)).unref?.(); });
/** when this Sol last installed a release by itself (the file beside sol-next), 0 never */
const lastInstall = (at: string) => { try { return Number(readFileSync(at, "utf8")) || 0; } catch { return 0; } };
// what renew's cap counts from (#1566, renew.ts `since`): when the release this engine installed was first waited for,
// while that install is fresh; 0 otherwise
let installedFrom = 0, installedAt = 0;
let failed = "";   // the release whose aside build failed: not built again every ten minutes, said build again
export const releaseWaitFrom = () => (installedAt && Date.now() - installedAt < CAP_MS ? installedFrom : 0);

/** a dev release installs itself (#418, #1566): it is fetched and built aside at once (`prepare`), then swapped in as if
 * Update were pressed, between two turns: no turn in flight for quietMs, background agents not counted. At most one
 * install every everyMs, the newest (a rollback, #638, does not wait for that); a wait past capMs needs only a breath
 * between turns; pause updates holds the swap. One worker at a time, following the newest word: a word during a build
 * or a wait builds the newest. A Sol on its own `<you>/mine` branch too (#1150): its own commits go on top, and a clash
 * leaves it where it was while the carry takes it over, with no press (carry.ts `auto`). One that fails (a dirty tree, a
 * branch of its own) keeps the offer, and its Update says why. Either way the Sol says what it runs after, with the
 * reason when it did not install (runs.ts): busy (turns in flight), paused, clash, changes, build (its new code did not
 * build aside or install) */
export async function installDev(sha: string): Promise<boolean> {
  const d = D;
  if (!d || d.auto === false || installing || pinNow()) return false;   // one under way follows the newest word itself
  const branch = (await tryGit(d, ["branch", "--show-current"])) ?? "";
  if (branch === "live") return false;   // the release runner promotes the live Sol
  const mine = /\/mine$/.test(branch);
  // a carry under way has this Sol's own changes in hand: it moves when that is done, never twice at once
  if (mine && carryNow()) { d.runs?.("clash"); return false; }
  if (failed && failed === sha) { d.runs?.("build"); return false; }   // the same release again: it did not build
  // the release this Sol went back from (#1576, the keeper's .skip): it did not start here, so it waits for a newer one
  if (skippedIn(d.root) === sha) { d.runs?.("build"); return false; }
  if (installing) return false;   // another began during the read above
  installing = sha;
  const heardAt = Date.now();
  const quiet = d.quietMs ?? QUIET_MS, every = d.everyMs ?? EVERY_MS, cap = d.capMs ?? CAP_MS, poll = d.pollMs ?? 1000;
  const paused = d.paused ?? updatesPaused;
  let calm = 0;
  const off = onBusy((jobs) => { if (jobs.some((j) => !j.background)) calm = 0; });   // a turn between two looks breaks the calm
  try {
    const aside = await asideIn(d).catch(() => null);
    if (!aside) return false;
    let ready: Prepared | null = null, from = heardAt;
    const said = new Set<string>();
    const say = (why: Why) => { if (!said.has(why)) { said.add(why); d.runs?.(why); } };   // the team sees why, once each
    for (;;) {
      const o = offer;
      if (D !== d || !o || o.channel !== "dev" || !o.behind) return false;   // answered meanwhile, or not this Sol's now
      installing = o.sha;
      if (ready?.sha !== o.sha) {
        ready = null;
        const p = await prepare(d, o.sha);
        if (D !== d) return false;
        if ("error" in p) {
          if (offer?.sha !== o.sha) continue;   // a newer word came while this one built: that one is built now
          // offline, or a word that is not GitHub's dev (an old one, or one nobody released): nothing is built or said
          if (p.silent) { console.log(`ship: ${p.error}; nothing built`); return false; }
          console.log(`ship: the dev release ${short(o.sha)} was not built aside: ${p.error}`);
          failed = o.sha;
          d.runs?.("build");
          return false;
        }
        ready = p;
        continue;   // the newest word again, before anything waits
      }
      const free = lastInstall(aside.at) + every;
      if (!o.back && Date.now() < free) { await nap(Math.min(poll, free - Date.now())); continue; }
      from = Math.max(heardAt, Math.min(free, Date.now()));   // the cap counts from when it could first install
      if (paused()) { calm = 0; say("paused"); await nap(poll); continue; }
      if (!betweenTurns() || updating) {
        calm = 0; say("busy");
        await nap(poll);   // and the newest word looked at again
        continue;
      }
      const capped = Date.now() - from >= cap;
      if (!calm) calm = Date.now();
      if (Date.now() - calm < (capped ? CAPPED_QUIET_MS : quiet)) { await nap(Math.min(poll, (capped ? CAPPED_QUIET_MS : quiet) - (Date.now() - calm))); continue; }
      if (betweenTurns() && !updating && offer?.sha === ready.sha) break;
    }
    if ((await d.channel().catch(() => "beta")) !== "dev") return false;   // switched to beta meanwhile (#1150)
    const r = await update(d, "dev", true, ready);
    rmSync(ready.dir, { recursive: true, force: true });
    if (D !== d) return !!r.ok;   // Ship started again meanwhile (the tests): the offer standing now is not this one's
    if (!r.ok) {
      console.log(`ship: the dev release ${short(ready.sha)} did not install by itself: ${r.error}`);
      d.runs?.(r.carry ? "clash" : r.why);
      return false;
    }
    const at = Date.now();
    try { writeFileSync(aside.at, `${at}\n`); } catch { /* the next install may come sooner: no harm */ }
    installedFrom = from; installedAt = at;
    console.log(`ship: the dev release ${short(ready.sha)} installed by itself, ${Math.round((at - from) / 60_000)} min after it could${r.renews ? "; Sol renews between turns" : ""}`);
    answered(r.sha);
    d.updated?.();
    d.runs?.();
    return true;
  } finally { off(); if (D === d) installing = ""; }
}
const short = (s: string) => s.slice(0, 7);

/** how often the engine asks GitHub itself (#353): a release whose relay word this Sol missed reaches it within the hour;
 * ten minutes since #1561, because dev moves on green from GitHub's machines, which have no voice on the relay (#1559) */
export const ASK_EVERY_MS = 10 * 60_000;
const ASK_FIRST_MS = 20_000;
/** what this engine's channel branch is on GitHub (exported for the tests), asked 20 s after start and every ten minutes after:
 * a release made while it was off, or one whose relay word it missed, is offered (or, on dev, installed) too */
export async function askOrigin() {
  if (!D || updating) return;   // mid-update the branches are moving; the next hour asks again
  const before = heard;
  const ch = await D.channel().catch((): Channel => "beta");
  const B = BRANCH[ch];
  // a beta release is a dev release passed whole (#419), so its tag is dev-*, with its number v1, v2… beside it (#1300);
  // stable-* are the stamps from before
  const tags = ch === "dev" ? ["refs/tags/dev-*"] : ["refs/tags/stable-*", "refs/tags/dev-*", "refs/tags/v*"];
  const out = await git(D.root, ["ls-remote", "origin", `refs/heads/${B}`, ...tags], 20_000).catch(() => "");
  if (heard !== before) return;   // a word came over the relay while GitHub was answering: that word is newer than this answer
  const refs = out.split("\n").filter(Boolean).map((l) => l.split("\t") as [string, string]);
  const sha = refs.find(([, r]) => r === `refs/heads/${B}`)?.[0];
  if (!sha) return;
  // of two tags on one sha the newest: dev-YYYYMMDD-HHMM after dev-YYYYMMDD, any dev-* after a stable-* (releaseTag, the
  // same pick Settings and /health make, #529)
  const on = refs.filter(([s, r]) => s === sha && r.startsWith("refs/tags/")).map(([, r]) => r.replace(/^refs\/tags\//, "").replace(/\^\{\}$/, ""));
  const tag = releaseTag(on);
  await hear({ sha, tag, by: "", channel: ch });
}

// ---- the switch (#1150): Settings › me writes team.json `channel`; read live, no restart ----
let lastChannel: Channel | null = null;
/** this Sol's channel, said in its runs word (runs.ts); null before Ship starts */
export const channelNow = async (): Promise<Channel | null> => (D ? D.channel() : null);
/** the channel read again (on every team.json patch): a change drops the standing offer, which was the other
 *  channel's, and asks GitHub at once. Returns the channel moved to, or null when it did not move */
export async function channelCheck(): Promise<Channel | null> {
  const d = D;
  if (!d) return null;
  const ch = await d.channel().catch(() => null);
  if (!ch || D !== d) return null;
  const was = lastChannel;
  lastChannel = ch;
  // the version this Sol runs as follows its channel unless someone picked one (versions.ts); an unclear origin is product
  noteChannel(versionChannelOf(getTeam().channel, ch === "beta" ? "" : (await d.origin?.().catch(() => "")) ?? ""));
  if (was === null || was === ch) return null;
  console.log(`ship: this Sol follows ${ch} now (was ${was})`);
  if (offer) { offer = null; tell({ type: "team.stable", sha: null }); }
  d.runs?.();   // the count names each Sol's channel: say the new one
  await askOrigin().catch(() => {});   // beta → dev: dev installs at the next quiet minute; dev → beta: offered only when ahead
  return ch;
}

/** beta's branch and its release tag on GitHub (pure, from `ls-remote origin refs/heads/stable refs/tags/…`): the sha
 *  `stable` is on and of its tags the one releaseTag picks; none: "" for both */
export function stableIn(out: string): { sha: string; tag: string } {
  const refs = out.split("\n").filter(Boolean).map((l) => l.split("\t").map((x) => x.trim()) as [string, string]);
  const sha = refs.find(([, r]) => r === `refs/heads/${BRANCH.beta}`)?.[0] ?? "";
  if (!/^[0-9a-f]{40}$/.test(sha)) return { sha: "", tag: "" };
  return { sha, tag: releaseTag(refs.filter(([s, r]) => s === sha && r.startsWith("refs/tags/")).map(([, r]) => r.replace(/^refs\/tags\//, "").replace(/\^\{\}$/, ""))) };
}

/** what Settings › me and the window's version switch show (team.channel.get): the channel, the release this Sol runs,
 *  `stays`: on beta, HEAD's release is ahead of beta's (switched from dev), so it stays on it until beta reaches it;
 *  `stable`: the release beta's people run (its tag, "" unknown); `mode`: the version this Sol runs as (versions.ts,
 *  null not known yet); `team`: the checkout is the team's own (versionChannelOf's sol-dev), the one place the switch shows */
export async function channelState(): Promise<{ channel: Channel; release: string; stays: boolean; stable: string; mode: Mode | null; team: boolean } | null> {
  const d = D;
  if (!d) return null;
  const channel = await d.channel().catch((): Channel => "beta");
  const v = versionNow();
  const release = v?.release ?? "";
  const team = DEV_ORIGIN.test(((await d.origin?.().catch(() => "")) ?? "").trim());
  const out = await git(d.root, ["ls-remote", "origin", `refs/heads/${BRANCH.beta}`, "refs/tags/stable-*", "refs/tags/dev-*"], 20_000).catch(() => "");
  const { sha, tag: stable } = stableIn(out);
  const said = { channel, release, stable, mode: versionMode(), team };
  if (channel !== "beta" || !sha) return { ...said, stays: false };
  // beta's release is in HEAD's history (an unknown sha is not), and HEAD's own base is not in beta's: ahead of beta
  const base = v?.commit || (await tryGit(d, ["rev-parse", "HEAD"])) || "";
  const stays = await holds(d, sha) && !!base && (await tryGit(d, ["merge-base", "--is-ancestor", base, sha])) === null;
  return { ...said, stays };
}

/** index.ts: start Ship once, with the repo's sol/ folder and the engine's everyone() */
export function startShip(root: string, everyone: (m: object) => void, over: Partial<Ship> = {}) {
  D = {
    root,
    channel: async () => channelOf(getTeam().channel, (await tryGit({ root }, ["config", "--get", "remote.origin.url"])) ?? ""),
    origin: async () => (await tryGit({ root }, ["config", "--get", "remote.origin.url"])) ?? "",
    updated: () => void refreshVersion(),
    carry: (release, tag, follow, auto) => carryOver({ kind: "update", onto: release, source: "HEAD", tag, follow, ...(auto ? { auto } : {}) }),
    runs: (why) => void sayRuns(why).catch(() => {}),
    ...over,
  };
  tell = everyone;
  offer = null;
  installing = "";
  installedFrom = 0; installedAt = 0; failed = "";
  if (!listening) {
    listening = true;
    onRelay("stable", (m) => void hear(m as { sha?: unknown }));
    onTeam(() => void channelCheck());   // the switch in Settings › me (#1150), read live
  }
  lastChannel = null;
  void channelCheck();
  if (!process.env.SOL_NO_SHIP_CHECK && !isQuiet()) {
    const ask = () => void askOrigin().catch(() => {});
    setTimeout(ask, ASK_FIRST_MS).unref();
    if (asking) clearInterval(asking);   // startShip again (the tests): one clock, never two
    asking = setInterval(ask, ASK_EVERY_MS).unref();
  }
}
