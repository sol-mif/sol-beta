// A session's own tools (tools.ts giveTool): narrow by default (that tool and nothing else, #421), `beside` for a
// session that works (the anchor, a ticket's executor): found on the first tickets walk, where an executor given its
// three ticket tools had no Write.   npx tsx --test test/tools-beside.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
const { giveTool, takeTool, narrowFor, toolsOnlyFor } = await import("../src/work/tools.ts");

const t = (name: string, beside?: boolean) => ({ name, description: name, shape: { a: z.string().optional() }, run: async () => "ok", ...(beside ? { beside: true } : {}) });

test("a session with no tool of its own is not narrow", () => { assert.equal(narrowFor("s0"), false); });
test("a tool of its own makes a session narrow; taken back, it is ordinary again", () => {
  giveTool("s1", t("answer"));
  assert.equal(narrowFor("s1"), true);
  takeTool("s1", "answer");
  assert.equal(narrowFor("s1"), false);
});
test("tools given beside leave the session its ordinary tools, and are still its own", () => {
  giveTool("s2", t("ticket_note", true)); giveTool("s2", t("ticket_state", true));
  assert.equal(narrowFor("s2"), false);
  assert.deepEqual(toolsOnlyFor("s2").map((x: { name: string }) => x.name), ["ticket_note", "ticket_state"]);
});
test("one tool not beside among them: narrow", () => {
  giveTool("s3", t("ticket_note", true)); giveTool("s3", t("answer"));
  assert.equal(narrowFor("s3"), true);
});
