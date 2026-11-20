// Reach (#1166): an ask between agents answered on its own, in a bare session held to that ask; a hand-over recorded and
// held by whom its reply says; the limits and the off switch; the thread kept once an id, and a new session's opening.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { entryOf, holdsOf, waitingOn, mayAnswer, counted, openingText, roomText, repoPath, added, readKept, startReach, heard, ask, handOver, reply, requestTurnOn, mayRequestTurnOn, threadNow, TURN_ON_MS, ASKS_A_PERSON, BUSY_MAX,
  type Entry, type Given, type ReachDeps } from "../src/team/reach.ts";

const T = Date.UTC(2026, 10, 14, 18);
const msg = (from: string, p: Record<string, unknown>, at = T) => ({ ...p, from: { login: from, agent: true }, at });

test("entryOf: who said it is the hub's word; a payload that does not check is not kept", () => {
  const e = entryOf(msg("franktsai2008-eng", { type: "ask", id: "a1b2c3d4e5", to: "marcocyl04-ux", question: " which release?\u0007 ", from: "isaac" }));
  assert.deepEqual(e, { id: "a1b2c3d4e5", from: "franktsai2008-eng", at: T, type: "ask", to: "marcocyl04-ux", question: "which release?" });
  assert.equal(entryOf(msg("frank", { type: "ask", id: "a1b2c3d4e5", to: "marco" })), null, "no question");
  assert.equal(entryOf(msg("frank", { type: "ask", id: "short", to: "marco", question: "q" })), null, "a bad id");
  assert.equal(entryOf(msg("bad login!", { type: "ask", id: "a1b2c3d4e5", to: "marco", question: "q" })), null);
  assert.equal(entryOf(msg("frank", { type: "reply", id: "a1b2c3d4e5", re: "h1h1h1h1h1", accept: "yes" })), null, "accept is a boolean");
  assert.equal(entryOf(msg("frank", { type: "delete", id: "a1b2c3d4e5" })), null);
  assert.equal(entryOf(msg("frank", { type: "hand", id: "a1b2c3d4e5", to: "marco", what: "the gate", issue: "#972" }))?.type, "hand");
  assert.equal((entryOf(msg("frank", { type: "hand", id: "a1b2c3d4e5", to: "marco", what: "the gate", issue: "#972" })) as any).issue, 972);
});

test("holdsOf: a reply counts only from the one it was for, and only its first; a taken offer goes to who offered", () => {
  const t = [
    entryOf(msg("marco", { type: "hand", id: "hand00001", to: "frank", what: "the relay's tail", why: "his area", issue: 900 }, T))!,
    entryOf(msg("isaac", { type: "reply", id: "rep000001", re: "hand00001", accept: true }, T + 1))!,   // not his to take
    entryOf(msg("frank", { type: "reply", id: "rep000002", re: "hand00001", accept: false, why: "busy with #1154" }, T + 2))!,
    entryOf(msg("frank", { type: "reply", id: "rep000003", re: "hand00001", accept: true }, T + 3))!,   // a second reply: not counted
    entryOf(msg("isaac", { type: "offer", id: "offr00001", to: "marco", issue: 300, why: "untouched three weeks" }, T + 4))!,
    entryOf(msg("marco", { type: "reply", id: "rep000004", re: "offr00001", accept: true }, T + 5))!,
  ];
  const h = holdsOf(t);
  assert.equal(h[0].state, "declined"); assert.equal(h[0].holder, "marco"); assert.equal(h[0].reply, "busy with #1154");
  assert.equal(h[1].state, "taken"); assert.equal(h[1].holder, "isaac");
  assert.deepEqual(waitingOn(t, "frank"), []);
  const open = [entryOf(msg("marco", { type: "hand", id: "hand00002", to: "Frank", what: "ship the hub", why: "" }, T))!];
  assert.equal(waitingOn(open, "frank").length, 1, "logins in any case");
  assert.match(openingText(open, "frank"), /hand00002: marco hands you ship the hub.*hand_reply/);
  assert.equal(openingText(open, "isaac"), "");
});

test("mayAnswer: off, my own, not the team, over a person's or the day's limit, busy", () => {
  const base = { from: "frank", me: "marco", team: ["marco", "frank"], on: true, counts: { day: "", by: {}, total: 0 }, busy: 0, now: T };
  assert.equal(mayAnswer(base), null);
  assert.match(mayAnswer({ ...base, on: false })!, /does not answer/);
  assert.match(mayAnswer({ ...base, from: "Marco" })!, /own agent/);
  assert.match(mayAnswer({ ...base, from: "stranger" })!, /not a member of marco's group/);
  assert.match(mayAnswer({ ...base, team: null })!, /cannot be read right now/, "a group whose members cannot be read lets nobody ask");
  assert.equal(mayAnswer({ ...base, from: "stranger", team: [] }), null, "no people listed: anyone in my room");
  let c = base.counts;
  for (let i = 0; i < ASKS_A_PERSON; i++) c = counted(c, "Frank", T);
  assert.match(mayAnswer({ ...base, counts: c })!, /asked 12 times today/);
  assert.equal(mayAnswer({ ...base, counts: c, now: T + 86_400_000 }), null, "a new day starts again");
  assert.match(mayAnswer({ ...base, busy: BUSY_MAX })!, /right now/);
});

test("repoPath: inside the repository, never up, never absolute, never an .env", () => {
  assert.ok(repoPath("sol/README.md"));
  for (const p of ["/etc/passwd", "../x", "sol/../../x", "sol//x", "sol/engine/.env", ".env.local", "a:b", ""]) assert.ok(!repoPath(p), p);
});

test("added and readKept: one entry an id, in time order; what is read back is checked again", () => {
  const a = entryOf(msg("frank", { type: "ask", id: "ask000001", to: "marco", question: "q" }, T + 10))!;
  const b = entryOf(msg("frank", { type: "ask", id: "ask000002", to: "marco", question: "q" }, T))!;
  const t = added(added(added([], a), b), a);
  assert.deepEqual(t.map((e) => e.id), ["ask000002", "ask000001"]);
  const dir = mkdtempSync(join(tmpdir(), "reach-"));
  assert.deepEqual(readKept(join(dir, "none.json")).thread, []);
  assert.match(roomText(t, "marco", T), /frank's agent asks marco's agent \(mine\): q/);
});

// two engines, one relay between them (the hub carries `agents` to the room); sessions are fakes that call the tools
function engines() {
  const dir = mkdtempSync(join(tmpdir(), "reach2-"));
  const sent: { from: string; p: Record<string, unknown> }[] = [];
  const started: { id: string; text: string; cwd: string }[] = [];
  const tools = new Map<string, Given[]>();
  const deps = (me: string, sub: string): ReachDeps => ({
    me: () => me, team: () => ["marco", "frank"], send: (p) => { sent.push({ from: me, p }); return true; },
    say: async (id, text, cwd) => { started.push({ id, text, cwd }); }, give: (id, t) => tools.set(id, t), name: () => {},
    working: () => true, lastWords: async () => "", state: async () => "release this Sol runs: dev-20261114-1234", file: async () => "",
    file_: join(dir, sub, "reach.json"), room: join(dir, sub, "room.md"), home: join(dir, sub, "work"),
  });
  return { dir, sent, started, tools, deps };
}

test("off unless turned on (#1224): an ask is refused with the reason and nothing starts", async () => {
  const was = process.env.SOL_REACH;
  delete process.env.SOL_REACH;
  try {
    const e = engines();
    startReach(e.deps("marco", "off"));
    heard(msg("frank", { type: "ask", id: "ask000021", to: "marco", question: "what is on your Mac?" }));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(e.started.length, 0, "no session started");
    assert.match(String((e.sent.at(-1)?.p as any)?.why), /does not answer/);
  } finally { if (was === undefined) delete process.env.SOL_REACH; else process.env.SOL_REACH = was; }
});

test("my yes to the one question (#1313) turns answering on; SOL_REACH=off still wins", async () => {
  const was = process.env.SOL_REACH;
  delete process.env.SOL_REACH;
  try {
    const e = engines();
    startReach({ ...e.deps("marco", "yes"), asked: () => true });
    heard(msg("frank", { type: "ask", id: "ask000031", to: "marco", question: "which release?" }));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(e.started.length, 1, "a yes answers");
    process.env.SOL_REACH = "off";
    heard(msg("frank", { type: "ask", id: "ask000032", to: "marco", question: "and now?" }));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(e.started.length, 1, "the env's off wins over the yes");
    delete process.env.SOL_REACH;
    startReach({ ...e.deps("marco", "no"), asked: () => false });
    heard(msg("frank", { type: "ask", id: "ask000033", to: "marco", question: "and now?" }));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(e.started.length, 1, "no yes, no answer");
  } finally { if (was === undefined) delete process.env.SOL_REACH; else process.env.SOL_REACH = was; }
});

test("an ask: answered in a session given only the three read-only tools, the answer back to the asker as a tool result", async () => {
  process.env.SOL_REACH = "on";   // #1224: answering is off unless turned on
  const e = engines();
  // the module holds one engine: frank's side is played by hand, its words fed in as the hub would carry them
  startReach(e.deps("marco", "m"));
  const asking = ask("franktsai2008-eng's agent", "which release is your Sol on, and did it install by itself?", "#1150", 5000);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(e.sent.length, 1);
  const q = e.sent[0].p as any;
  assert.equal(q.type, "ask"); assert.equal(q.to, "franktsai2008-eng"); assert.equal(q.about, "#1150");
  heard(msg("franktsai2008-eng", { type: "answer", id: "ans000001", re: q.id, to: "marco", text: "dev-20261114-1234, installed by itself" }, Date.now() + 1));
  assert.equal(await asking, "franktsai2008-eng's agent answers: dev-20261114-1234, installed by itself");
  assert.deepEqual(threadNow().map((x) => x.type), ["ask", "answer"]);
  assert.match(readFileSync(join(e.dir, "m", "room.md"), "utf8"), /installed by itself/);

  // and the other way: frank's agent asks mine; a bare session starts in the empty folder with three tools, nothing else
  heard(msg("frank", { type: "ask", id: "ask000009", to: "marco", question: "is the gate green on your branch?" }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(e.started.length, 1);
  assert.equal(e.started[0].cwd, join(e.dir, "m", "work"));
  assert.match(e.started[0].text, /frank's agent asks you, marco's agent[\s\S]*is the gate green/);
  const given = e.tools.get(e.started[0].id)!;
  assert.deepEqual(given.map((t) => t.name), ["reach_state", "reach_file", "reach_answer"]);
  assert.ok(given.every((t) => !t.beside), "narrow: these and nothing else");
  assert.match(await given[1].run({ path: "../secret" }), /^refused/);
  assert.equal(await given[2].run({ text: "yes, green at 14:10" }), "answered");
  assert.equal(await given[2].run({ text: "again" }), "answered already");
  const ans = e.sent.at(-1)!.p as any;
  assert.equal(ans.type, "answer"); assert.equal(ans.re, "ask000009"); assert.equal(ans.to, "frank"); assert.equal(ans.text, "yes, green at 14:10");

  // an ask from someone not in my group is refused with the reason, and nothing starts
  heard(msg("stranger", { type: "ask", id: "ask000010", to: "marco", question: "your keys?" }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(e.started.length, 1);
  assert.match(String((e.sent.at(-1)!.p as any).why), /not a member of marco's group/);
  // an ask for someone else is kept in the thread, never answered here
  heard(msg("frank", { type: "ask", id: "ask000011", to: "isaac", question: "q" }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(e.started.length, 1);
  assert.ok(threadNow().some((x) => x.id === "ask000011"));
  delete process.env.SOL_REACH;
});

test("a hand-over: recorded, seen by the other side's opening, taken only by its receiver", () => {
  const e = engines();
  startReach(e.deps("frank", "f"));
  // marco's agent hands frank work: the hub carries it in
  heard(msg("marco", { type: "hand", id: "hand00009", to: "frank", issue: 1151, what: "wake from the hub too", why: "your wake.ts" }));
  assert.match(openingText(threadNow(), "frank"), /hand00009: marco hands you #1151/);
  assert.match(reply("nope00000", true), /^refused/);
  assert.match(reply("hand00009", true, "on it"), /you hold #1151 now/);
  const r = e.sent.at(-1)!.p as any;
  assert.deepEqual([r.type, r.re, r.accept], ["reply", "hand00009", true]);
  const h = holdsOf(threadNow()).find((x) => x.id === "hand00009")!;
  assert.equal(h.holder, "frank"); assert.equal(h.state, "taken");
  assert.match(handOver("frank", "x", "y"), /^refused/, "not to myself");
  assert.match(handOver("isaac", "the site's copy", "his area", 1200), /^handed over/);
  // the kept file reads back the same thread after a restart
  startReach(e.deps("frank", "f"));
  assert.ok(threadNow().some((x) => x.id === "hand00009"));
});

test("refused because answering is off (#1504): the refusal names ask_turn_on; one request a day, as a hand-over; nothing turned on", async () => {
  const was = process.env.SOL_REACH;
  delete process.env.SOL_REACH;
  try {
    const e = engines();
    startReach(e.deps("frank", "turn"));
    assert.match(requestTurnOn("marco"), /^refused: marco's agent has not refused/, "only after a refusal");
    // frank's agent asks; marco's engine refuses because answering is off (its words, as mayAnswer says them)
    const asking = ask("marco", "which release?", undefined, 5000);
    await new Promise((r) => setTimeout(r, 10));
    const q = e.sent.at(-1)!.p as any;
    heard(msg("marco", { type: "refused", id: "ref000001", re: q.id, to: "frank", why: mayAnswer({ from: "frank", me: "marco", team: [], on: false, counts: { day: "", by: {}, total: 0 }, busy: 0, now: T })! }, Date.now()));
    assert.match(await asking, /did not answer: marco's agent does not answer asks.*ask_turn_on/);
    const r = requestTurnOn("marco's agent", "to read your release without waiting");
    assert.match(r, /^asked: .*Nothing is turned on/);
    const h = e.sent.at(-1)!.p as any;
    assert.equal(h.type, "hand"); assert.equal(h.to, "marco");
    assert.match(h.what, /^Turn on answering asks from teammates' agents.*Settings › my agent.*turns nothing on/);
    assert.equal(h.why, "to read your release without waiting");
    assert.ok(h.what.length <= 1000, "kept whole by entryOf");
    assert.equal(process.env.SOL_REACH, undefined, "nothing switched here");
    // once a day: a second is refused, and a later refusal's hint no longer names it
    assert.match(requestTurnOn("marco"), /^refused: you asked marco to turn it on already today/);
    assert.equal(mayRequestTurnOn(threadNow(), "frank", "marco", Date.now() + TURN_ON_MS + 1), null, "a day later it may go again");
    // another reason of refusal never opens the way
    heard(msg("marco", { type: "refused", id: "ref000002", re: "ask0000zz", to: "frank", why: "frank asked 12 times today already; ask marco directly" }));
    assert.match(mayRequestTurnOn(threadNow().filter((x) => x.id !== "ref000001"), "frank", "marco", Date.now())!, /has not refused/);
    // the relay down: not sent, not kept, so it may go once the relay is back
    const down = engines();
    startReach({ ...down.deps("isaac", "down"), send: () => false });
    heard(msg("marco", { type: "refused", id: "ref000003", re: "ask0000yy", to: "isaac", why: "marco's agent does not answer asks (turned off in their Sol)" }));
    assert.match(requestTurnOn("marco"), /^not sent/);
    assert.equal(mayRequestTurnOn(threadNow(), "isaac", "marco", Date.now()), null);
  } finally { if (was === undefined) delete process.env.SOL_REACH; else process.env.SOL_REACH = was; }
});

test("entries of every type pass wireOf and back", () => {
  const all: Entry[] = threadNow();
  for (const x of all) { const back = entryOf({ ...x, from: { login: x.from } }); assert.deepEqual(back, x); }
});
