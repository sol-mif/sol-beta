// Ship (#33, then #418): every Sol hears a new release on its channel and takes it, and the beta repo's export. A
// release is made here the way the release runner makes one (release.ts, its own tests in release.test.ts): a tag on
// main and the channel's branch moved to it on origin. Every case runs real git in a temp repo whose origin is a bare
// temp repo (like test/back.test.ts), so nothing here reaches the network or builds anything.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdtempSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// hermetic git: no global config (a signing rule or a hook there must not run here), a fixed name
Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  SOL_NO_SHIP_CHECK: "1", SOL_TEAM_FILE: join(mkdtempSync(join(tmpdir(), "sol-team-")), "team.json"),
  SOL_SETTINGS: join(mkdtempSync(join(tmpdir(), "sol-settings-")), "settings.json"),   // Ship tells settings.ts its channel: never the real file
});
delete process.env.SOL_VERSION;
const { update, heardStable, hear, startShip, offerNow, askOrigin, mirror, hasBeta, channelOf, channelIn, installDev, lockedFolders, staleFolders } = await import("../src/team/ship.ts");
const { handleTeam, addTeamFace } = await import("../src/team/wire.ts");
const { join: joinBusy } = await import("../src/busy.ts");
const { readFileSync, existsSync } = await import("node:fs");
type Ship = import("../src/team/ship.ts").Ship;
type Channel = import("../src/team/ship.ts").Channel;

const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

function fixture() {
  const top = mkdtempSync(join(tmpdir(), "sol-ship-"));
  const origin = join(top, "origin.git");
  git(top, "init", "-q", "--bare", "-b", "main", origin);
  const repo = join(top, "marco");
  mkdirSync(join(repo, "sol", "engine", "src"), { recursive: true });
  mkdirSync(join(repo, "sol", "mac", "src"), { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "sol", "engine", "src", "index.ts"), "export const a = 1;\n");
  writeFileSync(join(repo, "sol", "mac", "src", "App.tsx"), "export const b = 1;\n");
  writeFileSync(join(repo, ".gitignore"), "sol/engine/dist.good/\n");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "start");
  git(repo, "remote", "add", "origin", origin);
  git(repo, "push", "-q", "-u", "origin", "main");
  return { top, origin, repo, sol: join(repo, "sol") };
}
const commit = (repo: string, file: string, text: string, push = true) => {
  writeFileSync(join(repo, file), text);
  git(repo, "add", "-A"); git(repo, "add", "-u", "--renormalize"); git(repo, "commit", "-qm", `change ${file}`);   // by content, not by time (#990, pin.test.ts)
  if (push) git(repo, "push", "-q");
  return git(repo, "rev-parse", "HEAD");
};
/** a release, as the runner makes it: a tag on main's HEAD in `repo`, and the channel's branch on origin moved to it */
function released(repo: string, tag: string, branch: "dev" | "stable" = "dev") {
  const sha = git(repo, "rev-parse", "HEAD");
  git(repo, "tag", "-a", tag, "-m", tag, sha);
  git(repo, "push", "-q", "--atomic", "origin", `refs/tags/${tag}:refs/tags/${tag}`, `+${sha}:refs/heads/${branch}`);
  return { sha, tag };
}
const deps = (sol: string, channel: Channel = "dev", over: Partial<Ship> = {}): Ship => ({ root: sol, channel: async () => channel, auto: false, ...over });

test("a Sol's channel: its setting, else dev for a developer and beta for a tester (origin the beta repo); a word without one is beta", () => {
  assert.equal(channelOf("", "https://github.com/sol-mif/sol-dev.git"), "dev");
  assert.equal(channelOf(undefined, "git@github.com:sol-mif/sol-beta.git"), "beta");
  assert.equal(channelOf("", "https://github.com/sol-mif/sol-beta"), "beta");
  assert.equal(channelOf("beta", "https://github.com/sol-mif/sol-dev.git"), "beta", "a developer who wants to run what testers run");
  assert.equal(channelOf("dev", "https://github.com/sol-mif/sol-beta.git"), "dev");
  assert.equal(channelOf("nightly", ""), "dev", "an unknown setting is no setting");
  assert.equal(channelIn({ channel: "dev" }), "dev");
  assert.equal(channelIn({}), "beta", "a word from before #418 (a stamp) is a stable");
});

test("the beta repo (#79): an export of what runs, on the previous export, never the house; no remote, said (#1305)", async () => {
  const f = fixture();
  // the house: things a tester must never see
  writeFileSync(join(f.repo, "now.md"), "where we are\n");
  mkdirSync(join(f.repo, "docs"), { recursive: true }); writeFileSync(join(f.repo, "docs", "PLAN.md"), "the plan\n");
  mkdirSync(join(f.repo, "sol", "design", "x"), { recursive: true });
  writeFileSync(join(f.repo, "sol", "design", "tempo.json"), "{}\n"); writeFileSync(join(f.repo, "sol", "design", "x", "PRD.md"), "a memo\n");
  writeFileSync(join(f.repo, "sol", "setup"), "#!/bin/bash\n");
  const first = commit(f.repo, "sol/HELP.md", "help\n");
  assert.deepEqual(await mirror(deps(f.sol), first, "dev-20261029"), { beta: "export skipped: no beta remote" }, "no beta remote: nothing happens, and it is said (#1305)");
  assert.equal(await hasBeta(f.sol), false);

  const beta = join(f.top, "beta.git");
  git(f.top, "init", "-q", "--bare", "-b", "main", beta);
  git(f.repo, "remote", "add", "beta", beta);
  git(f.repo, "push", "-q", "beta", "HEAD:refs/heads/main");   // the first day's full mirror sits there
  assert.equal(await hasBeta(f.sol), true);
  const head = commit(f.repo, "sol/mac/src/App.tsx", "export const b = 2;\n");
  let r = await mirror(deps(f.sol), head, "dev-20261030");
  assert.equal(r.beta, "the beta repo runs it too");
  const main1 = git(beta, "rev-parse", "refs/heads/main");
  assert.notEqual(main1, head, "an export, not the commit itself");
  assert.deepEqual(git(beta, "ls-tree", "-r", "--name-only", main1).split("\n").sort(),
    [".gitignore", "README.md", "sol/HELP.md", "sol/design/tempo.json", "sol/engine/src/index.ts",
      "sol/home/AGENTS.md", "sol/home/CLAUDE.md", "sol/home/life/.keep", "sol/home/memory/.keep",   // the neutral home (#479)
      "sol/mac/src/App.tsx", "sol/setup"],
    "only what runs and the README: no now.md, no docs, no memo in design");
  assert.equal(git(beta, "rev-list", "--count", main1), "1", "the full mirror is replaced; no history of the house");
  assert.equal(git(beta, "log", "-1", "--format=%s", main1), "Sol dev-20261030");
  assert.match(git(beta, "show", `${main1}:README.md`), /beta testers run: dev-20261030\./, "the README names the version");
  assert.doesNotMatch(git(beta, "show", `${main1}:README.md`), /stamp/i, "no stamp in the testers' words");
  assert.equal(git(beta, "rev-parse", "refs/tags/dev-20261030"), main1, "the tag points at the export");
  assert.equal(git(beta, "rev-parse", "refs/heads/stable"), main1, "and beta's stable moves with it: a tester's hourly ask finds the new version");
  assert.equal(git(beta, "cat-file", "-p", `${main1}:sol/mac/src/App.tsx`), "export const b = 2;");

  // the next pass: a new export on top of the last one (a tester's pull moves)
  const head2 = commit(f.repo, "sol/mac/src/App.tsx", "export const b = 3;\n");
  r = await mirror(deps(f.sol), head2, "dev-20261031");
  const main2 = git(beta, "rev-parse", "refs/heads/main");
  assert.equal(git(beta, "rev-parse", `${main2}^`), main1, "chained on the previous export");
  assert.equal(git(beta, "cat-file", "-p", `${main2}:sol/mac/src/App.tsx`), "export const b = 3;");

  // the beta repo refusing is a word, never an undo
  git(f.repo, "remote", "set-url", "beta", join(f.top, "gone.git"));
  r = await mirror(deps(f.sol), head2, "dev-20261101");
  assert.match(String(r.beta), /^the beta repo did not take it: /);
});

test("every Sol learns: a release on its own channel is offered while HEAD is behind it; the other channel's word, and the live Sol, never", async () => {
  const f = fixture();
  const frank = join(f.top, "frank");
  git(f.top, "clone", "-q", f.origin, frank);
  const fd = deps(join(frank, "sol"), "dev");
  const old = git(frank, "rev-parse", "HEAD");
  commit(f.repo, "sol/mac/src/App.tsx", "export const b = 20;\n");
  const s = released(f.repo, "dev-20261030");
  const word = { sha: s.sha, tag: s.tag, by: "", channel: "dev" };

  assert.deepEqual(await heardStable(fd, word), { type: "team.stable", sha: s.sha, tag: s.tag, by: "", mine: "", behind: true, channel: "dev" }, "frank never fetched dev: nothing is his yet");
  assert.equal(await heardStable(fd, { ...word, channel: undefined }), null, "a beta word is not a dev Sol's");
  assert.equal(await heardStable(deps(join(frank, "sol"), "beta"), word), null, "a dev word is not a beta Sol's");
  assert.equal((await heardStable(deps(join(frank, "sol"), "beta"), { sha: s.sha, tag: s.tag }))?.channel, "beta");
  git(frank, "branch", "dev", old);
  assert.equal((await heardStable(fd, word))?.mine, old);
  assert.equal(await heardStable(fd, { ...word, sha: old }), null, "his own dev: nothing to say");
  assert.equal(await heardStable(fd, { sha: "nope", channel: "dev" }), null);
  // a checkout already holding it, its own dev on an older release, is told, not offered
  git(f.repo, "branch", "-f", "dev", old);
  assert.equal((await heardStable(deps(f.sol, "dev"), word))?.behind, false);
  // the live Sol moves by the release runner only
  git(frank, "checkout", "-q", "-b", "live");
  assert.equal(await heardStable(fd, word), null);
});

test("update on yes: ff-only to the channel's branch, on main or that branch; refuses a dirty tree, another branch, a main that went its own way", async () => {
  const f = fixture();
  const frank = join(f.top, "frank");
  git(f.top, "clone", "-q", f.origin, frank);
  const fd = deps(join(frank, "sol"), "dev");
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 30;\n");
  const s = released(f.repo, "dev-20261030");

  writeFileSync(join(frank, "sol", "mac", "src", "App.tsx"), "his edit\n");
  assert.deepEqual(await update(fd), { error: "you have changes; commit or stash first", why: "changes" });
  git(frank, "checkout", "-q", "--", ".");
  git(frank, "checkout", "-q", "-b", "frank/plan");
  assert.deepEqual(await update(fd), { error: "you are on frank/plan; switch to main first" });
  git(frank, "checkout", "-q", "main");

  const r = await update(fd) as any;
  assert.equal(r.ok, true, r.error);
  assert.equal(r.sha, s.sha);
  assert.equal(r.renews, true, "the engine's code changed: Sol renews");
  assert.equal(git(frank, "rev-parse", "HEAD"), s.sha, "main moved forward to dev");
  assert.equal(git(frank, "rev-parse", "dev"), s.sha, "his dev is the team's now");
  assert.equal(await heardStable(fd, { sha: s.sha, tag: s.tag, channel: "dev" }), null, "nothing left to offer");

  // a beta Sol takes stable, never dev: the beta pass moved stable to an older whole release
  const tester = join(f.top, "tester");
  git(f.top, "clone", "-q", f.origin, tester);
  git(tester, "reset", "-q", "--hard", "HEAD~1");
  git(f.repo, "push", "-q", "origin", `+${s.sha}:refs/heads/stable`);
  const t = await update(deps(join(tester, "sol"), "beta")) as any;
  assert.equal(t.ok, true, t.error);
  assert.equal(git(tester, "rev-parse", "stable"), s.sha);

  commit(frank, "sol/mac/src/App.tsx", "his own commit\n", false);
  commit(f.repo, "sol/mac/src/App.tsx", "export const b = 31;\n");
  released(f.repo, "dev-20261031");
  const diverged = await update(fd) as any;
  assert.match(String(diverged.error), /^main has commits dev does not, so it cannot move forward to it/);
});

test("an update whose release changed a lock file runs npm ci there (#1150); one that fails moves back, installs again, says build", async () => {
  const f = fixture();
  const frank = join(f.top, "frank");
  git(f.top, "clone", "-q", f.origin, frank);
  const sol = join(frank, "sol");
  const ran: string[] = [];
  const ok = deps(sol, "dev", { ci: async (dir) => { ran.push(dir); } });
  commit(f.repo, "sol/mac/package-lock.json", "{\"v\":2}\n");
  released(f.repo, "dev-20261114-0100");
  const r = await update(ok) as any;
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(ran, [join(sol, "mac")], "the face's lock changed: npm ci in sol/mac only (paths from sol/, not the repo's top)");

  const was = git(frank, "rev-parse", "HEAD");
  commit(f.repo, "sol/engine/package-lock.json", "{\"v\":3}\n");
  released(f.repo, "dev-20261114-0200");
  ran.length = 0;
  let fails = true;
  const bad = deps(sol, "dev", { ci: async (dir) => { ran.push(dir); if (fails) { fails = false; throw new Error("ERESOLVE"); } } });
  const b = await update(bad) as any;
  assert.equal(b.why, "build", b.error);
  assert.equal(git(frank, "rev-parse", "HEAD"), was, "moved back where it was");
  assert.deepEqual(ran, [join(sol, "engine"), join(sol, "engine")], "the failed folder installed again, on the old lock");
});

test("an install a move missed is made at the next move (#1187): node_modules older than its lock, the lock unchanged", async () => {
  const f = fixture();
  const frank = join(f.top, "frank");
  commit(f.repo, "sol/mac/package-lock.json", "{\"three\":1}\n");
  released(f.repo, "dev-20261114-0243");
  git(f.top, "clone", "-q", f.origin, frank);
  const sol = join(frank, "sol");
  // the 02:43 move, on an engine from before #1150: the lock changed, node_modules stayed as it was on Oct 21
  mkdirSync(join(sol, "mac", "node_modules"), { recursive: true });
  writeFileSync(join(sol, "mac", "node_modules", ".package-lock.json"), "{}\n");
  const old = new Date("2026-10-21T04:02:48Z");
  utimesSync(join(sol, "mac", "node_modules", ".package-lock.json"), old, old);
  const ran: string[] = [];
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 41;\n");   // the 12:59 move: no lock in it
  released(f.repo, "dev-20261114-1259");
  const r = await update(deps(sol, "dev", { ci: async (dir) => { ran.push(dir); } })) as any;
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(ran, [join(sol, "mac")], "mac installs though this move left its lock alone");
});

test("the folders an earlier move left behind (#1187): node_modules older than the lock, or without npm's own copy of it", () => {
  const sol = mkdtempSync(join(tmpdir(), "sol-stale-"));
  const at = (f: string, body: string, when: Date) => { mkdirSync(join(sol, f, ".."), { recursive: true }); writeFileSync(join(sol, f), body); utimesSync(join(sol, f), when, when); };
  const oct = new Date("2026-10-21T00:00:00Z"), nov = new Date("2026-11-14T07:43:00Z");
  assert.deepEqual(staleFolders(sol), [], "no lock, no node_modules: nothing");
  at("mac/package-lock.json", "{}", nov);
  assert.deepEqual(staleFolders(sol), [], "a lock with no node_modules at all is not this Sol's to install");
  at("mac/node_modules/.package-lock.json", "{}", oct);
  assert.deepEqual(staleFolders(sol), ["mac"], "installed before the lock moved");
  at("mac/node_modules/.package-lock.json", "{}", nov);
  assert.deepEqual(staleFolders(sol), [], "installed since");
  at("engine/package-lock.json", "{}", nov);
  mkdirSync(join(sol, "engine", "node_modules"), { recursive: true });
  assert.deepEqual(staleFolders(sol), ["engine"], "node_modules without npm's copy of the lock");
});

test("update on MY SOL (#116): a */mine branch runs sol/mine/rebase, his commits go onto the new release; a conflict changes nothing", async () => {
  const f = fixture();
  const mine = join(f.top, "my-sol");
  git(f.top, "clone", "-q", f.origin, mine);
  git(mine, "checkout", "-q", "-b", "marco/mine");
  mkdirSync(join(mine, "sol", "mine"), { recursive: true });
  copyFileSync(join(import.meta.dirname, "..", "..", "mine", "rebase"), join(mine, "sol", "mine", "rebase"));
  chmodSync(join(mine, "sol", "mine", "rebase"), 0o755);
  commit(mine, "sol/mac/src/Mine.tsx", "mine: his own look\n", false);
  const md = deps(join(mine, "sol"), "beta");
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 40;\n");
  const s = released(f.repo, "dev-20261030", "stable");

  const r = await update(md) as any;
  assert.equal(r.ok, true, r.error);
  assert.equal(r.sha, s.sha);
  assert.equal(r.renews, true);
  assert.equal(git(mine, "rev-parse", "HEAD~1"), s.sha, "his one commit sits on the new release");
  assert.equal(git(mine, "log", "-1", "--format=%s"), "change sol/mac/src/Mine.tsx");

  commit(mine, "sol/engine/src/index.ts", "export const a = 41;\n", false);   // his, on the line the next release changes
  const was = git(mine, "rev-parse", "HEAD");
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 50;\n");
  released(f.repo, "dev-20261031", "stable");
  const c = await update(md) as any;
  assert.match(String(c.error), /sol\/engine\/src\/index\.ts, lines/);
  assert.equal(git(mine, "rev-parse", "HEAD"), was, "nothing changed");
});

test("update on a dev */mine Sol: sol/mine/rebase goes onto dev, never stable", async () => {
  const f = fixture();
  commit(f.repo, "sol/mac/src/App.tsx", "export const b = 70;\n");
  const old = released(f.repo, "dev-20261029", "stable");   // the beta release, a day behind
  const mine = join(f.top, "my-sol-dev");
  git(f.top, "clone", "-q", f.origin, mine);
  git(mine, "checkout", "-q", "-b", "marco/mine");
  mkdirSync(join(mine, "sol", "mine"), { recursive: true });
  copyFileSync(join(import.meta.dirname, "..", "..", "mine", "rebase"), join(mine, "sol", "mine", "rebase"));
  chmodSync(join(mine, "sol", "mine", "rebase"), 0o755);
  commit(mine, "sol/mac/src/Mine.tsx", "mine: his own look\n", false);
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 70;\n");
  const s = released(f.repo, "dev-20261030");
  assert.notEqual(s.sha, old.sha);
  const r = await update(deps(join(mine, "sol"), "dev")) as any;
  assert.equal(r.ok, true, r.error);
  assert.equal(r.sha, s.sha);
  assert.equal(git(mine, "rev-parse", "HEAD~1"), s.sha, "his commit sits on dev, not on the day-old stable");
});

test("a dev release installs itself at a quiet moment, on a */mine Sol too (#1150); the beta Sol is offered its stable", async () => {
  const f = fixture();
  const frank = join(f.top, "frank-dev");
  git(f.top, "clone", "-q", f.origin, frank);
  const told: any[] = [];
  let updated = 0;
  const runs: string[] = [];
  startShip(join(frank, "sol"), (m) => told.push(m), deps(join(frank, "sol"), "dev", { auto: true, quietMs: 30, updated: () => { updated++; }, runs: (why) => { runs.push(why ?? "runs"); } }));
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 60;\n");
  const s = released(f.repo, "dev-20261030");

  const leave = joinBusy("turn", "t1", "a turn");   // something is live: the install waits for it
  await hear({ sha: s.sha, tag: s.tag, by: "", channel: "dev" });
  assert.equal(told.length, 1, "the faces hear of it");
  assert.equal(told[0].behind, true);
  // built aside first (#1566), then it waits for the turn and says so
  for (let i = 0; i < 200 && !runs.includes("busy"); i++) await new Promise((ok) => setTimeout(ok, 25));
  await new Promise((ok) => setTimeout(ok, 120));
  assert.notEqual(git(frank, "rev-parse", "HEAD"), s.sha, "not mid-turn");
  leave();
  for (let i = 0; i < 200 && git(frank, "rev-parse", "HEAD") !== s.sha; i++) await new Promise((ok) => setTimeout(ok, 25));
  for (let i = 0; i < 100 && offerNow()?.behind; i++) await new Promise((ok) => setTimeout(ok, 25));
  assert.equal(git(frank, "rev-parse", "HEAD"), s.sha, "installed by itself once no turn was in flight");
  assert.equal(offerNow()?.behind, false, "and every face hears it is no longer behind");
  assert.equal(updated, 1, "what this Sol runs is said again");
  for (let i = 0; i < 100 && runs.at(-1) !== "runs"; i++) await new Promise((ok) => setTimeout(ok, 25));
  assert.deepEqual(runs, ["busy", "runs"], "the team heard why it waited, then what it runs (#1150)");

  // a */mine Sol (#1150): installed by itself too, its own commit on top
  const mine = join(f.top, "my-sol-dev");
  git(f.top, "clone", "-q", f.origin, mine);
  git(mine, "reset", "-q", "--hard", "HEAD~1");
  git(mine, "checkout", "-q", "-b", "marco/mine");
  mkdirSync(join(mine, "sol", "mine"), { recursive: true });
  copyFileSync(join(import.meta.dirname, "..", "..", "mine", "rebase"), join(mine, "sol", "mine", "rebase"));
  chmodSync(join(mine, "sol", "mine", "rebase"), 0o755);
  commit(mine, "sol/mac/src/Mine.tsx", "mine: his own look\n", false);
  const told2: any[] = [], runs2: string[] = [];
  startShip(join(mine, "sol"), (m) => told2.push(m), deps(join(mine, "sol"), "dev", { auto: true, quietMs: 0, runs: (why) => { runs2.push(why ?? "runs"); } }));
  await hear({ sha: s.sha, tag: s.tag, by: "", channel: "dev" });
  assert.equal(told2[0]?.behind, true, "the faces hear of it");
  for (let i = 0; i < 200 && offerNow()?.behind; i++) await new Promise((ok) => setTimeout(ok, 25));
  assert.equal(git(mine, "rev-parse", "HEAD~1"), s.sha, "his commit sits on the release, with no press");
  assert.equal(git(mine, "branch", "--show-current"), "marco/mine");
  assert.deepEqual(runs2, ["runs"]);

  // a beta Sol hears a dev word and says nothing; its stable is offered, never installed
  const tester = join(f.top, "tester");
  git(f.top, "clone", "-q", f.origin, tester);
  git(tester, "reset", "-q", "--hard", "HEAD~1");
  const told3: any[] = [];
  startShip(join(tester, "sol"), (m) => told3.push(m), deps(join(tester, "sol"), "beta", { auto: true, quietMs: 0 }));
  await hear({ sha: s.sha, tag: s.tag, by: "", channel: "dev" });
  assert.equal(told3.length, 0);
  await hear({ sha: s.sha, tag: s.tag, by: "" });
  assert.equal(told3[0]?.channel, "beta");
  await new Promise((ok) => setTimeout(ok, 60));
  assert.notEqual(git(tester, "rev-parse", "HEAD"), s.sha, "a beta Sol waits for Update");
});

test("a */mine Sol that cannot install by itself (#1150): a clash goes to the carry with no press, changes not kept wait, and each says why", async () => {
  const f = fixture();
  const mine = join(f.top, "my-sol-clash");
  git(f.top, "clone", "-q", f.origin, mine);
  git(mine, "checkout", "-q", "-b", "marco/mine");
  mkdirSync(join(mine, "sol", "mine"), { recursive: true });
  copyFileSync(join(import.meta.dirname, "..", "..", "mine", "rebase"), join(mine, "sol", "mine", "rebase"));
  chmodSync(join(mine, "sol", "mine", "rebase"), 0o755);
  commit(mine, "sol/engine/src/index.ts", "export const a = 41;\n", false);   // his, on the line the release changes
  const was = git(mine, "rev-parse", "HEAD");
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 50;\n");
  const s = released(f.repo, "dev-20261030");

  const carried: { release: string; tag: string; follow: string; auto?: boolean }[] = [], runs: string[] = [];
  const carry = async (release: string, tag: string, follow: string, auto?: boolean) => {
    carried.push({ release, tag, follow, auto });
    return { kind: "update", stage: "session", onto: release, from: was, source: was, changes: [], said: "1 of your own changes clashes with today's release; a session is carrying it over", at: 0 } as any;
  };
  startShip(join(mine, "sol"), () => {}, deps(join(mine, "sol"), "dev", { auto: true, quietMs: 0, carry, runs: (why) => { runs.push(why ?? "runs"); } }));
  await hear({ sha: s.sha, tag: s.tag, by: "", channel: "dev" });
  for (let i = 0; i < 200 && !runs.length; i++) await new Promise((ok) => setTimeout(ok, 25));
  assert.deepEqual(carried, [{ release: s.sha, tag: s.tag, follow: "dev", auto: true }], "the carry took it over, told it came by itself: no Use it");
  assert.deepEqual(runs, ["clash"]);
  assert.equal(git(mine, "rev-parse", "HEAD"), was, "the Sol stays where it was");

  // changes not kept: nothing moves, and the reason is said
  writeFileSync(join(mine, "sol", "mac", "src", "App.tsx"), "export const b = 2;\n");
  runs.length = 0;
  startShip(join(mine, "sol"), () => {}, deps(join(mine, "sol"), "dev", { auto: true, quietMs: 0, carry, runs: (why) => { runs.push(why ?? "runs"); } }));
  assert.equal(await installDev(s.sha), false, "no offer standing yet: nothing to install");
  await hear({ sha: s.sha, tag: s.tag, by: "", channel: "dev" });
  for (let i = 0; i < 200 && !runs.length; i++) await new Promise((ok) => setTimeout(ok, 25));
  assert.deepEqual(runs, ["changes"]);
  assert.equal(carried.length, 1, "no carry for a Sol with changes not kept");
  assert.equal(git(mine, "rev-parse", "HEAD"), was);
});

test("a rollback (#638, #639): a dev Sol already on the bad release hears dev went back and installs the older one at a quiet moment", async () => {
  const f = fixture();
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 70;\n");
  const good = released(f.repo, "dev-20261030");
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 71;\n");
  const bad = released(f.repo, "dev-20261031");
  // frank's dev Sol took the bad release, as installDev leaves it: main at it, his dev the same
  const frank = join(f.top, "frank-back");
  git(f.top, "clone", "-q", f.origin, frank);
  git(frank, "branch", "-f", "dev", bad.sha);
  assert.equal(git(frank, "rev-parse", "HEAD"), bad.sha);
  // a checkout with work of its own on top of the bad release is never moved back
  const own = join(f.top, "own-work");
  git(f.top, "clone", "-q", f.origin, own);
  git(own, "branch", "-f", "dev", bad.sha);
  commit(own, "sol/mac/src/App.tsx", "export const b = 9;\n", false);

  // a Sol that never made a dev of its own: it took the bad release by hand, its origin/dev the bad one
  const plain = join(f.top, "no-dev");
  git(f.top, "clone", "-q", f.origin, plain);
  assert.equal(git(plain, "rev-parse", "refs/remotes/origin/dev"), bad.sha);

  // sol/release --back: dev on GitHub goes back to the good release, and the relay says so
  git(f.repo, "push", "-q", "origin", `+${good.sha}:refs/heads/dev`);
  const word = { sha: good.sha, tag: good.tag, by: "marcocyl04-ux", channel: "dev" };
  const ownWord = await heardStable(deps(join(own, "sol"), "dev"), word);
  assert.equal(ownWord?.behind, false, "its own work on top: told, never moved back");
  assert.equal(ownWord?.back, undefined);
  assert.equal(await heardStable(deps(join(frank, "sol"), "beta"), word), null, "a beta Sol: a dev word is not its own");
  assert.equal((await heardStable(deps(join(frank, "sol"), "beta"), { ...word, channel: undefined }))?.back, undefined, "stable never goes back by itself");

  const told: any[] = [];
  let updated = 0;
  startShip(join(frank, "sol"), (m) => told.push(m), deps(join(frank, "sol"), "dev", { auto: true, quietMs: 30, updated: () => { updated++; } }));
  const leave = joinBusy("turn", "t-back", "a turn");   // something is live: it waits, as a new release does
  await hear(word);
  assert.deepEqual(told[0], { type: "team.stable", sha: good.sha, tag: good.tag, by: "marcocyl04-ux", mine: bad.sha, behind: true, channel: "dev", back: true });
  await new Promise((ok) => setTimeout(ok, 120));
  assert.equal(git(frank, "rev-parse", "HEAD"), bad.sha, "not mid-turn");
  leave();
  for (let i = 0; i < 200 && git(frank, "rev-parse", "HEAD") !== good.sha; i++) await new Promise((ok) => setTimeout(ok, 25));
  for (let i = 0; i < 100 && offerNow()?.behind; i++) await new Promise((ok) => setTimeout(ok, 25));
  assert.equal(git(frank, "rev-parse", "HEAD"), good.sha, "the older release installed by itself, quietly");
  assert.equal(git(frank, "rev-parse", "refs/heads/dev"), good.sha, "his dev is the team's again");
  assert.equal(git(frank, "status", "--porcelain"), "", "a clean tree");
  assert.deepEqual(offerNow(), { type: "team.stable", sha: good.sha, tag: good.tag, by: "marcocyl04-ux", mine: good.sha, behind: false, channel: "dev" }, "every face hears it is done");
  assert.equal(updated, 1);
  await hear(word);
  assert.equal(git(frank, "rev-parse", "HEAD"), good.sha, "the same word again: nothing more");

  startShip(join(plain, "sol"), () => {}, deps(join(plain, "sol"), "dev"));
  await hear(word);
  assert.equal(offerNow()?.back, true, "its origin/dev is the bad release: a rollback for it too");
  assert.deepEqual(await update(deps(join(plain, "sol"), "dev"), "dev"), { ok: true, sha: good.sha, renews: true });
  assert.equal(git(plain, "rev-parse", "HEAD"), good.sha, "Update takes it back too");
});

test("the wire: team.update answers by rid; a heard release reaches every face and team.stable.get; the stamp is gone", async () => {
  const f = fixture();
  const frank = join(f.top, "frank");
  git(f.top, "clone", "-q", f.origin, frank);
  const told: any[] = [];
  startShip(join(frank, "sol"), (m) => told.push(m), deps(join(frank, "sol"), "dev"));
  const got: any[] = [];
  const face = { send: (m: object) => got.push(m) };
  addTeamFace(face);
  await handleTeam(face, { type: "team.stable.get", rid: "r0" });
  assert.deepEqual(got.at(-1), { type: "team.stable", rid: "r0", sha: null });

  commit(f.repo, "sol/mac/src/App.tsx", "export const b = 40;\n");
  const s = released(f.repo, "dev-20261030");
  await hear({ sha: s.sha, tag: s.tag, by: "", channel: "dev" });
  assert.equal(told.length, 1);
  assert.deepEqual({ ...told[0], mine: undefined }, { type: "team.stable", sha: s.sha, tag: s.tag, by: "", mine: undefined, behind: true, channel: "dev" });
  await handleTeam(face, { type: "team.stable.get" });
  assert.equal(got.at(-1).sha, s.sha, "a face that connects later asks and is told");

  await handleTeam(face, { type: "team.update", rid: "r1" });
  assert.deepEqual({ ...got.at(-1), renews: undefined }, { type: "team.update", rid: "r1", ok: true, sha: s.sha, renews: undefined });
  assert.equal(told.at(-1).behind, false, "every face hears the offer is answered");

  const n = got.length;
  await handleTeam(face, { type: "team.stamp", rid: "r2" });
  await handleTeam(face, { type: "team.stables", rid: "r3" });
  assert.equal(got.length, n, "nobody stamps any more: the release runner makes dev, the beta pass moves stable");
});

test("#353: a release whose relay word this Sol missed is found by the hourly ask of GitHub; the same offer again says nothing new", async () => {
  const f = fixture();
  const frank = join(f.top, "frank-353");
  git(f.top, "clone", "-q", f.origin, frank);
  const told: any[] = [];
  startShip(join(frank, "sol"), (m) => told.push(m), deps(join(frank, "sol"), "beta"));

  await askOrigin();
  assert.equal(told.length, 0, "no stable on GitHub yet: nothing to offer");

  commit(f.repo, "sol/mac/src/App.tsx", "export const b = 353;\n");
  const s = released(f.repo, "dev-20261030", "stable");   // the beta pass, while Frank's engine is off the relay

  await askOrigin();
  assert.equal(told.length, 1, "the ask of GitHub found it");
  assert.deepEqual(told[0], { type: "team.stable", sha: s.sha, tag: s.tag, by: "", mine: "", behind: true, channel: "beta" });

  await askOrigin();
  assert.equal(told.length, 1, "the next hour's ask finds the same offer: the faces are not told again");

  await hear({ sha: s.sha, tag: s.tag, by: "franktsai2008-eng" });
  assert.equal(told.length, 2, "the relay word, late, names who passed it");
  await askOrigin();
  assert.equal(told.length, 2, "GitHub's answer names nobody; the name heard stays said");
  assert.equal(offerNow()?.by, "franktsai2008-eng");

  // HEAD comes to hold the sha by hand: the next ask stands the offer answered
  git(frank, "fetch", "-q", "origin", "+refs/heads/stable:refs/remotes/origin/stable");
  git(frank, "merge", "-q", "--ff-only", "refs/remotes/origin/stable");
  await askOrigin();
  assert.equal(told.length, 3);
  assert.equal(told[2].behind, false);
  await askOrigin();
  assert.equal(told.length, 3, "and once is enough");

  // two tags on one sha (a day's release and an urgent fix on the same commit, or an old stamp): the newest dev-* name
  commit(f.repo, "sol/mac/src/App.tsx", "export const b = 354;\n");
  const a = released(f.repo, "stable-20261029-2200", "stable");
  released(f.repo, "dev-20261031", "stable");
  released(f.repo, "dev-20261031-1405", "stable");
  await askOrigin();
  assert.equal(told.at(-1).sha, a.sha);
  assert.equal(told.at(-1).tag, "dev-20261031-1405");
});

// ---- the switch (#1150): Settings › me writes team.json `channel`, read live ----
const { patchTeam } = await import("../src/team/settings.ts");
const { channelCheck, channelState, stableIn } = await import("../src/team/ship.ts");
const { versionMode } = await import("../src/settings.ts");
const soon = async (ok: () => boolean, ms = 5000) => { for (let t = 0; t < ms && !ok(); t += 25) await new Promise((r) => setTimeout(r, 25)); };

test("#1295 stableIn: the sha stable is on and its release tag, from GitHub's answer", () => {
  const a = "a".repeat(40), b = "b".repeat(40);
  const out = [`${a}\trefs/heads/stable`, `${b}\trefs/tags/dev-20261114`, `${a}\trefs/tags/stable-20261030-0900`, `${a}\trefs/tags/dev-20261113^{}`].join("\n");
  assert.deepEqual(stableIn(out), { sha: a, tag: "dev-20261113" }, "of the tags on stable's sha, the dev-* (releaseTag)");
  assert.deepEqual(stableIn(`${b}\trefs/tags/dev-20261114`), { sha: "", tag: "" }, "no stable branch: nothing to name");
  assert.deepEqual(stableIn(""), { sha: "", tag: "" });
});

test("#1150 dev → beta never moves a Sol backwards: beta's older release is neither offered nor installed; it joins beta when beta reaches it", async () => {
  process.env.SOL_TEAM_OFFLINE = "1";
  const f = fixture();
  commit(f.repo, "sol/mac/src/App.tsx", "export const b = 1150;\n");
  const r1 = released(f.repo, "dev-20261113");
  git(f.repo, "push", "-q", "origin", `+${r1.sha}:refs/heads/stable`);   // the beta pass passed yesterday's
  commit(f.repo, "sol/mac/src/App.tsx", "export const b = 1151;\n");
  const r2 = released(f.repo, "dev-20261114");   // today's dev, a day ahead of beta
  const frank = join(f.top, "frank-1150");
  git(f.top, "clone", "-q", f.origin, frank);
  assert.equal(git(frank, "rev-parse", "HEAD"), r2.sha, "on today's dev release");
  git(frank, "branch", "stable", `${r1.sha}~1`);   // its own stable, from a beta day long gone: not beta's sha

  patchTeam({ channel: "dev" });
  const told: any[] = [];
  startShip(join(frank, "sol"), (m) => told.push(m), { auto: true, quietMs: 0 });   // the channel read from team.json, as in the app
  await soon(() => false, 100);
  patchTeam({ channel: "beta" });   // the switch
  await soon(() => false, 400);
  assert.equal(git(frank, "rev-parse", "HEAD"), r2.sha, "it stays on its release");
  assert.equal(offerNow(), null, "nothing offered");
  assert.ok(!told.some((m) => m.sha === r1.sha), "the older beta release is never told to a face");
  const beta: Ship = { root: join(frank, "sol"), channel: async () => "beta", auto: false };
  assert.equal(await heardStable(beta, { sha: r1.sha, tag: r1.tag }), null, "a beta word for a release HEAD holds: no offer");
  const u = await update(beta, "beta");
  assert.equal(u.ok, true);
  assert.equal(git(frank, "rev-parse", "HEAD"), r2.sha, "Update on beta does not move it back either");
  const st = await channelState();
  assert.deepEqual({ channel: st?.channel, release: st?.release, stays: st?.stays }, { channel: "beta", release: "", stays: true }, "the switch's line: you stay on it until beta reaches it");
  assert.equal(st?.stable, "dev-20261113", "the window's switch names the release beta's people run (#1295)");
  assert.equal(st?.mode, "product", "a beta Sol nobody picked a version for runs as product (#1551)");
  assert.equal(st?.team, false, "a fixture's origin is not the team's repo: the window draws no switch");

  // beta reaches it: nothing to do, the line goes; beta's next release is offered as any other
  git(f.repo, "push", "-q", "origin", `+${r2.sha}:refs/heads/stable`);
  assert.equal(await heardStable(beta, { sha: r2.sha, tag: r2.tag }), null);
  assert.equal((await channelState())?.stays, false);
  commit(f.repo, "sol/mac/src/App.tsx", "export const b = 1152;\n");
  const r3 = released(f.repo, "dev-20261115", "stable");
  assert.equal((await heardStable(beta, { sha: r3.sha, tag: r3.tag }))?.behind, true, "a newer beta release is offered");
  patchTeam({ channel: "" });
});

test("#1150 beta → dev asks GitHub at once, so dev installs at the next quiet minute, with no restart", async () => {
  process.env.SOL_TEAM_OFFLINE = "1";
  const f = fixture();
  const old = git(f.repo, "rev-parse", "HEAD");
  git(f.repo, "push", "-q", "origin", `+${old}:refs/heads/stable`);
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 1150;\n");
  const r = released(f.repo, "dev-20261114-0930");
  const isaac = join(f.top, "isaac-1150");
  git(f.top, "clone", "-q", f.origin, isaac);
  git(isaac, "reset", "-q", "--hard", old);   // a beta Sol on yesterday's

  patchTeam({ channel: "beta" });
  const told: any[] = [];
  startShip(join(isaac, "sol"), (m) => told.push(m), { auto: true, quietMs: 0 });
  await soon(() => false, 100);
  assert.equal(await channelCheck(), null, "read once at start: no move yet");
  assert.equal(versionMode(), "product", "Ship told the settings its channel: a beta Sol runs as product (versions.ts)");
  patchTeam({ channel: "dev" });   // the switch: no ask on a clock (SOL_NO_SHIP_CHECK), no restart
  await soon(() => git(isaac, "rev-parse", "HEAD") === r.sha);
  assert.equal(git(isaac, "rev-parse", "HEAD"), r.sha, "dev installed by itself after the switch");
  assert.equal(versionMode(), "concept", "and the version followed the switch to dev");
  assert.ok(told.some((m) => m.sha === r.sha && m.channel === "dev"), "the faces heard the dev release");
  patchTeam({ channel: "" });
});

test("the lock files a release changed (#1150): npm ci runs in those folders only, engine then mac, each once", () => {
  assert.deepEqual(lockedFolders([]), [], "no lock changed: nothing to install");
  assert.deepEqual(lockedFolders([""]), [], "git's empty answer");
  assert.deepEqual(lockedFolders(["mac/package-lock.json"]), ["mac"]);
  assert.deepEqual(lockedFolders(["mac/package-lock.json", "engine/package-lock.json", "mac/package-lock.json"]), ["engine", "mac"], "both, in order, once");
  assert.deepEqual(lockedFolders(["engine/package.json", "engine/src/x.ts", "mac/src/package-lock.json"]), [], "only the two lock files count");
});

// #1566: the release is fetched and built aside at once, and the quiet moment carries only the swap: the checkout moves,
// the node_modules installed aside is moved in, the engine built aside is copied over dist/. A background agent never
// holds it, a turn in flight always does. At most one install every everyMs, the newest; pause updates holds the swap.
function asideFixture() {
  const f = fixture();
  writeFileSync(join(f.repo, ".gitignore"), "sol/engine/dist.good/\nnode_modules/\nsol/engine/dist/\n");
  writeFileSync(join(f.repo, "sol", "engine", "tsconfig.json"), "{}\n");
  commit(f.repo, "sol/engine/package-lock.json", "{\"lock\":1}\n");
  const me = join(f.top, "aside");
  git(f.top, "clone", "-q", f.origin, me);
  mkdirSync(join(me, "sol", "engine", "node_modules"), { recursive: true });
  writeFileSync(join(me, "sol", "engine", "node_modules", "marker"), "installed at start\n");
  writeFileSync(join(me, "sol", "engine", "node_modules", ".package-lock.json"), "{}\n");
  mkdirSync(join(me, "sol", "engine", "dist"), { recursive: true });
  writeFileSync(join(me, "sol", "engine", "dist", "index.js"), "the running build\n");
  return { ...f, me, sol: join(me, "sol") };
}

test("#1566: built aside at the word; a background agent does not hold the swap, a turn does; node_modules and dist go in", async () => {
  const f = asideFixture();
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 80;\n");
  commit(f.repo, "sol/engine/package-lock.json", "{\"lock\":2}\n");
  const s = released(f.repo, "dev-20261119-1000");
  const ci: string[] = [], built: string[] = [], runs: string[] = [];
  startShip(f.sol, () => {}, deps(f.sol, "dev", {
    auto: true, quietMs: 30, pollMs: 10, runs: (why) => { runs.push(why ?? "runs"); },
    ci: async (dir) => { ci.push(dir); mkdirSync(join(dir, "node_modules"), { recursive: true }); writeFileSync(join(dir, "node_modules", "marker"), "installed aside\n"); },
    build: async (dir) => { built.push(dir); mkdirSync(join(dir, "dist"), { recursive: true }); writeFileSync(join(dir, "dist", "index.js"), "built aside\n"); },
  }));
  const agents = joinBusy("work", "run-bg", "agents", f.sol, true);   // a resting session's 2 h background Bash
  const turn = joinBusy("work", "run-t", "auto");                       // another session mid-turn
  await hear({ sha: s.sha, tag: s.tag, by: "", channel: "dev" });
  await soon(() => runs.includes("busy"));
  const next = join(f.me, ".git", "sol-next", "engine");
  assert.deepEqual(ci, [next], "npm ci ran aside, for the lock that changed");
  assert.deepEqual(built, [next], "and tsc, for the engine that changed");
  assert.notEqual(git(f.me, "rev-parse", "HEAD"), s.sha, "not mid-turn");
  assert.equal(readFileSync(join(f.sol, "engine", "node_modules", "marker"), "utf8"), "installed at start\n", "the live folder untouched while it waits");
  turn();
  await soon(() => offerNow()?.behind === false);
  assert.equal(git(f.me, "rev-parse", "HEAD"), s.sha, "swapped in between turns, the background agent still at work");
  assert.equal(ci.length, 1, "nothing installed in place: the aside one moved in");
  assert.equal(readFileSync(join(f.sol, "engine", "node_modules", "marker"), "utf8"), "installed aside\n");
  assert.equal(readFileSync(join(f.sol, "engine", "dist", "index.js"), "utf8"), "built aside\n", "renew finds the new build in dist/");
  assert.equal(existsSync(join(f.me, ".git", "sol-next")), false, "the aside folder is gone");
  assert.equal(existsSync(join(f.sol, "engine", "node_modules.was")), false, "the old node_modules went out of the checkout, never beside it");
  assert.ok(Number(readFileSync(join(f.me, ".git", "sol-next.at"), "utf8")) > 0, "when it installed, kept for the spacing");
  assert.equal(git(f.me, "status", "--porcelain"), "", "a clean tree");
  assert.deepEqual(runs, ["busy", "runs"]);
  agents();
});

test("#1566: one install every everyMs, the newest; pause updates holds the swap and says paused; a failed build installs nothing", async () => {
  const f = asideFixture();
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 81;\n");
  const one = released(f.repo, "dev-20261119-1100");
  let paused = false;
  const runs: string[] = [];
  let fail = "";
  startShip(f.sol, () => {}, deps(f.sol, "dev", {
    auto: true, quietMs: 0, pollMs: 10, everyMs: 600, runs: (why) => { runs.push(why ?? "runs"); }, paused: () => paused,
    build: async (dir) => { if (fail) throw new Error(fail); mkdirSync(join(dir, "dist"), { recursive: true }); writeFileSync(join(dir, "dist", "index.js"), "built aside\n"); },
  }));
  await hear({ sha: one.sha, tag: one.tag, by: "", channel: "dev" });
  await soon(() => offerNow()?.behind === false);
  assert.equal(git(f.me, "rev-parse", "HEAD"), one.sha, "the first installs at once");
  const at = Date.now();
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 82;\n");
  const two = released(f.repo, "dev-20261119-1110");
  await hear({ sha: two.sha, tag: two.tag, by: "", channel: "dev" });
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 83;\n");
  const three = released(f.repo, "dev-20261119-1120");
  await hear({ sha: three.sha, tag: three.tag, by: "", channel: "dev" });   // newer, while the first waits its turn
  paused = true;
  await soon(() => runs.includes("paused"), 3000);
  assert.ok(Date.now() - at >= 400, "it waited out the spacing before pause could matter");
  assert.equal(git(f.me, "rev-parse", "HEAD"), one.sha, "paused: built, not swapped");
  paused = false;
  await soon(() => git(f.me, "rev-parse", "HEAD") === three.sha && runs.at(-1) === "runs");
  assert.equal(git(f.me, "rev-parse", "HEAD"), three.sha, "the newest, never the one in between");
  assert.ok(!git(f.me, "reflog", "--format=%H").split("\n").includes(two.sha), "two was never installed");
  assert.deepEqual(runs, ["runs", "paused", "runs"]);

  // a release whose engine does not build aside: nothing moves, the Sol says build
  fail = "src/index.ts(1,1): error TS2322: nope";
  runs.length = 0;
  startShip(f.sol, () => {}, deps(f.sol, "dev", {
    auto: true, quietMs: 0, pollMs: 10, everyMs: 0, runs: (why) => { runs.push(why ?? "runs"); },
    build: async () => { throw new Error(fail); },
  }));
  commit(f.repo, "sol/engine/src/index.ts", "export const a = ;\n");
  const bad = released(f.repo, "dev-20261119-1130");
  await hear({ sha: bad.sha, tag: bad.tag, by: "", channel: "dev" });
  await soon(() => runs.length > 0);
  assert.deepEqual(runs, ["build"]);
  assert.equal(git(f.me, "rev-parse", "HEAD"), three.sha, "the Sol stays where it was");
  assert.equal(readFileSync(join(f.sol, "engine", "dist", "index.js"), "utf8"), "built aside\n");
});

test("#1566: a word whose sha is not GitHub's dev (old, or never released) builds and installs nothing, and says nothing", async () => {
  const f = asideFixture();
  released(f.repo, "dev-20261119-1150");   // GitHub's dev, which this Sol already runs
  git(f.me, "pull", "-q");
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 90;\n", false);
  const stray = git(f.repo, "rev-parse", "HEAD");
  git(f.repo, "push", "-q", "origin", `${stray}:refs/heads/someone-else`);   // on GitHub, but not dev
  git(f.me, "fetch", "-q", "origin", "+refs/heads/someone-else:refs/remotes/origin/someone-else");
  const runs: string[] = [], built: string[] = [];
  startShip(f.sol, () => {}, deps(f.sol, "dev", { auto: true, quietMs: 0, pollMs: 10, runs: (why) => { runs.push(why ?? "runs"); }, build: async (dir) => { built.push(dir); } }));
  const was = git(f.me, "rev-parse", "HEAD");
  await hear({ sha: stray, tag: "dev-20261119-1200", by: "", channel: "dev" });
  await soon(() => false, 400);
  assert.equal(git(f.me, "rev-parse", "HEAD"), was, "nothing moved");
  assert.deepEqual(built, [], "nothing built");
  assert.deepEqual(runs, [], "and no false reason said");
});
