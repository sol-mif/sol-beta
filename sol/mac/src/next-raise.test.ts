// node --test src/*.test.ts: the quiet canvas (BR1, #1615; mine/look/br1/quiet.html round 2). Each folder has one raise
// that grows and shrinks: at rest it says as much as its distance allows (far a dot; middle, the first judged folder a
// question and the second a line; near, more), pointed at it is whole and every other raise steps back to a dot; Later
// and a session open beside the canvas leave a dot. The hand is one focus, and Esc lets go of it and the bar's To. What
// the person does with a raise goes back to the judging side as one scoped next.known.fix line with its because.
// Invented people only (Dev). Signed: marcocyl04-ux's agent (builder Q), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import * as Q from "./next/plane/raise-state.ts";
import { RAISE_PX } from "./next/plane/layout.ts";
import { attach } from "./next/cv/wire/raise.ts";
import { attach as becauseAttach, knownEngine } from "./next/cv/wire/because.ts";

const ask = { k: "ask" as const, a: { id: "x" } as CV.Ask };
const run = { k: "run" as const, p: { id: "p" } as CV.Piece };
const none = { k: "none" as const };

test("at rest a raise says as much as its distance allows, and Later or a session beside leaves a dot", () => {
  assert.equal(Q.restOf(ask, 0, "mid", false, false), 3, "middle: the first judged folder is a question");
  assert.equal(Q.restOf(ask, 1, "mid", false, false), 2, "middle: the second a line");
  assert.equal(Q.restOf(ask, 2, "mid", false, false), 1, "middle: the rest a dot");
  assert.equal(Q.restOf(ask, 1, "near", false, false), 3, "near: the second a question too");
  assert.equal(Q.restOf(ask, 0, "far", false, false), 1, "far: names and dots only");
  assert.equal(Q.restOf(run, -1, "mid", false, false), 1);
  assert.equal(Q.restOf(run, -1, "near", false, false), 2);
  assert.equal(Q.restOf(none, -1, "near", false, false), 0, "a quiet folder says nothing");
  assert.equal(Q.restOf(ask, 0, "mid", true, false), 1, "Later shrinks it to a dot");
  assert.equal(Q.restOf(ask, 0, "mid", false, true), 1, "the conversation beside already asks");
});

test("pointed at, a raise is whole and every other one steps back to a dot", () => {
  assert.equal(Q.levelOf(ask, 1, "f1", "f1"), 4, "an ask opens to the decision");
  assert.equal(Q.levelOf(run, 1, "f1", "f1"), 3);
  assert.equal(Q.levelOf(none, 0, "f1", "f1"), 2, "a quiet folder says it has nothing");
  assert.equal(Q.levelOf(ask, 3, "f2", "f1"), 1, "another has the hand: a dot");
  assert.equal(Q.levelOf(ask, 0, "f2", "f1"), 0);
  assert.equal(Q.levelOf(ask, 3, null, "f1"), 3, "no hand: its rest");
});

test("a raise never takes more than the room under its card: with less it says the most that fits, a dot at the least", () => {
  assert.equal(Q.ROOM[4], RAISE_PX, "a decision whole is the room the layout keeps under a row at the person's scale");
  assert.equal(Q.fitRoom(4, Infinity), 4, "nothing under it: whole");
  assert.equal(Q.fitRoom(4, RAISE_PX), 4, "the person's scale: whole, as before");
  assert.equal(Q.fitRoom(4, 87), 2, "zoomed out the rows close up: a line, not a decision over the next row");
  assert.equal(Q.fitRoom(3, 103.4), 3, "the plane's rounding is let through");
  assert.equal(Q.fitRoom(3, 40), 1, "a cell's gap in a folder: a dot");
  assert.equal(Q.fitRoom(1, 0), 1, "a dot sits beside the tab: never less");
  assert.equal(Q.fitRoom(0, Infinity), 0, "a quiet folder stays quiet");
  // plane units; at z 0.2 RAISE_W 260px is 1300 units across
  const q = { x: 0, y: 0, w: 800, h: 500 }, z = 0.2;
  assert.equal(Q.roomUnder(q, [], z), Infinity, "nothing under it");
  assert.equal(Q.roomUnder(q, [{ x: 0, y: 900, w: 800, h: 500 }], z), 80, "the next row: its gap at the zoom");
  assert.equal(Q.roomUnder(q, [{ x: 1000, y: 700, w: 800, h: 500 }, { x: 0, y: 900, w: 800, h: 500 }], z), 40, "under the raise's width (260px), not only the card's");
  assert.equal(Q.roomUnder(q, [{ x: 1400, y: 600, w: 800, h: 500 }], z), Infinity, "beside it, past the raise's width: not under");
  assert.equal(Q.roomUnder(q, [{ x: 900, y: -200, w: 800, h: 500 }], z), Infinity, "a card higher up is not under it");
  assert.equal(Q.roomUnder(q, [{ x: 400, y: 300, w: 800, h: 500 }], z), 0, "overlapping below: no room");
});

test("a long choice gets a short label for the folded pill", () => {
  assert.equal(Q.shortOf("I'll drop them"), "Drop them");
  assert.equal(Q.shortOf("Keep both"), "Keep both");
  assert.ok(Q.shortOf("Merge the two calendars into one").length <= 16);
});

function fakeEngine(answer: (m: Record<string, unknown>) => Record<string, unknown> | null) {
  const subs = new Set<(m: unknown) => void>(), sent: Record<string, unknown>[] = [];
  const emit = (m: unknown) => { for (const f of [...subs]) f(m); };
  const e = {
    send: (m: Record<string, unknown>) => { sent.push(m); const r = answer(m); if (r) queueMicrotask(() => emit({ type: m.type, ...(m.rid !== undefined ? { rid: m.rid } : {}), ...r })); return true; },
    subscribe: (f: (m: unknown) => void) => { subs.add(f); return () => { subs.delete(f); }; },
  };
  return { e, sent, emit };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

test("the hand: one focus, To follows it, Esc lets go of both; an ask's outcomes go out as one scoped correction each", async () => {
  CV.load("dev-morning");
  const [rid, rid2, rid3] = Q.judged();
  assert.ok(rid && rid2 && rid3, "the fixture has three folders that ask");
  const r = Q.raiseOf(rid), r2 = Q.raiseOf(rid2), r3 = Q.raiseOf(rid3);
  assert.ok(r.k === "ask" && r2.k === "ask" && r3.k === "ask");
  if (r.k !== "ask" || r2.k !== "ask" || r3.k !== "ask") return;
  const { e, sent, emit } = fakeEngine((m) => m.type === "next.known" ? { ok: true, at: "you", facts: [] } : m.type === "next.known.fix" ? { ok: true } : null);
  const offRaise = attach(e as never);
  // an engine without the known store would refuse the line: nothing is sent, nothing breaks, Later still holds
  Q.putOff(rid3, r3.a);
  assert.equal(sent.filter((m) => m.type === "next.known.fix").length, 0, "an older engine: nothing sent");
  assert.ok(Q.isLater(r3.a));
  assert.equal(Q.restOf(r3, 0, "mid", Q.isLater(r3.a), false), 1, "Later shrinks it to a dot");
  const offBecause = becauseAttach(e as never);
  emit({ type: "next.you", ok: true, you: { read: { sources: ["files"], off: [] } } });
  await tick();
  assert.ok(knownEngine(), "the engine holds the known store");
  sent.length = 0;

  Q.point(rid2, true);
  assert.equal(Q.focusNow(), rid2);
  assert.equal(Q.toOf()?.rid, rid2, "the bar's To is what the hand is on");
  Q.point(rid, true);   // rid2 was shown whole and left with no press: passed by
  Q.point(rid2, true); Q.point(rid, true);   // once per ask
  Q.letGo();
  assert.equal(Q.focusNow(), null);
  assert.equal(Q.toNow(), null, "Esc takes the To too");
  Q.answered(rid, r.a, "Keep both");
  Q.putOff(rid2, r2.a);
  const lines = sent.filter((m) => m.type === "next.known.fix");
  assert.deepEqual(lines.map((m) => [m.how, m.place, m.reason]), [
    ["pass", rid2, `ask:${r2.a.id}`],
    ["pass", rid, `ask:${r.a.id}`],
    ["answer", rid, `ask:${r.a.id}`],
    ["later", rid2, `ask:${r2.a.id}`],
  ], "a pass once per ask, then the answer and the Later");
  const ans = lines[2];
  assert.equal(ans.now, "Keep both");
  assert.equal(ans.was, r.a.text);
  assert.ok(typeof ans.what === "string" && ans.what.length > 0, "what: who asks");
  for (const m of lines) assert.equal(Object.keys(m).filter((k) => !["type", "rid", "how", "what", "place", "reason", "was", "now", "because"].includes(k)).length, 0, "one scoped line, nothing else");
  offBecause(); offRaise();
});

test("the judging side's care (builder J's next.raises): 0 is silence, a level caps the rest, its why is the because…; a folder's own ask raises there; Open it is an outcome", async () => {
  CV.load("dev-morning");
  const [rid, rid2] = Q.judged();
  const r = Q.raiseOf(rid);
  assert.ok(r.k === "ask");
  if (r.k !== "ask") return;
  const care = (a: CV.Ask, c: Q.Care) => { (a as CV.Ask & { care?: Q.Care }).care = c; };
  // level 0: that ask has no slot, not even a dot; the folder raises its next ask, or none
  care(r.a, { level: 0, why: "" });
  const after = Q.raiseOf(rid);
  assert.ok(after.k !== "ask" || after.a.id !== r.a.id, "a silent ask is never raised");
  assert.ok(!Q.judged().includes(rid) || (after.k === "ask" && after.a.id !== r.a.id), "nor judged by it");
  // a level caps what the raise says at rest; its why is the because… text
  care(r.a, { level: 2, why: "You open this every morning" });
  assert.equal(Q.raiseOf(rid).k === "ask" && (Q.raiseOf(rid) as { a: CV.Ask }).a.id, r.a.id);
  assert.equal(Q.restOf(Q.raiseOf(rid), 0, "near", false, false), 2, "near would say a question; the judgment says a line");
  assert.equal(Q.restOf(Q.raiseOf(rid), 2, "mid", false, false), 1, "the cap never raises more than distance allows");
  assert.equal(Q.whyOf(r.a), "You open this every morning");
  // an ask about the folder itself (its piece is the folder's id, builder T's sort offer) raises on that folder
  const own: CV.Ask = { ...r.a, id: "o:sort:test", piece: rid2, rank: -1, answered: false, because: undefined };
  delete (own as { care?: Q.Care }).care;
  CV.D.asks[own.id] = own;
  CV.render();   // as a wire does: the open asks are kept per version of the data
  const at2 = Q.raiseOf(rid2);
  assert.ok(at2.k === "ask" && at2.a.id === own.id, "the folder's own ask, first by rank");
  // Open it from the raise is acted on: one "open" line
  const { e, sent, emit } = fakeEngine((m) => m.type === "next.known" ? { ok: true, at: "you", facts: [] } : m.type === "next.known.fix" ? { ok: true } : null);
  const offRaise = attach(e as never), offBecause = becauseAttach(e as never);
  emit({ type: "next.you", ok: true, you: { read: { sources: ["files"], off: [] } } });
  await tick();
  Q.opened(rid, r.a);
  assert.deepEqual(sent.filter((m) => m.type === "next.known.fix").map((m) => [m.how, m.place, m.reason]), [["open", rid, `ask:${r.a.id}`]]);
  // a tidy offer's answer is the tidy engine's line (builder J): the raise sends none; its Later is still the raise's
  sent.length = 0;
  Q.answered(rid2, own, "Sort them");
  assert.equal(sent.filter((m) => m.type === "next.known.fix").length, 0, "no answer line for an offer");
  Q.putOff(rid2, own);
  assert.deepEqual(sent.filter((m) => m.type === "next.known.fix").map((m) => [m.how, m.reason]), [["later", "ask:o:sort:test"]]);
  offBecause(); offRaise();
});
