// userText (#899): a message wrapped in a tag is left out only when the tag is one of the harness's own (HARNESS_TAGS);
// any other <tag>…</tag> is the person's words and is kept, in the session's items and in its thread map. No files, no
// network: the transcript lines are made here.
import { test } from "node:test";
import assert from "node:assert/strict";
const { Items, userText, HARNESS_TAGS } = await import("../src/work/items.ts");
const { build } = await import("../src/work/thread.ts");

const user = (uuid: string, content: unknown, more: object = {}) =>
  ({ type: "user", uuid, timestamp: "2026-11-10T10:00:00Z", message: { role: "user", content }, ...more });
const mine = (lines: object[]) => {
  const it = new Items();
  for (const l of lines) it.feed(l);
  return it.list.filter((i: any) => i.kind === "me").map((i: any) => i.text);
};

test("a message wrapped in a tag of the person's own is kept as written", () => {
  for (const said of [
    "<button>Save</button>",
    "<p>why is this paragraph cut off?</p>",
    "<div>\n  <p>one</p>\n  <p>two</p>\n</div>",
    "<my-widget>a custom element</my-widget>",
    "<note>remember the milk</note>",
    "<thinking>is this right?</thinking>",
  ]) assert.equal(userText(said)?.text, said, said);
  // in content blocks, beside an image, and after a reminder the harness put in front of it
  assert.deepEqual(userText([{ type: "text", text: "<h1>Title</h1>" }, { type: "image" }]), { text: "<h1>Title</h1>", images: 1 });
  assert.equal(userText("<system-reminder>today is Tuesday</system-reminder>\n<li>first</li>")?.text, "<li>first</li>");
});

test("a message that is only the harness's own tags is still left out", () => {
  for (const tag of HARNESS_TAGS) assert.equal(userText(`<${tag}>anything\nat all</${tag}>`), null, tag);
  // the shape a finished background task writes, with its own tags inside
  const done = "<task-notification>\n<task-id>b1</task-id>\n<status>completed</status>\n<summary>Background command \"npm test\" completed (exit code 0)</summary>\n</task-notification>";
  assert.equal(userText(done), null);
  assert.equal(userText([{ type: "text", text: done }]), null);
  // a `!` command: what was typed, then what came out as two tags in one message
  assert.equal(userText("<bash-input>ls</bash-input>"), null);
  assert.equal(userText("<bash-stdout>a.txt\nb.txt</bash-stdout><bash-stderr></bash-stderr>"), null);
  assert.equal(userText("<bash-stdout></bash-stdout><bash-stderr>no such file</bash-stderr><bash-exit-code>1</bash-exit-code>"), null);
  // HTML inside the harness's tag does not make it the person's
  assert.equal(userText("<local-command-stderr><b>not found</b></local-command-stderr>"), null);
  // a `#` memory note stays out of the thread, as before #899
  assert.equal(userText("<user-memory-input>use pnpm here</user-memory-input>"), null);
  // the three with their own lines, as before
  assert.equal(userText("<local-command-stdout>Set model to opus</local-command-stdout>"), null);
  assert.equal(userText("<system-reminder>only a reminder</system-reminder>"), null);
  assert.equal(userText("<command-message>review</command-message>\n<command-name>/review</command-name>\n<command-args>12</command-args>")?.text, "/review 12");
});

test("only whole harness tags count: one closed by another name, or with words after or between, is kept", () => {
  for (const said of [
    "<bash-input>ls</bash-input> prints nothing, why?",
    "<bash-input>ls</bash-input> and then <bash-stdout>nothing</bash-stdout>",
    "<bash-input>ls</bash-stdout>",
    "<task-notification>what does this tag mean?</p>",
    "<task-notification>is it like <p>this</p>?",
  ]) assert.equal(userText(said)?.text, said, said);
  assert.equal(userText("<p>what is a </task-notification>")?.text, "<p>what is a </task-notification>");
  assert.equal(userText("a < b and c > d")?.text, "a < b and c > d");
});

test("read back from a transcript: the session's items and its thread map hold the pasted HTML, not the harness's line", () => {
  const lines = [
    user("u1", "<button>Save</button>", { entrypoint: "sdk-ts" }),
    { type: "assistant", uuid: "a1", parentUuid: "u1", timestamp: "2026-11-10T10:00:05Z", entrypoint: "sdk-ts", message: { id: "m1", role: "assistant", model: "opus", content: [{ type: "text", text: "A button." }] } },
    user("u2", "<task-notification>\n<task-id>b1</task-id>\n<status>completed</status>\n</task-notification>", { parentUuid: "a1", entrypoint: "sdk-ts" }),
    { type: "assistant", uuid: "a2", parentUuid: "u2", timestamp: "2026-11-10T10:00:09Z", entrypoint: "sdk-ts", message: { id: "m2", role: "assistant", model: "opus", content: [{ type: "text", text: "The task is done." }] } },
    user("u3", "<p>why is this paragraph cut off?</p>", { parentUuid: "a2", entrypoint: "sdk-ts" }),
  ];
  assert.deepEqual(mine(lines), ["<button>Save</button>", "<p>why is this paragraph cut off?</p>"]);
  const map = build("s1", lines.map((l) => JSON.stringify(l)).join("\n"));
  assert.deepEqual(map.segments.flatMap((s: any) => s.prompts), ["<button>Save</button>", "<p>why is this paragraph cut off?</p>"]);
});
