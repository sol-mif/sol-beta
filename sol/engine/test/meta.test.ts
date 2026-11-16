// The meta beside each clean-Home part and the atlas drawn from it (#599): the lint's rule and the map's flags.
import { test } from "node:test";
import assert from "node:assert/strict";
import { metaMissing, META_FILES } from "../src/team/gate.ts";
const { atlas, components, metaOf, readParts, readFlows, slug } = await import("../../design/atlas/build.mjs");

const file = (meta: string) => [
  'import type { Metas } from "./meta";',
  meta,
  "export function Home() { return <div><Side /></div>; }",
  "function Jump() { return null; }",
  "export const Row = (p: { a: number }) => <i />;",
  "const helper = () => 1;",
].join("\n");

test("lint: a clean-Home component without its meta entry is refused, one with it is not", () => {
  const full = file('export const meta = {\n  Home: { job: "j", flow: "say", states: [], keys: [], listens: [] },\n  Jump: { job: "j", flow: "pickup", states: [], keys: [], listens: [] },\n  Row: { job: "j", flow: "pickup", states: [], keys: [], listens: [] },\n} satisfies Metas;');
  assert.deepEqual(metaMissing(full), []);
  const part = file('export const meta = {\n  Home: { job: "j", flow: "say", states: [], keys: [], listens: [] },\n} satisfies Metas;');
  assert.deepEqual(metaMissing(part), ["Jump", "Row"], "a component, exported or not, a function or an arrow; a lower-case helper is not one");
  assert.deepEqual(metaMissing(file("")), ["Home", "Jump", "Row"]);
  assert.ok(META_FILES.test("sol/mac/src/home/Side.tsx") && !META_FILES.test("sol/mac/src/home/sideRows.ts") && !META_FILES.test("sol/mac/src/work/WorkApp.tsx"));
});

test("atlas: the meta is read as a literal; components and their bodies are found", () => {
  const src = file('export const meta = {\n  Home: { job: "the scene", flow: "say", states: ["a b: c"], keys: [], listens: [] },\n} satisfies Metas;');
  assert.equal(metaOf(src).Home.job, "the scene");
  assert.deepEqual(components(src).map((c: { name: string }) => c.name), ["Home", "Jump", "Row"]);
  assert.equal(slug("pane: a second session"), "pane-a-second-session");
});

const P = (name: string, flow: string, keys: object[], renders: string[] = [], states: string[] = []) =>
  ({ name, file: `x/${name}.tsx`, job: name, flow, states, keys, listens: [], renders, stills: Object.fromEntries(states.map((s) => [s, s === "has"])) });
const FLOWS = [{ id: "say", name: "Say", goal: "g" }, { id: "pickup", name: "Pick up", goal: "g" }, { id: "know", name: "Know", goal: "g" }, { id: "call", name: "Call", goal: "g" }];

test("atlas: presses from Home, the one required road, a clash, an orphan and a state with no still", () => {
  const parts = [
    P("Home", "say", [{ press: "type", does: "d", goal: "say" }, { press: "⌘K", does: "d", opens: "Jump" }], ["Side", "Jump", "Mark"], ["has", "none"]),
    P("Side", "pickup", [{ press: "click a row", does: "d", goal: "pickup" }, { press: "click new", does: "d", goal: "say", faster: true }], ["Mark"]),
    P("Jump", "pickup", [{ press: "Enter", does: "d", goal: "pickup" }]),
    P("Mark", "know", []),
    P("Lone", "say", [{ press: "click", does: "d" }]),
  ];
  const a = atlas(parts, FLOWS);
  const g = Object.fromEntries(a.goals.map((x: { id: string }) => [x.id, x]));
  assert.equal(g.say.presses, 1); assert.equal(g.say.clash, false, "a faster road is not a clash");
  assert.equal(g.pickup.clash, true, "two required roads to one goal");
  assert.deepEqual(g.pickup.roads.map((r: { part: string; presses: number }) => [r.part, r.presses]), [["Side", 1], ["Jump", 2]], "a part a press opens costs one press more");
  assert.equal(g.know.presses, 0, "a part that serves its flow by being seen");
  assert.deepEqual(g.call.roads, []);
  assert.deepEqual(a.flags.clashes.map((x: { goal: string }) => x.goal), ["pickup"]);
  assert.deepEqual(a.flags.orphans.map((x: { part: string }) => x.part), ["Lone"]);
  assert.deepEqual(a.flags.noStill, [{ part: "Home", state: "none" }]);
});

test("atlas: every component in the clean Home today has its meta, and every meta names a flow of the ten", () => {
  const { parts, missing } = readParts();
  assert.deepEqual(missing, []);
  const a = atlas(parts, readFlows());
  assert.deepEqual(a.flags.unknownFlows, []);
  assert.deepEqual(a.flags.clashes, [], "the clean face reaches each goal one way");
});
