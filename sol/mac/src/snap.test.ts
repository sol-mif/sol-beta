// node --test src/*.test.ts: pieces that snap (#1024, snap/fit.ts, build.snap): which ends fit, the pull of the last
// pixels, pulling apart keeps what is downstream together, where the agent proposes your hand, and how worn a row looks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSwitch } from "./flag.ts";
import { BUILD_SNAP, FEEL, fits, seats, givesOf, takesOf, nearest, nearestJoint, jointOf, insert, pullHand, pull, pullApart, seat, proposeHands, withHands, wear, weightOf, rowWidth, type Brick, type Section } from "./snap/fit.ts";

const env = (o: Record<string, string> = {}, search = "") => ({ storage: () => ({ getItem: (k: string) => o[k] ?? null, setItem: (k: string, v: string) => { o[k] = v; } }), search: () => search, target: new EventTarget() });
const B = (kind: Brick["kind"], label = kind, id = `${kind}-${label}`): Brick => ({ id, kind, label, ref: label });
const now = B("when", "now"), folder = B("source", "sol-dev"), job = B("job", "add a test for the clock"), tests = B("check", "the tests"), hand = B("hand", "your hand");

test("build.snap is its own switch, off by default; the link turns it on for one load", () => {
  assert.equal(BUILD_SNAP, "build.snap");
  assert.equal(buildSwitch(BUILD_SNAP, env()).get(), false);
  assert.equal(buildSwitch(BUILD_SNAP, env({ "build.one": "1" })).get(), false, "the one session on does not turn the pieces on");
  assert.equal(buildSwitch(BUILD_SNAP, env({}, "?build.snap=on")).get(), true);
});

test("an end fits when the row gives what the piece takes: time → folder → job → check", () => {
  assert.ok(fits([now], [folder]));
  assert.ok(fits([now, folder], [job]));
  assert.ok(fits([now, folder, job], [tests]));
  assert.ok(fits([tests], [job]), "a job may act on a verdict (fix what the check found)");
  assert.ok(fits([job], [job]), "work on work");
});

test("an end that does not fit: a check after a folder, a time after anything, a folder after work", () => {
  assert.equal(fits([now, folder], [tests]), false);
  assert.equal(fits([job], [now]), false);
  assert.equal(fits([job], [folder]), false);
  assert.equal(fits([now], [tests]), false);
});

test("your hand fits everywhere and gives on what it was given; a hand never seats on a hand", () => {
  assert.ok(fits([folder], [hand]));
  assert.equal(givesOf([folder, hand]), "stuff");
  assert.ok(fits([folder, hand], [job]));
  assert.equal(fits([folder, hand], [tests]), false, "the hand passes stuff on, and a check does not take stuff");
  assert.equal(takesOf([hand, tests]).toString(), "work", "a lump led by a hand takes what its first real piece takes");
  assert.equal(seats([job, hand], [hand]), false);
});

test("the pull: nothing beyond the reach, hardest in the last pixels, all the way at the end", () => {
  assert.equal(pull(FEEL.reach), 0);
  assert.equal(pull(FEEL.reach + 10), 0);
  assert.ok(pull(FEEL.reach * 0.8) < 0.1, "far in the reach it barely pulls");
  assert.ok(pull(FEEL.reach * 0.2) > 0.4, "near the end it pulls hard");
  assert.equal(pull(0), 1);
  for (let d = 0; d < FEEL.reach; d += 2) assert.ok(pull(d) >= pull(d + 2), "nearer never pulls less");
});

test("nearest finds the end within reach and says whether it fits", () => {
  const s: Section = { id: "a", x: 100, y: 50, bricks: [now, folder] };
  const e = { x: 100 + rowWidth(s.bricks), y: 50 };
  assert.deepEqual(nearest([s], [job], e.x + 6, e.y + 4).to?.id, "a");
  assert.equal(nearest([s], [job], e.x + 6, e.y + 4).fit, true);
  assert.equal(nearest([s], [tests], e.x + 6, e.y + 4).fit, false);
  assert.equal(nearest([s], [job], e.x + FEEL.reach + 5, e.y).to, undefined);
  assert.equal(nearest([s], [job], e.x, e.y, "a").to, undefined, "never its own end");
});

test("pulling apart at a piece takes it and everything after it as one lump; at the first piece the whole row", () => {
  const s: Section = { id: "a", x: 0, y: 0, bricks: [now, folder, job, tests], runs: 3 };
  const p = pullApart(s, 2);
  assert.deepEqual(p.lump.map((b) => b.kind), ["job", "check"]);
  assert.deepEqual(p.stays?.bricks.map((b) => b.kind), ["when", "source"]);
  assert.equal(p.stays?.runs, 3, "what stays keeps its age");
  assert.equal(pullApart(s, 0).stays, null);
  assert.deepEqual(seat(p.stays!, p.lump).bricks, s.bricks, "put back, it is the same row");
});

test("heavier lumps weigh more: a job more than a time, a row more than a piece", () => {
  assert.ok(weightOf([job]) > weightOf([now]));
  assert.ok(weightOf([now, folder, job, tests]) > weightOf([job]));
});

test("the agent proposes your hand where your word is worth most, says why in six words, and never where you pulled one out", () => {
  const merge = B("job", "merge the branch when green"), look = B("job", "redo the look of the sidebar"), pay = B("job", "buy the domain");
  const ps = proposeHands([now, folder, merge]);
  assert.deepEqual(ps.map((p) => p.after), [2]);
  assert.equal(ps[0].why.split(/\s+/).length <= 6, true, ps[0].why);
  assert.match(proposeHands([look])[0].why, /taste/);
  assert.match(proposeHands([pay])[0].why, /money/);
  assert.deepEqual(proposeHands([now, folder, job]), [], "an ordinary job needs no hand");
  assert.deepEqual(proposeHands([merge], [merge.id]), [], "pulled out: the agent decides alone there");
  const w = withHands([now, merge]);
  assert.deepEqual(w.map((b) => b.kind), ["when", "job", "hand"]);
  assert.equal(w[2].hand, "proposed");
  assert.deepEqual(withHands(w).map((b) => b.kind), ["when", "job", "hand"], "never a second hand beside the first");
});

test("wear: a row never run is fresh, forty runs is worn in, and it only grows", () => {
  assert.equal(wear(0), 0);
  assert.equal(wear(40), 1);
  assert.equal(wear(400), 1);
  assert.ok(wear(3) > 0 && wear(3) < wear(12));
});

test("joints: your hand goes in between two pieces; a piece goes in only where it fits both sides", () => {
  const s: Section = { id: "a", x: 0, y: 0, bricks: [now, folder, job, tests] };
  const between = jointOf(s, 2);
  const j = nearestJoint([s], [hand], between.x + 3, between.y + 2);
  assert.equal(j.at, 2); assert.equal(j.fit, true);
  assert.equal(nearestJoint([s], [tests], between.x + 3, between.y + 2).fit, false, "a check between a folder and a job fits neither side");
  assert.equal(nearestJoint([s], [B("job", "another")], between.x + 3, between.y).fit, true, "a job after a folder gives work, which the next job takes");
  assert.deepEqual(insert(s, 2, [hand]).bricks.map((b) => b.kind), ["when", "source", "hand", "job", "check"]);
});

test("a hand pulled out comes alone and the row closes up; the agent's hand pulled out leaves that place free", () => {
  const s: Section = { id: "a", x: 0, y: 0, bricks: [now, folder, job, tests] };
  const proposed: Brick = { ...hand, id: "h2", hand: "proposed", why: "a taste call: your eye decides" };
  const out = pullHand(insert(s, 3, [proposed]), 3);
  assert.deepEqual(out.stays.bricks.map((b) => b.kind), ["when", "source", "job", "check"]);
  assert.deepEqual(out.stays.free, [job.id]);
  assert.equal(out.hand.hand, "mine");
  const taste = B("job", "make the greeting friendlier");
  assert.equal(withHands([now, taste], out.stays.free).length, 3, "free is per piece: another place still gets one");
  assert.deepEqual(withHands([now, taste], [taste.id]).map((b) => b.kind), ["when", "job"], "a free place gets no hand again");
});
