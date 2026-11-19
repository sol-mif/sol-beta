// The stage's read, lighter (#870 items 1 and 2, work/blocks.ts stageAnswer): work.stage.get answers the whole stage as
// ever to a face that asks nothing more; asked `light`, a block folded on this stage comes as its block.json alone (no
// body, no ledger lines); asked for one `id`, one block comes with its body and nothing else is read. The sizes are the
// issue's: 13 folded blocks carried 300 kB on every change. All in a home of its own; never the real one.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "sol-light-home-"));
const REPO = mkdtempSync(join(tmpdir(), "sol-light-repo-"));
mkdirSync(join(REPO, ".git"));
process.env.SOL_HOME = HOME;

const S = await import("../src/work/blocks.ts");
const R = await import("../src/work/background.ts");

S.setStageBus(() => {});
R.setRunReader(async () => ({ builders: [] }));
const project = S.projectOf(REPO);
const who = (sessionId: string) => ({ project, sessionId, by: "tester's agent", cwd: REPO });
const size = (v: unknown) => JSON.stringify(v).length;
after(() => {
  S.disarmAll(); S.setStageBus(null); R.setRunReader(null);
  for (const d of [HOME, REPO]) rmSync(d, { recursive: true, force: true });   // leaves no home behind in the temp folder
});

// 13 pages of 20,000 characters each, made in one session and folded on its stage: the stage the issue measured
const A = "sess-light-0001", B = "sess-light-0002";
const BODY = 20_000;
const mark = (i: number) => `<<the body of page ${i + 1}>>`;
const bodyOf = (i: number) => mark(i) + "x".repeat(BODY - mark(i).length);
const ids = Array.from({ length: 13 }, (_, i) => S.compose(who(A), { kind: "page", title: `page ${i + 1}`, body: bodyOf(i), format: "md" }).id);
const fold = (open: string[] = []) => S.layout(project, A, { blocks: S.getStage(project, A).blocks.map((p) => ({ ...p, folded: !open.includes(p.id) })) });
// one more block of the project, made in another session: in A's tray, not on its stage
const away = S.compose(who(B), { kind: "card", title: "made elsewhere", body: "# elsewhere" });

test("no light and no id: the answer is the one the wire gave before, block for block (an old face is not touched)", () => {
  fold(ids.slice(0, 3));
  const got = S.stageAnswer(project, A);
  const st = S.withProject(project, A);
  assert.deepEqual(got, { project, sessionId: A, stage: st, blocks: st.blocks.map((p) => S.seen(project, p.id)).filter(Boolean), tray: S.trayOf(project, A, st) });
  assert.deepEqual(S.stageAnswer(project, A, {}), got);
  assert.equal("light" in got, false, "the whole answer carries no mark");
  assert.equal(got.blocks.length, 13);
  assert.ok(got.blocks.every((b: any) => typeof b.body?.text === "string" && Array.isArray(b.lines)), "every block with its body and lines, folded or not");
  assert.deepEqual(got.tray.map((t) => t.id), [away.id]);
});

test("S2: 13 folded blocks, the light list is under 20 kB where the whole one is over 260 kB", () => {
  fold();
  const whole = S.stageAnswer(project, A), light = S.stageAnswer(project, A, { light: true });
  assert.ok(size(whole) > 260_000, `the whole answer is ${size(whole)} characters`);
  assert.ok(size(light) < 20_000, `the light answer is ${size(light)} characters`);
  assert.equal(light.light, true, "the answer says it is the light one");
  assert.deepEqual([light.project, light.sessionId, light.stage, light.tray], [whole.project, whole.sessionId, whole.stage, whole.tray], "the layout and the tray are the whole answer's");
  assert.equal(light.blocks.length, 13);
  for (const b of light.blocks as any[]) {
    assert.equal("body" in b, false, "a folded block has no body");
    assert.equal("lines" in b, false, "and no ledger lines");
    assert.deepEqual(b, S.getBlock(project, b.id), "it is its block.json: id, kind, title, state, bind, sessions, parent, versions, at");
    assert.equal(b.sessions[0], A, "where it came from");
  }
});

test("the light list: a block that is open on this stage still comes with its body and its lines", () => {
  const open = ids.slice(0, 3);
  fold(open);
  const light = S.stageAnswer(project, A, { light: true });
  for (const b of light.blocks as any[]) {
    if (!open.includes(b.id)) { assert.equal("body" in b, false); assert.equal("lines" in b, false); continue; }
    assert.deepEqual(b, S.seen(project, b.id), "an open block is what seen gives");
    assert.equal(b.body.text.length, BODY);
    assert.ok(b.lines.length >= 1);
  }
  const text = JSON.stringify(light);
  assert.deepEqual(ids.map((_, i) => text.includes(mark(i))), ids.map((_, i) => i < 3), "three bodies crossed, the ten folded ones did not");
  assert.ok(size(light) < 3 * BODY + 20_000, `three open of thirteen: ${size(light)} characters`);
});

test("S1: one block asked by its id comes alone, no bigger than its own body and 2,000 characters", () => {
  const open = ids.slice(0, 3);
  fold(open);
  for (const [i, id] of open.entries()) {
    const one = S.stageAnswer(project, A, { id });
    assert.deepEqual(one, { project, sessionId: A, block: S.seen(project, id) });
    assert.ok(size(one) <= BODY + 2_000, `one block is ${size(one)} characters`);
    const text = JSON.stringify(one);
    assert.deepEqual(ids.map((_, j) => text.includes(mark(j))), ids.map((_, j) => j === i), "no other block is in it");
    assert.equal("stage" in one || "blocks" in one || "tray" in one, false, "no layout, no list, no tray");
  }
  // three blocks opened: three cells cross, where three whole stages crossed before
  const three = open.reduce((n, id) => n + size(S.stageAnswer(project, A, { id })), 0);
  assert.ok(three <= 3 * (BODY + 2_000));
  assert.ok(3 * size(S.stageAnswer(project, A)) > 780_000);
});

test("one block: an id that is not there, or is no id, answers null; a block in the tray is read too; the id wins over light", () => {
  assert.deepEqual(S.stageAnswer(project, A, { id: "nope0000" }), { project, sessionId: A, block: null });
  assert.deepEqual(S.stageAnswer(project, A, { id: "../../etc" }), { project, sessionId: A, block: null });
  assert.deepEqual(S.stageAnswer(project, A, { id: "" }), { project, sessionId: A, block: null });
  assert.ok(!S.getStage(project, A).blocks.some((p) => p.id === away.id), "not on this stage");
  assert.deepEqual(S.stageAnswer(project, A, { id: away.id }), { project, sessionId: A, block: S.seen(project, away.id) });
  assert.deepEqual(S.stageAnswer(project, A, { id: ids[0], light: true }), { project, sessionId: A, block: S.seen(project, ids[0]) });
});

test("what the face asked, read off its message: light only when it is exactly true, an id whenever one is named", () => {
  assert.deepEqual(S.stageAsk({ type: "work.stage.get", sessionId: A }), {}, "today's face asks nothing more");
  assert.deepEqual(S.stageAsk({ sessionId: A, light: true }), { light: true });
  for (const v of ["true", 1, "yes", {}, null, false]) assert.deepEqual(S.stageAsk({ sessionId: A, light: v }), {}, `light: ${JSON.stringify(v)} is not asked`);
  assert.deepEqual(S.stageAsk({ sessionId: A, id: ids[0] }), { id: ids[0] });
  assert.deepEqual(S.stageAsk({ sessionId: A, id: null }), {});
  // a bad id is still one block asked: it answers null, never the whole stage
  assert.deepEqual(S.stageAnswer(project, A, S.stageAsk({ sessionId: A, id: 7 })), { project, sessionId: A, block: null });
  assert.deepEqual(S.stageAnswer(project, A, S.stageAsk({ sessionId: A, id: "../x", light: true })), { project, sessionId: A, block: null });
});

test("the project's own block comes to the list as ever, light or whole; the one-block read writes no stage", () => {
  const l = S.compose(who(A), { kind: "list", title: "In the background" });
  const run = S.bind(who(A), { id: l.id, source: join(REPO, "status.json"), watch: "run" });
  assert.equal(run.scope, "project");
  const N = "sess-light-0003", M = "sess-light-0004";
  // one block asked from a session that has no stage yet: the block, and still no stage.json
  assert.equal(S.stageAnswer(project, N, { id: ids[0] }).block?.id, ids[0]);
  assert.equal(S.hasStage(project, N), false, "nothing was laid out");
  assert.ok(!S.getBlock(project, run.id)!.sessions.includes(N));
  // the light list: the run is on this stage, folded, so it comes as its block.json
  const light = S.stageAnswer(project, N, { light: true });
  assert.deepEqual(light.stage.blocks.map((p) => [p.id, p.folded]), [[run.id, true]]);
  assert.deepEqual(light.blocks, [S.getBlock(project, run.id)]);
  assert.ok(S.getBlock(project, run.id)!.sessions.includes(N));
  // and the whole list, the same way it always did
  const whole = S.stageAnswer(project, M);
  assert.deepEqual(whole.blocks, [S.seen(project, run.id)]);
});
