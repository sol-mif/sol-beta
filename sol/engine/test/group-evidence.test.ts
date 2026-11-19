// Grouping on hard evidence (#1336, decided 2026-11-16; group.ts): a start, a card, a root's send and a root's read each
// put a session under the one that did it, marked by which; anything weaker groups nothing; a pair taken apart stays
// apart, and too many taken back turn grouping off (fr-07 sketch E23, E24).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "sol-group-"));
process.env.SOL_STATE = join(dir, "work.json");
const G = await import("../src/work/group.ts");
const { mark, workState } = await import("../src/work/state.ts");

let projects: Record<string, string> = {}, placed: [string, string, string][] = [], told: any[] = [], promoted: string[] = [];
const wire = () => G.setGroupDeps({
  projectOf: async (id) => projects[id],
  promote: async (id) => { promoted.push(id); mark(id, { kind: "orchestration" }); return { promoted: true }; },
  placed: async (child, root, rule) => { placed.push([child, root, rule]); },
  tell: (m) => told.push(m),
});
const under = (id: string) => workState().marks[id]?.under;
const grouped = (id: string) => workState().marks[id]?.grouped;

beforeEach(() => {
  projects = {}; placed = []; told = []; promoted = [];
  rmSync(join(dir, "group.json"), { force: true });
  for (const id of Object.keys(workState().marks)) mark(id, { under: null, kind: null, grouped: null, archived: false });
  G._reload(); wire();
});

test("only hard evidence groups: a start, a card, a send and a read each group with their mark; a shared folder, a shared branch or a similar title groups nothing", async () => {
  projects = { a: "p1", kid: "p1", card: "p1", near: "p1", reader: "p1", other: "p2", twin: "p1", loose: "p1" };
  // a start: the child under its starter, and the starter becomes its project's root with no promote step
  assert.equal(await G.started("a", "kid", "start"), true);
  assert.deepEqual([under("kid"), grouped("kid"), promoted], ["a", "start", ["a"]]);
  // a card the root proposed, started by the person
  assert.equal(await G.started("a", "card", "card"), true);
  assert.deepEqual([under("card"), grouped("card")], ["a", "card"]);
  // the root sends to, or reads, a session of its project that runs under nothing
  assert.equal(await G.contacted("a", "near", "send"), true);
  assert.equal(await G.contacted("a", "reader", "read"), true);
  assert.deepEqual([under("near"), grouped("near"), under("reader"), grouped("reader")], ["a", "send", "a", "read"]);
  // another project, or a normal session's send, groups nothing
  assert.equal(await G.contacted("a", "other", "send"), false);
  assert.equal(await G.contacted("twin", "loose", "send"), false);
  assert.deepEqual([under("other"), under("loose")], [undefined, undefined]);
  // weaker than a deed (the same folder, branch or a title like it): `twin` shares all of them with `a` and stays loose
  assert.equal(under("twin"), undefined);
  assert.deepEqual(placed.map(([c, , r]) => [c, r]), [["kid", "start"], ["card", "card"], ["near", "send"], ["reader", "read"]]);
  const f = JSON.parse(readFileSync(join(dir, "group.json"), "utf8"));
  assert.deepEqual(f.moves.map((x: any) => [x.rule, x.root, x.child]), [["start", "a", "kid"], ["card", "a", "card"], ["send", "a", "near"], ["read", "a", "reader"]], "every move written with its rule");
});

test("a session placed already, an orchestration session, an archived one or a loop is never moved", async () => {
  projects = { a: "p1", b: "p1", c: "p1", d: "p1", e: "p1" };
  mark("a", { kind: "orchestration" });
  mark("b", { under: "e" }); mark("e", { kind: "orchestration" });
  mark("c", { kind: "orchestration" });
  mark("d", { archived: true });
  assert.equal(await G.contacted("a", "b", "send"), false, "under another already");
  assert.equal(await G.contacted("a", "c", "send"), false, "a root of its own");
  assert.equal(await G.contacted("a", "d", "read"), false, "archived");
  mark("a", { under: "e" });
  assert.equal(await G.contacted("a", "e", "send"), false, "the one that runs it: a loop");
  assert.equal(under("b"), "e");
});

test("an undone pair stays apart, and too many undos turn grouping off", async () => {
  projects = { r: "p", s: "p" };
  mark("r", { kind: "orchestration" });
  assert.equal(await G.contacted("r", "s", "send"), true);
  // the person takes it back (the side's undo: work.under to nothing)
  assert.equal(G.left("s", "r"), true);
  mark("s", { under: null });
  assert.equal(grouped("s"), undefined);
  assert.equal(await G.contacted("r", "s", "send"), false, "the same send again groups nothing");
  assert.equal(await G.contacted("r", "s", "read"), false, "nor any other evidence for that pair");
  // a move the engine did not make is no undo
  mark("t", { under: "r" });
  assert.equal(G.left("t", "r"), false);
  // with undos past the limit over MIN_MOVES moves of a rule, grouping turns off and says so once
  for (let i = 0; i < G.MIN_MOVES; i++) { projects[`k${i}`] = "p"; assert.equal(await G.contacted("r", `k${i}`, "send"), true); }
  const limit = Math.floor(G.UNDO_LIMIT * (G.MIN_MOVES + 1)) - 1;   // `s` is one taken back already
  for (let i = 0; i < limit; i++) { G.left(`k${i}`, "r"); mark(`k${i}`, { under: null }); }
  assert.equal(G.groupingOn(), true, "at the limit: still on");
  G.left(`k${limit}`, "r"); mark(`k${limit}`, { under: null });
  assert.equal(G.groupingOn(), false, "past it: off");
  assert.equal(told.length, 1);
  assert.match(told[0].off.why, /taken back/);
  projects.u = "p";
  assert.equal(await G.contacted("r", "u", "send"), false, "off: the next evidence groups nothing");
  assert.equal(await G.started("r", "u", "start"), false);
  G._reload();   // a restart: still off, from the file
  assert.equal(G.groupingOn(), false);
  // turned on again by the person: judged afresh, the pairs taken apart still apart
  assert.equal(G.turnOn(), true);
  assert.equal(await G.contacted("r", "u", "send"), true);
  assert.equal(await G.contacted("r", "s", "send"), false);
});

test("the switch in Build's settings: off groups nothing and leaves what is grouped where it is; on again groups", async () => {
  projects = { r: "p", a: "p", b: "p" };
  mark("r", { kind: "orchestration" });
  assert.equal(await G.contacted("r", "a", "read"), true);
  assert.equal(G.turnOff(), true);
  assert.deepEqual([G.state().off?.why, told.length], ["turned off in Build's settings", 1]);
  assert.equal(await G.contacted("r", "b", "read"), false);
  assert.equal(under("a"), "r", "what is grouped stays");
  assert.equal(G.turnOn(), true);
  assert.equal(await G.contacted("r", "b", "read"), true);
});

test("no wiring, nothing groups", async () => {
  G.setGroupDeps(null);
  assert.equal(await G.started("a", "b", "start"), false);
  assert.ok(!existsSync(join(dir, "group.json")));
});
