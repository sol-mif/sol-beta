// The per-tester list (#1355, for Isaac's console, #134): team/testers.ts. The cloud's rows kept to the numbers and words
// expected, each tester's version placed on the releases and marked when it is the newest beta, the cloud's refusals said
// plainly, and the reader marked as naming people (its members gate strict, as analytics). No record, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "sol-testers-"));
const FILE = join(DIR, "team.json");
writeFileSync(FILE, JSON.stringify({ me: { login: "w0ngtap", name: "Isaac" }, repos: ["sol-mif/sol-dev"] }));
process.env.SOL_TEAM = FILE;
process.env.SOL_TEAM_OFFLINE = "1";
const TT = await import("../src/team/teamtool.ts");
const X = await import("../src/team/testers.ts");
const A = await import("../src/team/analytics.ts");

const ROW = {
  tester: "t_abc123xyz9", who: "frank", user: "franktsai", email: "frank@example.com", firstDay: "2026-10-27", lastDay: "2026-11-15", days: 2, agreed: "2026-10-27", sol: "bbbb222",
  name: null, partner: null, steps: null,
  week: {
    turns: 3, seat: { claude: 1, codex: 1, none: 1 }, mode: { home: 1, work: 1, cowork: 1 }, face: { window: 4, notch: 1, phone: 1 }, errors: 1, faceBroken: 1,
    claude: { cli: { prompts: 4, sessions: 2, input: 100, output: 50, cache_read: 1000, cache_write: 10 } },
    codex: { sessions: 3, input: 30, output: 20, cache_read: 5 },
  },
  plan: { claude: "claude_max", codex: "plus" },
  apps: { claude: true, cursor: false },
};
const LINE = {
  releases: [
    { tag: "dev-2026-11-10", sha: "aaaa1111ffff", at: "2026-11-10T13:00:00Z", kind: "dev" as const, beta: true, changes: [] },
    { tag: "dev-2026-11-14", sha: "bbbb2222eeee", at: "2026-11-14T13:00:00Z", kind: "dev" as const, beta: true, changes: [] },
    { tag: "dev-2026-11-16", sha: "dddd4444cccc", at: "2026-11-16T13:00:00Z", kind: "dev" as const, beta: false, changes: [] },
    { tag: "next", sha: "", at: "2026-11-17T13:00:00Z", kind: "next" as const, beta: false, changes: [] },
  ],
  spots: { cccc3333: "main" },
};

test("the rows kept to what the console shows; a version on the newest beta is marked, others are not", () => {
  const body = { days: 7, testers: [
    ROW,
    { ...ROW, tester: "t_def456uvw0", who: "isaac", user: "Isaac W", email: "not an email", sol: "aaaa111", plan: { claude: "a sentence with spaces", extra: "x" }, apps: { "bad key": true, zed: "yes", warp: true }, week: { turns: -4, claude: { "../x": { prompts: 1 } } } },
    { tester: "not a code", who: "x" },
    "nothing",
  ] };
  const got = X.testersOf(body, LINE, new Date("2026-11-16T12:00:00Z"))!;
  assert.equal(got.beta, "dev-2026-11-14", "the newest release that reached beta; a dev release not yet passed is not it");
  assert.equal(got.testers.length, 2, "a row that is not a tester's is dropped");
  const [frank, isaac] = got.testers;
  assert.deepEqual({ release: frank.release, latestBeta: frank.latestBeta }, { release: "dev-2026-11-14", latestBeta: true });
  assert.deepEqual({ release: isaac.release, latestBeta: isaac.latestBeta }, { release: "dev-2026-11-10", latestBeta: false });
  const ahead = X.testersOf({ testers: [{ ...ROW, sol: "dddd444" }, { ...ROW, sol: "cccc333" }, { ...ROW, sol: "eeee555" }] }, LINE, new Date())!.testers;
  assert.deepEqual(ahead.map((t) => [t.release, t.latestBeta]), [["dev-2026-11-16", true], ["main", true], ["", false]],
    "a dev release past the newest beta, and main past the last release, are not behind; a build of its own is not known to be");
  assert.deepEqual(frank.week, ROW.week);
  assert.deepEqual(frank.plan, ROW.plan);
  assert.equal(isaac.user, "", "a user that is not a word is not shown");
  assert.deepEqual(isaac.plan, {}, "a plan word that is not a word, or a key not on the list, is not shown");
  assert.deepEqual(isaac.apps, { warp: true });
  assert.equal(isaac.week.turns, 0);
  assert.deepEqual(isaac.week.claude, {});
  assert.deepEqual([frank.name, frank.partner, frank.steps], [null, null, null], "the columns not counted yet");
  assert.deepEqual([frank.email, isaac.email], ["frank@example.com", null], "the email the tester signed in with (#1607); a value that is not one is not shown");
  // no releases: the rows still come, nobody marked
  const bare = X.testersOf(body, null, new Date())!;
  assert.equal(bare.beta, "");
  assert.equal(bare.testers.some((t) => t.latestBeta), false);
  assert.equal(X.testersOf({ nope: 1 }, LINE, new Date()), null);
  const cut = X.testersOf({ total: 1500, testers: [ROW] }, LINE, new Date())!;
  assert.equal(cut.total, 1500);
  assert.match(cut.note!, /newest 1 of 1500/, "a list the cloud cut says so");
  assert.equal(got.note, undefined);
  // the cloud's own note (#1555: read from Supabase) comes through, with a cut beside it; anything else it says does not
  const sb = X.testersOf({ total: 1500, testers: [ROW], note: "read from Supabase: seat, face are not kept there yet" }, LINE, new Date())!;
  assert.match(sb.note!, /^read from Supabase: seat, face are not kept there yet; the newest 1 of 1500/);
  assert.equal(X.testersOf({ total: 1, testers: [ROW], note: "<b>see /Users/x</b>" }, LINE, new Date())!.note, undefined);
});

test("the reader: names people, asks the cloud with my ticket, keeps it two minutes, says a refusal plainly", async () => {
  let t = Date.parse("2026-11-16T12:00:00Z"), asks = 0;
  let answer: { status: number; body: unknown } = { status: 200, body: { days: 7, testers: [ROW] } };
  let ticket = "ticket-isaac";
  X.useTesters({ ticket: async () => ticket, testers: async () => { asks++; return answer; }, releases: async () => LINE, now: () => new Date(t) });
  assert.equal(TT.namesPeople("testers"), true, "the per-tester list names people: its members gate is strict");
  const read = TT.readerOf("testers")!;
  const ctx = { key: "k", zone: "", refresh: false };
  const got = await read(ctx) as { testers: { latestBeta: boolean }[] };
  assert.equal(got.testers[0].latestBeta, true);
  await read(ctx);
  assert.equal(asks, 1, "kept two minutes");
  await read({ ...ctx, refresh: true });
  assert.equal(asks, 2, "read again when asked");
  t += A.CACHE_MS;
  answer = { status: 403, body: { error: "the counts are for the SOL project's members only" } };
  await assert.rejects(read(ctx), /readers list/);
  ticket = "";
  await assert.rejects(read(ctx), /sign in to Sol's cloud/);
  ticket = "ticket-isaac";
  answer = { status: 200, body: "garbage" };
  await assert.rejects(read(ctx), /not the testers/);
});
