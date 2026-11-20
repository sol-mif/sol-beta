// The diary (diary.ts, parts/next.ts; #1604, slice 7b of #1615): one SOL_HOME/next/diary/<day>.jsonl per day, appended to
// and never rewritten; a removal is a reverse event, and its undo (back: true) gives the lines before; `via` kept as
// given; a pause holds what is said elsewhere; the words never reach track.ts; off, nothing. Against a temp SOL_HOME.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "sol-next-diary-"));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
process.env.SOL_STATE = join(tmp, "state", "work.json");
process.env.SOL_LOGDIR = join(tmp, "log");
const D = await import("./diary.js");
const part = (await import("../parts/next.js")).default;
const track = await import("../track.js");

function rig(home: string) {
  const hs = new Map<string, (m: unknown, h: unknown) => unknown>();
  part({ on: (t: string, f: never) => hs.set(t, f), atStart: () => {}, route: () => {} } as never);
  const sent: any[] = [], all: any[] = [];
  const h = { HOME: home, PORT: 0, ws: {}, send: (_w: unknown, m: object) => sent.push(m), everyone: (m: object) => all.push(m), face: { send() {} }, conn: { chars: 0 }, fromSol: true, fromApp: true };
  return { sent, all, ask: async (m: { type: string; [k: string]: unknown }) => { await hs.get(m.type)?.(m, h); } };
}
const home = (n: string) => { const d = join(tmp, n); mkdirSync(d, { recursive: true }); return d; };
const MON = new Date(2026, 10, 16, 9, 30), TUE = new Date(2026, 10, 17, 21, 5);

test("a page a day: each day's lines in its own <day>.jsonl, via kept as given", () => {
  const h = home("days");
  assert.ok(D.writeLine(h, { words: "Dev shipped the login fix", region: "w:/tmp/app" }, MON).ok);
  assert.ok(D.writeLine(h, { words: "Jayden's bio quiz moved to Friday", via: "island" }, TUE).ok);
  assert.ok(D.writeLine(h, { words: "Denise called back", via: "voice", embed: { id: "it-1a2b3c4d5e6f" } }, TUE).ok);
  assert.deepEqual(readdirSync(D.diaryDir(h)).sort(), ["2026-11-16.jsonl", "2026-11-17.jsonl"]);
  assert.deepEqual(D.readDay(h, "2026-11-16").map((l) => l.words), ["Dev shipped the login fix"]);
  const tue = D.readDay(h, "2026-11-17");
  assert.deepEqual(tue.map((l) => [l.words, l.via]), [["Jayden's bio quiz moved to Friday", "island"], ["Denise called back", "voice"]]);
  assert.deepEqual(tue[1].embed, { id: "it-1a2b3c4d5e6f" });
  assert.equal(D.writeLine(h, { words: "   " }, TUE).ok, false);
});

test("remove then undo gives the lines before, and the file only grows", () => {
  const h = home("undo");
  const a = D.writeLine(h, { words: "Min-ji's draft is in" }, TUE), b = D.writeLine(h, { words: "Sam asked about the rota" }, TUE);
  assert.ok(a.ok && b.ok && a.id && b.id);
  const before = D.readDay(h, "2026-11-17"), file = D.dayFile(h, "2026-11-17");
  const was = readFileSync(file, "utf8");
  assert.ok(D.removeLine(h, { lineId: a.id }, TUE).ok);
  assert.deepEqual(D.readDay(h, "2026-11-17").map((l) => l.id), [b.id]);
  const grown = readFileSync(file, "utf8");
  assert.ok(grown.length > was.length && grown.startsWith(was));
  assert.ok(D.removeLine(h, { lineId: a.id, back: true }, TUE).ok);
  assert.deepEqual(D.readDay(h, "2026-11-17"), before);
  assert.deepEqual(readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l).ev), ["write", "write", "remove", "back"]);
  assert.equal(D.removeLine(h, { lineId: "dl-000000000000" }, TUE).ok, false);
});

test("a line removed on a later day is removed from its own day's page", () => {
  const h = home("later");
  const a = D.writeLine(h, { words: "Tomás lent the drill" }, MON);
  assert.ok(a.ok && a.id);
  assert.ok(D.removeLine(h, { lineId: a.id }, TUE).ok);
  assert.deepEqual(D.readDay(h, "2026-11-16"), []);
  assert.equal(existsSync(D.dayFile(h, "2026-11-17")), false);
});

test("paused: a line said on the island or by voice is held and counted; one typed on the page is written", () => {
  const h = home("pause");
  D.pauseDiary(h, true, MON.getTime());
  assert.equal(D.writeLine(h, { words: "from the island", via: "island" }, MON).ok, true);
  assert.equal(D.writeLine(h, { words: "typed", via: "keys" }, MON).ok, true);
  assert.deepEqual(D.readDay(h, "2026-11-16").map((l) => l.words), ["typed"]);
  assert.equal(D.readPause(h)?.skipped, 1);
  D.pauseDiary(h, false, TUE.getTime());
  assert.equal(D.readPause(h), null);
  D.writeLine(h, { words: "from the island again", via: "island" }, TUE);
  assert.deepEqual(D.readDay(h, "2026-11-17").map((l) => l.words), ["from the island again"]);
});

test("the words never reach track.ts", async () => {
  process.env.SOL_UI_NEXT = "on";
  const h = home("track"), th = home("track-home"), r = rig(h);
  track.setTrackHome(th, { consent: () => ({ usage: true }), who: () => ({ name: "", id: "", user: "" }) });
  const words = "Jayden failed the chemistry test, keep it quiet";
  const face = {};
  const msgs = [{ type: "next.diary.write", words, via: "keys" }, { type: "next.diary.get" }];
  for (const m of msgs) { track.trackIn(face, m); await r.ask(m); }
  for (const m of [...r.sent, ...r.all]) track.trackOut(face, m);
  assert.ok(r.all.some((m) => m.type === "next.diary" && m.lines.some((l: { words: string }) => l.words === words)));
  const files = readdirSync(join(th, "track"));
  assert.ok(files.length > 0, "the messages were counted");
  for (const f of files) {
    const text = readFileSync(join(th, "track", f), "utf8");
    assert.ok(!text.includes("chemistry") && !text.includes("Jayden"), `${f} holds no word of the line`);
  }
  assert.ok(!/from "\.\.\/track/.test(readFileSync(new URL("./diary.ts", import.meta.url), "utf8")));
  track.setTrackHome("");
});

test("through the part: get, write, remove and its undo; off, nothing is answered, written or read", async () => {
  process.env.SOL_UI_NEXT = "on";
  const h = home("part"), r = rig(h);
  await r.ask({ type: "next.diary.write", words: "Sam's rota is up", via: "island" });
  const told = r.all.find((m) => m.type === "next.diary");
  assert.equal(told.lines.length, 1);
  assert.ok(r.all.some((m) => m.type === "next.state" && m.diaryToday.lines.length === 1));
  const id = told.lines[0].id;
  await r.ask({ type: "next.diary.remove", lineId: id });
  await r.ask({ type: "next.diary.remove", lineId: id, back: true });
  await r.ask({ type: "next.diary.get" });
  assert.deepEqual(r.sent.at(-1).lines.map((l: { id: string }) => l.id), [id]);
  process.env.SOL_UI_NEXT = "off";
  const o = home("off"), q = rig(o);
  for (const m of [{ type: "next.diary.write", words: "x" }, { type: "next.diary.get" }, { type: "next.diary.remove", lineId: id }, { type: "next.diary.pause", on: true }]) await q.ask(m);
  assert.equal(q.sent.length + q.all.length, 0);
  assert.equal(existsSync(join(o, "next")), false);
  process.env.SOL_UI_NEXT = "on";
});
