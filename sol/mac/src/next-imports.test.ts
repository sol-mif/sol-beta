// node --test src/*.test.ts: the new face's one way in (#1604, docs/port/switch.md §2 "Imports go one way"). Nothing
// outside src/next imports next/ except App.tsx (and only its flag, plus the lazy shell), so with ui.next off nothing
// under next/ loads; and the fixture (next/cv/fixture.ts) is imported only by the dev page and by tests, so fixture data
// never reaches a real Sol. Signed: marcocyl04-ux's agent, the port's prep (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = dirname(fileURLToPath(import.meta.url));
const files: string[] = [];
const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (n !== "node_modules") walk(p); } else if (/\.(tsx?|mts|mjs|jsx?)$/.test(n)) files.push(p); } };
walk(SRC);
const rel = (p: string) => relative(SRC, p).split("\\").join("/");
const isTest = (f: string) => /\.test\.(ts|tsx|mjs)$/.test(f);
/** every module a file names (static imports, re-exports, dynamic imports), resolved to a path under src */
function imports(f: string): string[] {
  const t = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
  return [...t.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g)].map((m) => m[1]).filter((s) => s.startsWith(".")).map((s) => rel(resolve(dirname(f), s)));
}
const isNext = (p: string) => p === "next" || p.startsWith("next/");

test("nothing outside src/next imports next/ but App.tsx", () => {
  const offenders = files.filter((f) => !isNext(rel(f)) && rel(f) !== "App.tsx" && !isTest(f))
    .flatMap((f) => imports(f).filter(isNext).map((i) => `${rel(f)} imports ${i}`));
  assert.deepEqual(offenders, []);
  const app = imports(join(SRC, "App.tsx")).filter(isNext).map((p) => p.replace(/\.tsx?$/, ""));
  // and the first run's line (Sol ticket #96), lazy too, loaded only while the shell installs Sol
  assert.deepEqual([...new Set(app)].sort(), ["next/Next", "next/flag", "next/movein/Setup"], "App.tsx names the flag, the lazy shell and the first run's setup, nothing else");
  assert.match(readFileSync(join(SRC, "App.tsx"), "utf8"), /lazy\(\(\) => import\("\.\/next\/movein\/Setup"\)\)/, "the setup is loaded lazily");
  assert.match(readFileSync(join(SRC, "App.tsx"), "utf8"), /lazy\(\(\) => import\("\.\/next\/Next"\)\)/, "the shell is loaded lazily");
});

test("the fixture is imported only by the dev page (and tests)", () => {
  const by = files.filter((f) => !isTest(f) && imports(f).some((i) => i.replace(/\.ts$/, "") === "next/cv/fixture")).map(rel);
  assert.deepEqual(by, ["next/dev.tsx"]);
});

test("the dev page is imported by nothing but tests (next/Next included): it loads the fixture (#1652)", () => {
  const by = files.filter((f) => !isTest(f) && imports(f).some((i) => i.replace(/\.tsx?$/, "") === "next/dev")).map(rel);
  assert.deepEqual(by, []);
  assert.match(readFileSync(join(SRC, "../next.html"), "utf8"), /src="\/src\/next\/dev\.tsx"/, "its one way in is next.html");
});

test("the check bites: an import of next/ from an old file is seen", () => {
  assert.ok(isNext("next/cv/index.ts") && isNext("next") && !isNext("nextish/x"));
  assert.equal("next/dev.tsx".replace(/\.tsx?$/, ""), "next/dev", "an import of ./dev.tsx from next/Next resolves to the dev page");
});
