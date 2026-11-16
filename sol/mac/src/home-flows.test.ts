// node --test src/*.test.ts (npm test here): a flow from a sentence, its stations and the flows page (#802, plan Part C
// slice 39; home/whole/flows.ts, flowsStore.ts, NewFlow.tsx, FlowsPage.tsx; the stub of #801). The Try line: type "every
// time a bio slide is posted, make notes": a read-only flow appears. And the rules under it: once or every time, the
// stations, the rung starting at read whatever was asked, run on last week writing only the ledger, the flows page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { everyP, flowOf, flowsLine, isFlow, rungLine, clearLine, stub, seedFlows } from "./home/whole/flows.ts";
import { split } from "./home/whole/reads.ts";

const TRY = "every time a bio slide is posted, make notes";

test("type “every time a bio slide is posted, make notes”: a read-only flow appears", () => {
  assert.ok(isFlow(TRY), "every time: a flow, not a job once");
  assert.equal(everyP(TRY), 0.93);
  const ask = stub(), m = ask({ type: "flow.say", sentence: TRY }), f = m.draft!;
  assert.ok(f, "the new flow appears");
  assert.equal(f.rung, "read", "read-only: it starts at read");
  assert.equal(f.asked, "draft", "though making notes asks for draft");
  assert.equal(f.ceiling, "act", "never turns work in");
  assert.equal(rungLine(f), "You asked for draft. It starts at read: it runs, and writes what it would have done. act is never this flow's.");
  assert.deepEqual(f.steps.map((s) => s.kind), ["watch", "judge", "make", "you"], "drawn as stations");
  assert.equal(f.steps[0].title, "Canvas · bio 201");
  assert.equal(f.steps[1].question!.text, "Is this a new lecture's slides?");
  assert.equal(f.steps[1].question!.line, 0.7);
  assert.equal(f.steps[1].question!.dots.length, 14, "last week's posts as dots");
  assert.match(clearLine(f.steps[1].question!), /^\d+ of 14 last week's posts clear 0\.70$/);
  assert.equal(f.steps[2].title, "notes in school › bio 201");
  assert.equal(f.place, "school › bio 201");
  assert.equal(f.saved, false);
  assert.match(m.done!.line, /^A new flow in school › bio 201, at read/);
  // save it: on the flows page, still at read; undo takes it off again
  const s = ask({ type: "flow.save", flowId: f.id });
  const row = s.flows.find((x) => x.id === f.id)!;
  assert.deepEqual([row.rung, row.on, row.saved], ["read", true, true]);
  assert.equal(s.draft, null);
  assert.deepEqual(flowsLine(s.flows), ["Six flows.", "Two need you; one is paused."]);
  const u = ask({ type: "home.undo", ledgerId: s.done!.ledgerId });
  assert.ok(!u.flows.some((x) => x.id === f.id));
  assert.equal(u.draft?.id, f.id, "undo puts it back as it was, not saved");
});

test("once is not a flow; the sentence is never split into two reads", () => {
  assert.equal(isFlow("make notes from the slides"), false);
  assert.equal(stub()({ type: "flow.say", sentence: "make notes from the slides" }).draft, null);
  for (const s of ["whenever Maya writes, tell me", "at 19:30 every day, tell me what is left", "When I meet someone, draft a follow-up", "every Sunday, sum up the week's readings", "each time a posting matches, draft it"]) assert.ok(isFlow(s), s);
  // F1: a bare hour, or a question with "when", is once: a filing, never a flow
  for (const s of ["at 3 call Sam about the offer", "when is the bio quiz due?", "at 9:30, call the dentist"]) {
    assert.equal(isFlow(s), false, s);
    assert.equal(stub()({ type: "flow.say", sentence: s }).draft, null, `${s}: no draft`);
  }
  // F2: a day or an hour is a clock, never "watches your sources"
  assert.deepEqual(flowOf("every Sunday, sum up the week's readings", "x").trigger, { kind: "clock", source: "a clock", every: "every Sunday" });
  assert.deepEqual(flowOf("at 19:30 every day, tell me what is left", "x").trigger, { kind: "clock", source: "a clock", every: "every day at 19:30" });
  assert.equal(flowOf("whenever Maya writes, tell me", "x").trigger.kind, "watch");
  assert.equal(split(TRY).length, 2, "the plain read would split it at the comma …");
  const say = readFileSync(new URL("./home/whole/Say.tsx", import.meta.url), "utf8");
  assert.match(say, /if \(isFlow\(text\)\) \{ sayFlow\(text\);/, "… so the box sends a flow whole");
  assert.match(say, /isFlow\(text\) \? <FlowRead sentence=\{text\} \/>/);
});

test("run it on last week: record-only, the rung stays at read", () => {
  const ask = stub(), f = ask({ type: "flow.say", sentence: TRY }).draft!;
  const r = ask({ type: "flow.run.once", flowId: f.id, replay: "last week" });
  assert.equal(r.draft!.rung, "read");
  assert.match(r.done!.line, /^Ran on last week, record-only: 14 read, \d+ would have been notes; nothing was written but the ledger$/);
  const n = ask({ type: "flow.drop", flowId: f.id });
  assert.equal(n.draft, null, "not now");
});

test("the flows page: a row per flow, the one line, pause, and what Sol saw you do by hand", () => {
  const ask = stub(), m = ask({ type: "flows" });
  assert.deepEqual(m.flows.map((f) => f.name), ["applications", "follow-ups", "school", "hand-in", "reading summary"]);
  assert.deepEqual(flowsLine(m.flows), ["Five flows.", "Two need you; one is paused."], "scene 7's line");
  assert.equal(m.flows.find((f) => f.id === "f-apps")!.ceiling, "act", "submit is his: act struck");
  const p = ask({ type: "flow.pause", flowId: "f-school", on: false });
  assert.deepEqual(flowsLine(p.flows), ["Five flows.", "Two need you; two are paused."]);
  assert.equal(p.done?.line, "school: paused; nothing runs until you turn it on");
  const h = ask({ type: "flow.habit.keep", id: "h-prs" });
  assert.equal(h.draft?.rung, "read", "a habit made into a flow starts at read too");
  assert.equal(h.habits.length, 1);
  assert.equal(seedFlows().every((f) => f.saved), true);
});

test("the seams: flows in the side foot, the flows page a place; marked", () => {
  const side = readFileSync(new URL("./home/whole/WholeSide.tsx", import.meta.url), "utf8");
  assert.match(side, /C39[\s\S]*row\("flows", "flows", place === "flows", \(\) => goTo\("flows"\)/);
  const modes = readFileSync(new URL("./spine/Modes.tsx", import.meta.url), "utf8");
  assert.match(modes, /place === "flows" \? <FlowsView \/> \/\* C39 \*\//);
});
