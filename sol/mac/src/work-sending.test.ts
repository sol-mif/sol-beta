// node --test src/*.test.ts: a press shows at once (#917). The face puts the line up as it sends; the engine's own line,
// with the same id, replaces it whole when it lands, and a thread read again meanwhile keeps it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { landed, withSending } from "./work/threads.ts";

test("the engine's line replaces the face's whole: no guessed field stays", () => {
  const items = [{ id: "a", kind: "me", text: "hi" }, { id: "m", kind: "me", text: "go on", at: 1, sending: true }];
  const out = landed(items, { id: "m", kind: "me", text: "go on", at: 2, queued: true });
  assert.deepEqual(out[1], { id: "m", kind: "me", text: "go on", at: 2, queued: true });
  assert.equal(out[0], items[0]);
});

test("an answered question: the engine's full card lands over the face's answer", () => {
  const items = [{ id: "p", kind: "perm", tool: "Bash", input: { command: "ls" }, state: "allow", sending: true }];
  const out = landed(items, { id: "p", kind: "perm", tool: "Bash", input: { command: "ls" }, state: "allow" });
  assert.deepEqual(out[0], { id: "p", kind: "perm", tool: "Bash", input: { command: "ls" }, state: "allow" });
});

test("a line not sent from here merges as before", () => {
  const out = landed([{ id: "t", kind: "text", text: "a", streaming: true }], { id: "t", kind: "text", text: "ab" });
  assert.deepEqual(out[0], { id: "t", kind: "text", text: "ab", streaming: true });
});

test("a thread read again keeps the lines still on their way, and drops them once the engine has them", () => {
  const before = [{ id: "x", kind: "me", text: "old" }, { id: "m", kind: "me", text: "new", sending: true }];
  assert.deepEqual(withSending([{ id: "x", kind: "me", text: "old" }], before).map((i) => i.id), ["x", "m"]);
  assert.deepEqual(withSending([{ id: "x", kind: "me" }, { id: "m", kind: "me" }], before).map((i) => i.id), ["x", "m"]);
  const fresh = [{ id: "x", kind: "me" }];
  assert.equal(withSending(fresh, [{ id: "x", kind: "me" }]), fresh);
});

test("an answer on its way is not carried across a reload: the engine's card is the truth", () => {
  const before = [{ id: "p", kind: "perm", state: "allow", sending: true }];
  assert.deepEqual(withSending([], before), []);
});
