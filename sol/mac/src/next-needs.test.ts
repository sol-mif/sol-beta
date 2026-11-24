// node --test src/*.test.ts: the Needs slice of the new face (#1615, docs/port/slices.md row 2): the pause rule, the
// ranking's words, arrivals folded, the learner's budget, "too much"'s fix, the moves (answer, ask, withdraw, take back,
// group, attach, tell, offer) and the live wire over today's messages. The numbers are the mockup's (merge/out/suite-*.json).
// Signed: marcocyl04-ux's agent, slice 2 of the port (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";   // fills the scenarios
import { count2, eligible, freshSig, simPeeks, tick, TL, wrongMoment } from "./next/needs/pause.ts";
import { allArrivals, arrivalView, evidence, fixFor, history, rankFor, reason, tooMuchData, yesWords } from "./next/needs/rank.ts";
import { answerOffer, freshLearner, pending, weekSim } from "./next/needs/learn.ts";
import { learner, offerNow } from "./next/cv/moves/needs.ts";
import { attach as wire } from "./next/cv/wire/needs.ts";

const settle = () => new Promise((r) => setTimeout(r, 0));

test("the pause rule: no peek at a wrong moment, one at a measured pause; count 2's numbers are the mockup's", () => {
  const s = freshSig();
  assert.equal(wrongMoment({ ...s, lastResult: 10 }, 12), true, "a result just landed");
  assert.equal(wrongMoment({ ...s, lastScroll: 10 }, 14), true, "a scroll under 5 s ago");
  assert.equal(wrongMoment({ ...s, paraStart: 1, lastType: 10 }, 12), true, "a paragraph being written");
  assert.equal(eligible({ ...s, lastMove: 10 }, 11), true, "just after a move");
  assert.equal(eligible({ ...s, hold: true, away: true }, 50), false, "held");
  assert.equal(eligible({ ...s, lastKey: 10 }, 12), false, "typing a moment ago");
  assert.equal(eligible({ ...s, lastKey: 10 }, 18), true, "still for 8 s");
  assert.ok(simPeeks(TL.dev).every((p) => !p.wrong));
  assert.deepEqual(count2(), { wrong: 0, shown: 3, demoted: 0, never: 0, latency: ["30s", "0s", "46s"], median: 30 });
});

test("the tick: a waiting ask peeks at a pause and one waiting past 90 s goes to the list", () => {
  const st = { pending: ["x", "y"], pendAt: { x: 0, y: 0 } as Record<string, number>, peek: null as string | null, sig: { ...freshSig(), lastMove: 9 }, c: { peeks: 0, wrong: 0, demoted: 0 } };
  assert.equal(tick(st, 10), true);
  assert.equal(st.peek, "x");
  assert.equal(st.c.peeks, 1);
  tick(st, 100);
  assert.deepEqual(st.pending, []);
  assert.equal(st.c.demoted, 1);
});

test("an ask says why it stands where it does and words its yes as what it does", () => {
  CV.load("dev-morning");
  const a = CV.D.asks;
  assert.equal(reason(CV.D, a.a1).rung, "Can’t be undone");
  assert.equal(yesWords(a.a1), "Revert a1b2c");
  assert.equal(reason(CV.D, a.a4).rung, "Spends money");
  assert.equal(yesWords(a.a4), "Raise to $20");
  assert.equal(reason(CV.D, a.a5).rung, "Holds Migrate db up");
  assert.equal(yesWords(a.a5), "Allow");
  assert.equal(reason(CV.D, a.a3).rung, "Due today");
  assert.equal(reason(CV.D, a.a8).rung, "Waits to be kept");
  assert.equal(yesWords(a.a10), "Confirm");
  assert.ok(rankFor(CV.D, { serious: true }) < rankFor(CV.D, { reaches: "money" }));
  assert.ok(rankFor(CV.D, { due: 1 }) < rankFor(CV.D, {}));
});

test("count 1 on the store: the morning's ten asks in 3 moves, the serious one first", () => {
  CV.load("dev-morning");
  CV.S.c.secs = 0;
  let guard = 0;
  while (CV.open().length && guard++ < 40) { const a = CV.open()[0]; if (!(CV.canAnswer(a.id) && CV.answer(a.id))) { CV.M.next(); CV.answer(CV.open()[0].id); } }
  assert.equal(CV.S.c.moves, 3);
  assert.equal(CV.S.c.answers, 10);
  assert.equal(CV.S.c.order.indexOf(1) + 1, 1);
  assert.deepEqual(CV.S.c.order, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("arrivals fold to one row per AI; a week's unkept ones go to their AI's history (count 8)", () => {
  CV.load("dev-week");
  const items = allArrivals(CV.D);
  assert.equal(items.length, 84);
  const v = arrivalView(items);
  assert.deepEqual({ rows: v.rows.length, waiting: v.waiting, toHistory: v.toHistory }, { rows: 8, waiting: 20, toHistory: 50 });
  assert.equal(arrivalView(items, 7, false).rows.length, 70, "unfolded: a row each");
  const h = history(CV.D, "Ada");
  assert.ok(h.n > 0 && h.days[0].day < 6);
  assert.deepEqual(weekSim(items), { offersMaxPerDay: 1, offersWeek: 7, overrides: 0, placedWithoutPress: 0, unplacedAfter7: 20, arrivalRows: 8, toHistory: 50, ais: 8 });
});

test("the learner: one offer a day, a week's rest after not now", () => {
  const l = freshLearner();
  l.queue.push("start here?", "make api and web a region?");
  assert.equal(pending(l), "start here?");
  assert.equal(answerOffer(l, "later"), "start here?");
  assert.equal(pending(l), null, "one a day");
  l.shownToday = 0;
  assert.equal(pending(l), "make api and web a region?", "the one resting is skipped");
});

test("too much: the 2am loop folds Rex's repeats, and the fix undoes", () => {
  CV.load("loop");
  const d = tooMuchData(CV.open());
  assert.equal(d.fix, "fold");
  assert.equal(d.top[1], 7);
  assert.equal(fixFor(CV.open()), "fold");
  const before = CV.open().length;
  CV.M.tooMuch();
  assert.equal(CV.S.calm, true);
  const r = CV.M.applyFix();
  assert.equal(r.ok, true);
  assert.equal(CV.S.fix, "fold");
  assert.equal(CV.S.calm, false);
  assert.equal(CV.open().length, before - 6);
  assert.equal(CV.M.undoFix().ok, true);
  assert.equal(CV.open().length, before);
});

test("the moves: ask, withdraw, take back's ask, group on evidence, attach, tell, offer; each answers ok, id, undo", async () => {
  CV.load("dev-morning");
  const r = CV.M.ask("Rex", { words: "Rex: allow npm run seed?", piece: "s-Rex", reaches: "holds" });
  assert.equal(r.ok, true);
  const x = CV.D.asks[r.id!];
  assert.equal(x.by, "Rex");
  assert.ok(x.rank > 3 && x.rank < 4, "ranked by what it reaches");
  assert.ok(CV.S.pending.includes(r.id!), "it waits for a pause to peek");
  assert.equal(CV.M.withdraw("Ada", r.id!).ok, false, "not Ada's to take back");
  assert.equal(CV.M.withdraw("Rex", r.id!).ok, true);
  assert.equal(CV.D.asks[r.id!].withdrawn, true);
  assert.ok(!CV.open().some((a) => a.id === r.id));
  assert.equal((CV.D.told as unknown[]).length, 1);

  const tb = CV.M.take_back("s-Ada");
  assert.equal(tb.ok, true);
  const ask = CV.D.asks[tb.id!];
  assert.match(ask.text, /^Take back all 40 changes Ada made in fix-login\?/);
  assert.notEqual(CV.D.pieces["s-Ada"].state, "taken back", "nothing goes before the yes");
  CV.S.askLine = ask.id;
  assert.equal(CV.answer(ask.id), true);
  await settle();
  assert.equal(CV.D.pieces["s-Ada"].state, "taken back", "its yes takes them back");

  const att = CV.M.attach("s-Lu", { kind: "stills", title: "the nav on phones" });
  assert.equal(att.ok, true);
  const arr = CV.D.pieces["s-Lu"].arrivals as { id: string; placed: boolean }[];
  assert.equal(arr.at(-1)!.placed, false, "a draft waits until pressed");
  att.undo();
  assert.equal(arr.length, 0);
  assert.equal(CV.M.tell("Kai", "main is green again", null, "s-Kai").ok, true);

  CV.load("dev-runs");
  assert.deepEqual(evidence(CV.D, ["s-Oz", "s-Pia"]), ["same repository: cli", "same files: docs/flags.md", "same branch: ai/flags"]);
  assert.equal(CV.M.group(["s-Ada", "s-Lu"]).why, "no evidence", "no evidence, no ask");
  const g = CV.M.group(["s-Oz", "s-Pia"]);
  assert.equal(g.ok, true);
  assert.match(CV.D.asks[g.id!].text, /^Group Oz and Pia\? same repository: cli · same files/);
  assert.ok(!Object.values(CV.D.pieces).some((p) => p.kind === "set" && (p.members as string[]).includes("s-Oz")), "grouped only on yes");
  CV.S.askLine = g.id!;
  CV.answer(g.id!);
  await settle();
  assert.equal(CV.D.pieces["s-Oz"].inside !== undefined, true);

  learner.queue.length = 0; learner.shownToday = 0;
  assert.equal(CV.M.offer("yes").ok, false, "nothing offered");
  assert.equal(CV.M.offer("make api and web a region?").ok, true, "an AI offers (#22)");
  assert.equal(offerNow(), "make api and web a region?");
  const o = CV.M.offer("yes");
  assert.equal(o.ok, true);
  assert.equal(offerNow(), null);
  o.undo();
  assert.equal(offerNow(), "make api and web a region?");
  learner.queue.length = 0; learner.shownToday = 0;
});

test("answer as a move: yes and later, each with its undo", () => {
  CV.load("minji");
  CV.M.next();
  const r = CV.M.answer("n1");
  assert.equal(r.ok, true);
  assert.equal(CV.D.asks.n1.answered, true);
  r.undo();
  assert.equal(CV.D.asks.n1.answered, false);
  CV.S.askLine = "n2";
  const l = CV.M.answer("n2", "later");
  assert.equal(CV.D.asks.n2.rank, 102);
  l.undo();
  assert.equal(CV.D.asks.n2.rank, 2);
  assert.equal(CV.M.answer("nope").ok, false);
});

test("live: withdraw and take back are held back; the wire makes asks of today's messages and answers with today's", async () => {
  CV.setMode("live");
  try {
    assert.equal(CV.M.withdraw("Rex", "a5").why, "not yet");
    assert.equal(CV.M.take_back("s-Ada").why, "not yet");
    CV.setData({ regions: [], pieces: {}, asks: {}, ais: [] });
    const subs = new Set<(m: unknown) => void>(), out: Record<string, unknown>[] = [];
    const e = { subscribe: (f: (m: unknown) => void) => { subs.add(f); return () => subs.delete(f); }, send: (m: Record<string, unknown>) => { out.push(m); return true; } };
    const off = wire(e as never);
    assert.deepEqual(out.splice(0, 2), [{ type: "home.today" }]);
    out.unshift({ type: "home.today" });
    const feed = (m: unknown) => { for (const f of subs) f(m); };
    feed({ type: "home.today", today: { needs: ["it-1", "it-2"], moving: [], week: [], line: "" }, things: [
      { id: "it-1", read: "you", folder: "home", words: "Reply to the landlord", state: "asks", waitsOn: "you", due: 1, at: 0, links: [], made: [], card: { title: "Lease", answers: ["Reply now", "Not this"] } },
      { id: "it-2", read: "note", folder: "home", words: "Moving", state: "moving", waitsOn: "agent", at: 0, links: [], made: [] },
    ] });
    feed({ type: "work.item", sessionId: "s1", item: { id: "perm:1", kind: "perm", state: "ask", tool: "Bash", input: { command: "npm test" } } });
    const o = CV.open();
    assert.deepEqual(o.map((a) => a.id), ["p:s1:perm:1", "t:it-1"], "an AI held up ranks above a Thing due");
    assert.equal(o[0].text, "allow run npm test?");
    assert.ok(CV.S.pending.includes("p:s1:perm:1"), "a new one waits for a pause");
    CV.S.askLine = "t:it-1";
    CV.answer("t:it-1");
    CV.S.askLine = "p:s1:perm:1";
    CV.answer("p:s1:perm:1");
    assert.deepEqual(out.slice(1), [{ type: "home.answer", thingId: "it-1", answer: "Reply now" }, { type: "work.perm", sessionId: "s1", id: "perm:1", allow: true }]);
    feed({ type: "work.item", sessionId: "s1", item: { id: "perm:1", kind: "perm", state: "allow" } });
    assert.equal(CV.D.asks["p:s1:perm:1"], undefined, "answered by the engine: gone");
    off();
    await settle();
  } finally { CV.setMode("fixture"); }
});

test("live: How Sol sees you's drift question is never a Need: no \"Add it as an aim?\" while aims are parked (BR1, #1615)", async () => {
  CV.setMode("live");
  try {
    CV.setData({ regions: [], pieces: {}, asks: {}, ais: [] });
    const subs = new Set<(m: unknown) => void>(), out: Record<string, unknown>[] = [];
    const e = { subscribe: (f: (m: unknown) => void) => { subs.add(f); return () => subs.delete(f); }, send: (m: Record<string, unknown>) => { out.push(m); return true; } };
    const off = wire(e as never);
    const feed = (m: unknown) => { for (const f of subs) f(m); };
    const q = "You said My business, but most of what you do looks like Collecting ideas. Add it as an aim?";
    feed({ type: "next.you", you: { aims: [{ w: "My business", said: true }], questions: [{ q: "Is Ideas where most of your time goes now?", at: 0, kind: "check" }, { q, at: null, kind: "drift", aim: "Collecting ideas" }] } });
    assert.deepEqual(CV.open(), [], "neither the drift nor a check becomes a Need");
    assert.ok(!Object.values(CV.D.asks).some((a) => /as an aim/.test(a.text)), "the words are nowhere in the asks");
    assert.ok(!out.some((m) => m.type === "next.you" || m.type === "next.you.answer"), "the Needs wire neither asks for the picture nor answers it");
    off();
    await settle();
  } finally { CV.setMode("fixture"); }
});
