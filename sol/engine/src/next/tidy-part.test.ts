// The sort after the move-in, through the parts (BR1, #1615; migration.html D, Marco 16:30): a folder that arrives after
// the move-in raises the move-in's own move in the one list and on next.raises; Sort them makes it and says its line,
// with the batch its Undo takes back; the Undo puts it back as it was. The disk is invented (useJudged), and HOME,
// the record home and Sol's home are temporary folders: nothing of this machine is read or written. The face's half
// (the done line and its Undo on the frame) is sol/mac/src/next-tidy.test.ts. Signed: marcocyl04-ux's agent (builder T).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const tmp = fs.mkdtempSync(join(tmpdir(), "sol-tidy-part-"));
const was = { HOME: process.env.HOME, SOL_RECORD_HOME: process.env.SOL_RECORD_HOME, SOL_UI_NEXT: process.env.SOL_UI_NEXT };
process.env.HOME = join(tmp, "someone");
process.env.SOL_RECORD_HOME = join(tmp, "record");
process.env.SOL_UI_NEXT = "on";
process.env.SOL_SETTINGS = join(tmp, "settings.json");
process.env.SOL_STATE = join(tmp, "state", "work.json");
process.env.SOL_LOGDIR = join(tmp, "log");
process.env.CLAUDE_CONFIG_DIR = join(tmp, "claude");
process.env.CODEX_HOME = join(tmp, "codex");
for (const d of [process.env.HOME, process.env.SOL_RECORD_HOME]) fs.mkdirSync(d!, { recursive: true });
after(() => {
  for (const [k, v] of Object.entries(was)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const { judge, keepPlaces } = await import("./movein-place.js");
const { keepMoveIn } = await import("./movein.js");
const { considered } = await import("./tidy.js");
const { readStore } = await import("./you-known.js");
const { you } = await import("../parts/next.js");
const { useHome, useReaders, needsList } = await import("../parts/next-calls.js");
const tidyPart = (await import("../parts/next-tidy.js")).default;
const { useJudged } = await import("../parts/next-tidy.js");
type Place = import("./carry.js").Place;
type Reader = import("./carry.js").Reader;

const NOW = Date.now(), DAY = 86_400_000, at = (n: number) => NOW - n * DAY;
function disk(files: Record<string, number>): Reader {
  const dirs = new Set<string>();
  for (const f of Object.keys(files)) for (let d = dirname(f); d !== "/"; d = dirname(d)) dirs.add(d);
  return {
    text: () => null, head: () => null,
    time: (p) => files[p] ?? null,
    list: (p) => {
      if (!dirs.has(p)) return null;
      const out = new Map<string, boolean>();
      for (const x of [...Object.keys(files), ...dirs]) if (dirname(x) === p) out.set(x.slice(p.length + 1), dirs.has(x));
      return [...out].map(([name, dir]) => ({ name, dir }));
    },
  };
}
const pl = (path: string): Place => ({ id: path, name: path.split("/").pop()!, path, from: "claude", kind: null, holds: { repo: false, stickies: 0, things: 0, agent: false } });
const H = "/u/someone", C = `${H}/code`;
const FILES = { [`${C}/shop/readme.md`]: at(20), [`${C}/shop/api/server.ts`]: at(1), [`${C}/shop/web/app.tsx`]: at(2), [`${C}/shop/cli/main.ts`]: at(1), [`${C}/notes/todo.md`]: at(3) };
const w0 = [pl(`${C}/shop`), pl(`${C}/shop/api`), pl(`${C}/shop/web`), pl(`${C}/notes`)];
const ID = `o:inside:w:${C}/shop`;

test("a folder that arrives after the move-in raises its sort; Sort them makes it and says its line with its Undo; the Undo puts it back", async () => {
  const sol = join(tmp, "sol"); fs.mkdirSync(sol, { recursive: true });
  const r = disk(FILES), keep = w0.map((p) => "w:" + p.path);
  // the move-in, as next.movein.keep makes it: kept, placed, and weighed
  const j0 = judge({ places: w0, order: [] }, r, { now: NOW, stop: [H] });
  keepMoveIn(sol, { keep }, NOW); keepPlaces(you(sol), j0, keep, NOW); considered(sol, j0, keep, NOW);
  // then cli arrives: the next read holds it
  const j1 = judge({ places: [...w0, pl(`${C}/shop/cli`)], order: [] }, r, { now: NOW + 1000, stop: [H] });
  const unjudged = useJudged(() => j1), unhome = useHome(() => null), unread = useReaders({ drafts: () => [] });
  const on = new Map<string, (m: any, h: any) => unknown>();
  tidyPart({ on: (t: string, f: any) => on.set(t, f), atStart: () => {}, route: () => {} } as any);
  const sent: any[] = [], all: any[] = [];
  const h = { HOME: sol, PORT: 0, ws: 1, send: (_w: unknown, m: object) => sent.push(m), everyone: (m: object) => all.push(m), face: { send() {} }, conn: { chars: 0 }, fromSol: true, fromApp: true };
  try {
    // raised: once in the one list, with the raise's two answers
    const listed = ((await needsList(sol)) as any[]).filter((n) => n.id === ID);
    assert.equal(listed.length, 1, "the offer is in the one list once");
    assert.deepEqual([listed[0].piece, listed[0].words, listed[0].yes, listed[0].no], [`w:${C}/shop`, "Put cli inside shop, the way your move-in sorted?", "Sort them", "Leave them"]);

    // Sort them
    await on.get("next.tidy.yes")!({ type: "next.tidy.yes", id: ID, rid: "r1" }, h);
    const done = sent.find((m) => m.type === "next.tidy.done");
    assert.deepEqual([done.ok, done.id, done.done, done.rid], [true, ID, "Cli is inside shop now.", "r1"], "its line, to the window that asked");
    assert.ok(typeof done.batch === "string" && done.batch, "the batch its Undo takes back");
    assert.ok(readStore(sol).placed.some((p) => p.folder === `w:${C}/shop/cli` && p.to === `w:${C}/shop` && p.batch === done.batch), "cli placed inside shop");
    assert.ok(all.some((m) => m.type === "next.movein.kept") && all.some((m) => m.type === "next.state"), "every window draws it where it went");
    const raises = sent.filter((m) => m.type === "next.raises").at(-1);
    assert.ok(raises, "the asker hears its raises again");
    assert.ok(!raises.offers.some((o: { id: string }) => o.id === ID), "the raise lets go of the offer made");
    assert.ok(!sent.some((m) => m.type === "next.needs"), "never next.needs: the face latches on it (builder J)");
    const lines = () => readStore(sol).fixes.filter((f) => f.reason === `ask:${ID}`).map((f) => [f.how, f.now ?? null]);
    assert.deepEqual(lines(), [["answer", "Sort them"]]);

    // Undo: the offer named alone, as the frame's Undo may say it
    await on.get("next.tidy.undo")!({ type: "next.tidy.undo", id: ID, batch: done.batch, rid: "r2" }, h);
    const undone = sent.find((m) => m.type === "next.tidy.undone");
    assert.deepEqual([undone.ok, undone.batch, undone.undone, undone.rid], [true, done.batch, [`w:${C}/shop/cli`], "r2"]);
    assert.ok(!readStore(sol).placed.some((p) => p.batch === done.batch), "back as it was");
    assert.deepEqual(lines(), [["answer", "Sort them"], ["undo", null]]);
    assert.equal(((await needsList(sol)) as any[]).filter((n) => n.id === ID).length, 0, "undone: not raised again");
  } finally { unjudged(); unhome(); unread(); }
});
