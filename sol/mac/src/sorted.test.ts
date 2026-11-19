// node --test src/*.test.ts: Build's sidebar, sorted (#1016, work/sortedRules.ts). A folder inside Home is Home's, the
// rest is Build's, a code project inside Home is both; quiet folders and a session's many own sessions fold away.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sortFolders, kidsShown, kidsMark, isBuild, DAY, KIDS, QUIET, type Placed } from "./work/sortedRules.ts";

const NOW = 1_800_000_000_000;
type F = Placed & { name: string; at: number; live?: boolean };
const f = (name: string, at: number, o: Partial<F> = {}): F => ({ path: "/x/" + name, name, at, ...o });
const split = (xs: F[]) => sortFolders(xs, (p) => p.at, (p) => !!p.live, NOW);
const names = (xs: F[]) => xs.map((x) => x.name);

test("Build lists Build's folders and the code projects in Home; Home's folders go to their own fold", () => {
  const xs = [f("sol-dev", NOW), f("ds480", NOW, { place: "home", area: "school" }), f("viz", NOW, { place: "both", area: "school" }), f("jobs", NOW, { place: "home", area: "jobs" })];
  const s = split(xs);
  assert.deepEqual(names(s.build), ["sol-dev", "viz"]);
  assert.deepEqual(names(s.home), ["ds480", "jobs"]);
  assert.deepEqual(s.quiet, []);
  assert.equal(isBuild(xs[2]), true, "both is Build's too");
});

test("nothing is lost: every folder lands in exactly one of the three, in the order given", () => {
  const xs = Array.from({ length: 30 }, (_, i) => f("p" + i, NOW - i * 2 * DAY, i % 4 === 0 ? { place: "home", area: "school" } : {}));
  const s = split(xs);
  assert.equal(s.build.length + s.quiet.length + s.home.length, 30);
  assert.deepEqual(new Set([...s.build, ...s.quiet, ...s.home]).size, 30);
  for (const part of [s.build, s.quiet, s.home]) assert.deepEqual(part, xs.filter((x) => part.includes(x)), "order kept");
});

test("a Build folder idle past two weeks is quiet, unless something in it runs, waits or is pinned, or it was added by hand", () => {
  const old = NOW - QUIET - DAY;
  const s = split([f("old", old), f("old-live", old, { live: true }), f("old-added", old, { added: true }), f("fresh", NOW - QUIET + DAY)]);
  assert.deepEqual(names(s.quiet), ["old"]);
  assert.deepEqual(names(s.build), ["old-live", "old-added", "fresh"]);
});

test("a Home folder is never quiet: Home's fold holds all of Home's, old or new", () => {
  const s = split([f("desk", NOW - 90 * DAY, { place: "home", area: "desk" })]);
  assert.deepEqual(names(s.home), ["desk"]);
});

test("a session's own sessions: the first few show, the live ones always, the rest behind n more", () => {
  const kids = Array.from({ length: 12 }, (_, i) => ({ id: "k" + i, live: i === 9 }));
  const live = (k: { live: boolean }) => k.live;
  const r = kidsShown(kids, live, false);
  assert.deepEqual(r.shown.map((k) => k.id), ["k0", "k1", "k9"]);
  assert.equal(r.shown.length, KIDS);
  assert.equal(r.hidden, 9);
  assert.equal(kidsShown(kids, live, true).hidden, 0, "opened, all show");
  assert.equal(kidsShown(kids.slice(0, 3), live, false).hidden, 0, "three or fewer: all show");
  const busy = kids.map((k, i) => ({ ...k, live: i >= 6 }));
  assert.equal(kidsShown(busy, live, false).shown.length, 6, "six live: all six show, nothing live is hidden");
});

test("the archived list folds nothing into quiet: every archived folder is old, so the side asks with no clock (now 0)", () => {
  const s = sortFolders([f("old", NOW - 90 * DAY), f("older", NOW - 200 * DAY)], (p) => p.at, () => false, 0);
  assert.deepEqual(names(s.build), ["old", "older"]);
  assert.deepEqual(s.quiet, []);
});

test("the mark on a session that started others says how many, and how many are at work", () => {
  const kids = [{ live: true }, { live: false }, { live: false }];
  assert.deepEqual(kidsMark(kids, (k) => k.live), { short: "↳ 3", long: "3 started · 1 at work" });
  assert.deepEqual(kidsMark(kids.slice(1), (k) => k.live), { short: "↳ 2", long: "2 started" });
  assert.deepEqual(kidsMark([], () => true), { short: "", long: "" });
});
