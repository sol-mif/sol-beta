// Cowork ways, step 4b part 3 (docs/cowork-ways-2026-11-10/reports/step4-plan.md §5, §9 step 3): the writer and the
// runner's loop, on real trails in a temp folder, written through the real door. Frank's NucBox is the way's runner,
// Marco's Mini a teammate's Sol, Isaac a guest. Every clock is handed in. Nothing leaves this test's temp folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "sol-way-writer-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
process.env.SOL_STATE = join(dir, "state", "work.json");
process.env.SOL_TEAM = join(dir, "team.json");
process.env.SOL_HOME = join(dir, "home");
process.env.SOL_APPDIR = join(dir, "app");
process.env.SOL_LOGDIR = join(dir, "log");
process.env.SOL_COWORK_V3 = "on";
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_WAY_CACHE_CHECK = "1";   // every read through the fold cache held against readWays (way-reader.ts)
process.env.SOL_COWORK_WAYS = "off";   // the ways' switch is on by default (#691); these tests start it off
// the team: a login (so nothing asks GitHub for one) and a room whose project on the trail is its cloud code
writeFileSync(process.env.SOL_TEAM, JSON.stringify({ me: { login: "frank", name: "Frank" }, relay: { key: "x" }, rooms: [{ id: "room-lab", name: "Lab", provider: "github", org: "acme", repos: ["acme/lab"], code: "ABCDEF" }] }));

const { Keys } = await import("../src/team/v3/keys.ts");
const { Trail } = await import("../src/team/v3/trail.ts");
const { AUTO, WAYFILE, readTrail, rowsOf } = await import("../src/team/v3/way-reader.ts");
const { WayFiles } = await import("../src/team/v3/way-files.ts");
const { EVERY, WayLoop, press, runTurns, timeFor, unfit, writeAll } = await import("../src/team/v3/way-writer.ts");
const { WAYS_ENV, teamWaysOn, waysOn } = await import("../src/team/v3/way-switch.ts");
const { load } = await import("../src/way/load.ts");
const { place } = await import("../src/way/fold.ts");
const { SKEW } = await import("../src/way/types.ts");
const { canonical } = await import("../src/canonical.ts");
const { DRAFTS_WAY } = await import("./fixtures/sol-drafts-way.ts");
type TrailEvent = import("../src/team/v3/trail.ts").TrailEvent;
type TrailDraft = import("../src/team/v3/trail.ts").Draft;

const P = "lab", WAY = "sol.drafts";
const FILE = JSON.parse(DRAFTS_WAY.replaceAll('"sha256:tbd"', `"sha256:${"0123456789abcdef".repeat(4)}"`));
const L = load(FILE);
const T = (m: number) => Date.UTC(2026, 10, 13, 14, 0) + m * 60_000;
const DAY = 1440;
let count = 0;
/** one Sol: its own keys (its machine's name), trail and way files */
const sol = (machine: string, keysFrom?: string) => {
  const d = join(dir, `${machine}-${++count}`);
  if (keysFrom) { mkdirSync(join(d, "keys", "frank"), { recursive: true }); copyFileSync(join(keysFrom, "keys", "frank", "person.pem"), join(d, "keys", "frank", "person.pem")); }
  const keys = new Keys(join(d, "keys"), machine);
  return { d, keys, trail: new Trail({ file: join(d, "trail.db"), keys }), files: new WayFiles(join(d, "ways")) };
};
type Sol = ReturnType<typeof sol>;
const FRANK = { person: "frank", machine: "nucbox" }, MARCO = { person: "marco", machine: "mini" };
const put = (s: Sol, by: { person: string; machine?: string; agent?: string }, kind: string, value: unknown, at: number, more: { item?: string; field?: string } = {}) =>
  s.trail.append({ project: P, by, kind, value, at, ...more });
const sync = (...sols: Sol[]) => { for (const a of sols) for (const b of sols) if (a !== b) b.trail.merge(a.trail.since(P)); };
const rows = (s: Sol) => rowsOf(s.trail, P);
const byId = (s: Sol) => new Map(rows(s).map((e) => [e.id, e]));
const read = (s: Sol, now = T(100 * DAY)) => {
  const r = readTrail(s.trail, P);
  s.files.keep(r.files);
  return { r, placed: place(WAY, r.ways.get(WAY) ?? [], (v: string) => s.files.get(v), r.book, { now }) };
};
const view = (s: Sol) => { const x = read(s).placed; return canonical({ ver: x.p.ver, things: x.p.things, skipped: x.p.skipped, waiting: x.waiting, unread: x.unread }); };
const at = (m: number) => () => T(m);
const MAKE = { thing: "d1", kind: "draft", move: "make", set: { title: "New logo", switch: "logo_v2" } };

/** the team, the way file and the way started: Frank an owner, Marco an editor, Isaac a guest; Frank applies at 20 */
function started() {
  const nuc = sol("nucbox"), mini = sol("mini");
  put(nuc, FRANK, "member", { role: "owner", in: true }, T(0), { item: "frank" });
  put(nuc, FRANK, "member", { role: "editor", in: true }, T(1), { item: "marco" });
  put(nuc, FRANK, "member", { role: "guest", in: true }, T(1), { item: "isaac" });
  put(nuc, FRANK, WAYFILE, FILE, T(2), { item: L.ver });
  sync(nuc, mini);
  put(mini, MARCO, "way.agreed", { way: WAY, to: L.ver, role: "explorer" }, T(10));
  put(nuc, FRANK, "way.agreed", { way: WAY, to: L.ver, role: "keeper" }, T(11));
  sync(nuc, mini);
  put(nuc, FRANK, "way.applied", { way: WAY, from: "", to: L.ver, reader: 1 }, T(20));
  sync(nuc, mini);
  return { nuc, mini };
}

test("4b writer: Marco's press on his Mini is judged and written as his, the runner's turn on Frank's NucBox signs `auto`, and every Sol that holds the events folds the same", () => {
  const { nuc, mini } = started();
  const before = rows(mini).length;
  const p = press(mini, P, WAY, { person: "marco" }, MAKE, at(30));
  assert.deepEqual([p.ok, p.why, p.whole, p.at], [true, "", true, T(30)]);
  assert.deepEqual(p.written.map((w) => w.kind), ["way.made", "way.move", "way.set", "way.note"]);
  assert.equal(rows(mini).length, before + 4, "written, each once");
  const got = byId(mini);
  for (const w of p.written) {
    const e = got.get(w.id)!;
    assert.deepEqual([e.at, e.by, e.field, e.key], [T(30), MARCO, undefined, mini.keys.machineKey("marco").pub], w.kind);
  }
  // the ids were filled in: the note and the set name the move
  const move = p.written[1].id;
  assert.deepEqual(p.written.slice(2).map((w) => (got.get(w.id)!.value as { because?: string }).because), [move, move]);
  sync(nuc, mini);
  // the runner's turn: on Frank's NucBox, for the way that names it; Marco's Mini runs none
  assert.deepEqual(runTurns(mini, P, "marco", at(31)), [], "no way names the Mini: not even folded");
  const t = runTurns(nuc, P, "frank", at(31));
  assert.equal(t.length, 1);
  assert.deepEqual([t[0].way, t[0].ok, t[0].whole, t[0].at, t[0].written.map((w) => w.kind)], [WAY, true, true, T(31), ["way.seen"]]);
  const seen = byId(nuc).get(t[0].written[0].id)!;
  assert.deepEqual([seen.field, seen.by, seen.at, seen.base], [AUTO, FRANK, T(31), [p.written[3].id]], "signed `auto`, Marco's last named");
  sync(nuc, mini);
  const ev = new Map(read(mini).r.ways.get(WAY)!.map((e) => [e.id, e]));
  assert.equal(ev.get(seen.id)?.by, "machine:nucbox@frank");
  assert.deepEqual(p.written.map((w) => ev.get(w.id)?.by), p.written.map(() => "person:marco"));
  // nothing new: the next turn writes nothing, and says so at a time after the last
  const again = runTurns(nuc, P, "frank", at(31));
  assert.deepEqual([again[0].ok, again[0].written, again[0].at], [true, [], T(31) + 1]);
  // two more Sols, each given every event, in two orders
  const all = nuc.trail.since(P), mine = (e: TrailEvent) => e.by.person === "marco";
  const one = sol("one"), two = sol("two");
  one.trail.merge(all.filter(mine)); one.trail.merge(all.filter((e) => !mine(e)));
  two.trail.merge(all.filter((e) => !mine(e))); two.trail.merge(all.filter(mine));
  assert.equal(new Set([nuc, mini, one, two].map(view)).size, 1, "every Sol folds the same");
  const x = read(one).placed;
  assert.deepEqual([x.p.things.d1?.state, x.p.skipped, x.waiting, x.unread, x.forked], ["on_switch", [], [], [], []]);
});

test("4b writer: a guest, or someone not in the project at the press's time, is told so and nothing is written; the standing is asked at the time the press is written at", () => {
  const { nuc, mini } = started();
  const isaac = sol("isaacmac");
  sync(nuc, isaac);
  const n = rows(isaac).length;
  assert.deepEqual(press(isaac, P, WAY, { person: "isaac" }, MAKE, at(30)), { ok: false, why: "guest", at: T(30), written: [], whole: true, acts: [] });
  assert.deepEqual(press(isaac, P, WAY, { person: "zoe" }, MAKE, at(30)).why, "not_in_project");
  assert.equal(rows(isaac).length, n, "nothing written for either");
  // Marco a guest from 42: a press at 41 is his, one at 43 is not
  put(nuc, FRANK, "member", { role: "guest", in: true }, T(42), { item: "marco" });
  sync(nuc, mini);
  assert.equal(press(mini, P, WAY, { person: "marco" }, MAKE, at(41)).ok, true);
  const m = rows(mini).length;
  assert.equal(press(mini, P, WAY, { person: "marco" }, { thing: "d1", move: "want" }, at(43)).why, "guest");
  assert.equal(rows(mini).length, m);
  // the clock says 41 but his Mini's chain already stands at 45: the press is written, and judged, at 45 + 1 ms, when
  // he is a guest
  put(mini, MARCO, "loose", { text: "an idea" }, T(45), { item: "idea-1" });
  assert.deepEqual(press(mini, P, WAY, { person: "marco" }, { thing: "d1", move: "want" }, at(41)), { ok: false, why: "guest", at: T(45) + 1, written: [], whole: true, acts: [] });
  // taken out of the project
  put(nuc, FRANK, "member", { in: false }, T(50), { item: "marco" });
  sync(nuc, mini);
  assert.equal(press(mini, P, WAY, { person: "marco" }, { thing: "d1", move: "want" }, at(51)).why, "not_in_project");
  // no way applied, or its file not held: nothing to judge on, nothing written
  const bare = sol("nucbox");
  put(bare, FRANK, "member", { role: "owner", in: true }, T(0), { item: "frank" });
  assert.equal(press(bare, P, WAY, { person: "frank" }, MAKE, at(1)).why, "not_applied");
  const nofile = sol("nucbox");
  nofile.trail.merge(nuc.trail.since(P).filter((e) => e.kind !== WAYFILE));
  const k = rows(nofile).length;
  assert.equal(press(nofile, P, WAY, { person: "frank" }, { thing: "d1", move: "pull" }, at(60)).why, "not_applied", "the version's file never came: no version in force here");
  assert.equal(rows(nofile).length, k);
});

test("4b writer: what is written is dated max(clock, the key's last + 1 ms), and judged at that time: a clock behind the chain, a press and a turn on the runner's own Sol at one clock, never one time; an agent's key keeps its own chain", () => {
  const { nuc, mini } = started();
  // Frank's NucBox stands at 20 (the apply); its clock says 15 (behind, within ten minutes)
  const a = press(nuc, P, WAY, { person: "frank" }, { thing: "d1", move: "pull" }, at(15));
  assert.deepEqual([a.ok, a.why, a.at], [false, "unknown_thing", T(20) + 1]);
  assert.deepEqual(a.written.map((w) => [w.kind, byId(nuc).get(w.id)!.at]), [["way.refused", T(20) + 1]], "a refusal is written, at the time it was judged");
  const t = runTurns(nuc, P, "frank", at(15));
  assert.deepEqual([t[0].ok, t[0].at], [true, T(20) + 2]);
  const t1 = t[0].written.map((w) => byId(nuc).get(w.id)!.at);
  assert.ok(t1.every((x) => x === T(20) + 2), "the turn's events at its time");
  const b = press(nuc, P, WAY, { person: "frank" }, { thing: "d1", move: "pull" }, at(15));
  assert.equal(b.at, T(20) + 3);
  // at one clock on the runner's own Sol: the turn (Marco's make is news to it), then a press one ms after it
  press(mini, P, WAY, { person: "marco" }, MAKE, at(50));
  sync(nuc, mini);
  const c = runTurns(nuc, P, "frank", at(60));
  assert.deepEqual(c[0].written.map((w) => w.kind), ["way.seen"]);
  const d = press(nuc, P, WAY, { person: "frank" }, { thing: "d1", move: "pull" }, at(60));
  assert.deepEqual([c[0].at, d.at], [T(60), T(60) + 1]);
  // Frank's agent: its own key, its own chain (empty here), so the clock as it is
  const g = press(nuc, P, WAY, { person: "frank", agent: "claude" }, { thing: "d1", move: "pull" }, at(60));
  assert.equal(g.at, T(60) + 1, "the machine's chain stands at 60 + 1 ms; the agent's has nothing: after the turn at 60, not after the machine's press");
  const e = byId(nuc).get(g.written[0].id)!;
  assert.deepEqual([e.by, e.at, e.key], [{ person: "frank", agent: "claude" }, T(60) + 1, nuc.keys.agent("frank", "claude").pub]);
  // an agent asks as itself: Marco's agent is in no role of the way (the explorer is Marco himself), so its make is refused
  sync(nuc, mini);
  const ma = press(mini, P, WAY, { person: "marco", agent: "claude" }, { ...MAKE, thing: "d2" }, at(62));
  assert.deepEqual([ma.ok, ma.why, ma.written.map((w) => w.kind)], [false, "not_allowed", ["way.refused"]]);
  assert.equal(press(mini, P, WAY, { person: "marco" }, { ...MAKE, thing: "d2" }, at(62)).ok, true, "Marco himself may");
  assert.equal(read(nuc).r.ways.get(WAY)!.find((x) => x.id === e.id)?.by, "agent:frank");
  // every event of the machine's key, in its chain's order, at a later time than the one before it
  const mk = nuc.keys.machineKey("frank").pub;
  const way = rows(nuc).filter((x) => x.key === mk && x.kind.startsWith("way.")).map((x) => x.at);
  assert.ok(way.slice(1).every((x, i) => x > way[i]), `strictly later: ${way.join(" ")}`);
  // timeFor itself
  const r = [{ key: "k", at: 100 }, { key: "k", at: 90 }, { key: "j", at: 10_000_000 }];
  assert.deepEqual([timeFor(r, "k", 50), timeFor(r, "k", 500), timeFor(r, "x", 7), timeFor([], "k", NaN), timeFor(r, "k", 1e300)], [101, 500, 7, { why: "no_time" }, { why: "no_time" }]);
  // the last time a clock may say, and a chain one ms past it: the time after it is no time
  const FAR = 8.64e15 - 366 * 86_400_000;
  assert.deepEqual([timeFor([{ key: "k", at: FAR - 1 }], "k", FAR), timeFor([{ key: "k", at: FAR }], "k", FAR)], [FAR, { why: "no_time" }]);
});

test("4b writer: a key whose last event is more than ten minutes past the clock writes nothing, a press or a turn; at ten minutes exactly it writes", () => {
  const { nuc } = started();
  put(nuc, FRANK, "loose", { text: "from a clock that ran ahead" }, T(200), { item: "idea-1" });
  const n = rows(nuc).length;
  const behind = T(200) - SKEW - 1;
  assert.deepEqual(press(nuc, P, WAY, { person: "frank" }, { thing: "d1", move: "pull" }, () => behind), { ok: false, why: "clock_ahead", written: [], whole: true, acts: [] });
  assert.deepEqual(runTurns(nuc, P, "frank", () => behind).map((x) => [x.ok, x.why, x.written]), [[false, "clock_ahead", []]]);
  assert.equal(rows(nuc).length, n);
  const edge = press(nuc, P, WAY, { person: "frank" }, { thing: "d1", move: "pull" }, () => T(200) - SKEW);
  assert.equal(edge.at, T(200) + 1);
  assert.equal(rows(nuc).length, n + 1);
});

test("4b runner: what the turn owes is written in its order, the pings and the acts handed back; a turn cut short is made up by the next, and the firing is written once", () => {
  const { nuc, mini } = started();
  press(mini, P, WAY, { person: "marco" }, MAKE, at(30));
  sync(nuc, mini);
  runTurns(nuc, P, "frank", at(31));
  // fifteen days on, after 09:30 in the way's zone: `remind` is due for d1
  const day15 = T(15 * DAY + 60);
  const fails = (k: number) => { let i = 0; const real = (d: TrailDraft) => nuc.trail.append({ ...d, by: { person: d.by.person, machine: nuc.keys.machineName } }); return (d: TrailDraft) => { if (i++ === k) throw new Error("the disk is full"); return real(d); }; };
  const cut = runTurns({ ...nuc, append: fails(0) }, P, "frank", () => day15);
  assert.deepEqual([cut[0].ok, cut[0].whole, cut[0].written, cut[0].error, cut[0].pings], [true, false, [], "the disk is full", []]);
  const full = runTurns(nuc, P, "frank", () => day15);
  assert.equal(full[0].whole, true);
  assert.deepEqual(full[0].written.map((w) => w.kind), ["way.fired"]);
  assert.deepEqual(full[0].pings.map((x) => [x.role, x.trigger, x.thing]), [["explorer", "remind", "d1"]]);
  assert.equal(full[0].at, day15, "nothing of the cut turn was written: the same time again");
  assert.equal(runTurns(nuc, P, "frank", () => day15)[0].written.length, 0, "fired once");
  const fired = rows(nuc).filter((e) => e.kind === "way.fired");
  assert.equal(fired.length, 1);
  assert.deepEqual([fired[0].field, (fired[0].value as { trigger: string }).trigger], [AUTO, "remind"]);
  // Marco drops d1: it enters `to_remove`, whose act (switch.off) is handed back owed, after the move that entered it
  sync(nuc, mini);
  const lost = press({ ...mini, append: () => { throw new Error("the disk is full"); } }, P, WAY, { person: "marco" }, { thing: "d1", move: "drop" }, () => day15 + 5);
  assert.deepEqual([lost.ok, lost.whole, lost.acts], [true, false, []], "a press not written whole owes no act: its move is not on the trail");
  const drop = press(mini, P, WAY, { person: "marco" }, { thing: "d1", move: "drop" }, () => day15 + 5);
  assert.equal(drop.ok, true);
  assert.deepEqual(drop.acts.map((a) => [a.seam, a.thing, a.because]), [["switch.off", "d1", drop.written.find((w) => w.kind === "way.move")!.id]]);
  assert.equal(drop.acts[0].fields.switch, "logo_v2");
});

test("4b writer: a press cut by a disk that fails after each of its drafts says which were written and that it was not whole; the Sol still folds what stands, and the press's next try is judged on it", () => {
  const world = started();
  const n = press({ ...sol("probe"), trail: world.mini.trail, keys: world.mini.keys, files: world.mini.files, append: () => { throw new Error("no"); } }, P, WAY, { person: "marco" }, MAKE, at(30));
  assert.deepEqual([n.written, n.whole, n.error], [[], false, "no"]);
  const kinds = ["way.made", "way.move", "way.set", "way.note"];
  const states: unknown[] = [];
  for (let k = 0; k <= kinds.length; k++) {
    const { mini } = started();
    let i = 0;
    const append = (d: TrailDraft) => { if (i++ === k) throw new Error("the disk is full"); return mini.trail.append({ ...d, by: { person: d.by.person, machine: mini.keys.machineName } }); };
    const p = press({ ...mini, append }, P, WAY, { person: "marco" }, MAKE, at(30));
    assert.deepEqual([p.written.map((w) => w.kind), p.whole], [kinds.slice(0, k), k === kinds.length], `cut at ${k}`);
    const x = read(mini).placed;
    states.push([x.p.things.d1 ? x.p.things.d1.state : "none", x.p.things.d1?.fields.switch ?? "-", x.forked.length]);
    // pressed again: a thing made stands, so the birth is refused, or the press is whole
    const again = press(mini, P, WAY, { person: "marco" }, MAKE, at(31));
    assert.equal(again.why, k === 0 ? "" : "thing_exists", `again after ${k}`);
  }
  assert.deepEqual(states, [["none", "-", 0], [null, "-", 0], ["on_switch", "-", 0], ["on_switch", "logo_v2", 0], ["on_switch", "logo_v2", 0]]);
});

test("4b runner: another key that signed as this runner in the way (a second Sol with the same machine name) stops the turn there", () => {
  const { nuc, mini } = started();
  press(mini, P, WAY, { person: "marco" }, MAKE, at(30));
  sync(nuc, mini);
  const twin = sol("nucbox", nuc.d);
  twin.trail.merge(nuc.trail.since(P));
  assert.notEqual(twin.keys.machineKey("frank").pub, nuc.keys.machineKey("frank").pub);
  assert.equal(runTurns(twin, P, "frank", at(31))[0].ok, true, "the twin writes its turn (it does not see the NucBox's yet)");
  sync(nuc, twin);
  const n = rows(nuc).length;
  assert.deepEqual(runTurns(nuc, P, "frank", at(40)).map((x) => [x.ok, x.why]), [[false, "twin"]]);
  assert.equal(rows(nuc).length, n);
  // the twin's own Sol sees the NucBox's key only when the NucBox has signed as runner: here it has not
  assert.equal(runTurns(twin, P, "frank", at(41))[0].why, undefined);
});

test("4b writer: drafts are held against the trail's limits and the door's before the first is written", () => {
  const ok = { kind: "way.seen", item: WAY, value: { way: WAY, ver: L.ver }, at: T(0) };
  assert.equal(unfit([ok, ok]), "");
  assert.match(unfit([ok, { ...ok, kind: "Way.Seen" }]), /^1 Way\.Seen: kind$/);
  assert.match(unfit([{ ...ok, item: "a b" }]), /item$/);
  assert.match(unfit([{ ...ok, at: NaN }]), /no_time$/);
  assert.match(unfit([{ ...ok, base: ["x"] }]), /base$/);
  assert.match(unfit([{ ...ok, base: Array.from({ length: 257 }, (_, i) => i.toString(16).padStart(64, "0")) }]), /base_too_long$/);
  assert.match(unfit([{ ...ok, kind: "way.fired", value: { way: WAY, ver: L.ver, trigger: "remind", tick: T(0), checks: Array.from({ length: 65 }, (_, i) => `c${i}`) } }]), /checks_too_long$/);
  assert.match(unfit([{ ...ok, kind: "way.seen", value: { way: WAY } }]), /way\.seen/, "the row's shape");
  assert.match(unfit([{ ...ok, kind: "way.note", value: { way: WAY, about: "d1.title", words: "x".repeat(70_000), because: "y" } }]), /too_big$/);
  assert.match(unfit([{ ...ok, kind: "way.note", value: { way: WAY, about: "d1.title", words: "字".repeat(22_000), because: "y" } }]), /too_big$/, "bytes, not characters");
  // the ids that stand in are as long as the trail's: a value that fits only with short ones does not
  const fit = (words: number) => unfit([ok, { kind: "way.note", item: "d1", value: { way: WAY, about: "d1.title", words: "x".repeat(words) }, at: T(0), cause: 0 }]);
  const room = 64 * 1024 - Buffer.byteLength(canonical({ way: WAY, about: "d1.title", words: "", because: "0".repeat(64) }));
  assert.deepEqual([fit(room), fit(room + 1)].map((x) => x.endsWith("too_big")), [false, true]);
  // writeAll: in order, ids filled, the field signed on each
  const s = sol("nucbox");
  put(s, FRANK, "member", { role: "owner", in: true }, T(0), { item: "frank" });
  const w = writeAll((d) => s.trail.append(d), P, FRANK, [ok, { kind: "way.refused", item: "d1", value: { way: WAY, ver: L.ver, thing: "d1", why: "x" }, at: T(1), cause: 0 }], AUTO);
  const got = byId(s);
  assert.deepEqual([w.whole, w.written.map((x) => got.get(x.id)!.field), (got.get(w.written[1].id)!.value as { because: string }).because], [true, [AUTO, AUTO], w.written[0].id]);
});

test("4b loop: off by its switch (no timer, nothing read); on, a turn of every project once a minute and soon after a pull; turned off, it stops at its next turn; a project that throws is said and the rest still turn", async () => {
  const { nuc, mini } = started();
  press(mini, P, WAY, { person: "marco" }, MAKE, at(30));
  sync(nuc, mini);
  let asked = 0;
  const projects = () => { asked++; return [P]; };
  const loop = new WayLoop({ sol: nuc, person: () => "frank", clock: at(31), projects, every: 10 * EVERY });
  // off: SOL_COWORK_WAYS says off
  assert.deepEqual([waysOn(), teamWaysOn(), loop.start(), loop.running, loop.tick(), asked], [false, false, false, false, null, 0]);
  loop.poke();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(asked, 0);
  // on, but Cowork v3 off: still off
  process.env[WAYS_ENV] = "on";
  process.env.SOL_COWORK_V3 = "off";
  assert.deepEqual([waysOn(), teamWaysOn(), loop.start()], [true, false, false]);
  process.env.SOL_COWORK_V3 = "on";
  try {
    assert.equal(loop.start(), true);
    assert.equal(loop.start(), false, "once");
    assert.equal((loop as unknown as { timer: { hasRef(): boolean } }).timer.hasRef(), false, "its timer keeps no process alive");
    const out = loop.tick()!;
    assert.deepEqual(out.get(P)!.map((x) => [x.way, x.ok, x.written.map((w) => w.kind)]), [[WAY, true, ["way.seen"]]]);
    // a pull: one turn soon, however many pokes
    asked = 0;
    loop.poke(); loop.poke(); loop.poke();
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(asked, 1);
    loop.poke();
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(asked, 2, "and again at the next pull");
    // a loop not started does not turn on a poke, the switch on or not
    const idle = new WayLoop({ sol: nuc, person: () => "frank", clock: at(31), projects, every: 10 * EVERY });
    idle.poke();
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(asked, 2);
    // a project that throws is said; the others turn
    const said: [string, string][] = [];
    nuc.trail.append({ project: "boom", by: FRANK, kind: WAYFILE, item: L.ver, value: FILE, at: T(0) });
    const broken = Object.create(nuc.trail) as typeof nuc.trail;
    broken.since = ((project: string, ...rest: unknown[]) => { if (project === "boom") throw new Error("unreadable"); return (nuc.trail.since as (...a: unknown[]) => TrailEvent[]).call(nuc.trail, project, ...rest); }) as typeof nuc.trail.since;
    const two = new WayLoop({ sol: { ...nuc, trail: broken }, person: () => "frank", clock: at(32), projects: () => ["boom", P], said: (p, x) => said.push([p, x instanceof Error ? x.message : "turned"]) });
    const res = two.tick()!;
    assert.deepEqual([said, [...res.keys()]], [[["boom", "unreadable"], [P, "turned"]], [P]]);
    // turned off: the next turn does nothing and stops the loop
    process.env[WAYS_ENV] = "off";
    asked = 0;
    assert.deepEqual([loop.tick(), loop.running, asked], [null, false, 0]);
  } finally { loop.stop(); process.env[WAYS_ENV] = "off"; }
  delete process.env[WAYS_ENV]; assert.equal(waysOn(), true, "on by default (#691)");
  for (const v of ["on", "1", "true", " ON ", "", "yes"]) { process.env[WAYS_ENV] = v; assert.equal(waysOn(), true, v); }
  for (const v of ["off", "0", "false", " OFF "]) { process.env[WAYS_ENV] = v; assert.equal(waysOn(), false, v); }
  process.env[WAYS_ENV] = "off";
});

test("4b runner: two ways run by one Sol in one turn: the second judged on the trail with the first's events, at a later time; a way not applied yet is said, not written", () => {
  const nuc = sol("nucbox"), mini = sol("mini");
  const FILE2 = { ...FILE, id: "sol.other" }, L2 = load(FILE2);
  put(nuc, FRANK, "member", { role: "owner", in: true }, T(0), { item: "frank" });
  put(nuc, FRANK, "member", { role: "editor", in: true }, T(1), { item: "marco" });
  put(nuc, FRANK, WAYFILE, FILE, T(2), { item: L.ver });
  put(nuc, FRANK, WAYFILE, FILE2, T(2), { item: L2.ver });
  assert.deepEqual(runTurns(nuc, P, "frank", at(3)), [], "no event of either way yet: nothing to turn");
  sync(nuc, mini);
  for (const [w, ver] of [["sol.other", L2.ver], [WAY, L.ver]]) {   // the trail meets sol.other first: turned by name all the same
    put(mini, MARCO, "way.agreed", { way: w, to: ver, role: "explorer" }, T(10));
    put(nuc, FRANK, "way.agreed", { way: w, to: ver, role: "keeper" }, T(11));
  }
  assert.deepEqual(runTurns(nuc, P, "frank", at(12)).map((x) => [x.way, x.ok, x.why]), [[WAY, false, "not_runner"], ["sol.other", false, "not_runner"]], "agreed, not applied: said");
  sync(nuc, mini);
  for (const [w, ver] of [[WAY, L.ver], ["sol.other", L2.ver]]) put(nuc, FRANK, "way.applied", { way: w, from: "", to: ver, reader: 1 }, T(20));
  sync(nuc, mini);
  for (const w of [WAY, "sol.other"]) assert.equal(press(mini, P, w, { person: "marco" }, MAKE, at(30)).ok, true, w);
  sync(nuc, mini);
  const t = runTurns(nuc, P, "frank", at(31));
  assert.deepEqual(t.map((x) => [x.way, x.ok, x.at, x.written.map((w) => w.kind)]), [[WAY, true, T(31), ["way.seen"]], ["sol.other", true, T(31) + 1, ["way.seen"]]]);
  sync(nuc, mini);
  for (const [s, w] of [[mini, WAY], [mini, "sol.other"], [nuc, WAY]] as const) {
    const r = readTrail(s.trail, P);
    const x = place(w, r.ways.get(w)!, (v: string) => s.files.get(v), r.book, { now: T(40) });
    assert.deepEqual([x.p.things.d1?.state, x.forked, x.waiting, x.p.skipped], ["on_switch", [], [], []], `${s.d} ${w}`);
  }
});

test("4b runner: a turn that writes a page before its firing hands back the act after the move that answers the firing, as written (sealedDue's moved index)", () => {
  const { nuc, mini } = started();
  press(mini, P, WAY, { person: "marco" }, MAKE, at(30));
  sync(nuc, mini);
  runTurns(nuc, P, "frank", at(31));
  // 257 keys write in the way (Marco's agents), more than one frontier holds: the turn writes a page first
  for (let i = 0; i < 257; i++) put(mini, { person: "marco", agent: `a${i}` }, "way.agreed", { way: WAY, to: L.ver, role: "explorer" }, T(40));
  sync(nuc, mini);
  // 22 days on, after 09:30: `expire` drops d1, and `to_remove`'s act is owed
  const t = runTurns(nuc, P, "frank", () => T(22 * DAY + 60));
  assert.equal(t[0].ok, true, String(t[0].why));
  const kinds = t[0].written.map((w) => w.kind);
  assert.equal(kinds[0], "way.seen", "the page");
  assert.ok(kinds.includes("way.fired") && kinds.includes("way.move"), kinds.join(" "));
  const move = t[0].written.find((w) => w.kind === "way.move")!;
  assert.deepEqual(t[0].acts.map((a) => [a.seam, a.thing, a.because]), [["switch.off", "d1", move.id]]);
  assert.equal((byId(nuc).get(t[0].written[0].id)!.value as { more?: boolean }).more, true);
});

test("4b runner (grade16 F1): a machine re-keyed under the same person key runs its ways on; a key that wrote only before this one is no twin, one that names this key's events is", () => {
  const { nuc, mini } = started();
  press(mini, P, WAY, { person: "marco" }, MAKE, at(30));
  sync(nuc, mini);
  assert.deepEqual(runTurns(nuc, P, "frank", at(31)).map((x) => [x.ok, x.written.map((w) => w.kind)]), [[true, ["way.seen"]]]);
  // the machine key lost and made again (keys.ts) under the person key: this Sol's own older `auto` events are another key's now
  const old = nuc.keys.machineKey("frank").pub;
  rmSync(join(nuc.d, "keys", "frank", "machine.nucbox.pem"));
  const keys = new Keys(join(nuc.d, "keys"), "nucbox");
  const again = { d: nuc.d, keys, trail: new Trail({ file: join(nuc.d, "trail.db"), keys }), files: new WayFiles(join(nuc.d, "ways")) };
  assert.notEqual(keys.machineKey("frank").pub, old);
  for (const day of [1, 2, 15]) {
    press(mini, P, WAY, { person: "marco" }, { ...MAKE, thing: `n${day}` }, at(day * DAY));
    sync(again, mini);
    const t = runTurns(again, P, "frank", at(day * DAY + 1));
    assert.deepEqual([t[0].ok, t[0].why, t[0].written.length > 0], [true, undefined, true], `day ${day}`);
  }
  // the old key, still on a second Sol, signs as runner after the new one wrote, naming it: a twin, on both sides
  const second = sol("nucbox", nuc.d);
  rmSync(join(second.d, "keys", "frank"), { recursive: true });
  mkdirSync(join(second.d, "keys", "frank"), { recursive: true });
  copyFileSync(join(nuc.d, "keys", "frank", "person.pem"), join(second.d, "keys", "frank", "person.pem"));
  const k2 = new Keys(join(second.d, "keys"), "nucbox"), live = { ...second, keys: k2, trail: new Trail({ file: join(second.d, "trail2.db"), keys: k2 }) };
  sync(again, mini, live);
  press(mini, P, WAY, { person: "marco" }, { ...MAKE, thing: "n99" }, at(16 * DAY));
  sync(again, mini, live);
  const named = runTurns(live, P, "frank", at(16 * DAY + 1));
  assert.deepEqual([named[0].ok, named[0].written.length > 0], [true, true], "it had never seen a twin name it");
  const its = rowsOf(live.trail, P).find((e) => e.id === named[0].written[0].id)!;
  assert.ok(its.base?.some((x) => rows(again).some((e) => e.id === x && e.key === keys.machineKey("frank").pub)), "it named the NucBox's new key");
  // another machine's `auto` event (Marco's Mini) that names the NucBox's events is no twin: it is not this runner
  const its2 = rows(again).filter((e) => e.key === keys.machineKey("frank").pub).at(-1)!;
  mini.trail.append({ project: P, by: MARCO, kind: "way.seen", item: WAY, value: { way: WAY, ver: L.ver }, at: T(16 * DAY), field: AUTO, base: [its2.id] });
  sync(again, mini);
  assert.deepEqual(runTurns(again, P, "frank", at(16 * DAY + 1) ).map((x) => [x.ok, x.why]), [[true, undefined]]);
  sync(again, live);
  assert.deepEqual(runTurns(again, P, "frank", at(16 * DAY + 2)).map((x) => [x.ok, x.why]), [[false, "twin"]]);
});

test("4b runner (grade16 F2): a turn cut after some of its drafts hands back the pings of the firings written and the acts of the moves written; the next turn does the rest", () => {
  const { nuc, mini } = started();
  press(mini, P, WAY, { person: "marco" }, MAKE, at(30));
  press(mini, P, WAY, { person: "marco" }, { ...MAKE, thing: "d2" }, at(31));
  sync(nuc, mini);
  runTurns(nuc, P, "frank", at(32));
  const real = (d: TrailDraft) => nuc.trail.append({ ...d, by: { person: d.by.person, machine: nuc.keys.machineName } });
  /** a disk that fails on the draft after the first of this kind */
  const failsAfter = (kind: string) => { let seen = false; return (d: TrailDraft) => { if (seen) throw new Error("the disk is full"); if (d.kind === kind) seen = true; return real(d); }; };
  const day15 = T(15 * DAY + 60);
  const cut = runTurns({ ...nuc, append: failsAfter("way.fired") }, P, "frank", () => day15);
  assert.deepEqual([cut[0].whole, cut[0].written.map((w) => w.kind), cut[0].pings.map((x) => [x.trigger, x.thing])], [false, ["way.fired"], [["remind", "d1"]]]);
  const rest = runTurns(nuc, P, "frank", () => day15);
  assert.deepEqual([rest[0].whole, rest[0].pings.map((x) => [x.trigger, x.thing])], [true, [["remind", "d2"]]]);
  // day 22: `expire` drops both; cut after d1's move, its act is owed now, d2's at the next turn
  const day22 = T(22 * DAY + 60);
  const c2 = runTurns({ ...nuc, append: failsAfter("way.move") }, P, "frank", () => day22);
  assert.equal(c2[0].whole, false);
  const moved = c2[0].written.filter((w) => w.kind === "way.move");
  assert.deepEqual(c2[0].acts.map((a) => [a.seam, a.thing, a.because]), [["switch.off", "d1", moved[0].id]]);
  const r2 = runTurns(nuc, P, "frank", () => day22);
  assert.deepEqual(r2[0].acts.map((a) => [a.thing, a.because]), [["d2", r2[0].written.find((w) => w.kind === "way.move")!.id]]);
  // (a press of this way writes nothing after a move that enters with an act: drop is the move alone; the press
  // shares owed() with the turn)
});

test("4b writer (grade16 F3): a room id and its project id are one: read and written under the trail's id, the press and the turn alike; a project with no way file is not read by the runner", () => {
  const C = "ABCDEF", nuc = sol("nucbox"), mini = sol("mini");
  const on = (s: Sol, by: typeof FRANK, kind: string, value: unknown, t: number, item?: string) => s.trail.append({ project: C, by, kind, value, at: t, ...(item ? { item } : {}) });
  const both = () => { for (const [a, b] of [[nuc, mini], [mini, nuc]]) b.trail.merge(a.trail.since(C)); };
  on(nuc, FRANK, "member", { role: "owner", in: true }, T(0), "frank");
  on(nuc, FRANK, "member", { role: "editor", in: true }, T(1), "marco");
  on(nuc, FRANK, WAYFILE, FILE, T(2), L.ver);
  both();
  on(mini, MARCO, "way.agreed", { way: WAY, to: L.ver, role: "explorer" }, T(10));
  on(nuc, FRANK, "way.agreed", { way: WAY, to: L.ver, role: "keeper" }, T(11));
  both();
  on(nuc, FRANK, "way.applied", { way: WAY, from: "", to: L.ver, reader: 1 }, T(20));
  both();
  const p = press(mini, "room-lab", WAY, { person: "marco" }, MAKE, at(30));
  assert.deepEqual([p.ok, p.written.length], [true, 4]);
  assert.equal(rowsOf(mini.trail, "room-lab").length, 0, "nothing under the room's id");
  assert.equal(press(mini, "room-lab", WAY, { person: "marco" }, MAKE, at(31)).why, "thing_exists", "judged on what it wrote");
  both();
  assert.deepEqual(runTurns(nuc, "room-lab", "frank", at(32)).map((x) => [x.ok, x.written.map((w) => w.kind)]), [[true, ["way.seen"]]]);
  assert.deepEqual(runTurns(nuc, C, "frank", at(33)).map((x) => [x.ok, x.written.length]), [[true, 0]], "the same project");
  // the loop turns it once, by whichever name the list gives
  let turned = 0;
  new WayLoop({ sol: nuc, person: () => "frank", clock: at(34), projects: () => ["room-lab", C, "nothing-here"], on: () => true, said: () => turned++ }).tick();
  assert.equal(turned, 1);
  // a project with rows but no way file: the runner reads nothing
  nuc.trail.append({ project: "plain", by: FRANK, kind: "member", value: { role: "owner", in: true }, at: T(0), item: "frank" });
  assert.deepEqual(runTurns(nuc, "plain", "frank", at(35)), []);
  const unreadable = Object.create(nuc.trail) as typeof nuc.trail;
  unreadable.since = (() => { throw new Error("read"); }) as typeof nuc.trail.since;
  assert.deepEqual(runTurns({ ...nuc, trail: unreadable }, "plain", "frank", at(35)), [], "not even read");
});

test("4b writer (grade16 F4): a press is never dated before the last runner event this Sol folded of the way, so its standing and its judgement are at the time every fold judges it", () => {
  // A: Marco an editor until 42, a guest from 42; the runner (clock ahead) signed at 45; Marco's clock says 40
  {
    const { nuc, mini } = started();
    press(mini, P, WAY, { person: "marco" }, MAKE, at(30));
    sync(nuc, mini);
    put(nuc, FRANK, "member", { role: "guest", in: true }, T(42), { item: "marco" });
    assert.equal(runTurns(nuc, P, "frank", at(45))[0].at, T(45));
    sync(nuc, mini);
    const n = rows(mini).length;
    assert.deepEqual([press(mini, P, WAY, { person: "marco" }, { thing: "d1", move: "want" }, at(40)).why, rows(mini).length], ["guest", n], "every fold would judge it at 45, when he is a guest");
  }
  // B: a guest from 35, an editor again from 41; the runner signed at 45; Marco's clock says 38: taken, at 45 + 1 ms
  {
    const { nuc, mini } = started();
    press(mini, P, WAY, { person: "marco" }, MAKE, at(30));
    sync(nuc, mini);
    put(nuc, FRANK, "member", { role: "guest", in: true }, T(35), { item: "marco" });
    put(nuc, FRANK, "member", { role: "editor", in: true }, T(41), { item: "marco" });
    runTurns(nuc, P, "frank", at(45));
    sync(nuc, mini);
    const p = press(mini, P, WAY, { person: "marco" }, { thing: "d1", move: "want" }, at(38));
    assert.deepEqual([p.ok, p.at], [true, T(45) + 1]);
    sync(nuc, mini);
    for (const s of [nuc, mini]) assert.equal(read(s, T(50)).placed.p.things.d1?.state, "wanted", s.d);
  }
  // C: the runner signed at 60; Marco's clock says 45, more than ten minutes before it: nothing written
  {
    const { nuc, mini } = started();
    press(mini, P, WAY, { person: "marco" }, MAKE, at(30));
    sync(nuc, mini);
    runTurns(nuc, P, "frank", at(60));
    sync(nuc, mini);
    const n = rows(mini).length;
    assert.deepEqual([press(mini, P, WAY, { person: "marco" }, { thing: "d1", move: "want" }, at(45)).why, rows(mini).length], ["runner_ahead", n]);
    assert.equal(press(mini, P, WAY, { person: "marco" }, { thing: "d1", move: "want" }, at(50)).at, T(60) + 1, "at ten minutes exactly: after it");
  }
  // D: Marco's own chain stands at 44 (his clock was there), his clock now says 36: written and judged at 44 + 1 ms
  {
    const { mini } = started();
    press(mini, P, WAY, { person: "marco" }, MAKE, at(44));
    const p = press(mini, P, WAY, { person: "marco" }, { thing: "d1", move: "want" }, at(36));
    assert.deepEqual([p.ok, p.why, p.at], [true, "", T(44) + 1], "d1, made at 44, is there at the time the press is written");
  }
});

test("4b loop (grade16 F5, F7): nothing it calls throws out of a turn, a login that is none turns nothing, and a loop the switch stopped starts again on a pull once it is on", async () => {
  const { nuc } = started();
  const boom = () => { throw new Error("boom"); };
  for (const o of [{ person: boom }, { projects: boom }, { said: boom }]) {
    const loop = new WayLoop({ sol: nuc, person: () => "frank", clock: at(31), on: () => true, ...o });
    assert.doesNotThrow(() => loop.tick(), Object.keys(o)[0]);
  }
  let said = 0;
  assert.deepEqual([...new WayLoop({ sol: nuc, person: () => "", clock: at(31), on: () => true, said: () => said++ }).tick()!.keys()], []);
  assert.equal(said, 0);
  // off, then on again
  let on = true, ticks = 0;
  const loop = new WayLoop({ sol: nuc, person: () => "frank", clock: at(31), on: () => on, every: 10 * EVERY, projects: () => { ticks++; return [P]; } });
  try {
    assert.equal(loop.start(), true);
    on = false;
    assert.deepEqual([loop.tick(), loop.running], [null, false]);
    loop.poke();
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual([loop.running, ticks], [false, 0], "off: a pull does nothing");
    on = true;
    loop.poke();
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual([loop.running, ticks], [true, 1], "on again: the pull starts it and turns");
    // stopped by its owner (an engine shutting down): a pull that ends after it does not start it again
    loop.stop();
    loop.poke();
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual([loop.running, ticks], [false, 1]);
  } finally { loop.stop(); }
});

test("4b writer (grade16 F6, F8): a login asked in another case than its key signs is refused, nothing written (a press, an agent's, the runner); a clock with a fraction of a ms is the whole ms the trail signs", () => {
  const { nuc, mini } = started();
  mini.keys.machineKey("marco");
  const n = rows(mini).length;
  assert.deepEqual(press(mini, P, WAY, { person: "Marco" }, MAKE, at(30)), { ok: false, why: "login_case", written: [], whole: true, acts: [] }, "its key signs as marco: nothing written");
  assert.deepEqual(press(mini, P, WAY, { person: "Marco", agent: "claude" }, MAKE, at(30)).why, "login_case", "an agent's too");
  assert.equal(rows(mini).length, n);
  const p = press(mini, P, WAY, { person: "marco" }, MAKE, at(30));
  assert.equal(p.ok, true);
  assert.deepEqual(mini.trail.check(P).bad, []);
  const other = sol("other");
  assert.deepEqual(other.trail.merge(rowsOf(mini.trail, P)).bad, []);
  assert.equal(press(mini, P, WAY, { person: "mar co" }, MAKE, at(31)).why, "not_in_project", "not a login");
  sync(nuc, mini);
  const f = press(mini, P, WAY, { person: "marco" }, { thing: "d1", move: "want" }, () => T(40) + 0.75);
  assert.deepEqual([f.at, byId(mini).get(f.written[0].id)!.at], [T(40), T(40)]);
  const t = runTurns(nuc, P, "frank", () => T(41) + 0.5);
  assert.equal(t[0].at, T(41));
  assert.deepEqual(runTurns(nuc, P, "fr ank", at(42)), [], "not a login: nothing");
  press(mini, P, WAY, { person: "marco" }, { ...MAKE, thing: "d5" }, at(43));
  sync(nuc, mini);
  const n2 = rows(nuc).length;
  assert.deepEqual(runTurns(nuc, P, "FRANK", at(44)), [], "the runner's login in another case than its key's: nothing");
  assert.equal(rows(nuc).length, n2);
  assert.deepEqual(runTurns(nuc, P, "frank", at(44)).map((x) => [x.ok, x.written.length]), [[true, 1]]);
});

test("4b runner: the first of two ways cut part-way by a failing disk: the second is judged on the trail with what was written, at a later time", () => {
  const nuc = sol("nucbox"), mini = sol("mini");
  const FILE2 = { ...FILE, id: "sol.other" }, L2 = load(FILE2);
  put(nuc, FRANK, "member", { role: "owner", in: true }, T(0), { item: "frank" });
  put(nuc, FRANK, "member", { role: "editor", in: true }, T(1), { item: "marco" });
  put(nuc, FRANK, WAYFILE, FILE, T(2), { item: L.ver });
  put(nuc, FRANK, WAYFILE, FILE2, T(2), { item: L2.ver });
  sync(nuc, mini);
  for (const [w, ver] of [[WAY, L.ver], ["sol.other", L2.ver]]) {
    put(mini, MARCO, "way.agreed", { way: w, to: ver, role: "explorer" }, T(10));
    put(nuc, FRANK, "way.agreed", { way: w, to: ver, role: "keeper" }, T(11));
  }
  sync(nuc, mini);
  for (const [w, ver] of [[WAY, L.ver], ["sol.other", L2.ver]]) put(nuc, FRANK, "way.applied", { way: w, from: "", to: ver, reader: 1 }, T(20));
  sync(nuc, mini);
  for (const w of [WAY, "sol.other"]) for (const thing of ["d1", "d2"]) press(mini, P, w, { person: "marco" }, { ...MAKE, thing }, at(30));
  sync(nuc, mini);
  runTurns(nuc, P, "frank", at(31));
  // fifteen days on: each way fires `remind` for d1 and d2; the disk fails on sol.drafts's second firing
  let n = 0;
  const append = (d: TrailDraft) => { if (d.kind === "way.fired" && (d.value as { way: string }).way === WAY && n++ === 1) throw new Error("the disk is full"); return nuc.trail.append({ ...d, by: { person: d.by.person, machine: nuc.keys.machineName } }); };
  const day15 = T(15 * DAY + 60);
  const t = runTurns({ ...nuc, append }, P, "frank", () => day15);
  assert.deepEqual(t.map((x) => [x.way, x.whole, x.at, x.written.map((w) => w.kind)]), [[WAY, false, day15, ["way.fired"]], ["sol.other", true, day15 + 1, ["way.fired", "way.fired"]]]);
});

test("4b writer (grade16 N1): a press cut after a move that enters with an act, before the field the act reads, owes no act; written whole, it does", () => {
  const F2 = JSON.parse(JSON.stringify(FILE));
  F2.life.draft.moves.find((m: { id: string }) => m.id === "drop").set = ["switch"];
  const L2 = load(F2);
  const world = () => {
    const nuc = sol("nucbox"), mini = sol("mini");
    put(nuc, FRANK, "member", { role: "owner", in: true }, T(0), { item: "frank" });
    put(nuc, FRANK, "member", { role: "editor", in: true }, T(1), { item: "marco" });
    put(nuc, FRANK, WAYFILE, F2, T(2), { item: L2.ver });
    sync(nuc, mini);
    put(mini, MARCO, "way.agreed", { way: WAY, to: L2.ver, role: "explorer" }, T(10));
    put(nuc, FRANK, "way.agreed", { way: WAY, to: L2.ver, role: "keeper" }, T(11));
    sync(nuc, mini);
    put(nuc, FRANK, "way.applied", { way: WAY, from: "", to: L2.ver, reader: 1 }, T(20));
    sync(nuc, mini);
    assert.equal(press(mini, P, WAY, { person: "marco" }, MAKE, at(30)).ok, true);
    return mini;
  };
  const mini = world();
  let i = 0;
  const append = (d: TrailDraft) => { if (i++ === 1) throw new Error("the disk is full"); return mini.trail.append({ ...d, by: { person: d.by.person, machine: mini.keys.machineName } }); };
  const p = press({ ...mini, append }, P, WAY, { person: "marco" }, { thing: "d1", move: "drop", set: { switch: "logo_v3" } }, at(31));
  assert.deepEqual([p.whole, p.written.map((w) => w.kind), p.acts], [false, ["way.move"], []]);
  const t = read(mini).placed.p.things.d1!;
  assert.deepEqual([t.state, t.fields.switch, t.missing], ["to_remove", "logo_v2", ["switch"]], "the book never had logo_v3");
  const whole = press(world(), P, WAY, { person: "marco" }, { thing: "d1", move: "drop", set: { switch: "logo_v3" } }, at(31));
  assert.deepEqual([whole.whole, whole.acts.map((a) => [a.seam, a.fields.switch])], [true, [["switch.off", "logo_v3"]]]);
});

test("4b loop, the seventeenth review: a second tick while the switch is off keeps the mark, so a pull with it on again starts it (F8)", () => {
  let on = true;
  const loop = new WayLoop({ sol: sol("nucbox"), person: () => "frank", clock: at(0), on: () => on, said: () => {} });
  assert.equal(loop.start(), true);
  on = false;
  assert.equal(loop.tick(), null);
  assert.equal(loop.tick(), null, "off again");
  on = true;
  loop.poke();
  assert.equal(loop.running, true, "started again by the pull");
  loop.stop();
  loop.poke();
  assert.equal(loop.running, false, "its owner's stop holds");
});
