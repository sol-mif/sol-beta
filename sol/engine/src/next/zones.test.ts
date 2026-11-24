// Zones are gone (BR1, #1615, 2026-11-21, mine/look/br1/three.html "Only folders, no zones"): the canvas holds only
// folders, each where it is put. An old face's next.zones.set is refused with its reason and writes nothing; an old
// zones.json is left on disk as it was, never read, never set aside, never named; off, nothing is answered. Against a
// temp SOL_HOME. (Before: zones.ts kept a zone per folder; this file tested it.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "sol-next-zones-"));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
process.env.SOL_STATE = join(tmp, "state", "work.json");
process.env.SOL_LOGDIR = join(tmp, "log");
process.env.CLAUDE_CONFIG_DIR = join(tmp, "no-claude");
process.env.CODEX_HOME = join(tmp, "no-codex");
const part = (await import("../parts/next.js")).default;
const { ZONES_GONE } = await import("../parts/next.js");

function rig(home: string) {
  const hs = new Map<string, (m: unknown, h: unknown) => unknown>();
  part({ on: (t: string, f: never) => hs.set(t, f), atStart: () => {}, route: () => {} } as never);
  const sent: any[] = [], all: any[] = [];
  const h = { HOME: home, PORT: 0, ws: {}, send: (_w: unknown, m: object) => sent.push(m), everyone: (m: object) => all.push(m), face: { send() {} }, conn: { chars: 0 }, fromSol: true, fromApp: true };
  return { sent, all, ask: async (m: { type: string; [k: string]: unknown }) => { await hs.get(m.type)?.(m, h); } };
}
const home = (n: string) => { const d = join(tmp, n); mkdirSync(d, { recursive: true }); return d; };
const OLD = JSON.stringify({ v: 1, zones: { School: { zone: "life", at: 1 }, "w:/tmp/site": { zone: "build", at: 2 } } });

test("next.zones.set is refused with its reason, and nothing is written or told", async () => {
  process.env.SOL_UI_NEXT = "on";
  const h = home("refused"), r = rig(h);
  for (const m of [{ folder: "School", zone: "life" }, { folder: "w:/tmp/site", zone: "build" }, { folder: "School", zone: null }])
    await r.ask({ type: "next.zones.set", ...m });
  assert.equal(r.sent.length, 3, "one answer to each ask");
  assert.ok(r.sent.every((m) => m.type === "next.refused" && m.asked === "next.zones.set"), "each one refused");
  assert.equal(r.sent[0].why, ZONES_GONE);
  assert.match(ZONES_GONE, /a folder is just a folder/);
  assert.equal(r.all.length, 0, "no window is told anything changed");
  assert.equal(existsSync(join(h, "next")), false, "nothing written under the home");
});

test("an old zones.json is left where it is, as it was, and next.state carries no zones", async () => {
  process.env.SOL_UI_NEXT = "on";
  const h = home("old"), r = rig(h);
  mkdirSync(join(h, "next"), { recursive: true });
  writeFileSync(join(h, "next", "zones.json"), OLD);
  await r.ask({ type: "next.zones.set", folder: "School", zone: "build" });
  await r.ask({ type: "next.state" });
  const s = r.sent.find((m) => m.type === "next.state");
  assert.ok(s, "next.state answered");
  assert.equal("zones" in s, false, "no zones in next.state");
  assert.equal(readFileSync(join(h, "next", "zones.json"), "utf8"), OLD, "the old file untouched");
  assert.deepEqual(readdirSync(join(h, "next")), ["zones.json"], "nothing beside it");
});

test("a broken old zones.json is never read, set aside or named", async () => {
  process.env.SOL_UI_NEXT = "on";
  const h = home("broken"), r = rig(h);
  mkdirSync(join(h, "next"), { recursive: true });
  writeFileSync(join(h, "next", "zones.json"), "[1, 2");
  await r.ask({ type: "next.state" });
  const s = r.sent.find((m) => m.type === "next.state");
  assert.equal(s.notes, undefined, "no note names it");
  assert.equal(readdirSync(join(h, "next")).filter((f) => f.startsWith("zones.broken-")).length, 0, "not set aside");
  assert.equal(readFileSync(join(h, "next", "zones.json"), "utf8"), "[1, 2");
});

test("off, nothing is answered or written", async () => {
  process.env.SOL_UI_NEXT = "off";
  const o = home("off"), q = rig(o);
  await q.ask({ type: "next.zones.set", folder: "School", zone: "life" });
  assert.equal(q.sent.length + q.all.length, 0);
  assert.equal(existsSync(join(o, "next")), false);
  process.env.SOL_UI_NEXT = "on";
});
