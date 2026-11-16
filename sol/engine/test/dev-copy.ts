// A tester's copy is the beta export (src/team/ship.ts BETA_KEEP): what Sol runs, and none of the dev's door. A test
// that reads one of the dev's files (sol/promote, .github/CODEOWNERS, sol/mine/live, sol/buttons/check, sol/hub) has
// nothing to read there, and a failure would tell the tester something is wrong with their Mac when nothing is (#300).
// Such a test skips there and says why. In a dev checkout every file is there and nothing is skipped.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export const ROOT = resolve(import.meta.dirname, "..", "..", "..");
/** every file of sol/harness as it is in this checkout, by its path from the root: the guard, sol-dev.mjs, and whatever
 * else the harness grows (#484's shell.mjs), so a test that ships the harness ships all of it (#479) */
export function harnessFiles(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (rel: string) => {
    for (const name of readdirSync(join(ROOT, rel))) {
      const path = `${rel}/${name}`;
      if (statSync(join(ROOT, path)).isDirectory()) walk(path); else out[path] = readFileSync(join(ROOT, path), "utf8");
    }
  };
  walk("sol/harness");
  return out;
}
/** node:test's skip option: false in a dev checkout, the reason on a tester's copy */
export function devOnly(...files: string[]): string | false {
  const missing = files.filter((f) => !existsSync(join(ROOT, f)));
  return missing.length ? `reads ${missing.join(", ")}: the dev's, not in a tester's copy (#300)` : false;
}
