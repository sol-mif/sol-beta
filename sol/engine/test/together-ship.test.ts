// Ship (#33, then #418): every Sol hears a new release on its channel and takes it, and the beta repo's export. A
// release is made here the way the release runner makes one (release.ts, its own tests in release.test.ts): a tag on
// main and the channel's branch moved to it on origin. Every case runs real git in a temp repo whose origin is a bare
// temp repo (like test/back.test.ts), so nothing here reaches the network or builds anything.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// hermetic git: no global config (a signing rule or a hook there must not run here), a fixed name
Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  SOL_NO_SHIP_CHECK: "1", SOL_TEAM_FILE: join(mkdtempSync(join(tmpdir(), "sol-team-")), "team.json"),
});
const { update, heardStable, hear, startShip, offerNow, askOrigin, mirror, channelOf, channelIn, installDev } = await import("../src/team/ship.ts");
const { handleTeam, addTeamFace } = await import("../src/team/wire.ts");
const { join: joinBusy } = await import("../src/busy.ts");
const { cardOf, keyAction } = await import("../../mac/src/notch/answer.ts");
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

test("the beta repo (#79): an export of what runs, on the previous export, never the house; no remote, no word", async () => {
  const f = fixture();
  // the house: things a tester must never see
  writeFileSync(join(f.repo, "now.md"), "where we are\n");
  mkdirSync(join(f.repo, "docs"), { recursive: true }); writeFileSync(join(f.repo, "docs", "PLAN.md"), "the plan\n");
  mkdirSync(join(f.repo, "sol", "design", "x"), { recursive: true });
  writeFileSync(join(f.repo, "sol", "design", "tempo.json"), "{}\n"); writeFileSync(join(f.repo, "sol", "design", "x", "PRD.md"), "a memo\n");
  writeFileSync(join(f.repo, "sol", "setup"), "#!/bin/bash\n");
  const first = commit(f.repo, "sol/HELP.md", "help\n");
  assert.deepEqual(await mirror(deps(f.sol), first, "dev-20261029"), {}, "no beta remote: nothing happens, nothing said");

  const beta = join(f.top, "beta.git");
  git(f.top, "init", "-q", "--bare", "-b", "main", beta);
  git(f.repo, "remote", "add", "beta", beta);
  git(f.repo, "push", "-q", "beta", "HEAD:refs/heads/main");   // the first day's full mirror sits there
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
  assert.deepEqual(await update(fd), { error: "you have changes; commit or stash first" });
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

test("a dev release installs itself at a quiet moment; a */mine Sol is offered it instead; the beta Sol is offered its stable", async () => {
  const f = fixture();
  const frank = join(f.top, "frank-dev");
  git(f.top, "clone", "-q", f.origin, frank);
  const told: any[] = [];
  let updated = 0;
  startShip(join(frank, "sol"), (m) => told.push(m), deps(join(frank, "sol"), "dev", { auto: true, quietMs: 30, updated: () => { updated++; } }));
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 60;\n");
  const s = released(f.repo, "dev-20261030");

  const leave = joinBusy("turn", "t1", "a turn");   // something is live: the install waits for it
  await hear({ sha: s.sha, tag: s.tag, by: "", channel: "dev" });
  assert.equal(told.length, 1, "the faces hear of it");
  assert.equal(told[0].behind, true);
  await new Promise((ok) => setTimeout(ok, 120));
  assert.notEqual(git(frank, "rev-parse", "HEAD"), s.sha, "not mid-turn");
  leave();
  for (let i = 0; i < 200 && git(frank, "rev-parse", "HEAD") !== s.sha; i++) await new Promise((ok) => setTimeout(ok, 25));
  for (let i = 0; i < 100 && offerNow()?.behind; i++) await new Promise((ok) => setTimeout(ok, 25));
  assert.equal(git(frank, "rev-parse", "HEAD"), s.sha, "installed by itself once nothing was live");
  assert.equal(offerNow()?.behind, false, "and every face hears it is no longer behind");
  assert.equal(updated, 1, "what this Sol runs is said again");

  // a */mine Sol: offered, not installed (#425 carries the own layer)
  const mine = join(f.top, "my-sol-dev");
  git(f.top, "clone", "-q", f.origin, mine);
  git(mine, "reset", "-q", "--hard", "HEAD~1");
  git(mine, "checkout", "-q", "-b", "marco/mine");
  const told2: any[] = [];
  startShip(join(mine, "sol"), (m) => told2.push(m), deps(join(mine, "sol"), "dev", { auto: true, quietMs: 0 }));
  await hear({ sha: s.sha, tag: s.tag, by: "", channel: "dev" });
  assert.equal(await installDev(s.sha), false);
  assert.equal(told2[0]?.behind, true, "offered");
  assert.notEqual(git(mine, "rev-parse", "HEAD"), s.sha, "never moved by itself");

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

test("the notch's release card: Update and Later, the channel's word, Return does nothing, Escape closes; it waits behind an ask and a turn", () => {
  const base = { crew: false, ping: null, unplugged: false, starting: false, ask: null, call: false, turn: null };
  const stable = { sha: "a".repeat(40), tag: "dev-20261030", by: "" };
  const card = cardOf({ ...base, stable });
  assert.equal(card.kind, "stable");
  assert.deepEqual(card.buttons, ["update", "later"]);
  assert.equal(card.line, "a new stable is out (dev-20261030)");
  assert.equal(cardOf({ ...base, stable: { ...stable, channel: "dev" } }).line, "a new dev release is out (dev-20261030)");
  assert.equal(keyAction(card, "Return"), null, "Return is never Update");
  assert.equal(keyAction(card, "Enter"), null);
  assert.equal(keyAction(card, "Escape"), "close");
  assert.deepEqual(cardOf({ ...base, stable: { ...stable, failed: true, said: "you are on frank/plan; switch to main first" } }).buttons, ["later"]);
  assert.deepEqual(cardOf({ ...base, stable: { ...stable, said: "updated; Sol renews in a moment" } }).buttons, []);
  const ask = { id: "perm:1", sessionId: "s", seat: "claude", tool: "Edit", title: "Claude wants to edit A.tsx", n: 1, of: 1 };
  assert.equal(cardOf({ ...base, stable, ask }).kind, "ask");
  assert.equal(cardOf({ ...base, stable, turn: { seat: "claude", sessionId: "s", title: "ecosystem", kind: "work" } }).kind, "turn");
  assert.equal(cardOf({ ...base, stable: null }).kind, "plain");
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
