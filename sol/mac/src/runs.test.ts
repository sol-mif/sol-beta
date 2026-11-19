// node --test src/*.test.ts (npm test here): the runs view's rules (#889, runs/rules.ts): the address, the mark a
// project wears, what goes in "Needs you" and in which order, a line's track at a width, the machines' meters and the
// plan made here when the board cannot plan.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_DEFAULT, boardUrl, boardPath, projectMark, needsYou, calmLine, trackLayout, TRACK, screenLayout, SCREEN, meters,
  localPlan, partsOf, liveWhy, firstTab, sharedWhy, minutesWord, isPlan, joinCount, readyOf, sinceMoved, span, shortName, machineName, sureWord,
  type Board, type Run, type RunState,
} from "./runs/rules.ts";

const AT = 1_794_290_000;
const run = (id: string, line: string, state: RunState, o: Partial<Run> = {}): Run => ({ id, line, state, machine: "nucbox", why: `why ${id}`, moved: 60, ...o });
const machine = (o: Record<string, unknown> = {}) => ({ at: AT, cores: 8, load: [2, 2, 2], mem_free_gb: 8, builders: 1, room: 2, room_why: "room for 2: 1 of 3 builders", ...o });
const board = (o: Partial<Board> = {}): Board => ({
  at: AT,
  projects: [{ id: "jelly", name: "Jelly" }, { id: "school", name: "School" }],
  lines: [{ id: "a", project: "jelly", name: "Build and Home", try: "marco/mine-run" }, { id: "b", project: "school", name: "Essays" }],
  runs: [], joins: [], machines: { nucbox: machine() }, alerts: [], ...o,
});

test("the address: the default relay, ?runs.url= overrides it, a bare host gets its slash, and a file's neighbours", () => {
  assert.equal(boardUrl(""), BOARD_DEFAULT);
  assert.equal(boardUrl("?runs.url=http://100.105.80.53:8811"), "http://100.105.80.53:8811/");
  assert.equal(boardUrl("?runs.url=http://127.0.0.1:7811/calm.json"), "http://127.0.0.1:7811/calm.json");
  assert.equal(boardUrl("?runs.url=javascript:alert(1)"), BOARD_DEFAULT, "only a web address");
  assert.equal(boardPath("http://h:1/", "plan"), "http://h:1/plan");
  assert.equal(boardPath("http://h:1/boards/calm.json?x=1", "start"), "http://h:1/boards/start");
});

test("a project's mark: needs you over ready over working over calm", () => {
  const b = board({ runs: [run("w", "a", "working"), run("s", "a", "quiet")] });
  assert.deepEqual(projectMark(b, "jelly"), { mark: "needs", word: "needs you", detail: "1 stalled, 1 working" });
  assert.equal(projectMark(board({ runs: [run("f", "a", "failed")] }), "jelly").mark, "needs");
  assert.equal(projectMark(board({ runs: [run("c", "a", "cut")] }), "jelly").mark, "needs");
  const ready = board({ runs: [run("w", "a", "working")], joins: [{ line: "a", name: "B", queue: [{ pr: 1 }, { pr: 2 }], log: ["1 merged"] }] });
  assert.deepEqual(projectMark(ready, "jelly"), { mark: "ready", word: "ready to try", detail: "1 new, 1 builder" });
  assert.equal(projectMark(ready, "jelly", { a: 1 }).mark, "working", "once tried, it is only working");
  assert.equal(projectMark(board({ runs: [run("t", "a", "testing")] }), "jelly").mark, "working");
  assert.equal(projectMark(board({ runs: [run("t", "a", "waiting")] }), "jelly").detail, "1 builder");
  assert.deepEqual(projectMark(board(), "school"), { mark: "calm", word: "calm", detail: "nothing running" });
  assert.equal(projectMark(board(), "nowhere").detail, "nothing running", "no line: said once, under the tab, not twice (#906)");
  assert.equal(projectMark(board({ requests: [{ sentence: "x", project: "school" }] }), "school").detail, "1 waiting to start");
  assert.equal(projectMark(board({ runs: [run("d", "a", "done")] }), "jelly").mark, "calm", "a finished builder with no PR is calm");
});

test("a stalled builder in one project marks that project only", () => {
  const b = board({ runs: [run("s", "b", "quiet"), run("w", "a", "working")] });
  assert.equal(projectMark(b, "school").mark, "needs");
  assert.equal(projectMark(b, "jelly").mark, "working");
});

test("Needs you: a machine where nothing starts first, then failed, cut, stuck; the longest silent first", () => {
  const b = board({
    runs: [run("s1", "a", "quiet", { moved: 1500 }), run("s2", "b", "quiet", { moved: 4000 }), run("f", "a", "failed"), run("c", "a", "cut"), run("w", "a", "working")],
    alerts: [
      { level: "act", what: "nucbox: /tmp at 91% inodes; no builder can start", where: "nucbox" },
      { level: "act", what: "s1 is stuck: why s1", where: "nucbox" },          // the run's own alert: said once, from the run
      { level: "watch", what: "nucbox: load 31 on 8 cores; tests will time out", where: "nucbox" },
      { level: "watch", what: "6 checks wait for one runner", where: "ci" },
    ],
  });
  const n = needsYou(b);
  assert.deepEqual(n.map((x) => x.kind), ["machine", "failed", "cut", "stuck", "stuck"]);
  assert.deepEqual(n.filter((x) => x.kind === "stuck").map((x) => x.run), ["s2", "s1"]);
  assert.equal(n[0].title, "NucBox: nothing new can start there");
  assert.equal(n[0].why, "/tmp at 91% inodes; no builder can start");
  assert.equal(n[3].title, "Essays: s2 on the NucBox is stuck");
  assert.equal(n[3].project, "school");
  assert.equal(n[3].why, "why s2");
});

test("a why as the screen says it: the silence counts up, the closing 'stuck' is not said twice", () => {
  assert.equal(liveWhy("silent 47 min and nothing running: stuck", 47 * 60 + 130), "silent 49 min and nothing running");
  assert.equal(liveWhy("silent 90 min, waiting on a command it started", 2 * 3600), "silent 2 h, waiting on a command it started");
  assert.equal(liveWhy("ended with exit-code", null), "ended with exit-code");
  assert.equal(liveWhy(undefined, 5), "the board gives no reason");
  const b = board({ runs: [run("s", "a", "quiet", { moved: 1200, why: "silent 20 min and nothing running: stuck" })] });
  assert.equal(needsYou(b, AT + 600)[0].why, "silent 30 min and nothing running");
});

test("Needs you is empty on a healthy night, and the calm line says so in one line", () => {
  const b = board({ runs: [run("w", "a", "working"), run("t", "b", "testing"), run("d", "a", "done")], alerts: [{ level: "watch", what: "x", where: "ci" }] });
  assert.deepEqual(needsYou(b), []);
  assert.equal(calmLine(b), "Nothing needs you. 2 builders at work on 2 projects.");
  assert.equal(calmLine(board()), "Nothing needs you, and nothing is running.");
});

test("Needs you counts the silence up from the board's read", () => {
  const b = board({ runs: [run("s", "a", "quiet", { moved: 1200 })] });
  assert.equal(needsYou(b, AT + 30)[0].quiet, 1230);
  assert.equal(sinceMoved(run("x", "a", "working", { moved: null }), AT, AT + 5), null);
  assert.equal(sinceMoved(run("x", "a", "working", { moved: 10 }), AT, AT - 50), 10, "a clock behind the board never counts down");
});

test("a line's track: in a row from 720 px, the goal a fifth, stacked under it", () => {
  assert.equal(trackLayout([], TRACK.row).stacked, false);
  assert.equal(trackLayout([], TRACK.row - 1).stacked, true);
  assert.equal(trackLayout([], 1000).cols, `200px minmax(0, 1fr) ${TRACK.join}px ${TRACK.tryW}px`);
  assert.equal(trackLayout([], 760).cols.split(" ")[0], `${TRACK.goal}px`, "the goal never narrower than 180");
  assert.equal(trackLayout([], 500).cols, "minmax(0, 1fr)");
});

test("a line's track: stalled builders first and always drawn, the rest fold into one line of counts", () => {
  const twelve = [
    ...Array.from({ length: 8 }, (_, i) => run(`w${i}`, "a", "working")),
    run("t", "a", "testing"), run("wa", "a", "waiting"), run("q", "a", "quiet"), run("f", "a", "failed"),
  ];
  const row = trackLayout(twelve, 1000);
  assert.deepEqual(row.shown.map((r) => r.id), ["f", "q", "w0", "w1"]);
  assert.deepEqual(row.folded, { count: 8, words: "and 8 more: 6 working, 1 running its tests, 1 waiting" });
  const stack = trackLayout(twelve, 500);
  assert.equal(stack.shown.length, 3);
  assert.equal(stack.folded?.count, 9);
  const allStuck = Array.from({ length: 6 }, (_, i) => run(`q${i}`, "a", "quiet"));
  assert.equal(trackLayout(allStuck, 500).shown.length, 6, "every stalled builder is drawn, whatever the cap");
  assert.equal(trackLayout(allStuck, 500).folded, null);
});

test("a line's track: one builder over the cap is drawn, never folded as 'and 1 more'", () => {
  const five = Array.from({ length: 5 }, (_, i) => run(`w${i}`, "a", "working"));
  assert.equal(trackLayout(five, 1000).shown.length, 5);
  assert.equal(trackLayout(five, 1000).folded, null);
  assert.equal(trackLayout([], 1000).folded, null);
});

test("the screen: the side beside the lines from 1040 px, under them below", () => {
  assert.deepEqual(screenLayout(1280), { beside: true, linesW: 1280 - SCREEN.sideW });
  assert.deepEqual(screenLayout(900), { beside: false, linesW: 900 });
});

test("the join's count: from the log, else the board's merged list; the next in the queue", () => {
  const j = { line: "a", name: "B", queue: [{ pr: 848 }, { pr: 851 }, { pr: 853 }, { pr: 856 }], log: ["848 merged", "851 merged", "noise"] };
  assert.deepEqual(joinCount(j), { merged: 2, of: 4, next: 853 });
  assert.deepEqual(joinCount(j, [{ number: 853 }, { number: 999 }]), { merged: 3, of: 4, next: 856 });
  assert.deepEqual(joinCount({ ...j, log: ["848 merged", "851 merged", "853 merged", "856 merged"] }), { merged: 4, of: 4 });
});

test("ready to try: what landed, less what he has seen; a line with no join counts finished builders' PRs", () => {
  const b = board({ joins: [{ line: "a", name: "B", queue: [{ pr: 1 }, { pr: 2 }], log: ["1 merged", "2 merged"] }] });
  assert.deepEqual(readyOf(b, "a"), { count: 2, fresh: 2, where: "marco/mine-run" });
  assert.equal(readyOf(b, "a", { a: 2 }).fresh, 0);
  assert.equal(readyOf(b, "a", { a: 5 }).fresh, 0, "never below none");
  const c = board({ runs: [run("d", "b", "done", { pr: { number: 7 } }), run("e", "b", "done")] });
  assert.equal(readyOf(c, "b").count, 1);
});

test("the machines: the three always, in one order; one not reporting says so; the watch line stays with its machine", () => {
  const b = board({
    machines: { nucbox: machine({ builders: 5, room: 0, room_why: "full: 5 builders, the cap here is 3" }), spare: machine({ cores: 4 }) },
    alerts: [{ level: "watch", what: "nucbox: load 31.8 on 8 cores; tests will time out", where: "nucbox" }],
  });
  const m = meters(b);
  assert.deepEqual(m.map((x) => x.name), ["MacBook", "NucBox", "Legion", "Spare"]);
  assert.equal(m[0].reporting, false);
  assert.equal(m[0].word, "not reporting");
  assert.deepEqual([m[1].full, m[1].word, m[1].why, m[1].watch], [1, "full", "full: 5 builders, the cap here is 3", "load 31.8 on 8 cores; tests will time out"]);
  assert.equal(m[3].full, 1, "4 cores: a cap of 1, and one builder fills it");
  assert.equal(m[3].word, "room for 2");
  assert.equal(meters(board({ machines: { macbook: machine({ role: "desk", builders: 0, room: 0 }) } }))[0].word, "kept for you");
});

test("a sentence's parts: split at and, then, commas; the proof is the review's", () => {
  assert.deepEqual(partsOf("add export to the notes block and prove it"), { parts: ["add export to the notes block"], proof: "prove it" });
  assert.deepEqual(partsOf("add a search, then a filter and a sort, and test them."), { parts: ["add a search", "a filter", "a sort"], proof: "test them" });
  assert.deepEqual(partsOf("prove it"), { parts: ["prove it"], proof: "prove it" });
  assert.equal(partsOf("a, b, c, d, e, f, g, h").parts.length, 6);
});

const three = () => board({
  machines: {
    nucbox: machine({ room: 1, room_why: "room for 1: 2 of 3 builders" }),
    legion: machine({ cores: 16, room: 3, room_why: "room for 3: 3 of 6 builders" }),
    macbook: machine({ room: 2, role: "desk", room_why: "room for 2" }),
  },
});

test("the local plan: most room first, at most each machine's room, never the Mac while another reports", () => {
  const p = localPlan(three(), "add export, add import, add a share sheet and a print view, and prove it");
  assert.equal(p.by, "planned here");
  assert.equal(p.builders, 4);
  assert.deepEqual(p.parts.map((x) => x.machine), ["legion", "legion", "legion", "nucbox"]);
  assert.match(p.parts[0].why, /^most room now: room for 3/);
  assert.match(p.parts[3].why, /^the next with room: room for 1/);
  assert.equal(p.review.machine, "nucbox", "every machine but the Mac builds: the review goes where the least is built");
  assert.match(p.review.why, /^not the Legion, where most of it is built/);
  assert.equal(p.why_builders, "one for each of the 4 parts; the machines have room for 4");
  assert.deepEqual(p.join.order, ["part 1", "part 2", "part 3", "part 4"]);
  assert.ok(isPlan(p));
});

test("the local plan: the review goes to another machine than the builders when one is free", () => {
  const p = localPlan(three(), "add export to the notes block and prove it");
  assert.deepEqual(p.parts.map((x) => [x.what, x.machine]), [["Add export to the notes block", "legion"]]);
  assert.equal(p.review.machine, "nucbox");
  assert.match(p.review.why, /another machine than the builders', so it reads the work fresh; you asked it to prove it$/);
  assert.equal(p.why_builders, "one part, so one builder");
  assert.equal(p.join.why, "one part: nothing to order");
  assert.equal(p.est_minutes, 45);
});

test("the local plan: more parts than room means fewer builders, said why; a full night still plans one, waiting", () => {
  const b = board({ machines: { nucbox: machine({ room: 2 }) } });
  const p = localPlan(b, "a, b, c and d");
  assert.equal(p.builders, 2);
  assert.equal(p.why_builders, "2, not 4: the machines have room for 2 now; the rest start as one finishes");
  assert.equal(p.est_minutes, 90);
  assert.match(p.review.why, /^no other machine reports/);
  const full = localPlan(board({ machines: { nucbox: machine({ room: 0, room_why: "full: 5 builders, the cap here is 3" }) } }), "a and b");
  assert.equal(full.builders, 1);
  assert.equal(full.why_builders, "one at a time: every machine is full now");
  assert.match(full.parts[0].why, /^every machine is full; it waits for the first free place here \(full: 5 builders/);
});

test("the local plan: a machine silent for 15 min is left out; only the Mac reporting, the Mac builds", () => {
  const b = board({ machines: { nucbox: machine({ at: AT - 16 * 60, room: 3 }), macbook: machine({ role: "desk", room: 1 }) } });
  const p = localPlan(b, "one thing");
  assert.equal(p.parts[0].machine, "macbook");
});

test("a plan from the board is checked before it is drawn", () => {
  assert.equal(isPlan({ id: "x" }), false);
  assert.equal(isPlan(null), false);
  assert.equal(sureWord(0.62), "sure 62%");
  assert.equal(sureWord(80), "sure 80%");
  assert.equal(sureWord("high"), "high");
});

test("words: spans, short names, machine names", () => {
  assert.deepEqual([span(5), span(61), span(3600), span(3600 + 300)], ["just now", "1 min", "1 h", "1 h 5 min"]);
  assert.equal(shortName("sol-build-stage-joina"), "stage-joina");
  assert.equal(shortName("sol-chain-run751"), "run751");
  assert.deepEqual([machineName("nucbox"), machineName("legion"), machineName("macbook"), machineName("pi")], ["NucBox", "Legion", "MacBook", "Pi"]);
});

test("the first tab: needs you, else ready, else working, else the first; none with no projects", () => {
  const ps = [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }];
  const m = (o: Record<string, "needs" | "ready" | "working" | "calm">) => new Map(Object.entries(o).map(([k, v]) => [k, { mark: v }]));
  assert.equal(firstTab(ps, m({ a: "working", b: "ready", c: "needs" })), "c");
  assert.equal(firstTab(ps, m({ a: "working", b: "ready", c: "calm" })), "b");
  assert.equal(firstTab(ps, m({ a: "calm", b: "working", c: "calm" })), "b");
  assert.equal(firstTab(ps, m({ a: "calm", b: "calm", c: "calm" })), "a");
  assert.equal(firstTab([], m({})), null);
});

test("a reason every part shares is said once; parts on different machines keep their own", () => {
  const full = localPlan(board({ machines: { nucbox: machine({ room: 0, room_why: "full" }) } }), "a, b and c");
  assert.equal(sharedWhy(full), full.parts[0].why);
  assert.equal(sharedWhy(localPlan(three(), "a, b, c and d")), null);
  assert.equal(sharedWhy(localPlan(three(), "one thing")), null, "one part says its own");
  assert.equal(minutesWord(150), "about\u00a02\u00a0h\u00a030\u00a0min");
});
