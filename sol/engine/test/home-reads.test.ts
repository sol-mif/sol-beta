// Home 3 (#827): the five reads for a sentence (src/home/reads.ts, judge.ts, filer.ts). The engine's half of Marco's
// face tests (sol/mac/src/home-say.test.ts on marco/mine-run): his sentences, his reads, his receipt and his undo,
// replayed against the engine's handlers with fake faces and a real kernel's log (test/fixtures/home/rig.ts), since his
// face does not reach the socket yet. Tests 1 to 11 are the plan's (specs home-plan §6 Home 3); the ones after them
// prove the rest of what the unit says (the engine's own week, the undo's refusal, no words on the line, the switch).
// NOW is his: Monday 9 November 2026, 8:40.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { NOW, TUE, THU, HIS, HIS_RULES, SENTENCES, DAYS, calendar, weekOf, norm } from "./fixtures/home/sentences.ts";
import { seed } from "./fixtures/home/seed.ts";
import { rig, cleanup, SCHEMAS } from "./fixtures/home/rig.ts";
import { FileAsk, ReadMsg, learnedId, learnedText, type Filed } from "../src/contract/home/reads.ts";
import { DoneMsg, TodayMsg } from "../src/contract/home/today.ts";
import { readSentence, receiptLine, thingOf } from "../src/home/reads.ts";
import { dayOf, verdictOf, READS } from "../src/home/judge.ts";
import { ruleFiler, personFiler } from "../src/home/filer.ts";
import { writeOwn } from "../src/home/rules.ts";
import { buildTable, UNITS } from "../src/home/wire.ts";
import { isHomeKind } from "../src/contract/kinds.ts";
import { freePort } from "./test-engine.ts";

after(cleanup);
// his filing rules are his (#1686): in his Home's own rules file, and handed to the pure reads, never in the engine's code
const HIS_FILER = personFiler(HIS_RULES);
const his = (text: string, week: Parameters<typeof readSentence>[1], now: number) => readSentence(text, week, now, [], undefined, HIS_FILER);
const hisRig = (o: Parameters<typeof rig>[0]) => { const r = rig(o); writeOwn(r.home, HIS_RULES); return r; };
const SCHEMAS3 = { ...SCHEMAS, "home.read": ReadMsg };
const make = (now = NOW) => hisRig({ now, schemas: SCHEMAS3 });
const today = (ms: any[]) => ms.filter((m) => m.type === "home.today").at(-1);
const done = (ms: any[]) => ms.find((m) => m.type === "home.done");
/** the parts of a read as Enter sends them (his filedOf, home-say.test.ts l.17) */
const filedOf = (r: { parts: any[] }): Filed[] => r.parts.map((p) => ({ text: p.text, read: p.read, folder: p.folder, at: p.at, after: p.after, found: p.found }));
/** a read against his week (the calendar's marks the face holds; the engine has no calendar source) */
const readHis = (text: string, now = NOW) => his(text, calendar(now), now);

test("1. “call Sam about the offer Thursday”, his week: one part, for you, sure, jobs, Thursday 13:00 after the bio exam", () => {
  const r = readHis("call Sam about the offer Thursday");
  assert.equal(r.parts.length, 1, "one thing");
  const [p] = r.parts;
  assert.equal(p.read, HIS.sam.read, "for you: a call is never an agent's");
  assert.equal(verdictOf(p.p[p.read]), HIS.sam.verdict);
  assert.equal(p.folder, HIS.sam.folder);
  assert.equal(p.at, HIS.sam.at);
  assert.equal(p.after, HIS.sam.after);
  assert.ok(ReadMsg.safeParse(r).success);
});

test("2. filing it: his receipt line, a ring on Thursday 13:00 tied to the Thing, not on the list before Thursday; undo takes the ring away", async () => {
  const r = make();
  r.seed(seed(NOW));
  const f = r.face();
  const out = await r.ask(f, { type: "home.file", parts: filedOf(readHis("call Sam about the offer Thursday")) });
  assert.deepEqual(out.map((m) => m.type), ["home.done", "home.today"], "the receipt, then the list");
  const d = done(out), w = today(out);
  assert.equal(d.line, HIS.samLine);
  assert.equal(d.did, "file");
  const ring = w.today.week.find((m: any) => m.thingId === d.thingId);
  assert.deepEqual({ kind: ring.kind, yours: ring.yours, at: ring.at, label: ring.label }, HIS.samRing);
  assert.ok(!w.today.needs.includes(d.thingId), "not on the list before Thursday morning");
  assert.match(d.thingId, /^it-[0-9a-f]{12}$/, "an engine id");
  // the engine's reading of "it joins this list Thursday morning": on Thursday at 8:00 it waits on you
  r.clock.now = THU(8);
  assert.ok(today(await r.ask(f, { type: "home.today" })).today.needs.includes(d.thingId), "on the list on Thursday morning");
  r.clock.now = NOW;
  const u = await r.ask(f, { type: "home.undo", ledgerId: d.ledgerId });
  assert.deepEqual(u.map((m) => m.type), ["home.today"], "the undo answers the list, no receipt");
  assert.ok(!today(u).today.week.some((m: any) => m.thingId === d.thingId), "undo takes the ring away");
  assert.ok(!today(u).things.some((t: any) => t.id === d.thingId), "and the Thing");
  assert.ok(existsSync(join(r.home, "items", d.thingId, "thing.json")), "nothing is deleted: it is gone, kept");
});

test("3. scene 2: “bio exam thursday, make notes from the slides”: the exam already there adds nothing, the notes are a job that moves", async () => {
  const rd = readHis("bio exam thursday, make notes from the slides");
  assert.deepEqual(rd.parts.map((p) => [p.text, p.read]), HIS.scene2);
  assert.equal(rd.parts[0].found, HIS.scene2Found);
  assert.equal(rd.parts[1].folder, HIS.scene2Folder);
  const r = make();
  r.seed(seed(NOW));
  const f = r.face();
  const before = today(await r.ask(f, { type: "home.today" })).today.week.length;
  const out = await r.ask(f, { type: "home.file", parts: filedOf(rd) }), d = done(out);
  assert.equal(d.thingIds.length, 1, "the date adds nothing; the job is one thing");
  assert.ok(today(out).today.moving.includes(d.thingIds[0]), "the job is moving");
  assert.equal(today(out).today.week.length, before + 1, "its thread on the week, and no second exam");
  assert.equal(r.events().filter((e) => e.kind === "thing.new" && e.cause === d.ledgerId).length, 1);
});

test("4. the split: at “, ”, “; ” and “ and then ”: four parts, over the socket's handler too", async () => {
  const text = "bio exam thursday, make notes from the slides; call mum and then book the dentist";
  assert.deepEqual(his(text, [], NOW).parts.map((p) => p.text), HIS.split);
  const r = make();
  const got = await r.ask(r.face(), { type: "home.say", text });
  assert.deepEqual(got.map((m) => m.type), ["home.read"]);
  assert.deepEqual(got[0].parts.map((p: any) => p.text), HIS.split);
  assert.equal(got[0].text, text);
});

test("5. the five and the verdicts: a date, a guess, a note that asks; every part has all five, summing to one", () => {
  const [g] = his("dinner friday", [], NOW).parts;
  assert.equal(g.read, "date");
  const [m] = his("thursday", [], NOW).parts;
  assert.equal(verdictOf(m.p[m.read]), "guess");
  assert.equal(READS.filter((x) => x !== m.read).sort((a, b) => m.p[b] - m.p[a])[0], "you", "his words: “a guess · or for you?”");
  const [n] = his("the blue one was nicer", [], NOW).parts;
  assert.equal(n.read, "note");
  assert.equal(verdictOf(n.p[n.read]), "asks");
  assert.equal(verdictOf(0.7), "sure"); assert.equal(verdictOf(0.45), "guess"); assert.equal(verdictOf(0.44), "asks");
  for (const s of SENTENCES) for (const p of his(s.text, weekOf(s), DAYS[s.day]).parts) {
    assert.deepEqual(Object.keys(p.p), [...READS], `${p.text}: a bar for each of the five`);
    assert.ok(Math.abs(READS.reduce((a, r) => a + p.p[r], 0) - 1) < 0.02, `${p.text}: the probabilities make one`);
  }
  assert.equal(dayOf("thursday", NOW), 3); assert.equal(dayOf("today", NOW), 0); assert.equal(dayOf("no day", NOW), null);
});

test("6. on Tuesday: Thursday is two days on, the same 13:00, after the bio exam", () => {
  assert.equal(dayOf("Thursday", TUE), 2);
  assert.equal(dayOf("monday", NOW), 0, "the weekday that is today is today, not next week (his rule)");
  assert.equal(dayOf("tuesday", TUE), 0);
  const [p] = readHis("call Sam about the offer Thursday", TUE).parts;
  assert.equal(p.at, THU(13));
  assert.equal(p.after, "bio exam");
  assert.equal(readHis("bio exam thursday, make notes from the slides", TUE).parts[0].found, "w-bio-exam");
});

test("7. the override: home.learn changes nothing on the list, one judge.override; filed as the person read it, the Thing moves", async () => {
  const r = make();
  r.seed(seed(NOW));
  const f = r.face();
  const before = today(await r.ask(f, { type: "home.today" }));
  const learned = { text: "call Sam about the offer Thursday", from: "you", to: "job" } as const;
  const got = await r.ask(f, { type: "home.learn", learned });
  assert.deepEqual(got.map((m) => m.type), ["home.today"], "no receipt");
  assert.deepEqual(today(got).today, before.today, "the list as it was");
  const [part] = filedOf(readHis(learned.text));
  const out = await r.ask(f, { type: "home.file", parts: [{ ...part, read: "job", was: "you" }] }), d = done(out);
  assert.ok(today(out).today.moving.includes(d.thingId), "filed as a job, as the person pressed");
  assert.equal(receiptLine([{ ...part, read: "job" }], NOW), HIS.overrideLine);
  assert.equal(d.line, `↳ ${HIS.overrideLine}`);
  const ev = r.events();
  assert.equal(ev.filter((e) => e.kind === "judge.override").length, 1, "exactly one judge.override");
  const o = ev.find((e) => e.kind === "judge.override");
  assert.deepEqual([o.value.question, o.value.from, o.value.to, o.value.words], ["read", "you", "job", learned.text]);
  const l = ev.find((e) => e.kind === "policy.learned");
  assert.deepEqual([l.item, l.value.what, l.value.words, l.cause], [learnedId(learned), "seen", learnedText(learned), o.id], "the learned line, seen once, caused by the override");
  // the same override again is the same line, seen twice; a learn that names no change writes nothing
  await r.ask(f, { type: "home.learn", learned: { ...learned, text: "  Call Sam about the offer Thursday " } });
  assert.deepEqual(r.events().filter((e) => e.kind === "policy.learned").map((e) => e.item), [learnedId(learned), learnedId(learned)]);
  const n = r.events().length;
  assert.deepEqual((await r.ask(f, { type: "home.learn", learned: { ...learned, to: "you" } })).map((m) => m.type), ["home.today"]);
  assert.equal(r.events().length, n);
});

test("8. the baseline: every sentence read by the rule judge as Marco's own code read it (SOL_BASELINE=write rewrites it)", () => {
  const file = new URL("./fixtures/home/reads-baseline.json", import.meta.url);
  const base = JSON.parse(readFileSync(file, "utf8"));
  const now = SENTENCES.map((s) => {
    const at = DAYS[s.day], r = his(s.text, weekOf(s), at), filed = filedOf(r);
    return { text: s.text, day: s.day, week: s.week, parts: norm(r.parts), receipt: receiptLine(filed, at), things: norm(filed.map((x, i) => thingOf(x, `t-${i}`, at))) };
  });
  if (process.env.SOL_BASELINE === "write") {
    writeFileSync(file, JSON.stringify({ ...base, _source: "written by the engine's port (SOL_BASELINE=write), src/home/judge.ts, filer.ts, reads.ts", weeks: { mon: norm(calendar(NOW)), tue: norm(calendar(TUE)) }, sentences: now }, null, 2) + "\n");
    // a run that writes the baseline checks nothing, so it does not pass: run again without SOL_BASELINE
    assert.fail("SOL_BASELINE=write: the baseline was rewritten and not checked; run the test again without it");
  }
  assert.deepEqual({ mon: norm(calendar(NOW)), tue: norm(calendar(TUE)) }, base.weeks, "the fixture's calendar is his week");
  assert.equal(base.sentences.length, SENTENCES.length, "one line a sentence");
  for (let i = 0; i < now.length; i++) assert.deepEqual(now[i], base.sentences[i], `${SENTENCES[i].text} (${SENTENCES[i].day}, ${SENTENCES[i].week})`);
  assert.ok(SENTENCES.filter((s) => s.his).length >= 6, "his test file's sentences are all in");
});

test("9. home.done of a filing names every Thing made: thingIds are the thing.new caused by its thing.file", async () => {
  const r = make();
  const f = r.face();
  const text = "call Sam about the offer Thursday, make notes from the slides; a deck for the bio presentation and then the blue one was nicer";
  const parts = filedOf(his(text, [], NOW));
  assert.equal(parts.length, 4);
  const d = done(await r.ask(f, { type: "home.file", parts }));
  const ev = r.events();
  const act = ev.find((e) => e.id === d.ledgerId);
  assert.equal(act.kind, "thing.file");
  assert.deepEqual([act.value.n, act.value.made], [4, 4]);
  assert.deepEqual(d.thingIds, ev.filter((e) => e.kind === "thing.new" && e.cause === d.ledgerId).map((e) => e.item));
  assert.equal(d.thingId, d.thingIds[0]);
  assert.ok(DoneMsg.safeParse(d).success);
  // a filing that makes nothing (a date already on the week) is still one act, with an empty receipt id list
  const none = done(await r.ask(f, { type: "home.file", parts: filedOf(readHis("bio exam thursday")) }));
  assert.deepEqual([none.thingId, none.thingIds], ["", []]);
  assert.equal(none.line, "↳ bio exam · already on your calendar, nothing added");
});

test("10. one judge.read for each filed part, caused by the thing.file; none from home.say", async () => {
  const r = make();
  const f = r.face();
  for (let i = 0; i < 3; i++) await r.ask(f, { type: "home.say", text: "bio exam thursday, make notes from the slides" });
  assert.equal(r.events().length, 0, "home.say writes nothing");
  const rd = readHis("bio exam thursday, make notes from the slides");
  const d = done(await r.ask(f, { type: "home.file", parts: filedOf(rd) }));
  const reads = r.events().filter((e) => e.kind === "judge.read");
  assert.equal(reads.length, 2, "one a part, the date that made no Thing too");
  for (const e of reads) {
    assert.equal(e.cause, d.ledgerId);
    assert.equal(e.value.question, "read");
    assert.equal(e.value.judge, "rule");
    assert.equal(typeof e.value.ms, "number");
    assert.equal(e.value.verdict, verdictOf(e.value.p[e.value.read]));
  }
  assert.deepEqual(reads.map((e) => e.item), [undefined, d.thingIds[0]], "the part's Thing, where it made one");
  assert.deepEqual(reads.map((e) => e.value.read), ["date", "job"]);
  // the order the plan gives: the act, its Things, then the reads
  assert.deepEqual(r.events().map((e) => e.kind), ["thing.file", "thing.new", "judge.read", "judge.read"]);
});

test("11. no network: with fetch throwing, the read, the filing, the learn and the undo all work", async () => {
  const was = globalThis.fetch;
  let called = 0;
  globalThis.fetch = (() => { called++; throw new Error("no network in Home 3"); }) as typeof fetch;
  try {
    const r = make();
    const f = r.face();
    assert.equal((await r.ask(f, { type: "home.say", text: "call Sam about the offer Thursday" }))[0].parts[0].read, "you");
    await r.ask(f, { type: "home.learn", learned: { text: "call Sam", from: "you", to: "job" } });
    const d = done(await r.ask(f, { type: "home.file", parts: filedOf(readHis("call Sam about the offer Thursday")) }));
    await r.ask(f, { type: "home.undo", ledgerId: d.ledgerId });
    assert.equal(called, 0);
  } finally { globalThis.fetch = was; }
});

// ---- the rest of what the unit says ----

test("home.say reads against the engine's own week: Thursday at 10:00, no “after” (the engine has no calendar source; his week gives 13:00 after the bio exam)", async () => {
  const r = make();
  r.seed(seed(NOW));
  const got = await r.ask(r.face(), { type: "home.say", text: "call Sam about the offer Thursday" });
  const [p] = got[0].parts;
  // the folders the person has are the Things' own: the seed's “jobs › applications” starts with the rule's “jobs”
  assert.deepEqual([p.read, p.folder, p.at, p.after], ["you", "jobs › applications", THU(10), undefined]);
  assert.equal(typeof got[0].ms, "number");
  assert.equal(HIS_FILER.file("call Sam", ["jobs › applications"]).folder, "jobs › applications");
  assert.deepEqual(HIS_FILER.file("the blue one was nicer", []), { folder: "life", confidence: 0.3 });
  // the engine's own filer knows nobody's life (#1686): his words file nowhere but by the folders a person has
  assert.deepEqual(ruleFiler.file("call Sam about the offer", []), { folder: "life", confidence: 0.3 });
  assert.equal(ruleFiler.file("notes for the jobs search", ["jobs › applications"]).folder, "life", "a folder's name, not a word in it, files there");
  assert.equal(ruleFiler.file("put it in applications", ["jobs › applications"]).folder, "jobs › applications");
});

test("the undo of a filing: one reverse act and each Thing gone, earlier lines untouched; a second undo writes nothing; refused once a Thing changed", async () => {
  const r = make();
  r.seed(seed(NOW));
  const f = r.face(), g = r.face();
  const d = done(await r.ask(f, { type: "home.file", parts: filedOf(his("call mum today, make notes from the slides", [], NOW)) }));
  assert.equal(d.thingIds.length, 2);
  const bytes = r.bytes(), n = r.events().length;
  const u = await r.ask(f, { type: "home.undo", ledgerId: d.ledgerId });
  assert.deepEqual(u.map((m) => m.type), ["home.today"]);
  assert.equal(g.got.at(-1).type, "home.today", "every window is sent the list");
  assert.ok(r.bytes().startsWith(bytes), "the log is never edited");
  const added = r.events().slice(n);
  assert.deepEqual(added.map((e) => e.kind), ["thing.file", "thing.state", "thing.state"]);
  for (const e of added) { assert.equal(e.cause, d.ledgerId); assert.equal(e.value.undo, true); }
  assert.deepEqual(added.slice(1).map((e) => [e.item, e.value.gone]), d.thingIds.map((id: string) => [id, true]));
  // again: nothing written, the state answered
  const m = r.events().length;
  assert.deepEqual((await r.ask(f, { type: "home.undo", ledgerId: d.ledgerId })).map((x) => x.type), ["home.today"]);
  assert.equal(r.events().length, m);
  // refused: a Thing the filing made was answered since
  const d2 = done(await r.ask(f, { type: "home.file", parts: filedOf(his("call mum today", [], NOW)) }));
  assert.ok(today(await r.ask(f, { type: "home.today" })).today.needs.includes(d2.thingId), "for you today: on the list now");
  await r.ask(f, { type: "home.answer", thingId: d2.thingId, answer: "done" });
  const k = r.events().length;
  const refused = await r.ask(f, { type: "home.undo", ledgerId: d2.ledgerId });
  assert.deepEqual(refused.map((x) => x.type), ["home.today"]);
  assert.equal(r.events().length, k, "nothing written");
  assert.ok(today(refused).things.some((t: any) => t.id === d2.thingId), "the Thing stays");
});

test("a second undo of a filing that made no Thing writes nothing: one reverse act, not two", async () => {
  const r = make();
  const f = r.face();
  const d = done(await r.ask(f, { type: "home.file", parts: filedOf(readHis("bio exam thursday")) }));
  assert.deepEqual(d.thingIds, [], "the exam is already there");
  const n = r.events().length;
  await r.ask(f, { type: "home.undo", ledgerId: d.ledgerId });
  await r.ask(f, { type: "home.undo", ledgerId: d.ledgerId });
  assert.deepEqual(r.events().slice(n).map((e) => [e.kind, e.value.undo]), [["thing.file", true]]);
});

// ---- a stop half-way: the engine killed (SIGKILL) between two lines of a filing or of its undo ----

/** test/fixtures/home/stop-child.ts in its own process over the folder: how it ended, and what it printed */
function child(dir: string, ...args: string[]): Promise<{ signal: string | null; out: string }> {
  return new Promise((res) => {
    const c = spawn(process.execPath, ["--import", "tsx", join(import.meta.dirname, "fixtures", "home", "stop-child.ts"), dir, ...args], { cwd: join(import.meta.dirname, ".."), stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    c.stdout!.on("data", (b) => { out += b; });
    c.on("exit", (_code, signal) => res({ signal, out }));
  });
}
const stopDir = () => { const d = mkdtempSync(join(tmpdir(), "sol-home-stop-")); spawned.push(d); return d; };
const words = (ms: any[]) => today(ms).things.map((t: any) => t.words).sort();
/** the log's events but Today's own today.shown (a home.today writes one) */
const filing = (r: ReturnType<typeof make>) => r.events().filter((e) => e.kind !== "today.shown");

test("a stop half-way through a filing: at the next start the Things not yet made are made, with their judge.reads; again nothing", { timeout: 60_000 }, async () => {
  for (const k of [1, 2, 4]) {
    const dir = stopDir();
    assert.equal((await child(dir, "file", String(k))).signal, "SIGKILL", `killed after the filing's line ${k}`);
    const r = hisRig({ now: NOW, dir, schemas: SCHEMAS3 });
    assert.equal(r.events().length, k, "the stop left the filing half made");
    const f = r.face();
    assert.deepEqual(words(await r.ask(f, { type: "home.today" })), ["call mum", "make notes from the slides"], `after line ${k}: both Things are there`);
    const ev = filing(r), act = ev.find((e) => e.kind === "thing.file")!;
    assert.deepEqual(ev.map((e) => e.kind), ["thing.file", "thing.new", "thing.new", "judge.read", "judge.read"]);
    for (const e of ev.slice(1)) assert.equal(e.cause, act.id);
    const news = ev.filter((e) => e.kind === "thing.new").map((e) => e.item);
    assert.deepEqual(ev.filter((e) => e.kind === "judge.read").map((e) => e.item), news, "each read names its Thing");
    // a second start writes nothing more
    const n = ev.length, r2 = hisRig({ now: NOW, dir, schemas: SCHEMAS3 });
    await r2.ask(r2.face(), { type: "home.today" });
    assert.equal(filing(r2).length, n);
    // and the filing undoes whole
    const u = await r2.ask(r2.face(), { type: "home.undo", ledgerId: act.id });
    assert.deepEqual(today(u).things, [], "both gone");
  }
});

test("a stop half-way through the undo of a filing: at the next start the undo is finished, every Thing gone; again nothing", { timeout: 60_000 }, async () => {
  for (const k of [1, 2]) {
    const dir = stopDir();
    const { ledgerId, thingIds } = JSON.parse((await child(dir, "prep")).out);
    assert.equal(thingIds.length, 2);
    assert.equal((await child(dir, "undo", ledgerId, String(k))).signal, "SIGKILL", `killed after the undo's line ${k}`);
    const r = hisRig({ now: NOW, dir, schemas: SCHEMAS3 });
    assert.equal(r.events().filter((e) => e.cause === ledgerId && e.value?.undo).length, k, "the stop left the undo half done");
    const f = r.face();
    assert.deepEqual(today(await r.ask(f, { type: "home.today" })).things, [], `after line ${k}: both Things are gone`);
    const undo = r.events().filter((e) => e.cause === ledgerId && e.value?.undo);
    assert.deepEqual(undo.map((e) => [e.kind, e.item, e.value.gone]), [["thing.file", undefined, undefined], ...thingIds.map((id: string) => ["thing.state", id, true])]);
    const n = filing(r).length;
    await r.ask(f, { type: "home.undo", ledgerId });
    const r2 = hisRig({ now: NOW, dir, schemas: SCHEMAS3 });
    await r2.ask(r2.face(), { type: "home.today" });
    assert.equal(filing(r2).length, n, "a press again, and a second start, write nothing");
  }
});

test("an undo of a filing cut short without a restart (a write that threw): pressing undo again finishes it", async () => {
  const r = make();
  const f = r.face();
  const d = done(await r.ask(f, { type: "home.file", parts: filedOf(his("call mum today, make notes from the slides", [], NOW)) }));
  const write = r.ctx.log.write;
  r.ctx.log.write = (w) => { if (w.kind === "thing.state") throw new Error("the disk is full"); return write(w); };
  await r.ask(f, { type: "home.undo", ledgerId: d.ledgerId });
  r.ctx.log.write = write;
  assert.equal(today(await r.ask(f, { type: "home.today" })).things.length, 2, "the throw left both Things");
  const u = await r.ask(f, { type: "home.undo", ledgerId: d.ledgerId });
  assert.deepEqual(today(u).things, [], "the second press finishes the undo");
  assert.equal(r.events().filter((e) => e.kind === "thing.file" && e.value.undo).length, 1, "one reverse act");
});

test("no words on the line: the parts, the override's sentence and the learned line are in value files; the line holds their hash", async () => {
  const r = make();
  const f = r.face();
  await r.ask(f, { type: "home.learn", learned: { text: "ring the zebra keeper", from: "you", to: "job" } });
  await r.ask(f, { type: "home.file", parts: filedOf(his("ring the zebra keeper friday", [], NOW)) });
  const lines = r.bytes();
  assert.ok(!/zebra/i.test(lines), "no free text on the day's lines");
  const ev = r.events();
  assert.equal(ev.find((e) => e.kind === "thing.file").value.words[0].text, "ring the zebra keeper friday", "read back from its value file");
  assert.equal(r.log.words(r.log.all().find((e) => e.kind === "judge.override")!), "ring the zebra keeper");
});

test("asks that do not parse write nothing: home.file and home.learn answer the list, home.say an empty read", async () => {
  const r = make();
  r.seed(seed(NOW));
  const f = r.face(), n = r.events().length;
  for (const m of [{ type: "home.file" }, { type: "home.file", parts: [] }, { type: "home.file", parts: [{ text: "x", read: "maybe", folder: "life" }] },
    { type: "home.file", parts: [{ text: "", read: "note", folder: "life" }] }, { type: "home.file", parts: [{ text: "   ", read: "note", folder: "life" }] },
    { type: "home.file", parts: [{ text: "call mum", read: "you", folder: "life", at: 1e300 }] }, { type: "home.file", parts: [{ text: "call mum", read: "you", folder: "life", at: -1 }] },
    { type: "home.learn", learned: { text: "  ", from: "you", to: "job" } },
    { type: "home.learn" }, { type: "home.learn", learned: { text: "x", from: "you" } }, { type: "home.learn", learned: { text: "", from: "you", to: "job" } }]) {
    assert.deepEqual((await r.ask(f, m)).map((x) => x.type), ["home.today"], JSON.stringify(m));
  }
  assert.deepEqual(await r.ask(f, { type: "home.say" }), [{ type: "home.read", text: "", ms: 0, parts: [] }]);
  assert.deepEqual(await r.ask(f, { type: "home.say", text: "x".repeat(4001) }), [{ type: "home.read", text: "", ms: 0, parts: [] }]);
  assert.equal(r.events().length, n);
  assert.equal(FileAsk.safeParse({ type: "home.file", parts: filedOf(readHis("call Sam about the offer Thursday")) }).success, true);
});

test("the table: Home 3 answers home.say, home.file, home.learn and undoes thing.file; a restart gives the same list", async () => {
  const t = buildTable(UNITS);
  for (const type of ["home.say", "home.file", "home.learn"]) assert.ok(t.handlers.has(type), type);
  assert.ok(t.reverse.has("thing.file"));
  const r = make();
  r.seed(seed(NOW));
  const f = r.face();
  await r.ask(f, { type: "home.file", parts: filedOf(readHis("call Sam about the offer Thursday, make notes from the slides")) });
  const one = today(await r.ask(f, { type: "home.today" }));
  const r2 = r.restart();
  const two = today(await r2.ask(r2.face(), { type: "home.today" }));
  assert.equal(JSON.stringify(two), JSON.stringify(one), "computed from the store and the log, the same to the byte");
  assert.ok(TodayMsg.safeParse(two).success);
});

// ---- a real engine on its own free port (#1144), every folder in a temp one ----

type Msg = { type: string; [k: string]: any };
const engines: ChildProcess[] = [], sockets: WebSocket[] = [];
after(async () => {
  for (const s of sockets) s.terminate();
  for (const e of engines) {
    if (e.exitCode !== null || e.signalCode !== null) continue;
    const gone = new Promise((r) => e.once("exit", r));
    e.kill();
    const t = setTimeout(() => e.kill("SIGKILL"), 5000);
    await gone;
    clearTimeout(t);
  }
  for (const d of spawned) rmSync(d, { recursive: true, force: true });
});
const spawned: string[] = [];
async function engine(port: number, env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "sol-home-reads-"));
  spawned.push(dir);
  const home = join(dir, "home");
  mkdirSync(home);
  writeOwn(home, HIS_RULES);   // his filing rules, his Home's own (#1686)
  const base = { ...process.env };
  base.SOL_HOME_WHOLE = "off";   // off unless the test says on (on for the team by default since #691)
  const e = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: join(import.meta.dirname, ".."), stdio: "ignore",
    env: {
      ...base, SOL_PORT: String(port), SOL_HOME: home, SOL_STATE: join(dir, "state", "work.json"), SOL_TEAM: join(dir, "team", "team.json"),
      SOL_LOGDIR: join(dir, "log"), SOL_LOG: join(dir, "engine.log"), SOL_PROFILE: join(dir, "profile"), SOL_APPDIR: join(dir, "app"),
      SOL_FRAME: "on", SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off", ...env,
    },
  });
  engines.push(e);
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(`${url}/health`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  const open = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    sockets.push(ws);
    const got: Msg[] = [];
    ws.on("message", (raw) => { got.push(JSON.parse(raw.toString())); });
    await new Promise((r, no) => { ws.once("open", r); ws.once("error", no); });
    const next = async (pred: (m: Msg) => boolean, ms = 20_000): Promise<Msg> => {
      for (let t = 0; t < ms; t += 50) { const m = got.find(pred); if (m) return m; await new Promise((r) => setTimeout(r, 50)); }
      throw new Error("timed out; got " + got.map((m) => m.type).join(" "));
    };
    return { got, next, say: (m: object) => ws.send(JSON.stringify(m)) };
  };
  const log = async (): Promise<Msg[]> => (await (await fetch(`${url}/log`)).json() as { events: Msg[] }).events;
  return { home, open, log, ...(await open()) };
}

test("a real engine, the switch off (the default): home.say and home.file are not answered, nothing made, no Home kind written", { timeout: 90_000 }, async () => {
  const e = await engine(await freePort(), {});
  e.say({ type: "home.say", text: "call Sam about the offer Thursday" });
  e.say({ type: "home.file", parts: filedOf(readHis("call Sam about the offer Thursday", Date.now())) });
  e.say({ type: "home.learn", learned: { text: "call Sam", from: "you", to: "job" } });
  e.say({ type: "settings.get" });
  await e.next((m) => m.type === "settings" && e.got.filter((x) => x.type === "settings").length >= 2);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(e.got.filter((m) => m.type.startsWith("home.")).length, 0, "no Home message comes back");
  assert.equal(existsSync(join(e.home, "items")), false);
  const kinds = (await e.log()).map((m) => m.kind);
  assert.ok(kinds.includes("engine.start"), "the frame is on: the log is there");
  assert.deepEqual(kinds.filter(isHomeKind), [], "no Home kind written");
});

test("a real engine with SOL_HOME_WHOLE=on: home.say is read over the socket; home.file is filed, the receipt to the asker, the list to every window", { timeout: 90_000 }, async () => {
  const e = await engine(await freePort(), { SOL_HOME_WHOLE: "on" });
  const other = await e.open();
  e.say({ type: "home.say", text: "call Sam about the offer Thursday, make notes from the slides" });
  const rd = await e.next((m) => m.type === "home.read");
  assert.ok(ReadMsg.safeParse(rd).success);
  assert.deepEqual(rd.parts.map((p: any) => [p.read, p.folder]), [["you", "jobs"], ["job", "school › bio 201"]]);
  e.say({ type: "home.file", parts: filedOf(rd) });
  const d = await e.next((m) => m.type === "home.done");
  assert.equal(d.thingIds.length, 2);
  const pushed = await other.next((m) => m.type === "home.today");
  assert.ok(pushed.today.moving.includes(d.thingIds[1]), "the other window is told: the job moves");
  assert.equal(other.got.filter((m) => m.type === "home.done").length, 0, "only the asker gets the receipt");
  const kinds = (await e.log()).map((m) => m.kind).filter(isHomeKind);
  assert.deepEqual(kinds, ["thing.file", "thing.new", "thing.new", "judge.read", "judge.read"]);
  assert.ok(existsSync(join(e.home, "items", d.thingIds[0], "thing.json")));
});
