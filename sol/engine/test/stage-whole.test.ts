// The engine's switch stage.whole (Build, #820 to #826; settings.ts stageWhole()): on unless someone sets it false (#691), turned
// by the setting, and SOL_STAGE_WHOLE deciding first, both ways. On a settings file of its own (SOL_SETTINGS), so the
// real settings.json is never touched.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "sol-stage-whole-"));
const FILE = join(DIR, "settings.json");
process.env.SOL_SETTINGS = FILE;
delete process.env.SOL_STAGE_WHOLE;
after(() => { delete process.env.SOL_STAGE_WHOLE; rmSync(DIR, { recursive: true, force: true }); });

const S = await import("../src/settings.ts");
// without the switch there is nothing to try, and without SOL_SETTINGS a patch below would write the real file
if (typeof (S as any).stageWhole !== "function") rmSync(DIR, { recursive: true, force: true }); // no hook runs after this
assert.equal(typeof (S as any).stageWhole, "function", "settings.ts has no stageWhole()");
const onDisk = () => JSON.parse(readFileSync(FILE, "utf8"));
const env = (v?: string) => { if (v === undefined) delete process.env.SOL_STAGE_WHOLE; else process.env.SOL_STAGE_WHOLE = v; };

test("absent is on (#691), and the settings are today's: no stage key, in what a face is sent or in the file", () => {
  assert.equal(S.stageWhole(), true);
  assert.equal("stage" in S.getSettings(), false);
  assert.equal(existsSync(FILE), false, "reading writes nothing");
  S.patchSettings({ patienceMs: 700 });
  assert.equal(S.stageWhole(), true);
  assert.equal("stage" in S.getSettings(), false, "a patch of something else does not bring the key in");
  assert.equal("stage" in onDisk(), false);
});

test("the setting turns it on and off again, and it is in the file for the next start", async () => {
  assert.deepEqual(S.patchSettings({ stage: { whole: true } }).stage, { whole: true });
  assert.equal(S.stageWhole(), true);
  assert.deepEqual(onDisk().stage, { whole: true });
  // an engine started now reads the file, not this one's memory
  const next = await import("../src/settings.ts?next-start");
  assert.notEqual(next.getSettings(), S.getSettings(), "a second reading of the file");
  assert.equal(next.stageWhole(), true);
  S.patchSettings({ stage: { whole: false } });
  assert.equal(S.stageWhole(), false);
  assert.deepEqual(onDisk().stage, { whole: false });
});

test("a patch of something else leaves the switch as it was, and a patch of the switch leaves the rest", () => {
  S.patchSettings({ stage: { whole: true }, patienceMs: 800 });
  S.patchSettings({ look: { text: 18 } });
  assert.equal(S.stageWhole(), true);
  S.patchSettings({ stage: {} });
  assert.equal(S.stageWhole(), true, "an empty stage patch takes nothing away");
  S.patchSettings({ stage: { whole: false } });
  assert.equal(S.getSettings().patienceMs, 800);
  assert.equal(S.getSettings().look.text, 18);
});

test("what is not a boolean is dropped, so a bad patch cannot turn it on: a false set stays false", () => {
  for (const bad of [{ stage: { whole: "on" } }, { stage: { whole: 1 } }, { stage: true }, { stage: ["whole"] }, { stage: { other: true } }]) {
    S.patchSettings({ stage: { whole: false } });
    S.patchSettings(bad);
    assert.equal(S.stageWhole(), false, JSON.stringify(bad));
    assert.equal("other" in (S.getSettings().stage ?? {}), false, "a key the engine does not know is not kept");
  }
});

test("SOL_STAGE_WHOLE wins both ways; when it says nothing the setting decides", () => {
  try {
    S.patchSettings({ stage: { whole: false } });
    for (const on of ["on", "1", "true", " ON ", "True"]) { env(on); assert.equal(S.stageWhole(), true, `off in the settings, ${JSON.stringify(on)} in the env`); }
    S.patchSettings({ stage: { whole: true } });
    for (const off of ["off", "0", "false", " OFF ", "False"]) { env(off); assert.equal(S.stageWhole(), false, `on in the settings, ${JSON.stringify(off)} in the env`); }
    assert.deepEqual(onDisk().stage, { whole: true }, "the env never writes the setting");
    for (const nothing of ["", "  ", "maybe", undefined]) {
      env(nothing);
      S.patchSettings({ stage: { whole: true } });
      assert.equal(S.stageWhole(), true, `${JSON.stringify(nothing)} says nothing`);
      S.patchSettings({ stage: { whole: false } });
      assert.equal(S.stageWhole(), false, `${JSON.stringify(nothing)} says nothing`);
    }
  } finally { env(undefined); }
});
