// The event format v1 (the v2 backend design §6, step 0a): the kinds' registry (src/contract/kinds.ts), the event's
// body and its id, the value files and erase, fsync for "about to do", the v0 lines read through the registry's old
// names, `hears` read from the registry, and the two lines an engine writes at its start. One test for each line of
// the unit's claim, numbered as the claim is. Every folder is the test's own: the homes, Sol's folder (SOL_APPDIR) and
// the log (SOL_LOGDIR) are set before anything is imported.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs, { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync, rmSync, cpSync, copyFileSync, realpathSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { canonical, hashOf } from "../src/canonical.ts";   // the one canonical JSON, the log's ids must be made with it
import { canonical as trailCanonical, hashOf as trailHashOf } from "../src/team/v3/trail.ts";   // the team trail's: the same function
import { memoryTrail, type Ev } from "../src/file-trail.ts";   // what wrote a v0 line
import { KINDS, KINDS_PRINT, HEARD, kindRow, isKind, fits, placeOf, nameOfOld } from "../src/contract/kinds.ts";
import { dayTrail, readLog, verifyLog, logFiles, valueFile, bodyOf, idOf, dayOf, type LogEv, type OldEv } from "../src/log.ts";
import { columnsOf, hearsKind, HEARD_KINDS } from "../src/record.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "sol-event-format-")));
after(() => rmSync(root, { recursive: true, force: true }));
process.env.SOL_APPDIR = join(root, "app");
process.env.SOL_LOGDIR = join(root, "engine-log");
const { syncKernel, kernelNow } = await import("../src/kernel.ts");
const { Kernel } = await import("./kernels.ts");

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ENGINE, "src");
const FIX = join(ENGINE, "..", "design/system/fixtures");
let n = 0;
/** a folder of the test's own */
const dir = (name: string) => join(root, `${name}-${++n}`);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const ENG = { person: "engine" };
const lines = (file: string): Record<string, unknown>[] => readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
/** every line of a log folder as it stands on disk */
const raw = (d: string) => logFiles(d).flatMap(lines);
/** every byte under a folder, as one text */
const everything = (d: string): string => readdirSync(d).map((x) => { const p = join(d, x); return statSync(p).isDirectory() ? everything(p) : readFileSync(p, "utf8"); }).join("\n");
/** the names a kind had before v1 that the unit's claim lists: none is written any more */
const BARE = ["load", "release", "broken", "unload", "line", "trouble", "write", "data", "refused", "suspect", "pressed", "off", "factory", "run", "fetch", "wake", "sleep", "seat", "step", "undo", "turn", "done", "sent"];
const NAME = /^[a-z]+\.[a-z]+$/;
/** a home with the week from #630 and its engine half (kernel.test.ts's) */
function home() {
  const h = dir("home");
  cpSync(join(FIX, "things"), join(h, "things"), { recursive: true });
  copyFileSync(join(FIX, "kernel", "engine.js"), join(h, "things", "week", "engine.js"));
  mkdirSync(join(h, "data"));
  writeFileSync(join(h, "data", "calendar.week.json"), JSON.stringify({ mon: 6, sat: 9 }));
  return h;
}

test("1. a kind with no row in the registry cannot be written to the log", async () => {
  const d = dir("log");
  const log = dayTrail(d);
  for (const kind of ["gossip.told", "plugin.gossip", "gate.asked", "load", "step", "turn", "", "Plugin.Load"]) {
    assert.equal(isKind(kind), false, `${kind} has no row`);
    assert.throws(() => log.append({ by: ENG, kind, item: "x", value: { v: 1 } }), /the log takes no ".*": a kind is written once it has its row in contract\/kinds\.ts/, `${kind} is refused`);
  }
  assert.equal(log.last(), 0, "a refused write takes no seq");
  assert.deepEqual(logFiles(d), [], "and writes no file");
  assert.equal(existsSync(d), false, "not even the folder");
  const e = log.append({ by: ENG, kind: "plugin.load", item: "x", value: { v: 1 } });
  assert.equal(e.seq, 1, "a registered kind is written, and takes the first seq");
  assert.equal(raw(d).length, 1);

  // the kernel's two doors into the log refuse the same way, and nothing is handed on
  const h = dir("home");
  mkdirSync(join(h, "things"), { recursive: true });
  const k = new Kernel(h, { logDir: join(h, "lab-log"), appDir: join(h, "app") });
  assert.throws(() => k.append("load", "x", { v: 1 }), /the log takes no "load"/);
  assert.throws(() => k.append("gossip.told"), /the log takes no "gossip\.told"/);
  assert.throws(() => k.seat("turn" as never, "claude", { session: "s1" }), /the log takes no "turn"/);
  assert.deepEqual(k.since(), []);
  assert.equal(k.lastSeq(), 0);
  await k.stop();
});

test("2. every kind the engine writes is family.action and has its row; no old bare name is written", () => {
  // the registry: every row is family.action, its family the part before the dot, no name twice, none of the old names
  assert.ok(KINDS.length >= 30);
  assert.equal(new Set(KINDS.map((r) => r.kind)).size, KINDS.length, "no kind has two rows");
  for (const r of KINDS) {
    assert.match(r.kind, NAME, `${r.kind} is family.action`);
    assert.equal(r.family, r.kind.split(".")[0]);
    assert.ok(!BARE.includes(r.kind));
    assert.equal(kindRow(r.kind), r);
  }
  // the old names, each to the name the unit decided (the registry's old-name column)
  const seat = { person: "seat", agent: "claude" }, block = { person: "engine", agent: "week" };
  const was = (kind: string, more: Partial<Ev> = {}) => nameOfOld({ kind, by: ENG, ...more });
  for (const same of ["load", "release", "broken", "unload", "line", "trouble", "write", "data", "refused", "suspect", "off", "factory", "wake", "sleep", "seat"]) assert.equal(was(same, { item: "week" }), `plugin.${same}`);
  assert.equal(was("pressed", { item: "week" }), "plugin.approve");
  assert.equal(was("run", { item: "week", by: block }), "plugin.ran");
  assert.equal(was("fetch", { item: "week", by: block }), "plugin.fetched");
  assert.equal(was("undo", { item: "week" }), "undo.did");
  assert.equal(was("step", { by: seat, item: "week", value: { tool: "free" } }), "tool.call", "a seat's step through a block's tool");
  assert.equal(was("step", { by: seat, value: { session: "s1", tool: "Read" } }), "seat.step", "a seat's own step");
  assert.equal(was("step", { by: block, item: "week", value: { tool: "page_read", out: true } }), "plugin.called", "a big room's call of one of Sol's tools");
  assert.equal(was("turn", { by: seat }), "seat.turn");
  assert.equal(was("done", { by: seat }), "seat.done");
  assert.equal(was("sent", { by: seat }), "seat.sent");
  assert.equal(was("key", { by: { person: "person" }, item: "github", value: { op: "pasted", hosts: ["api.github.com"] } }), "key.pasted");
  assert.equal(was("key", { by: { person: "person" }, item: "github", value: { op: "removed" } }), "key.removed");
  assert.equal(was("gossip"), null, "a name no row knows");
  for (const old of BARE) assert.ok(KINDS.some((r) => r.old === old), `${old} is some row's old name`);

  // the writers. The log is opened in two places only (log.ts makes it, the kernel holds it), and written through the
  // kernel's two doors: append() and seat()
  const walk = (d: string): string[] => readdirSync(d).flatMap((x) => { const p = join(d, x); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : []; });
  const all = walk(SRC), text = (f: string) => readFileSync(f, "utf8"), short = (f: string) => relative(SRC, f);
  assert.deepEqual(all.filter((f) => /\b(openLog|dayTrail)\(/.test(text(f))).map(short).sort(), ["kernel.ts", "log.ts"], "only the kernel opens the log");
  assert.deepEqual(all.filter((f) => /\.log\.(append|erase)\(/.test(text(f))).map(short), ["kernel.ts"], "only the kernel writes on it");
  const kernel = text(join(SRC, "kernel.ts"));
  assert.equal(kernel.match(/this\.log\.append\(/g)?.length, 2, "append() and seat(), no third door");
  // every file that can reach the kernel or the log, and the big room (it writes through the kernel's `note`)
  const reach = all.filter((f) => /from "(?:\.\.?\/)+(?:kernel|log|seatlog)\.js"/.test(text(f)) || ["kernel.ts", "log.ts", "bigroom.ts", "seatlog.ts"].includes(short(f)));
  for (const must of ["index.ts", "kernel.ts", "log.ts", "bigroom.ts", "seatlog.ts", join("work", "runs.ts")]) assert.ok(reach.map(short).includes(must), `${must} is walked`);
  const written = new Set<string>(), notLiteral: string[] = [];
  for (const f of reach) {
    const t = text(f);
    // a call of append(, seat(, note( on something, or of seatlog.ts's own line(; and the kind log.ts writes itself
    const calls = [...t.matchAll(/\.(?:append|seat|note)\(\s*("[^"]*"|[^,)\n]{0,40})/g)].map((m) => m[1].trim());
    const lined = short(f) === "seatlog.ts" ? [...t.matchAll(/(?<![.\w])line\(\s*("[^"]*"|[^,)\n]{0,40})/g)].map((m) => m[1].trim()) : [];
    const own = short(f) === "log.ts" ? [...t.matchAll(/\bappend\(\{[^}]*\bkind: ("[^"]*")/g)].map((m) => m[1]) : [];
    for (const c of [...calls, ...lined, ...own]) {
      if (c.startsWith('"')) written.add(c.slice(1, -1));
      else notLiteral.push(`${short(f)}: ${c}`);
    }
  }
  // what is not a name written out: the two doors themselves, the one line that passes a name on to each, and the two
  // callers that are not the log's (a relay's and a run's own `note`)
  assert.deepEqual(notLiteral.sort(), [
    "kernel.ts: kind",                          // note(kind: "plugin.wake" | "plugin.sleep"): bigroom.ts's two calls, walked above
    "kernel.ts: { by",                          // this.log.append({ by, kind, ... }) in append()
    'kernel.ts: { by: { person: "seat"',        // this.log.append({ by: ..., kind, ... }) in seat()
    "seatlog.ts: kind",                         // line(kind: SeatKind): its four callers, walked above
    "seatlog.ts: kind: SeatKind",               // line's own declaration
    join("work", "runs.ts") + ": a",            // Run.note(a): a run's own note, not the log
    join("home", "log.ts") + ": w.kind",        // Home's one door (#790): its kinds through the kernel's append, every one a row
    "way-own.ts: d.kind",                       // a person's own ways' one door (4c): way.* drafts through the kernel's append, every one a row
  ].sort());
  assert.equal(text(join(SRC, "home", "log.ts")).match(/\bk\.append\(/g)?.length, 1, "Home writes through the kernel's append, once, nowhere else");
  assert.equal(text(join(SRC, "way-own.ts")).match(/\.append\(/g)?.length, 1, "a person's own ways write through the kernel's append, once, nowhere else");
  assert.match(text(join(SRC, "way-own.ts")), /door\.append\(d\.kind, d\.item, written\(d, ids\)/, "and only a way's drafts, each a way.* kind with its row");
  assert.match(kernel, /note: \(kind, value\) => \{[^}]*this\.append\(kind, b\.id, value\)/s, "the one name passed on in the kernel is the big room's note");
  assert.match(text(join(SRC, "bigroom.ts")), /note\(kind: "plugin\.wake" \| "plugin\.sleep", value/, "which takes two kinds only");
  for (const kind of written) {
    assert.match(kind, NAME, `${kind} is family.action`);
    assert.ok(isKind(kind), `${kind} has its row`);
    assert.ok(!BARE.includes(kind), `${kind} is no old name`);
  }
  // and the other way: every row the kernel or the shell writes today has its writer (a row with none would be a name nobody keeps)
  assert.deepEqual([...written].sort(), KINDS.filter((r) => r.who === "kernel" || r.who === "shell").map((r) => r.kind).sort());
  // the log itself refuses each old name
  const log = dayTrail(dir("log"));
  for (const old of BARE) assert.throws(() => log.append({ by: ENG, kind: old, item: "x" }), /the log takes no/, `${old} is refused`);
});

test("3. an event is the v1 body of the design's §6.1; its id is the SHA-256 of the canonical body, covering neither value nor seq; canonical() is the team trail's", async () => {
  const d = dir("log");
  let at = new Date(2026, 10, 9, 23, 59, 0).getTime();
  const log = dayTrail(d, () => at);
  const a = log.append({ by: ENG, kind: "plugin.load", item: "week", value: { v: 1, engine: "engine.js" } });
  const b = log.append({ by: { person: "engine", agent: "week" }, kind: "plugin.line", item: "week", value: { line: "the week is read" }, via: { plugin: "week", pv: 1, pkg: "p".repeat(64) }, cause: a.id, ctx: { session: "s1", run: "r1", turn: "t1" }, mode: "replay", field: "note" });
  at += 5 * 60_000;   // the next day
  const c = log.append({ by: ENG, kind: "plugin.off", item: "week" });
  const on = raw(d) as (LogEv & Record<string, unknown>)[];
  assert.equal(logFiles(d).length, 2, "two days");
  assert.deepEqual(on.map((l) => l.id), [a.id, b.id, c.id]);

  // the body's fields, and the four outside it
  const BODY = ["v", "project", "by", "via", "kind", "kv", "item", "field", "hash", "at", "prev", "cause", "ctx", "mode", "ignorable"];
  const OUTSIDE = ["id", "seq", "value", "erased"];
  for (const l of on) {
    for (const f of Object.keys(l)) assert.ok([...BODY, ...OUTSIDE].includes(f), `${f} is a field of the design's event`);
    for (const f of ["v", "project", "by", "kind", "hash", "at", "prev", "id", "seq"]) assert.ok(f in l, `every event has ${f}`);
    assert.equal(l.v, 1);
    assert.equal(l.project, "home");
  }
  assert.deepEqual(Object.keys(on[0]).sort(), ["at", "by", "hash", "id", "item", "kind", "prev", "project", "seq", "v", "value"]);
  assert.deepEqual(Object.keys(on[1]).sort(), ["at", "by", "cause", "ctx", "field", "hash", "id", "ignorable", "item", "kind", "mode", "prev", "project", "seq", "v", "via"], "free text: no value on the line");
  assert.deepEqual(Object.keys(on[2]).sort(), ["at", "by", "hash", "id", "item", "kind", "prev", "project", "seq", "v"]);
  assert.deepEqual([on[1].via, on[1].cause, on[1].ctx, on[1].mode, on[1].field, on[1].ignorable], [{ plugin: "week", pv: 1, pkg: "p".repeat(64) }, a.id, { session: "s1", run: "r1", turn: "t1" }, "replay", "note", true]);
  assert.equal(on[0].ignorable, undefined, "a load is not ignorable: its row does not say so");
  assert.ok(kindRow("plugin.line")!.ignorable && !kindRow("plugin.load")!.ignorable);

  // the id: the SHA-256 of the canonical body, computed here with the team trail's canonical(), from the line on disk
  for (const l of on) {
    const { id, seq, value, erased, ...body } = l;
    assert.equal(id, sha(canonical(body)), "id = sha256(canonical(body))");
    assert.equal(idOf(bodyOf(l)), id);
    assert.ok(!("value" in bodyOf(l)) && !("seq" in bodyOf(l)) && !("id" in bodyOf(l)) && !("erased" in bodyOf(l)));
    void seq; void value; void erased;
  }
  // it covers neither the value nor seq (nor erased), and it does cover every field of the body
  assert.equal(idOf(bodyOf({ ...a, seq: 42, value: { other: 1 }, erased: true })), a.id);
  for (const change of [{ kind: "plugin.unload" }, { item: "weak" }, { at: a.at + 1 }, { prev: "x" }, { hash: "" }, { by: { person: "person" } }, { cause: "x" }, { ctx: { session: "s2" } }, { via: { plugin: "week", pv: 2, pkg: "" } }, { mode: "record" as const }, { ignorable: true as const }, { field: "f" }, { kv: 2 }])
    assert.notEqual(idOf({ ...bodyOf(a), ...change }), a.id, `the id covers ${Object.keys(change)[0]}`);
  // hash: the value's, "" when there is none; prev: the event before it, "" for the first, across the day's end
  assert.equal(a.hash, sha(canonical({ v: 1, engine: "engine.js" })));
  assert.equal(b.hash, sha(canonical({ line: "the week is read" })));
  assert.equal(c.hash, "");
  assert.deepEqual([a.prev, b.prev, c.prev], ["", a.id, b.id]);
  assert.deepEqual([a.seq, b.seq, c.seq], [1, 2, 3]);
  assert.ok(on.every((l) => l.kv === undefined), "kv is written once a row's is past 1: none is yet");

  // canonical() is shared, not copied: the team trail exports the very function the log imports (one function object),
  // defined once, outside team/v3 (nothing may load a v3 module with Cowork v3's switch off: v3-off.test.ts)
  assert.equal(trailCanonical, canonical, "team/v3/trail.ts's canonical is the log's, the same function");
  assert.equal(trailHashOf, hashOf, "and so is its hashOf");
  const logTs = readFileSync(join(SRC, "log.ts"), "utf8");
  assert.match(logTs, /import \{[^}]*\bcanonical\b[^}]*\} from "\.\/canonical\.js"/);
  assert.match(readFileSync(join(SRC, "team", "v3", "trail.ts"), "utf8"), /import \{ canonical, hashOf \} from "\.\.\/\.\.\/canonical\.js"/);
  const defines = (d: string): string[] => readdirSync(d).flatMap((x) => { const p = join(d, x); return statSync(p).isDirectory() ? defines(p) : p.endsWith(".ts") && /(function|const|let) canonical\b/.test(readFileSync(p, "utf8")) ? [relative(SRC, p)] : []; });
  // (team/v3/trailport.ts, Cowork v3's own port, has had a copy of its own since before the log: v3's, left as it is)
  assert.deepEqual(defines(SRC).filter((f) => f !== join("team", "v3", "trailport.ts")), ["canonical.ts"], "one canonical for the log and the team trail, none of the log's own");

  // through the kernel: what a block did itself and a seat's call through its tool say `via`; the kernel's own lines do not
  const h = home();
  const k = new Kernel(h, { logDir: join(h, "lab-log"), appDir: join(h, "app") });
  await k.sync();
  await k.runTool("thing_week_free", { day: "sat" }, "claude");
  const evs = k.since() as LogEv[];
  assert.deepEqual(evs.map((e) => e.kind), ["plugin.line", "plugin.load", "tool.call"]);
  const [line, load, call] = evs;
  assert.deepEqual({ ...line.via, pkg: "" }, { plugin: "week", pv: 1, pkg: "" });
  assert.match(line.via!.pkg, /^[0-9a-f]{64}$/);
  assert.equal(load.via, undefined, "the kernel's own line");
  assert.deepEqual(call.via, line.via, "the same block, the same version, the same print");
  assert.deepEqual(call.by, { person: "seat", agent: "claude" });
  for (const e of evs) { assert.equal(e.id, sha(canonical(bodyOf(e)))); assert.equal(fits(e.kind, e.value), null, `${e.kind}'s value is what its row says it carries`); }
  await k.stop();
  assert.equal(verifyLog(join(h, "lab-log")).ok, true);
});

test("4. free text lives in a value file; log.erase removes a content and the chain still verifies", async () => {
  const d = dir("log");
  const log = dayTrail(d);
  const words = "meet Marco at the harbour at nine";
  const load = log.append({ by: ENG, kind: "plugin.load", item: "week", value: { v: 1 } });
  const said = log.append({ by: { person: "engine", agent: "week" }, kind: "plugin.line", item: "week", value: { line: words } });
  const again = log.append({ by: { person: "engine", agent: "week" }, kind: "plugin.line", item: "week", value: { line: words } });
  const other = log.append({ by: ENG, kind: "plugin.broken", item: "week", value: { why: "it threw: no such file /Users/me/plan.txt" } });
  const [day] = logFiles(d);

  // where each value is: no free text, on the line and in no file; free text, in values/<hash>.json and not on the line
  assert.equal(placeOf("plugin.load", { v: 1 }), "line");
  assert.equal(placeOf("plugin.line", { line: words }), "file");
  assert.equal(placeOf("plugin.off", undefined), "none");
  assert.equal(placeOf("plugin.load", { v: "one" }), "file", "a value that is not what its row carries is kept as free text");
  assert.deepEqual(lines(day)[0].value, { v: 1 });
  assert.equal(existsSync(valueFile(d, load.hash)), false);
  assert.ok(!("value" in lines(day)[1]), "the line holds no value");
  assert.ok(!readFileSync(day, "utf8").includes("harbour") && !readFileSync(day, "utf8").includes("plan.txt"), "nor any of its words");
  assert.equal(valueFile(d, said.hash), join(d, "values", `${said.hash}.json`));
  const kept = readFileSync(valueFile(d, said.hash), "utf8");
  assert.equal(kept, canonical({ line: words }), "the file's text is the value's canonical JSON");
  assert.equal(sha(kept), said.hash, "so its SHA-256 is its name");
  assert.equal(again.hash, said.hash);
  assert.deepEqual(readdirSync(join(d, "values")).sort(), [`${said.hash}.json`, `${other.hash}.json`].sort(), "the same content is one file");
  // read back: the value is on the event again (this engine, the next one, and a plain read of the folder)
  assert.deepEqual(log.since("home").map((e) => e.value), [{ v: 1 }, { line: words }, { line: words }, { why: "it threw: no such file /Users/me/plan.txt" }]);
  assert.deepEqual(dayTrail(d).since("home").map((e) => e.value), log.since("home").map((e) => e.value));
  assert.deepEqual(readLog(d).map((e) => e.value), log.since("home").map((e) => e.value));
  assert.deepEqual(verifyLog(d), { ok: true, events: 4, old: 0, erased: 0, bad: [] });

  // what cannot be erased: a value on its line, an event that is not there, one with no content
  assert.throws(() => log.erase(load.id, { person: "person" }), /its content is on its line, with no free text in it: there is nothing to erase/);
  assert.throws(() => log.erase("f".repeat(64), { person: "person" }), /the log has no event f{64}/);
  const off = log.append({ by: ENG, kind: "plugin.off", item: "week" });
  assert.throws(() => log.erase(off.id, { person: "person" }), /the event carries no content/);

  // erase: the file goes, one log.erase line says which event and who, no line before it is touched
  const before = readFileSync(day, "utf8"), ids = log.since("home").map((e) => e.id);
  const gone = log.erase(said.id, { person: "person" });
  assert.equal(gone.kind, "log.erase");
  assert.equal(gone.item, said.id);
  assert.deepEqual(gone.value, { hash: said.hash });
  assert.deepEqual(gone.by, { person: "person" });
  assert.equal(gone.prev, off.id, "it is the next link of the chain");
  assert.equal(existsSync(valueFile(d, said.hash)), false, "the value file is gone");
  assert.ok(!everything(d).includes("harbour"), "the words are nowhere under the log's folder");
  const now = readFileSync(day, "utf8");
  assert.ok(now.startsWith(before), "every line written before stands as it was");
  assert.equal(now.slice(before.length).trim().split("\n").length, 1, "one line more");
  assert.deepEqual(log.since("home").slice(0, ids.length).map((e) => e.id), ids, "every id stands");
  // the events that carried it say so, here and for the next engine; the other content is untouched
  for (const read of [log.since("home"), dayTrail(d).since("home"), readLog(d)]) {
    const [, s, a, o] = read as LogEv[];
    assert.deepEqual([s.erased, a.erased, "value" in s, "value" in a], [true, true, false, false], "erased for every event that carried it");
    assert.deepEqual(o.value, { why: "it threw: no such file /Users/me/plan.txt" });
    assert.equal(o.erased, undefined);
    assert.equal(s.id, said.id);
  }
  // and the chain still verifies: every id is its body's, every prev the event before, the erased ones still held by their hash
  assert.deepEqual(verifyLog(d), { ok: true, events: 6, old: 0, erased: 2, bad: [] });
  assert.throws(() => log.erase(said.id, { person: "person" }), /its content is already erased/);
  assert.throws(() => dayTrail(d).erase(again.id, { person: "person" }), /its content is already erased/);

  // verifyLog is a check, not a yes: a content changed, a line changed, a line taken out, each is found
  const t1 = dir("log"), t2 = dir("log"), t3 = dir("log");
  for (const t of [t1, t2, t3]) cpSync(d, t, { recursive: true });
  writeFileSync(valueFile(t1, other.hash), canonical({ why: "nothing happened" }));
  assert.deepEqual(verifyLog(t1).bad.map((b) => [b.seq, b.why]), [[other.seq, "content"]]);
  const f2 = logFiles(t2)[0];
  writeFileSync(f2, readFileSync(f2, "utf8").replace('"item":"week"', '"item":"weak"'));
  assert.deepEqual(verifyLog(t2).bad.map((b) => [b.seq, b.why]), [[1, "id"]]);
  const f3 = logFiles(t3)[0];
  writeFileSync(f3, readFileSync(f3, "utf8").split("\n").filter((_, i) => i !== 1).join("\n"));
  assert.deepEqual(verifyLog(t3).bad.map((b) => [b.seq, b.why]), [[3, "chain"]]);
  assert.equal(verifyLog(t3).ok, false);

  // through the kernel: a block's line is free text; a person erases it; the log verifies
  const h = home();
  const k = new Kernel(h, { logDir: join(h, "lab-log"), appDir: join(h, "app") });
  await k.sync();
  const line = k.since().find((e) => e.kind === "plugin.line") as LogEv;
  assert.ok(existsSync(valueFile(join(h, "lab-log"), line.hash)));
  const text = JSON.stringify(line.value);
  assert.ok(!existsSync(join(h, "log", "log.jsonl")), "nothing at the old place in the home");
  const e = k.erase(line.id);
  assert.deepEqual([e.kind, e.item, e.by], ["log.erase", line.id, { person: "person" }]);
  assert.equal(k.lastSeq(), e.seq);
  assert.equal((k.since().find((x) => x.id === line.id) as LogEv).erased, true);
  assert.equal(existsSync(valueFile(join(h, "lab-log"), line.hash)), false);
  await k.stop();
  assert.equal(verifyLog(join(h, "lab-log")).ok, true);
  assert.equal(verifyLog(join(h, "lab-log")).erased, 1);
});

test("5. \"about to do\" (run.about, rung.asked) is fsynced: on the disk before append returns, and there after a SIGKILL", async () => {
  const marked = KINDS.filter((r) => r.fsync).map((r) => r.kind);
  assert.deepEqual(marked.sort(), ["log.erase", "run.about", "rung.asked"]);

  // (a) the call itself: fsync is called on the day's file, on the value's file and on their folders, inside append
  type Seen = { ino: number; day: string };
  function spied<T>(d: string, f: () => T): { out: T; seen: Seen[] } {
    const real = fs.fsyncSync, seen: Seen[] = [];
    fs.fsyncSync = ((fd: number) => { const [file] = logFiles(d); seen.push({ ino: fs.fstatSync(fd).ino, day: file ? readFileSync(file, "utf8") : "" }); return real(fd); }) as typeof fs.fsyncSync;
    syncBuiltinESMExports();
    try { return { out: f(), seen }; } finally { fs.fsyncSync = real; syncBuiltinESMExports(); }
  }
  const ino = (p: string) => statSync(p).ino;
  for (const kind of ["run.about", "rung.asked"]) {
    const d = dir("log");
    const log = dayTrail(d);
    const { out: e, seen } = spied(d, () => log.append({ by: ENG, kind, item: "week", value: { what: `about to do: ${kind}` } }));
    const [day] = logFiles(d);
    assert.ok(seen.length > 0, `${kind}: fsync is called before append returns`);
    const inos = seen.map((s) => s.ino);
    assert.ok(inos.includes(ino(day)), "on the day's file");
    assert.ok(inos.includes(ino(valueFile(d, e.hash))), "on its value file");
    assert.ok(inos.includes(ino(d)) && inos.includes(ino(join(d, "values"))), "and on the folders the two files were made in");
    const atDay = seen.find((s) => s.ino === ino(day))!;
    assert.ok(atDay.day.includes(`"id":"${e.id}"`) && atDay.day.endsWith("\n"), "the whole line is in the file when it is synced");
    assert.ok(seen.findIndex((s) => s.ino === ino(valueFile(d, e.hash))) < seen.indexOf(atDay), "the content first, then the line that points at it");
    // a second one the same day: the files' folders are there already, the line is synced again
    const again = spied(d, () => log.append({ by: ENG, kind, item: "week", value: { what: `about to do: ${kind}` } }));
    assert.ok(again.seen.map((s) => s.ino).includes(ino(day)));
    assert.ok(again.seen.map((s) => s.ino).includes(ino(valueFile(d, e.hash))), "a content already there is synced too");
    // every other kind is written as before: no fsync
    assert.equal(spied(d, () => log.append({ by: ENG, kind: "plugin.load", item: "week", value: { v: 1 } })).seen.length, 0);
    assert.equal(spied(d, () => log.append({ by: ENG, kind: "plugin.line", item: "week", value: { line: "hi" } })).seen.length, 0);
    // log.erase is marked too: the content gone from the folder, then its line, both synced
    const said = log.since("home").at(-1)!;
    const erased = spied(d, () => log.erase(said.id, { person: "person" }));
    assert.ok(erased.seen.map((s) => s.ino).includes(ino(day)) && erased.seen.map((s) => s.ino).includes(ino(join(d, "values"))));
    assert.equal(verifyLog(d).ok, true);
  }
  for (const r of KINDS) assert.equal(r.fsync === true, marked.includes(r.kind));

  // (b) a child process writes one and is killed with SIGKILL right after the write: the line is in the file, whole
  const script = join(dir("child"), "child.mts");
  mkdirSync(dirname(script), { recursive: true });
  writeFileSync(script, `
import { writeSync } from "node:fs";
const [, , logTs, dir, mode] = process.argv;
const { dayTrail } = await import(logTs);
const log = dayTrail(dir);
if (mode !== "wait") {
  log.append({ by: { person: "engine" }, kind: mode, item: "week", value: { what: "about to do: " + mode } });
  process.kill(process.pid, "SIGKILL");   // right after the write: nothing else runs
  for (;;) { /* until the signal lands */ }
}
const a = log.append({ by: { person: "engine" }, kind: "run.about", item: "week", value: { what: "about to run gh" } });
const b = log.append({ by: { person: "engine" }, kind: "rung.asked", item: "week", value: { what: "about to ask before it pays" } });
writeSync(1, "wrote " + a.id + " " + b.id + "\\n");
setInterval(() => {}, 1000);
`);
  const child = (d: string, mode: string) => spawn(process.execPath, ["--import", "tsx", script, pathToFileURL(join(SRC, "log.ts")).href, d, mode], { cwd: ENGINE, stdio: ["ignore", "pipe", "pipe"] });
  const ended = (c: ReturnType<typeof child>) => new Promise<{ code: number | null; signal: NodeJS.Signals | null; err: string }>((done) => { let err = ""; c.stderr.on("data", (x) => { err += x; }); c.on("exit", (code, signal) => done({ code, signal, err })); });
  // it kills itself, the statement after append
  for (const kind of ["run.about", "rung.asked"]) {
    const d = dir("log");
    const end = await ended(child(d, kind));
    assert.equal(end.signal, "SIGKILL", `the child died of SIGKILL (${end.err})`);
    const text = readFileSync(logFiles(d)[0], "utf8");
    assert.ok(text.endsWith("\n"), "the line is whole");
    const [e] = readLog(d) as LogEv[];
    assert.equal(readLog(d).length, 1);
    assert.equal(e.kind, kind);
    assert.deepEqual(e.value, { what: `about to do: ${kind}` }, "its value file is there too");
    assert.deepEqual(verifyLog(d), { ok: true, events: 1, old: 0, erased: 0, bad: [] });
  }
  // it is killed from outside, as soon as it says it wrote
  const d = dir("log");
  const c = child(d, "wait"), end = ended(c);
  const wrote = await new Promise<string>((done, fail) => { let out = ""; c.stdout.on("data", (x) => { out += x; if (out.includes("\n")) done(out.trim()); }); void end.then((e) => fail(new Error(`the child ended before it wrote: ${e.err}`))); });
  c.kill("SIGKILL");
  assert.equal((await end).signal, "SIGKILL");
  const [, a, b] = wrote.split(" ");
  const on = readLog(d) as LogEv[];
  assert.deepEqual(on.map((e) => [e.kind, e.id]), [["run.about", a], ["rung.asked", b]], "both lines are in the file");
  assert.deepEqual(on.map((e) => e.value), [{ what: "about to run gh" }, { what: "about to ask before it pays" }]);
  assert.equal(verifyLog(d).ok, true);
  // the next engine reads them and goes on from there
  const next = dayTrail(d).append({ by: ENG, kind: "plugin.off", item: "week" });
  assert.deepEqual([next.seq, next.prev], [3, b]);
});

test("6. v0 lines already on disk stay readable, read only, through the registry's old names", async () => {
  // a day the beta wrote: every old name, as file-trail.ts made the lines (the v0 event is its Ev)
  const d = dir("log");
  mkdirSync(d, { recursive: true });
  const at0 = new Date(2026, 10, 1, 9, 0, 0).getTime();
  const old = memoryTrail({ now: () => at0 });
  const seat = { person: "seat", agent: "claude" }, block = { person: "engine", agent: "week" }, me = { person: "person" };
  const wrote: [string, string, Omit<Parameters<typeof old.append>[0], "project" | "kind">][] = [
    ["line", "plugin.line", { by: block, item: "week", value: { line: "the week is read" } }],
    ["load", "plugin.load", { by: ENG, item: "week", value: { v: 1, engine: "engine.js" } }],
    ["release", "plugin.release", { by: ENG, item: "week", value: { from: 1, to: 2 } }],
    ["broken", "plugin.broken", { by: ENG, item: "week", value: { why: "it threw" } }],
    ["unload", "plugin.unload", { by: ENG, item: "week", value: { why: "changed" } }],
    ["trouble", "plugin.trouble", { by: ENG, item: "week", value: { where: "event", why: "it threw" } }],
    ["write", "plugin.write", { by: block, item: "week", value: { what: "week.seen" } }],
    ["data", "plugin.data", { by: ENG, item: "week", value: { from: 1, to: 2 } }],
    ["refused", "plugin.refused", { by: block, item: "week", value: { op: "write", what: "calendar.week", why: "not among the writes" } }],
    ["suspect", "plugin.suspect", { by: ENG, item: "week", value: { refused: 5, why: "five in a row" } }],
    ["pressed", "plugin.approve", { by: me, item: "week", value: { print: "abc", asks: {} } }],
    ["off", "plugin.off", { by: me, item: "week" }],
    ["factory", "plugin.factory", { by: me, value: { off: ["week"] } }],
    ["run", "plugin.ran", { by: block, item: "week", value: { program: "gh", code: 0, out: true } }],
    ["fetch", "plugin.fetched", { by: block, item: "week", value: { host: "api.github.com", status: 200, out: true } }],
    ["wake", "plugin.wake", { by: ENG, item: "week", value: { why: "load", pid: 1 } }],
    ["sleep", "plugin.sleep", { by: ENG, item: "week", value: { why: "idle" } }],
    ["seat", "plugin.seat", { by: ENG, item: "week", value: { provided: true } }],
    ["step", "tool.call", { by: seat, item: "week", value: { tool: "free" } }],
    ["step", "plugin.called", { by: block, item: "week", value: { tool: "page_read", out: true } }],
    ["undo", "undo.did", { by: me, item: "week", value: { from: 2, to: 1 } }],
    ["turn", "seat.turn", { by: seat, value: { session: "s1", model: "opus" } }],
    ["step", "seat.step", { by: seat, value: { session: "s1", tool: "Read", file: "/Users/me/plan.txt" } }],
    ["sent", "seat.sent", { by: seat, value: { session: "s1", what: "desk", bytes: 12 } }],
    ["done", "seat.done", { by: seat, value: { session: "s1", ok: true } }],
    ["key", "key.pasted", { by: me, item: "github", value: { op: "pasted", hosts: ["api.github.com"] } }],
    ["key", "key.removed", { by: me, item: "github", value: { op: "removed" } }],
    ["gossip", "gossip", { by: ENG, item: "week", value: { said: "a kind no build ever registered" } }],
  ];
  for (const old1 of BARE) assert.ok(wrote.some(([o]) => o === old1), `${old1} is on the day`);
  const v0 = wrote.map(([kind, , more]) => old.append({ project: "home", kind, ...more }));
  // step 1's one file holds the first three, a day's file the rest
  const one = join(d, "log.jsonl"), day = join(d, `${dayOf(at0)}.jsonl`);
  writeFileSync(one, v0.slice(0, 3).map((e) => JSON.stringify(e)).join("\n") + "\n");
  writeFileSync(day, v0.slice(3).map((e) => JSON.stringify(e)).join("\n") + "\n");
  const bytes = { one: readFileSync(one, "utf8"), day: readFileSync(day, "utf8") };

  // read: each line as it was written, `v: 0`, its kind as the registry names it now, the name on the line as `old`
  let at = at0 + 60_000;
  const log = dayTrail(d, () => at);
  assert.equal(log.last(), v0.length);
  const read = log.since("home") as OldEv[];
  assert.equal(read.length, v0.length);
  read.forEach((e, i) => {
    const [was, now] = wrote[i];
    assert.deepEqual(e, { ...v0[i], v: 0, old: was, kind: now }, `${was} is read as ${now}, and nothing else of the line changes`);
  });
  assert.deepEqual(readLog(d), read, "a plain read of the folder gives the same");
  assert.deepEqual(log.since("home", v0.length - 2).map((e) => e.seq), [v0.length - 1, v0.length]);
  assert.deepEqual([readFileSync(one, "utf8"), readFileSync(day, "utf8")], [bytes.one, bytes.day], "reading rewrites nothing");

  // read only: a v0 line's content cannot be erased (the line would have to be rewritten), and no v0 line is written again
  assert.throws(() => log.erase(v0[0].id, { person: "person" }), /a line written before v1 is read only/);
  assert.throws(() => log.append({ by: ENG, kind: "load", item: "week", value: { v: 1 } }), /the log takes no "load"/);
  assert.deepEqual([readFileSync(one, "utf8"), readFileSync(day, "utf8")], [bytes.one, bytes.day]);

  // the next line is v1: after the v0 lines in the same day's file, its prev the last v0 line's id, seq going on
  const a = log.append({ by: ENG, kind: "plugin.load", item: "week", value: { v: 2 } });
  assert.deepEqual([a.v, a.seq, a.prev], [1, v0.length + 1, v0.at(-1)!.id]);
  const after1 = readFileSync(day, "utf8");
  assert.ok(after1.startsWith(bytes.day), "the v0 lines stand as they were, byte for byte");
  assert.deepEqual(JSON.parse(after1.slice(bytes.day.length)), a);
  at += 24 * 3600_000;
  const b = log.append({ by: ENG, kind: "plugin.off", item: "week" });
  assert.equal(b.prev, a.id);
  assert.equal(logFiles(d).length, 3);
  assert.equal(readFileSync(one, "utf8"), bytes.one);
  // the chain holds from the first v1 event; the v0 lines are passed over, and counted
  assert.deepEqual(verifyLog(d), { ok: true, events: 2, old: v0.length, erased: 0, bad: [] });
  const all = readLog(d);
  assert.deepEqual(all.map((e) => e.v), [...v0.map(() => 0), 1, 1]);

  // the kernel hands them the same way (what GET /log answers with)
  const h = dir("home");
  mkdirSync(join(h, "things"), { recursive: true });
  const k = new Kernel(h, { logDir: d, appDir: join(h, "app"), old: null });
  assert.equal(k.lastSeq(), v0.length + 2);
  const got = k.since();
  assert.deepEqual(got.slice(0, 3).map((e) => [e.v, e.kind, (e as OldEv).old]), [[0, "plugin.line", "line"], [0, "plugin.load", "load"], [0, "plugin.release", "release"]]);
  assert.deepEqual(got.at(-1), b);
  await k.stop();
  assert.equal(readFileSync(one, "utf8"), bytes.one);
});

test("7. hears is checked against the registry, not a list of its own; engine.start and engine.tz are written at start", async () => {
  // the list record.ts hands out is the registry's own, the same array
  assert.equal(HEARD_KINDS, HEARD);
  assert.deepEqual([...HEARD_KINDS], KINDS.filter((r) => r.hear).map((r) => r.kind));
  assert.match(readFileSync(join(SRC, "record.ts"), "utf8"), /import \{[^}]*\bHEARD\b[^}]*\} from "\.\/contract\/kinds\.js"/);
  const why = (kind: string) => (columnsOf({ hears: [kind] }) as { why?: string }).why;
  // row by row: a kind with `hear` may be named; one without is refused as never handed
  for (const r of KINDS) {
    if (r.hear) assert.deepEqual(columnsOf({ hears: [r.kind] }), { ok: true, columns: { room: "small", needs: null, stores: [], hears: [r.kind] } }, `${r.kind} may be heard`);
    else assert.match(why(r.kind) ?? "", /which is never handed to a block/, `${r.kind} is never handed`);
    // a block that wrote no `hears`: every kind whose row says "open", none other
    assert.equal(hearsKind({ hears: null }, { kind: r.kind }), r.hear === "open", `${r.kind} with no hears`);
    // one that names it: when the row says it may be heard at all
    assert.equal(hearsKind({ hears: [r.kind] }, { kind: r.kind }), r.hear !== undefined, `${r.kind} when named`);
  }
  assert.ok(KINDS.some((r) => r.hear === "open") && KINDS.some((r) => r.hear === "card") && KINDS.some((r) => !r.hear), "all three are rows today");
  // a name from before v1 is refused, with the name it has now, read from the old-name column
  for (const r of KINDS.filter((x) => x.old)) assert.match(why(r.old!) ?? "", new RegExp(`the name a kind had before: it is .*${r.kind.replace(".", "\\.")}.* now`), `${r.old} is said as ${r.kind}`);
  assert.match(why("step")!, /it is plugin\.called or tool\.call or seat\.step now/);
  assert.match(why("gossip.told")!, /which is not a kind a block can hear \(plugin\.load, /);
  assert.match(why("gate.asked")!, /which is not a kind a block can hear/);
  assert.equal(hearsKind({ hears: ["gossip.told"] }, { kind: "gossip.told" }), false, "a kind with no row is never handed");

  // engine.start and engine.tz: the first two lines of a start, before any block's
  const h = dir("home");
  mkdirSync(join(h, "things"), { recursive: true });
  const logAt = process.env.SOL_LOGDIR!;
  await syncKernel(h, false);
  assert.equal(kernelNow(), null);
  assert.equal(existsSync(logAt), false, "with the frame off there is no kernel and no log");
  const starting = syncKernel(h, true), there = kernelNow() !== null;
  await starting;
  try {
    assert.ok(there, "the kernel is there at once: nothing waits for the start's lines, so a seat's first steps are not dropped");
    const on = readLog(logAt) as LogEv[];
    assert.ok(on.length >= 2);
    assert.deepEqual(on.slice(0, 2).map((e) => [e.seq, e.kind, e.by]), [[1, "engine.start", { person: "engine" }], [2, "engine.tz", { person: "engine" }]]);
    const start = on[0].value as Record<string, unknown>, tz = on[1].value as { tz: string; offset: number };
    assert.equal(start.kinds, KINDS_PRINT, "which registry wrote what follows");
    assert.equal(start.node, process.version);
    assert.equal(start.head, execFileSync("git", ["-C", ENGINE, "rev-parse", "--short=8", "HEAD"], { encoding: "utf8" }).trim(), "the commit the checkout is at");
    assert.match(String(start.os), /^\w+ \S+$/);
    assert.deepEqual(tz, { tz: Intl.DateTimeFormat().resolvedOptions().timeZone, offset: -new Date().getTimezoneOffset() || 0 }, "at UTC the offset is 0, never -0");
    assert.deepEqual([start.tz, start.offset], [tz.tz, tz.offset]);
    assert.equal(fits("engine.start", start), null);
    assert.equal(fits("engine.tz", tz), null);
    assert.ok("value" in raw(logAt)[0], "no free text: on its line");
  } finally { await syncKernel(h, false); }
  const first = readLog(logAt).length;
  await syncKernel(h, true);
  try {
    assert.deepEqual(readLog(logAt).slice(first, first + 2).map((e) => e.kind), ["engine.start", "engine.tz"], "and again at the next start");
  } finally { await syncKernel(h, false); }
  assert.equal(verifyLog(logAt).ok, true);

  // engine.tz again when the timezone is another, looked at with a line being written, a minute apart at most
  const h2 = dir("home");
  mkdirSync(join(h2, "things"), { recursive: true });
  let at = new Date(2026, 10, 10, 12, 0, 0).getTime(), zone = { tz: "Asia/Taipei", offset: 480 };
  const k = new Kernel(h2, { logDir: join(h2, "lab-log"), appDir: join(h2, "app"), old: null, now: () => at, zone: () => zone });
  k.append("plugin.off", "x");
  assert.deepEqual(k.since().map((e) => e.kind), ["plugin.off"], "a kernel that was not started says nothing of its own");
  k.started({ release: "v0.0.1", commit: "abc1234", mine: 2 });
  assert.deepEqual(k.since(1).map((e) => [e.kind, e.value]), [
    ["engine.start", { release: "v0.0.1", commit: "abc1234", mine: 2, kinds: KINDS_PRINT, os: (k.since(1)[0].value as { os: string }).os, node: process.version, tz: "Asia/Taipei", offset: 480 }],
    ["engine.tz", { tz: "Asia/Taipei", offset: 480 }],
  ]);
  const kindsFrom = (seq: number) => k.since(seq).map((e) => e.kind);
  let seq = k.lastSeq();
  at += 61_000;
  k.append("plugin.off", "x");
  assert.deepEqual(kindsFrom(seq), ["plugin.off"], "the same timezone: nothing more");
  seq = k.lastSeq();
  zone = { tz: "America/New_York", offset: -300 };
  at += 30_000;
  k.append("plugin.off", "x");
  assert.deepEqual(kindsFrom(seq), ["plugin.off"], "looked at a minute apart at most");
  seq = k.lastSeq();
  at += 31_000;
  k.seat("seat.turn", "claude", { session: "s1" });
  assert.deepEqual(k.since(seq).map((e) => [e.kind, e.kind === "engine.tz" ? e.value : null]), [["engine.tz", { tz: "America/New_York", offset: -300 }], ["seat.turn", null]], "the new timezone, before the line written in it");
  await k.stop();
  assert.equal(verifyLog(join(h2, "lab-log")).ok, true);
});

test("8. Ev and By in file-trail.ts are as they were, and nothing is written with the frame off", async (t) => {
  const src = readFileSync(join(SRC, "file-trail.ts"), "utf8");
  assert.ok(src.includes("export type By = { person: string; machine?: string; agent?: string };"), "By is as main has it");
  assert.ok(src.includes("export type Ev = { id: string; seq: number; at: number; project: string; by: By; kind: string; item?: string; field?: string; value?: unknown };"), "Ev is as main has it");
  // and the whole file is the one in the main this branch holds (the merge base, so a later main does not move it)
  let main: string | null = null;
  try {
    const base = execFileSync("git", ["-C", ENGINE, "merge-base", "HEAD", "origin/main"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    main = execFileSync("git", ["-C", ENGINE, "show", `${base}:sol/engine/src/file-trail.ts`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch { t.diagnostic("origin/main is not at hand here: file-trail.ts was compared by its two declarations only"); }
  if (main !== null) assert.equal(src, main, "file-trail.ts is main's, byte for byte");
  // the log's event is its own type, in log.ts: file-trail.ts knows nothing of v1
  assert.doesNotMatch(src, /\b(prev|hash|ignorable|LogEv|contract\/kinds)\b/);
  assert.match(readFileSync(join(SRC, "log.ts"), "utf8"), /import type \{ By, Ev \} from "\.\/file-trail\.js"/, "the log reads the two, as types");
  // the trail file-trail.ts makes is untouched by the registry: it still takes any kind (main's blocks write it), and
  // its event is main's shape, with none of v1's fields
  const e = memoryTrail().append({ project: "p", by: { person: "me" }, kind: "anything at all" });
  assert.deepEqual(Object.keys(e).sort(), ["at", "by", "id", "kind", "project", "seq"]);
  // the log's own event is another shape: the same core fields, not the same type. Before the event format v1 the log
  // wrote file-trail.ts's Ev, which has no v, hash or prev
  const own = dayTrail(dir("log")).append({ by: ENG, kind: "plugin.off", item: "week" });
  assert.deepEqual(Object.keys(own).sort(), ["at", "by", "hash", "id", "item", "kind", "prev", "project", "seq", "v"]);
  assert.equal(own.v, 1);

  // with the frame off: no kernel, no log folder, nothing written anywhere
  const h = dir("home");
  mkdirSync(join(h, "things"), { recursive: true });
  const here = dir("off-log"), was = process.env.SOL_LOGDIR;
  process.env.SOL_LOGDIR = here;
  try {
    await syncKernel(h, false);
    assert.equal(kernelNow(), null);
    assert.equal(existsSync(here), false);
    assert.deepEqual(readdirSync(h), ["things"], "the home is as it was");
  } finally { process.env.SOL_LOGDIR = was; }
});
