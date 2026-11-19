// Cowork ways, step 4b part 5 (docs/cowork-ways-2026-11-10/reports/step4-plan.md §7): the fold cache. A project's read
// from the cache (way-reader.ts readCached) is exactly what readWays(rowsOf(...)) gives: on a world the writer and the
// runner made, delivered to fresh Sols in many arrival orders and batches, after every delivery; and after a change of
// the rows the store makes in place (an erase) or the disk does (a row changed, a signature swapped). Nothing leaves
// this test's temp folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "sol-way-cache-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
process.env.SOL_STATE = join(dir, "state", "work.json");
process.env.SOL_TEAM = join(dir, "team.json");
process.env.SOL_HOME = join(dir, "home");
process.env.SOL_APPDIR = join(dir, "app");
process.env.SOL_LOGDIR = join(dir, "log");
process.env.SOL_COWORK_V3 = "on";
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_COWORK_WAYS = "on";   // the trail checks the ways' kinds only with their switch on (#1105)
delete process.env.SOL_WAY_CACHE_CHECK;   // this test compares by itself

const { Keys } = await import("../src/team/v3/keys.ts");
const { Trail, bodyOf, eventId, hashOf } = await import("../src/team/v3/trail.ts");
const { SIGNED_MAX, WAYFILE, forget, readCached, readWays, rowsOf, sameRead, signed } = await import("../src/team/v3/way-reader.ts");
const { WayFiles } = await import("../src/team/v3/way-files.ts");
const { press, runTurns } = await import("../src/team/v3/way-writer.ts");
const { load } = await import("../src/way/load.ts");
const { canonical } = await import("../src/canonical.ts");
const { DRAFTS_WAY } = await import("./fixtures/sol-drafts-way.ts");
type TrailEvent = import("../src/team/v3/trail.ts").TrailEvent;

const P = "lab", WAY = "sol.drafts";
const FILE = JSON.parse(DRAFTS_WAY.replaceAll('"sha256:tbd"', `"sha256:${"0123456789abcdef".repeat(4)}"`));
const L = load(FILE);
const T = (m: number) => Date.UTC(2026, 10, 13, 14, 0) + m * 60_000;
let count = 0;
const sol = (machine: string) => {
  const d = join(dir, `${machine}-${++count}`);
  const keys = new Keys(join(d, "keys"), machine);
  return { d, keys, trail: new Trail({ file: join(d, "trail.db"), keys }), files: new WayFiles(join(d, "ways")) };
};
type Sol = ReturnType<typeof sol>;
const FRANK = { person: "frank", machine: "nucbox" }, MARCO = { person: "marco", machine: "mini" }, ISAAC = { person: "isaac", machine: "ipad" };
const put = (s: Sol, by: { person: string; machine?: string; agent?: string }, kind: string, value: unknown, at: number, more: { item?: string; field?: string } = {}) =>
  s.trail.append({ project: P, by, kind, value, at, ...more });
const sync = (...sols: Sol[]) => { for (const a of sols) for (const b of sols) if (a !== b) b.trail.merge(a.trail.since(P, 0, Number.MAX_SAFE_INTEGER, { raw: true })); };
/** the cached read held against readWays over the rows read again: the same rows, the same read */
const same = (s: Sol, label: string) => {
  const c = readCached(s.trail, P), rows = rowsOf(s.trail, P);
  assert.equal(canonical(c.rows), canonical(rows.map((e) => ({ id: e.id, key: e.key, at: e.at }))), `${label}: rows`);
  assert.equal(sameRead(c.r, readWays(rows), rows), "", label);
  return c;
};
/** a seeded shuffle, so a failure names its order */
const rng = (seed: number) => () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };

/** an event of a kind this build has no row for (a newer Sol's), signed after Frank's NucBox's last event */
const later = (s: Sol, value: unknown, at: number): TrailEvent => {
  const signer = s.keys.machineKey("frank"), head = rowsOf(s.trail, P).filter((e) => e.key === signer.pub).at(-1);
  const body = bodyOf({ v: 2, project: P, by: FRANK, kind: "way.later", hash: hashOf(value), at, prev: head?.id ?? "", key: signer.pub, cert: signer.cert });
  return { ...body, seq: 0, id: eventId(body), sig: signer.sign(canonical(body)), value } as TrailEvent;
};

/** a world of most of what the door reads: the team (a guest naming himself owner, #1049), the way file, agreements,
 *  the first apply, presses, the runner's turns, `ways.start`, an agent, an erase by the content's own person and one by
 *  another, an event this build cannot read, a second way */
function world() {
  const nuc = sol("nucbox"), mini = sol("mini"), pad = sol("ipad");
  put(nuc, FRANK, "member", { role: "owner", in: true }, T(0), { item: "frank" });
  put(nuc, FRANK, "member", { role: "editor", in: true }, T(1), { item: "marco" });
  put(nuc, FRANK, "member", { role: "guest", in: true }, T(1), { item: "isaac" });
  put(nuc, FRANK, WAYFILE, FILE, T(2), { item: L.ver });
  sync(nuc, mini, pad);
  put(mini, MARCO, "way.agreed", { way: WAY, to: L.ver, role: "explorer" }, T(10));
  put(nuc, FRANK, "way.agreed", { way: WAY, to: L.ver, role: "keeper" }, T(11));
  sync(nuc, mini, pad);
  put(nuc, FRANK, "way.applied", { way: WAY, from: "", to: L.ver, reader: 1 }, T(20));
  sync(nuc, mini, pad);
  assert.ok(press(mini, P, WAY, { person: "marco" }, { thing: "d1", kind: "draft", move: "make", set: { title: "New logo", switch: "logo_v2" } }, () => T(30)).ok);
  sync(nuc, mini, pad);
  assert.ok(runTurns(nuc, P, "frank", () => T(31)).some((t) => t.ok));
  put(pad, ISAAC, "member", { role: "owner", in: true }, T(32), { item: "isaac" });
  put(nuc, FRANK, "setting", "member", T(33), { item: "project", field: "ways.start" });
  const loose = put(nuc, FRANK, "loose", { text: "gone soon" }, T(34), { item: "x1" });
  nuc.trail.erase(loose.id, FRANK);
  const marcos = put(mini, MARCO, "loose", { text: "Marco's" }, T(34), { item: "x2" });
  put(nuc, FRANK, "erase", undefined, T(35), { item: marcos.id });   // not his to erase: nothing
  put(nuc, { person: "frank", agent: "helper" }, "loose", { text: "an agent's" }, T(36), { item: "x3" });
  nuc.trail.merge([later(nuc, { way: WAY }, T(37))]);
  put(mini, MARCO, "way.agreed", { way: "sol.other", to: L.ver, role: "keeper" }, T(38));
  sync(nuc, mini, pad);
  press(mini, P, WAY, { person: "marco" }, { thing: "d1", move: "pull" }, () => T(40));
  sync(nuc, mini, pad);
  runTurns(nuc, P, "frank", () => T(41));
  sync(nuc, mini, pad);
  return { nuc, mini, pad };
}

test("4b cache: the cached read is readWays over the same rows, after every delivery of a world in sixteen arrival orders and batch sizes, and every Sol that holds it all reads the same", () => {
  const { nuc } = world();
  const all = nuc.trail.since(P, 0, Number.MAX_SAFE_INTEGER, { raw: true }).map(({ seq: _s, notUnderstood: _n, ...e }) => e);
  assert.ok(all.length >= 20, `a world of ${all.length} events`);
  const whole = readWays(rowsOf(nuc.trail, P));
  assert.equal(whole.ways.get(WAY)?.some((e) => e.unread), true, "the world holds an event this build cannot read");
  for (let seed = 1; seed <= 16; seed++) {
    if (seed % 4 === 0) forget();   // now and then a cold cache: every signature checked again
    const r = rng(seed), s = sol(`fresh${seed}`);
    let left = [...all].sort(() => r() - 0.5), n = 0;
    while (left.length) {
      const size = 1 + Math.floor(r() * (seed % 3 === 0 ? 8 : 3));
      const batch = left.slice(0, size);
      left = left.slice(size);
      s.trail.merge(batch);
      // what the store would not take yet (its writer's event before it is not here) comes again later
      const held = new Set(rowsOf(s.trail, P).map((e) => e.id));
      left.push(...batch.filter((e) => !held.has(e.id)));
      same(s, `seed ${seed}, delivery ${++n}`);
      assert.ok(n < 2000, "every event arrives in the end");
    }
    const end = same(s, `seed ${seed}, all`);
    assert.equal(sameRead(end.r, whole, end.rows), "", `seed ${seed}: the fold of a Sol that got it all in its order`);
  }
});

test("4b cache: the same rows give the same read without a new one; a change the store makes in place (an erase) or the disk makes (a row's words, a signature swapped) is a new read, and the cache says what readWays says", () => {
  const { nuc } = world();
  const a = same(nuc, "first"), b = same(nuc, "again");
  assert.equal(a, b, "kept: the same rows");
  // an erase done in place: the row keeps its seq, its text changes
  const loose = put(nuc, FRANK, "loose", { text: "erased in place" }, T(50), { item: "x4" });
  same(nuc, "added");
  assert.ok(nuc.trail.erase(loose.id));
  const c = same(nuc, "erased in place");
  assert.equal(rowsOf(nuc.trail, P).find((e) => e.id === loose.id)?.erased, true);
  assert.notEqual(c, b, "a new read");
  const body = (id: string) => (nuc.trail.raw.prepare("SELECT body FROM event WHERE id = ?").get(id) as { body: string }).body;
  const setBody = (id: string, t: string) => nuc.trail.raw.prepare("UPDATE event SET body = ? WHERE id = ?").run(t, id);
  // Marco's editor seat changed on the disk: its words are no longer its id, so the fold drops it, cached or not
  const seat = rowsOf(nuc.trail, P).find((e) => e.kind === "member" && e.item === "marco")!;
  const before = body(seat.id);
  setBody(seat.id, before.replace('"role":"editor"', '"role":"owner"'));
  const d = same(nuc, "a row's words changed");
  assert.equal(d.r.book.roleOf("marco", T(60)), null);
  setBody(seat.id, before);
  assert.equal(same(nuc, "put back").r.book.roleOf("marco", T(60)), "editor");
  // the same bytes stored as another type (a blob): the store does not read it as an event, nor does the cache (grade18 F1)
  nuc.trail.raw.prepare("UPDATE event SET body = CAST(body AS BLOB) WHERE id = ?").run(seat.id);
  assert.equal(same(nuc, "a row stored as a blob").r.book.roleOf("marco", T(60)), null);
  setBody(seat.id, before);
  assert.equal(same(nuc, "a text again").r.book.roleOf("marco", T(60)), "editor");
  // its signed words changed (its time), its id and signature kept: the id is worked out again, a signature seen before
  // vouches for nothing else
  setBody(seat.id, before.replace(`"at":${seat.at},`, `"at":${seat.at + 1},`));
  assert.notEqual(body(seat.id), before);
  assert.equal(same(nuc, "a signed word changed").r.book.roleOf("marco", T(60)), null);
  setBody(seat.id, before);
  assert.equal(same(nuc, "put back again").r.book.roleOf("marco", T(60)), "editor");
  // a signature swapped for another of the right shape: the id is the same, the check is not skipped
  const turn = rowsOf(nuc.trail, P).find((e) => e.kind.startsWith("way.") && e.by.machine === "nucbox")!;
  const other = rowsOf(nuc.trail, P).find((e) => e.key === turn.key && e.id !== turn.id)!;
  const was = body(turn.id);
  setBody(turn.id, was.replace(JSON.stringify(turn.sig), JSON.stringify(other.sig)));
  const e = same(nuc, "a signature swapped");
  assert.ok(!e.r.ways.get(WAY)?.some((x) => x.id === turn.id), "the swapped one is not read");
  setBody(turn.id, was);
  assert.ok(same(nuc, "signature put back").r.ways.get(WAY)?.some((x) => x.id === turn.id));
});

test("4b cache: what it hands out is shared, so frozen through: the rows, the lists, the way events and their values, the files, the book (the two Maps a caller only reads)", () => {
  const { nuc } = world();
  const { rows, r } = readCached(nuc.trail, P);
  const e = r.ways.get(WAY)!.find((x) => x.value)!;
  assert.throws(() => (r.ways.get(WAY) as unknown[]).push({}));
  assert.throws(() => { (e as { at: number }).at = 0; });
  assert.throws(() => { (e.value as Record<string, unknown>).role = "keeper"; });
  assert.throws(() => (rows as unknown[]).pop());
  assert.throws(() => { (rows[0] as { key: string }).key = ""; });
  assert.throws(() => (r.files as unknown[]).pop());
  assert.throws(() => { (r.files[0].file as Record<string, unknown>).id = "other.way"; });
  assert.throws(() => { (r.book as { roleOf: unknown }).roleOf = () => "owner"; });
});

test("4b cache: the signatures kept in two halves: when the newer is full in the middle of a read, nothing that read checked is forgotten (grade18 F3)", () => {
  const { nuc } = world();
  forget();
  for (let i = 0; i < SIGNED_MAX - 3; i++) signed.add(`fill ${i}`);
  const { r } = readCached(nuc.trail, P);
  assert.ok(r.ways.get(WAY)?.length);
  const all = nuc.trail.since(P, 0, Number.MAX_SAFE_INTEGER, { raw: true });
  assert.ok(all.length > 3);
  assert.deepEqual(all.filter((e) => !e.notUnderstood && !signed.has(`${e.id}\n${e.sig}`)).map((e) => e.id), []);
  forget();
});

test("4b cache: a key whose certificate its person never signed is refused every time, a cold check or after its signature was checked once; nothing of it is kept as checked", async () => {
  const { verify } = await import("../src/team/v3/trail.ts");
  const { nuc, mini } = world();
  const signer = nuc.keys.machineKey("frank"), marcos = mini.keys.machineKey("marco");
  const head = rowsOf(nuc.trail, P).filter((e) => e.key === signer.pub).at(-1)!;
  // Frank's machine key, its certificate carrying the signature of Marco's: the body is signed by the key it names
  const cert = { ...signer.cert!, sig: marcos.cert!.sig };
  const value = { text: "a forged certificate" };
  const body = bodyOf({ v: 2, project: P, by: FRANK, kind: "loose", item: "x9", hash: hashOf(value), at: T(60), prev: head.id, key: signer.pub, cert });
  const forged = { ...body, seq: 0, id: eventId(body), sig: signer.sign(canonical(body)), value } as TrailEvent;
  const seen = new Set<string>(), memo = { has: (k: string) => seen.has(k), add: (k: string) => void seen.add(k) };
  for (const o of [{}, { signed: memo }, { signed: memo }]) {
    const v = verify([...rowsOf(nuc.trail, P), forged], o);
    assert.deepEqual(v.bad.filter((b) => b.why !== "kind").map((b) => [b.id, b.why]), [[forged.id, "key"]]);   // (the newer kind is named too)
  }
  assert.equal(seen.has(`${forged.id}\n${forged.sig}`), false);
  assert.ok(seen.size > 0, "the others are kept as checked");
});
