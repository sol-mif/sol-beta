// Build becomes yours (#1089): a kept tool learns the edit its Sol user makes to its fill before sending, the same way,
// three times. Made-up values only. The rule reads the fill's template against what was sent: blanks stay blanks (a
// changed value is a value, not an edit), added and removed words are the edit; three of the same form is offered, and
// only a form heard three times can be taken.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "sol-yours-learn-"));
process.env.SOL_STATE = join(dir, "work.json");
process.env.SOL_HOME = join(dir, "home");
process.env.SOL_YOURS_DIR = join(dir, "no-transcripts");   // never this machine's own transcripts
const l = await import("../src/work/yoursLearn.ts");
const k = await import("../src/work/yoursKeep.ts");
const jev = await import("../src/work/yoursJev.ts");
import type { Offer } from "../src/work/yours.ts";

const T = "Draft invoice {invoice} for Northside: {hours} hours at my usual rate. One page, due in 14 days.";

test("the form of a send: values back to blanks, the edit kept as typed", () => {
  assert.equal(l.formOf(T, "Draft invoice #1050 for Northside: 6 hours at my usual rate. One page, due in 14 days."), T, "only values changed: the template itself");
  assert.equal(l.formOf(T, "Draft invoice #1050 for Northside: 6 hours at my usual rate. One page, due in 7 days, bank details at the foot."),
    "Draft invoice {invoice} for Northside: {hours} hours at my usual rate. One page, due in 7 days, bank details at the foot.");
  assert.equal(l.formOf(T, "Write a poem about tides"), null, "another ask is not an edit");
  assert.equal(l.addedOf(T, "Draft invoice {invoice} for Northside: {hours} hours at my usual rate. One page, due in 7 days."), "in 7 days", "a short edit with a word each side");
  assert.equal(l.addedOf(T, "Draft invoice {invoice} for Northside: {hours} hours at my usual rate. One page, due in 7 days, bank details at the foot."), "7 days, bank details…");
});

test("three of the same edit is offered; two is not; another edit counts on its own", () => {
  const send = (inv: number, h: number) => `Draft invoice #${inv} for Northside: ${h} hours at my usual rate. One page, due in 7 days.`;
  let r = l.heard(T, [], send(1050, 6));
  assert.equal(r.learn, null);
  r = l.heard(T, r.edits, "Draft invoice #1051 for Northside: 2 hours at my usual rate. Two pages, due in 14 days.");
  r = l.heard(T, r.edits, send(1052, 9));
  assert.equal(r.learn, null, "two of the same");
  r = l.heard(T, r.edits, send(1053, 3).toUpperCase().replace("DRAFT", "draft"));
  assert.ok(r.learn, "case and marks do not make it another edit");
  assert.equal(r.learn.count, 3);
  assert.equal(r.learn.form, "draft INVOICE {invoice} FOR NORTHSIDE: {hours} HOURS AT MY USUAL RATE. ONE PAGE, DUE IN 7 DAYS.");
  assert.equal(l.heard(T, [], send(1, 1).replace("7 days", "14 days")).edits.length, 0, "no edit: nothing kept");
});

const offer: Offer = { id: "off-inv", kind: "ask", count: 6, sessions: 6, first: Date.parse("2026-11-04T09:00:00Z"), last: Date.parse("2026-11-09T09:00:00Z"),
  words: "draft invoice ____ for northside ____ hours", examples: [], blanks: [{ name: "invoice", values: ["#1046", "#1045"] }, { name: "hours", values: ["9", "3"] }],
  template: T, sentence: "", folder: "/work/shop", head: ["draft", "invoice", "northside"] };
const w = { project: "shop", sessionId: "sess-l", by: "Ana" };
beforeEach(() => { process.env.SOL_YOURS_GAP_MS = "0"; k._reload(); jev.setYoursJev(null); });

test("a kept tool takes the edit in one press, only one heard three times; undo change puts it back", async () => {
  const { kept } = k.keep(w, offer, k.versionsOf(offer)[0]);
  const out: any[] = [];
  const say = (text: string) => k.hear({ on: true, type: "work.yours.sent", id: kept.id, text }, (o) => out.push(o));
  assert.throws(() => k.learn(kept.id, "anything at all"), /not made three times/);
  for (const [i, h] of [[1050, 6], [1051, 2], [1052, 9]]) await say(`Draft invoice #${i} for Northside: ${h} hours at my usual rate. One page, due in 7 days.`);
  assert.equal(out[0].learn, null);
  assert.equal(out[2].learn.count, 3);
  await k.hear({ on: true, type: "work.yours.learn", id: kept.id, form: out[2].learn.form }, (o) => out.push(o));
  const now = out[3].kept;
  assert.match(now.spec.template, /due in 7 days\.$/);
  assert.deepEqual(now.spec.fields.map((f: any) => f.name), ["invoice", "hours"], "its blanks stay");
  assert.equal(now.before.template, T);
  assert.deepEqual(now.edits, [], "taken: the edits start again");
  assert.equal(k.unchange(kept.id).spec.template, T, "undo change puts the template back");
});

test("a counter offers its next; the made tool shows the value just sent; a kept tool's counter moves on with each send", async () => {
  assert.equal(l.counterNext(["#1046", "#1045", "#1044"]), "#1047");
  assert.equal(l.counterNext(["9", "3", "8"]), null, "values that do not count up are choices");
  assert.equal(l.counterNext(["#12", "11", "10"]), null, "one shape only");
  assert.equal(l.counterNext(["#2", "#1"]), null, "two is not yet a counter");
  assert.deepEqual(l.valuesFrom(T, "Draft invoice #1048 for Northside: 7 hours at my usual rate. One page, due in 14 days."), { invoice: "#1048", hours: "7" });
  const seen = k.withSaid({ ...offer, blanks: [{ name: "invoice", values: ["#1046", "#1045", "#1044"] }, { name: "hours", values: ["9", "3", "8"] }] },
    "Draft invoice #1048 for Northside: 7 hours at my usual rate. One page, due in 14 days.");
  const v = k.versionsOf(seen);
  assert.deepEqual(v[0].fields.map((f) => [f.name, f.value, !!f.next]), [["invoice", "#1049", true], ["hours", "7", false]], "the next invoice, the hours just sent");
  assert.ok(!k.pushesOf(v[0]).includes("without invoice"), "a counter is never dropped");
  // a counter and bare numbers are no choice (the designer, NOW 05:35 2): no row each, a pin by the box instead
  assert.deepEqual(v.map((x) => x.shape), ["button", "pin", "brief"], "no rows: neither the counter nor bare hours are a choice");
  const named = k.versionsOf({ ...seen, blanks: [...seen.blanks, { name: "client", values: ["Northside", "Halden"] }] });
  assert.equal(named[1].shape, "rows", "a blank of words with two values is a choice");
  assert.doesNotMatch(k.pageOf(named[1]), /data-row="#10/, "the rows are never the counter's");
  const { kept } = k.keep(w, seen, v[0]);
  k.sent(kept.id, "Draft invoice #1049 for Northside: 2 hours at my usual rate. One page, due in 14 days.");
  const now = k.kept().find((x) => x.id === kept.id)!;
  assert.deepEqual(now.spec.fields.map((f) => f.value), ["#1050", "2"]);
});

test("a blank holds a run of words up to the template's next word; the edit around it is still heard", () => {
  const C = "Draft invoice {invoice} for {client}: {hours} hours at my usual rate. One page, due in 14 days.";
  assert.equal(l.formOf(C, "Draft invoice #1050 for Northside Bakery: 6 hours at my usual rate. One page, due in 14 days."), C, "a client of two words is one value");
  assert.equal(l.formOf(C, "Draft invoice #1050 for Northside Bakery Ltd: 6 hours at my usual rate. One page, due in 7 days."),
    "Draft invoice {invoice} for {client}: {hours} hours at my usual rate. One page, due in 7 days.");
});

test("sent and learn are read on this machine: Jev is never asked", async () => {
  let calls = 0;
  jev.setYoursJev(async () => { calls++; return null; });
  const { kept } = k.keep(w, offer, k.versionsOf(offer)[0]);
  calls = 0;   // keeping may ask nothing either way; only what follows is pinned
  const out: any[] = [];
  for (const [i, h] of [[1060, 6], [1061, 2], [1062, 9]]) await k.hear({ on: true, type: "work.yours.sent", id: kept.id, text: `Draft invoice #${i} for Northside: ${h} hours at my usual rate. One page, due in 7 days.` }, (o) => out.push(o));
  await k.hear({ on: true, type: "work.yours.learn", id: kept.id, form: out[2].learn.form }, (o) => out.push(o));
  assert.match(out[3].kept.spec.template, /due in 7 days\.$/);
  assert.equal(calls, 0, "no send, no edit and no learn goes to Jev");
});

test("not now on a learned edit: offered again only after the same edit three more times", async () => {
  const { kept } = k.keep(w, offer, k.versionsOf(offer)[0]);
  const out: any[] = [];
  const say = (i: number) => k.hear({ on: true, type: "work.yours.sent", id: kept.id, text: `Draft invoice #${i} for Northside: 4 hours at my usual rate. One page, due in 7 days.` }, (o) => out.push(o));
  for (const i of [1070, 1071, 1072]) await say(i);
  const form = out[2].learn.form;
  await k.hear({ on: true, type: "work.yours.learn", id: kept.id, form, no: true }, (o) => out.push(o));
  assert.equal(out[3].kept.spec.template, T, "declined: the tool is as it was");
  out.length = 0;
  for (const i of [1073, 1074]) await say(i);
  assert.equal(out[1].learn, null, "two more is not enough");
  await say(1075);
  assert.equal(out[2].learn?.count, 3, "three more: offered again");
});

test("the values of a send: a blank of two words is one value, and its mark is cut only when it is there", () => {
  const C = "Draft invoice {invoice} for {client}: {hours} hours at my usual rate.";
  assert.deepEqual(l.valuesFrom(C, "Draft invoice #1050 for Northside Bakery: 6 hours at my usual rate."), { invoice: "#1050", client: "Northside Bakery", hours: "6" });
  assert.deepEqual(l.valuesFrom(C, "Draft invoice #1051 for Halden: 2 hours at my usual rate."), { invoice: "#1051", client: "Halden", hours: "2" });
  // the kept tool takes them as sent, never "Northsid" and "Bakery" as the hours
  const seen = k.withSaid({ ...offer, template: C, blanks: [{ name: "invoice", values: ["#1046"] }, { name: "client", values: ["Halden"] }, { name: "hours", values: ["9"] }] },
    "Draft invoice #1050 for Northside Bakery: 6 hours at my usual rate.");
  assert.deepEqual(seen.blanks.map((b) => b.values[0]), ["#1050", "Northside Bakery", "6"]);
});

test("a blank never swallows the person's own edit: a run is one value only when the rest still lines up; a counter takes counts only", async () => {
  const P = "Review PR {PR} and post the summary";
  assert.deepEqual(l.valuesFrom(P, "Review PR #1049 then post a summary and tag me"), { PR: "#1049" }, "the edit stays an edit");
  assert.deepEqual(l.valuesFrom("Draft invoice {invoice} for {client}: {hours} hours", "Draft invoice #1 for Northside Bakery: 6 hours"), { invoice: "#1", client: "Northside Bakery", hours: "6" });
  const counted: Offer = { ...offer, id: "off-pr", template: P, words: "review pr ____ and post the summary", blanks: [{ name: "PR", values: ["#1048", "#1047", "#1046"] }], head: ["review", "pr", "post", "summary"] };
  const { kept } = k.keep(w, counted, k.versionsOf(counted)[0]);
  k.sent(kept.id, "Review PR #1049 then post a summary and tag me");
  const now = k.kept().find((x) => x.id === kept.id)!;
  assert.equal(now.spec.fields[0].value, "#1050", "the counter moved on from #1049, and counts on");
  assert.ok(now.spec.fields[0].next);
});
