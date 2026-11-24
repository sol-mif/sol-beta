// The sort offered after the move-in (BR1, #1615; migration.html D, Marco 16:30): a folder that arrives later is offered the
// move-in's own move, said once for all its folders, with its because; a yes, a no and an Undo are each one scoped line,
// and the next offer reads them. Invented homes only (someone's), on an in-memory disk. Signed: marcocyl04-ux's agent
// (builder T).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Place, Reader } from "./carry.js";
import { judge, keepPlaces } from "./movein-place.js";
import { keepMoveIn, readMoveIn } from "./movein.js";
import { considered, declineOffer, needOf, offersOf, runOffer, undoOffer, weighed } from "./tidy.js";
import { readStore } from "./you-known.js";
import { recordHomeOf, type Where } from "./you.js";

const root = fs.mkdtempSync(join(tmpdir(), "sol-tidy-"));
after(() => fs.rmSync(root, { recursive: true, force: true }));
const NOW = Date.parse("2026-11-20T12:00:00Z"), DAY = 86_400_000;
const whereOf = (name: string): Where => { const sol = join(root, name); fs.mkdirSync(sol, { recursive: true }); return { sol, user: sol, rec: recordHomeOf(sol, sol) }; };
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
const at = (n: number) => NOW - n * DAY;
const pl = (path: string, o: Partial<Place> = {}): Place => ({ id: path, name: path.split("/").pop()!, path, from: "claude", kind: null, holds: { repo: false, stickies: 0, things: 0, agent: false }, ...o });
const H = "/u/someone", C = `${H}/code`;
const FILES = {
  [`${C}/shop/readme.md`]: at(20), [`${C}/shop/api/server.ts`]: at(1), [`${C}/shop/web/app.tsx`]: at(2),
  [`${C}/shop/cli/main.ts`]: at(1), [`${C}/notes/todo.md`]: at(3),
};
const w0 = [pl(`${C}/shop`), pl(`${C}/shop/api`), pl(`${C}/shop/web`), pl(`${C}/notes`)];
const ids = (ps: Place[]) => ps.map((p) => "w:" + p.path);
/** a home moved in on the first read (its kept folders placed and weighed), then read again with `later` places in it */
function movedIn(name: string, later: Place[] = [pl(`${C}/shop/cli`)], keep = ids(w0)) {
  const w = whereOf(name), r = disk(FILES), j0 = judge({ places: w0, order: [] }, r, { now: NOW, stop: [H] });
  keepMoveIn(w.sol, { keep }, NOW);
  keepPlaces(w, j0, keep, NOW);
  considered(w.sol, j0, keep, NOW);
  const j1 = judge({ places: [...w0, ...later], order: [] }, r, { now: NOW + 1000, stop: [H] });
  return { w, j1, kept: () => readMoveIn(w.sol) };
}

test("a folder that arrives after the move-in is offered the move-in's own move, said once, into the folder it sits in, with its because", () => {
  const { w, j1, kept } = movedIn("arrives");
  const os = offersOf(w, j1, kept());
  assert.equal(os.length, 1);
  const o = os[0];
  assert.equal(o.id, `o:inside:w:${C}/shop`);
  assert.equal(o.piece, `w:${C}/shop`, "the raise sits on the folder it goes into, the one the canvas draws");
  assert.deepEqual(o.folders.map((f) => f.name), ["cli"]);
  assert.equal(o.words, "Put cli inside shop, the way your move-in sorted?");
  assert.equal(o.why, "On your disk it already sits inside shop, and I put api and web in shop the same way before.");
  assert.deepEqual(o.because.sort(), [`placed:w:${C}/shop/api`, `placed:w:${C}/shop/web`], "the because names the move-in's placements it rests on");
  const n = needOf(o, 2);
  assert.equal(n.rank, 6.02, "tier other, after the two before it");
  assert.equal(n.yes, "Sort them"); assert.equal(n.no, "Leave them");
  assert.deepEqual(n.offer, { kind: "inside", to: `w:${C}/shop`, folders: [`w:${C}/shop/cli`] });
});

test("yes makes the move (kept, placed, one batch) with one answer line; the offer goes; its Undo takes it out with one undo line", () => {
  const { w, j1, kept } = movedIn("yes");
  const o = offersOf(w, j1, kept())[0];
  const r = runOffer(w, j1, o, "raise", NOW + 2000);
  assert.ok(r.ok);
  assert.ok(kept()!.keep.includes(`w:${C}/shop/cli`), "a folder new to Sol is kept, so the canvas draws it");
  const s = readStore(w.sol), p = s.placed.find((x) => x.folder === `w:${C}/shop/cli`)!;
  assert.equal(p.to, `w:${C}/shop`); assert.equal(p.batch, r.batch);
  const yes = s.fixes.filter((f) => f.reason === `ask:${o.id}`);
  assert.equal(yes.length, 1); assert.equal(yes[0].how, "answer"); assert.equal(yes[0].now, "Sort them"); assert.equal(yes[0].place, `w:${C}/shop`); assert.equal(yes[0].what, "cli inside shop");
  assert.equal(r.done, "Cli is inside shop now.");
  assert.deepEqual(offersOf(w, j1, kept()), [], "made: no longer offered");

  const u = undoOffer(w, { batch: r.batch, id: o.id }, NOW + 3000);
  assert.ok(u.ok);
  assert.ok(!readStore(w.sol).placed.some((x) => x.batch === r.batch), "its placements out");
  const lines = readStore(w.sol).fixes.filter((f) => f.reason === `ask:${o.id}`);
  assert.deepEqual(lines.map((f) => f.how), ["answer", "undo"]);
  assert.ok(lines.every((f) => f.place && f.reason), "every line says where it holds and why");
  assert.deepEqual(offersOf(w, j1, kept()), [], "undone: the next offer reads the line and does not ask again");
  assert.equal(offersOf(w, j1, kept(), { all: true }).length, 1, "asked for (tidy my folders), it is made again");
  assert.equal(undoOffer(w, { batch: r.batch, id: o.id }).ok, false, "an Undo twice changes nothing");
  assert.equal(undoOffer(w, { batch: "movein-x", id: "o:shelf:shelf" }).ok, false, "never the move-in's batch");
});

test("no is one answer line, Leave them; the same offer is not made again, until the person asks", () => {
  const { w, j1, kept } = movedIn("no");
  const o = offersOf(w, j1, kept())[0];
  declineOffer(w, o, NOW + 2000);
  const f = readStore(w.sol).fixes.at(-1)!;
  assert.deepEqual([f.how, f.now, f.place, f.reason, f.what], ["answer", "Leave them", `w:${C}/shop`, `ask:${o.id}`, "cli inside shop"]);
  assert.deepEqual(offersOf(w, j1, kept()), []);
  assert.equal(offersOf(w, j1, kept(), { all: true })[0].id, o.id);
  assert.ok(!readStore(w.sol).placed.some((x) => x.folder === `w:${C}/shop/cli`), "a no moves nothing");
  // the raise's own lines for the same ask (later, pass) come after: they never undo the no
  const s = readStore(w.sol);
  s.fixes.push({ id: "q1", how: "pass", what: "Sol", place: `w:${C}/shop`, reason: `ask:${o.id}`, at: new Date(NOW + 3000).toISOString() });
  fs.writeFileSync(join(w.sol, "next", "known.json"), JSON.stringify(s));
  assert.deepEqual(offersOf(w, j1, kept()), [], "a pass line after the no: still not offered");
});

test("what the move-in weighed is never offered again: a move the person changed back there stays as they left it", () => {
  // web was kept but left out of its move (the migration's "Leave it as it was"): weighed, never placed
  const w = whereOf("apart"), r = disk(FILES), j0 = judge({ places: w0, order: [] }, r, { now: NOW, stop: [H] }), keep = ids(w0);
  keepMoveIn(w.sol, { keep }, NOW);
  keepPlaces(w, j0, keep, NOW, [], { apart: [`w:${C}/shop/web`] });
  considered(w.sol, j0, keep, NOW);
  assert.equal(weighed(w.sol)![`w:${C}/shop/web`], "inside");
  assert.deepEqual(offersOf(w, j0, readMoveIn(w.sol), { all: true }), [], "not even when asked: the person decided it at the move-in");
});

test("a folder new to Sol is offered only into a folder the person keeps; one with nowhere on the canvas to go waits", () => {
  const away = pl(`${C}/side/tool`), files = { ...FILES, [`${C}/side/tool/x.ts`]: at(1), [`${C}/side/readme.md`]: at(9) };
  const w = whereOf("nowhere"), r = disk(files), j0 = judge({ places: w0, order: [] }, r, { now: NOW, stop: [H] });
  keepMoveIn(w.sol, { keep: ids(w0) }, NOW); keepPlaces(w, j0, ids(w0), NOW); considered(w.sol, j0, ids(w0), NOW);
  const j1 = judge({ places: [...w0, away, pl(`${C}/side`)], order: [] }, r, { now: NOW, stop: [H] });
  assert.ok(j1.find((j) => j.folder === `w:${C}/side/tool`)?.parent, "it does sit inside side");
  assert.deepEqual(offersOf(w, j1, readMoveIn(w.sol), { all: true }), [], "side is not kept, so nothing on the canvas holds tool");
});

test("before the move-in nothing is offered, and a person's own move of a folder makes it theirs", () => {
  const w = whereOf("before"), r = disk(FILES), j = judge({ places: [...w0, pl(`${C}/shop/cli`)], order: [] }, r, { now: NOW, stop: [H] });
  assert.deepEqual(offersOf(w, j, null), []);
  const m = movedIn("theirs");
  const fixes = readStore(m.w.sol);
  fixes.fixes.push({ id: "x", how: "drag", what: "cli", place: `w:${C}/shop/cli`, reason: "placed:x", at: new Date(NOW).toISOString() });
  fs.writeFileSync(join(m.w.sol, "next", "known.json"), JSON.stringify(fixes));
  assert.deepEqual(offersOf(m.w, m.j1, m.kept(), { all: true }), [], "the person moved it: never Sol's to sort");
});

test("a kept folder whose judgment changed since the move-in is offered: used on one day only, it has had its week", () => {
  // eight folders lived in on many days, and one changed on one day only, two days before the move-in (too new to judge)
  const many: Record<string, number> = {};
  const tops = Array.from({ length: 8 }, (_, i) => `${C}/p${i}`);
  tops.forEach((t, i) => { for (let d = 0; d < 6; d++) many[`${t}/f${d}.md`] = at(d * 3 + (i % 3)); });
  const once = `${C}/once`;
  many[`${once}/a.md`] = at(2);
  const places = [...tops, once].map((p) => pl(p)), keep = ids(places), r = disk(many);
  const w = whereOf("week"), j0 = judge({ places, order: [] }, r, { now: NOW, stop: [H] });
  assert.equal(j0.find((j) => j.path === once)!.shelf, false, "changed this week: not judged yet");
  keepMoveIn(w.sol, { keep }, NOW); keepPlaces(w, j0, keep, NOW); considered(w.sol, j0, keep, NOW);
  const j1 = judge({ places, order: [] }, r, { now: NOW + 30 * DAY, stop: [H] });
  const os = offersOf(w, j1, readMoveIn(w.sol));
  assert.equal(os.length, 1);
  assert.equal(os[0].id, "o:shelf:shelf");
  assert.equal(os[0].piece, `w:${once}`, "the Archive is no folder: the raise sits on the folder itself");
  assert.equal(os[0].words, "Archive once, the way your move-in sorted? Nothing is deleted.");
  assert.equal(os[0].toName, "the Archive");
  assert.ok(![os[0].words, os[0].why].some((t) => /shelf/i.test(t)), "no Shelf word on the face (Marco 14:51)");
  const made = runOffer(w, j1, os[0], "raise", NOW + 30 * DAY + 1);
  assert.ok(made.ok); assert.equal(made.done, "I archived once. Nothing is deleted.");
  assert.ok(!/shelf/i.test(made.what), made.what);
});

test("an Undo that names only the offer (the raise's own Undo) takes out that offer's last yes still placed", () => {
  const { w, j1, kept } = movedIn("undo-by-id");
  const o = offersOf(w, j1, kept())[0];
  const r = runOffer(w, j1, o, "raise", NOW + 2000);
  assert.ok(r.ok);
  const u = undoOffer(w, { id: o.id }, NOW + 3000);
  assert.ok(u.ok); assert.equal(u.batch, r.batch);
  assert.ok(!readStore(w.sol).placed.some((x) => x.batch === r.batch), "its placements out");
  assert.equal(undoOffer(w, { id: o.id }).ok, false, "nothing of it still placed: an Undo again changes nothing");
});
