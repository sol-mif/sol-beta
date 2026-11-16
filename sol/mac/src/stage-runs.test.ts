// node --test src/*.test.ts: what runs in the background on the stage (#703): a list whose steps are runs, read from the
// engine's wire as the face reads it; its words (the chip by the talk), its order (the one that needs you on top), its
// hours; a project block's change asks every shown session again. The body is the engine's own, from the fixture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fromEngine, EngineStore } from "./stage/engineStore.ts";
import { chipWords, hours, isRunBody, ordered, runDoing, runWords, thousands, type RunBody } from "./stage/kinds/runs.ts";
import { stateWords } from "./stage/model.ts";
import { runBody } from "../../engine/src/work/background.ts";

// the engine's list body for the fixture, as the engine writes it (its own background.ts, so the two never drift)
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../design/system/fixtures/stage/runs/${name}.json`, import.meta.url), "utf8"));
const asRun = (src: unknown): RunBody => runBody(src, "NucBox") as RunBody;

test("a run's list is told from a plain one; the chip says where and how many", () => {
  const b = asRun(fixture("status"));
  assert.ok(isRunBody(b));
  assert.ok(!isRunBody({ steps: [{ t: "a", st: "" }] }), "a plain list's steps carry no run");
  assert.ok(!isRunBody(undefined));
  assert.ok(isRunBody({ steps: [], where: "NucBox", cap: 14400 }), "an empty run still says where it is");
  assert.equal(chipWords(b), "NucBox · 1 working · 3 done");
  assert.equal(runDoing(b), "working");
  assert.equal(runWords({ steps: [], where: "x", cap: 1 }), "nothing running");
});

test("the one that needs you comes to the top, then the working, then the done; the chip turns to it", () => {
  const b = asRun(fixture("waits"));
  assert.deepEqual(ordered(b).map((s) => s.run.name), ["face", "join", "jelly", "engine"]);
  assert.deepEqual(ordered({ ...b, steps: [...b.steps].reverse() }).map((s) => s.run.name), ["face", "join", "engine", "jelly"], "the face orders what it is given, whatever the source's order");
  assert.equal(runDoing(b), "waits");
  assert.equal(chipWords(b), "NucBox · 1 needs you · 1 working · 2 done");
});

test("minutes of four hours, kept on the track; tokens in thousands", () => {
  assert.deepEqual(hours(41, 14400), { words: "41 min of 4 h", part: 41 / 240 });
  assert.equal(hours(400, 14400).part, 1, "past the cap the track is full, never more");
  assert.equal(thousands(173275), "173k");
  assert.equal(thousands(800), "800");
});

test("the frame's words on a run's list are the chip's; the wire keeps the watch and the scope", () => {
  const body = asRun(fixture("status"));
  const seen = fromEngine({
    stage: { lens: "app", tiled: false, blocks: [{ id: "bg", x: 12, y: 12, w: 340, h: 232, z: 1, folded: true }] },
    blocks: [{ id: "bg", kind: "list", title: "In the background", state: "working", versions: [], sessions: ["s1"], scope: "project", bind: { source: "http://localhost:8797/status.json", watch: "run" }, body: { format: "json", text: JSON.stringify(body) } } as never],
  });
  const b = seen.blocks[0];
  assert.deepEqual(b.bind, { source: "http://localhost:8797/status.json", watch: "run" });
  assert.equal(b.scope, "project");
  assert.ok(isRunBody(b.body));
  assert.equal(stateWords(b), "NucBox · 1 working · 3 done");
});

test("a project block's change asks every session shown again, not only the ones it names", async () => {
  const asked: string[] = [];
  let hear: (m: any) => void = () => {};
  const s = new EngineStore();
  s.connect(async (type: string, a: any) => { if (type === "work.stage.get") asked.push(a.sessionId); return { stage: { lens: "app", tiled: false, blocks: [] }, blocks: [] } as never; }, (f) => { hear = f; return () => {}; });
  s.read("one"); s.read("two");
  await new Promise((r) => setTimeout(r, 60));
  asked.length = 0;
  hear({ type: "work.stage.changed", block: { id: "bg", state: "working", sessions: ["one"], scope: "project" } });
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(asked.sort(), ["one", "two"]);
  asked.length = 0;
  hear({ type: "work.stage.changed", block: { id: "card", state: "live", sessions: ["one"] } });
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(asked, ["one"], "a session's own block asks only its sessions");
});
