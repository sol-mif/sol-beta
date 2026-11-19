// The one session at team size (#1002, build.one.team): a hand pulled back before its receiver acts. The record decides:
// a **back** line by the hand's own sender ends the hand (it is no longer the receiver's), anyone else's is not a hands
// line, and once the receiver took or passed it there is nothing to pull back. GitHub is a fake `gh` on PATH that writes
// down its arguments; nothing here reaches GitHub or the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bin = mkdtempSync(join(tmpdir(), "sol-fake-gh-back-"));
const LOG = join(bin, "calls.log");
writeFileSync(join(bin, "gh"), `#!/bin/sh
node -e 'require("fs").appendFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)) + "\\n")' "${LOG}" "$@"
exit 0
`);
chmodSync(join(bin, "gh"), 0o755);
process.env.PATH = `${bin}:${process.env.PATH}`;
const calls = (): string[][] => (existsSync(LOG) ? readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

const { parseRecord, pendingFor, pullBack, backBody, handBody } = await import("../src/team/hand.ts");
const ghCli = (await import("../src/team/record.ts")).runners.hand;
type Hand = import("../src/team/hand.ts").Hand;
const R = "acme/sol";
const c = (at: string, author: string, body: string, number = 34) => ({ repo: R, number, at, author, body });
const HAND = c("2026-11-11T03:00:00Z", "marco", handBody({ from: "marco", to: "frank", date: "2026-11-11", brief: "the give piece" }));

test("a back line by the sender ends the hand: it is no longer the receiver's", () => {
  const rows = parseRecord([HAND, c("2026-11-11T03:01:00Z", "marco", backBody("marco", "2026-11-11"))]);
  assert.equal(rows[0].how, "back");
  assert.equal(rows[0].from, "marco");
  assert.equal(rows[0].to, "frank");
  assert.deepEqual(pendingFor("frank", rows), []);
  assert.equal(pendingFor("frank", parseRecord([HAND])).length, 1, "before the back line it is frank's");
});

test("a back line by anyone but the sender is not a hands line", () => {
  const rows = parseRecord([HAND, c("2026-11-11T03:01:00Z", "isaac", backBody("isaac", "2026-11-11"))]);
  assert.equal(rows.length, 1);
  assert.equal(pendingFor("frank", rows).length, 1);
});

const deps = (me: string): Hand => ({
  gh: ghCli, git: async () => "", send: () => { throw new Error("a pull back sends nothing on the relay"); }, me: async () => me,
  now: () => new Date("2026-11-11T08:00:00Z"), session: async () => null, folders: async () => ({}), repos: () => [R], cards: async () => [],
  start: async () => { throw new Error("no session starts"); },
});

test("pulling back writes the assignee back to me, then the signed line; nothing on the relay", async () => {
  writeFileSync(LOG, "");
  const r = await pullBack(deps("marco"), parseRecord([HAND]), R, 34);
  assert.deepEqual(r, { ok: true });
  const k = calls();
  assert.deepEqual(k[0], ["issue", "edit", "34", "-R", R, "--remove-assignee", "frank", "--add-assignee", "marco"]);
  assert.equal(k[1][0], "issue"); assert.equal(k[1][1], "comment");
  assert.match(k[1][k[1].length - 1], /^\*\*back\*\* by marco · 2026-11-11/);
  assert.equal(k.length, 2);
});

test("nothing to pull back once they took it, or when the hand is not mine", async () => {
  writeFileSync(LOG, "");
  const taken = parseRecord([HAND, c("2026-11-11T03:02:00Z", "frank", "**taken** by frank · 2026-11-11")]);
  const r = await pullBack(deps("marco"), taken, R, 34);
  assert.equal(r.ok, undefined);
  assert.match((r as { error: string }).error, /frank already took it/);
  const notMine = await pullBack(deps("isaac"), parseRecord([HAND]), R, 34);
  assert.match((notMine as { error: string }).error, /not a hand of yours/);
  assert.equal(calls().length, 0, "nothing was written");
});

test("just taking needs no folder: the taken line is written, no session starts, nothing is fetched", async () => {
  writeFileSync(LOG, "");
  const { answer } = await import("../src/team/hand.ts");
  const h = { id: `${R}#34`, from: "marco", repo: R, issue: 34, title: "", brief: "the give piece", branch: "marco/34", at: "2026-11-11T03:00:00Z" };
  const r = await answer({ ...deps("frank"), git: async () => { throw new Error("nothing is fetched"); } }, h, "take", undefined, false);
  assert.equal(r.ok, true);
  const k = calls();
  assert.equal(k.length, 1);
  assert.match(k[0][k[0].length - 1], /^\*\*taken\*\* by frank/);
  const full = await answer(deps("frank"), h, "take", undefined, true);
  assert.match((full as { error: string }).error, /no folder on this machine holds/, "a take that starts a session still needs the folder");
});
