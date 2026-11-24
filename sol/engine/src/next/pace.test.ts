// Pace (pace.ts, #1617 Harmony slice S20, #1601), on S30's persona fixtures: Dev's month, his Claude plan rising toward
// the limit and his Codex seat Sol cannot price. At the line, night runs wait first, then new runs wait, and running work
// finishes; each wait is one Diary line carrying "Run it anyway"; a seat with no number says not counted. Against a temp
// SOL_HOME; the vendor readings are given, so no real plan is read.
// Signed: franktsai2008-eng's agent, Harmony slice S20 (#1617).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error make.mjs is plain JavaScript, kept beside its fixtures
import { read } from "./fixtures/make.mjs";

const tmp = mkdtempSync(join(tmpdir(), "sol-next-pace-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
process.env.SOL_STATE = join(tmp, "state", "work.json");
process.env.SOL_LOGDIR = join(tmp, "log");
const P = await import("./pace.js");
const D = await import("./diary.js");
const home = (n: string) => { const d = join(tmp, n); mkdirSync(d, { recursive: true }); return d; };

// Dev's month: a usage line each night at 23:59 (claude: used of 100; codex: none); the window is the month
const dev = read("dev-month.jsonl");
const START = Date.parse(`${dev.head.start}T00:00:00Z`), MONTH = 30 * 864e5;
const usageBy = (t: number): import("./pace.js").Reading[] => {
  const last = new Map<string, any>();
  for (const a of dev.acts) if (a.act === "usage" && a.at <= t) last.set(a.seat, a);
  return [...last.values()].map((u) => ({ seat: u.seat, window: "month", used: u.used === null ? null : (100 * u.used) / u.of, at: u.at, windowMs: MONTH, resetsAt: START + MONTH }));
};
const STEADY = { take: "steady" as const, perAI: {} };

test("Dev's month under steady: night runs wait first, then new runs wait, and running work finishes", () => {
  const h = home("dev");
  const starts = dev.acts.filter((a: any) => a.act === "run.start");
  assert.ok(starts.length > 100 && starts.every((a: any) => new Date(a.at).getUTCHours() >= 20), "Dev's runs start at night");
  const firstWait: Record<number, number> = {};
  for (const s of starts) {
    const pace = P.paceOf(usageBy(s.at), STEADY, s.at, ["claude", "codex"]);
    const night = P.gate({ run: s.run, seat: s.seat, night: true }, pace);
    const day = P.gate({ run: `${s.run}-day`, seat: s.seat }, pace);
    const running = P.gate({ run: `${s.run}-on`, seat: s.seat, running: true }, pace);
    assert.equal(running.go, true, `day ${s.day}: running work always finishes`);
    if (!night.go) firstWait[night.rung] ??= s.day;
    if (!day.go) firstWait[3] ??= s.day;   // a new run in the day waits: only at the top rung
    if (!day.go) assert.equal(day.rung, 2);
    if (!night.go) P.noteWait(h, { run: s.run, seat: s.seat, night: true }, night, new Date(s.at));
    if (pace.find((x) => x.seat === s.seat)!.rung === 1) assert.equal(day.go, true, `day ${s.day}: below the top rung a new day run still goes`);
  }
  // the order of slowing: nights first, then new runs, never the other way round
  assert.ok(firstWait[1] !== undefined && firstWait[2] !== undefined && firstWait[3] !== undefined, JSON.stringify(firstWait));
  assert.ok(firstWait[1] < firstWait[2], `nights wait from day ${firstWait[1]}, new runs from day ${firstWait[2]}`);
  assert.equal(firstWait[3], firstWait[2], "new day runs wait from the same day as the top rung");
  // nothing waits while the window is still warming up (the first 10% of the month: 3 days)
  assert.ok(firstWait[1] > 3, `no call before 10% of the window: first wait day ${firstWait[1]}`);
  // the line itself: at day 27, 92% used, heading past 90
  const d27 = P.seatPace("claude", usageBy(START + 27 * 864e5 - 1), "steady", START + 27 * 864e5 - 1);
  assert.ok(d27.heading! >= 90 && d27.used[0].pct >= 90 && d27.rung === 2);

  // each wait is one Diary line, with "Run it anyway"; once per run and rung
  const lines = D.daysKept(h).flatMap((d) => D.readDay(h, d)).filter((l) => l.via === "pace");
  const waited = starts.filter((s: any) => !P.gate({ run: s.run, seat: s.seat, night: true }, P.paceOf(usageBy(s.at), STEADY, s.at, ["claude", "codex"])).go);
  assert.equal(lines.length, waited.length, "one line per wait");
  for (const l of lines) {
    const e = l.embed as any;
    assert.equal(e.press.label, "Run it anyway");
    assert.equal(e.press.send.type, "next.run.anyway");
    assert.match(l.words, new RegExp(`^Night run ${e.press.send.run} waits: `));
  }
  assert.ok(lines.some((l) => (l.embed as any).pace.rung === 2), "a wait at the top rung carries Run it anyway");
  const again = waited[waited.length - 1];
  const g = P.gate({ run: again.run, seat: "claude", night: true }, P.paceOf(usageBy(again.at), STEADY, again.at));
  assert.equal(P.noteWait(h, { run: again.run, seat: "claude", night: true }, g, new Date(again.at)).written, false, "the same wait is not written twice");

  // Run it anyway: the person's press lets that run go, and only that one
  assert.ok(P.runAnyway(h, { type: "next.run.anyway", run: again.run }).ok);
  const pace = P.paceOf(usageBy(again.at), STEADY, again.at);
  assert.equal(P.gate({ run: again.run, seat: "claude", night: true }, pace, P.anywayOf(h)).go, true);
  assert.equal(P.gate({ run: "dev-r9999", seat: "claude", night: true }, pace, P.anywayOf(h)).go, false);
  assert.equal(P.runAnyway(h, { run: "../../x y" }).ok, false);
});

test("a seat Sol cannot price says not counted, and is never slowed by a guess", () => {
  const end = START + MONTH - 1;
  const pace = P.paceOf(usageBy(end), STEADY, end, ["claude", "codex", "gemini"]);
  const codex = pace.find((s) => s.seat === "codex")!, gemini = pace.find((s) => s.seat === "gemini")!;
  for (const s of [codex, gemini]) {
    assert.equal(s.notCounted, true);
    assert.equal(s.heading, null);
    assert.deepEqual(s.used, []);
    assert.equal(s.rung, 0);
  }
  assert.equal(P.gate({ run: "r-codex", seat: "codex", night: true }, pace).go, true);
  assert.equal(pace.find((s) => s.seat === "claude")!.notCounted, false);
});

test("the takes are fixed lines; perAI sets one seat's own", () => {
  const t = START + 20 * 864e5;   // day 20: 68% used, heading ~102
  const r = usageBy(t);
  assert.equal(P.seatPace("claude", r, "calm", t).rung, 1, "calm: heading past 70");
  assert.equal(P.seatPace("claude", r, "steady", t).rung, 1);
  assert.equal(P.seatPace("claude", r, "all-out", t).rung, 1, "all-out: heading past 100");
  const t2 = START + 24 * 864e5;   // 82% used
  assert.equal(P.seatPace("claude", usageBy(t2), "calm", t2).rung, 2, "calm: new runs wait past 70% used");
  assert.equal(P.seatPace("claude", usageBy(t2), "steady", t2).rung, 1);
  assert.equal(P.paceOf(usageBy(t2), { take: "steady", perAI: { claude: "calm" } }, t2)[0].rung, 2);
  const h = home("takes");
  assert.deepEqual(P.takesOf(h), { take: "steady", perAI: {} }, "steady until set");
  assert.ok(P.setTake(h, { take: "calm", perAI: { codex: "all-out" } }).ok);
  assert.deepEqual(P.takesOf(h), { take: "calm", perAI: { codex: "all-out" } });
  assert.ok(P.setTake(h, { perAI: { codex: null } }).ok);
  assert.deepEqual(P.takesOf(h), { take: "calm", perAI: {} });
  assert.equal(P.setTake(h, { take: "fast" }).ok, false);
  assert.equal(P.setTake(h, {}).ok, false);
  assert.equal(P.setTake(h, { perAI: { "../x": "calm" } }).ok, false);
});

test("the vendor's word: warm-up, a warning or a refusal at any time, a stale reading says nothing", () => {
  const now = Date.UTC(2026, 10, 20, 12, 0), FIVE = 5 * 3600e3;
  const early = { seat: "claude", window: "five_hour", used: 3, at: now, windowMs: FIVE, resetsAt: now + FIVE - 10 * 60e3 };
  assert.equal(P.headingOf(early, now), null, "3% ten minutes in is not called");
  assert.equal(P.headingOf({ ...early, resetsAt: now + FIVE / 2 }, now), 6);
  assert.equal(P.seatPace("claude", [{ ...early, status: "rejected" }], "steady", now).rung, 2, "a refusal: new runs wait");
  assert.equal(P.seatPace("claude", [{ ...early, status: "allowed_warning" }], "steady", now).rung, 1, "a warning: nights wait");
  const old = { ...early, used: 99, resetsAt: now - 1, status: "rejected" as const };
  const s = P.seatPace("claude", [old], "steady", now);
  assert.equal(s.rung, 0);
  assert.equal(s.heading, null);
  assert.equal(s.used[0].stale, true, "a reset window keeps its as-of and says nothing");
  // the worst window wins
  const week = { seat: "claude", window: "seven_day", used: 80, at: now, windowMs: 7 * 864e5, resetsAt: now + 3.5 * 864e5 };
  assert.equal(P.seatPace("claude", [{ ...early, resetsAt: now + FIVE / 2 }, week], "steady", now).heading, 160);
});

test("the readers: the SDK's rate_limit_event kept per window; a Codex rollout's last rate_limits", async () => {
  const h = home("readers"), now = Date.UTC(2026, 10, 20, 12, 0);
  assert.equal(P.notedClaude(h, { type: "assistant" }), false);
  assert.ok(P.notedClaude(h, { type: "rate_limit_event", rate_limit_info: { status: "allowed", rateLimitType: "seven_day", utilization: 0.42, resetsAt: Math.floor(now / 1000) + 86400 } }, now));
  assert.ok(P.notedClaude(h, { type: "rate_limit_event", rate_limit_info: { status: "allowed_warning", rateLimitType: "five_hour", utilization: 0.8, resetsAt: Math.floor(now / 1000) + 3600 } }, now));
  const c = P.claudeReadings(h);
  assert.deepEqual(c.map((r) => [r.window, r.used, r.status]).sort(), [["five_hour", 80, "allowed_warning"], ["seven_day", 42, "allowed"]]);
  const roll = join(h, "rollout.jsonl");
  writeFileSync(roll, [
    { timestamp: "2026-11-20T11:00:00Z", type: "event_msg", payload: { type: "token_count", rate_limits: { primary: { used_percent: 1, window_minutes: 300, resets_at: 1 } } } },
    { timestamp: "2026-11-20T11:59:00Z", type: "event_msg", payload: { type: "token_count", info: null, rate_limits: { limit_id: "codex", primary: { used_percent: 30, window_minutes: 300, resets_at: now / 1000 + 3600 }, secondary: { used_percent: 12, window_minutes: 10080, resets_at: now / 1000 + 86400 } } } },
    "not json",
  ].map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n") + "\n");
  const x = P.codexReadings(roll);
  assert.deepEqual(x.map((r) => [r.seat, r.window, r.used, r.windowMs]), [["codex", "five_hour", 30, 300 * 60e3], ["codex", "seven_day", 12, 10080 * 60e3]]);
  assert.deepEqual(P.codexReadings(join(h, "none.jsonl")), []);
  const msg = await P.paceMsg(h, { codex: () => x }, now);
  assert.deepEqual(msg.seats.map((s) => [s.seat, s.notCounted, s.rung]), [["claude", false, 1], ["codex", false, 0]]);
  // mayStart: a night run on a warned seat waits, and its wait is on today's page
  const g = await P.mayStart(h, { run: "agent:web#1", seat: "claude", night: true }, { codex: () => x }, new Date(now));
  assert.equal(g.go, false);
  assert.equal(D.readDay(h, D.dayOf(new Date(now))).filter((l) => l.via === "pace").length, 1);
});

test("the wires: behind ui.next, Sol's own windows only", async () => {
  const part = (await import("../parts/next-s20.js")).default;
  const hs = new Map<string, (m: unknown, h: unknown) => unknown>();
  part({ on: (t: string, f: never) => hs.set(t, f), atStart: () => {}, route: () => {} } as never);
  const h = home("wires"), sent: any[] = [], all: any[] = [];
  const ctx = (fromSol: boolean) => ({ HOME: h, PORT: 0, ws: {}, send: (_w: unknown, m: object) => sent.push(m), everyone: (m: object) => all.push(m), face: { send() {} }, conn: { chars: 0 }, fromSol, fromApp: true });
  P.usePaceRead({ claude: () => [], codex: () => [] });   // no real plan is read
  process.env.SOL_UI_NEXT = "off";
  await hs.get("next.pace.set")!({ type: "next.pace.set", take: "calm" }, ctx(true));
  assert.deepEqual([sent.length, all.length], [0, 0], "off: nothing");
  assert.deepEqual(P.takesOf(h).take, "steady");
  process.env.SOL_UI_NEXT = "on";
  await hs.get("next.pace.set")!({ type: "next.pace.set", take: "calm" }, ctx(false));
  assert.equal(sent.pop().type, "next.refused");
  await hs.get("next.pace.set")!({ type: "next.pace.set", take: "calm" }, ctx(true));
  assert.equal(all.pop().type, "next.pace");
  assert.equal(P.takesOf(h).take, "calm");
  await hs.get("next.run.anyway")!({ type: "next.run.anyway", run: "agent:web#1" }, ctx(true));
  assert.deepEqual(sent.pop(), { type: "next.run.anyway", run: "agent:web#1", ok: true });
  await hs.get("next.pace.set")!({ type: "next.pace.set", take: "warp" }, ctx(true));
  assert.equal(sent.pop().why, "a take is one of calm, steady, all-out");
  delete process.env.SOL_UI_NEXT;
});
