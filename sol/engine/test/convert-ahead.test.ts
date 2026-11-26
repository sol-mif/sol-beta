// Saved data newer than this engine (#1820, row 3's prerequisite). A newer release runs a step that changes a store
// under next/, does not start, and the keeper goes back (engine/keep swap_back leaves .went-back): this older release
// puts the data back itself at start (convert/back.ts backAtStart), copying the files as they are first. Whatever is
// still newer than it knows is read-only (next/file.ts): read as it is, never written. Every home is a temp folder.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runConversions, readVersion, BACKUP_DIR, type Ctx, type Step } from "../src/convert/run.ts";
import { backAtStart, WENT_BACK } from "../src/convert/back.ts";
import { KNOWN_V, newerStores, newerUnder, readJson, writeJson } from "../src/next/file.ts";
import { readPos, setPos } from "../src/next/pos.ts";

const temps: string[] = [];
after(() => { for (const d of temps) rmSync(d, { recursive: true, force: true }); });
function home(): Ctx {
  const d = mkdtempSync(join(tmpdir(), "sol-ahead-")); temps.push(d);
  mkdirSync(join(d, "home", "next"), { recursive: true }); mkdirSync(join(d, "engine"));
  return { home: join(d, "home"), dotSol: join(d, "home", ".sol"), engine: join(d, "engine") };
}
const posFile = (c: Ctx) => join(c.home, "next", "pos.json");
const OLD = { v: 1, pos: { "w:/a": { x: 1, y: 2, w: 3, h: 4, by: "person", at: 5, touched: false, folded: false } } };
const NEW = { v: 2, places: [{ id: "w:/a", x: 1, y: 2, w: 3, h: 4 }], later: true };
const none = (id: number, name: string): Step => ({ id, name, touches: () => [], run: () => {} });
const OLDER = [none(1, "a"), none(2, "b"), none(3, "c")];                // what the release the keeper went back to knows
const NEWER = [...OLDER, { id: 4, name: "pos-v2", touches: (c: Ctx) => [posFile(c)], run: (c: Ctx) => writeFileSync(posFile(c), JSON.stringify(NEW)) }];
const read = (f: string) => JSON.parse(readFileSync(f, "utf8"));

/** a home a newer release converted to data-version 4 (pos.json now v2), then the older release started */
function wentPast(c: Ctx) {
  writeFileSync(posFile(c), JSON.stringify(OLD));
  assert.equal(runConversions(c, NEWER).version, 4);
  assert.deepEqual(read(posFile(c)), NEW);
  return runConversions(c, OLDER);
}

test("ahead after the keeper went back: the data goes back to this build's newest step, the files as they were copied first", () => {
  const c = home();
  const s = wentPast(c);
  assert.equal(s.ahead, true);
  writeFileSync(join(c.engine, WENT_BACK), "aaaaaaa\tbbbbbbb\n");
  const r = backAtStart(c, s);
  assert.equal(r.ahead, false);
  assert.equal(r.version, 3);
  assert.equal(readVersion(c.dotSol), 3);
  assert.deepEqual(read(posFile(c)), OLD, "pos.json is the copy taken before step 0004");
  assert.ok(r.back && "kept" in r.back, JSON.stringify(r.back));
  assert.deepEqual([r.back.from, r.back.to], [4, 3]);
  // the copy of how things were before going back: the v2 store, kept where undoBack finds it
  assert.match(r.back.kept, new RegExp(`${BACKUP_DIR}/back-`));
  const m = read(join(r.back.kept, "manifest.json"));
  assert.equal(m.version, 4);
  assert.deepEqual(read(m.files[0].copy), NEW);
  assert.ok(existsSync(join(c.engine, WENT_BACK)), "the mark stays for index.ts, which says it and takes it away");
  assert.deepEqual(newerUnder(join(c.home, "next")), [], "nothing newer is left");
  // the next start finds nothing to do
  assert.equal(backAtStart(c, runConversions(c, OLDER)).back, undefined);
});

test("ahead with no keeper's mark (an older Sol run by hand): the data is left alone, and the newer store is read-only", () => {
  const c = home();
  const s = wentPast(c);
  const r = backAtStart(c, s);
  assert.equal(r, s);
  assert.equal(readVersion(c.dotSol), 4);
  assert.deepEqual(read(posFile(c)), NEW);
  assert.deepEqual(newerUnder(join(c.home, "next")), ["pos.json"]);
});

test("not ahead: a mark alone changes nothing", () => {
  const c = home();
  writeFileSync(posFile(c), JSON.stringify(OLD));
  writeFileSync(join(c.engine, WENT_BACK), "a\tb\n");
  const s = runConversions(c, OLDER);
  assert.equal(backAtStart(c, s), s);
  assert.deepEqual(read(posFile(c)), OLD);
  assert.equal(existsSync(join(c.dotSol, BACKUP_DIR)) && readdirSync(join(c.dotSol, BACKUP_DIR)).some((n) => n.startsWith("back-")), false);
});

test("the copy before the newer step is gone: the version comes back, the store stays newer, and it is read-only", () => {
  const c = home();
  const s = wentPast(c);
  rmSync(join(c.dotSol, BACKUP_DIR, "0004"), { recursive: true });
  writeFileSync(join(c.engine, WENT_BACK), "a\tb\n");
  const r = backAtStart(c, s);
  assert.equal(r.version, 3);
  assert.deepEqual(read(posFile(c)), NEW, "nothing to put back it from");
  assert.deepEqual(newerUnder(join(c.home, "next")), ["pos.json"]);
});

test("a going-back that cannot finish leaves the data ahead and says why", () => {
  const c = home();
  const s = wentPast(c);
  writeFileSync(join(c.engine, WENT_BACK), "a\tb\n");
  const m = read(join(c.dotSol, BACKUP_DIR, "0004", "manifest.json"));
  rmSync(m.files[0].copy);   // the manifest is there, the copied file is not
  const r = backAtStart(c, s);
  assert.equal(r.ahead, true);
  assert.equal(readVersion(c.dotSol), 4);
  assert.ok(r.back && "error" in r.back);
  assert.deepEqual(read(posFile(c)), NEW);
});

test("a store newer than this engine knows: read as it is, never written, by writeJson or by its own writer", () => {
  const c = home(), f = posFile(c);
  const text = JSON.stringify({ ...NEW, v: KNOWN_V + 1, pos: { "w:/b": { x: 9, y: 9, w: 9, h: 9, by: "person", at: 1, touched: false, folded: false } } });
  writeFileSync(f, text);
  const r = readJson(f);
  assert.equal(r.newer, true);
  assert.equal(r.aside, undefined);
  assert.equal(writeJson(f, { v: 1, pos: {} }), false);
  setPos(c.home, "w:/c", { x: 0, y: 0, w: 1, h: 1 } as never, 10);
  assert.equal(readFileSync(f, "utf8"), text, "not a byte changed");
  assert.ok(readPos(c.home).pos["w:/b"], "still read");
  assert.ok(newerStores().includes(f));
  // a store this engine knows, and a new one, are written as before
  const g = join(c.home, "next", "tabs.json");
  assert.equal(writeJson(g, { tabs: [] }), true);
  assert.equal(read(g).v, 1);
  writeFileSync(g, JSON.stringify({ v: KNOWN_V, tabs: [] }));
  assert.equal(writeJson(g, { v: 1, tabs: ["x"] }), true);
  assert.deepEqual(read(g).tabs, ["x"]);
});
