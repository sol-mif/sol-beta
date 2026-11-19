// The whole of Jelly (#1193, sol/engine/src/work/systemsWhole.ts): every system grouped by its cluster, the wires between
// clusters counted from feeds and fed_by alike, who works in which cluster now, and what a change reaches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { changesOf, clusterOf, newestBy, parseLog, roleOf, whoOf, wholeOf, type Commit } from "../src/work/systemsWhole.ts";
import { pathIndex } from "../src/work/systemsLive.ts";
import type { Rec } from "../src/work/systems.ts";

const rec = (id: string, more: Partial<Rec> = {}): Rec => ({
  id, name: id, about: `about ${id}`, parent: id === "jelly" ? null : id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : "jelly", kind: "service", state: "live", ...more,
});
const map = (...rs: Rec[]) => new Map(rs.map((r) => [r.id, r]));
const recs = map(
  rec("jelly", { kind: "area", name: "Jelly, the whole" }),
  rec("engine", { kind: "area", name: "The engine", where: { paths: ["sol/engine"] } }),
  rec("engine/hub", { feeds: ["product/home"], where: { paths: ["sol/engine/src/hub"] } }),
  rec("engine/sessions", { feeds: ["product/home", "engine/hub"], where: { paths: ["sol/engine/src/work"] } }),
  rec("product", { kind: "area", name: "The product" }),
  rec("product/home", { kind: "part", state: "building", where: { paths: ["sol/mac/src/home"] } }),
  rec("design", { kind: "area", name: "Design" }),
  rec("design/tokens", { kind: "store", fed_by: [], feeds: ["engine/hub"], where: { paths: ["sol/design/system"] } }),
  rec("machines", { kind: "area", name: "The machines" }),
  rec("machines/nucbox", { kind: "machine", fed_by: ["design/tokens"], where: { machines: ["nucbox"], units: ["sol.service"] } as Rec["where"] }),
  rec("legacy", { kind: "area" }),
  rec("legacy/old", { state: "legacy", feeds: ["engine/hub"] }),
);

test("a system's cluster is the first word of its id; the root has none", () => {
  assert.equal(clusterOf("engine/hub/relay"), "engine");
  assert.equal(clusterOf("design"), "design");
  assert.equal(clusterOf("jelly"), "");
});

test("each cluster is drawn by its role: design in lanes, the engine as a flow, the machines in columns, the rest as parts", () => {
  assert.equal(roleOf("design"), "lanes");
  assert.equal(roleOf("engine"), "flow");
  assert.equal(roleOf("machines"), "machines");
  assert.equal(roleOf("app"), "parts");
  assert.equal(roleOf("a-cluster-nobody-named"), "parts");
});

test("the clusters come from the records: named by their own record, counted without it, states by kind of state", () => {
  const w = wholeOf(recs);
  assert.equal(w.name, "Jelly, the whole");
  assert.deepEqual(w.clusters.map((c) => c.id), ["design", "engine", "legacy", "machines", "product"]);
  const engine = w.clusters.find((c) => c.id === "engine")!;
  assert.equal(engine.name, "The engine");
  assert.equal(engine.count, 2);
  assert.deepEqual(engine.states, { live: 2 });
  assert.deepEqual(w.clusters.find((c) => c.id === "product")!.states, { building: 1 });
  assert.equal(w.clusters.find((c) => c.id === "legacy")!.states.legacy, 1);
  assert.ok(!w.systems.some((s) => s.id === "jelly"), "the root is the map, not a system on it");
  assert.deepEqual(w.systems.find((s) => s.id === "machines/nucbox")!.units, ["sol.service"]);
});

test("only wires between clusters, each pair of systems once, feeds and fed_by alike; a wire inside a cluster is not one", () => {
  const w = wholeOf(recs);
  const n = (a: string, b: string) => w.wires.find((x) => x.from === a && x.to === b)?.n ?? 0;
  assert.equal(n("engine", "product"), 2, "hub → home and sessions → home");
  assert.equal(n("design", "engine"), 1);
  assert.equal(n("design", "machines"), 1, "a fed_by on the far side is the same wire");
  assert.equal(n("legacy", "engine"), 1);
  assert.equal(n("engine", "engine"), 0);
  assert.equal(w.wires[0].from + ">" + w.wires[0].to, "engine>product", "the heaviest first");
  assert.ok(w.links.some(([a, b]) => a === "engine/sessions" && b === "engine/hub"), "the systems' own wires stay, for a cluster's drawing");
});

test("who is where: one row per session and cluster, its systems there, newest first", () => {
  const work = (system: string, session: string, at: number, person = "Marco") => ({ system, session, title: `t ${session}`, person, branch: "marco/x", files: ["f"], at, behind: 0, ahead: 1 });
  const who = whoOf({ work: [work("engine/hub", "s1", 10), work("engine/sessions", "s1", 30), work("design/tokens", "s1", 20), work("product/home", "s2", 40, "Frank Tsai"), work("jelly", "s3", 50)] });
  assert.deepEqual(who.map((h) => `${h.cluster}:${h.session}`), ["product:s2", "engine:s1", "design:s1"]);
  assert.deepEqual(who[1].systems, ["engine/hub", "engine/sessions"]);
  assert.equal(who[1].at, 30);
  assert.deepEqual(whoOf(null), []);
});

const commit = (sha: string, at: number, files: string[], body = ""): Commit => ({ sha, at, subject: `s ${sha}`, author: "Marco", body, files });
test("a change goes to the clusters of its files and reaches the clusters its systems feed; one no record holds is left out", () => {
  const w = wholeOf(recs), idx = pathIndex(recs);
  const ch = changesOf([
    commit("a", 100, ["sol/engine/src/hub/relay.ts", "sol/engine/src/hub/x.ts", "sol/engine/src/work/runs.ts"], "Co-Authored-By: Claude Opus"),
    commit("b", 200, ["sol/design/system/tokens.json"]),
    commit("c", 300, ["README.md"]),
  ], idx, w.links);
  assert.deepEqual(ch.map((c) => c.sha), ["b", "a"], "newest first; the README is no system's");
  const a = ch.find((c) => c.sha === "a")!;
  assert.deepEqual(a.systems, ["engine/hub", "engine/sessions"], "the system with the most files first");
  assert.deepEqual(a.clusters, ["engine"]);
  assert.deepEqual(a.reaches, ["product"], "a wire inside its own cluster reaches nothing outside");
  assert.equal(a.agent, true);
  assert.deepEqual(ch[0].reaches, ["engine", "machines"]);
  assert.equal(ch[0].agent, false);
  const by = newestBy(ch);
  assert.equal(by.engine.sha, "a");
  assert.equal(by.design.sha, "b");
});

test("git's log reads as commits: head, body, files; a commit seen twice once", () => {
  const one = "\x1eabcdef1234567\x1fMarco\x1f2026-11-14T10:00:00Z\x1fsol: a thing\x1fbody line\x1d\n\nsol/a.ts\nsol/b.ts\n";
  const cs = parseLog(one + one);
  assert.equal(cs.length, 1);
  assert.equal(cs[0].sha, "abcdef123");
  assert.equal(cs[0].at, Date.parse("2026-11-14T10:00:00Z"));
  assert.deepEqual(cs[0].files, ["sol/a.ts", "sol/b.ts"]);
  assert.equal(cs[0].body, "body line");
});
