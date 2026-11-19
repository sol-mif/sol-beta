// Home's world (#1093): part 5's registry counted by area (src/agent/areas.ts), on a made-up tree and on the real one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { countAreas, readAreas } from "../src/agent/areas.ts";

test("each area counts the systems filed under it, the broken ones, and parked from the area's own state", () => {
  const tree: Record<string, any> = {
    "/r": ["night.json", "legacy.json", "jelly.json", "night", "legacy"],
    "/r/night": ["a.json", "b.json", "deep"], "/r/night/deep": ["c.json"], "/r/legacy": ["x.json"],
  };
  const recs: Record<string, any> = {
    "/r/night.json": { id: "night", kind: "area", state: "live" }, "/r/legacy.json": { id: "legacy", kind: "area", state: "legacy" },
    "/r/jelly.json": { id: "jelly", kind: "root" }, "/r/night/a.json": { state: "broken" }, "/r/night/b.json": { state: "live" },
    "/r/night/deep/c.json": { state: "broken" }, "/r/legacy/x.json": { state: "legacy" },
  };
  const got = countAreas("/r", { list: (d) => tree[d] ?? [], isDir: (p) => p in tree, read: (f) => recs[f] ?? null });
  assert.deepEqual(got, [{ area: "legacy", n: 1, broken: 0, parked: true }, { area: "night", n: 3, broken: 2, parked: false }]);
});

test("the real registry reads: areas with systems, none empty", () => {
  const a = readAreas();
  assert.ok(a, "sol/systems/records is in this checkout (part 5 joined the trunk)");
  assert.ok(a.length >= 10);
  assert.ok(a.every((x) => x.n > 0 && x.broken <= x.n));
});
