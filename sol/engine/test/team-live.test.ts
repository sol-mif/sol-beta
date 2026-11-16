// The live block (#485, dev cycle step 6): team/live.ts. The newest dev release, its morning run, and the error counts
// per feature (errcount.ts on each Mac, the cloud's byError), behind analytics' gates: the members read strictly, then
// the cloud's readers list. No record, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "sol-live-"));
const FILE = join(DIR, "team.json");
writeFileSync(FILE, JSON.stringify({ me: { login: "franktsai2008-eng", name: "Frank" }, repos: ["sol-mif/sol-dev"] }));
process.env.SOL_TEAM = FILE;
process.env.SOL_TEAM_OFFLINE = "1";
const B = await import("../src/team/blocks.ts");
const TT = await import("../src/team/teamtool.ts");
const L = await import("../src/team/live.ts");

const FEATURES = [
  { id: "fr-03", name: "Cowork pages", slug: "pages", type: "", label: "cowork", where: "", lead: "", support: [], dependsOn: [], off: null, paths: ["sol/engine/src/team/pages.ts", "sol/mac/src/cowork/pages/**"] },
  { id: "fr-01", name: "Open Sol", slug: "open-sol", type: "", label: "base", where: "", lead: "", support: [], dependsOn: [], off: null, paths: ["sol/engine/**"] },
];
const SUMMARY = {
  window: { days: 30, from: "2026-10-02", to: "2026-10-31" },
  total: { events: 99, testers: 3 },
  byDay: [],
  byError: [
    { file: "src:team:pages.ts", type: "TypeError", kind: "team", sol: "bbbb222", events: 5, testers: 2 },
    { file: "src:team:pages.ts", type: "ENOENT", kind: "team", sol: "aaaa111", events: 2, testers: 1 },
    { file: "src:index.ts", type: "ENOENT", kind: "uncaught", sol: "bbbb222", events: 1, testers: 1 },
    { file: "other", type: "Error", kind: "turn", sol: "bbbb222", events: 3, testers: 3 },
    { file: "a path/with spaces", type: "Error", kind: "team", sol: "bbbb222", events: 50, testers: 1 },
    { file: "src:x.ts", type: "Error", kind: "made-up", sol: "bbbb222", events: 50, testers: 1 },
    { file: "src:x.ts", type: "Error", kind: "team", sol: "/Users/x", events: 50, testers: 1 },
    { file: "src:..:..:Documents:Taxes-Jane.ts", type: "Error", kind: "team", sol: "bbbb222", events: 50, testers: 1 },
  ],
};
const LINE = {
  releases: [
    { tag: "dev-20261030", sha: "aaaa1111ffff", at: "2026-10-30T13:00:00Z", kind: "dev" as const },
    { tag: "dev-20261031", sha: "bbbb2222eeee", at: "2026-10-31T13:00:00Z", kind: "dev" as const },
    { tag: "next", sha: "", at: "2026-11-01T13:00:00Z", kind: "next" as const },
  ],
  spots: {},
};
const DIGEST = [
  { body: "**Night digest**, 2026-10-30", createdAt: "2026-10-30T01:00:00Z" },
  { body: "**Morning run**, dev-20261031: gate green · first-timer 2 runs, 1 finding · 2 features touched\n\n| fr-03 | the first-timer's words never ride here |", createdAt: "2026-10-31T13:31:00Z", author: { login: "sol-release-runner" }, url: "https://github.com/sol-mif/sol-dev/issues/7#c9" },
];
const deps = (o: Partial<Parameters<typeof L.liveNow>[0]> = {}) => ({
  ticket: async () => "ticket-frank", summary: async () => ({ status: 200, body: SUMMARY }), releases: async () => LINE,
  digest: async () => DIGEST, features: () => FEATURES, now: () => new Date("2026-10-31T15:00:00Z"), ...o,
});

test("the cloud's error counts kept to words and numbers: a file, type, kind or version that is not one is left out", () => {
  const s = L.cleanErrors(SUMMARY)!;
  assert.equal(s.rows.length, 4);
  assert.equal(JSON.stringify(s).includes("spaces"), false);
  assert.equal(JSON.stringify(s).includes("/Users"), false);
  assert.equal(L.cleanErrors({ byError: [] }), null, "no window: not a summary");
  assert.deepEqual(L.cleanErrors({ window: SUMMARY.window })!.rows, [], "a cloud from before #485 has no byError: none");
  assert.equal(L.pathOfFile("src:team:pages.ts"), "sol/engine/src/team/pages.ts");
  assert.equal(L.pathOfFile("other"), "");
});

test("errors by feature: each file to the feature that claims it most closely, the newest release's own beside the window's", () => {
  const f = L.errorsByFeature(L.cleanErrors(SUMMARY)!.rows, FEATURES, LINE, "dev-20261031");
  assert.deepEqual(f.map((x) => [x.id, x.events, x.testers, x.onNewest]), [["fr-03", 7, 2, 5], ["fr-01", 1, 1, 1], ["", 3, 3, 3]],
    "pages.ts is fr-03's (its own path beats sol/engine/**); a count with no engine file is under no feature, last");
  assert.deepEqual(f[0].types, [{ type: "TypeError", events: 5 }, { type: "ENOENT", events: 2 }]);
  assert.deepEqual(f[0].releases, [{ release: "dev-20261031", events: 5 }, { release: "dev-20261030", events: 2 }]);
  // no map (a Sol tester's checkout, or before #480): everything under no feature
  const none = L.errorsByFeature(L.cleanErrors(SUMMARY)!.rows, [], null, "");
  assert.deepEqual(none.map((x) => [x.id, x.events]), [["", 11]]);
  assert.deepEqual(none[0].releases, [{ release: "", events: 11 }]);
});

test("the page's data: the newest dev release, the morning run's line and who posted it, the errors by feature", async () => {
  const l = await L.liveNow(deps());
  assert.deepEqual(l.release, { tag: "dev-20261031", at: "2026-10-31T13:00:00Z", sha: "bbbb2222eeee" });
  assert.equal(l.morning?.tag, "dev-20261031");
  assert.equal(l.morning?.green, true);
  assert.equal(l.morning?.findings, 1);
  assert.equal(l.morning?.by, "sol-release-runner");
  assert.equal(JSON.stringify(l).includes("first-timer's words"), false, "only the comment's first line");
  assert.equal(l.errors?.total, 11);
  assert.equal(l.errors?.mapped, true);
  assert.deepEqual(l.notes, []);
});

test("each part that cannot be read says so, and the rest still draws", async () => {
  let l = await L.liveNow(deps({ ticket: async () => "" }));
  assert.equal(l.errors, null);
  assert.match(l.notes.join("\n"), /error counts: sign in to Sol's cloud/);
  assert.equal(l.release?.tag, "dev-20261031", "the release still");
  l = await L.liveNow(deps({ summary: async () => ({ status: 403, body: { error: "the counts are for the SOL project's members only" } }) }));
  assert.match(l.notes.join("\n"), /readers list/);
  l = await L.liveNow(deps({ summary: async () => ({ status: 200, body: { window: SUMMARY.window } }) }));
  assert.match(l.notes.join("\n"), /does not keep them yet/);
  l = await L.liveNow(deps({ features: () => [] }));
  assert.equal(l.errors?.mapped, false);
  assert.match(l.notes.join("\n"), /no feature map here/);
  l = await L.liveNow(deps({ digest: async () => [], releases: async () => null }));
  assert.equal(l.morning, null);
  assert.equal(l.release, null);
  assert.match(l.notes.join("\n"), /no morning run on the Night digest yet/);
  assert.match(l.notes.join("\n"), /releases could not be read/);
  l = await L.liveNow(deps({ digest: async () => { throw new Error("gh: not signed in"); } }));
  assert.match(l.notes.join("\n"), /Night digest could not be read \(gh: not signed in\)/);
});

test("the block: shipped off, a team tool for members only, gated strictly as analytics is; kept two minutes past the gate", async () => {
  B.setShipped(null);
  const own = B.shipped();
  const block = own.find((b) => b.id === "live")!;
  assert.equal(block.start, "off", "off until the team turns it on");
  assert.deepEqual(TT.toolOf(block)?.page, "live");
  const on = B.blocksIn({ live: { on: true } }, own), off = B.blocksIn({}, own);
  let t = Date.parse("2026-10-31T15:00:00Z"), asks = 0;
  L.useLive(deps({ summary: async () => { asks++; return { status: 200, body: SUMMARY }; }, now: () => new Date(t) }));
  assert.equal(TT.namesPeople("live"), true, "it reads the track summary, which names people: the strict gate");
  const strictness: boolean[] = [];
  const members = (list: string[] | null) => async (strict: boolean) => { strictness.push(strict); return list; };
  const ctx = { key: "k", zone: "", refresh: false };
  let r = await TT.openTool({ id: "live", views: off, me: "franktsai2008-eng", members: members(["franktsai2008-eng"]), ctx });
  assert.ok("error" in r && r.gate === "off");
  r = await TT.openTool({ id: "live", views: on, me: "stranger", members: members(["franktsai2008-eng"]), ctx });
  assert.ok("error" in r && r.gate === "members");
  r = await TT.openTool({ id: "live", views: on, me: "franktsai2008-eng", members: members(null), ctx });
  assert.ok("error" in r && r.gate === "unknown");
  assert.equal(asks, 0, "nothing asked of the cloud before the members gate");
  assert.deepEqual(strictness, [true, true]);
  r = await TT.openTool({ id: "live", views: on, me: "franktsai2008-eng", members: members(["franktsai2008-eng"]), ctx });
  assert.ok("data" in r);
  r = await TT.openTool({ id: "live", views: on, me: "franktsai2008-eng", members: members(["franktsai2008-eng"]), ctx });
  assert.equal(asks, 1, "kept two minutes");
  t += L.CACHE_MS;
  r = await TT.openTool({ id: "live", views: on, me: "franktsai2008-eng", members: members(["franktsai2008-eng"]), ctx });
  assert.equal(asks, 2);
});
