// On the team (#1541): GitHub's member list for this machine's own sign-in, never a typed org; and a group's level kept
// on its room alone. Nothing here touches GitHub or a real team.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FILE = join(mkdtempSync(join(tmpdir(), "sol-team-")), "team.json");
writeFileSync(FILE, JSON.stringify({ me: { login: "stranger", name: "S" }, repos: ["stranger/room"] }));
process.env.SOL_TEAM = FILE;
process.env.SOL_TEAM_OFFLINE = "1";
const { onTeamOf, orgsOf, activeIn } = await import("../src/team/onteam.ts");
const S = await import("../src/team/settings.ts");

const fake = (answers: Record<string, string | Error>) => {
  const asked: string[][] = [];
  let t = 0;
  const d = { gh: async (args: string[]) => { asked.push(args); const a = answers[args[1]]; if (a === undefined || a instanceof Error) throw a ?? new Error("HTTP 404"); return a; }, now: () => t };
  return { d, asked, tick: (ms: number) => { t += ms; } };
};

test("the orgs asked: GitHub rooms' only, each once, a name GitHub could hold", () => {
  assert.deepEqual(orgsOf([{ org: "sol-mif", provider: "github" }, { org: "SOL-MIF" }, { org: "", provider: "cloud" }, { org: "x y" }, { org: "o", provider: "drive" }]), ["sol-mif"]);
  assert.equal(activeIn('{"state":"active"}'), true);
  assert.equal(activeIn('{"state":"pending"}'), false);
  assert.equal(activeIn("not json"), false);
});

test("a typed org I am not in is not the team; an active membership is", async () => {
  const f = fake({ "user/memberships/orgs/sol-mif": new Error("HTTP 404"), "user/memberships/orgs/mine": '{"state":"active"}' });
  const t = onTeamOf(f.d);
  assert.equal(t.now([{ org: "sol-mif" }]), null);   // not asked yet
  assert.equal(await t.check([{ org: "sol-mif" }]), false);
  assert.equal(t.now([{ org: "sol-mif" }]), false);
  assert.equal(await t.check([{ org: "sol-mif" }, { org: "mine" }]), true);
  assert.equal(t.now([{ org: "sol-mif" }, { org: "mine" }]), true);
  // asked as the token's own user: no login from team.json in the question
  assert.ok(f.asked.every((a) => a[0] === "api" && a[1].startsWith("user/memberships/orgs/") && a.length === 2));
});

test("an invitation not yet taken, no gh, no org: not the team", async () => {
  const t = onTeamOf(fake({ "user/memberships/orgs/o": '{"state":"pending"}' }).d);
  assert.equal(await t.check([{ org: "o" }]), false);
  assert.equal(await t.check([]), false);
  assert.equal(t.now([]), false);
  assert.equal(await onTeamOf(fake({}).d).check([{ org: "o" }]), false);
});

test("an answer is kept 10 minutes, then asked again", async () => {
  const f = fake({ "user/memberships/orgs/o": '{"state":"active"}' });
  const t = onTeamOf(f.d);
  await t.check([{ org: "o" }]); await t.check([{ org: "o" }]);
  assert.equal(f.asked.length, 1);
  f.tick(10 * 60_000 + 1);
  assert.equal(t.now([{ org: "o" }]), null);
  await t.check([{ org: "o" }]);
  assert.equal(f.asked.length, 2);
});

test("a group's level is kept on its room alone; anything else is asks first", () => {
  const s = S.readTeam({ me: { login: "a", name: "A" }, rooms: [
    { id: "one", name: "one", provider: "cloud", code: "K7Q2MX", hub: "wss://cloud.example.net/relay", level: "does" },
    { id: "two", name: "two", provider: "cloud", code: "M3R8QK", hub: "wss://cloud.example.net/relay", level: "bypassPermissions" },
    { id: "three", name: "three", provider: "github", org: "o", repos: ["o/r"], level: "tells" },
  ], room: "one" });
  assert.equal(s.rooms.find((r) => r.id === "one")?.level, "does");
  assert.equal(s.rooms.find((r) => r.id === "two")?.level, undefined);
  assert.equal(s.rooms.find((r) => r.id === "three")?.level, "tells");
});

test("the only org asked is the team's own (gate one q1): the owner of the team's development repository", async () => {
  const { TEAM_ORG } = await import("../src/team/onteam.ts");
  const { DEV_REPOS } = await import("../src/errcount.ts");
  assert.equal(TEAM_ORG, [...DEV_REPOS][0].split("/")[0]);
  assert.equal(TEAM_ORG, "sol-mif");
});

test("#1541 gate one q2: a table's level is the mode its sessions run in; another person's words always ask first", async () => {
  const { tableMode, takesItself, roomOfRepo } = await import("../src/team/tablelevel.ts");
  const { startMode } = await import("../src/work/runs.ts");
  // not on the team: the level decides, absent is asks first whatever the machine's own mode
  assert.equal(startMode("bypassPermissions", undefined, undefined, true, false), "default");
  assert.equal(startMode("default", undefined, "tells", true, false), "acceptEdits");
  assert.equal(startMode("default", undefined, "does", true, false), "bypassPermissions");
  // the change is real: the same session, the level moved from asks first to just does, runs past the cards
  assert.notEqual(startMode("default", undefined, undefined, true, false), startMode("default", undefined, "does", true, false));
  // a woken session (someone else's words) asks first at any table, any level
  assert.equal(startMode("default", "others", "does", true, false), "default");
  assert.equal(startMode("bypassPermissions", "mine", "does", true, true), "default");
  // a session at no table keeps its own mode; the team's own Sol with no level picked keeps its own too
  assert.equal(startMode("acceptEdits", undefined, "does", false, false), "acceptEdits");
  assert.equal(startMode("bypassPermissions", undefined, undefined, true, true), "bypassPermissions");
  assert.equal(startMode("default", undefined, "does", true, true), "bypassPermissions");
  // a hand my AI took with nobody pressing is another person's words: at just does, edits go ahead but a command asks
  assert.equal(startMode("default", undefined, "does", true, false, true), "acceptEdits");
  assert.equal(startMode("default", undefined, "tells", true, false, true), "acceptEdits");
  assert.equal(startMode("default", undefined, undefined, true, false, true), "default");
  assert.equal(tableMode("bypassPermissions", false), "default", "a stray word is no level");
  assert.deepEqual([takesItself(undefined), takesItself("tells"), takesItself("does"), takesItself("x")], [false, true, true, false]);
  assert.equal(roomOfRepo([{ id: "a", repos: ["o/one"] }, { id: "b", repos: ["O/Two"] }], "o/two")?.id, "b");
});
