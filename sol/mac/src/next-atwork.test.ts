// node --test src/*.test.ts: See what's at work (BR1 item 7, #1615; next/atwork/model.ts, act.ts, the wire
// cv/wire/atwork.ts): one axis, time. Now holds what asks first, then what works, then what is held, an automation's run
// drawn once; Next the automations due today, soonest first, the rest one count; Sol did today's lines by Sol, scoped
// like the Diary. Pause, Stop, Pause everything and Resume everything each say what they did; Back undoes. Invented people and
// folders only. Signed: marcocyl04-ux's agent (builder F), BR1 item 7 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { atWork, countWords, dueToday, type Held, type RunBits } from "./next/atwork/model.ts";
import { goAll, goOn, holdAll, pause, setEngine, st, stop } from "./next/atwork/act.ts";
import { D } from "./next/cv/index.ts";
import type { Piece, Region } from "./next/cv/types.ts";
import type { Auto } from "./next/work/read.ts";
import type { Line } from "./next/diary/book.ts";

const regions: Region[] = [
  { id: "w:/v/kite", name: "kite", kind: "code", path: "/v/kite" },
  { id: "h:garden", name: "garden", kind: "life" },
];
const session = (id: string, region: string, more: Partial<Piece> = {}): Piece =>
  ({ id, kind: "session", region, name: `Rosa in ${id}`, words: id, state: "working", term: { stateWord: "Editing" }, ...more } as unknown as Piece);
const auto = (id: string, region: string, more: Partial<Auto> = {}): Auto =>
  ({ id, name: `Auto ${id}`, does: "do it", when: "every day at 17:00", on: true, made: 1, model: null, runs: 1, next: "today at 17:00", region, cwd: null, last: null, ran: [], ...more } as Auto);
const line = (id: string, region: string, t: number, more: Partial<Line> = {}): Line =>
  ({ id, who: "Rosa", what: `did ${id}`, t, kind: "ai", mine: false, region, ...more } as unknown as Line);
const pieces = (...ps: Piece[]) => Object.fromEntries(ps.map((p) => [p.id, p]));
const none = { runs: {} as Record<string, RunBits>, held: null as Held | null, asked: () => "", lines: [] as Line[] };

test("Now: what asks first with its words, then what works with its helpers, then what is held", () => {
  const d = { regions, pieces: pieces(session("tests", "w:/v/kite"), session("seeds", "h:garden"), session("docs", "w:/v/kite"), session("done", "w:/v/kite", { state: "done" })) };
  const v = atWork(d, null, { ...none, asked: (id) => (id === "seeds" ? "Order the tulips?" : ""),
    runs: { tests: { tasks: ["Read the failing test", "Find the cause"], since: 100, paused: false }, docs: { tasks: [], since: 200, paused: true } } });
  assert.deepEqual(v.now.map((r) => [r.id, r.stand]), [["seeds", "asks"], ["tests", "working"], ["docs", "held"]], "done is not at work");
  assert.equal(v.now[0].line, "Asks you: Order the tulips?");
  assert.equal(v.now[1].line, "Editing, with 2 helpers");
  assert.deepEqual(v.now[1].helpers, ["Read the failing test", "Find the cause"]);
  assert.equal(v.now[2].line, "Finishes this step, then waits");
  assert.equal(countWords(v), "1 running · 1 needs you");
});

test("an automation's run is drawn once, as the automation; paused while it runs, it is held", () => {
  const last = { at: 50, sessionId: "run-1", state: "working", how: "event", files: [] } as Auto["last"];
  const d = { regions, pieces: pieces(session("run-1", "h:garden")), work: { autos: [auto("water", "h:garden", { last })] } };
  const v = atWork(d, null, none);
  assert.deepEqual(v.now.map((r) => [r.id, r.kind, r.line]), [["auto:water", "auto", "Running, a new file came in"]], "the run's session is not a second row");
  const off = atWork({ ...d, work: { autos: [auto("water", "h:garden", { last, on: false })] } }, null, none);
  assert.equal(off.now[0].stand, "held");
  assert.equal(off.now[0].line, "Finishes this run, then skips until you resume");
});

test("Next: due today, soonest first; an event after every time; the rest one count; off is not next", () => {
  assert.equal(dueToday("today at 09:30"), 570);
  assert.equal(dueToday("when a new file comes in"), 24 * 60);
  assert.equal(dueToday("on Fri at 17:00"), null);
  const d = { regions, pieces: {}, work: { autos: [auto("late", "h:garden", { next: "today at 18:00" }), auto("soon", "w:/v/kite", { next: "today at 08:15" }),
    auto("file", "h:garden", { next: "when a new file comes in" }), auto("fri", "h:garden", { next: "on Fri at 17:00" }), auto("off", "h:garden", { on: false, next: "paused" })] } };
  const v = atWork(d, null, none);
  assert.deepEqual(v.next.map((x) => [x.id, x.when]), [["soon", "08:15"], ["late", "18:00"], ["file", "when a new file comes in"]]);
  assert.equal(v.later, 1, "Friday's is one count; the paused one is neither");
  assert.equal(countWords(v), "No AI is working right now", "the words pass (BR1): read as clear, \"Nothing running\" was not");
});

test("scoped like the Diary: a folder's own rows, lines and hold; Sol did is Sol's lines, newest first", () => {
  const d = { regions, pieces: pieces(session("tests", "w:/v/kite"), session("seeds", "h:garden")), work: { autos: [auto("water", "h:garden")] } };
  const lines = [line("a", "w:/v/kite", 1), line("b", "h:garden", 3), line("c", "h:garden", 2), line("mine", "h:garden", 4, { mine: true }), line("gone", "h:garden", 5, { removed: true } as Partial<Line>)];
  const held: Held = { at: 1, folder: "w:/v/kite", sessions: ["tests"], autos: [] };
  const g = atWork(d, "h:garden", { ...none, lines, held });
  assert.deepEqual(g.now.map((r) => r.id), ["seeds"]);
  assert.deepEqual(g.next.map((x) => x.id), ["water"]);
  assert.deepEqual(g.did.map((l) => l.id), ["b", "c"], "the person's own and the removed are not Sol's");
  assert.equal(g.held, null, "kite's hold is not the garden's");
  assert.equal(countWords(atWork(d, "w:/v/kite", { ...none, held })), "Everything holds");
});

test("presses on the dev page: Pause says what it did and Back undoes; Stop keeps what it made; Pause everything, then Resume everything", () => {
  setEngine(null);
  const sent: object[] = [];
  const p = session("tests", "w:/v/kite");
  D.pieces = pieces(p);
  st.runs = { tests: { tasks: [], since: 1, paused: false } };
  const row = atWork({ regions, pieces: D.pieces }, null, { ...none, runs: st.runs }).now[0];
  pause(row);
  assert.equal(st.runs.tests.paused, true);
  assert.equal(st.said?.words, "“Tests” finishes this step, then waits.", "named as the Diary names it");
  st.said!.back!();
  assert.equal(st.runs.tests.paused, false, "Back goes on");
  assert.equal(st.said, null);
  stop(row);
  assert.equal(p.state, "idle");
  assert.equal(st.said?.words, "“Tests” stopped. What it made is kept.");
  st.said!.back!();
  assert.equal(p.state, "working", "Back starts it again from there");
  holdAll(atWork({ regions, pieces: D.pieces }, null, { ...none, runs: st.runs }));
  assert.deepEqual(st.held?.sessions, ["tests"]);
  assert.equal(st.said, null, "the held line says it, once");
  assert.equal(st.runs.tests.paused, true);
  goAll();
  assert.equal(st.held, null);
  assert.equal(st.runs.tests.paused, false);
  // live, the same presses go to the engine
  setEngine({ send: (o: object) => { sent.push(o); }, subscribe: () => () => {} } as never);
  pause(row); goOn({ ...row, stand: "held" }); stop(row);
  assert.deepEqual(sent.map((o) => (o as { type: string }).type), ["next.atwork.pause", "next.atwork.go", "work.stop"]);
  setEngine(null);
});
