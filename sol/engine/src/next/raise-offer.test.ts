// An offer through the judgment, end to end on builder T's own tidy (BR1 quiet canvas, #1615; quiet.html §3): a folder that
// arrives after the move-in is offered once in the one list, however many ways it comes in; its Sort them is one answer
// line, read once by the meter and by the next judgment, and its Undo adds no outcome. Invented homes only (someone's),
// on an in-memory disk. Signed: marcocyl04-ux's agent (builder J).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Place, Reader } from "./carry.js";
import { judge, keepPlaces } from "./movein-place.js";
import { keepMoveIn, readMoveIn } from "./movein.js";
import { considered, needOf, offersOf, runOffer, undoOffer } from "./tidy.js";
import { candOf } from "./raise.js";
import { recordHomeOf, type Where } from "./you.js";
import { actedNow, linesAt } from "../parts/next-raises.js";
import { addNeeds, needsList, useHome, useReaders } from "../parts/next-calls.js";

const root = fs.mkdtempSync(join(tmpdir(), "sol-raise-offer-"));
after(() => fs.rmSync(root, { recursive: true, force: true }));
const NOW = Date.parse("2026-11-20T12:00:00Z"), DAY = 86_400_000;
const at = (n: number) => NOW - n * DAY;
const H = "/u/someone", C = `${H}/code`;
const FILES: Record<string, number> = {
  [`${C}/shop/readme.md`]: at(20), [`${C}/shop/api/server.ts`]: at(1), [`${C}/shop/web/app.tsx`]: at(2),
  [`${C}/shop/cli/main.ts`]: at(1), [`${C}/notes/todo.md`]: at(3),
};
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
const w0 = [pl(`${C}/shop`), pl(`${C}/shop/api`), pl(`${C}/shop/web`), pl(`${C}/notes`)];

test("an offer is listed once however it comes in, and its Sort them is read once: one answer for the meter, one line for the next judgment, its Undo none", async () => {
  // moved in on the first read, then cli arrives inside shop: T's tidy offers to put it there
  const sol = join(root, "someone"); fs.mkdirSync(sol, { recursive: true });
  const w: Where = { sol, user: sol, rec: recordHomeOf(sol, sol) };
  const r = disk(FILES), keep = w0.map((p) => "w:" + p.path);
  const j0 = judge({ places: w0, order: [] }, r, { now: NOW, stop: [H] });
  keepMoveIn(sol, { keep }, NOW);
  keepPlaces(w, j0, keep, NOW);
  considered(sol, j0, keep, NOW);
  const j1 = judge({ places: [...w0, pl(`${C}/shop/cli`)], order: [] }, r, { now: NOW + 1000, stop: [H] });
  const [o] = offersOf(w, j1, readMoveIn(sol)!);
  assert.ok(o, "an offer is made");

  // listed once: T's part adds its needs at load; a second way in (as when two lanes each added one) changes nothing
  const unuse = useHome(() => null), unread = useReaders({ drafts: () => [] });
  const one = addNeeds(() => [needOf(o, 0)]), two = addNeeds(() => [needOf(o, 0)]);
  try {
    const list = (await needsList(sol)) as { id: string }[];
    assert.deepEqual(list.map((n) => n.id), [o.id], "the one list holds the offer once");
  } finally { unuse(); unread(); one(); two(); }

  // read once: T's yes writes its answer line, its Undo an undo line; K's outcomesOf reads the answer alone
  const yes = runOffer(w, j1, o, "raise", NOW + 2000);
  assert.equal(yes.ok, true);
  assert.equal(undoOffer(w, { id: o.id }, NOW + 3000).ok, true);
  const a = actedNow(sol, NOW + 4000);
  assert.deepEqual([a.n, a.acted, a.rate], [1, 1, 1], "one outcome, acted on");
  const c = candOf(needOf(o, 0));
  const lines = linesAt(sol, [c], NOW + 4000)[c.folder] ?? [];
  assert.equal(lines.filter((l) => l.startsWith("You answered this ask:")).length, 1, "the next judgment reads the answer once");
});
