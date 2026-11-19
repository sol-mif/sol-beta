// Wake (#1151): the `woken` mark a session a comment on GitHub started carries (work/state.ts). runs.ts holds every run
// of a marked session bare, so the mark is set once and never changed or taken off: no later mark loosens it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.SOL_STATE = join(mkdtempSync(join(tmpdir(), "sol-wake-mark-")), "work.json");
const { mark, workState } = await import("../src/work/state.ts");

test("the woken mark is set once and never taken off", () => {
  mark("w1", { woken: "others" });
  mark("w1", { woken: "mine" });
  mark("w1", { woken: null });
  mark("w1", { woken: false });
  assert.equal(workState().marks.w1?.woken, "others");
});

test("only mine or others is a woken mark", () => {
  mark("w2", { woken: "anyone" });
  mark("w3", { woken: true });
  assert.equal(workState().marks.w2?.woken, undefined);
  assert.equal(workState().marks.w3?.woken, undefined);
});

test("a fork or a side session of a woken one is woken the same, and that is on disk at once", async () => {
  const { readFileSync } = await import("node:fs");
  mark("w4", { woken: "others" });
  mark("fork1", { parent: "w4" });
  assert.equal(workState().marks.fork1?.woken, "others");
  mark("fork2", { parent: "fork1" });
  assert.equal(workState().marks.fork2?.woken, "others");
  const disk = JSON.parse(readFileSync(process.env.SOL_STATE!, "utf8"));
  assert.equal(disk.marks.fork2?.woken, "others", "written without waiting for the debounce");
  mark("plain", { parent: "nobody-woken" });
  assert.equal(workState().marks.plain?.woken, undefined);
});
