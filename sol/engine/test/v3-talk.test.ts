// Cowork v3, slice 5 (fr-30, #558), E12: Talk opens one thread beside an item; a message becomes a loose thing in one
// gesture; @name makes an ask that counts in "needs me". Plus the guest (F5's Talk part) and the switch off (F7, this
// slice): no team.v3.talk/setup/join route answers and the v3 module is not loaded.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
process.env.SOL_TEAM = join(tmp("sol-team-"), "team.json");
writeFileSync(process.env.SOL_TEAM, JSON.stringify({ me: { login: "marco", name: "Marco" }, rooms: [{ id: "sol", name: "Sol", provider: "cloud", repos: [] }], room: "sol" }));
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_STATE = join(tmp("sol-state-"), "work.json");
process.env.SOL_HOME = tmp("sol-home-");
process.env.SOL_COWORK_V3_TALK = join(tmp("sol-v3-"), "slice5.jsonl");
process.env.SOL_COWORK_V3 = "off";
delete process.env.DISCORD_WEBHOOK;

const P = await import("../src/team/v3/port5.ts");
const T = await import("../src/team/v3/talk.ts");
const marco = { person: "marco" }, frank = { person: "frank" }, isaac = { person: "isaac" };

function world() {
  const port = P.memoryPort();
  for (const [who, role] of [["marco", "owner"], ["frank", "owner"], ["isaac", "editor"], ["hannah", "guest"]] as const)
    port.append({ project: "sol", by: marco, kind: "member", item: who, value: { role, in: true, letInBy: "marco" } });
  port.append({ project: "sol", by: frank, kind: "item", item: "i-550", value: { title: "#550 Notch quiet card", state: "review", place: "github", whose: "frank" } });
  port.append({ project: "sol", by: marco, kind: "item", item: "i-rel", value: { title: "Release dev-20261102", state: "open", place: "record", whose: "frank" } });
  port.append({ project: "sol", by: isaac, kind: "loose", item: "l-1", value: { kind: "note", title: "the dots are dark at night", whose: "isaac", place: "record" } });
  return port;
}

test("general plus one thread per item and loose thing, keyed by its id; a line said in one stays in it", () => {
  const port = world();
  const ths = T.threadsOf(port.since("sol"), "marco");
  assert.equal(ths[0].id, "general", "general first");
  assert.deepEqual(new Set(ths.slice(1).map((t) => t.id)), new Set(["i-550", "i-rel", "l-1"]));
  const item = ths.find((t) => t.id === "i-550")!;
  assert.equal(item.kind, "item"); assert.equal(item.whose, "frank"); assert.equal(item.place, "github");   // the two marks
  const r = T.say(port, { project: "sol", by: frank, thread: "i-550", text: "the quiet card breathes once on arrival" });
  assert.ok(!("error" in r));
  assert.equal(T.linesOf(port.since("sol"), "i-550").length, 1);
  assert.equal(T.linesOf(port.since("sol"), "general").length, 0, "nothing leaks into general");
  const after = T.threadsOf(port.since("sol"), "marco");
  assert.equal(after[1].id, "i-550", "the thread with a line comes first after general");
  assert.equal(after[1].lines, 1);
  assert.ok("error" in T.say(port, { project: "sol", by: frank, thread: "i-nope", text: "hello" }), "a thread is a thing of this project");
  const events = port.all.filter((e) => e.kind === "talk");
  assert.equal(events.length, 1, "one line, one talk event");
});

test("a message becomes a loose thing in one gesture: one event, and a second press is the same loose thing", () => {
  const port = world();
  const r = T.say(port, { project: "sol", by: frank, thread: "general", text: "we should make the quiet card breathe less" });
  assert.ok(!("error" in r));
  const before = port.all.length;
  const l = T.toLoose(port, { project: "sol", by: marco, line: r.line.id });
  assert.ok(!("error" in l));
  assert.equal(port.all.length, before + 1, "one gesture, one trail event");
  const ev = port.all.at(-1)!;
  assert.equal(ev.kind, "loose", "the kind slice 0's record folds as a loose thing");
  assert.equal((ev.value as any).whose, "frank", "whose: who said it");
  assert.equal((ev.value as any).from, `talk:${r.line.id}`);
  const rec = P.recordOf(port.since("sol"));
  assert.ok(rec.loose[l.loose], "it is a loose thing in the record");
  assert.equal(T.linesOf(port.since("sol"), "general")[0].loose, l.loose, "the line knows it is in the space");
  const again = T.toLoose(port, { project: "sol", by: marco, line: r.line.id });
  assert.ok(!("error" in again) && again.already && again.loose === l.loose);
  assert.equal(port.all.length, before + 1, "no second event");
  assert.ok(T.threadsOf(port.since("sol"), "marco").some((t) => t.id === l.loose), "the new loose thing has its own thread");
});

test("@name is an ask that counts in needs me, in slice 2's shape; speaking in the thread answers it", () => {
  const port = world();
  const r = T.say(port, { project: "sol", by: frank, thread: "i-rel", text: "@marco can you cut the release by 9? and @nobody" });
  assert.ok(!("error" in r));
  assert.deepEqual(r.line.asks, ["marco"], "only people of the project are named");
  const ask = port.all.find((e) => e.kind === "ask")!;
  assert.equal((ask.value as any).to, "marco", "kind ask, the login in `to`: what slice 2's needsMe counts");
  assert.equal((ask.value as any).about, "i-rel");
  assert.equal(T.openAsks(port.since("sol"), "marco").length, 1, "one thing needs me");
  assert.equal(T.openAsks(port.since("sol"), "frank").length, 0, "naming yourself or others is not an ask to you");
  assert.equal(T.threadsOf(port.since("sol"), "marco").find((t) => t.id === "i-rel")!.asksMe, 1, "the thread shows it");
  // a line elsewhere does not answer it; a line in that thread does
  T.say(port, { project: "sol", by: marco, thread: "general", text: "morning" });
  assert.equal(T.openAsks(port.since("sol"), "marco").length, 1);
  const a = T.say(port, { project: "sol", by: marco, thread: "i-rel", text: "yes, cutting it at 9" });
  assert.ok(!("error" in a) && a.answered.length === 1);
  assert.equal(T.openAsks(port.since("sol"), "marco").length, 0, "answered: the count goes down");
  assert.equal(port.all.filter((e) => e.kind === "ask.answered").length, 1);
  // the answer press, for an ask I do not want to write to
  T.say(port, { project: "sol", by: isaac, thread: "general", text: "@Marco the icons?" });
  const open = T.openAsks(port.since("sol"), "marco");
  assert.equal(open.length, 1, "@Name matches the login whatever its case");
  assert.ok("error" in T.answer(port, { project: "sol", by: frank, ask: open[0].id }), "only the person named answers");
  assert.ok(!("error" in T.answer(port, { project: "sol", by: marco, ask: open[0].id })));
  assert.equal(T.openAsks(port.since("sol"), "marco").length, 0);
});

test("guest: no line in Talk and no loose thing made of one; an agent only when the project lets agents talk", () => {
  const port = world();
  const r = T.say(port, { project: "sol", by: { person: "hannah" }, thread: "general", text: "hi all" });
  assert.ok("error" in r && /guest/.test(r.error));
  const l = T.say(port, { project: "sol", by: frank, thread: "general", text: "a line" });
  assert.ok(!("error" in l));
  assert.ok("error" in T.toLoose(port, { project: "sol", by: { person: "hannah" }, line: l.line.id }));
  assert.ok("error" in T.say(port, { project: "sol", by: { person: "frank", agent: "claude" }, thread: "general", text: "fact: main is green" }));
  port.append({ project: "sol", by: marco, kind: "setting", item: "project", field: "agentsTalk", value: true });
  const ag = T.say(port, { project: "sol", by: { person: "frank", agent: "claude" }, thread: "general", text: "fact: main is green" });
  assert.ok(!("error" in ag) && ag.line.agent === "claude");
});

test("switch off: no team.v3.talk / setup / join route answers (F7, this slice)", async () => {
  process.env.SOL_COWORK_V3 = "off";
  const W = await import("../src/team/wire.ts");
  const sent: any[] = [];
  const face = { send: (m: object) => sent.push(m) };
  W.addTeamFace(face);
  for (const type of ["team.v3.talk.threads", "team.v3.talk.say", "team.v3.talk.loose", "team.v3.setup.open", "team.v3.setup.yes", "team.v3.setup.like", "team.v3.join.link", "team.v3.join.open", "team.v3.join.letin"])
    await W.handleTeam(face, { type, rid: type, project: "sol", text: "hi" });
  assert.equal(sent.length, 0, "no answer at all with the switch off");
  await W.handleTeam(face, { type: "team.hello" });   // a Cowork face: the one pushes reach
  process.env.SOL_COWORK_V3 = "on";
  P._setPort(P.memoryPort());
  await W.handleTeam(face, { type: "team.v3.talk.threads", rid: "on", project: "sol" });
  assert.equal(sent.at(-1)?.type, "work.v3.talk.threads", "on: it answers, as work.v3.*");
  assert.equal(sent.at(-1)?.threads?.[0]?.id, "general");
  await W.handleTeam(face, { type: "team.v3.talk.say", rid: "say", project: "sol", thread: "general", text: "@marco hello" });
  assert.ok(sent.some((m) => m.type === "work.v3.talk.line" && m.text === "@marco hello"), "a line is pushed to the faces");
  W.removeTeamFace(face);
  process.env.SOL_COWORK_V3 = "off";
  P._setPort(null);
});
