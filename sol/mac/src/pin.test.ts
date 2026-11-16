// Pin and go back (#426): the face's reading of the engine's answers and its words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinViewOf, planOf, pinLine, goable, losesData } from "./cowork/pinWords.ts";

const V = { pin: null, here: { tag: "dev-20261030", sha: "b".repeat(40) }, data: 2, mine: false,
  releases: [{ tag: "dev-20261030", sha: "b".repeat(40), at: "2026-10-30T13:00:00Z", data: 2, pins: true }, { tag: "dev-20261020", sha: "a".repeat(40), at: "2026-10-20T13:00:00Z", data: 1, pins: false }] };

test("an engine that does not pin yet answers no view; one that does is read", () => {
  assert.equal(pinViewOf({ error: "x" }), null);
  assert.equal(pinViewOf({}), null);
  const v = pinViewOf(V)!;
  assert.equal(v.pin, null);
  assert.equal(v.releases.length, 2);
  assert.deepEqual(v.releases.map((r) => r.pins), [true, false]);
});

test("the pin row's words, and what one may go back to", () => {
  const v = pinViewOf(V)!;
  assert.equal(pinLine(v), "takes each new release; runs dev-20261030 now");
  assert.equal(pinLine({ ...v, pin: { tag: "dev-20261020", sha: "a".repeat(40), at: "", back: true } }), "pinned to dev-20261020, gone back to: no new release until back to latest");
  assert.equal(pinLine({ ...v, going: "building dev-20261020…" }), "building dev-20261020…");
  assert.deepEqual(goable(v).map((r) => r.tag), ["dev-20261020"]);
  assert.equal(losesData(v, v.releases[1]), true);
  assert.equal(losesData(v, v.releases[0]), false);
  for (const s of [pinLine(v), pinLine({ ...v, pin: { tag: "x", sha: "a".repeat(40), at: "" } })]) assert.doesNotMatch(s, /\b(branch|commits?|rebase)\b/);
});

test("a plan needs its warning and its sure; else the reason", () => {
  assert.deepEqual(planOf({ error: "not a release of the last 30 days" }), { error: "not a release of the last 30 days" });
  assert.match((planOf({ tag: "x" }) as { error: string }).error, /could not say/);
  const p = planOf({ tag: "dev-20261020", sha: "a".repeat(40), at: "", said: "Your Sol goes back…", sure: "abc", own: 2, lost: [] });
  assert.equal("sure" in p && p.sure, "abc");
});

test("the timeline offers go back on a release of the last thirty days that I do not run", async () => {
  const { backable } = await import("./cowork/pinWords.ts");
  const now = Date.parse("2026-10-30T12:00:00Z");
  assert.equal(backable({ tag: "dev-20261020", kind: "dev", at: "2026-10-20T12:00:00Z" }, "dev-20261029", now), true);
  assert.equal(backable({ tag: "dev-20261029", kind: "dev", at: "2026-10-29T12:00:00Z" }, "dev-20261029", now), false);
  assert.equal(backable({ tag: "main", kind: "next", at: "2026-10-30T12:00:00Z" }, "dev-20261029", now), false);
  assert.equal(backable({ tag: "dev-20260920", kind: "dev", at: "2026-09-20T12:00:00Z" }, "dev-20261029", now), false);
});
