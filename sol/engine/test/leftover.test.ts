// A part left over from another build (src/leftover.ts): built, with src/parts/ beside dist and no source of its own in
// it, it answers nothing; with its source, under tsx, or built with no sources beside it, it is a part as any other
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { leftover } from "../src/leftover.ts";

const root = mkdtempSync(join(tmpdir(), "sol-leftover-"));
after(() => rmSync(root, { recursive: true, force: true }));
const url = (...p: string[]) => pathToFileURL(join(root, ...p)).href;

test("built, its source gone from src/parts/: left over; its source there, under tsx, or no sources beside: not", () => {
  mkdirSync(join(root, "engine", "dist", "parts"), { recursive: true });
  mkdirSync(join(root, "engine", "src", "parts"), { recursive: true });
  writeFileSync(join(root, "engine", "src", "parts", "kept.ts"), "");
  assert.equal(leftover(url("engine", "dist", "parts", "gone.js")), true);
  assert.equal(leftover(url("engine", "dist", "parts", "kept.js")), false);
  assert.equal(leftover(url("engine", "src", "parts", "gone.ts")), false, "under tsx it is the source itself");
  mkdirSync(join(root, "bare", "dist", "parts"), { recursive: true });
  assert.equal(leftover(url("bare", "dist", "parts", "gone.js")), false, "not a checkout: every part is its build's");
});
