// Cowork's map grown (#1661, team/map/grow.ts): a Sol with no hand-written setup draws its team from the members, the
// registry's owners and CODEOWNERS; an empty one gets a place and a press that hands the map to the person's AI; the
// person's own setup lays over it; the switch off reads as before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const top = mkdtempSync(join(tmpdir(), "map-grow-")), dir = join(top, "sol", "systems", "records");
process.env.SOL_SETTINGS = join(top, "settings.json");
process.env.SOL_MAP_OWN = join(top, "own-map.json");
const { runners } = await import("../src/team/record/github.ts");
const { readMap } = await import("../src/team/map/read.ts");
const { growSetup, layOver, START, NOBODY } = await import("../src/team/map/grow.ts");
const { buildSpec } = await import("../src/team/map/build.ts");

mkdirSync(dir, { recursive: true }); mkdirSync(join(top, ".github"));
execFileSync("git", ["init", "-q", top]);
execFileSync("git", ["-C", top, "remote", "add", "origin", "https://github.com/o/r.git"]);
const card = (id: string, owner: string) => {
  mkdirSync(join(dir, ...id.split("/").slice(0, -1)), { recursive: true });
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, name: id, owner, state: "live", kind: "part", ...(id.includes("/") ? { parent: id.split("/").slice(0, -1).join("/") } : {}) }));
};
runners.board = (async (args: string[]) => {
  if (args[0] === "api" && args[1] === "user") return "ann-gh";
  if (args[0] === "api" && /^users\//.test(args[1])) return args[1] === "users/ann-gh" ? "Ann Lee" : "null";
  return "[]";
}) as typeof runners.board;

const g = { parts: [{ id: "a", owner: "ann-gh" }, { id: "a/x", owner: "ann-gh" }, { id: "b", owner: "bo" }, { id: "c" }], members: ["ann-gh", "cy"], leads: { base: ["bo"] }, me: "ann-gh", own: "/x/map.json" };

test("grown: everyone the records name, layer 1 by who holds the parts, nobody's apart; no name typed for a team", () => {
  const s = growSetup({ ...g, names: { "ann-gh": "Ann Lee" } });
  assert.deepEqual(s.people.map((p) => p.id), ["ann-gh", "cy", "bo"]);
  assert.equal(s.people[0].name, "Ann");
  assert.deepEqual(s.people[0].names, ["Ann Lee"]);
  assert.equal(s.people[2].holds, "Leads base.");
  assert.deepEqual(s.outcomes.map((o) => [o.id, o.holder, o.areas]), [["ann-gh", "ann-gh", ["a"]], ["bo", "bo", ["b"]], [NOBODY, "", ["c"]]]);
  assert.deepEqual(s.outcomes[1].labels, ["base"]);
  for (const p of s.people) assert.equal(s.pins[p.id].length, 3);
  assert.ok(s.pins.cy.every((r) => r.at[0] === "o:ann-gh"), "someone holding nothing is pinned on the first outcome");
  assert.match(String(s.pins["ann-gh"][2].act?.talk), /\/x\/map\.json/);
});

test("the grown setup builds a spec: a commit's git name finds its person, every pin reads", () => {
  const s = growSetup({ ...g, names: { "ann-gh": "Ann Lee" } });
  const now = Date.now();
  const spec = buildSpec(s, { now, parts: g.parts.map((p) => ({ id: p.id, name: p.id, state: "live", ...(p.owner ? { owner: p.owner } : {}) })),
    changes: [{ sha: "1", at: now - 60_000, author: "Ann Lee", agent: false, subject: "s", systems: ["a/x"] }], prs: [], issues: [], notes: [] });
  assert.equal(spec.changes[0].by, "ann-gh");
  assert.deepEqual(spec.places.root.kids, ["o:ann-gh", "o:bo", "o:_nobody"]);
  assert.equal(spec.surface["ann-gh"].top[0].press, "See Calls");   // no open call: the press opens its view
  assert.equal(spec.surface.cy.top[2].press, "Ask your AI");
});

test("a Sol with nothing: one place, its holder the person, and a press that asks their AI to start the map", () => {
  const s = growSetup({ parts: [], members: [], leads: {}, me: "", own: "/x/map.json" });
  assert.deepEqual(s.people.map((p) => p.id), ["you"]);
  assert.deepEqual(s.outcomes.map((o) => [o.id, o.holder]), [[START, "you"]]);
  assert.equal(s.pins.you.length, 1);
  assert.equal(s.pins.you[0].press, "Ask your AI");
  const spec = buildSpec(s, { now: Date.now(), parts: [], changes: [], prs: [], issues: [], notes: [] });
  assert.deepEqual(spec.places.root.kids, ["o:_start"]);
  assert.equal(spec.places["o:_start"].name, "Your work");
  assert.ok(spec.surface.you.top[0].act?.talk);
});

test("laid over key by key: what the file has wins, a key of the wrong shape or an empty list is left out", () => {
  const s = growSetup(g);
  const o = layOver(s, { names: { a: "Alpha" }, outcomes: [], views: "no", people: [{ id: "z", name: "Z", set: 1, logins: ["z"] }], extra: 1 });
  assert.deepEqual(o.names, { a: "Alpha" });
  assert.equal(o.outcomes, s.outcomes);
  assert.equal(o.views, s.views);
  assert.deepEqual(o.people.map((p) => p.id), ["z"]);
  assert.equal((o as Record<string, unknown>).extra, undefined);
  assert.equal(layOver(s, null), s);
  const half = layOver(s, { outcomes: [{ id: "marco", name: "Product" }], people: [{ id: "q" }], pins: { x: [{ kind: "calls" }] }, view_order: { x: "change" } });
  assert.equal(half.outcomes, s.outcomes, "an outcome with no areas or labels would throw in build.ts: left out");
  assert.equal(half.people, s.people);
  assert.equal(half.pins, s.pins);
  assert.equal(half.view_order, s.view_order);
});

test("switch off with no setup file: the map says so, as before", async () => {
  process.env.SOL_MAP_GROWN = "off";
  const r = await readMap(true, dir);
  assert.match(String(r.error), /no map setup yet/);
});

test("switch on, an empty project: a spec, not an error, with the press to start", async () => {
  process.env.SOL_MAP_GROWN = "on";
  const r = await readMap(true, dir);
  assert.equal(r.error, undefined);
  assert.deepEqual(r.spec?.places.root.kids, ["o:_start"]);
  assert.equal(r.spec?.people[0].logins?.[0], "ann-gh");
  assert.equal(r.spec?.surface["ann-gh"].top[0].press, "Ask your AI");
});

test("switch on, a registry and CODEOWNERS with no setup file: the team drawn; the person's own file renames a place", async () => {
  process.env.SOL_MAP_GROWN = "on";
  card("a/x", "ann-gh"); card("a/y", "ann-gh"); card("b/z", "bo");   // a part sits under its area's folder
  writeFileSync(join(top, ".github", "CODEOWNERS"), "# label base: x\n/sol/engine/ @bo\n");
  let r = await readMap(true, dir);
  assert.deepEqual(r.spec?.places.root.kids, ["o:ann-gh", "o:bo"]);
  assert.equal(r.spec?.places["o:ann-gh"].name, "What Ann holds");
  writeFileSync(process.env.SOL_MAP_OWN!, JSON.stringify({ names: { "o:bo": "The base" } }));
  r = await readMap(true, dir);
  assert.equal(r.spec?.places["o:bo"].name, "The base");
  writeFileSync(process.env.SOL_MAP_OWN!, "{ not json");
  r = await readMap(true, dir);
  assert.deepEqual(r.spec?.places.root.kids, ["o:ann-gh", "o:bo"], "a broken own file leaves the grown map");
  assert.ok((r.spec?.about as Record<string, unknown>)?.own_error);
  rmSync(process.env.SOL_MAP_OWN!);
});

test("switch on with the project's own setup: the project's keys win over the grown ones", async () => {
  process.env.SOL_MAP_GROWN = "on";
  mkdirSync(join(top, ".sol"), { recursive: true });
  writeFileSync(join(top, ".sol", "cowork-map.json"), JSON.stringify({
    people: [{ id: "i", name: "I", set: 1, logins: ["i-gh"] }], outcomes: [{ id: "one", name: "One", holder: "i", areas: [], labels: [] }],
    views: [{ id: "court", name: "Court", kind: "court", question: "?" }], view_order: {}, toggles: [], pins: {},
  }));
  const r = await readMap(true, dir);
  assert.deepEqual(r.spec?.places.root.kids, ["o:one"]);
  assert.deepEqual(r.spec?.views.map((v) => v.id), ["court"]);
  rmSync(join(top, ".sol", "cowork-map.json"));
});
