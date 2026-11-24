// Places in Sol's own home are the person's areas only (#1615; src/home/places.ts diskFolders, rules.ts areaTops): a home
// that holds the engine's stores (next, items, flows, walk, ...) and the person's school folder gives, with the record's
// areas [school], school and its classes; with no area, nothing under the home. Below an area it is as anywhere.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diskFolders, placesMsg } from "../src/home/places.ts";
import { areaTops } from "../src/home/rules.ts";
import { registerSource } from "../src/home/sources.ts";
import { filesSource } from "../src/home/source-files.ts";
import { rig, cleanup } from "./fixtures/home/rig.ts";
import { newThing } from "../src/home/items.ts";

const dirs: string[] = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); cleanup(); });
const tmp = (): string => { const d = mkdtempSync(join(tmpdir(), "sol-own-")); dirs.push(d); return d; };
/** the home's own place comes first (the folder read); `below` is every place under it, as the crumb after its name */
const below = (raw: ReturnType<typeof diskFolders>): string[] => raw.slice(1).map((r) => r.path.slice(raw[0].path.length + 3));
const STORES = ["next", "items", "flows", "walk", "browser-profile", "data-undo", "school/bio", "school/chem"];
const make = (home: string, ps: string[] = STORES) => { for (const p of ps) mkdirSync(join(home, p), { recursive: true }); };

test("the record's areas name the folders of Sol's home: the first name of each id", () => {
  assert.deepEqual(areaTops({ areas: [{ id: "school", name: "School" }, { id: "school/bio", name: "Bio" }, { id: "jobs" }, { name: "no id" }, { id: "" }] }), ["school", "jobs"]);
  assert.deepEqual(areaTops({}), []);
  assert.deepEqual(areaTops(null), []);
});

test("in Sol's home only the record's areas are places, with what is two deep below them", () => {
  const home = tmp(), user = tmp();
  make(home);
  assert.deepEqual(below(diskFolders({ reads: [home], never: [] }, user, [home], ["school"])), ["school", "school › bio", "school › chem"]);
});

test("a record with no area leaves Sol's home with nothing under it", () => {
  const home = tmp(), user = tmp();
  make(home);
  assert.deepEqual(below(diskFolders({ reads: [home], never: [] }, user, [home], [])), []);
});

test("below an area nothing is judged: a folder called items inside school stays", () => {
  const home = tmp(), user = tmp();
  make(home, ["school/items", "next"]);
  assert.deepEqual(below(diskFolders({ reads: [home], never: [] }, user, [home], ["school"])), ["school", "school › items"]);
});

test("a folder that is not Sol's home keeps every folder", () => {
  const dir = tmp(), user = tmp();
  make(dir, ["next", "school"]);
  assert.deepEqual(below(diskFolders({ reads: [dir], never: [] }, user, [], [])), ["next", "school"]);
});

test("placesMsg: the engine's home and the record in the person's own folder give school and its classes", () => {
  const user = tmp(), r = rig({ now: 1_700_000_000_000 });
  make(r.home);
  // the files source as Home's start registers it, with this test's own folder as the person's (its record names r.home)
  registerSource(r.ctx, filesSource(r.home, user));
  const record = (areas: object[]) => { mkdirSync(join(user, ".sol", "record"), { recursive: true }); writeFileSync(join(user, ".sol", "record", "me.json"), JSON.stringify({ solHome: r.home, areas })); };
  record([{ id: "school", name: "School" }]);
  // the home is the folder read (its own row first), with the area below it and nothing of the engine's
  assert.deepEqual(placesMsg(r.ctx, user).places.map((p) => p.path), ["home", "home › school", "home › school › bio", "home › school › chem"]);
  record([]);
  assert.deepEqual(placesMsg(r.ctx, user).places.map((p) => p.path), ["home"]);
});

test("a Thing filed under a store of Sol's own (a session's project folder in its home) makes no place of the person's (#1816)", () => {
  const user = tmp(), r = rig({ now: 1_700_000_000_000 });
  make(r.home, ["school", "sol/sessions", "sol/blocks", "next"]);
  writeFileSync(join(r.home, "sol", "pieces-seen.json"), "{}");
  registerSource(r.ctx, filesSource(r.home, user));
  mkdirSync(join(user, ".sol", "record"), { recursive: true });
  writeFileSync(join(user, ".sol", "record", "me.json"), JSON.stringify({ solHome: r.home, areas: [{ id: "school", name: "School" }] }));
  const at = 1_700_000_000_000;
  for (const [id, folder] of [["t-sol", "sol"], ["t-next", "next"], ["t-trip", "trips"]]) newThing(r.ctx, { id, read: "you", folder, words: id, state: "you", waitsOn: "you", at, links: [], made: [] });
  const you = placesMsg(r.ctx, user).places.filter((p) => p.from.source === "you").map((p) => p.path);
  assert.deepEqual(you, ["trips"], "the person's own folder name stays a place; Sol's stores never are");
});
