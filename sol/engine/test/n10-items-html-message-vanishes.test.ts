// items.ts userText: "Marco's own words in a user message, or null when the message is the harness talking". A message
// that is one HTML element (Marco pastes "<p>...</p>" or "<button>Save</button>" to ask about it) matches the
// injected-context rule and is dropped: it shows while the run is live (say() puts it), and is gone from the session the
// next time it is read from the transcript (opening it again, the engine restarting, a resume).
import { test } from "node:test";
import assert from "node:assert/strict";
const { Items, userText } = await import("../src/work/items.ts");

test("Marco's pasted HTML is his message, read back from the transcript", () => {
  const said = "<button>Save</button>";
  const it = new Items();
  it.feed({ type: "user", uuid: "u1", timestamp: "2026-11-10T10:00:00Z", message: { role: "user", content: said } });
  it.feed({ type: "user", uuid: "u2", timestamp: "2026-11-10T10:01:00Z", message: { role: "user", content: "<p>why is this paragraph cut off?</p>" } });
  const mine = it.list.filter((i: any) => i.kind === "me").map((i: any) => i.text);
  assert.equal(userText(said)?.text, said, "userText drops it");
  assert.equal(mine.length, 2, `read back: ${JSON.stringify(mine)}`);
});
