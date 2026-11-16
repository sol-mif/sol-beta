// The nightly catch-up test (#423): which releases, the saved data and what must read back, the health it wants, and
// the report the feed reads (src/team/catchup.ts). Pure parts only: the run itself builds real releases (sol/catchup).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planOf, tagsOf, fixture, facts, readFacts, lostOf, healthWrong, reportOf, reviewersOf, engineEnv, stateDirOf, MARK, type Files, type Root, type Tag } from "../src/team/catchup.ts";
import { reviewedText, noteLine } from "../src/team/feed.ts";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-30T12:00:00Z");
const at = (d: string) => Date.parse(`${d}T13:00:00Z`);

test("the plan: every dev release of the last 30 days, oldest first, to the newest", () => {
  const tags: Tag[] = [
    { tag: "dev-20261020", at: at("2026-10-20") },   // 41 days ago: out
    { tag: "dev-20261101", at: at("2026-11-01") },   // 29 days ago: in
    { tag: "dev-20261115", at: at("2026-11-15") },
    { tag: "dev-20261115-1405", at: at("2026-11-15") + 3600_000 },   // an urgent fix: a release of its own
    { tag: "dev-20261130", at: at("2026-11-30") },   // the newest: the target
    { tag: "stable-20261110-0900", at: at("2026-11-10") },   // beta's: not a dev release
    { tag: "v1.0", at: at("2026-11-12") },
  ];
  const p = planOf(tags, NOW);
  assert.equal(p.kind, "dev");
  assert.equal(p.to?.tag, "dev-20261130");
  assert.deepEqual(p.from.map((t) => t.tag), ["dev-20261101", "dev-20261115", "dev-20261115-1405"]);
  assert.deepEqual(planOf(tags, NOW, { days: 16 }).from.map((t) => t.tag), ["dev-20261115", "dev-20261115-1405"]);
  assert.deepEqual(planOf(tags, NOW, { max: 1 }).from.map((t) => t.tag), ["dev-20261115-1405"], "--max keeps the newest");
  const main = planOf(tags, NOW, { to: "main" });
  assert.equal(main.to?.tag, "main");
  assert.ok(main.from.some((t) => t.tag === "dev-20261130"), "to main: the newest release is caught up from too");
  assert.deepEqual(planOf(tags, NOW, { only: ["dev-20261020"] }).from.map((t) => t.tag), ["dev-20261020"], "--only: any release, even an old one");
  assert.deepEqual(planOf([], NOW), { kind: "none", from: [], to: null });
});

test("before the first dev release: the stamps, the last of each day", () => {
  const tags: Tag[] = [
    { tag: "stable-20261028-0512", at: at("2026-10-28") },
    { tag: "stable-20261028-2017", at: at("2026-10-28") + 7 * 3600_000 },
    { tag: "stable-20261029-1318", at: at("2026-10-29") },
    { tag: "stable-20261030-0028", at: at("2026-10-30") },
  ];
  const p = planOf(tags, Date.parse("2026-10-30T12:00:00Z"));
  assert.equal(p.kind, "stable");
  assert.equal(p.to?.tag, "stable-20261030-0028");
  assert.deepEqual(p.from.map((t) => t.tag), ["stable-20261028-2017", "stable-20261029-1318"]);
});

test("the tags as git lists them", () => {
  assert.deepEqual(tagsOf("dev-20261101 1793538000\nnot-a-release 1\nstable-20261029-1318 1793300000\n\ndev-x 5\n"),
    [{ tag: "dev-20261101", at: 1793538000000 }, { tag: "stable-20261029-1318", at: 1793300000000 }]);
});

// a fixture's files as a map, read the way the run reads them
const filesOf = (m: Map<string, string>): Files => (root: Root, path: string) => m.get(`${root}:${path}`) ?? null;
const seeded = (folder: string) => new Map(fixture(folder).map((f) => [`${f.root}:${f.path}`, f.text]));

test("the saved data reads back as written, and every fact of it is there", () => {
  const folder = "/tmp/x/a-folder";
  const list = facts(folder);
  const r = readFacts(list, filesOf(seeded(folder)));
  for (const f of list) assert.notEqual(r[f.id], undefined, `${f.id} reads from the fixture`);
  assert.equal(r.night, "4|11");
  assert.equal(r.voice, "Puck");
  assert.equal(r.folder, folder);
});

test("step 0002's move is no loss: the night job's numbers in night.json count", () => {
  const folder = "/f";
  const list = facts(folder);
  const m = seeded(folder);
  const before = readFacts(list, filesOf(m));
  const team = JSON.parse(m.get("engine:team.json")!);
  m.set("engine:night.json", JSON.stringify({ ...team.night, from: "team.json" }));
  delete team.night;
  m.set("engine:team.json", JSON.stringify(team));
  assert.deepEqual(lostOf(list, before, readFacts(list, filesOf(m))), { lost: [], notKept: [] });
});

test("what the update lost is named; what the old release never kept is not a loss", () => {
  const folder = "/f";
  const list = facts(folder);
  const m = seeded(folder);
  const old = new Map(m);
  const s = JSON.parse(old.get("engine:settings.json")!);
  delete s.look;   // an older release's shape: no look yet
  old.set("engine:settings.json", JSON.stringify(s));
  const before = readFacts(list, filesOf(old));
  const after = new Map(old);
  after.delete("home:memory/catchup-note.md");
  after.set("state:work.json", JSON.stringify({ ...JSON.parse(old.get("state:work.json")!), prefs: { prefix: "claude/", archiveDays: 9 } }));
  const r = lostOf(list, before, readFacts(list, filesOf(after)));
  assert.deepEqual(r.lost, ["a memory note", "Work's drawers"]);
  assert.deepEqual(r.notKept, ["the look's opacity"]);
});

test("the health it wants: ok, every step ran, none failed", () => {
  const good = { ok: true, data: { ok: true, version: 2, latest: 2, ran: ["0001-baseline", "0002-rhythm-from-team-json"] } };
  assert.equal(healthWrong(good), "");
  assert.match(healthWrong(null), /did not answer/);
  assert.match(healthWrong({ ok: true }), /no conversion state/);
  assert.match(healthWrong({ ok: true, data: { ok: false, version: 1, latest: 2, failed: { step: "0002-rhythm-from-team-json", error: "boom" } } }), /0002-rhythm-from-team-json failed: boom/);
  assert.match(healthWrong({ ok: true, data: { ok: true, version: 1, latest: 2 } }), /a step did not run/);
  assert.match(healthWrong({ ok: true, data: { ok: true, version: 3, latest: 2, ahead: true } }), /newer than the release/);
});

test("the engines: a scratch HOME, nothing reaching out, no secret of mine", () => {
  const env = engineEnv({ PATH: "/bin", HOME: "/Users/me", GH_TOKEN: "x", GEMINI_API_KEY: "k", DISCORD_WEBHOOK: "w" }, "/tmp/h", 4321);
  assert.equal(env.HOME, "/tmp/h");
  assert.equal(env.SOL_PORT, "4321");
  assert.equal(env.SOL_HUB, "off");
  assert.equal(env.SOL_TRACK, "off");
  assert.equal(env.SOL_NO_SHIP_CHECK, "1");
  for (const k of ["GH_TOKEN", "GEMINI_API_KEY", "DISCORD_WEBHOOK"]) assert.equal(env[k], undefined, k);
  assert.equal(stateDirOf("/h", "darwin"), "/h/Library/Application Support/com.marcol04.sol");
  assert.equal(stateDirOf("/h", "linux"), "/h/.local/share/sol");
});

test("the report: its first line is what the feed reads; a red one pings the day's dev reviewer", () => {
  const ok = reportOf({ machine: "nucbox", to: "dev-20261130", kind: "dev", reviewers: ["marcocyl04-ux"], at: "2026-11-30T08:00:00Z",
    results: [{ from: "dev-20261101", ok: true, ran: ["0002-rhythm-from-team-json"], ms: 90_000 }, { from: "dev-20261115", ok: true, ran: [], ms: 30_000 }] });
  assert.match(ok, /^\*\*Catch-up passed\*\* on nucbox: 2 of 2 releases of the last 30 days updated to dev-20261130, healthy, nothing lost\./);
  assert.doesNotMatch(ok, /@marcocyl04-ux/, "green pings nobody");
  assert.match(reviewedText(ok, 460), /^the nightly catch-up passed on nucbox: 2 of 2 releases/);

  const bad = reportOf({ machine: "macbook", to: "dev-20261130", kind: "dev", reviewers: ["marcocyl04-ux"], at: "2026-11-30T08:00:00Z", url: "https://github.com/sol-mif/sol-dev/actions/runs/1",
    results: [{ from: "dev-20261101", ok: false, stage: "lost", said: "lost: a memory note | @frank", lost: ["a memory note"], ms: 60_000 }, { from: "dev-20261115", ok: true, ms: 1000 }] });
  assert.match(bad, /^\*\*Catch-up failed\*\* on macbook: 1 of 2 releases .* \(dev-20261101\)\./);
  assert.match(bad, /\n@marcocyl04-ux: the day's dev review/);
  assert.match(bad, /\| dev-20261101 \| \*\*lost\*\* \| lost: a memory note @​frank \|/, "a cell is one line and pings nobody");
  assert.match(bad, /actions\/runs\/1/);
  const line = noteLine({ repo: "sol-mif/sol-dev", number: 460, at: "2026-11-30T08:00:00Z", author: "github-actions[bot]", body: bad });
  assert.equal(line?.kind, "reviewed");
  assert.equal(line?.who, "github-actions");
  assert.equal(line?.agent, true);
  assert.match(line!.text, /^the nightly catch-up failed on macbook: 1 of 2/);

  const none = reportOf({ machine: "nucbox", to: "dev-20261101", kind: "dev", reviewers: [], at: "2026-11-01T08:00:00Z", results: [] });
  assert.match(none, /^\*\*Catch-up passed\*\* on nucbox: nothing to catch up from/);
});

test("the day's dev reviewers come from the project's rhythm file", () => {
  const rhythm = readFileSync(join(import.meta.dirname, "..", "..", "..", ".sol", "rhythm.json"), "utf8");
  assert.ok(reviewersOf(rhythm).length > 0);
  assert.deepEqual(reviewersOf('{"dev":"frank"}'), ["frank"]);
  assert.deepEqual(reviewersOf('{"dev":["ok-name","bad name; rm"]}'), ["ok-name"]);
  assert.deepEqual(reviewersOf(null), []);
  assert.ok(MARK.length > 0);
  assert.ok(DAY > 0);
});
