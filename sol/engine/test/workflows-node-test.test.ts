// `node --test <folder>` ran a folder's tests up to Node 22; on Node 24 a folder named there is loaded as a module and
// fails with MODULE_NOT_FOUND. The release workflow's feed job did that, so dev-20261124-1219 went out with no
// latest.json and Sol.app could not update itself (#1850, #1824). So every `node --test` in a workflow names its files
// (or a glob), never a folder. Every workflow by its text, with no YAML package.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { devOnly, ROOT } from "./dev-copy.ts";

/** the folders a workflow's text hands to `node --test`: an argument ending in /, or one that is a folder here */
function folders(y: string, isDir: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const m of y.matchAll(/node\s+--test\s+([^\n#&|;]*)/g)) {
    for (const a of m[1].trim().split(/\s+/)) {
      if (!a || a.startsWith("-") || /[*?]/.test(a)) continue;
      if (a.endsWith("/") || isDir(a)) out.push(a);
    }
  }
  return out;
}

test("the check itself: a folder is caught, named files and globs pass", () => {
  const none = () => false;
  assert.deepEqual(folders("run: node --test sol/mac/release/", none), ["sol/mac/release/"]);
  assert.deepEqual(folders("run: node --test sol/mac/release", (p) => p === "sol/mac/release"), ["sol/mac/release"]);
  assert.deepEqual(folders("run: node --test sol/mac/release/feed.test.mjs   # named", none), []);
  assert.deepEqual(folders("run: node --test sol/a.test.mjs && node sol/a.mjs --check", none), []);
  assert.deepEqual(folders("run: node --test --test-reporter=spec sol/mac/release/*.test.mjs", none), []);
});

test("no workflow hands `node --test` a folder, which Node 24 loads as a module (#1850)", { skip: devOnly(".github/workflows") }, () => {
  const dir = join(ROOT, ".github", "workflows");
  const isDir = (p: string) => existsSync(join(ROOT, p)) && statSync(join(ROOT, p)).isDirectory();
  const bad = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))
    .flatMap((f) => folders(readFileSync(join(dir, f), "utf8"), isDir).map((a) => `${f}: node --test ${a}`));
  assert.deepEqual(bad, [], "name the test files (or a glob) instead of the folder");
});
