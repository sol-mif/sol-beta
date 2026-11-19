// Home 6 (#829): the ledger, record-only, the evening fold (src/home/ledger.ts). The engine's half of Marco's ledger
// tests: his quiet line, "let it" raising that source one rung and its undo, "not this", the signed entries, undo where
// undo is real, replayed against the engine's handlers with fake faces, a real kernel's log (test/fixtures/home/rig.ts)
// and fake doors for his five sources (test/fixtures/home/policy.ts). The would-haves are real: Home 5's limit writes
// them when a door is called over its source's rung. Tests 1 to 10 are the plan's (specs home-plan §6 Home 6). Every
// home.ledger, home.sources and home.today sent is checked against its strict schema as it arrives. No seat is launched,
// nothing leaves the machine.
import { test, after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { rig, cleanup, SCHEMAS, type Rig } from "./fixtures/home/rig.ts";
import { NOW, SEED_TEXT, SEED_RUNGS, MAIL_DRAFT, fake, type Fake } from "./fixtures/home/policy.ts";
import {
  EVENING, SLIDES, REPLY, PREP, QUIET_TWO, QUIET_ONE, CANVAS_PROPOSE, CANVAS_READ, LET_LINE, LET_WHY, UNDONE_PREP, DAY,
  at, canUndo, doneBy, foldLine, openWould, quietLine, whyLine,
} from "./fixtures/home/ledger.ts";
import { LedgerMsg } from "../src/contract/home/ledger.ts";
import { SourcesMsg, SOURCE_IDS, type SourceId } from "../src/contract/home/policy.ts";
import { registerSource, setRung } from "../src/home/sources.ts";
import { putPolicy } from "../src/home/policy.ts";
import { ENGINE, YOU } from "../src/home/log.ts";
import { changeThing } from "../src/home/items.ts";
import { buildTable, homeHandles, startHome, UNITS } from "../src/home/wire.ts";
import { callSource } from "../src/home/ceiling.ts";
import { dayOf, ledgerMsg, REAL_MS } from "../src/home/ledger.ts";

const realFetch = globalThis.fetch;
const wasSwitch = process.env.SOL_HOME_WHOLE;
before(() => { globalThis.fetch = (() => { throw new Error("no network in Home 6"); }) as typeof fetch; });
after(() => {
  globalThis.fetch = realFetch;
  if (wasSwitch === undefined) delete process.env.SOL_HOME_WHOLE; else process.env.SOL_HOME_WHOLE = wasSwitch;
  cleanup();
});
beforeEach(() => { process.env.SOL_HOME_WHOLE = "on"; });

const schemas = { ...SCHEMAS, "home.sources": SourcesMsg, "home.ledger": LedgerMsg };
const last = (ms: any[], type = "home.ledger") => ms.filter((m) => m.type === type).at(-1);
const src = (m: any, id: SourceId) => m.sources.find((s: any) => s.id === id);
const sentence = (m: any, id: SourceId) => m.policy.sentences.find((s: any) => s.source === id).span;
const of = (r: Rig, kind: string) => r.events().filter((e) => e.kind === kind);
const entry = (m: any, id: string) => m.entries.find((e: any) => e.id === id);
const tick = () => new Promise((ok) => setTimeout(ok, 5));

/** his day: the five fakes, his rungs and paragraph, two Things Sol works on, and Home 5's limit writing two would-haves
 *  (Canvas at read asked to propose at 11:02, Mail at propose asked to draft at 11:18); the clock at his evening */
async function scene() {
  const r = rig({ now: NOW, schemas });
  const fakes = {} as Record<SourceId, Fake>;
  for (const id of SOURCE_IDS) { fakes[id] = fake(id, NOW); registerSource(r.ctx, fakes[id]); }
  for (const [id, rung] of SEED_RUNGS) setRung(r.ctx, id, rung, undefined, ENGINE);
  putPolicy(r.ctx, SEED_TEXT);
  startHome(r.ctx);
  r.seed([
    { id: "t-slides", read: "job", folder: "", words: "Lecture 11 slides", state: "moving", waitsOn: "agent", at: NOW, links: [], made: [] },
    { id: "t-reply", read: "job", folder: "", words: "Reply to prof. Ahmed", state: "moving", waitsOn: "agent", at: NOW, links: [], made: [] },
  ]);
  const slidesCall = { tool: SLIDES.name, input: { lecture: 11, into: "bio 201" }, thing: "t-slides" };
  const replyCall = { tool: REPLY.name, input: { to: "ahmed@school.edu", body: "the lab report is in" }, thing: "t-reply" };
  r.clock.now = SLIDES.at;
  assert.equal((await callSource(r.ctx, fakes.canvas, "propose", slidesCall)).done, false);
  r.clock.now = REPLY.at;
  assert.equal((await callSource(r.ctx, fakes.mail, "draft", replyCall)).done, false);
  r.clock.now = EVENING;
  await tick();   // the limit's own push to every window is out of the way
  const [slides, reply] = of(r, "rung.would");
  return { r, fakes, slides, reply, slidesCall, replyCall };
}

test("1. two rung.would today: two open would-have entries, and his quiet line reads “Sol would have done 2 things today”", async () => {
  const { r, slides, reply } = await scene();
  const f = r.face();
  const got = await r.ask(f, { type: "home.ledger" });
  assert.equal(got.length, 1, "one message, to the asker");
  const l = got[0];
  assert.equal(l.done, null);
  assert.equal(openWould(l.entries).length, 2);
  assert.equal(quietLine(l.entries), QUIET_TWO);
  assert.deepEqual(entry(l, slides.id), {
    id: slides.id, at: SLIDES.at, actor: "sol", thingId: "t-slides", source: "canvas", wouldHave: SLIDES.name, rung: "propose",
    sub: "would suggest it", undo: { none: true, why: "nothing was done" },
  });
  assert.equal(entry(l, reply.id).wouldHave, REPLY.name);
  assert.equal(entry(l, reply.id).rung, "draft");
  assert.equal(whyLine(entry(l, slides.id), "Canvas", "read"), "Canvas is at read · propose would suggest it");
  // what Sol would have done is in a value file, never on the log's line (R6)
  assert.doesNotMatch(r.bytes(), /lecture 11|prof\. Ahmed|ahmed@school/);
});

test("2. “let it” on the Canvas one: Canvas at propose, its sentence rewritten, Mail still at propose, the entry let, one open left", async () => {
  const { r, slides } = await scene();
  const f = r.face();
  const s0 = last(await r.ask(f, { type: "home.sources" }), "home.sources");
  assert.equal(src(s0, "canvas").rung, "read");
  assert.equal(src(s0, "canvas").would, 1, "his Sources ladder counts it too");
  const before = r.events().length;
  const got = await r.ask(f, { type: "home.ledger.let", id: slides.id });
  const s = last(got, "home.sources"), l = last(got);
  assert.equal(src(s, "canvas").rung, "propose", "Canvas one rung up: read → propose");
  assert.equal(sentence(s, "canvas"), CANVAS_PROPOSE, "and its policy sentence rewritten");
  assert.equal(src(s, "mail").rung, "propose", "no other source moved");
  assert.equal(entry(l, slides.id).state, "let");
  assert.equal(quietLine(l.entries), QUIET_ONE);
  assert.equal(whyLine(entry(l, slides.id), "Canvas", "propose"), LET_WHY);
  assert.equal(l.done.line, LET_LINE);
  assert.equal(l.done.entryId, slides.id);
  // the log: source.set (the ledgerId) whose cause is the would-have, then policy.write and rung.ceiling from it
  const added = r.events().slice(before);
  assert.deepEqual(added.map((e) => e.kind), ["source.set", "policy.write", "rung.ceiling"]);
  const [set, pw, ceil] = added;
  assert.equal(l.done.ledgerId, set.id);
  assert.equal(set.cause, slides.id);
  assert.deepEqual([set.value.from, set.value.to], ["read", "propose"]);
  assert.equal(pw.cause, set.id);
  assert.equal(ceil.cause, set.id);
  assert.deepEqual([ceil.value.from, ceil.value.to], ["read", "propose"]);
  // the asker's last ledger is the one with the receipt; every window had the ledger and Sources
  const other = r.face("notch");
  await r.ask(f, { type: "home.ledger" });
  assert.equal(other.got.length, 0, "a window that joins later is sent nothing until it asks or something changes");
  assert.deepEqual(got.map((m) => m.type), ["home.sources", "home.ledger", "home.ledger"], "Sources to every window, the ledger to every window, then the receipt");
  // a second let of the same entry: it is no longer open, nothing written
  const n = r.events().length;
  assert.equal(last(await r.ask(f, { type: "home.ledger.let", id: slides.id })).done, null);
  assert.equal(r.events().length, n);
});

test("3. home.undo of that receipt: Canvas back at read, its sentence back, two open again", async () => {
  const { r, slides } = await scene();
  const f = r.face();
  const l = last(await r.ask(f, { type: "home.ledger.let", id: slides.id }));
  const got = await r.ask(f, { type: "home.undo", ledgerId: l.done.ledgerId });
  const s = last(got, "home.sources"), back = last(got);
  assert.ok(s && back, "Sources and the ledger both come back");
  assert.equal(src(s, "canvas").rung, "read");
  assert.equal(sentence(s, "canvas"), CANVAS_READ);
  assert.equal(back.done, null);
  assert.equal(openWould(back.entries).length, 2);
  assert.equal(entry(back, slides.id).state, undefined);
  const set = r.events().find((e) => e.id === l.done.ledgerId);
  assert.ok(r.events().some((e) => e.kind === "source.set" && e.cause === set.id && e.value.undo === true), "a reverse event, never an edit");
  // let it again after the undo: it raises again
  assert.equal(last(await r.ask(f, { type: "home.ledger.let", id: slides.id })).done.line, LET_LINE);
});

test("4. “not this”: the entry not, nothing raised, no rung.ceiling; its undo opens it again", async () => {
  const { r, slides } = await scene();
  const f = r.face();
  const before = r.events().length;
  const l = last(await r.ask(f, { type: "home.ledger.not", id: slides.id }));
  assert.equal(entry(l, slides.id).state, "not");
  assert.equal(l.done.line, `not this: Sol will not offer to have ${SLIDES.name}`);
  const added = r.events().slice(before);
  assert.deepEqual(added.map((e) => e.kind), ["policy.learned"]);
  assert.equal(added[0].value.what, "not");
  assert.equal(added[0].cause, slides.id);
  assert.equal(l.done.ledgerId, added[0].id);
  assert.equal(of(r, "rung.ceiling").filter((e) => e.item === "canvas").length, 0, "Canvas never moved");
  assert.equal(src(last(await r.ask(f, { type: "home.sources" }), "home.sources"), "canvas").rung, "read");
  assert.equal(whyLine(entry(l, slides.id), "Canvas", "read"), "not this · Sol will not offer it again");
  assert.doesNotMatch(r.bytes(), /lecture 11/, "its words in a value file (R6)");
  // undo of the not: open again
  const back = last(await r.ask(f, { type: "home.undo", ledgerId: l.done.ledgerId }));
  assert.equal(entry(back, slides.id).state, undefined);
  assert.equal(back.done, null);
});

test("5. “let it” on Mail (at propose) raises it to draft; with “not this” on Canvas the quiet line goes", async () => {
  const { r, slides, reply } = await scene();
  const f = r.face();
  await r.ask(f, { type: "home.ledger.not", id: slides.id });
  const got = await r.ask(f, { type: "home.ledger.let", id: reply.id });
  const s = last(got, "home.sources");
  assert.equal(src(s, "mail").rung, "draft");
  assert.equal(sentence(s, "mail"), MAIL_DRAFT);
  assert.equal(src(s, "canvas").rung, "read", "not this: nothing raised");
  assert.equal(last(got).done.line, `let it: Mail at draft now · next time Sol has ${REPLY.name}`);
  assert.equal(quietLine(last(await r.ask(f, { type: "home.ledger" })).entries), null, "nothing left to answer");
});

test("“let it” raises one rung a press: a would-have two rungs up stays open after the first and is let at the second; one already there raises nothing", async () => {
  const { r, fakes, slides, slidesCall } = await scene();
  const f = r.face();
  // Canvas at read, asked to draft: the would-have needs draft, two rungs up
  r.clock.now = at(12, 0);
  assert.equal((await callSource(r.ctx, fakes.canvas, "draft", { ...slidesCall, input: { lecture: 12 } })).done, false);
  r.clock.now = EVENING;
  await tick();
  const w = of(r, "rung.would").at(-1);
  assert.equal(w.value.rung, "draft");
  const ceilings = () => of(r, "rung.ceiling").filter((e) => e.item === "canvas" && !e.value.undo).map((e) => `${e.value.from}→${e.value.to}`);
  const was = ceilings().length;

  const got = await r.ask(f, { type: "home.ledger.let", id: w.id });
  assert.equal(src(last(got, "home.sources"), "canvas").rung, "propose", "read → propose, never read → draft in one press");
  const l = last(got);
  assert.equal(l.done.line, "let it: Canvas at propose now · one rung at a time; let it again for draft");
  assert.equal(entry(l, w.id).state, undefined, "one rung short: still open");
  assert.equal(r.events().find((e) => e.id === l.done.ledgerId).cause, w.id);
  assert.deepEqual(ceilings().slice(was), ["read→propose"]);

  const l2 = last(await r.ask(f, { type: "home.ledger.let", id: w.id }));
  assert.equal(l2.done.line, `let it: Canvas at draft now · next time Sol has ${SLIDES.name}`);
  assert.equal(entry(l2, w.id).state, "let");
  assert.deepEqual(ceilings().slice(was), ["read→propose", "propose→draft"]);
  // a third press: no longer open, nothing written
  let n = r.events().length;
  assert.equal(last(await r.ask(f, { type: "home.ledger.let", id: w.id })).done, null);
  assert.equal(r.events().length, n);

  // the morning's would-have needed propose and Canvas is past it now: "let it" raises nothing, never lowers, writes nothing
  n = r.events().length;
  assert.equal(last(await r.ask(f, { type: "home.ledger.let", id: slides.id })).done, null);
  assert.equal(r.events().length, n);
  assert.equal(src(last(await r.ask(f, { type: "home.sources" }), "home.sources"), "canvas").rung, "draft");

  // the undo of the second press: Canvas back at propose, the would-have open again
  const back = last(await r.ask(f, { type: "home.undo", ledgerId: l2.done.ledgerId }));
  assert.equal(entry(back, w.id).state, undefined);
  assert.equal(src(last(await r.ask(f, { type: "home.sources" }), "home.sources"), "canvas").rung, "propose");
});

test("6. after the raise, the same call again is done: a rung.did whose act is the rung.would's, the door called once", async () => {
  const { r, fakes, slides, slidesCall } = await scene();
  const f = r.face();
  await r.ask(f, { type: "home.ledger.let", id: slides.id });
  assert.equal(fakes.canvas.calls.propose, 0, "nothing re-runs on “let it” by itself");
  const got = await callSource(r.ctx, fakes.canvas, "propose", slidesCall);
  assert.equal(got.done, true);
  assert.equal(fakes.canvas.calls.propose, 1);
  const did = of(r, "rung.did").at(-1);
  assert.equal(did.value.act, slides.value.act, "the same action, with the same content");
  assert.equal(did.value.rung, "propose");
  // and the ledger lists it as done by Sol, named as the would-have was
  await tick();
  const l = last(await r.ask(f, { type: "home.ledger" }));
  const e = entry(l, did.id);
  assert.equal(e.actor, "sol");
  assert.equal(e.did, SLIDES.name);
  assert.equal(e.source, "canvas");
  assert.ok("none" in e.undo, "done through a source: no undo from here");
  assert.equal(last(await r.ask(f, { type: "home.undo", ledgerId: did.id })).done, null);
});

test("7. undo by entry id of one of Sol's acts: a new receipt with entryId; its undo puts it back; an entry with no undo: done null", async () => {
  const { r, slides } = await scene();
  r.seed([
    { id: "t-lab-prep", read: "job", folder: "school › chem 110", words: PREP.words, state: "moving", waitsOn: "agent", at: NOW, links: [], made: [] },
    { id: "t-ch18", read: "you", folder: "school", words: "Notes: ch 1–8 too", state: "you", waitsOn: "you", at: NOW, links: [], made: [] },
  ]);
  r.clock.now = at(13, 6);
  changeThing(r.ctx, "t-ch18", { state: "done", waitsOn: "none" }, { by: YOU });
  r.clock.now = PREP.at;
  const done = changeThing(r.ctx, "t-lab-prep", { state: "done", waitsOn: "none" }, { by: { person: "seat", agent: "claude" } })!;
  assert.equal(done.kind, "thing.done");
  r.clock.now = EVENING;
  await tick();
  const f = r.face();
  const l = last(await r.ask(f, { type: "home.ledger" }));
  const prep = entry(l, done.id);
  assert.deepEqual(prep, { id: done.id, at: PREP.at, actor: "sol", thingId: "t-lab-prep", did: PREP.words, rung: "read", sub: "school › chem 110", undo: { kind: "real", until: PREP.at + REAL_MS } });
  assert.ok(canUndo(prep, EVENING), "Sol's act: undo is real");
  const ch18 = l.entries.find((e: any) => e.thingId === "t-ch18");
  assert.equal(ch18.actor, "you");
  assert.ok(!canUndo(ch18, EVENING) && "none" in ch18.undo, "yours: no undo here, and why");
  assert.deepEqual(foldLine(l.entries), ["Two things off your day.", "You did one; Sol did one."]);

  const u = await r.ask(f, { type: "home.undo", ledgerId: done.id });
  const ul = last(u);
  assert.equal(ul.done.line, UNDONE_PREP);
  assert.equal(ul.done.entryId, done.id);
  const rev = r.events().find((e) => e.id === ul.done.ledgerId);
  assert.deepEqual([rev.kind, rev.cause, rev.value.undo, rev.item], ["thing.state", done.id, true, "t-lab-prep"], "the receipt is the reverse event");
  assert.equal(entry(ul, done.id).state, "undone");
  assert.deepEqual(foldLine(ul.entries), ["One thing off your day.", "You did all of it."]);
  assert.equal(r.ctx.items.get("t-lab-prep")!.state, "moving", "the Thing is back as it was");
  assert.ok(u.some((m) => m.type === "home.today"), "Today changed, so Today goes to every window");
  // the same entry again while undone: nothing
  const n = r.events().length;
  assert.equal(last(await r.ask(f, { type: "home.undo", ledgerId: done.id })).done, null);
  assert.equal(r.events().length, n);

  // the undo of the undo puts it back
  const b = last(await r.ask(f, { type: "home.undo", ledgerId: ul.done.ledgerId }));
  assert.equal(b.done, null);
  assert.equal(entry(b, done.id).state, undefined);
  assert.equal(doneBy(b.entries).sol.length, 1, "the undo of the undo puts it back");
  assert.equal(r.ctx.items.get("t-lab-prep")!.state, "done");
  const redo = r.events().at(-1);
  assert.deepEqual([redo.kind, redo.cause, redo.value.undo], ["thing.done", ul.done.ledgerId, true]);
  assert.ok(!b.entries.some((e: any) => e.id === redo.id || e.id === ul.done.ledgerId), "a reverse event is never an entry of its own");
  const m = r.events().length;
  await r.ask(f, { type: "home.undo", ledgerId: ul.done.ledgerId });
  assert.equal(r.events().length, m, "once");
  // and it can be undone again by its entry id
  assert.equal(last(await r.ask(f, { type: "home.undo", ledgerId: done.id })).done.line, UNDONE_PREP);

  // an entry with no undo: done null, nothing written
  const k = r.events().length;
  assert.equal(last(await r.ask(f, { type: "home.undo", ledgerId: ch18.id })).done, null);
  assert.equal(last(await r.ask(f, { type: "home.undo", ledgerId: slides.id })).done, null);
  assert.equal(r.events().length, k);
  // past its 24 hours: no undo
  r.clock.now = PREP.at + REAL_MS + 1;
  assert.equal(last(await r.ask(f, { type: "home.undo", ledgerId: done.id })).done, null);
});

test("Sol's done keeps its undo for its 24 hours, past midnight too, and loses it at its until; a Thing changed since is not put back", async () => {
  const { r } = await scene();
  const seat = { person: "seat", agent: "claude" } as const;
  r.seed([
    { id: "t-late", read: "job", folder: "", words: "Late prep", state: "moving", waitsOn: "agent", at: NOW, links: [], made: [] },
    { id: "t-edge", read: "job", folder: "", words: "Edge prep", state: "moving", waitsOn: "agent", at: NOW, links: [], made: [] },
    { id: "t-moved", read: "job", folder: "", words: "Moved prep", state: "moving", waitsOn: "agent", at: NOW, links: [], made: [] },
  ]);
  r.clock.now = at(21, 50);
  const edge = changeThing(r.ctx, "t-edge", { state: "done", waitsOn: "none" }, { by: seat })!;
  const moved = changeThing(r.ctx, "t-moved", { state: "done", waitsOn: "none" }, { by: seat })!;
  r.clock.now = at(23, 50);
  const late = changeThing(r.ctx, "t-late", { state: "done", waitsOn: "none" }, { by: seat })!;
  changeThing(r.ctx, "t-moved", { words: "Moved prep, then changed" }, { by: YOU });
  const f = r.face();
  // a Thing changed since its done: refused, nothing written
  let n = r.events().length;
  assert.equal(last(await r.ask(f, { type: "home.undo", ledgerId: moved.id })).done, null);
  assert.equal(r.events().length, n);
  assert.equal(r.ctx.items.get("t-moved")!.state, "done");
  // 00:05 the next day: the 23:50 done is no longer in the day's list, and its undo is still real
  r.clock.now = new Date(2026, 10, 10, 0, 5).getTime();
  assert.ok(!entry(last(await r.ask(f, { type: "home.ledger" })), late.id));
  const u = last(await r.ask(f, { type: "home.undo", ledgerId: late.id }));
  assert.equal(u.done.line, "undone: Late prep");
  assert.equal(r.ctx.items.get("t-late")!.state, "moving");
  // at its until, to the ms: no undo, nothing written
  r.clock.now = edge.at + REAL_MS;
  n = r.events().length;
  assert.equal(last(await r.ask(f, { type: "home.undo", ledgerId: edge.id })).done, null);
  assert.equal(r.events().length, n);
  assert.equal(r.ctx.items.get("t-edge")!.state, "done");
});

test("not listed: a replay's would-have, a step at read; listed: a step above read", async () => {
  const { r, slides, reply } = await scene();
  r.clock.now = at(15, 0);
  r.ctx.log.write({ kind: "rung.would", item: "t-slides", value: { act: "a".repeat(64), rung: "propose", at: "read", source: "canvas" }, words: { tool: "replayed" }, mode: "replay", by: ENGINE });
  r.ctx.log.write({ kind: "rung.did", item: "t-slides", value: { act: "b".repeat(64), rung: "read", source: "canvas" }, by: ENGINE });
  const up = r.ctx.log.write({ kind: "rung.did", item: "t-reply", value: { act: "c".repeat(64), rung: "propose", source: "mail" }, by: ENGINE });
  r.clock.now = EVENING;
  assert.deepEqual(ledgerMsg(r.ctx, null).entries.map((e) => e.id), [slides.id, reply.id, up.id]);
});

test("8. only the day so far: an event later than now, or of yesterday, is not listed", async () => {
  const { r, fakes, slidesCall, slides, reply } = await scene();
  r.clock.now = at(23, 0);
  await callSource(r.ctx, fakes.canvas, "propose", { ...slidesCall, input: { lecture: 12 } });
  const late = of(r, "rung.would").at(-1);
  r.clock.now = new Date(2026, 10, 10, 9, 0).getTime();
  await callSource(r.ctx, fakes.canvas, "propose", { ...slidesCall, input: { lecture: 13 } });
  const tomorrow = of(r, "rung.would").at(-1);
  r.clock.now = EVENING;
  const ids = (await r.ask(r.face(), { type: "home.ledger" }))[0].entries.map((e: any) => e.id);
  assert.deepEqual(ids, [slides.id, reply.id], "21:40: neither the 23:00 one nor tomorrow's");
  // the morning has less: at 11:10 only the first
  r.clock.now = at(11, 10);
  assert.deepEqual(ledgerMsg(r.ctx, null).entries.map((e) => e.id), [slides.id]);
  // the next day: only that day's
  r.clock.now = new Date(2026, 10, 10, 10, 0).getTime();
  const next = ledgerMsg(r.ctx, null);
  assert.deepEqual(next.entries.map((e) => e.id), [tomorrow.id]);
  assert.equal(next.day, "2026-11-10");
  assert.ok(!next.entries.some((e) => e.id === late.id));
});

test("9. computed twice, and again after a restart, the ledger is the same to the letter", async () => {
  const { r, slides } = await scene();
  const f = r.face();
  await r.ask(f, { type: "home.ledger.let", id: slides.id });
  const a = JSON.stringify(ledgerMsg(r.ctx, null)), b = JSON.stringify(ledgerMsg(r.ctx, null));
  assert.equal(a, b);
  assert.equal(JSON.stringify((await r.ask(f, { type: "home.ledger" }))[0]), a);
  const r2 = r.restart();
  for (const id of SOURCE_IDS) registerSource(r2.ctx, fake(id, NOW));
  assert.equal(JSON.stringify((await r2.ask(r2.face(), { type: "home.ledger" }))[0]), a, "a new kernel over the same log answers the same");
});

test("10. day is the local date, unpadded", async () => {
  const { r } = await scene();
  assert.equal((await r.ask(r.face(), { type: "home.ledger" }))[0].day, DAY);
  assert.equal(dayOf(new Date(2026, 0, 5, 23, 59).getTime()), "2026-1-5");
});

test("the ledger goes to every window when what it shows changed, once, after the asker's own answers; never when it did not", async () => {
  const { r, fakes, slidesCall } = await scene();
  const home = r.face("home"), notch = r.face("notch");
  await r.ask(home, { type: "home.ledger" });
  // Home 5's limit writes a would-have, no window asked: every window gets the new ledger, once
  await callSource(r.ctx, fakes.canvas, "propose", { ...slidesCall, input: { lecture: 14 } });
  await tick();
  assert.deepEqual(notch.got.map((m) => m.type), ["home.ledger"]);
  assert.equal(openWould(notch.got[0].entries).length, 3);
  // a later on Today changes nothing the ledger shows: no ledger
  notch.got.length = 0;
  r.seed([{ id: "t-x", read: "you", folder: "", words: "x", state: "you", waitsOn: "you", at: NOW, links: [], made: [] }]);
  await r.ask(home, { type: "home.later", thingId: "t-x" });
  await tick();
  assert.deepEqual(notch.got.map((m) => m.type), ["home.today"]);
  // an answer that makes a Thing done does: the receipt, Today, then the ledger
  notch.got.length = 0;
  const got = await r.ask(home, { type: "home.answer", thingId: "t-x", answer: "done" });
  assert.deepEqual(got.map((m) => m.type), ["home.done", "home.today", "home.ledger"]);
  assert.deepEqual(notch.got.map((m) => m.type), ["home.today", "home.ledger"]);
  assert.equal(last(got).entries.at(-1).did, "x");
  assert.equal(last(got).entries.at(-1).actor, "you");
});

test("an ask that does not parse, or names no open would-have, writes nothing and answers the plain state", async () => {
  const { r, slides } = await scene();
  const f = r.face();
  const n = r.events().length;
  for (const m of [
    { type: "home.ledger.let" }, { type: "home.ledger.let", id: 7 }, { type: "home.ledger.let", id: "no such" }, { type: "home.ledger.not", id: "" },
    { type: "home.ledger.not", id: "no such" }, { type: "home.undo", ledgerId: slides.id },
  ]) {
    const got = await r.ask(f, m);
    assert.deepEqual(got.map((x) => x.type), ["home.ledger"], JSON.stringify(m));
    assert.equal(got[0].done, null);
  }
  assert.equal(r.events().length, n);
});

test("the table: the ledger answers its three asks and reverses its kinds; behind the switch like all of Home", () => {
  const t = buildTable(UNITS);
  for (const type of ["home.ledger", "home.ledger.let", "home.ledger.not"]) { assert.ok(t.handlers.has(type)); assert.ok(homeHandles(type)); }
  for (const kind of ["thing.done", "undo thing.done", "rung.would", "rung.did"]) assert.ok(t.reverse.has(kind), kind);
});
