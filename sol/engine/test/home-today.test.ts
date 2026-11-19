// Home 1 (#790): one list, the Thing and Today (src/home/). The engine's half of Marco's face tests: his first scene,
// his order, his answers and his undo, replayed against the engine's handlers with fake faces and a real kernel's log
// (test/fixtures/home/rig.ts), since his face does not reach the socket yet (specs face-wire.md §1). Tests 1 to 12 are
// the plan's (specs home-plan §6 Home 1); the ones after them prove what later units are promised (the table, the
// hooks, the undo's refusal, a Thing for you joining on its day).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NOW, seed, orderCase, ORDER, ORDER_LATER, FIRST } from "./fixtures/home/seed.ts";
import { rig, cleanup } from "./fixtures/home/rig.ts";
import { lineOf, todayMsg } from "../src/home/today.ts";
import { buildTable, homeHandles, UNITS } from "../src/home/wire.ts";
import { onAnswer, onStage, homeStage } from "../src/home/hooks.ts";
import { changeThing, newThing, verOf } from "../src/home/items.ts";
import type { Thing } from "../src/contract/home/today.ts";

after(cleanup);
const today = (ms: any[]) => ms.filter((m) => m.type === "home.today").at(-1);
const done = (ms: any[]) => ms.find((m) => m.type === "home.done");
const at = (h: number, m = 0, plus = 0) => new Date(2026, 10, 9 + plus, h, m).getTime();

test("1. the face's first scene: three need you, two move, the line in words; five thing.new, five thing.json", async () => {
  const r = rig({ now: NOW });
  r.seed(seed(NOW));
  const f = r.face();
  const t = today(await r.ask(f, { type: "home.today" }));
  assert.deepEqual(t.today.needs, FIRST.needs);
  assert.deepEqual(t.today.moving, FIRST.moving);
  assert.equal(t.today.line, FIRST.line);
  for (const id of t.today.needs) assert.ok(t.things.find((x: Thing) => x.id === id)?.card, `${id} carries its card`);
  const news = r.events().filter((e) => e.kind === "thing.new");
  assert.equal(news.length, 5);
  for (const th of seed(NOW)) {
    const file = join(r.home, "items", th.id, "thing.json");
    assert.ok(existsSync(file), `${th.id}: thing.json`);
    const stored = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(news.find((e) => e.item === th.id).value.ver, verOf(stored), "the event carries the stored version's fingerprint");
    assert.ok(existsSync(join(r.home, "items", th.id, "v", `${verOf(stored)}.json`)), "and the version is kept");
  }
  // the week the Things make: a thread for each running job with a due point, a pin for the deadline that is yours
  assert.deepEqual(t.today.week.filter((m: any) => m.kind === "thread").map((m: any) => m.thingId).sort(), ["t-bio-notes", "t-lab-prep"]);
  const chem = t.today.week.find((m: any) => m.thingId === "t-chem-set6");
  assert.deepEqual([chem.kind, chem.yours], ["due", true]);
  assert.ok(!t.today.week.some((m: any) => m.id === "w-bio-exam"), "the face's calendar marks have no source in the engine: none is sent");
});

test("2. lineOf: the count in words, then what is moving", () => {
  assert.deepEqual(lineOf(0, 0), ["Nothing needs you.", ""]);
  assert.deepEqual(lineOf(1, 1), ["One thing needs you.", "One is moving on its own."]);
  assert.deepEqual(lineOf(13, 0), ["13 things need you.", ""]);
  assert.deepEqual(lineOf(3, 2), ["Three things need you.", "Two are moving on their own."]);
});

test("3. the order, his case: deadline, then blocks, then age; later to the back", async () => {
  const r = rig({ now: NOW });
  r.seed(orderCase(NOW));
  const f = r.face();
  assert.deepEqual(today(await r.ask(f, { type: "home.today" })).today.needs, ORDER, "both dues are today: the first segment");
  assert.deepEqual(today(await r.ask(f, { type: "home.later", thingId: "due-soon" })).today.needs, ORDER_LATER, "later moves it to the back");
});

test("4. where the segments and the face's order() part: due tomorrow against blocking with no due, the blocking one first", async () => {
  // the face's order() puts "due-tomorrow" first (deadline before blocks over the whole list); design §7.8's segments put
  // the one that blocks a running job first, since tomorrow is not today. The engine follows the design; Marco is told
  const r = rig({ now: NOW });
  r.seed([
    { id: "due-tomorrow", read: "you", folder: "", words: "a", state: "you", waitsOn: "you", due: at(12, 0, 1), at: NOW - 1000, links: [], made: [] },
    { id: "blocking", read: "you", folder: "", words: "b", state: "asks", waitsOn: "you", blocks: true, at: NOW, links: [], made: [] },
  ]);
  assert.deepEqual(today(await r.ask(r.face(), { type: "home.today" })).today.needs, ["blocking", "due-tomorrow"]);
});

test("5. later, then its undo: the order as at the start, one reverse event more, every earlier line as it was", async () => {
  const r = rig({ now: NOW });
  r.seed(seed(NOW));
  const f = r.face();
  await r.ask(f, { type: "home.today" });
  const got = await r.ask(f, { type: "home.later", thingId: "t-chem-set6" });
  const d = done(got);
  assert.deepEqual([d.did, d.thingId], ["later", "t-chem-set6"]);
  assert.deepEqual(got.map((m) => m.type), ["home.done", "home.today"], "the receipt, then the list");
  assert.deepEqual(today(got).today.needs, FIRST.afterLater);
  const ev = r.events().find((e) => e.id === d.ledgerId);
  assert.equal(ev.kind, "today.later", "the ledgerId is the act's own event id");
  const before = r.bytes(), n = r.events().length;
  const u = await r.ask(f, { type: "home.undo", ledgerId: d.ledgerId });
  assert.deepEqual(u.map((m) => m.type), ["home.today"], "Today's undo answers the list, no receipt");
  assert.deepEqual(today(u).today.needs, FIRST.needs, "as at the start");
  const evs = r.events();
  assert.equal(evs.length, n + 1, "exactly one event more");
  assert.equal(evs.at(-1).cause, d.ledgerId);
  assert.equal(evs.at(-1).value.undo, true);
  assert.ok(r.bytes().startsWith(before), "every earlier line is byte for byte as it was");
});

test("6. answers: 'send it' sets the job moving; 'hold 19–21 for it' is done; any answer on a question from a job moves it", async () => {
  {
    const r = rig({ now: NOW }); r.seed(seed(NOW));
    const got = await r.ask(r.face(), { type: "home.answer", thingId: "t-shopify-app", answer: "send it" });
    assert.deepEqual(done(got), { type: "home.done", ledgerId: done(got).ledgerId, thingId: "t-shopify-app", did: "answer", answer: "send it" });
    const t = today(got).today;
    assert.deepEqual(t.needs, FIRST.afterSend.needs);
    assert.ok(t.moving.includes("t-shopify-app"));
    assert.equal(t.line, FIRST.afterSend.line);
    const evs = r.events();
    assert.deepEqual(evs.slice(-2).map((e) => e.kind), ["today.answer", "thing.state"], "the act first, then the Thing's change");
    assert.equal(evs.at(-1).cause, done(got).ledgerId);
    assert.equal(evs.at(-2).value.which, 0, "the warm answer, by its place in the card; its words are the card's, not on the log");
  }
  {
    const r = rig({ now: NOW }); r.seed(seed(NOW));
    const got = await r.ask(r.face(), { type: "home.answer", thingId: "t-chem-set6", answer: "hold 19–21 for it" });
    assert.equal(today(got).today.line, FIRST.afterHold);
    assert.equal(r.events().at(-1).kind, "thing.done");
    assert.ok(today(got).things.some((t: Thing) => t.id === "t-chem-set6" && t.state === "done"), "a Thing done today is still sent, so its receipt can name it");
  }
  {
    const r = rig({ now: NOW }); r.seed(seed(NOW));
    const got = await r.ask(r.face(), { type: "home.answer", thingId: "t-maya-data", answer: "something else entirely" });
    assert.ok(today(got).today.moving.includes("t-maya-data"));
    const act = r.events().find((e) => e.kind === "today.answer");
    assert.equal(act.value.which, -1);
    assert.equal(act.value.words, "something else entirely", "an answer of its own is kept as words");
    const line = r.bytes().split("\n").find((l) => l.includes(`"id":"${act.id}"`))!;
    assert.ok(!line.includes("something else entirely"), "and never on the line: in a value file, the line holds its hash");
  }
});

test("7. an unknown id, a moving Thing, an ask with no thingId: a bare home.today, nothing written", async () => {
  const r = rig({ now: NOW }); r.seed(seed(NOW));
  const f = r.face();
  const n = r.events().length;
  for (const m of [
    { type: "home.answer", thingId: "t-nobody", answer: "x" },
    { type: "home.answer", thingId: "t-lab-prep", answer: "x" },
    { type: "home.answer", answer: "x" },
    { type: "home.later", thingId: "t-bio-notes" },
    { type: "home.later" },
    { type: "home.undo", ledgerId: "no such id" },
    { type: "home.undo" },
  ]) {
    const got = await r.ask(f, m);
    assert.deepEqual(got.map((x) => x.type), ["home.today"], JSON.stringify(m));
    assert.deepEqual(got[0].today.needs, FIRST.needs);
  }
  assert.equal(r.events().length, n, "zero events");
});

test("8. undo twice: the second writes nothing and still answers home.today", async () => {
  const r = rig({ now: NOW }); r.seed(seed(NOW));
  const f = r.face();
  const d = done(await r.ask(f, { type: "home.answer", thingId: "t-shopify-app", answer: "send it" }));
  const u1 = today(await r.ask(f, { type: "home.undo", ledgerId: d.ledgerId }));
  assert.deepEqual(u1.today.needs, FIRST.needs);
  assert.equal(u1.today.line, FIRST.line);
  const n = r.events().length;
  const u2 = await r.ask(f, { type: "home.undo", ledgerId: d.ledgerId });
  assert.deepEqual(u2.map((m) => m.type), ["home.today"]);
  assert.equal(r.events().length, n, "nothing written");
  assert.deepEqual(u2[0], u1, "the same state");
  // and the reverse event itself is no act to undo
  const rev = r.events().at(-1);
  await r.ask(f, { type: "home.undo", ledgerId: rev.id });
  assert.equal(r.events().length, n);
});

test("9. two windows: after one answers, both get the same home.today; only the asker gets home.done", async () => {
  const r = rig({ now: NOW }); r.seed(seed(NOW));
  const home = r.face("home"), notch = r.face("notch");
  await r.ask(home, { type: "home.answer", thingId: "t-chem-set6", answer: "hold 19–21 for it" });
  // the answer made it done, so the ledger (Home 6, #829) changed too: it follows Today to every window
  assert.deepEqual(home.got.map((m) => m.type), ["home.done", "home.today", "home.ledger"]);
  assert.deepEqual(notch.got.map((m) => m.type), ["home.today", "home.ledger"]);
  assert.equal(home.raw[1], notch.raw[0], "byte-equal");
  assert.equal(notch.got[0].today.needs.length, home.got[1].today.needs.length, "the notch's count equals Home's");
});

test("10. a restart: a new kernel and a new Home over the same home and log answer the same home.today; computed twice, equal", async () => {
  const r = rig({ now: NOW }); r.seed(seed(NOW));
  const f = r.face();
  await r.ask(f, { type: "home.later", thingId: "t-chem-set6" });
  await r.ask(f, { type: "home.answer", thingId: "t-shopify-app", answer: "send it" });
  const one = (await r.ask(f, { type: "home.today" }))[0];
  const r2 = r.restart();
  const two = (await r2.ask(r2.face(), { type: "home.today" }))[0];
  assert.equal(JSON.stringify(two), JSON.stringify(one));
  assert.equal(JSON.stringify(todayMsg(r2.ctx)), JSON.stringify(todayMsg(r2.ctx)), "recomputed twice: the same string");
});

test("11. today.shown: written when the order a window asks for changed, not on a repeat ask", async () => {
  const r = rig({ now: NOW }); r.seed(seed(NOW));
  const f = r.face();
  const shown = () => r.events().filter((e) => e.kind === "today.shown");
  await r.ask(f, { type: "home.today" });
  assert.equal(shown().length, 1);
  assert.equal(shown()[0].value.n, 3);
  assert.equal(shown()[0].value.sorter, "default");
  await r.ask(f, { type: "home.today" });
  assert.equal(shown().length, 1, "a repeat ask writes nothing");
  await r.ask(f, { type: "home.later", thingId: "t-chem-set6" });
  assert.equal(shown().length, 1, "the list pushed after a change writes none");
  await r.ask(f, { type: "home.today" });
  assert.equal(shown().length, 2, "the order changed");
  const ans = done(await r.ask(f, { type: "home.answer", thingId: "t-maya-data", answer: "draft it from my sheet" }));
  assert.equal(r.events().find((e) => e.id === ans.ledgerId).cause, shown()[1].id, "an answer's cause is the list it was given on");
});

test("12. a sorter that drops an id: the default order stands, and one plugin.trouble", async () => {
  const bad = { name: "drops-one", sort: (seg: Thing[]) => seg.slice(1).map((t) => t.id) };
  const r = rig({ now: NOW, sorter: bad }); r.seed(seed(NOW));
  const f = r.face();
  assert.deepEqual(today(await r.ask(f, { type: "home.today" })).today.needs, FIRST.needs);
  await r.ask(f, { type: "home.today" });
  const trouble = r.events().filter((e) => e.kind === "plugin.trouble");
  assert.equal(trouble.length, 1, "one, not one an ask");
  assert.deepEqual([trouble[0].item, trouble[0].value.where], ["drops-one", "home.sorter"]);
  assert.equal(r.log.all().filter((e) => e.kind === "plugin.trouble").length, 1, "Home's door reads its own trouble");
  // a sorter that answers well is followed, inside its segment only
  const rev = { name: "reverse", sort: (seg: Thing[]) => seg.map((t) => t.id).reverse() };
  const r2 = rig({ now: NOW, sorter: rev }); r2.seed(orderCase(NOW));
  assert.deepEqual(today(await r2.ask(r2.face(), { type: "home.today" })).today.needs, ["due-late", "due-soon", "blocks", "young", "old"], "segments stay in their order");
  assert.equal(r2.events().filter((e) => e.kind === "plugin.trouble").length, 0);
});

// ---- what later units are promised ----

test("the table: every unit is listed once; a message or an undo claimed twice throws", () => {
  assert.deepEqual(UNITS.map((u) => u.name), ["today", "waits", "reads", "sources", "ceiling", "ledger", "open", "places"]);
  const t = buildTable(UNITS);
  assert.deepEqual([...t.handlers.keys()].sort(), ["home.answer", "home.file", "home.later", "home.learn", "home.learned.drop", "home.learned.keep", "home.ledger", "home.ledger.let", "home.ledger.not", "home.places", "home.policy.write", "home.say", "home.source.repair", "home.source.set", "home.sources", "home.sources.undo", "home.today", "home.undo", "thing.open"]);   // Home 3 (#827): say, file, learn; Home 4 (#828) Sources' seven; Home 6 (#829) the ledger's three; Home 7 (#830) thing.open; Home 8 (#874) home.places
  assert.deepEqual([...t.reverse.keys()].sort(), ["policy.learned", "policy.write", "rung.did", "rung.would", "source.set", "thing.done", "thing.file", "today.answer", "today.later", "undo thing.done"]);   // Home 3: the undo of a filing; Home 4: its three kinds of act; Home 6: a done of Sol's (and that undo), and says no for its entries with none
  assert.throws(() => buildTable([...UNITS, { name: "again", handlers: { "home.today": () => {} } }]), /again and today both answer home\.today/);
  assert.throws(() => buildTable([...UNITS, { name: "again", reverse: { "today.later": () => {} } }]), /both undo today\.later/);
});

test("home.undo is routed by the act's kind to the unit that reverses it", async () => {
  const r = rig({ now: NOW });
  const t = buildTable(UNITS);
  // a later unit's act and its reverser, given here as a unit of the table would: the reverser answers its own family
  homeHandles("home.today");   // the live table built first, so the one set below is not put back under it
  const { setReverse } = await import("../src/home/undo.ts");
  const said: string[] = [];
  setReverse(new Map([...t.reverse, ["thing.file", (_c, face, ev) => { said.push(ev.id); face.send({ type: "home.reads.undone" }); }]]));
  const act = r.ctx.log.write({ kind: "thing.file", value: { n: 1 }, words: [{ text: "call Sam", read: "you" }] });
  const f = r.face();
  assert.deepEqual((await r.ask(f, { type: "home.undo", ledgerId: act.id })).map((m) => m.type), ["home.reads.undone"]);
  assert.deepEqual(said, [act.id]);
  setReverse(t.reverse);
});

test("hooks: an answer on a Thing with a block: link goes to its hook first; the stage reaches onStage only while Home is on", async () => {
  const r = rig({ now: NOW });
  r.seed([{ id: "it-0123456789ab", read: "job", folder: "work", words: "pick a still", state: "asks", waitsOn: "you", blocks: true, at: NOW, links: ["block:demo/b1"], made: [] }]);
  const heard: string[] = [];
  const off = onAnswer("block:", async (ctx, thing, answer) => { heard.push(`${thing.id} ${answer}`); changeThing(ctx, thing.id, { state: "moving", waitsOn: "agent" }); return true; });
  const got = await r.ask(r.face(), { type: "home.answer", thingId: "it-0123456789ab", answer: "the second" });
  off();
  assert.deepEqual(heard, ["it-0123456789ab the second"]);
  assert.deepEqual(got.map((m) => m.type), ["home.done", "home.today"]);
  assert.ok(today(got).today.moving.includes("it-0123456789ab"));
  assert.deepEqual(r.events().slice(-2).map((e) => e.kind), ["today.answer", "thing.state"], "the act written first, then the hook's change");
  // homeStage with Home off (no switch in this process): nothing heard
  const stage: string[] = [];
  const unhear = onStage((_c, m) => { stage.push(m.project); });
  homeStage({ type: "work.stage.changed", project: "demo" });
  unhear();
  assert.deepEqual(stage, []);
});

test("an undo is refused when the Thing changed since the act: nothing written, the plain state", async () => {
  const r = rig({ now: NOW }); r.seed(seed(NOW));
  const f = r.face();
  const d = done(await r.ask(f, { type: "home.answer", thingId: "t-shopify-app", answer: "send it" }));
  changeThing(r.ctx, "t-shopify-app", { state: "asks", waitsOn: "you" });   // something else moved it on since
  const n = r.events().length;
  const u = await r.ask(f, { type: "home.undo", ledgerId: d.ledgerId });
  assert.deepEqual(u.map((m) => m.type), ["home.today"]);
  assert.equal(r.events().length, n);
});

test("a Thing for you on a later day joins the list on its day, and is a ring on the week until then", async () => {
  const thu = at(13, 0, 3);
  const r = rig({ now: NOW });
  r.seed([{ id: "it-5a3c00000000", read: "you", folder: "jobs", words: "call Sam", state: "you", waitsOn: "none", due: thu, at: NOW, links: [], made: [] }]);
  const mon = today(await r.ask(r.face(), { type: "home.today" }));
  assert.deepEqual(mon.today.needs, []);
  assert.deepEqual(mon.today.week, [{ id: "w-it-5a3c00000000", kind: "you", at: thu, label: "call Sam", thingId: "it-5a3c00000000", yours: true }]);
  r.clock.now = at(8, 0, 3);   // Thursday morning
  const th = today(await r.ask(r.face(), { type: "home.today" }));
  assert.deepEqual(th.today.needs, ["it-5a3c00000000"]);
  assert.equal(th.things[0].waitsOn, "you");
  assert.equal(th.today.week[0].kind, "due");
  assert.ok(done(await r.ask(r.face(), { type: "home.answer", thingId: "it-5a3c00000000", answer: "done" })), "and can be answered");
});

test("the store: a thing.json behind its last event is put right at start; an id of the wrong form is refused", async () => {
  const r = rig({ now: NOW }); r.seed(seed(NOW));
  await r.ask(r.face(), { type: "home.answer", thingId: "t-shopify-app", answer: "send it" });
  const file = join(r.home, "items", "t-shopify-app", "thing.json");
  const now = readFileSync(file, "utf8");
  const old = JSON.parse(now); old.state = "proposed"; old.waitsOn = "you";
  r.ctx.items.set(old);   // as if the engine stopped after the event, before thing.json
  const r2 = r.restart();
  assert.ok(today(await r2.ask(r2.face(), { type: "home.today" })).today.moving.includes("t-shopify-app"));
  assert.equal(readFileSync(file, "utf8"), now);
  assert.throws(() => newThing(r.ctx, { ...seed(NOW)[0], id: "../escape" }), /no Thing id/);
});

test("the store: a Thing whose thing.new is on the log but whose thing.json was never written comes back at start, once", async () => {
  const r = rig({ now: NOW });
  const t: Thing = { id: "it-aaaaaaaaaaaa", read: "you", folder: "", words: "a", state: "you", waitsOn: "you", at: NOW, links: [], made: [] };
  // newThing's first two steps, then the stop: the version on the disk, the event on the log, no thing.json
  const ver = r.ctx.items.keep(t);
  r.ctx.log.write({ kind: "thing.new", item: t.id, value: { ver, read: t.read, waitsOn: t.waitsOn, state: t.state } });
  const file = join(r.home, "items", t.id, "thing.json");
  assert.equal(existsSync(file), false);
  const r2 = r.restart();
  assert.deepEqual(today(await r2.ask(r2.face(), { type: "home.today" })).today.needs, [t.id], "back on the list after the restart");
  assert.equal(verOf(JSON.parse(readFileSync(file, "utf8"))), ver, "thing.json is the version the log names");
  assert.equal(newThing(r2.ctx, t), null, "made again with the same id: nothing");
  assert.equal(r2.events().filter((e) => e.kind === "thing.new" && e.item === t.id).length, 1, "one thing.new for it, never two");
});

test("the store: a thing.json write that failed after thing.new is put back by the next newThing of that id, with no second event", () => {
  const r = rig({ now: NOW });
  const t: Thing = { id: "it-bbbbbbbbbbbb", read: "you", folder: "", words: "b", state: "you", waitsOn: "you", at: NOW, links: [], made: [] };
  const ver = r.ctx.items.keep(t);
  r.ctx.log.write({ kind: "thing.new", item: t.id, value: { ver, read: t.read, waitsOn: t.waitsOn, state: t.state } });
  assert.equal(r.ctx.items.get(t.id), null, "the write of thing.json never happened");
  assert.equal(newThing(r.ctx, t), null, "the id is already made: no new event");
  assert.equal(r.ctx.items.get(t.id)?.id, t.id, "and its thing.json is there now");
  assert.equal(r.events().filter((e) => e.kind === "thing.new" && e.item === t.id).length, 1);
});

test("things sent: a gone Thing never; a done Thing on the day it was done, not the day after", async () => {
  const r = rig({ now: at(10) });
  const base = { read: "you" as const, folder: "", state: "you" as const, waitsOn: "you" as const, at: at(9), links: [], made: [] };
  r.seed([{ ...base, id: "it-gone", words: "g", gone: true }, { ...base, id: "it-done", words: "d" }]);
  const f = r.face();
  const first = today(await r.ask(f, { type: "home.today" }));
  assert.deepEqual(first.things.map((t: Thing) => t.id), ["it-done"], "the gone one is not sent");
  assert.ok(done(await r.ask(f, { type: "home.answer", thingId: "it-done", answer: "did it" })));
  const same = today(await r.ask(f, { type: "home.today" }));
  assert.deepEqual(same.things.map((t: Thing) => [t.id, t.state]), [["it-done", "done"]], "done today: still sent, so the receipt can name it");
  assert.deepEqual(same.today.needs, []);
  r.clock.now = at(10, 0, 1);
  assert.deepEqual(today(await r.ask(f, { type: "home.today" })).things, [], "the day after: not sent");
});

test("later pressed again on a Thing already at the back moves it to the very end", async () => {
  const r = rig({ now: NOW }); r.seed(seed(NOW));
  const f = r.face();
  const [a, b] = FIRST.needs;
  await r.ask(f, { type: "home.later", thingId: a });
  await r.ask(f, { type: "home.later", thingId: b });
  assert.deepEqual(today(await r.ask(f, { type: "home.later", thingId: a })).today.needs.slice(-2), [b, a]);
});

test("an undo of a later's own reverse event writes nothing: an undo is no act to undo", async () => {
  const r = rig({ now: NOW }); r.seed(seed(NOW));
  const f = r.face();
  const d = done(await r.ask(f, { type: "home.later", thingId: "t-chem-set6" }));
  await r.ask(f, { type: "home.undo", ledgerId: d.ledgerId });
  const rev = r.events().at(-1), n = r.events().length;
  assert.equal(rev.kind, "today.later");
  assert.equal(rev.value.undo, true);
  const got = await r.ask(f, { type: "home.undo", ledgerId: rev.id });
  assert.deepEqual(got.map((m) => m.type), ["home.today"], "the plain state");
  assert.equal(r.events().length, n, "nothing written");
  assert.deepEqual(today(got).today.needs, FIRST.needs, "the later still undone");
});
