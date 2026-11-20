// Places on the plane (pos.ts, parts/next.ts; #1604, slice 7b of #1615): written whole each time (temp + rename, no temp
// file left), a broken file set aside as pos.broken-<time>.json and started fresh (never thrown away, never a crash),
// every window told; with the switch off nothing is answered or written. Against a temp SOL_HOME.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "sol-next-pos-"));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
process.env.SOL_STATE = join(tmp, "state", "work.json");
process.env.SOL_LOGDIR = join(tmp, "log");
const { readPos, setPos, posFile } = await import("./pos.js");
const part = (await import("../parts/next.js")).default;

/** the part's handlers, with a face that records what it was sent and what every window was told */
function rig(home: string) {
  const hs = new Map<string, (m: unknown, h: unknown) => unknown>();
  part({ on: (t: string, f: never) => hs.set(t, f), atStart: () => {}, route: () => {} } as never);
  const sent: any[] = [], all: any[] = [];
  const h = { HOME: home, PORT: 0, ws: {}, send: (_w: unknown, m: object) => sent.push(m), everyone: (m: object) => all.push(m), face: { send() {} }, conn: { chars: 0 }, fromSol: true, fromApp: true };
  return { sent, all, ask: async (m: { type: string; [k: string]: unknown }) => { await hs.get(m.type)?.(m, h); } };
}
const home = (n: string) => { const d = join(tmp, n); mkdirSync(d, { recursive: true }); return d; };
const DEV = { id: "w:/tmp/app", x: 120, y: 40, w: 300, h: 200, by: "person", touched: true };
const JAYDEN = { id: "h:school", x: -400, y: 10, w: 260, h: 180, by: "rule", touched: false };

test("each set writes the whole file, and no temp file is left beside it", () => {
  const h = home("whole");
  assert.equal(setPos(h, DEV).ok, true);
  assert.equal(setPos(h, JAYDEN).ok, true);
  const file = JSON.parse(readFileSync(posFile(h), "utf8"));
  assert.deepEqual(Object.keys(file.pos).sort(), [DEV.id, JAYDEN.id].sort());
  assert.equal(file.pos[DEV.id].by, "person");
  assert.deepEqual(readdirSync(join(h, "next")), ["pos.json"]);
});

test("a place that is not one changes nothing", () => {
  const h = home("refused");
  setPos(h, DEV);
  const before = readFileSync(posFile(h), "utf8");
  for (const bad of [{ ...DEV, x: "1" }, { ...DEV, by: "someone" }, { ...DEV, id: "" }, { ...DEV, w: -1 }, null]) assert.equal(setPos(h, bad).ok, false);
  assert.equal(readFileSync(posFile(h), "utf8"), before);
});

test("a broken file is set aside, never thrown away, and the plane starts fresh", () => {
  const h = home("broken");
  mkdirSync(join(h, "next"), { recursive: true });
  writeFileSync(posFile(h), "{ half a fi");
  assert.doesNotThrow(() => readPos(h));
  const r = setPos(h, JAYDEN);
  assert.ok(r.ok);
  const aside = readdirSync(join(h, "next")).filter((f) => /^pos\.broken-.+\.json$/.test(f));
  assert.equal(aside.length, 1);
  assert.equal(readFileSync(join(h, "next", aside[0]), "utf8"), "{ half a fi");
  assert.deepEqual(Object.keys(readPos(h).pos), [JAYDEN.id]);
});

test("a set is told to every window: next.pos and next.state; a refusal to the asker alone", async () => {
  process.env.SOL_UI_NEXT = "on";
  const h = home("told"), r = rig(h);
  await r.ask({ type: "next.pos.set", ...DEV });
  assert.deepEqual(r.all.map((m) => m.type), ["next.pos", "next.state"]);
  assert.equal(r.all[0].id, DEV.id);
  assert.equal(r.all[1].pos[DEV.id].x, 120);
  await r.ask({ type: "next.pos.set", id: "x", x: "far" });
  assert.equal(r.all.length, 2);
  assert.equal(r.sent.at(-1).type, "next.refused");
});

test("off: next.pos.set is not answered and nothing is written", async () => {
  process.env.SOL_UI_NEXT = "off";
  const h = home("off"), r = rig(h);
  await r.ask({ type: "next.pos.set", ...DEV });
  assert.equal(r.sent.length + r.all.length, 0);
  assert.equal(existsSync(join(h, "next")), false);
  process.env.SOL_UI_NEXT = "on";
});
