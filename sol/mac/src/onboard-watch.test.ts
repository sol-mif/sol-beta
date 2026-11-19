// node --test src/*.test.ts: the watch moment's rows (#1223, onboard/watchLog.ts): the source open now, each thing found
// with where it was read, each thing left unread with its reason; never a row without a word.
import { test } from "node:test";
import assert from "node:assert/strict";
import { watchRows } from "./onboard/watchLog.ts";
import type { Found } from "./onboard/sort.ts";

const f = (id: string, v: string, more: Partial<Found> = {}): Found => ({ id, k: "x", v, src: "", kind: "file", sure: true, ...more });

test("the source open, each thing found with its proof, each skip with its reason", () => {
  const rows = watchRows({ state: "now", open: "Claude Code's session list", read: 41, skips: [{ what: "Messages", why: "denied" }, { what: "Notes", why: "unreachable" }] },
    [f("a", "Westbrook thesis", { src: "~/.claude/projects", via: "claude code" }), f("b", "DES 210 crit", { src: "your calendar", when: "Thu 3pm" })]);
  assert.deepEqual(rows.map((r) => r.k), ["open", "fact", "fact", "skip", "skip"]);
  assert.equal(rows[0].proof, "open now · 41 looked at");
  assert.equal(rows[1].proof, "read in ~/.claude/projects, through claude code");
  assert.equal(rows[2].text, "DES 210 crit, Thu 3pm");
  assert.deepEqual(rows.slice(3).map((r) => r.proof), ["left closed, as you said", "could not be reached"]);
  assert.ok(rows.every((r) => r.text && r.proof), "every row has its words");
});

test("at most the last five things found; the person's name is not a row; a refused place is named once", () => {
  const many = Array.from({ length: 9 }, (_, i) => f(`f${i}`, `file ${i}`, { src: "Documents" }));
  const rows = watchRows({ state: "now" }, [f("n", "Noa", { k: "name" }), ...many]);
  assert.deepEqual(rows.map((r) => r.id), ["f4", "f5", "f6", "f7", "f8"]);
  assert.deepEqual(watchRows({ state: "refused", skips: [{ what: "x", why: "nothing" }] }, many).map((r) => r.k), ["skip"]);
  assert.deepEqual(watchRows(null, []), []);
});
