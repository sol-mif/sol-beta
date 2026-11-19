// node --test src/*.test.ts: the orchestration stage's session block (step 4, the design #1183 §3; stage/kinds/session.ts).
// From a fixed body: the state word is the side's own (rowState), where it works reads folder · branch · PR, the presses
// offered follow the state, and each press is one message to the engine naming the block (a button by its place).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pressMsg, pressesOf, whereOf, wordOf } from "./stage/kinds/session.ts";
import { rowState } from "./work/rowState.ts";
import type { SessionBody } from "./stage/kinds/types.ts";

const B = (more: Partial<SessionBody> = {}): SessionBody => ({ sessionId: "kid-1", title: "the side row", row: {}, where: { folder: "orch-1" }, last: "", ...more });

test("each state as one word, from the side's rowState", () => {
  assert.equal(wordOf(B({ run: { busy: true, waiting: 0 } })), "working");
  assert.equal(wordOf(B({ run: { busy: false, waiting: 0, tasks: 2 } })), "working", "its background agents still at work");
  assert.equal(wordOf(B({ row: { running: true } })), "working");
  assert.equal(wordOf(B({ run: { busy: true, waiting: 1 } })), "needs you");
  assert.equal(wordOf(B({ run: { busy: false, waiting: 0, failed: true } })), "failed");
  assert.equal(wordOf(B({ row: { failed: true } })), "failed");
  assert.equal(wordOf(B({ row: { unread: true } })), "done");
  assert.equal(wordOf(B({ row: { done: true } })), "done");
  assert.equal(wordOf(B()), "idle");
  // the same function the side draws its marks with
  assert.equal(rowState({ unread: true }, { waiting: 1, busy: false }), "needs");
});

test("where: folder · branch · PR, each only when known", () => {
  assert.equal(whereOf(B()), "orch-1");
  assert.equal(whereOf(B({ where: { folder: "orch-1", branch: "marcocyl04-ux/orch-1", pr: { n: 42, state: "draft" } } })), "orch-1 · marcocyl04-ux/orch-1 · PR #42 draft");
  assert.equal(whereOf(B({ where: undefined })), "");
});

test("the presses: open always, stop while working, archive once it rests (done, failed, idle)", () => {
  assert.deepEqual(pressesOf(B({ run: { busy: true, waiting: 0 } })), ["open", "stop"]);
  assert.deepEqual(pressesOf(B({ row: { done: true } })), ["open", "archive"]);
  assert.deepEqual(pressesOf(B({ run: { busy: false, waiting: 1 } })), ["open"]);
  assert.deepEqual(pressesOf(B()), ["open", "archive"], "idle: archive offered");
  assert.deepEqual(pressesOf(B({ row: { failed: true } })), ["open", "archive"], "failed: archive offered");
  assert.deepEqual(pressesOf(B({ run: { busy: false, waiting: 0, failed: true } })), ["open", "archive"]);
});

test("the ask's buttons send the right message: one per press, the button by its place, on the orchestrator's stage", () => {
  const body = B({ ask: { question: "Merge it now?", actions: [{ label: "merge" }, { label: "wait" }] } });
  const msgs = body.ask!.actions!.map((_, i) => pressMsg("orch-a", "s-kid-1", "answer", { i, label: _.label }));
  assert.deepEqual(msgs, [
    { type: "work.stage.session", sessionId: "orch-a", id: "s-kid-1", press: "answer", i: 0, label: "merge" },
    { type: "work.stage.session", sessionId: "orch-a", id: "s-kid-1", press: "answer", i: 1, label: "wait" },
  ]);
  assert.deepEqual(pressMsg("orch-a", "s-kid-1", "steer", { text: "  use the kit's Pill " }), { type: "work.stage.session", sessionId: "orch-a", id: "s-kid-1", press: "steer", text: "use the kit's Pill" });
  assert.equal(pressMsg("orch-a", "s-kid-1", "steer", { text: "   " }), null, "an empty steer sends nothing");
  assert.equal(pressMsg("orch-a", "s-kid-1", "answer", {}), null);
  assert.equal(pressMsg("orch-a", "s-kid-1", "answer", { i: 0 }), null, "a button press carries the words it showed");
  assert.deepEqual(pressMsg("orch-a", "s-kid-1", "stop"), { type: "work.stage.session", sessionId: "orch-a", id: "s-kid-1", press: "stop" });
  assert.deepEqual(pressMsg("orch-a", "s-kid-1", "archive"), { type: "work.stage.session", sessionId: "orch-a", id: "s-kid-1", press: "archive" });
});

test("the block draws, in this order and nothing more: state, where, last line, the ask, the steer box, the presses (.tsx: read from the source)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./stage/kinds/SessionBlock.tsx", import.meta.url), "utf8");
  const parts = [...src.matchAll(/data-part="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(parts, ["state", "where", "last", "ask", "steer"]);
  assert.ok(src.indexOf('data-part="steer"') < src.indexOf("pressesOf(body)"), "the presses come last");
  assert.match(src, /sol:open-work/, "open goes to the child's talk as the side's row does");
  assert.equal(src.match(/store\.asker\(\)/g)?.length, 1, "every press is one message, through one door");
  const kinds = readFileSync(new URL("./stage/kinds/index.tsx", import.meta.url), "utf8");
  assert.match(kinds, /session: SessionBlock/);
});
