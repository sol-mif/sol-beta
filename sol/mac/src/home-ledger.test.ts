// node --test src/*.test.ts (npm test here): the ledger, record-only, the evening fold (#797, plan Part C slice 34;
// home/whole/ledger.ts, ledgerStore.ts, Record.tsx, Fold.tsx; the stub of #829). The Try line: "let it" raises that
// source one rung. And the rules under it: the quiet line's count, "not this", the signed entries, the fold's one line,
// undo where undo is real (else why not), and what was missed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { above, canUndo, doneBy, foldLine, openWould, quietLine, signOf, stub, whyLine, type Entry } from "./home/whole/ledger.ts";
import { stub as sourcesStub, type SourcesMsg, type Rung, type SourceId } from "./home/whole/policy.ts";

const EVENING = new Date(2026, 10, 9, 21, 40).getTime();   // the fold's hour (scene 11)
/** the ledger's stub wired to Sources' stub, as ledgerStore.ts wires them (one engine, until #829) */
function both(now = EVENING) {
  const src = sourcesStub(() => now);
  let s: SourcesMsg = src({ type: "home.sources" });
  const raise = (id: SourceId, rung: Rung) => { s = src({ type: "home.source.set", id, rung }); return s.done?.ledgerId ?? null; };
  const lower = (ledgerId: string) => { s = src({ type: "home.sources.undo", ledgerId }); };
  return { ledger: stub(() => now, raise, lower), sources: () => s };
}
const canvas = (s: SourcesMsg) => s.sources.find((x) => x.id === "canvas")!;
const canvasSentence = (s: SourcesMsg) => s.policy.sentences.find((x) => x.source === "canvas")!.span;

test("“let it” raises that source one rung", () => {
  const { ledger, sources } = both();
  const l0 = ledger({ type: "home.ledger" });
  assert.equal(quietLine(l0.entries), "Sol would have done 2 things today");
  const slides = l0.entries.find((e) => e.id === "w-slides")!;
  assert.equal(canvas(sources()).rung, "read");
  assert.equal(whyLine(slides, "Canvas", "read"), "Canvas is at read · propose would save them");
  const l1 = ledger({ type: "home.ledger.let", id: "w-slides" });
  assert.equal(canvas(sources()).rung, "propose", "Canvas one rung up: read → propose");
  assert.equal(above("read"), "propose");
  assert.equal(canvasSentence(sources()), "Read Canvas and suggest what to save.", "and its policy sentence rewritten");
  assert.equal(sources().sources.find((x) => x.id === "mail")!.rung, "propose", "no other source moved");
  assert.equal(l1.entries.find((e) => e.id === "w-slides")!.state, "let");
  assert.equal(quietLine(l1.entries), "Sol would have done 1 thing today");
  assert.equal(whyLine(l1.entries.find((e) => e.id === "w-slides")!, "Canvas", "propose"), "Canvas is at propose now · next time Sol does it");
  assert.equal(l1.done?.line, "let it: Canvas at propose now · next time Sol has saved lecture 11 slides into bio 201");
  // what did I just do, and undo it: the rung goes back, and the sentence with it
  const l2 = ledger({ type: "home.undo", ledgerId: l1.done!.ledgerId });
  assert.equal(canvas(sources()).rung, "read");
  assert.equal(canvasSentence(sources()), "Read Canvas for due dates.");
  assert.equal(openWould(l2.entries).length, 2);
});

test("“let it” on Mail (at propose) raises it to draft; “not this” moves nothing", () => {
  const { ledger, sources } = both();
  ledger({ type: "home.ledger" });
  const n = ledger({ type: "home.ledger.not", id: "w-slides" });
  assert.equal(n.entries.find((e) => e.id === "w-slides")!.state, "not");
  assert.equal(canvas(sources()).rung, "read", "not this: nothing raised");
  ledger({ type: "home.ledger.let", id: "w-reply" });
  assert.equal(sources().sources.find((x) => x.id === "mail")!.rung, "draft");
  assert.equal(quietLine(ledger({ type: "home.ledger" }).entries), null, "nothing left to answer: the quiet line goes");
});

test("the evening fold: signed entries, who did what, undo where undo is real", () => {
  const { ledger } = both();
  const l = ledger({ type: "home.ledger" });
  assert.deepEqual(foldLine(l.entries), ["Seven things off your day.", "You did three; Sol did four."]);
  const prep = l.entries.find((e) => e.id === "e-prep")!, lab = l.entries.find((e) => e.id === "e-lab")!;
  assert.equal(signOf(prep), "Sol · 20:36"); assert.equal(signOf(lab), "you · 11:24");
  assert.ok(canUndo(prep, EVENING), "Sol's act: undo is real");
  assert.ok(!canUndo(lab, EVENING) && "none" in lab.undo && lab.undo.why === "you did it on your calendar", "yours on your calendar: no undo here, and why");
  const u = ledger({ type: "home.undo", ledgerId: "e-prep" });
  assert.deepEqual(foldLine(u.entries), ["Six things off your day.", "You did three; Sol did three."]);
  assert.equal(u.done?.line, "undone: Lab prep moved");
  const back = ledger({ type: "home.undo", ledgerId: u.done!.ledgerId });
  assert.equal(doneBy(back.entries).sol.length, 4, "the undo of the undo puts it back");
  assert.equal(ledger({ type: "home.undo", ledgerId: "e-lab" }).done, null, "an act with no undo cannot be undone from here");
});

test("the day so far: only what happened by now; the morning has less to fold", () => {
  const morning = stub(() => new Date(2026, 10, 9, 10, 0).getTime())({ type: "home.ledger" });
  assert.deepEqual(morning.entries.map((e: Entry) => e.id), ["e-hold", "e-notes"]);
  assert.equal(quietLine(morning.entries), null, "nothing Sol would have done yet");
});

test("missed, never silently; tomorrow in one line", async () => {
  const { missedOf, tomorrowOf } = await import("./home/whole/foldRules.ts");
  const t = (id: string, due: number, state = "you", waitsOn = "you") => ({ id, read: "you", folder: "f", words: id, state, waitsOn, due, at: 0, links: [], made: [] }) as never;
  assert.deepEqual(missedOf([t("a", EVENING - 1), t("b", EVENING + 1), t("c", EVENING - 1, "done", "none")], EVENING).map((x: { id: string }) => x.id), ["a"]);
  const yesterday = new Date(2026, 10, 8, 17).getTime();
  assert.deepEqual(missedOf([t("y", yesterday)], EVENING), [], "due yesterday is not missed today (#873 C34-5)");
  const tm = new Date(2026, 10, 10, 14).getTime();
  assert.equal(tomorrowOf([{ id: "m", kind: "event", at: tm, label: "chem lab" }], EVENING), "chem lab 14:00");
  assert.equal(tomorrowOf([], EVENING), "nothing on it yet");
});

test("the seams: the fold is Home's third place; the quiet line on today's date line; marked", () => {
  const modes = readFileSync(new URL("./spine/Modes.tsx", import.meta.url), "utf8");
  assert.match(modes, /place === "done" \? <FoldView \/> \/\* C34 \*\//);
  const first = readFileSync(new URL("./home/whole/First.tsx", import.meta.url), "utf8");
  assert.match(first, /C34[\s\S]*goTo\("done"\)[\s\S]*<Record \/>/);
});

test("through the face's stores: “let it” in the panel moves Sources' ladder (ledgerStore → sourcesStore)", async () => {
  const L = await import("./home/whole/ledgerStore.ts"), S = await import("./home/whole/sourcesStore.ts");
  L.send({ type: "home.ledger" }); S.send({ type: "home.sources" });
  const e = openWould(L.ledgerNow()!.entries)[0];
  if (!e) { assert.equal(quietLine(L.ledgerNow()!.entries), null); return; }   // before 11:02 the day has none yet
  const was = S.sourcesNow()!.sources.find((s) => s.id === e.source)!.rung;
  L.letIt(e.id);
  assert.equal(S.sourcesNow()!.sources.find((s) => s.id === e.source)!.rung, above(was), "one rung up, in Sources");
  L.undoLedger(L.ledgerNow()!.done!.ledgerId);
  assert.equal(S.sourcesNow()!.sources.find((s) => s.id === e.source)!.rung, was, "and back on undo");
});

test("what needs you stays on the fold: Today's one line and the card in front (#873 C34-2)", async () => {
  const { needsOf } = await import("./home/whole/foldRules.ts");
  const front = { id: "t", read: "you", folder: "f", words: "chem set 6", state: "you", waitsOn: "you", at: 0, links: [], made: [] } as never;
  assert.deepEqual(needsOf({ needs: ["t", "u"], moving: ["m"] }, front), { line: "Two things need you. One is moving on its own.", front: "chem set 6" });
  assert.equal(needsOf(null, undefined), null);
  const fold = readFileSync(new URL("./home/whole/Fold.tsx", import.meta.url), "utf8");
  assert.match(fold, /data-card="needs"/);
});
