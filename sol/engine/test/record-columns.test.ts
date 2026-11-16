// The record's four new columns (the design's step 2): room, needs, stores, hears. Each optional; not written means none,
// and a record from before loads as it did (record.ts, kernel.ts). The blocks are written into a home made for each test.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, cpSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { toolName, LINES_A_SECOND } from "../src/kernel.ts";
import { Kernel } from "./kernels.ts";
import { columnsOf, hearsKind, dataPlace, HEARD_KINDS, type Columns } from "../src/record.ts";
import { askOf, writePress, printOf } from "../src/card.ts";
import { bigRoomHere } from "../src/bigroom.ts";

const SOL = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIX = join(SOL, "design/system/fixtures");
const homes: string[] = [];
after(() => { for (const h of homes) rmSync(h, { recursive: true, force: true }); });
function home() {
  const h = mkdtempSync(join(tmpdir(), "sol-columns-"));
  homes.push(h);
  mkdirSync(join(h, "things"));
  return h;
}
const lab = (h: string) => ({ logDir: join(h, "lab-log"), appDir: join(h, "app") });
/** a block with a record of its own columns and an engine half */
function block(h: string, id: string, engine: string, rec: Record<string, unknown> = {}) {
  const d = join(h, "things", id);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "record.json"), JSON.stringify({ id, title: id, place: "card", reads: [], writes: [], versions: [{ v: 1, file: "v1.html", at: "2026-11-08", contract: 1 }], ...rec }));
  writeFileSync(join(d, "v1.html"), "<p>x</p>");
  writeFileSync(join(d, "ask.md"), "a test block");
  writeFileSync(join(d, "engine.js"), engine);
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** why a big room nobody pressed is not running: on a Mac it waits for its press; elsewhere there is no big room to wait for */
const WAITS = bigRoomHere() === null ? /waiting for a person to press its card/ : /the big room runs on a Mac only/;
const said = (k: Kernel, id: string) => k.since().filter((e) => e.kind === "plugin.line" && e.by.agent === id).map((e) => (e.value as { line: string }).line);

test("columnsOf, pure: not written means none; each column that does not hold is said", () => {
  assert.deepEqual(columnsOf({}), { ok: true, columns: { room: "small", needs: null, stores: [], hears: null } });
  const full = columnsOf({ room: "big", needs: { why: "to file issues", domains: ["api.github.com"], folders: ["/Users/me/Pictures"], programs: ["gh", "screencapture"], sol: ["page_read"], keys: ["github"], tools: [{ name: "file", description: "file it", args: { title: "string" } }], every: [60000], screen: true, provides: [] }, stores: ["seen", "drafts"], hears: ["seat.turn", "seat.done", "plugin.load"] });
  assert.ok(full.ok);
  assert.deepEqual(full.columns, { room: "big", needs: { why: "to file issues", domains: ["api.github.com"], folders: ["/Users/me/Pictures"], programs: ["gh", "screencapture"], sol: ["page_read"], keys: ["github"], tools: [{ name: "file", description: "file it", args: { title: "string" } }], every: [60000], screen: true, provides: [] }, stores: ["seen", "drafts"], hears: ["seat.turn", "seat.done", "plugin.load"] });
  const why = (r: Record<string, unknown>) => (columnsOf(r) as { why: string }).why;
  assert.match(why({ room: "huge" }), /room is "huge", not small or big/);
  assert.match(why({ stores: "seen" }), /stores is not a list of words/);
  assert.match(why({ stores: ["../etc"] }), /stores has "..\/etc", which is not a data name/);
  assert.match(why({ hears: ["seat.turn", "gossip"] }), /hears names "gossip", which is not a kind a block can hear/);
  assert.match(why({ needs: [] }), /needs is not an object/);
  assert.match(why({ needs: { domains: ["https://api.github.com/x"] } }), /needs.domains has "https:\/\/api.github.com\/x", which is not a host name/);
  assert.match(why({ needs: { domains: ["*.github.com"] } }), /not a host name/);
  assert.match(why({ needs: { folders: ["Pictures"] } }), /needs.folders has "Pictures", which is not an absolute path/);
  assert.match(why({ needs: { programs: ["/bin/sh"] } }), /needs.programs has "\/bin\/sh", which is not a program's name/);
  assert.match(why({ needs: { tools: [{ args: {} }] } }), /needs.tools has one without a name/);
  assert.match(why({ needs: { tools: [{ name: "x", args: { n: "list" } }] } }), /x's argument n is not string, number or boolean/);
  assert.match(why({ needs: { every: [10] } }), /needs.every is not a list of milliseconds \(1000 to 2147483647\)/);
  assert.match(why({ needs: { why: 3 } }), /needs.why is not one plain sentence/);
  assert.deepEqual((columnsOf({ stores: ["a", "a"] }) as { columns: { stores: string[] } }).columns.stores, ["a"], "said twice is once");
  assert.ok(HEARD_KINDS.includes("seat.turn") && HEARD_KINDS.includes("plugin.refused"));
  assert.match(why({ hears: ["plugin.trouble"] }), /hears names "plugin.trouble", which is never handed to a block/, "two blocks throwing on each other's trouble would ring forever");
  assert.equal(new Set(HEARD_KINDS).size, HEARD_KINDS.length, "each kind once");
  assert.match(why({ stores: ["drafts"], writes: ["drafts"] }), /"drafts" is in stores and in writes/);
  assert.match(why({ needs: { why: "x", folders: ["/"] } }), /needs.folders has "\/", which is not an absolute path/);
  assert.match(why({ needs: { why: "x", folders: ["/Users/me/../../etc"] } }), /needs.folders has "\/Users\/me\/..\/..\/etc"/);
  assert.match(why({ needs: { why: "x", folders: ["/Users/me/a\tb"] } }), /needs.folders has/);
  assert.match(why({ needs: { why: "x", every: [2147483648] } }), /needs.every is not a list of milliseconds \(1000 to 2147483647\)/);
  assert.match(why({ needs: { why: "x", tools: [{ name: "a" }, { name: "a" }] } }), /needs.tools names a twice/);
  assert.match(why({ needs: { why: "x", tools: [{ name: "a", description: {} }] } }), /a's description is not a sentence/);
  assert.match(why({ needs: { why: "x", tools: [{ name: "a", args: ["n"] }] } }), /a's args is not an object/);
  assert.match(why({ needs: { domain: ["api.github.com"] } }), /needs has "domain", which is not one of its columns/);
  assert.match(why({ needs: { domains: ["api.github.com"] } }), /needs.why is missing/);
  assert.match(why({ needs: { why: "x", domains: Array.from({ length: 65 }, (_, i) => `h${i}.example.com`) } }), /more than 64 entries/);
  assert.ok(columnsOf({ needs: { why: "a local service", domains: ["localhost:7777", "127.0.0.1", "api.github.com:443"] } }).ok, "a local host, an address, a port");
  assert.deepEqual(columnsOf({ needs: {} }), { ok: true, columns: { room: "small", needs: { why: "", domains: [], folders: [], programs: [], sol: [], keys: [], tools: [], every: [], screen: false, provides: [] }, stores: [], hears: null } }, "an empty needs asks nothing and needs no why");
});

test("hearsKind and dataPlace, pure: who hears what, and where a name lives", () => {
  const engine = { person: "engine" }, seat = { person: "seat", agent: "claude" };
  assert.equal(hearsKind({ hears: null }, { kind: "plugin.load", by: engine, item: "x" }), true);
  assert.equal(hearsKind({ hears: null }, { kind: "seat.turn", by: seat }), false, "a seat's own kinds are not handed to a block that wrote no hears");
  assert.equal(hearsKind({ hears: null }, { kind: "seat.step", by: seat }), false, "a seat's step through its own tools neither");
  assert.equal(hearsKind({ hears: null }, { kind: "tool.call", by: seat, item: "week" }), true, "a seat's step through a block's tool names the block: a block event, as before");
  assert.equal(hearsKind({ hears: null }, { kind: "plugin.trouble", by: engine, item: "x" }), false);
  assert.equal(hearsKind({ hears: ["seat.turn"] }, { kind: "seat.turn", by: seat }), true);
  assert.equal(hearsKind({ hears: ["seat.turn"] }, { kind: "plugin.load", by: engine, item: "x" }), false, "a list is exactly the list");
  assert.equal(hearsKind({ hears: [] }, { kind: "plugin.load", by: engine, item: "x" }), false);
  assert.equal(hearsKind({ hears: ["plugin.load"] }, { kind: "plugin.trouble", by: engine, item: "x" }), false, "trouble, never");
  const rec = { reads: ["calendar.week", "week/seen"], writes: ["week.note"] };
  assert.deepEqual(dataPlace("me", rec, { stores: ["drafts"] }, "read", "drafts"), { ok: true, owner: "me", name: "drafts" });
  assert.deepEqual(dataPlace("me", rec, { stores: ["drafts"] }, "write", "drafts"), { ok: true, owner: "me", name: "drafts" });
  assert.deepEqual(dataPlace("me", rec, { stores: ["drafts"] }, "write", "me/drafts"), { ok: true, owner: "me", name: "drafts" });
  assert.deepEqual(dataPlace("me", rec, { stores: ["drafts"] }, "read", "calendar.week"), { ok: true, owner: null, name: "calendar.week" });
  assert.deepEqual(dataPlace("me", rec, { stores: ["drafts"] }, "read", "week/seen"), { ok: true, owner: "week", name: "seen" });
  assert.match((dataPlace("me", rec, { stores: [] }, "write", "week/seen") as { why: string }).why, /week's own data: only week writes it/);
  assert.match((dataPlace("me", rec, { stores: [] }, "read", "week/other") as { why: string }).why, /not among the reads/);
  assert.match((dataPlace("me", rec, { stores: [] }, "read", "me/drafts") as { why: string }).why, /not among the data it stores \(none\)/);
  assert.match((dataPlace("me", rec, { stores: [] }, "write", "calendar.week") as { why: string }).why, /not among the writes/);
  assert.match((dataPlace("me", rec, { stores: [] }, "read", "../x") as { why: string }).why, /is not a name/);
});

test("hears: a block that wrote none hears the block kinds and none of a seat's; one that named kinds hears exactly those, a seat's included", async () => {
  const h = home();
  // loaded by id: aged first (it hears the two loads after it), ear second (it hears quiet's load), quiet last
  block(h, "aged", `export default (sol) => { sol.listen((e) => sol.log("heard " + e.kind)); };`);
  block(h, "ear", `export default (sol) => { sol.listen((e) => { sol.log("heard " + e.kind + (e.value && e.value.session ? " " + e.value.session : "")); }); };`, { hears: ["seat.turn", "seat.done", "plugin.load"] });
  block(h, "quiet", `export default (sol) => { sol.listen((e) => sol.log("heard " + e.kind)); };`, { hears: [] });
  // hearing a seat is on the card (step 4): a person pressed ear's before it loads
  const ask = askOf((columnsOf({ hears: ["seat.turn", "seat.done", "plugin.load"] }) as { columns: Columns }).columns);
  writePress(join(h, "app"), h, "ear", ask, printOf(ask, ""), 0);
  const k = new Kernel(h, lab(h));
  await k.sync();
  k.seat("seat.turn", "claude", { session: "s1", model: "m" });
  k.seat("seat.step", "claude", { session: "s1", tool: "Read" });
  k.seat("seat.done", "claude", { session: "s1", ok: true });
  k.append("undo.did", "aged", { from: 2, to: 1 });
  await wait(150);
  const aged = said(k, "aged");
  assert.equal(aged.filter((x) => x === "heard plugin.load").length, 3, "every load after its start, its own included, as before");
  assert.ok(aged.includes("heard undo.did") && aged.includes("heard plugin.line"), "the block kinds, as before: " + aged.join(", "));
  assert.ok(!aged.some((x) => /heard seat\.(turn|step|done)/.test(x)), "and none of a seat's own");
  const ear = said(k, "ear");
  assert.deepEqual(ear, ["heard plugin.load", "heard plugin.load", "heard seat.turn s1", "heard seat.done s1"], "exactly what it named: its own load and quiet's, the turn, the done; not the step, the lines or the undo");
  assert.deepEqual(said(k, "quiet"), [], "an empty list hears nothing");
  assert.equal(k.state("ear")?.room, undefined, "a small room says nothing of it");
  await k.stop();
});

test("stores: a block's own data lives under home/data/<id>/, without naming it in reads or writes; another block reads it as <id>/<name>, nobody else writes it", async () => {
  const h = home();
  block(h, "keeper", `export default (sol) => {
    sol.tool({ name: "put", args: { n: "number" }, run: ({ n }) => { sol.write("drafts", { n }); return "ok"; } });
    sol.tool({ name: "get", run: () => JSON.stringify(sol.read("drafts")) });
    sol.tool({ name: "pool", run: () => { sol.write("shared.note", 1); return "ok"; } });
  };`, { stores: ["drafts"], writes: ["shared.note"] });
  block(h, "reader", `export default (sol) => {
    sol.tool({ name: "peek", run: () => JSON.stringify(sol.read("keeper/drafts")) });
    sol.tool({ name: "scrawl", run: () => sol.write("keeper/drafts", 0) });
    sol.tool({ name: "other", run: () => JSON.stringify(sol.read("keeper/secrets")) });
  };`, { reads: ["keeper/drafts"] });
  const k = new Kernel(h, lab(h));
  await k.sync();
  assert.equal(((await k.runTool(toolName("keeper", "put"), { n: 7 })).content[0] as { text: string }).text, "ok");
  assert.ok(existsSync(join(h, "data", "keeper", "drafts.json")), "under its own folder");
  assert.ok(!existsSync(join(h, "data", "drafts.json")), "not in the shared pool");
  assert.deepEqual(JSON.parse(readFileSync(join(h, "data", "keeper", "drafts.json"), "utf8")), { n: 7 });
  assert.equal(((await k.runTool(toolName("keeper", "get"), {})).content[0] as { text: string }).text, '{"n":7}');
  assert.equal(((await k.runTool(toolName("reader", "peek"), {})).content[0] as { text: string }).text, '{"n":7}', "another block reads it by <id>/<name>");
  const scrawl = await k.runTool(toolName("reader", "scrawl"), {});
  assert.equal(scrawl.isError, true);
  assert.match((scrawl.content[0] as { text: string }).text, /keeper's own data: only keeper writes it/);
  assert.match(((await k.runTool(toolName("reader", "other"), {})).content[0] as { text: string }).text, /not among the reads/);
  assert.equal(((await k.runTool(toolName("keeper", "pool"), {})).content[0] as { text: string }).text, "ok");
  assert.ok(existsSync(join(h, "data", "shared.note.json")), "the shared pool as before");
  const writes = k.since().filter((e) => e.kind === "plugin.write").map((e) => e.value);
  assert.deepEqual(writes, [{ what: "drafts", own: true }, { what: "shared.note" }]);
  assert.deepEqual(k.since().filter((e) => e.kind === "plugin.refused").map((e) => (e.value as { what: string }).what), ["keeper/drafts", "keeper/secrets"]);
  // its own, spelled with its id: the same file, the same line on the log (the bare name, own)
  block(h, "self", `export default (sol) => { sol.tool({ name: "w", run: () => { sol.write("self/notes", 1); sol.write("notes", 2); return JSON.stringify(sol.read("self/notes")); } }); };`, { stores: ["notes"] });
  await k.sync();
  assert.equal(((await k.runTool(toolName("self", "w"), {})).content[0] as { text: string }).text, "2");
  assert.deepEqual(k.since().filter((e) => e.kind === "plugin.write" && e.item === "self").map((e) => e.value), [{ what: "notes", own: true }, { what: "notes", own: true }]);
  assert.deepEqual(JSON.parse(readFileSync(join(h, "data", "self", "notes.json"), "utf8")), 2);
  // another's own data must still be stored by a block that is here
  block(h, "nosy", `export default (sol) => { sol.tool({ name: "a", run: () => JSON.stringify(sol.read("keeper/gone")) }); sol.tool({ name: "b", run: () => JSON.stringify(sol.read("ghost/x")) }); };`, { reads: ["keeper/gone", "ghost/x"] });
  await k.sync();
  assert.match(((await k.runTool(toolName("nosy", "a"), {})).content[0] as { text: string }).text, /keeper does not store gone \(drafts\)/);
  assert.match(((await k.runTool(toolName("nosy", "b"), {})).content[0] as { text: string }).text, /there is no block ghost/);
  await k.stop();
});

test("room: big waits for a person's press, said in its place; a column that does not hold breaks the block with why; the week from #630 loads as it did", async () => {
  const h = home();
  cpSync(join(FIX, "things"), join(h, "things"), { recursive: true });
  copyFileSync(join(FIX, "kernel", "engine.js"), join(h, "things", "week", "engine.js"));
  mkdirSync(join(h, "data"));
  writeFileSync(join(h, "data", "calendar.week.json"), JSON.stringify({ mon: 6 }));
  block(h, "wide", `export default (sol) => { sol.tool({ name: "x", run: () => "x" }); };`, { room: "big", needs: { why: "to file issues on GitHub", domains: ["api.github.com"], programs: ["gh"], keys: ["github"], tools: [{ name: "file" }] } });
  block(h, "typo", `export default () => {};`, { hears: ["turns"] });
  const k = new Kernel(h, lab(h));
  await k.sync();
  assert.deepEqual(k.state("week"), { state: "loaded", v: 1, tools: ["thing_week_free"] }, "a record from before: as it did, nothing added");
  assert.equal(((await k.runTool("thing_week_free", { day: "mon" })).content[0] as { text: string }).text, "mon: 6 free hours");
  assert.equal(k.state("wide")?.state, "broken");
  assert.match(k.state("wide")?.why ?? "", WAITS, "the big room is built (step 3); nobody pressed this one");
  assert.equal(k.state("wide")?.room, "big");
  assert.deepEqual(k.tools().map((t) => t.block), ["week"], "a waiting block offers no tool yet");
  assert.match(k.state("typo")?.why ?? "", /hears names "turns", which is not a kind a block can hear/);
  // undo refuses, with why, and the record is not touched: wide has one version, typo's columns do not hold
  const before = readFileSync(join(h, "things", "wide", "record.json"), "utf8");
  const u = await k.undo("wide");
  assert.equal(u.ok, false);
  assert.match((u as { why: string }).why, /version 1 is its first/);
  assert.match(((await k.undo("typo")) as { why: string }).why, /a version back does not mend the record/);
  assert.equal(readFileSync(join(h, "things", "wide", "record.json"), "utf8"), before);
  await k.sync(); await k.sync();
  assert.equal(k.since().filter((e) => e.kind === "plugin.broken" && e.item === "wide").length, 1, "a waiting block is said once, not at every look");
  await k.stop();
});

test("two blocks answering each other's lines would ring forever: the one that writes more than a hundred lines in a second is broken, with that reason, and the ring stops", async () => {
  const h = home();
  for (const id of ["ping", "pong"]) block(h, id, `export default (sol) => { sol.listen((e) => { if (e.kind === "plugin.line") sol.log("echo"); }); sol.tool({ name: "go", run: () => { sol.log("start"); return "ok"; } }); };`);
  const k = new Kernel(h, lab(h));
  await k.sync();
  await k.runTool(toolName("ping", "go"), {});
  // until one is broken: 1.5 s here, longer on a busy runner (CI shares one machine), 15 s at most
  for (let t = 0; t < 15_000 && !k.since().some((e) => e.kind === "plugin.broken"); t += 100) await wait(100);
  await wait(300);   // what the other block still had in hand
  const broken = k.since().filter((e) => e.kind === "plugin.broken");
  assert.ok(broken.length >= 1, "at least one of the two is broken");
  assert.match((broken[0].value as { why: string }).why, new RegExp(`more than ${LINES_A_SECOND} lines in a second`));
  // after the first break only what the other block still had in hand (a second's worth at most), however slow the ring was
  const lines = k.since(broken[0].seq).filter((e) => e.kind === "plugin.line").length;
  assert.ok(lines <= LINES_A_SECOND + 10, `the ring stopped ${lines} lines after the first break`);
  const mark = k.lastSeq();
  await wait(500);
  assert.equal(k.since(mark).length, 0, "and nothing goes on");
  await k.stop();
});
