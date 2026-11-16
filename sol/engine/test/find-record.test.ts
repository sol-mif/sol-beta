// The record's lookup (#510): which repository holds a GitHub room's record, by GitHub's answer (findrecord.ts), with gh
// faked. The pure helpers (withRecord, needsRecord, codeRepoOf, placeRecords, saidNo), the lookup's three answers and its
// "no answer", and the start-up migration: a team.json from before the record that lists only sol-mif/sol-dev reads back
// with sol-mif/sol-record first once the lookup answered, kept on disk so it is asked once. No network, no real team.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "sol-510-"));
const FILE = join(DIR, "team.json");
process.env.SOL_TEAM = FILE;
process.env.SOL_TEAM_OFFLINE = "1";
writeFileSync(FILE, JSON.stringify({ me: { login: "franktsai2008-eng" }, repos: ["sol-mif/sol-dev"], relay: { url: "wss://h/relay", key: "k", host: false } }));

const S = await import("../src/team/settings.ts");
const F = await import("../src/team/findrecord.ts");
type Gh = (args: string[]) => Promise<string>;

const no = (code: number) => Object.assign(new Error(`HTTP ${code}`), { full: `gh: Not Found (HTTP ${code})` });
/** a fake gh: `vars` the SOL_RECORD of each repository, `there` the repositories that exist; `down` answers nothing */
function fake(vars: Record<string, string>, there: string[], down = false): Gh & { asked: string[][] } {
  const asked: string[][] = [];
  const gh = (async (args: string[]) => {
    asked.push(args);
    if (down) throw Object.assign(new Error("error connecting to api.github.com"), { full: "error connecting to api.github.com" });
    const v = args[1]?.match(/^repos\/(.+)\/actions\/variables\/SOL_RECORD$/);
    if (v) { if (vars[v[1]]) return JSON.stringify({ name: "SOL_RECORD", value: vars[v[1]] }); throw no(404); }
    if (args[0] === "repo" && args[1] === "view") { if (there.includes(args[2])) return JSON.stringify({ nameWithOwner: args[2] }); throw Object.assign(new Error("x"), { full: `GraphQL: Could not resolve to a Repository with the name '${args[2]}'.` }); }
    throw new Error(`unexpected gh ${args.join(" ")}`);
  }) as Gh & { asked: string[][] };
  gh.asked = asked;
  return gh;
}

test("recordName and saidNo: the name beside, and GitHub's no told from no answer", () => {
  assert.equal(F.recordName("o/app"), "o/app-record");
  assert.equal(F.saidNo(no(404)), true);
  assert.equal(F.saidNo(no(403)), true, "a variable I may not read: on to the next way");
  assert.equal(F.saidNo({ full: "GraphQL: Could not resolve to a Repository with the name 'o/x'." }), true);
  assert.equal(F.saidNo(new Error("error connecting to api.github.com")), false);
});

test("needsRecord and codeRepoOf: a GitHub room waits until its first repository is the record GitHub named", () => {
  const room = { provider: "github" as const, repos: ["sol-mif/sol-dev"] };
  assert.equal(S.needsRecord(room), true);
  assert.equal(S.needsRecord({ ...room, repos: ["sol-mif/sol-record", "sol-mif/sol-dev"], record: "sol-mif/sol-record" }), false);
  assert.equal(S.needsRecord({ ...room, record: "sol-mif/sol-dev" }), false, "its own record");
  assert.equal(S.needsRecord({ ...room, repos: ["o/new", "sol-mif/sol-record"], record: "sol-mif/sol-record" }), true, "a hand edit put another first");
  assert.equal(S.needsRecord({ provider: "cloud", repos: ["o/r"] }), false);
  assert.equal(S.needsRecord({ provider: "github", repos: [] }), false);
  assert.equal(S.codeRepoOf({ repos: ["sol-mif/sol-record", "sol-mif/sol-dev"], record: "sol-mif/sol-record" }), "sol-mif/sol-dev");
  assert.equal(S.codeRepoOf({ repos: ["o/r"], record: "o/r" }), "o/r", "its own record: that one");
  assert.equal(S.codeRepoOf({ repos: ["o/r", "o/s"] }), "o/r", "not asked yet: the first");
  assert.equal(S.codeRepoOf({ repos: [] }), "");
});

test("lookupRecord: SOL_RECORD first, else <owner>/<name>-record when it exists, else the repository itself; null with no answer", async () => {
  assert.equal(await F.lookupRecord(fake({ "o/app": "o/books" }, ["o/app-record"]), "o/app"), "o/books", "the variable wins");
  assert.equal(await F.lookupRecord(fake({ "o/app": "not a repo" }, ["o/app-record"]), "o/app"), "o/app-record", "a variable that names nothing: the next way");
  assert.equal(await F.lookupRecord(fake({}, ["o/app-record"]), "o/app"), "o/app-record");
  const gh = fake({}, []);
  assert.equal(await F.lookupRecord(gh, "o/app"), "o/app", "neither: its own record, as before");
  assert.deepEqual(gh.asked, [["api", "repos/o/app/actions/variables/SOL_RECORD"], ["repo", "view", "o/app-record", "--json", "nameWithOwner"]]);
  assert.equal(await F.lookupRecord(fake({}, [], true), "o/app"), null, "no network: no answer, never 'its own'");
});

test("placeRecords: the record first and kept on the rooms the answers name; the others are the same objects", () => {
  const a = S.cleanRoom({ id: "a", repos: ["sol-mif/sol-dev"], hub: "" })!;
  const b = S.cleanRoom({ id: "b", repos: ["o/r"], hub: "" })!;
  const out = F.placeRecords([a, b], new Map([["sol-mif/sol-dev", "sol-mif/sol-record"]]));
  assert.deepEqual([out[0].repos, out[0].record], [["sol-mif/sol-record", "sol-mif/sol-dev"], "sol-mif/sol-record"]);
  assert.equal(out[1], b);
});

test("the record survives a clean and a face sending the room back without it", () => {
  const r = S.cleanRoom({ id: "a", repos: ["sol-mif/sol-record", "sol-mif/sol-dev"], record: "sol-mif/sol-record", hub: "" })!;
  assert.equal(r.record, "sol-mif/sol-record");
  assert.equal(S.cleanRoom({ id: "a", repos: ["o/r"], record: "../x", hub: "" })!.record, undefined, "not a repository: dropped");
});

test("start-up migration: a team.json listing only sol-mif/sol-dev reads back with sol-mif/sol-record first, asked once", async () => {
  assert.deepEqual(S.getTeam().repos, ["sol-mif/sol-dev"], "before the answer: as written");
  S.patchTeam({ rooms: S.getTeam().rooms.map((r) => ({ ...r, mine: true })) });
  const gh = fake({ "sol-mif/sol-dev": "sol-mif/sol-record" }, ["sol-mif/sol-record"]);
  const rooms = await F.findRecords(gh, () => S.getTeam().rooms);
  assert.ok(rooms);
  const s = S.patchTeam({ rooms });
  assert.deepEqual(s.repos, ["sol-mif/sol-record", "sol-mif/sol-dev"]);
  assert.equal(S.recordOf(S.activeRoom(s)), "sol-mif/sol-record", "the walk writes to the record");
  assert.equal(S.codeRepoOf(S.activeRoom(s)), "sol-mif/sol-dev", "joining clones the code");
  assert.equal(S.activeRoom(s).mine, true, "the record put first is no change of the room's words");
  const disk = JSON.parse(readFileSync(FILE, "utf8"));
  assert.deepEqual([disk.repos, disk.rooms[0].record], [["sol-mif/sol-record", "sol-mif/sol-dev"], "sol-mif/sol-record"], "kept in team.json");
  assert.deepEqual(S.readTeam(disk).repos, ["sol-mif/sol-record", "sol-mif/sol-dev"], "and read back so");
  const again = fake({}, []);
  assert.equal(await F.findRecords(again, () => S.getTeam().rooms), null);
  assert.equal(again.asked.length, 0, "asked once");
  // a face's edit that sends the room without its record keeps it
  const t = S.patchTeam({ rooms: S.getTeam().rooms.map(({ record: _r, ...x }) => x) });
  assert.equal(S.activeRoom(t).record, "sol-mif/sol-record");
});

test("findRecords: no answer (no network) changes nothing and asks again next time", async () => {
  const room = S.cleanRoom({ id: "x", repos: ["o/app"], hub: "" })!;
  assert.equal(await F.findRecords(fake({}, [], true), () => [room]), null);
  const out = await F.findRecords(fake({}, []), () => [room]);
  assert.deepEqual([out![0].repos, out![0].record], [["o/app"], "o/app"], "its own record, kept, so not asked again");
});
