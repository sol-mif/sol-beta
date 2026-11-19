// Cowork's map spec builder (#1433, team/map/build.ts): the tree, one home per count, PR pairs, the pins' counts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSpec } from "../src/team/map/build.ts";
import type { MapInput, Setup } from "../src/team/map/spec.ts";

const NOW = Date.parse("2026-11-17T20:00:00Z"), H = 3_600_000;
const setup: Setup = {
  people: [{ id: "a", name: "A", set: 1, logins: ["a-gh"], names: ["A Person"] }, { id: "b", name: "B", set: 2, logins: ["b-gh"] }, { id: "c", name: "C", set: 5, logins: ["c-gh"] }],
  outcomes: [
    { id: "one", name: "The first", holder: "a", areas: ["face"], labels: ["product"], xy: [200, 200] },
    { id: "two", name: "The second", holder: "b", areas: ["engine"], labels: ["base"] },
  ],
  moves: { "face/site": "two" },
  names: { engine: "The engine" },
  views: [{ id: "change", name: "Change", kind: "change", default: true, question: "What moved?" }, { id: "calls", name: "Calls", kind: "calls", question: "Which?", why: "{calls_a} of {calls_all}" }],
  view_order: { a: ["change", "calls"], b: ["calls", "change"] },
  toggles: [{ id: "live", name: "Live", what: "ring" }],
  pins: {
    a: [{ kind: "calls", who: "a", at: ["o:one"], view: "calls", says: "{n} calls yours", short: "{n} calls", press: "Open #{oldest}", act: { issue: "{oldest}" as unknown as number }, why: "w" }],
    b: [{ kind: "cross", by: "a", into: "two", at: ["o:two"], view: "change", says: "{n} into yours", short: "{n} in", press: "Review", why: "w" },
      { kind: "pairs", who: "b", with: "a", at: ["o:two"], view: "change", says: "{n} pairs", short: "{n}", press: "See", why: "w" }],
  },
};
const input: MapInput = {
  now: NOW,
  parts: [
    { id: "face", name: "face", state: "live" }, { id: "face/kit", name: "kit", state: "live", owner: "a-gh" }, { id: "face/site", name: "site", state: "broken" },
    { id: "engine", name: "engine", state: "live" }, { id: "engine/team", name: "team", state: "broken" },
  ],
  changes: [
    { sha: "1", at: NOW - 2 * H, author: "A Person", agent: true, subject: "kit", systems: ["face/kit"] },
    { sha: "2", at: NOW - 5 * H, author: "a-gh", agent: true, subject: "team", systems: ["engine/team", "unknown/x"] },
    { sha: "3", at: NOW - 80 * H, author: "b-gh", agent: false, subject: "old", systems: ["engine"] },
  ],
  prs: [
    { number: 10, title: "a's", author: "a-gh", draft: false, updated: new Date(NOW - 9 * 24 * H).toISOString(), body: "Part of #30", files: ["sol/x.ts", "sol/y.ts"], parts: ["engine/team"] },
    { number: 11, title: "b's", author: "b-gh", draft: true, updated: new Date(NOW).toISOString(), files: ["sol/x.ts"], parts: ["engine/team"] },
    { number: 12, title: "b's other", author: "b-gh", draft: false, files: ["sol/y.ts"], parts: ["face/kit"] },
  ],
  issues: [
    { number: 30, title: "a call", labels: ["decision", "product"], assignees: ["a-gh"], created: "2026-11-01T00:00:00Z", updated: "2026-11-01T00:01:00Z" },
    { number: 31, title: "another", labels: ["decision"], assignees: [], created: "2026-11-16T00:00:00Z" },
    { number: 32, title: "not a call", labels: ["bug"], assignees: ["a-gh"], created: "2026-11-16T00:00:00Z" },
  ],
  notes: [{ number: 30, at: "2026-11-17T10:00:00Z", author: "c-gh", body: "a plain word — c-gh's agent" },
    { number: 31, at: "2026-11-17T11:00:00Z", author: "a-gh", body: "Held, not merged (at abc): red. — a-gh's agent" }],
};

test("the tree: outcomes, then the part ids, with a moved part under its outcome; sizes roll up", () => {
  const s = buildSpec(setup, input);
  assert.deepEqual(s.places.root.kids, ["o:one", "o:two"]);
  assert.equal(s.places["o:one"].parts, 2);
  assert.equal(s.places["o:two"].parts, 3);
  assert.equal(s.places["face/site"].parent, "o:two");
  assert.equal(s.places["o:two"].broken, 2);
  assert.equal(s.places.engine.name, "The engine");
  assert.equal(s.places.engine.reg, "engine");
  assert.equal(s.places["o:one"].holder, "a");
  assert.equal(s.places["face/kit"].owner, "a");
  assert.deepEqual(s.layout, { "o:one": [200, 200] });
});

test("changes: inside the window, by person and how, parts the registry knows", () => {
  const s = buildSpec(setup, input);
  assert.equal(s.changes.length, 2);
  assert.deepEqual(s.changes.map((c) => [c.by, c.how, c.ago]), [["a", "agent", 120], ["a", "agent", 300]]);
  assert.deepEqual(s.changes[1].parts, ["engine/team"]);
});

test("PR pairs: two people on one file, counted once at their shared part's home, else the outcome holding most", () => {
  const s = buildSpec(setup, input);
  assert.deepEqual(s.pairs.map((p) => [p.a, p.b, p.pair, p.files]), [[10, 11, "a+b", 1], [10, 12, "a+b", 1]]);
  assert.equal(s.places["engine/team"].prClash, 2);
  assert.equal(s.places["o:two"].prPairs["a+b"], 2);
  assert.equal(s.places["o:one"].prClash, 0);
  assert.deepEqual(s.places.engine.prs.sort(), [10, 11]);
});

test("calls: one home each (where its PRs' parts are, else its label's outcome), whose and how long", () => {
  const s = buildSpec(setup, input);
  assert.deepEqual(s.calls.map((c) => [c.n, c.who, c.home, c.untouched]), [[30, "a", "engine/team", true], [31, "nobody", "o:one", true]]);
  assert.equal(s.calls[0].idle, 17);
  assert.deepEqual(s.places["o:two"].calls, [30]);
  assert.deepEqual(s.places["o:one"].calls, [31]);
  assert.equal(s.views[1].why, "1 of 2");
});

test("pins: counted on the map's own numbers, words filled, the press acts on the oldest", () => {
  const s = buildSpec(setup, input);
  assert.deepEqual(s.surface.a.top.map((t) => [t.says, t.press, t.act?.issue]), [["1 calls yours", "Open #30", 30]]);
  assert.deepEqual(s.surface.b.top.map((t) => t.says), ["1 into yours", "2 pairs"]);
  assert.deepEqual(s.surface.b.top[0].count, { by: "a", under: "o:two" });
  assert.equal(s.surface.b.default_view, "change");
  assert.equal(s.surface.c.top.length, 0);
});

test("folders: layer 1 is the registry's first segments, never a moved part (#1464); the room: the newest line of each person, the setup's housekeeping left out", () => {
  const s = buildSpec({ ...setup, room_skip: ["^Held, not merged"] }, input);
  assert.deepEqual(s.types.map((t) => [t.id, t.roots]), [["outcomes", ["o:one", "o:two"]], ["folders", ["face", "engine"]]]);
  assert.deepEqual(s.room.lines.map((l) => [l.who, l.how, l.b]), [["c", "agent", "a plain word"]]);
  assert.deepEqual(s.people.map((p) => p.id), ["a", "b", "c", "a:agent", "b:agent", "c:agent"]);
});

test("the words are counts: a view's why fills from the records, the day's clock reads the rhythm and the registry; a row after a broken one is unread", () => {
  const day = { ...setup, views: [...setup.views,
    { id: "court", name: "Court", kind: "court" as const, question: "?", why: "{shared} shared, {changes_a} by a in {window} h, {prs_day} PRs and {calls_day} calls today, {prs_b} of b's" },
    { id: "day", name: "Day", kind: "day" as const, question: "?", clock: [{ hour: "handIn", what: "in", from: "face/kit" }, { hour: "nightPass", what: "night", from: "engine/team" }, { at: "09:00", what: "release" },
      { at: "09:30", what: "beta", from: "face/kit", after: "engine/team" }, { at: "10:00", what: "late", from: "face/kit", after: "face/kit" }] }] };
  const s = buildSpec(day, { ...input, rhythm: { handIn: "20:00", nightPass: "02:00", dev: ["x"] } });
  assert.equal(s.views[2].why, "0 shared, 2 by a in 72 h, 1 PRs and 0 calls today, 2 of b's");
  assert.deepEqual(s.views[3].clock, [{ at: "20:00", what: "in", state: "live" }, { at: "02:00", what: "night", state: "broken" }, { at: "09:00", what: "release", state: "not read" },
    { at: "09:30", what: "beta", state: "unread" }, { at: "10:00", what: "late", state: "live" }]);
});

test("a calls pin with no open call says its view and acts on nothing; act fills field by field (#1464)", () => {
  const s = buildSpec(setup, { ...input, issues: [] });
  assert.deepEqual(s.surface.a.top.map((t) => [t.press, t.act]), [["See Calls", undefined]]);
  const odd = buildSpec({ ...setup, pins: { a: [{ ...setup.pins.a[0], act: { issue: "{oldest}" as unknown as number, talk: 'say "{n}" \\ now' } }] } }, input);
  assert.deepEqual(odd.surface.a.top[0].act, { issue: 30, talk: 'say "1" \\ now' });
});
