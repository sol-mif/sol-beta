// Home on the stage (#692): a page block's Sol address, read before Home loads (home/p2/address.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { folderNamed, homeSrc } from "./home/p2/address.ts";
import type { Folder } from "./home/p2/pass2.ts";

test("a Sol address: Home, a place, the knobs; anything else is not Home's", () => {
  assert.deepEqual(homeSrc("sol://home"), { at: "home" });
  assert.deepEqual(homeSrc("sol://home/"), { at: "home" });
  assert.deepEqual(homeSrc("sol://home/world"), { at: "home", place: "world" });
  assert.deepEqual(homeSrc("sol://home/today"), { at: "home", place: "today" });
  assert.deepEqual(homeSrc("sol://home/folder/bio%20201"), { at: "home", place: { folder: "bio 201" } });
  assert.deepEqual(homeSrc("sol://home/folder/school/bio 201"), { at: "home", place: { folder: "school/bio 201" } });
  assert.deepEqual(homeSrc("sol://home/knobs"), { at: "knobs" });
  assert.deepEqual(homeSrc("sol://home/folder"), { at: "home" });
  assert.equal(homeSrc("https://example.com"), null);
  assert.equal(homeSrc("sol://homes"), null);
  assert.equal(homeSrc(undefined), null);
});

const f = (id: string, name: string, crumb: string[]): Folder => ({ id, slug: name.replace(/\s+/g, "-"), name, parent: null, crumb, agent: null, dial: "read", rule: "", tools: [], counts: { waits: 0, running: 0 } });
test("a folder named in an address: by id, slug, name or crumb, any case", () => {
  const fs = [f("f1", "school", ["school"]), f("f2", "bio 201", ["school", "bio 201"])];
  assert.equal(folderNamed(fs, "f2")?.id, "f2");
  assert.equal(folderNamed(fs, "bio-201")?.id, "f2");
  assert.equal(folderNamed(fs, "Bio 201")?.id, "f2");
  assert.equal(folderNamed(fs, "school/bio 201")?.id, "f2");
  assert.equal(folderNamed(fs, "nowhere"), undefined);
});
