// Agents' meta (#1327, pass 2): traces from did lines, the same-job test (Jev, its half band, the code fallback), the
// four gates each failing alone, triggers learned per place, trust by reach. Pure, over invented people.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dateIn, madeOf, minutesIn, sourcesIn, stampAt, tracesIn, type Trace } from "../src/agent/meta/traces.ts";
import { groupTraces, maskOf, ruleShape, sameByCode, scorePair } from "../src/agent/meta/jobs.ts";
import { gate } from "../src/agent/meta/offer.ts";
import { capped, firesDue, mandateOf, nextFire, reachOf, triggerFor } from "../src/agent/meta/when.ts";
import { datesOf } from "../src/agent/meta/keeper.ts";
import type { Ask } from "../src/agent/meta/jev.ts";
import { NOW, NURSE } from "./agents-fixtures.ts";

const D = 86_400_000;
const T = (o: Partial<Trace> & { id: string }): Trace => ({ place: "p", at: NOW - D, sources: ["rota"], made: { kind: "calendar", for: "self" }, steps: ["in"], minutes: 20, text: "x", from: "did", ...o });
const all = (...ts: Trace[]) => ts.map((trace) => ({ trace, weight: 1 as const }));
const now = () => "now" as const;

test("traces: one per did line, its place (an item when the title names one), when, what it read and made, minutes, date", () => {
  const ts = tracesIn(NURSE["work/stickies.md"], "work", NOW, [{ id: "ward-a", name: "Ward A" }, { id: "ward-c", name: "Ward C" }]);
  assert.equal(ts.length, 3, "an open sticky with no did line is no trace");
  assert.deepEqual(ts.map((t) => t.place), ["work#ward-a", "work#ward-a", "work#ward-c"]);
  assert.deepEqual(ts.map((t) => t.date), ["2026-10-01", "2026-11-01", "2026-12-01"]);
  assert.deepEqual([new Date(ts[0].at).getMonth(), new Date(ts[0].at).getDate(), new Date(ts[0].at).getHours()], [8, 18, 20]);
  assert.deepEqual([ts[0].sources, ts[0].made, ts[0].minutes], [["rota"], { kind: "calendar", for: "self" }, 20]);
  assert.deepEqual(ts[0].steps, ["13 shifts into my calendar", "2 swap asks set aside"]);
  assert.deepEqual(tracesIn(NURSE["work/stickies.md"], "work", NOW).map((t) => t.place), ["work", "work", "work"], "no items: the folder");
  // the same text read twice gives the same ids (the store adds nothing twice)
  assert.deepEqual(tracesIn(NURSE["work/stickies.md"], "work", NOW).map((t) => t.id), tracesIn(NURSE["work/stickies.md"], "work", NOW).map((t) => t.id));
});

test("traces: a shown sticky is a trace with its steps and its cadence", () => {
  const text = "- [ ] Weekly stock count — count and order\n  - shown Nov 11 · every week\n  - step: https://supplier.example/stock · pressed \"Count\"\n  - step: wrote the order into order.md\n";
  const [t] = tracesIn(text, "shop", NOW);
  assert.equal(t.from, "shown");
  assert.equal(t.cadence, "every week");
  assert.equal(t.steps.length, 2);
  assert.deepEqual(t.sources, ["supplier.example"]);
});

test("a did line's parts: made and for whom, sources, minutes; a title's date; a stamp's year", () => {
  assert.deepEqual(madeOf("update drafted to the client"), { kind: "message", for: "others" });
  assert.deepEqual(madeOf("4 dates into our calendar"), { kind: "calendar", for: "self" });
  assert.deepEqual(madeOf("saved to credits.md"), { kind: "md", for: "self" });
  assert.deepEqual(madeOf("looked"), { kind: "", for: "self" }, "it does not say: empty, never guessed");
  assert.deepEqual(sourcesIn("x · read: the rota, payslip.pdf and mail · 5 min"), ["rota", "payslip.pdf", "mail"]);
  assert.deepEqual(sourcesIn("drafted from 6 h of hours.md"), ["hours.md"], "from …: the files it names");
  assert.equal(minutesIn("· 1.5 h"), 90);
  assert.equal(minutesIn("no time said"), null);
  assert.equal(dateIn("Car insurance renews Dec 3", NOW), "2026-12-03");
  assert.equal(dateIn("Q1 estimate by Jan 15", NOW), "2027-01-15");
  assert.equal(dateIn("Nov 3 market stall", NOW), "2026-11-03");
  assert.equal(dateIn("market stall", NOW), undefined);
  assert.equal(new Date(stampAt("asked Dec 20 08:00", NOW)!).getFullYear(), 2025, "a stamp after now is last year's");
});

test("masking: the place, the names and the dates out; words that only look like dates stay", () => {
  assert.equal(maskOf("Ward A rota from Oct 1 → my calendar, a swap ask to Dana", ["Ward A"]), "<place> rota from <date> → my calendar, a swap ask to <name>");
  assert.equal(maskOf("trip money for the market on Fri at 16:30", []), "trip money for the market on <day> at <time>");
});

test("same job: Jev's bands; Jev null falls back to the same sources and the same output kind", async () => {
  const a = T({ id: "a" }), b = T({ id: "b", place: "q" }), c = T({ id: "c", sources: ["mail"] }), d = T({ id: "d", made: { kind: "message", for: "others" } });
  assert.equal(sameByCode(a, b), true);
  assert.equal(sameByCode(a, c), false);
  assert.equal(sameByCode(a, d), false);
  const nul: Ask = async () => null;
  assert.deepEqual(await scorePair(a, b, nul, []), { p: 1, band: "same", by: "code" });
  assert.deepEqual(await scorePair(a, c, nul, []), { p: 0, band: "different", by: "code" });
  const p = (x: number): Ask => async () => x;
  assert.equal((await scorePair(a, c, p(0.71), [])).band, "same");
  assert.equal((await scorePair(a, c, p(0.5), [])).band, "half");
  assert.equal((await scorePair(a, b, p(0.2), [])).band, "different", "Jev's answer wins over code");
  const cache: Record<string, number | null> = {};
  let n = 0;
  const counted: Ask = async () => { n++; return 0.9; };
  await scorePair(a, b, counted, [], cache); await scorePair(b, a, counted, [], cache);
  assert.equal(n, 1, "a pair is asked once");
});

test("grouping traces: same joins at 1, half at 0.5, different starts its own job", async () => {
  const ts = [T({ id: "a", at: 1 }), T({ id: "b", at: 2 }), T({ id: "c", at: 3 }), T({ id: "z", at: 4, sources: ["till"] })];
  const ask: Ask = async (_q, x, y) => (x.includes("till") || y.includes("till") ? 0.1 : y.includes("<place>") ? 0.9 : 0.9);
  const g = await groupTraces(ts, ask, []);
  assert.deepEqual(g.map((x) => x.members.map((m) => `${m.trace.id}:${m.weight}`)), [["a:1", "b:1", "c:1"], ["z:1"]]);
  const halfAsk: Ask = async () => 0.5;
  const h = await groupTraces(ts.slice(0, 3), halfAsk, []);
  assert.deepEqual(h[0].members.map((m) => m.weight), [1, 0.5, 0.5]);
});

test("the gate: all four pass; each one failing alone fails the offer", () => {
  const ok = all(T({ id: "a", at: NOW - 60 * D }), T({ id: "b", at: NOW - 30 * D }), T({ id: "c" }));
  assert.deepEqual(gate(ok, NOW, now), { ok: true, count: 3 });
  // recurs: two, or three spread past 90 days
  assert.equal((gate(ok.slice(0, 2), NOW, now) as { fail: string }).fail, "recurs");
  assert.equal((gate(all(T({ id: "a", at: NOW - 120 * D }), T({ id: "b", at: NOW - 30 * D }), T({ id: "c" })), NOW, now) as { fail: string }).fail, "recurs");
  // a said cadence: one is enough
  assert.equal(gate(all(T({ id: "a", cadence: "every week" })), NOW, now).ok, true);
  // steps: one step (no read, or nothing made) is a sticky
  assert.deepEqual(gate(all(T({ id: "a", at: NOW - 3 * D }), T({ id: "b", at: NOW - 2 * D }), T({ id: "c", sources: [] })), NOW, now), { ok: false, count: 3, fail: "steps", say: "a sticky is enough" });
  assert.equal((gate(all(T({ id: "a", at: NOW - 3 * D }), T({ id: "b", at: NOW - 2 * D }), T({ id: "c", made: { kind: "", for: "self" } })), NOW, now) as { fail: string }).fail, "steps");
  // cost: under 5 minutes with no date fails; a date it must meet passes
  const quick = all(T({ id: "a", minutes: 2 }), T({ id: "b", minutes: 3 }), T({ id: "c", minutes: null }));
  assert.equal((gate(quick, NOW, now) as { fail: string }).fail, "cost");
  assert.equal(gate([...quick.slice(0, 2), ...all(T({ id: "c", minutes: null, date: "2026-12-01" }))], NOW, now).ok, true);
  // reachable: a source that can never be read fails, and says nothing
  const r = gate(ok, NOW, () => "never");
  assert.deepEqual(r, { ok: false, count: 3, fail: "reach" });
  assert.equal(gate(ok, NOW, () => "sign-in").ok, true, "one sign-in per source is fine");
});

test("the half band counts half and never offers alone", () => {
  const anchorAndHalves = [{ trace: T({ id: "a" }), weight: 1 as const }, ...["b", "c", "d", "e"].map((id) => ({ trace: T({ id }), weight: 0.5 as const }))];
  assert.equal(gate(anchorAndHalves, NOW, now).ok, false, "one full and four halves is 3 by count, still no offer");
  const two = [{ trace: T({ id: "a" }), weight: 1 as const }, { trace: T({ id: "b" }), weight: 1 as const }, { trace: T({ id: "c" }), weight: 0.5 as const }];
  assert.equal(gate(two, NOW, now).ok, false, "2.5 is under 3");
  assert.equal(gate([...two, { trace: T({ id: "d" }), weight: 0.5 as const }], NOW, now).ok, true, "two full and two halves");
});

test("triggers: an input that can be watched; else the place's own lead time; else the job's; else the stated default", () => {
  const at = (iso: string, h = 20) => new Date(`${iso}T${String(h).padStart(2, "0")}:00:00`).getTime();
  const a = [T({ id: "1", place: "a", at: at("2026-09-18"), date: "2026-10-01" }), T({ id: "2", place: "a", at: at("2026-10-17"), date: "2026-11-01" })];
  const c = [T({ id: "3", place: "c", at: at("2026-11-13", 21), date: "2026-12-01" })];
  assert.deepEqual(triggerFor(a, [...a, ...c], ["rota"], ["rota"]), { kind: "date", leadDays: 14, hour: 20, learned: "place" });
  assert.deepEqual(triggerFor(c, [...a, ...c], ["rota"], ["rota"]), { kind: "date", leadDays: 18, hour: 21, learned: "place" });
  assert.deepEqual(triggerFor([], [...a, ...c], ["rota"], ["rota"]), { kind: "date", leadDays: 15, hour: 20, learned: "job" }, "a new place: the job's history (13, 15, 18)");
  assert.deepEqual(triggerFor([], [], ["rota"], ["rota"]), { kind: "date", leadDays: 1, hour: 9, learned: "default" });
  assert.deepEqual(triggerFor(a, a, ["folder"], ["folder"]), { kind: "input", source: "folder" });
  assert.equal(triggerFor(a, a, ["folder"], []).kind, "date", "the place does not watch that input: its date");
});

test("a date trigger fires at its date minus the lead, at its hour, each date once", () => {
  const t = { kind: "date" as const, leadDays: 2, hour: 20, learned: "place" as const };
  assert.deepEqual(nextFire(t, ["2026-12-01", "2026-11-17"], NOW), { at: new Date(2026, 10, 29, 20).getTime(), date: "2026-12-01" }, "Nov 15 20h is past; Nov 29 20h next");
  assert.deepEqual(firesDue(t, ["2026-12-01"], new Date(2026, 10, 29, 19).getTime(), new Date(2026, 10, 29, 20, 1).getTime()), ["2026-12-01"]);
  assert.deepEqual(firesDue(t, ["2026-12-01"], new Date(2026, 10, 29, 20, 1).getTime(), new Date(2026, 10, 29, 21).getTime()), []);
  assert.deepEqual(datesOf("- [ ] Ward A rota from Dec 1\n- [x] Old one Nov 1\n- [ ] no date\n", "Dec 24 · Ward C night\n", NOW), ["2026-12-01", "2026-12-24"]);
  assert.deepEqual(datesOf("- [ ] Ward A rota from Dec 1\n", "Dec 24 · Ward C night\n", NOW, "Ward C"), ["2026-12-24"], "an item's own dates");
});

test("trust by reach: only the person → does; someone else → drafts; money, a submission, a deletion → asks", () => {
  assert.equal(reachOf({ for: "self" }, "13 shifts into my calendar"), "does");
  assert.equal(reachOf({ for: "others" }, "update drafted to the client"), "drafts");
  assert.equal(reachOf({ for: "self" }, "topped up the lunch account $30"), "asks");
  assert.equal(reachOf({ for: "self" }, "submitted the claim form"), "asks");
  assert.equal(reachOf({ for: "self" }, "deleted the old drafts"), "asks");
  assert.equal(capped("does", "drafts"), "drafts");
  assert.equal(capped("looks", "drafts"), "looks");
  assert.equal(capped("asks", "drafts"), "asks");
  assert.deepEqual(mandateOf("looks"), { mode: "watch", rung: "read" });
  assert.deepEqual(mandateOf("asks"), { mode: "do", rung: "propose" });
  assert.deepEqual(mandateOf("does"), { mode: "do", rung: "draft" });
});

test("a rule's shape: what it reads and what it makes, the place and dates out, never the clock", () => {
  assert.deepEqual(ruleShape({ sentence: "Fri 16:00 hours.md into drafts/update.md for Acme", source: "clock", names: ["Acme"] }), { reads: ["hours.md"], made: ["drafts/update.md"] });
  assert.deepEqual(ruleShape({ sentence: "05:30 the orders", source: "clock", names: [] }), { reads: [], made: [] });
  assert.deepEqual(ruleShape({ sentence: "every 60 min the supplier's mail into supplier.md", source: "mail", names: [] }), { reads: ["mail"], made: ["supplier.md"] });
  assert.deepEqual(ruleShape({ sentence: "a new file in brief/ → read it into notes.md", source: "folder", names: [] }), { reads: ["brief/", "folder"], made: ["notes.md"] });
  assert.deepEqual(ruleShape({ sentence: "08:30 make the stall sheet from stock.csv", source: "clock", names: [] }), { reads: ["stock.csv"], made: [] });
});
