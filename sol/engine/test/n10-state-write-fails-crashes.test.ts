// state.ts save(): the write runs in a debounced timer with nothing around it. A write that throws (a full disk, a
// read-only or missing folder) is an uncaught exception, and the engine has only an uncaughtExceptionMonitor
// (index.ts): the whole engine dies, every live Work turn with it, for a pin or a "seen" mark.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("a work.json write that fails does not end the engine's process", () => {
  const D = mkdtempSync(join(tmpdir(), "n10-statewrite-"));
  writeFileSync(join(D, "not-a-folder"), "");
  const script = `process.on("uncaughtExceptionMonitor", (e) => console.log("monitor:", e.code));
    const S = await import("./src/work/state.ts");
    S.mark("s1", { pinned: true });
    await new Promise((r) => setTimeout(r, 500));
    console.log("still alive");`;
  const r = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: new URL("..", import.meta.url).pathname, encoding: "utf8", timeout: 30_000,
    env: { ...process.env, SOL_STATE: join(D, "not-a-folder", "work.json") },   // mkdir/write throws ENOTDIR, as a full disk throws ENOSPC
  });
  assert.equal(r.status, 0, `the process died (exit ${r.status}): ${(r.stdout + r.stderr).split("\n").filter((l) => /monitor|Error|alive/.test(l)).slice(0, 2).join(" | ")}`);
  assert.match(r.stdout, /still alive/);
});
