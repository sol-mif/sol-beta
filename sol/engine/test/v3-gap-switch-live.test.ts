// Cowork v3 (fr-30, gap 7 of #574): the switch turned on while the engine runs offers migrate_v3 (and cross) to the
// next session at once, with no restart; turned off, they go. The setting's write (patchSettings) tells the hearers;
// here the env is turned and the same note is made, so the real settings.json is never touched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
process.env.SOL_TEAM = join(tmp("sol-v3gs-team-"), "team.json");
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_STATE = join(tmp("sol-v3gs-state-"), "work.json");
process.env.SOL_HOME = tmp("sol-v3gs-home-");
process.env.SOL_COWORK_V3 = "off";

await import("../src/creature.ts");
const T = await import("../src/work/tools.ts");
const S = await import("../src/settings.ts");
const has = (n: string) => T.WORK_TOOLS.some((t) => t.name === n);

test("off at start: no migrate_v3; turned on while running: offered; turned off: gone", () => {
  assert.equal(has("migrate_v3"), false);
  assert.equal(has("cross"), false);
  const n = T.WORK_TOOLS.length;
  process.env.SOL_COWORK_V3 = "on";
  S.noteCoworkV3();
  assert.equal(has("migrate_v3"), true, "offered as soon as the switch is on");
  assert.equal(has("cross"), true);
  assert.equal(T.WORK_TOOLS.length, n + 2);
  S.noteCoworkV3();
  assert.equal(T.WORK_TOOLS.length, n + 2, "a second note changes nothing");
  process.env.SOL_COWORK_V3 = "off";
  S.noteCoworkV3();
  assert.equal(has("migrate_v3"), false);
  assert.equal(T.WORK_TOOLS.length, n);
});
