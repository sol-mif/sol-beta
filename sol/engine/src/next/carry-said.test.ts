// The move-in's read 2 (carry-said.ts; migration.html B): the person's own words only open folders read 1 skipped, and
// read 1's answer is all still there, as it was. Lucy is invented.
// Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { carry, fsReader } from "./carry.js";
import { fold, saidPlaces, wordsOf } from "./carry-said.js";
import { holdsAll } from "./movein-place.js";

const WORDS = "I run a small studio that makes websites for restaurants. Evenings I'm finishing a course on typography, and I keep the flat's paperwork somewhere";

/** Lucy's Mac: her Sol home (read 1's), and folders of her own that no AI ever worked in */
function lucy() {
  const root = fs.mkdtempSync(join(tmpdir(), "sol-next-said-")), user = join(root, "lucy"), sol = join(user, ".sol");
  const dir = (p: string) => fs.mkdirSync(join(user, p), { recursive: true });
  const file = (p: string, t = "x") => { fs.mkdirSync(join(user, p, ".."), { recursive: true }); fs.writeFileSync(join(user, p), t); };
  dir(".sol/studio");
  file(".sol/studio/stickies.md", "- [ ] send the menu\n");
  dir("Documents/Restaurant sites/Bistro Lune");      // her words open it; inside a match is not looked into
  dir("Documents/Restaurant sites/typography-old");   // inside a match: never a place of its own
  dir("Documents/Typography Course");
  dir("Desktop/flatPaperwork");                       // camelCase: "flat" and "paperwork"
  dir("Pictures/Holiday");                            // her words say nothing of it
  dir(".hidden/typography");                          // hidden: never opened
  dir("Library/Typography");                          // holds everything: never a place
  dir("code/menus/node_modules/typography");          // node_modules: never opened
  dir("Dropbox/Studio things");                       // in a sync root: a place
  return { root, user, sol };
}
function tree(dir: string): string {
  const h = createHash("sha256");
  const walk = (p: string) => { for (const n of fs.readdirSync(p).sort()) { const q = join(p, n), st = fs.lstatSync(q); h.update(q + (st.isDirectory() ? "/" : ":" + fs.readFileSync(q, "utf8"))); if (st.isDirectory()) walk(q); } };
  walk(dir);
  return h.digest("hex");
}

test("her words, folded: four letters or more, no empty word, each once, as she wrote it first", () => {
  const w = wordsOf(WORDS);
  assert.equal(w.get("restaurant"), "restaurants");
  assert.equal(w.get("typography"), "typography");
  assert.equal(w.get("flat"), "flat");
  for (const gone of ["that", "somewhere", "keep", "run", "a", "on", "and"]) assert.ok(![...w.keys()].includes(fold(gone)), gone);
  assert.equal(fold("Cafés"), "cafe");
  assert.equal(fold("glass"), "glass", "a double s is not a plural");
  assert.equal(wordsOf("").size, 0);
});

test("read 2 opens the folders of her home her words name: whole words, never hidden, node_modules or what holds everything, never inside a match", () => {
  const { root, user } = lucy();
  const got = saidPlaces(wordsOf(WORDS), user, fsReader, { skip: (q) => holdsAll(q, [user]) });
  const by = new Map(got.map((s) => [s.path.slice(user.length + 1), s.said]));
  assert.deepEqual([...by.keys()].sort(), ["Desktop/flatPaperwork", "Documents/Restaurant sites", "Documents/Typography Course", "Dropbox/Studio things"]);
  assert.deepEqual(by.get("Documents/Restaurant sites"), ["restaurants"], "said as she wrote it");
  assert.deepEqual(by.get("Desktop/flatPaperwork"), ["flat", "paperwork"]);
  assert.deepEqual(saidPlaces(new Map(), user, fsReader), [], "no words: nothing opened");
  fs.rmSync(root, { recursive: true, force: true });
});

test("carry with her words: read 1's answer stays whole and in its order; the new folders come after it, from \"said\"; nothing is written", () => {
  const { root, user, sol } = lucy();
  const before = tree(root);
  const one = carry({ home: sol });
  const two = carry({ home: sol, said: { words: WORDS, user, never: (q) => holdsAll(q, [user, sol]) || q.startsWith(sol + "/") } });
  assert.deepEqual(two.places.slice(0, one.places.length), one.places, "never filtered, hidden or reordered");
  const added = two.places.slice(one.places.length);
  assert.ok(added.length >= 3 && added.every((p) => p.from === "said" && p.said?.length && p.id === p.path), "each new one says it came from her words");
  assert.ok(!two.places.some((p) => p.path.startsWith(sol + "/") && p.from === "said"), "never inside Sol's own home");
  assert.equal(tree(root), before, "read only");
  // with no words it is read 1 exactly
  assert.deepEqual(carry({ home: sol, said: { words: "", user } }).places, one.places);
  fs.rmSync(root, { recursive: true, force: true });
});

test("a place read 1 found that her words name too gains them, and is not looked inside", () => {
  const { root, user, sol } = lucy();
  const studio = join(user, "work", "Studio");
  fs.mkdirSync(join(studio, "Typography"), { recursive: true });
  // read 1 finds the studio as a folder added to Sol (work.json)
  const wj = join(root, "work.json");
  fs.writeFileSync(wj, JSON.stringify({ folders: [studio] }));
  const r = carry({ home: sol, state: wj, said: { words: "the studio's typography", user } });
  const s = r.places.find((p) => p.path === studio);
  assert.equal(s?.from, "work", "still what read 1 saw");
  assert.deepEqual(s?.said, ["studio"]);
  assert.ok(!r.places.some((p) => p.path === join(studio, "Typography")), "inside a place read 1 found: not opened");
  fs.rmSync(root, { recursive: true, force: true });
});

test("carry-said.ts touches the disk only through the Reader", () => {
  const src = fs.readFileSync(new URL("./carry-said.ts", import.meta.url), "utf8");
  assert.ok(!/from "node:fs|from "fs|node:child_process|from "\.\/file\.js"/.test(src));
});
