// Cowork v3 slice 3 (fr-30 E9, #556): my window. A chip dragged outward writes one trail event and gives an Undo line;
// Undo is one more event; the core never moves by itself (no agent, no teammate, no unrelated write moves a chip).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as P from "../src/team/v3/people.ts";

let t: ReturnType<typeof P.memoryTrail>;
const pid = "sol";
beforeEach(() => {
  t = P.memoryTrail(); P.useTrail(t);
  P.peopleOf(pid, { owners: ["marco"], editors: ["frank", "isaac"], by: "marco" });
});
const ringOf = (w: P.WindowAnswer, chip: string) => P.RINGS.find((r) => w.rings[r].some((c) => c.id === chip));

test("window: three rings, Mine / My way / Work facts, the default chips in each", () => {
  const w = P.window(pid, "marco", "marco");
  assert.deepEqual(Object.keys(w.rings), ["mine", "myWay", "workFacts"]);
  assert.equal(ringOf(w, "sessions"), "mine");
  assert.equal(ringOf(w, "how"), "myWay");
  assert.equal(ringOf(w, "on"), "workFacts");
  assert.equal(w.words.mine.rule, "never, unless I hand it");
  assert.equal(w.can.move, true);
});

test("window: a chip dragged outward writes exactly one trail event and returns an Undo line", () => {
  const before = t.all.length;
  const r = P.moveChip(pid, { who: "marco" }, "how", "workFacts");
  assert.ok("ok" in r && r.ok);
  assert.equal(t.all.length, before + 1);
  const e = t.all.at(-1)!;
  assert.equal(e.kind, "window.move");
  assert.deepEqual({ chip: e.data!.chip, from: e.data!.from, to: e.data!.to }, { chip: "how", from: "myWay", to: "workFacts" });
  assert.match(r.line, /frank and isaac now see summaries of how I work/);
  assert.equal(ringOf(r.window, "how"), "workFacts");
  assert.equal(P.passOf("workFacts"), "yes");
});

test("window: Undo is one more event and puts the chip back; a second Undo is refused", () => {
  const r = P.moveChip(pid, { who: "marco" }, "say", "workFacts") as P.Moved;
  const n = t.all.length;
  const u = P.undoMove(pid, { who: "marco" }, r.undo);
  assert.ok("ok" in u);
  assert.equal(t.all.length, n + 1);
  assert.equal(t.all.at(-1)!.kind, "window.undo");
  assert.equal(ringOf(P.window(pid, "marco", "marco"), "say"), "myWay");
  assert.ok("error" in P.undoMove(pid, { who: "marco" }, r.undo));
});

test("window: the core never moves by itself: not by my agent, not by a teammate, not by unrelated writes", () => {
  const core = () => P.window(pid, "marco", "marco").rings.mine.map((c) => c.id);
  const was = core();
  assert.ok("error" in P.moveChip(pid, { who: "marco", agent: true }, "memory", "workFacts"));
  // a teammate's move moves only their own window
  assert.ok("ok" in P.moveChip(pid, { who: "frank" }, "memory", "workFacts"));
  // a forged event (an agent's, or one naming someone else's undo) folds to nothing
  t.append({ project: pid, actor: { who: "marco", agent: true }, kind: "window.move", data: { chip: "transcripts", to: "workFacts", undo: "x" } });
  t.append({ project: pid, actor: { who: "frank" }, kind: "window.undo", data: { undo: "x" } });
  // lots of other writes in the project
  for (let i = 0; i < 20; i++) P.setLayer(pid, { who: "isaac" }, "me", "pings", i % 2 ? "reds only" : "any time");
  P.handSend(P.hand(pid, { who: "marco" }, { id: "i1", title: "logo" }, "frank") as P.HandCard, { who: "marco" });
  assert.deepEqual(core(), was);
  assert.equal(ringOf(P.window(pid, "frank", "frank"), "memory"), "workFacts");
});

test("window: seen by someone else, the core is shut, my way is an ask, work facts show their values", () => {
  const w = P.window(pid, "marco", "frank", { on: "#556 People" });
  assert.equal(w.mine, false);
  assert.ok(w.rings.mine.every((c) => c.shut && c.label === "" && c.pass === "never"));
  assert.ok(w.rings.myWay.every((c) => c.pass === "ask"));
  assert.equal(w.rings.workFacts.find((c) => c.id === "on")!.label, "#556 People");
  assert.equal(w.can.move, false);
});

test("window: a chip moved into its own ring is refused and writes nothing", () => {
  const n = t.all.length;
  assert.ok("error" in P.moveChip(pid, { who: "marco" }, "on", "workFacts"));
  assert.ok("error" in P.moveChip(pid, { who: "marco" }, "nope", "workFacts"));
  assert.equal(t.all.length, n);
});

test("hand: an item dropped on a face is a card addressed to them; only Send writes, Undo takes it back", () => {
  const n = t.all.length;
  const card = P.hand(pid, { who: "marco" }, { id: "i9", title: "the rings still" }, "frank") as P.HandCard;
  assert.equal(card.to, "frank");
  assert.deepEqual(card.presses, ["Send", "Keep"]);
  assert.equal(t.all.length, n, "nothing written before Send");
  assert.equal(P.whoseNow(pid, "i9", "marco"), "marco");
  const sent = P.handSend(card, { who: "marco" }) as { ok: true; undo: string };
  assert.equal(t.all.length, n + 1);
  assert.equal(t.all.at(-1)!.kind, "crossing.sent");
  assert.equal(P.whoseNow(pid, "i9", "marco"), "frank");
  assert.ok("ok" in P.handUndo(pid, { who: "marco" }, sent.undo));
  assert.equal(P.whoseNow(pid, "i9", "marco"), "marco");
});

test("the trail written by slice 3 verifies", () => {
  P.moveChip(pid, { who: "marco" }, "how", "workFacts");
  assert.deepEqual(t.verify!(pid), { ok: true, bad: [] });
});
