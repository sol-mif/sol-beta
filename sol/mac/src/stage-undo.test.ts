// node --test src/*.test.ts (npm test here): undo for every hand verb (#778, stage/undo.ts on b9's stack in
// geometry.ts), build/feel.md rule 8 and "undo stack". The Try line, "close, trade and nudge, then ⌘Z three times: all
// back", run on the stage's own shapes: three verbs recorded, three undos applied, and the stage is as it began.
import { test } from "node:test";
import assert from "node:assert/strict";
import { droppedCloses, nothing, nudge, placesAfter, restore, stageShot } from "./stage/undo.ts";
import { EMPTY_UNDO, record, redo, undo, UNDO_CAP, type Undo } from "./stage/geometry.ts";
import type { Place } from "./stage/model.ts";
import { LIFE, RING } from "./kit/feel.ts";

const P = (id: string, x: number, y: number, w = 240, h = 160, z = 1): Place => ({ id, x, y, w, h, z });
const room = { w: 1000, h: 640 };

/** a little stage: its places and the closes the face holds, as Stage.tsx keeps them */
function stage(places: Place[]) {
  let ps = places, closed = new Set<string>(), u: Undo = EMPTY_UNDO, t = 0;
  const shot = () => stageShot(ps, closed, () => "live", () => 0);
  const act = (verb: string, f: () => void) => { const before = shot(); f(); u = record(u, verb, (t += 1000), before, shot()); };
  const apply = (to: ReturnType<typeof shot>) => {
    const r = restore(shot(), to);
    for (const id of r.close) closed.add(id);
    for (const id of r.reopen.keys()) closed.delete(id);
    ps = placesAfter(ps, r, Math.max(...ps.map((p) => p.z)));
    return r;
  };
  return {
    get places() { return ps; }, get closed() { return closed; }, get u() { return u; },
    close: (id: string) => act("close", () => { closed = new Set([...closed, id]); }),
    trade: (a: string, b: string) => act("trade", () => { const A = ps.find((p) => p.id === a)!, B = ps.find((p) => p.id === b)!; ps = ps.map((p) => (p.id === a ? { ...p, x: B.x, y: B.y, w: B.w, h: B.h } : p.id === b ? { ...p, x: A.x, y: A.y, w: A.w, h: A.h } : p)); }),
    nudge: (id: string, key: string, at?: number) => { if (at !== undefined) t = at - 1000; act("nudge", () => { const p = ps.find((x) => x.id === id)!; const n = nudge(p, key, room)!; ps = ps.map((x) => (x.id === id ? { ...x, x: n.x, y: n.y } : x)); }); },
    fold: (id: string) => act("fold", () => { ps = ps.map((p) => (p.id === id ? { ...p, folded: true } : p)); }),
    undo: () => { const e = undo(u); if (!e) return null; u = e.u; return apply(e.to); },
    redo: () => { const e = redo(u); if (!e) return null; u = e.u; return apply(e.to); },
  };
}
const rects = (ps: Place[]) => ps.map(({ id, x, y, w, h, folded }) => ({ id, x, y, w, h, folded: !!folded }));

test("Try: close, trade and nudge, then ⌘Z three times: all back", () => {
  const start = [P("week", 16, 16, 440, 300), P("list", 468, 16, 284, 204), P("diff", 16, 328, 440, 290)];
  const s = stage(start);
  s.close("diff");
  s.trade("week", "list");
  s.nudge("list", "ArrowRight");
  assert.ok(s.closed.has("diff"));
  assert.deepEqual(s.places.find((p) => p.id === "week")!.x, 468);
  assert.deepEqual(s.places.find((p) => p.id === "list")!.x, 24);
  assert.equal(s.u.undo.length, 3);
  const r1 = s.undo()!;   // the nudge
  assert.deepEqual([...r1.travel.keys()], ["list"]);
  const r2 = s.undo()!;   // the trade: both travel
  assert.deepEqual([...r2.travel.keys()].sort(), ["list", "week"]);
  const r3 = s.undo()!;   // the close: it comes back where it was
  assert.deepEqual([...r3.reopen.keys()], ["diff"]);
  assert.deepEqual(rects(s.places), rects(start));
  assert.equal(s.closed.size, 0, "nothing held closed");
  assert.equal(s.undo(), null, "nothing left to undo");
});

test("⇧⌘Z does them again, in order; a new verb clears what could be redone", () => {
  const start = [P("a", 16, 16), P("b", 300, 16)];
  const s = stage(start);
  s.trade("a", "b");
  s.close("a");
  s.undo(); s.undo();
  assert.deepEqual(rects(s.places), rects(start));
  s.redo();
  assert.equal(s.places.find((p) => p.id === "a")!.x, 300);
  s.redo();
  assert.ok(s.closed.has("a"));
  s.undo();
  s.fold("b");
  assert.equal(s.redo(), null);
});

test("fold and unfold are undone too; a block the snapshot does not know (the agent's, made after) is left alone", () => {
  const s = stage([P("a", 16, 16), P("b", 300, 16)]);
  s.fold("a");
  const r = s.undo()!;
  assert.ok(r.unfold.has("a"));
  assert.equal(s.places.find((p) => p.id === "a")!.folded, false);
  const now = stageShot([P("a", 16, 16), P("new", 600, 16)], new Set(), () => "live", () => 0);
  assert.ok(nothing(restore(now, stageShot([P("a", 16, 16)], new Set(), () => "live", () => 0))));
});

test("nudges within 800 ms are one undo; ⌥arrows move 8 and stay on the stage", () => {
  const s = stage([P("a", 16, 16)]);
  s.nudge("a", "ArrowDown", 0);
  s.nudge("a", "ArrowDown", 500);
  s.nudge("a", "ArrowDown", 1000);
  assert.equal(s.u.undo.length, 1);
  s.undo();
  assert.equal(s.places[0].y, 16);
  assert.deepEqual(nudge(P("a", 16, 16), "ArrowLeft", room), { ...P("a", 16, 16) }, "at the pad it holds");
  assert.equal(nudge(P("a", 16, 16), "KeyA", room), null);
  assert.deepEqual(nudge(P("a", 100, 12), "ArrowRight", room), P("a", 108, 12), "a right nudge never moves it down");
});

test("a held close is committed once no undo can bring it back (64 entries)", () => {
  let u: Undo = EMPTY_UNDO;
  const open = stageShot([P("x", 16, 16)], new Set(), () => "live", () => 0);
  const shut = stageShot([P("x", 16, 16)], new Set(["x"]), () => "live", () => 0);
  u = record(u, "close", 0, open, shut);
  for (let i = 1; i < UNDO_CAP; i++) { const prev = u; u = record(u, "move", i * 1000, shut, shut); assert.deepEqual(droppedCloses(prev, u, new Set(["x"])), []); }
  const prev = u;
  u = record(u, "move", 99_000, shut, shut);
  assert.deepEqual(droppedCloses(prev, u, new Set(["x"])), ["x"], "the 65th verb pushes the close off: it is committed");
});

test("the outline lives 6 s with a 44 px ring (feel.md life.scar, the undo ring)", () => {
  assert.equal(LIFE.scar, 6000);
  assert.equal(RING.size, 44);
});
