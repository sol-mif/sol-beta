// sol/install on a Mac too old for Sol (#1912): Node 24 is built for macOS 13.5 and later, so below that the install
// used to go all the way through and Sol.app opened on an engine that never started. Now it stops first, said, before
// anything is fetched; on 13.x it goes on and names what needs 14. Each run is --check in a throwaway HOME, with the
// Mac's version given by SOL_MACOS_VERSION; nothing here reaches the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const INSTALL = resolve(import.meta.dirname, "../../install");
const mac = process.platform === "darwin";

const run = (version: string, env: Record<string, string> = {}) =>
  spawnSync("/bin/sh", [INSTALL, "--check"], {
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: mkdtempSync(join(tmpdir(), "sol-floor-")), SOL_NO_TTY: "1", SOL_MACOS_VERSION: version, ...env },
    encoding: "utf8", timeout: 20_000,
  });

for (const v of ["10.15.7", "12.7.6", "13.0", "13.4.1"]) {
  test(`macOS ${v}: stops before anything, and says why`, { skip: !mac && "the check is a Mac's" }, () => {
    const r = run(v);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stdout, new RegExp(`^ {2}MISS {2}Sol needs macOS 13\\.5 or later .* this Mac has macOS ${v.replace(/\./g, "\\.")}: `, "m"));
    assert.doesNotMatch(r.stdout, /== Sol/);
  });
}

// Sol.app's first run reads a MISS line as the reason the install stopped: without one it says "said nothing"
test("Sol.app's run on macOS 12 gets the reason as a MISS line", { skip: !mac && "the check is a Mac's" }, () => {
  const r = run("12.7.6", { SOL_SKIP_APP: "1" });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout, /^ {2}MISS {2}Sol needs macOS 13\.5 or later/m);
});

for (const v of ["13.5", "13.5.1", "13.7.2", "13.10"]) {
  test(`macOS ${v}: goes on, and names what needs 14`, { skip: !mac && "the check is a Mac's" }, () => {
    const r = run(v);
    assert.match(r.stdout, new RegExp(`ok {4}macOS ${v.replace(/\./g, "\\.")} runs Sol; on macOS 14 or later`));
    assert.doesNotMatch(r.stderr, /needs macOS/);
  });
}

// "unknown": a version this script cannot read goes on, no guess either way
for (const v of ["14.0", "26.6.2", "15.0 beta", "unknown"]) {
  test(`macOS ${v}: no word about the version`, { skip: !mac && "the check is a Mac's" }, () => {
    const r = run(v);
    assert.match(r.stdout, /== Sol/);
    assert.doesNotMatch(r.stdout + r.stderr, /runs Sol; on macOS 14|needs macOS/);
  });
}
