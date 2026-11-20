// next.state and the part as a whole (state.ts, movein.ts, parts/next.ts; #1604, slice 7b of #1615): the state a window
// asks for holds places, pos, zones, today's diary and needs (7a's ranked list, only to Sol's own windows; a push to
// every window leaves it out); a broken store is named in notes; the move-in is read and kept through the part. Off (uiNext() false), no next.* message is answered,
// and nothing under the home is written or even read: node:fs is wrapped while every message is sent.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = fs.mkdtempSync(join(tmpdir(), "sol-next-state-"));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
process.env.SOL_STATE = join(tmp, "state", "work.json");
process.env.SOL_LOGDIR = join(tmp, "log");
const part = (await import("../parts/next.js")).default;
const { readMoveIn } = await import("./movein.js");

function rig(home: string) {
  const hs = new Map<string, (m: unknown, h: unknown) => unknown>();
  part({ on: (t: string, f: never) => hs.set(t, f), atStart: () => {}, route: () => {} } as never);
  const sent: any[] = [], all: any[] = [];
  const h = { HOME: home, PORT: 0, ws: {}, send: (_w: unknown, m: object) => sent.push(m), everyone: (m: object) => all.push(m), face: { send() {} }, conn: { chars: 0 }, fromSol: true, fromApp: true };
  return { hs, sent, all, ask: async (m: { type: string; [k: string]: unknown }) => { await hs.get(m.type)?.(m, h); } };
}
const home = (n: string) => { const d = join(tmp, n); fs.mkdirSync(d, { recursive: true }); return d; };

test("next.state: places, pos, zones, today's diary and needs, as the contract says", async () => {
  process.env.SOL_UI_NEXT = "on";
  const h = home("state"), r = rig(h);
  fs.mkdirSync(join(h, "School"), { recursive: true });
  fs.writeFileSync(join(h, "School", "stickies.md"), "- [ ] Jayden: revise cells\n");
  await r.ask({ type: "next.pos.set", id: "h:school", x: 1, y: 2, w: 3, h: 4, by: "person", touched: true });
  await r.ask({ type: "next.zones.set", folder: "School", zone: "life" });
  await r.ask({ type: "next.diary.write", words: "Jayden revised cells" });
  await r.ask({ type: "next.state" });
  const s = r.sent.at(-1);
  assert.equal(s.type, "next.state");
  assert.deepEqual(Object.keys(s).sort(), ["diaryToday", "needs", "places", "pos", "type", "zones"]);
  assert.deepEqual(s.places.map((p: { id: string; kind: string }) => [p.id, p.kind]), [["School", "life"]]);
  assert.equal(s.pos["h:school"].by, "person");
  assert.equal(s.zones.School.zone, "life");
  assert.deepEqual(s.diaryToday.lines.map((l: { words: string }) => l.words), ["Jayden revised cells"]);
  assert.ok(Array.isArray(s.needs));
  assert.ok(r.all.filter((m: { type: string }) => m.type === "next.state").every((m: object) => !("needs" in m)), "a push to every window carries no needs");
});

test("a store set aside is named in notes, in a person's words", async () => {
  process.env.SOL_UI_NEXT = "on";
  const h = home("notes"), r = rig(h);
  fs.mkdirSync(join(h, "next"), { recursive: true });
  fs.writeFileSync(join(h, "next", "pos.json"), "nope");
  await r.ask({ type: "next.state" });
  assert.match(r.sent.at(-1).notes[0], /could not be read, so they start fresh; yours are kept aside as pos\.broken-/);
  assert.ok(fs.readdirSync(join(h, "next")).some((f) => f.startsWith("pos.broken-")));
});

test("the move-in through the part: read answers next.movein, keep writes only next/movein.json", async () => {
  process.env.SOL_UI_NEXT = "on";
  const h = home("movein"), r = rig(h);
  fs.mkdirSync(join(h, "Family"), { recursive: true });
  await r.ask({ type: "next.movein.read" });
  assert.equal(r.sent.at(-1).type, "next.movein");
  assert.deepEqual(r.sent.at(-1).places.map((p: { id: string }) => p.id), ["Family"]);
  await r.ask({ type: "next.movein.keep", keep: ["Family"], drop: ["s-dev-2"], fix: { Family: { zone: "life" } } });
  await r.ask({ type: "next.movein.keep", keep: ["s-dev-2"] });
  const kept = readMoveIn(h)!;
  assert.deepEqual([kept.keep.sort(), kept.drop, kept.fix], [["Family", "s-dev-2"], [], { Family: { zone: "life" } }]);
  assert.equal(r.sent.at(-1).type, "next.movein.kept");
  assert.deepEqual(fs.readdirSync(join(h, "next")), ["movein.json"]);
  assert.deepEqual(fs.readdirSync(h).sort(), ["Family", "next"]);
});

test("off: no next.* message is answered, and nothing under the home is written or read", async () => {
  process.env.SOL_UI_NEXT = "off";
  const h = home("off"), r = rig(h);
  fs.mkdirSync(join(h, "School"), { recursive: true });
  const touched: string[] = [];
  const anyFs = fs as unknown as Record<string, (...a: unknown[]) => unknown>, kept = new Map<string, unknown>();
  for (const [n, f] of Object.entries(anyFs)) {
    if (typeof f !== "function" || !/Sync$|^create|^open|^read|^write|^append/.test(n)) continue;
    kept.set(n, f);
    anyFs[n] = function (this: unknown, ...a: unknown[]) { if (String(a[0]).startsWith(h)) touched.push(`${n} ${a[0]}`); return f.apply(this, a); };
  }
  syncBuiltinESMExports();
  try {
    const all = [
      { type: "next.state" }, { type: "next.pos.set", id: "h:school", x: 1, y: 2, w: 3, h: 4, by: "person", touched: true },
      { type: "next.zones.set", folder: "School", zone: "life" }, { type: "next.diary.get" }, { type: "next.diary.write", words: "Sam" },
      { type: "next.diary.remove", lineId: "dl-000000000000" }, { type: "next.diary.pause", on: true },
      { type: "next.movein.read" }, { type: "next.movein.keep", keep: ["School"] }, { type: "next.traces" },
    ];
    assert.deepEqual([...r.hs.keys()].sort(), all.map((m) => m.type).sort(), "every message this part answers is tried");
    for (const m of all) await r.ask(m);
  } finally { for (const [n, f] of kept) anyFs[n] = f as never; syncBuiltinESMExports(); }
  assert.deepEqual([r.sent, r.all], [[], []]);
  assert.deepEqual(touched, []);
  assert.deepEqual(fs.readdirSync(h), ["School"]);
  process.env.SOL_UI_NEXT = "on";
});
