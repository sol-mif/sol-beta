// Leave and carry as a move (#870 item 5, #826; work/blocks.ts): a block taken off one session's stage stays alive for
// the sessions that still use it and waits in this one's tray; a project's own block that was left does not come back
// on its own; with the engine's switch stage.whole on, the person's drag of a block onto another session's row moves it
// (gone here, waiting there), while the agent's carry and a new session's carry stay copies. All in a home and a
// settings file of their own; never the real ones.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP = mkdtempSync(join(tmpdir(), "sol-leave-"));
const HOME = join(TMP, "home"), REPO = join(TMP, "repo");
mkdirSync(join(REPO, ".git"), { recursive: true });
const TEAM = join(TMP, "team.json");
writeFileSync(TEAM, JSON.stringify({ me: { login: "tester", name: "T" }, repos: [] }));
process.env.SOL_HOME = HOME;
process.env.SOL_TEAM = TEAM;
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_SETTINGS = join(TMP, "settings.json");
delete process.env.SOL_STAGE_WHOLE;

const S = await import("../src/work/blocks.ts");
const tools = await import("../src/work/tools.ts");

const heard: any[] = [];
S.setStageBus((m) => heard.push(m));
S.setStageFinder(async (id) => ({ cwd: REPO, by: `agent · ${id.slice(5, 9)}` }));
const project = S.projectOf(REPO);
const who = (sessionId: string) => ({ project, sessionId, by: `agent · ${sessionId.slice(5, 9)}`, cwd: REPO });
const text = (r: { content: { text: string }[] }) => r.content[0].text;
const on = (sid: string, id: string) => S.getStage(project, sid).blocks.some((p) => p.id === id);
const stageFile = (sid: string) => join(HOME, project, "sessions", sid, "stage.json");
const whole = (v?: string) => { if (v === undefined) delete process.env.SOL_STAGE_WHOLE; else process.env.SOL_STAGE_WHOLE = v; };
after(() => { S.disarmAll(); S.setStageBus(null); whole(undefined); rmSync(TMP, { recursive: true, force: true }); });

test("leave: off this one stage; alive, in both sessions' list, still on the other stage, in this one's tray, no ledger line", () => {
  const A = "sess-leav0001", B = "sess-leav0002";
  const b = S.compose(who(A), { kind: "card", title: "the plan", body: "x" });
  S.place(who(A), { id: b.id, carry: B });
  const lines = S.ledger(project, b.id).length;
  assert.equal("left" in JSON.parse(readFileSync(stageFile(A), "utf8")), false, "a stage nobody left anything on has no left");
  heard.length = 0;
  const r = S.place(who(A), { id: b.id, leave: true });
  assert.equal(r.block.id, b.id);
  assert.equal(on(A, b.id), false, "gone from the stage it left");
  assert.equal(on(B, b.id), true, "still on the other");
  const now = S.getBlock(project, b.id)!;
  assert.equal(now.state, b.state, "its state is as it was");
  assert.deepEqual(now.sessions, [A, B], "no session is taken out of its list");
  assert.equal(S.ledger(project, b.id).length, lines, "a layout change, like a fold: no ledger line");
  assert.ok(S.trayOf(project, A).some((t) => t.id === b.id && t.from === A), "in this session's tray, by the session that made it");
  const told = heard.find((m) => m.sessionId === A && m.stage);
  assert.ok(told, "the stage's change is told");
  assert.ok(!told.stage.blocks.some((p: any) => p.id === b.id));
  // asked again, nothing changes; a leave of a block that is not on this stage is kept the same way
  S.place(who(A), { id: b.id, leave: true });
  assert.deepEqual(S.getStage(project, A).left, [b.id]);
});

test("a project's own block that was left does not come back on withProject; put there again, it is back and left is gone", () => {
  const A = "sess-leav0003", B = "sess-leav0004";
  const src = join(TMP, "status.json");
  writeFileSync(src, JSON.stringify({ sessions: [] }));
  const l = S.compose(who(A), { kind: "list", title: "In the background" });
  S.bind(who(A), { id: l.id, source: src, watch: "run" });
  assert.equal(S.getBlock(project, l.id)!.scope, "project");
  assert.ok(S.withProject(project, B).blocks.some((p) => p.id === l.id), "the project's block is on every stage");
  S.place(who(B), { id: l.id, leave: true });
  assert.equal(S.withProject(project, B).blocks.some((p) => p.id === l.id), false, "left, it stays away");
  assert.equal(S.withProject(project, B).blocks.some((p) => p.id === l.id), false, "and asked again");
  assert.ok(S.withProject(project, "sess-leav0005").blocks.some((p) => p.id === l.id), "another session still gets it");
  assert.ok(S.trayOf(project, B).some((t) => t.id === l.id), "it waits in the tray");
  S.place(who(B), { id: l.id });
  assert.ok(on(B, l.id), "placed again, it is back");
  assert.equal(S.getStage(project, B).left, undefined, "left names it no more");
  assert.equal("left" in JSON.parse(readFileSync(stageFile(B), "utf8")), false, "and the key goes when it is empty");
  // the face's own layout that puts it back clears it too
  S.place(who(B), { id: l.id, leave: true });
  const st = S.getStage(project, B);
  S.layout(project, B, { blocks: [...st.blocks, { id: l.id, x: 12, y: 12, w: 300, h: 200, z: 9, folded: true }] });
  assert.equal(S.getStage(project, B).left, undefined);
  // a carry to it, or a reopen in it, clears it as well
  S.place(who(B), { id: l.id, leave: true });
  S.place(who(A), { id: l.id, carry: B });
  assert.ok(on(B, l.id));
  assert.equal(S.getStage(project, B).left, undefined);
});

test("stage.whole on: the person's carry to another session moves the block, gone here and waiting there", () => {
  const A = "sess-move0001", B = "sess-move0002";
  try {
    whole("on");
    const b = S.compose(who(A), { kind: "page", title: "the brief", body: "<p>b</p>" });
    S.carryByHand(who(A), { id: b.id, to: B });
    assert.ok(on(B, b.id), "waiting there");
    assert.equal(on(A, b.id), false, "gone here");
    assert.deepEqual(S.getBlock(project, b.id)!.sessions, [A, B], "both sessions keep it");
    const last = S.ledger(project, b.id).at(-1)!;
    assert.equal(last.ev, "carried");
    assert.equal(last.note, `to ${B}`);
    assert.ok(S.ledgerWhole(S.ledger(project, b.id)));
    assert.ok(S.trayOf(project, A).some((t) => t.id === b.id), "in the tray of the session it left");
    // pulled back from the tray: a carry to the asking session itself, nothing to take off
    S.carryByHand(who(A), { id: b.id, to: A, at: { x: 40, y: 40, w: 300, h: 200 } });
    assert.ok(on(A, b.id), "back here");
    assert.ok(on(B, b.id), "and still there: a pull takes nothing away");
    assert.equal(S.getStage(project, A).left, undefined);
    // the agent's carry and a new session's carry stay copies with the switch on
    const c = S.compose(who(A), { kind: "card", title: "kept", body: "k" });
    S.place(who(A), { id: c.id, carry: B });
    assert.ok(on(A, c.id) && on(B, c.id), "the agent's place carry copies");
    const N = "sess-move0003";
    S.start(who(N), { from: A, carry: [c.id] });
    assert.ok(on(A, c.id) && on(N, c.id), "start_session's carry copies");
  } finally { whole(undefined); }
});

test("stage.whole off: the person's carry is today's copy", () => {
  const A = "sess-move0004", B = "sess-move0005";
  whole("off");
  try {
    const b = S.compose(who(A), { kind: "card", title: "copied", body: "c" });
    S.carryByHand(who(A), { id: b.id, to: B });
    assert.ok(on(A, b.id) && on(B, b.id));
    assert.equal(S.getStage(project, A).left, undefined);
  } finally { whole(undefined); }
});

test("the agent's place: leave is offered only with stage.whole on; off, the tool reads as it does today", async () => {
  const place = () => tools.WORK_TOOLS.find((t) => t.name === "place")! as { description: string; shape: Record<string, unknown> };
  const TODAY = "Put a block somewhere: in a slot (full, left, right, top, bottom, cell), folded to the tray at the stage's foot " +
    "(fold true; false unfolds it where it was), carried to another session's stage (carry: its id; the " +
    "same block, one ledger, no copy), or closed (close: the block leaves the stage, its ledger stays).";
  const A = "sess-tool0001", B = "sess-tool0002";
  const b = S.compose(who(A), { kind: "card", title: "a note", body: "n" });
  S.place(who(A), { id: b.id, carry: B });
  try {
    whole("off");
    assert.equal(place().description, TODAY);
    assert.deepEqual(Object.keys(place().shape), ["id", "slot", "fold", "carry", "close"]);
    await tools.runWorkTool("place", { id: b.id, leave: true }, A);
    assert.ok(on(A, b.id), "off, a leave the tool was never offered does nothing");
    whole("on");
    assert.match(place().description, /leave/);
    assert.ok("leave" in place().shape);
    assert.match(text(await tools.runWorkTool("place", { id: b.id, leave: true }, A)), /took a note off this stage/);
    assert.equal(on(A, b.id), false);
    assert.ok(on(B, b.id));
  } finally { whole(undefined); }
  assert.equal(existsSync(process.env.SOL_SETTINGS!), false, "the settings file is never written");
});
