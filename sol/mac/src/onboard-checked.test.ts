// node --test src/*.test.ts: checking each folder once (#1423, onboard/checked.ts): which folders are asked, how a
// folder's things are listed, and what "<folder> is right" writes: over is the record's "no", an unsure one pressed
// closes its ask, the sentence is a thing said in that folder, and the folder is checked; opening a folder checks it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { afterCheck, opened, putOff, questionOf, rowsOf, saidFact, toCheck } from "./onboard/checked.ts";
import { empty, mergeRecords, type Fact, type Record } from "./onboard/record.ts";
import type { Confirm } from "./onboard/sort.ts";

const fact = (id: string, area: string, v: string, more: Partial<Fact> = {}): Fact => ({ id, k: "x", v, src: "your calendar", kind: "event", sure: true, st: "read", area, ...more });
function made(): Record {
  const r = empty();
  r.built = "2026-11-17T20:00:00.000Z";
  r.areas = [{ id: "school", name: "School", part: "school", facts: ["a", "b", "c"] }, { id: "work", name: "Work", part: "work", facts: ["d"] }, { id: "old", name: "Old", part: "life", facts: [] }];
  r.facts = [fact("a", "school", "TYPE 205", { st: "unsure", kind: "file", src: "Documents" }), fact("b", "school", "DES 210 Studio", { when: "Tue, Thu 2pm", repeats: true }), fact("c", "school", "gone before", { st: "no" }), fact("d", "work", "Lumen")];
  r.asks = [{ id: "c-a", q: "TYPE 205: still taking it?", why: "", yes: "yes", no: "no", fact: "a", kind: "guess" }];
  r.unchecked = ["school", "work", "gone"];
  return r;
}
const openOf = (r: Record): Confirm[] => (r.asks ?? []).filter((c) => !r.confirmed[c.id]);

test("only the folders made and not checked are asked, in order; a folder gone since is not", () => {
  assert.deepEqual(toCheck(made()).map((a) => a.id), ["school", "work"]);
  assert.deepEqual(toCheck({ ...made(), unchecked: undefined }), [], "a record from before the check asks nothing");
});

test("a folder's rows: the unsure first, what was said no to never, where it was read beside each", () => {
  const rows = rowsOf(made(), "school", openOf(made()));
  assert.deepEqual(rows.map((r) => [r.id, r.unsure]), [["a", true], ["b", false]]);
  assert.equal(rows[1].s, "Tue, Thu 2pm · your calendar");
});

test("“School is right”: over is a no, the unsure one's ask closes, the sentence is in School, School is checked", () => {
  const r = made();
  const n = afterCheck(r, "school", new Set(["a"]), "Spanish 102, Fridays 10am", openOf(r), "2026-11-17T21:00:00.000Z");
  assert.equal(n.facts.find((f) => f.id === "a")!.st, "no");
  assert.equal(n.confirmed["c-a"], "no");
  const said = n.facts.find((f) => f.st === "said")!;
  assert.deepEqual([said.area, said.v, said.repeats, said.kind], ["school", "Spanish 102, Fridays 10am", true, "event"]);
  assert.equal(said.when, "Spanish 102, Fridays 10am");   // so the week strip puts its dot on Friday
  assert.ok(n.areas.find((a) => a.id === "school")!.facts.includes(said.id));
  assert.deepEqual(n.unchecked, ["work", "gone"]);
  assert.equal(n.facts.find((f) => f.id === "d")!.st, "read", "another folder is untouched");
});

test("left alone: nothing is changed but the folder is checked; an unsure one keeps its ask (its ring in Home)", () => {
  const r = made();
  const n = afterCheck(r, "school", new Set(), "  ", openOf(r));
  assert.deepEqual(n.facts, r.facts);
  assert.equal(n.confirmed["c-a"], undefined);
  assert.deepEqual(n.unchecked, ["work", "gone"]);
});

test("a folder opened in Home is checked; one already checked writes nothing", () => {
  assert.deepEqual(opened(made(), "work")!.unchecked, ["school", "gone"]);
  assert.equal(opened(made(), "old"), null);
});

test("“check later”: the folder keeps its ring and is not asked again, after a reload too, until it is opened", () => {
  const off = putOff(made(), "work");
  assert.deepEqual(off.unchecked, ["school", "work", "gone"], "still unchecked: Home rings it");
  assert.deepEqual(toCheck(off).map((a) => a.id), ["school"], "the card does not ask it again");
  assert.deepEqual(mergeRecords(off, made(), false).later, ["work"], "a run over the record keeps it put off");
  const seen = opened(off, "work")!;
  assert.deepEqual([seen.unchecked, seen.later], [["school", "gone"], []]);
});

test("a run over an earlier record keeps what is still unchecked and adds the new folders", () => {
  const old = made(), next = { ...made(), unchecked: ["fresh"] };
  assert.deepEqual(mergeRecords(old, next, false).unchecked, ["school", "work", "gone", "fresh"]);
});

test("the question is the part's, never a word of one life; a sentence with no day goes to coming", () => {
  assert.equal(questionOf("school"), "Is this still your term?");
  assert.equal(questionOf("found"), "Is this still yours?");
  assert.equal(saidFact("a portfolio review in March", "work").repeats, undefined);
});
