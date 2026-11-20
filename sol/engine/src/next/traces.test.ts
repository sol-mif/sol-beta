// next.traces (traces.ts; #1615, "Settings / How Sol worked"): a day's history from the log, the agents' traces and the
// diary; runs by source with provider, tools, results, waits, permissions and a way back; what is not recorded said as
// unknown. The privacy test plants words in every place a prompt, a reply, a tool's argument or an error could sit and
// proves none of them reaches the answer; the read writes nothing (every file under the home and the log hashed before
// and after); the part answers only Sol's own windows, and nothing while ui.next is off.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = fs.mkdtempSync(join(tmpdir(), "sol-next-traces-"));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
process.env.SOL_STATE = join(tmp, "state", "work.json");
process.env.SOL_LOGDIR = join(tmp, "log");
const { tracesMsg } = await import("./traces.js");
const part = (await import("../parts/next.js")).default;

const NOW = new Date(2026, 10, 20, 15, 0);
const DAYS = "2026-11-20";
const at = (h: number, m = 0) => new Date(2026, 10, 20, h, m).getTime();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** the planted words: a prompt, a reply, a tool's arguments, an error, a sticky's and a Thing's words, the diary's */
const SECRET = [
  "PROMPT-please-summarise-my-bank-statement", "REPLY-here-is-your-summary", "ARG-/Users/someone/private/tax-2026.pdf",
  "ARG-rm -rf build", "ERR-token expired at line 4", "FOLDER-patients Maria Lopez call her husband", "ID-secret id with my words", "STICKY-Jayden revise cells", "DID-made revise.md from mail",
  "THING-pay the rent", "DIARY-felt tired today", "ATTACH-/Users/someone/photo.png", "ASK-may I send the email to Bo",
];

/** a log day as the log writes it: a value with free text in values/<hash>.json, the line keeping the hash */
function logDay(dir: string, evs: { kind: string; at: number; by?: object; item?: string; cause?: string; value?: object; filed?: boolean; id?: string }[]) {
  fs.mkdirSync(join(dir, "values"), { recursive: true });
  const lines = evs.map((e, i) => {
    const base: Record<string, unknown> = { v: 1, project: "home", by: e.by ?? { person: "engine" }, kind: e.kind, at: e.at, prev: "", id: e.id ?? `ev${i}`, seq: i + 1, hash: "" };
    if (e.item) base.item = e.item;
    if (e.cause) base.cause = e.cause;
    const v = e.value as Record<string, unknown> | undefined;
    if (v && typeof v.session === "string") base.ctx = { session: v.session };
    if (v) {
      const text = JSON.stringify(v), h = sha(text);
      base.hash = h;
      if (e.filed) fs.writeFileSync(join(dir, "values", `${h}.json`), text);
      else base.value = v;
    }
    return JSON.stringify(base);
  });
  fs.writeFileSync(join(dir, `${DAYS}.jsonl`), lines.join("\n") + "\n{torn line\n");
}

function rigHome(name: string) {
  const home = join(tmp, name), log = join(tmp, `${name}-log`);
  fs.mkdirSync(join(home, "School"), { recursive: true });
  const seat = { person: "seat", agent: "claude" }, codex = { person: "seat", agent: "codex" };
  logDay(log, [
    { kind: "seat.turn", at: at(9), by: seat, value: { session: "w-123", model: "opus", mode: "default" } },
    { kind: "seat.sent", at: at(9, 1), by: seat, value: { session: "w-123", what: "attachment", name: SECRET[9], bytes: 900 }, filed: true },
    { kind: "seat.step", at: at(9, 2), by: seat, value: { session: "w-123", tool: "Read", file: SECRET[2], bytes: 4000, ok: true }, filed: true },
    { kind: "seat.step", at: at(9, 3), by: seat, value: { session: "w-123", tool: "Bash", file: SECRET[3], ok: false }, filed: true },
    { kind: "seat.step", at: at(9, 4), by: seat, value: { session: "w-123", tool: "Read", ok: true } },
    { kind: "seat.usage", at: at(9, 5), by: seat, value: { session: "w-123", in: 1200, out: 300 } },
    { kind: "seat.done", at: at(9, 6), by: seat, value: { session: "w-123", ok: true, costTotal: 0.12 } },
    { kind: "seat.turn", at: at(9, 10), by: codex, value: { session: "w-789", model: "gpt" } },
    { kind: "seat.done", at: at(9, 20), by: codex, value: { session: "w-789", ok: true, tokens: { in: 100, out: 50 } } },
    { kind: "thing.state", at: at(12, 30), item: "laundry", value: { ver: "a", from: "b", state: "asks", waitsOn: "you" } },
    { kind: "thing.done", at: at(12, 40), item: "laundry", value: { ver: "c", from: "a" } },
    { kind: "rung.asked", at: at(23, 50), id: "ask3", item: "late", value: { act: "send", rung: "ask" } },
    { kind: "seat.turn", at: at(10), by: codex, value: { session: "agent:School" } },
    { kind: "seat.done", at: at(10, 5), by: codex, value: { session: "agent:School", ok: false } },
    { kind: "seat.turn", at: at(10, 6), by: codex, value: { session: `agent:${SECRET[11]}` } },
    { kind: "plugin.ran", at: at(13, 3), item: "weather", value: { program: "/Users/someone/private/bin/curl", code: 0, out: true } },
    { kind: "seat.turn", at: at(14), by: seat, value: { session: "w-456", model: "sonnet" } },
    { kind: "rung.asked", at: at(11), id: "ask1", item: "rent", value: { act: "send", rung: "ask", words: SECRET[10] }, filed: true },
    { kind: "rung.answered", at: at(11, 30), item: "rent", cause: "ask1", value: { yes: true } },
    { kind: "rung.did", at: at(11, 31), item: "rent", cause: "ask1", value: { act: "send", rung: "ask" } },
    { kind: "rung.asked", at: at(12), id: "ask2", item: "bills", value: { act: "pay", rung: "ask", words: SECRET[10] }, filed: true },
    { kind: "thing.state", at: at(12, 5), item: "bills", value: { ver: "a", from: "b", state: "open", waitsOn: "person" } },
    { kind: "plugin.broken", at: at(13), item: "weather", value: { why: SECRET[4] }, filed: true },
    { kind: "plugin.fetched", at: at(13, 1), item: "weather", value: { host: "api.weather.test", status: 200, out: true } },
    { kind: "today.answer", at: at(13, 2), value: { which: 1, words: SECRET[7] }, filed: true },
    { kind: "seat.step", at: at(14, 1), by: seat, value: { session: "w-456", tool: "Edit", file: SECRET[2] }, filed: true },   // its value file erased
  ]);
  // erase the last one's value file: what it said is unknown, never guessed
  const last = JSON.parse(fs.readFileSync(join(log, `${DAYS}.jsonl`), "utf8").split("\n").filter((l) => l.startsWith("{\"")).at(-1)!);
  fs.rmSync(join(log, "values", `${last.hash}.json`));
  fs.writeFileSync(join(home, "agents-traces.json"), JSON.stringify({ v: 1, pairs: {}, traces: [
    { id: "t-abcabcabcabc", place: "School", at: at(8), sources: ["mail"], made: { kind: "md", for: "self" }, steps: [SECRET[6]], minutes: 20, text: `${SECRET[5]}: ${SECRET[6]}`, from: "did" },
    { id: "t-0123456789ab", place: SECRET[11], at: at(8, 30), sources: [], made: { kind: "md", for: "self" }, steps: [], minutes: null, text: "", from: "did" },
    { id: SECRET[12], place: "School", at: at(8, 40), sources: [], made: { kind: "md", for: "self" }, steps: [], minutes: null, text: "", from: "did" },
    { id: "t-old", place: "School", at: at(8) - 5 * 86_400_000, sources: [], made: { kind: "", for: "self" }, steps: [], minutes: null, text: SECRET[5], from: "did" },
  ] }));
  fs.mkdirSync(join(home, "next", "diary"), { recursive: true });
  fs.writeFileSync(join(home, "next", "diary", `${DAYS}.jsonl`),
    JSON.stringify({ ev: "write", id: "dl-aaaaaaaaaaaa", at: at(7), words: SECRET[8], via: "island" }) + "\n" +
    JSON.stringify({ ev: "remove", line: "dl-aaaaaaaaaaaa", at: at(7, 1) }) + "\n");
  return { home, log };
}

const hashTree = (dir: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else out[p] = sha(fs.readFileSync(p, "utf8")); } };
  walk(dir);
  return out;
};

test("next.traces: runs by source, with provider, tools, results, waits, permissions and a way back", () => {
  const { home, log } = rigHome("shape");
  const t = tracesMsg({ home, logDir: log, now: NOW });
  assert.equal(t.type, "next.traces");
  assert.equal(t.day, DAYS);
  assert.deepEqual(Object.keys(t).sort(), ["coverage", "day", "days", "runs", "type"]);
  assert.equal(t.days[0], DAYS);
  assert.ok(t.days.length >= 2, "the traces' older day is listed too");
  const run = (id: string) => t.runs.find((r) => r.id === id)!;

  const w = run("session:w-123");
  assert.deepEqual(w.source, { kind: "session", id: "w-123", seat: "claude" });
  assert.deepEqual(w.back, { session: "w-123" });
  assert.equal(w.result, "done");
  assert.deepEqual(w.provider, { seat: "claude", model: "opus", turns: 1, tokens: { in: 1200, out: 300 }, costTotal: 0.12 });
  assert.deepEqual(run("session:w-789").provider!.tokens, { in: 100, out: 50 }, "a turn's tokens on seat.done are read");
  assert.deepEqual(w.tools, [{ tool: "Read", n: 2, ok: 2, failed: 0, unsaid: 0 }, { tool: "Bash", n: 1, ok: 0, failed: 1, unsaid: 0 }]);
  assert.deepEqual(w.unknown, []);

  const f = run("folder:School");
  assert.deepEqual(f.back, { place: "School" });
  assert.equal(f.result, "failed");
  assert.equal(f.provider!.seat, "codex");
  assert.ok(f.unknown.includes("model"));

  assert.equal(run("session:w-456").result, "running", "a turn with no end today is running");
  const late = run("session:w-456").tools.find((x) => x.tool === "unknown")!;
  assert.equal(late.unsaid, 1, "a step whose record was erased is counted, its tool unknown");

  const rent = run("thing:rent");
  assert.deepEqual(rent.permissions, [{ at: at(11), act: "send", rung: "ask", answer: "yes" }]);
  assert.deepEqual(rent.waits, [{ at: at(11), on: "permission", until: at(11, 30) }]);
  assert.deepEqual(rent.back, { thing: "rent" });

  const bills = run("thing:bills");
  assert.equal(bills.result, "waiting");
  assert.deepEqual(bills.waits.map((x) => [x.on, x.until]), [["permission", null], ["person", null]]);

  const block = run("block:weather");
  assert.deepEqual(block.steps.map((s) => s.kind), ["plugin.ran", "plugin.fetched"], "a kind with no allowlist row (plugin.broken) is not a step");
  assert.equal(block.steps[0].facts.program, "curl", "the program, never the path it ran from");

  const laundry = run("thing:laundry");
  assert.equal(laundry.result, "done", "a Thing done closes its wait");
  assert.deepEqual(laundry.waits, [{ at: at(12, 30), on: "you", until: at(12, 40) }]);

  assert.ok(!t.runs.some((r) => r.source.kind === "folder" && r.source.id !== "School"), "only a folder that is there names a place");

  const trace = run("trace:t-abcabcabcabc");
  assert.deepEqual(trace.steps[0].facts, { made: "md", for: "self", minutes: 20, sources: 1, steps: 1 });
  assert.deepEqual(trace.unknown, ["provider", "tools"]);

  const diary = run(`diary:${DAYS}`);
  assert.deepEqual(diary.steps.map((s) => [s.kind, s.facts.line]), [["diary.write", "dl-aaaaaaaaaaaa"], ["diary.remove", "dl-aaaaaaaaaaaa"]]);
  assert.deepEqual(diary.back, { day: DAYS });

  assert.equal(t.coverage.log, "read");
  assert.ok(t.coverage.skipped >= 2, "the torn line and the erased value are counted");
  for (const what of ["reasoning", "seat-own", "words", "work-permissions"]) assert.ok(t.coverage.unknown.some((g) => g.what === what), what);
  assert.deepEqual(t.runs.map((r) => r.to), [...t.runs.map((r) => r.to)].sort((a, b) => b - a), "newest first");
});

test("next.traces: no prompt, reply, tool argument, error or person's words ever reaches the answer", () => {
  const { home, log } = rigHome("privacy");
  for (const day of [undefined, DAYS, "2026-11-15"]) {
    const text = JSON.stringify(tracesMsg({ home, logDir: log, now: NOW }, day));
    for (const s of SECRET) {
      assert.ok(!text.includes(s), `"${s}" leaked`);
      for (const part of s.split(/[-/ ]/).filter((x) => x.length >= 6)) assert.ok(!text.includes(part), `"${part}" (of ${s}) leaked`);
    }
  }
  // every fact is a number, a true/false, or a short one-line name: no room for words
  const t = tracesMsg({ home, logDir: log, now: NOW });
  for (const r of t.runs) for (const s of r.steps) for (const v of Object.values(s.facts))
    assert.ok(typeof v !== "string" || /^[\w.:@/+-]{1,80}$/.test(v), `fact ${JSON.stringify(v)} is not a name`);
});

test("next.traces: reads only, writes nothing anywhere", () => {
  const { home, log } = rigHome("readonly");
  const before = { ...hashTree(home), ...hashTree(log) };
  tracesMsg({ home, logDir: log, now: NOW });
  tracesMsg({ home, logDir: log, now: NOW }, "2026-11-01");
  assert.deepEqual({ ...hashTree(home), ...hashTree(log) }, before);
});

test("next.traces: a day with no records says so, and a missing log is off, never made up", () => {
  const home = join(tmp, "empty");
  fs.mkdirSync(home, { recursive: true });
  const none = tracesMsg({ home, logDir: join(tmp, "no-such-log"), now: NOW });
  assert.deepEqual(none.runs, []);
  assert.equal(none.coverage.log, "none");
  assert.equal(none.coverage.unknown[0].what, "log");
  const off = tracesMsg({ home, now: NOW });
  assert.equal(off.coverage.log, "off");
  assert.equal(tracesMsg({ home, now: NOW }, "not a day").day, DAYS);
});

test("next.traces on the wire: only Sol's own windows, and nothing while ui.next is off", async () => {
  const { home } = rigHome("wire");
  const hs = new Map<string, (m: unknown, h: unknown) => unknown>();
  part({ on: (t: string, f: never) => hs.set(t, f), atStart: () => {}, route: () => {} } as never);
  const sent: any[] = [];
  const h = (fromSol: boolean) => ({ HOME: home, PORT: 0, ws: {}, send: (_w: unknown, m: object) => sent.push(m), everyone: () => {}, face: { send() {} }, conn: { chars: 0 }, fromSol, fromApp: true });
  process.env.SOL_UI_NEXT = "off";
  await hs.get("next.traces")!({ type: "next.traces" }, h(true));
  assert.equal(sent.length, 0);
  process.env.SOL_UI_NEXT = "on";
  await hs.get("next.traces")!({ type: "next.traces" }, h(false));
  assert.deepEqual(sent.at(-1), { type: "next.refused", asked: "next.traces", why: "only Sol's own windows" });
  await hs.get("next.traces")!({ type: "next.traces", day: "2026-11-20" }, h(true));
  assert.equal(sent.at(-1).type, "next.traces");
  assert.equal(sent.at(-1).day, "2026-11-20");
  delete process.env.SOL_UI_NEXT;
});

test("next.traces: an ask answered after midnight is closed by the next day, and shown on it as the ask it answers", () => {
  const { home, log } = rigHome("midnight");
  const next = new Date(2026, 10, 21, 0, 10).getTime();
  fs.writeFileSync(join(log, "2026-11-21.jsonl"), [
    { v: 1, project: "home", by: { person: "you" }, kind: "rung.answered", at: next, prev: "", id: "n1", seq: 100, hash: "", item: "late", cause: "ask3", value: { yes: false } },
    { v: 1, project: "home", by: { person: "you" }, kind: "rung.refused", at: next + 1, prev: "", id: "n2", seq: 101, hash: "", item: "late", cause: "ask3", value: { act: "send", why: "no" } },
  ].map((x) => JSON.stringify(x)).join("\n") + "\n");
  const first = tracesMsg({ home, logDir: log, now: NOW }).runs.find((r) => r.id === "thing:late")!;
  assert.deepEqual(first.permissions, [{ at: at(23, 50), act: "send", rung: "ask", answer: "no" }]);
  assert.equal(first.waits[0].until, next);
  assert.notEqual(first.result, "waiting");
  assert.equal(first.steps.length, 1, "the next day's events close, never add a step");
  const second = tracesMsg({ home, logDir: log, now: new Date(2026, 10, 21, 9) }).runs.find((r) => r.id === "thing:late")!;
  assert.deepEqual(second.permissions, [{ at: at(23, 50), act: "send", rung: "ask", answer: "no" }], "one ask, paired, not an orphan refusal");
});
