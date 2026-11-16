// node --test src/*.test.ts (npm test here): the five reads for a sentence (#792, plan Part C slice 29;
// home/whole/reads.ts, Say.tsx; the stub of #827 in today.ts). The Try line: "call Sam about the offer Thursday": read as
// for you, ringed on Thursday. And the rules under it: the split, the five with their bars, the verdict words, where it
// goes, the override as a learned line, ⇥, Enter's filing with one receipt and one undo, and scene 2's sentence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { READS, cycle, dayOf, labelOf, readOf, receiptLine, split, verdictOf, verdictWords, whereOf, type Filed } from "./home/whole/reads.ts";
import { stub, type DoneMsg, type TodayMsg } from "./home/whole/today.ts";
import { bus, LOG_KEY, type Shelf } from "./home/whole/bus.ts";

const NOW = new Date(2026, 10, 9, 8, 40).getTime();   // Monday 9 November, 8:40 (the scenes' morning)
const THU = (h: number, m = 0) => new Date(2026, 10, 12, h, m).getTime();
type Msg = TodayMsg | DoneMsg;
const todayOf = (ms: Msg[]) => ms.find((m): m is TodayMsg => m.type === "home.today")!;
const doneOf = (ms: Msg[]) => ms.find((m): m is DoneMsg => m.type === "home.done")!;
const filedOf = (r: ReturnType<typeof readOf>): Filed[] => r.parts.map((p) => ({ text: p.text, read: p.read, folder: p.folder, at: p.at, after: p.after, found: p.found }));

test("“call Sam about the offer Thursday”: read as for you, ringed on Thursday", () => {
  const ask = stub(() => NOW), t = todayOf(ask({ type: "home.today" }));
  assert.ok(!t.today.week.some((m) => m.label === "call Sam"), "no call Sam on the week before it is said");
  const r = readOf("call Sam about the offer Thursday", t.today.week, NOW);
  assert.equal(r.parts.length, 1, "one thing");
  const [p] = r.parts;
  assert.equal(p.read, "you", "for you: a call is never an agent's");
  assert.equal(verdictWords(p, p.read), "sure");
  assert.equal(p.folder, "jobs");
  assert.equal(p.at, THU(13), "Thursday 13:00, after the exam");
  assert.equal(whereOf(p, p.read, t.today.week, NOW), "Thursday 13:00, after your bio exam · jobs · only you do it; Sol prepares it");
  // ↵ files it: a yellow ring on Thursday, tied to the thing; it joins the list on its morning, not before
  const out = ask({ type: "home.file", parts: filedOf(r) }), d = doneOf(out), w = todayOf(out);
  const ring = w.today.week.find((m) => m.thingId === d.thingId)!;
  assert.equal(ring.kind, "you", "a ring");
  assert.equal(ring.yours, true, "in the yellow that is yours");
  assert.equal(ring.at, THU(13), "on Thursday at 13:00");
  assert.equal(ring.label, "call Sam");
  assert.ok(!w.today.needs.includes(d.thingId), "not on the list before Thursday morning");
  assert.equal(d.line, "↳ jobs · for you, Thursday 13:00, after your bio exam · it joins this list Thursday morning, prepared");
  // what did I just do, and undo it: the ring goes
  const u = todayOf(ask({ type: "home.undo", ledgerId: d.ledgerId }));
  assert.ok(!u.today.week.some((m) => m.thingId === d.thingId), "undo takes the ring away");
});

test("scene 2: “bio exam thursday, make notes from the slides”: two parts, the date already there adds nothing, the notes a job", () => {
  const ask = stub(() => NOW), t = todayOf(ask({ type: "home.today" }));
  const r = readOf("bio exam thursday, make notes from the slides", t.today.week, NOW);
  assert.deepEqual(r.parts.map((p) => [p.text, p.read]), [["bio exam thursday", "date"], ["make notes from the slides", "job"]]);
  assert.equal(r.parts[0].found, "w-bio-exam");
  assert.match(whereOf(r.parts[0], "date", t.today.week, NOW), /^already on your calendar · Thursday 10:00, bio exam · nothing added$/);
  assert.equal(r.parts[1].folder, "school › bio 201");
  const before = t.today.week.length, out = ask({ type: "home.file", parts: filedOf(r) }), d = doneOf(out);
  assert.equal(d.thingIds!.length, 1, "the date adds nothing; the job is one thing");
  assert.ok(todayOf(out).today.moving.includes(d.thingIds![0]), "the job is moving");
  assert.equal(todayOf(out).today.week.length, before + 1, "its thread on the week, and no second exam");
});

test("the split, the five, the bars and the verdict words", () => {
  assert.deepEqual(split("bio exam thursday, make notes from the slides; call mum and then book the dentist"), ["bio exam thursday", "make notes from the slides", "call mum", "book the dentist"]);
  const { parts: [p] } = readOf("call Sam about the offer Thursday", [], NOW);
  assert.deepEqual(Object.keys(p.p), [...READS], "a bar for each of the five");
  assert.ok(Math.abs(READS.reduce((s, r) => s + p.p[r], 0) - 1) < 0.02, "the probabilities make one");
  assert.equal(verdictOf(0.7), "sure"); assert.equal(verdictOf(0.45), "guess"); assert.equal(verdictOf(0.44), "asks");
  const { parts: [g] } = readOf("dinner friday", [], NOW);
  assert.equal(g.read, "date");
  const { parts: [m] } = readOf("thursday", [], NOW);
  assert.match(verdictWords(m, m.read), /^a guess · or for you\?$/);
  const { parts: [n] } = readOf("the blue one was nicer", [], NOW);
  assert.equal(n.read, "note"); assert.equal(verdictWords(n, n.read), "asks you on ↵");
  assert.equal(verdictWords(p, "job"), "yours", "a read the person picked is theirs");
  assert.equal(cycle("make"), "note", "⇥ goes round the track");
  assert.equal(dayOf("thursday", NOW), 3); assert.equal(dayOf("today", NOW), 0); assert.equal(dayOf("no day", NOW), null);
  assert.equal(labelOf("call Sam about the offer Thursday"), "call Sam");
});

test("the override: filed as the person read it, and a learned line that changes nothing on the list or the shared log", () => {
  const s = new Map<string, string>(), shelf: Shelf = { get: (k) => s.get(k) ?? null, set: (k, v) => void s.set(k, v) };
  const b = bus(() => {}, () => NOW, shelf);
  const before = todayOf(b.send({ type: "home.today" }));
  const after = todayOf(b.send({ type: "home.learn", learned: { text: "call Sam about the offer Thursday", from: "you", to: "job" } }));
  assert.deepEqual(after.today, before.today);
  assert.equal(s.get(LOG_KEY), undefined, "a learned line is not an ask the other windows replay");
  const r = readOf("call Sam about the offer Thursday", before.today.week, NOW);
  const out = b.send({ type: "home.file", parts: [{ ...filedOf(r)[0], read: "job", was: "you" }] }), d = doneOf(out);
  assert.ok(todayOf(out).today.moving.includes(d.thingId), "filed as a job, as the person pressed");
  assert.match(receiptLine([{ ...filedOf(r)[0], read: "job" }], NOW), /^jobs · a job, started · ready Thursday 13:00$/);
});

test("the seams: Home's root hooks the box at its foot, marked; the box is the switch's (First.tsx is only drawn with it on)", () => {
  const first = readFileSync(new URL("./home/whole/First.tsx", import.meta.url), "utf8");
  assert.match(first, /<Say now=\{now\} \/>\{\/\* C29/);
  const css = readFileSync(new URL("./home/whole-say.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\d+m?s\b|(?<![\d.])(?!1px\b)\d+px/i, "Home's CSS keeps only layout, on the scale");
});

test("the weekday a sentence names and the stub's week are one calendar, on any day (#867 F1: not only on a Monday)", () => {
  const TUE = new Date(2026, 10, 10, 8, 40).getTime();   // Tuesday 10 November
  const ask = stub(() => TUE), t = todayOf(ask({ type: "home.today" }));
  const exam = t.today.week.find((m) => m.id === "w-bio-exam")!;
  assert.equal(new Date(exam.at).getDay(), 4, "the bio exam stays on Thursday");
  assert.equal(dayOf("Thursday", TUE), 2);
  const [p] = readOf("call Sam about the offer Thursday", t.today.week, TUE).parts;
  assert.equal(p.at, THU(13), "Thursday 13:00, after the exam, on a Tuesday too");
  assert.equal(p.after, "bio exam");
  const r = readOf("bio exam thursday, make notes from the slides", t.today.week, TUE);
  assert.equal(r.parts[0].found, "w-bio-exam", "the exam already on the calendar: nothing added");
  const SAT = new Date(2026, 10, 14, 9).getTime();
  const late = todayOf(stub(() => SAT)({ type: "home.today" })).today.week.find((m) => m.id === "w-bio-exam")!;
  assert.equal(new Date(late.at).getDay(), 4, "past this week's Thursday, the exam is next Thursday's");
  assert.ok(late.at > SAT);
});

test("⌘Z in the box is the box's own: the receipt's undo skips a field (#867 F2)", async () => {
  const { inField } = await import("./home/whole/First.tsx").catch(() => ({ inField: null as null | ((t: unknown) => boolean) }));
  const src = readFileSync(new URL("./home/whole/First.tsx", import.meta.url), "utf8");
  assert.match(src, /ev\.key\.toLowerCase\(\) === "z" && !inField\(ev\.target\)/, "the window's ⌘Z leaves a field alone");
  if (inField) {
    assert.equal(inField({ tagName: "INPUT", isContentEditable: false }), true);
    assert.equal(inField({ tagName: "DIV", isContentEditable: false }), false);
  }
});
