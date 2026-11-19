// Pause updates (#1566, settings.ts updatesPaused): off unless the person sets it, written only once set, and a patch
// that is not { paused: boolean } takes nothing away. Ship reads it at each look (team/ship.ts installDev; its own test
// in together-ship.test.ts). On a settings file of its own, so the real settings.json is never touched.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "sol-paused-"));
process.env.SOL_SETTINGS = join(DIR, "settings.json");
after(() => rmSync(DIR, { recursive: true, force: true }));
const S = await import("../src/settings.ts");

test("pause updates: off unset, on once set, a bad patch keeps it, off again by hand", () => {
  assert.equal(S.updatesPaused(), false);
  assert.equal(S.getSettings().updates, undefined, "not written until someone sets it");
  S.patchSettings({ updates: { paused: true } });
  assert.equal(S.updatesPaused(), true);
  assert.deepEqual(JSON.parse(readFileSync(join(DIR, "settings.json"), "utf8")).updates, { paused: true });
  S.patchSettings({ updates: { paused: "yes" } });
  S.patchSettings({ updates: null });
  assert.equal(S.updatesPaused(), true, "a patch that is not a boolean takes nothing away");
  S.patchSettings({ updates: { paused: false } });
  assert.equal(S.updatesPaused(), false);
});
