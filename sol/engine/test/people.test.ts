// People (#1297): the read's shape from a fixture of GitHub's JSON (as `gh issue list` / `gh pr list --json` give it)
// and a reach thread: holds, waits, the agent in flight, landed today; the person whose Sol it is first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { peopleRead, whoOf, dayStart, openIssues, keeper, namesIssue, addSpan, minutesOf, othersIssue, dayKey, TURN_MAX, MINUTE, type PeopleRead, type GhIssue, type GhPr } from "../src/team/people.ts";
import { entryOf, holdsOf } from "../src/team/reach.ts";

const NOW = Date.UTC(2026, 10, 16, 18);           // 13:00 in New York
const TODAY = dayStart(NOW, "America/New_York");  // 05:00Z
const iso = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const CODEOWNERS = "# label cowork: the team's side\n/sol/mac/src/cowork/   @a\n\n# label marketing: reach\n# leads: @c\n";

const open: GhIssue[] = [
  { number: 12, title: "cowork: the card.", assignees: [{ login: "a" }], labels: [{ name: "cowork" }, { name: "feature" }, { name: "now" }], createdAt: iso(30) },
  { number: 13, title: "the old tail", assignees: [{ login: "a" }], labels: [{ name: "cowork" }, { name: "bug" }], createdAt: iso(90) },
  { number: 20, title: "marketing: which price", assignees: [], labels: [{ name: "marketing" }, { name: "decision" }], createdAt: iso(5) },
  { number: 21, title: "the relay", url: "https://github.com/o/r/issues/21", assignees: [{ login: "b" }], labels: [{ name: "base" }, { name: "feature" }, { name: "now" }], createdAt: iso(10) },
];
const prs: GhPr[] = [
  { number: 40, title: "cowork: the card face", body: "Fixes #12", author: { login: "a" }, isDraft: false, createdAt: iso(2), reviewRequests: [{ login: "b" }], headRefName: "a/cowork-card-12" },
  { number: 41, title: "a draft", author: { login: "b" }, isDraft: true, createdAt: iso(1), reviewRequests: [{ login: "a" }], headRefName: "b/x-99" },
];
const merged: GhPr[] = [
  { number: 38, title: "the gate", author: { login: "b" }, mergedAt: iso(3) },
  { number: 37, title: "yesterday's", author: { login: "b" }, mergedAt: iso(20) },
];
const closed: GhIssue[] = [{ number: 9, title: "the stamp", assignees: [{ login: "c" }], closedAt: iso(4) }];
const m = (from: string, p: Record<string, unknown>, at: number) => entryOf({ ...p, from: { login: from }, at })!;
const thread = [
  m("b", { type: "ask", id: "ask0000001", to: "a", question: "which release do you run?" }, NOW - 600_000),
  m("b", { type: "ask", id: "ask0000002", to: "c", question: "answered already" }, NOW - 900_000),
  m("c", { type: "answer", id: "ans0000001", re: "ask0000002", to: "b", text: "dev" }, NOW - 800_000),
  m("b", { type: "hand", id: "hand000001", to: "a", issue: 21, what: "the relay's tail", why: "your area" }, NOW - 500_000),
];

test("whoOf: the rhythm's dev and beta, then CODEOWNERS' leads, each once", () => {
  assert.deepEqual(whoOf({ dev: ["a"], beta: ["b"] }, CODEOWNERS), ["a", "b", "c"]);
  assert.deepEqual(whoOf(null, CODEOWNERS), ["a", "c"]);
});

test("dayStart: the team's day, in its own zone", () => {
  assert.equal(new Date(TODAY).toISOString(), "2026-11-16T05:00:00.000Z");
});

test("peopleRead: one shape, every row from its source", () => {
  const r = peopleRead({ logins: ["a", "b", "c"], names: { a: "Ada" }, me: "b", tools: true, codeowners: CODEOWNERS,
    open, prs, merged, closed, thread, holds: holdsOf(thread), today: TODAY, now: NOW });
  assert.equal(r.at, NOW);
  assert.deepEqual(r.people.map((p) => p.login), ["b", "a", "c"], "me first, then by name");
  const [b, a, c] = r.people;
  assert.equal(a.name, "Ada");

  // holds: the one `now` issue, with its kind and area; the rest given to a are open
  assert.deepEqual(a.holds && [a.holds.n, a.holds.title, a.holds.kind, a.holds.area, !!a.holds.now], [12, "the card", "feature", "cowork", true]);
  assert.deepEqual(a.open.map((h) => h.n), [13]);
  // minutes: never counted by the fold (parts/people.ts counts the reader's own); null, never 0
  assert.deepEqual(r.people.map((p) => p.minutes), [{ today: null, week: null }, { today: null, week: null }, { today: null, week: null }]);

  // waits: a's are the open ask and the open hand (a's review is asked only on a draft, which never waits)
  assert.deepEqual(a.waits.map((w) => [w.why, w.from, w.id]), [["hand", "b", "hand000001"], ["ask", "b", "ask0000001"]]);
  assert.equal(a.waits[0].n, 21);
  assert.equal(a.waits[0].url, "https://github.com/o/r/issues/21", "a hand's issue gets the repository's link");
  assert.equal(r.repo, "https://github.com/o/r");
  // b waits on: the review of #40
  assert.deepEqual(b.waits.map((w) => [w.why, w.n, w.from]), [["review", 40, "a"]]);
  // c leads marketing: the open decision given to nobody waits on c; an answered ask does not
  assert.deepEqual(c.waits.map((w) => [w.why, w.n]), [["decision", 20]]);

  // the agent in flight: a's PR #40 names #12, so #12 is not "building" too; a is answering b's ask
  assert.deepEqual(a.agent.inFlight.map((f) => f.state).sort(), ["answering", "pr"]);
  assert.match(a.agent.inFlight.find((f) => f.state === "answering")!.title, /^answering b: which release/);
  // b's draft is in flight; b's `now` issue with no PR naming it is being built
  assert.deepEqual(b.agent.inFlight.map((f) => [f.state, f.n]).sort(), [["building", 21], ["pr", 41]]);

  // landed today: b's #38 (yesterday's #37 is not), c's closed #9
  assert.deepEqual(b.landed, [{ pr: 38, title: "the gate", when: NOW - 3 * 3600_000 }]);
  assert.deepEqual(c.landed.map((x) => x.n), [9]);
  assert.equal(c.holds, null);
});

test("peopleRead: a person with nothing is still a card, holds nothing, every list empty, minutes not counted", () => {
  const r = peopleRead({ logins: ["c"], me: "c", tools: false, codeowners: "", open: [], prs: [], merged: [], closed: [], thread: [], holds: [], today: TODAY, now: NOW });
  assert.deepEqual(r, { at: NOW, me: "c", tools: false, repo: "", people: [{ login: "c", name: "c", holds: null, open: [], waits: [], agent: { inFlight: [] }, landed: [], minutes: { today: null, week: null } }] });
});

test("openIssues: every open issue, the limit far above the count (457 on 2026-11-16), so the oldest are not dropped", () => {
  const args = openIssues("number,title");
  assert.deepEqual(args.slice(0, 6), ["issue", "list", "--state", "open", "--json", "number,title"]);
  assert.ok(Number(args[args.indexOf("--limit") + 1]) >= 1000);
});

// the keeper: a read from a stand-in for GitHub, the clock in the test's hands
const readAt = (at: number, me = "a"): PeopleRead => ({ at, me, tools: true, repo: "", people: [] });
function github() {
  const calls: { done: (r: PeopleRead) => void; fail: (e: Error) => void }[] = [];
  const fresh = () => new Promise<PeopleRead>((done, fail) => { calls.push({ done, fail }); });
  return { calls, fresh };
}

test("keeper: a read is kept KEEP ms, then GitHub is read again; one read at a time", async () => {
  let clock = 1000;
  const g = github();
  const k = keeper(g.fresh, { keep: 120_000, now: () => clock });
  const one = k.read(), two = k.read();
  assert.equal(g.calls.length, 1, "two asks, one read");
  g.calls[0].done(readAt(1000));
  assert.equal((await one).at, 1000);
  assert.equal((await two).at, 1000);
  clock += 60_000;
  assert.equal((await k.read()).at, 1000, "kept under two minutes");
  assert.equal(g.calls.length, 1);
  clock += 61_000;
  const three = k.read();
  assert.equal(g.calls.length, 2, "older than two minutes: read again");
  g.calls[1].done(readAt(clock));
  assert.equal((await three).at, clock);
});

test("keeper: a drop makes the next ask read again", async () => {
  const g = github();
  const k = keeper(g.fresh, { keep: 120_000, now: () => 1000 });
  const one = k.read(); g.calls[0].done(readAt(1000)); await one;
  k.drop();
  const two = k.read();
  assert.equal(g.calls.length, 2);
  g.calls[1].done(readAt(1001));
  assert.equal((await two).at, 1001);
});

test("keeper: a drop while a read is in flight is not lost (the race on #1318)", async () => {
  const g = github();
  const k = keeper(g.fresh, { keep: 120_000, now: () => 1000 });
  const before = k.read();        // GitHub is read …
  k.drop();                       // … and a comment is heard meanwhile
  const after = k.read();
  assert.equal(g.calls.length, 2, "an ask after the drop does not wait on the read from before it");
  g.calls[0].done(readAt(900));
  assert.equal((await before).at, 900, "the ask from before gets its own read");
  const again = k.read();
  assert.equal(g.calls.length, 2, "the read after the drop is still in flight: joined, not a third");
  g.calls[1].done(readAt(1000));
  assert.equal((await after).at, 1000);
  assert.equal((await again).at, 1000);
  assert.equal((await k.read()).at, 1000, "the read from after the drop stands");
  assert.equal(g.calls.length, 2);
});

test("keeper: the read from before a drop, landing last, never stands", async () => {
  const g = github();
  const k = keeper(g.fresh, { keep: 120_000, now: () => 1000 });
  void k.read(); k.drop(); void k.read();
  g.calls[1].done(readAt(1000));
  await new Promise((r) => setImmediate(r));
  g.calls[0].done(readAt(900));   // the older one lands after
  await new Promise((r) => setImmediate(r));
  assert.equal((await k.read()).at, 1000);
  assert.equal(g.calls.length, 2);
});

test("keeper: a failed read gives the last good one with its own time and the reason; with none, the failure", async () => {
  let clock = 1000;
  const g = github();
  const k = keeper(g.fresh, { keep: 120_000, now: () => clock });
  const none = k.read();
  g.calls[0].fail(new Error("gh: not logged in\nmore"));
  await assert.rejects(none, /not logged in/);
  const good = k.read(); g.calls[1].done(readAt(clock)); await good;
  clock += 200_000;
  const bad = k.read();
  g.calls[2].fail(new Error("timed out after 30s"));
  const r = await bad;
  assert.equal(r.at, 1000, "the last good read, at its own time");
  assert.equal(r.failed, "timed out after 30s");
  const next = k.read();
  assert.equal(g.calls.length, 4, "a failure is not kept: the next ask reads again");
  g.calls[3].done(readAt(clock));
  assert.equal((await next).failed, undefined);
});

test("a PR names an issue by #n or its branch's -n, never a bare number (\"12 files\" names nothing)", () => {
  assert.equal(namesIssue({ title: "touch 12 files", body: "12 of them" }, 12), false);
  assert.equal(namesIssue({ title: "the card", body: "Fixes #12." }, 12), true);
  assert.equal(namesIssue({ title: "see #123", body: "" }, 12), false, "#123 is not #12");
  assert.equal(namesIssue({ title: "x", headRefName: "a/cowork-card-12" }, 12), true);
  assert.equal(namesIssue({ title: "x", headRefName: "a/cowork-card-112" }, 12), false);
  // in the read: a's `now` #12 is building while no PR of a's names it, whatever numbers its title carries
  const r = peopleRead({ logins: ["a"], me: "a", tools: true, codeowners: "", today: TODAY, now: NOW, thread: [], holds: [], merged: [], closed: [],
    open: [open[0]], prs: [{ number: 50, title: "moves 12 files", author: { login: "a" }, createdAt: iso(1), headRefName: "a/x-99" }] });
  assert.ok(r.people[0].agent.inFlight.some((f) => f.state === "building" && f.n === 12));
});

test("holds is one issue: the `now` issue a live Work run names on the reader's Sol, else the newest updated `now`; the rest are open", () => {
  const iss = (n: number, now: boolean, upd: number): GhIssue => ({ number: n, title: `t${n}`, assignees: [{ login: "a" }, ...(n === 3 ? [{ login: "b" }] : [])],
    labels: [{ name: "cowork" }, ...(now ? [{ name: "now" }] : [])], createdAt: iso(100 - n), updatedAt: iso(upd) });
  const many = [iss(1, true, 5), iss(2, true, 1), iss(3, true, 9), iss(4, false, 0)];
  const read = (me: string, running?: number[]) => peopleRead({ logins: ["a", "b"], me, tools: true, codeowners: "", today: TODAY, now: NOW,
    thread: [], holds: [], merged: [], closed: [], prs: [], open: many, running });
  const a = (r: ReturnType<typeof read>) => r.people.find((p) => p.login === "a")!;
  assert.equal(a(read("a")).holds?.n, 2, "no run: the most recently updated `now` issue");
  assert.equal(a(read("a", [9, 3])).holds?.n, 3, "my run's issue, when it is a `now` issue given to me");
  assert.equal(a(read("a", [4])).holds?.n, 2, "a run on an issue without `now` holds nothing by itself");
  assert.equal(a(read("b", [3])).holds?.n, 2, "another's Sol: this Sol's runs say nothing of a");
  assert.deepEqual(a(read("a", [3])).open.map((h) => h.n).sort(), [1, 2, 4], "every other one is open");
  assert.deepEqual(a(read("a", [3])).agent.inFlight.filter((f) => f.state === "building").map((f) => f.n), [3], "only the held one is being built, not every `now`");
  assert.equal(read("a").people.find((p) => p.login === "b")!.holds?.n, 3, "b's own `now`");
});

test("coordination minutes: a turn counts only on an issue given to others and not to me", () => {
  assert.equal(othersIssue(["b"], "a"), true);
  assert.equal(othersIssue(["b", "A"], "a"), false, "mine too: not coordination");
  assert.equal(othersIssue([], "a"), false, "given to nobody: not another person's");
  assert.equal(othersIssue(["b"], ""), false, "no me known: nothing counted");
});

test("coordination minutes: distinct minutes per team day; two runs at once count a minute once; the week is seven days", () => {
  const Z = "America/New_York";
  const at = (h: number, m = 0) => Date.UTC(2026, 10, 16, h, m);   // 2026-11-16, 13:00Z is 08:00 in New York
  let k = addSpan({ days: {} }, at(14, 0), at(14, 9, ), Z);          // 14:00–14:09: ten minutes touched
  assert.deepEqual(minutesOf(k, at(18), Z), { today: 10, week: 10 });
  k = addSpan(k, at(14, 5), at(14, 14), Z);                           // another run overlapping: five new minutes
  assert.equal(minutesOf(k, at(18), Z).today, 15);
  k = addSpan(k, Date.UTC(2026, 10, 14, 15), Date.UTC(2026, 10, 14, 15, 1), Z);   // two days before: in the week, not today
  assert.deepEqual(minutesOf(k, at(18), Z), { today: 15, week: 17 });
  assert.deepEqual(minutesOf(k, Date.UTC(2026, 10, 23, 18), Z), { today: 0, week: 0 }, "a week on, nothing of it");
  assert.deepEqual(minutesOf(null, at(18), Z), { today: 0, week: 0 }, "nothing counted yet on my Sol: 0, a count");
  assert.equal(dayKey(Date.UTC(2026, 10, 17, 3), Z), "2026-11-16", "the team's day, not UTC's");
});

test("coordination minutes: a turn whose start was lost adds at most TURN_MAX; a backwards span adds nothing; the oldest days go", () => {
  const Z = "UTC", end = Date.UTC(2026, 10, 16, 23);
  const k = addSpan({ days: {} }, end - 20 * 3600_000, end, Z);
  assert.equal(minutesOf(k, end, Z).today, TURN_MAX / MINUTE + 1);
  assert.deepEqual(addSpan({ days: {} }, end, end - 1, Z), { days: {} });
  let many: ReturnType<typeof addSpan> = { days: {} };
  for (let d = 1; d <= 12; d++) many = addSpan(many, Date.UTC(2026, 10, d, 12), Date.UTC(2026, 10, d, 12), Z);
  assert.deepEqual(Object.keys(many.days).sort(), ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"]);
});
