// With the frame off, the parts #981 left running are behind it (#1270): a seat's turn measures nothing for a log that
// is not there. (A say naming a seat that is not Sol's own gets no seat.instead line with the frame off, index.ts
// handleSay; no test reads it, since that say starts a real Claude turn.) Every folder is the test's own, set before
// anything is imported.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = realpathSync(mkdtempSync(join(tmpdir(), "sol-frame-off-quiet-")));
after(() => rmSync(root, { recursive: true, force: true }));
const home = join(root, "home");
mkdirSync(join(home, "things"), { recursive: true });
process.env.SOL_HOME = home;
process.env.SOL_APPDIR = join(root, "app");
process.env.SOL_LOGDIR = join(root, "log");
const { syncKernel } = await import("../src/kernel.ts");
const { logging } = await import("../src/seatlog.ts");

test("with the frame off nothing is logged, so nothing is measured; with it on, the seat's steps go on the log", async () => {
  assert.equal(logging(), false);
  await syncKernel(home, true);
  try { assert.equal(logging(), true); } finally { await syncKernel(home, false); }
  assert.equal(logging(), false, "and off again once the frame is");
});

