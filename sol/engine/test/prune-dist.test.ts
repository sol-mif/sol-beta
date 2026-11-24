// A built file whose source is gone is never loaded (#1837): tsc never deletes an output whose source went, and parts.ts
// loads every built part, so on 2026-11-24 a dist/team/shell.js that a moment's branch switch had built killed the
// engine at every start, dist.good/ too. prune-dist, which keep runs before each start, removes such a file (its map and
// declarations with it), keeps every file whose source is there, and leaves a build with no src/ beside it alone.
// The last test reads keep itself: it prunes before node starts and before it copies the good build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const put = (p: string) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, ""); };
const prune = (out: string, src: string) => execFileSync("bash", [join(ENGINE, "prune-dist"), out, src], { encoding: "utf8" });

test("a built file with no source is removed with its map and declarations; one with its source stays", () => {
  const d = mkdtempSync(join(tmpdir(), "prune-"));
  try {
    const src = join(d, "src"), out = join(d, "dist");
    for (const f of ["index.ts", "team/pin.ts", "parts/next.ts", "face/view.tsx"]) put(join(src, f));
    for (const f of ["index.js", "index.js.map", "team/pin.js", "team/pin.d.ts", "parts/next.js", "face/view.js",
      "team/shell.js", "team/shell.js.map", "team/shell.d.ts", "parts/gone.js", "data.json"]) put(join(out, f));
    const said = prune(out, src);
    for (const f of ["team/shell.js", "team/shell.js.map", "team/shell.d.ts", "parts/gone.js"]) assert.ok(!existsSync(join(out, f)), `${f} is gone`);
    for (const f of ["index.js", "index.js.map", "team/pin.js", "team/pin.d.ts", "parts/next.js", "face/view.js", "data.json"]) assert.ok(existsSync(join(out, f)), `${f} stays`);
    assert.match(said, /team\/shell\.js has no source/);
    assert.match(said, /4 file\(s\) with no source removed/);
    assert.equal(prune(out, src), "", "a clean build: nothing said");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("a build with no src/ beside it is left as it is", () => {
  const d = mkdtempSync(join(tmpdir(), "prune-"));
  try {
    put(join(d, "dist", "index.js"));
    prune(join(d, "dist"), join(d, "src"));
    assert.ok(existsSync(join(d, "dist", "index.js")));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("keep prunes before node starts and before it keeps the good build", () => {
  const keep = readFileSync(join(ENGINE, "keep"), "utf8");
  const start = keep.indexOf("node dist/index.js &"), good = keep.indexOf("rsync -a --delete dist/ dist.good.new/");
  const at = [...keep.matchAll(/bash prune-dist dist\b/g)].map((m) => m.index!);
  assert.ok(at.some((i) => i < start), "pruned before the start");
  assert.ok(at.some((i) => i > start && i < good), "pruned before the good copy");
});
