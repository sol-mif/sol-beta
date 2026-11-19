// Home's world (#1093): world.md is created only when it is still not there (an empty hash), never over one made meanwhile
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeText } from "../src/work/panes.ts";

test("an empty hash is a create: written when the file is not there, refused when it is", () => {
  const d = mkdtempSync(join(tmpdir(), "w3-")), f = join(d, "world.md");
  assert.equal(writeText(f, "new\n", "").ok, true);
  assert.equal(readFileSync(f, "utf8"), "new\n");
  writeFileSync(f, "his own\n");
  assert.deepEqual(writeText(f, "over\n", ""), { changed: true });
  assert.equal(readFileSync(f, "utf8"), "his own\n", "a file made meanwhile is never written over");
  assert.deepEqual(writeText(f, "x", "not its hash"), { changed: true }, "a hash still guards as before");
});
