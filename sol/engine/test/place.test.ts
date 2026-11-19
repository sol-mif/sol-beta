// Where a folder belongs (#1016, src/work/place.ts): inside Home is Home's, a code project inside Home is both, the
// rest is Build's. Pure: the disk is a set of folders that hold a .git.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { placeOf, withPlace } from "../src/work/place.js";

const ROOT = "/u/sol/home";
const gits = new Set(["/u/sol/home/school/ds480/viz", "/u/code/sol-dev"]);
const git = (d: string) => gits.has(d);

test("a folder outside Home is Build's: no place at all", () => {
  assert.deepEqual(placeOf("/u/code/sol-dev", ROOT, git), {});
  assert.deepEqual(placeOf("/u/sol/homework", ROOT, git), {}, "a sibling whose name starts the same is not inside");
  assert.deepEqual(placeOf("/u/sol", ROOT, git), {}, "the folder Home sits in is not Home");
});

test("a folder inside Home is Home's, its area the first folder under the root", () => {
  assert.deepEqual(placeOf("/u/sol/home/school/ds480", ROOT, git), { place: "home", area: "school" });
  assert.deepEqual(placeOf("/u/sol/home/jobs", ROOT, git), { place: "home", area: "jobs" });
  assert.deepEqual(placeOf("/u/sol/home", ROOT, git), { place: "home", area: "home" });
});

test("a code project inside Home is both, and so is a folder inside it", () => {
  assert.deepEqual(placeOf("/u/sol/home/school/ds480/viz", ROOT, git), { place: "both", area: "school" });
  assert.deepEqual(placeOf("/u/sol/home/school/ds480/viz/src", ROOT, git), { place: "both", area: "school" });
  assert.deepEqual(placeOf("/u/sol/home/school/ds480", ROOT, git), { place: "home", area: "school" }, "the class folder above it stays Home's");
});

test("Home's own repo (the one Home sits in) never makes a Home folder code", () => {
  const all = (d: string) => d === "/u/sol" || d === "/u";
  assert.deepEqual(placeOf("/u/sol/home/desk", ROOT, all), { place: "home", area: "desk" });
});

test("withPlace reads the disk: nothing moved, fields only added, a Build folder left as it was", () => {
  const t = realpathSync(mkdtempSync(join(tmpdir(), "place-")));   // macOS: /var is a link to /private/var (#1258)
  try {
    const root = join(t, "home");
    mkdirSync(join(root, "school", "la245"), { recursive: true });
    mkdirSync(join(root, "school", "la245", "site", ".git"), { recursive: true });
    mkdirSync(join(t, "code", "app"), { recursive: true });
    const list = [{ path: join(t, "code", "app"), name: "app", count: 2 }, { path: join(root, "school", "la245"), name: "la245", count: 1 },
      { path: join(root, "school", "la245", "site"), name: "site", count: 3 }];
    const out = withPlace(list, root);
    assert.equal(out[0], list[0], "a Build folder is the same object");
    assert.deepEqual(out[1], { ...list[1], place: "home", area: "school" });
    assert.deepEqual(out[2], { ...list[2], place: "both", area: "school" });
  } finally { rmSync(t, { recursive: true, force: true }); }
});
