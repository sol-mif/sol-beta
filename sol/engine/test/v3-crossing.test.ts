// Cowork v3, slice 1 (fr-30, #554): the crossing card's engine. E4 (make, Send, Undo within 8 s), F4 (Send pressed
// twice), and the switch: off, the wire answers nothing and the tool is not offered.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crossingOf, memoryTrail, parse, parseDate, UNDO_MS, type Ctx } from "../src/team/v3/crossing.ts";

// the wire's tests (F7 and Send twice through it) run on a team and state of their own, offline, the switch off first
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
process.env.SOL_TEAM = join(tmp("sol-v3-team-"), "team.json");
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_STATE = join(tmp("sol-v3-state-"), "work.json");
process.env.SOL_HOME = tmp("sol-v3-home-");
process.env.SOL_COWORK_V3 = "off";
delete process.env.DISCORD_WEBHOOK;

const SOL: Ctx = { project: { id: "sol", name: "Sol" }, people: [{ login: "franktsai2008-eng" }, { login: "isaac-w", name: "Isaac W" }, { login: "marcocyl04-ux" }],
  me: "marcocyl04-ux", today: "2026-11-01", topic: "Logo review" };
const me = { who: "marcocyl04-ux" };
const clock = (t = 1_000_000) => { const c = { t, now: () => c.t }; return c; };

test("E4: 'this should go to Frank by Nov 5' in a session with a project chip is an item for Sol · Plan", () => {
  const x = crossingOf({ trail: memoryTrail() });
  const p = x.propose("s1", "this should go to Frank by Nov 5", SOL);
  assert.ok(p, "a proposal");
  assert.equal(p.kind, "item");
  assert.equal(p.title, "Logo review", "\"this\" is the session's topic");
  assert.equal(p.date, "2026-11-05");
  assert.equal(p.whose, "franktsai2008-eng");
  assert.equal(p.whoseName, "Frank", "the card says the name as it was typed");
  assert.equal(p.projectName, "Sol");
  assert.equal(p.spot, "plan");
  assert.equal(p.from, "s1");
});

test("E4: Send writes one trail event and gives an 8 s undo token; Undo within 8 s takes its effect away", async () => {
  const trail = memoryTrail(), c = clock();
  const x = crossingOf({ trail, now: c.now });
  const p = x.propose("s1", "logo review to Frank by Nov 5", SOL)!;
  assert.equal(p.title, "Logo review");
  const s = await x.send(p, me);
  assert.equal(trail.all.length, 1, "one event");
  assert.equal(trail.all[0].kind, "crossing.sent");
  assert.equal(trail.all[0].project, "sol");
  assert.equal(trail.all[0].body?.title, "Logo review");
  assert.equal(s.until - c.t, UNDO_MS);
  assert.equal((await x.landed("sol")).length, 1, "it is in the project");
  c.t += UNDO_MS - 1;
  const u = await x.undo(s.token, me);
  assert.equal(u.ok, true);
  assert.equal(trail.all.length, 2, "undo is a second event; nothing is deleted");
  assert.equal(trail.all[1].ref, trail.all[0].id);
  assert.deepEqual(await x.landed("sol"), [], "its effect is gone");
  const again = await x.undo(s.token, me);
  assert.ok(again.ok && again.already, "a second undo writes nothing");
  assert.equal(trail.all.length, 2);
});

test("E4: after 8 s Undo is refused and the thing stays in the project", async () => {
  const trail = memoryTrail(), c = clock();
  const x = crossingOf({ trail, now: c.now });
  const s = await x.send(x.propose("s1", "logo review to Frank by Nov 5", SOL)!, me);
  c.t += UNDO_MS + 1;
  const u = await x.undo(s.token, me);
  assert.equal(u.ok, false);
  assert.equal((await x.landed("sol")).length, 1);
  assert.equal((await x.undo("no-such-token", me)).ok, false);
});

test("F4: Send pressed twice makes one item, one event", async () => {
  const trail = memoryTrail();
  const x = crossingOf({ trail });
  const p = x.propose("s1", "this should go to Frank by Nov 5", SOL)!;
  const [a, b] = await Promise.all([x.send(p, me), x.send(p, me)]);
  const c = await x.send(p, me);
  assert.equal(trail.all.length, 1, "one event for three presses");
  assert.equal(a.token, b.token);
  assert.equal(a.token, c.token);
  assert.equal(c.again, true);
  assert.equal((await x.landed("sol")).length, 1, "one item");
});

test("F4: Send pressed twice after an Undo sends it again, once", async () => {
  const trail = memoryTrail();
  const x = crossingOf({ trail });
  const p = x.propose("s1", "this should go to Frank by Nov 5", SOL)!;
  const s = await x.send(p, me);
  await x.undo(s.token, me);
  await x.send(p, me); await x.send(p, me);
  assert.equal(trail.all.filter((e) => e.kind === "crossing.sent").length, 2);
  assert.equal((await x.landed("sol")).length, 1);
});

test("the four kinds, and plain words stay a message", () => {
  const k = (t: string) => parse(t, SOL);
  assert.equal(k("every friday summarize what landed in Talk")?.kind, "automation");
  assert.equal(k("write a doc about the onboarding")?.kind, "document");
  assert.equal(k("write a doc about the onboarding")?.title, "The onboarding");
  assert.equal(k("note: the logo files are on Drive")?.kind, "note");
  assert.equal(k("note: the logo files are on Drive")?.title, "The logo files are on Drive");
  assert.equal(k("remind Isaac to fix the notch by friday")?.whose, "isaac-w");
  assert.equal(k("remind Isaac to fix the notch by friday")?.date, "2026-11-06");
  assert.equal(k("what does the build say?"), null);
  assert.equal(k("/clear"), null);
  const x = crossingOf({ trail: memoryTrail() });
  assert.equal(x.propose("s2", "this should go to Frank by Nov 5", { ...SOL, project: null }), null, "no project chip: today's session");
});

test("dates: a month well behind is next year's; tomorrow; the day itself", () => {
  assert.equal(parseDate("by Jan 3", "2026-11-01")?.iso, "2027-01-03");
  assert.equal(parseDate("5 Nov", "2026-11-01")?.iso, "2026-11-05");
  assert.equal(parseDate("due tomorrow", "2026-11-01")?.iso, "2026-11-02");
  assert.equal(parseDate("nothing here", "2026-11-01"), null);
});

// a face on the wire: what the engine sends it, by rid
const face = () => { const got: any[] = []; return { got, w: { send: (m: object) => { got.push(m); } }, by: (rid: string) => got.find((m) => m.rid === rid) }; };
const settle = () => new Promise((r) => setTimeout(r, 30));

test("F7: with the switch off the crossing's messages get no answer and the cross tool is not offered", async () => {
  process.env.SOL_COWORK_V3 = "off";
  const { handleTeam, addTeamFace } = await import("../src/team/wire.ts");
  const { WORK_TOOLS } = await import("../src/work/tools.ts");
  const { coworkV3 } = await import("../src/settings.ts");
  assert.equal(coworkV3(), false);
  const f = face(); addTeamFace(f.w);
  for (const type of ["team.v3.cross.propose", "team.v3.cross.send", "team.v3.cross.undo", "team.v3.cross.landed"])
    await handleTeam(f.w, { type, rid: "off-" + type, sessionId: "s1", text: "logo review to Frank by Nov 5", room: "sol", roomName: "Sol" });
  await settle();
  assert.deepEqual(f.got, [], "nothing answered: today's Cowork");
  assert.ok(!WORK_TOOLS.some((t) => t.name === "cross"), "no cross tool");
  process.env.SOL_COWORK_V3 = "on";
  assert.equal(coworkV3(), true, "SOL_COWORK_V3=on overrides the setting");
});

test("E4 through the wire, and Send pressed twice there: one event, the same token; Undo within 8 s", async () => {
  process.env.SOL_COWORK_V3 = "on";
  const { handleTeam, addTeamFace } = await import("../src/team/wire.ts");
  const f = face(); addTeamFace(f.w);
  await handleTeam(f.w, { type: "team.v3.cross.propose", rid: "p1", sessionId: "s1", text: "logo review by Nov 5", room: "sol", roomName: "Sol", topic: "Logo review" });
  const p = f.by("p1")?.proposal;
  assert.ok(p, "a proposal");
  assert.equal(p.project, "sol"); assert.equal(p.projectName, "Sol"); assert.equal(p.spot, "plan");
  // the card was retitled on the face; the project comes from what the engine proposed, never from the face
  await Promise.all([
    handleTeam(f.w, { type: "team.v3.cross.send", rid: "s1", proposal: { ...p, title: "Logo review, final", project: "elsewhere" } }),
    handleTeam(f.w, { type: "team.v3.cross.send", rid: "s2", proposal: { ...p, title: "Logo review, final", project: "elsewhere" } }),
  ]);
  const a = f.by("s1"), b = f.by("s2");
  assert.ok(a?.token && b?.token);
  assert.equal(a.token, b.token, "pressed twice: one send");
  assert.equal(a.event.id, b.event.id, "one event");
  assert.equal(a.event.project, "sol");
  assert.equal(a.event.body.title, "Logo review, final");
  await handleTeam(f.w, { type: "team.v3.cross.send", rid: "s3", proposal: { id: "x-made-up", title: "x" } });
  assert.ok(f.by("s3")?.error, "a card this engine did not make is refused");
  await handleTeam(f.w, { type: "team.v3.cross.undo", rid: "u1", token: a.token });
  assert.equal(f.by("u1")?.ok, true);
  await handleTeam(f.w, { type: "team.v3.cross.landed", rid: "l1", project: "sol" });
  assert.deepEqual(f.by("l1")?.events, [], "undone: nothing stayed");
  process.env.SOL_COWORK_V3 = "off";
});
