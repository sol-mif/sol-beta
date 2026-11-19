// The measure of the agent's eyes and hands (#1437): each count lands in the tracker's day file as plain words and
// numbers, never a title, a part or what was said, and the measure reads them back as the rates that need work.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTrackHome, trackIn, dayFile, setPrivate } from "../src/track.ts";
import { ask, reset as resetHands, setHandBus } from "../src/work/hands.ts";
import { reset, setSeen } from "../src/work/eyes.ts";
import { measure, words, linesOf } from "../src/work/stageMeasure.ts";

const STAGE = { x: 300, y: 0, w: 1200, h: 900 };
let home = "";
const lines = () => readFileSync(dayFile(), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((e) => e.name !== "tester.who");
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "sol-stage-measure-"));
  setTrackHome(home, { version: "t", consent: () => ({ usage: true }), who: () => ({ name: "a", user: "b" }) });
  reset(); resetHands(); setHandBus(() => {});
});

test("the hands count each ask with its result and move number; no title, part or say text", () => {
  setSeen({ sessionId: "s1", window: { w: 1512, h: 945, visible: true, focused: true }, stage: STAGE, hands: true, pieces: [{ id: "p1", box: STAGE }, { id: "p2", box: STAGE, held: true }], away: [] });
  ask("s1", { id: "p1", go: "Secret step", say: "private words" }, () => "Secret title", "page");
  ask("s1", { id: "p2", beside: "p1" }, () => "Secret title", "diff");
  const got = lines().filter((e) => e.name === "stage.asked");
  assert.deepEqual(got.map((e) => [e.props.verb, e.props.result, e.props.kind, e.props.n]), [["go", "sent", "page", 1], ["beside", "held", "diff", undefined]]);
  assert.ok(!/Secret|private/.test(readFileSync(dayFile(), "utf8")));
  assert.match(got[0].props.sess, /^[0-9a-f]{12}$/);
});

test("the face's felt comes in as one event each, only its plain fields; a private session's never", () => {
  trackIn({}, { type: "work.stage.felt", sessionId: "s1", ev: "after", n: 2, how: "undone", verb: "beside", secs: 4.25, title: "Secret" });
  trackIn({}, { type: "work.stage.felt", sessionId: "s1", ev: "made", n: 3, made: false, why: "held", say: "words?" });
  trackIn({}, { type: "work.stage.felt", sessionId: "s1", ev: "nope" });
  setPrivate("s2", true);
  trackIn({}, { type: "work.stage.felt", sessionId: "s2", ev: "after", how: "kept" });
  const got = lines();
  assert.deepEqual(got.map((e) => e.name), ["stage.after", "stage.made"]);
  assert.deepEqual({ ...got[0].props, sess: "" }, { sess: "", how: "undone", verb: "beside", n: 2, secs: 4.3 });
  assert.equal(got[1].props.say, undefined, "a word where a boolean belongs is dropped");
});

test("the measure: kept, undone and fixed by hand of the judged moves; the lens; how blocks landed", () => {
  const at = "2026-11-17T20:00:00.000Z", e = (name: string, props: object) => ({ at, name, props });
  const m = measure([
    e("stage.asked", { result: "sent" }), e("stage.asked", { result: "held" }),
    e("stage.made", { made: true, waited_ms: 2100 }), e("stage.made", { made: true, waited_ms: 0, brought: true }), e("stage.made", { made: false, why: "held" }),
    e("stage.after", { verb: "beside", how: "kept" }), e("stage.after", { verb: "beside", how: "undone" }), e("stage.after", { verb: "width", how: "widths" }), e("stage.after", { verb: "go", how: "kept" }), e("stage.after", { verb: "go", how: "replaced" }),
    e("stage.lens", { page: true }), e("stage.lens.arrived", { secs: 0.6 }), e("stage.lens", { page: false, found: false }),
    e("stage.landed", { tool: "compose", kind: "page", fit: "cut" }), e("stage.landed", { tool: "compose", kind: "page", fit: "whole" }),
    e("stage.hand", { what: "moved", agent: true }), e("stage.hand", { what: "away", agent: false }), e("stage.undo", { by: "agent" }),
    e("turn.say", {}),
  ], 14);
  assert.equal(m.lines, 18);
  assert.deepEqual([m.hands.kept_pct, m.hands.undone_pct, m.hands.fixed_pct], [50, 25, 25]);
  assert.deepEqual(m.hands.waited_ms, { median: 2100, max: 2100 });
  assert.deepEqual([m.lens.gone, m.lens.page, m.lens.arrived, m.lens.notFound], [3 - 1, 1, 1, 1]);
  assert.deepEqual(m.eyes.landed.compose, { cut: 1, whole: 1 });
  assert.equal(m.hand.onAgent, 1);
  assert.match(words(m), /kept 50% · undone 25% · fixed by hand 25%/);
  assert.match(words(measure([], 3)), /No stage\.\* events in the last 3 days/);
});

test("the measure reads the home's day files, the stage lines only", () => {
  trackIn({}, { type: "work.stage.felt", sessionId: "s1", ev: "lens", page: true });
  trackIn({}, { type: "stop" });
  const got = linesOf(join(home, "track"), 2);
  assert.deepEqual(got.map((l) => l.name), ["stage.lens"]);
});
