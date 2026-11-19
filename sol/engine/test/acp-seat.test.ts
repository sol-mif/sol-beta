// A seat the shell starts and keeps running, speaking ACP (the v2 design §7.1, step A2, acp.ts), behind SOL_ACP_SEAT:
// needs.seat on the record and the card; a fake ACP agent (fixtures/fake-acp.mjs) walled in macOS's sandbox, pressed in,
// finishing a task with its words streamed, its tool step and what it spent on the log; its permission request a card
// on the turn's socket, answered from Sol's own window; a stop is session/cancel and the process lives on; taken
// out, the process is dead and the log says nothing more; killed from outside, it is off the seam and Claude takes the turn.
// What a real agent needed inside the wall (found with codex-acp, 2026-11-11): an error's reason from its data, the
// model and the effort a task names, the system's certificates, its declared home folder at the same place in its
// scratch home; and, only when its record says children, programs of its own inside the same wall, gone when it is.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, copyFileSync, readFileSync, chmodSync, lstatSync, symlinkSync } from "node:fs";
import { tmpdir, platform } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { PassThrough, Writable } from "node:stream";
import { existsSync, readdirSync } from "node:fs";
import WebSocket from "ws";
import { Kernel } from "./kernels.ts";
import { columnsOf, acpSeatOn, ACP_SEAT_ENV } from "../src/record.ts";
import { askOf, cardOf, widerThan } from "../src/card.ts";
import { registerSeat, seatFor, seatList, clearSeats, convoId, BUILT_IN, type SeatProvider, type SeatAsk, type SeatStep } from "../src/seats.ts";
import { printOfArgs, ACP, ACP_VERSION, Rpc, startAcp, optionsOf, cutOut, SECRET_MIN, OUT_MAX, TEXT_MAX, LIMITED, type AcpStart } from "../src/acp.ts";
import { pasteKey, removeKey } from "../src/keys.ts";
import { profileOf, findProgram } from "../src/bigroom.ts";
import { kindRow, SEAT_KINDS, fits, placeOf } from "../src/contract/kinds.ts";

// the seat is kept in the big room, which is macOS's sandbox: off a Mac the kernel says so and starts nothing, so the
// tests that start one run on a Mac (big-room.test.ts skips the same way); the pure ones, and the one that starts
// the fake agent with no wall and no kernel (startAcp alone), run everywhere
const mac = platform() === "darwin" && existsSync("/usr/bin/sandbox-exec");
const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FAKE = join(ENGINE, "test", "fixtures", "fake-acp.mjs");
const homes: string[] = [];
let engine: ChildProcess | null = null;
const was = process.env[ACP_SEAT_ENV];
const historyWas = process.env.SOL_HISTORY;
process.env.SOL_HISTORY = "off";   // the past's switch (on by default, #691) off here, so needs' columns are this switch's alone
after(() => {
  engine?.kill("SIGKILL");
  for (const h of homes) rmSync(h, { recursive: true, force: true });
  if (was === undefined) delete process.env[ACP_SEAT_ENV]; else process.env[ACP_SEAT_ENV] = was;
  if (historyWas === undefined) delete process.env.SOL_HISTORY; else process.env.SOL_HISTORY = historyWas;
});
const on = () => { process.env[ACP_SEAT_ENV] = "on"; };
const off = () => { process.env[ACP_SEAT_ENV] = "off"; };
function home() {
  const h = realpathSync(mkdtempSync(join(tmpdir(), "sol-acp-")));
  homes.push(h);
  mkdirSync(join(h, "things"));
  mkdirSync(join(h, "app"));
  return h;
}
const opts = (h: string) => ({ logDir: join(h, "lab-log"), appDir: join(h, "app") });
const SEAT = { speaks: "acp", start: ["node", "fake-acp.mjs"] };
const record = (id: string, seat: unknown = SEAT, more: Record<string, unknown> = {}) => ({ id, title: id, place: "card", reads: [], writes: [], versions: [{ v: 1, file: "v1.html" }], room: "big", needs: { why: "my own brain, as a seat", programs: ["node"], provides: ["seat"], seat }, ...more });
function block(h: string, id: string, seat: unknown = SEAT) {
  const d = join(h, "things", id);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "record.json"), JSON.stringify(record(id, seat)));
  writeFileSync(join(d, "v1.html"), "<p>x</p>");
  copyFileSync(FAKE, join(d, "fake-acp.mjs"));
}
const claude = (): SeatProvider => ({ name: BUILT_IN, builtIn: true, can: { stream: false, resume: false, ask: false }, run: async () => ({ ok: true, text: "claude" }) });
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
/** the processes still in a process group, by ps */
const inGroup = (g: number) => execFileSync("/bin/ps", ["-axo", "pid=,pgid="], { encoding: "utf8" }).split("\n").map((l) => l.trim().split(/\s+/).map(Number)).filter(([, pg]) => pg === g).map(([p]) => p);
const until = async (f: () => boolean, ms = 5000) => { for (let i = 0; i < ms / 50 && !f(); i++) await new Promise((r) => setTimeout(r, 50)); return f(); };
/** a turn on a seat, all it said */
async function turn(s: SeatProvider, text: string, o: { sessionId?: string; ask?: (q: SeatAsk) => Promise<string>; signal?: AbortSignal; model?: string; effort?: string } = {}) {
  const deltas: string[] = [], steps: SeatStep[] = [], usage: { in: number; out: number }[] = [], asks: SeatAsk[] = [];
  const r = await s.run({ text, ...(o.sessionId ? { sessionId: o.sessionId } : {}), ...(o.model ? { model: o.model } : {}), ...(o.effort ? { effort: o.effort } : {}) }, { delta: (t) => deltas.push(t), step: (x) => steps.push(x), usage: (u) => usage.push(u), ...(o.ask ? { ask: (q) => { asks.push(q); return o.ask!(q); } } : {}) }, o.signal ?? new AbortController().signal);
  return { r, deltas, steps, usage, asks };
}

test("needs.seat, pure: with the switch on each bad shape is refused with why; off, refused as before; the card names the program and a changed start is wider; a seat nothing walls is not put on the seam", () => {
  on();
  assert.equal(acpSeatOn(), true);
  const ok = columnsOf(record("b"));
  assert.ok(ok.ok, JSON.stringify(ok));
  assert.deepEqual(ok.ok && ok.columns.needs?.seat, { speaks: "acp", start: ["node", "fake-acp.mjs"] });
  const why = (r: Record<string, unknown>) => { const c = columnsOf(r); return c.ok ? "" : c.why; };
  assert.match(why(record("b", { speaks: "x", start: ["node"] })), /needs\.seat speaks "x": a seat the shell starts speaks acp/);
  assert.match(why(record("b", { speaks: "acp", start: [] })), /needs\.seat's start is not a list of words/);
  assert.match(why(record("b", { speaks: "acp", start: ["/usr/local/bin/node"] })), /needs\.seat starts "\/usr\/local\/bin\/node", which is not a program's name/);
  assert.match(why(record("b", { speaks: "acp", start: ["python3"] })), /needs\.seat starts python3, which needs\.programs does not name/);
  assert.match(why(record("b", { speaks: "acp", start: ["node", "a\nb"] })), /an argument that is not one line/);
  assert.match(why(record("b", { speaks: "acp", start: ["node"], odd: 1 })), /needs\.seat has "odd", which is not one of its fields \(speaks, start, children, key, keyAs\)/);
  assert.match(why(record("b", { ...SEAT, children: "yes" })), /needs\.seat's children is not true or false/);
  assert.match(why({ ...record("b"), needs: { why: "x", programs: ["node"], seat: SEAT } }), /needs\.seat without provides \["seat"\]/);
  assert.match(why({ ...record("b"), room: "small" }), /needs\.seat runs a program beside Sol, walled: its room is big/);
  assert.match(why({ ...record("b"), needs: { programs: ["node"], provides: ["seat"], seat: SEAT } }), /needs\.why is missing/);
  // the card: the program it starts, said; another argument after the press is wider
  const a = askOf(ok.ok ? ok.columns : (null as never));
  assert.deepEqual(a.seat, ["node", "fake-acp.mjs"]);
  const card = cardOf(join(tmpdir(), "no-app"), "b", ok.ok ? ok.columns : (null as never), null, () => []);
  assert.ok(card.plain.includes("It starts node fake-acp.mjs and keeps it running beside Sol as a seat, walled in, until you take it out."), card.plain.join("\n"));
  assert.ok(card.plain.includes("Inside that wall it can still learn who has an account on this Mac: each account's name and full name, yours among them, and which are administrators. Never what is in a home."), "what every seat's wall opens is on its card");
  assert.deepEqual(widerThan({ ...a }, a), []);
  assert.deepEqual(widerThan({ ...a, seat: ["node", "other.mjs"] }, a), ["starting node fake-acp.mjs as a seat"]);
  assert.deepEqual(widerThan({ ...a, seat: undefined }, a), ["starting node fake-acp.mjs as a seat"]);
  // children: asked only when the record says true; on the card in a sentence of its own; added after a press, wider
  assert.ok(!("seatChildren" in a) && !("children" in (ok.ok ? ok.columns.needs!.seat! : {})), "left out: no new field, the print does not move");
  const none = columnsOf(record("b", { ...SEAT, children: false }));
  assert.ok(none.ok && !("seatChildren" in askOf(none.columns)) && !("children" in none.columns.needs!.seat!), "false is as left out");
  const kids = columnsOf(record("b", { ...SEAT, children: true }));
  assert.ok(kids.ok, JSON.stringify(kids));
  const ak = askOf(kids.ok ? kids.columns : (null as never));
  assert.equal(ak.seatChildren, true);
  assert.deepEqual(widerThan({ ...a }, ak), ["its seat starting other programs"]);
  assert.deepEqual(widerThan({ ...ak }, ak), []);
  assert.deepEqual(widerThan({ ...ak }, a), [], "narrower asks nothing");
  const kcard = cardOf(join(tmpdir(), "no-app"), "b", kids.ok ? kids.columns : (null as never), null, () => []);
  assert.ok(kcard.plain.includes("That seat starts other programs itself, inside the same wall: the ones in its own folder and node. Sol stops them when you take it out; one it hides on purpose can go on running, still walled in."), kcard.plain.join("\n"));
  assert.notEqual(kcard.print, card.print, "another card to press");
  const plain = columnsOf({ ...record("c"), needs: { why: "x" } });
  assert.ok(plain.ok && !("seat" in askOf(plain.columns)), "a card that asks no seat has no new field: its print does not move");
  // a seat that says nothing walls it is refused on the seam (the design: not installed); Sol's own are not asked
  clearSeats();
  assert.match((registerSeat({ name: "bare", builtIn: false, block: "bare", can: { stream: true, resume: true, ask: true, sandbox: "none" }, run: async () => ({ ok: true, text: "" }) }) as { why: string }).why, /says nothing walls it \(sandbox: none\)/);
  assert.deepEqual(registerSeat({ name: "walled", builtIn: false, block: "walled", can: { stream: true, resume: true, ask: true, sandbox: "ours" }, run: async () => ({ ok: true, text: "" }) }), { ok: true });
  clearSeats();
  // the kinds: a seat's usage is a row, heard only by a block that names it once pressed, as a seat's other steps
  assert.equal(kindRow("seat.usage")?.hear, "card");
  assert.ok(SEAT_KINDS.includes("seat.usage"));
  assert.equal(printOfArgs({ b: 1, a: [2, { d: 3, c: 4 }] }), printOfArgs({ a: [2, { c: 4, d: 3 }], b: 1 }), "the same arguments, the same print");
  assert.notEqual(printOfArgs({ command: "rm -rf build" }), printOfArgs({ command: "rm -rf /" }));
  assert.equal(ACP_VERSION, 1);
  assert.deepEqual(Object.values(ACP), ["initialize", "session/new", "session/prompt", "session/update", "session/request_permission", "session/cancel", "session/set_config_option"]);
  // the switch off: needs.seat is not one of needs' columns, the sentence as before
  off();
  assert.equal(acpSeatOn(), false);
  assert.equal(why(record("b")), `record.json: needs has "seat", which is not one of its columns (why, domains, folders, programs, sol, keys, tools, every, screen, provides)`);
  delete process.env[ACP_SEAT_ENV]; assert.equal(acpSeatOn(), true, "on by default (#691)");
  for (const v of ["1", "true", " ON ", ""]) { process.env[ACP_SEAT_ENV] = v; assert.equal(acpSeatOn(), true, v); }
  for (const v of ["0", "off", "false"]) { process.env[ACP_SEAT_ENV] = v; assert.equal(acpSeatOn(), false, v); }
  off();
});

test("a character cut between two reads arrives whole: the reader keeps its first bytes until the rest come", () => {
  const inp = new PassThrough(), heard: unknown[] = [];
  new Rpc(new PassThrough(), inp, { request: async () => null, notify: (_m, p) => heard.push(p), bad: (why) => heard.push(why) });
  const line = Buffer.from(JSON.stringify({ jsonrpc: "2.0", method: "note", params: "中文字" }) + "\n");
  const cut = line.indexOf(Buffer.from("中")) + 1;
  inp.write(line.subarray(0, cut));
  inp.write(line.subarray(cut));
  const twice = Buffer.from(JSON.stringify({ jsonrpc: "2.0", method: "note", params: "é😀" }) + "\n");
  for (const b of twice) inp.write(Buffer.from([b]));   // a byte a read
  assert.deepEqual(heard, ["中文字", "é😀"]);
});

/** the fake agent started by startAcp alone: no kernel, no wall */
const bare = (more: Partial<AcpStart> = {}) => startAcp({ name: "bare", command: [process.execPath, FAKE], cwd: dirname(FAKE), sessionCwd: tmpdir(), env: { PATH: process.env.PATH ?? "" }, startMs: 10_000, closeMs: 300, answerMs: 5000, convo: (x) => x, said: { turn() {}, step() {}, usage() {}, done() {} }, gone: () => {}, ...more });

test("what a seat may make Sol hold is bounded: one that asks and never reads the answers is stopped, said, and so is one whose turn says more or takes more steps than a turn may, or whose line has no end; more questions at once than a person is put are a no, a stop answers those still waiting and so does the end of its turn; a request whose id no answer could carry gets none; of its options the few a task can set are kept", { timeout: 60_000 }, async () => {
  // pure: the answers to an agent that reads nothing wait in Sol, up to OUT_MAX and no further
  let held = 0;
  const never = new Writable({ write() { /* never done: all that follows waits */ } }), inp = new PassThrough(), bad: string[] = [];
  const rpc = new Rpc(never, inp, { request: async () => "x".repeat(4000), notify: () => {}, bad: (why) => bad.push(why) });
  const waiting = rpc.request("x", {}).then(() => "answered", (e: Error) => e.message);
  for (let i = 0; i < 4000; i++) { inp.write(JSON.stringify({ jsonrpc: "2.0", id: i, method: "ask" }) + "\n"); if (i % 100 === 0) await new Promise((r) => setImmediate(r)); held = Math.max(held, never.writableLength); }
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(bad, [`it left more than ${OUT_MAX} bytes of what Sol wrote to it unread`], "said once");
  assert.equal(await waiting, bad[0], "and what Sol was waiting for ends with it");
  assert.ok(Math.max(held, never.writableLength) <= OUT_MAX, `no more than that was held: ${never.writableLength}`);
  // pure: an answer that would take what waits past the most is not written, however large the one answer
  const never2 = new Writable({ write() {} }), inp3 = new PassThrough(), bad2: string[] = [];
  new Rpc(never2, inp3, { request: async () => "x".repeat(3_000_000), notify: () => {}, bad: (why) => bad2.push(why) });
  for (let i = 0; i < 4; i++) inp3.write(JSON.stringify({ jsonrpc: "2.0", id: i, method: "ask" }) + "\n");
  await new Promise((r) => setImmediate(r));
  assert.equal(bad2.length, 1, "stopped at the third");
  assert.ok(never2.writableLength > 6_000_000 && never2.writableLength <= OUT_MAX, `two of them wait, not three: ${never2.writableLength}`);
  // pure: a line with no end
  const inp4 = new PassThrough(), bad3: string[] = [];
  new Rpc(new PassThrough(), inp4, { request: async () => null, notify: () => {}, bad: (why) => bad3.push(why) });
  for (let i = 0; i < 5; i++) inp4.write("x".repeat(1 << 20));
  assert.deepEqual(bad3, ["it wrote a line longer than 4194304 characters"]);
  // pure: of sixty options of three hundred values, the first four a task can set, two hundred values each
  const kept = optionsOf(Array.from({ length: 60 }, (_, i) => ({ id: `o${i}`, category: i % 2 ? "model" : "mode", currentValue: "v0", options: Array.from({ length: 300 }, (_, j) => ({ value: `v${j}` })) })));
  assert.deepEqual(kept.map((o) => [o.id, o.values.length]), [["o1", 200], ["o3", 200], ["o5", 200], ["o7", 200]]);
  // pure: an id that is not a number or a short string is not answered
  const wrote: string[] = [], inp2 = new PassThrough();
  new Rpc(new Writable({ write(b, _e, done) { wrote.push(String(b)); done(); } }), inp2, { request: async () => "ok", notify: () => {}, bad: () => {} });
  for (const id of ["x".repeat(201), { a: 1 }, [1], true, "x".repeat(200), 7]) inp2.write(JSON.stringify({ jsonrpc: "2.0", id, method: "ask" }) + "\n");
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(wrote.map((l) => JSON.parse(l).id), ["x".repeat(200), 7]);

  // the fake agent, started with no wall: it stops reading and asks 60,000 times
  const gone: string[] = [];
  const a = await bare({ gone: (why) => gone.push(why) });
  try {
    const flood = await turn({ run: a.run } as SeatProvider, "flood");
    assert.deepEqual(flood.r, { ok: false, why: `the seat bare is gone: it left more than ${OUT_MAX} bytes of what Sol wrote to it unread`, sessionId: "s1" });
    assert.deepEqual(gone, [`it left more than ${OUT_MAX} bytes of what Sol wrote to it unread`]);
    assert.ok(await until(() => !alive(a.pid)), "its process is dead");
    assert.equal(a.alive(), false);
  } finally { await a.close(); }
  // a turn of 17 million characters
  const gone2: string[] = [];
  const b = await bare({ gone: (why) => gone2.push(why) });
  try {
    const words = await turn({ run: b.run } as SeatProvider, "words 17");
    assert.deepEqual(words.r, { ok: false, why: `the seat bare is gone: it wrote more than ${TEXT_MAX} characters in one turn`, sessionId: "s1" });
    assert.equal(words.deltas.length, 16, "what came before the most was passed on");
    assert.deepEqual(gone2, [`it wrote more than ${TEXT_MAX} characters in one turn`]);
    assert.ok(await until(() => !alive(b.pid)), "its process is dead");
  } finally { await b.close(); }
  // ten thousand and one steps
  const gone3: string[] = [];
  const d = await bare({ gone: (why) => gone3.push(why) });
  try {
    const steps = await turn({ run: d.run } as SeatProvider, "steps 10001");
    assert.deepEqual(steps.r, { ok: false, why: "the seat bare is gone: it took more than 10000 steps in one turn", sessionId: "s1" });
    assert.equal(steps.steps.length, 10_000, "what came before the most was passed on");
    assert.deepEqual(gone3, ["it took more than 10000 steps in one turn"]);
  } finally { await d.close(); }
  // twenty questions at once: sixteen reach the person, four are a no at once
  const c = await bare();
  try {
    const answers: ((a: string) => void)[] = [];
    const many = turn({ run: c.run } as SeatProvider, "ask many 20", { ask: () => new Promise<string>((done) => answers.push(done)) });
    assert.ok(await until(() => answers.length === 16), `sixteen are asked: ${answers.length}`);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(answers.length, 16, "and no more");
    for (const f of answers) f("once");
    const r = await many;
    assert.deepEqual(r.r, { ok: true, text: "16 4", sessionId: "s1" });
    // two questions, one answered, then a stop: the other is answered by the stop (the agent heard both answers)
    const two: ((a: string) => void)[] = [], stop = new AbortController();
    const pair = turn({ run: c.run } as SeatProvider, "ask many 2", { sessionId: "s1", signal: stop.signal, ask: () => new Promise<string>((done) => two.push(done)) });
    assert.ok(await until(() => two.length === 2), "both are asked");
    two[0]!("once");
    await new Promise((r) => setTimeout(r, 100));
    stop.abort();
    const p = await pair;
    assert.deepEqual(p.r, { ok: false, why: "cancelled", sessionId: "s1" });
    assert.equal(p.deltas.join(""), "1 1", "one yes, and the one still waiting was answered too");
    // a turn that ends with its question still waiting: the agent is answered "cancelled", nothing is held past the turn
    const go = await turn({ run: c.run } as SeatProvider, "ask and go", { sessionId: "s1", ask: () => new Promise<string>(() => {}) });
    assert.deepEqual([go.r, go.asks.length], [{ ok: true, text: "", sessionId: "s1" }, 1]);
    assert.equal((await turn({ run: c.run } as SeatProvider, "left?", { sessionId: "s1" })).deltas.join(""), "cancelled");
  } finally { await c.close(); }
});

test("a seat with children when no look can be had: what the last look saw is ended by its pid; and when every look finds one more, the ending stops after its two seconds", { timeout: 60_000, skip: !mac }, async () => {
  const real = () => execFileSync("/bin/ps", ["-axo", "pid=,ppid=,pgid=,lstart="], { encoding: "utf8" });
  let blind = false, kids: number[] = [];
  const a = await bare({ children: true, closeMs: 300, ps: () => { if (blind) throw new Error("no room to start ps"); return real(); } });
  try {
    kids = JSON.parse((await turn({ run: a.run } as SeatProvider, "spawn")).deltas.join("")) as number[];
    // a task long enough for a look to see them (twice a second in a task)
    const stop = new AbortController();
    const waits = turn({ run: a.run } as SeatProvider, "wait", { signal: stop.signal });
    await new Promise((r) => setTimeout(r, 1300));
    stop.abort();
    await waits;
    assert.ok(kids.length === 2 && kids.every(alive), "its two sleeps are running");
    blind = true;
    await a.close();
    assert.ok(await until(() => !kids.some(alive)), "both are dead, the one that left its group by its pid alone");
    assert.equal(alive(a.pid), false);
  } finally { await a.close(); for (const k of kids) { try { process.kill(k, "SIGKILL"); } catch { /* gone */ } } }
  // every look finds one more (pids no process on a Mac has): the ending is over after its time, not when they are
  let looks = 0, head = 0;
  const nap = new Int32Array(new SharedArrayBuffer(4));
  const b = await bare({ children: true, closeMs: 200, ps: () => { Atomics.wait(nap, 0, 0, 5); looks++; return looks > 1500 ? "" : `${200_000 + looks} ${head} ${head} Mon Jan  1 00:00:00 2001\n`; } });
  head = b.pid;
  const t0 = Date.now();
  await b.close();
  const ms = Date.now() - t0;
  assert.ok(ms >= 1900 && ms < 4000 && looks < 1000, `two seconds of looks, no more: ${ms} ms, ${looks} looks`);
  assert.equal(alive(b.pid), false);
});

test("a seat with children starts under a limit of programs the system keeps, which what it starts inherits (one without children under none); with no look to be had, what a look saw more than a second ago is left and its group killed, and the group is left too once its end is more than a second ago; one with no limit to be given is not started; once it has ended, a process a look shows under its pid is another's and that group is left alone", { timeout: 60_000, skip: !mac }, async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "sol-acp-limit-")));
  homes.push(dir);
  const nap = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const says = async (s: { run: SeatProvider["run"] }, text: string) => (await turn({ run: s.run } as SeatProvider, text)).deltas.join("");
  const own = Number(execFileSync("/bin/sh", ["-c", "ulimit -u"], { encoding: "utf8" }).trim());
  const most = Math.min(own, Math.floor(Number(execFileSync("/usr/sbin/sysctl", ["-n", "kern.maxprocperuid"], { encoding: "utf8" }).trim()) * 4 / 5));
  const is = (n: number, hard: boolean) => { const f = join(dir, `is-${n}-${hard}.sh`); writeFileSync(f, `[ "$(ulimit -u)" = "${n}" ]${hard ? ` && [ "$(ulimit -Hu)" = "${n}" ]` : ""}\n`); return `run /bin/sh ${f}`; };
  assert.ok(most >= 80 && most <= own, `four fifths of what this Mac lets one person run: ${most}`);
  const a = await bare({ children: true });
  try {
    assert.equal(await says(a, is(most, true)), "yes", "what it starts runs under the limit, which it cannot raise");
    assert.equal(await says(a, "fork"), "yes");
  } finally { await a.close(); }
  const b = await bare({ children: true, procs: 10 });   // fewer than the person has running: it starts none
  try { assert.equal(await says(b, "fork"), "refused"); } finally { await b.close(); }
  // no limit to give it: it is not started at all, rather than started under none
  await assert.rejects(bare({ children: true, procs: 0 }), /could not learn how many programs this Mac lets one person run/);
  // started where the limit is already lower than the one it would be given: the lower one holds, never raised
  const low = most - 100;
  assert.deepEqual(execFileSync("/bin/sh", ["-c", `ulimit -Su ${low}; exec /bin/sh -c "$0" "$@"`, LIMITED, String(most), "/bin/sh", "-c", "ulimit -u; ulimit -Hu"], { encoding: "utf8" }).trim().split("\n"), [String(low), String(low)]);
  const c = await bare();
  try { assert.equal(await says(c, is(own, false)), "yes", "one that starts no program is given no limit"); } finally { await c.close(); }

  // no look to be had, and the last one more than a second old: its group goes, a pid alone is not taken for the process it was
  const real = () => execFileSync("/bin/ps", ["-axo", "pid=,ppid=,pgid=,lstart="], { encoding: "utf8" });
  let blind = false, kids: number[] = [];
  const d = await bare({ children: true, ps: () => { if (blind) throw new Error("no room to start ps"); return real(); } });
  try {
    kids = JSON.parse(await says(d, "spawn")) as number[];
    const stop = new AbortController();
    const waits = turn({ run: d.run } as SeatProvider, "wait", { signal: stop.signal });
    await nap(1300);   // a task long enough for a look to see them
    stop.abort();
    await waits;
    await nap(1300);   // between tasks it is looked at every five seconds: what the last look saw is older than a second
    assert.ok(kids.length === 2 && kids.every(alive), "its two sleeps are running");
    blind = true;
    process.kill(d.pid, "SIGKILL");
    assert.ok(await until(() => !alive(d.pid) && !alive(kids[0]!)), "it and the sleep in its group are dead");
    await nap(300);
    assert.equal(alive(kids[1]!), true, "the one that left its group is not killed by a pid seen more than a second ago");
  } finally { await d.close(); for (const k of kids) { try { process.kill(k, "SIGKILL"); } catch { /* gone */ } } }

  // a look too slow to be had, so that its end is more than a second ago when the look gives up: its group is left too,
  // from wherever it would be signalled
  let slow = false, left: number[] = [];
  const wait = new Int32Array(new SharedArrayBuffer(4));
  const f = await bare({ children: true, ps: () => { if (slow) { Atomics.wait(wait, 0, 0, 1200); throw new Error("ps too slow"); } return real(); } });
  try {
    left = JSON.parse(await says(f, "spawn")) as number[];
    assert.ok(left.length === 2 && left.every(alive), "its two sleeps are running");
    slow = true;
    process.kill(f.pid, "SIGKILL");
    assert.ok(await until(() => !alive(f.pid)), "it is dead, and its ending over (not taken out: nothing was asked to stop)");
    await nap(300);
    assert.ok(left.every(alive), "neither is killed by a number alone, a second after its end: the group's is no more sure than a pid's");
  } finally { await f.close(); for (const k of left) { try { process.kill(k, "SIGKILL"); } catch { /* gone */ } } }

  // once it has ended, its pid may be another program's: a look that shows one under it (here made up) leaves that group alone
  let lie = "", dead = false;
  const e = await bare({ children: true, ps: () => lie || real() });
  const v = spawn("sleep", ["600"], { stdio: "ignore", detached: true });
  v.on("exit", () => { dead = true; });
  try {
    lie = `${e.pid} 1 ${e.pid} Mon Jan  1 00:00:00 2001\n${v.pid} 1 ${e.pid} Mon Jan  1 00:00:00 2001\n`;
    process.kill(e.pid, "SIGKILL");
    assert.ok(await until(() => !alive(e.pid)));
    await nap(300);
    assert.equal(dead, false, "a program said to be in the group of that number is not the seat's: not killed");
    assert.ok(!execFileSync("/bin/ps", ["-o", "stat=", "-p", String(v.pid)], { encoding: "utf8" }).includes("T"), "nor frozen");
  } finally { await e.close(); try { process.kill(v.pid!, "SIGKILL"); } catch { /* gone */ } }
});

test("a seat with children whose chain of programs, each the head of a group of its own, goes on starting the next while it is taken out: none of them is left", { timeout: 60_000, skip: !mac || !existsSync("/usr/bin/perl") }, async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "sol-acp-chain-")));
  homes.push(dir);
  const file = join(dir, "pids");
  const pids = () => (existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").map(Number).filter((p) => p > 1) : []);
  const left = () => { const now = new Set(execFileSync("/bin/ps", ["-axo", "pid="], { encoding: "utf8" }).split("\n").map((l) => Number(l.trim()))); return pids().filter((p) => now.has(p)); };
  const seat = await bare({ children: true, closeMs: 200 });
  try {
    assert.equal((await turn({ run: seat.run } as SeatProvider, `chain 250 ${file}`)).deltas.join(""), "chaining");
    await seat.close();   // its SIGTERM starts the chain: it is still starting the next when the close time is over
    assert.ok(pids().length >= 20, `the chain was going: ${pids().length} of them`);
    assert.ok(await until(() => left().length === 0, 3000), `none is left: ${left().length} of ${pids().length} still there`);
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(left(), [], "and none comes after");
  } finally { for (const p of pids()) { try { process.kill(p, "SIGKILL"); } catch { /* gone */ } } }
});

test("the fake brain sits in: pressed, walled and kept running; a task streams, steps and spends; its permission request is an ask; a stop is a cancel and it lives on; taken out, the process is dead and the log has no new line", { timeout: 60_000, skip: !mac }, async () => {
  on();
  clearSeats();
  registerSeat(claude());
  const h = home();
  block(h, "brain");
  const k = new Kernel(h, opts(h));
  try {
    await k.sync();
    const card = k.waiting("brain");
    assert.ok(card, `it waits for a press: ${JSON.stringify(k.state("brain"))}`);
    assert.deepEqual(card!.asks.seat, ["node", "fake-acp.mjs"]);
    assert.equal(seatFor("brain").instead !== undefined, true, "not on the seam before the press, and nothing started");
    const r0 = await k.approve("brain", card!.print);
    assert.ok(r0.ok && r0.state?.state === "loaded", JSON.stringify(r0));
    const listed = seatList().find((s) => s.name === "brain");
    assert.deepEqual(listed?.can, { stream: true, resume: true, ask: true, perCall: "request", stopAtTool: true, mcp: "stdio", sandbox: "ours" });
    const s = seatFor("brain").seat;
    assert.equal(s.block, "brain");
    // one task: two chunks as two deltas, one tool step (started, then done), what it spent; its session back
    const t1 = await turn(s, "hello");
    assert.deepEqual(t1.r, { ok: true, text: "hello there", sessionId: "s1" });
    assert.deepEqual(t1.deltas, ["hello ", "there"]);
    assert.deepEqual(t1.steps, [{ id: "t1", tool: "read", title: "read notes.md", state: "started" }, { id: "t1", tool: "read", title: "read notes.md", state: "done" }]);
    assert.deepEqual(t1.usage, [{ in: 12, out: 5 }]);
    const sid = convoId("brain", "s1");
    const mine = k.since().filter((e) => e.by.agent === "seat:brain");
    assert.deepEqual(mine.map((e) => [e.kind, e.value]), [
      ["seat.turn", { session: sid }],
      ["seat.step", { session: sid, tool: "read", ok: true }],
      ["seat.usage", { session: sid, in: 12, out: 5 }],
      ["seat.done", { session: sid, ok: true }],
    ]);
    assert.ok(mine.every((e) => e.by.person === "seat" && (e as { ctx?: { session?: string } }).ctx?.session === sid), "by the seat, the conversation in ctx");
    // a step the agent names only in a later note ends under that name, and what it spent keeps the cached parts apart
    // (both as Claude Code's adapter says them: claude-agent-acp 0.106.0)
    const from = k.since().length;
    const t1b = await turn(s, "named late", { sessionId: "s1" });
    assert.deepEqual(t1b.steps, [{ id: "n1", tool: "execute", title: "Terminal", state: "started" }, { id: "n1", tool: "execute", title: "touch made.txt", state: "done" }]);
    assert.deepEqual(t1b.usage, [{ in: 4, out: 210, cacheRead: 80070, cacheWrite: 34314 }]);
    const late = k.since().slice(from);
    assert.deepEqual(late.filter((e) => e.kind === "seat.usage").map((e) => e.value), [{ session: sid, in: 4, out: 210, cacheRead: 80070, cacheWrite: 34314 }]);
    for (const e of late) { assert.equal(fits(e.kind, e.value), null, `${e.kind}'s value is what its row says it carries`); assert.equal(placeOf(e.kind, e.value), "line"); }
    assert.ok(!JSON.stringify(late).includes("touch made.txt") && !JSON.stringify(late).includes("Terminal"), "a step's title is its words: never on the log");
    assert.ok(!JSON.stringify(mine).includes("hello there"), "never its words");
    // its words in Chinese come through whole, wherever its stdout's reads are cut
    const split = await turn(s, "split", { sessionId: "s1" });
    assert.deepEqual([split.r, split.deltas], [{ ok: true, text: "中文字", sessionId: "s1" }, ["中文字"]], "a line written in two parts cut inside 中");
    for (const pad of ["", "a", "ab", "abc"]) {
      const long = (await turn(s, `long ${pad}`, { sessionId: "s1" })).deltas.join("");
      assert.equal(long, pad + "中".repeat(40000), `40,000 中 after ${JSON.stringify(pad)}: ${(long.match(/\uFFFD/g) ?? []).length} U+FFFD`);
    }
    // its environment is the clean one the kernel gave it: none of the engine's own (its keys among them)
    const env = JSON.parse((await turn(s, "env", { sessionId: "s1" })).deltas.join("")) as { names: string[]; home: string };
    assert.ok(!env.names.includes(ACP_SEAT_ENV) && !env.names.includes("PWD") && !env.names.includes("USER"), `none of the engine's: ${env.names.join(" ")}`);
    assert.ok(env.names.every((n) => ["HOME", "TMPDIR", "PATH", "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "SSL_CERT_FILE", "__CF_USER_TEXT_ENCODING"].includes(n)), `only its own: ${env.names.join(" ")}`);
    // the system's certificates are named to it and read through /etc as the link it is; nothing else in there is
    if (existsSync("/private/etc/ssl/cert.pem")) {
      assert.ok(env.names.includes("SSL_CERT_FILE"));
      assert.equal((await turn(s, "read /etc/ssl/cert.pem", { sessionId: "s1" })).deltas.join(""), "yes", "the certificates, through /etc");
    }
    assert.equal((await turn(s, "read /etc/hosts", { sessionId: "s1" })).deltas.join(""), "refused", "nothing else under /etc");
    // the system's tables of languages and time zones are read (Claude Code's program waits for ever without them)
    const icu = existsSync("/usr/share/icu") ? readdirSync("/usr/share/icu").find((f) => f.endsWith(".txt")) : undefined;
    if (icu) assert.equal((await turn(s, `read /usr/share/icu/${icu}`, { sessionId: "s1" })).deltas.join(""), "yes", "the system's ICU data");
    const beside = ["/usr/share/misc/units.lib", "/usr/share/misc/ascii"].find((f) => existsSync(f) && realpathSync(f) === f);   // a file that is there itself, not a link to elsewhere
    if (beside) assert.equal((await turn(s, `read ${beside}`, { sessionId: "s1" })).deltas.join(""), "refused", "nothing else under /usr/share");
    // an error's reason, when the agent says it only in the error's data: in the why, one line, nothing unseen
    assert.deepEqual((await turn(s, "fail", { sessionId: "s1" })).r, { ok: false, why: "Internal error: failed to load the workspace requirements (-32603)", sessionId: "s1" });
    // an error it wrote that cannot be said (objects where words are): the turn ends, the engine and the seat go on
    assert.deepEqual((await turn(s, "fail odd", { sessionId: "s1" })).r, { ok: false, why: "an error (?)", sessionId: "s1" });
    assert.equal((await turn(s, "pid", { sessionId: "s1" })).r.ok, true, "and the seat goes on");
    // the model and the effort a task names are set when the agent offers that very value; one it does not offer is
    // passed over; one it offers and will not set ends the turn with why, before any prompt
    assert.equal((await turn(s, "options?", { sessionId: "s1" })).deltas.join(""), "big medium", "as it started");
    assert.equal((await turn(s, "options?", { sessionId: "s1", model: "small", effort: "high" })).deltas.join(""), "small high");
    assert.equal((await turn(s, "options?", { sessionId: "s1", model: "gpt-nine", effort: "max" })).deltas.join(""), "small high", "not offered: passed over");
    assert.deepEqual((await turn(s, "options?", { sessionId: "s1", model: "stuck" })).r, { ok: false, why: "Invalid params: that model is stuck (-32602)", sessionId: "s1" });
    assert.equal((await turn(s, "options?", { sessionId: "s1" })).deltas.join(""), "small high", "and the seat goes on");
    const scratch = env.home;
    assert.ok(scratch.includes("sol-acp-seat-") && existsSync(scratch), `its scratch folder ${scratch}`);
    // its permission request is an ask: the tool, one line, the print of its arguments, the options; "no" is no
    const no = await turn(s, "ask", { sessionId: "s1", ask: async () => "no" });
    assert.deepEqual(no.asks, [{ kind: "permission", tool: "execute", line: "run rm -rf build", print: printOfArgs({ command: "rm -rf build" }), options: ["Allow once", "Always allow", "Reject"], args: { command: "rm -rf build" } }]);
    assert.deepEqual(no.r, { ok: true, text: "did not run it", sessionId: "s1" });
    const odd = await turn(s, "ask odd", { sessionId: "s1", ask: async () => "no" });
    assert.equal((odd.asks[0] as { line: string }).line, "run dliub fr- mr x", "the card's line: no override, no newline, nothing unseen");
    assert.equal((await turn(s, "ask", { sessionId: "s1", ask: async () => "once" })).r.ok && (await turn(s, "ask", { sessionId: "s1", ask: async () => "once" })).deltas.join(""), "ran it", "once: the allow_once option");
    assert.equal((await turn(s, "ask", { sessionId: "s1", ask: async () => "always" })).deltas.join(""), "did not run it", "anything but once is no: never always");
    // an agent that ends its turn at a no: said as that, not as a stop nobody pressed; with nobody to ask, the same
    assert.deepEqual((await turn(s, "ask or stop", { sessionId: "s1", ask: async () => "no" })).r, { ok: false, why: "the seat brain stopped there: it was not let run rm -rf build", sessionId: "s1" });
    assert.deepEqual(await s.run({ text: "ask or stop", sessionId: "s1" }, { delta: () => {} }, new AbortController().signal), { ok: false, why: "the seat brain stopped there: it was not let run rm -rf build", sessionId: "s1" });
    assert.equal((await turn(s, "ask or stop", { sessionId: "s1", ask: async () => "once" })).deltas.join(""), "ran it");
    const nobody = await s.run({ text: "ask", sessionId: "s1" }, { delta: () => {} }, new AbortController().signal);
    assert.deepEqual(nobody, { ok: true, text: "did not run it", sessionId: "s1" }, "nobody to ask: no");
    // a stop: session/cancel, the turn ends, the process lives on and heard it
    const pid = Number((await turn(s, "pid")).deltas.join(""));
    assert.ok(pid > 0 && alive(pid), `its pid ${pid}`);
    const stop = new AbortController();
    const waiting = turn(s, "wait", { sessionId: "s1", signal: stop.signal });
    await new Promise((r) => setTimeout(r, 200));
    stop.abort();
    assert.deepEqual((await waiting).r, { ok: false, why: "cancelled", sessionId: "s1" });
    assert.equal((await turn(s, "cancels?", { sessionId: "s1" })).deltas.join(""), "1", "it heard one session/cancel");
    assert.ok(alive(pid), "still running after a stop");
    assert.match((await s.run({ text: "x", sessionId: "s9" }, {}, new AbortController().signal) as { why: string }).why, /that conversation ended with the program that held it/);
    // walled: a file of the home's outside its own folder is not read, nothing is started; its own folder is
    writeFileSync(join(h, "secret.txt"), "the person's");
    assert.equal((await turn(s, `read ${join(h, "secret.txt")}`, { sessionId: "s1" })).deltas.join(""), "refused", "a file outside its wall");
    assert.equal((await turn(s, `read ${join(h, "things", "brain", "record.json")}`, { sessionId: "s1" })).deltas.join(""), "yes", "its own folder, read only");
    assert.equal((await turn(s, "fork", { sessionId: "s1" })).deltas.join(""), "refused", "no program of its own started");
    // a changed start after the press: wider, it waits again (and the old process is gone with the old load)
    const rec = record("brain", { speaks: "acp", start: ["node", "fake-acp.mjs", "again"] });
    writeFileSync(join(h, "things", "brain", "record.json"), JSON.stringify(rec));
    await k.sync();
    assert.deepEqual(k.waiting("brain")?.more, ["starting node fake-acp.mjs again as a seat"]);
    assert.ok(await until(() => !alive(pid)), "the old one stopped with its load");
    assert.ok(await until(() => !existsSync(scratch)), "its scratch folder went with it");
    assert.equal(seatFor("brain").instead !== undefined, true);
    await k.approve("brain", k.waiting("brain")!.print);
    const pid2 = Number((await turn(seatFor("brain").seat, "pid")).deltas.join(""));
    assert.ok(pid2 > 0 && pid2 !== pid && alive(pid2));
    const s2 = seatFor("brain").seat;
    const scratch2 = (JSON.parse((await turn(s2, "env")).deltas.join("")) as { home: string }).home;
    assert.ok(scratch2 !== scratch && existsSync(scratch2));
    // pull it out in the middle of a turn, its permission ask waiting on a person: the process is dead, it is off the
    // seam, the turn ends, and after the unload's own lines the log has none (no seat.done from a seat taken out)
    let asked = 0;
    const mid = turn(s2, "ask", { ask: () => { asked++; return new Promise<string>(() => {}); } });
    assert.ok(await until(() => asked === 1), "its ask waits on a person");
    const before = k.lastSeq();
    rmSync(join(h, "things", "brain"), { recursive: true });
    await k.sync();
    assert.equal((await mid).r.ok, false, "the turn in the middle ended");
    assert.ok(await until(() => !existsSync(scratch2)), "its scratch folder is gone");
    assert.equal(alive(pid2), false, "the process is dead once it is taken out");
    assert.equal(seatFor("brain").instead, "the seat brain is not here, so Claude took the turn");
    const unload = k.since(before);
    assert.deepEqual(unload.map((e) => [e.kind, e.item, e.value]), [["plugin.seat", "brain", { provided: false, why: "gone from the home" }], ["plugin.unload", "brain", { why: "gone from the home" }]]);
    const last = k.lastSeq();
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(k.lastSeq(), last, "zero new lines after it is out");
  } finally { await k.stop(); clearSeats(); off(); }
});

test("a seat whose record says children: its own folder's files and the programs it declares start inside the same wall, nothing else; its declared home folder is at the same place in its scratch home; taken out, what it started is dead and the folder it was given is whole", { timeout: 60_000, skip: !mac }, async () => {
  on();
  clearSeats();
  registerSeat(claude());
  const h = home();
  const me = realpathSync(mkdtempSync(join(tmpdir(), "sol-acp-me-")));   // the person's home, for the test
  homes.push(me);
  mkdirSync(join(me, ".fake-login", "deep"), { recursive: true });
  writeFileSync(join(me, ".fake-login", "token"), "the login");
  writeFileSync(join(me, ".fake-login", "deep", "kept"), "kept");
  writeFileSync(join(me, "other.txt"), "the person's");
  const start = ["env", "FAKE_SAYS=hello", "node", "fake-acp.mjs"];
  const rec = (children: boolean, begin = start) => ({ ...record("brain"), needs: { why: "my own brain, with a shell of its own", programs: ["env", "node", "sleep", "echo"], folders: ["~/.fake-login"], provides: ["seat"], seat: { speaks: "acp", start: begin, ...(children ? { children: true } : {}) } } });
  const d = join(h, "things", "brain");
  block(h, "brain");
  writeFileSync(join(d, "record.json"), JSON.stringify(rec(false, ["env", findProgram("node")!, "fake-acp.mjs"])));
  writeFileSync(join(d, "tool.mjs"), "#!/usr/bin/env node\nprocess.exit(0);\n");
  chmodSync(join(d, "tool.mjs"), 0o755);
  const k = new Kernel(h, { ...opts(h), me });
  try {
    await k.sync();
    await k.approve("brain", k.waiting("brain")!.print);
    // without children its program is the only one that ever starts: env may not start node, named by its very file,
    // and it is the wall that says no
    assert.match(k.state("brain")?.why ?? "", /its seat did not start: its program ended .*node: Operation not permitted/, JSON.stringify(k.state("brain")));
    // children added after the press (and node by its name): wider, pressed again
    writeFileSync(join(d, "record.json"), JSON.stringify(rec(true)));
    await k.sync();
    assert.ok(k.waiting("brain")?.more?.includes("its seat starting other programs"), JSON.stringify(k.waiting("brain")?.more));
    assert.equal(k.waiting("brain")?.asks.seatChildren, true);
    const r0 = await k.approve("brain", k.waiting("brain")!.print);
    assert.ok(r0.ok && r0.state?.state === "loaded", JSON.stringify(r0));
    const s = seatFor("brain").seat;
    const env = JSON.parse((await turn(s, "env")).deltas.join("")) as { names: string[]; home: string; path: string };
    const scratch = env.home;
    assert.ok(env.names.includes("FAKE_SAYS"), "started through env, as its record says");
    assert.equal(env.path, join(scratch, ".sol-bin"), "its PATH is the folder of its declared programs' names");
    // what starts: a declared program by its name and by its file, a file in its own folder; nothing else
    assert.equal((await turn(s, "run echo hi", { sessionId: "s1" })).deltas.join(""), "yes", "a declared program, by name");
    assert.equal((await turn(s, "run /bin/echo hi", { sessionId: "s1" })).deltas.join(""), findProgram("echo") === "/bin/echo" ? "yes" : "refused", "the file that name is");
    assert.equal((await turn(s, `run ${join(d, "tool.mjs")}`, { sessionId: "s1" })).deltas.join(""), "yes", "a file in its own folder");
    assert.equal((await turn(s, "run /bin/ls", { sessionId: "s1" })).deltas.join(""), "refused", "a program it did not declare");
    assert.equal((await turn(s, "run ls", { sessionId: "s1" })).deltas.join(""), "refused", "nor by name");
    copyFileSync(join(d, "tool.mjs"), join(scratch, "tool.mjs"));
    chmodSync(join(scratch, "tool.mjs"), 0o755);
    assert.equal((await turn(s, `run ${join(scratch, "tool.mjs")}`, { sessionId: "s1" })).deltas.join(""), "refused", "a file it could write is not one it may start");
    // the wall is the same one: what the person has outside its folders is not read, by it or through a program it starts
    assert.equal((await turn(s, `read ${join(me, "other.txt")}`, { sessionId: "s1" })).deltas.join(""), "refused");
    assert.equal((await turn(s, `run /bin/echo`, { sessionId: "s1" })).r.ok, true);
    // its declared folder in the person's home is at the same place in its scratch home: read and written there
    assert.ok(lstatSync(join(scratch, ".fake-login")).isSymbolicLink());
    assert.equal((await turn(s, `read ${join(scratch, ".fake-login", "token")}`, { sessionId: "s1" })).deltas.join(""), "yes");
    assert.equal((await turn(s, `write ${join(scratch, ".fake-login", "made")}`, { sessionId: "s1" })).deltas.join(""), "yes");
    assert.equal(readFileSync(join(me, ".fake-login", "made"), "utf8"), "written by the seat");
    assert.equal((await turn(s, `write ${join(me, "other.txt")}`, { sessionId: "s1" })).deltas.join(""), "refused");
    // two programs it left running, one of them out of its process group: both dead once it is taken out
    const pid = Number((await turn(s, "pid", { sessionId: "s1" })).deltas.join(""));
    const pids = JSON.parse((await turn(s, "spawn", { sessionId: "s1" })).deltas.join("")) as number[];
    assert.ok(pids.length === 2 && pids.every((p) => p > 1 && alive(p)), `its two sleeps ${pids.join(" ")}`);
    rmSync(d, { recursive: true });
    await k.sync();
    assert.ok(await until(() => !alive(pid) && pids.every((p) => !alive(p))), `it and what it started are dead: ${[pid, ...pids].filter(alive).join(" ")} still there`);
    assert.ok(await until(() => !existsSync(scratch)), "its scratch folder is gone");
    assert.equal(readFileSync(join(me, ".fake-login", "token"), "utf8"), "the login", "the folder it was given is whole");
    assert.equal(readFileSync(join(me, ".fake-login", "deep", "kept"), "utf8"), "kept");
    assert.equal(readFileSync(join(me, ".fake-login", "made"), "utf8"), "written by the seat");
  } finally { await k.stop(); clearSeats(); off(); }
});

test("a seat with children that goes wrong: one that ends by itself takes what it started with it, a sleep that left its group and one whose parent has ended since included, and a scratch folder it made impossible to remove is left, nothing thrown; one with more programs than it may have is stopped, said; one that put a link elsewhere where a folder of its scratch home was has nothing removed there; one whose child left its group, takes no SIGTERM and keeps starting programs has none left once it is taken out", { timeout: 120_000, skip: !mac }, async () => {
  on();
  clearSeats();
  registerSeat(claude());
  const me = realpathSync(mkdtempSync(join(tmpdir(), "sol-acp-me-")));   // the person's home, for the test
  homes.push(me);
  const given = join(me, "deep", ".fake-login"), elsewhere = join(me, "elsewhere");
  mkdirSync(given, { recursive: true });
  writeFileSync(join(given, "token"), "the login");
  writeFileSync(join(me, "other.txt"), "the person's");
  mkdirSync(elsewhere);
  writeFileSync(join(elsewhere, "kept"), "kept");
  symlinkSync(join(me, "other.txt"), join(elsewhere, ".fake-login"));   // a link of the person's own, named as the seat's is
  const rec = { ...record("brain"), needs: { why: "my own brain, with a shell of its own", programs: ["node", "sleep"], folders: ["~/deep/.fake-login"], provides: ["seat"], seat: { speaks: "acp", start: ["node", "fake-acp.mjs"], children: true } } };
  const load = async (seat?: { kidsMax: number }) => {
    const h = home(), d = join(h, "things", "brain");
    block(h, "brain");
    writeFileSync(join(d, "record.json"), JSON.stringify(rec));
    const k = new Kernel(h, { ...opts(h), me, ...(seat ? { seat } : {}) });
    await k.sync();
    const r = await k.approve("brain", k.waiting("brain")!.print);
    assert.ok(r.ok && r.state?.state === "loaded", JSON.stringify(r));
    return { k, d, s: seatFor("brain").seat };
  };
  const pidsOf = (file: string) => JSON.parse(readFileSync(file, "utf8")) as number[];
  const left: string[] = [];   // a scratch folder the seat made impossible to remove: this test removes it
  try {
    // it ends by itself: both sleeps left its group, and the parent of the second has ended by then
    const a = await load();
    try {
      const scratch = (JSON.parse((await turn(a.s, "env")).deltas.join("")) as { home: string }).home;
      left.push(scratch);
      assert.equal((await turn(a.s, "lock", { sessionId: "s1" })).deltas.join(""), "yes");
      assert.equal((await turn(a.s, `hide ${join(given, "hidden")}`, { sessionId: "s1" })).deltas.join(""), "hidden");
      const pids = pidsOf(join(given, "hidden"));
      assert.ok(pids.length === 2 && pids.every((p) => p > 1 && alive(p)), `its two sleeps ${pids.join(" ")}`);
      await new Promise((r) => setTimeout(r, 700));   // the program between has ended
      const r = await turn(a.s, "die", { sessionId: "s1" });
      assert.match(r.r.ok ? "" : r.r.why, /^the seat brain is gone: its program ended \(exit 3\)/);
      assert.ok(await until(() => pids.every((p) => !alive(p))), `what it started is dead: ${pids.filter(alive).join(" ")} still there`);
      assert.ok(await until(() => a.k.state("brain")?.state === "broken"));
      // its scratch folder cannot be removed (the folder in it nobody may open): left there, and the kernel goes on
      await new Promise((r) => setTimeout(r, 500));
      assert.ok(existsSync(join(scratch, "shut")), "left where it is");
      await a.k.sync();
      assert.equal(a.k.state("brain")?.state, "broken", "the kernel goes on");
    } finally { await a.k.stop(); clearSeats(); registerSeat(claude()); }
    // more programs at once than it may have: stopped, with what it started, and the block says why
    const b = await load({ kidsMax: 4 });
    try {
      const r = await turn(b.s, `spawn many 9 ${join(given, "many")}`);
      assert.equal(r.r.ok ? "" : r.r.why, "the seat brain is gone: it had more than 4 programs running at once, and was stopped");
      const pids = pidsOf(join(given, "many"));
      assert.equal(pids.length, 9);   // four of them out of its group
      assert.ok(await until(() => pids.every((p) => !alive(p))), `what it started is dead: ${pids.filter(alive).join(" ")} still there`);
      assert.ok(await until(() => b.k.state("brain")?.state === "broken"));
      assert.match(b.k.state("brain")?.why ?? "", /it had more than 4 programs running at once, and was stopped/);
    } finally { await b.k.stop(); clearSeats(); registerSeat(claude()); }
    // the folder its link was in, moved aside by it, a link to a folder of the person's in its place: taken out, only
    // its scratch folder is removed, and the person's link of the same name is still there
    const c = await load();
    try {
      const scratch = (JSON.parse((await turn(c.s, "env")).deltas.join("")) as { home: string }).home;
      assert.ok(lstatSync(join(scratch, "deep", ".fake-login")).isSymbolicLink());
      assert.equal((await turn(c.s, `swap deep ${elsewhere}`, { sessionId: "s1" })).deltas.join(""), "yes");
      assert.ok(lstatSync(join(scratch, "deep")).isSymbolicLink(), "its scratch home's folder is now a link elsewhere");
      rmSync(c.d, { recursive: true });
      await c.k.sync();
      assert.ok(await until(() => !existsSync(scratch)), "its scratch folder is gone");
      assert.ok(lstatSync(join(elsewhere, ".fake-login")).isSymbolicLink(), "the person's link is still there");
      assert.equal(readFileSync(join(elsewhere, "kept"), "utf8"), "kept");
      assert.equal(readFileSync(join(me, "other.txt"), "utf8"), "the person's");
      assert.equal(readFileSync(join(given, "token"), "utf8"), "the login", "the folder it was given is whole");
    } finally { await c.k.stop(); clearSeats(); registerSeat(claude()); }
    // a child out of its group that takes no SIGTERM and goes on starting a sleep and killing the one before: taken
    // out, it has the close time, then it and every sleep of its are dead (frozen before they are counted and killed)
    const e = await load();
    try {
      assert.equal((await turn(e.s, `churn ${join(given, "churn")}`)).deltas.join(""), "churning");
      const [churner] = pidsOf(join(given, "churn"));
      assert.ok(churner! > 1 && alive(churner!) && inGroup(churner!).length >= 2, `it and a sleep of its, in its own group: ${inGroup(churner!).join(" ")}`);
      rmSync(e.d, { recursive: true });
      await e.k.sync();
      assert.ok(await until(() => inGroup(churner!).length === 0), `nothing of its is left: ${inGroup(churner!).join(" ")} still there`);
      await new Promise((r) => setTimeout(r, 300));
      assert.deepEqual(inGroup(churner!), [], "and none comes back");
    } finally { await e.k.stop(); }
  } finally { clearSeats(); off(); for (const d of left) { try { chmodSync(join(d, "shut"), 0o700); } catch { /* not there */ } rmSync(d, { recursive: true, force: true }); } }
});

test("a seat that does not answer when a conversation is opened, or when one of its options is set: the task ends after its time, saying so, the next one goes on, and an answer that comes after its time is passed over", { timeout: 60_000, skip: !mac }, async () => {
  on();
  clearSeats();
  registerSeat(claude());
  const h = home();
  block(h, "brain", { speaks: "acp", start: ["node", "fake-acp.mjs", "slow"] });
  const k = new Kernel(h, { ...opts(h), seat: { answerMs: 300 } });
  try {
    await k.sync();
    await k.approve("brain", k.waiting("brain")!.print);
    const s = seatFor("brain").seat;
    const r1 = await turn(s, "hello");
    assert.equal(r1.r.ok ? "" : r1.r.why, "it did not answer session/new within 300 ms");
    const r2 = await turn(s, "hello");
    assert.ok(r2.r.ok && r2.r.text === "hello there", JSON.stringify(r2.r));
    const r3 = await turn(s, "options?", { sessionId: "s1", model: "small" });
    assert.equal(r3.r.ok ? "" : r3.r.why, "it did not answer session/set_config_option within 300 ms");
    await new Promise((r) => setTimeout(r, 500));   // its answer comes now, for a call nobody waits on
    const r4 = await turn(s, "options?", { sessionId: "s1", model: "small" });
    assert.deepEqual([r4.r.ok, r4.deltas.join("")], [true, "small medium"]);
  } finally { await k.stop(); clearSeats(); off(); }
});

test("the wall's profile: as it was without children; with them fork, the declared files and the own folder to start, and a signal only inside the wall", { skip: !mac }, () => {
  const node = findProgram("node")!, echo = findProgram("echo")!;
  const wall = { exe: node, read: ["/private/tmp/sol-a"], write: ["/private/tmp/sol-b"], proxy: 1234 };
  const closed = profileOf(wall), open = profileOf({ ...wall, children: { exes: [echo], within: ["/private/tmp/sol-a"] } });
  assert.ok(closed.includes("(deny process-fork)") && !closed.includes("(allow process-fork)") && !closed.includes("same-sandbox") && !closed.includes(echo));
  assert.ok(open.includes("(allow process-fork)") && !open.includes("(deny process-fork)"));
  assert.ok(open.includes(`(allow process-exec (literal ${JSON.stringify(echo)}) (subpath "/private/tmp/sol-a"))`), open);
  assert.ok(open.includes("(allow signal (target same-sandbox))"));
  // every other line of the closed wall is in the open one; the line of folders it may see the name of only grows
  const names = (l: string) => l.match(/\(literal "[^"]*"\)/g) ?? [];
  const gone = closed.split("\n").filter((l) => !open.includes(l));
  assert.equal(gone.length, 2, gone.join("\n"));
  assert.equal(gone[0], "(deny process-fork)");
  assert.ok(gone[1]!.startsWith("(allow file-read-metadata "), gone[1]);
  const wider = open.split("\n").find((l) => l.startsWith("(allow file-read-metadata ") && names(gone[1]!).every((n) => l.includes(n)));
  assert.ok(wider, "the same folders' names, and the declared program's");
});

test("killed from outside: off the seam with one line that says so and the block broken; the next turn is Claude's, said", { timeout: 60_000, skip: !mac }, async () => {
  on();
  clearSeats();
  registerSeat(claude());
  const h = home();
  block(h, "brain");
  const k = new Kernel(h, opts(h));
  try {
    await k.sync();
    await k.approve("brain", k.waiting("brain")!.print);
    const pid = Number((await turn(seatFor("brain").seat, "pid")).deltas.join(""));
    assert.ok(alive(pid));
    const before = k.lastSeq();
    process.kill(pid, "SIGKILL");
    assert.ok(await until(() => seatFor("brain").instead !== undefined), "off the seam");
    const lines = k.since(before);
    const off1 = lines.filter((e) => e.kind === "plugin.seat");
    assert.equal(off1.length, 1);
    assert.equal((off1[0].value as { provided: boolean }).provided, false);
    assert.match((off1[0].value as { why: string }).why, /its program ended \(signal SIGKILL\)/);
    assert.equal(k.state("brain")?.state, "broken");
    const next = seatFor("brain");
    assert.equal(next.seat.name, "claude");
    assert.equal(next.instead, "the seat brain is not here, so Claude took the turn");
  } finally { await k.stop(); clearSeats(); off(); }
});

test("what keeps a seat from starting: the switch off (refused as before, nothing started), another ACP version, an engine half beside it", { timeout: 60_000, skip: !mac }, async () => {
  clearSeats();
  registerSeat(claude());
  const h = home();
  block(h, "brain");
  off();
  const k = new Kernel(h, opts(h));
  try {
    await k.sync();
    assert.equal(k.state("brain")?.state, "broken");
    assert.match(k.state("brain")?.why ?? "", /needs has "seat", which is not one of its columns/);
    assert.equal(k.waiting("brain"), null, "no card: nothing to press");
    on();
    block(h, "newer", { speaks: "acp", start: ["node", "fake-acp.mjs", "v2"] });
    block(h, "halved");
    writeFileSync(join(h, "things", "halved", "engine.js"), "export default () => {};");
    await k.sync();
    await k.approve("newer", k.waiting("newer")!.print);
    assert.match(k.state("newer")?.why ?? "", /its seat did not start: it speaks ACP version 2, and Sol speaks 1/);
    assert.match(k.state("halved")?.why ?? "", /a seat the shell starts is its program: no engine half goes with it/);
    assert.equal(seatFor("newer").instead !== undefined, true);
  } finally { await k.stop(); clearSeats(); off(); }
});

/** a free port in this unit's range (8520-8529) */
async function freePort(): Promise<number> {
  for (let p = 8520; p <= 8529; p++) {
    const ok = await new Promise<boolean>((r) => { const s = createServer(); s.once("error", () => r(false)); s.listen(p, "127.0.0.1", () => s.close(() => r(true))); });
    if (ok) return p;
  }
  throw new Error("no free port in 8520-8529");
}

test("a real engine: the fake brain's permission request reaches Sol's window as one card, answered there; its steps are the face's steps and what it spent rides on the done", { timeout: 90_000, skip: !mac }, async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "sol-acp-wire-")));
  homes.push(dir);
  const h = join(dir, "home");
  mkdirSync(join(h, "things"), { recursive: true });
  mkdirSync(join(dir, "tmp"));
  block(h, "brain");
  const PORT = await freePort();
  engine = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ENGINE, stdio: "ignore",
    env: {
      ...process.env, SOL_PORT: String(PORT), SOL_HOME: h, SOL_PROFILE: join(dir, "profile"), SOL_STATE: join(dir, "work.json"),
      SOL_TEAM: join(dir, "team.json"), SOL_LOG: join(dir, "engine.log"), SOL_LOGDIR: join(dir, "log"),
      SOL_APPDIR: join(dir, "app"), SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off", SOL_FRAME: "on", [ACP_SEAT_ENV]: "on", TMPDIR: join(dir, "tmp"),   // the seat's scratch folder is in here: the engine is killed, not stopped
    },
  });
  const url = `http://127.0.0.1:${PORT}`;
  const get = async (p: string) => (await fetch(url + p)).json() as Promise<any>;
  let things: any = null;
  for (let i = 0; i < 150 && !things?.things?.[0]?.waiting; i++) {
    try { things = await get("/things"); } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  const print = things.things[0].waiting.print;
  const SOL = { origin: "http://localhost:1420" };
  const ok = await fetch(`${url}/things/brain/approve`, { method: "POST", headers: { ...SOL, "content-type": "application/json" }, body: JSON.stringify({ print }) });
  assert.equal(ok.status, 200);
  assert.ok((await get("/things/seats")).seats.some((s: any) => s.name === "brain" && s.can.ask === true));
  const open = async (headers: Record<string, string>) => { const w = new WebSocket(`ws://127.0.0.1:${PORT}/`, { headers }); await new Promise((r, no) => { w.once("open", r); w.once("error", no); }); return w; };
  // a page that is not Sol's never gets a socket to answer on (the door, index.ts); the answer's own check is behind it
  await assert.rejects(open({ origin: "http://evil.example" }), /403/);
  const ws = await open(SOL), other = await open(SOL);   // another window of Sol's: it is not shown the card
  const got: any[] = [], otherGot: any[] = [];
  other.on("message", (raw) => otherGot.push(JSON.parse(String(raw))));
  const done = new Promise<void>((r) => ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (["delta", "done", "error", "seat.ask", "tool"].includes(m.type)) got.push(m);
    if (m.type === "seat.ask") {
      ws.send(JSON.stringify({ type: "seat.answer", id: "seat-ask-not-one", answer: "once" }));   // an id that is no card's: nothing
      setTimeout(() => ws.send(JSON.stringify({ type: "seat.answer", id: m.id, answer: "no" })), 300);
    }
    if (m.type === "done") r();
  }));
  ws.send(JSON.stringify({ type: "say", text: "ask", seat: "brain" }));
  await done;
  const cards = got.filter((m) => m.type === "seat.ask");
  assert.equal(cards.length, 1, "one card");
  assert.equal(cards[0].seat, "brain");
  assert.deepEqual(cards[0].ask, { kind: "permission", tool: "execute", line: "run rm -rf build", print: printOfArgs({ command: "rm -rf build" }), options: ["Allow once", "Always allow", "Reject"], args: { command: "rm -rf build" } });
  assert.ok(!otherGot.some((m) => m.type === "seat.ask"), "the card is on the turn's socket only");
  assert.equal(got.filter((m) => m.type === "delta").map((m) => m.text).join(""), "did not run it", "Sol's window said no; a once for no card counted for nothing");
  const end = got.find((m) => m.type === "done");
  assert.equal(end.ok, true);
  assert.match(end.sessionId, /^seat-brain-[a-z0-9]+$/);
  // a task with a step and what it spent, in the same conversation
  const got2: any[] = [];
  await new Promise<void>((r) => { ws.removeAllListeners("message"); ws.on("message", (raw) => { const m = JSON.parse(String(raw)); if (["delta", "done", "error", "tool"].includes(m.type)) got2.push(m); if (m.type === "done") r(); }); ws.send(JSON.stringify({ type: "say", text: "hello", seat: "brain", sessionId: end.sessionId })); });
  assert.deepEqual(got2.filter((m) => m.type === "tool").map((m) => [m.seat, m.kind, m.text, m.done, m.ok]), [["brain", "read", "read notes.md", false, undefined], ["brain", "read", "read notes.md", true, true]]);
  assert.deepEqual(got2.find((m) => m.type === "done").tokens, { in: 12, out: 5 });
  // a step named late is shown under its name at its end, and the cached parts ride on the done beside in and out
  const got3: any[] = [];
  await new Promise<void>((r) => { ws.removeAllListeners("message"); ws.on("message", (raw) => { const m = JSON.parse(String(raw)); if (["done", "error", "tool"].includes(m.type)) got3.push(m); if (m.type === "done") r(); }); ws.send(JSON.stringify({ type: "say", text: "named late", seat: "brain", sessionId: end.sessionId })); });
  assert.deepEqual(got3.filter((m) => m.type === "tool").map((m) => [m.kind, m.text, m.done, m.ok]), [["command", "Terminal", false, undefined], ["command", "touch made.txt", true, true]]);
  assert.deepEqual(got3.find((m) => m.type === "done").tokens, { in: 4, out: 210, cacheRead: 80070, cacheWrite: 34314 });
  ws.close();
  other.close();
  const log = await get("/log");
  assert.ok(log.events.some((e: any) => e.kind === "seat.usage" && e.by.agent === "seat:brain" && e.value.in === 12));
  assert.ok(!JSON.stringify(log.events).includes("did not run it"), "the seat's words are not on the log");
});

// ---- a seat started with a key in its environment (needs.seat.key): an agent that logs in with a token ----

const KEYED = { ...SEAT, key: "brain-login", keyAs: "BRAIN_TOKEN" };
const keyed = (seat: unknown = KEYED, needs: Record<string, unknown> = {}) => ({ ...record("brain"), needs: { why: "my own brain, logged in with its token", programs: ["node"], keys: ["brain-login"], provides: ["seat"], seat, ...needs } });

test("needs.seat's key, pure: a key needs.keys names under a name in its environment, each bad shape refused with why; on the card in a sentence of its own, and added or changed after a press it is wider; a card that asks none has no new field", () => {
  on();
  const why = (r: Record<string, unknown>) => { const c = columnsOf(r); return c.ok ? "" : c.why; };
  const ok = columnsOf(keyed());
  assert.ok(ok.ok, JSON.stringify(ok));
  assert.deepEqual(ok.ok && ok.columns.needs?.seat, { speaks: "acp", start: ["node", "fake-acp.mjs"], key: "brain-login", keyAs: "BRAIN_TOKEN" });
  assert.match(why(keyed({ ...SEAT, key: "other", keyAs: "BRAIN_TOKEN" })), /needs\.seat's key other is not among the keys needs\.keys names/);
  assert.match(why(keyed({ ...SEAT, key: "Not A Name", keyAs: "BRAIN_TOKEN" })), /needs\.seat's key is not a key's name/);
  assert.match(why(keyed({ ...SEAT, key: 7, keyAs: "BRAIN_TOKEN" })), /needs\.seat's key is not a key's name/);
  assert.match(why(keyed({ ...SEAT, key: "brain-login" })), /needs\.seat's key without a keyAs that is a name in its environment/);
  for (const bad of ["token", "1TOKEN", "MY-TOKEN", "A=B", "", "A".repeat(65), 7]) assert.match(why(keyed({ ...SEAT, key: "brain-login", keyAs: bad })), /without a keyAs that is a name in its environment/, String(bad));
  for (const own of ["HOME", "TMPDIR", "PATH", "HTTPS_PROXY", "HTTP_PROXY", "SSL_CERT_FILE"]) assert.match(why(keyed({ ...SEAT, key: "brain-login", keyAs: own })), new RegExp(`needs\\.seat's keyAs is ${own}, which Sol sets itself`));
  assert.match(why(keyed({ ...SEAT, keyAs: "BRAIN_TOKEN" })), /needs\.seat's keyAs without a key/);
  // the card
  const cols = ok.ok ? ok.columns : (null as never);
  const a = askOf(cols);
  assert.deepEqual(a.seatKey, ["brain-login", "BRAIN_TOKEN"]);
  const card = cardOf(join(tmpdir(), "no-app"), "brain", cols, null, () => []);
  assert.ok(card.plain.includes("That seat is started with the key brain-login in its environment (as BRAIN_TOKEN): its program holds the key itself, and can use it or send it wherever its wall lets it reach. Paste another or take it away, and the seat starts again or waits."), card.plain.join("\n"));
  assert.deepEqual(card.missing, ["brain-login"], "and it waits for the key to be pasted, as any block that names one");
  const reach = columnsOf(keyed(KEYED, { domains: ["api.example.com"] }));
  assert.ok(reach.ok && cardOf(join(tmpdir(), "no-app"), "brain", reach.columns, null, () => []).plain.some((l) => l.includes("wherever its wall lets it reach (api.example.com).")), "the hosts it reaches are named in that sentence");
  const kept = columnsOf(keyed(KEYED, { domains: ["api.example.com"], folders: ["~/notes"] }));
  assert.ok(kept.ok && cardOf(join(tmpdir(), "no-app"), "brain", kept.columns, null, () => []).plain.some((l) => /wherever its wall lets it reach \(api\.example\.com\), or keep a copy in \/\S*\/notes\. Paste another/.test(l)), "and the folders it could write it in");
  // wider: a key it did not hold when pressed, or the same key under another name
  const plain = columnsOf(keyed(SEAT));
  assert.ok(plain.ok && !("seatKey" in askOf(plain.columns)) && !("key" in plain.columns.needs!.seat!), "left out: no new field, the print does not move");
  const before = askOf(plain.ok ? plain.columns : (null as never));
  assert.deepEqual(widerThan({ ...before }, a), ["its seat holding the key brain-login (as BRAIN_TOKEN)"]);
  assert.deepEqual(widerThan({ ...a, seatKey: ["brain-login", "OTHER_NAME"] }, a), ["its seat holding the key brain-login (as BRAIN_TOKEN)"]);
  assert.deepEqual(widerThan({ ...a }, a), []);
  assert.deepEqual(widerThan({ ...a }, before), [], "narrower asks nothing");
  assert.notEqual(card.print, cardOf(join(tmpdir(), "no-app"), "brain", plain.ok ? plain.columns : (null as never), null, () => []).print, "another card to press");
  // the cut itself: whole, in two pieces, a key that overlaps itself, every string of a value, a tail that begins inside it
  const c = cutOut("abab-secret");
  assert.equal(c.text("x abab-secret y abab-secret"), "x [key] y [key]");
  assert.deepEqual(c.piece("", "say abab-sec"), { say: "say ", held: "abab-sec" });
  assert.deepEqual(c.piece("abab-sec", "ret done"), { say: "[key] done", held: "" });
  assert.deepEqual(c.piece("", "xabab"), { say: "x", held: "abab" }, "what could be its beginning waits");
  assert.deepEqual(c.piece("abab", "ab-secret."), { say: "ab[key].", held: "" }, "the key began two characters later than it could have");
  assert.deepEqual(c.piece("abab", " no"), { say: "abab no", held: "" }, "not the key: said whole");
  assert.deepEqual(c.all({ "abab-secret": ["abab-secret", 1, { deep: "a abab-secret" }], n: null }), { "[key]": ["[key]", 1, { deep: "a [key]" }], n: null });
  assert.equal(c.tail("-secret was refused", true), "[key] was refused");
  assert.equal(c.tail("-secret was refused", false), "-secret was refused", "not cut at its beginning: as written");
  const none = cutOut(undefined);
  assert.deepEqual(none.piece("", "abab-secret"), { say: "abab-secret", held: "" });
  assert.equal(none.text("abab-secret"), "abab-secret");
  off();
});

test("a seat that holds a key, with no wall: its text is cut out of its words (in two pieces too), a step's name, a question's line, options and arguments, an error's reason and why it ended; words that only begin as the key does are said", { timeout: 60_000 }, async () => {
  const SECRET = "tok-4f9a8b7c6d5e-not-a-real-one";
  const gone: string[] = [];
  const a = await bare({ env: { PATH: process.env.PATH ?? "", BRAIN_TOKEN: SECRET }, secret: SECRET, gone: (why) => gone.push(why) });
  const s = { run: a.run } as SeatProvider;
  try {
    const say = await turn(s, "key say BRAIN_TOKEN");
    assert.deepEqual(say.r, { ok: true, text: "it is [key].", sessionId: "s1" });
    assert.deepEqual(say.deltas, ["it is [key]."]);
    const split = await turn(s, "key split BRAIN_TOKEN", { sessionId: "s1" });
    assert.deepEqual(split.r, { ok: true, text: "it is [key].", sessionId: "s1" });
    assert.deepEqual(split.deltas, ["it is ", "[key]."], "its beginning waited for the rest");
    const begin = await turn(s, "key begin BRAIN_TOKEN", { sessionId: "s1" });
    assert.deepEqual(begin.r, { ok: true, text: "ends tok-", sessionId: "s1" });
    assert.deepEqual(begin.deltas, ["ends ", "tok-"], "what waited is said when the words end");
    const step = await turn(s, "key step BRAIN_TOKEN", { sessionId: "s1" });
    assert.deepEqual(step.steps, [{ id: "k1", tool: "execute", title: "echo [key]", state: "started" }, { id: "k1", tool: "execute", title: "echo [key]", state: "done" }]);
    const ask = await turn(s, "key ask BRAIN_TOKEN", { sessionId: "s1", ask: async () => "no" });
    assert.equal(ask.asks.length, 1);
    assert.deepEqual({ ...ask.asks[0], print: "" }, { kind: "permission", tool: "execute", line: "echo [key]", print: "", options: ["Allow [key]", "Reject"], args: { command: "echo [key]", env: { "[key]": ["[key]", 1] } } });
    assert.equal(ask.asks[0]!.print, printOfArgs({ command: "echo [key]", env: { "[key]": ["[key]", 1] } }), "the print is of what the card shows");
    assert.deepEqual(ask.r, { ok: true, text: "did not run it", sessionId: "s1" });
    const fail = await turn(s, "key fail BRAIN_TOKEN", { sessionId: "s1" });
    assert.deepEqual(fail.r, { ok: false, why: "Authentication required: the token [key] was refused (-32000)", sessionId: "s1" });
    // cut before it is shortened: a key that the 300 characters of a reason end inside is not said by its beginning
    const far = await turn(s, "key far BRAIN_TOKEN", { sessionId: "s1" });
    assert.ok(!far.r.ok && far.r.why.startsWith("Internal error: xxx") && !far.r.why.includes("tok-"), JSON.stringify(far.r));
    const kind = await turn(s, "key kind BRAIN_TOKEN", { sessionId: "s1" });
    assert.deepEqual(kind.steps, [{ id: "k2", tool: "other", title: "a step", state: "started" }, { id: "k2", tool: "other", title: "a step", state: "done" }]);
    const die = await turn(s, "key die BRAIN_TOKEN", { sessionId: "s1" });
    assert.deepEqual(die.r, { ok: false, why: "the seat bare is gone: its program ended (exit 3): cannot log in with [key]", sessionId: "s1" });
    assert.deepEqual(gone, ["its program ended (exit 3): cannot log in with [key]"]);
    for (const all of [say, split, begin, step, ask, fail, far, kind, die]) assert.ok(!JSON.stringify(all).includes(SECRET), "nowhere in what came back");
  } finally { await a.close(); }
  // a kind that is the key (one of small letters only passes as a kind): cut as all it says is, so it is no kind
  const LOW = "toknotarealonexyz";
  const c = await bare({ env: { PATH: process.env.PATH ?? "", BRAIN_TOKEN: LOW }, secret: LOW });
  try { assert.deepEqual((await turn({ run: c.run } as SeatProvider, "key kind BRAIN_TOKEN")).steps, [{ id: "k2", tool: "other", title: "a step", state: "started" }, { id: "k2", tool: "other", title: "a step", state: "done" }]); } finally { await c.close(); }
  // in its hello: as its version, and in the error it answers hello with, after 290 other characters
  const keyedEnv = { env: { PATH: process.env.PATH ?? "", BRAIN_TOKEN: SECRET }, secret: SECRET };
  await assert.rejects(bare({ ...keyedEnv, command: [process.execPath, FAKE, "vkey"] }), (e: Error) => e.message === "it speaks ACP version [key], and Sol speaks 1");
  await assert.rejects(bare({ ...keyedEnv, command: [process.execPath, FAKE, "nokey"] }), (e: Error) => e.message.startsWith("it did not answer initialize: xxx") && !e.message.includes("tok-"));
  // a key too short to cut out starts nothing
  assert.equal(SECRET_MIN, 8);
  await assert.rejects(bare({ env: { PATH: process.env.PATH ?? "", BRAIN_TOKEN: "key" }, secret: "key" }), /its key is shorter than 8 characters, too short to be cut out of what it says/);
  // one with no key says its environment as it is
  const b = await bare({ env: { PATH: process.env.PATH ?? "", BRAIN_TOKEN: SECRET } });
  try { assert.equal((await turn({ run: b.run } as SeatProvider, "key say BRAIN_TOKEN")).r.ok && (await turn({ run: b.run } as SeatProvider, "key say BRAIN_TOKEN")).deltas[0], `it is ${SECRET}.`); } finally { await b.close(); }
});

test("a seat started with a key: pressed, it waits for the key; pasted, it starts with it in its environment and nowhere in its arguments, and what it says of it is cut; another pasted in its place starts it again; a key that is for other hosts than the seat reaches is not handed over; taken away, it waits", { timeout: 90_000, skip: !mac }, async () => {
  on();
  clearSeats();
  registerSeat(claude());
  const h = home(), app = join(h, "app"), d = join(h, "things", "brain");
  const SECRET = "tok-4f9a8b7c6d5e-not-a-real-one", NEXT = "tok-00FF00ff00ff-not-a-real-one";
  const reached = () => k.since().filter((e) => e.kind === "plugin.refused").map((e) => (e.value as { what: string }).what);
  block(h, "brain");
  writeFileSync(join(d, "record.json"), JSON.stringify(keyed()));
  const k = new Kernel(h, opts(h));
  try {
    await k.sync();
    const card = k.waiting("brain");
    assert.deepEqual(card?.asks.seatKey, ["brain-login", "BRAIN_TOKEN"]);
    const r0 = await k.approve("brain", card!.print);
    assert.ok(r0.ok && r0.state?.state === "broken", JSON.stringify(r0));
    assert.match(k.state("brain")?.why ?? "", /waiting for the key brain-login: a person pastes it on its card/);
    assert.equal(seatFor("brain").instead !== undefined, true, "nothing started without its key");
    assert.deepEqual((k.since().find((e) => e.kind === "plugin.approve")?.value as { asks: { seatKey?: string[] } }).asks.seatKey, ["brain-login", "BRAIN_TOKEN"], "the press's line names the key and where it goes, never its text");
    // pasted: it starts, the key in its environment under that name
    assert.ok(pasteKey(app, { name: "brain-login", key: SECRET }, 1000).ok);
    await k.sync();
    assert.equal(k.state("brain")?.state, "loaded", JSON.stringify(k.state("brain")));
    const s = seatFor("brain").seat;
    const env = JSON.parse((await turn(s, "env")).r.ok ? (await turn(s, "env")).deltas.join("") : "{}") as { names: string[] };
    assert.ok(env.names.includes("BRAIN_TOKEN"), env.names.join(" "));
    const pid = Number((await turn(s, "pid")).deltas.join(""));
    assert.ok(!execFileSync("/bin/ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" }).includes(SECRET), "not among its arguments");
    const say = await turn(s, "key say BRAIN_TOKEN");
    assert.equal(say.r.ok && say.r.text, "it is [key].");
    // a host its key is spelled into, asked of its proxy: refused, and on the log without the key
    assert.equal((await turn(s, "key reach BRAIN_TOKEN")).deltas.join(""), "refused refused");
    assert.deepEqual(reached(), ["[key].example.com:443", "[key].example.com:80"]);
    const die = await turn(s, "key die BRAIN_TOKEN");
    assert.equal(die.r.ok, false);
    assert.ok(await until(() => k.state("brain")?.state === "broken"));
    assert.match(k.state("brain")?.why ?? "", /its program ended \(exit 3\): cannot log in with \[key\]/);
    assert.ok(!JSON.stringify(k.since()).includes(SECRET) && !JSON.stringify(k.state("brain")).includes(SECRET), "not on the log, not in its state");
    // another pasted in its place: started again, holding the new one
    assert.ok(pasteKey(app, { name: "brain-login", key: NEXT }, 2000).ok);
    await k.sync();
    assert.equal(k.state("brain")?.state, "loaded", JSON.stringify(k.state("brain")));
    const s2 = seatFor("brain").seat;
    const pid2 = Number((await turn(s2, "pid")).deltas.join(""));
    assert.notEqual(pid2, pid);
    assert.equal((await turn(s2, "key say BRAIN_TOKEN")).deltas.join(""), "it is [key].", "the new one is the one cut");
    assert.equal((await turn(s2, "key reach BRAIN_TOKEN")).deltas.join(""), "refused refused");
    assert.deepEqual(reached().slice(2), ["[key].example.com:443", "[key].example.com:80"], "in small letters too, as a host's name is read");
    assert.ok(!JSON.stringify(k.since()).toLowerCase().includes(NEXT.toLowerCase()));
    assert.ok(pasteKey(app, { name: "brain-login", key: SECRET }, 3000).ok);
    await k.sync();
    assert.ok(await until(() => !alive(pid2)), "the one that held the old key is gone");
    assert.notEqual(Number((await turn(seatFor("brain").seat, "pid")).deltas.join("")), pid2, "pasted again while it ran: started again");
    // a key that is for other hosts than its seat reaches: not handed over
    writeFileSync(join(d, "record.json"), JSON.stringify(keyed(KEYED, { domains: ["api.example.com", "elsewhere.example.com"] })));
    await k.sync();
    await k.approve("brain", k.waiting("brain")!.print);
    assert.match(k.state("brain")?.why ?? "", /the key brain-login is for no host yet \(its hosts are said when it is pasted\), and its seat reaches api\.example\.com, elsewhere\.example\.com too: a seat holds its key/);
    assert.ok(pasteKey(app, { name: "brain-login", key: SECRET, hosts: ["api.example.com"] }, 4000).ok);
    await k.sync();
    assert.match(k.state("brain")?.why ?? "", /the key brain-login is for api\.example\.com, and its seat reaches elsewhere\.example\.com too/);
    assert.ok(pasteKey(app, { name: "brain-login", key: SECRET, hosts: ["api.example.com", "elsewhere.example.com"] }, 5000).ok);
    await k.sync();
    assert.equal(k.state("brain")?.state, "loaded", JSON.stringify(k.state("brain")));
    // one too short to be cut out of what the seat says: no seat is started with it
    assert.ok(pasteKey(app, { name: "brain-login", key: "short", hosts: ["api.example.com", "elsewhere.example.com"] }, 6000).ok);
    await k.sync();
    assert.match(k.state("brain")?.why ?? "", /the key brain-login is shorter than 8 characters: too short to be cut out of what its seat says, so no seat is started with it/);
    assert.equal(seatFor("brain").instead !== undefined, true);
    assert.ok(pasteKey(app, { name: "brain-login", key: SECRET, hosts: ["api.example.com", "elsewhere.example.com"] }, 7000).ok);
    await k.sync();
    assert.equal(k.state("brain")?.state, "loaded", JSON.stringify(k.state("brain")));
    // taken away: it waits for it, its program gone
    const pid3 = Number((await turn(seatFor("brain").seat, "pid")).deltas.join(""));
    assert.ok(removeKey(app, "brain-login"));
    await k.sync();
    assert.match(k.state("brain")?.why ?? "", /waiting for the key brain-login/);
    assert.ok(await until(() => !alive(pid3)), "its process is dead");
    assert.equal(seatFor("brain").instead !== undefined, true);
  } finally { await k.stop(); clearSeats(); off(); }
});
