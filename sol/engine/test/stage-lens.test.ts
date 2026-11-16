// The stage's lenses, pop out and the notch (#701, work/blocks.ts): the face's own marks on a place (popped, folded by
// a lens, the TUI's terminal and where a borrowed one sat) survive a layout as the face wrote them, the lens is kept in
// stage.json, and the notch reads every block pinned to it. All in a home of its own; never the real one.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "sol-lens-home-"));
const REPO = mkdtempSync(join(tmpdir(), "sol-lens-repo-"));
mkdirSync(join(REPO, ".git"));
const TEAM = join(mkdtempSync(join(tmpdir(), "sol-team-")), "team.json");
writeFileSync(TEAM, JSON.stringify({ me: { login: "tester", name: "T" }, repos: [] }));
process.env.SOL_HOME = HOME;
process.env.SOL_TEAM = TEAM;
process.env.SOL_TEAM_OFFLINE = "1";

const S = await import("../src/work/blocks.ts");
S.setStageBus(() => {});
after(() => { S.disarmAll(); S.setStageBus(null); });
const SID = "sess-lens1111";
const project = S.projectOf(REPO);
const who = (sessionId = SID) => ({ project, sessionId, by: "tester's agent", cwd: REPO });

test("a layout keeps the lens and the face's marks: popped, folded by a lens, the TUI's terminal, where it sat", () => {
  const a = S.compose(who(), { kind: "page", title: "the week", body: "x" });
  const t = S.compose(who(), { kind: "card", title: "a shell", body: "x" });
  const st = S.layout(project, SID, {
    lens: "tui",
    blocks: [
      { id: a.id, x: 12, y: 12, w: 300, h: 200, z: 1, folded: true, lensed: true, popped: true },
      { id: t.id, x: 12, y: 12, w: 900, h: 500, z: 2, folded: false, tui: true, was: { x: 40, y: 50, w: 300, h: 200 } },
    ],
  } as never);
  assert.equal(st.lens, "tui");
  const pa = st.blocks.find((p) => p.id === a.id)!, pt = st.blocks.find((p) => p.id === t.id)!;
  assert.equal(pa.lensed, true); assert.equal(pa.popped, true); assert.equal(pa.tui, undefined);
  assert.equal(pt.tui, true); assert.deepEqual(pt.was, { x: 40, y: 50, w: 300, h: 200 });
  assert.equal(S.getStage(project, SID).lens, "tui", "kept in stage.json");
  // a mark that is not a number is dropped, not kept as it came
  const bad = S.layout(project, SID, { blocks: [{ id: t.id, x: 1, y: 1, w: 300, h: 200, z: 1, folded: false, was: { x: "a" } }] } as never);
  assert.equal(bad.blocks[0].was, undefined);
  assert.equal(S.layout(project, SID, { lens: "nope" } as never).lens, "tui", "an unknown lens changes nothing");
});

test("the notch's chips: every block pinned to it, with its session, title and state; a closed one is gone", () => {
  const b = S.compose(who("sess-lens2222"), { kind: "list", title: "the gate", body: "[]" });
  assert.deepEqual(S.pinnedAll(), []);
  S.place(who("sess-lens2222"), { id: b.id, pin: true });
  const p = S.pinnedAll();
  assert.equal(p.length, 1);
  assert.deepEqual({ ...p[0] }, { project: S.projectName(project), sessionId: "sess-lens2222", id: b.id, title: "the gate", kind: "list", state: "live" });
  S.place(who("sess-lens2222"), { id: b.id, close: true });
  assert.deepEqual(S.pinnedAll(), []);
});

test("the talk's dock and width are kept in stage.json (#734); a bad one changes nothing, a layout without one keeps it", () => {
  const sid = "sess-talk3333";
  S.compose(who(sid), { kind: "card", title: "one", body: "x" });
  assert.equal(S.getStage(project, sid).talk, undefined, "a new stage has no talk: the face docks it left");
  const st = S.layout(project, sid, { talk: { dock: "full", width: 0.4, was: "right" } } as never);
  assert.deepEqual(st.talk, { dock: "full", width: 0.4, was: "right" });
  assert.deepEqual(S.getStage(project, sid).talk, { dock: "full", width: 0.4, was: "right" }, "read back from the file");
  S.layout(project, sid, { talk: { dock: "middle" } } as never);
  assert.equal(S.getStage(project, sid).talk?.dock, "full", "an unknown dock changes nothing");
  S.layout(project, sid, { lens: "ide" } as never);
  assert.equal(S.getStage(project, sid).talk?.dock, "full", "a layout without a talk keeps it");
  assert.deepEqual(S.talkOf({ dock: "left", width: 7, was: "full" }), { dock: "left" }, "a width out of 0..1 and full as the dock before are dropped");
});
