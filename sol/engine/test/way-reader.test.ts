// Cowork ways, step 4b part 2 (docs/cowork-ways-2026-11-10/reports/step4-plan.md §1 to §3, §9 step 2): the reader from a
// project's team trail to the way engine, on real trails in a temp folder. Two Sols write (Frank's NucBox, the way's
// runner, and Marco's Mini), two more hold the same events merged in two orders, and every one of them folds the same.
// Nothing leaves this test's temp folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Keys } from "../src/team/v3/keys.ts";
import { Trail, bodyOf, eventId, hashOf, type TrailEvent } from "../src/team/v3/trail.ts";
import { AUTO, BASE_MAX, WAYFILE, places, readTrail, readWays, roleTable, rowsOf, startRule, whoOf } from "../src/team/v3/way-reader.ts";
import { WayFiles } from "../src/team/v3/way-files.ts";
import { recordOf, roleOf as port5RoleOf } from "../src/team/v3/port5.ts";
import { load } from "../src/way/load.ts";
import { decide } from "../src/way/moves.ts";
import { place, sealedDue, turn, written } from "../src/way/fold.ts";
import { due } from "../src/way/triggers.ts";
import { canonical } from "../src/canonical.ts";
import type { Draft, Way } from "../src/way/types.ts";
import { DRAFTS_WAY } from "./fixtures/sol-drafts-way.ts";
process.env.SOL_COWORK_WAYS = "on";   // the trail checks the ways' kinds only with their switch on (#1105)

const dir = mkdtempSync(join(tmpdir(), "sol-way-reader-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
const P = "lab", WAY = "sol.drafts";
const FILE = JSON.parse(DRAFTS_WAY.replaceAll('"sha256:tbd"', `"sha256:${"0123456789abcdef".repeat(4)}"`));
const L = load(FILE);
const T = (m: number) => Date.UTC(2026, 10, 13, 14, 0) + m * 60_000;
let count = 0;
/** one Sol: its own keys (its machine's name) and trail */
const sol = (machine: string) => {
  const d = join(dir, `${machine}-${++count}`);
  const keys = new Keys(join(d, "keys"), machine);
  return { d, keys, trail: new Trail({ file: join(d, "trail.db"), keys }), files: new WayFiles(join(d, "ways")) };
};
type Sol = ReturnType<typeof sol>;
const FRANK = { person: "frank", machine: "nucbox" }, MARCO = { person: "marco", machine: "mini" };
const put = (s: Sol, by: typeof FRANK, kind: string, value: unknown, at: number, more: { item?: string; field?: string; base?: string[] } = {}) =>
  s.trail.append({ project: P, by, kind, value, at, ...more });
/** a draft list written as one writer, in order: each draft's ids filled in from the events before it */
const write = (s: Sol, by: typeof FRANK, drafts: readonly Draft[], field?: string): TrailEvent[] => {
  const ids: string[] = [], out: TrailEvent[] = [];
  for (const d of drafts) {
    const e = s.trail.append({ project: P, by, kind: d.kind, item: d.item, value: written(d, ids), at: d.at, ...(d.base ? { base: d.base } : {}), ...(field ? { field } : {}) });
    ids.push(e.id); out.push(e);
  }
  return out;
};
const sync = (...sols: Sol[]) => { for (const a of sols) for (const b of sols) if (a !== b) b.trail.merge(a.trail.since(P)); };
/** what a Sol reads: the files it keeps, then the way's events placed under its book */
const read = (s: Sol, now = T(10_000)) => {
  const r = readTrail(s.trail, P);
  s.files.keep(r.files);
  const ways = (ver: string): Way | undefined => s.files.get(ver);
  return { r, ways, placed: place(WAY, r.ways.get(WAY) ?? [], ways, r.book, { now }) };
};
const view = (x: ReturnType<typeof read>) => canonical({ ver: x.placed.p.ver, things: x.placed.p.things, skipped: x.placed.p.skipped, waiting: x.placed.waiting, unread: x.placed.unread });

/** the team, the way file and the way started: Frank an owner, Marco an editor; each agrees from his own Sol; Frank applies */
function started() {
  const nuc = sol("nucbox"), mini = sol("mini");
  put(nuc, FRANK, "member", { role: "owner", in: true }, T(0), { item: "frank" });
  put(nuc, FRANK, "member", { role: "editor", in: true }, T(1), { item: "marco" });
  const file = put(nuc, FRANK, WAYFILE, FILE, T(2), { item: L.ver });
  sync(nuc, mini);
  put(mini, MARCO, "way.agreed", { way: WAY, to: L.ver, role: "explorer" }, T(10));
  put(nuc, FRANK, "way.agreed", { way: WAY, to: L.ver, role: "keeper" }, T(11));
  sync(nuc, mini);
  const ap = put(nuc, FRANK, "way.applied", { way: WAY, from: "", to: L.ver, reader: 1 }, T(20));
  sync(nuc, mini);
  return { nuc, mini, file, ap };
}

test("4b reader: the way starts from the trail on both Sols, Marco's press and the runner's turn are read as theirs, and two more Sols that got every event in two orders fold the same", () => {
  const { nuc, mini, file, ap } = started();
  for (const s of [nuc, mini]) assert.equal(read(s).placed.p.ver, L.ver, s.d);
  // Marco makes a draft on his Mini, from what his Sol reads
  const m = read(mini);
  const make = decide(L, m.placed.p, { asker: "person:marco", thing: "d1", kind: "draft", move: "make", set: { title: "New logo", switch: "logo_v2" } }, T(30));
  assert.ok(make.ok);
  const made = write(mini, MARCO, make.drafts);
  sync(nuc, mini);
  // the runner's turn on Frank's NucBox: what it writes is signed `auto`, read as the machine
  const now = T(31), events = read(nuc).r.ways.get(WAY)!;
  const me = { runner: "nucbox@frank", key: nuc.keys.machineKey("frank").pub };
  const t = turn(WAY, events, (v) => nuc.files.get(v), read(nuc).r.book, me, now);
  assert.ok(t.ok, String(t.why));
  const d = due(L, t.p, now, me.runner);
  const out = sealedDue(t, d, L.way!, now);
  assert.ok(out.drafts.length, "a receipt is owed: Marco's make is news");
  const runs = write(nuc, FRANK, out.drafts, AUTO);
  sync(nuc, mini);
  // two more Sols, each given every event, in two orders: Marco's first, or Frank's first
  const all = nuc.trail.since(P), mine = (e: TrailEvent) => e.by.person === "marco";
  const one = sol("one"), two = sol("two");
  one.trail.merge(all.filter(mine)); one.trail.merge(all.filter((e) => !mine(e)));
  two.trail.merge(all.filter((e) => !mine(e))); two.trail.merge(all.filter(mine));
  const views = [nuc, mini, one, two].map((s) => view(read(s)));
  assert.equal(new Set(views).size, 1, "every Sol folds the same");
  const r = read(one);
  assert.deepEqual([r.placed.p.things.d1?.state, r.placed.p.skipped, r.placed.waiting, r.placed.unread], ["on_switch", [], [], []]);
  const ev = new Map(r.r.ways.get(WAY)!.map((e) => [e.id, e]));
  assert.deepEqual(made.map((e) => ev.get(e.id)?.by), made.map(() => "person:marco"));
  assert.deepEqual(runs.map((e) => ev.get(e.id)?.by), runs.map(() => "machine:nucbox@frank"));
  assert.equal(ev.get(ap.id)?.by, "person:frank", "a press on the runner's own Sol is the person's: no `auto`");
  // places along Frank's machine key's chain, over every kind: two member events and the file, then his agreement
  const fk = nuc.keys.machineKey("frank").pub;
  const agreed = [...ev.values()].find((e) => e.kind === "way.agreed" && e.by === "person:frank")!;
  assert.deepEqual([agreed.key, agreed.n, agreed.after], [fk, 3, file.at]);
  assert.deepEqual([ev.get(ap.id)?.n, ev.get(ap.id)?.after], [4, agreed.at]);
  assert.deepEqual([ev.get(made[0].id)?.n, ev.get(made[0].id)?.after], [1, T(10)], "Marco's chain: his agreement, then his make");
  // only the way's kinds are handed over; the file is kept once, by its hash
  assert.ok([...ev.values()].every((e) => e.kind.startsWith("way.")));
  assert.deepEqual(readdirSync(join(one.d, "ways", WAY)), [`${L.ver}.json`]);
});

test("4b reader: who signed, as the engine reads it: an agent's key is the agent's, `auto` on a machine's key is the machine's, anything else the person's; `auto` with no machine, or a writer the engine cannot name, is dropped and named", () => {
  const e = (by: TrailEvent["by"], field?: string) => ({ by, ...(field ? { field } : {}) }) as TrailEvent;
  assert.equal(whoOf(e({ person: "frank", machine: "nucbox" })), "person:frank");
  assert.equal(whoOf(e({ person: "frank", machine: "nucbox" }, AUTO)), "machine:nucbox@frank");
  assert.equal(whoOf(e({ person: "frank", machine: "nucbox", agent: "claude" }, AUTO)), "agent:frank", "an agent never signs as the machine");
  assert.equal(whoOf(e({ person: "frank", machine: "nucbox" }, "auto-ish")), "person:frank");
  assert.equal(whoOf(e({ person: "frank" }, AUTO)), null);
  assert.equal(whoOf(e({ person: "frank" })), "person:frank");
  assert.equal(whoOf(e({ person: "fr_ank", machine: "nucbox" })), null, "a login the engine's WHO does not take");
  // on a trail: Frank's person key (no machine) signing `auto` is dropped, and his later events still stand
  const s = sol("nucbox");
  put(s, FRANK, "member", { role: "owner", in: true }, T(0), { item: "frank" });
  const odd = put(s, { person: "frank" } as typeof FRANK, "way.seen", { way: WAY, ver: L.ver }, T(1), { field: AUTO });
  const r = readTrail(s.trail, P);
  assert.deepEqual(r.dropped, [{ id: odd.id, why: "no_writer" }]);
});

test("4b reader: the door refuses a time that is no time, a base of more than 256 names and checks of more than 64 by handing them over unread: they keep their place, and their key's later events still stand", () => {
  const { nuc, mini } = started();
  const odd: TrailEvent[] = [];
  odd.push(put(mini, MARCO, "way.checked", { way: WAY, ver: L.ver, thing: "d1", rule: "solid", seam: "gate.green", pv: 1, pkg: `sha256:${"0123456789abcdef".repeat(4)}`, pass: true, at: 1e300 }, T(40), { item: "d1" }));
  odd.push(put(mini, MARCO, "way.seen", { way: WAY, ver: L.ver }, T(41), { base: Array.from({ length: BASE_MAX + 1 }, (_, i) => i.toString(16).padStart(64, "0")) }));
  odd.push(put(mini, MARCO, "way.fired", { way: WAY, ver: L.ver, trigger: "remind", tick: T(42), checks: Array.from({ length: 65 }, (_, i) => `c${i}`) }, T(42)));
  odd.push(put(mini, MARCO, "way.fired", { way: WAY, ver: L.ver, trigger: "remind", tick: 1e300 }, T(42) + 1));
  const fine = put(mini, MARCO, "way.agreed", { way: WAY, to: L.ver, role: "explorer" }, T(43));
  // not of the family `way`, though it says a way's name: not handed over
  const near = put(mini, MARCO, "waypoint", { way: WAY }, T(44), { item: "x" });
  // an event's own time that is no time (the trail takes any finite number): the last of Marco's chain
  const late = put(mini, MARCO, "way.seen", { way: WAY, ver: L.ver }, 1e300);
  sync(nuc, mini);
  const evs = new Map(readTrail(nuc.trail, P).ways.get(WAY)!.map((e) => [e.id, e]));
  assert.deepEqual(odd.map((e) => evs.get(e.id)?.unread), [true, true, true, true]);
  assert.deepEqual(odd.map((e) => evs.get(e.id)?.n), [1, 2, 3, 4], "each keeps its place on Marco's chain (his agreement is 0)");
  assert.deepEqual([evs.get(fine.id)?.unread, evs.get(fine.id)?.n], [undefined, 5]);
  assert.deepEqual([evs.has(near.id), evs.get(late.id)?.unread, evs.get(late.id)?.n], [false, true, 7]);
  const x = read(nuc);
  assert.deepEqual(x.placed.unread, [...odd, late].map((e) => e.id).sort());
  assert.equal(x.placed.p.ver, L.ver);
});

/** an event of a kind this build has no row for (a newer Sol's), signed by Frank's NucBox after his chain's last event,
 *  merged in as another Sol would hand it over: the trail keeps it, not understood */
const later = (s: Sol, value: unknown, at: number): TrailEvent => {
  const signer = s.keys.machineKey("frank"), head = rowsOf(s.trail, P).filter((e) => e.key === signer.pub).at(-1);
  const body = bodyOf({ v: 2, project: P, by: FRANK, kind: "way.later", hash: hashOf(value), at, prev: head?.id ?? "", key: signer.pub, cert: signer.cert });
  return { ...body, seq: 0, id: eventId(body), sig: signer.sign(canonical(body)), value } as TrailEvent;
};

test("4b reader: an event the trail keeps but this Sol cannot read stands unread in the way it names, or, naming none it can read, in every way; an erased note too", () => {
  const { nuc } = started();
  const other = sol("mini");
  const a = later(nuc, { way: WAY }, T(50));
  assert.equal(nuc.trail.merge([a]).bad[0]?.why, "kind", "kept, named once as not understood");
  const b = later(nuc, "words", T(51));
  nuc.trail.merge([b]);
  // a second way, so that "every way" is seen to be more than the first
  put(nuc, FRANK, "way.agreed", { way: "sol.other", to: L.ver, role: "keeper" }, T(52));
  void other;
  const r = readTrail(nuc.trail, P), n = places(rowsOf(nuc.trail, P)).get(a.id)!.n;
  for (const w of [WAY, "sol.other"]) {
    const got = r.ways.get(w)!.filter((e) => e.unread);
    assert.deepEqual(got.map((e) => [e.id, e.n, e.unread]), w === WAY ? [[a.id, n, true], [b.id, n + 1, true]] : [[b.id, n + 1, true]], w);
  }
  // a way.note erased by its writer: no value, so no way's name; it stands in every way's events
  const note = put(nuc, FRANK, "way.note", { way: WAY, about: "d1.title", words: "my phone is 555", because: "x" }, T(60));
  assert.ok(nuc.trail.erase(note.id, FRANK));
  const after = readTrail(nuc.trail, P);
  for (const w of [WAY, "sol.other"]) {
    const x = after.ways.get(w)!.find((e) => e.id === note.id)!;
    assert.deepEqual([x.erased, x.value, x.kind], [true, undefined, "way.note"], w);
  }
  // an event that names an empty way: dropped and named
  const empty = put(nuc, FRANK, "way.agreed", { way: "", to: L.ver, role: "keeper" }, T(61));
  assert.deepEqual(readTrail(nuc.trail, P).dropped.filter((d) => d.id === empty.id), [{ id: empty.id, why: "no_way" }]);
});

test("4b reader: the door applies an erase itself: a Sol that got the erase before what it erases reads it erased, as the Sol that got them in order (grade15 r1)", () => {
  const nuc = sol("nucbox"), mini = sol("mini"), late = sol("late");
  put(nuc, FRANK, "member", { role: "owner", in: true }, T(0), { item: "frank" });
  const promote = put(nuc, FRANK, "member", { role: "owner", in: true }, T(1), { item: "marco" });
  const note = put(nuc, FRANK, "way.note", { way: WAY, about: "d1.title", words: "my phone is 555", because: "x" }, T(2));
  put(nuc, FRANK, "way.agreed", { way: "sol.other", to: L.ver, role: "keeper" }, T(3));
  put(nuc, FRANK, "way.agreed", { way: WAY, to: L.ver, role: "explorer" }, T(4));
  const first = nuc.trail.since(P);
  assert.equal(nuc.trail.erase(promote.id, FRANK), false, "a role event is a fact (grade17 F1)");
  nuc.trail.erase(note.id, FRANK);
  const erases = nuc.trail.since(P).filter((e) => e.kind === "erase");
  mini.trail.merge(nuc.trail.since(P));                 // in order: erased on arrival
  late.trail.merge([...first.slice(0, 1)]);            // Frank's chain up to the first event,
  late.trail.merge(first.slice(1));                    // then the rest, unerased: no erase seen yet
  late.trail.merge(erases);                            // the erases last: the store erases what it holds
  const early = sol("early");
  early.trail.merge(first.slice(0, 1));
  // (an erase is chained after what it erases on Frank's key, so it cannot reach a Sol before its target from the same
  // writer; the door reads the erase whatever the store did)
  early.trail.merge([...first.slice(1), ...erases]);
  const rows = (s: Sol) => readTrail(s.trail, P);
  for (const s of [mini, late, early]) {
    const r = rows(s);
    assert.equal(r.book.roleOf("marco", T(5)), "owner", `${s.d}: the role stands on every Sol`);
    for (const w of [WAY, "sol.other"]) {
      const x = r.ways.get(w)?.find((e) => e.id === note.id);
      assert.deepEqual([x?.erased, x?.value], [true, undefined], `${s.d} ${w}: erased, and in every way`);
    }
  }
  // an erase that is not its writer's own (Marco's, of Frank's note), or of a fact (Frank's own agreement): nothing
  const ag = put(nuc, FRANK, "way.agreed", { way: WAY, to: L.ver, role: "keeper" }, T(6));
  const words = put(nuc, FRANK, "way.note", { way: WAY, about: "d1.title", words: "keep me", because: "x" }, T(7));
  nuc.trail.append({ project: P, by: FRANK, kind: "erase", item: ag.id, at: T(8) });
  mini.trail.merge(nuc.trail.since(P));
  mini.trail.append({ project: P, by: MARCO, kind: "erase", item: words.id, at: T(9) });
  const kept = new Map(readTrail(mini.trail, P).ways.get(WAY)!.map((e) => [e.id, e]));
  assert.deepEqual([kept.get(ag.id)?.erased, kept.get(words.id)?.erased, kept.get(words.id)?.value?.words], [undefined, undefined, "keep me"]);
  // the store erases only what it holds when the erase comes: Marco's agent writes a note, Marco's machine erases it,
  // and a Sol that gets the machine's chain first keeps the words on its disk. The door reads it erased all the same
  const agent = { ...MARCO, agent: "claude" } as typeof MARCO;
  sync(nuc, mini);
  const said = mini.trail.append({ project: P, by: agent, kind: "way.note", item: "d1", value: { way: WAY, about: "d1.title", words: "my phone is 555", because: "x" }, at: T(20) });
  assert.ok(mini.trail.erase(said.id, MARCO));
  const of = (k: string) => mini.trail.since(P).filter((e) => e.key === k);
  const first2 = sol("first2");
  first2.trail.merge(nuc.trail.since(P));
  first2.trail.merge(of(mini.keys.machineKey("marco").pub));
  first2.trail.merge(rowsOf(mini.trail, P).filter((e) => e.key === said.key).map((e) => (e.id === said.id ? { ...e, erased: undefined, value: { way: WAY, about: "d1.title", words: "my phone is 555", because: "x" } } : e)));
  assert.ok(rowsOf(first2.trail, P).some((e) => e.id === said.id && !e.erased), "its disk still has the words");
  for (const w of [WAY, "sol.other"]) {
    const x = readTrail(first2.trail, P).ways.get(w)?.find((e) => e.id === said.id);
    assert.deepEqual([x?.erased, x?.value], [true, undefined], `the door erased it, in every way: ${w}`);
  }
});

test("4b reader: the role table is Cowork v3's own (standing.ts, #1100): `member` events that count, in the order every Sol agrees on, the last at or before a moment, one member whatever the case of the login; `ways.start` is an owner's own `setting`, the last at or before a moment, `owner` with none", () => {
  const s = sol("nucbox");
  put(s, FRANK, "member", { role: "owner", in: true }, T(0), { item: "frank" });
  put(s, FRANK, "member", { role: "editor", in: true }, T(1), { item: "marco" });
  put(s, FRANK, "member", true, T(2), { item: "isaac", field: "in" });                // no role said: passed over
  put(s, FRANK, "member", "guest", T(3), { item: "isaac", field: "role" });         // a role with no `in`, for someone not in: counts nothing
  put(s, FRANK, "member", { in: false }, T(5), { item: "marco" });
  put(s, FRANK, "member", { role: "owner", in: true }, T(7), { item: "marco" });
  put(s, FRANK, "member", { role: "boss" }, T(8), { item: "marco" });                  // not a role: passed over
  const roleOf = roleTable([...s.trail.check(P).ok].reverse());   // (read in the trail's order whatever order it is handed)
  assert.deepEqual([roleOf("frank", T(0) - 1), roleOf("frank", T(0)), roleOf("FRANK", T(99))], [null, "owner", "owner"]);
  assert.deepEqual([roleOf("marco", T(1)), roleOf("marco", T(4)), roleOf("marco", T(5)), roleOf("marco", T(6)), roleOf("marco", T(7)), roleOf("marco", T(9))], ["editor", "editor", null, null, "owner", "owner"]);
  assert.deepEqual([roleOf("isaac", T(2)), roleOf("isaac", T(3))], [null, null]);
  assert.deepEqual([roleOf("zoe", T(9)), roleOf("frank", NaN)], [null, null]);
  // a login written in two cases is one member (#1100, both of Cowork v3's folds): "Kim" an editor, "kim" taken out
  put(s, FRANK, "member", { role: "editor", in: true }, T(10), { item: "Kim" });
  put(s, FRANK, "member", { in: false }, T(11), { item: "kim" });
  const again = roleTable(s.trail.check(P).ok);
  assert.deepEqual([again("Kim", T(10)), again("kim", T(12)), again("KIM", T(12))], ["editor", null, null]);
  // out, then in again under another case: in
  put(s, FRANK, "member", { role: "editor", in: true }, T(12), { item: "ann" });
  put(s, FRANK, "member", { in: false }, T(13), { item: "ann" });
  put(s, FRANK, "member", { role: "guest", in: true }, T(14), { item: "Ann" });
  assert.equal(roleTable(s.trail.check(P).ok)("ann", T(15)), "guest");
  // twice in one millisecond by one key: in the order its chain has them, whatever their ids (grade15 r8)
  for (let i = 0; i < 6; i++) {
    const q = sol("nucbox");
    put(q, FRANK, "member", { role: "owner", in: true }, T(0), { item: "frank" });
    put(q, FRANK, "member", { role: "owner", in: true }, T(1), { item: `m${i}` });
    put(q, FRANK, "member", { in: false }, T(1), { item: `m${i}` });
    assert.equal(readTrail(q.trail, P).book.roleOf(`m${i}`, T(2)), null, `try ${i}`);
  }
  // ways.start: Frank (an owner) says member at 10 and owner at 30; Marco, an editor at 12, is not heard; an agent's,
  // another layer's, and a word that is no rule are passed over. Marco, an owner from 7, is heard at 20
  const t = sol("nucbox"), tm = sol("mini");
  const team = (login: string, role: string, at: number) => put(t, FRANK, "member", { role, in: true }, at, { item: login });
  team("frank", "owner", T(0)); team("marco", "editor", T(1));
  const set = (by: typeof FRANK, value: unknown, at: number, item = "project", field = "ways.start") => t.trail.append({ project: P, by, kind: "setting", item, field, value, at });
  set(FRANK, "member", T(10));
  sync(t, tm);
  tm.trail.append({ project: P, by: MARCO, kind: "setting", item: "project", field: "ways.start", value: "owner", at: T(12) });
  sync(t, tm);
  set({ ...FRANK, agent: "claude" } as typeof FRANK, "owner", T(14));
  set(FRANK, "owner", T(15), "team");
  set(FRANK, "anyone", T(16));
  team("marco", "owner", T(18));
  sync(t, tm);
  tm.trail.append({ project: P, by: MARCO, kind: "setting", item: "project", value: { "ways.start": "owner", pings: "any time" }, at: T(20) });
  sync(t, tm);
  set(FRANK, "member", T(30));
  set(FRANK, null, T(40));                             // back to the default (people.ts reads null or "" so)
  set(FRANK, "member", T(50));
  set(FRANK, "", T(60));
  const v = t.trail.check(P).ok, rule = startRule(v, roleTable(v));
  assert.deepEqual([T(9), T(10), T(13), T(17), T(20), T(29), T(30), T(40), T(50), T(60)].map(rule), ["owner", "member", "member", "member", "owner", "owner", "member", "owner", "member", "owner"]);
  assert.equal(startRule([], roleTable([]))(T(0)), "owner");
});

test("4b reader: the way's role table is the one Cowork v3 folds (#1049, #1100): a guest naming themself owner, an editor putting the owner out, an agent's role and the last owner leaving count nothing, and port5's fold agrees at every moment, in any order the events arrive", () => {
  const nuc = sol("nucbox"), mini = sol("mini"), air = sol("air");
  const ISAAC = { person: "isaac", machine: "air" };
  put(nuc, FRANK, "member", { role: "owner", in: true }, T(0), { item: "frank" });
  put(nuc, FRANK, "member", { role: "editor", in: true }, T(1), { item: "marco" });
  put(nuc, FRANK, "member", { role: "guest", in: true }, T(2), { item: "isaac" });
  sync(nuc, mini, air);
  air.trail.append({ project: P, by: ISAAC, kind: "member", item: "isaac", value: { role: "owner", in: true }, at: T(3) });    // #1049's repro
  air.trail.append({ project: P, by: ISAAC, kind: "member", item: "isaac", field: "role", value: "owner", at: T(4) });
  put(mini, MARCO, "member", { in: false }, T(5), { item: "frank" });                                                         // an editor puts the owner out
  put(nuc, { ...FRANK, agent: "claude" } as typeof FRANK, "member", { role: "owner", in: true }, T(6), { item: "marco" });     // an agent writes no role
  put(nuc, FRANK, "member", { in: false }, T(7), { item: "frank" });                                                          // the last owner: stays
  put(mini, MARCO, "member", { in: false }, T(8), { item: "marco" });                                                         // anyone may take themself out
  sync(nuc, mini, air);
  const evs = nuc.trail.check(P).ok;
  assert.equal(evs.filter((e) => e.kind === "member").length, 9, "every event is on the trail, counted or not");
  const roleOf = readTrail(nuc.trail, P).book.roleOf;
  assert.deepEqual(["frank", "marco", "isaac"].map((w) => roleOf(w, T(9))), ["owner", null, "guest"]);
  assert.deepEqual([roleOf("isaac", T(3)), roleOf("isaac", T(4)), roleOf("marco", T(6)), roleOf("marco", T(7))], ["guest", "guest", "editor", "editor"]);
  for (let i = 0; i < 20; i++) {
    const shuffled = [...evs].sort(() => Math.random() - 0.5), mine = roleTable(shuffled);
    for (let at = T(0); at <= T(9); at += T(1) - T(0)) {
      const theirs = recordOf(shuffled.filter((e) => e.at <= at) as Parameters<typeof recordOf>[0]);
      for (const w of ["frank", "marco", "isaac", "FRANK"]) assert.equal(mine(w, at), port5RoleOf(theirs, w), `${w} at ${at}, try ${i}`);
    }
  }
});

test("4b reader: an editor starts a way from the trail while an owner's setting says `member`, and not after it says `owner` again; the way started stays", () => {
  /** Frank (an owner) says `member` at 3, and `owner` again at `back`; Marco (an editor) applies the way at 20 */
  const world = (back: number) => {
    const nuc = sol("nucbox"), mini = sol("mini");
    const setStart = (value: string, at: number) => nuc.trail.append({ project: P, by: FRANK, kind: "setting", item: "project", field: "ways.start", value, at });
    put(nuc, FRANK, "member", { role: "owner", in: true }, T(0), { item: "frank" });
    put(nuc, FRANK, "member", { role: "editor", in: true }, T(1), { item: "marco" });
    put(nuc, FRANK, WAYFILE, FILE, T(2), { item: L.ver });
    setStart("member", T(3));
    sync(nuc, mini);
    put(mini, MARCO, "way.agreed", { way: WAY, to: L.ver, role: "explorer" }, T(10));
    put(nuc, FRANK, "way.agreed", { way: WAY, to: L.ver, role: "keeper" }, T(11));
    if (back < T(20)) setStart("owner", back);
    sync(nuc, mini);
    put(mini, MARCO, "way.applied", { way: WAY, from: "", to: L.ver, reader: 1 }, T(20));
    if (back > T(20)) setStart("owner", back);
    sync(nuc, mini);
    return [nuc, mini].map((s) => { const x = read(s); return [x.placed.p.ver, x.placed.p.skipped.map((k) => k.why)]; });
  };
  assert.deepEqual(world(T(25)), [[L.ver, []], [L.ver, []]], "started under `member`, and stays when it goes back to `owner`");
  assert.deepEqual(world(T(15)), [["", ["not_starter"]], ["", ["not_starter"]]], "signed after it went back: not Marco's to start");
});

test("4b reader: the same events of a project read the same whatever other projects a Sol holds: a version 1 event that points into another project starts its chain on every Sol (grade15 r2); a way file is a fact its writer cannot erase (r5); a base of 256 and checks of 64 are read", () => {
  const nuc = sol("nucbox"), mini = sol("mini");
  put(nuc, FRANK, "member", { role: "owner", in: true }, Date.UTC(2026, 9, 30), { item: "frank" });
  put(nuc, FRANK, "member", { role: "editor", in: true }, Date.UTC(2026, 9, 30) + 1, { item: "marco" });
  const file = put(nuc, FRANK, WAYFILE, FILE, T(2), { item: L.ver });
  const q = nuc.trail.append({ project: "other", by: FRANK, kind: "loose", value: { text: "in another project" }, at: T(3), item: "q1" });
  const s = mini.keys.signerFor(MARCO), value = { way: WAY, to: L.ver, role: "explorer" };
  const body = bodyOf({ v: 1, project: P, by: MARCO, kind: "way.agreed", hash: hashOf(value), at: Date.UTC(2026, 10, 1), prev: q.id, key: s.pub, cert: s.cert });
  const v1 = { ...body, id: eventId(body), sig: s.sign(canonical(body)), value };
  put(nuc, FRANK, "way.agreed", { way: WAY, to: L.ver, role: "keeper" }, T(11));
  put(nuc, FRANK, "way.applied", { way: WAY, from: "", to: L.ver, reader: 1 }, T(20));
  const ofP = [...nuc.trail.since(P), v1];
  const both = sol("both"), one = sol("one");
  both.trail.merge(ofP); both.trail.merge(nuc.trail.since("other"));
  one.trail.merge(ofP);
  assert.notDeepEqual(both.trail.check(P).bad, one.trail.check(P).bad, "the store's own check differs: it looks into the other project");
  assert.equal(view(read(both)), view(read(one)));
  assert.equal(read(one).placed.p.ver, L.ver);
  // the way file: its writer's erase erases nothing, so a Sol that comes later still reads the version
  assert.equal(nuc.trail.erase(file.id, FRANK), false);
  const later = sol("later");
  later.trail.merge([...nuc.trail.since(P), v1]);
  assert.equal(read(later).placed.p.ver, L.ver);
  // the bounds themselves are read
  const at256 = put(nuc, FRANK, "way.seen", { way: WAY, ver: L.ver }, T(30), { base: Array.from({ length: BASE_MAX }, (_, i) => i.toString(16).padStart(64, "0")) });
  const at64 = put(nuc, FRANK, "way.fired", { way: WAY, ver: L.ver, trigger: "remind", tick: T(31), checks: Array.from({ length: 64 }, (_, i) => `c${i}`) }, T(31));
  const evs = new Map(readTrail(nuc.trail, P).ways.get(WAY)!.map((e) => [e.id, e]));
  assert.deepEqual([evs.get(at256.id)?.unread, evs.get(at64.id)?.unread], [undefined, undefined]);
});

test("4b files: a way file is kept only when its hash is the ver it is named by, under its way's folder, and stays held after the event is gone; one changed on the disk is not used", () => {
  const s = sol("nucbox");
  const w = new WayFiles(join(s.d, "ways"));
  const other = { ...FILE, name: "another" };
  assert.deepEqual(w.keep([{ ver: L.ver, file: other }, { ver: "x".repeat(64), file: FILE }, { ver: "../" + L.ver, file: FILE }]), []);
  assert.deepEqual(w.keep([{ ver: L.ver, file: FILE }, { ver: L.ver, file: FILE }]), [L.ver]);
  assert.equal(w.get(L.ver)?.id, WAY);
  const again = new WayFiles(join(s.d, "ways"));
  assert.ok(again.has(L.ver));
  assert.equal(canonical(again.get(L.ver)), canonical(L.way), "read back from the disk, a new Sol's start");
  writeFileSync(join(s.d, "ways", WAY, `${L.ver}.json`), JSON.stringify(other));
  assert.equal(new WayFiles(join(s.d, "ways")).get(L.ver), undefined, "a file that is no longer its version is not used");
  assert.deepEqual(new WayFiles(join(s.d, "nothing-here")).get(L.ver), undefined);
});

test("4b reader: places count every kind a key wrote in the project, from its first event here; a key's chain is its own", () => {
  const s = sol("nucbox");
  const a = put(s, FRANK, "member", { role: "owner", in: true }, T(0), { item: "frank" });
  const b = put(s, FRANK, "loose", { text: "an idea" }, T(1), { item: "idea-1" });
  const c = put(s, { ...FRANK, agent: "claude" } as typeof FRANK, "loose", { text: "another" }, T(1), { item: "idea-2" });
  const d = put(s, FRANK, "way.agreed", { way: WAY, to: L.ver, role: "keeper" }, T(2));
  const at = places(s.trail.check(P).ok);
  assert.deepEqual([a, b, c, d].map((e) => at.get(e.id)), [{ n: 0 }, { n: 1, after: a.at }, { n: 0 }, { n: 2, after: b.at }]);
  // a chain whose start is not here has no place from there on, never a second place 0; a version 1 event that points
  // into another project starts its chain
  const gone = places([b, d]);
  assert.deepEqual([gone.get(b.id), gone.get(d.id)], [null, null]);
  const v1 = places([{ ...b, v: 1 }, d]);
  assert.deepEqual([v1.get(b.id), v1.get(d.id)], [{ n: 0 }, { n: 1, after: b.at }]);
  // a row whose prev is another key's event (one changed on the disk) does not continue that chain
  const other = places([a, { ...d, prev: a.id, key: "another-key" }]);
  assert.deepEqual(other.get(d.id), null);
});

test("4b reader: a row of a key's chain that does not check on this Sol's disk is not handed over, and the key's later events have no place here (set aside, never a second place, never a loop): a damaged disk hurts only its own Sol (grade15 r3, r4)", () => {
  const { nuc, mini } = started();
  const make = decide(L, read(mini).placed.p, { asker: "person:marco", thing: "d1", kind: "draft", move: "make", set: { title: "New logo", switch: "logo_v2" } }, T(30));
  write(mini, MARCO, make.drafts);
  const wanted = write(mini, MARCO, decide(L, read(mini).placed.p, { asker: "person:marco", thing: "d1", move: "want" }, T(35)).drafts);
  sync(nuc, mini);
  const body = (id: string) => (nuc.trail.raw.prepare("SELECT body FROM event WHERE id = ?").get(id) as { body: string }).body;
  const setBody = (id: string, b: string) => nuc.trail.raw.prepare("UPDATE event SET body = ? WHERE id = ?").run(b, id);
  // Marco's agreement, on Frank's disk, is changed: it no longer checks there
  const ag = nuc.trail.check(P).ok.find((e) => e.kind === "way.agreed" && e.by.person === "marco")!;
  const was = body(ag.id);
  setBody(ag.id, was.replace('"explorer"', '"keeper"'));
  const hurt = new Map(readTrail(nuc.trail, P).ways.get(WAY)!.map((e) => [e.id, e]));
  assert.equal(hurt.has(ag.id), false);
  assert.ok(wanted.every((e) => hurt.get(e.id) && hurt.get(e.id)!.n === undefined && hurt.get(e.id)!.key === undefined), "no place: set aside here");
  assert.deepEqual(read(mini).placed.p.things.d1?.state, "wanted", "Marco's Sol, whose disk is whole, is not touched");
  // a row whose prev is made to point at its successor: no loop, no hang
  setBody(ag.id, was);
  const make0 = nuc.trail.since(P).find((e) => e.kind === "way.made")!;
  setBody(ag.id, was.replace(`"prev":"${ag.prev}"`, `"prev":"${make0.id}"`));
  const t0 = Date.now();
  const r = readTrail(nuc.trail, P);
  assert.ok(Date.now() - t0 < 5000);
  assert.ok(r.ways.get(WAY)!.filter((e) => e.by === "person:marco").every((e) => e.n === undefined));
  // a row rewritten as a twin of Frank's apply (its id, its words) is not a second event at the apply's place
  setBody(ag.id, was);
  const ap = nuc.trail.since(P).find((e) => e.kind === "way.applied")!;
  const loose = put(nuc, { ...FRANK, agent: "claude" } as typeof FRANK, "loose", { text: "an idea" }, T(40), { item: "idea" });
  setBody(loose.id, body(ap.id));
  const x = read(nuc);
  assert.deepEqual([x.placed.forked, x.placed.p.ver], [[], L.ver]);
});
test("4b reader, the seventeenth review: an empty `agent` writes as its person in both folds (F4A); a role at a moment is the fold's at that whole millisecond, whatever fractions its events carry (F5)", () => {
  const ev = (id: string, person: string, item: string, value: Record<string, unknown>, at: number, by: Record<string, unknown> = {}) =>
    ({ id, seq: 0, project: P, kind: "member", item, value, at, by: { person, machine: "m", ...by }, key: `k-${person}`, sig: "" }) as unknown as TrailEvent;
  const t = T(0);
  const evs = [
    ev("a", "frank", "frank", { role: "owner", in: true }, t),
    ev("b", "frank", "marco", { role: "editor", in: true }, t + 60_000, { agent: null }),
    ev("c", "frank", "isaac", { role: "guest", in: true }, t + 60_000.25, { agent: "" }),
    ev("d", "frank", "isaac", { role: "editor" }, t + 60_000.75),
  ];
  const mine = roleTable(evs), theirs = recordOf(evs as Parameters<typeof recordOf>[0]);
  assert.deepEqual(["marco", "isaac"].map((w) => [mine(w, t + 120_000), port5RoleOf(theirs, w)]), [["editor", "editor"], ["editor", "editor"]]);
  assert.deepEqual([mine("isaac", t + 60_000), mine("isaac", t + 60_000.5), mine("isaac", t + 59_999)], ["editor", "editor", null], "the millisecond's last, at any fraction of it");
});
