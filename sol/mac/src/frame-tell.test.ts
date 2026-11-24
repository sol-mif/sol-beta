// The frame's switch reaches the engine from every window (#1108, home/frameFlag.ts useTellFrame, mounted in App.tsx),
// and a second window never sends back what another window turned (#1846).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// two windows: two copies of the module, each with its own view of the storage they share, as Sol's windows are separate
// WebKit processes; a write reaches the other window only when its storage event is delivered (late, and never to the
// window that wrote, as in a browser)
const views = { a: new Map<string, string>(), b: new Map<string, string>() };
let at_: "a" | "b" = "a";
const hearers: ((e: { key: string | null }) => void)[] = [];
const pending: { to: "a" | "b"; k: string; v: string }[] = [];
(globalThis as any).location = { search: "" };
(globalThis as any).localStorage = {
  getItem: (k: string) => views[at_].get(k) ?? null,
  setItem: (k: string, v: string) => { views[at_].set(k, v); pending.push({ to: at_ === "a" ? "b" : "a", k, v }); },
};
(globalThis as any).addEventListener = (t: string, f: any) => { if (t === "storage") hearers.push(f); };
const at = new URL("./home/frameFlag.ts", import.meta.url).href;
const A = await import(at + "?window=a");
const B = await import(at + "?window=b");
const { decide } = A;
const as = <T>(w: "a" | "b", f: () => T): T => { const was = at_; at_ = w; try { return f(); } finally { at_ = was; } };

test("told, besides the person's turn: the first word since the link came up, or an engine with no value; once a turn", () => {
  assert.equal(decide(true, undefined, null, false), true, "a window that never turned it reads on: an engine with no value is told on (#1108)");
  assert.equal(decide(true, undefined, true, false), false, "told already this turn (an older engine drops the key)");
  assert.equal(decide(false, true, null, true), true, "the first word since the link came up: told the stored choice");
  assert.equal(decide(true, true, null, true), false, "the engine agrees");
  assert.equal(decide(true, null, null, true), false, "the engine has not spoken");
  assert.equal(decide(false, undefined, null, false), false, "off, and an engine with no value reads off");
});

test("a value the engine holds that this window did not cause is never sent back (#1846)", () => {
  assert.equal(decide(true, false, null, false), false, "another window turned it off");
  assert.equal(decide(false, true, null, false), false, "and on");
});

// the engine: one value, a broadcast to every window after each set (delivered when flushed), a link that can drop
function rig() {
  views.a.clear(); views.b.clear(); pending.length = 0;
  as("a", () => hearers[0]({ key: null })); as("b", () => hearers[1]({ key: null }));   // both windows start on, nobody's turn
  const eng = { value: undefined as boolean | undefined, up: true };
  const sent: [string, boolean][] = [];
  const casts: (() => void)[] = [];
  const win = (w: "a" | "b", W: any) => {
    const look = W.newLook();
    const set = (p: { frame: boolean }) => {
      if (!eng.up) return;   // the socket drops it
      sent.push([w, p.frame]); eng.value = p.frame;
      const v = eng.value;
      casts.push(() => { a.hear({ type: "settings", settings: { frame: v } }); b.hear({ type: "settings", settings: { frame: v } }); });
    };
    return {
      look, set,
      hear: (m: any) => as(w, () => W.hear(look, m, set)),
      turn: (v: boolean) => as(w, () => { W.setFrameOn(v); W.step(look, set); }),   // the switch, then App's effect on the turn
      step: () => as(w, () => W.step(look, set)),
      on: () => W.frameOn() as boolean,
    };
  };
  const a = win("a", A), b = win("b", B);
  /** the storage events written so far reach the other window (and its effect runs on what changed) */
  const storage = () => { for (const e of pending.splice(0)) { views[e.to].set(e.k, e.v); as(e.to, () => hearers[e.to === "a" ? 0 : 1]({ key: e.k })); (e.to === "a" ? a : b).step(); } };
  /** the engine's broadcasts so far reach both windows */
  const engine = () => { for (const c of casts.splice(0)) c(); };
  const settle = () => { for (let i = 0; i < 20 && (pending.length || casts.length); i++) { engine(); storage(); } };
  a.hear({ type: "open" }); b.hear({ type: "open" });
  a.hear({ type: "settings", settings: {} }); b.hear({ type: "settings", settings: {} });   // a new engine: no value
  settle();
  sent.length = 0;
  return { eng, sent, a, b, storage, engine, settle };
}

test("two windows, the storage event first: Settings' off in one sticks (#1846)", () => {
  const { eng, sent, a, b, storage, engine, settle } = rig();
  assert.equal(eng.value, true, "on, told at the start (#1108)");
  a.turn(false);
  storage(); engine(); settle();
  assert.equal(eng.value, false);
  assert.deepEqual(sent, [["a", false]], "only A told, once");
  assert.equal(b.on(), false, "B follows A's turn");
});

test("two windows, the engine's broadcast first: the late window never sends its stale on (#1846)", () => {
  const { eng, sent, a, b, storage, engine, settle } = rig();
  b.turn(true);   // B made the last turn, so B once held it as its own (the review's case)
  settle();
  sent.length = 0;
  a.turn(false);
  engine();   // the engine's off reaches B before A's storage event does
  engine();
  assert.equal(b.on(), true, "B has not heard yet");
  assert.deepEqual(sent, [["a", false]], "B sent nothing back");
  storage(); settle();
  assert.equal(eng.value, false, "the engine stays off");
  assert.equal(b.on(), false, "B follows once its event lands");
  assert.deepEqual(sent, [["a", false]], "no loop");
  assert.equal(as("a", () => localStorage.getItem("sol.frame")), "0");
  assert.equal(as("b", () => localStorage.getItem("sol.frame")), "0", "nobody wrote over the person's choice");
});

test("off then on at once: it ends on, each turn sent once", () => {
  const { eng, sent, a, settle } = rig();
  a.turn(false); a.turn(true);
  settle();
  assert.equal(eng.value, true);
  assert.deepEqual(sent, [["a", false], ["a", true]]);
});

test("a turn made while the engine is unreachable is told when the link comes back", () => {
  const { eng, a, b, settle } = rig();
  eng.up = false;
  a.turn(false);
  assert.equal(eng.value, true, "the send was dropped");
  settle();
  eng.up = true;
  a.hear({ type: "open" }); b.hear({ type: "open" });
  a.hear({ type: "settings", settings: { frame: true } }); b.hear({ type: "settings", settings: { frame: true } });
  settle();
  assert.equal(eng.value, false, "told off again");
  assert.equal(a.on(), false, "the person's turn kept"); assert.equal(b.on(), false);
});

test("a renewed engine that lost the setting is told again; an older engine that drops the key is told once", () => {
  const { eng, sent, a, b, settle } = rig();
  eng.value = undefined;   // renewed, its settings file lost
  a.hear({ type: "open" }); b.hear({ type: "open" });
  a.hear({ type: "settings", settings: {} }); b.hear({ type: "settings", settings: {} });
  settle();
  assert.equal(eng.value, true, "told on again");
  sent.length = 0;
  // an older engine: it drops the key and keeps saying it holds none
  for (let i = 0; i < 5; i++) { a.hear({ type: "settings", settings: {} }); b.hear({ type: "settings", settings: {} }); }
  assert.ok(sent.length <= 2, `told at most once a window, not in a loop (${sent.length})`);
});

test("App tells it, whichever view shows; Home no longer does it alone", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const home = readFileSync(new URL("./home/Home.tsx", import.meta.url), "utf8");
  const call = app.indexOf("useTellFrame(e.subscribe, e.setSettings)");
  assert.ok(call > 0, "App mounts it, hearing the engine's own messages");
  assert.ok(call < app.indexOf("if (POP) return"), "before any early return, so every window runs it");
  assert.doesNotMatch(home, /setSettings\(\{ frame/);
});
