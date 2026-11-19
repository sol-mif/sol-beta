import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ScreensBook, screensFile, drawnOn, homeOf, settled, arrangePlan, stageWindow, cleanScreen, cleanPlaces } from "../src/screens.ts";
import { Parts } from "../src/parts.ts";
import part from "../src/parts/screens.ts";

// One Jelly, several windows onto it (#1090): the engine's record of windows, roles and where each block is drawn

test("a window says hello: main is whole, another is a stage, a known one keeps its role", () => {
  const b = new ScreensBook(null);
  assert.equal(b.hello("main").role, "whole");
  assert.equal(b.hello("two").role, "stage");
  b.role("two", "wall");
  assert.equal(b.hello("two").role, "wall");
  assert.equal(b.hello("two", "stage").role, "wall");   // a window coming back is what it was, whatever its link asks
  assert.deepEqual(b.state().windows.map((w) => w.win), ["main", "two"]);
});

test("a thrown block is drawn on its window; one line per block, so it is the same block", () => {
  const b = new ScreensBook(null);
  b.hello("main", "whole"); b.hello("two", "wall");
  b.put("blk-1", "two");
  assert.equal(drawnOn(b.state(), "blk-1"), "two");
  assert.equal(drawnOn(b.state(), "blk-2"), "main");   // nobody threw it: the whole window
  b.put("blk-1", "two");
  assert.equal(Object.keys(b.state().where).length, 1);
  b.put("blk-1", "main");
  assert.equal(drawnOn(b.state(), "blk-1"), "main");
  b.put("blk-1", null);
  assert.deepEqual(b.state().where, {});
});

test("a block nobody threw is drawn on the stage window: with the laptop as anchor, the monitor holds the stage", () => {
  const b = new ScreensBook(null);
  b.hello("main", "anchor"); b.hello("two", "stage");
  assert.equal(homeOf(b.state()), "two");
  assert.equal(drawnOn(b.state(), "any"), "two");
  b.gone("two");
  assert.equal(drawnOn(b.state(), "any"), "main");   // the monitor gone: home
});

test("a window gone (its screen unplugged): its blocks are drawn at home, and come back when it says hello again", () => {
  const b = new ScreensBook(null);
  b.hello("main"); b.hello("two");
  b.put("x", "two"); b.put("y", "two");
  assert.equal(b.gone("two"), true);
  assert.equal(b.gone("two"), false);   // told once
  assert.equal(drawnOn(b.state(), "x"), "main");
  assert.equal(b.state().where.x, "two");   // the line is kept
  b.hello("two");
  assert.equal(drawnOn(b.state(), "x"), "two");
  assert.equal(drawnOn(b.state(), "y"), "two");
});

test("an anchor takes no blocks by a throw: it keeps its side and the talk stays where it is", () => {
  const b = new ScreensBook(null);
  b.hello("main", "anchor"); b.hello("two", "stage");
  b.put("x", "main");
  assert.deepEqual(b.state().windows.map((w) => w.role), ["anchor", "stage"]);
  assert.equal(drawnOn(b.state(), "x"), "two");   // drawn where the stage is; its line kept for later
});

test("gather brings everything to one window; swap trades two roles", () => {
  const b = new ScreensBook(null);
  b.hello("main", "anchor"); b.hello("two", "stage");
  b.put("x", "two");
  assert.equal(b.gather("main", ["y"]), 2);
  assert.deepEqual(b.state().where, { x: "main", y: "main" });
  assert.equal(b.state().windows[0].role, "anchor");
  assert.equal(b.swap("main", "two"), true);
  assert.deepEqual(b.state().windows.map((w) => `${w.win}:${w.role}`), ["main:stage", "two:anchor"]);
  assert.equal(b.swap("main", "nope"), false);
});

test("a session pressed in an anchor opens on the stage window, never on the anchor itself", () => {
  const b = new ScreensBook(null);
  b.hello("main", "anchor"); b.hello("two", "stage");
  assert.equal(stageWindow(b.state(), "main"), "two");
  b.role("two", "wall");
  assert.equal(stageWindow(b.state(), "main"), "main");   // no stage anywhere: home
  b.hello("three", "whole");
  assert.equal(stageWindow(b.state(), "main"), "three");
  b.gone("three");
  assert.equal(stageWindow(b.state(), "main"), "main");
});

test("two layouts of one state: a window's own places per session; the blocks themselves are not copied", () => {
  const b = new ScreensBook(null);
  b.hello("main"); b.hello("two");
  b.lay("two", "s-1", cleanPlaces([{ id: "a", x: 0, y: 0, w: 900, h: 600 }, { id: "bad id!", x: 0, y: 0, w: 1, h: 1 }, { id: "c", x: "1" }]));
  assert.deepEqual(b.state().lay.two["s-1"], [{ id: "a", x: 0, y: 0, w: 900, h: 600 }]);
  assert.equal(b.state().lay.main, undefined);
});

test("the arrangement is kept per project and put back: roles of the windows here, blocks where they were", () => {
  const b = new ScreensBook(null);
  b.hello("main", "anchor"); b.hello("two", "stage");
  b.put("p1", "two"); b.put("other", "two");
  b.keep("sol", ["p1"]);
  b.role("main", "whole"); b.role("two", "wall"); b.put("p1", null);
  assert.ok(b.recall("sol"));
  assert.deepEqual(b.state().windows.map((w) => w.role), ["anchor", "stage"]);
  assert.equal(b.state().where.p1, "two");
  assert.equal(b.recall("nothing"), null);
});

test("the book is kept in a file; read back, no window is live until it says hello", () => {
  const home = mkdtempSync(join(tmpdir(), "sol-screens-"));
  const a = new ScreensBook(screensFile(home));
  a.hello("main"); a.hello("two", "wall"); a.put("x", "two");
  const b = new ScreensBook(screensFile(home));
  assert.deepEqual(b.state().windows.map((w) => [w.win, w.role, w.live]), [["main", "whole", false], ["two", "wall", false]]);
  assert.equal(drawnOn(b.state(), "x"), "main");
  b.hello("two");   // alone, it takes the side and the talk; main back, it is a wall again
  assert.equal(b.state().windows.find((w) => w.win === "two")!.role, "whole");
  b.hello("main");
  assert.equal(b.state().windows.find((w) => w.win === "two")!.role, "wall");
  assert.equal(drawnOn(b.state(), "x"), "two");
});

test("a screen is four finite numbers; anything else is no screen", () => {
  assert.deepEqual(cleanScreen({ x: 0, y: 0, w: 2560, h: 1440, main: false, name: "DELL" }), { x: 0, y: 0, w: 2560, h: 1440, name: "DELL" });
  assert.equal(cleanScreen({ x: 0, y: 0, w: 0, h: 1 }), undefined);
  assert.equal(cleanScreen("big"), undefined);
});

// the part over a fake socket: two faces on one engine, the same state told to both
function engine() {
  const p = new Parts();
  const sent: { to: string; m: any }[] = [];
  const faces: { name: string; ws: EventEmitter & { readyState: number; send: (s: string) => void } }[] = [];
  const e = { HOME: mkdtempSync(join(tmpdir(), "sol-screens-p-")), PORT: 0, send: (ws: any, m: object) => sent.push({ to: ws.name, m }), everyone: (m: object) => faces.forEach((f) => sent.push({ to: f.name, m })) };
  const face = (name: string) => { const ws = Object.assign(new EventEmitter(), { name, readyState: 1, send: () => {} }); faces.push({ name, ws }); return ws; };
  const say = (ws: any, m: any) => p.heard(m.type)!(m, { ...e, ws, face: { send: () => {} }, conn: { chars: 0 }, fromSol: true, fromApp: true });
  return { p, e, sent, face, say };
}
const lastState = (sent: { to: string; m: any }[], to: string) => [...sent].reverse().find((s) => s.to === to && s.m.type === "screens.state")?.m;

test("two faces on one engine: a throw from one is told to both at once; the stage window hears the session to open", async () => {
  const { p, e, sent, face, say } = engine();
  // the part file registers itself into a fresh registry
  (p as any).file = "parts/screens.ts"; await part(p); (p as any).file = "";
  await (p as any).starts[0].fn(e);
  const A = face("A"), B = face("B");
  say(A, { type: "screens.hello", win: "main", role: "anchor" });
  say(B, { type: "screens.hello", win: "two", role: "stage", screen: { x: 1512, y: 0, w: 2560, h: 1440 } });
  say(B, { type: "screens.put", block: "blk-9", win: "main" });
  say(A, { type: "screens.put", block: "blk-1", win: "two" });
  assert.deepEqual(lastState(sent, "A").where, { "blk-9": "main", "blk-1": "two" });
  assert.deepEqual(lastState(sent, "B").where, { "blk-9": "main", "blk-1": "two" });
  say(A, { type: "screens.open", session: "s-42", from: "main" });
  const opened = sent.filter((s) => s.m.type === "screens.opened");
  assert.deepEqual(opened.map((s) => [s.to, s.m.win, s.m.session]), [["A", "two", "s-42"], ["B", "two", "s-42"]]);
  say(A, { type: "screens.role", win: "two", role: "nonsense" });
  assert.match(lastState(sent, "A").refused, /a window and a role/);
});

test("a face that closes is gone after a moment; one that says hello again in time (a reload) never was", async () => {
  const { p, e, sent, face, say } = engine();
  (p as any).file = "parts/screens.ts"; await part(p); (p as any).file = "";
  await (p as any).starts[0].fn(e);
  const A = face("A"), B = face("B");
  say(A, { type: "screens.hello", win: "main" });
  say(B, { type: "screens.hello", win: "two" });
  say(A, { type: "screens.put", block: "x", win: "two" });
  B.emit("close");
  const B2 = face("B2");
  say(B2, { type: "screens.hello", win: "two" });
  await new Promise((r) => setTimeout(r, 1700));
  assert.equal(lastState(sent, "A").windows.find((w: any) => w.win === "two").live, true);
  B2.emit("close");
  await new Promise((r) => setTimeout(r, 1700));
  const s = lastState(sent, "A");
  assert.equal(s.windows.find((w: any) => w.win === "two").live, false);
  assert.equal(drawnOn(s, "x"), "main");
  assert.equal(s.where.x, "two");
});

test("no block jumps when roles change: the window drawing the unthrown blocks goes on keeping them", () => {
  const b = new ScreensBook(null);
  b.hello("main", "whole"); b.hello("two", "wall");
  b.put("x", "two");
  b.talk("main", "two");   // the talk leaves: the rest go with it
  assert.deepEqual([drawnOn(b.state(), "x"), drawnOn(b.state(), "rest")], ["two", "two"]);
  b.swap("main", "two");   // a trade: everything changes window, together, and only by the press
  assert.deepEqual([drawnOn(b.state(), "x"), drawnOn(b.state(), "rest")], ["main", "main"]);
});

test("a trade swaps what the two windows hold: roles, thrown blocks, and the rest", () => {
  const b = new ScreensBook(null);
  b.hello("main", "whole"); b.hello("two", "wall");
  b.put("x", "two");
  assert.deepEqual([drawnOn(b.state(), "x"), drawnOn(b.state(), "rest")], ["two", "main"]);
  b.swap("main", "two");
  assert.deepEqual([drawnOn(b.state(), "x"), drawnOn(b.state(), "rest")], ["main", "two"]);
  assert.deepEqual(b.state().windows.map((w) => w.role), ["wall", "whole"]);
});

test("a second window opened by a throw holds only what was carried to it; the main window keeps the rest", () => {
  const b = new ScreensBook(null);
  b.hello("main", "whole");
  b.put("x", "two");   // its line waits for the window that is opening
  assert.equal(drawnOn(b.state(), "x"), "main");
  b.hello("two", "stage");
  assert.deepEqual([drawnOn(b.state(), "x"), drawnOn(b.state(), "rest")], ["two", "main"]);
});

test("the talk carried across: this window keeps its side (anchor), the other takes the talk and the blocks (stage); back again", () => {
  const b = new ScreensBook(null);
  b.hello("main", "whole"); b.hello("two", "wall");
  b.put("x", "two");
  assert.equal(b.talk("main", "two"), true);
  assert.deepEqual(b.state().windows.map((w) => w.role), ["anchor", "stage"]);
  assert.deepEqual([drawnOn(b.state(), "x"), drawnOn(b.state(), "rest")], ["two", "two"]);
  b.talk("two", "main");
  assert.deepEqual(b.state().windows.map((w) => w.role), ["whole", "wall"]);
  assert.equal(drawnOn(b.state(), "rest"), "main");
  assert.equal(drawnOn(b.state(), "x"), "two");   // what was thrown stays where it was thrown
  assert.equal(b.talk("main", "nope"), false);
});

test("one side and one talk among the live windows, always; a window coming back is what it was", () => {
  const b = new ScreensBook(null);
  b.hello("main", "whole"); b.hello("two", "wall");
  b.swap("main", "two");                     // the laptop a wall, the monitor whole
  b.gone("two");                             // the monitor unplugged: the roles are kept for its return
  b.hello("two", "wall");                    // plugged back: its link asks for a wall, but it was whole: it is whole
  assert.deepEqual(b.state().windows.map((w) => [w.win, w.role]), [["main", "wall"], ["two", "whole"]]);
  // an arrangement of anchor and stage comes back as it was
  const c = new ScreensBook(null);
  c.hello("main", "anchor"); c.hello("two", "stage"); c.gone("two"); c.hello("two", "wall");
  assert.deepEqual(c.state().windows.map((w) => w.role), ["anchor", "stage"]);
  // two windows that both hold the side: main keeps it
  const w = settled([{ win: "main", role: "whole", live: true, at: 0 }, { win: "two", role: "whole", live: true, at: 0 }], "main");
  assert.deepEqual(w.map((x) => x.role), ["whole", "wall"]);
  // nobody holds the talk: the side's window takes it
  assert.deepEqual(settled([{ win: "main", role: "anchor", live: true, at: 0 }, { win: "two", role: "wall", live: true, at: 0 }], "main").map((x) => x.role), ["whole", "wall"]);
});

test("an arrangement for the job: read and review put the block on the larger window; watch takes the talk there", () => {
  const b = new ScreensBook(null);
  b.hello("main", "whole", { x: 0, y: 0, w: 1512, h: 982 }); b.hello("two", "wall", { x: 1512, y: 0, w: 2560, h: 1440 });
  assert.deepEqual(arrangePlan("review", b.state(), "main", "d1"), { put: { block: "d1", win: "two" }, roles: { two: "wall", main: "whole" } });
  assert.deepEqual(arrangePlan("watch", b.state(), "main")?.talk, { from: "main", to: "two" });
  assert.equal(arrangePlan("as it is", b.state(), "main", "d1"), null);
  b.put("d1", "two");
  assert.equal(arrangePlan("read", b.state(), "main", "d1"), null);   // already there: nothing changes
  b.gone("two");
  assert.equal(arrangePlan("read", b.state(), "main", "x"), null);   // one window: nothing to arrange
});

test("⌘Z within 8 s takes the last crossing back as one step; later, or twice, nothing", () => {
  const b = new ScreensBook(null);
  b.hello("main", "whole"); b.hello("two", "wall");
  b.put("y", "two");
  assert.equal(b.undo(Date.now(), "main"), false);   // a crossing nobody signed is not taken back
  b.by = "main";
  b.put("x", "two");
  assert.equal(b.undo(Date.now(), "main"), true);
  assert.equal(b.state().where.x, undefined);
  assert.equal(b.undo(Date.now(), "main"), false);
  b.talk("main", "two");
  assert.deepEqual(b.state().windows.map((w) => w.role), ["anchor", "stage"]);
  assert.equal(b.undo(Date.now() + 9000, "main"), false);
  assert.equal(b.undo(Date.now(), "main"), true);
  assert.deepEqual(b.state().windows.map((w) => w.role), ["whole", "wall"]);
});

test("the record never answers an inherited key, and a broken file is read as empty: the engine does not stop", async () => {
  const b = new ScreensBook(null);
  b.hello("main"); b.hello("two");
  for (const k of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
    assert.equal(b.recall(k), null);
    assert.equal(drawnOn(b.state(), k), "main");
  }
  const { writeFileSync } = await import("node:fs");
  const home = mkdtempSync(join(tmpdir(), "sol-screens-bad-"));
  writeFileSync(screensFile(home), JSON.stringify({ where: null, open: 3, lay: [1], kept: { p: null, q: { roles: null, where: "x" } }, windows: [{ win: "two", role: "wall", screen: "big" }] }));
  const c = new ScreensBook(screensFile(home));
  assert.deepEqual(c.state().where, {});
  assert.equal(c.recall("p"), null);
  assert.equal(c.recall("q")?.where && Object.keys(c.recall("q")!.where).length, 0);
  c.hello("two"); c.put("x", "two");
  assert.equal(drawnOn(c.state(), "x"), "two");
});

test("the record's maps are capped", () => {
  const b = new ScreensBook(null);
  b.hello("main"); b.hello("two");
  for (let i = 0; i < 600; i++) b.put(`b${i}`, "two");
  assert.ok(Object.keys(b.state().where).length <= 500);
  assert.equal(drawnOn(b.state(), "b599"), "two");
});

test("⌘Z from another window is refused; an arrangement (put + talk) is one step; undo is settled", () => {
  const b = new ScreensBook(null);
  b.hello("main", "whole"); b.hello("two", "wall");
  b.by = "main"; b.put("x", "two");
  assert.equal(b.undo(Date.now(), "two"), false);
  assert.equal(b.undo(Date.now(), "main"), true);
  b.by = "main";
  b.batch(() => { b.put("x", "two"); b.talk("main", "two"); });
  assert.equal(b.undo(Date.now(), "main"), true);
  assert.deepEqual([b.state().where.x, b.state().windows.map((w) => w.role).join(",")], [undefined, "whole,wall"]);
});

test("a window named like a built-in is only ever its own entry", () => {
  const b = new ScreensBook(null);
  b.hello("main", "whole"); b.hello("constructor", "wall");
  b.by = "main"; b.put("x", "constructor");
  assert.equal(drawnOn(b.state(), "x"), "constructor");
  assert.equal(b.undo(Date.now(), "main"), true);
  assert.deepEqual(b.state().windows.map((w) => typeof w.role), ["string", "string"]);
});

test("no message stops the engine: an object where a string or a number is asked, in every handler, is refused or let be", async () => {
  const { p, e, sent, face, say } = engine();
  (p as any).file = "parts/screens.ts"; await part(p); (p as any).file = "";
  await (p as any).starts[0].fn(e);
  const A = face("A"), B = face("B");
  const bad = { toString: 1, valueOf: 1 };
  await say(A, { type: "screens.hello", win: "main", role: bad });
  assert.equal(lastState(sent, "A").refused, "no such role");
  await say(A, { type: "screens.hello", win: "main" });
  await say(B, { type: "screens.hello", win: "two", role: "wall" });
  const types = ["hello", "get", "role", "swap", "put", "gather", "open", "lay", "talk", "where", "follow", "point", "arrange", "arrangeTake", "undo", "jelly", "carry", "keep", "recall"];
  for (const t of types) {
    for (const k of ["win", "role", "a", "b", "block", "blocks", "session", "from", "to", "title", "kind", "ask", "seconds", "presses", "here", "there", "on", "places", "project", "screen", "lines"]) {
      await assert.doesNotReject(Promise.resolve(say(A, { type: `screens.${t}`, [k]: bad, block: k === "block" ? bad : "x", win: k === "win" ? bad : "two" })), `${t} with ${k}`);
    }
  }
  // the engine still answers
  await say(A, { type: "screens.put", block: "y", win: "two" });
  assert.equal(lastState(sent, "B").where.y, "two");
});

test("a socket that says hello under a new name leaves its old window gone; the record keeps at most eight windows", async () => {
  const { p, e, sent, face, say } = engine();
  (p as any).file = "parts/screens.ts"; await part(p); (p as any).file = "";
  await (p as any).starts[0].fn(e);
  const A = face("A"), B = face("B");
  await say(A, { type: "screens.hello", win: "main" });
  await say(B, { type: "screens.hello", win: "two" });
  await say(B, { type: "screens.hello", win: "three" });
  const s = lastState(sent, "A");
  assert.equal(s.windows.find((w: any) => w.win === "two").live, false);
  assert.equal(s.windows.find((w: any) => w.win === "three").live, true);
  const b = new ScreensBook(null);
  for (let i = 0; i < 8; i++) { assert.equal(b.room(`w${i}`), true); b.hello(`w${i}`); }
  assert.equal(b.room("w9"), false);
  b.gone("w3");
  assert.equal(b.room("w9"), true);
  assert.equal(b.state().windows.some((w) => w.win === "w3"), false);
});

test("one bad field never empties the book; a file that will not parse is kept beside it as screens.json.bad", async () => {
  const { writeFileSync, existsSync, readFileSync } = await import("node:fs");
  const home = mkdtempSync(join(tmpdir(), "sol-screens-at-"));
  writeFileSync(screensFile(home), JSON.stringify({ where: { x: "two" }, kept: { p: { roles: { two: "wall" }, where: {}, at: { toString: 1 } } }, windows: [{ win: "two", role: "wall", at: { toString: 1 } }] }));
  const b = new ScreensBook(screensFile(home));
  assert.equal(b.state().where.x, "two");
  assert.equal(b.state().windows[0].at, 0);
  const home2 = mkdtempSync(join(tmpdir(), "sol-screens-bad2-"));
  writeFileSync(screensFile(home2), "{ not json");
  const c = new ScreensBook(screensFile(home2));
  assert.deepEqual(c.state().where, {});
  const { readdirSync } = await import("node:fs");
  const bad = readdirSync(home2).filter((f) => f.startsWith("screens.json.bad-"));
  assert.equal(bad.length, 1);   // kept with the time it was found, so a second bad start never overwrites the first
  assert.equal(readFileSync(join(home2, bad[0]), "utf8"), "{ not json");
  void existsSync;
  // nothing is written over a file that could not be read, this run
  c.hello("main", "whole"); c.put("z", "main");
  assert.equal(readFileSync(screensFile(home2), "utf8"), "{ not json");
  // a window that never said hello writes no layout and opens nothing
  c.lay("ghost", "s1", []); c.open("ghost", "s1");
  assert.deepEqual([Object.keys(c.state().lay), Object.keys(c.state().open)], [[], []]);
});
