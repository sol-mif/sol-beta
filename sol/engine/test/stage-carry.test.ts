// Carry and start (#700, work/blocks.ts): one block in two sessions is one block with one ledger, so an update in one is
// the other's too; a new session opens with the talk alone (#739), the project's open blocks in its tray, with the last
// ledger lines; start_session
// and hand_off carry the blocks they name (hand_off also the old session's list, live); coming back to a session opens
// exactly the stage.json it left. All in a home of its own; never the real one.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "sol-carry-home-"));
const REPO = mkdtempSync(join(tmpdir(), "sol-carry-repo-"));
mkdirSync(join(REPO, ".git"));
const TEAM = join(mkdtempSync(join(tmpdir(), "sol-team-")), "team.json");
writeFileSync(TEAM, JSON.stringify({ me: { login: "tester", name: "T" }, repos: [] }));
process.env.SOL_HOME = HOME;
process.env.SOL_TEAM = TEAM;
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_STAGE_WHOLE = "off";   // the stage before stage.whole (a lens per session), on by default since #691; on, a lens goes to settings.json

const S = await import("../src/work/blocks.ts");
const tools = await import("../src/work/tools.ts");

const heard: any[] = [];
S.setStageBus((m) => heard.push(m));
S.setStageFinder(async (id) => ({ cwd: REPO, by: `agent · ${id.slice(5, 9)}` }));
const project = S.projectOf(REPO);
const who = (sessionId: string) => ({ project, sessionId, by: `agent · ${sessionId.slice(5, 9)}`, cwd: REPO });
const text = (r: { content: { text: string }[] }) => r.content[0].text;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
after(() => { S.disarmAll(); S.setStageBus(null); });

test("carry: one block, two sessions, one ledger; an update in one shows in the other", async () => {
  const A = "sess-aaaa0001", B = "sess-bbbb0002";
  const c = await tools.runWorkTool("compose", { kind: "list", title: "the kit's side", body: JSON.stringify({ steps: [{ t: "lint", st: "" }, { t: "your read", st: "" }] }) }, A);
  const id = /^composed ([a-z0-9-]+) /.exec(text(c))![1];
  // the agent's place with a session: carried, no copy
  assert.match(text(await tools.runWorkTool("place", { id, carry: B }, A)), /carried the kit's side to sess-bbbb0002: the same block, one ledger/);
  assert.deepEqual(S.getBlock(project, id)?.sessions, [A, B]);
  assert.equal(S.allBlocks(project).filter((b) => b.title === "the kit's side").length, 1, "no copy was made");
  assert.ok(S.getStage(project, A).blocks.some((p) => p.id === id), "still on the first stage");
  assert.ok(S.getStage(project, B).blocks.some((p) => p.id === id), "and on the second");
  // a step ticked in the second session
  heard.length = 0;
  await tools.runWorkTool("update", { id, body: JSON.stringify({ steps: [{ t: "lint", st: "done" }, { t: "your read", st: "" }] }) }, B);
  // the first session's stage reads the same body: the one block
  const inA = S.seen(project, id)!;
  assert.equal(JSON.parse(inA.body!.text!).steps[0].st, "done");
  // the change names the block's sessions, so a face showing the first asks again (engineStore listens for it)
  const ch = heard.find((m) => m.block?.id === id && m.line?.ev === "ran");
  assert.ok(ch, "the update is told");
  assert.ok(ch.block.sessions.includes(A), "the first session is named on the change");
  // one ledger: composed in A, carried by A, ran in B, signed one over the other
  const L = S.ledger(project, id);
  assert.deepEqual(L.map((l) => l.ev), ["composed", "carried", "ran"]);
  assert.equal(L[1].note, `to ${B}`);
  assert.equal(L[2].by, "agent · bbbb");
  assert.ok(S.ledgerWhole(L));
  // carried again: still one reference, one more line
  S.place(who(A), { id, carry: B });
  assert.deepEqual(S.getBlock(project, id)?.sessions, [A, B]);
  assert.ok(S.ledgerWhole(S.ledger(project, id)));
  await wait(S.SETTLE_MS + 50);
  assert.equal(S.getBlock(project, id)?.state, "live", "working for a moment, then live");
});

test("start: a new session opens with the talk alone; the project's open blocks are its tray, by the session that made them (#739)", () => {
  const A = "sess-cccc0003", N = "sess-dddd0004";
  const live = S.compose(who(A), { kind: "card", title: "the gate", body: "green" });
  const waits = S.compose(who(A), { kind: "shots", title: "stills", body: "[]", waits: true });
  const frozen = S.compose(who(A), { kind: "page", title: "the week", body: "<p>w</p>" });
  S.freeze(who(A), { id: frozen.id });
  const dead = S.compose(who(A), { kind: "diff", title: "gone", body: "" });
  S.place(who(A), { id: dead.id, close: true });
  assert.equal(S.hasStage(project, N), false);
  const st = S.start(who(N), { from: A });
  assert.deepEqual(st.blocks, [], "nothing from another sitting is on the new stage");
  assert.ok(!S.getBlock(project, live.id)!.sessions.includes(N), "nor referenced by it until pulled in");
  const tray = S.trayOf(project, N);
  const ids = tray.map((t) => t.id);
  assert.ok(ids.includes(live.id) && ids.includes(waits.id), "the open ones are in the tray");
  assert.ok(!ids.includes(frozen.id), "a frozen-only block is not");
  assert.ok(!ids.includes(dead.id), "a closed one is not");
  assert.ok(tray.every((t) => t.from === A || t.from.startsWith("sess-")), "each names the session that made it");
  assert.equal(tray.find((t) => t.id === live.id)?.from, A);
  const at = tray.map((t) => t.at);
  assert.deepEqual(at, [...at].sort((x, y) => y - x), "newest first");
  assert.equal(st.start?.from, A);
  assert.ok(st.start!.lines.length > 0 && st.start!.lines.length <= S.START_LINES);
  const when = st.start!.lines.map((l) => l.at);
  assert.deepEqual(when, [...when].sort((x, y) => x - y), "oldest first, the last at the foot");
  assert.ok(st.start!.lines.some((l) => l.title === "stills" && l.ev === "waits"), "each line names its block");
  assert.ok(st.start!.lines.every((l) => l.title !== "gone" && l.title !== "the week"));
  // pulled in from the tray at a spot: carried, one ledger, gone from the tray
  S.place({ ...who(N), sessionId: A }, { id: live.id, carry: N, at: { x: 100, y: 60, w: 260, h: 140 } });
  const p = S.getStage(project, N).blocks.find((q) => q.id === live.id)!;
  assert.deepEqual([p.x, p.y, p.w, p.h, p.folded], [100, 60, 260, 140, false], "where it was dropped");
  assert.deepEqual(S.getBlock(project, live.id)!.sessions, [A, N]);
  assert.equal(S.allBlocks(project).filter((b) => b.title === "the gate").length, 1, "the same block, no copy");
  assert.equal(S.ledger(project, live.id).at(-1)?.ev, "carried");
  assert.ok(!S.trayOf(project, N).some((t) => t.id === live.id), "out of the tray once on the stage");
});

test("a block moved by hand keeps the mark through a layout (#739: never folded to make room)", () => {
  const A = "sess-hand0001";
  const b = S.compose(who(A), { kind: "card", title: "held", body: "x" });
  const s = S.getStage(project, A);
  S.layout(project, A, { blocks: s.blocks.map((p) => (p.id === b.id ? { ...p, x: 200, hand: true } : p)) });
  assert.equal(S.getStage(project, A).blocks.find((p) => p.id === b.id)?.hand, true);
});

test("coming back to a session opens exactly the stage.json it left; a second start lays nothing out again", () => {
  const A = "sess-eeee0005", N = "sess-ffff0006";
  const b = S.compose(who(A), { kind: "list", title: "a list", body: "[]" });
  S.start(who(N));
  S.place({ ...who(N), sessionId: A }, { id: b.id, carry: N });
  const left = { lens: "ide" as const, tiled: true, blocks: S.getStage(project, N).blocks.map((p, i) => ({ ...p, x: 40 + i, y: 50, w: 300, h: 200, z: i + 1, folded: false })) };
  S.layout(project, N, left);
  const before = S.getStage(project, N);
  assert.equal(before.lens, "ide");
  assert.equal(before.tiled, true);
  assert.ok(before.start, "the layout keeps how it opened");
  // the engine started again (a fork's second word, the openRun and startFrom both): nothing moves
  S.start(who(N));
  assert.deepEqual(S.getStage(project, N), before);
  // and a new block in the project since does not barge onto a stage that exists
  S.compose(who(A), { kind: "card", title: "later", body: "x" });
  S.start(who(N));
  assert.deepEqual(S.getStage(project, N), before);
});

test("start_session and hand_off carry the blocks they name, unfolded, signed by the session that started it; the list named goes live", async () => {
  const A = "sess-gggg0007", N = "sess-hhhh0008";
  const plan = S.compose(who(A), { kind: "list", title: "the plan", body: JSON.stringify({ steps: [{ t: "one", st: "done" }, { t: "two", st: "half" }] }), format: "json" }).id;
  const named = S.compose(who(A), { kind: "diff", title: "Side.tsx", body: "" });
  const other = S.compose(who(A), { kind: "card", title: "an aside", body: "x" });
  const st = S.start({ ...who(A), sessionId: N }, { from: A, carry: [named.id, plan, "no-such", named.id] });
  const at = (id: string) => st.blocks.find((p) => p.id === id);
  assert.equal(at(named.id)?.folded, false, "the named block unfolded");
  assert.equal(at(plan)?.folded, false, "the list carried live");
  assert.equal(at(other.id), undefined, "the rest of the project stays in the tray");
  assert.ok(S.trayOf(project, N).some((t) => t.id === other.id));
  const line = S.ledger(project, named.id).at(-1)!;
  assert.equal(line.ev, "carried");
  assert.equal(line.by, "agent · gggg");
  assert.equal(S.ledger(project, named.id).filter((l) => l.ev === "carried").length, 1, "named twice, carried once");
  // the list is one block: a step ticked from the new session is the old one's too
  await tools.runWorkTool("update", { id: plan, body: JSON.stringify({ steps: [{ t: "one", st: "done" }, { t: "two", st: "done" }] }) }, N);
  assert.equal(JSON.parse(S.seen(project, plan)!.body!.text!).steps[1].st, "done");
});

test("the tools: start_session and hand_off take blocks, and hand_off hands them on", async () => {
  const shape = (n: string) => (tools.WORK_TOOLS.find((t) => t.name === n) as any)?.shape;
  assert.ok(shape("start_session")?.blocks, "start_session takes blocks");
  assert.ok(shape("hand_off")?.blocks, "hand_off takes blocks");
  let got: unknown[] = [];
  tools.setWorkHooks({
    start: async (_f: string, a: any) => { got = ["start", a.blocks]; return "started"; },
    handoff: async (_f: string, _t: string, _p: string, b?: string[]) => { got = ["handoff", b]; return "handed"; },
  } as any);
  await tools.runWorkTool("start_session", { title: "t", prompt: "p", blocks: ["abc"] }, "sess-iiii0009");
  assert.deepEqual(got, ["start", ["abc"]]);
  await tools.runWorkTool("hand_off", { title: "t", remaining_plan: "what is left", blocks: ["abc", "def"] }, "sess-iiii0009");
  assert.deepEqual(got, ["handoff", ["abc", "def"]]);
  tools.setWorkHooks(null as any);
});
