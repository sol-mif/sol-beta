// Home 5 (design §9): a Run, written so a stop at any moment can be picked up. Tests 9 to 13 are the plan's (specs
// home-plan §6 Home 5): after a restart the call that waited on a press is asked again (its card, never a second ask),
// the step a stop cut short is marked run.unknown once, a Run whose policy changed since its accept does not go on,
// and a replay writes the ledger and calls no source's draft or do. Test 11 kills and starts a real engine of its own
// (on ports the system names free, #1144, every folder in a temp one) over a log seeded with 9's and 10's state.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { WebSocket } from "ws";
import { rig, cleanup, SCHEMAS, type Rig } from "./fixtures/home/rig.ts";
import { NOW, fake, type Fake } from "./fixtures/home/policy.ts";
import { SourcesMsg, SOURCE_IDS, type Rung, type SourceId } from "../src/contract/home/policy.ts";
import { registerSource, setRung } from "../src/home/sources.ts";
import { putPolicy } from "../src/home/policy.ts";
import { ENGINE } from "../src/home/log.ts";
import { startHome } from "../src/home/wire.ts";
import { todayMsg } from "../src/home/today.ts";
import { about, getRun, resumeRun, startRun, UNKNOWN_NOTE } from "../src/home/runs.ts";
import { actOf, askId, callSource, check } from "../src/home/ceiling.ts";
import { freePort } from "./test-engine.ts";

const realFetch = globalThis.fetch;
const engines: ChildProcess[] = [];
const sockets: WebSocket[] = [];
const ownPorts = new Set<number>();
before(() => { globalThis.fetch = ((url: unknown, ...rest: unknown[]) => {
  // only the engines this file starts, on 127.0.0.1, may be reached
  const m = typeof url === "string" ? /^http:\/\/127\.0\.0\.1:(\d+)\//.exec(url) : null;
  if (m && ownPorts.has(Number(m[1]))) return (realFetch as any)(url, ...rest);
  throw new Error("no network in Home 5");
}) as typeof fetch; });
after(async () => {
  for (const s of sockets) s.terminate();
  for (const e of engines) await stop(e);
  globalThis.fetch = realFetch;
  cleanup();
});

const schemas = { ...SCHEMAS, "home.sources": SourcesMsg };
const of = (r: Rig, kind: string) => r.events().filter((e) => e.kind === kind);
const tick = () => new Promise((ok) => setTimeout(ok, 5));
const JOB = "it-job000000001";
const SEND = { tool: "send", input: { to: "maya", subject: "data section" } };

function scene(rungs: Partial<Record<SourceId, Rung>> = {}, dir?: string) {
  const r = rig({ now: NOW, schemas, ...(dir ? { dir } : {}) });
  const fakes = doors(r);
  for (const [id, rung] of Object.entries(rungs)) setRung(r.ctx, id as SourceId, rung, undefined, ENGINE);
  r.seed([{ id: JOB, read: "job", folder: "", words: "Answer Maya about the data section", state: "moving", waitsOn: "agent", at: NOW - 60_000, links: [], made: [] }]);
  return { r, fakes };
}
/** the five fakes on a Home (a restart is a new Home: its doors are registered again, as the engine would) */
function doors(r: Rig): Record<SourceId, Fake> {
  const fakes = {} as Record<SourceId, Fake>;
  for (const id of SOURCE_IDS) { fakes[id] = fake(id, NOW); registerSource(r.ctx, fakes[id]); }
  return fakes;
}
/** the state 9 and 10 restart from: a send that waited on a press when the engine stopped (rung.asked on the disk, no
 *  card yet: the stop came between them), and a step about to be done (run.about, no run.did) */
function stopped(r: Rig) {
  const run = startRun(r.ctx, { thing: JOB, source: "mail" })!;
  const asked = r.log.write({ kind: "rung.asked", item: JOB, value: { act: actOf({ ...SEND, source: "mail", door: "do" }), rung: "act" }, words: { tool: "send", door: "do", source: "mail", input: SEND.input }, sync: true, by: ENGINE });
  const step = about(r.ctx, run, actOf({ tool: "draft", source: "mail", door: "draft" }));
  return { run, asked, step };
}

test("9. restart while a call waited on a press: the card is in Today again, and no second rung.asked", async () => {
  const { r } = scene({ mail: "act" });
  const { asked } = stopped(r);
  assert.ok(!todayMsg(r.ctx).today.needs.includes(askId(asked.id)), "no card yet: the stop came first");
  const r2 = r.restart(), fakes = doors(r2);
  startHome(r2.ctx);
  const t = todayMsg(r2.ctx);
  assert.ok(t.today.needs.includes(askId(asked.id)), "asked again");
  const again = t.things.find((x) => x.id === askId(asked.id))!.card!;
  assert.equal(again.title, "Mail: send");
  assert.deepEqual(again.ask, { tool: "Mail: send", fields: [{ key: "to", value: "maya" }, { key: "subject", value: "data section" }], hidden: [] });
  assert.equal(of(r2, "rung.asked").length, 1, "never a second ask");
  const r3 = r2.restart(); doors(r3); startHome(r3.ctx);
  assert.equal(of(r3, "thing.new").filter((e) => e.item === askId(asked.id)).length, 1, "a third start makes no second card");
  // pressed now, the press stands for that very act, once, and nothing is asked again
  await r2.ask(r2.face(), { type: "home.answer", thingId: askId(asked.id), answer: "Allow once" });
  const run2 = startRun(r2.ctx, { thing: JOB, source: "mail" })!;
  assert.equal((await callSource(r2.ctx, fakes.mail, "do", { ...SEND, run: run2.id })).done, true);
  assert.equal(fakes.mail.calls.do, 1);
  assert.equal(of(r2, "rung.asked").length, 1);
  assert.equal(of(r2, "rung.did").at(-1)!.cause, asked.id, "the press used is the one asked before the stop");
});

test("10. restart mid-run: exactly one run.unknown for the step cut short, the note in the Run's file; a third start writes no second", () => {
  const { r } = scene({ mail: "draft" });
  const { run, step } = stopped(r);
  const r2 = r.restart(); doors(r2); startHome(r2.ctx);
  const unknown = of(r2, "run.unknown");
  assert.equal(unknown.length, 1);
  assert.deepEqual({ item: unknown[0].item, cause: unknown[0].cause, step: unknown[0].value.step, act: unknown[0].value.act }, { item: run.id, cause: step.id, step: 1, act: step.value!.act });
  const file = JSON.parse(readFileSync(join(r.home, "runs", `${run.id}.json`), "utf8"));
  assert.equal(file.note, UNKNOWN_NOTE);
  assert.equal(file.note, "the last step may or may not have happened; check before doing it again");
  assert.ok(file.ledger.includes(unknown[0].id));
  const r3 = r2.restart(); doors(r3); startHome(r3.ctx);
  assert.equal(of(r3, "run.unknown").length, 1, "no second run.unknown");
  // a step that ended (run.did) is never marked
  const { r: s } = scene({ mail: "draft" });
  const run2 = startRun(s.ctx, { thing: JOB, source: "mail" })!;
  const fakes = doors(s);
  return callSource(s.ctx, fakes.mail, "draft", { tool: "draft", run: run2.id }).then((got) => {
    assert.equal(got.done, true);
    const s2 = s.restart(); doors(s2); startHome(s2.ctx);
    assert.equal(of(s2, "run.unknown").length, 0);
  });
});

test("12. the policy changed between the accept and the resume: the Run does not go on, a card in Today says so", async () => {
  const { r, fakes } = scene({ mail: "draft" });
  putPolicy(r.ctx, "Draft my replies and hold them for me.");
  const run = startRun(r.ctx, { thing: JOB, source: "mail" })!;
  const frozen = r.ctx.items.get(JOB)!.frozen as any;
  assert.deepEqual({ rung: frozen.rung, source: frozen.scope.source, by: frozen.by }, { rung: "draft", source: "mail", by: ENGINE }, "frozen at the accept");
  assert.equal(resumeRun(r.ctx, run.id).ok, true, "the same policy: it goes on");
  putPolicy(r.ctx, "Suggest replies to my mail, send nothing.");
  const got = resumeRun(r.ctx, run.id);
  assert.deepEqual(got, { ok: false, said: "blocked: the policy changed since this job was accepted; a card in Today says so" });
  const card = todayMsg(r.ctx).things.find((t) => t.id === `${run.id}-policy`)!;
  assert.ok(todayMsg(r.ctx).today.needs.includes(card.id));
  assert.equal(card.words, "The policy changed since this job was accepted: look at it again before it goes on.");
  assert.equal(getRun(r.ctx, run.id)!.state, "blocked");
  resumeRun(r.ctx, run.id);
  assert.equal(of(r, "thing.new").filter((e) => e.item === card.id).length, 1, "one card, however often it is tried");
  // a step of a blocked Run is refused, and nothing reaches the door
  const step = await callSource(r.ctx, fakes.mail, "draft", { tool: "draft", run: run.id });
  assert.deepEqual(step, { done: false, said: "refused: this Run is not going (blocked or ended)" });
  assert.equal(fakes.mail.calls.draft, 0);
  assert.equal(of(r, "rung.refused").at(-1)!.value.why, "blocked");
  // the policy back as it was accepted: it goes on
  putPolicy(r.ctx, "Draft my replies and hold them for me.");
  assert.equal(resumeRun(r.ctx, run.id).ok, true);
  assert.equal((await callSource(r.ctx, fakes.mail, "draft", { tool: "draft", run: run.id })).done, true);
});

test("13. a replay: every event of the Run carries mode replay; the source's draft and do are never called, reads are", async () => {
  const { r, fakes } = scene({ mail: "act" });
  const n = r.events().length;
  const run = startRun(r.ctx, { thing: JOB, source: "mail", replayOf: "run-0123456789ab" })!;
  assert.deepEqual({ mode: run.mode, replayOf: run.replayOf }, { mode: "record", replayOf: "run-0123456789ab" }, "Marco's Run: a replay is record-only");
  const read = await callSource(r.ctx, fakes.mail, "read", { tool: "read last week", run: run.id });
  const draft = await callSource(r.ctx, fakes.mail, "draft", { tool: "draft", input: { to: "maya" }, run: run.id });
  const send = await callSource(r.ctx, fakes.mail, "do", { ...SEND, run: run.id });
  const reply = await callSource(r.ctx, fakes.mail, "do", { tool: "reply", run: run.id });
  const bash = await check(r.ctx, { tool: "Bash", input: { command: "ls" }, run: run.id });
  assert.equal(read.done, true);
  for (const x of [draft, send, reply]) assert.deepEqual(x, { done: false, said: "replay: written in the ledger, not done" });
  assert.equal(bash.go, false);
  assert.deepEqual(fakes.mail.calls, { read: 1, propose: 0, draft: 0, do: 0 });
  const added = r.events().slice(n);
  assert.ok(added.length >= 8);
  for (const e of added) assert.equal(e.mode, "replay", `${e.kind} carries mode replay`);
  assert.equal(added.filter((e) => e.kind === "rung.would").length, 4, "what it would have done, in the ledger");
  assert.equal(added.filter((e) => e.kind === "rung.asked").length, 0, "nobody is asked to press for a replay");
  // a record-only Run that is no replay: the same ceiling of read, its lines mode record
  const rec = startRun(r.ctx, { thing: JOB, source: "mail", mode: "record" })!;
  assert.deepEqual(await callSource(r.ctx, fakes.mail, "draft", { tool: "draft", run: rec.id }), { done: false, said: "record only: written in the ledger, not done" });
  assert.equal(of(r, "rung.would").at(-1)!.mode, "record");
  assert.equal(fakes.mail.calls.draft, 0);
  await tick();
});

// ── 11: a real engine, killed and started again ──────────────────────────────────────────────────────────────────
type Msg = { type: string; [k: string]: any };
async function stop(e: ChildProcess): Promise<void> {
  if (e.exitCode !== null || e.signalCode !== null) return;
  const gone = new Promise((ok) => e.once("exit", ok));
  e.kill("SIGKILL");
  await gone;
}
/** an engine of this test's own on a port nobody else holds, over a home and a log folder given */
async function engine(port: number, r: Rig) {
  ownPorts.add(port);
  const base = { ...process.env };
  base.SOL_HOME_WHOLE = "off";   // off unless the test says on (on for the team by default since #691)
  const e = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: join(import.meta.dirname, ".."), stdio: "ignore",
    env: {
      ...base, SOL_PORT: String(port), SOL_HOME: r.home, SOL_STATE: join(r.dir, "state", "work.json"), SOL_TEAM: join(r.dir, "team", "team.json"),
      SOL_LOGDIR: r.logDir, SOL_LOG: join(r.dir, "engine.log"), SOL_PROFILE: join(r.dir, "profile"), SOL_APPDIR: join(r.dir, "app"),
      SOL_FRAME: "on", SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off", SOL_HOME_WHOLE: "on",
    },
  });
  engines.push(e);
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(`${url}/health`)).ok) break; } catch { /* not up yet */ }
    await new Promise((ok) => setTimeout(ok, 200));
  }
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  sockets.push(ws);
  const got: Msg[] = [];
  ws.on("message", (raw) => { got.push(JSON.parse(raw.toString())); });
  await new Promise((ok, no) => { ws.once("open", ok); ws.once("error", no); });
  const next = async (pred: (m: Msg) => boolean, ms = 20_000): Promise<Msg> => {
    for (let t = 0; t < ms; t += 50) { const m = got.find(pred); if (m) return m; await new Promise((ok) => setTimeout(ok, 50)); }
    throw new Error("timed out; got " + got.map((m) => m.type).join(" "));
  };
  const log = async (): Promise<Msg[]> => (await (await fetch(`${url}/log`)).json() as { events: Msg[] }).events;
  return { e, say: (m: object) => ws.send(JSON.stringify(m)), next, log };
}

test("11. a real engine, killed and started again: the call that waited on a press is in Today, the step cut short is run.unknown once", { timeout: 120_000 }, async () => {
  const { r } = scene({ mail: "act" });
  const { run, asked, step } = stopped(r);
  const first = await engine(await freePort(), r);
  first.say({ type: "home.today" });
  assert.ok((await first.next((m) => m.type === "home.today")).today.needs.includes(askId(asked.id)), "the first start asks again");
  await stop(first.e);   // the PID this test started, and no other
  const second = await engine(await freePort(), r);
  second.say({ type: "home.today" });
  const t = await second.next((m) => m.type === "home.today");
  assert.ok(t.today.needs.includes(askId(asked.id)), "still in Today after the kill and the second start");
  const evs = await second.log();
  const unknown = evs.filter((e) => e.kind === "run.unknown");
  assert.equal(unknown.length, 1, "one run.unknown across both starts");
  assert.deepEqual({ item: unknown[0].item, cause: unknown[0].cause }, { item: run.id, cause: step.id });
  assert.equal(evs.filter((e) => e.kind === "rung.asked").length, 1, "never asked twice");
  assert.equal(evs.filter((e) => e.kind === "thing.new" && e.item === askId(asked.id)).length, 1, "one card");
  assert.equal(JSON.parse(readFileSync(join(r.home, "runs", `${run.id}.json`), "utf8")).note, UNKNOWN_NOTE);
});

test("a step is confirmed on the disk before it runs: run.about and rung.asked are written with their fsync (design §9)", async () => {
  const { r, fakes } = scene({ mail: "act", files: "act" });
  const run = startRun(r.ctx, { thing: JOB, source: "mail" })!;
  const write = r.ctx.log.write, synced = new Map<string, boolean>();
  r.ctx.log.write = ((w: Parameters<typeof write>[0]) => { synced.set(w.kind, (w as { sync?: boolean }).sync === true); return write(w); }) as typeof write;
  try {
    await callSource(r.ctx, fakes.mail, "draft", { tool: "draft a reply", input: { to: "maya" }, run: run.id });
    await callSource(r.ctx, fakes.mail, "do", { tool: "send", input: { to: "maya" }, run: run.id, canWait: false });
  } finally { r.ctx.log.write = write; }
  assert.equal(synced.get("run.about"), true);
  assert.equal(synced.get("rung.asked"), true);
});
