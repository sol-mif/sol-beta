// node --test src/next-keeps.test.ts: the sidebar's groups from what the engine keeps (next/keeps.ts, #1879 step 3): an
// empty account is quiet, an ordinary one fills each box, a heavy one (30 sessions, 12 folders) still shows groups of at
// most 4, most recent first; the fixtures are given the last-use data the engine would send, so Recent shows 4 folders
// with a tab in front on dev-morning and dev-80.
import { test } from "node:test";
import assert from "node:assert/strict";

const KP = await import("./next/keeps.ts");
const CV = await import("./next/cv/index.ts");
await import("./next/cv/fixture.ts");
await import("./next/lead/fixture.ts");

const NOW = 1_800_000_000_000, H = 3_600_000;
const piece = (id: string, region: string, over: Record<string, unknown> = {}) => ({ id, region, kind: "session", name: `Task ${id}`, ...over }) as never;

test("an empty account: every group is quiet", () => {
  const pieces: never[] = [];
  assert.deepEqual(KP.doneAway(pieces, null), []);
  assert.deepEqual(KP.backTo(pieces, {}), []);
  assert.deepEqual(KP.keptItems(pieces, {}), []);
  assert.deepEqual(KP.recentFolders(["api", "web"], {}, null), []);
  // sessions that exist but were never seen, pinned or used, and no last-present time: still nothing
  const some = [piece("s1", "api", { last: NOW, state: "done" }), piece("s2", "web", { last: NOW })];
  assert.deepEqual(KP.doneAway(some, null), []);
  assert.deepEqual(KP.backTo(some, {}), []);
  assert.deepEqual(KP.keptItems(some, {}), []);
  assert.equal(KP.awayWords(null, NOW), "");
});

test("an ordinary account: done while away, back to, kept and recent, most recent first", () => {
  const pieces = [
    piece("s1", "api", { state: "done", last: NOW - 2 * H }), piece("s2", "api", { state: "done", last: NOW - H }), piece("s3", "web", { state: "done", last: NOW - 9 * H }),
    piece("s4", "web", { last: NOW - H }), piece("s5", "web", { last: NOW - 5 * H }), piece("p1", "infra", { kind: "page", born: NOW - 30 * 60_000 }),
  ];
  assert.deepEqual(KP.doneAway(pieces, NOW - 3 * H).map((i) => i.id), ["s2", "s1"], "finished since they were last present, newest first");
  const seen = { s4: NOW - 3 * H, s5: NOW - 4 * H, p1: NOW - 2 * H, s1: NOW };
  assert.deepEqual(KP.backTo(pieces, seen).map((i) => i.id), ["p1", "s4"], "changed since last seen, newest change first; s5 and s1 did not change since");
  assert.deepEqual(KP.backTo(pieces, seen, "p1").map((i) => i.id), ["s4"], "the one in front is not back to");
  assert.deepEqual(KP.keptItems(pieces, { p1: NOW - 10, s5: NOW - 5, gone: NOW }).map((i) => i.id), ["s5", "p1"], "pinned, the last pinned first; a pin whose piece is gone is quiet");
  assert.deepEqual(KP.recentFolders(["api", "web", "infra"], { api: NOW - 3 * H, infra: NOW - H }, "infra").map((f) => f.id), ["api"], "never the one in front, never a folder never used");
  assert.equal(KP.awayWords(NOW - 3 * H, NOW), "3 hours");
  assert.equal(KP.awayWords(NOW - 5 * 60_000, NOW), "", "under the gap is not away");
});

test("a heavy account: 30 sessions over 12 folders; every list is complete and the sidebar shows 4", () => {
  const folders = Array.from({ length: 12 }, (_, i) => `f${i}`);
  const pieces = Array.from({ length: 30 }, (_, i) => piece(`s${i}`, folders[i % 12], { state: i % 2 ? "done" : "working", last: NOW - i * 60_000 }));
  const done = KP.doneAway(pieces, NOW - 60 * 60_000);
  assert.equal(done.length, 15, "the odd ones finished within the hour");
  assert.ok(done.every((d, i) => i === 0 || done[i - 1].at >= d.at), "most recent first");
  const uses = Object.fromEntries(folders.map((f, i) => [f, NOW - i * H]));
  const recent = KP.recentFolders(folders, uses, "f0");
  assert.equal(recent.length, 11, "all of them, in order; the group shows the first 4");
  assert.deepEqual(recent.slice(0, KP.MOST).map((f) => f.id), ["f1", "f2", "f3", "f4"]);
  const seen = Object.fromEntries(pieces.map((p) => [p.id, NOW - 90 * 60_000]));
  assert.equal(KP.backTo(pieces, seen).length, 30, "all changed within the last 90 minutes");
});

test("a window's keeps: the first answer says when the person was last here; a ping after a long gap starts a new away", () => {
  KP.reset();
  assert.equal(CV.MODE, "live", "outside a fixture the engine's copy is read");
  KP.take({ present: NOW - 3 * H, seen: { s1: 5, bad: "x" }, pinned: { p1: 6 }, uses: { api: 7 } });
  assert.deepEqual([KP.K().present, KP.K().away, KP.K().seen, KP.K().uses], [NOW - 3 * H, NOW - 3 * H, { s1: 5 }, { api: 7 }]);
  KP.pinged(NOW - 3 * H, NOW - 2 * H);   // the first ping of this window: was is the same as the answer's
  KP.take({ present: NOW - 2 * H });
  assert.equal(KP.K().away, NOW - 3 * H, "later answers never move the away");
  KP.pinged(NOW - 2 * H + 60_000, NOW - 2 * H + 120_000);
  assert.equal(KP.K().away, NOW - 3 * H, "a ping a minute after the last is not a return");
  KP.pinged(NOW - 2 * H + 60_000, NOW);
  assert.equal(KP.K().away, NOW - 2 * H + 60_000, "back after two hours: the away starts where the last ping was");
  KP.notePin("p2", true, NOW); KP.notePin("p2", true, NOW + 1); assert.equal(KP.K().pinned.p2, NOW);
  KP.notePin("p2", false); assert.equal(KP.K().pinned.p2, undefined);
  KP.reset();
  assert.deepEqual([KP.K().present, KP.K().away], [null, null], "an empty account");
});

for (const name of ["dev-morning", "dev-80"]) {
  test(`${name} with a tab in front: Recent shows 4 folders (the fixture carries the last use the engine would send)`, () => {
    CV.load(name);
    const order = CV.folderOrder(), here = order[0];
    const items = KP.recentFolders(order, KP.K().uses, here);
    assert.ok(items.length >= KP.MOST, `${items.length} folders used`);
    assert.ok(items.every((f) => f.id !== here));
    assert.ok(items.every((f, i) => i === 0 || items[i - 1].at > f.at), "most recent first");
  });
}
