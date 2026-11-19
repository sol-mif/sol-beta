// #1013: Claude Code 2.1.29x writes "entrypoint": "sdk-cli" for an SDK run; a run this engine started is its own,
// never "another Claude" (holders.ts whoOf)
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const dir = mkdtempSync(join(tmpdir(), "sol-holders-"));
process.env.SOL_SESSIONS_DIR = dir;
const { heldElsewhere, holders } = await import("../src/work/holders.ts");

test("an SDK run this engine started, marked sdk-cli, is this engine's own: not held elsewhere", async () => {
  const kid = spawn("sleep", ["10"]);
  try {
    writeFileSync(join(dir, `${kid.pid}.json`), JSON.stringify({ pid: kid.pid, sessionId: "s-cli", entrypoint: "sdk-cli", status: "idle" }));
    assert.equal(heldElsewhere("s-cli", true), undefined);
    assert.equal(holders().get("s-cli")?.[0].who, "sol");
    writeFileSync(join(dir, `${kid.pid}.json`), JSON.stringify({ pid: kid.pid, sessionId: "s-term", entrypoint: "cli", status: "idle" }));
    assert.equal(heldElsewhere("s-term", true)?.who, "terminal", "a terminal's session is still held elsewhere");
  } finally { kid.kill(); }
});
