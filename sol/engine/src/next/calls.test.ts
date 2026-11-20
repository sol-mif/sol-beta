// next/calls.ts (#1604 slice 7): one ledger row per call, its undo returns the state before, a contract-first fn
// answers "not yet", and with ui.next off the part answers nothing and writes nothing. On a Home over memory (the same
// rows as the kernel's log, home/log.ts memoryLog) in a temp SOL_HOME; the panel's people only.
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memoryLog, ENGINE } from "../home/log.js";
import { makeCtx, startHome } from "../home/wire.js";
import { todayMsg } from "../home/today.js";
import type { Ctx } from "../home/unit.js";
import { call, standing, undo } from "./calls.js";
import part, { useHome } from "../parts/next-calls.js";

const NOW = Date.UTC(2026, 10, 19, 9, 0);
const dirs: string[] = [];
const wasEnv = process.env.SOL_UI_NEXT;
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); if (wasEnv === undefined) delete process.env.SOL_UI_NEXT; else process.env.SOL_UI_NEXT = wasEnv; });
beforeEach(() => { process.env.SOL_UI_NEXT = "on"; });

function home(): { ctx: Ctx; dir: string; sent: object[] } {
  const dir = mkdtempSync(join(tmpdir(), "sol-next-calls-"));
  dirs.push(dir);
  const sent: object[] = [];
  const ctx = makeCtx({ home: dir, log: memoryLog(() => NOW), now: () => NOW, all: (m) => sent.push(m) });
  startHome(ctx);
  return { ctx, dir, sent };
}
/** files raised to act, as Home 4 writes it (rung.ceiling; sources.ts rungOf reads the last) */
const raise = (ctx: Ctx) => ctx.log.write({ kind: "rung.ceiling", item: "files", value: { from: "read", to: "act", policy: "test" }, by: ENGINE });
const rows = (ctx: Ctx) => ctx.log.all().filter((e) => e.kind.startsWith("rung."));

test("a read move is let through: one row, rung.did, by the AI that called", async () => {
  const { ctx } = home();
  const before = ctx.log.all().length;
  const got = await call(ctx, { ai: "Rex", fn: "needs", args: {} });
  assert.equal(got.ok, true);
  assert.ok(got.ok && got.gate === "do");
  const added = ctx.log.all().slice(before);
  assert.deepEqual(added.map((e) => e.kind), ["rung.did"], "one row, nothing else");
  assert.equal(added[0].id, got.ok ? got.id : "");
  assert.deepEqual(added[0].by, { person: "seat", agent: "Rex" });
});

test("a draft move over the limit: one row, rung.would, nothing done", async () => {
  const { ctx } = home();   // files is at read (the default): a draft is over it
  const before = ctx.log.all().length;
  const got = await call(ctx, { ai: "Rex", fn: "place", args: { id: "jayden-school", x: 1, y: 2 } });
  assert.ok(got.ok && got.gate === "draft", JSON.stringify(got));
  assert.deepEqual(ctx.log.all().slice(before).map((e) => e.kind), ["rung.would"]);
  assert.match(got.ok ? got.line : "", /nothing was done/);
});

test("a do move waits for a press: one row (rung.asked) and a card in Today; the same call again is one more row", async () => {
  const { ctx } = home();
  raise(ctx);
  const before = ctx.log.all().length;
  const got = await call(ctx, { ai: "Mia", fn: "finish", args: { sticky: "Denise's form" } });
  assert.ok(got.ok && got.gate === "ask", JSON.stringify(got));
  const added = ctx.log.all().slice(before).filter((e) => e.kind.startsWith("rung."));
  assert.deepEqual(added.map((e) => e.kind), ["rung.asked"]);
  assert.ok(todayMsg(ctx).today.needs.some((id) => id.startsWith("ask-")), "a card waits in Today");
  const n = rows(ctx).length;
  const again = await call(ctx, { ai: "Mia", fn: "finish", args: { sticky: "Denise's form" } });
  assert.ok(again.ok && again.gate === "ask" && again.id !== (got.ok ? got.id : ""), "each waiting call is its own ask (ceiling.ts openAsk)");
  assert.equal(rows(ctx).length, n + 1, "one row for the second call");
});

test("undo returns the state before: the call no longer stands, its card leaves Today; a second undo writes nothing", async () => {
  const { ctx } = home();
  raise(ctx);
  for (const [fn, args] of [["place", { id: "dev-morning" }], ["finish", { sticky: "Sam's list" }], ["look", {}]] as const) {
    const state = standing(ctx), today = todayMsg(ctx).today.needs;
    const got = await call(ctx, { ai: "Tomás", fn, args });
    assert.ok(got.ok, JSON.stringify(got));
    assert.notDeepEqual(standing(ctx), state, `${fn}: the call stands`);
    const u = undo(ctx, { id: got.ok ? got.id : "" });
    assert.ok(u.ok && !u.again, JSON.stringify(u));
    assert.deepEqual(standing(ctx), state, `${fn}: the state before`);
    assert.deepEqual(todayMsg(ctx).today.needs, today, `${fn}: Today as before`);
    const n = ctx.log.all().length;
    const u2 = undo(ctx, { id: got.ok ? got.id : "" });
    assert.ok(u2.ok && u2.again);
    assert.equal(ctx.log.all().length, n, "a second undo writes nothing");
  }
});

test("contract first: split, take_back, withdraw and a start with a cost answer not yet and write nothing", async () => {
  const { ctx } = home();
  const n = ctx.log.all().length;
  for (const fn of ["split", "take_back", "withdraw"]) assert.deepEqual(await call(ctx, { ai: "Rex", fn, args: {} }), { ok: false, why: "not yet", fn });
  assert.deepEqual(await call(ctx, { ai: "Rex", fn: "start", args: { cost: 3 } }), { ok: false, why: "not yet", fn: "start" });
  assert.deepEqual(await call(ctx, { ai: "Rex", fn: "fly", args: {} }), { ok: false, why: "not a move", fn: "fly" });
  assert.equal(ctx.log.all().length, n);
});

/** the part, loaded into a fake registry */
function loaded() {
  const on = new Map<string, (msg: any, h: any) => unknown>();
  part({ on: (t: string, f: any) => on.set(t, f), atStart: () => {}, route: () => {} } as any);
  return on;
}
const heard = (dir: string) => { const got: any[] = []; return { got, h: { HOME: dir, fromSol: true, face: { send: (m: object) => got.push(m) }, send: (_w: unknown, m: object) => got.push(m), everyone: () => {} } }; };

test("the part: on, next.call is answered with one row; off, nothing is answered and nothing written or read", async () => {
  const { ctx, dir } = home();
  const unuse = useHome(() => ctx);
  try {
    const on = loaded();
    assert.ok(on.has("next.call") && on.has("next.undo") && on.has("next.needs") && on.has("next.seats") && on.has("next.back"));
    let { got, h } = heard(dir);
    await on.get("next.call")!({ type: "next.call", rid: "r1", ai: "Rex", fn: "look", args: {} }, h);
    assert.equal(got.length, 1);
    assert.equal(got[0].type, "next.call");
    assert.equal(got[0].rid, "r1");
    assert.equal(got[0].gate, "do");
    process.env.SOL_UI_NEXT = "off";
    const n = ctx.log.all().length;
    ({ got, h } = heard(dir));
    let asked = 0;
    const unuse2 = useHome(() => { asked++; return ctx; });
    for (const [type, msg] of [["next.call", { ai: "Rex", fn: "look" }], ["next.undo", { id: "x" }], ["next.needs", {}], ["next.seats", {}], ["next.back", { confirm: true }]] as const)
      await on.get(type)!({ type, ...msg }, h);
    unuse2();
    assert.deepEqual(got, [], "nothing answered");
    assert.equal(ctx.log.all().length, n, "nothing written");
    assert.equal(asked, 0, "Home not even read");
    assert.deepEqual(readdirSync(dir).filter((f) => f === "next"), [], "nothing under SOL_HOME/next/");
  } finally { unuse(); }
});
