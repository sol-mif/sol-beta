// The app's own update line (#1824, cowork/ShellLine.tsx): what each word of the engine's team.shell shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { shellView, wordOf } from "./cowork/shellWord.ts";

test("the shell's own verified version offers Restart Sol and says macOS may ask for Full Disk Access again", () => {
  const v = shellView(wordOf({ type: "team.shell", event: "ready", version: "0.20261124.900" }), "0.20261124.900");
  assert.equal(v?.press, true);
  assert.match(v!.said, /0\.20261124\.900/);
  assert.match(v!.note ?? "", /Full Disk Access/);
});

test("the engine's word alone never shows the button (any program on the Mac can post it)", () => {
  assert.equal(shellView(wordOf({ type: "team.shell", event: "ready", version: "0.99999999.1" })), null);
  assert.equal(shellView(wordOf({ type: "team.shell", event: "downloaded", version: "0.99999999.1" }))?.press, false);
});

test("downloaded and failed are said with their why, with no button", () => {
  const d = shellView(wordOf({ type: "team.shell", event: "downloaded", version: "0.20261124.900", why: "paused" }));
  assert.equal(d?.press, false);
  assert.match(d!.said, /paused/);
  const f = shellView(wordOf({ type: "team.shell", event: "failed", why: "signature" }));
  assert.equal(f?.press, false);
  assert.equal(f?.kind, "fail");
  assert.match(f!.said, /this one stays: signature/);
});

test("found, no word, and words that are not the engine's show nothing", () => {
  assert.equal(shellView(wordOf({ type: "team.shell", event: "found", version: "1" })), null);
  assert.equal(shellView(wordOf({ type: "team.shell", event: null })), null);
  assert.equal(shellView(wordOf({ type: "team.shell", event: "installed" })), null);
  assert.equal(shellView(wordOf(null)), null);
  // a version or why that is not a string is left out, never shown raw
  assert.deepEqual(wordOf({ event: "ready", version: 7, why: { x: 1 } }), { event: "ready" });
});
