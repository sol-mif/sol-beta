// node --test src/*.test.ts: Cowork's map drawn from its spec (#1433, cowork/map/scene.ts): the layers fold at eight,
// a view re-weighs the same places, the pins sit where the spec says for whose seat it is, a still is an address, and
// the map as a Cowork place keeps its path. The face names nobody: no word of a team's setup is in its files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drawMap, modelOf, pathOf, pinShort, readAddress, seatOf, stateOf, writeAddress, type MapState, type VNode } from "./cowork/map/scene.ts";
import { mapFixture as spec } from "./cowork/map/fixture.ts";

const st = (x: Partial<MapState> = {}): MapState => ({ who: "a", view: "change", at: "root", hours: 72, off: [], type: "outcomes", open: null, ...x });
const find = (n: VNode, key: string): VNode[] => [...(n.a[key] != null ? [n] : []), ...n.k.flatMap((k) => find(k, key))];

test("layer 1 is the spec's hand-laid outcomes; a layer of more than eight shows its busiest and folds the quiet rest", () => {
  const m = modelOf(spec, st());
  assert.deepEqual(m.kidsOf("root"), { shown: ["o:one", "o:two"], folded: [] });
  const k = m.kidsOf("face");
  assert.ok(k.shown.length <= 7);
  assert.deepEqual(k.shown, ["face/k3"]);   // the only one that moved; the rest weigh nothing in Change
  assert.equal(k.folded.length, 9);
  const s = drawMap(modelOf(spec, st({ at: "face" })));
  assert.ok(s.pos["~fold"], "the quiet rest is one circle");
});

test("a view re-weighs the same places: Calls lifts where the calls are", () => {
  const ch = modelOf(spec, st()), ca = modelOf(spec, st({ view: "calls" }));
  assert.ok(ca.weight("o:two") > ca.weight("o:one"));
  assert.ok(ch.weight("o:one") > 0);
  assert.equal(ca.markOf("engine"), "1 open call · 1 a week+");
  assert.equal(ch.markOf("face"), "1 moved");
});

test("the folders type ranks layer 1 instead of laying it", () => {
  const m = modelOf(spec, st({ type: "folders" }));
  assert.equal(m.laidRoot, false);
  assert.deepEqual(m.kidsOf("root").shown.sort(), ["engine", "face"]);
});

test("pins: the seat's own, in their view or on Change's layer 1; a counted pin recounts in the Time window", () => {
  const pins = (x: Partial<MapState>) => find(drawMap(modelOf(spec, st(x))).root, "data-pin").map((n) => n.a["data-pin"]);
  assert.deepEqual(pins({}), [1, 2]);
  assert.deepEqual(pins({ view: "calls" }), [1]);
  assert.deepEqual(pins({ who: "b" }), []);
  const m = modelOf(spec, st({ hours: 6 }));
  assert.equal(pinShort(m, spec.surface.a.top[1]), "0 into B's · 6 h");
  assert.equal(pinShort(modelOf(spec, st({ hours: 12 })), spec.surface.a.top[1]), "1 into B's · 12 h");
});

test("a still is an address, both ways; a seat is the person a login is", () => {
  const s = st({ who: "b", view: "calls", at: "engine", open: "engine/team", off: ["live"], hours: 6 });
  assert.equal(writeAddress(s, spec), "#who=b&view=calls&at=engine&off=live&open=engine/team&t=6");
  assert.deepEqual(readAddress(writeAddress(s, spec), spec, "a"), s);
  assert.equal(readAddress("", spec, "b").view, "calls");   // b's default view
  assert.equal(seatOf(spec, "B-GH"), "b");
  assert.equal(seatOf(spec, "nobody"), "a");
});

test("as a Cowork place: the path is the chain down; a place with none under it opens over its layer", () => {
  const base = { who: "a", view: "change", hours: 72, off: [], type: "outcomes" };
  assert.deepEqual(pathOf(spec, st({ at: "engine", open: "engine/team" })), ["o:two", "engine", "engine/team"]);
  assert.deepEqual(stateOf(spec, ["o:two", "engine", "engine/team"], base, false), st({ at: "engine", open: "engine/team" }));
  assert.deepEqual(stateOf(spec, ["o:one", "face"], base, false), st({ at: "face" }));
  assert.deepEqual(stateOf(spec, [], base, true), st({ open: "~fold" }));
});

test("the face names nobody: no person, login or outcome of the project's own setup is in the map's files", () => {
  const here = dirname(fileURLToPath(import.meta.url)), setup = join(here, "../../../.sol/cowork-map.json");
  if (!existsSync(setup)) return;   // a checkout without the team's files (beta)
  const s = JSON.parse(readFileSync(setup, "utf8"));
  const words: string[] = [...s.people.flatMap((p: any) => [p.name, ...p.logins, ...(p.names ?? [])]), ...s.outcomes.map((o: any) => o.name)].filter((w: string) => w.length > 3);
  const dir = join(here, "cowork/map");
  for (const f of readdirSync(dir)) {
    const t = readFileSync(join(dir, f), "utf8").toLowerCase();
    for (const w of words) assert.ok(!t.includes(w.toLowerCase()), `${f} names "${w}"`);
  }
});
