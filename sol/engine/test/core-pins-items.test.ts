// Core pins (#892): items.ts. What it promises: one flat list of items, each with an id, upserted as it changes, built the
// same way from a transcript and from a live stream (a streamed block and its final form are one item); Marco's own
// words kept, the harness's (reminders, tool results, injected tags) left out; a tool's output capped; a turn that
// stops closes every open step.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Items, userText, resultText } from "../src/work/items.ts";

test("put upserts by id: one item, its fields merged, every change told", () => {
  const told: string[] = [];
  const it = new Items((x) => told.push(String(x.text)));
  it.put({ id: "a", kind: "note", text: "one", extra: 1 });
  it.put({ id: "a", kind: "note", text: "two" });
  assert.equal(it.list.length, 1);
  assert.deepEqual({ text: it.get("a")!.text, extra: it.get("a")!.extra }, { text: "two", extra: 1 });
  assert.deepEqual(told, ["one", "two"]);
});

test("a streamed text block and its final message are one item, settled, with the final text", () => {
  const it = new Items();
  it.stream({ type: "message_start", message: { id: "msg1" } }, null);
  it.stream({ type: "content_block_start", index: 0, content_block: { type: "thinking" } }, null);
  it.stream({ type: "content_block_start", index: 1, content_block: { type: "text" } }, null);
  it.stream({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hel" } }, null);
  it.stream({ type: "content_block_delta", index: 7, delta: { type: "text_delta", text: "nowhere" } }, null);   // an index never started
  it.stream({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "lo" } }, null);
  assert.equal(it.get("msg1:t0")!.text, "Hello");
  it.feed({ type: "assistant", uuid: "u", message: { id: "msg1", content: [{ type: "thinking", thinking: "hm" }] } });
  it.feed({ type: "assistant", uuid: "u", message: { id: "msg1", content: [{ type: "text", text: "Hello." }] } });
  assert.deepEqual(it.list.map((x) => [x.id, x.kind, x.text, x.live ?? x.done]), [["msg1:k0", "think", "hm", true], ["msg1:t0", "you", "Hello.", false]]);
});

test("a delta before any message_start or with no delta text is ignored, never a throw", () => {
  const it = new Items();
  it.stream({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "x" } }, null);
  it.stream({ type: "content_block_start", index: 0, content_block: { type: "text" } }, null);
  it.stream({ type: "content_block_delta", index: 0, delta: { type: "signature_delta" } }, null);
  it.stream({ type: "content_block_delta", index: 0 }, null);
  assert.equal(it.list.length, 1);
  assert.equal(it.list[0].text, "");
});

test("a tool's result lands on its call; one for an unknown call is dropped; a result told twice is one result", () => {
  const it = new Items();
  it.feed({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "nope", content: "x" }] } });
  assert.equal(it.list.length, 0);
  it.feed({ type: "assistant", message: { id: "m", content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } }] } });
  const r = { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "a" }, { type: "image" }] }] } };
  it.feed(r); it.feed(r);
  assert.equal(it.list.length, 1);
  assert.deepEqual([it.get("t1")!.done, it.get("t1")!.ok, it.get("t1")!.out], [true, true, "a\n[image]"]);
});

test("a huge tool output is capped at 12000 characters with the count of the rest", () => {
  const it = new Items();
  it.feed({ type: "assistant", message: { id: "m", content: [{ type: "tool_use", id: "t1", name: "Read", input: {} }] } });
  it.feed({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "x".repeat(50_000) }] } });
  const out = String(it.get("t1")!.out);
  assert.ok(out.startsWith("x".repeat(12000) + "\n…"));
  assert.match(out, /38000 more characters$/);
});

test("settle closes every open step: a stopped turn's tools say stopped, a live text is no longer live", () => {
  const it = new Items();
  it.stream({ type: "message_start", message: { id: "m" } }, null);
  it.stream({ type: "content_block_start", index: 0, content_block: { type: "text" } }, null);
  it.feed({ type: "assistant", message: { id: "m2", content: [{ type: "tool_use", id: "t1", name: "Bash", input: {} }] } });
  it.settle(false);
  assert.deepEqual([it.get("t1")!.done, it.get("t1")!.ok, it.get("t1")!.out], [true, false, "stopped"]);
  assert.equal(it.get("m:t0")!.live, false);
  it.settle(false);   // twice: nothing changes
  assert.equal(it.get("t1")!.out, "stopped");
});

test("userText: Marco's words kept, the harness's left out", () => {
  assert.equal(userText("  hi  ")?.text, "hi");
  assert.equal(userText("<system-reminder>x</system-reminder>\nmy words")?.text, "my words");
  assert.equal(userText("<system-reminder>only</system-reminder>"), null);
  assert.equal(userText([{ type: "tool_result", content: "x" }]), null);
  assert.equal(userText("<local-command-stdout>ok</local-command-stdout>"), null);
  assert.deepEqual(userText("<command-name>/review</command-name><command-args> 12 </command-args>"), { text: "/review 12", images: 0 });
  assert.deepEqual(userText([{ type: "image" }]), { text: "", images: 1 });
  assert.equal(userText(""), null);
  assert.equal(userText(undefined), null);
  assert.equal(userText("a < b and c > d")?.text, "a < b and c > d");
  assert.equal(resultText(42), "");
});

test("a transcript: the user's message wears its time, a compact summary is one line, meta and helper lines are not Marco's", () => {
  const it = new Items();
  it.feed({ type: "user", uuid: "u1", timestamp: "2026-11-10T10:00:00Z", message: { content: "go" } });
  it.feed({ type: "user", uuid: "u2", isMeta: true, message: { content: "meta" } });
  it.feed({ type: "user", uuid: "u3", parent_tool_use_id: "t", message: { content: "a helper's prompt" } });
  it.feed({ type: "user", uuid: "u4", isCompactSummary: true, message: { content: "summary" } });
  it.feed({ type: "system", subtype: "task_notification", task_id: "x", status: "completed", summary: "done" });
  assert.deepEqual(it.list.map((x) => [x.kind, x.text]), [["me", "go"], ["compact", "the talk so far was summarised"], ["note", "background task completed: done"]]);
  assert.equal(it.get("u1")!.at, Date.parse("2026-11-10T10:00:00Z"));
});

test("adopt takes a transcript's items once, and the final-id count with them", () => {
  const h = new Items();
  h.feed({ type: "assistant", message: { id: "m", content: [{ type: "text", text: "a" }] } });
  const live = new Items();
  live.adopt(h); live.adopt(h);
  assert.equal(live.list.length, 1);
  live.feed({ type: "assistant", message: { id: "m", content: [{ type: "text", text: "b" }] } });
  assert.deepEqual(live.list.map((x) => x.id), ["m:t0", "m:t1"]);
});
