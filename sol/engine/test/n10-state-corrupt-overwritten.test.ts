// state.ts: Sol's marks (pins, groups, folders, the side's order, the drawers' prefs) "live in one small JSON file".
// A file that does not parse (a hand edit's stray comma, a foreign writer's torn write) is read as empty, and the next
// mark (opening any session marks it seen) writes the empty state over it: every pin, group and pref is gone, no copy kept.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const D = mkdtempSync(join(tmpdir(), "n10-state-"));
const F = join(D, "work.json");
process.env.SOL_STATE = F;
const good = { marks: { a: { pinned: true }, b: { group: "g1" } }, groups: [{ id: "g1", name: "launch", at: 1 }], folders: ["/x"], hidden: [], order: ["g:g1"] };
writeFileSync(F, JSON.stringify(good, null, 1).replace('"launch",', '"launch",,'));   // one stray comma
const S = await import("../src/work/state.ts");

test("a work.json that does not parse is not overwritten with an empty one", async () => {
  S.mark("c", { seen: Date.now() });                // Marco opens a session
  await new Promise((r) => setTimeout(r, 400));     // the debounced save
  const now = readFileSync(F, "utf8");
  const kept = now.includes("launch") || readdirSync(D).some((f) => f !== "work.json" && readFileSync(join(D, f), "utf8").includes("launch"));
  assert.ok(kept, `the pins and the group are gone, no copy kept; work.json is now: ${now.replace(/\s+/g, " ").slice(0, 120)}`);
});
