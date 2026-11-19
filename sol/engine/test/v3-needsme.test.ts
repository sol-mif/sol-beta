// Cowork v3, slice 2 (fr-30, #555), E8: "needs me" is one count on the front and the stage chip: asks addressed to
// me, items handed to me, an owner's yes asked of me. One fold, one number, wherever it is read. And with the switch
// off the team.v3.* messages get no answer (F7, this slice's part).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
process.env.SOL_TEAM = join(tmp("sol-team-"), "team.json");
writeFileSync(process.env.SOL_TEAM, JSON.stringify({ me: { login: "marco", name: "Marco" }, rooms: [
  { id: "sol", name: "Sol", provider: "cloud", repos: [] }, { id: "kaat", name: "Kaat", provider: "cloud", repos: [] }], room: "sol" }));
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_STATE = join(tmp("sol-state-"), "work.json");
process.env.SOL_HOME = tmp("sol-home-");
process.env.SOL_COWORK_V3_TRAIL = join(tmp("sol-v3-"), "plan-trail.jsonl");
process.env.SOL_COWORK_V3 = "off";
delete process.env.DISCORD_WEBHOOK;

await import("../src/creature.ts");   // the engine's own order: creature, then notify (tools.ts reads PING_TOOLS)
const ping = await import("../src/notify.ts");
const P = await import("../src/team/v3/plan.ts");
const TODAY = "2026-11-01";

async function world() {
  const t = P.memoryTrail();
  // an ask to me in Talk (slice 5 writes these), one to Frank, one I answered
  await t.append({ project: "sol", actor: { who: "frank" }, kind: "ask", item: "a1", data: { to: "marco", text: "@Marco the logo?" } });
  await t.append({ project: "sol", actor: { who: "marco" }, kind: "ask", item: "a2", data: { to: "frank", text: "and you?" } });
  await t.append({ project: "kaat", actor: { who: "anna" }, kind: "ask", item: "a3", data: { to: "marco", text: "prices" } });
  await t.append({ project: "kaat", actor: { who: "marco" }, kind: "ask.answered", data: { of: "a3" } });
  // an item handed to me, one I made myself, one handed to me and done
  const l = (await P.drop(t, { project: "sol", actor: { who: "frank" }, title: "icons" })) as { loose: string };
  const r = (await P.toItem(t, { project: "sol", actor: { who: "frank" }, loose: l.loose, today: TODAY })) as { item: { id: string } };
  await P.move(t, { project: "sol", actor: { who: "frank" }, item: r.item.id, whose: "marco" });
  const l2 = (await P.drop(t, { project: "kaat", actor: { who: "marco" }, title: "mine" })) as { loose: string };
  await P.toItem(t, { project: "kaat", actor: { who: "marco" }, loose: l2.loose, today: TODAY });
  // an owner's yes asked of me (slice 6's automations write these)
  await t.append({ project: "kaat", actor: { who: "anna" }, kind: "yes.asked", item: "y1", data: { to: "marco", what: "the Friday summary writes to your Drive" } });
  return { t, handed: r.item.id };
}

test("asks to me, items handed to me and a yes asked of me: one list, one count", async () => {
  const { t } = await world();
  const rec = await P.readAll(t);
  const list = P.needsList(rec, "marco");
  assert.deepEqual(list.map((n) => n.kind).sort(), ["ask", "hand", "yes"]);
  assert.equal(P.needsMe(rec, "marco"), 3);
  assert.equal(P.needsMe(rec, "frank"), 1, "Frank's own: my ask to him");
  assert.equal(P.needsMe(rec, "marco", "sol"), 2);
  assert.equal(P.needsMe(rec, ""), 0);
});

test("the count goes down as each is answered: touched, answered, said yes to", async () => {
  const { t, handed } = await world();
  await P.move(t, { project: "sol", actor: { who: "marco" }, item: handed, state: "doing" });   // in my hands now
  assert.equal(P.needsMe(await P.readAll(t), "marco"), 2);
  await t.append({ project: "sol", actor: { who: "marco" }, kind: "ask.answered", data: { of: "a1" } });
  await t.append({ project: "kaat", actor: { who: "marco" }, kind: "yes.given", data: { of: "y1" } });
  assert.equal(P.needsMe(await P.readAll(t), "marco"), 0);
});

test("the front's tiles add up to the same count", async () => {
  const { t } = await world();
  const rec = await P.readAll(t);
  const tiles = P.front(rec, "marco", [{ id: "sol", name: "Sol" }, { id: "kaat", name: "Kaat" }], TODAY);
  assert.equal(tiles.reduce((n, x) => n + x.count, 0), P.needsMe(rec, "marco"));
});

test("the front and the stage chip (needsme) say one number; no face is pushed a count (the notch was its reader)", async () => {
  const { t } = await world();
  P._setTrail(t);
  const sent: any[] = [];
  const win = { send: (m: object) => sent.push(m) };
  ping._reset();
  ping.addMomentFace(win);
  ping.momentFaceIs(win, "window");
  assert.equal(sent.filter((m) => m.type === "cw3.needsme").length, 0, "nothing before v3 answers");
  const W = await import("../src/team/v3/planwire.ts");
  const f = (await W.handleV3Plan({ type: "team.v3.front", rid: "1" })) as any;
  const n = (await W.handleV3Plan({ type: "team.v3.needsme", rid: "2" })) as any;
  const p = (await W.handleV3Plan({ type: "team.v3.plan", rid: "3", project: "sol" })) as any;
  assert.equal(f.count, 3);
  assert.equal(f.tiles.reduce((s: number, x: any) => s + x.count, 0), 3, "the front");
  assert.equal(n.count, 3, "the stage chip");
  assert.equal(p.count, 3, "inside a project, the same one count");
  const told = sent.filter((m) => m.type === "cw3.needsme");
  assert.equal(told.length, 0, "and after: no face is pushed the count");
  // a later face is not told a count either as it says which face it is
  const late: any[] = [];
  const win2 = { send: (m: object) => late.push(m) };
  ping.addMomentFace(win2); ping.momentFaceIs(win2, "window");
  assert.equal(late.find((m) => m.type === "cw3.needsme"), undefined);
  // a write moves all three together
  const drop = (await W.handleV3Plan({ type: "team.v3.plan", rid: "4", project: "sol", op: "drop", title: "for later" })) as any;
  assert.equal(drop.loose.length, 1);
  const made = (await W.handleV3Plan({ type: "team.v3.plan", rid: "5", project: "sol", op: "toItem", loose: drop.loose[0].id })) as any;
  assert.ok(made.result?.undo, "the drop on the lane answers with its Undo");
  assert.equal(made.items.length, 2);
  P._setTrail(null);
  ping._reset();
});

test("switch off: no v3 route answers (F7, this slice)", async () => {
  process.env.SOL_COWORK_V3 = "off";
  ping._reset();
  const W = await import("../src/team/wire.ts");
  const sent: any[] = [];
  const face = { send: (m: object) => sent.push(m) };
  W.addTeamFace(face);
  for (const type of ["team.v3.front", "team.v3.plan", "team.v3.needsme"]) await W.handleTeam(face, { type, rid: type, project: "sol" });
  assert.equal(sent.length, 0, "no answer at all with the switch off");
  assert.equal("_need" in ping, false, "the notifier keeps no count at all");
  process.env.SOL_COWORK_V3 = "on";
  P._setTrail(P.memoryTrail());
  await W.handleTeam(face, { type: "team.v3.needsme", rid: "on" });
  assert.equal(sent.at(-1)?.type, "team.v3.needsme", "on: it answers");
  assert.equal(sent.at(-1)?.count, 0);
  W.removeTeamFace(face);
  process.env.SOL_COWORK_V3 = "off";
  P._setTrail(null);
});
