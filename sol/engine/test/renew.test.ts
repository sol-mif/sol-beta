// Renew (#39): a build that was still landing when the engine started is not the baseline. A file written from 3 s
// before the start on counts as changed, so the first quiet moment goes live with it; an older file counts only when
// its content changes, and a rewrite byte for byte is no change. A temp dist/ and short waits. Each test stops its
// watcher in t.after, so a failed assert fails the file instead of leaving it open until CI's 6-hour cap (#1809); what
// should happen is waited for (until), what should not is given a fixed wait, so a slow runner only waits longer.
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, utimesSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renewOnBuild } from "../src/renew.js";

const FAST = { quietMs: 50, pollMs: 20, settleMs: 50 };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (ok: () => boolean, ms = 3000) => { for (const end = Date.now() + ms; !ok() && Date.now() < end;) await wait(10); };
function dist(old: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "sol-renew-"));
  writeFileSync(join(dir, "index.js"), "one");
  if (old) { const t = new Date(Date.now() - 60_000); utimesSync(join(dir, "index.js"), t, t); }
  return dir;
}
function watchIt(t: TestContext, dir: string, idle = () => true, more: Parameters<typeof renewOnBuild>[5] = {}) {
  const told: object[] = [];
  let exits = 0;
  const stop = renewOnBuild(dir, idle, (o) => told.push(o), () => "work abc (auto) 3s", () => { exits++; }, { ...FAST, startedAt: Date.now(), ...more });
  t.after(() => { stop(); rmSync(dir, { recursive: true, force: true }); });
  return { told, exits: () => exits };
}

test("renew: a file written just before the start counts as changed; the first quiet moment goes live", async (t) => {
  const dir = dist(false);
  const r = watchIt(t, dir);
  await until(() => r.exits() > 0); await wait(400);   // and a breath more: once, never twice
  assert.equal(r.exits(), 1);
  assert.deepEqual(r.told, [{ type: "engine.renewing" }]);
});

test("renew: a file still landing waits for idle like any change", async (t) => {
  const dir = dist(false);
  let busy = true;
  const r = watchIt(t, dir, () => !busy);
  await wait(500);
  assert.equal(r.exits(), 0, "a job is live");
  busy = false;
  await until(() => r.exits() > 0); await wait(400);   // and a breath more: once, never twice
  assert.equal(r.exits(), 1);
});

test("renew: an older build is the baseline; the same bytes again are no change, new bytes are", async (t) => {
  const dir = dist(true);
  const r = watchIt(t, dir);
  await wait(400);
  assert.equal(r.exits(), 0, "nothing changed");
  writeFileSync(join(dir, "index.js"), "one");
  await wait(600);
  assert.equal(r.exits(), 0, "a rewrite byte for byte");
  writeFileSync(join(dir, "index.js"), "two");
  await until(() => r.exits() > 0); await wait(400);   // and a breath more: once, never twice
  assert.equal(r.exits(), 1);
});

// #1566: sessions whose turns overlap never leave SETTLE_MS between them; past the cap a breath between two turns is
// enough, never mid-turn, and the windows hear it is capped. The background work it ends is written down first.
test("renew: past the cap, a breath between turns goes live (never mid-turn), told capped; before() runs first", async (t) => {
  const dir = dist(false);
  // turns overlap: between turns for 30 ms out of every 100, never the 50 ms the settle asks. From 200 ms (the cap is at
  // about 450) a turn is in flight until the capped word is out: on the wall clock alone a late poll on a loaded runner
  // could cross the cap inside a breath and go live before any word said capped (#1809)
  const start = Date.now();
  const held = () => Date.now() - start >= 200 && !told.some((m) => m.capped === true);
  const between = () => (Date.now() - start) % 100 < 30 && !held();
  let exitedBetween: boolean | null = null, recorded = 0;
  const told: any[] = [];
  const stop = renewOnBuild(dir, between, (o) => told.push(o), () => "work abc (auto) 3s", () => { exitedBetween ??= between(); }, {
    ...FAST, settleMs: 50, pollMs: 5, cappedSettleMs: 10, capMs: 400, startedAt: Date.now(), before: () => { recorded++; },
  });
  t.after(() => { stop(); rmSync(dir, { recursive: true, force: true }); });
  await wait(300);
  assert.equal(exitedBetween, null, "before the cap: no quiet moment, no renew");
  assert.ok(told.some((m) => m.type === "engine.renew.waiting" && !m.capped));
  await until(() => exitedBetween !== null); await wait(400);   // and a breath more: the record once, never twice
  assert.notEqual(exitedBetween, null, "past the cap it went live");
  assert.ok(told.some((m) => m.type === "engine.renew.waiting" && m.capped === true), "the windows heard it was capped");
  assert.equal(told.at(-1).type, "engine.renewing");
  assert.equal(recorded, 1, "the record of background work, once, before the exit");
});

test("renew: the cap counts from the release word when Ship gives one; a turn in flight is never cut, capped or not", async (t) => {
  const dir = dist(false);
  let busy = true;
  const r = watchIt(t, dir, () => !busy, { capMs: 60_000, cappedSettleMs: 10, since: () => Date.now() - 61_000 });
  await wait(300);
  assert.equal(r.exits(), 0, "capped, but a turn is in flight");
  assert.deepEqual(r.told.at(-1), { type: "engine.renew.waiting", jobs: "work abc (auto) 3s", capped: true });
  busy = false;
  await until(() => r.exits() > 0); await wait(400);   // the exit comes 300 ms after the word; a breath more: once, never twice
  assert.equal(r.exits(), 1, "the turn ended: live at once, no 5 s settle");
});
