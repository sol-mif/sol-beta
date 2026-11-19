// A wait the night cannot hide (#1128 step 8, team/waits.ts): the waits older than a day, one block per key (carried,
// never copied), "later" coming back, the quiet branch of "not mine" posting nothing, and the switch off placing nothing.
// Logins are a, b, c.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SETTINGS = join(mkdtempSync(join(tmpdir(), "sol-waits-")), "settings.json");
process.env.SOL_SETTINGS = SETTINGS;
process.env.SOL_TEAM_OFFLINE = "1";

const W = await import("../src/team/waits.ts");
const settings = await import("../src/settings.ts");
type Wait = import("../src/team/people.ts").Wait;
type Person = import("../src/team/people.ts").PersonRead;

const H = 3_600_000, DAY = 24 * H;
const NOW = Date.parse("2026-11-17T12:00:00Z");
const wait = (o: Partial<Wait> & Pick<Wait, "why" | "since">): Wait => ({ title: "something", from: "b", ...o });
const person = (waits: Wait[]): Person => ({ login: "a", name: "A", holds: null, open: [], waits, agent: { inFlight: [] }, landed: [], minutes: { today: null, week: null } });

test("only waits older than a day are brought; a wait with no since never is", () => {
  const ws = [
    wait({ why: "review", n: 1, since: NOW - DAY - 1 }),
    wait({ why: "decision", n: 2, since: NOW - DAY + H }),
    wait({ why: "ask", id: "q1", since: NOW - 3 * DAY }),
    wait({ why: "review", n: 3, since: 0 }),
  ];
  assert.deepEqual(W.olderThanADay(ws, NOW).map((w) => w.n ?? w.id), [1, "q1"]);
});

test("the morning is the first session from 05:00, once a day", () => {
  assert.equal(W.morningOf({ hour: 4, day: "2026-11-17" }), null);
  assert.equal(W.morningOf({ hour: 5, day: "2026-11-17" }), "2026-11-17");
  assert.equal(W.morningOf({ hour: 9, day: "2026-11-17", last: "2026-11-17" }), null);
  assert.equal(W.morningOf({ hour: 9, day: "2026-11-18", last: "2026-11-17" }), "2026-11-18");
});

test("one block per key: composed the first morning, carried after, never copied", () => {
  const ws = [
    wait({ why: "review", n: 7, since: NOW - 2 * DAY }),
    wait({ why: "decision", n: 7, since: NOW - 3 * DAY }),   // the same number twice: one key, one block
    wait({ why: "hand", id: "ABC-1", n: 9, since: NOW - 2 * DAY }),
  ];
  const first = W.morningPlan(ws, { now: NOW, project: "p", find: () => null });
  assert.deepEqual(first.map((s) => [s.do, s.key]), [["compose", "wait-7"], ["compose", "hand-abc-1"]]);
  // the hand's key is E4's block id (reach.ts heldCard), so the morning carries the block E4 made
  assert.equal(W.waitKey(ws[2]), "hand-abc-1");
  const there: Record<string, { project: string; asks: object }> = { "wait-7": { project: "p", asks: {} }, "hand-abc-1": { project: "p", asks: {} } };
  const next = W.morningPlan(ws, { now: NOW + DAY, project: "p", find: (k) => there[k] ?? null });
  assert.deepEqual(next.map((s) => [s.do, s.key]), [["carry", "wait-7"], ["carry", "hand-abc-1"]]);
  // the same block in another project is not copied here: it waits in the Room
  assert.deepEqual(W.morningPlan(ws, { now: NOW, project: "q", find: (k) => there[k] ?? null }), []);
});

test("a block left on later comes back the next morning; an answered one stays settled", () => {
  const ws = [wait({ why: "review", n: 1, since: NOW - 2 * DAY }), wait({ why: "decision", n: 2, since: NOW - 2 * DAY })];
  const find = (k: string) => (k === "wait-1" ? { project: "p", asks: { later: "2026-11-16" } } : { project: "p", asks: { answer: { choice: "on it" } } });
  const steps = W.morningPlan(ws, { now: NOW, project: "p", find });
  assert.deepEqual(steps, [{ do: "carry", key: "wait-1", wait: ws[0], later: true }]);
});

test("a later block the session's start already carried back today is not carried a second time by the morning", () => {
  const ws = [wait({ why: "review", n: 1, since: NOW - 2 * DAY }), wait({ why: "decision", n: 2, since: NOW - 2 * DAY })];
  // startedSession (work/asks.ts) marked wait-1 with today as it carried it; wait-2 is still marked yesterday
  const find = (k: string) => ({ project: "p", asks: { later: k === "wait-1" ? "2026-11-17" : "2026-11-16" } });
  const steps = W.morningPlan(ws, { now: NOW, project: "p", find, day: "2026-11-17" });
  assert.deepEqual(steps.map((s) => s.key), ["wait-2"]);
});

test("the morning's day is kept only once every block is placed: one not placed is tried at the next session", async () => {
  let kept: string | undefined, fail = true;
  const order: string[] = [];
  const deps = {
    on: () => true, hour: () => 9, day: () => "2026-11-17", last: () => kept, keep: (d: string) => { order.push("keep"); kept = d; },
    mine: async () => person([wait({ why: "review", n: 1, since: NOW - 2 * DAY }), wait({ why: "decision", n: 2, since: NOW - 2 * DAY })]),
    project: async () => "p", find: () => null, holds: () => [], carry: () => {},
    compose: async (_p: string, _s: string, c: { id: string }) => {
      await new Promise((r) => setTimeout(r, 5));
      if (fail && c.id === "wait-2") throw new Error("not placed");
      order.push(c.id);
    },
  };
  assert.equal((await W.openMorning("s1", NOW, deps)).length, 2);
  assert.equal(kept, undefined, "a block not placed: the day is not kept");
  fail = false;
  assert.equal((await W.openMorning("s2", NOW, deps)).length, 2, "the next session opens the morning again");
  assert.equal(kept, "2026-11-17");
  assert.equal(order.at(-1), "keep", "kept after the places settle, never before");
  assert.deepEqual(await W.openMorning("s3", NOW, deps), [], "once kept, the morning is not opened again that day");
});

test("an issue's card asks on it · later · not mine, keyed by the issue", () => {
  const c = W.waitCard(wait({ why: "decision", n: 12, since: NOW - 3 * DAY, from: "" }), NOW);
  assert.equal(c.id, "wait-12");
  assert.deepEqual(c.asks.choices, ["on it", "later", "not mine"]);
  assert.deepEqual(c.asks.ref, { kind: "issue", id: "decision-12" });
  assert.equal(c.asks.about, 12);
  assert.match(c.asks.q, /3 days/);
});

const fakeGh = () => {
  const calls: string[][] = [];
  const gh = async (args: string[]) => {
    calls.push(args);
    if (args[0] === "issue" && args[1] === "view") return "a,c\n";
    if (args[0] === "api") return "c\n";
    return "";
  };
  return { calls, gh };
};
const writes = (calls: string[][]) => calls.filter((a) => !(a[0] === "api" || (a[0] === "issue" && a[1] === "view")));
const block = (ref: { kind: "issue" | "ask"; id: string }, from?: string) => ({ asks: { q: "x", choices: ["on it", "later", "not mine"], by: "s1", ref, ...(from ? { from: { login: from, agent: true } } : {}) } });

test("not mine under quiet posts nothing, unassigns nothing, sends nothing, and says what it did not send", async () => {
  const { calls, gh } = fakeGh();
  let declined = 0;
  const notMine = W.notMineOf({ quiet: () => true, me: () => "a", gh, decline: () => { declined++; return "declined"; } });
  const r = await notMine(block({ kind: "issue", id: "decision-12" }), "a");
  assert.equal(r.to, "nowhere");
  assert.match(r.said, /quiet \(SOL_QUIET\).*not sent: the comment on #12 naming c and the unassign/);
  const rv = await notMine(block({ kind: "issue", id: "review-13" }, "b"), "a");
  assert.equal(rv.to, "nowhere");
  const ra = await notMine(block({ kind: "ask", id: "q1" }, "b"), "a");
  assert.equal(ra.to, "nowhere");
  assert.deepEqual(writes(calls), []);
  assert.equal(declined, 0);
});

test("not mine, not quiet: a signed comment naming the assigner, then the unassign", async () => {
  const { calls, gh } = fakeGh();
  const r = await W.notMineOf({ quiet: () => false, me: () => "a", gh, decline: () => "declined" })(block({ kind: "issue", id: "decision-12" }), "a");
  assert.equal(r.to, "github");
  const w = writes(calls);
  assert.deepEqual(w.map((a) => a.slice(0, 3)), [["issue", "comment", "12"], ["issue", "edit", "12"]]);
  const body = w[0][w[0].indexOf("--body") + 1];
  assert.match(body, /@c: it goes back to you/);
  assert.match(body, /\n— a's agent$/);
  assert.deepEqual(w[1].slice(3), ["--remove-assignee", "a"]);
});

test("the switch: off unless set, on in one place, and off places nothing", async () => {
  delete process.env.SOL_MORNING_WAITS;
  writeFileSync(SETTINGS, "{}");
  settings.patchSettings({});
  assert.equal(settings.morningWaits(), false, "off unless set");
  settings.patchSettings({ morning: { waits: false } });
  assert.equal(settings.morningWaits(), false);
  let placed = 0, read = 0;
  const deps = {
    on: settings.morningWaits, hour: () => 9, day: () => "2026-11-17", last: () => undefined, keep: () => {},
    mine: async () => { read++; return person([wait({ why: "review", n: 1, since: NOW - 2 * DAY })]); },
    project: async () => "p", find: () => null, holds: () => [],
    carry: () => { placed++; }, compose: () => { placed++; },
  };
  assert.deepEqual(await W.openMorning("s1", NOW, deps), []);
  assert.equal(placed + read, 0);
  settings.patchSettings({ morning: { waits: true } });
  assert.equal((await W.openMorning("s1", NOW, deps)).length, 1);
  assert.equal(placed, 1);
  process.env.SOL_MORNING_WAITS = "off";
  assert.equal(settings.morningWaits(), false);
  delete process.env.SOL_MORNING_WAITS;
});

test("the night pass's line: each person's waits older than a day, most first", () => {
  const p = (login: string, n: number) => ({ ...person(Array.from({ length: n }, (_, i) => wait({ why: "review", n: i + 1, since: NOW - 2 * DAY }))), login });
  assert.equal(W.waitedLine({ people: [p("b", 1), p("a", 2), p("c", 0)] }, NOW), "waited all day: a 2, b 1");
  assert.equal(W.waitedLine({ people: [p("a", 0)] }, NOW), "waited all day: nobody");
});
