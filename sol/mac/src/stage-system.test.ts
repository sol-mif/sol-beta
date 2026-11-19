// node --test src/*.test.ts: the system block's model (#1091, stage/kinds/system/model.ts): tiles laid in their lanes in
// the engine's order, what grew between two views, the since strip's words, and the trace.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY, grew, growWords, layout, laneX, sinceWords, traceOf, viewAt, heightOf, ROW_GAP, type Tile, type View } from "./stage/kinds/system/model.ts";

const ring = (n = 0) => ({ signal: n > 0, owner: n > 1, decision: n > 2, change: n > 3, check: n > 4 });
const tile = (id: string, layer: Tile["layer"], more: Partial<Tile> = {}): Tile => ({
  id, name: id.split("/").pop()!, about: "", kind: "doc", state: "live", owner: "m", layer, guessed: false, weight: 0, ring: ring(2), paths: [], machines: [], inArea: true, ...more,
});
const view = (tiles: Tile[], wires: [string, string][] = [], more: Partial<View> = {}): View => ({ ...EMPTY, area: "design", name: "Design", tiles, wires, ...more });

test("tiles stand in their lane's column, stacked in the order the engine sent", () => {
  const v = view([tile("design/root", "why"), tile("design/brand", "why"), tile("design/tokens", "source")]);
  const b = layout(v);
  assert.equal(b.get("design/root")!.x, laneX("why"));
  assert.equal(b.get("design/brand")!.y, heightOf({ id: "design/root", inArea: true }) + ROW_GAP);
  assert.equal(b.get("design/tokens")!.x, laneX("source"));
  assert.equal(b.get("design/tokens")!.y, 0);
  assert.ok(heightOf({ id: "design/tokens", inArea: true }) > heightOf({ id: "design/x", inArea: false }), "a real face is taller than a tile one hop out");
});

test("what grew: born, a new wire, a beat that closed, a gap that closed, a change", () => {
  const a = view([tile("a", "why"), tile("b", "rules")], [], { gaps: [{ from: "a", to: "b", why: "typed twice" }] });
  const b = view([tile("a", "why", { ring: ring(3) }), tile("b", "rules", { about: "now said" }), tile("c", "source")], [["a", "b"]]);
  const g = grew(a, b);
  assert.deepEqual(g.born, ["c"]);
  assert.deepEqual(g.wires, ["a>b"]);
  assert.deepEqual(g.closed, ["a:decision"]);
  assert.deepEqual(g.mended, ["a>b"]);
  assert.deepEqual(g.changed, ["b"]);
  assert.equal(growWords(g, (id) => `the ${id}`), "1 new: the c · 1 new wire · 1 beat closed · a gap closed · the b changed");
  assert.equal(growWords(grew(b, b), String), "");
});

test("the since strip: what grew since the last look, nothing, or a first look", () => {
  const f1 = { sha: "1", at: 1000, subject: "the root", view: view([tile("a", "why")]) };
  const f2 = { sha: "2", at: 5000, subject: "the tokens", view: view([tile("a", "why"), tile("t", "source")], [["a", "t"]]) };
  assert.equal(viewAt([f1, f2], 999), null);
  assert.equal(viewAt([f1, f2], 4000), f1.view);
  assert.match(sinceWords([f1, f2], f2.view, 4000, String), /^Since you looked \(.+\): 1 new: t · 1 new wire\.$/);
  assert.match(sinceWords([f1, f2], f2.view, 6000, String), /^Nothing grew since you looked/);
  assert.match(sinceWords([f1, f2], f2.view, null, String), /^First look\. Grown from 2 changes since .+: 2 systems, 1 wire\.$/);
  // one system is "1 system", never "1 systems"
  assert.match(sinceWords([f1], f1.view, null, String), /: 1 system, 0 wires\.$/);
  assert.equal(sinceWords([], f1.view, null, String), "First look: 1 system.");
  // looked before the area existed: everything is new
  assert.match(sinceWords([f1, f2], f2.view, 10, String), /2 new: a, t/);
});

test("the trace: up the leftmost feeders to the why, this, then the surfaces it reaches", () => {
  const v = view([tile("root", "why"), tile("rules", "rules"), tile("tok", "source"), tile("kit", "machine"), tile("app", "surface"), tile("site", "surface")],
    [["root", "rules"], ["rules", "tok"], ["kit", "app"], ["tok", "kit"], ["tok", "site"]]);
  assert.deepEqual(traceOf("tok", v), { up: ["root", "rules"], me: "tok", surfaces: ["site", "app"] });
  assert.deepEqual(traceOf("root", v), { up: [], me: "root", surfaces: ["site", "app"] });
});
