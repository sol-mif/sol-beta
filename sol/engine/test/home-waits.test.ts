// Home 2 (#825): the waits mark and the count (src/home/waits.ts). A block on the stage that waits on the person is one
// Thing on Today while its question is open, so Home's count (today.needs.length, the notch's and the spine's) goes up by
// one. The stage is the real one (work/blocks.ts) in a home of its own, its bus handed to Home as work/wire.ts hands it;
// the Home is a test's (test/fixtures/home/rig.ts), made the live one for the bus. The plan's tests (specs home-plan §6
// Home 2) first, then the edges, then a real engine on its own free port (#1144) for the line in work/wire.ts.
import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { NOW, seed, FIRST } from "./fixtures/home/seed.ts";
import { QUESTION, ANSWERED, BEFORE } from "./fixtures/home/waits.ts";
import { rig, cleanup, type Rig } from "./fixtures/home/rig.ts";
import * as S from "../src/work/blocks.ts";
import { homeStage, setLive } from "../src/home/hooks.ts";
import { homeNow } from "../src/home/wire.ts";
import { byOf, linkOf, thingIdOf, ON_HOME } from "../src/home/waits.ts";
import { isHomeKind } from "../src/contract/kinds.ts";
import { freePort } from "./test-engine.ts";

const heard: any[] = [];
// the bus as work/wire.ts hands it: every Work face, then Home
S.setStageBus((m) => { heard.push(m); homeStage(m); });
const wasHome = process.env.SOL_HOME;
after(() => { S.disarmAll(); S.setStageBus(null); setLive(homeNow); if (wasHome === undefined) delete process.env.SOL_HOME; else process.env.SOL_HOME = wasHome; cleanup(); });
afterEach(() => { setLive(homeNow); heard.length = 0; });

const P = "proj";
const SID = "sess-aaaa1111";
const who = { project: P, sessionId: SID, by: "tester's agent · sess-aaa" };
const today = (ms: any[]) => ms.filter((m) => m.type === "home.today").at(-1);
/** a Home over a home of its own, the stage's home the same, and it the live one (the bus reaches it) */
function home(o: { seed?: boolean; live?: boolean } = {}): Rig {
  const r = rig({ now: NOW });
  process.env.SOL_HOME = r.home;
  if (o.seed !== false) r.seed(seed(NOW));
  if (o.live !== false) setLive(() => r.ctx);
  return r;
}
const kinds = (r: Rig, id?: string) => r.events().filter((e) => isHomeKind(e.kind) && (!id || e.item === id)).map((e) => e.kind);
const waiting = (title = "pick a still for the side") => S.compose(who, { kind: "shots", title, waits: true });

test("a block that waits: Home's count goes up by one, exactly one thing.new, and the Thing is a job's question", async () => {
  const r = home();
  const f = r.face();
  const t0 = today(await r.ask(f, { type: "home.today" }));
  assert.equal(t0.today.needs.length, BEFORE.count);
  assert.equal(t0.today.line, BEFORE.line);
  const b = waiting();
  const id = thingIdOf(P, b.id);
  const t = today(f.got);
  assert.equal(t.today.needs.length, BEFORE.count + 1, "the count is one more");
  // a blocking Thing with no deadline: after the one due today, beside Maya's (older), before the others
  assert.deepEqual(t.today.needs, [FIRST.needs[0], FIRST.needs[1], id, FIRST.needs[2]]);
  assert.equal(t.today.line, "Four things need you. Two are moving on their own.");
  const th = t.things.find((x: any) => x.id === id);
  assert.deepEqual({ read: th.read, state: th.state, waitsOn: th.waitsOn }, QUESTION);
  assert.deepEqual([th.blocks, th.words, th.folder, th.links, th.made, th.card], [true, "pick a still for the side", P, [linkOf(P, b.id)], [], undefined]);
  assert.match(id, /^it-[0-9a-f]{12}$/);
  assert.deepEqual(kinds(r, id), ["thing.new"], "exactly one thing.new, though the stage told two changes (composed, waits)");
  assert.deepEqual(r.events().find((e) => e.item === id).by, { person: "seat", agent: "work" }, "the agent made it wait");
  assert.ok(existsSync(join(r.home, "items", id, "thing.json")));
  assert.ok(heard.some((m) => m.type === "work.stage.changed" && m.block?.id === b.id && m.block.state === "waits"), "the stage's own change went out as before");
});

test("the block's yes in the block: it leaves needs and moves (the face's answer to a question), one thing.state", async () => {
  const r = home();
  const f = r.face();
  const b = waiting();
  const id = thingIdOf(P, b.id);
  S.yes({ ...who, by: "tester · sess-aaa" }, { id: b.id });
  const t = today(f.got);
  assert.deepEqual(t.today.needs, FIRST.needs, "back to the three");
  assert.ok(t.today.moving.includes(id));
  const th = t.things.find((x: any) => x.id === id);
  assert.deepEqual({ state: th.state, waitsOn: th.waitsOn }, ANSWERED);
  assert.deepEqual(kinds(r, id), ["thing.new", "thing.state"]);
  assert.deepEqual(r.events().filter((e) => e.item === id).at(-1).by, { person: "you" }, "the person's own press");
});

test("home.answer on the block's Thing: the block is live with a yes line, the Thing moves, one home.today to the asker", async () => {
  const r = home();
  const f = r.face(), other = r.face();
  const b = waiting();
  const id = thingIdOf(P, b.id);
  const n = other.got.length;
  const got = await r.ask(f, { type: "home.answer", thingId: id, answer: "the left one" });
  assert.equal(got[0].type, "home.done");
  assert.deepEqual([got[0].thingId, got[0].did, got[0].answer], [id, "answer", "the left one"]);
  assert.equal(got.filter((m) => m.type === "home.today").length, 1, "the list once, not once for the stage and once for the answer");
  assert.equal(other.got.slice(n).filter((m) => m.type === "home.today").length, 1);
  assert.equal(other.got.slice(n).filter((m) => m.type === "home.done").length, 0, "the receipt to the asker only");
  const block = S.getBlock(P, b.id)!;
  assert.equal(block.state, "live");
  const last = S.ledger(P, b.id).at(-1)!;
  assert.deepEqual([last.ev, last.note, last.by], ["yes", "the left one", ON_HOME]);
  assert.ok(S.ledgerWhole(S.ledger(P, b.id)));
  const t = today(got);
  assert.ok(!t.today.needs.includes(id) && t.today.moving.includes(id));
  assert.deepEqual(kinds(r, id), ["thing.new", "today.answer", "thing.state"]);
  // the yes in the block cannot be taken back: the answer's undo writes nothing and answers the list as it is
  const before = r.bytes();
  const u = await r.ask(f, { type: "home.undo", ledgerId: got[0].ledgerId });
  assert.deepEqual(u.map((m) => m.type), ["home.today"]);
  assert.ok(today(u).today.moving.includes(id));
  assert.equal(r.bytes(), before, "nothing written");
  assert.equal(S.getBlock(P, b.id)!.state, "live");
});

test("the block waits a second time: the same Thing, no second thing.new; it asks again", async () => {
  const r = home();
  const f = r.face();
  const b = waiting();
  const id = thingIdOf(P, b.id);
  S.yes(who, { id: b.id });
  S.update(who, { id: b.id, waits: true, title: "pick another still" });
  const t = today(f.got);
  assert.ok(t.today.needs.includes(id));
  const th = t.things.find((x: any) => x.id === id);
  assert.deepEqual([th.state, th.waitsOn, th.words], ["asks", "you", "pick another still"]);
  assert.equal(t.things.filter((x: any) => x.id === id).length, 1);
  assert.deepEqual(kinds(r, id), ["thing.new", "thing.state", "thing.state"]);
});

test("a dead block: its Thing is gone, not in the things sent; a frozen one is done", async () => {
  const r = home();
  const f = r.face();
  const dead = waiting("a question closed"), frozen = waiting("a question kept");
  S.place(who, { id: dead.id, close: true });
  S.freeze(who, { id: frozen.id });
  const t = today(f.got);
  const gone = thingIdOf(P, dead.id), done = thingIdOf(P, frozen.id);
  assert.ok(!t.things.some((x: any) => x.id === gone), "not sent at all");
  assert.ok(!t.today.needs.includes(gone) && !t.today.needs.includes(done));
  assert.equal(t.things.find((x: any) => x.id === done).state, "done");
  assert.deepEqual(kinds(r, gone), ["thing.new", "thing.state"]);
  assert.equal(r.events().filter((e) => e.item === gone).at(-1).value.gone, true);
  assert.deepEqual(kinds(r, done), ["thing.new", "thing.done"]);
  S.freeze(who, { id: frozen.id });
  assert.deepEqual(kinds(r, done), ["thing.new", "thing.done"], "frozen again: nothing more");
  assert.deepEqual(t.today.needs, FIRST.needs);
});

test("reconcile at start: a block that began to wait while Home was off has its Thing; one answered meanwhile moves", async () => {
  const r = home({ live: false });
  const b = waiting();
  const answered = waiting("answered while Home was off");
  assert.equal(existsSync(join(r.home, "items", thingIdOf(P, b.id))), false, "Home not listening: no Thing yet");
  // Home hears the second one wait, then is off while its answer comes
  setLive(() => r.ctx);
  S.update(who, { id: answered.id, waits: true });
  setLive(() => null);
  S.yes(who, { id: answered.id });
  const again = r.restart();
  const f = again.face();
  const t = today(await again.ask(f, { type: "home.today" }));
  const id = thingIdOf(P, b.id), moved = thingIdOf(P, answered.id);
  assert.ok(t.today.needs.includes(id), "found waiting at start");
  assert.ok(t.today.moving.includes(moved), "found answered at start");
  assert.deepEqual(kinds(again, id), ["thing.new"]);
  assert.deepEqual(kinds(again, moved), ["thing.new", "thing.state"]);
  assert.deepEqual(again.events().filter((e) => e.item === id)[0].by, { person: "engine" }, "the engine's own reconcile");
  // started once a context: a second ask writes nothing more of the blocks
  await again.ask(f, { type: "home.today" });
  assert.deepEqual(kinds(again, id), ["thing.new"]);
});

test("a stage change pushes home.today to every window without an ask, byte-equal", async () => {
  const r = home();
  const a = r.face(), b = r.face();
  waiting();
  assert.equal(a.got.filter((m) => m.type === "home.today").length, 1);
  assert.deepEqual(a.raw, b.raw);
  // a change that changes no Thing (a block that never waited, moved about) pushes nothing
  const plain = S.compose(who, { kind: "card", title: "a note", body: "x" });
  S.update(who, { id: plain.id, title: "a note again" });
  assert.equal(a.got.filter((m) => m.type === "home.today").length, 1);
});

test("switch off: no Thing, no <HOME>/items, nothing on the log, while work.stage.changed is still sent as before", () => {
  const was = process.env.SOL_HOME_WHOLE;
  try {
    process.env.SOL_HOME_WHOLE = "off";
    const r = home({ seed: false, live: false });
    setLive(homeNow);   // the engine's own: null while Home is off
    const f = r.face();
    const b = waiting();
    S.yes(who, { id: b.id });
    assert.deepEqual(heard.filter((m) => m.block?.id === b.id).map((m) => [m.type, m.block.state, m.line?.ev]),
      [["work.stage.changed", "waits", "composed"], ["work.stage.changed", "waits", "waits"], ["work.stage.changed", "live", "yes"]]);
    assert.equal(existsSync(join(r.home, "items")), false);
    assert.deepEqual(r.events().map((e) => e.kind).filter(isHomeKind), []);
    assert.equal(f.got.length, 0);
  } finally { if (was === undefined) delete process.env.SOL_HOME_WHOLE; else process.env.SOL_HOME_WHOLE = was; }
});

test("a Home over another folder than the stage's home leaves the stage alone", async () => {
  const r = home();
  process.env.SOL_HOME = mkdtempSync(join(tmpdir(), "sol-home-other-"));
  try {
    const f = r.face();
    waiting();
    assert.equal(f.got.length, 0);
    assert.deepEqual(r.events().map((e) => e.kind).filter((k) => k !== "thing.new"), []);
    assert.equal(r.events().length, seed(NOW).length, "the five of the scene, nothing more");
  } finally { rmSync(process.env.SOL_HOME!, { recursive: true, force: true }); process.env.SOL_HOME = r.home; }
});

test("who a stage line is by, as the log says it: the agent a seat, the watch and a run the engine, else the person", () => {
  assert.deepEqual(byOf({ by: "tester's agent · sess-aaa" }), { person: "seat", agent: "work" });
  assert.deepEqual(byOf({ by: "work agent · 12345678" }), { person: "seat", agent: "work" });
  assert.deepEqual(byOf({ by: "the watch" }), { person: "engine" });
  assert.deepEqual(byOf({ by: "the run" }), { person: "engine" });
  assert.deepEqual(byOf(undefined), { person: "engine" });
  assert.deepEqual(byOf({ by: ON_HOME }), { person: "you" });
  assert.deepEqual(byOf({ by: "tester · sess-aaa" }), { person: "you" });
  assert.equal(thingIdOf(P, "abc12345"), thingIdOf(P, "abc12345"));
  assert.notEqual(thingIdOf(P, "abc12345"), thingIdOf("other", "abc12345"));
});

// ---- a real engine: the line in work/wire.ts hands the stage's bus to Home ----
const ENGINE = join(import.meta.dirname, "..");
const dirs: string[] = [];
const engines: ChildProcess[] = [];
const sockets: WebSocket[] = [];
after(async () => {
  for (const s of sockets) s.terminate();
  for (const e of engines) {
    if (e.exitCode !== null || e.signalCode !== null) continue;
    const gone = new Promise((r) => e.once("exit", r));
    e.kill();
    const t = setTimeout(() => e.kill("SIGKILL"), 5000);
    await gone;
    clearTimeout(t);
  }
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
type Msg = { type: string; [k: string]: any };
async function engine(port: number, env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "sol-home-waits-"));
  dirs.push(dir);
  const home = join(dir, "home");
  mkdirSync(home);
  const base = { ...process.env };
  base.SOL_HOME_WHOLE = "off";   // off unless the test says on (on for the team by default since #691)
  const e = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ENGINE, stdio: "ignore",
    env: {
      ...base, SOL_PORT: String(port), SOL_HOME: home, SOL_STATE: join(dir, "state", "work.json"), SOL_TEAM: join(dir, "team", "team.json"),
      SOL_LOGDIR: join(dir, "log"), SOL_LOG: join(dir, "engine.log"), SOL_PROFILE: join(dir, "profile"), SOL_APPDIR: join(dir, "app"),
      SOL_FRAME: "on", SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off", ...env,
    },
  });
  engines.push(e);
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(`${url}/health`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  sockets.push(ws);
  const got: Msg[] = [];
  ws.on("message", (raw) => { got.push(JSON.parse(raw.toString())); });
  await new Promise((r, no) => { ws.once("open", r); ws.once("error", no); });
  const next = async (pred: (m: Msg) => boolean, ms = 30_000): Promise<Msg> => {
    for (let t = 0; t < ms; t += 50) { const m = got.find(pred); if (m) return m; await new Promise((r) => setTimeout(r, 50)); }
    throw new Error("timed out; got " + got.map((m) => m.type).join(" "));
  };
  const log = async (): Promise<Msg[]> => (await (await fetch(`${url}/log`)).json() as { events: Msg[] }).events;
  return { home, got, next, say: (m: object) => ws.send(JSON.stringify(m)), log };
}
const compose = { type: "work.stage.compose", rid: "r1", sessionId: SID, block: { kind: "shots", title: "pick a still for the side", body: "[]", format: "json", waits: true } };

test("a real engine with SOL_HOME_WHOLE=on: a block composed waiting pushes home.today with the count up by one; the answer on Home is the block's yes", { timeout: 120_000 }, async () => {
  const e = await engine(await freePort(), { SOL_HOME_WHOLE: "on" });
  e.say({ type: "home.today" });
  assert.deepEqual((await e.next((m) => m.type === "home.today")).today.needs, []);
  e.say(compose);
  const made = await e.next((m) => m.type === "work.stage.compose" && m.rid === "r1");
  assert.ok(made.block?.id, JSON.stringify(made));
  const pushed = await e.next((m) => m.type === "home.today" && m.today.needs.length === 1);
  const id = pushed.today.needs[0];
  assert.equal(pushed.today.line, "One thing needs you.");
  const th = pushed.things.find((x: any) => x.id === id);
  assert.equal(th.links[0], linkOf(th.folder, made.block.id));
  e.say({ type: "home.answer", thingId: id, answer: "the left one" });
  await e.next((m) => m.type === "home.done");
  await e.next((m) => m.type === "work.stage.changed" && m.block?.id === made.block.id && m.block.state === "live" && m.line?.ev === "yes");
  const after = await e.next((m) => m.type === "home.today" && m.today.needs.length === 0 && m.today.moving.includes(id));
  assert.equal(after.today.line, "Nothing needs you. One is moving on its own.");
  const ks = (await e.log()).map((m) => m.kind).filter(isHomeKind);
  assert.deepEqual(ks.filter((k) => k.startsWith("thing.") || k === "today.answer"), ["thing.new", "today.answer", "thing.state"]);
});

test("a real engine, the switch off: the block's work.stage.changed goes out as before, no home.*, no <HOME>/items, no Home kind", { timeout: 120_000 }, async () => {
  const e = await engine(await freePort(), {});
  e.say(compose);
  const made = await e.next((m) => m.type === "work.stage.compose" && m.rid === "r1");
  await e.next((m) => m.type === "work.stage.changed" && m.block?.id === made.block.id && m.line?.ev === "waits");
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(e.got.filter((m) => m.type.startsWith("home.")).length, 0);
  assert.equal(existsSync(join(e.home, "items")), false);
  const kinds = (await e.log()).map((m) => m.kind);
  assert.ok(kinds.includes("engine.start"), "the frame is on: the log is there");
  assert.deepEqual(kinds.filter(isHomeKind), []);
});
