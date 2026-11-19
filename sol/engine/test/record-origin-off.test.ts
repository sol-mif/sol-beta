// The record's origin (from, hash, sig: step M1) with its switch off, as it is unless set (record.ts originOn,
// SOL_RECORD_ORIGIN): none of the three is checked or acted on, a block's print is its record and engine half as before
// them, and nothing is said of a hash. And the seat's answer with the seat's switch off (parts/seat.ts): not taken.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Kernel } from "./kernels.ts";
import { columnsOf, originOn, ORIGIN_ENV, ACP_SEAT_ENV } from "../src/record.ts";
import { canonical } from "../src/canonical.ts";
import { readIn } from "../src/things.ts";
import { seatAsks } from "../src/seatturn.ts";
import seatPart from "../src/parts/seat.ts";

const was = { origin: process.env[ORIGIN_ENV], seat: process.env[ACP_SEAT_ENV] };
delete process.env[ORIGIN_ENV];
process.env[ACP_SEAT_ENV] = "off";   // the seat is on unless set off (#691)
const homes: string[] = [];
after(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
  for (const [k, v] of [[ORIGIN_ENV, was.origin], [ACP_SEAT_ENV, was.seat]] as const) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("the switch is off unless it says on", () => {
  try {
    for (const v of ["off", "0", "", "yes"]) { process.env[ORIGIN_ENV] = v; assert.equal(originOn(), false, `"${v}" is not on`); }
    for (const v of ["on", "1", "true", " ON "]) { process.env[ORIGIN_ENV] = v; assert.equal(originOn(), true, `"${v}" is on`); }
  } finally { delete process.env[ORIGIN_ENV]; }
  assert.equal(originOn(), false);
});

test("off: from, hash and sig are not read, so a record that carries any of them loads as one without them", async (t) => {
  for (const r of [{ from: { kind: "robot" } }, { hash: "nope" }, { sig: "ed25519:abc" }, { from: { kind: "ai", who: "me" }, hash: "0".repeat(64), sig: "" }])
    assert.deepEqual(columnsOf({ id: "x", reads: [], writes: [], ...r }), { ok: true, columns: { room: "small", needs: null, stores: [], hears: null } }, JSON.stringify(r));

  const h = realpathSync(mkdtempSync(join(tmpdir(), "sol-origin-off-")));
  homes.push(h);
  const engine = `export default (sol) => { sol.log("here"); };`;
  const dirs: Record<string, { d: string; r: Record<string, unknown> }> = {};
  for (const [id, more] of [["plain", {}], ["robot", { from: { kind: "robot" } }], ["moved", { hash: "0".repeat(64) }], ["signed", { sig: "ed25519:abc" }]] as const) {
    const d = join(h, "things", id);
    mkdirSync(d, { recursive: true });
    const r = { id, title: id, place: "card", reads: [], writes: [], versions: [{ v: 1, file: "v1.html", engine: "engine.js", at: "2026-11-15", contract: 1 }], ...more };
    writeFileSync(join(d, "record.json"), JSON.stringify(r));
    writeFileSync(join(d, "v1.html"), "<p>x</p>");
    writeFileSync(join(d, "engine.js"), engine);
    dirs[id] = { d, r };
  }
  const k = new Kernel(h, { logDir: join(h, "lab-log"), appDir: join(h, "app") });
  t.after(() => k.stop());
  await k.sync();
  await wait(200);
  for (const id of Object.keys(dirs)) assert.equal(k.state(id)?.state, "loaded", `${id}: ${k.state(id)?.why}`);
  const ev = k.since();
  assert.ok(!ev.some((e) => e.kind === "plugin.altered"), "no hash is compared, so none is said");
  for (const [id, { d, r }] of Object.entries(dirs)) {
    const line = ev.find((e) => e.kind === "plugin.line" && e.by.agent === id);
    const before = createHash("sha256").update(canonical(r)).update("\n").update(readIn(d, "engine.js") ?? "").digest("hex");
    assert.equal(line?.via?.pkg, before, `${id}: via.pkg is its record and engine half, as before the switch`);
  }
});

test("off: a seat's answer is not taken, from Sol's own window or any other", () => {
  const heard: Record<string, (msg: unknown, h: unknown) => unknown> = {};
  seatPart({ on: (type: string, fn: (msg: unknown, h: unknown) => unknown) => { heard[type] = fn; } } as never);
  const fn = heard["seat.answer"];
  assert.ok(fn, "the part says the type, as every part does");
  const got: string[] = [];
  const sent: unknown[] = [];
  seatAsks.set("ask-1", (a) => got.push(a));
  try {
    for (const fromSol of [true, false]) fn({ type: "seat.answer", id: "ask-1", answer: "once" }, { ws: {}, send: (_: unknown, m: unknown) => sent.push(m), fromSol });
    assert.deepEqual(got, [], "the ask is not answered");
    assert.deepEqual(sent, [], "nothing is said back: a type no part takes");
    process.env[ACP_SEAT_ENV] = "on";
    fn({ type: "seat.answer", id: "ask-1", answer: "once" }, { ws: {}, send: () => {}, fromSol: true });
    assert.deepEqual(got, ["once"], "on, Sol's own window answers it");
  } finally { seatAsks.delete("ask-1"); process.env[ACP_SEAT_ENV] = "off"; }
});
