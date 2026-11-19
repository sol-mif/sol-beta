// Home 1 (#790): the face contract for Today (src/contract/home/today.ts) and the kinds Home writes
// (src/contract/kinds.ts). Every message the engine sends in the walk below, the same asks as home-today.test.ts's 1 to
// 12, parses with the strict schemas (no field beyond Marco's); his own message shapes, copied from his face, parse too;
// a write of a kind with no row throws, through the kernel's log and through the memory one alike.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { NOW, seed, orderCase } from "./fixtures/home/seed.ts";
import { rig, cleanup } from "./fixtures/home/rig.ts";
import { AnswerAsk, DoneMsg, LaterAsk, Thing, TodayAsk, TodayMsg, UndoAsk } from "../src/contract/home/today.ts";
import { LedgerMsg } from "../src/contract/home/ledger.ts";
import { memoryLog } from "../src/home/log.ts";
import { isKind, kindRow, isHomeKind } from "../src/contract/kinds.ts";

after(cleanup);

test("every message sent in the walk parses with contract/home/today.ts (and the ledger's, Home 6), and nothing else is sent", async () => {
  const sent: any[] = [];
  for (const sorter of [undefined, { name: "drops-one", sort: (s: any[]) => s.slice(1).map((t) => t.id) }]) {
    const r = rig({ now: NOW, schemas: {}, ...(sorter ? { sorter } : {}) });   // unchecked as they arrive: checked below, every one
    r.seed([...seed(NOW), ...orderCase(NOW).map((t) => ({ ...t, id: `x-${t.id}` }))]);
    const a = r.face(), b = r.face();
    const asks: object[] = [
      { type: "home.today" }, { type: "home.today" },
      { type: "home.later", thingId: "t-chem-set6" },
      { type: "home.answer", thingId: "t-shopify-app", answer: "send it" },
      { type: "home.answer", thingId: "t-chem-set6", answer: "hold 19–21 for it" },
      { type: "home.answer", thingId: "t-maya-data", answer: "words of my own" },
      { type: "home.answer", thingId: "nobody", answer: "x" }, { type: "home.answer", answer: "x" }, { type: "home.later" },
      { type: "home.answer", thingId: "t-lab-prep", answer: "x" },
    ];
    for (const m of asks) await r.ask(a, m);
    for (const d of a.got.filter((m) => m.type === "home.done")) { await r.ask(b, { type: "home.undo", ledgerId: d.ledgerId }); await r.ask(b, { type: "home.undo", ledgerId: d.ledgerId }); }
    await r.ask(b, { type: "home.undo", ledgerId: "nothing" });
    const r2 = r.restart();
    await r2.ask(r2.face(), { type: "home.today" });
    sent.push(...r.faces.flatMap((f) => f.got), ...r2.faces.flatMap((f) => f.got));
  }
  assert.ok(sent.length > 40);
  const types = new Set(sent.map((m) => m.type));
  // an answer that makes a Thing done changes the ledger (Home 6, #829), which follows Today to every window
  assert.deepEqual([...types].sort(), ["home.done", "home.ledger", "home.today"]);
  for (const m of sent) {
    const p = (m.type === "home.today" ? TodayMsg : m.type === "home.ledger" ? LedgerMsg : DoneMsg).safeParse(m);
    assert.ok(p.success, `${m.type}: ${p.success ? "" : p.error.message}`);
  }
  // and the strict schemas refuse what is not Marco's: an engine-only field on a Thing
  const t = sent.find((m) => m.type === "home.today");
  assert.equal(TodayMsg.safeParse({ ...t, things: [{ ...t.things[0], gone: true }] }).success, false, "gone never reaches the face");
});

test("Marco's own shapes parse: his first scene's Things, his asks; a malformed ask does not", () => {
  for (const th of seed(NOW)) assert.ok(Thing.safeParse(th).success, th.id);
  assert.ok(TodayAsk.safeParse({ type: "home.today" }).success);
  assert.ok(AnswerAsk.safeParse({ type: "home.answer", thingId: "t-chem-set6", answer: "hold 19–21 for it" }).success);
  assert.ok(LaterAsk.safeParse({ type: "home.later", thingId: "t-chem-set6" }).success);
  assert.ok(UndoAsk.safeParse({ type: "home.undo", ledgerId: "l1" }).success);
  assert.ok(DoneMsg.safeParse({ type: "home.done", ledgerId: "l1", thingId: "t-f1-0", thingIds: ["t-f1-0"], did: "file", line: "↳ jobs" }).success, "a filing's receipt (Home 3)");
  assert.equal(AnswerAsk.safeParse({ type: "home.answer", thingId: 7, answer: "x" }).success, false);
  assert.equal(UndoAsk.safeParse({ type: "home.undo", ledgerId: "" }).success, false);
});

test("a kind with no row cannot be written, through the kernel's log or the memory one", () => {
  const r = rig({ now: NOW });
  for (const log of [r.log, memoryLog(() => NOW)]) {
    assert.throws(() => log.write({ kind: "home.today", value: {} }), /the log takes no "home\.today"/);
    assert.throws(() => log.write({ kind: "thing.made" }), /the log takes no/);
    assert.throws(() => log.write({ kind: "thing.new", value: { ver: "a", read: "you", waitsOn: "you", state: "you" }, sync: true }), /no fsync/, "only an about-to-do row is synced");
    assert.equal(log.write({ kind: "rung.asked", item: "x", value: { act: "a", rung: "act" }, sync: true }).kind, "rung.asked");
  }
  assert.equal(r.events().filter((e) => e.kind.startsWith("home.") || e.kind === "thing.made").length, 0);
});

test("every Home kind of the plan's table 4.6 has its row, in a Home family; words go to a value file", () => {
  const kinds = ["thing.new", "thing.state", "thing.done", "thing.file", "thing.refile", "thing.open", "today.shown", "today.answer", "today.later", "today.pick",
    "judge.read", "judge.override", "judge.line", "policy.write", "policy.learned", "source.set", "source.health", "rung.ceiling", "rung.asked", "rung.answered",
    "rung.did", "rung.would", "rung.refused", "run.start", "run.about", "run.did", "run.unknown", "run.end"];
  // every Home kind is handed to no block, but today.pick: the design's A3 proof (v2 l.757) is a plugin that names it in
  // needs.history and reads its past, so its row says hear "card", only a block that names it, once pressed (history.test.ts)
  for (const k of kinds) { assert.ok(isKind(k), k); assert.ok(isHomeKind(k), `${k} is Home's`); assert.equal(kindRow(k)!.who, "core"); assert.equal(kindRow(k)!.hear, k === "today.pick" ? "card" : undefined, `${k} is handed to no block${k === "today.pick" ? " but one that names it" : ""}`); }
  assert.ok(isKind("plugin.trouble"), "the sorter's trouble is the kernel's own row");
  assert.equal(isHomeKind("plugin.load"), false);
  // the memory door and the kernel's agree on what an event is
  const m = memoryLog(() => NOW), e = m.write({ kind: "today.answer", item: "t", value: { which: -1 }, words: "my own words" });
  assert.equal(m.words(e), "my own words");
  const r = rig({ now: NOW }), k = r.log.write({ kind: "today.answer", item: "t", value: { which: -1 }, words: "my own words" });
  assert.equal(r.log.words(k), "my own words");
  assert.ok(!r.bytes().includes("my own words"), "not on the line");
  assert.equal(r.kernel.erase(k.id).kind, "log.erase");
  assert.equal(r.log.words(r.log.all().find((x) => x.id === k.id)!), null, "erased: no words");
});
