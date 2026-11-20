// engine/keep: a build is good only once it has stayed up; three starts that die inside the minute put the last good
// build back (#16 blocker 3). The keeper runs for real in a temp folder, with a stand-in engine (dist/index.js) that
// answers /health and dies when told, and a short good-window.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, chmodSync, rmSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freePort } from "./test-engine.ts";

const KEEP = join(import.meta.dirname, "..", "keep");
// a port the system says is free, not a random one of 90: two test runs at once picked the same one, and the second
// stand-in died on it (EADDRINUSE) after the keeper had seen the first one's /health
const PORT = await freePort();
const FAKE = (dieMs: number) => `
const http = require("node:http");
http.createServer((q, r) => { r.end('{"ok":true}'); }).listen(${PORT}, "127.0.0.1");
${dieMs ? `setTimeout(() => process.exit(7), ${dieMs});` : ""}
`;

function setup(dieMs: number, goodBuild = true) {
  const dir = mkdtempSync(join(tmpdir(), "sol-keep-"));
  copyFileSync(KEEP, join(dir, "keep")); chmodSync(join(dir, "keep"), 0o755);
  mkdirSync(join(dir, "dist")); writeFileSync(join(dir, "dist", "index.js"), FAKE(dieMs));
  if (goodBuild) { mkdirSync(join(dir, "dist.good")); writeFileSync(join(dir, "dist.good", "index.js"), "/* the good one */" + FAKE(0)); }
  return dir;
}
const run = (dir: string) => {
  try { return { code: 0, out: execFileSync("bash", [join(dir, "keep")], { cwd: dir, env: { ...process.env, SOL_PORT: String(PORT), SOL_KEEP_GOOD_MS: "4000" }, encoding: "utf8", timeout: 30000 }) }; }
  catch (e: any) { return { code: e.status as number, out: String(e.stdout ?? "") }; }
};

test("keep: a build that dies after answering /health is not the good one; the third time, the good build comes back", () => {
  const dir = setup(1500);   // dies well inside the good window, but after the keeper has surely seen /health, even with the suite running beside it
  for (let i = 1; i <= 2; i++) {
    const r = run(dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /died within the minute/);
    assert.equal(readFileSync(join(dir, ".keep"), "utf8").trim(), String(i));
    assert.equal(existsSync(join(dir, "dist.bad")), false);
  }
  const r = run(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /went back to the last good build/);
  assert.equal(existsSync(join(dir, "dist.bad", "index.js")), true);
  assert.match(readFileSync(join(dir, "dist", "index.js"), "utf8"), /the good one/);
  assert.equal(existsSync(join(dir, "dist", ".reverted")), true);
  assert.equal(existsSync(join(dir, ".keep")), false);
  rmSync(dir, { recursive: true, force: true });
});

test("keep: a build that stays up past the window is copied as the good one, and a clean exit after it keeps it", () => {
  const dir = setup(0, false);
  writeFileSync(join(dir, "dist", "index.js"), FAKE(0) + "setTimeout(() => process.exit(0), 2500);");
  const r = run(dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /this build is the good one/);
  assert.match(r.out, /engine ended \(0\)/);
  assert.equal(existsSync(join(dir, "dist.good", "index.js")), true);
  assert.equal(existsSync(join(dir, ".keep")), false);
  rmSync(dir, { recursive: true, force: true });
});

test("keep: a dist/ still being written is waited out before the engine starts (#39)", () => {
  const dir = setup(0, false);
  // the stand-in says when it started, and ends a second after it has answered /health (not on a timer from its start,
  // which a loaded machine can outrun before the keeper has asked)
  writeFileSync(join(dir, "dist", "index.js"), `
require("node:fs").writeFileSync("started", String(Date.now()));
let ending = false;
require("node:http").createServer((q, r) => { r.end('{"ok":true}'); if (!ending) { ending = true; setTimeout(() => process.exit(0), 1000); } }).listen(${PORT}, "127.0.0.1");
`);
  // dist/ was written on a whole second: the keeper's find -newermt counts whole seconds on macOS, so a write late in a
  // second was quiet after only 2 s and the start could come under 2.5 s (more often under load). On a whole
  // second the 3 s wait is 3 s on every machine
  const second = Math.floor(Date.now() / 1000);
  utimesSync(join(dir, "dist", "index.js"), second, second);
  const wrote = statSync(join(dir, "dist", "index.js")).mtimeMs;
  const r = run(dir);
  assert.equal(r.code, 0, r.out);
  assert.ok(Number(readFileSync(join(dir, "started"), "utf8")) - wrote >= 2500, "started only once dist/ was quiet");
  rmSync(dir, { recursive: true, force: true });
});

// #1576: a release that moved in (ship.ts leaves .swap) and does not start takes the whole Sol back with it, not only
// dist/: the checkout to `from`, the node_modules it replaced, and .skip so it does not install itself again; one that
// stays up its minute lets the way back go
function swapped(dieMs: number) {
  const dir = setup(dieMs);
  const g = (...a: string[]) => execFileSync("git", a, { cwd: dir, encoding: "utf8" }).trim();
  g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
  writeFileSync(join(dir, ".gitignore"), "dist/\ndist.good/\ndist.bad/\n.keep\n.swap\n.skip\n.went-back\nnode_modules/\nsol-was/\nkeep\n");
  writeFileSync(join(dir, "release.txt"), "old\n"); g("add", "-A"); g("commit", "-qm", "old");
  const from = g("rev-parse", "HEAD");
  writeFileSync(join(dir, "release.txt"), "new\n"); g("commit", "-qam", "new");
  const to = g("rev-parse", "HEAD");
  mkdirSync(join(dir, "node_modules")); writeFileSync(join(dir, "node_modules", "marker"), "new\n");
  const was = join(dir, "sol-was", "engine-1");
  mkdirSync(was, { recursive: true }); writeFileSync(join(was, "marker"), "old\n");
  writeFileSync(join(dir, ".swap"), [["from", from], ["to", to], ["at", "2026-11-19T00:00:00Z"], ["nm", join(dir, "node_modules"), was]].map((l) => l.join("\t")).join("\n") + "\n");
  return { dir, from, to, was, head: () => g("rev-parse", "HEAD") };
}

test("keep #1576: a release that does not start three times takes the checkout and its packages back, and is skipped", () => {
  const s = swapped(1500);
  for (let i = 1; i <= 2; i++) { const r = run(s.dir); assert.equal(r.code, 1, r.out); assert.equal(s.head(), s.to, "not before the third"); }
  const r = run(s.dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /did not start; Sol went back to/);
  assert.match(r.out, /went back to the last good build/);
  assert.equal(s.head(), s.from, "the checkout is on the release before");
  assert.equal(readFileSync(join(s.dir, "release.txt"), "utf8"), "old\n");
  assert.equal(readFileSync(join(s.dir, "node_modules", "marker"), "utf8"), "old\n", "its packages put back");
  assert.equal(readFileSync(join(s.dir, ".skip"), "utf8").trim(), s.to, "the release waits for a newer one");
  assert.equal(readFileSync(join(s.dir, ".went-back"), "utf8").trim(), `${s.from}\t${s.to}`, "said to the next engine");
  assert.equal(existsSync(join(s.dir, ".swap")), false);
  assert.match(readFileSync(join(s.dir, "dist", "index.js"), "utf8"), /the good one/);
  rmSync(s.dir, { recursive: true, force: true });
});

test("keep #1576: a release that stays up its minute lets the way back go; one the checkout moved past is not undone", () => {
  const s = swapped(0);
  writeFileSync(join(s.dir, "dist", "index.js"), FAKE(0) + "setTimeout(() => process.exit(0), 2500);");
  const r = run(s.dir);
  assert.equal(r.code, 0, r.out);
  assert.equal(existsSync(join(s.dir, ".swap")), false, "no way back needed");
  assert.equal(existsSync(s.was), false, "the old packages are gone");
  assert.equal(s.head(), s.to);
  rmSync(s.dir, { recursive: true, force: true });

  const t = swapped(1500);
  writeFileSync(join(t.dir, "release.txt"), "newer\n");
  execFileSync("git", ["commit", "-qam", "newer"], { cwd: t.dir });   // moved since the swap (a pull by hand)
  for (let i = 1; i <= 3; i++) run(t.dir);
  assert.notEqual(t.head(), t.from, "a checkout that moved past `to` is never moved back");
  assert.equal(existsSync(join(t.dir, ".skip")), false);
  assert.equal(existsSync(join(t.dir, ".swap")), false, "the stale way back is dropped");
  rmSync(t.dir, { recursive: true, force: true });
});
