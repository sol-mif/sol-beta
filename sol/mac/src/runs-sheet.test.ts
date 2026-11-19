// node --test src/*.test.ts (npm test here): "How builds run", the runs view's sheet of rules (#906, runs/sheet.ts):
// the defaults give #889's plans exactly (three pinned from before the sheet), every rule changes the plan or the
// judgement when changed, a plan names the rule of his that decided, a value out of range is refused with its range, a
// broken stored sheet falls back to the defaults and says so; and which project a session's folder belongs to.
import { test } from "node:test";
import assert from "node:assert/strict";
import { localPlan, meters, judged, needsYou, projectMark, partsOf, type Board, type Plan } from "./runs/rules.ts";
import {
  RULES, FIXED, DEFAULTS, readSheet, writeSheet, setRule, resetRule, changedIds, ruleWords, sheetBody, roomUnder, stuckUnder,
  projectOfFolder, folderTable, ELSEWHERE, type Sheet,
} from "./runs/sheet.ts";

const AT = 1_794_290_000;
const m = (o: Record<string, unknown> = {}) => ({ at: AT, cores: 8, load: [2, 2, 2], mem_free_gb: 8, builders: 1, room: 2, room_why: "room for 2: 1 of 3 builders", ...o });
const three: Board = { at: AT, machines: {
  nucbox: m({ builders: 2, room: 1, room_why: "room for 1: 2 of 3 builders" }),
  legion: m({ cores: 16, load: [4, 4, 4], mem_free_gb: 20, builders: 1, room: 3, room_why: "room for 3: 1 of 6 builders" }),
  macbook: m({ role: "desk", cores: 10, builders: 0, room: 0, room_why: "the Mac is where you work" }) } };
const full: Board = { at: AT, machines: { nucbox: m({ builders: 3, room: 0, room_why: "full: 3 builders, the cap here is 3" }), legion: m({ cores: 16, builders: 6, room: 0, room_why: "full: 6 builders, the cap here is 6" }) } };
const macOnly: Board = { at: AT, machines: { macbook: m({ role: "desk", cores: 10, builders: 0, room: 4, room_why: "room for 4" }) } };
const A = "Add an export menu, write the PDF path, then a Markdown path and prove it";
const B = "Fix the tab's dot and the sheet's spacing";
const C = "Make the essay notes shorter";
const with1 = (id: string, v: unknown): Sheet => { const r = setRule(DEFAULTS, id, v); assert.ok(r.ok, id); return (r as { sheet: Sheet }).sheet; };
// the fields a plan had before the sheet (#889): the new ones (shots, starts, ruled) are left out of the comparison
const before = (p: Plan) => { const { starts: _s, ruled: _r, ...rest } = p; const { shots: _x, ...review } = rest.review; return { ...rest, review }; };

// printed by #889's localPlan (9284a9f9), before this change, for the three boards and sentences above
const PINNED = {"a":{"id":"here-qvxzm2","parts":[{"name":"part 1","what":"Add an export menu","machine":"legion","why":"most room now: room for 3: 1 of 6 builders"},{"name":"part 2","what":"Write the PDF path","machine":"legion","why":"most room now: room for 3: 1 of 6 builders"},{"name":"part 3","what":"A Markdown path","machine":"legion","why":"most room now: room for 3: 1 of 6 builders"}],"builders":3,"why_builders":"one for each of the 3 parts; the machines have room for 4","review":{"machine":"nucbox","why":"another machine than the builders', so it reads the work fresh; you asked it to prove it"},"join":{"order":["part 1","part 2","part 3"],"why":"in the order you said them: each lands on the one before"},"est_minutes":55,"confidence":0.5,"by":"planned here"},"b":{"id":"here-fajv8u","parts":[{"name":"part 1","what":"Fix the tab's dot","machine":"legion","why":"every machine is full; it waits for the first free place here (full: 6 builders, the cap here is 6)"},{"name":"part 2","what":"The sheet's spacing","machine":"legion","why":"every machine is full; it waits for the first free place here (full: 6 builders, the cap here is 6)"}],"builders":1,"why_builders":"one at a time: every machine is full now","review":{"machine":"nucbox","why":"another machine than the builders', so it reads the work fresh"},"join":{"order":["part 1","part 2"],"why":"in the order you said them: each lands on the one before"},"est_minutes":80,"confidence":0.5,"by":"planned here"},"c":{"id":"here-2xa2r2","parts":[{"name":"part 1","what":"Make the essay notes shorter","machine":"macbook","why":"most room now: room for 4"}],"builders":1,"why_builders":"one part, so one builder","review":{"machine":"macbook","why":"no other machine reports, so a fresh session reviews where it was built"},"join":{"order":["part 1"],"why":"one part: nothing to order"},"est_minutes":45,"confidence":0.5,"by":"planned here"}};

test("the defaults give #889's plans exactly: three pinned from before the sheet", () => {
  assert.deepEqual(before(localPlan(three, A, AT)), PINNED.a);
  assert.deepEqual(before(localPlan(full, B, AT)), PINNED.b);
  assert.deepEqual(before(localPlan(macOnly, C, AT)), PINNED.c);
  assert.deepEqual(before(localPlan(three, A, AT, { ...DEFAULTS })), PINNED.a, "the defaults written out are the defaults");
  assert.equal(localPlan(three, A, AT).ruled, undefined, "no rule of his decided a plan at the defaults");
});

test("at the defaults the judgement is the board's as given", () => {
  const b: Board = { ...three, runs: [{ id: "q", line: "l", machine: "nucbox", state: "quiet", moved: 60, why: "silent 1 min" }] };
  assert.deepEqual(judged(b, DEFAULTS, AT + 30), b);
  assert.deepEqual(meters(three).map((x) => [x.room, x.why]), meters(three, DEFAULTS).map((x) => [x.room, x.why]));
});

test("every rule on the sheet changes the plan or the judgement when changed", () => {
  const changes: Record<string, () => void> = {
    "builders.nucbox": () => {
      const four = "one, two, three, four";
      assert.equal(localPlan(three, four, AT).builders, 4);
      const p = localPlan(three, four, AT, with1("builders.nucbox", 2));
      assert.equal(p.builders, 3, "the NucBox at 2, with 2 at work, has no room");
      assert.match(p.why_builders, /your rule ‘at most 2 builders at once on the NucBox’/);
      assert.equal(meters(three, with1("builders.nucbox", 2)).find((x) => x.id === "nucbox")!.room, 0);
    },
    "builders.legion": () => {
      const p = localPlan(three, A, AT, with1("builders.legion", 3));
      assert.equal(p.builders, 3);
      assert.deepEqual(p.parts.map((x) => x.machine), ["legion", "legion", "nucbox"]);
      assert.match(p.why_builders, /your rule ‘at most 3 builders at once on the Legion’/);
      assert.deepEqual(p.ruled, ["builders.legion"]);
      assert.equal(meters(three, with1("builders.legion", 3)).find((x) => x.id === "legion")!.full, 1 / 3);
    },
    split: () => {
      const p = localPlan(three, A, AT, with1("split", "whole"));
      assert.equal(p.parts.length, 1);
      assert.equal(p.parts[0].what, "Add an export menu and write the PDF path and a Markdown path");
      assert.match(p.why_builders, /^one part, so one builder; by your rule ‘work is built whole by one builder’/);
    },
    "split.max": () => {
      const p = localPlan(three, A, AT, with1("split.max", 2));
      assert.deepEqual(p.parts.map((x) => x.what), ["Add an export menu", "Write the PDF path and a Markdown path"]);
      assert.deepEqual(p.ruled, ["split.max"]);
    },
    "review.where": () => {
      const p = localPlan(three, A, AT, with1("review.where", "same"));
      assert.equal(p.review.machine, "legion");
      assert.match(p.review.why, /^your rule ‘the review runs on the machine that built most of it’/);
    },
    "review.eye": () => {
      assert.equal(localPlan(three, B, AT).review.shots, "it also looks at pictures of the screen at three window sizes");
      assert.match(localPlan(three, B, AT, with1("review.eye", false)).review.shots!, /^it reads the code only: your rule/);
      assert.equal(localPlan(three, C, AT).review.shots, undefined, "work off the screen: nothing to look at");
    },
    "stuck.after": () => {
      const b: Board = { ...three, runs: [{ id: "q", line: "l", machine: "nucbox", state: "quiet", moved: 25 * 60, why: "silent 25 min and nothing running: stuck" }] };
      assert.equal(needsYou(b, AT).length, 1);
      const s = with1("stuck.after", 40);
      assert.equal(needsYou(judged(b, s, AT), AT).length, 0, "under his 40 minutes it is not stuck");
      assert.equal(judged(b, s, AT).runs![0].state, "waiting");
      assert.equal(judged(b, s, AT).runs![0].why, "silent 25 min with nothing running; your rule ‘stuck after 40 silent minutes’ waits until 40");
      assert.equal(judged(b, s, AT + 15 * 60).runs![0].state, "quiet", "past his minutes it is stuck again");
    },
    "run.who": () => {
      assert.equal(localPlan(three, C, AT).starts, "Only you start it");
      const p = localPlan(three, C, AT, with1("run.who", "agents"));
      assert.equal(p.starts, "You or one of your agents may press Run");
      assert.deepEqual(p.ruled, ["run.who"]);
    },
  };
  assert.deepEqual(Object.keys(changes).sort(), RULES.map((r) => r.id).sort(), "every rule on the sheet has its proof here");
  for (const r of RULES) changes[r.id]();
});

test("a project stuck under the board's 20 minutes is working under his 40", () => {
  const b: Board = { ...three, projects: [{ id: "p", name: "P" }], lines: [{ id: "l", project: "p", name: "L" }],
    runs: [{ id: "q", line: "l", machine: "nucbox", state: "quiet", moved: 25 * 60, why: "silent 25 min" }] };
  assert.equal(projectMark(b, "p").mark, "needs");
  assert.equal(projectMark(judged(b, with1("stuck.after", 40), AT), "p").mark, "working");
});

test("the plan names his rule only where it decided", () => {
  const p = localPlan(three, C, AT, with1("builders.legion", 5));
  assert.equal(p.ruled, undefined, "one part fits either way: the Legion's cap decided nothing");
  assert.doesNotMatch(p.why_builders, /your rule/);
});

test("a value outside its range is refused with one line that says the range; the sheet is left as it was", () => {
  assert.deepEqual(setRule(DEFAULTS, "builders.nucbox", 9), { ok: false, why: "A whole number from 1 to 6." });
  assert.deepEqual(setRule(DEFAULTS, "builders.nucbox", 2.5), { ok: false, why: "A whole number from 1 to 6." });
  assert.deepEqual(setRule(DEFAULTS, "stuck.after", "10"), { ok: false, why: "A whole number from 20 to 240." });
  assert.equal((setRule(DEFAULTS, "stuck.after", "45") as { sheet: Sheet }).sheet["stuck.after"], 45, "typed text is read as a number");
  assert.equal(setRule(DEFAULTS, "split", "sometimes").ok, false);
  assert.equal(setRule(DEFAULTS, "review.eye", "yes").ok, false);
  assert.equal(setRule(DEFAULTS, "mac.never", false).ok, false, "his own safety is not a rule he can change");
  assert.equal(DEFAULTS["builders.nucbox"], 3);
});

test("stored: only what he changed; read back whole; back to the default", () => {
  const s = with1("builders.legion", 3);
  assert.equal(writeSheet(DEFAULTS), "{}");
  assert.equal(writeSheet(s), '{"builders.legion":3}');
  assert.deepEqual(readSheet(writeSheet(s)), { sheet: s, note: null });
  assert.deepEqual(changedIds(s), ["builders.legion"]);
  assert.deepEqual(changedIds(resetRule(s, "builders.legion")), []);
  assert.deepEqual(sheetBody(s), { "builders.legion": 3 }, "POST <board>/sheet, the engine half's shape");
  assert.equal(ruleWords(DEFAULTS, "builders.legion"), "the rule ‘at most 6 builders at once on the Legion’");
});

test("a broken stored sheet falls back to the defaults and says so", () => {
  assert.deepEqual(readSheet(null), { sheet: DEFAULTS, note: null });
  assert.deepEqual(readSheet("{not json"), { sheet: DEFAULTS, note: "Your saved rules could not be read, so every rule is at its default." });
  assert.deepEqual(readSheet("[1,2]").sheet, DEFAULTS);
  assert.ok(readSheet("[1,2]").note);
  const half = readSheet('{"builders.legion":3,"builders.nucbox":40,"someday.rule":1}');
  assert.equal(half.sheet["builders.legion"], 3, "a good value is kept");
  assert.equal(half.sheet["builders.nucbox"], 3, "a bad one goes back to its default");
  assert.equal(half.note, "One saved rule was out of range and went back to the default: at most … builders at once on the NucBox.");
});

test("the sheet's own words: a sentence, a why, a default for every rule; the MacBook is a fixed line", () => {
  for (const r of RULES) {
    assert.ok(r.before && typeof r.after === "string" && r.why && r.name.includes("{v}"), r.id);   // a sentence the control ends has no after
    assert.ok(setRule(DEFAULTS, r.id, r.def).ok, `${r.id}'s default is in its own range`);
  }
  assert.deepEqual(FIXED.map((f) => f.id), ["mac.never"]);
  assert.ok(!RULES.some((r) => /macbook/i.test(r.id)));
});

test("a machine's room under his cap: judge.py's rule worked again, /tmp still stops all", () => {
  const leg = three.machines!.legion;
  assert.deepEqual(roomUnder(DEFAULTS, "legion", leg), { room: 3, why: "room for 3: 1 of 6 builders", cap: 6, his: false });
  assert.equal(roomUnder(with1("builders.legion", 10), "legion", leg).room, 9);
  assert.equal(roomUnder(with1("builders.legion", 10), "legion", { ...leg, mem_free_gb: 6 }).room, 3, "2 GB a builder");
  assert.equal(roomUnder(with1("builders.legion", 10), "legion", { ...leg, tmp_inodes_pc: 90 }).room, 0);
  assert.equal(roomUnder(with1("builders.nucbox", 1), "nucbox", three.machines!.nucbox).why, "full: 2 builders, the 1 you allow");
  assert.equal(stuckUnder(DEFAULTS, "quiet", 60), null);
});

test("parts: past his most, the rest join the last part, so nothing he said is dropped", () => {
  assert.deepEqual(partsOf("a, b, c, d, e, f, g, h").parts, ["a", "b", "c", "d", "e", "f and g and h"]);
  assert.deepEqual(partsOf("a and b", with1("split", "whole")).parts, ["a and b"]);
});

test("a session's project by its folder: the longest match, a whole run of the path, else Elsewhere", () => {
  assert.equal(projectOfFolder("/Users/you/personal/projects/sol"), "jelly");
  assert.equal(projectOfFolder("/Users/you/personal/projects/sol/.claude/worktrees/x"), "jelly");
  assert.equal(projectOfFolder("/Users/you/personal/projects/my-sol/home"), "my-jelly");
  assert.equal(projectOfFolder("/Users/you/personal/projects/solar"), ELSEWHERE, "a name that only starts the same is not it");
  assert.equal(projectOfFolder("/home/you/scratch/sol-dev"), "jelly");
  assert.equal(projectOfFolder("C:\\Users\\marco\\projects\\school\\essays"), "school");
  assert.equal(projectOfFolder("/tmp"), ELSEWHERE);
  assert.equal(projectOfFolder(""), ELSEWHERE);
  const t = folderTable([{ id: "kaat", path: "work/projects/kaat" }, { id: "garden", path: "personal/garden" }]);
  assert.equal(projectOfFolder("/Users/you/personal/garden/beds", t), "garden", "a board project's own path joins the table");
});
