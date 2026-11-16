// What runs in the background (#703, work/background.ts and blocks.ts's run watch): a list bound with watch "run" to a
// run's JSON, read from the fixtures (sol/design/system/fixtures/stage/runs: the NucBox watcher's status.json as it
// reads, and the design's scene 4, one builder stopped on a question). A home of its own; never the real one.
import { test, after, mock } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOME = mkdtempSync(join(tmpdir(), "sol-runs-home-"));
const REPO = mkdtempSync(join(tmpdir(), "sol-runs-repo-"));
mkdirSync(join(REPO, ".git"));
process.env.SOL_HOME = HOME;

const FIX = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "design", "system", "fixtures", "stage", "runs");
const status = JSON.parse(readFileSync(join(FIX, "status.json"), "utf8"));
const waits = JSON.parse(readFileSync(join(FIX, "waits.json"), "utf8"));

const S = await import("../src/work/blocks.ts");
const R = await import("../src/work/background.ts");

const heard: any[] = [];
S.setStageBus((m) => heard.push(m));
const project = S.projectOf(REPO);
const who = (sessionId = "sess-runs-1") => ({ project, sessionId, by: "tester's agent", cwd: REPO });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const URL = "http://localhost:8797/status.json";
let served: unknown = status, asked = 0;
R.setRunReader(async (src) => { asked++; if (src !== URL && !src.endsWith(".json")) throw new Error("no such run"); if (src === URL) return served; return JSON.parse(readFileSync(src, "utf8")); });
const body = (id: string) => JSON.parse(S.bodyOf(project, id)!.text!);
after(() => { S.disarmAll(); S.setStageBus(null); R.setRunReader(null); });

test("a run's JSON is one step per background session: the working first, then the done, each with its minutes of four hours", () => {
  const b = R.runBody(status, "NucBox");
  assert.equal(b.where, "NucBox");
  assert.equal(b.cap, 4 * 3600);
  assert.deepEqual(b.steps.map((s) => [s.t, s.st]), [["join", "half"], ["jelly", "done"], ["face", "done"], ["engine", "done"]]);
  const join0 = b.steps[0].run;
  assert.equal(join0.min, 41, "a working one counts to now");
  assert.equal(b.steps[2].run.min, 44, "a done one counts to its last move");
  assert.equal(join0.said, "Shots look right. Waiting for the gate.");
  assert.equal(b.steps[0].note, join0.said, "the list's note is its last line");
  assert.deepEqual(join0.pr, { n: 711, draft: true, url: "https://github.com/sol-mif/sol-dev/pull/711" });
  assert.equal(join0.moves.length, 6);
  assert.deepEqual(join0.moves[1], { k: "bash", w: "nice -n 10 bash sol/gate > /tmp/sol-join-gate.log" });
  assert.deepEqual([join0.turns, join0.tokens, join0.commits, join0.files.length], [268, 173275, 3, 3]);
  assert.equal(R.runState(b), "working");
  assert.equal(R.runWords(b), "1 working · 3 done");
});

test("one that needs the person comes to the top, waits, and the words say so", () => {
  const b = R.runBody(waits, "NucBox");
  assert.deepEqual(b.steps.map((s) => [s.t, s.st]), [["face", "wait"], ["join", "half"], ["jelly", "done"], ["engine", "done"]]);
  assert.equal(b.steps[0].run.said, "Should the tile gap be 8 or 12? The kit says 12, the prototype 8.");
  assert.equal(b.steps[0].run.min, 38);
  assert.equal(R.runState(b), "waits");
  assert.equal(R.runWords(b), "1 needs you · 1 working · 2 done");
  assert.deepEqual(R.runMoves(R.runBody(status, "x"), b), ["face: done → waits · Should the tile gap be 8 or 12? The kit says 12, the prototype 8."]);
  assert.deepEqual(R.runMoves(b, b), [], "nothing moved, nothing to say");
});

test("a source that is not a run reads as an empty list; the machine is the source's own name, else this machine's", () => {
  assert.deepEqual(R.runBody(null, "x").steps, []);
  assert.deepEqual(R.runBody({ builders: [{ state: "working" }, 3] }, "x").steps, [], "a session needs a name");
  assert.equal(R.runWords(R.runBody({}, "x")), "nothing running");
  assert.equal(R.whereOf(URL, "NucBox"), "NucBox");
  assert.equal(R.whereOf("http://100.105.80.53:8797/status.json"), "100.105.80.53");
  process.env.SOL_MACHINE = "Legion";
  assert.equal(R.whereOf(URL), "Legion");
  delete process.env.SOL_MACHINE;
});

test("bound with watch run to a URL: the list takes the sessions, works while one works, is the project's, and is asked every 10 s", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    heard.length = 0; served = status;
    const l = S.compose(who(), { kind: "list", title: "In the background" });
    const b = S.bind(who(), { id: l.id, source: URL, watch: "run" });
    assert.equal(b.scope, "project", "a run's list is the project's");
    assert.deepEqual(b.bind, { source: URL, watch: "run" }, "a URL is kept as it is");
    await wait(20);
    assert.equal(S.getBlock(project, l.id)!.state, "working");
    assert.deepEqual(body(l.id).steps.map((s: any) => s.t), ["join", "jelly", "face", "engine"]);
    const lines = S.ledger(project, l.id);
    assert.deepEqual(lines.slice(2).map((x) => [x.ev, x.note]), [["ran", "join working"], ["ran", "jelly done"], ["ran", "face done"], ["ran", "engine done"]]);
    assert.ok(S.ledgerWhole(lines));
    assert.ok(S.watching().includes(l.id));
    assert.equal(S.POLL_MS.run, 10_000);
    // ten seconds on, the same read: nothing written, no line
    const n0 = asked, len = lines.length;
    mock.timers.tick(10_000);
    await wait(20);
    assert.equal(asked, n0 + 1, "asked again after ten seconds");
    assert.equal(S.ledger(project, l.id).length, len, "the same sessions: no line");
    // face stops on a question: the list waits, face on top, one line that says so
    served = waits;
    heard.length = 0;
    mock.timers.tick(10_000);
    await wait(20);
    const now = S.getBlock(project, l.id)!;
    assert.equal(now.state, "waits");
    assert.equal(body(l.id).steps[0].t, "face");
    const last = S.ledger(project, l.id).at(-1)!;
    assert.equal(last.ev, "waits");
    assert.match(last.note!, /^face: done → waits · Should the tile gap/);
    assert.ok(heard.some((m) => m.block?.id === l.id && m.block.state === "waits"), "the face is told");
    assert.match(S.read(who()), /In the background · list · waits .*NucBox: 1 needs you · 1 working · 2 done · face needs the person: Should the tile gap/);
    // the source goes quiet: the list stays as it was
    R.setRunReader(async () => { throw new Error("down"); });
    mock.timers.tick(10_000);
    await wait(20);
    assert.equal(S.getBlock(project, l.id)!.state, "waits");
    assert.equal(body(l.id).steps.length, 4);
  } finally {
    mock.timers.reset();
    R.setRunReader(async (src) => { asked++; if (src === URL) return served; return JSON.parse(readFileSync(src, "utf8")); });
  }
});

test("the block is the project's: it shows, folded, in every session of the project; a session's own block stays in it", () => {
  const card = S.compose(who("sess-runs-1"), { kind: "card", title: "only here", body: "x" });
  const run = S.allBlocks(project).find((b) => b.scope === "project")!;
  const st = S.withProject(project, "sess-runs-2");
  const p = st.blocks.find((x) => x.id === run.id);
  assert.ok(p, "the run is on the other session's stage");
  assert.equal(p!.folded, true, "folded: its chip by the talk");
  assert.ok(!st.blocks.some((x) => x.id === card.id), "the card stays in its own session");
  assert.ok(S.getBlock(project, run.id)!.sessions.includes("sess-runs-2"));
  // opened there, it stays where it was put; asked again, nothing comes twice
  S.layout(project, "sess-runs-2", { blocks: st.blocks.map((x) => (x.id === run.id ? { ...x, folded: false, x: 12, y: 12, w: 600, h: 400 } : x)) });
  const again = S.withProject(project, "sess-runs-2");
  assert.equal(again.blocks.filter((x) => x.id === run.id).length, 1);
  assert.equal(again.blocks.find((x) => x.id === run.id)!.folded, false);
  // closed, it leaves every session, and does not come back
  S.place(who("sess-runs-2"), { id: run.id, close: true });
  assert.ok(!S.withProject(project, "sess-runs-3").blocks.some((x) => x.id === run.id));
});

test("bound with watch run to a file: the file's change is the list's", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sol-runs-src-")), f = join(dir, "status.json");
  copyFileSync(join(FIX, "status.json"), f);
  const l = S.compose(who(), { kind: "list", title: "In the background" });
  S.bind(who(), { id: l.id, source: f, watch: "run" });
  await wait(30);
  assert.equal(S.getBlock(project, l.id)!.state, "working");
  writeFileSync(f, JSON.stringify(waits));
  await wait(400);
  assert.equal(S.getBlock(project, l.id)!.state, "waits");
  assert.equal(body(l.id).steps[0].st, "wait");
  // frozen, the version and the body are kept however the run moves on
  S.freeze(who(), { id: l.id });
  writeFileSync(f, JSON.stringify(status));
  await wait(400);
  assert.equal(S.getBlock(project, l.id)!.state, "frozen");
  assert.equal(body(l.id).steps[0].t, "face");
});

test("a list bound to something else is a plain list; a run's watch on anything but a list keeps the old file watch", () => {
  const l = S.compose(who(), { kind: "list", title: "steps", body: JSON.stringify([{ t: "one", st: "" }]) });
  assert.equal(S.isRun({ kind: "list", bind: { source: URL, watch: "url" } }), false);
  assert.equal(S.isRun({ kind: "page", bind: { source: URL, watch: "run" } }), false);
  assert.equal(S.getBlock(project, l.id)!.scope, undefined, "a session's own list has no scope");
  assert.deepEqual(Object.keys(S.getBlock(project, l.id)!).sort(), ["at", "bind", "id", "kind", "parent", "sessions", "state", "title", "versions"]);
});
