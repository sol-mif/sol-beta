// Carrying your own layer over (#425): Update on a */mine Sol goes on by itself, or a side copy and a session carry the
// person's changes over, or they set them aside or stay. Every case is real git in temp repos: a bare origin, the team's
// checkout that moves `stable`, and a */mine clone with sol/mine/rebase in it. The session is a stand-in that does
// what an agent would in the copy (resolve and go on, or give up); nothing here starts Claude or reaches the network.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  SOL_NO_SHIP_CHECK: "1", SOL_TEAM_FILE: join(mkdtempSync(join(tmpdir(), "sol-team-")), "team.json"),
});
const carry = await import("../src/team/carry.ts");
const { update, heardStable } = await import("../src/team/ship.ts");
type Ship = import("../src/team/ship.ts").Ship;

const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", env: { ...process.env, GIT_EDITOR: "true" } }).trim();
const put = (repo: string, file: string, text: string, msg: string) => {
  mkdirSync(join(repo, file, ".."), { recursive: true });
  writeFileSync(join(repo, file), text);
  git(repo, "add", "-A"); git(repo, "add", "-u", "--renormalize"); git(repo, "commit", "-qm", msg);   // by content, not by time (#990, pin.test.ts)
  return git(repo, "rev-parse", "HEAD");
};
const PEOPLE_WORDS = /\b(commits?|rebas\w*|conflicts?)\b/i;

/** origin, the team (on main; `release()` pushes its main as the new stable), and Marco's Sol on marco/mine */
function fixture() {
  const top = mkdtempSync(join(tmpdir(), "sol-carry-"));
  const origin = join(top, "origin.git");
  git(top, "init", "-q", "--bare", "-b", "main", origin);
  const team = join(top, "team");
  mkdirSync(join(team, "sol", "engine", "src"), { recursive: true });
  git(team, "init", "-q", "-b", "main");
  put(team, "sol/engine/src/index.ts", "export const a = 1;\n", "start");
  put(team, "sol/mac/src/App.tsx", "export const b = 1;\n", "the window");
  git(team, "remote", "add", "origin", origin);
  git(team, "push", "-q", "-u", "origin", "main");
  const release = () => { git(team, "push", "-q", "origin", "HEAD:refs/heads/stable"); return git(team, "rev-parse", "HEAD"); };
  const first = release();
  const mine = join(top, "my-sol");
  git(top, "clone", "-q", origin, mine);
  git(mine, "checkout", "-q", "-b", "marco/mine", "origin/stable");
  mkdirSync(join(mine, "sol", "mine"), { recursive: true });
  copyFileSync(join(import.meta.dirname, "..", "..", "mine", "rebase"), join(mine, "sol", "mine", "rebase"));
  chmodSync(join(mine, "sol", "mine", "rebase"), 0o755);   // untracked here: the status check ignores it
  writeFileSync(join(mine, ".git", "info", "exclude"), "sol/mine/rebase\n");   // and no change of his takes it in
  return { top, origin, team, mine, sol: join(mine, "sol"), release, first };
}

type Agent = (copy: string) => void;
function start(f: ReturnType<typeof fixture>, agent: Agent = () => {}) {
  const told: any[] = [], opened: { cwd: string; title: string; text: string }[] = [], updated: string[] = [];
  let ms = new Date(2026, 9, 30, 9, 5).getTime();
  const clock = { tick: (n: number) => { ms += n; } };
  carry.resetCarry();
  const ready = carry.startCarry({
    root: f.sol,
    open: async (a) => { opened.push(a); agent(a.cwd); return `s${opened.length}`; },
    working: () => false,
    quiet: () => true,
    tell: (m) => told.push(m),
    updated: (r) => { updated.push(r); },
    now: () => new Date(ms),
  });
  const ship: Ship = {
    root: f.sol, channel: async () => "beta", auto: false,   // a tester's Sol, on `stable` (#418)
    carry: (release, tag, follow) => carry.carryOver({ kind: "update", onto: release, source: "HEAD", tag, follow }),
  };
  return { told, opened, updated, clock, ready, ship };
}
const half = (repo: string) => ["rebase-merge", "rebase-apply", "CHERRY_PICK_HEAD"].some((p) => existsSync(join(repo, git(repo, "rev-parse", "--git-path", p))));
const subjects = (repo: string, range: string) => git(repo, "log", "--format=%s", range).split("\n").filter(Boolean);

beforeEach(() => carry.resetCarry());

test("a clean update goes on by itself: no copy, no session, his change on the release", async () => {
  const f = fixture();
  put(f.mine, "sol/mac/src/Mine.tsx", "his own look\n", "mine: his own look");
  put(f.team, "sol/engine/src/index.ts", "export const a = 2;\n", "the engine moves");
  const rel = f.release();
  const x = start(f); await x.ready;
  const r = await update(x.ship) as any;
  assert.equal(r.ok, true, r.error);
  assert.equal(git(f.mine, "rev-parse", "HEAD~1"), rel);
  assert.equal(x.opened.length, 0);
  assert.equal(carry.carryNow(), null);
});

test("a clash a session resolves: shown in plain words, carried in a side copy, the Sol moves only on Use it", async () => {
  const f = fixture();
  put(f.mine, "sol/engine/src/index.ts", "export const a = 41;\n", "mine: the engine answers 41");
  put(f.mine, "sol/mac/src/Mine.tsx", "his own look\n", "mine: his own look");
  put(f.team, "sol/engine/src/index.ts", "export const a = 50;\n", "the engine counts to 50");
  const rel = f.release();
  const was = git(f.mine, "rev-parse", "HEAD");
  const x = start(f, (copy) => {   // the session: keeps both meanings, goes on
    writeFileSync(join(copy, "sol/engine/src/index.ts"), "export const a = 50 + 41;\n");
    git(copy, "add", "-A");
    git(copy, "-c", "core.hooksPath=/dev/null", "rebase", "--continue");
  });
  await x.ready;
  const r = await update(x.ship) as any;
  assert.notEqual(r.ok, true);
  assert.equal(r.error, "1 of your own changes clashes with today's release; a session is carrying it over");
  assert.doesNotMatch(r.error, PEOPLE_WORDS);
  assert.equal(r.carry.stage, "session");
  assert.deepEqual(r.carry.changes.map((c: any) => [c.what, c.state]), [["the engine answers 41", "clash"], ["his own look", "clean"]]);
  assert.deepEqual(r.carry.changes[0].files, ["sol/engine/src/index.ts"]);
  assert.deepEqual(r.carry.changes[0].against, ["the engine counts to 50"], "which of the release's changes it clashes with");
  // never half-updated: the live folder is exactly as it was, the work is in a side copy
  assert.equal(git(f.mine, "rev-parse", "HEAD"), was);
  assert.equal(half(f.mine), false);
  assert.equal(x.opened.length, 1);
  assert.notEqual(x.opened[0].cwd, f.mine);
  assert.match(x.opened[0].cwd, /\.claude\/worktrees\/marco-carry-/);
  assert.match(x.opened[0].text, /the engine answers 41: clashes with the release's "the engine counts to 50" in sol\/engine\/src\/index\.ts/);

  const c = await carry.check();
  assert.equal(c?.stage, "ready");
  assert.doesNotMatch(c!.said, PEOPLE_WORDS);
  assert.equal(git(f.mine, "rev-parse", "HEAD"), was, "ready is not moved: the person presses Use it");
  const u = await carry.useIt();
  assert.equal(u.ok, true, (u as any).error);
  await carry.moveSettled();
  assert.equal(git(f.mine, "branch", "--show-current"), "marco/mine");
  assert.equal(git(f.mine, "rev-parse", "HEAD~2"), rel, "both his changes sit on the release");
  assert.deepEqual(subjects(f.mine, `${rel}..HEAD`), ["mine: his own look", "mine: the engine answers 41"]);
  assert.equal(readFileSync(join(f.mine, "sol/engine/src/index.ts"), "utf8"), "export const a = 50 + 41;\n");
  assert.equal(git(f.mine, "rev-parse", "stable"), rel, "his stable is the team's");
  assert.deepEqual(x.updated, [rel]);
  assert.equal(carry.carryNow(), null);
  assert.equal(existsSync(c!.copy!), false, "the copy's folder is gone once used");
  assert.equal(git(f.mine, "for-each-ref", "--format=%(objectname)", "refs/sol/carried-from/"), was, "where it stood is kept");
  assert.equal(x.told.at(-1).stage, null);
});

test("a change the release already has is left out, and the rest goes on with no session", async () => {
  const f = fixture();
  put(f.mine, "sol/engine/src/index.ts", "export const a = 7;\n", "mine: seven");
  put(f.mine, "sol/mac/src/Mine.tsx", "his own look\n", "mine: his own look");
  // the release took "seven" (with more besides, so it is not the same change) and then went past it
  writeFileSync(join(f.team, "sol/engine/src/other.ts"), "x\n");
  put(f.team, "sol/engine/src/index.ts", "export const a = 7;\n", "seven, and other things");
  put(f.team, "sol/engine/src/index.ts", "export const a = 8;\n", "eight");
  const rel = f.release();
  const x = start(f); await x.ready;
  const r = await update(x.ship) as any;
  assert.equal(r.carry.stage, "ready", r.error);
  assert.equal(x.opened.length, 0, "nothing for a session to do");
  assert.deepEqual(r.carry.changes.map((c: any) => c.state), ["in-release", "clean"]);
  assert.match(r.error, /1 is in the release already and left out/);
  assert.doesNotMatch(r.error, PEOPLE_WORDS);
  assert.equal(((await carry.useIt()) as any).ok, true);
  await carry.moveSettled();
  assert.deepEqual(subjects(f.mine, `${rel}..HEAD`), ["mine: his own look"]);
  assert.equal(readFileSync(join(f.mine, "sol/engine/src/index.ts"), "utf8"), "export const a = 8;\n");
});

/** one his session cannot carry: his `mine:` clash, a `mine:` change that goes on, and one not marked mine: */
function stuck() {
  const f = fixture();
  put(f.mine, "sol/engine/src/index.ts", "export const a = 41;\n", "mine: the engine answers 41");
  put(f.mine, "sol/mac/src/Mine.tsx", "his own look\n", "mine: his own look");
  put(f.mine, "sol/mac/src/Try.tsx", "a try\n", "a try from a side branch");
  put(f.team, "sol/engine/src/index.ts", "export const a = 50;\n", "the engine counts to 50");
  const rel = f.release();
  return { f, rel };
}

test("a clash that cannot be carried: set aside keeps everything as <prefix>/aside-YYYYMMDD, the Sol updates with what still goes on", async () => {
  const { f, rel } = stuck();
  const was = git(f.mine, "rev-parse", "HEAD");
  const x = start(f, (copy) => { git(copy, "rebase", "--abort"); });
  await x.ready;
  const r = await update(x.ship) as any;
  assert.equal(r.carry.stage, "session");
  assert.equal((await carry.check())?.stage, "session", "a minute's grace for the session to start");
  x.clock.tick(2 * 60_000);
  const c = await carry.check();
  assert.equal(c?.stage, "failed");
  assert.equal(c?.said, "1 of your own changes could not be carried over onto today's release. Set it aside and update, or stay as you are");
  assert.equal(git(f.mine, "rev-parse", "HEAD"), was, "still not half-updated");
  assert.equal(half(f.mine), false);

  const a = await carry.setAside() as any;
  assert.equal(a.ok, true, a.error);
  assert.equal(a.aside, "marco/aside-20261030");
  assert.equal(a.pushed, true);
  assert.equal(a.kept, 1);
  assert.equal(a.left, 2);
  await carry.moveSettled();
  assert.equal(git(f.mine, "rev-parse", "marco/aside-20261030"), was, "everything kept, as it stood");
  assert.equal(git(f.origin, "rev-parse", "marco/aside-20261030"), was, "and on origin");
  assert.equal(git(f.mine, "rev-parse", "HEAD~1"), rel);
  assert.deepEqual(subjects(f.mine, `${rel}..HEAD`), ["mine: his own look"]);
  assert.equal(git(f.mine, "rev-parse", "stable"), rel);
  assert.deepEqual(x.updated, [rel]);
  assert.equal(carry.carryNow(), null);

  // listed, with what is left to bring back; bring back carries them over by the same steps
  const list = await carry.asides();
  assert.deepEqual(list.map((l) => [l.name, l.left, l.pushed]), [["marco/aside-20261030", 2, true]]);
  carry.resetCarry();
  const y = start(f, (copy) => {
    writeFileSync(join(copy, "sol/engine/src/index.ts"), "export const a = 50 + 41;\n");
    git(copy, "add", "-A");
    git(copy, "-c", "core.hooksPath=/dev/null", "rebase", "--continue");
  });
  await y.ready;
  const b = await carry.bringBack("marco/aside-20261030") as any;
  assert.equal(b.kind, "back");
  assert.equal(b.stage, "session");
  assert.match(b.said, /^1 of the changes you set aside clashes with your Sol as it is now/);
  assert.equal((await carry.check())?.stage, "ready");
  assert.equal(((await carry.useIt()) as any).ok, true);
  await carry.moveSettled();
  assert.deepEqual(subjects(f.mine, `${rel}..HEAD`), ["a try from a side branch", "mine: the engine answers 41", "mine: his own look"]);
  assert.deepEqual(y.updated, [], "bringing back is not an update");
  assert.equal((await carry.asides())[0].left, 0, "nothing left to bring back");
});

test("a clash that cannot be carried: stay leaves the Sol as it is, and the next release is offered with N behind", async () => {
  const { f, rel } = stuck();
  const was = git(f.mine, "rev-parse", "HEAD");
  const x = start(f, (copy) => { git(copy, "rebase", "--abort"); });
  await x.ready;
  await update(x.ship);
  x.clock.tick(2 * 60_000);
  assert.equal((await carry.check())?.stage, "failed");
  assert.deepEqual(carry.stay(), { ok: true });
  assert.equal(git(f.mine, "rev-parse", "HEAD"), was);
  assert.equal(half(f.mine), false);
  assert.equal(carry.carryNow(), null);
  assert.equal(carry.stayedOn(), rel);
  assert.equal(await heardStable(x.ship, { sha: rel, tag: "dev-20261030", by: "" }), null, "this release is not offered again");
  put(f.team, "sol/mac/src/App.tsx", "export const b = 2;\n", "the window moves");
  const next = f.release();
  git(f.mine, "fetch", "-q", "origin");
  const o = await heardStable(x.ship, { sha: next, tag: "dev-20261031", by: "" });
  assert.equal(o?.sha, next);
  assert.equal(o?.count, 2, "two of the release's changes it does not have");
  assert.equal(carry.stayedOn(), null, "the stay is spent on a newer release");
});

test("never half-updated: Use it is refused when the Sol moved since, and nothing changes", async () => {
  const f = fixture();
  put(f.mine, "sol/engine/src/index.ts", "export const a = 41;\n", "mine: the engine answers 41");
  put(f.team, "sol/engine/src/index.ts", "export const a = 50;\n", "the engine counts to 50");
  f.release();
  const x = start(f, (copy) => {
    writeFileSync(join(copy, "sol/engine/src/index.ts"), "export const a = 91;\n");
    git(copy, "add", "-A");
    git(copy, "-c", "core.hooksPath=/dev/null", "rebase", "--continue");
  });
  await x.ready;
  await update(x.ship);
  assert.equal((await carry.check())?.stage, "ready");
  const moved = put(f.mine, "sol/mac/src/Later.tsx", "later\n", "mine: made while the session worked");
  const u = await carry.useIt() as any;
  assert.equal(u.error, "your Sol changed since this began; press Update again");
  assert.equal(git(f.mine, "rev-parse", "HEAD"), moved);
  assert.equal(half(f.mine), false);
  // a carry that no longer fits the Sol is not brought back by a renew: the offer stands, Update starts afresh
  carry.resetCarry();
  const y = start(f); await y.ready;
  assert.equal(carry.carryNow(), null);
});

test("a carry survives a renew; a second press of Use it is refused, not raced; Stay calls off a move still waiting", async () => {
  const f = fixture();
  put(f.mine, "sol/engine/src/index.ts", "export const a = 41;\n", "mine: the engine answers 41");
  put(f.team, "sol/engine/src/index.ts", "export const a = 50;\n", "the engine counts to 50");
  const rel = f.release();
  const was = git(f.mine, "rev-parse", "HEAD");
  const x = start(f, (copy) => {
    writeFileSync(join(copy, "sol/engine/src/index.ts"), "export const a = 91;\n");
    git(copy, "add", "-A");
    git(copy, "-c", "core.hooksPath=/dev/null", "rebase", "--continue");
  });
  await x.ready;
  await update(x.ship);
  assert.equal((await carry.check())?.stage, "ready");
  carry.resetCarry();
  // renewed: the state comes back from this worktree's own git folder; and something is at work in the folder
  let busy = true;
  const told: any[] = [];
  await carry.startCarry({ root: f.sol, open: async () => "s", working: () => false, quiet: () => !busy, tell: (m) => told.push(m), updated: () => {}, now: () => new Date(2026, 9, 30, 9, 30) });
  assert.equal(carry.carryNow()?.stage, "ready");
  const [a, b] = await Promise.all([carry.useIt(), carry.useIt()]);
  assert.equal((a as any).ok, true);
  assert.equal((a as any).waiting, true);
  assert.equal((b as any).error, "already moving");
  assert.equal(carry.carryNow()?.stage, "moving");
  assert.deepEqual(carry.stay(), { ok: true }, "a move still waiting can be called off");
  await carry.moveSettled();
  busy = false;
  assert.equal(git(f.mine, "rev-parse", "HEAD"), was, "nothing moved");
  assert.equal(half(f.mine), false);
  assert.equal(carry.carryNow(), null);
  assert.equal(carry.stayedOn(), rel);
});

test("his own merge goes straight to the choice: set aside keeps it whole", async () => {
  const f = fixture();
  git(f.mine, "checkout", "-q", "-b", "side");
  put(f.mine, "sol/engine/src/index.ts", "export const a = 3;\n", "mine: three on the side");
  git(f.mine, "checkout", "-q", "marco/mine");
  put(f.mine, "sol/mac/src/Mine.tsx", "his own look\n", "mine: his own look");
  git(f.mine, "merge", "-q", "--no-ff", "-m", "mine: the side joined", "side");
  put(f.team, "sol/engine/src/index.ts", "export const a = 50;\n", "the engine counts to 50");
  f.release();
  const was = git(f.mine, "rev-parse", "HEAD");
  const x = start(f);
  await x.ready;
  const r = await update(x.ship) as any;
  assert.equal(r.carry?.stage, "failed", r.error);
  assert.equal(x.opened.length, 0, "no session for a merge");
  assert.doesNotMatch(r.error, PEOPLE_WORDS);
  assert.equal(git(f.mine, "rev-parse", "HEAD"), was);
  assert.equal(half(f.mine), false);
});

test("on the dev channel (#418): the ladder goes onto dev, and Use it moves his dev with it, never stable", async () => {
  const f = fixture();
  put(f.mine, "sol/engine/src/index.ts", "export const a = 41;\n", "mine: the engine answers 41");
  put(f.team, "sol/engine/src/index.ts", "export const a = 50;\n", "the engine counts to 50");
  git(f.team, "push", "-q", "origin", "HEAD:refs/heads/dev");
  const rel = git(f.team, "rev-parse", "HEAD");
  const x = start(f, (copy) => {
    writeFileSync(join(copy, "sol/engine/src/index.ts"), "export const a = 91;\n");
    git(copy, "add", "-A");
    git(copy, "-c", "core.hooksPath=/dev/null", "rebase", "--continue");
  });
  x.ship.channel = async () => "dev";
  await x.ready;
  const r = await update(x.ship) as any;
  assert.equal(r.carry?.stage, "session", r.error);
  assert.equal(r.carry.follow, "dev");
  assert.equal((await carry.check())?.stage, "ready");
  assert.equal(((await carry.useIt()) as any).ok, true);
  await carry.moveSettled();
  assert.equal(git(f.mine, "rev-parse", "HEAD~1"), rel, "his change sits on the dev release");
  assert.equal(git(f.mine, "rev-parse", "dev"), rel);
  assert.equal(git(f.mine, "rev-parse", "origin/stable"), f.first, "stable is not touched");
});
