// Team tools (#436, E1 of #413): a team block of kind "tool" that says its page, what it reads and from where, its
// owner and the members gate (team/teamtool.ts, by defineKind, nothing in blocks.ts changed); the engine refuses anyone
// who is not one of the project's members, and a tool that is off; the first one, this week's folds (team/folds.ts),
// reads the review's words from the project's feed. No record, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "sol-teamtools-"));
const FILE = join(DIR, "team.json");
writeFileSync(FILE, JSON.stringify({ me: { login: "marcocyl04-ux", name: "Marco" }, repos: ["sol-mif/sol-dev"] }));
process.env.SOL_TEAM = FILE;
process.env.SOL_TEAM_OFFLINE = "1";
const B = await import("../src/team/blocks.ts");
const TT = await import("../src/team/teamtool.ts");
const F = await import("../src/team/folds.ts");
const Feed = await import("../src/team/feed.ts");

const READS = [{ what: "the review session's words", from: "the project's feed" }];
const tool = (id: string, w: Record<string, unknown> = { page: "folds", reads: READS, owner: "marcocyl04-ux", gate: "members" }) =>
  ({ id, kind: "tool", name: id, shows: "", does: [], agents: [], start: "off", with: w });

test("the kind tool, given its fields by defineKind: Sol's own tools as they were, a team tool must say what it reads and who may open it", () => {
  assert.equal(B.kindOf("tool")?.clean, TT.cleanTool);   // this file's, not the core's
  assert.deepEqual(TT.cleanTool({}), {});              // the calendar, decisions, polls, settings: nothing more
  assert.deepEqual(B.cleanBlock({ id: "calendar", kind: "tool", name: "the calendar", start: "on" })?.with, undefined);
  const ok = B.cleanBlock(tool("folds"));
  assert.deepEqual(ok?.with, { page: "folds", reads: READS, owner: "marcocyl04-ux", gate: "members" });
  assert.deepEqual(TT.toolOf(ok!), ok?.with);
  // a team tool missing any of the four is no block at all
  assert.equal(B.cleanBlock(tool("x", { page: "folds", reads: [], owner: "marcocyl04-ux", gate: "members" })), null);   // reads nothing said
  assert.equal(B.cleanBlock(tool("x", { page: "folds", reads: READS, gate: "members" })), null);                       // no owner
  assert.equal(B.cleanBlock(tool("x", { page: "folds", reads: READS, owner: "marcocyl04-ux", gate: "anyone" })), null);   // not members only
  assert.equal(B.cleanBlock(tool("x", { page: "folds", reads: READS, owner: "marcocyl04-ux" })), null);                // no gate
  assert.equal(B.cleanBlock(tool("x", { reads: READS, owner: "marcocyl04-ux", gate: "members" })), null);              // no page
  assert.equal(B.cleanBlock(tool("x", { page: "folds", reads: [{ what: "track events" }], owner: "marcocyl04-ux", gate: "members" })), null);   // from where?
  assert.equal(TT.toolOf({ kind: "tool" }), null);
  assert.equal(TT.toolOf({ kind: "tile", with: ok!.with }), null);
});

test("Sol's own blocks: this week's folds is a team tool, off until the project turns it on, members only, saying what it reads", () => {
  B.setShipped(null);
  const own = B.shipped();
  const folds = own.find((b) => b.id === "folds")!;
  assert.equal(folds.start, "off");
  const t = TT.toolOf(folds)!;
  assert.equal(t.gate, "members");
  assert.equal(t.page, "folds");
  assert.ok(t.reads.length >= 1 && t.reads.every((r) => r.what && r.from));
  assert.deepEqual(own.filter((b) => b.kind === "tool" && !TT.toolOf(b)).map((b) => b.id), ["calendar", "decisions", "polls", "settings"]);
  assert.equal(B.blocksIn({}, own).find((b) => b.id === "folds")!.live, false);
  assert.equal(B.blocksIn({ folds: { on: true } }, own).find((b) => b.id === "folds")!.live, true);
  // turned on like any block: a proposal's change laid over the part
  const m = B.mergeBlocks({}, { folds: { on: true } }, own);
  assert.ok("part" in m && m.part.folds.on === true);
  // a team cannot declare a team tool in its record: a tool needs code (its page and its reader)
  const d = B.mergeBlocks({}, { mine: { on: true, block: tool("mine") } }, own);
  assert.ok("error" in d && /needs code/.test(d.error));
});

test("the members gate, in the engine: off refused, not a member refused, members unknown refused, a member let through", async () => {
  B.setShipped(null);
  const own = B.shipped();
  const on = B.blocksIn({ folds: { on: true } }, own), off = B.blocksIn({}, own);
  F.useFolds(async () => ({ lines: [] }), () => new Date("2026-10-30T15:00:00Z"));
  let asked = 0;
  const members = (list: string[] | null) => async () => { asked++; return list; };
  const ctx = { key: "k", zone: "America/New_York", refresh: false };

  let r = await TT.openTool({ id: "folds", views: off, me: "marcocyl04-ux", members: members(["marcocyl04-ux"]), ctx });
  assert.ok("error" in r && r.gate === "off" && !("data" in r));
  assert.equal(asked, 0);   // an off tool never costs a read of the members
  r = await TT.openTool({ id: "calendar", views: on, me: "marcocyl04-ux", members: members(["marcocyl04-ux"]), ctx });
  assert.ok("error" in r && r.gate === "none");   // Sol's own calendar is no team tool
  r = await TT.openTool({ id: "nope", views: on, me: "marcocyl04-ux", members: members(["marcocyl04-ux"]), ctx });
  assert.ok("error" in r && r.gate === "none");
  r = await TT.openTool({ id: "folds", views: on, me: "stranger", members: members(["marcocyl04-ux", "franktsai2008-eng"]), ctx });
  assert.ok("error" in r && r.gate === "members" && !("data" in r));
  assert.match((r as { error: string }).error, /members only, and stranger is not one/);
  r = await TT.openTool({ id: "folds", views: on, me: "", members: members(["marcocyl04-ux"]), ctx });
  assert.ok("error" in r && r.gate === "members");   // nobody signed in is nobody's member
  for (const list of [null, []]) {
    r = await TT.openTool({ id: "folds", views: on, me: "marcocyl04-ux", members: members(list), ctx });
    assert.ok("error" in r && r.gate === "unknown");   // fail shut
  }
  r = await TT.openTool({ id: "folds", views: on, me: "marcocyl04-ux", members: async () => { throw new Error("gh down"); }, ctx });
  assert.ok("error" in r && r.gate === "unknown");
  r = await TT.openTool({ id: "folds", views: on, me: "MarcoCyl04-UX", members: members(["marcocyl04-ux"]), ctx });   // GitHub logins are case-blind
  assert.ok("data" in r && r.tool.gate === "members");
  // a record's own block of kind tool (a newer Sol's, kept as written) is never live here, so never opened
  const rec = B.blocksIn({ folds: { on: true }, mine: { on: true, block: B.cleanBlock(tool("mine"), true)! } }, own);
  r = await TT.openTool({ id: "mine", views: rec, me: "marcocyl04-ux", members: members(["marcocyl04-ux"]), ctx });
  assert.ok("error" in r && r.gate === "off");
});

test("the reader reads the project the gate let it into, by the key it is handed", async () => {
  B.setShipped(null);
  const keys: string[] = [];
  F.useFolds(async (key) => { keys.push(key); return { lines: [] }; }, () => new Date("2026-10-30T15:00:00Z"));
  const r = await TT.openTool({ id: "folds", views: B.blocksIn({ folds: { on: true } }, B.shipped()), me: "a", members: async () => ["a"], ctx: { key: "room-A sol-mif/sol-dev", zone: "", refresh: false } });
  assert.ok("data" in r);
  assert.deepEqual(keys, ["room-A sol-mif/sol-dev"]);
});

test("a tool with no reader in this Sol says so, and a reader that throws is a refusal, never a crash", async () => {
  const views = [{ ...(B.cleanBlock(tool("later", { page: "later", reads: READS, owner: "marcocyl04-ux", gate: "members" })))!, live: true, from: "code" as const, known: true }];
  let r = await TT.openTool({ id: "later", views, me: "a", members: async () => ["a"], ctx: { key: "k", zone: "", refresh: false } });
  assert.ok("error" in r && r.gate === "missing");
  TT.defineTool("later", async () => { throw new Error("boom\nstack"); });
  r = await TT.openTool({ id: "later", views, me: "a", members: async () => ["a"], ctx: { key: "k", zone: "", refresh: false } });
  assert.ok("error" in r && /couldn't read later: boom$/.test(r.error));
});

test("this week's nights: the review's words since Monday in the project's zone, a landing the review folded counted once", () => {
  const n = (number: number, at: string, body: string, author = "marcocyl04-ux") => Feed.noteLine({ repo: "sol-mif/sol-dev", number, at, author, body, url: `https://github.com/sol-mif/sol-dev/pull/${number}` })!;
  const landed = (number: number, at: string) => ({ id: `landed:${number}`, at, who: "supertsai", agent: false, kind: "landed" as const, text: `#${number} x landed on main`, ref: { repo: "sol-mif/sol-dev", number } });
  const lines = [
    n(450, "2026-10-30T01:14:00Z", "**Folded** into the dev release."),                 // Thu 21:14 New York
    landed(450, "2026-10-30T01:14:05Z"),                                                   // the fold's own merge: not again
    n(447, "2026-10-30T01:09:00Z", "**Sent back** (slight): the copy."),
    n(447, "2026-10-30T10:02:00Z", "**Re-checked** and folded."),
    landed(444, "2026-10-28T04:40:00Z"),                                                    // Tue 00:40 New York: outside a review
    n(1, "2026-10-29T13:12:00Z", "**Beta passed**: the dev release of 2026-10-28 goes to beta."),
    n(438, "2026-10-26T03:30:00Z", "**Sent back** (severe): breaks onboarding."),          // Sun 23:30 New York: last week
    n(460, "2026-10-30T10:00:00Z", "**Catch-up passed** on nucbox: 2 of 2 releases"),     // not a fold
    { id: "said", at: "2026-10-29T12:00:00Z", who: "x", agent: false, kind: "said" as const, text: "said: hi" },
  ];
  const w = F.weekOf(lines, new Date("2026-10-30T15:00:00Z"), "America/New_York");   // Friday
  assert.equal(w.since, "2026-10-26");
  assert.deepEqual(w.days.map((d) => d.day), ["2026-10-30", "2026-10-29", "2026-10-28"]);
  assert.deepEqual(w.days[0].folds.map((f) => f.kind), ["rechecked"]);
  assert.deepEqual(w.days[1].folds.map((f) => `${f.kind}:${f.number ?? ""}`), ["folded:450", "sent-back:447", "passed:1"]);
  assert.equal(w.days[1].folds.find((f) => f.kind === "sent-back")!.how, "slight");
  assert.deepEqual(w.counts, { folded: 1, rechecked: 1, "sent-back": 1, broke: 0, passed: 1, held: 0, landed: 1 });
  // the same moment in another zone is another week: Sunday night in New York is Monday in Taipei
  assert.equal(F.weekOf(lines, new Date("2026-10-30T15:00:00Z"), "Asia/Taipei").days.flatMap((d) => d.folds).some((f) => f.number === 438), true);
  assert.equal(F.mondayOf(new Date("2026-11-02T04:59:00Z"), "America/New_York"), "2026-10-26");   // still Sunday there
  assert.equal(F.mondayOf(new Date("2026-11-02T05:01:00Z"), "America/New_York"), "2026-11-02");
  assert.equal(F.dayIn(new Date("2026-10-30T15:00:00Z"), "Not/AZone").length, 10);   // a zone that is no zone: this machine's
  assert.equal(F.weekOf(lines, new Date("2026-10-30T15:00:00Z"), "Not/AZone").zone, "");   // and the week says so
});

test("this week's nights (#477): the words Into sol-dev and Re-checked, and into count as the old Folded did", () => {
  const n = (number: number, at: string, body: string) => Feed.noteLine({ repo: "sol-mif/sol-dev", number, at, author: "marcocyl04-ux", body, url: `https://github.com/sol-mif/sol-dev/pull/${number}` })!;
  const lines = [
    n(452, "2026-10-30T01:14:00Z", "**Into sol-dev** in the dev review of 2026-10-29: one merge commit, so one revert undoes it; its branch is deleted."),
    n(453, "2026-10-30T10:02:00Z", "**Re-checked**, and into sol-dev as one merge commit (its branch is deleted), after the slight send back of the dev review of 2026-10-29: fine"),
    n(1, "2026-10-29T13:12:00Z", "**Beta passed**: the dev release of 2026-10-28 goes to beta whole (#440)."),
    n(450, "2026-10-28T01:14:00Z", "**Folded** into the dev release, in the dev review of 2026-10-27."),
  ];
  assert.deepEqual(lines.map((l) => l.text), ["#452 into sol-dev", "re-checked #453, into sol-dev", "the dev release of 2026-10-28 into beta", "#450 into sol-dev"]);
  const w = F.weekOf(lines, new Date("2026-10-30T15:00:00Z"), "America/New_York");
  assert.deepEqual(w.counts, { folded: 2, rechecked: 1, "sent-back": 0, broke: 0, passed: 1, held: 0, landed: 0 });
});
