// node --test src/*.test.ts: Settings › How Sol worked in the new face (#1615; next/settings/worked-read.ts, the move stWorked
// and the wire's next.traces). The view draws a sample answer; what a record does not say is said as unknown; nothing
// like a prompt, a reply or a tool's arguments is ever drawn, even when a malformed answer carries them (the view is
// read from an allowlist); an empty day, a refusal and no answer are each said. Signed: franktsai2008-eng's agent (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { clean, view, type Worked } from "./next/settings/worked-read.ts";
import { sampleTraces } from "./next/settings/worked-seed.ts";
import { PLACES, findAll, freshUi } from "./next/settings/model.ts";
import { samWorld } from "./next/settings/seed.ts";
import { D, M, load, setMode } from "./next/cv/index.ts";
import { link } from "./next/settings/link.ts";
import { attach } from "./next/cv/wire/settings.ts";
import { FIXTURE } from "./next/cv/fixture.ts";

const here = (m: unknown, sample = false): Worked => ({ day: null, state: "here", t: clean(m), sample });
const text = (v: unknown) => JSON.stringify(v);

test("the view draws a sample answer: each run's source, AI, tools, waits, permissions, result and way back", () => {
  const v = view(here(sampleTraces(), true), { goes: (k, id) => (k === "session" ? id : null) });
  assert.equal(v.sample, true);
  assert.equal(v.runs.length, 5);
  assert.equal(v.days.length, 2);
  assert.equal(v.days[0].n, "Today");
  const ada = v.runs.find((r) => r.id === "session:s-Ada")!;
  assert.equal(ada.from, "A session: s-Ada");
  assert.equal(ada.result, "done");
  assert.ok(ada.provider!.includes("claude-opus"));
  assert.ok(ada.provider!.some((x) => /52,100 tokens in, 7,300 out/.test(x)));
  assert.ok(ada.provider!.some((x) => x === "$1.86 for the session so far"));
  assert.ok(ada.tools.includes("Edit: 9 times (8 worked, 1 failed)"));
  assert.match(ada.permissions[0], /asked to write \(ask\): you said yes/);
  assert.match(ada.waits[0], /^Waited on your answer, /);
  assert.deepEqual(ada.back, [{ label: "the session", go: "s-Ada" }]);
  const rex = v.runs.find((r) => r.id === "session:s-Rex")!;
  assert.equal(rex.say, "Waiting");
  assert.match(rex.permissions[0], /no answer recorded/);
  // a way back with no move is said as text
  assert.deepEqual(v.runs.find((r) => r.id === "thing:lease")!.back, [{ label: "the Thing", go: null }]);
  assert.ok(v.gaps.some((g) => /not recorded, so it is not shown/.test(g)), "the engine's own unknown lines are drawn");
  assert.match(v.summary!, /^5 runs/);
});

test("an unknown item shows as unknown, in plain words, never filled in", () => {
  const v = view(here(sampleTraces()));
  const kai = v.runs.find((r) => r.id === "session:s-Kai")!;
  assert.equal(kai.result, "unknown");
  assert.equal(kai.say, "Unknown");
  assert.deepEqual(kai.unknown, ["Not recorded: the model", "Not recorded: the tokens", "Not recorded: how it ended"]);
  assert.ok(!kai.provider!.some((x) => /tokens/.test(x)), "no token count is made up");
  assert.ok(kai.tools[0].includes("1 not recorded"));
  // what the run shows missing is said even when the answer's own list leaves it out; a session with no AI says so
  const m = sampleTraces() as { runs: Record<string, unknown>[] };
  m.runs = [{ ...m.runs[3], unknown: [] }, { id: "session:x", source: { kind: "session", id: "x", seat: null }, from: 1, to: 1, provider: null, tools: [], result: "done", waits: [], permissions: [], steps: [], back: null, unknown: [] }];
  const u = view(here(m)).runs;
  assert.deepEqual(u[0].unknown, ["Not recorded: the model", "Not recorded: the tokens", "Not recorded: how it ended"]);
  assert.deepEqual(u[1].unknown, ["Not recorded: which AI ran it"]);
  assert.equal(u[1].steps, "No steps recorded");
});

test("nothing like a prompt, a reply or a tool's arguments is ever drawn, even when an answer carries them", () => {
  const SECRET = ["PROMPT-WORDS", "REPLY-WORDS", "rm -rf /tmp/x", "/srv/plant/secret.txt", "https://evil.example", "ERROR-TEXT", "THOUGHT"];
  const m = sampleTraces() as { runs: Record<string, unknown>[]; [k: string]: unknown };
  m.prompt = SECRET[0];
  m.runs = m.runs.map((r) => ({
    ...r, prompt: SECRET[0], response: SECRET[1], args: { command: SECRET[2], file: SECRET[3] }, error: SECRET[5], reasoning: SECRET[6],
    provider: r.provider ? { ...(r.provider as object), prompt: SECRET[0], model: (r.provider as { model: unknown }).model } : null,
    tools: [{ tool: "Bash", n: 1, ok: 1, failed: 0, unsaid: 0, arguments: SECRET[2], input: SECRET[3], url: SECRET[4] }],
    steps: [{ at: 1, kind: "seat.step", facts: { tool: "Bash", file: SECRET[3], command: SECRET[2], text: SECRET[1] } }],
    permissions: [{ at: 2, act: SECRET[2], rung: "ask", answer: "yes", words: SECRET[0] }],
    waits: [{ at: 3, on: SECRET[3], until: null, why: SECRET[5] }],
    back: { session: "s-Ada", url: SECRET[4], file: SECRET[3] },
    source: { ...(r.source as object), words: SECRET[0] },
  }));
  (m.coverage as Record<string, unknown>).raw = SECRET[1];
  const t = clean(m)!, v = view({ day: null, state: "here", t }, { named: () => null, goes: () => null });
  for (const s of SECRET) {
    assert.ok(!text(t).includes(s), `the cleaned answer holds ${s}`);
    assert.ok(!text(v).includes(s), `the view draws ${s}`);
  }
  assert.ok(v.runs.every((r) => r.permissions[0].includes("do something not recorded")), "an act that is not one of the engine's names is not read out");
  // and a run that is not one, or a day that is not a day, is dropped whole
  assert.equal(clean({ day: "yesterday", runs: [] }), null);
  assert.equal(clean({ day: "2026-11-20", runs: [{ source: { kind: "prompt", id: "x" } }, null, "x"] })!.runs.length, 0);
});

test("an empty day, a refusal, no engine and no answer are each said plainly", () => {
  assert.equal(view(here(sampleTraces("2026-01-02"))).empty, "Nothing ran on this day.");
  assert.ok(view(here(sampleTraces("2026-01-02"))).gaps.includes("Nothing was recorded on the log that day."));
  const empty = view(here({ ...sampleTraces(), runs: [] }));
  assert.equal(empty.empty, "Nothing ran today.");
  assert.equal(view({ day: null, state: "refused", t: null }).note, "Sol would not give this history to this window.");
  assert.equal(view({ day: null, state: "silent", t: null }).note, "Sol did not answer, so nothing is shown.");
  assert.equal(view({ day: null, state: "off", t: null }).retry, true);
  assert.equal(view(undefined).note, "Reading what Sol recorded…");
  assert.equal(view({ day: null, state: "refused", t: null }).runs.length, 0);
});

test("How Sol worked is a place in Settings, found by its words, and live too", () => {
  const P = PLACES.find((p) => p.id === "worked")!;
  assert.equal(P.n, "How Sol worked");
  const w = samWorld(), u = freshUi(w);
  assert.ok(findAll(w, u, "what ran").some((r) => r.type === "place" && r.p === "worked") || findAll(w, u, "logs").some((r) => r.type === "place" && r.p === "worked"));
  assert.ok(findAll({ ...w, live: true }, u, "logs").some((r) => r.type === "place" && r.p === "worked"), "live it is not left out");
});

test("the move: the fixture reads its sample; live it asks the engine, and says so when there is none", () => {
  assert.ok(FIXTURE["dev-morning"]); load("dev-morning");
  assert.equal((D.worked as Worked).sample, true);
  assert.ok(M.stWorked("2026-01-02").ok);
  assert.equal((D.worked as Worked).t!.runs.length, 0);
  setMode("live");
  const sent: object[] = [];
  try {
    link.e = null;
    assert.equal(M.stWorked().ok, false);
    assert.equal((D.worked as Worked).state, "off");
    link.e = { send: (o: object) => { sent.push(o); return true; } } as never;
    assert.ok(M.stWorked("2026-11-19").ok);
    assert.deepEqual(sent.at(-1), { type: "next.traces", day: "2026-11-19" });
    assert.equal((D.worked as Worked).state, "asking");
    assert.ok(M.stWorked().ok);
    assert.deepEqual(sent.at(-1), { type: "next.traces" });
    assert.ok(!sent.some((o) => Object.keys(o).some((k) => !["type", "day"].includes(k))), "nothing but the day is asked");
  } finally { link.e = null; setMode("fixture"); }
});

test("the wire: next.traces is read through the allowlist, a refusal for it is said, another's refusal is not", () => {
  assert.ok(FIXTURE["dev-morning"]); load("dev-morning");
  setMode("live");
  let hear: (m: unknown) => void = () => {};
  const off = attach({ send: () => true, subscribe: (f: (m: unknown) => void) => { hear = f; return () => {}; } } as never);
  try {
    hear({ ...sampleTraces(), runs: [{ ...(sampleTraces() as { runs: object[] }).runs[0], prompt: "PROMPT-WORDS" }] });
    const w = D.worked as Worked;
    assert.equal(w.state, "here");
    assert.equal(w.t!.runs.length, 1);
    assert.ok(!text(w).includes("PROMPT-WORDS"));
    hear({ type: "next.refused", asked: "next.pos", why: "x" });
    assert.equal((D.worked as Worked).state, "here");
    hear({ type: "next.refused", asked: "next.traces", why: "only Sol's own windows" });
    assert.equal((D.worked as Worked).state, "refused");
  } finally { if (typeof off === "function") off(); setMode("fixture"); }
});
