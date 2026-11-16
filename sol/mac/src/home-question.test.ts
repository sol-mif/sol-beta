// node --test src/*.test.ts (npm test here): the question card, here and in the notch (#794, plan Part C slice 31;
// home/whole/question.ts, bus.ts, notch/Question.tsx). The Try line: answer in the notch: the card on Home is gone too.
// Two windows (Home and the notch) on one shared storage, each with its own end of the list's bus, as the face runs
// them until the engine half (#790) is the one list both read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bus, LOG_KEY, type Shelf } from "./home/whole/bus.ts";
import { frontOf, notchAskOf, questionOf, answeredLine } from "./home/whole/question.ts";
import { stackOf, type DoneMsg, type TodayMsg, type Thing } from "./home/whole/today.ts";

const NOW = new Date(2026, 10, 9, 8, 40).getTime();
type Msg = TodayMsg | DoneMsg;
const shelf = (): Shelf & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) }; };
/** one window: its end of the bus and what it last heard, as the store keeps it */
function win(s: Shelf, now: () => number = () => NOW) {
  const w = { today: null as TodayMsg | null, done: null as DoneMsg | null };
  const keep = (ms: Msg[]) => { for (const m of ms) if (m.type === "home.today") w.today = m; else w.done = m; };
  const b = bus((ms) => { if (!ms.some((m) => m.type === "home.done")) w.done = null; keep(ms); }, now, s);
  w.done = b.replayed.find((m): m is DoneMsg => m.type === "home.done") ?? null;   // as store.ts's connect keeps it
  return { w, b, ask: (a: Parameters<typeof b.send>[0]) => keep(b.send(a)), things: () => new Map((w.today?.things ?? []).map((t) => [t.id, t] as const)) };
}

test("the question stands in front on Home and drops in the notch: one at a time", () => {
  const s = shelf(), home = win(s), notch = win(s);
  home.ask({ type: "home.today" }); notch.ask({ type: "home.today" });
  const needs = home.w.today!.today.needs, things = home.things();
  const q = questionOf(needs, things)!;
  assert.equal(q.id, "t-maya-data", "the one a job asks");
  assert.equal(stackOf(needs, frontOf(needs, things, null)).front, q.id, "in front of the list on Home");
  assert.equal(stackOf(needs, frontOf(needs, things, "t-chem-set6")).front, "t-chem-set6", "unless the person brought another forward");
  const n = notchAskOf(questionOf(notch.w.today!.today.needs, notch.things())!)!;
  assert.equal(n.id, q.id, "the notch shows the same question");
  assert.equal(n.title, "Maya asked twice for your data section.");
  assert.equal(n.meta, "work › stats group");
  assert.equal(n.source, "mail");
  assert.doesNotMatch(n.why, /\.\s+\S/, "one line of why");
  assert.deepEqual(n.answers, ["draft it from my sheet", "I’ll send it"]);
});

test("answer in the notch: the card on Home is gone too, the job goes on, and Home can undo it", () => {
  const s = shelf(), home = win(s), notch = win(s);
  home.ask({ type: "home.today" }); notch.ask({ type: "home.today" });
  notch.ask({ type: "home.answer", thingId: "t-maya-data", answer: "draft it from my sheet" });
  assert.ok(!notch.w.today!.today.needs.includes("t-maya-data"), "gone from the notch's list");
  // Home hears the news (the storage event, the channel or the app's event: each calls pull)
  assert.ok(home.b.pull().some((m) => m.type === "home.done"));
  const t = home.w.today!.today;
  assert.ok(!t.needs.includes("t-maya-data"), "the card on Home is gone too");
  assert.equal(questionOf(t.needs, home.things()), null, "no question left: no card in the notch either");
  assert.ok(t.moving.includes("t-maya-data"), "the job goes on");
  assert.equal(t.line, "Two things need you. Three are moving on their own.");
  assert.equal(home.w.done?.answer, "draft it from my sheet", "Home's receipt says what was answered in the notch");
  // what did I just do, and undo it: Home's undo brings the question back to both
  home.ask({ type: "home.undo", ledgerId: home.w.done!.ledgerId });
  assert.ok(home.w.today!.today.needs.includes("t-maya-data"));
  notch.b.pull();
  assert.ok(notch.w.today!.today.needs.includes("t-maya-data"), "and to the notch");
  assert.equal(notch.w.done, null, "an undo heard from another window takes the receipt away");
});

test("answering on Home resolves the notch's card too", () => {
  const s = shelf(), home = win(s), notch = win(s);
  notch.ask({ type: "home.today" });
  home.ask({ type: "home.answer", thingId: "t-maya-data", answer: "I’ll send it" });
  notch.b.pull();
  assert.equal(questionOf(notch.w.today!.today.needs, notch.things()), null);
  assert.ok(notch.w.today!.today.moving.includes("t-maya-data"), "either answer lets the job go on");
});

test("a window opened later starts where the others are (it replays the day's log)", () => {
  const s = shelf(), home = win(s);
  home.ask({ type: "home.answer", thingId: "t-maya-data", answer: "I’ll send it" });
  home.ask({ type: "home.later", thingId: "t-chem-set6" });
  const late = win(s);
  late.ask({ type: "home.today" });
  assert.deepEqual(late.w.today!.today.needs, home.w.today!.today.needs);
  assert.equal(JSON.parse(s.m.get(LOG_KEY)!).asks.length, 2, "only what changes the list is logged");
});

test("a question is only a thing a job asks, with its card", () => {
  const th = (id: string, state: Thing["state"], card = true): Thing => ({ id, read: "job", folder: "f", words: id, state, waitsOn: "you", at: NOW, links: [], made: [],
    ...(card ? { card: { source: "sol" as const, title: id, why: "Why. More.", chips: [], answers: ["a", "b"] as [string, string], touches: [], edge: id } } : {}) });
  const m = new Map([th("p", "proposed"), th("q0", "asks", false), th("q1", "asks"), th("q2", "asks")].map((t) => [t.id, t]));
  assert.equal(questionOf(["p", "q0", "q1", "q2"], m)?.id, "q1", "the first in order, one at a time");
  assert.equal(questionOf(["p"], m), null);
  assert.equal(notchAskOf(m.get("q1")!)?.why, "Why.");
  assert.equal(answeredLine("b"), "Answered · b");
});

test("the seams: the notch's hook is small, marked, and behind the switch", () => {
  const notch = readFileSync(new URL("./notch/Notch.tsx", import.meta.url), "utf8");
  assert.match(notch, /const \{ q: homeQ, drawn: homeQDrawn \} = useNotchQuestion\(/);
  assert.match(notch, /\{qShown && <NotchQuestion q=\{homeQ!\}.*onDrawn=\{homeQDrawn\}.*\{\/\* C31 \*\/\}/);
  const q = readFileSync(new URL("./notch/Question.tsx", import.meta.url), "utf8");
  assert.match(q, /const t = on && v\.today \? questionOf/, "with the switch off the notch shows no question");
  assert.match(q, /if \(q && shown\.current !== q\.id && !open\) drop\(\)/, "a question not yet drawn drops again once the notch closes");
  const first = readFileSync(new URL("./home/whole/First.tsx", import.meta.url), "utf8");
  assert.match(first, /stackOf\(needs, frontOf\(needs, v\.things, fs\.front\)\)/);
});

test("the store (what Home and the notch read) fills from the bus, and an answer through it leaves the list with its receipt", async () => {
  const st = await import("./home/whole/store.ts");
  st.send({ type: "home.today" });
  assert.equal(st.viewNow().today?.needs.length, 3, "the list arrives in the store, not only in the bus");
  st.answer("t-maya-data", "I’ll send it");
  const v = st.viewNow();
  assert.ok(!v.today!.needs.includes("t-maya-data"));
  assert.equal(v.done?.thingId, "t-maya-data");
  st.undo(v.done!.ledgerId);
  assert.ok(st.viewNow().today!.needs.includes("t-maya-data"));
  assert.equal(st.viewNow().done, null);
});

test("answered in the notch while Home was closed: Home opened later shows the receipt, and its undo brings the question back", () => {
  const s = shelf(), notch = win(s);
  notch.ask({ type: "home.today" });
  notch.ask({ type: "home.answer", thingId: "t-maya-data", answer: "draft it from my sheet" });
  const home = win(s);   // Home opens now, and replays the day's log quietly
  home.ask({ type: "home.today" });
  assert.ok(!home.w.today!.today.needs.includes("t-maya-data"));
  assert.equal(home.w.done?.answer, "draft it from my sheet", "the receipt survives the late replay");
  home.ask({ type: "home.undo", ledgerId: home.w.done!.ledgerId });
  assert.ok(home.w.today!.today.needs.includes("t-maya-data"), "undo brings it back on Home");
  notch.b.pull();
  assert.ok(notch.w.today!.today.needs.includes("t-maya-data"), "and in the notch");
  assert.equal(win(s).w.done, null, "a window opened after the undo shows no receipt");
});

test("a new day starts both windows from the seed, even when today's log is as long as yesterday's", () => {
  const s = shelf();
  let now = NOW;
  const home = win(s, () => now), notch = win(s, () => now);
  home.ask({ type: "home.answer", thingId: "t-maya-data", answer: "I’ll send it" });
  notch.b.pull();
  assert.ok(!notch.w.today!.today.needs.includes("t-maya-data"));
  now = NOW + 864e5;   // past midnight
  home.ask({ type: "home.later", thingId: "t-chem-set6" });   // today's first ask: the log is 1 long again
  notch.b.pull();
  notch.ask({ type: "home.today" });
  home.ask({ type: "home.today" });
  assert.deepEqual(notch.w.today!.today.needs, home.w.today!.today.needs, "the two windows show the same list");
  assert.ok(notch.w.today!.today.needs.includes("t-maya-data"), "yesterday's answer is not today's");
});
