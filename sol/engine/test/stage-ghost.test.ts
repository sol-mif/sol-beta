// Ghosts from day one (#737, pain point 6, work/blocks.ts ghostly): the agent's compose lands as a ghost, the mark on its
// place; a block that waits, a chip the person dropped, a kind the person asked for by name, and the person's own compose
// land solid. The agent's first body takes the ghost, so does a press (the face's layout without the mark). ⌘Z's reopen
// puts a closed block back where it sat. All in a home of its own; never the real one.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "sol-ghost-home-"));
const REPO = mkdtempSync(join(tmpdir(), "sol-ghost-repo-"));
mkdirSync(join(REPO, ".git"));
const TEAM = join(mkdtempSync(join(tmpdir(), "sol-team-")), "team.json");
writeFileSync(TEAM, JSON.stringify({ me: { login: "tester", name: "T" }, repos: [] }));
process.env.SOL_HOME = HOME;
process.env.SOL_TEAM = TEAM;
process.env.SOL_TEAM_OFFLINE = "1";

const S = await import("../src/work/blocks.ts");
S.setStageBus(() => {});
after(() => { S.disarmAll(); S.setStageBus(null); });
const SID = "sess-ghost111";
const project = S.projectOf(REPO);
const who = (sessionId = SID) => ({ project, sessionId, by: "tester's agent", cwd: REPO });
const placeOf = (id: string, sid = SID) => S.getStage(project, sid).blocks.find((p) => p.id === id)!;

test("the agent's compose lands as a ghost; its first body makes it solid", () => {
  const b = S.compose(who(), { kind: "page", title: "the week", body: "<p>x</p>" });
  assert.equal(placeOf(b.id).ghost, true);
  S.update(who(), { id: b.id, body: "<p>y</p>" });
  assert.equal(placeOf(b.id).ghost, undefined, "the mark goes, the place stays");
});

test("waits, a dropped chip, and the person's own compose land solid", () => {
  const w = S.compose(who(), { kind: "card", title: "ship it?", body: "x", waits: true });
  const d = S.compose(who(), { kind: "card", title: "dropped", body: "x", at: { x: 40, y: 40, w: 200, h: 120 } });
  const m = S.compose(who(), { kind: "card", title: "mine", body: "x", person: true });
  for (const b of [w, d, m]) assert.equal(placeOf(b.id).ghost, undefined, b.title);
});

test("a kind the person named in the ask lands solid once; the rest of the turn's composes are ghosts", () => {
  const sid = "sess-ghost222";
  S.asked(sid, "show me a diff of the bar", [{ kind: "diff" }]);
  const a = S.compose(who(sid), { kind: "diff", title: "the bar", body: "" });
  const b = S.compose(who(sid), { kind: "diff", title: "another", body: "" });
  const c = S.compose(who(sid), { kind: "page", title: "extra", body: "" });
  assert.equal(placeOf(a.id, sid).ghost, undefined);
  assert.equal(placeOf(b.id, sid).ghost, true, "named once, taken once");
  assert.equal(placeOf(c.id, sid).ghost, true);
  S.asked(sid, "why is it slow, and what changed", [{ kind: "page" }]);
  const d = S.compose(who(sid), { kind: "page", title: "not an ask", body: "" });
  assert.equal(placeOf(d.id, sid).ghost, true, "a message that is not an ask names nothing");
});

test("a press takes a ghost: the face's layout without the mark drops it; with it, keeps it", () => {
  const b = S.compose(who(), { kind: "list", title: "plan", body: "[]" });
  const p = placeOf(b.id);
  assert.equal(S.layout(project, SID, { blocks: S.getStage(project, SID).blocks }).blocks.find((x) => x.id === b.id)!.ghost, true);
  const { ghost: _g, ...taken } = p;
  const st = S.layout(project, SID, { blocks: S.getStage(project, SID).blocks.map((x) => (x.id === b.id ? taken : x)) });
  assert.equal(st.blocks.find((x) => x.id === b.id)!.ghost, undefined);
});

test("reopen: a closed block is live again where it sat", () => {
  const b = S.compose(who(), { kind: "card", title: "gone", body: "x", person: true });
  S.place(who(), { id: b.id, close: true });
  assert.equal(S.getBlock(project, b.id)!.state, "dead");
  assert.equal(S.getStage(project, SID).blocks.some((p) => p.id === b.id), false);
  S.reopen(who(), { id: b.id, at: { x: 50, y: 60, w: 300, h: 200, z: 9 } });
  assert.equal(S.getBlock(project, b.id)!.state, "live");
  const p = placeOf(b.id);
  assert.deepEqual([p.x, p.y, p.w, p.h, p.z], [50, 60, 300, 200, 9]);
  assert.match(S.ledger(project, b.id).at(-1)!.note ?? "", /back on the stage/);
});
