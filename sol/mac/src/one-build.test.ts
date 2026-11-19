// node --test src/*.test.ts: the one session in Build (#1002, one/model.ts): its switch off by default, the order of
// the stage, the four questions at a glance, a piece's draft, send and undo words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeOneSwitch, BUILD_ONE, onStage, earlier, glance, draftOf, pressPick, sendOf, answerOf, goingOf, threads, isOrder, moveStep, moveTo, proofLine, isPicture, gridOf, sectionsOf, awayOf, byGoal, rowLine, type Piece, type Row } from "./one/model.ts";

const env = (o: Record<string, string> = {}, search = "") => ({ storage: () => ({ getItem: (k: string) => o[k] ?? null, setItem: (k: string, v: string) => { o[k] = v; } }), search: () => search, target: new EventTarget() });
const piece = (o: Partial<Piece>): Piece => ({ id: "p", at: 1, kind: "goal", lack: "words", title: "t", say: "s", state: "open", by: "one", ...o });
const row = (o: Partial<Row>): Row => ({ id: "r", title: "r", cwd: "/", updatedAt: 1, state: "resting", doing: "", waits: "nothing", mine: false, ...o });

test("build.one is off by default, on by storage or the link, and the link wins", () => {
  assert.equal(BUILD_ONE, "build.one");
  assert.equal(makeOneSwitch(env()).get(), false);
  assert.equal(makeOneSwitch(env({ "build.one": "1" })).get(), true);
  assert.equal(makeOneSwitch(env({ "build.one": "1" }, "?build.one=off")).get(), false);
  const o: Record<string, string> = {}; const s = makeOneSwitch(env(o)); s.set(true);
  assert.equal(o["build.one"], "1");
});

test("the stage: what waits on the person first, oldest first; then what is going; done and put away go to earlier", () => {
  const ps = [piece({ id: "a", at: 3 }), piece({ id: "b", at: 1 }), piece({ id: "c", at: 5, state: "acted", acted: { started: ["k"], sent: [], at: 5 } }), piece({ id: "d", at: 2, state: "done" }), piece({ id: "e", at: 4, state: "dropped" }),
    piece({ id: "f", at: 6, state: "acted", acted: { started: [], sent: [], at: 6 } })];
  assert.deepEqual(onStage(ps).map((p) => p.id), ["b", "a", "c"]);
  assert.deepEqual(earlier(ps).map((p) => p.id), ["f", "e", "d"], "an answer that started nothing leaves the stage once it went");
});

test("at a glance: where am I, what is happening, what needs me, what did I just do (and its undo while it can)", () => {
  const ps = [piece({ id: "x", title: "the goal", lack: "words" }), piece({ id: "y", title: "the split", kind: "split", lack: "call", at: 2 }), piece({ id: "z", state: "sent", title: "sent one", at: 3 })];
  const g = glance({ folder: "/home/me/sol", busy: true, rows: [row({ state: "working" }), row({ id: "w", state: "working" })], pieces: ps, did: [{ at: 1, words: "you answered", piece: "z" }] });
  assert.equal(g.where, "Build · projects · ~/sol");
  assert.equal(g.happening, "it is thinking · 2 at work");
  assert.equal(g.needs, "your words on “the goal” · 1 more");
  assert.equal(g.needsId, "x");
  assert.equal(g.did, "you answered");
  assert.equal(g.didUndo, "z");
  const q = glance({ busy: false, rows: [], pieces: [], did: [] });
  assert.deepEqual([q.happening, q.needs, q.did, q.didUndo], ["all quiet", "nothing", "nothing yet", undefined]);
});

test("a split starts with every part picked; a press toggles; the button says what goes", () => {
  const p = piece({ kind: "split", lack: "call", parts: [{ id: "p1", title: "a", prompt: "a" }, { id: "p2", title: "b", prompt: "b", reuse: "s" }] });
  let d = draftOf(p);
  assert.deepEqual(d.pick, ["p1", "p2"]);
  assert.equal(sendOf(p, d).label, "start 1, send to 1");
  d = pressPick(p, d, "p2");
  assert.equal(sendOf(p, d).label, "start 1");
  d = pressPick(p, d, "p1");
  assert.deepEqual([sendOf(p, d).label, sendOf(p, d).ok], ["pick a part", false]);
});

test("a call is one pick, pressed again it is gone; a goal sends its guess only as the guess, never as typed words", () => {
  const c = piece({ kind: "call", lack: "call", choices: ["A", "B"] });
  let d = pressPick(c, draftOf(c), "A"); d = pressPick(c, d, "B");
  assert.deepEqual(d.pick, ["B"]);
  assert.deepEqual(pressPick(c, d, "B").pick, []);
  const g = piece({ guess: "yes, and Isaac's side too" });
  assert.deepEqual(sendOf(g, draftOf(g)), { label: "send its guess", ok: true, guess: true });
  assert.deepEqual(answerOf(g, draftOf(g)), { text: "yes, and Isaac's side too" });
  assert.deepEqual(answerOf(g, { text: " only the room ", pick: [], typed: true }), { text: "only the room" });
  assert.equal(sendOf(piece({}), draftOf(piece({}))).ok, false, "no guess, no words: nothing to send");
});

test("undo keeps the person's answer: a piece back open drafts from what was sent", () => {
  const p = piece({ kind: "split", parts: [{ id: "p1", title: "a", prompt: "a" }, { id: "p2", title: "b", prompt: "b" }], answer: { pick: ["p2"], text: "small" } });
  assert.deepEqual(draftOf(p), { text: "small", pick: ["p2"], typed: true });
});

test("the line after a send counts the grace down, then says what it started", () => {
  assert.equal(goingOf(piece({ state: "sent", goesAt: 4000 }), 1200), "goes in 3 s · undo takes it back, nothing went");
  assert.equal(goingOf(piece({ state: "acted", acted: { started: ["a", "b"], sent: [], at: 1 } }), 0), "started 2 sessions · undo stops them");
});

test("the picture: those at work, waiting or its own first, at most seven", () => {
  const rows = [row({ id: "1" }), row({ id: "2", state: "working" }), row({ id: "3", mine: true }), ...Array.from({ length: 8 }, (_, i) => row({ id: `r${i}` }))];
  const t = threads(rows);
  assert.equal(t.length, 7);
  assert.deepEqual(t.slice(0, 3).map((r) => r.id), ["2", "3", "1"]);
});

test("a session waiting for an allow: the piece asks allow or no, and says which goes", () => {
  const p = piece({ kind: "needs", lack: "call", session: "s", perm: "perm:1", choices: ["allow", "no"] });
  assert.deepEqual([sendOf(p, draftOf(p)).label, sendOf(p, draftOf(p)).ok], ["pick one", false]);
  const d = pressPick(p, draftOf(p), "allow");
  assert.equal(sendOf(p, d).label, "allow");
  assert.deepEqual(answerOf(p, d), { pick: ["allow"] });
  assert.equal(sendOf(p, pressPick(p, draftOf(p), "no")).label, "say no");
});

test("a piece shows what it is about: an order starts as drawn, moves by one, and sends as the new order; proof in one line; a picture is a path", () => {
  const p = piece({ kind: "call", lack: "call", shows: { form: "order", steps: ["a", "b", "c"] } });
  assert.equal(isOrder(p), true);
  const d = draftOf(p);
  assert.deepEqual(d.pick, ["a", "b", "c"]);
  assert.equal(sendOf(p, d).label, "keep this order");
  const m = moveStep(d, 2, -1);
  assert.deepEqual(m.pick, ["a", "c", "b"]);
  assert.equal(sendOf(p, m).label, "send this order");
  assert.deepEqual(moveStep(d, 0, -1).pick, ["a", "b", "c"], "at an end it stays");
  assert.equal(proofLine([{ state: "green" }, { state: "green" }, { state: "red" }]), "2 green · 1 red");
  assert.equal(isPicture("/a/b.png"), true);
  assert.equal(isPicture("a/b.png"), false);
  assert.equal(isPicture("the drawing"), false);
});

test("the picture groups sessions by the goal they serve; a working one says its step, steps and time; back after a while, what happened", () => {
  const now = 10_000_000;
  const rs = [row({ id: "a", goal: "Light/dark", state: "working", step: "writing index.html", steps: 3, since: now - 120_000 }), row({ id: "b", updatedAt: now - 3_600_000 }), row({ id: "c", goal: "Light/dark", state: "needs", waits: "your allow: Write" })];
  assert.deepEqual(byGoal(rs).map((l) => ("head" in l ? `#${l.head}` : l.row.id)), ["#Light/dark", "a", "c", "#your other sessions", "b"]);
  assert.equal(rowLine(rs[0], now), "writing index.html · 3 steps · 2 min");
  assert.equal(rowLine(rs[1], now), "resting · 1 h ago");
  assert.equal(awayOf({ seen: now - 60_000, now, rows: rs, did: [], pieces: [] }), null, "under 20 minutes away: nothing");
  const a = awayOf({ seen: now - 2 * 3_600_000, now, rows: [row({ id: "d", title: "the page", updatedAt: now - 60_000, state: "resting" })], did: [{ at: now - 1000, words: "started 1 session" }], pieces: [piece({ id: "x" })] });
  assert.equal(a?.for, "2 h");
  assert.deepEqual(a?.lines, ["“the page” finished a turn", "started 1 session", "1 waits on you, first below"]);
});

test("an answered split stays on the stage while a session it started works or waits, then steps back to earlier", () => {
  const p = piece({ id: "s", kind: "split", state: "acted", acted: { started: ["k"], sent: [], at: Date.now() - 5 * 60_000 } });
  assert.deepEqual(onStage([p], [row({ id: "k", state: "working" })]).map((x) => x.id), ["s"]);
  assert.deepEqual(onStage([p], [row({ id: "k", state: "resting" })]).map((x) => x.id), []);
  assert.deepEqual(earlier([p], [row({ id: "k", state: "resting" })]).map((x) => x.id), ["s"]);
  assert.deepEqual(onStage([{ ...p, acted: { started: ["k"], sent: [], at: Date.now() } }], [row({ id: "k", state: "resting" })]).map((x) => x.id), ["s"], "the first minute it stays, while the session starts");
});

test("a step dragged to another place: the rest close up; a drag onto itself or off the list changes nothing", () => {
  const d = { text: "", pick: ["a", "b", "c", "d"], typed: false };
  assert.deepEqual(moveTo(d, 3, 0).pick, ["d", "a", "b", "c"]);
  assert.deepEqual(moveTo(d, 0, 2).pick, ["b", "c", "a", "d"]);
  assert.equal(moveTo(d, 1, 1), d);
  assert.equal(moveTo(d, 1, 9), d);
});

test("what is happening counts the sessions that wait on you, never 'all quiet' while one does", () => {
  const g = glance({ busy: false, rows: [row({ state: "needs" })], pieces: [], did: [] });
  assert.equal(g.happening, "1 waits on you");
  assert.equal(glance({ busy: false, rows: [row({ state: "resting" })], pieces: [], did: [] }).happening, "all quiet");
});

test("where we are: lines of 'thread, state: words' become a row per thread and a column per state; other lines stay a list", () => {
  const g = gridOf(["Play page, done: light/dark button, readme line", "Play page, unsure: bigger title (report cut off before it)", "Play page, yours: look at the page",
    "DeepSeek, done: read, laid out", "DeepSeek, yours: say which ideas to make", "Nothing is committed yet: the play page changes are only saved"]);
  assert.ok(g);
  assert.deepEqual(g!.threads.map((t) => t.name), ["Play page", "DeepSeek"]);
  assert.deepEqual(g!.threads[0].cells.unsure, ["bigger title (report cut off before it)"]);
  assert.deepEqual(g!.threads[1].cells.yours, ["say which ideas to make"]);
  assert.deepEqual(g!.rest, ["Nothing is committed yet: the play page changes are only saved"]);
  assert.equal(gridOf(["it finished", "two waited", "one failed"]), null, "plain lines stay a list");
});

test("a hand-over's headed lines become boxes: when you're back, it may, it may not", () => {
  const s = sectionsOf(["WHEN YOU'RE BACK", "the page fits a phone", "IT MAY", "change the play page", "IT MAY NOT", "commit or push", "touch other files"]);
  assert.deepEqual(s?.map((x) => [x.kind, x.items.length]), [["will", 1], ["may", 1], ["not", 2]]);
  assert.equal(sectionsOf(["one line", "two lines"]), null);
});
