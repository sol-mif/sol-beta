// sol/install as Sol.app runs it (SOL_SKIP_APP=1, no root of its own) on a Mac where another Sol's login job is (#94, Sol
// ticket #96): it said "Sol is already here … Nothing to install." and ended 0, so the app's first run took it for done
// with no root written. Now another Sol stops it, said; only its own folder (~/Sol, a run cut short) goes on from there.
// A person's own terminal run is unchanged. Each run is in a throwaway HOME; nothing here reaches the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const INSTALL = resolve(import.meta.dirname, "../../install");
const mac = process.platform === "darwin";

/** a HOME with a login job whose WorkingDirectory is <checkout>/sol/engine */
function homeWithJob(checkout: (home: string) => string): string {
  const home = mkdtempSync(join(tmpdir(), "sol-inst-"));
  const at = checkout(home);
  mkdirSync(join(at, "sol", "engine"), { recursive: true });
  writeFileSync(join(at, "sol", "setup"), "");
  mkdirSync(join(home, "Library", "LaunchAgents"), { recursive: true });
  writeFileSync(join(home, "Library", "LaunchAgents", "com.marco.sol-engine.plist"),
    `<plist><dict><key>WorkingDirectory</key><string>${at}/sol/engine</string></dict></plist>\n`);
  return home;
}
const run = (home: string, env: Record<string, string>, args: string[] = []) =>
  spawnSync("/bin/sh", [INSTALL, ...args], { env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: home, SOL_NO_TTY: "1", ...env }, encoding: "utf8", timeout: 20_000 });

test("Sol.app's install never calls another Sol on this Mac done", { skip: !mac && "the login job is a Mac's" }, () => {
  const home = homeWithJob((h) => join(h, "work", "team-sol"));
  const r = run(home, { SOL_SKIP_APP: "1" });
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stdout, /MISS {2}another Sol runs on this Mac/);
  assert.doesNotMatch(r.stdout, /Nothing to install/);
});

test("its own folder, left by a run cut short, goes on from there", { skip: !mac && "the login job is a Mac's" }, () => {
  const home = homeWithJob((h) => join(h, "Sol"));
  const r = run(home, { SOL_SKIP_APP: "1" }, ["--check"]);
  assert.match(r.stdout, /an install cut short; going on from here/, r.stdout);
  assert.doesNotMatch(r.stdout, /another Sol runs|Nothing to install/);
});

test("a person's own run in a terminal is as before", { skip: !mac && "the login job is a Mac's" }, () => {
  const home = homeWithJob((h) => join(h, "work", "team-sol"));
  const r = run(home, {});
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /Sol is already here: .*Nothing to install/);
});
