// The `under` and `kind` marks (two kinds of session, step 1; Marco 2026-11-14: "starting a session never folds it"):
// `under` is the orchestration session that runs this one and the only mark the side folds by; `kind` is kept only as
// "orchestration". `parent` stays as history. Both reach the face on the session row (fileSessions spreads the marks).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
const H = mkdtempSync("/var/tmp/sol-state-under-");
after(() => rmSync(H, { recursive: true, force: true }));
Object.assign(process.env, { HOME: H, SOL_STATE: join(H, "work.json"), SOL_SESSIONS_DIR: join(H, "sessions") });
const S = await import("../src/work/state.ts");

test("under is set, kept beside parent, and cleared by null", () => {
  S.mark("c1", { parent: "p1" });
  S.mark("c1", { under: "o1" });
  assert.deepEqual(S.workState().marks.c1, { parent: "p1", under: "o1" });
  S.mark("c1", { under: null });
  assert.deepEqual(S.workState().marks.c1, { parent: "p1" });   // the history stays
});

test("kind is kept as orchestration and deleted on null or anything else", () => {
  S.mark("o1", { kind: "orchestration" });
  assert.equal(S.workState().marks.o1?.kind, "orchestration");
  S.mark("o1", { kind: "nonsense" });
  assert.equal(S.workState().marks.o1, undefined);   // nothing left: the mark goes with it
  S.mark("o1", { kind: "orchestration", pinned: true });
  S.mark("o1", { kind: null });
  assert.deepEqual(S.workState().marks.o1, { pinned: true });
});

test("both round-trip through the file", async () => {
  S.mark("c2", { under: "o2" });
  S.mark("o2", { kind: "orchestration" });
  await new Promise((ok) => setTimeout(ok, 300));   // save() writes 150 ms after the last mark
  const disk = JSON.parse(readFileSync(join(H, "work.json"), "utf8")).marks;
  assert.equal(disk.c2.under, "o2");
  assert.equal(disk.o2.kind, "orchestration");
});
