// Replay readings (reading.ts, #1617 Harmony slice S25), on S30's fixtures/nights-3-40-400.jsonl: each night's stops sum
// to 60 s at most; the order is port S7's needs.ts rank of each place, then its count of acts (the fixture's own end line,
// made by make.mjs); the reading writes nothing (every file's hash before and after). Against a temp SOL_HOME.
// Signed: franktsai2008-eng's agent, Harmony slice S25 (#1617).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error make.mjs is plain JavaScript, kept beside its fixtures
import { HERE, MONTHS, read } from "./fixtures/make.mjs";

const tmp = mkdtempSync(join(tmpdir(), "sol-next-reading-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
process.env.SOL_STATE = join(tmp, "state", "work.json");
process.env.SOL_LOGDIR = join(tmp, "log");
const R = await import("./reading.js");
const D = await import("./diary.js");
const home = (n: string) => { const d = join(tmp, n); mkdirSync(d, { recursive: true }); return d; };

/** every file under a folder, with its hash */
function hashes(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else out[p] = createHash("sha256").update(readFileSync(p)).digest("hex"); } };
  walk(dir);
  return out;
}

const nights = read("nights-3-40-400.jsonl");

test("each night: stops in the rank's order, then by count of acts, and 60 s at most", () => {
  for (const n of ["3", "40", "400"]) {
    const acts = nights.acts.filter((a: any) => a.night === n), end = nights.ends.find((e: any) => e.end === n);
    const { stops, rest } = R.reading(acts, R.ranksFromAsks(acts));
    assert.deepEqual(stops.map((s) => s.place), end.order.slice(0, stops.length), `night ${n}: the order is the fixture's relevance order`);
    assert.equal(stops.length + rest, end.order.length, `night ${n}: every place is a stop or counted in rest`);
    const sum = stops.reduce((t, s) => t + s.ms, 0);
    assert.ok(sum <= R.BUDGET, `night ${n}: ${sum} ms`);
    assert.ok(stops.every((s) => s.ms >= R.MIN_MS && s.ms <= R.MAX_MS && Number.isInteger(s.ms)), `night ${n}: each stop 2 to 15 s`);
    for (const s of stops) {
      const mine = acts.filter((a: any) => a.place === s.place);
      assert.equal(s.at, Math.min(...mine.map((a: any) => a.at)), `${s.place}: at its first act`);
    }
    // a place with an open ask waits on you; the others say how their last run came out
    const open = new Set(acts.filter((a: any) => a.act === "ask" && end.open.includes(a.ask)).map((a: any) => a.place));
    for (const s of stops) if (open.has(s.place)) assert.equal(s.outcome, "waits on you");
  }
  // the 400 night: the lapsed sign-in's place leads, and the reading still fits the minute
  const n400 = nights.acts.filter((a: any) => a.night === "400");
  const r = R.reading(n400, R.ranksFromAsks(n400));
  assert.equal(r.stops[0].place, nights.ends.find((e: any) => e.end === "400").order[0]);
  // a busier place gets more of the minute than a quieter one of the same rank
  const count = (p: string) => n400.filter((a: any) => a.place === p).length;
  for (let i = 1; i < r.stops.length; i++) if (count(r.stops[i - 1].place) > count(r.stops[i].place)) assert.ok(r.stops[i - 1].ms >= r.stops[i].ms);
});

test("a month's fits: only fit acts are read, in the same order", () => {
  for (const name of MONTHS) {
    const acts = read(`${name}-month.jsonl`).acts.filter((a: any) => R.FIT_ACTS.has(a.act));
    if (!acts.length) continue;
    const { stops, rest } = R.reading(acts, new Map());
    assert.ok(stops.reduce((t, s) => t + s.ms, 0) <= R.BUDGET);
    assert.deepEqual(stops.map((s) => s.place), R.orderOf(acts, new Map()).slice(0, stops.length));
    assert.ok(stops.length + rest >= 1);
  }
  // too many places for the minute: the tail is counted, never squeezed below 2 s
  const many = Array.from({ length: 45 }, (_, i) => ({ at: i, act: "say", place: `p${String(i).padStart(2, "0")}` }));
  const r = R.reading(many, new Map());
  assert.equal(r.stops.length, 30);
  assert.equal(r.rest, 15);
  assert.ok(r.stops.reduce((t, s) => t + s.ms, 0) <= R.BUDGET);
});

test("the reading writes nothing: every file's hash before and after", async () => {
  const h = home("readonly");
  const now = new Date(2026, 10, 20, 7, 30), night = new Date(2026, 10, 19, 23, 10);
  D.writeLine(h, { words: "the price list went out", region: "denise/price-list" }, night);
  D.writeLine(h, { words: "Night run r1 waits", via: "pace", embed: { pace: { run: "r1", rung: 1 } } }, new Date(2026, 10, 20, 1, 0));
  D.writeLine(h, { words: "last week's note" }, new Date(2026, 10, 12, 9, 0));
  const before = { ...hashes(h), ...hashes(HERE) };
  const msg = R.replayMsg(h, "night", [{ piece: "denise/price-list", rank: 6 }], now);
  for (const span of R.SPANS) R.replayMsg(h, span, [], now);
  assert.deepEqual({ ...hashes(h), ...hashes(HERE) }, before, "no file changed, none added");
  assert.deepEqual(msg.stops.map((s) => [s.place, s.outcome]), [["denise/price-list", "say"], ["diary", "waits"]]);
  assert.equal(R.replayMsg(h, "week", [], now).stops.length, 2, "a week reads last week's note too");
  assert.deepEqual(R.replayMsg(h, "month-fits", [], now).stops, [], "no fit in the Diary yet");
});

test("the wire: behind ui.next, Sol's own windows only, a span it knows", async () => {
  const part = (await import("../parts/next-s25.js")).default;
  const hs = new Map<string, (m: unknown, h: unknown) => unknown>();
  part({ on: (t: string, f: never) => hs.set(t, f), atStart: () => {}, route: () => {} } as never);
  const h = home("wire"), sent: any[] = [];
  const ctx = (fromSol: boolean) => ({ HOME: h, PORT: 0, ws: {}, send: (_w: unknown, m: object) => sent.push(m), everyone: () => {}, face: { send() {} }, conn: { chars: 0 }, fromSol, fromApp: true });
  const replay = hs.get("next.replay")!;
  process.env.SOL_UI_NEXT = "off";
  await replay({ type: "next.replay", span: "night" }, ctx(true));
  assert.equal(sent.length, 0, "off: nothing");
  process.env.SOL_UI_NEXT = "on";
  await replay({ type: "next.replay", span: "night" }, ctx(false));
  assert.equal(sent.pop().why, "only Sol's own windows");
  await replay({ type: "next.replay", span: "year" }, ctx(true));
  assert.equal(sent.pop().why, "a span is one of night, week, month-fits");
  delete process.env.SOL_UI_NEXT;
});
