// The record's three fields kept for the market (the v2 design §10 and §12, step M1): `from`, `hash`, `sig`; a block's
// fingerprint (fingerprint.ts); format 1 for a record and for the index (contract/index-format.ts). Each optional on a
// record: one without them loads as it did. The blocks are written into a home made for each test.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { STABLE_DIR } from "../src/kernel.ts";
import { Kernel } from "./kernels.ts";
import { columnsOf, originHeld, ORIGIN_ENV } from "../src/record.ts";
import { fingerprintOf, programFilesOf } from "../src/fingerprint.ts";
import { recordFits, entryOf, checkIndex, INDEX_FORMAT } from "../src/contract/index-format.ts";
import { kindRow } from "../src/contract/kinds.ts";

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OWN = (id: string) => JSON.parse(readFileSync(join(ENGINE, "blocks", id, "record.json"), "utf8")) as Record<string, unknown>;
const homes: string[] = [];
const was = process.env[ORIGIN_ENV];
process.env[ORIGIN_ENV] = "on";   // the switch on for every test here (with it off: record-origin-off.test.ts)
after(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
  if (was === undefined) delete process.env[ORIGIN_ENV]; else process.env[ORIGIN_ENV] = was;
});
function home() {
  const h = realpathSync(mkdtempSync(join(tmpdir(), "sol-origin-")));
  homes.push(h);
  mkdirSync(join(h, "things"));
  return h;
}
const lab = (h: string) => ({ logDir: join(h, "lab-log"), appDir: join(h, "app") });
/** a block with a record of its own columns, a face and an engine half */
function block(h: string, id: string, engine: string, rec: Record<string, unknown> = {}) {
  const d = join(h, "things", id);
  mkdirSync(d, { recursive: true });
  const r = { id, title: id, place: "card", reads: [], writes: [], versions: [{ v: 1, file: "v1.html", at: "2026-11-08", contract: 1 }], ...rec };
  writeFileSync(join(d, "record.json"), JSON.stringify(r));
  writeFileSync(join(d, "v1.html"), "<p>x</p>");
  writeFileSync(join(d, "ask.md"), "a test block");
  writeFileSync(join(d, "engine.js"), engine);
  return { d, r: r as Record<string, unknown> };
}
const why = (r: Record<string, unknown>) => (columnsOf(r) as { why: string }).why;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("1. Sol's own two records and a record with none of the new fields read as before, and load", async (t) => {
  assert.deepEqual(columnsOf(OWN("sticky")), { ok: true, columns: { room: "small", needs: null, stores: ["note"], hears: null } });
  const f = columnsOf(OWN("file-it"), "/Users/me");
  assert.ok(f.ok);
  assert.equal(f.columns.room, "big");
  assert.deepEqual(f.columns.needs?.folders, ["/Users/me/Library/Caches/Sol/file-it"]);
  for (const id of ["sticky", "file-it"]) { assert.equal(originHeld(OWN(id)), null); assert.deepEqual(recordFits(OWN(id), id), { ok: true }); }
  assert.deepEqual(columnsOf({ id: "plain", reads: [], writes: [] }), { ok: true, columns: { room: "small", needs: null, stores: [], hears: null } });

  const h = home();
  block(h, "plain", `export default (sol) => { sol.log("here"); };`);
  const k = new Kernel(h, { ...lab(h), stable: STABLE_DIR });
  t.after(() => k.stop());   // its workers stopped, whether the test holds or not
  await k.sync();
  for (const id of ["plain", "sticky"]) assert.equal(k.state(id)?.state, "loaded", k.state(id)?.why);
  assert.ok(!k.since().some((e) => e.kind === "plugin.altered"), "no record says a fingerprint: nothing is said");
});

test("2 and 3. from: ai, person, market are accepted; any other shape is refused with its reason", () => {
  for (const from of [{ kind: "ai" }, { kind: "person", who: "x" }, { kind: "market", ref: "pub/id" }, { kind: "market", who: "frank", ref: "frank/week" }])
    assert.deepEqual(columnsOf({ from }), { ok: true, columns: { room: "small", needs: null, stores: [], hears: null } }, JSON.stringify(from));
  assert.match(why({ from: { kind: "robot" } }), /^record\.json: from's kind is "robot", not ai, person, market$/);
  assert.match(why({ from: "ai" }), /^record\.json: from is not an object/);
  assert.match(why({ from: { kind: "ai", who: 3 } }), /^record\.json: from's who is not one line of words/);
  assert.match(why({ from: { kind: "ai", ref: "a\nb" } }), /from's ref is not one line of words/);
  assert.match(why({ from: { kind: "ai", who: "x".repeat(201) } }), /from's who is not one line of words \(200 characters at most\)/);
  assert.match(why({ from: { kind: "ai", url: "https://x" } }), /from has "url", which is not one of its fields \(kind, who, ref\)/);
  assert.match(why({ from: null }), /from is not an object/);
  assert.match(why({ hash: "abc" }), /hash is not a fingerprint \(64 lowercase hex digits\)/);
  assert.match(why({ hash: "A".repeat(64) }), /hash is not a fingerprint/);
  assert.equal(originHeld({ hash: "a".repeat(64) }), null);
});

test("4 to 7. the fingerprint: the same folder twice is the same; a byte of the current version or a field of the record changes it; old versions, the block's data, the ask, its own hash and sig do not", () => {
  const h = home();
  const { d, r } = block(h, "week", `export default () => {};\n`, { versions: [{ v: 1, file: "v1.html", at: "2026-11-01", contract: 1 }, { v: 2, file: "v2.html", engine: "engine.js", at: "2026-11-08", contract: 1 }], current: 2, stores: ["note"] });
  writeFileSync(join(d, "v2.html"), "<p>two</p>");
  const print = fingerprintOf(d, r);
  assert.match(print, /^[0-9a-f]{64}$/);
  assert.equal(fingerprintOf(d, r), print, "4: computed twice, the same");
  assert.deepEqual(programFilesOf(d, r), ["engine.js", "v2.html"], "the current version's face and engine half, nothing else");

  // 5: one byte of the current engine half, or of the current face
  writeFileSync(join(d, "engine.js"), `export default () => {};\r`);
  assert.notEqual(fingerprintOf(d, r), print, "5: one byte of the engine half");
  writeFileSync(join(d, "engine.js"), `export default () => {};\n`);
  assert.equal(fingerprintOf(d, r), print, "and back");
  writeFileSync(join(d, "v2.html"), "<p>twO</p>");
  assert.notEqual(fingerprintOf(d, r), print, "5: one byte of the current face");
  writeFileSync(join(d, "v2.html"), "<p>two</p>");

  // 6: an old version's file, the block's own data, the ask, the record's own hash and sig
  writeFileSync(join(d, "v1.html"), "<p>an old version, changed</p>");
  mkdirSync(join(h, "data", "week"), { recursive: true });
  writeFileSync(join(h, "data", "week", "note.json"), JSON.stringify({ lines: ["changed"] }));
  writeFileSync(join(d, "ask.md"), "a person's words, changed");
  writeFileSync(join(d, "v3.html"), "<p>a file no version names</p>");
  assert.equal(fingerprintOf(d, r), print, "6: none of these is the program");
  assert.equal(fingerprintOf(d, { ...r, hash: "f".repeat(64), sig: "" }), print, "6: the record's own hash and sig");
  assert.equal(fingerprintOf(d, { ...r, hash: "0".repeat(64), sig: "anything" }), print, "6: whatever they say");
  assert.equal(fingerprintOf(d, JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(r).reverse())))), print, "the record's key order is not part of it");

  // 7: any other field of the record
  assert.notEqual(fingerprintOf(d, { ...r, title: "Week" }), print, "7: its title");
  assert.notEqual(fingerprintOf(d, { ...r, current: 1 }), print, "7: another version current");
  assert.notEqual(fingerprintOf(d, { ...r, from: { kind: "ai" } }), print, "7: its from");
  // a file the record names that is not there is part of the print, and not the same as an empty one
  rmSync(join(d, "v2.html"));
  const missing = fingerprintOf(d, r);
  writeFileSync(join(d, "v2.html"), "");
  assert.notEqual(fingerprintOf(d, r), missing);
  assert.notEqual(missing, print);
});

test("8. sig: left out or empty is accepted; anything else is refused, not used yet", () => {
  assert.equal(columnsOf({}).ok, true);
  assert.equal(columnsOf({ sig: "" }).ok, true);
  for (const sig of ["abc", 0, null, {}, "ed25519:abc"]) assert.match(why({ sig }), /^record\.json: sig is not used yet: leave it out or empty/, JSON.stringify(sig));
});

test("9 and 10. the index, format 1: an entry built from a real block passes; one with no sol.contract, a flat key, or needs the record rules refuse fails, and says why", () => {
  const h = home();
  const d = join(h, "things", "sticky");
  cpSync(join(ENGINE, "blocks", "sticky"), d, { recursive: true });
  assert.match(entryOf("sol", d).ok ? "" : (entryOf("sol", d) as { why: string }).why, /it says no from: where it came from/);
  const e = entryOf("sol", d, { kind: "person", who: "the Sol team" });
  assert.ok(e.ok, (e as { why: string }).why);
  assert.deepEqual(e.entry, { key: "sol/sticky", title: "Sticky note", v: 1, sol: { contract: 1, needs: {}, from: { kind: "person", who: "the Sol team" }, hash: fingerprintOf(d, OWN("sticky")) } });
  const f = join(h, "things", "file-it");
  cpSync(join(ENGINE, "blocks", "file-it"), f, { recursive: true });
  const fe = entryOf("sol", f, { kind: "person", who: "the Sol team" });
  assert.ok(fe.ok, (fe as { why: string }).why);
  assert.deepEqual(fe.entry.sol.needs, OWN("file-it").needs, "needs as its record writes them");
  const index = { format: INDEX_FORMAT, plugins: [e.entry, fe.entry] };
  assert.deepEqual(checkIndex(index), { ok: true });
  assert.deepEqual(checkIndex(JSON.parse(JSON.stringify(index))), { ok: true }, "and as the file it is written to");

  const one = (change: (x: Record<string, any>) => void) => { const x = JSON.parse(JSON.stringify(e.entry)); change(x); return (checkIndex({ format: 1, plugins: [x] }) as { why: string }).why; };
  assert.match(one((x) => delete x.sol.contract), /^index: plugins\[0\] \(sol\/sticky\): has no sol\.contract: the contract it pins$/);
  assert.match(one((x) => (x.key = "sticky")), /^index: plugins\[0\] \(sticky\): key "sticky" is not publisher\/id/);
  assert.match(one((x) => (x.key = "Sol/sticky")), /is not publisher\/id/);
  assert.match(one((x) => (x.sol.needs = { domains: ["api.github.com"], x: 1 })), /sol\.needs has "x", which is not one of its columns/);
  assert.match(one((x) => (x.sol.needs = { domains: ["https://api.github.com"], why: "w" })), /sol\.needs\.domains has "https:\/\/api\.github\.com", which is not a host name/);
  assert.match(one((x) => (x.sol.needs = { keys: ["github"] })), /sol\.needs\.why is missing/);
  assert.match(one((x) => delete x.sol.from), /has no sol\.from: where it came from/);
  assert.match(one((x) => (x.sol.from = { kind: "robot" })), /sol\.from's kind is "robot"/);
  assert.match(one((x) => (x.sol.hash = "nope")), /sol\.hash is not a fingerprint/);
  assert.match(one((x) => (x.sol.stores = ["note"])), /sol has "stores", which is not one of its fields \(contract, needs, from, hash\)/);
  assert.match(one((x) => delete x.sol), /has no sol column/);
  assert.match(one((x) => (x.v = 0)), /v is not a whole number/);
  assert.match((checkIndex({ format: 1, plugins: [e.entry, e.entry] }) as { why: string }).why, /plugins\[1\] \(sol\/sticky\): its key is in the index twice/);
  assert.match((checkIndex({ format: 2, plugins: [] }) as { why: string }).why, /^index: format is 2, not 1$/);
  assert.match((checkIndex({ plugins: [] }) as { why: string }).why, /format is undefined, not 1/);
  assert.match((checkIndex({ format: 1 }) as { why: string }).why, /plugins is not a list/);
  assert.match((entryOf("Sol Team", d, { kind: "ai" }) as { why: string }).why, /is not a publisher's name/);
});

test("11. a plugin's record validates against format 1: Marco's columns, the beta's, from and hash, in one call", () => {
  const h = home();
  const { d, r } = block(h, "week", `export default () => {};\n`, {
    // Marco's (#630, #633)
    place: "card", contract: 1, reads: ["tasks"], writes: ["tasks"], listens: ["tasks"], current: 1,
    // the beta's
    room: "big", needs: { why: "to read the week's events from the calendar", domains: ["calendar.example.com"], keys: ["calendar"], tools: [{ name: "week", description: "the week" }], every: [60000], provides: [] }, stores: ["seen"], hears: ["plugin.load", "seat.done"],
    // v2's
    from: { kind: "market", who: "isaac", ref: "isaac/week" }, sig: "",
  });
  const full = { ...r, hash: fingerprintOf(d, r) };
  assert.deepEqual(recordFits(full, "week"), { ok: true });
  writeFileSync(join(d, "record.json"), JSON.stringify(full));
  const e = entryOf("isaac", d);
  assert.ok(e.ok, (e as { why: string }).why);
  assert.equal(e.entry.sol.hash, full.hash, "the index's fingerprint is the record's");
  assert.deepEqual(e.entry.sol.from, full.from);
  assert.deepEqual(checkIndex({ format: 1, plugins: [e.entry] }), { ok: true });
  // and what does not hold, said
  const no = (x: Record<string, unknown>) => (recordFits(x, "week") as { why: string }).why;
  assert.match(no({ ...full, id: "other" }), /id is "other" but the folder is "week"/);
  assert.match(no({ ...full, reads: undefined }), /reads and writes are not declared as lists/);
  assert.match(no({ ...full, contract: 0 }), /contract is not the number it was made under/);
  assert.match(no({ ...full, listens: "tasks" }), /listens is not a list of words/);
  assert.match(no({ ...full, versions: [] }), /versions is not a list of versions/);
  assert.match(no({ ...full, current: 3 }), /current names version 3/);
  assert.match(no({ ...full, versions: [{ v: 1, file: "page.html" }] }), /version 1's file "page.html" is not vN.html/);
  assert.match(no({ ...full, room: "huge" }), /room is "huge"/);
  assert.match(no({ ...full, from: { kind: "robot" } }), /from's kind is "robot"/);
  assert.match(no({ ...full, hash: "x" }), /hash is not a fingerprint/);
  assert.match(no({ ...full, sig: "abc" }), /sig is not used yet/);
  assert.equal(recordFits("week").ok, false);
});

test("the kernel: via.pkg is the block's fingerprint; a record whose hash its folder is not loads and says so, once a load; a wrong from or sig breaks it with why", async (t) => {
  const h = home();
  const engine = `export default (sol) => { sol.log("here"); };`;
  const a = block(h, "same", engine);
  writeFileSync(join(a.d, "record.json"), JSON.stringify({ ...a.r, hash: fingerprintOf(a.d, a.r) }));
  const b = block(h, "moved", engine, { hash: "0".repeat(64), from: { kind: "market", ref: "isaac/moved" } });
  block(h, "robot", engine, { from: { kind: "robot" } });
  block(h, "signed", engine, { sig: "ed25519:abc" });
  const k = new Kernel(h, lab(h));
  t.after(() => k.stop());
  await k.sync();
  await wait(200);
  for (const id of ["same", "moved"]) assert.equal(k.state(id)?.state, "loaded", k.state(id)?.why);
  assert.equal(k.state("robot")?.state, "broken");
  assert.match(k.state("robot")?.why ?? "", /^record\.json: from's kind is "robot", not ai, person, market$/);
  assert.match(k.state("signed")?.why ?? "", /^record\.json: sig is not used yet/);

  const ev = k.since();
  const line = (id: string) => ev.find((e) => e.kind === "plugin.line" && e.by.agent === id)!;
  assert.equal(line("same").via?.pkg, fingerprintOf(a.d, JSON.parse(readFileSync(join(a.d, "record.json"), "utf8"))), "via.pkg: the whole block, the record's hash left out");
  assert.equal(line("moved").via?.pkg, fingerprintOf(b.d, b.r));
  const altered = ev.filter((e) => e.kind === "plugin.altered");
  assert.equal(altered.length, 1, "only the one whose folder is not its hash");
  assert.equal(altered[0].item, "moved");
  assert.deepEqual(altered[0].value, { hash: "0".repeat(64), now: fingerprintOf(b.d, b.r) });
  assert.equal(kindRow("plugin.altered")?.hear, "open");

  // the folder changed after it was printed: said at the next load, and it still loads
  writeFileSync(join(a.d, "engine.js"), engine + "\n// changed\n");
  await k.sync();
  await wait(200);
  assert.equal(k.state("same")?.state, "loaded");
  const now = k.since().filter((e) => e.kind === "plugin.altered" && e.item === "same");
  assert.equal(now.length, 1);
  assert.equal((now[0].value as { hash: string }).hash, JSON.parse(readFileSync(join(a.d, "record.json"), "utf8")).hash);
});
