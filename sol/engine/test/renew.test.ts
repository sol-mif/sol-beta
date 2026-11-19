// Renew (#39): a build that was still landing when the engine started is not the baseline. A file written from 3 s
// before the start on counts as changed, so the first quiet moment goes live with it; an older file counts only when
// its content changes, and a rewrite byte for byte is no change. A temp dist/ and short waits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, utimesSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renewOnBuild } from "../src/renew.js";

const FAST = { quietMs: 50, pollMs: 20, settleMs: 50 };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
function dist(old: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "sol-renew-"));
  writeFileSync(join(dir, "index.js"), "one");
  if (old) { const t = new Date(Date.now() - 60_000); utimesSync(join(dir, "index.js"), t, t); }
  return dir;
}
function watchIt(dir: string, idle = () => true, more: Parameters<typeof renewOnBuild>[5] = {}) {
  const told: object[] = [];
  let exits = 0;
  const stop = renewOnBuild(dir, idle, (o) => told.push(o), () => "work abc (auto) 3s", () => { exits++; }, { ...FAST, startedAt: Date.now(), ...more });
  return { told, exits: () => exits, stop };
}

test("renew: a file written just before the start counts as changed; the first quiet moment goes live", async () => {
  const dir = dist(false);
  const r = watchIt(dir);
  await wait(800);
  assert.equal(r.exits(), 1);
  assert.deepEqual(r.told, [{ type: "engine.renewing" }]);
  r.stop(); rmSync(dir, { recursive: true, force: true });
});

test("renew: a file still landing waits for idle like any change", async () => {
  const dir = dist(false);
  let busy = true;
  const r = watchIt(dir, () => !busy);
  await wait(500);
  assert.equal(r.exits(), 0, "a job is live");
  busy = false;
  await wait(800);
  assert.equal(r.exits(), 1);
  r.stop(); rmSync(dir, { recursive: true, force: true });
});

test("renew: an older build is the baseline; the same bytes again are no change, new bytes are", async () => {
  const dir = dist(true);
  const r = watchIt(dir);
  await wait(400);
  assert.equal(r.exits(), 0, "nothing changed");
  writeFileSync(join(dir, "index.js"), "one");
  await wait(600);
  assert.equal(r.exits(), 0, "a rewrite byte for byte");
  writeFileSync(join(dir, "index.js"), "two");
  await wait(1000);
  assert.equal(r.exits(), 1);
  r.stop(); rmSync(dir, { recursive: true, force: true });
});

// #1566: sessions whose turns overlap never leave SETTLE_MS between them; past the cap a breath between two turns is
// enough, never mid-turn, and the windows hear it is capped. The background work it ends is written down first.
test("renew: past the cap, a breath between turns goes live (never mid-turn), told capped; before() runs first", async () => {
  const dir = dist(false);
  // turns overlap: between turns for 30 ms out of every 100, never the 50 ms the settle asks
  const start = Date.now();
  const between = () => (Date.now() - start) % 100 < 30;
  let exitedBetween: boolean | null = null, recorded = 0;
  const told: any[] = [];
  const stop = renewOnBuild(dir, between, (o) => told.push(o), () => "work abc (auto) 3s", () => { exitedBetween ??= between(); }, {
    ...FAST, settleMs: 50, pollMs: 5, cappedSettleMs: 10, capMs: 400, startedAt: Date.now(), before: () => { recorded++; },
  });
  await wait(300);
  assert.equal(exitedBetween, null, "before the cap: no quiet moment, no renew");
  assert.ok(told.some((m) => m.type === "engine.renew.waiting" && !m.capped));
  for (let i = 0; i < 100 && exitedBetween === null; i++) await wait(20);
  assert.notEqual(exitedBetween, null, "past the cap it went live");
  assert.ok(told.some((m) => m.type === "engine.renew.waiting" && m.capped === true), "the windows heard it was capped");
  assert.equal(told.at(-1).type, "engine.renewing");
  assert.equal(recorded, 1, "the record of background work, once, before the exit");
  stop(); rmSync(dir, { recursive: true, force: true });
});

test("renew: the cap counts from the release word when Ship gives one; a turn in flight is never cut, capped or not", async () => {
  const dir = dist(false);
  let busy = true;
  const r = watchIt(dir, () => !busy, { capMs: 60_000, cappedSettleMs: 10, since: () => Date.now() - 61_000 });
  await wait(300);
  assert.equal(r.exits(), 0, "capped, but a turn is in flight");
  assert.deepEqual(r.told.at(-1), { type: "engine.renew.waiting", jobs: "work abc (auto) 3s", capped: true });
  busy = false;
  await wait(500);   // the exit comes 300 ms after the word
  assert.equal(r.exits(), 1, "the turn ended: live at once, no 5 s settle");
  r.stop(); rmSync(dir, { recursive: true, force: true });
});
