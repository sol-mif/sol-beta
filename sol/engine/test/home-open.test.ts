// Home 7 (#830): one thing in both modes (src/home/open.ts). A job frozen on the stage is done on Home: every Thing that
// stands for the block (its own, Home 2's, and any other linked to it) gets one thing.done by whoever froze it, leaves the
// list and is not missed in the evening; thing.open {id, mode} records "open on the stage" / "back to Home" and answers
// the list. The stage is the real one (work/blocks.ts) in a home of its own, its bus handed to Home as work/wire.ts hands
// it; the Home is a test's (test/fixtures/home/rig.ts). The plan's tests (specs home-plan §6 Home 7) first, then the
// edges, then a real engine on its own free port (#1144) for the Try line: open a job on the stage, freeze it, Home shows
// it done. Not here: "home.ledger lists one entry for it", which waits for Home 6 (the ledger) on this branch.
import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { NOW, seed, FIRST } from "./fixtures/home/seed.ts";
import { AFTER_FREEZE, OPEN_FIELDS, missedOf } from "./fixtures/home/open.ts";
import { rig, cleanup, type Rig } from "./fixtures/home/rig.ts";
import * as S from "../src/work/blocks.ts";
import { homeStage, setLive } from "../src/home/hooks.ts";
import { handleHome, homeHandles, homeNow } from "../src/home/wire.ts";
import { byOf, linkOf, thingIdOf } from "../src/home/waits.ts";
import { blocksOf, standsFor } from "../src/home/open.ts";
import { MODES, OPEN, OpenAsk } from "../src/contract/home/open.ts";
import { TodayMsg, type Thing } from "../src/contract/home/today.ts";
import { isHomeKind, kindRow } from "../src/contract/kinds.ts";
import { freePort } from "./test-engine.ts";

// the bus as work/wire.ts hands it: every Work face, then Home
S.setStageBus((m) => { homeStage(m); });
const wasHome = process.env.SOL_HOME;
after(() => { S.disarmAll(); S.setStageBus(null); setLive(homeNow); if (wasHome === undefined) delete process.env.SOL_HOME; else process.env.SOL_HOME = wasHome; cleanup(); });
afterEach(() => { setLive(homeNow); });

const P = "proj";
const SID = "sess-bbbb2222";
const person = { project: P, sessionId: SID, by: "tester · sess-bbb" };
const agent = { project: P, sessionId: SID, by: "tester's agent · sess-bbb" };
const today = (ms: any[]) => ms.filter((m) => m.type === "home.today").at(-1);
/** a Home over a home of its own, the stage's home the same, and it the live one (the bus reaches it) */
function home(o: { live?: boolean } = {}): Rig {
  const r = rig({ now: NOW });
  process.env.SOL_HOME = r.home;
  if (o.live !== false) setLive(() => r.ctx);
  return r;
}
const kinds = (r: Rig, id?: string) => r.events().filter((e) => isHomeKind(e.kind) && (!id || e.item === id)).map((e) => e.kind);
/** a job on the stage: a block (not waiting), and the scene's moving job t-lab-prep linked to it, as opened there */
function jobOnStage(r: Rig, extra: Thing[] = []) {
  const b = S.compose(agent, { kind: "card", title: "lab prep", body: "steps" });
  r.seed([...seed(NOW).map((t) => (t.id === "t-lab-prep" ? { ...t, links: [linkOf(P, b.id)] } : t)), ...extra]);
  return b;
}

test("a job on the stage is frozen: its Thing is done, exactly one thing.done by the freezer, not in needs or moving, in its folder", async () => {
  const r = home();
  const f = r.face(), other = r.face();
  const b = jobOnStage(r);
  assert.deepEqual(today(await r.ask(f, { type: "home.today" })).today.moving, FIRST.moving);
  S.freeze(person, { id: b.id });
  const t = today(f.got);
  assert.deepEqual(t.today.needs, AFTER_FREEZE.needs);
  assert.deepEqual(t.today.moving, AFTER_FREEZE.moving);
  assert.equal(t.today.line, AFTER_FREEZE.line);
  const th = t.things.find((x: any) => x.id === "t-lab-prep");
  assert.deepEqual([th.state, th.waitsOn, th.folder], ["done", "none", "school › chem 110"], "done, sent on the day it was done, in its folder");
  assert.deepEqual(kinds(r, "t-lab-prep"), ["thing.new", "thing.done"]);
  const done = r.events().filter((e) => e.item === "t-lab-prep").at(-1);
  assert.deepEqual(done.by, { person: "you" }, "the person froze it");
  assert.deepEqual(other.raw.at(-1), f.raw.at(-1), "every window gets the same list, unasked");
  // freezing again (a second version) writes nothing more, and pushes nothing
  const n = f.got.length, before = r.bytes();
  S.freeze(person, { id: b.id });
  assert.equal(r.bytes(), before);
  assert.equal(f.got.length, n);
});

test("the evening: a job due this morning and frozen is not missed; before the freeze it was", async () => {
  const r = home();
  const f = r.face();
  const b = S.compose(agent, { kind: "card", title: "lab report", body: "x" });
  const due: Thing = { id: "t-lab-report", read: "job", folder: "school › chem 110", words: "lab report", state: "asks", waitsOn: "you", due: NOW - 36e5, at: NOW - 5 * 36e5, links: [linkOf(P, b.id)], made: [] };
  r.seed([due]);
  r.clock.now = NOW + 10 * 36e5;   // the evening, 18:40
  assert.deepEqual(missedOf(today(await r.ask(f, { type: "home.today" })).things, r.clock.now).map((x) => x.id), ["t-lab-report"]);
  S.freeze(agent, { id: b.id });
  const t = today(f.got);
  assert.deepEqual(missedOf(t.things, r.clock.now), []);
  assert.deepEqual(t.today.needs, []);
  assert.equal(t.things.find((x: any) => x.id === "t-lab-report").state, "done");
  assert.deepEqual(r.events().filter((e) => e.item === "t-lab-report").at(-1).by, { person: "seat", agent: "work" }, "the agent froze it");
});

test("one freeze: the block's own Thing (Home 2's) and a Thing linked to it are each done once; a gone or done one is left", async () => {
  const r = home();
  const f = r.face();
  const b = S.compose(agent, { kind: "shots", title: "pick a still", waits: true });
  const own = thingIdOf(P, b.id), link = linkOf(P, b.id);
  const th = (id: string, o: Partial<Thing>): Thing => ({ id, read: "job", folder: P, words: id, state: "moving", waitsOn: "agent", at: NOW, links: [link], made: [], ...o });
  r.seed([th("t-linked", {}), th("t-gone", { gone: true } as Partial<Thing>), th("t-was-done", { state: "done", waitsOn: "none" }), th("t-other", { links: [linkOf(P, "ffff0000")] })]);
  const before = { gone: kinds(r, "t-gone"), done: kinds(r, "t-was-done"), other: kinds(r, "t-other") };
  S.freeze(person, { id: b.id });
  assert.deepEqual(kinds(r, own), ["thing.new", "thing.done"]);
  assert.deepEqual(kinds(r, "t-linked"), ["thing.new", "thing.done"]);
  assert.deepEqual({ gone: kinds(r, "t-gone"), done: kinds(r, "t-was-done"), other: kinds(r, "t-other") }, before);
  const t = today(f.got);
  assert.ok(!t.today.needs.includes(own) && !t.today.moving.includes("t-linked"));
  assert.ok(t.today.moving.includes("t-other"), "a Thing of another block goes on");
});

test("reconcile at start: a job frozen while Home was off is done at start, by the engine, once", async () => {
  const r = home({ live: false });
  const b = jobOnStage(r);
  S.freeze(person, { id: b.id });
  assert.deepEqual(kinds(r, "t-lab-prep"), ["thing.new"], "Home not listening: nothing yet");
  const again = r.restart();
  const f = again.face();
  const t = today(await again.ask(f, { type: "home.today" }));
  assert.deepEqual(t.today.moving, AFTER_FREEZE.moving);
  assert.equal(t.things.find((x: any) => x.id === "t-lab-prep").state, "done");
  assert.deepEqual(kinds(again, "t-lab-prep"), ["thing.new", "thing.done"]);
  assert.deepEqual(again.events().filter((e) => e.item === "t-lab-prep").at(-1).by, { person: "engine" });
  await again.ask(f, { type: "home.today" });
  assert.deepEqual(kinds(again, "t-lab-prep"), ["thing.new", "thing.done"]);
});

test("thing.open on a known id: one thing.open event, home.today to every window; no block is made, nothing of the Thing changes", async () => {
  const r = home();
  r.seed(seed(NOW));
  const f = r.face(), other = r.face();
  const thing = JSON.stringify(r.ctx.items.get("t-maya-data"));
  const got = await r.ask(f, { type: OPEN, id: "t-maya-data" });
  assert.deepEqual(got.map((m) => m.type), ["home.today"]);
  assert.deepEqual(other.raw.at(-1), f.raw.at(-1));
  assert.deepEqual(today(got).today.needs, FIRST.needs);
  const evs = r.events().filter((e) => e.kind === "thing.open");
  assert.equal(evs.length, 1);
  assert.deepEqual([evs[0].item, evs[0].value, evs[0].by], ["t-maya-data", { mode: "build" }, { person: "you" }]);
  assert.equal(JSON.stringify(r.ctx.items.get("t-maya-data")), thing);
  assert.deepEqual(S.projects(), [], "no project, no block made for a Thing with none");
  // back to Home: the same, its mode said
  await r.ask(f, { type: OPEN, id: "t-maya-data", mode: "home" });
  assert.deepEqual(r.events().filter((e) => e.kind === "thing.open").map((e) => e.value.mode), ["build", "home"]);
});

test("thing.open on a Thing with a block: only recorded; the block is as it was", async () => {
  const r = home();
  const b = jobOnStage(r);
  const f = r.face();
  const was = JSON.stringify(S.getBlock(P, b.id)), lines = S.ledger(P, b.id).length;
  await r.ask(f, { type: OPEN, id: "t-lab-prep", mode: "build" });
  assert.deepEqual(kinds(r, "t-lab-prep"), ["thing.new", "thing.open"]);
  assert.equal(JSON.stringify(S.getBlock(P, b.id)), was);
  assert.equal(S.ledger(P, b.id).length, lines);
});

test("thing.open on an unknown id, a gone Thing, no id or a mode it does not know: home.today to the asker only, zero events", async () => {
  const r = home();
  r.seed([...seed(NOW), { id: "t-gone", read: "note", folder: "", words: "gone", state: "read", waitsOn: "none", at: NOW, links: [], made: [], gone: true } as Thing]);
  const f = r.face(), other = r.face();
  const before = r.bytes();
  for (const m of [{ type: OPEN, id: "nobody" }, { type: OPEN, id: "t-gone" }, { type: OPEN }, { type: OPEN, id: "t-maya-data", mode: "stage" }, { type: OPEN, id: 7 }]) {
    const got = await r.ask(f, m);
    assert.deepEqual(got.map((x) => x.type), ["home.today"], JSON.stringify(m));
  }
  assert.equal(r.bytes(), before, "nothing written");
  assert.equal(other.got.length, 0, "the others are told nothing");
});

test("the contract: thing.open {id, mode} as Marco's design names it, the two modes, the kind's row, one handler in the table", () => {
  assert.equal(OPEN, "thing.open");
  assert.deepEqual(Object.keys(OpenAsk.shape).filter((k) => k !== "type"), OPEN_FIELDS);
  assert.deepEqual([...MODES], ["build", "home"]);
  assert.ok(OpenAsk.safeParse({ type: "thing.open", id: "t-1" }).success);
  assert.ok(OpenAsk.safeParse({ type: "thing.open", id: "t-1", mode: "home", rid: "r" }).success);
  assert.ok(!OpenAsk.safeParse({ type: "thing.open", id: "t-1", mode: "stage" }).success);
  assert.ok(!OpenAsk.safeParse({ type: "thing.open", id: "" }).success);
  assert.deepEqual(kindRow("thing.open")?.carries, { mode: "name" });
  assert.equal(homeHandles("thing.open"), true);
  assert.ok(TodayMsg.safeParse({ type: "home.today", today: { needs: [], moving: [], week: [], line: "Nothing needs you." }, things: [] }).success);
  // the links a Thing stands for blocks by (pure)
  const link = linkOf(P, "abcd1234");
  assert.deepEqual(blocksOf({ links: ["run:x", link, "block:bad"] }), [{ project: P, id: "abcd1234" }]);
  const t: Thing = { id: "x", read: "job", folder: "", words: "", state: "moving", waitsOn: "agent", at: 0, links: [link], made: [] };
  assert.ok(standsFor(t, P, "abcd1234") && !standsFor(t, P, "abcd9999"));
  assert.ok(standsFor({ ...t, links: [], id: thingIdOf(P, "abcd9999") }, P, "abcd9999"));
});

test("switch off: a frozen block changes no Thing, no <HOME>/items, no Home kind; thing.open is not answered", async () => {
  const was = process.env.SOL_HOME_WHOLE;
  try {
    process.env.SOL_HOME_WHOLE = "off";
    const r = home({ live: false });
    setLive(homeNow);   // the engine's own: null while Home is off
    const b = S.compose(agent, { kind: "card", title: "lab prep", body: "x" });
    S.freeze(person, { id: b.id });
    assert.equal(existsSync(join(r.home, "items")), false);
    assert.deepEqual(r.events().map((e) => e.kind).filter(isHomeKind), []);
    const f = r.face();
    await handleHome(f, { type: OPEN, id: "t-maya-data" });   // no context: the live one, null while off
    assert.equal(f.got.length, 0);
    assert.equal(homeNow(), null);
    assert.ok(!readdirSync(r.home).includes("items"));
  } finally { if (was === undefined) delete process.env.SOL_HOME_WHOLE; else process.env.SOL_HOME_WHOLE = was; }
});

// ---- a real engine: the Try line over the socket ----
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
  const dir = mkdtempSync(join(tmpdir(), "sol-home-open-"));
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
const compose = { type: "work.stage.compose", rid: "r1", sessionId: SID, block: { kind: "shots", title: "lab prep", body: "[]", format: "json", waits: true } };

test("a real engine with SOL_HOME_WHOLE=on: open a job on the stage, freeze it, Home shows it done", { timeout: 120_000 }, async () => {
  const e = await engine(await freePort(), { SOL_HOME_WHOLE: "on" });
  e.say(compose);
  const made = await e.next((m) => m.type === "work.stage.compose" && m.rid === "r1");
  assert.ok(made.block?.id, JSON.stringify(made));
  const id = (await e.next((m) => m.type === "home.today" && m.today.needs.length === 1)).today.needs[0];
  const n = e.got.length;
  e.say({ type: OPEN, id, mode: "build" });
  await e.next((m) => e.got.indexOf(m) >= n && m.type === "home.today");
  assert.deepEqual((await e.log()).filter((m) => m.kind === "thing.open").map((m) => [m.item, m.value?.mode]), [[id, "build"]]);
  e.say({ type: "work.stage.freeze", rid: "r2", sessionId: SID, id: made.block.id });
  const frozen = await e.next((m) => m.type === "work.stage.changed" && m.block?.id === made.block.id && m.line?.ev === "frozen");
  const shown = await e.next((m) => m.type === "home.today" && m.things.some((t: any) => t.id === id && t.state === "done"));
  assert.deepEqual([shown.today.needs, shown.today.moving, shown.today.line], [[], [], "Nothing needs you."]);
  const ks = (await e.log()).filter((m) => isHomeKind(m.kind) && m.item === id);
  assert.deepEqual(ks.map((m) => m.kind), ["thing.new", "thing.open", "thing.done"]);
  assert.deepEqual(ks.at(-1)!.by, byOf(frozen.line), "by whoever froze it, as the stage's line names them");
});

test("a real engine, the switch off: thing.open is not answered and writes nothing; the freeze goes out as before", { timeout: 120_000 }, async () => {
  const e = await engine(await freePort(), {});
  e.say(compose);
  const made = await e.next((m) => m.type === "work.stage.compose" && m.rid === "r1");
  e.say({ type: OPEN, id: "it-000000000000" });
  e.say({ type: "work.stage.freeze", rid: "r2", sessionId: SID, id: made.block.id });
  await e.next((m) => m.type === "work.stage.changed" && m.block?.id === made.block.id && m.line?.ev === "frozen");
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(e.got.filter((m) => m.type.startsWith("home.")).length, 0);
  assert.equal(existsSync(join(e.home, "items")), false);
  const kinds = (await e.log()).map((m) => m.kind);
  assert.ok(kinds.includes("engine.start"), "the frame is on: the log is there");
  assert.deepEqual(kinds.filter(isHomeKind), []);
});
