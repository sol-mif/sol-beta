// The still kept when the person leaves a session (#1435's leftover, work/eyes.ts): a stage quiet in front of the person
// is caught once, kept only if they were still there after, and `look` on a session they left gives it with its time.
// The screen is never touched: a fake catch stands in for screencapture.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { _setCapture, keptAt, look, reset, setSeen, type Seen } from "../src/work/eyes.ts";

const STAGE = { x: 300, y: 0, w: 1200, h: 900 };
const report = (sessionId: string, o: Partial<Seen> & { pieces?: any[] } = {}) => ({
  sessionId, window: { w: 1512, h: 945, visible: true, focused: true }, stage: STAGE, pieces: [{ id: "p1", box: STAGE }], away: [], ...o,
});
const QUIET = 40, CONFIRM = 30, wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
let caught: string[] = [];
beforeEach(() => {
  reset(); caught = [];
  _setCapture(async (s) => { caught.push(s.sessionId); return { type: "image", data: `still-of-${s.sessionId}`, mimeType: "image/jpeg" }; }, QUIET, CONFIRM);
});
after(() => _setCapture(null));

test("a stage quiet in front of the person is kept, and look on the session they left gives it with its time", async () => {
  setSeen(report("s1"));
  await wait(QUIET + CONFIRM + 30);
  assert.deepEqual(caught, ["s1"]);
  assert.ok(keptAt("s1"));
  setSeen(report("s2"));
  const r = await look("s1", {}, () => "plan");
  assert.equal(r.image?.data, "still-of-s1");
  assert.match(r.text, /^Not in front of .+: they are in .*The still is this stage as it stood in front of the person at \d\d:\d\d, before they left/s);
  assert.match(r.text, /"plan" \(p1\)/, "what it held then, in words too");
});

test("no still while the stage keeps changing; only once it is quiet", async () => {
  const quiet = 400;   // long beside the gaps, so a busy machine's late timers cannot read as quiet
  _setCapture(async (s) => { caught.push(s.sessionId); return { type: "image", data: "x", mimeType: "image/jpeg" }; }, quiet, CONFIRM);
  for (let i = 0; i < 4; i++) { setSeen(report("s1")); await wait(40); }
  assert.deepEqual(caught, []);
  await wait(quiet + CONFIRM + 100);
  assert.deepEqual(caught, ["s1"]);
});

test("left while it was caught: the still may hold the next session, so it is not kept", async () => {
  // the person goes to another session while the still is being caught (the catch itself brings the report, so no clock decides it)
  _setCapture(async (s) => { caught.push(s.sessionId); setSeen(report("s2")); return { type: "image", data: `still-of-${s.sessionId}`, mimeType: "image/jpeg" }; }, QUIET, CONFIRM);
  setSeen(report("s1"));
  await wait(QUIET + CONFIRM + 60);
  _setCapture(null);
  assert.equal(caught[0], "s1");
  assert.equal(keptAt("s1"), undefined);
  const r = await look("s1", {});
  assert.equal(r.image, undefined);
  assert.match(r.text, /there is no still of this stage\. What it held when they left/);
});

test("a hidden window is never caught", async () => {
  setSeen(report("s1", { window: { w: 1512, h: 945, visible: false, focused: false } }));
  await wait(QUIET + CONFIRM + 30);
  assert.deepEqual(caught, []);
});

test("only the last six sessions keep a still", async () => {
  for (const s of ["a", "b", "c", "d", "e", "f", "g"]) { setSeen(report(s)); await wait(QUIET + CONFIRM + 20); }
  assert.equal(keptAt("a"), undefined);
  for (const s of ["b", "c", "d", "e", "f", "g"]) assert.ok(keptAt(s), s);
});
