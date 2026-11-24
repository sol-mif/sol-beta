// node --test src/*.test.ts: "Sol works for you" in the new face (BR1, #1615; next/work/read.ts, the wire cv/wire/work.ts,
// and How Sol worked's reading of plan, automation and planner runs). The engine's answers are read through an allowlist;
// who planned is said in plain words; the wire fills D.work, says a refusal, holds an Undo and lets it go once the thing is
// back. Signed: marcocyl04-ux's agent, BR1 "Sol works for you" (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { actsOf, cleanAutos, cleanPlans, sayBy, sayLast, sayNext, sayPlan, sayPlanner, waitingOn, type Work } from "./next/work/read.ts";
import { clean, view } from "./next/settings/worked-read.ts";
import { D, load, setMode } from "./next/cv/index.ts";
import { FIXTURE } from "./next/cv/fixture.ts";
import { attach } from "./next/cv/wire/work.ts";
import { link } from "./next/work/link.ts";

const step = (key: string, state: string, more: Record<string, unknown> = {}) => ({ key, name: `Step ${key}`, does: "do it", after: [], model: null, state, ...more });
const plan = (id: string, state: string, steps: unknown[], by: unknown = { who: "this Mac", ms: 2400 }) => ({ id, title: `Plan ${id}`, ask: "an ask", why: "", steps, state, revision: 2, made: 1000, by });

test("plans are read by an allowlist: a field the page does not draw never reaches it", () => {
  const [p] = cleanPlans({ plans: [{ ...plan("plan-1", "running", [{ ...step("s1", "done"), out: "the whole answer", secret: 1 }]), cwd: "/Users/x", extra: "x" }] });
  assert.equal(p.id, "plan-1");
  assert.equal((p as unknown as Record<string, unknown>).cwd, undefined);
  assert.equal((p.steps[0] as unknown as Record<string, unknown>).out, undefined);
  assert.equal(cleanPlans({ plans: [{ id: "bad id with spaces", steps: [] }] }).length, 0);
});

test("who planned is said in plain words: this Mac, your AI and why, or written by you", () => {
  assert.equal(sayBy({ who: "this Mac", model: null, ms: 2400, why: null }), "Planned on this Mac in 2.4 s");
  assert.equal(sayBy({ who: "your AI", model: "claude-haiku-5-5", ms: 12000, why: "Planned by your AI because Apple Intelligence is off on this Mac." }),
    "Planned by your AI (Haiku 5.5) in 12 s, because Apple Intelligence is off on this Mac");
  assert.equal(sayBy({ who: "you", model: null, ms: null, why: null }), "Written by you");
  assert.match(sayPlanner({ thisMac: "available", reason: null, yourAI: null }), /on this Mac/);
  assert.match(sayPlanner({ thisMac: "unavailable", reason: "Apple Intelligence is off on this Mac", yourAI: "claude-haiku-5-5" }), /your AI: Apple Intelligence is off/);
  const words = [sayPlanner(null), sayPlanner({ thisMac: "unavailable", reason: null, yourAI: null })].join(" ");
  assert.equal(/provider|local\b/i.test(words), false);
});

test("a plan's state and what can be pressed follow it: a yes first, pause while running, remove when not", () => {
  const [p] = cleanPlans({ plans: [plan("p", "proposed", [step("s1", "waiting")])] });
  assert.equal(sayPlan(p), "Waiting for your yes");
  assert.deepEqual(actsOf(p), { edit: true, start: "Start", pause: false, stop: false, remove: true }, "not started: Remove, no Stop");
  const [r] = cleanPlans({ plans: [plan("p", "running", [step("s1", "done"), step("s2", "needs you")])] });
  assert.equal(sayPlan(r), "Running · 1 step needs you");
  assert.deepEqual(actsOf(r), { edit: false, start: null, pause: true, stop: true, remove: false });
  const [h] = cleanPlans({ plans: [{ ...plan("p", "held", [step("s1", "failed")]), hold: "A step could not finish." }] });
  assert.equal(sayPlan(h), "Held: A step could not finish.");
  assert.equal(actsOf(h).start, "Start again");
});

test("automations say when they run next and how the last run went", () => {
  const [a] = cleanAutos({ autos: [{ id: "auto-1", name: "Inbox", does: "read it", when: "every day at 08:00", on: false, made: 1, model: null, runs: 0, next: "paused", fired: ["x"] }] });
  assert.equal(sayNext(a), "Paused");
  assert.equal(sayLast(a), "Has not run yet");
  assert.equal((a as unknown as Record<string, unknown>).fired, undefined);
  const at = new Date(2026, 10, 21, 8, 0).getTime();
  const [b] = cleanAutos({ autos: [{ id: "auto-1", name: "Inbox", does: "read it", when: "every day at 08:00", on: true, made: 1, model: null, runs: 1, next: "today at 08:00", last: { at, sessionId: "abc-1", state: "needs you", how: "clock" } }] });
  assert.equal(sayNext(b), "Next: today at 08:00");
  assert.equal(sayLast(b), "Last ran at 08:00 · Waiting on you");
  assert.equal(waitingOn({ plans: [], autos: [b] } as unknown as Work), 1);
});

test("the wire fills D.work, says a refusal, holds an Undo and lets it go once the plan is back", () => {
  assert.ok(FIXTURE["dev-morning"]); load("dev-morning");
  setMode("live");
  let hear: (m: unknown) => void = () => {};
  const sent: { type: string }[] = [];
  const off = attach({ send: (o: { type: string }) => { sent.push(o); return true; }, subscribe: (f: (m: unknown) => void) => { hear = f; return () => {}; } } as never);
  try {
    assert.deepEqual(sent.map((s) => s.type), ["next.planner.get", "next.plans.get", "next.autos.get"]);
    assert.ok(link.e);
    const w = () => D.work as Work;
    hear({ type: "next.planner", thisMac: "unavailable", reason: "this Mac has no on-device model", yourAI: "claude-haiku-5-5" });
    assert.equal(w().planner?.thisMac, "unavailable");
    hear({ type: "next.plans.making", ask: "tidy my notes" });
    assert.equal(w().making, "tidy my notes");
    const p = plan("plan-1", "proposed", [step("s1", "waiting")], { who: "your AI", model: "claude-haiku-5-5", ms: 9000, why: "Planned by your AI because this Mac has no on-device model." });
    hear({ type: "next.plans", plans: [p] });
    hear({ type: "next.plans.made", id: "plan-1", by: p.by });
    assert.equal(w().making, null);
    assert.equal(w().made?.by.who, "your AI");
    hear({ type: "next.refused", asked: "next.plans.start", why: "Say yes to run these steps with your AI first." });
    assert.match(w().note ?? "", /Say yes/);
    hear({ type: "next.refused", asked: "next.traces", why: "not ours" });
    assert.match(w().note ?? "", /Say yes/, "another page's refusal is not said here");
    hear({ type: "next.plans", plans: [] });
    hear({ type: "next.plans.removed", plan: p });
    assert.equal(w().undo?.name, "Plan plan-1");
    hear({ type: "next.plans", plans: [p] });
    assert.equal(w().undo, null);
    assert.equal(waitingOn(w()), 1);
  } finally { if (typeof off === "function") off(); setMode("fixture"); }
  assert.equal(link.e, null);
});

test("How Sol worked reads plan, automation and planner runs, and marks a session that was a step", () => {
  const t = clean({ day: "2026-11-21", days: ["2026-11-21"], coverage: { log: "read", unknown: [] }, runs: [
    { id: "plan:plan-1", source: { kind: "plan", id: "plan-1", seat: null }, from: 1, to: 2, provider: null, tools: [], result: "running", waits: [], permissions: [], steps: [{ at: 1, kind: "plan.step.start", facts: { step: "s1" } }], more: 0, back: { plan: "plan-1" }, unknown: ["tokens"] },
    { id: "planner:5", source: { kind: "planner", id: "5", seat: null }, from: 5, to: 6, provider: null, tools: [], result: "done", waits: [], permissions: [], steps: [{ at: 5, kind: "planner.made", facts: { by: "this Mac", ms: 1, steps: 3, fell: false } }], more: 0, back: null, unknown: [] },
    { id: "s-1", source: { kind: "session", id: "s-1", seat: "claude" }, from: 3, to: 4, provider: { seat: "claude", model: "claude-sonnet-5-5", turns: 2, tokens: null, costTotal: null }, tools: [], result: "done", waits: [], permissions: [], steps: [], more: 0, back: { session: "s-1" }, unknown: [], of: { plan: "plan-1", step: "s1", words: "never" } },
  ] });
  assert.ok(t);
  const named = (id: string) => (id === "plan-1" ? "Tidy the notes" : null);
  const v = view({ day: null, state: "here", t }, { named, goes: (k) => (k === "plan" ? "page:work" : null) });
  const byId = (id: string) => v.runs.find((r) => r.id === id)!;
  assert.equal(byId("plan:plan-1").from, "A work plan: Tidy the notes");
  assert.deepEqual(byId("plan:plan-1").back, [{ label: "the work plan", go: "page:work" }]);
  assert.equal(byId("planner:5").from, "Planning, on this Mac");
  assert.equal(byId("s-1").part, "A step of the work plan “Tidy the notes”");
  assert.equal(JSON.stringify(t).includes("never"), false);
});
