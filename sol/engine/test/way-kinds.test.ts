// The fourteen `way.*` kinds in both books (the cowork ways' format §5, step 2; way.set and the `checks` lists came with
// the format's third version, step 3's fix round; way.seen, the runner's receipt, with the fourth, step 4): one row each in the local log's registry
// (contract/kinds.ts), and the team trail's own kind table (team/v3/trail-kinds.ts) built from the same rows. One test
// for each line of the unit's claim. Every folder is the test's own, under one temp folder removed at the end.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KINDS, HEARD, HOME_FAMILIES, isHomeKind, kindRow, fits, placeOf } from "../src/contract/kinds.ts";
import { dayTrail, readLog, verifyLog, valueFile, logFiles, type LogEv } from "../src/log.ts";
import { Keys } from "../src/team/v3/keys.ts";
import { Trail, verify, canonical, hashOf, eventId, bodyOf, type By, type TrailEvent } from "../src/team/v3/trail.ts";
import { CHECKED, TEAM_KINDS, kindError, erasable } from "../src/team/v3/trail-kinds.ts";
import { door } from "../src/team/v3/door.ts";
import type { Shape } from "../src/contract/kinds.ts";
import { Sync, type Cloud } from "../src/team/v3/sync.ts";
import { fold } from "../src/team/v3/record.ts";
process.env.SOL_COWORK_WAYS = "on";   // the trail checks the ways' kinds only with their switch on (#1105)

const root = mkdtempSync(join(tmpdir(), "sol-way-kinds-"));
after(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
const dir = (name: string) => join(root, `${name}-${++n}`);
const P = "sol";
const FRANK: By = { person: "franktsai2008-eng", machine: "macbook" };
const ISAAC: By = { person: "isaacliu", machine: "isaacmac" };
const MARCO: By = { person: "marcocyl04-ux", machine: "nucbox" };
/** one Sol: its keys (one machine) and its trail */
const sol = (machine: string) => { const d = dir(machine), keys = new Keys(join(d, "keys"), machine); return { keys, trail: new Trail({ file: join(d, "trail.db"), keys }) }; };

// the fourteen of FORMAT.md §5, and a value for each that fits its row
const VER = "a".repeat(64), OLD = "b".repeat(64), WAY = "sol.drafts", THING = "draft-1";
const GOOD: Record<string, Record<string, unknown>> = {
  "way.proposed": { way: WAY, from: OLD, slots: ["rules", "triggers"], map: ["to_remove>removed"] },
  "way.previewed": { way: WAY, from: OLD, to: VER, things: 7, differ: 2 },
  "way.agreed": { way: WAY, to: VER, role: "keeper" },
  "way.applied": { way: WAY, from: OLD, to: VER, reader: 1, because: "c".repeat(64) },
  "way.reverted": { way: WAY, from: VER, to: OLD },
  "way.made": { way: WAY, ver: VER, thing: THING, kind: "draft", by: "explorer" },
  "way.move": { way: WAY, ver: VER, thing: THING, move: "want", from: "on_switch", to: "wanted", by: "explorer" },
  "way.refused": { way: WAY, ver: VER, thing: THING, move: "promote", why: "gate.green" },
  "way.checked": { way: WAY, ver: VER, thing: THING, rule: "solid", seam: "gate.green", pv: 1, pkg: "sha256:tbd", pass: false, at: Date.UTC(2026, 10, 10) },
  "way.acted": { way: WAY, ver: VER, thing: THING, seam: "switch.off", pv: 1, pkg: "sha256:tbd", ok: true },
  "way.fired": { way: WAY, ver: VER, trigger: "remind", thing: THING, tick: Date.UTC(2026, 10, 10, 14, 30) },
  "way.note": { way: WAY, about: THING, words: "Marco: the logo draft waits on the gate.\nIt turns green tomorrow." },
  "way.set": { way: WAY, about: `${THING}.switch`, because: "c".repeat(64), name: "logo_v2" },
  "way.seen": { way: WAY, ver: VER },
};
const TWELVE = Object.keys(GOOD);
/** each row as FORMAT.md §5 says it, written out by hand (not read from the rows): a row that drifts fails */
const SECTION5: Record<string, Shape> = {
  "way.proposed": { way: "name", from: "name", slots: "names", map: "names?", because: "name?" },
  "way.previewed": { way: "name", from: "name", to: "name", things: "number", differ: "number", because: "name?" },
  "way.agreed": { way: "name", to: "name", role: "name", because: "name?" },
  "way.applied": { way: "name", from: "name", to: "name", reader: "number", because: "name?" },
  "way.reverted": { way: "name", from: "name", to: "name", because: "name?" },
  "way.made": { way: "name", ver: "name", thing: "name", kind: "name", by: "name", because: "name?" },
  "way.move": { way: "name", ver: "name", thing: "name", move: "name", from: "name", to: "name", by: "name", checks: "names?", because: "name?" },
  "way.refused": { way: "name", ver: "name", thing: "name?", move: "name?", why: "name", checks: "names?", because: "name?" },
  "way.checked": { way: "name", ver: "name", thing: "name", rule: "name", seam: "name", pv: "number", pkg: "name", pass: "boolean", at: "number", tick: "number?", because: "name?" },
  "way.acted": { way: "name", ver: "name", thing: "name", seam: "name", pv: "number", pkg: "name", ok: "boolean", because: "name?" },
  "way.fired": { way: "name", ver: "name", trigger: "name", thing: "name?", tick: "number", checks: "names?", because: "name?" },
  "way.note": { way: "name", about: "name", words: "text", because: "name?" },
  "way.set": { way: "name", about: "name", because: "name", name: "name?", number: "number?", boolean: "boolean?", names: "names?", numbers: "numbers?" },
  "way.seen": { way: "name", ver: "name", more: "boolean?" },
};
/** the names every object inherits: no row's field, whatever its value */
const INHERITED = ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"];
/** a value with one more own field put first, `__proto__` too (as JSON.parse makes it: an own field, not the prototype) */
const withField = (good: Record<string, unknown>, f: string, v: unknown): Record<string, unknown> => JSON.parse(`{${JSON.stringify(f)}:${JSON.stringify(v)},${JSON.stringify(good).slice(1)}`);
/** a value of the wrong type for a field of each carry (`text` holds any JSON: null is "missing", and its one field is required) */
const WRONG: Record<string, unknown> = { name: 42, text: null, number: "7", boolean: "yes", names: "rules", numbers: [1] };
/** every way a value can fail its row: each field left out (the required ones), each of the wrong type, free text in a
 *  name (two lines, too long), a field the row does not carry, a value that is not an object, no value at all */
function bads(kind: string): [string, unknown][] {
  const shape = kindRow(kind)!.carries!, good = GOOD[kind], out: [string, unknown][] = [];
  for (const [f, c] of Object.entries(shape)) {
    if (!c.endsWith("?")) { const { [f]: _gone, ...rest } = good; out.push([`no ${f}`, rest]); }
    out.push([`${f} of the wrong type`, { ...good, [f]: WRONG[c.replace(/\?$/, "")] }]);
  }
  out.push(["free text in a name, two lines", { ...good, way: "sol.drafts\nand a second line" }]);
  out.push(["free text in a name, too long", { ...good, way: "x".repeat(201) }]);
  out.push(["prose in a name", { ...good, way: "the logo draft, see Marco" }]);
  out.push(["a name of another script", { ...good, way: "看不懂這條規則" }]);
  out.push(["a field it does not carry", { ...good, comment: "a word on the side" }]);
  for (const f of INHERITED) out.push([`an inherited name, ${f}`, withField(good, f, "free words\nover two lines")]);
  out.push(["not an object", "just words"]);
  out.push(["no value", undefined]);
  return out;
}

test("each of the fourteen way.* kinds has one row: family way, written by the core, not Home's, handed to no block", () => {
  const rows = KINDS.filter((r) => r.family === "way");
  assert.deepEqual(rows.map((r) => r.kind).sort(), [...TWELVE].sort(), "the fourteen of FORMAT.md §5, no more");
  for (const r of rows) {
    assert.equal(r.who, "core", r.kind);
    assert.ok(r.carries, `${r.kind} says what it carries`);
    assert.equal(r.hear, undefined, `${r.kind} is never handed to a block`);
    assert.ok(!HEARD.includes(r.kind));
    assert.equal(isHomeKind(r.kind), false, `${r.kind} is not Home's`);
  }
  assert.ok(!HOME_FAMILIES.includes("way"));
  // each row is FORMAT.md §5's, field for field and type for type
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.kind, r.carries])), SECTION5);
  // every field but a note's words is a short name, a number or a true/false (or a list of names)
  for (const r of rows) for (const [f, c] of Object.entries(r.carries!)) {
    const type = c.replace(/\?$/, "");
    if (r.kind === "way.note" && f === "words") assert.equal(c, "text", "the note's words are its one free text");
    else if (r.kind === "way.set" && f === "numbers") assert.equal(c, "numbers?", "a numbers field's value: numbers, no words");
    else assert.ok(["name", "number", "boolean", "names"].includes(type), `${r.kind}'s ${f} is ${c}`);
  }
});

test("the log takes each way.* kind with a value that fits: on its line, but the note's words in a value file", () => {
  const d = dir("log"), log = dayTrail(d);
  for (const kind of TWELVE) {
    assert.equal(fits(kind, GOOD[kind]), null, `${kind}'s value fits`);
    const e = log.append({ by: { person: "franktsai2008-eng" }, kind, item: THING, value: GOOD[kind] });
    assert.equal(placeOf(kind, GOOD[kind]), kind === "way.note" ? "file" : "line", kind);
    assert.deepEqual(e.value, GOOD[kind]);
  }
  const lines = logFiles(d).flatMap((f) => readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l) as LogEv));
  assert.deepEqual(lines.map((l) => l.kind), TWELVE);
  for (const l of lines) assert.equal("value" in l, l.kind !== "way.note", `${l.kind}: ${l.kind === "way.note" ? "only its hash on the line" : "its value on its line"}`);
  assert.deepEqual(readLog(d).map((e) => (e as LogEv).value), TWELVE.map((k) => GOOD[k]), "each read back whole");
  assert.equal(verifyLog(d).ok, true);
});

test("a way.* value that does not fit its row is named by fits and kept off the line; a way.* kind with no row is refused", () => {
  const d = dir("log"), log = dayTrail(d);
  let count = 0;
  for (const kind of TWELVE) {
    const list = bads(kind);
    assert.ok(list.length >= 6, `${kind}: ${list.length} bad values`);
    for (const [what, v] of list) {
      assert.notEqual(fits(kind, v), null, `${kind}, ${what}: does not fit`);
      if (v === undefined) continue;
      // the log's rule (contract/kinds.ts): a value that does not fit is kept as free text, in a value file, never on the line
      assert.equal(placeOf(kind, v), "file", `${kind}, ${what}: not on the line`);
      const e = log.append({ by: { person: "franktsai2008-eng" }, kind, value: v });
      const line = JSON.parse(readFileSync(logFiles(d).at(-1)!, "utf8").trim().split("\n").at(-1)!);
      assert.equal(line.id, e.id);
      assert.equal("value" in line, false, `${kind}, ${what}: only its hash on the line`);
      count++;
    }
  }
  assert.ok(count > 100);
  for (const kind of ["way.bogus", "way.moved", "way.note.x", "way.Move"]) {
    assert.throws(() => log.append({ by: { person: "franktsai2008-eng" }, kind, value: { way: WAY } }), /the log takes no/, `${kind} is refused`);
  }
});

test("a way.note's words are in a value file and erased without breaking the chain; the facts around it stay", () => {
  const d = dir("log"), log = dayTrail(d);
  const move = log.append({ by: { person: "marcocyl04-ux" }, kind: "way.move", item: THING, value: GOOD["way.move"] });
  const note = log.append({ by: { person: "marcocyl04-ux" }, kind: "way.note", item: THING, value: GOOD["way.note"], cause: move.id });
  const after = log.append({ by: { person: "franktsai2008-eng" }, kind: "way.agreed", value: GOOD["way.agreed"] });
  assert.ok(existsSync(valueFile(d, note.hash)), "the words are in their own file");
  const disk = () => readdirSync(d, { recursive: true }).map((x) => join(d, String(x))).filter((p) => statSync(p).isFile()).map((p) => readFileSync(p, "utf8")).join("\n");
  assert.match(disk(), /the logo draft waits on the gate/);
  const erased = log.erase(note.id, { person: "marcocyl04-ux" });
  assert.equal(erased.kind, "log.erase");
  assert.equal(existsSync(valueFile(d, note.hash)), false, "the file is gone");
  assert.doesNotMatch(disk(), /the logo draft waits on the gate/, "the words are nowhere on the disk");
  const back = readLog(d) as LogEv[];
  assert.equal(back.find((e) => e.id === note.id)!.erased, true);
  assert.deepEqual(back.find((e) => e.id === move.id)!.value, GOOD["way.move"], "the move's facts stay");
  assert.deepEqual(back.find((e) => e.id === after.id)!.value, GOOD["way.agreed"]);
  const v = verifyLog(d);
  assert.deepEqual(v.bad, [], "the chain still verifies");
  assert.equal(v.erased, 1);
  // a fact is never erased: it carries no free text
  assert.throws(() => log.erase(move.id, { person: "marcocyl04-ux" }), /nothing to erase/);
});

test("the team trail takes each way.* kind with a value that fits, and keeps it", () => {
  const { trail: t } = sol("macbook");
  for (const kind of TWELVE) t.append({ project: P, by: FRANK, kind, item: THING, value: GOOD[kind] });
  const v = t.check(P);
  assert.deepEqual(v.bad, []);
  assert.deepEqual(v.ok.map((e) => e.kind).sort(), [...TWELVE].sort(), "all fourteen (one millisecond: the trail orders them by id)");
  for (const e of v.ok) assert.deepEqual(e.value, GOOD[e.kind], e.kind);
  // a teammate's Sol takes them too
  const other = sol("nucbox").trail, m = other.merge(t.since(P));
  assert.deepEqual(m.bad, []);
  assert.equal(m.added.length, 14);
});

test("the team trail refuses a way.* append that has no row or does not fit, with one plain line, and writes nothing", () => {
  const { trail: t } = sol("macbook");
  const refused = (kind: string, value: unknown, what: string) => {
    assert.throws(() => t.append({ project: P, by: FRANK, kind, value }), (err: Error) => {
      assert.match(err.message, /^the team trail takes no such event: /, `${kind}, ${what}`);
      assert.ok(!err.message.includes("\n"), "one line");
      return true;
    });
  };
  for (const kind of TWELVE) for (const [what, v] of bads(kind)) refused(kind, v, what);
  for (const kind of ["way.bogus", "way.moved", "way.note.x", "way.made-up"]) refused(kind, GOOD["way.made"], "no row");
  refused("way.bogus", undefined, "no row, no value");
  assert.deepEqual(t.since(P), [], "nothing was written");
  assert.deepEqual(t.waiting(P), [], "nothing waits to send");
  assert.match(kindError("way.move", { ...GOOD["way.move"], by: 3 }), /way\.move's by is not a name/, "the line says what does not hold");
  assert.match(kindError("way.bogus", {}), /way\.bogus is not a kind the team trail takes/);
});

/** an event signed by a Sol's own key exactly as append makes it, but with any kind and value: what a Sol of another
 *  build (or a broken one) could send */
function forged(s: ReturnType<typeof sol>, by: By, kind: string, value: unknown, prev = "", at = Date.UTC(2026, 10, 10, 12), item?: string): TrailEvent {
  const k = s.keys.signerFor(by);
  const fields = value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort() : undefined;
  const body = bodyOf({ v: 2, project: P, by, kind, ...(item ? { item } : {}), ...(fields ? { fields } : {}), hash: hashOf(value), at, prev, key: k.pub, ...(k.cert ? { cert: k.cert } : {}) });
  return { ...body, seq: 0, id: eventId(body), sig: k.sign(canonical(body)), ...(value !== undefined ? { value } : {}) };
}

test("a bad way.* event from another member is named once, kept marked, never folded, and the sync goes on", async () => {
  const isaac = sol("isaacmac"), marco = sol("nucbox"), frank = sol("macbook");
  // isaac's Sol of another build writes a way kind nobody registered, and his agent a move with free text in it
  const unknown = forged(isaac, ISAAC, "way.paused", { way: WAY, ver: VER, thing: THING });
  const agentBy: By = { ...ISAAC, agent: "claude" };
  const wordy = forged(isaac, agentBy, "way.move", { ...GOOD["way.move"], to: "wanted\nbecause I said so in a long line" });
  // marco's good events around them: an item and a way move
  const item = marco.trail.append({ project: P, by: MARCO, kind: "item", item: "logo", value: { title: "Logo" } });
  const move = marco.trail.append({ project: P, by: MARCO, kind: "way.move", item: THING, value: GOOD["way.move"] });
  // verify alone names them, and gives them back apart, marked: never among the good ones
  const v = verify([unknown, item, wordy, move]);
  assert.deepEqual(v.bad.map((b) => [b.id, b.why]).sort(), [[unknown.id, "kind"], [wordy.id, "kind"]].sort());
  assert.match(v.bad.find((b) => b.id === unknown.id)!.line, /way\.paused is not a kind the team trail takes/);
  assert.match(v.bad.find((b) => b.id === wordy.id)!.line, /way\.move's to is not a name/);
  assert.deepEqual(v.ok.map((e) => e.id).sort(), [item.id, move.id].sort());
  assert.deepEqual(v.notUnderstood.map((e) => [e.id, e.notUnderstood]).sort(), [[unknown.id, v.bad.find((b) => b.id === unknown.id)!.line], [wordy.id, v.bad.find((b) => b.id === wordy.id)!.line]].sort());

  // the sync: frank's Sol pulls all four from the cloud
  const sent = [item, unknown, move, wordy].map((e, i) => ({ ...e, seq: i + 1 }));
  const cloud: Cloud = {
    append: async () => ({ kept: [], refused: [] }),
    since: async (_p, seq) => ({ events: sent.filter((e) => e.seq > seq), seq: sent.length, more: false }),
  };
  const r = await new Sync(frank.trail, cloud).pull(P);
  assert.equal(r.away, undefined, "the sync did not fail");
  assert.deepEqual(r.bad.map((b) => [b.id, b.why]).sort(), [[unknown.id, "kind"], [wordy.id, "kind"]].sort(), "named, not dropped in silence");
  assert.deepEqual(r.added.map((e) => e.id).sort(), [item.id, move.id].sort(), "only the understood ones are added");
  assert.equal(frank.trail.cursor(P), 4, "the cursor moved past all four");
  assert.match(frank.trail.get(unknown.id, { raw: true })!.notUnderstood!, /way\.paused is not a kind/, "kept: a raw read sees it, marked");
  assert.match(frank.trail.get(wordy.id, { raw: true })!.notUnderstood!, /way\.move's to is not a name/);
  assert.equal(frank.trail.get(unknown.id), null, "an ordinary read does not hand it out");
  assert.equal(frank.trail.get(move.id)!.notUnderstood, undefined, "an understood one carries no mark");
  assert.deepEqual(frank.trail.since(P).map((e) => e.id).sort(), [item.id, move.id].sort(), "since hands out only what is understood");
  assert.doesNotMatch(String((frank.trail.raw.prepare("SELECT body FROM event WHERE id = ?").get(unknown.id) as { body: string }).body), /notUnderstood/, "the mark is never stored");
  const c = frank.trail.check(P);
  assert.deepEqual(c.bad, [], "named once, when it came: the check does not name it again");
  assert.deepEqual(c.ok.map((e) => e.id).sort(), [item.id, move.id].sort(), "only the good ones fold");
  assert.deepEqual(c.notUnderstood.map((e) => e.id).sort(), [unknown.id, wordy.id].sort(), "the kept ones are given back apart");
  assert.deepEqual(Object.keys(fold(c.ok).items), ["logo"]);
  // pulled again: already here, so neither named again nor added; nothing throws
  const again = await new Sync(frank.trail, { ...cloud, since: async () => ({ events: sent, seq: sent.length }) }).pull(P);
  assert.deepEqual(again.bad, []);
  assert.deepEqual(again.added, []);
});

/** a teammate's chain in one project: a way event this Sol does not understand, then a good way.move, then an item,
 *  each after the one before, all by the same key; merged into another Sol */
function laterAfter(bad: { kind: string; value: unknown }) {
  const isaac = sol("isaacmac"), frank = sol("macbook");
  const odd = forged(isaac, ISAAC, bad.kind, bad.value, "", Date.UTC(2026, 10, 10, 12));
  const move = forged(isaac, ISAAC, "way.move", GOOD["way.move"], odd.id, Date.UTC(2026, 10, 10, 12, 1));
  const item = forged(isaac, ISAAC, "item", { title: "Logo" }, move.id, Date.UTC(2026, 10, 10, 12, 2), "logo");
  return { frank, odd, move, item };
}
function takenThrough(bad: { kind: string; value: unknown }, why: RegExp) {
  const { frank, odd, move, item } = laterAfter(bad);
  // one merge, and the same three again in two later merges (the bad one first): the chain goes on either way
  const m = frank.trail.merge([odd, move, item]);
  assert.deepEqual(m.bad.map((b) => [b.id, b.why]), [[odd.id, "kind"]], "the not understood one is named, nothing else");
  assert.match(m.bad[0].line, why);
  assert.deepEqual(m.added.map((e) => e.id).sort(), [move.id, item.id].sort(), "the writer's later two are taken");
  for (const e of [odd, move, item]) assert.ok(frank.trail.get(e.id, { raw: true }), `${e.kind} is kept`);
  assert.match(frank.trail.get(odd.id, { raw: true })!.notUnderstood!, why, "the not understood one is marked");
  assert.equal(frank.trail.get(odd.id), null);
  assert.deepEqual(frank.trail.get(move.id)!.value, GOOD["way.move"], "readable");
  assert.deepEqual(frank.trail.get(item.id)!.value, { title: "Logo" });
  const c = frank.trail.check(P);
  assert.deepEqual(c.bad, []);
  assert.deepEqual(c.ok.map((e) => e.id), [move.id, item.id], "what folds: the later two, never the marked one");
  assert.deepEqual(c.notUnderstood.map((e) => e.id), [odd.id]);
  assert.deepEqual(frank.trail.since(P).map((e) => e.id), [move.id, item.id], "a reader is handed the understood ones");
  assert.deepEqual(frank.trail.since(P, 0, 10_000, { raw: true }).map((e) => [e.id, !!e.notUnderstood]), [[odd.id, true], [move.id, false], [item.id, false]], "a raw reader sees the mark");
  assert.equal(fold(c.ok).items.logo.fields.title, "Logo");
  const two = sol("nucbox").trail;
  two.merge([odd]);
  const n = two.merge([move, item]);
  assert.deepEqual(n.bad, [], "in a later merge the chain finds the marked one by its id");
  assert.equal(n.added.length, 2);
}

test("a teammate's unknown way.thirteenth is kept, marked, and the same writer's later way.move and item are taken", () => {
  takenThrough({ kind: "way.thirteenth", value: { way: WAY, ver: VER, thing: THING } }, /way\.thirteenth is not a kind the team trail takes/);
});

test("a teammate's ill-shaped way.move is kept, marked, and the same writer's later way.move and item are taken", () => {
  takenThrough({ kind: "way.move", value: { ...GOOD["way.move"], pass: true, by: 7 } }, /way\.move does not carry pass|way\.move's by is not a name/);
});

test("a way event with a bad signature or a broken chain is refused as before, never kept, mark or no mark", () => {
  const { frank, odd, move } = laterAfter({ kind: "way.thirteenth", value: { way: WAY } });
  const badSig = { ...odd, sig: move.sig };
  const m = frank.trail.merge([badSig, move]);
  assert.deepEqual(m.bad.map((b) => [b.id, b.why]).sort(), [[odd.id, "signature"], [move.id, "chain"]].sort());
  assert.equal(frank.trail.get(odd.id), null);
  assert.equal(frank.trail.get(move.id), null, "nothing after a refused one is kept, as for every kind");
  // a mark sent along with a good event is not taken: the mark is this Sol's own
  const { frank: f2, odd: o2, move: mv2 } = laterAfter({ kind: "way.thirteenth", value: { way: WAY } });
  f2.trail.merge([o2, { ...mv2, notUnderstood: "please skip me" }]);
  assert.equal(f2.trail.get(mv2.id)!.notUnderstood, undefined);
  assert.deepEqual(f2.trail.check(P).ok.map((e) => e.id), [mv2.id]);
});

test("an erased way.note still verifies everywhere; an erased event of an unknown way kind is still not understood", () => {
  const a = sol("macbook"), b = sol("nucbox");
  const note = a.trail.append({ project: P, by: FRANK, kind: "way.note", item: THING, value: GOOD["way.note"] });
  assert.equal(a.trail.erase(note.id, FRANK), true);
  assert.equal(a.trail.get(note.id)!.erased, true);
  assert.deepEqual(a.trail.check(P).bad, [], "its words are gone, its name still has its row");
  const m = b.trail.merge(a.trail.since(P));
  assert.deepEqual(m.bad, []);
  assert.equal(b.trail.get(note.id)!.erased, true);
  // a name with no row is not understood whether or not its value is there
  const isaac = sol("isaacmac");
  const { value: _v, ...gone } = forged(isaac, ISAAC, "way.bogus", { way: WAY });
  const v = verify([{ ...gone, erased: true }]);
  assert.deepEqual(v.bad.map((x) => x.why), ["kind"]);
  assert.deepEqual([v.ok.length, v.notUnderstood.length], [0, 1]);
});

test("every other family is as before: any value of a kind outside way is taken, kept and merged", () => {
  const a = sol("macbook"), b = sol("nucbox");
  const free = { text: "free words\nover two lines", n: 3, nested: { to: ["a", "b"], deep: { x: null } } };
  const kinds = ["item", "loose", "place", "route", "setting", "undo", "plan.step", "studio.cut", "people.joined", "wayside.note", "ways.made", "erase"];
  assert.equal(erasable("member"), false, "a role event is a fact, as a way file is (#987's seventeenth review, F1)");
  const out: TrailEvent[] = [];
  for (const kind of kinds) {
    assert.equal(kindError(kind, free), "", `${kind} is not looked at`);
    assert.equal(erasable(kind), true, `${kind} may be erased, as before`);
    if (kind === "erase") continue;   // an erase names the event it erases: made by erase() below
    out.push(a.trail.append({ project: P, by: FRANK, kind, ...(kind === "item" || kind === "loose" ? { item: `x-${kind}` } : {}), value: free }));
  }
  out.push(a.trail.append({ project: P, by: FRANK, kind: "studio.cut", value: "a string, not an object" }));
  out.push(a.trail.append({ project: P, by: FRANK, kind: "plan.step" }));
  assert.equal(a.trail.erase(out[0].id, FRANK), true);
  assert.deepEqual(a.trail.check(P).bad, []);
  const m = b.trail.merge(a.trail.since(P));
  assert.deepEqual(m.bad, []);
  assert.equal(m.added.length, out.length + 1, "every one, and the erase");
  assert.deepEqual(b.trail.get(out[1].id)!.value, free);
});

test("the team trail's table and the log's registry agree on every way.* kind", () => {
  assert.deepEqual(CHECKED, ["way"], "the trail checks the way family only");
  const local = new Map(KINDS.filter((r) => r.family === "way").map((r) => [r.kind, r.carries]));
  assert.deepEqual([...TEAM_KINDS.keys()].sort(), [...local.keys()].sort(), "the same kinds");
  for (const [kind, shape] of TEAM_KINDS) assert.deepEqual(shape, local.get(kind), `${kind}: the same fields`);
  assert.equal(TEAM_KINDS.size, 14);
  // and each says the same of one value: what the log keeps on its line, the trail takes
  for (const kind of TWELVE) {
    assert.equal(kindError(kind, GOOD[kind]), "");
    for (const [, v] of bads(kind)) assert.equal(kindError(kind, v), fits(kind, v), kind);
  }
});

test("an inherited name is no field of any row, in every family: fits names it, and the log keeps it off the line", () => {
  const d = dir("log"), log = dayTrail(d);
  const others: [string, Record<string, unknown>][] = [["plugin.load", { v: 1 }], ["seat.turn", { session: "s1" }], ["team.pointer", { project: "sol", kind: "item" }], ["thing.open", { mode: "work" }], ["way.agreed", GOOD["way.agreed"]]];
  for (const [kind, good] of others) {
    assert.equal(fits(kind, good), null, `${kind}: the value without it fits`);
    for (const f of INHERITED) {
      const v = withField(good, f, "my phone number is 555\nand more");
      assert.ok(Object.hasOwn(v, f), `${f} is the value's own field`);
      assert.equal(fits(kind, v), `${kind} does not carry ${f}`, `${kind}, ${f}`);
      assert.equal(placeOf(kind, v), "file", `${kind}, ${f}: in a value file, where it can be erased`);
      const e = log.append({ by: { person: "franktsai2008-eng" }, kind, value: v });
      const line = JSON.parse(readFileSync(logFiles(d).at(-1)!, "utf8").trim().split("\n").at(-1)!);
      assert.equal(line.id, e.id);
      assert.equal("value" in line, false, `${kind}, ${f}: not on the day's line`);
      assert.doesNotThrow(() => log.erase(e.id, { person: "franktsai2008-eng" }), `${kind}, ${f}: erasable`);
    }
  }
  assert.doesNotMatch(logFiles(d).map((f) => readFileSync(f, "utf8")).join("\n"), /phone number/, "no line holds the words");
  assert.equal(verifyLog(d).ok, true);
});

test("a bare `way` is a way kind with no row: refused on append, not understood on receive", () => {
  const { trail: t } = sol("macbook");
  assert.throws(() => t.append({ project: P, by: FRANK, kind: "way", value: { anything: "goes" } }), /^Error: the team trail takes no such event: way is not a kind the team trail takes$/);
  const isaac = sol("isaacmac"), bare = forged(isaac, ISAAC, "way", { anything: "goes" });
  const m = t.merge([bare]);
  assert.deepEqual(m.bad.map((b) => [b.id, b.why]), [[bare.id, "kind"]]);
  assert.deepEqual(m.added, []);
  assert.equal(t.get(bare.id), null);
  assert.deepEqual(t.check(P).notUnderstood.map((e) => e.id), [bare.id]);
});

test("a way fact is never erased: erase() refuses it, and an erase event from its writer erases nothing", () => {
  const a = sol("macbook"), b = sol("nucbox");
  const agreed = a.trail.append({ project: P, by: FRANK, kind: "way.agreed", value: GOOD["way.agreed"] });
  const note = a.trail.append({ project: P, by: FRANK, kind: "way.note", value: GOOD["way.note"] });
  assert.equal(a.trail.erase(agreed.id, FRANK), false, "its own writer cannot erase it");
  assert.equal(a.trail.erase(agreed.id), false, "nor this Sol alone");
  assert.deepEqual(a.trail.get(agreed.id)!.value, GOOD["way.agreed"]);
  assert.equal(a.trail.erase(note.id, FRANK), true, "a note's words may go");
  for (const k of TWELVE) assert.equal(erasable(k), k === "way.note", k);
  assert.equal(erasable("way.thirteenth"), true, "a kind with no row here: its writer's erase stands (it may be words)");
  // a teammate's Sol: an erase event that names a way fact (signed by the fact's own writer) is kept and erases nothing
  b.trail.merge(a.trail.since(P));
  const isaac = sol("isaacmac");
  const move = isaac.trail.append({ project: P, by: ISAAC, kind: "way.move", value: GOOD["way.move"] });
  const wipe = forged(isaac, ISAAC, "erase", undefined, move.id, move.at + 1, move.id);   // an erase event naming the move
  const m = b.trail.merge([move, wipe]);
  assert.deepEqual(m.bad, []);
  assert.deepEqual(b.trail.get(move.id)!.value, GOOD["way.move"], "the move's facts stay");
  assert.equal(b.trail.get(move.id)!.erased, undefined);
  assert.deepEqual(b.trail.check(P).bad, []);
});

test("an already-erased way fact from a teammate is not understood: never in ok or added, never handed out", () => {
  const isaac = sol("isaacmac"), frank = sol("macbook");
  // junk, erased before it was sent: its hash points at nothing anyone can check
  const { value: _v, ...junk } = forged(isaac, ISAAC, "way.move", { way: "made up", anything: true });
  const erasedJunk = { ...junk, erased: true as const };
  const later = forged(isaac, ISAAC, "item", { title: "Logo" }, junk.id, junk.at + 1, "logo");
  const m = frank.trail.merge([erasedJunk, later]);
  assert.deepEqual(m.bad.map((b) => [b.id, b.why]), [[junk.id, "kind"]]);
  assert.match(m.bad[0].line, /way\.move is a fact, and a fact is never erased/);
  assert.deepEqual(m.added.map((e) => e.id), [later.id], "the writer's later event is taken");
  assert.equal(frank.trail.get(junk.id), null);
  assert.deepEqual(frank.trail.since(P).map((e) => e.id), [later.id]);
  const c = frank.trail.check(P);
  assert.deepEqual(c.ok.map((e) => e.id), [later.id]);
  assert.deepEqual(c.notUnderstood.map((e) => e.id), [junk.id]);
  // an erased way.note is understood (its words may go)
  const { value: _w, ...noteGone } = forged(isaac, ISAAC, "way.note", GOOD["way.note"], later.id, later.at + 1);
  const n = frank.trail.merge([{ ...noteGone, erased: true as const }]);
  assert.deepEqual(n.bad, []);
  assert.equal(n.added.length, 1);
});

test("a fork through a kept, not understood event is refused as any fork", () => {
  const isaac = sol("isaacmac"), frank = sol("macbook");
  const odd = forged(isaac, ISAAC, "way.thirteenth", { way: WAY }, "", Date.UTC(2026, 10, 10, 12));
  const one = forged(isaac, ISAAC, "way.move", GOOD["way.move"], odd.id, Date.UTC(2026, 10, 10, 12, 1));
  const two = forged(isaac, ISAAC, "item", { title: "other" }, odd.id, Date.UTC(2026, 10, 10, 12, 2), "logo");
  const m = frank.trail.merge([odd, one, two]);
  assert.deepEqual(m.bad.map((b) => [b.id, b.why]).sort(), [[odd.id, "kind"], [two.id, "fork"]].sort(), "two events after the same one");
  assert.equal(frank.trail.get(two.id, { raw: true }), null);
  assert.equal(frank.trail.merge([two]).bad[0].why, "fork", "and again later, against the kept one");
  // and a fork of the kept event itself: a good event on the same previous ("") by the same key
  const rival = forged(isaac, ISAAC, "way.move", GOOD["way.move"], "", Date.UTC(2026, 10, 10, 13));
  assert.deepEqual(frank.trail.merge([rival]).bad.map((b) => b.why), ["fork"]);
});

test("a kept, not understood event changed on the disk is named by check(), and is no longer given back as kept", () => {
  const isaac = sol("isaacmac"), frank = sol("macbook");
  const odd = forged(isaac, ISAAC, "way.thirteenth", { way: WAY, note: "first" });
  frank.trail.merge([odd]);
  assert.deepEqual(frank.trail.check(P).notUnderstood.map((e) => e.id), [odd.id]);
  const r = frank.trail.raw.prepare("SELECT body FROM event WHERE id = ?").get(odd.id) as { body: string };
  frank.trail.raw.prepare("UPDATE event SET body = ? WHERE id = ?").run(r.body.replace('"first"', '"second"'), odd.id);
  const c = frank.trail.check(P);
  assert.deepEqual(c.bad.map((b) => [b.id, b.why]), [[odd.id, "content"]], "named as any changed event");
  assert.deepEqual(c.notUnderstood, []);
  assert.deepEqual(c.ok, []);
});

test("a kept, not understood event is never waiting to send, even when it was merged as not yet sent", () => {
  const isaac = sol("isaacmac"), frank = sol("macbook");
  const odd = forged(isaac, ISAAC, "way.thirteenth", { way: WAY });
  const move = forged(isaac, ISAAC, "way.move", GOOD["way.move"], odd.id, odd.at + 1);
  frank.trail.merge([odd, move], { sent: false });
  assert.deepEqual(frank.trail.waiting(P).map((e) => e.id), [move.id], "only the understood one waits");
  assert.equal(frank.trail.isWaiting(odd.id), false);
  assert.equal(frank.trail.isWaiting(move.id), true);
});

test("a Sol that later gains the row reads the kept event as understood, through every reader", () => {
  const isaac = sol("isaacmac"), frank = sol("macbook");
  const odd = forged(isaac, ISAAC, "way.thirteenth", { way: WAY, ver: VER, thing: THING });
  const after = forged(isaac, ISAAC, "way.move", GOOD["way.move"], odd.id, odd.at + 1);
  frank.trail.merge([odd, after], { sent: false });
  const d = door(frank);
  const ids = (es: { id: string }[]) => es.map((e) => e.id);
  // before: left out everywhere but a raw read and check()'s own list
  assert.deepEqual(ids(frank.trail.since(P)), [after.id]);
  assert.deepEqual(ids(d.since(P)), [after.id]);
  assert.deepEqual(ids(d.all()), [after.id]);
  assert.equal(d.get(odd.id), null);
  assert.deepEqual(ids(frank.trail.check(P).ok), [after.id]);
  assert.deepEqual(ids(frank.trail.waiting(P)), [after.id]);
  // the newer build: the same trail, a table that has the row
  const rows = TEAM_KINDS as Map<string, Shape>;
  rows.set("way.thirteenth", { way: "name", ver: "name", thing: "name" });
  try {
    assert.deepEqual(ids(frank.trail.since(P)), [odd.id, after.id], "since");
    assert.equal(frank.trail.get(odd.id)!.notUnderstood, undefined, "get, with no mark: none was stored");
    assert.deepEqual(ids(d.since(P)), [odd.id, after.id], "the door's since");
    assert.deepEqual(ids(d.all()), [odd.id, after.id], "the door's all");
    assert.equal(d.get(odd.id)!.id, odd.id, "the door's get");
    const c = frank.trail.check(P);
    assert.deepEqual(ids(c.ok), [odd.id, after.id], "check");
    assert.deepEqual([c.bad, c.notUnderstood], [[], []]);
    assert.deepEqual(ids(d.check(P).ok), [odd.id, after.id], "the door's check");
    assert.deepEqual(ids(frank.trail.waiting(P)), [odd.id, after.id], "waiting");
    assert.equal(frank.trail.isWaiting(odd.id), true);
  } finally { rows.delete("way.thirteenth"); }
  assert.equal(frank.trail.get(odd.id), null, "and back: nothing was stored either way");
});


test("the ways' switch off (#1105): the trail takes, keeps and hands out a teammate's way event as any kind, as before the ways came, the board folds none of them, and a fact is still never erased", () => {
  process.env.SOL_COWORK_WAYS = "off";
  try {
    // what the switch on refuses or sets aside: a kind with no row, a value that does not fit its row
    const unknown = laterAfter({ kind: "way.thirteenth", value: { way: WAY, ver: VER, thing: THING } });
    const m = unknown.frank.trail.merge([unknown.odd, unknown.move, unknown.item]);
    assert.deepEqual([m.bad, m.added.map((e) => e.id)], [[], [unknown.odd.id, unknown.move.id, unknown.item.id]], "nothing named, all three taken");
    const c = unknown.frank.trail.check(P);
    assert.deepEqual([c.bad, c.notUnderstood, c.ok.map((e) => e.id)], [[], [], [unknown.odd.id, unknown.move.id, unknown.item.id]]);
    assert.deepEqual(unknown.frank.trail.since(P).map((e) => [e.id, e.notUnderstood]), [[unknown.odd.id, undefined], [unknown.move.id, undefined], [unknown.item.id, undefined]]);
    assert.deepEqual(Object.keys(fold(c.ok).items), ["logo"], "the board folds no way event, as it never did");
    const wordy = forged(sol("isaacmac"), ISAAC, "way.move", { ...GOOD["way.move"], pass: true, by: 7 });
    assert.deepEqual(verify([wordy]).ok.map((e) => e.id), [wordy.id]);
    // an append is not looked at by kind either: only the ways' own writer, which checks its drafts itself, writes these
    const s = sol("macbook");
    assert.equal(s.trail.append({ project: P, by: FRANK, kind: "way.bogus", item: THING, value: { way: WAY } }).kind, "way.bogus");
    assert.equal(kindError("way.bogus", {}), "");
    assert.match(kindError("way.bogus", {}, false, true), /not a kind the team trail takes/, "asked with the switch on, as the writer asks");
    // never erased, switch or not: a role event and a way fact stay whole, here and on the cloud (TRAIL_FACTS)
    const seat = s.trail.append({ project: P, by: FRANK, kind: "member", item: "zoe", value: { role: "editor", in: true } });
    const fact = s.trail.append({ project: P, by: FRANK, kind: "way.move", item: THING, value: GOOD["way.move"] });
    assert.deepEqual([s.trail.erase(seat.id, FRANK), s.trail.erase(fact.id, FRANK)], [false, false]);
    assert.match(kindError("member", undefined, true), /a fact, and a fact is never erased/);
    assert.match(kindError("way.move", undefined, true), /a fact, and a fact is never erased/, "an already-erased way fact from a teammate is not taken as one either");
    assert.equal(kindError("way.note", undefined, true), "");
  } finally { process.env.SOL_COWORK_WAYS = "on"; }
});
