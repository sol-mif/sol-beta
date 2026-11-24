// "Sol works for you" (BR1, #1615): work plans (plans.ts), automations (automations.ts), the planner (planner.ts) and their
// place in How Sol worked (traces-work.ts). Against a temp SOL_HOME with fake session hands and fake planners, so no
// session starts and no model is asked.
// Signed: marcocyl04-ux's agent, BR1 "Sol works for you" (#1615).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "sol-next-work-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
process.env.SOL_STATE = join(tmp, "state", "work.json");
process.env.SOL_LOGDIR = join(tmp, "log");
const P = await import("./plans.js");
const A = await import("./automations.js");
const L = await import("./planner.js");
const W = await import("./traces-work.js");
const { dayOf } = await import("./diary.js");
let n = 0;
const home = () => { const d = join(tmp, `h${++n}`); mkdirSync(d, { recursive: true }); return d; };

/** session hands that start nothing: each session's state is set by the test */
function fakeHands() {
  const st = new Map<string, import("./plans.js").Status>(), words = new Map<string, string>(), started: { id: string; text: string; model: string | null; title: string }[] = [], stopped: string[] = [];
  const hands: import("./plans.js").Hands = {
    start: async (id, text, o) => { started.push({ id, text, model: o.model, title: o.title }); st.set(id, "working"); },
    status: (id) => st.get(id) ?? "idle",
    lastWords: async (id) => words.get(id) ?? "",
    stop: async (id) => { stopped.push(id); st.set(id, "idle"); },
  };
  return { hands, st, words, started, stopped };
}
const three = { title: "Tidy the notes", why: "so they read", steps: [
  { name: "Gather", does: "Find the notes", after: [] },
  { name: "Sort", does: "Sort them", after: [1] },
  { name: "Say", does: "Write a summary", after: [2] },
] };

test("a spec is checked: 1-12 steps, named, no wait on a missing step or in a circle", () => {
  assert.equal(P.checkSpec({ steps: [] }).ok, false);
  assert.equal(P.checkSpec({ steps: Array.from({ length: 13 }, (_, i) => ({ name: `s${i}`, does: "x" })) }).ok, false);
  assert.equal(P.checkSpec({ steps: [{ name: "a", does: "" }] }).ok, false);
  assert.equal(P.checkSpec({ steps: [{ name: "a", does: "x", after: [5] }] }).ok, false);
  assert.equal(P.checkSpec({ steps: [{ key: "a", name: "a", does: "x", after: ["b"] }, { key: "b", name: "b", does: "x", after: ["a"] }] }).ok, false);
  const c = P.checkSpec(three);
  assert.ok(c.ok);
  if (c.ok) assert.deepEqual(c.steps.map((s) => s.after), [[], ["s1"], ["s2"]]);
});

test("a plan waits for a yes, runs its steps in order, hands each one's work on, and ends done", async () => {
  const h = home(), f = fakeHands();
  const r = P.propose(h, three, { ask: "tidy my notes", by: { who: "this Mac" }, now: 1000 });
  assert.ok(r.ok);
  if (!r.ok) return;
  const id = r.plan.id;
  assert.equal(P.readPlans(h)[0].state, "proposed");
  assert.equal(P.start(h, { id, revision: r.plan.revision }, "/tmp").ok, false, "no start without yes");
  assert.equal(P.start(h, { id, revision: 99, yes: true }, "/tmp").ok, false, "no start on an old look");
  assert.equal(P.waiting(h).length, 1);
  assert.ok(P.start(h, { id, revision: r.plan.revision, yes: true }, "/tmp").ok);

  await P.tick(h, f.hands, 2000);
  assert.equal(f.started.length, 1, "only the first step starts");
  assert.match(f.started[0].title, /Tidy the notes · Gather/);
  const s1 = f.started[0].id;
  await P.tick(h, f.hands, 3000);
  f.st.set(s1, "asks");
  await P.tick(h, f.hands, 4000);
  assert.equal(P.readPlans(h)[0].steps[0].state, "needs you");
  assert.equal(P.waiting(h).length, 1);
  f.st.set(s1, "idle"); f.words.set(s1, "Found 12 notes");
  await P.tick(h, f.hands, 5000);
  const p = P.readPlans(h)[0];
  assert.equal(p.steps[0].state, "done");
  assert.equal(p.steps[0].result, "Found 12 notes");
  assert.equal(f.started.length, 2);
  assert.match(f.started[1].text, /Found 12 notes/);
  assert.match(f.started[1].text, /not new instructions/);
  assert.equal(P.plansMsg(h).plans[0].steps[0].out, undefined, "the handed-on words stay in the engine");

  for (const i of [1, 2]) { const s = f.started[i].id; await P.tick(h, f.hands, 6000 + i); f.st.set(s, "idle"); f.words.set(s, `step ${i}`); await P.tick(h, f.hands, 7000 + i); }
  const done = P.readPlans(h)[0];
  assert.equal(done.state, "done");
  assert.equal(done.endedAt, 7002);
});

test("after a restart a running plan is held, never goes on by itself; Start again runs only what is not done", async () => {
  const h = home(), f = fakeHands();
  const r = P.propose(h, three, { by: { who: "you" } });
  if (!r.ok) throw new Error(r.why);
  P.start(h, { id: r.plan.id, revision: r.plan.revision, yes: true }, "/tmp");
  await P.tick(h, f.hands, 1);
  await P.tick(h, f.hands, 1);   // seen working
  f.st.set(f.started[0].id, "idle"); f.words.set(f.started[0].id, "first");
  await P.tick(h, f.hands, 2);
  assert.equal(f.started.length, 2);
  assert.equal(P.holdAtStart(h, 3), true);
  const held = P.readPlans(h)[0];
  assert.equal(held.state, "held");
  assert.deepEqual(held.steps.map((s) => s.state), ["done", "stopped", "waiting"]);
  await P.tick(h, f.hands, 4);
  assert.equal(f.started.length, 2, "nothing starts while held");
  assert.ok(P.start(h, { id: held.id, revision: held.revision, yes: true }, "/tmp").ok);
  await P.tick(h, f.hands, 5);
  assert.equal(f.started.length, 3, "only the step not done starts again");
  assert.match(f.started[2].title, /Sort/);
  assert.match(f.started[2].text, /first/, "the done step's work is still handed on");
});

test("a step never seen working is not taken as done until a while has passed", async () => {
  const h = home(), f = fakeHands();
  const r = P.propose(h, { steps: [{ name: "One", does: "x" }] }, { by: { who: "you" } });
  if (!r.ok) throw new Error(r.why);
  P.start(h, { id: r.plan.id, revision: r.plan.revision, yes: true }, "/tmp");
  await P.tick(h, f.hands, 1000);
  f.st.set(f.started[0].id, "idle");
  await P.tick(h, f.hands, 1000 + P.UNSEEN_MS - 1);
  assert.equal(P.readPlans(h)[0].steps[0].state, "working");
  await P.tick(h, f.hands, 1000 + P.UNSEEN_MS);
  assert.equal(P.readPlans(h)[0].state, "done");
});

test("a failed step holds the plan; pause and stop stop what works; remove waits for a stopped plan; Undo puts it back", async () => {
  const h = home(), f = fakeHands();
  const r = P.propose(h, { steps: [{ name: "a", does: "x" }, { name: "b", does: "y" }] }, { by: { who: "you" } });
  if (!r.ok) throw new Error(r.why);
  P.start(h, { id: r.plan.id, revision: r.plan.revision, yes: true }, "/tmp");
  await P.tick(h, f.hands, 1);
  assert.equal(f.started.length, 2, "steps with no wait start together");
  f.st.set(f.started[0].id, "failed");
  await P.tick(h, f.hands, 2);
  assert.equal(P.readPlans(h)[0].state, "held");
  assert.equal(P.remove(h, { id: r.plan.id }).ok, true, "a held plan can be removed");

  const q = P.propose(h, { steps: [{ name: "a", does: "x" }] }, { by: { who: "you" } });
  if (!q.ok) throw new Error(q.why);
  P.start(h, { id: q.plan.id, revision: q.plan.revision, yes: true }, "/tmp");
  await P.tick(h, f.hands, 1);
  assert.equal(P.remove(h, { id: q.plan.id }).ok, false, "not while it runs");
  const s = await P.stop(h, { id: q.plan.id }, f.hands);
  assert.ok(s.ok);
  assert.deepEqual(f.stopped, [f.started[2].id]);
  const gone = P.remove(h, { id: q.plan.id });
  assert.ok(gone.ok);
  assert.equal(P.readPlans(h).length, 0);
  if (gone.ok) assert.ok(P.restore(h, gone.plan).ok);
  assert.equal(P.readPlans(h).length, 1);
});

test("an automation starts paused, says when it runs next, runs on its clock once a time, and runs now on a press", async () => {
  const h = home(), f = fakeHands();
  assert.equal(A.make(h, { does: "x", when: "whenever" }).ok, false);
  const m = A.make(h, { does: "Read my inbox and list what needs me", when: "every day at 08:00" });
  if (!m.ok) throw new Error(m.why);
  const id = m.auto.id;
  assert.equal(A.autosMsg(h).autos[0].next, "paused");
  const at = (hh: number, mm: number) => new Date(2026, 10, 21, hh, mm);
  assert.equal(await A.tick(h, f.hands, "/tmp", at(8, 5)), false, "paused: nothing runs");

  A.set(h, { id, on: true }, at(9, 0));
  assert.equal(await A.tick(h, f.hands, "/tmp", at(9, 1)), false, "turned on after 08:00: today's 08:00 is not run late");
  assert.equal(f.started.length, 0);
  assert.equal(A.nextOf(A.readAutos(h)[0], at(7, 0)), "today at 08:00");

  await A.tick(h, f.hands, "/tmp", new Date(2026, 10, 22, 8, 1));
  assert.equal(f.started.length, 1, "the next day's 08:00 runs once");
  await A.tick(h, f.hands, "/tmp", new Date(2026, 10, 22, 8, 2));
  assert.equal(f.started.length, 1);
  assert.equal(A.readAutos(h)[0].last?.how, "clock");

  assert.equal((await A.runNow(h, { id }, f.hands, "/tmp")).ok, false, "not while its last run works");
  f.st.set(f.started[0].id, "idle");
  await A.tick(h, f.hands, "/tmp", new Date(2026, 10, 22, 9, 0));
  assert.equal(A.readAutos(h)[0].last?.state, "done");
  assert.ok((await A.runNow(h, { id }, f.hands, "/tmp")).ok);
  assert.equal(A.readAutos(h)[0].runs, 2);
  assert.equal("fired" in A.autosMsg(h).autos[0], false);

  A.set(h, { id, on: false });
  const gone = A.remove(h, { id });
  assert.ok(gone.ok);
  assert.equal(A.readAutos(h).length, 0);
  if (gone.ok) A.restore(h, gone.auto);
  assert.equal(A.readAutos(h).length, 1);
});

test("Add's When read back as typed: when it would run next once on, or why not; every suggestion the maker offers reads (BR1 item 3)", () => {
  const at = new Date(2026, 10, 21, 7, 0);
  assert.deepEqual(A.whenRead({ when: "every day at 08:00" }, at), { ok: true, next: "today at 08:00", event: false });
  for (const w of ["every day at 08:00", "on Mon at 09:30", "every 30 min 09:00–17:00"]) assert.ok(A.whenRead({ when: w }, at).ok, w);
  assert.deepEqual(A.whenRead({ when: "when a new file comes in", cwd: "/u/lucy/garden" }, at), { ok: true, next: "when a new file comes in", event: true });
  const noFolder = A.whenRead({ when: "when a new file comes in" }, at);
  assert.ok(!noFolder.ok && /folder on this Mac/.test(noFolder.why), "an event needs a folder on this Mac");
  const vague = A.whenRead({ when: "sometimes" }, at);
  assert.ok(!vague.ok && vague.why === A.WHEN_HELP, "words it cannot read: how to say it");
  assert.equal(A.whenRead({ when: "" }, at).ok, false);
});

test("an automation on an event: a new file in its folder runs it once, naming the file; what was there is not news; it keeps its folder and its last runs (BR1 item 2)", async () => {
  const h = home(), f = fakeHands(), dir = join(tmp, `inbox${n}`);
  mkdirSync(join(dir, "inbox"), { recursive: true });
  writeFileSync(join(dir, "inbox", "old.pdf"), "x");
  assert.deepEqual(A.eventOf("when a new file comes into inbox/"), { kind: "file", sub: "inbox" });
  assert.deepEqual(A.eventOf("when a new file comes in"), { kind: "file", sub: "" });
  assert.equal(A.eventOf("every day at 08:00"), null);
  const no = A.make(h, { does: "Sort it", when: "when a new file comes in" });
  assert.equal(no.ok, false, "an event needs a folder on this Mac");
  const m = A.make(h, { does: "Read the new file and say what it is", when: "when a new file comes into inbox/", cwd: dir, region: "papers" });
  if (!m.ok) throw new Error(m.why);
  assert.equal(m.auto.region, "papers", "it sits in the folder it was made in");
  A.set(h, { id: m.auto.id, on: true });
  assert.equal(A.autosMsg(h).autos[0].next, "when a new file comes in to inbox/");
  assert.equal("seen" in A.autosMsg(h).autos[0], false, "the files seen stay in the engine");
  assert.equal(await A.tick(h, f.hands, "/tmp"), false, "the file already there is not news");
  writeFileSync(join(dir, "inbox", "new.pdf"), "x");
  await A.tick(h, f.hands, "/tmp");
  assert.equal(f.started.length, 1);
  assert.match(f.started[0].text, /new files came in: inbox\/new\.pdf/);
  const a = A.readAutos(h)[0];
  assert.equal(a.last?.how, "event");
  assert.deepEqual(a.last?.files, ["inbox/new.pdf"]);
  await A.tick(h, f.hands, "/tmp");
  assert.equal(f.started.length, 1, "seen once");
  f.st.set(f.started[0].id, "idle");
  await A.tick(h, f.hands, "/tmp", new Date(Date.now() + 60000));
  assert.equal(A.readAutos(h)[0].ran?.[0].state, "done", "its runs say how each went");
  for (let i = 0; i < 6; i++) {
    f.st.set(f.started.at(-1)!.id, "idle");
    await A.tick(h, f.hands, "/tmp", new Date(Date.now() + 60000));
    assert.ok((await A.runNow(h, { id: m.auto.id }, f.hands, "/tmp")).ok);
  }
  assert.equal(A.readAutos(h)[0].ran?.length, 5, "the last five runs are kept");
});

test("the planner: this Mac first, your AI when this Mac cannot (saying why), the ask as one step when neither can", async () => {
  const h = home();
  const plan = JSON.stringify(three);
  const mac = (ok: boolean, give: unknown = plan) => ({ available: async () => ({ status: ok ? "available" as const : "unavailable" as const, reason: ok ? undefined : "Apple Intelligence is off", at: Date.now() }), plan: async () => give });
  let asked = 0;
  const cloud = async () => { asked++; return { text: "Here:\n```json\n" + plan + "\n```", model: "claude-haiku-5-5" }; };

  const a = await L.makePlan(h, "tidy my notes", { onDevice: mac(true), cloud });
  assert.equal(a.by.who, "this Mac");
  assert.equal(asked, 0);
  const b = await L.makePlan(h, "tidy my notes", { onDevice: mac(false), cloud });
  assert.equal(b.by.who, "your AI");
  assert.equal(b.by.model, "claude-haiku-5-5");
  assert.match(b.by.why ?? "", /Apple Intelligence is off/);
  const c = await L.makePlan(h, "tidy my notes", { onDevice: mac(true, "not a plan"), cloud: async () => { throw new Error("no"); } });
  assert.equal(c.by.who, "you");
  assert.equal((c.spec.steps as unknown[]).length, 1);
  assert.ok(P.checkSpec(c.spec).ok, "the one step is a plan the person can start");

  const notes = readFileSync(join(h, "next", "planner.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(notes.map((x) => x.by), ["this Mac", "your AI", "you"]);
  assert.ok(notes.every((x) => !JSON.stringify(x).includes("tidy")), "the planner's notes keep no words of the ask");
});

test("How Sol worked: plans, automation runs and planner runs are in the day, with ids and counts, never their words", async () => {
  const h = home(), f = fakeHands(), now = Date.now(), day = dayOf(new Date(now));
  const r = P.propose(h, { title: "Secret title", steps: [{ name: "Secret step", does: "secret words" }] }, { ask: "secret ask", by: { who: "you" }, now });
  if (!r.ok) throw new Error(r.why);
  P.start(h, { id: r.plan.id, revision: r.plan.revision, yes: true }, "/tmp");
  await P.tick(h, f.hands, now);
  const step = f.started[0].id;
  await L.makePlan(h, "secret ask", { onDevice: { available: async () => ({ status: "available", at: now }), plan: async () => JSON.stringify(three) } });
  const base = { type: "next.traces" as const, day, days: [], runs: [{ id: step, source: { kind: "session" as const, id: step, seat: "claude" }, from: now, to: now, provider: null, tools: [], result: "running" as const, waits: [], permissions: [], steps: [], more: 0, back: { session: step }, unknown: [] }], coverage: { log: "read" as const, events: 0, skipped: 0, old: 0, unknown: [] } };
  const t = W.withWork(base, h);
  assert.deepEqual(t.runs.find((x) => x.id === step)?.of, { plan: r.plan.id, step: "s1" });
  const pr = t.runs.find((x) => x.source.kind === "plan");
  assert.equal(pr?.back?.plan, r.plan.id);
  assert.equal(pr?.result, "running");
  assert.ok(t.runs.some((x) => x.source.kind === "planner" && x.steps[0].facts.by === "this Mac"));
  assert.deepEqual(t.days, [day]);
  assert.equal(/secret/i.test(JSON.stringify(t)), false);
});
