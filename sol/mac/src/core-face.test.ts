// node --test src/*.test.ts: the face's core read as a hostile reader (#892). Each module's promise to its callers is
// pinned here against the inputs that break promises: the empty and the huge, the same event twice, events out of
// order, a block that no longer exists, a reconnect in the middle, time going backwards. A test named "defect:" failed
// before its fix in this PR (its commit names it); the rest are pins that passed as the code was. No DOM, no React.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fitInto, tile, overlaps, dockTo, dockBack, talkWidth, STAGE_FLOOR, MIN, PAD, type Place } from "./stage/model.ts";
import { applySide, stepOf, History, walk, readingOrder } from "./stage/moving.ts";
import { EngineStore } from "./stage/engineStore.ts";
import { LocalStore } from "./stage/store.ts";
import { placeNew, plan, record, undo, EMPTY_UNDO, freeSpot, type Placed } from "./stage/geometry.ts";
import { makeRoom, groups, unfoldBack } from "./stage/trayRules.ts";
import { switchLens, leave } from "./stage/lens.ts";
import { readSwitch, buildSwitch, type SwitchEnv } from "./flag.ts";
import { request, ran, ranOf, setRunner } from "./run.ts";

const P = (id: string, x: number, y: number, w = 300, h = 200, more: Partial<Place> = {}): Place => ({ id, x, y, w, h, z: 1, ...more });
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

// ── moving.ts: the history (⌘Z) ─────────────────────────────────────────────────────────────────────────────────
// Promise: a step taken back puts back only the places that step changed; "a step taken back never touches a block
// the agent composed after it"; a block comes back on the stage (back) only when the step itself took it off (a close).

test("defect: ⌘Z on a move never brings back a block closed since (applySide resurrected it)", () => {
  const before = [P("a", 12, 12)], after = [P("a", 400, 12)];
  const step = stepOf(before, after)!;
  // the agent (or another window) closed "a" after the person moved it: it is no longer on the stage
  const now: Place[] = [P("b", 12, 300)];
  const r = applySide(now, step.before, step.after);
  assert.deepEqual(r.back, [], "a move taken back must not reopen a closed block");
  assert.deepEqual(r.blocks.map((p) => p.id), ["b"]);
});

test("pin: ⌘Z on a close brings the block back where it sat; ⇧⌘Z closes it again", () => {
  const step = stepOf([P("a", 12, 12), P("b", 400, 12)], [P("b", 400, 12)])!;
  const back = applySide([P("b", 400, 12)], step.before, step.after);
  assert.deepEqual(back.back, ["a"]);
  const again = applySide(back.blocks, step.after, step.before);
  assert.deepEqual(again.gone, ["a"]);
});

test("pin: ⌘Z never touches a block the agent composed after the step", () => {
  const step = stepOf([P("a", 12, 12)], [P("a", 400, 12)])!;
  const r = applySide([P("a", 400, 12), P("new", 12, 300)], step.before, step.after);
  assert.deepEqual(r.blocks.find((p) => p.id === "new"), P("new", 12, 300));
  assert.equal(r.blocks.find((p) => p.id === "a")!.x, 12);
});

test("pin: history: nothing to undo is null, a new step drops the steps ahead, an empty step is no step", () => {
  const h = new History();
  assert.equal(h.undo(), null);
  assert.equal(h.redo(), null);
  h.push(stepOf([P("a", 0, 0)], [P("a", 0, 0)]));
  assert.deepEqual(h.size, { back: 0, ahead: 0 });
  h.push(stepOf([P("a", 0, 0)], [P("a", 8, 0)]));
  h.push(stepOf([P("a", 8, 0)], [P("a", 16, 0)]));
  h.undo();
  h.push(stepOf([P("a", 8, 0)], [P("a", 8, 8)]));
  assert.deepEqual(h.size, { back: 2, ahead: 0 });
});

test("pin: walk and reading order with nothing, one, and a held block that is gone", () => {
  assert.equal(walk([], null), null);
  assert.equal(walk(["a"], "a"), "a");
  assert.equal(walk(["a", "b"], "gone"), "a");
  assert.equal(walk(["a", "b"], "gone", true), "b");
  assert.deepEqual(readingOrder([]), []);
  assert.deepEqual(readingOrder([P("r", 400, 14), P("l", 12, 12), P("low", 12, 300)]).map((p) => p.id), ["l", "r", "low"]);
});

// ── engineStore.ts ────────────────────────────────────────────────────────────────────────────────────────────
// Promise: "A layout is shown at once and written behind; everything else is shown when the engine says so." An
// answer the engine gave before the person's layout must never take that layout back; the same press twice is one ask.

type Answer = { stage: { lens: "app"; tiled: boolean; blocks: Place[] }; blocks: { id: string; kind: "card"; title: string; state: "live"; versions: []; sessions: string[] }[] };
const answerWith = (blocks: Place[]): Answer => ({ stage: { lens: "app", tiled: false, blocks }, blocks: blocks.map((p) => ({ id: p.id, kind: "card", title: p.id, state: "live", versions: [], sessions: ["s"] })) });

test("defect: a stage answer asked before a drag never takes the drag back (stale answer won)", async () => {
  let engine = answerWith([P("a", 12, 12)]);
  const pending: (() => void)[] = [];
  const sent: string[] = [];
  let hear: (m: unknown) => void = () => {};
  // the engine answers work.stage.get late (held until we let it go), the layout at once
  const ask = ((type: string, a: { stage?: Answer["stage"] }) => {
    sent.push(type);
    if (type === "work.stage.layout") { engine = { ...engine, stage: a.stage! }; return Promise.resolve({}); }
    if (type !== "work.stage.get") return Promise.resolve({});
    const snap = engine;   // what the engine had when it was asked
    return new Promise((ok) => pending.push(() => ok(snap)));
  }) as never;
  const st = new EngineStore();
  st.connect(ask, (f) => { hear = f as never; return () => {}; });
  st.read("s");
  await tick();
  pending.shift()!();
  await tick(5);
  assert.equal(st.read("s").stage.blocks[0].x, 12);
  // a change elsewhere: the store asks again; the answer is on its way when the person drags "a" to x 400
  hear({ type: "work.stage.changed", sessionId: "s" });
  await tick();
  assert.equal(pending.length, 1);
  st.place("s", { lens: "app", tiled: false, blocks: [P("a", 400, 12)] });
  assert.equal(st.read("s").stage.blocks[0].x, 400);
  pending.shift()!();   // the old answer arrives after the drag
  await tick(5);
  assert.equal(st.read("s").stage.blocks[0].x, 400, "the old answer took the drag back");
  // and the store still learns the truth afterwards: it asks again once the layout is written
  await tick();
  while (pending.length) pending.shift()!();
  await tick(5);
  assert.equal(st.read("s").stage.blocks[0].x, 400);
  assert.ok(sent.filter((t) => t === "work.stage.get").length >= 3);
});

test("defect: a block pulled from the tray twice (a double press) is carried once", () => {
  const sent: { type: string; a: { to?: string } }[] = [];
  const ask = (async (type: string, a: { to?: string }) => { sent.push({ type, a }); return type === "work.stage.get" ? { ...answerWith([]), tray: [{ id: "t1", kind: "card", title: "x", state: "live", from: "o", at: 1 }] } : {}; }) as never;
  const st = new EngineStore();
  st.connect(ask, () => () => {});
  return (async () => {
    st.read("s");
    await tick();
    const at = { x: 12, y: 12, w: 200, h: 120 };
    st.pull("s", "t1", "you", at);
    st.pull("s", "t1", "you", at);
    assert.equal(sent.filter((m) => m.type === "work.stage.carry").length, 1);
    assert.equal(st.read("s").blocks.filter((b) => b.id === "t1").length, 1);
  })();
});

test("pin: a reconnect (a new ask) asks every stage again, and an answer from the old socket is dropped", async () => {
  const oldPending: (() => void)[] = [];
  const old = ((type: string) => (type === "work.stage.get" ? new Promise((ok) => oldPending.push(() => ok(answerWith([P("old", 12, 12)])))) : Promise.resolve({}))) as never;
  const fresh = (async (type: string) => (type === "work.stage.get" ? answerWith([P("new", 12, 12)]) : {})) as never;
  const st = new EngineStore();
  st.connect(old, () => () => {});
  st.read("s");
  await tick();
  st.connect(fresh, () => () => {});
  await tick();
  oldPending.forEach((f) => f());
  await tick(5);
  assert.deepEqual(st.read("s").stage.blocks.map((p) => p.id), ["new"]);
});

test("pin: an engine that errors leaves a ready stage as it was, and an unready one ready and empty", async () => {
  let fail = false;
  const ask = (async (type: string) => (type !== "work.stage.get" ? {} : fail ? { error: "the engine did not answer" } : answerWith([P("a", 12, 12)]))) as never;
  let hear: (m: unknown) => void = () => {};
  const st = new EngineStore();
  st.connect(ask, (f) => { hear = f as never; return () => {}; });
  st.read("s");
  await tick();
  fail = true;
  hear({ type: "work.stage.changed", sessionId: "s" });
  await tick();
  assert.equal(st.read("s").blocks.length, 1);
  st.read("t");
  await tick();
  assert.equal(st.read("t").ready, true);
  assert.equal(st.read("t").blocks.length, 0);
});

// ── store.ts LocalStore ───────────────────────────────────────────────────────────────────────────────────────
test("pin: LocalStore: unreadable storage is an empty stage; a full disk keeps the change in this window", () => {
  const kv = { getItem: () => "{not json", setItem: () => { throw new Error("QuotaExceededError"); } };
  const s = new LocalStore("t.", kv);
  assert.deepEqual(s.read("x").blocks, []);
  s.compose("x", { id: "a", kind: "card", title: "a", state: "live", versions: [], sessions: [] }, { x: 12, y: 12, w: 200, h: 120, z: 1 });
  assert.equal(s.read("x").blocks.length, 1);
  s.compose("x", { id: "a", kind: "card", title: "a again", state: "live", versions: [], sessions: [] });
  assert.equal(s.read("x").blocks.length, 1, "the same compose twice is one block");
});

// ── model.ts ───────────────────────────────────────────────────────────────────────────────────────────────────
// fitInto promises: the stage got smaller, each shown block that sticks out is moved in; null when every block fits.
test("defect: fitInto moves in a block that sticks out at the left or the top, not only the right and the foot", () => {
  const r = fitInto({ w: 900, h: 520 }, [P("a", -120, -40)]);
  assert.ok(r, "a block off the left and top edges was left there");
  assert.ok(r![0].x >= PAD && r![0].y >= PAD);
});

test("pin: fitInto never grows a block born under the least (a card is one row high) that already fits", () => {
  assert.equal(fitInto({ w: 900, h: 520 }, [P("card", 12, 12, 284, 96)]), null);
  const r = fitInto({ w: 500, h: 520 }, [P("card", 300, 12, 284, 96)])!;
  assert.deepEqual([r[0].w, r[0].h], [284, 96]);
});

test("defect: fitInto on a stage smaller than the least block settles: asked again, it says nothing changed", () => {
  const small = { w: MIN.w, h: MIN.h };   // under the least block plus its padding
  const once = fitInto(small, [P("a", 12, 12, 300, 200)]);
  assert.ok(once);
  assert.equal(fitInto(small, once!), null, "fitInto never settles, so every resize writes a layout again");
});

test("pin: tile's cells never overlap, for 1 to 12 blocks, on stages wide and narrow", () => {
  for (const st of [{ w: 1400, h: 900 }, { w: 900, h: 520 }, { w: 640, h: 400 }])
    for (let n = 1; n <= 12; n++) {
      const c = tile(st, n);
      assert.equal(c.length, n);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert.ok(!overlaps(c[i], c[j]), `tile ${n} on ${st.w}: ${i} and ${j}`);
    }
  assert.deepEqual(tile({ w: 900, h: 520 }, 0), []);
});

test("pin: the talk's dock: full remembers where it came from; back from full there; asked twice is no change", () => {
  let t = dockTo({ dock: "left" }, "full");
  assert.equal(dockBack(t).dock, "left");
  t = dockTo(t, "full");
  assert.equal(t.was, "left");
  t = dockTo(dockTo(dockTo({ dock: "left" }, "bottom"), "full"), "full");
  assert.equal(dockBack(t).dock, "bottom");
  assert.equal(talkWidth(2000, 8), 512);
  assert.ok(2000 - talkWidth(2000, 8, 0.99) >= STAGE_FLOOR);
});

// ── geometry.ts (the whole stage, stage.whole) ─────────────────────────────────────────────────────────────────
const pl = (id: string, x: number, y: number, w = 300, h = 200, more: Partial<Placed> = {}): Placed => ({ id, r: { x, y, w, h }, touched: 0, hand: false, born: 0, ...more });

test("defect: a new block bigger than the whole stage folds nothing: no fold can make it fit (placeNew)", () => {
  const room = { w: 900, h: 520 };
  const blocks = [pl("a", 16, 16), pl("b", 340, 16)];
  const r = placeNew(room, 2000, 2000, blocks);
  assert.equal(r.r, null);
  assert.deepEqual(r.fold, [], "every untouched block went to the tray for a block that can never fit");
});

test("pin: a released block bigger than the stage folds no other block for itself (plan)", () => {
  const room = { w: 900, h: 520 };
  const big = pl("big", 16, 16, 1200, 600);
  const r = plan(room, [big, pl("c", 600, 300, 200, 120)], new Map([["hand", { x: 16, y: 16, w: 200, h: 120 }]]));
  assert.ok(!r.fold.includes("c"), "an untouched block folded for one that cannot fit anyway");
});

test("pin: placeNew on an empty stage takes the top left; freeSpot on a zero stage is none", () => {
  assert.deepEqual(placeNew({ w: 900, h: 520 }, 300, 200, []).r, { x: 16, y: 16, w: 300, h: 200 });
  assert.equal(freeSpot({ w: 0, h: 0 }, 300, 200, []), null);
});

test("defect: nudges join only forward in time: a clock set back never folds a nudge into one an hour later", () => {
  const s = {};
  let u = record(EMPTY_UNDO, "nudge", 3_600_000, s, s);
  u = record(u, "nudge", 1_000, s, s);   // the clock went back an hour
  assert.equal(u.undo.length, 2);
  assert.equal(undo(u)!.u.undo.length, 1);
});

// ── trayRules.ts ──────────────────────────────────────────────────────────────────────────────────────────────
test("pin: makeRoom with a newcomer bigger than the stage folds at most one block", () => {
  const st = { w: 900, h: 520 };
  const places = [P("a", 12, 12, 400, 240), P("b", 424, 12, 400, 240), P("c", 12, 264, 400, 240)];
  const r = makeRoom(st, { w: 2000, h: 2000 }, places);
  assert.ok(r.folded.length <= 1);
});

test("pin: makeRoom never folds a hand-placed block; with only those, the newcomer waits", () => {
  const st = { w: 700, h: 300 };
  const r = makeRoom(st, { w: 600, h: 260 }, [P("a", 12, 12, 600, 260, { hand: true })]);
  assert.equal(r.at, null);
  assert.deepEqual(r.folded, []);
});

test("pin: unfoldBack ignores a fold of a block that no longer exists", () => {
  const r = unfoldBack({ w: 900, h: 520 }, [P("a", 12, 12)], [P("gone", 400, 12)]);
  assert.deepEqual(r.map((p) => p.id), ["a"]);
});

test("pin: the tray's groups: nothing is no group; newest session first", () => {
  assert.deepEqual(groups([], []), []);
  const g = groups([], [{ id: "1", kind: "card", title: "", state: "live", from: "old", at: 1 }, { id: "2", kind: "card", title: "", state: "live", from: "new", at: 9 }]);
  assert.deepEqual(g.map((x) => x.from), ["new", "old"]);
});

// ── lens.ts ───────────────────────────────────────────────────────────────────────────────────────────────────
test("pin: TUI picked twice is the TUI once; leaving puts back what it folded and the borrowed terminal", () => {
  const live = [{ id: "t", kind: "terminal" as const, title: "", state: "live" as const, versions: [], sessions: [] }, { id: "a", kind: "card" as const, title: "", state: "live" as const, versions: [], sessions: [] }];
  const full = { x: 12, y: 12, w: 876, h: 496 };
  const st = { lens: "app" as const, tiled: false, blocks: [P("t", 400, 12), P("a", 12, 12)] };
  const once = switchLens(st, live, "tui", full).stage;
  const twice = switchLens(once, live, "tui", full).stage;
  assert.deepEqual(twice.blocks.map((p) => [p.id, p.x, !!p.folded]), once.blocks.map((p) => [p.id, p.x, !!p.folded]));
  const back = leave(twice.blocks);
  assert.deepEqual(back.map((p) => [p.id, p.x, p.y, !!p.folded]), [["t", 400, 12, false], ["a", 12, 12, false]]);
});

// ── flag.ts ───────────────────────────────────────────────────────────────────────────────────────────────────
test("pin: a switch: the link wins over storage for the load, even after another window writes", () => {
  const o: Record<string, string> = { k: "1" };
  const target = new EventTarget();
  const env: SwitchEnv = { storage: () => ({ getItem: (k) => o[k] ?? null, setItem: (k, v) => { o[k] = v; } }), search: () => "?k=off", target };
  const s = buildSwitch("k", env);
  assert.equal(s.get(), false);
  o.k = "1";
  target.dispatchEvent(Object.assign(new Event("storage"), { key: "k" }));
  assert.equal(s.get(), false);
  assert.equal(readSwitch("k", "?k=yes", { getItem: () => "1" }), true, "an unknown link value falls to storage");
});

// ── run.ts ────────────────────────────────────────────────────────────────────────────────────────────────────
// Promise: a run says "the engine did not answer" only when that run heard nothing in 5 s.
test("defect: a block run again within 5 s is not called unanswered by the first run's timer", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    setRunner({ send: () => true, seat: "claude", sessionId: "s" });
    request("r1", "ls");
    ran({ type: "ran", rid: "r1", out: "a\n", done: true, code: 0 });
    mock.timers.tick(4000);
    request("r1", "ls");   // run again, 4 s after the first began
    mock.timers.tick(1500);   // the first run's 5 s are up; the second has been going 1.5 s
    assert.equal(ranOf("r1")!.why, undefined, "the second run was called unanswered after 1.5 s");
    assert.equal(ranOf("r1")!.done, false);
    mock.timers.tick(4000);
    assert.equal(ranOf("r1")!.done, true);
  } finally { mock.timers.reset(); setRunner(null); }
});

test("pin: a run with the socket down says so at once; nothing runs with no session", () => {
  setRunner({ send: () => false, seat: "claude", sessionId: "s" });
  request("r2", "ls");
  assert.equal(ranOf("r2")!.why, "not connected");
  let sent = 0;
  setRunner({ send: () => { sent++; return true; }, seat: "claude", sessionId: null });
  request("r3", "ls");
  assert.equal(sent, 0);
  setRunner(null);
});

test("defect: a run with no session, or no runner at all, says why under the block (#1361: the press did nothing)", () => {
  setRunner({ send: () => true, seat: "claude", sessionId: null });
  request("r4", "ls");
  assert.deepEqual([ranOf("r4")!.done, ranOf("r4")!.why], [true, "no session to run this in"]);
  setRunner(null);
  request("r5", "ls");
  assert.deepEqual([ranOf("r5")!.done, ranOf("r5")!.why], [true, "no session to run this in"]);
});

// Promise: every page that draws a session's talk (its code blocks carry the run cell) sets the runner and feeds the
// engine's "ran" pieces back. The clean Home drew the talk and did neither (#1361). That the press then runs is the
// end-to-end path's to say (sol/test/e2e/run-cell.mjs); this only keeps a page from losing the wiring unseen.
test("defect: both Build pages, the old Home and the clean one, wire the run cell", () => {
  for (const p of ["./work/WorkApp.tsx", "./home/Home.tsx"]) {
    // code only: wiring that is commented out does not count (#1500)
    const src = readFileSync(new URL(p, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.match(src, /useEffect\(\(\) => \{[^\n]*\bsetRunner\(\{/, `${p} sets no runner`);
    assert.match(src, /useEffect\(\(\) => e\.subscribe\(ran\)/, `${p} does not feed "ran" back`);
  }
});

// Promise: a block in Home's pane beside runs for that pane's session, not the main one's, in its folder (#1500, #1373).
// The pane says which session it is (data-run-session); the press carries it; and when the clean Home goes, so does
// its runner, so a press elsewhere says there is no session instead of running in the last one (#1500).
test("defect: a block in the pane beside runs for the pane's session; the clean Home clears its runner", () => {
  const sent: { sessionId?: string }[] = [];
  setRunner({ send: (o) => { sent.push(o as { sessionId?: string }); return true; }, seat: "claude", sessionId: "main" });
  request("b1", "pwd", "beside");
  request("b2", "pwd");
  assert.deepEqual(sent.map((o) => o.sessionId), ["beside", "main"]);
  setRunner(null);
  request("b3", "pwd", "beside");
  assert.deepEqual([sent.length, ranOf("b3")!.why], [2, "no session to run this in"]);
  const home = readFileSync(new URL("./home/Home.tsx", import.meta.url), "utf8");
  assert.match(home, /className="hc-pin" data-run-session=\{id\}/, "Home's pane beside does not say its session");
  assert.match(home, /setRunner\(\{[^\n]*return \(\) => setRunner\(null\)/, "the clean Home leaves its runner set");
  const msg = readFileSync(new URL("./Message.tsx", import.meta.url), "utf8");
  assert.match(msg, /request\(rid, cmd, \(cell!\.closest\("\[data-run-session\]"\)/, "the run cell does not carry its pane's session");
});
