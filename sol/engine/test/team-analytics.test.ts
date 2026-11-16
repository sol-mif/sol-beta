// Analytics (#437, E2 of #413): the second team tool (team/analytics.ts). The cloud's track summary kept to numbers and
// words, each version placed on the timeline's releases, the cloud's refusals said plainly; and its gate, strict
// because track data names people: the org's members a minute old at most, and a failed read shuts it, never the list
// from before (team/members.ts `strict`). No record, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "sol-analytics-"));
const FILE = join(DIR, "team.json");
writeFileSync(FILE, JSON.stringify({ me: { login: "marcocyl04-ux", name: "Marco" }, repos: ["sol-mif/sol-dev"] }));
process.env.SOL_TEAM = FILE;
process.env.SOL_TEAM_OFFLINE = "1";
const B = await import("../src/team/blocks.ts");
const TT = await import("../src/team/teamtool.ts");
const A = await import("../src/team/analytics.ts");
const F = await import("../src/team/folds.ts");
const { membersOf, STRICT_TTL } = await import("../src/team/members.ts");
const { releaseOfCommit } = await import("../src/team/timeline.ts");

const SUMMARY = {
  window: { days: 30, from: "2026-10-01", to: "2026-10-30" },
  total: { events: 60, testers: 3 },
  byDay: [{ day: "2026-10-28", events: 20, testers: 2 }, { day: "2026-10-30", events: 40, testers: 3 }],
  byName: [{ name: "turn.done", events: 30, testers: 3 }, { name: "engine.up", events: 10, testers: 3 }, ...Array.from({ length: 9 }, (_, i) => ({ name: `e${i}`, events: 2, testers: i % 3 }))],
  byMode: [{ mode: "home", events: 40, testers: 3 }, { mode: "cowork", events: 20, testers: 2 }],
  bySol: [{ sol: "aaaa1111", events: 20, testers: 2, latest: 0 }, { sol: "bbbb222", events: 30, testers: 2, latest: 2 }, { sol: "cccc333", events: 6, testers: 1, latest: 1 }, { sol: "9999999", events: 4, testers: 1, latest: 0 }],
  byPart: [{ part: "memory", events: 6, testers: 2 }, { part: "goal", events: 2, testers: 1 }],
  newByDay: [{ day: "2026-10-28", testers: 2 }],
  activeDays: [{ span: "1", testers: 1 }, { span: "2-3", testers: 2 }, { span: "4-7", testers: 0 }, { span: "8+", testers: 0 }],
};
const LINE = {
  releases: [
    { tag: "dev-2026-10-27", sha: "aaaa1111ffff", at: "2026-10-27T13:00:00Z", kind: "dev" as const },
    { tag: "dev-2026-10-29", sha: "bbbb2222eeee", at: "2026-10-29T13:00:00Z", kind: "dev" as const },
    { tag: "next", sha: "", at: "2026-10-30T13:00:00Z", kind: "next" as const },
  ],
  spots: { cccc3333: "main" },
};

test("the summary kept to what the page draws: never a tester's code, a name or a field the page has no use for", () => {
  const s = A.cleanSummary({ ...SUMMARY, byTester: [{ tester: "t_abc123xyz9", events: 3, days: 1 }], who: "frank",
    byName: [{ name: "a sentence with spaces", events: 1, testers: 1 }, { name: "ok.name", events: 1, testers: 1, email: "x@y" }],
    byDay: [{ day: "not a day", events: 1, testers: 1 }, { day: "2026-10-28", events: -4, testers: "3" }] })!;
  const text = JSON.stringify(s);
  for (const x of ["t_abc123xyz9", "frank", "x@y", "sentence", "byTester"]) assert.equal(text.includes(x), false, `never ${x}`);
  assert.deepEqual(s.byName, [{ name: "ok.name", events: 1, testers: 1 }]);
  assert.deepEqual(s.byDay, [{ day: "2026-10-28", events: 0, testers: 0 }]);
  assert.equal(A.cleanSummary({ total: {} }), null);
  assert.equal(A.cleanSummary(null), null);
});

test("the page's data: every day of the window, eight names and the rest as other, each version on its release", () => {
  const a = A.analyticsOf(A.cleanSummary(SUMMARY)!, LINE, new Date("2026-10-30T15:00:00Z"));
  assert.equal(a.days.length, 30);
  assert.deepEqual(a.days.at(-3), { day: "2026-10-28", events: 20, testers: 2, new: 2 });
  assert.deepEqual(a.days.at(-2), { day: "2026-10-29", events: 0, testers: 0, new: 0 }, "a day with nothing is 0, not a gap");
  assert.equal(a.names.length, A.TOP_NAMES + 1);
  assert.deepEqual(a.names.at(-1), { name: "other", events: 6, testers: 2 });
  // newest release first; main (past the last) above it; a build of its own last
  assert.deepEqual(a.versions.map((v) => [v.release, v.sols, v.testers]), [
    ["main", ["cccc333"], 1], ["dev-2026-10-29", ["bbbb222"], 2], ["dev-2026-10-27", ["aaaa1111"], 0], ["", ["9999999"], 0]]);
  assert.equal(a.versions[1].at, "2026-10-29T13:00:00Z");
  assert.deepEqual(a.releases.map((r) => r.tag), ["dev-2026-10-27", "dev-2026-10-29"], "the next one is no release yet");
  assert.deepEqual(a.parts, SUMMARY.byPart);
  // no timeline: the versions stand unplaced, together
  const b = A.analyticsOf(A.cleanSummary(SUMMARY)!, null, new Date());
  assert.deepEqual(b.versions.map((v) => v.release), [""]);
  assert.equal(b.versions[0].testers, 3);
});

test("a commit as its release: made at it, else its spot on main, else none", () => {
  assert.equal(releaseOfCommit("aaaa111", LINE.releases, LINE.spots), "dev-2026-10-27");
  assert.equal(releaseOfCommit("cccc333", LINE.releases, LINE.spots), "main");
  assert.equal(releaseOfCommit("1234567", LINE.releases, LINE.spots), null);
  assert.equal(releaseOfCommit("", LINE.releases, LINE.spots), null);
  assert.equal(releaseOfCommit("../x", LINE.releases, LINE.spots), null);
});

test("the cloud's refusals in words a person can act on", () => {
  assert.match(A.refusalOf(403, "the counts are for the SOL project's members only"), /readers list, and your Sol name is not on it/);
  assert.match(A.refusalOf(403, "this hub takes its own tickets only: sign in to it again"), /sign in to Sol's cloud/);
  assert.match(A.refusalOf(404), /next update/);
  assert.match(A.refusalOf(0), /did not answer/);
});

test("the reader: two gates before any count (the members, strict; then the cloud's), kept two minutes past them", async () => {
  B.setShipped(null);
  const own = B.shipped();
  const on = B.blocksIn({ analytics: { on: true } }, own), off = B.blocksIn({}, own);
  let t = Date.parse("2026-10-30T15:00:00Z"), asks = 0;
  let answer: { status: number; body: unknown } = { status: 200, body: SUMMARY };
  let ticket = "ticket-frank";
  const sent: string[] = [];
  A.useAnalytics({ ticket: async () => ticket, summary: async (tk) => { asks++; sent.push(tk); return answer; }, releases: async () => LINE, now: () => new Date(t) });
  assert.equal(TT.namesPeople("analytics"), true, "track data names people");
  F.useFolds(async () => ({ lines: [] }));
  assert.equal(TT.namesPeople("folds"), false);
  const strictness: boolean[] = [];
  const members = (list: string[] | null) => async (strict: boolean) => { strictness.push(strict); return list; };
  const ctx = { key: "k", zone: "", refresh: false };

  let r = await TT.openTool({ id: "analytics", views: off, me: "franktsai2008-eng", members: members(["franktsai2008-eng"]), ctx });
  assert.ok("error" in r && r.gate === "off");
  r = await TT.openTool({ id: "analytics", views: on, me: "stranger", members: members(["franktsai2008-eng"]), ctx });
  assert.ok("error" in r && r.gate === "members" && !("data" in r));
  r = await TT.openTool({ id: "analytics", views: on, me: "franktsai2008-eng", members: members(null), ctx });
  assert.ok("error" in r && r.gate === "unknown", "the members could not be read: shut");
  assert.equal(asks, 0, "nothing is asked of the cloud before the members gate lets someone in");
  assert.deepEqual(strictness, [true, true], "the analytics gate asks for the strict members read");

  r = await TT.openTool({ id: "analytics", views: on, me: "franktsai2008-eng", members: members(["franktsai2008-eng"]), ctx });
  assert.ok("data" in r);
  assert.equal((r.data as { total: { events: number } }).total.events, 60);
  assert.equal(asks, 1);
  // the cache answers only after the gate: a stranger still gets the refusal, never the kept counts
  r = await TT.openTool({ id: "analytics", views: on, me: "stranger", members: members(["franktsai2008-eng"]), ctx });
  assert.ok("error" in r && !("data" in r));
  r = await TT.openTool({ id: "analytics", views: on, me: "franktsai2008-eng", members: members(["franktsai2008-eng"]), ctx });
  assert.ok("data" in r);
  assert.equal(asks, 1, "kept two minutes");
  t += A.CACHE_MS;
  // the cloud's own gate: refused there, refused here, in words, and nothing kept is shown
  answer = { status: 403, body: { error: "the counts are for the SOL project's members only" } };
  r = await TT.openTool({ id: "analytics", views: on, me: "franktsai2008-eng", members: members(["franktsai2008-eng"]), ctx });
  assert.ok("error" in r && !("data" in r));
  assert.match((r as { error: string }).error, /readers list/);
  answer = { status: 200, body: SUMMARY };
  r = await TT.openTool({ id: "analytics", views: on, me: "franktsai2008-eng", members: members(["franktsai2008-eng"]), ctx: { ...ctx, refresh: true } });
  assert.ok("data" in r);
  // another sign-in on the cloud: the kept counts are not theirs, the cloud is asked with their ticket
  const before = asks;
  ticket = "ticket-isaac";
  answer = { status: 403, body: { error: "the counts are for the SOL project's members only" } };
  r = await TT.openTool({ id: "analytics", views: on, me: "franktsai2008-eng", members: members(["franktsai2008-eng"]), ctx });
  assert.ok("error" in r && !("data" in r), "a new ticket never gets the counts kept for the old one");
  assert.equal(asks, before + 1);
  assert.equal(sent.at(-1), "ticket-isaac");
  ticket = "";
  r = await TT.openTool({ id: "analytics", views: on, me: "franktsai2008-eng", members: members(["franktsai2008-eng"]), ctx });
  assert.ok("error" in r);
  assert.match((r as { error: string }).error, /sign in to Sol's cloud/, "no ticket: sign in");
  assert.equal(asks, before + 1, "no ticket: nothing sent");
});

test("members, strict (#437): a minute old at most, and a failed read is no list, never the one from before", async () => {
  let t = 0, reads = 0, fail = false, out = "frank\nmarco\n", org = "sol-mif";
  const m = membersOf({ gh: async () => { reads++; if (fail) throw new Error("gh down"); return out; }, org: () => org, seen: () => [], now: () => t });
  assert.deepEqual(await m.strict(), ["frank", "marco"]);
  assert.equal(reads, 1);
  t = STRICT_TTL - 1;
  await m.strict();
  assert.equal(reads, 1, "within a minute: the list just read");
  // frank is taken off the org; GitHub then fails. The ten-minute gate keeps the old list, the strict one says nothing
  t = STRICT_TTL + 1;
  fail = true;
  assert.equal(await m.strict(), null);
  assert.deepEqual(await m.refresh(), ["frank", "marco"], "the plain read keeps the old list (Cowork's strip, not a gate on people's data)");
  fail = false; out = "marco\n";
  assert.deepEqual(await m.strict(), ["marco"]);
  assert.deepEqual(m.now(), ["marco"], "a strict read is the newest list for everyone");
  // no org, an empty org, the org changed while it was read: none
  org = "";
  assert.equal(await m.strict(), null);
  org = "sol-mif"; out = ""; t += STRICT_TTL + 1;
  assert.equal(await m.strict(), null);
  const m2 = membersOf({ gh: async () => { org = "other"; return "marco\n"; }, org: () => org, seen: () => [], now: () => 0 });
  org = "sol-mif";
  assert.equal(await m2.strict(), null);
});
