// node --test src/*.test.ts (npm test here): the walk through a project's pure parts (#430, cowork/onboardView.ts):
// where a walk opens again, the night's four marks on one line (a time before the hand-in is the next morning), the
// hours set apart in a line, and the onboarding read from an engine older than #430 as the default.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startAt, nightMarks, hoursIn, endAs } from "./cowork/onboardView.ts";
import { onboardingOf, patchOf, fromLine } from "./cowork/projectView.ts";

const steps = [{ id: "night", title: "", lines: [], note: "" }, { id: "owners", title: "", lines: [], note: "" }, { id: "agents", title: "", lines: [], note: "" }] as any[];

test("where the walk opens: the welcome when new, else the first step not marked yet", () => {
  assert.equal(startAt({ steps, state: "new" }), -1);
  assert.equal(startAt({ steps: [{ ...steps[0], mark: "done" }, { ...steps[1], mark: "skipped" }, steps[2]], state: "partway" }), 2);
  assert.equal(startAt({ steps: steps.map((s) => ({ ...s, mark: "done" })), state: "done" }), 2);
});

test("the night: hand in at the start, release at the end, the dev night and the fixes where their hours fall", () => {
  const m = nightMarks({ handIn: "20:00", review: "21:00", until: "06:00", release: "09:00", zone: "" });
  assert.deepEqual(m.map((x) => x.word), ["hand in", "the dev night", "fixes until", "release"]);
  assert.equal(m[0].x, 0); assert.equal(m[3].x, 1);
  assert.ok(Math.abs(m[1].x - 1 / 13) < 1e-9);
  assert.ok(Math.abs(m[2].x - 10 / 13) < 1e-9);
  // all the same hour: no division by nothing
  assert.ok(nightMarks({ handIn: "20:00", review: "20:00", until: "20:00", release: "20:00", zone: "" }).every((x) => x.x === 0));
});

test("hours set apart in a line, the rest as it is", () => {
  assert.deepEqual(hoursIn("hand in by 20:00: what is handed in"), [{ t: "hand in by " }, { t: "20:00", hour: true }, { t: ": what is handed in" }]);
  assert.deepEqual(hoursIn("no hour"), [{ t: "no hour" }]);
  assert.deepEqual(hoursIn("9:00 and 24:00"), [{ t: "9:00", hour: true }, { t: " and 24:00" }]);
});

test("the onboarding part: {} from an older engine is the default; the form's patch is the part whole", () => {
  const o = onboardingOf({ onboarding: {} as any });
  assert.equal(o.welcome, "");
  assert.deepEqual(o.steps.handin, { on: true, note: "" });
  assert.deepEqual(onboardingOf({}).steps.night, { on: true, note: "" });
  assert.equal(onboardingOf({ onboarding: { welcome: "hi", steps: { owners: { on: false, note: "" } } } as any }).steps.owners.on, false);
  assert.deepEqual(patchOf({ part: "onboarding", o, why: "" }), { onboarding: o });
  assert.match(fromLine("onboarding", { from: { rhythm: "default", night: "default", agents: "default", owners: "default" }, set: {} }, () => ""), /^the default/);
});

test("how a walk ends: every step skipped (here or before) is the walk skipped; anything seen is done", () => {
  assert.equal(endAs(steps, { night: "skipped", owners: "skipped", agents: "skipped" }), "skipped");
  assert.equal(endAs([{ ...steps[0], mark: "skipped" }, { ...steps[1], mark: "skipped" }, steps[2]], { agents: "skipped" }), "skipped");
  assert.equal(endAs(steps, { night: "skipped", owners: "done", agents: "skipped" }), "done");
  assert.equal(endAs([{ ...steps[0], mark: "done" }, steps[1], steps[2]], { night: "skipped", owners: "skipped", agents: "skipped" }), "skipped");   // marked again here
  assert.equal(endAs([], {}), "done");
});
