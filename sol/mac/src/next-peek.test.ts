// node --test src/*.test.ts: a folder's peek says when it last changed (conform 22, bar-folder.html #peek "Last change
// 12 min ago"): from its newest Diary line, a folder inside it counted; nothing known, no line.
// Signed: marcocyl04-ux's agent (builder G), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { MIN, book, note, now } from "./next/diary/book.ts";
import { lastChange } from "./next/plane/last.ts";

test("a folder's last change is its newest Diary line, in words; none known, none said", () => {
  CV.load("dev-morning");
  const b = book(), n = now(b);
  for (const p of Object.values(b.pages)) p.lines = p.lines.filter((l) => l.region !== "money");
  assert.equal(lastChange("money"), null, "no line in money: nothing said");
  note({ who: "person", what: "You moved the budget.", region: "money", t: n - 12 * MIN, force: true });
  assert.equal(lastChange("money"), "12 min ago");
  note({ who: "person", what: "You opened the budget.", region: "money", t: n - 10, force: true });
  assert.equal(lastChange("money"), "just now", "the newest line wins");
  note({ who: "person", what: "Tomorrow's line.", region: "money", t: n + 60 * MIN, force: true });
  assert.equal(lastChange("money"), "just now", "a line still to come is not a change");
});
