// node --test src/*.test.ts (npm test here): Jev, all day (#803, plan Part C slice 40; home/whole/judge.ts,
// judgeStore.ts, JevAllDay.tsx; the stub of #832). The Try line: drag a line: the count of what would have passed
// changes. And the rules under it: the day's one line, "through · held · you", the one suggestion only an override
// earns (flows.md "Decisions" 8), the line set with its undo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { QUESTIONS, countsAt, dayLine, lineWord, seedReads, snap, stub, suggestionOf, suggestionWords } from "./home/whole/judge.ts";

const EVENING = new Date(2026, 10, 9, 21, 0).getTime();
const posting = QUESTIONS.find((q) => q.id === "q-posting")!;

test("drag a line: the count of what would have passed changes", () => {
  const reads = seedReads(EVENING).filter((r) => r.questionId === posting.id);
  const at70 = countsAt(reads, 0.7), at65 = countsAt(reads, 0.65), at50 = countsAt(reads, 0.5), at90 = countsAt(reads, 0.9);
  assert.deepEqual([at70.through, at70.held, at70.you], [3, 38, 1], "scene 8's row: through 3 · held 38 · you 1");
  assert.ok(at65.through > at70.through, "lower the line: more would have passed (Datadog at .66 among them)");
  assert.ok(at50.through > at65.through);
  assert.ok(at90.through < at70.through, "raise it: fewer");
  for (const c of [at65, at50, at90]) assert.equal(c.through + c.held, 41, "every read is either through or held");
  // the day's line counts at the dragged line too
  const all = seedReads(EVENING);
  const dragged = QUESTIONS.map((q) => (q.id === posting.id ? { ...q, line: 0.5 } : q));
  assert.deepEqual(dayLine(QUESTIONS, all), ["Jev read 101 things today.", "It let 30 through, held 71; you overrode it 4 times."]);
  assert.equal(dayLine(dragged, all)[1], `It let ${30 - 3 + at50.through} through, held ${71 + 3 - at50.through}; you overrode it 4 times.`);
});

test("letting go sets the line (judge.line.set): the receipt says what would have passed, and undo puts it back", () => {
  const ask = stub(() => EVENING), m = ask({ type: "judge.reads" });
  const mine = m.reads.filter((r) => r.questionId === posting.id);
  const s = ask({ type: "judge.line.set", questionId: posting.id, line: 0.65 });
  assert.equal(s.questions.find((q) => q.id === posting.id)!.line, 0.65);
  assert.equal(s.done?.line, `“Is this posting for you?” at .65: ${countsAt(mine, 0.65).through} would have passed today, 3 did at .70 · from now on`);
  const u = ask({ type: "home.undo", ledgerId: s.done!.ledgerId });
  assert.equal(u.questions.find((q) => q.id === posting.id)!.line, 0.7);
  assert.equal(ask({ type: "judge.line.set", questionId: posting.id, line: 0.7 }).done, null, "the same line changes nothing");
  // a press at the line just set (or → at .95) changes nothing either: the receipt and its undo stay (C40-1)
  const t = ask({ type: "judge.line.set", questionId: posting.id, line: 0.51 });
  const again = ask({ type: "judge.line.set", questionId: posting.id, line: 0.51 });
  assert.deepEqual(again.done, t.done, "the same line keeps the receipt standing");
  assert.equal(ask({ type: "home.undo", ledgerId: again.done!.ledgerId }).questions.find((q) => q.id === posting.id)!.line, 0.7, "and its undo still puts it back");
});

test("a suggested line only from his own overrides", () => {
  const reads = seedReads(EVENING);
  const s = suggestionOf(posting, reads)!;
  assert.equal(s.line, 0.65, "Datadog let through at .66 and a yes: lower to .65 (flows.md)");
  assert.equal(s.because.label, "Datadog");
  assert.equal(suggestionWords(posting, s), "You let through Datadog, which Jev held at .66, and it was a yes. Lower “Is this posting for you?” to .65?");
  for (const q of QUESTIONS.filter((x) => x.id !== posting.id)) assert.equal(suggestionOf(q, reads), null, `${q.id}: no override with an outcome, no suggestion`);
  assert.equal(suggestionOf(posting, reads.map((r) => ({ ...r, overriddenBy: undefined }))), null, "no override, no suggestion, whatever the dots");
});

test("the line snaps to hundredths between .05 and .95, and reads as the page writes it", () => {
  assert.equal(snap(0.6649), 0.66); assert.equal(snap(-1), 0.05); assert.equal(snap(2), 0.95);
  assert.equal(lineWord(0.7), ".70"); assert.equal(lineWord(1), "1.00");
});

test("through the store, and the seams: Jev lives under Sources; marked; the switch's", async () => {
  const J = await import("./home/whole/judgeStore.ts");
  J.send({ type: "judge.reads" });
  J.setLine(posting.id, 0.6);
  assert.equal(J.judgeNow()!.questions.find((q) => q.id === posting.id)!.line, 0.6);
  J.undoLine(J.judgeNow()!.done!.ledgerId);
  assert.equal(J.judgeNow()!.questions.find((q) => q.id === posting.id)!.line, 0.7);
  const modes = readFileSync(new URL("./spine/Modes.tsx", import.meta.url), "utf8");
  assert.match(modes, /place === "jev" \? <JevView \/> \/\* C40 \*\//);
  const sources = readFileSync(new URL("./home/whole/Sources.tsx", import.meta.url), "utf8");
  assert.match(sources, /C40[\s\S]*goTo\("jev"\)/);
});
