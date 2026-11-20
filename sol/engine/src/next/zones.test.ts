// Each folder's zone (zones.ts, parts/next.ts; #1604, slice 7b of #1615): kept per folder, given back to the rule with
// null, written whole, a broken file set aside, every window told next.state; off, nothing. Against a temp SOL_HOME.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "sol-next-zones-"));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
process.env.SOL_STATE = join(tmp, "state", "work.json");
process.env.SOL_LOGDIR = join(tmp, "log");
const { readZones, setZone, zonesFile } = await import("./zones.js");
const part = (await import("../parts/next.js")).default;

function rig(home: string) {
  const hs = new Map<string, (m: unknown, h: unknown) => unknown>();
  part({ on: (t: string, f: never) => hs.set(t, f), atStart: () => {}, route: () => {} } as never);
  const sent: any[] = [], all: any[] = [];
  const h = { HOME: home, PORT: 0, ws: {}, send: (_w: unknown, m: object) => sent.push(m), everyone: (m: object) => all.push(m), face: { send() {} }, conn: { chars: 0 }, fromSol: true, fromApp: true };
  return { sent, all, ask: async (m: { type: string; [k: string]: unknown }) => { await hs.get(m.type)?.(m, h); } };
}
const home = (n: string) => { const d = join(tmp, n); mkdirSync(d, { recursive: true }); return d; };

test("a folder's zone is kept, and null gives it back to the rule", () => {
  const h = home("keep");
  assert.ok(setZone(h, { folder: "school", zone: "life" }).ok);
  assert.ok(setZone(h, { folder: "w:/tmp/site", zone: "build" }).ok);
  assert.deepEqual(Object.fromEntries(Object.entries(readZones(h).zones).map(([f, z]) => [f, z.zone])), { school: "life", "w:/tmp/site": "build" });
  assert.ok(setZone(h, { folder: "school", zone: null }).ok);
  assert.deepEqual(Object.keys(readZones(h).zones), ["w:/tmp/site"]);
  assert.deepEqual(readdirSync(join(h, "next")), ["zones.json"]);
});

test("a zone that is not one changes nothing", () => {
  const h = home("refused");
  setZone(h, { folder: "school", zone: "life" });
  const before = readFileSync(zonesFile(h), "utf8");
  for (const bad of [{ folder: "school", zone: "garden" }, { zone: "life" }, { folder: "", zone: "life" }]) assert.equal(setZone(h, bad).ok, false);
  assert.equal(readFileSync(zonesFile(h), "utf8"), before);
});

test("a broken file is set aside and the zones start fresh", () => {
  const h = home("broken");
  mkdirSync(join(h, "next"), { recursive: true });
  writeFileSync(zonesFile(h), "[1, 2");
  assert.ok(setZone(h, { folder: "school", zone: "life" }).ok);
  const aside = readdirSync(join(h, "next")).filter((f) => /^zones\.broken-.+\.json$/.test(f));
  assert.equal(aside.length, 1);
  assert.equal(readFileSync(join(h, "next", aside[0]), "utf8"), "[1, 2");
});

test("every window is told next.state; off, nothing is answered or written", async () => {
  process.env.SOL_UI_NEXT = "on";
  const h = home("told"), r = rig(h);
  await r.ask({ type: "next.zones.set", folder: "school", zone: "life" });
  assert.deepEqual(r.all.map((m) => m.type), ["next.state"]);
  assert.equal(r.all[0].zones.school.zone, "life");
  process.env.SOL_UI_NEXT = "off";
  const o = home("off"), q = rig(o);
  await q.ask({ type: "next.zones.set", folder: "school", zone: "life" });
  assert.equal(q.sent.length + q.all.length, 0);
  assert.equal(existsSync(join(o, "next")), false);
  process.env.SOL_UI_NEXT = "on";
});
