// Reading the past (the v2 design §7.3, step A3): a block whose record names kinds in needs.history reads the log's past
// of those kinds with sol.since(from, kinds), a batch at a time, in either room; any other kind is refused and logged.
// It gets each event's skeleton, and a value only when it holds no free text, unless it asked for the words (text: true)
// and that was pressed. All of it behind SOL_HISTORY, off by default (record.ts historyOn). Each test makes its own home,
// log folder and Sol folder under the system's temp folder.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, realpathSync } from "node:fs";
import { tmpdir, platform } from "node:os";
import { join } from "node:path";
import { SINCE_BATCH, pastOf, heardOf } from "../src/kernel.ts";
import { Kernel } from "./kernels.ts";
import { columnsOf, HISTORY_ENV, historyOn, type Columns } from "../src/record.ts";
import { askOf, asksAny, cardOf, widerThan, pressedFile } from "../src/card.ts";
import { isKind, kindRow, KINDS, SEAT_KINDS } from "../src/contract/kinds.ts";
import { hashOf } from "../src/canonical.ts";
import { idOf } from "../src/log.ts";

const mac = platform() === "darwin" && existsSync("/usr/bin/sandbox-exec");
const was = process.env[HISTORY_ENV];
process.env[HISTORY_ENV] = "on";   // the switch on for every test here but the one that turns it off
const seatWas = process.env.SOL_ACP_SEAT;
process.env.SOL_ACP_SEAT = "off";   // the seat's switch (on by default, #691) off here, so needs' columns are this switch's alone
const homes: string[] = [];
const kernels: Kernel[] = [];
after(async () => {
  for (const k of kernels) await k.stop().catch(() => {});   // a test that failed midway leaves none running
  for (const h of homes) rmSync(h, { recursive: true, force: true });
  if (was === undefined) delete process.env[HISTORY_ENV]; else process.env[HISTORY_ENV] = was;
  if (seatWas === undefined) delete process.env.SOL_ACP_SEAT; else process.env.SOL_ACP_SEAT = seatWas;
});
function home() {
  const h = realpathSync(mkdtempSync(join(tmpdir(), "sol-history-")));
  homes.push(h);
  mkdirSync(join(h, "things"));
  mkdirSync(join(h, "app"));
  return h;
}
/** a kernel on a home, stopped at the end whatever happened */
const kernel = (h: string) => { const k = new Kernel(h, lab(h)); kernels.push(k); return k; };
const lab = (h: string, big: Record<string, unknown> = {}) => ({ logDir: join(h, "lab-log"), appDir: join(h, "app"), big: { idleMs: 60_000, ...big } });
/** a block with its record's columns and an engine half */
function block(h: string, id: string, engine: string, rec: Record<string, unknown> = {}) {
  const d = join(h, "things", id);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "record.json"), JSON.stringify({ id, title: id, place: "card", reads: [], writes: [], versions: [{ v: 1, file: "v1.html", at: "2026-11-10", contract: 1 }], ...rec }));
  writeFileSync(join(d, "v1.html"), "<p>x</p>");
  writeFileSync(join(d, "engine.js"), engine);
}
/** a block whose tool `past` hands back what sol.since answers, or "refused: why" */
const ASKER = `export default (sol) => {
  sol.tool({ name: "past", args: { from: "number", kinds: "string" }, run: async ({ from, kinds }) => {
    try { return await sol.since(from, kinds ? kinds.split(",") : undefined); } catch (e) { return "refused: " + e.message; }
  } });
  sol.tool({ name: "has", run: () => typeof sol.since });
};`;
/** ASKER, and it listens: its tool \`heard\` hands back every event it heard */
const EAR = `export default (sol) => {
  const heard = [];
  sol.listen((e) => { heard.push(e); });
  sol.tool({ name: "past", args: { from: "number", kinds: "string" }, run: async ({ from, kinds }) => {
    try { return await sol.since(from, kinds ? kinds.split(",") : undefined); } catch (e) { return "refused: " + e.message; }
  } });
  sol.tool({ name: "heard", run: () => heard });
};`;
const text = (r: { content: { type: string; text?: string }[] }) => (r.content[0] as { text: string }).text;
const past = async (k: Kernel, id: string, from: number, kinds?: string[]) => {
  const t = text(await k.runTool(`thing_${id}_past`, { from, ...(kinds ? { kinds: kinds.join(",") } : {}) }));
  return t.startsWith("refused: ") ? t : (JSON.parse(t) as { events: Record<string, unknown>[]; next: number | null });
};
const refusals = (k: Kernel, id: string) => k.since().filter((e) => e.kind === "plugin.refused" && e.item === id);
const cols = (r: Record<string, unknown>) => (columnsOf(r) as { columns: Columns }).columns;
/** a person's press on a block's card, through the kernel's own door */
async function press(k: Kernel, id: string) {
  const w = k.waiting(id);
  assert.ok(w, `${id} waits for a press: ${k.state(id)?.why}`);
  const r = await k.approve(id, w.print);
  assert.equal(r.ok, true);
}
/** three today.pick lines and two of another kind (undo.did), before any block loads */
function picks(k: Kernel) {
  k.append("today.pick", "thing-a", { from: "today.shown" }, { person: "person" });
  k.append("undo.did", "other", { from: 2, to: 1 });
  k.append("today.pick", "thing-b", { from: "today.shown" }, { person: "person" });
  k.append("undo.did", "other", { from: 3, to: 2 });
  k.append("today.pick", "thing-c", { from: "today.shown" }, { person: "person" });
}

test("needs.history, pure: a list of kinds or { kinds, text }; each a kind of the registry; on the card; a wider one asks again", () => {
  assert.ok(isKind("today.pick") && kindRow("today.pick")!.who === "core", "today.pick is a row (contract/kinds.ts), written by the core");
  assert.deepEqual(cols({ needs: { why: "to learn your order", history: ["today.pick"] } }).needs!.history, { kinds: ["today.pick"], text: false });
  assert.deepEqual(cols({ needs: { why: "x", history: { kinds: ["undo.did", "today.pick"], text: true } } }).needs!.history, { kinds: ["today.pick", "undo.did"], text: true });
  assert.equal(cols({ needs: { why: "x", history: [] } }).needs!.history, undefined, "naming no kind asks nothing");
  assert.deepEqual(cols({ needs: {} }).needs, { why: "", domains: [], folders: [], programs: [], sol: [], keys: [], tools: [], every: [], screen: false, provides: [] }, "not written: the needs are as before");
  const why = (r: Record<string, unknown>) => (columnsOf(r) as { why: string }).why;
  assert.match(why({ needs: { history: ["today.pick"] } }), /needs.why is missing/, "it is an ask like any other: one sentence why");
  assert.match(why({ needs: { why: "x", history: ["gossip.told"] } }), /needs.history names "gossip.told", which is not a kind on the log/);
  assert.match(why({ needs: { why: "x", history: ["load"] } }), /needs.history names "load", the name a kind had before: it is plugin.load now/);
  assert.match(why({ needs: { why: "x", history: "today.pick" } }), /needs.history is not a list of kinds, nor \{ kinds/);
  assert.match(why({ needs: { why: "x", history: { kinds: ["today.pick"], words: true } } }), /needs.history has "words", which is not one of its fields/);
  assert.match(why({ needs: { why: "x", history: { kinds: ["today.pick"], text: "yes" } } }), /needs.history's text is not true or false/);
  // the card: the design's sentence as written, and a line of its own for the words
  const a = askOf(cols({ needs: { why: "to learn your order", history: ["today.pick"] } }));
  assert.deepEqual(a.history, ["today.pick"]);
  assert.equal(a.historyText, undefined);
  assert.ok(asksAny(a), "reading the past waits for a press, in either room");
  const card = cardOf(join(tmpdir(), "no-sol-here"), "learner", cols({ needs: { why: "to learn your order", history: ["today.pick"] } }), null, () => []);
  assert.ok(card.plain.includes("It wants to read your past records: today.pick."), card.plain.join(" | "));
  assert.ok(!card.plain.some((l) => /words in them/.test(l)), "no words asked, no line for them");
  const worded = cardOf(join(tmpdir(), "no-sol-here"), "learner", cols({ needs: { why: "x", history: { kinds: ["today.pick", "undo.did"], text: true } } }), null, () => []);
  assert.ok(worded.plain.includes("It wants to read your past records: today.pick, undo.did."));
  assert.ok(worded.plain.includes("It also reads the words in them: what you and your AI wrote there, not only what happened and when."));
  assert.equal(worded.asks.historyText, true);
  // wider: another kind, or the words, after the press
  assert.deepEqual(widerThan(a, askOf(cols({ needs: { why: "x", history: ["today.pick"] } }))), []);
  assert.deepEqual(widerThan(a, askOf(cols({ needs: { why: "x", history: ["today.pick", "undo.did"] } }))), ["reading your past undo.did"]);
  assert.deepEqual(widerThan(a, askOf(cols({ needs: { why: "x", history: { kinds: ["today.pick"], text: true } } }))), ["the words in your past records"]);
  assert.deepEqual(widerThan(worded.asks, a), [], "narrower asks nothing");
  // a card with no history is the card it was: no new field, the same print
  const plainAsk = askOf(cols({ hears: ["seat.turn"] }));
  assert.ok(!("history" in plainAsk) && !("historyText" in plainAsk));
});

test("1, 2. a block that names today.pick reads the past ones, and not the two of another kind; asking for that kind is refused, one line on the log", async () => {
  const h = home();
  const k = kernel(h);
  picks(k);
  block(h, "learner", ASKER, { needs: { why: "to learn which card you pick first", history: ["today.pick"], tools: [{ name: "past" }] } });
  await k.sync();
  await press(k, "learner");
  assert.equal(k.state("learner")?.state, "loaded", k.state("learner")?.why);
  const r = await past(k, "learner", 0, ["today.pick"]);
  assert.ok(typeof r !== "string", String(r));
  assert.deepEqual(r.events.map((e) => [e.kind, e.item]), [["today.pick", "thing-a"], ["today.pick", "thing-b"], ["today.pick", "thing-c"]], "the three past picks, oldest first, none of the other kind");
  assert.equal(r.next, null, "and that is the end");
  for (const e of r.events) {
    assert.equal(e.id, undefined, "no id: seq is its handle (test 5b says why)");
    assert.equal(typeof e.seq, "number");
    assert.equal(typeof e.at, "number");
    assert.deepEqual(e.by, { person: "person" });
  }
  // not given: every kind its record names
  const all = await past(k, "learner", 0);
  assert.ok(typeof all !== "string");
  assert.deepEqual(all.events.map((e) => e.item), ["thing-a", "thing-b", "thing-c"]);
  // from a seq: only what came after it
  const later = await past(k, "learner", (r.events[0].seq as number));
  assert.ok(typeof later !== "string");
  assert.deepEqual(later.events.map((e) => e.item), ["thing-b", "thing-c"]);
  assert.equal(refusals(k, "learner").length, 0);
  // 2. a kind it did not name
  const no = await past(k, "learner", 0, ["undo.did"]);
  assert.match(String(no), /^refused: refused: learner may not read the past undo.did: not among the kinds its record names in needs.history \(today.pick\)/);
  const lines = refusals(k, "learner");
  assert.equal(lines.length, 1, "one refusal line");
  assert.equal(lines[0].item, "learner", "it names the block");
  assert.deepEqual(lines[0].by, { person: "engine", agent: "learner" });
  assert.deepEqual({ op: (lines[0].value as { op: string }).op, what: (lines[0].value as { what: string }).what }, { op: "since", what: "undo.did" }, "and the kind");
  // a named kind and an unnamed one together: refused whole, nothing handed
  assert.match(String(await past(k, "learner", 0, ["today.pick", "undo.did"])), /may not read the past undo.did/);
  assert.equal(refusals(k, "learner").length, 2);
  await k.stop();
});

test("3. a block with no needs.history that calls sol.since is refused, and logged", async () => {
  const h = home();
  const k = kernel(h);
  picks(k);
  block(h, "nosy", ASKER);
  await k.sync();
  assert.equal(k.state("nosy")?.state, "loaded", "it asks nothing: no card, it loads");
  assert.equal(text(await k.runTool("thing_nosy_has", {})), "function", "the verb is there with the switch on");
  assert.match(String(await past(k, "nosy", 0, ["today.pick"])), /refused: nosy may not read the past today.pick: its record names no kinds in needs.history/);
  assert.match(String(await past(k, "nosy", 0)), /refused: nosy may not read the past the past: its record names no kinds in needs.history/);
  assert.equal(refusals(k, "nosy").length, 2);
  assert.equal((refusals(k, "nosy")[0].value as { op: string }).op, "since");
  await k.stop();
});

test("3b. a refusal names at most five made-up kinds, each cut short; a block loaded with the switch on is refused once it is turned off", async () => {
  const h = home();
  const k = kernel(h);
  picks(k);
  block(h, "learner", ASKER, { needs: { why: "x", history: ["today.pick"], tools: [{ name: "past" }] } });
  await k.sync();
  await press(k, "learner");
  const made = Array.from({ length: 7 }, (_, i) => `${i}`.repeat(2000));
  assert.match(String(await past(k, "learner", 0, made)), /may not read the past 0{64}…, 1{64}…, 2{64}…, 3{64}…, 4{64}… and 2 more: not among/);
  const what = (refusals(k, "learner")[0].value as { what: string }).what;
  assert.ok(what.length < 400, `a short line: ${what.length}`);
  // the switch turned off while the block is loaded (its sol still has the verb): the kernel says no on its own
  process.env[HISTORY_ENV] = "off";
  try {
    assert.match(String(await past(k, "learner", 0, ["today.pick"])), /^refused: sol.since is not on this engine/);
  } finally { process.env[HISTORY_ENV] = "on"; }
  assert.ok(typeof (await past(k, "learner", 0, ["today.pick"])) !== "string", "on again: it reads");
  await k.stop();
});

test("4. more than one batch: the first is full and says next; following next reaches the end, no line twice, none missing", async () => {
  const h = home();
  const k = kernel(h);
  const n = SINCE_BATCH * 2 + 37;
  const want: number[] = [];
  for (let i = 0; i < n; i++) {
    want.push(k.append("today.pick", `thing-${i}`, undefined, { person: "person" }).seq);
    if (i % 3 === 0) k.append("undo.did", "other", { from: 2, to: 1 });   // another kind between them
  }
  block(h, "learner", ASKER, { needs: { why: "to learn which card you pick first", history: ["today.pick"], tools: [{ name: "past" }] } });
  await k.sync();
  await press(k, "learner");
  const first = await past(k, "learner", 0, ["today.pick"]);
  assert.ok(typeof first !== "string", String(first));
  assert.equal(first.events.length, SINCE_BATCH, "a full batch");
  assert.equal(first.next, first.events.at(-1)!.seq, "next is the last seq handed");
  const got = first.events.map((e) => e.seq as number);
  let next = first.next, calls = 1;
  while (next !== null) {
    const r = await past(k, "learner", next, ["today.pick"]);
    assert.ok(typeof r !== "string", String(r));
    got.push(...r.events.map((e) => e.seq as number));
    next = r.next;
    if (++calls > 10) assert.fail("it never reached the end");
  }
  assert.equal(calls, 3);
  assert.deepEqual(got, want, "every pick once, in order");
  await k.stop();
});

test("4b. a kind that is rare: one call looks through at most a page, says next, and the past older than memory is read from the files", async () => {
  const h = home();
  const k = kernel(h);
  const pick = k.append("today.pick", "early", undefined, { person: "person" }).seq;
  for (let i = 0; i < 6000; i++) k.append("undo.did", "other", { from: 2, to: 1 });   // past the 5000 kept in memory
  const late = k.append("today.pick", "late", undefined, { person: "person" }).seq;
  block(h, "learner", ASKER, { needs: { why: "x", history: ["today.pick"], tools: [{ name: "past" }] } });
  // a kernel started now holds only the newest 5000 in memory: the early pick is in the files
  await k.stop();
  const k2 = kernel(h);
  await k2.sync();
  await press(k2, "learner");
  const r1 = await past(k2, "learner", 0, ["today.pick"]);
  assert.ok(typeof r1 !== "string", String(r1));
  assert.deepEqual(r1.events.map((e) => [e.seq, e.item]), [[pick, "early"]]);
  assert.ok(r1.next !== null && r1.next < late, "it stopped looking after a page and says where to go on");
  const seen = r1.events.map((e) => e.seq);
  let next = r1.next;
  while (next !== null) { const r = await past(k2, "learner", next, ["today.pick"]); assert.ok(typeof r !== "string"); seen.push(...r.events.map((e) => e.seq)); next = r.next; }
  assert.deepEqual(seen, [pick, late]);
  await k2.stop();
});

test("5. a value with free text is held back; with text: true asked and pressed, it is handed", async () => {
  const h = home();
  const k = kernel(h);
  k.append("plugin.line", "someone", { line: "my bank password is in the drawer" }, { person: "engine", agent: "someone" });
  k.append("undo.did", "someone", { from: 2, to: 1 });
  const gone = k.append("plugin.line", "someone", { line: "erase me" }, { person: "engine", agent: "someone" });
  k.erase(gone.id);
  const kinds = ["plugin.line", "undo.did"];
  block(h, "plain", ASKER, { needs: { why: "x", history: kinds, tools: [{ name: "past" }] } });
  block(h, "worded", ASKER, { needs: { why: "x", history: { kinds, text: true }, tools: [{ name: "past" }] } });
  await k.sync();
  await press(k, "plain");
  await press(k, "worded");
  const p = await past(k, "plain", 0, kinds);
  assert.ok(typeof p !== "string", String(p));
  assert.ok(!JSON.stringify(p).includes("bank password"), "the words are not in what it gets");
  const [line, undo, erased] = p.events;
  assert.equal(line.kind, "plugin.line");
  assert.equal(line.value, undefined);
  assert.equal(line.withheld, true, "held back, and said so");
  assert.deepEqual(undo.value, { from: 2, to: 1 }, "a value with no free text (on the day's line) is handed");
  assert.equal(erased.erased, true);
  assert.equal(erased.value, undefined);
  const w = await past(k, "worded", 0, kinds);
  assert.ok(typeof w !== "string", String(w));
  assert.deepEqual(w.events[0].value, { line: "my bank password is in the drawer" }, "asked for and pressed: the words");
  assert.equal(w.events[0].withheld, undefined);
  assert.equal(w.events[2].erased, true, "an erased one stays erased, words or not");
  // pastOf, pure: the same rule for a line written before v1
  const old = { id: "x", seq: 1, project: "home", kind: "plugin.line", old: "line", v: 0 as const, by: { person: "engine" }, at: 1, value: { line: "old words" } };
  assert.deepEqual(pastOf(old as never, false), { seq: 1, kind: "plugin.line", old: "line", v: 0, by: { person: "engine" }, at: 1, withheld: true });
  assert.deepEqual((pastOf(old as never, true) as { value: unknown }).value, { line: "old words" });
  await k.stop();
});

test("5b. a value held back or erased cannot be confirmed: no hash and no id, prev or cause is handed", async () => {
  const h = home();
  const k = kernel(h);
  const said = k.append("plugin.line", "someone", { line: "pregnant" }, { person: "engine", agent: "someone" });
  const gone = k.append("plugin.line", "someone", { line: "divorce" }, { person: "engine", agent: "someone" });
  k.erase(gone.id);
  k.append("undo.did", "someone", { from: 2, to: 1 }, { person: "engine" }, { cause: said.id, ctx: { session: "s1" } });
  block(h, "guesser", ASKER, { needs: { why: "x", history: ["plugin.line", "undo.did"], tools: [{ name: "past" }] } });
  await k.sync();
  await press(k, "guesser");
  const r = await past(k, "guesser", 0, ["plugin.line", "undo.did"]);
  assert.ok(typeof r !== "string", String(r));
  const [line, erased, undo] = r.events;
  assert.equal(line.withheld, true);
  assert.equal(erased.erased, true);
  assert.deepEqual(undo.value, { from: 2, to: 1 });
  assert.deepEqual(undo.ctx, { session: "s1" }, "where it happened is handed");
  const wire = JSON.stringify(r);
  for (const guess of ["fine", "pregnant", "divorce"]) {
    assert.ok(!wire.includes(hashOf({ line: guess })), `a guess (${guess}) hashed is not on what the block gets`);
  }
  for (const id of [said.id, gone.id]) assert.ok(!wire.includes(id), "nor an id, whose body holds the value's hash");
  assert.doesNotMatch(wire, /[0-9a-f]{64}/, "no hash of any kind: an id, a prev or a cause would let a guess be checked down the chain");
  for (const e of r.events) for (const key of ["hash", "id", "prev", "cause", "project", "ignorable"]) assert.equal(e[key], undefined, `${key} is not handed`);
  await k.stop();
});

test("5c. the log's own kinds are refused in needs.history, as is a kind never handed to a block; an erase's hash and an id in item are never handed", async () => {
  const why = (r: Record<string, unknown>) => (columnsOf(r) as { ok: boolean; why?: string });
  for (const own of ["log.erase", "engine.start", "engine.tz", "plugin.altered"]) {
    const r = why({ needs: { why: "x", history: ["today.pick", own] } });
    assert.equal(r.ok, false, `${own} is refused`);
    assert.match(r.why ?? "", new RegExp(`needs.history names "${own.replace(".", "\\.")}", the log's own: what the log does to itself .* is read by no block`));
  }
  for (const deaf of ["plugin.trouble", "run.about", "rung.asked"]) {
    const r = why({ needs: { why: "x", history: [deaf] } });
    assert.equal(r.ok, false, `${deaf} is refused`);
    assert.match(r.why ?? "", new RegExp(`needs.history names "${deaf.replace(".", "\\.")}", which is never handed to a block: its past is not read either`));
  }
  // today.pick, the design's own example, is heard only by a block that names it and is pressed, as a seat's steps
  assert.equal(kindRow("today.pick")!.hear, "card");
  assert.ok(!SEAT_KINDS.includes("today.pick"), "it is not a seat's step");
  const ear = cols({ hears: ["today.pick"] });
  assert.deepEqual(askOf(ear).hears, ["today.pick"], "naming it in hears waits for a press");
  const card = cardOf(join(tmpdir(), "no-sol-here"), "ear", ear, null, () => []);
  assert.ok(card.plain.includes("It hears your new records as they are written: today.pick. What happened and when, not the words."), card.plain.join(" | "));
  assert.ok(!card.plain.some((l) => /what your AI does/.test(l)), "not said as a seat's steps");
  assert.deepEqual(widerThan({ hears: [] }, askOf(ear)), ["hearing your today.pick"]);
  // a block that names log.erase does not load, and gets no card
  const h = home();
  const k = kernel(h);
  const gone = k.append("plugin.line", "someone", { line: "divorce" }, { person: "engine", agent: "someone" });
  k.erase(gone.id);
  block(h, "eraser", ASKER, { needs: { why: "x", history: ["log.erase"], tools: [{ name: "past" }] } });
  await k.sync();
  assert.equal(k.state("eraser")?.state, "broken");
  assert.match(k.state("eraser")?.why ?? "", /needs.history names "log.erase", the log's own/);
  assert.equal(k.waiting("eraser"), null);
  // pastOf, pure, whatever a record says: an erase's value is never handed, and its item (the erased event's id) is left out
  const erase = k.since().find((e) => e.kind === "log.erase")!;
  assert.ok(erase && erase.item === gone.id && typeof (erase.value as { hash?: string })?.hash === "string", "the erase as the log has it");
  for (const words of [false, true]) {
    const out = pastOf(erase, words);
    assert.equal(out.value, undefined, "no value: it is the hash of what was erased");
    assert.equal(out.withheld, true);
    assert.equal(out.item, undefined, "no item: it is the erased event's id");
    assert.doesNotMatch(JSON.stringify(out), /[0-9a-f]{64}/);
  }
  assert.equal(pastOf({ ...erase, kind: "undo.did", item: "thing-a", value: { from: 2, to: 1 } } as never, false).item, "thing-a", "an item that is not an id is handed");
  await k.stop();
});

/** every 64-hex string in what a block got: an id, a prev, a hash or a cause */
const hexes = (x: unknown) => [...JSON.stringify(x).matchAll(/[0-9a-f]{64}/g)].map((m) => m[0]);
/** whether a guess at a held-back today.pick's value, with the past's skeleton and any id the block got as its prev
 *  (and as its cause, or none), rebuilds an id the block got: the guess is confirmed */
function confirmed(pick: Record<string, unknown>, got: string[], guess: unknown): boolean {
  for (const prev of new Set(got)) for (const cause of [undefined, ...new Set(got)]) {
    const body = { v: 1, project: "home", by: pick.by, kind: "today.pick", item: pick.item, hash: hashOf(guess), at: pick.at, prev, ...(cause ? { cause } : {}) };
    if (got.includes(idOf(body as never))) return true;
  }
  return false;
}

test("5d. a block that hears and reads the past cannot confirm a held-back value down the chain: it hears no id, prev, hash or cause", async () => {
  const h = home();
  const k = kernel(h);
  block(h, "both", EAR, { hears: ["undo.did"], needs: { why: "to learn which card you pick first", history: ["today.pick"], tools: [{ name: "past" }, { name: "heard" }] } });
  block(h, "plainear", EAR, { hears: ["undo.did"], needs: { why: "x", tools: [{ name: "past" }, { name: "heard" }] } });
  await k.sync();
  await press(k, "both");
  assert.equal(k.state("both")?.state, "loaded", k.state("both")?.why);
  assert.equal(k.state("plainear")?.state, "loaded", "it asks nothing: no card");
  const before = k.append("undo.did", "other", { from: 2, to: 1 }, { person: "person" });
  k.append("today.pick", "thing-a", { from: "today.shown" }, { person: "person" }, { cause: before.id });
  k.append("undo.did", "other", { from: 3, to: 2 }, { person: "person" });
  const heardBy = async (id: string) => {
    for (let i = 0; i < 100; i++) {
      const got = JSON.parse(text(await k.runTool(`thing_${id}_heard`, {}))) as Record<string, unknown>[];
      if (got.length >= 2) return got;
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.fail(`${id} heard nothing`);
  };
  const heard = await heardBy("both");
  const p = await past(k, "both", 0, ["today.pick"]);
  assert.ok(typeof p !== "string", String(p));
  const [pick] = p.events;
  assert.equal(pick.withheld, true, "the pick's value is held back");
  assert.deepEqual(heard.map((e) => [e.kind, e.seq, e.value]), [["undo.did", before.seq, { from: 2, to: 1 }], ["undo.did", before.seq + 2, { from: 3, to: 2 }]], "it still hears the kind it named, with its value");
  const got = hexes([heard, p]);
  for (const guess of [{ from: "today.list" }, { from: "today.shown" }]) assert.equal(confirmed(pick, got, guess), false, `a guess (${JSON.stringify(guess)}) is not confirmed`);
  for (const e of heard) for (const key of ["id", "prev", "hash", "cause"]) assert.equal(e[key], undefined, `a heard event has no ${key}`);
  assert.deepEqual(got, [], "no id of any kind reaches it");
  // a block that does not read the past hears no ids either (BRIEF finding 2, made global): its handle is seq
  const plain = await heardBy("plainear");
  assert.deepEqual(plain.map((e) => [e.kind, e.seq]), [["undo.did", before.seq], ["undo.did", before.seq + 2]]);
  for (const e of plain) for (const key of ["id", "prev", "hash", "cause"]) assert.equal(e[key], undefined, `a heard event has no ${key}`);
  await k.stop();
});

/** every kind a block may hear (the registry's hear column): a block that names them all hears everything */
const EVERY = KINDS.filter((r) => r.hear).map((r) => r.kind);
/** a block that hears everything and keeps it all in the shared data "pool", one write at a time (either room) */
const HOARDER = `export default (sol) => {
  let q = Promise.resolve();
  sol.listen((e) => { q = q.then(async () => { const seen = (await sol.read("pool")) ?? []; await sol.write("pool", [...seen, e]); }); });
};`;
/** ASKER, and its tool \`pool\` hands back the shared data "pool" */
const READER = ASKER.replace("sol.tool({ name: \"has\"", "sol.tool({ name: \"pool\", run: async () => (await sol.read(\"pool\")) ?? [] });\n  sol.tool({ name: \"has\"");
/** every id, prev, hash and cause on the log: the chain's values, none of which a block may get */
const chainOf = (k: Kernel) => new Set(k.since().flatMap((e) => { const x = e as Record<string, unknown>; return [x.id, x.prev, x.hash, x.cause].filter((v): v is string => typeof v === "string" && v !== ""); }));

/** BRIEF finding 2, made global: one block hears everything and writes it to shared data, another reads that and the
 *  past; neither gets a chain id, so a held-back pick cannot be confirmed. `ear` in the given room, `reader` small */
async function twoBlocks(room: "small" | "big") {
  const h = home();
  const k = kernel(h);
  block(h, "ear", HOARDER, { ...(room === "big" ? { room: "big" } : {}), hears: EVERY, reads: ["pool"], writes: ["pool"], needs: { why: "to keep all it hears" } });
  block(h, "reader", READER, { reads: ["pool"], needs: { why: "to learn which card you pick first", history: ["today.pick"], tools: [{ name: "past" }, { name: "pool" }, { name: "has" }] } });
  await k.sync();
  await press(k, "ear");
  await press(k, "reader");
  assert.equal(k.state("ear")?.state, "loaded", k.state("ear")?.why);
  assert.equal(k.state("reader")?.state, "loaded", k.state("reader")?.why);
  const before = k.append("undo.did", "other", { from: 2, to: 1 }, { person: "person" });
  const pick = k.append("today.pick", "thing-a", { from: "today.shown" }, { person: "person" }, { cause: before.id });
  k.append("plugin.suspect", "someone", { refused: 10, why: "x" }, { person: "engine" }, { cause: pick.id });
  k.seat("seat.step", "claude", { session: "s1", tool: "Read", file: "/a/b.txt" });
  const last = k.append("undo.did", "other", { from: 3, to: 2 }, { person: "person" });
  let pool: Record<string, unknown>[] = [];
  for (let i = 0; i < 200 && !pool.some((e) => e.seq === last.seq); i++) {
    pool = JSON.parse(text(await k.runTool("thing_reader_pool", {}))) as Record<string, unknown>[];
    if (!pool.some((e) => e.seq === last.seq)) await new Promise((r) => setTimeout(r, 25));
  }
  assert.ok(pool.some((e) => e.seq === last.seq), "the ear heard the last line and wrote it to the pool");
  const kinds = new Set(pool.map((e) => e.kind));
  for (const kind of ["undo.did", "today.pick", "plugin.suspect", "seat.step", "plugin.load"]) assert.ok(kinds.has(kind), `the ear heard ${kind}`);
  const p = await past(k, "reader", 0, ["today.pick"]);
  assert.ok(typeof p !== "string", String(p));
  const chain = chainOf(k);
  assert.ok(chain.has(pick.id) && chain.has(before.id), "the chain as the log has it");
  const seen = JSON.stringify([pool, p]);
  for (const x of chain) assert.ok(!seen.includes(x), `no chain id reaches either block (${x.slice(0, 12)}…)`);
  const prints = new Set(pool.map((e) => (e.via as { pkg?: string } | undefined)?.pkg).filter(Boolean));   // a block's print (via.pkg): its files' fingerprint, not the chain's
  assert.deepEqual(hexes([pool, p]).filter((x) => !prints.has(x)), [], "no other 64-hex string reaches either block");
  for (const e of pool) for (const key of ["id", "prev", "hash", "cause"]) assert.equal(e[key], undefined, `a heard ${e.kind} has no ${key}`);
  const heardPick = pool.find((e) => e.seq === pick.seq)!;
  assert.equal(heardPick.withheld, true, "the pick's words are not heard either");
  assert.doesNotMatch(seen, /today\.shown/);
  for (const guess of [{ from: "today.list" }, { from: "today.shown" }]) assert.equal(confirmed(p.events[0], hexes([pool, p]), guess), false, `a guess (${JSON.stringify(guess)}) is not confirmed`);
  assert.deepEqual(pool.find((e) => e.seq === last.seq)!.value, { from: 3, to: 2 }, "an open kind is heard with its value, as before");
  await k.stop();
}
test("5e. two blocks: one hears everything and writes it to shared data, one reads that and the past; neither gets a chain id", () => twoBlocks("small"));
test("5e, the big room: the block that hears everything is in a big room", { skip: !mac }, () => twoBlocks("big"));

test("5f. a person's record a block hears (today.pick) keeps its words back as its past does; with text: true pressed, they are handed", async () => {
  // pure: no chain id on any heard kind, an item that is an id left out; only a card kind that is not a seat's holds words back
  const e = { v: 1, project: "home", by: { person: "person" }, kind: "today.pick", item: "a".repeat(64), hash: "b".repeat(64), at: 1, prev: "c".repeat(64), cause: "d".repeat(64), id: "e".repeat(64), seq: 7, value: { from: "today.shown" } };
  assert.deepEqual(heardOf(e as never), { v: 1, project: "home", by: { person: "person" }, kind: "today.pick", at: 1, seq: 7, withheld: true });
  assert.deepEqual(heardOf(e as never, true).value, { from: "today.shown" });
  assert.deepEqual(heardOf({ ...e, kind: "plugin.line", item: "someone", value: { line: "free words" } } as never).value, { line: "free words" }, "an open kind: as on main");
  assert.deepEqual(heardOf({ ...e, kind: "seat.step", item: undefined, value: { session: "s", tool: "Read", file: "/a" } } as never).value, { session: "s", tool: "Read", file: "/a" }, "a seat's step: as on main");
  // in the kernel: three blocks hear today.pick; only the one pressed for its words gets them
  const h = home();
  const k = kernel(h);
  block(h, "deaf", EAR, { hears: ["today.pick"], needs: { why: "x", tools: [{ name: "heard" }] } });
  block(h, "both", EAR, { hears: ["today.pick"], needs: { why: "x", history: ["today.pick"], tools: [{ name: "past" }, { name: "heard" }] } });
  block(h, "worded", EAR, { hears: ["today.pick"], needs: { why: "x", history: { kinds: ["today.pick"], text: true }, tools: [{ name: "past" }, { name: "heard" }] } });
  await k.sync();
  for (const id of ["deaf", "both", "worded"]) { await press(k, id); assert.equal(k.state(id)?.state, "loaded", k.state(id)?.why); }
  assert.ok(k.waiting("deaf") === null);
  const deafCard = cardOf(join(tmpdir(), "no-sol-here"), "deaf", cols({ hears: ["today.pick"], needs: { why: "x" } }), null, () => []);
  assert.ok(deafCard.plain.includes("It hears your new records as they are written: today.pick. What happened and when, not the words."), deafCard.plain.join(" | "));
  const wordCard = cardOf(join(tmpdir(), "no-sol-here"), "worded", cols({ hears: ["today.pick"], needs: { why: "x", history: { kinds: ["today.pick"], text: true } } }), null, () => []);
  assert.ok(wordCard.plain.includes("It hears your new records as they are written: today.pick. The words in them too."), wordCard.plain.join(" | "));
  const pick = k.append("today.pick", "thing-a", { from: "today.shown", note: "secret words" }, { person: "person" });
  const heardBy = async (id: string) => {
    for (let i = 0; i < 100; i++) {
      const got = JSON.parse(text(await k.runTool(`thing_${id}_heard`, {}))) as Record<string, unknown>[];
      if (got.length) return got[0];
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.fail(`${id} heard nothing`);
  };
  for (const id of ["deaf", "both"]) {
    const got = await heardBy(id);
    assert.equal(got.seq, pick.seq);
    assert.equal(got.value, undefined, `${id} hears no words`);
    assert.equal(got.withheld, true);
    assert.doesNotMatch(JSON.stringify(got), /secret words/);
  }
  assert.deepEqual((await heardBy("worded")).value, { from: "today.shown", note: "secret words" }, "pressed for the words: handed");
  await k.stop();
});

test("5g. the switch off: a block that hears gets no chain id either, whatever its record", async () => {
  process.env[HISTORY_ENV] = "off";
  try {
    const h = home();
    const k = kernel(h);
    block(h, "plainear", EAR.replace(/sol\.since/g, "sol.nothing"), { hears: ["undo.did", "plugin.suspect"], needs: { why: "x", tools: [{ name: "heard" }] } });
    await k.sync();
    assert.equal(k.state("plainear")?.state, "loaded", "open kinds: no card");
    const before = k.append("undo.did", "other", { from: 2, to: 1 }, { person: "person" });
    k.append("plugin.suspect", "someone", { refused: 10, why: "x" }, { person: "engine" }, { cause: before.id });
    let heard: Record<string, unknown>[] = [];
    for (let i = 0; i < 100 && heard.length < 2; i++) {
      heard = JSON.parse(text(await k.runTool("thing_plainear_heard", {}))) as Record<string, unknown>[];
      if (heard.length < 2) await new Promise((r) => setTimeout(r, 20));
    }
    assert.deepEqual(heard.map((e) => [e.kind, e.seq]), [["undo.did", before.seq], ["plugin.suspect", before.seq + 1]]);
    const seen = JSON.stringify(heard);
    for (const x of chainOf(k)) assert.ok(!seen.includes(x), "no chain id is heard");
    for (const e of heard) for (const key of ["id", "prev", "hash", "cause"]) assert.equal(e[key], undefined, `a heard event has no ${key}`);
    await k.stop();
  } finally { process.env[HISTORY_ENV] = "on"; }
});

test("6, 7. the card says it; a record pressed with one kind and changed to two waits again until pressed again", async () => {
  const h = home();
  const k = kernel(h);
  picks(k);
  const rec = (history: unknown) => ({ needs: { why: "to learn which card you pick first", history, tools: [{ name: "past" }] } });
  block(h, "learner", ASKER, rec(["today.pick"]));
  await k.sync();
  assert.equal(k.state("learner")?.state, "broken");
  assert.match(k.state("learner")?.why ?? "", /waiting for a person to press its card/);
  const w = k.waiting("learner")!;
  assert.deepEqual(w.asks.history, ["today.pick"]);
  assert.ok(w.plain.includes("It wants to read your past records: today.pick."));
  await press(k, "learner");
  assert.equal(k.state("learner")?.state, "loaded");
  const pressed = JSON.parse(readFileSync(pressedFile(join(h, "app"), h, "learner"), "utf8"));
  assert.deepEqual(pressed.history, ["today.pick"], "the press keeps the kinds it said yes to");
  const approve = k.since().filter((e) => e.kind === "plugin.approve" && e.item === "learner");
  assert.deepEqual((approve[0].value as { asks: { history: string[] } }).asks.history, ["today.pick"], "the log's press line says them");
  // 7. one kind more: wider
  block(h, "learner", ASKER, rec(["today.pick", "undo.did"]));
  await k.sync();
  assert.equal(k.state("learner")?.state, "broken", "not loaded until pressed again");
  assert.match(k.state("learner")?.why ?? "", /asks for more than was pressed \(reading your past undo.did\)/);
  assert.equal(k.waiting("learner")!.again, true);
  await press(k, "learner");
  const r = await past(k, "learner", 0, ["undo.did"]);
  assert.ok(typeof r !== "string", String(r));
  assert.equal(r.events.length, 2, "pressed again: the new kind reads");
  // the words, after the press: wider too
  block(h, "learner", ASKER, rec({ kinds: ["today.pick", "undo.did"], text: true }));
  await k.sync();
  assert.match(k.state("learner")?.why ?? "", /asks for more than was pressed \(the words in your past records\)/);
  assert.ok(k.waiting("learner")!.plain.includes("It also reads the words in them: what you and your AI wrote there, not only what happened and when."));
  // narrower: goes on, nothing asked
  block(h, "learner", ASKER, rec(["today.pick"]));
  await k.sync();
  assert.equal(k.state("learner")?.state, "loaded");
  await k.stop();
});

test("8. the switch off: needs.history is refused with today's sentence, and sol.since is not on the sol object", async () => {
  process.env[HISTORY_ENV] = "off";
  try {
    assert.equal(historyOn(), false, "off when it says off");
    assert.deepEqual(columnsOf({ needs: { why: "x", history: ["today.pick"] } }), { ok: false, why: `record.json: needs has "history", which is not one of its columns (why, domains, folders, programs, sol, keys, tools, every, screen, provides)` });
    const h = home();
    const k = kernel(h);
    picks(k);
    block(h, "learner", ASKER, { needs: { why: "x", history: ["today.pick"], tools: [{ name: "past" }] } });
    block(h, "nosy", ASKER);
    await k.sync();
    assert.equal(k.state("learner")?.state, "broken");
    assert.match(k.state("learner")?.why ?? "", /needs has "history", which is not one of its columns/);
    assert.equal(k.waiting("learner"), null, "no card for it");
    assert.equal(text(await k.runTool("thing_nosy_has", {})), "undefined", "sol has no since");
    assert.match(String(await past(k, "nosy", 0, ["today.pick"])), /refused: sol.since is not a function/);
    assert.equal(refusals(k, "nosy").length, 0, "nothing reached the kernel");
    await k.stop();
    for (const v of ["off", "0", "false", " OFF "]) { process.env[HISTORY_ENV] = v; assert.equal(historyOn(), false, `"${v}" is off`); }
    delete process.env[HISTORY_ENV]; assert.equal(historyOn(), true, "on by default (#691)");
    for (const v of ["on", "1", "true", "ON", "", "yes"]) { process.env[HISTORY_ENV] = v; assert.equal(historyOn(), true, `"${v}" is on`); }
  } finally { process.env[HISTORY_ENV] = "on"; }
});

test("the big room: sol.since is there with the switch on, awaited; the kinds checked by the kernel, not the room", { skip: !mac }, async () => {
  const h = home();
  const k = kernel(h);
  picks(k);
  block(h, "far", ASKER, { room: "big", needs: { why: "to learn which card you pick first", history: ["today.pick"], tools: [{ name: "past" }, { name: "has" }] } });
  await k.sync();
  await press(k, "far");
  assert.equal(k.state("far")?.state, "loaded", k.state("far")?.why);
  const r = await past(k, "far", 0, ["today.pick"]);
  assert.ok(typeof r !== "string", String(r));
  assert.deepEqual(r.events.map((e) => e.item), ["thing-a", "thing-b", "thing-c"]);
  assert.equal(r.next, null);
  assert.match(String(await past(k, "far", 0, ["undo.did"])), /refused: refused: far may not read the past undo.did/);
  assert.equal(refusals(k, "far").length, 1);
  await k.stop();
  // and with the switch off a big room's sol has no since either
  process.env[HISTORY_ENV] = "off";
  try {
    const h2 = home();
    block(h2, "farnosy", ASKER, { room: "big", needs: { why: "a test", tools: [{ name: "has" }] } });
    const k2 = kernel(h2);
    await k2.sync();
    await press(k2, "farnosy");
    assert.equal(text(await k2.runTool("thing_farnosy_has", {})), "undefined");
    await k2.stop();
  } finally { process.env[HISTORY_ENV] = "on"; }
});

test("5d, the big room: a block there that reads the past hears no id, prev, hash or cause either", { skip: !mac }, async () => {
  const h = home();
  const k = kernel(h);
  block(h, "farear", EAR, { room: "big", hears: ["undo.did"], needs: { why: "to learn which card you pick first", history: ["today.pick"], tools: [{ name: "past" }, { name: "heard" }] } });
  await k.sync();
  await press(k, "farear");
  assert.equal(k.state("farear")?.state, "loaded", k.state("farear")?.why);
  const before = k.append("undo.did", "other", { from: 2, to: 1 }, { person: "person" });
  k.append("today.pick", "thing-a", { from: "today.shown" }, { person: "person" }, { cause: before.id });
  k.append("undo.did", "other", { from: 3, to: 2 }, { person: "person" });
  let heard: Record<string, unknown>[] = [];
  for (let i = 0; i < 100 && heard.length < 2; i++) {
    heard = JSON.parse(text(await k.runTool("thing_farear_heard", {}))) as Record<string, unknown>[];
    if (heard.length < 2) await new Promise((r) => setTimeout(r, 20));
  }
  assert.deepEqual(heard.map((e) => e.seq), [before.seq, before.seq + 2], "it hears the kind it named");
  const p = await past(k, "farear", 0, ["today.pick"]);
  assert.ok(typeof p !== "string", String(p));
  const got = hexes([heard, p]);
  for (const guess of [{ from: "today.list" }, { from: "today.shown" }]) assert.equal(confirmed(p.events[0], got, guess), false, `a guess (${JSON.stringify(guess)}) is not confirmed`);
  assert.deepEqual(got, [], "no id of any kind reaches it");
  await k.stop();
});
