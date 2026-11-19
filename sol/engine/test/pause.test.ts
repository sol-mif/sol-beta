// The pause signal (#1597, src/pause.ts and parts/pause.ts): off by default it tells nothing and a question goes at
// once; on, a sense from the app makes one pause, told to the faces, closer ones fold into it, and each pause lets one
// waiting question through. On a settings file of its own (SOL_SETTINGS), so the real settings.json is never touched.
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

const DIR = mkdtempSync(join(tmpdir(), "sol-pause-"));
process.env.SOL_SETTINGS = join(DIR, "settings.json");
process.env.SOL_VERSION = "concept";   // even the team's own Sol: pause.signal has no station, so it is off until set
delete process.env.SOL_PAUSE;
after(() => { delete process.env.SOL_PAUSE; delete process.env.SOL_VERSION; rmSync(DIR, { recursive: true, force: true }); });

const P = await import("../src/pause.ts");
const S = await import("../src/settings.ts");
const part = (await import("../src/parts/pause.ts")).default;

let told: any[] = [];
beforeEach(() => { delete process.env.SOL_PAUSE; P.resetPause(); told = []; P.setPauseFaces((m) => told.push(m)); });

test("off by default: a sense makes no pause and a question goes at once", () => {
  assert.equal(S.pauseSignal(), false);
  assert.equal(P.sensed("typing", 10_000), false);
  assert.deepEqual(told, []);
  let shown = 0;
  P.atNextPause(() => { shown++; });
  assert.equal(shown, 1);
  assert.equal(P.pauseNow().waiting, 0);
});

test("the setting pause.signal turns it on, and false is kept", () => {
  S.patchSettings({ pause: { signal: true } });
  assert.equal(S.pauseSignal(), true);
  S.patchSettings({ pause: { signal: "yes" } as any });   // not a boolean: dropped, the true stays
  assert.equal(S.pauseSignal(), true);
  S.patchSettings({ pause: { signal: false } });
  assert.equal(S.pauseSignal(), false);
});

test("on: one pause per moment, told to the faces with its why", () => {
  process.env.SOL_PAUSE = "on";
  assert.equal(P.sensed("typing", 10_000), true);
  assert.equal(P.sensed("app", 11_000), false, "an app switch 1 s later is the same moment");
  assert.equal(P.sensed("call", 10_000 + P.GAP_MS), true);
  assert.deepEqual(told, [{ type: "pause", why: "typing", at: 10_000 }, { type: "pause", why: "call", at: 10_000 + P.GAP_MS }]);
  assert.equal(P.pauseNow().lastWhy, "call");
});

test("on: an unknown why senses nothing", () => {
  process.env.SOL_PAUSE = "on";
  for (const w of ["", "keys", null, 3, { why: "app" }]) assert.equal(P.sensed(w, 50_000), false);
  assert.deepEqual(told, []);
});

test("on: a question waits for the next pause, one question per pause, oldest first; a cancelled one never shows", () => {
  process.env.SOL_PAUSE = "on";
  const shown: string[] = [];
  P.atNextPause(() => shown.push("a"));
  const cancel = P.atNextPause(() => shown.push("b"));
  P.atNextPause(() => shown.push("c"));
  assert.deepEqual(shown, []);
  cancel();
  P.sensed("typing", 100_000);
  assert.deepEqual(shown, ["a"]);
  P.sensed("app", 100_000 + P.GAP_MS);
  assert.deepEqual(shown, ["a", "c"]);
  assert.equal(P.pauseNow().waiting, 0);
});

test("on: a question that throws does not stop the pause, and past WAIT_MAX the oldest goes at once", () => {
  process.env.SOL_PAUSE = "on";
  P.atNextPause(() => { throw new Error("boom"); });
  assert.equal(P.sensed("typing", 200_000), true);
  assert.equal(told.length, 1);
  let first = 0;
  P.atNextPause(() => { first++; });
  for (let i = 0; i < P.WAIT_MAX; i++) P.atNextPause(() => {});
  assert.equal(first, 1);
  assert.equal(P.pauseNow().waiting, P.WAIT_MAX);
});

// the part's route, asked through a stand-in registry and request
function routeOf() {
  let fn: any = null, start: any = null;
  part({ route: (_m: string, _p: string, f: any) => { fn = f; }, atStart: (f: any) => { start = f; } } as any);
  start({ everyone: (m: object) => told.push(m) });
  return async (body: string, type = "application/json") => {
    const req = Object.assign(Readable.from([body]), { headers: { "content-type": type } });
    let status = 0, out = "", head: Record<string, unknown> = {};
    const res = { writeHead: (s: number, h?: Record<string, unknown>) => { status = s; head = h ?? {}; }, end: (b?: string) => { out = b ?? ""; } };
    await fn({ req, res });
    if (out) assert.equal(head["content-length"], Buffer.byteLength(out), "a length, never chunked (pause.rs reads it plainly)");
    return { status, body: out ? JSON.parse(out) : null };
  };
}

test("POST /pause: JSON only; off answers on: false; on, a known why pauses", async () => {
  const ask = routeOf();
  assert.equal((await ask("{}", "text/plain")).status, 415);
  assert.deepEqual((await ask(JSON.stringify({ why: "app" }))).body, { on: false, paused: false });
  process.env.SOL_PAUSE = "on";
  assert.deepEqual((await ask(JSON.stringify({ why: "app" }))).body, { on: true, paused: true });
  assert.deepEqual((await ask("not json")).body, { on: true, paused: false });
  assert.equal(told.length, 1);
  assert.equal(told[0].type, "pause");
  assert.deepEqual((await ask(JSON.stringify({ why: "call", pad: "x".repeat(2000) }))).body, { on: true, paused: false }, "past the cap: answered, nothing sensed");
});

test("POST /pause with no why only asks: answers on, senses nothing, and the next real sense still pauses (#1640)", async () => {
  const ask = routeOf();
  assert.deepEqual((await ask("{}")).body, { on: false, paused: false });
  process.env.SOL_PAUSE = "on";
  assert.deepEqual((await ask("{}")).body, { on: true, paused: false });
  assert.deepEqual(told, [], "an ask tells no face");
  assert.equal(P.pauseNow().lastAt, null, "an ask is not a pause, so it holds back none within GAP_MS");
  assert.deepEqual((await ask(JSON.stringify({ why: "typing" }))).body, { on: true, paused: true });
});
