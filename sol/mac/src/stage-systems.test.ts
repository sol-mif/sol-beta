// node --test src/*.test.ts: the whole of Jelly's model (#1193, stage/kinds/systems/model.ts): islands on the map, the
// wires drawn between clusters, the zoom, and each cluster's own drawing (in → inside → out, machines, parts).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_WIRE, SPOTS, drawingOf, flowLayout, flowOf, islandLine, islandsOf, machinesOf, moved, partsOf, peopleIn, personOf, wiresDrawn, zoomed,
  type Change, type Cluster, type Sys, type Whole,
} from "./stage/kinds/systems/model.ts";

const sys = (id: string, more: Partial<Sys> = {}): Sys => ({
  id, name: id.split("/").pop()!, kind: "service", state: "live", parent: id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : "jelly", cluster: id.split("/")[0], machines: [], units: [], ...more,
});
const cluster = (id: string, more: Partial<Cluster> = {}): Cluster => ({ id, name: id, about: "", role: "parts", count: 1, states: { live: 1 }, ...more });
const whole = (more: Partial<Whole> = {}): Whole => ({ at: 0, name: "Jelly", about: "", clusters: [], wires: [], systems: [], links: [], who: [], changes: {}, last: null, ...more });

test("an island stands on its cluster's spot of the map; a cluster nobody placed takes a free one, never another's", () => {
  const at = islandsOf([cluster("engine"), cluster("design"), cluster("new-one"), cluster("another")]);
  assert.deepEqual(at.get("engine"), SPOTS.engine);
  assert.deepEqual(at.get("design"), SPOTS.design);
  const taken = new Set(Object.values(SPOTS).map((p) => p.join()));
  assert.ok(!taken.has(at.get("new-one")!.join()) && !taken.has(at.get("another")!.join()));
  assert.notDeepEqual(at.get("new-one"), at.get("another"));
});

test("only wires between clusters on the map are drawn, and only the ones that carry enough systems", () => {
  const at = new Map([["engine", 0], ["product", 0], ["design", 0]]);
  const drawn = wiresDrawn([
    { from: "engine", to: "product", n: 57 }, { from: "design", to: "engine", n: MIN_WIRE - 1 },
    { from: "engine", to: "gone", n: 9 }, { from: "engine", to: "engine", n: 9 },
  ], at);
  assert.deepEqual(drawn.map((w) => `${w.from}>${w.to}`), ["engine>product"]);
});

test("the zoom: a press on a cluster opens it, empty ground or Escape goes back, another key does nothing, a cluster that left goes back", () => {
  let z = zoomed(null, { press: "cluster", id: "engine" });
  assert.equal(z, "engine");
  assert.equal(zoomed(z, { key: "a" }), "engine");
  assert.equal(zoomed(z, { key: "Escape" }), null);
  assert.equal(zoomed(z, { press: "ground" }), null);
  assert.equal(zoomed(z, { known: ["engine", "design"] }), "engine");
  z = zoomed(z, { known: ["design"] });
  assert.equal(z, null);
  assert.equal(zoomed(null, { known: [] }), null);
});

test("each cluster opens in its own drawing: design is the System kind, the rest by their role", () => {
  assert.equal(drawingOf({ role: "lanes" }), "system");
  assert.equal(drawingOf({ role: "flow" }), "flow");
  assert.equal(drawingOf({ role: "machines" }), "machines");
  assert.equal(drawingOf({ role: "parts" }), "parts");
});

test("in → inside → out: other clusters' feeders by cluster on the left, its own parts the most wired first, what it feeds on the right", () => {
  const w = whole({
    systems: [sys("engine", { kind: "area" }), sys("engine/hub"), sys("engine/sessions"), sys("engine/old", { state: "legacy" }), sys("engine/quiet"),
      sys("design/tokens"), sys("design/icon"), sys("product/home"), sys("product/build"), sys("legacy/x", { state: "legacy" })],
    links: [["design/tokens", "engine/hub"], ["design/icon", "engine/hub"], ["engine/hub", "product/home"], ["engine/sessions", "product/build"],
      ["engine/sessions", "engine/hub"], ["legacy/x", "engine/hub"], ["engine/old", "product/home"]],
  });
  const f = flowOf("engine", w);
  assert.deepEqual(f.ins.map((s) => [s.cluster, s.systems.map((x) => x.id)]), [["design", ["design/icon", "design/tokens"]]], "a legacy feeder is not drawn");
  assert.deepEqual(f.inside.map((s) => s.id), ["engine/hub", "engine/sessions", "engine/quiet"], "not the cluster itself, not legacy; the most wired first");
  assert.deepEqual(f.outs.map((s) => [s.cluster, s.systems.length]), [["product", 2]]);
  assert.ok(f.wires.some(([a, b]) => a === "in:design" && b === "engine/hub"));
  assert.ok(f.wires.some(([a, b]) => a === "engine/sessions" && b === "out:product"));
  assert.ok(f.wires.some(([a, b]) => a === "engine/sessions" && b === "engine/hub"));
  const { boxes, w: width } = flowLayout(f);
  assert.ok(boxes.get("in:design")!.x < boxes.get("engine/hub")!.x && boxes.get("engine/hub")!.x < boxes.get("out:product")!.x, "three columns, left to right");
  assert.equal(width, boxes.get("out:product")!.x + boxes.get("out:product")!.w);
});

test("machines: one column a machine, the known ones first, each with its own systems and every unit anywhere named on it", () => {
  const w = whole({
    systems: [sys("machines", { kind: "area" }), sys("machines/nucbox", { kind: "machine", name: "The NucBox", machines: ["nucbox"] }),
      sys("machines/macbook", { kind: "machine", name: "The MacBook", machines: ["macbook"] }),
      sys("machines/nucbox/backup", { machines: ["nucbox"] }), sys("build/runner", { machines: ["legion", "nucbox"], units: ["sol-runner.service"] }),
      sys("day/morning", { machines: ["nucbox"], units: ["a.timer", "a.service"] }), sys("day/no-units", { machines: ["nucbox"] })],
  });
  const cols = machinesOf("machines", w);
  assert.deepEqual(cols.map((c) => c.machine), ["macbook", "nucbox"]);
  assert.equal(cols[1].name, "The NucBox");
  assert.deepEqual(cols[1].systems.map((s) => s.id), ["day/morning", "build/runner", "machines/nucbox/backup"], "the most units first; a system without units elsewhere is not the machines'");
  assert.deepEqual(cols[0].systems, []);
});

test("the app's parts: every system but the cluster itself, live first", () => {
  const w = whole({ systems: [sys("app", { kind: "area" }), sys("app/zeta"), sys("app/alpha", { state: "legacy" }), sys("app/beta"), sys("engine/x")] });
  assert.deepEqual(partsOf("app", w).map((s) => s.id), ["app/beta", "app/zeta", "app/alpha"]);
});

test("who is in a cluster, by person, the newest first; a person's name from git's or a login", () => {
  assert.equal(personOf("chun yee marco lam"), "Marco");
  assert.equal(personOf("Frank Tsai"), "Frank");
  assert.equal(personOf("w0ngtap"), "Isaac");
  assert.equal(personOf("ada"), "Ada");
  const h = (cluster: string, person: string, session: string, at: number) => ({ cluster, systems: [`${cluster}/x`], person, session, title: session, branch: "b", at });
  const ps = peopleIn([h("engine", "Frank Tsai", "f1", 50), h("engine", "chun yee marco lam", "m1", 40), h("engine", "Marco", "m2", 30), h("design", "Marco", "m3", 90)], "engine");
  assert.deepEqual(ps.map((p) => [p.person, p.sessions.length]), [["Frank", 1], ["Marco", 2]]);
});

const change = (sha: string, more: Partial<Change> = {}): Change => ({ sha, at: 1000, subject: "engine: the hub listens (#12)", author: "Marco", agent: true, clusters: ["engine"], systems: ["engine/hub"], reaches: ["product"], ...more });
test("an island's line: its newest change while fresh, else its count and what is not live", () => {
  const c = cluster("engine", { count: 5, states: { live: 3, building: 2 } });
  assert.equal(islandLine(c, change("a", { at: 1000 }), 1000 + 5 * 60_000), "Marco's agent · 5 min ago · the hub listens");
  assert.equal(islandLine(c, change("a", { at: 0 }), 7 * 3_600_000), "5 systems · 2 building");
});

test("motion only for a change: a new newest change lights its clusters and what it reaches; the same one again, or the first reading, nothing", () => {
  const a = whole({ last: change("a") }), b = whole({ last: change("b", { clusters: ["design"], reaches: ["face", "engine"] }) });
  assert.deepEqual(moved(null, a), { touched: [], reached: [] });
  assert.deepEqual(moved(a, whole({ last: change("a") })), { touched: [], reached: [] });
  assert.deepEqual(moved(a, b), { touched: ["design"], reached: ["face", "engine"] });
});
