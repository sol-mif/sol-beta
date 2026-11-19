// People (#1297): what a card says of the engine's read: four rows, my own card first, a press only on my own hand or
// offer, one line for a person with nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linesOf, minutesShown, oldWords, ordered, quiet, quietWords } from "./cowork/peopleView.ts";
import { fixtureRead, STATES } from "./cowork/peopleFixture.ts";

const NOW = Date.UTC(2026, 10, 16, 18);
const names = (l: string) => ({ a: "Ada", b: "Bo", c: "Cy" } as Record<string, string>)[l] ?? l;

test("a card's rows, in order, with their counts: one held, the rest open", () => {
  const r = fixtureRead("full", NOW);
  const a = r.people.find((p) => p.login === "a")!;
  const lines = linesOf(a, { mine: true, names, now: NOW });
  assert.deepEqual(lines.map((l) => [l.id, l.words, l.items.length]), [["holds", "holds", 1], ["open", "open, given to you", 2], ["waits", "waits on you", 3], ["agent", "agent in flight", 2], ["landed", "landed today", 1]]);
  assert.equal(lines[0].items[0].note, "#12 · now · cowork · feature");
  assert.equal(lines[1].hidden, true, "open's titles wait for the card to open");
  assert.equal(lines[2].items[0].note, "#21 · handed to you · from Bo · 12 min");
});

test("take and answer only on my own card, on a hand or an offer", () => {
  const r = fixtureRead("full", NOW);
  const a = r.people.find((p) => p.login === "a")!;
  assert.deepEqual(linesOf(a, { mine: true, names, now: NOW })[2].items.map((i) => i.act?.words ?? ""), ["take", "", ""]);
  assert.deepEqual(linesOf(a, { mine: false, names, now: NOW })[2].items.map((i) => i.act), [undefined, undefined, undefined]);
  assert.equal(linesOf(a, { mine: false, names, now: NOW })[2].words, "waits on Ada");
});

test("my own card first; a person with nothing is one line", () => {
  const r = { ...fixtureRead("empty", NOW), me: "c" };
  assert.deepEqual(ordered(r).map((p) => p.login), ["c", "a", "b"]);
  assert.ok(r.people.every(quiet));
  assert.equal(quietWords(r.people[0], true), "You hold nothing open, nothing waits, and nothing landed today.");
});

test("every dev state reads", () => {
  for (const s of STATES) assert.equal(fixtureRead(s, NOW).people.length, 3, s);
  assert.equal(fixtureRead("one-waits", NOW).people[0].waits.length, 1);
  assert.equal(fixtureRead("agent-busy", NOW).tools, false, "agent-busy shows the switch off");
});

test("an old read says its time and why the newer one failed; a fresh one says nothing", () => {
  const r = fixtureRead("full", NOW - 15 * 60_000);
  assert.equal(oldWords(r, NOW), "");
  assert.equal(oldWords({ ...r, failed: "gh: not logged in" }, NOW, () => "12:45"), "As read at 12:45, 15 min ago: the newer read failed (gh: not logged in).");
});

test("minutes: my own counted, another's \"—\", never 0 for not counted", () => {
  const r = fixtureRead("full", NOW);
  assert.deepEqual(minutesShown(r.people[0].minutes), { today: "34", words: "minutes coordinating today · 125 this week" });
  assert.deepEqual(minutesShown(r.people[1].minutes), { today: "—", words: "minutes coordinating today" });
  assert.deepEqual(minutesShown({ today: 0, week: 0 }).today, "0", "counted and none: 0");
});
