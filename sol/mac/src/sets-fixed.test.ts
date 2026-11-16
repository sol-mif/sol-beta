// node --test src/*.test.ts (npm test here): the face's fixed-colour check (home/frameRules.ts setsFixed, #634) on the
// fixtures the engine's own check is held to (home/sets-fixed.json; engine/test/after-release.test.ts reads the same
// file): only a custom-property declaration in css sets one, never prose, a comment, a script or a string.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setsFixed } from "./home/frameRules.ts";

const F: { fixed: string[]; cases: { html: string; sets: string[]; why: string }[] } = JSON.parse(readFileSync(new URL("./home/sets-fixed.json", import.meta.url), "utf8"));

test("the face's setsFixed: the same verdict as the engine's on every shared fixture", () => {
  for (const c of F.cases) assert.deepEqual(setsFixed(c.html, F.fixed), c.sets, c.why);
});
