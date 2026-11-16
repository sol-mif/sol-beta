// Ship (#33, then #418): every Sol hears a new release and takes it, and the beta repo's export.
//
// Two channels (#418, team flow v2). A release is a tag on main made by the release runner on the NucBox (release.ts):
//   dev    `dev-YYYYMMDD` each morning at the rhythm's release hour (and `dev-YYYYMMDD-HHMM` for an urgent fix), the
//          branch `dev` moved to it. A dev Sol follows `dev` and installs it by itself at a quiet moment (the busy
//          counter idle for a minute); a `*/mine` Sol is offered it instead until #425 carries the own layer over.
//   beta   `stable`, moved by the beta pass (#419) to a whole dev release. A beta Sol follows `stable` and is offered it
//          with Update and Later, as before.
// A Sol's channel is its setting (`channel` in team.json); left empty, a developer (any checkout whose origin is not
// the beta repo) is dev and a tester (origin sol-beta) is beta (channelOf).
// every Sol learns: the relay's `stable { sha, tag, by, channel }` (channel absent: beta), whose sha is not this
// checkout's branch for that channel, or is not in HEAD's history, becomes `team.stable` to every face, while `behind`
// (HEAD does not hold it). A word for the other channel is not this Sol's. The live Sol (branch `live`) is never offered
// one: the release runner promotes it. The engine also asks GitHub itself (ls-remote): 20 s after start, for a release
// made while it was off, and every hour after (#353), for one whose word on the relay it missed. GitHub's answer names no
// releaser: for the sha already standing, the name and tag heard before stay said. An ask that finds the offer already
// standing tells the faces nothing new; one that finds HEAD holding the offered sha (a pull by hand) stands it answered.
// A Sol from before #418 reads a `{ channel: "dev" }` word as a stable: it may offer it, and its Update then
// fast-forwards to GitHub's `stable`, never to dev, so the word is harmless there.
// update: fast-forward only, on main, the channel's branch or stable, on a clean tree; the build watcher and renew do the
// rest. On a */mine branch (MY SOL, since sol/mine/live, #116) it runs sol/mine/rebase instead: his own commits go onto
// the channel's new release (SOL_CHANNEL), and a conflict leaves the checkout as it was, its places named (#425 reshapes this path).
// the beta repo (#79): a checkout with a remote named `beta` (the testers' repo, sol-mif/sol-beta) gets an export of a
// release as that repo's main (mirror, called by the beta pass, #419): a fresh commit holding only what runs
// (BETA_KEEP) and a README for testers, chained on the previous export so a tester's `git pull` moves, with no parent in
// this repo's history. Nothing else crosses: no docs, no memos, no design, no team pages, no commit history. Anything on
// beta's main that is not an export (the full mirror of the first day) is replaced. No `beta` remote: nothing happens.
// An update joins the busy counter (busy.ts): a renew never lands mid-fetch.
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { join as joinBusy, idle, whenIdle } from "../busy.js";
import { onRelay } from "./relay.js";
import { getTeam } from "./settings.js";
import { refreshVersion, releaseTag } from "../version.js";
import { carryOver, carryNow, stayedOn, clearStay, type Carry } from "./carry.js";   // own changes that clash with a release (#425)
import { pinNow } from "./pin.js";   // a pinned Sol takes no new release (#426)
import { leakIn, guardProbe, isTeamFile, teamNames, readText, commitLeak, EXPORT_IDENT, NEUTRAL_HOME, type ExportFile } from "./leak.js";   // nothing team-only reaches testers (#479)

const run = promisify(execFile);
const ENV = () => ({ ...process.env, GIT_TERMINAL_PROMPT: "0" });   // never a password prompt nobody can answer

export type Channel = "dev" | "beta";
/** the branch a channel follows on origin, and its tags' prefix */
export const BRANCH: Record<Channel, string> = { dev: "dev", beta: "stable" };
export type Ship = {
  root: string;                                   // sol/: git runs here, the pathspecs are relative to it
  channel: () => Promise<Channel>;                // this Sol's channel (channelOf)
  auto?: boolean;                                 // a dev release installs itself at a quiet moment (default yes)
  quietMs?: number;                               // how long nothing may be live before it does (default a minute)
  updated?: () => void;                           // after an update: what this Sol runs is said again (#417)
  // #425: a */mine Sol whose own changes clash with the release: a side copy and a session carry them over (carry.ts).
  // Absent (a bare Ship, the older tests): the clash is said as sol/mine/rebase says it, and nothing more happens.
  // follow: the branch that follows the release here once it is used (dev or stable)
  carry?: (release: string, tag: string, follow: string) => Promise<Carry>;
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
const BETA_ORIGIN = /[/:]sol-beta(\.git)?\/?$/i;

/** a Sol's channel (pure): its setting, else dev for a developer and beta for a tester, whose origin is the beta repo */
export function channelOf(setting: unknown, origin: string): Channel {
  if (setting === "dev" || setting === "beta") return setting;
  return BETA_ORIGIN.test(origin.trim()) ? "beta" : "dev";
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
 * rule or a team word (leak.ts leakIn and guardProbe, #479), the backstop for what is not known yet */
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
  const read = await blobs(top, [...entries, ...people].map((e) => e.id));
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
  const leak = leakIn(out, names) ?? await guardProbe(out, names);   // the files, then the guard run for real outside sol-dev
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

/** the beta repo's main follows stable as an export: the remote `beta`, when this checkout has one. The beta pass
 * (#419) calls it with the dev release it passes, `tag` that release's dev-* name */
export async function mirror(d: Pick<Ship, "root">, sha: string, tag: string): Promise<{ beta?: string }> {
  if ((await git(d.root, ["remote", "get-url", "beta"]).catch(() => null)) === null) return {};
  try {
    const { commit, prev } = await exportTree(d.root, sha, tag);
    // the lease: main must still be what the export was built on (another pass in between refuses, never overwrites).
    // `stable` moves with main: a tester's engine asks its origin for refs/heads/stable every hour (askOrigin) and Update
    // fast-forwards to it; with main alone the tester never hears a new version and Update has nothing to fetch
    // --atomic: the lease is checked per ref, so without it a refused main would still move stable and the tag, and a
    // tester would be offered a stable that split from main
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

let updating = false;
/** team.update: fast-forward to the channel's branch on GitHub (`dev` or `stable`); then the build watcher rebuilds and
 * renew goes live at a quiet moment */
export async function update(d: Ship, channel?: Channel): Promise<{ ok: true; sha: string; renews: boolean } | { ok?: false; error: string; carry?: Carry }> {
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
    if (dirty.length) return { error: mine ? "you have changes not kept yet in your Sol; keep them first" : "you have changes; commit or stash first" };
    if (mine && carryNow()?.stage === "moving") return { error: "your Sol is moving over to your carried-over changes; a moment" };
    if (branch !== "main" && branch !== B && branch !== "stable" && !mine) return { error: `you are on ${branch || "a detached head"}; switch to main first` };
    try { await git(d.root, ["fetch", "-q", "origin", `+refs/heads/${B}:refs/remotes/origin/${B}`], 120_000); }
    catch (e) { return { error: `could not fetch ${B}: ${firstLine(e)}` }; }
    const target = await git(d.root, ["rev-parse", `refs/remotes/origin/${B}`]);
    const was = await git(d.root, ["rev-parse", "HEAD"]);
    if (mine) {
      // the own layer's path (#425 reshapes it): sol/mine/rebase goes onto the channel's branch, SOL_CHANNEL says which
      try { await run("bash", [join(d.root, "mine", "rebase")], { cwd: d.root, env: { ...ENV(), SOL_CHANNEL: ch }, timeout: 120_000 }); }
      catch (e: any) {
        const said = `${e?.stdout ?? ""}\n${e?.stderr ?? ""}`.split("\n").map((l) => l.replace(/^mine\/rebase: /, "").trim()).filter(Boolean).join("; ");
        // #425: it stopped on a clash and left the folder as it was; the carry over takes it from there, in a side copy
        if (d.carry && /does not go onto/.test(said) && (await tryGit(d, ["rev-parse", "HEAD"])) === was) {
          const c = await d.carry(target, offer?.sha === target ? offer.tag : "", B).catch(() => null);
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
    if (branch !== B) await tryGit(d, ["branch", "-f", B, target]);   // my dev (or stable) is the team's now
    const renews = (await tryGit(d, ["diff", "--quiet", was, "HEAD", "--", ...ENGINE_SRC])) === null;
    return { ok: true, sha: target, renews };
  } catch (e) {
    return { error: firstLine(e) };
  } finally { updating = false; leave(); }
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
 * offer heard again (the hourly ask, #353) is not told again: the faces have it, and a face that connects later asks. */
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
  // nothing new (the hourly ask): the faces have it. A dev release still behind is tried again: its last try may have
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

/** a dev release installs itself (#418): once nothing has been live for quietMs (no turn, no call, no review, no
 * terminal), the update runs as if Update were pressed. A Sol on its own `<you>/mine` branch is offered it instead (#425 carries the own
 * layer); one that fails (a dirty tree, a branch of its own) keeps the offer, and its Update says why */
export async function installDev(sha: string): Promise<boolean> {
  const d = D;
  if (!d || d.auto === false || installing === sha || pinNow()) return false;
  const branch = (await tryGit(d, ["branch", "--show-current"])) ?? "";
  if (/\/mine$/.test(branch) || branch === "live") return false;
  installing = sha;
  try {
    const quiet = d.quietMs ?? 60_000;
    for (;;) {
      await whenIdle();
      if (quiet) await new Promise((r) => setTimeout(r, quiet).unref?.());
      if (D !== d || offer?.sha !== sha || !offer.behind) return false;   // a newer word, or it was answered meanwhile
      if (idle() && !updating) break;
    }
    const r = await update(d, "dev");
    if (!r.ok) { console.log(`ship: the dev release ${short(sha)} did not install by itself: ${r.error}`); return false; }
    console.log(`ship: the dev release ${short(sha)} installed by itself${r.renews ? "; Sol renews in a moment" : ""}`);
    answered(r.sha);
    d.updated?.();
    return true;
  } finally { if (installing === sha) installing = ""; }
}
const short = (s: string) => s.slice(0, 7);

/** how often the engine asks GitHub itself (#353): a release whose relay word this Sol missed reaches it within the hour */
export const ASK_EVERY_MS = 60 * 60_000;
const ASK_FIRST_MS = 20_000;
/** what this engine's channel branch is on GitHub (exported for the tests), asked 20 s after start and every hour after:
 * a release made while it was off, or one whose relay word it missed, is offered (or, on dev, installed) too */
export async function askOrigin() {
  if (!D || updating) return;   // mid-update the branches are moving; the next hour asks again
  const before = heard;
  const ch = await D.channel().catch((): Channel => "beta");
  const B = BRANCH[ch];
  // a beta release is a dev release passed whole (#419), so its tag is dev-*; stable-* are the stamps from before
  const tags = ch === "dev" ? ["refs/tags/dev-*"] : ["refs/tags/stable-*", "refs/tags/dev-*"];
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

/** index.ts: start Ship once, with the repo's sol/ folder and the engine's everyone() */
export function startShip(root: string, everyone: (m: object) => void, over: Partial<Ship> = {}) {
  D = {
    root,
    channel: async () => channelOf(getTeam().channel, (await tryGit({ root }, ["config", "--get", "remote.origin.url"])) ?? ""),
    updated: () => void refreshVersion(),
    carry: (release, tag, follow) => carryOver({ kind: "update", onto: release, source: "HEAD", tag, follow }),
    ...over,
  };
  tell = everyone;
  offer = null;
  installing = "";
  if (!listening) { listening = true; onRelay("stable", (m) => void hear(m as { sha?: unknown })); }
  if (!process.env.SOL_NO_SHIP_CHECK) {
    const ask = () => void askOrigin().catch(() => {});
    setTimeout(ask, ASK_FIRST_MS).unref();
    if (asking) clearInterval(asking);   // startShip again (the tests): one clock, never two
    asking = setInterval(ask, ASK_EVERY_MS).unref();
  }
}
