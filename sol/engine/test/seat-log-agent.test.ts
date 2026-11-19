// A folder agent's ticket turn on the log (#1628, seatlog.ts): seat.turn and seat.done as seat codex, session
// agent:<folder>, the thread's running total as Codex reports it on the turn. A turn that breaks ends ok: false with no
// tokens. With the frame off, nothing. No Codex runs here: a stand-in thread answers. Every folder is the test's own,
// set before anything is imported.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = realpathSync(mkdtempSync(join(tmpdir(), "sol-seat-log-agent-")));
after(() => rmSync(root, { recursive: true, force: true }));
const home = join(root, "home"), folder = join(root, "sol", "School");
mkdirSync(join(home, "things"), { recursive: true });
mkdirSync(folder, { recursive: true });
process.env.SOL_HOME = home;
process.env.SOL_STATE = join(root, "state", "work.json");
process.env.SOL_APPDIR = join(root, "app");
process.env.SOL_LOGDIR = join(root, "log");
const { syncKernel, kernelNow } = await import("../src/kernel.ts");
const { runTicket } = await import("../src/agent/run.ts");
const { open } = await import("../src/agent/harness.ts");
const { logFiles } = await import("../src/log.ts");
const logText = () => logFiles(join(root, "log")).map((f) => readFileSync(f, "utf8")).join("");
import type { Rule, Trigger } from "../src/agent/harness.ts";

const rule: Rule = { id: "stickies-1", sentence: "read the stickies", source: "stickies", mode: "do", rung: "read" };
const trig: Trigger = { id: "g1", at: 1, source: "stickies", kind: "asked", data: { asked: true }, thread: "stickies" };
const usage = { input_tokens: 1200, cached_input_tokens: 800, output_tokens: 90 };
/** a stand-in Codex whose turn answers, or throws */
const deps = (run: () => Promise<unknown>) => ({
  turns: new Map(), sandboxMode: "workspace-write", networkAccessEnabled: false, personHome: join(root, "nobody"), model: "gpt-x",
  codexFor: () => ({ startThread: () => ({ id: "th1", run }), resumeThread: () => ({ id: "th1", run }) }),
}) as never;
const ticket = () => open({ id: `t-${Math.random()}`, folder: "School", rule, trigger: trig, policyVersion: "v" });
const mine = (mark: number) => kernelNow()!.since(mark).filter((e) => e.by.person === "seat" && (e.value as { session?: string }).session === "agent:school");

test("a ticket's turn is on the log: began, then ended with the thread's tokens, as seat codex, session agent:<folder>", async () => {
  await syncKernel(home, true);
  try {
    const mark = kernelNow()!.lastSeq();
    const out = await runTicket(folder, rule, trig, ticket(), deps(async () => ({ finalResponse: `read them\n{"report":"ready"}`, usage })));
    assert.equal(out.report, "ready");
    const got = mine(mark);
    assert.deepEqual(got.map((e) => e.kind), ["seat.turn", "seat.done"]);
    assert.deepEqual(got.map((e) => e.by.agent), ["codex", "codex"]);
    assert.deepEqual(got[0].value, { session: "agent:school", model: "gpt-x" });
    assert.deepEqual(got[1].value, { session: "agent:school", ok: true, tokensTotal: { in: 1200, out: 90, cacheRead: 800, cacheWrite: 0 } });
  } finally { await syncKernel(home, false); }
});

test("a turn that breaks ends ok: false with no tokens", async () => {
  await syncKernel(home, true);
  try {
    const mark = kernelNow()!.lastSeq();
    const out = await runTicket(folder, rule, trig, ticket(), deps(async () => { throw new Error("codex went away"); }));
    assert.equal(out.report, "failed");
    const got = mine(mark);
    assert.deepEqual(got.map((e) => e.kind), ["seat.turn", "seat.done"]);
    assert.deepEqual(got[1].value, { session: "agent:school", ok: false });
  } finally { await syncKernel(home, false); }
});

test("with the frame off the turn writes nothing and runs as before", async () => {
  assert.equal(kernelNow(), null);
  const before = logText();
  const out = await runTicket(folder, rule, trig, ticket(), deps(async () => ({ finalResponse: `{"report":"ready"}`, usage })));
  assert.equal(out.report, "ready");
  assert.equal(logText(), before, "not a line");
});
