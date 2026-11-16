// node --test src/*.test.ts (npm test here): the clean Home's keys and side (#589, home-ux.html, decided 2026-11-02).
import { test } from "node:test";
import assert from "node:assert/strict";
import { route, beside, shortcut, soft, softOpen, SHUT, type At, type Place, type Soft, type SoftEv } from "./home/keys.ts";
import { sideOf, wideOf, layoutOf, DAY, type Row, type St } from "./home/sideRows.ts";

const three: Place[] = ["side", "talk", "pane"];
const two: Place[] = ["side", "talk"];
const go = (k: Parameters<typeof route>[0], at: At, places = three, wide = false) => route(k, at, { places, wide });

test("the arrows move between the places that show, never past the edge", () => {
  assert.equal(beside(three, "talk", 1), "pane");
  assert.equal(beside(two, "talk", 1), null);
  assert.equal(beside(["talk", "pane"], "talk", -1), null);   // talk alone with a pane: no side to go to
  assert.deepEqual(go("left", { level: "place", place: "talk" }), { do: "place", to: "side" });
  assert.deepEqual(go("right", { level: "thing", place: "talk", kind: "message" }, two), { do: "none" });
});

test("the trip on the page, key by key", () => {
  // Esc: typing in the bar, Esc leaves it (the words stay: the adapter only moves the focus)
  assert.deepEqual(go("esc", { level: "typing", empty: false }), { do: "out" });
  // ←: to the side, on the session you're in
  assert.deepEqual(go("left", { level: "thing", place: "talk", kind: "bar" }), { do: "place", to: "side" });
  // ↓ ↓: down the rows
  assert.deepEqual(go("down", { level: "thing", place: "side", kind: "session" }), { do: "step", by: 1 });
  // Enter: the session opens in the talk
  assert.deepEqual(go("enter", { level: "thing", place: "side", kind: "session" }), { do: "open" });
  // → Enter: onto "yes" inside the card; Enter is the button's own
  assert.deepEqual(go("enter", { level: "thing", place: "talk", kind: "card" }), { do: "in" });
  assert.deepEqual(go("right", { level: "inside", place: "talk", kind: "card" }), { do: "inner", by: 1 });
  assert.deepEqual(go("enter", { level: "inside", place: "talk", kind: "card" }), { do: "pass" });
  // Esc, Esc: back up to the card, then the talk; never to the start
  assert.deepEqual(go("esc", { level: "inside", place: "talk", kind: "card" }), { do: "out" });
  assert.deepEqual(go("esc", { level: "thing", place: "talk", kind: "card" }), { do: "out" });
  assert.deepEqual(go("esc", { level: "place", place: "talk" }), { do: "none" });
});

test("typing wins in the bar; ↑ in an empty bar steps up into the messages", () => {
  for (const k of ["left", "right", "down", "enter"] as const) assert.deepEqual(go(k, { level: "typing", empty: false }), { do: "pass" });
  assert.deepEqual(go("up", { level: "typing", empty: false }), { do: "pass" });
  assert.deepEqual(go("up", { level: "typing", empty: true }), { do: "bar-up" });
  assert.deepEqual(go("enter", { level: "thing", place: "talk", kind: "bar" }), { do: "type" });
});

test("right means in: a folder opens and closes, a session goes into the talk", () => {
  assert.deepEqual(go("right", { level: "thing", place: "side", kind: "folder", open: false }), { do: "fold", open: true });
  assert.deepEqual(go("left", { level: "thing", place: "side", kind: "folder", open: true }), { do: "fold", open: false });
  assert.deepEqual(go("right", { level: "thing", place: "side", kind: "folder", open: true }), { do: "place", to: "talk" });
  assert.deepEqual(go("right", { level: "thing", place: "side", kind: "session" }), { do: "place", to: "talk" });
  assert.deepEqual(go("enter", { level: "thing", place: "side", kind: "head" }), { do: "press" });
});

test("a page in the pane takes the keys; Esc brings them back", () => {
  assert.deepEqual(go("left", { level: "inside", place: "pane", kind: "pane" }), { do: "pass" });
  assert.deepEqual(go("esc", { level: "inside", place: "pane", kind: "pane" }), { do: "out" });
});

test("the side opened wide: Esc goes back to where you were, Enter opens", () => {
  assert.deepEqual(go("esc", { level: "thing", place: "side", kind: "session" }, ["side"], true), { do: "unwide" });
  assert.deepEqual(go("esc", { level: "place", place: "side" }, ["side"], true), { do: "unwide" });
  assert.deepEqual(go("right", { level: "thing", place: "side", kind: "session" }, ["side"], true), { do: "open" });
});

const now = 1_800_000_000_000;
const r = (id: string, o: Partial<Row> = {}): Row => ({ id, title: id, cwd: "/w/sol", project: "/w/sol", updatedAt: now - 1000, ...o });
const states: Record<string, St> = { run: "running", ask: "needs" };
const st = (x: Row) => states[x.id] ?? (x.done ? "done" : "");

test("the side: folders newest first, done today for a day, then gone unless pinned", () => {
  const rows = [
    r("a", { updatedAt: now - 5000 }), r("run", { updatedAt: now - 100 }), r("k", { project: "/w/kaat", cwd: "/w/kaat", updatedAt: now - 9000 }),
    r("fin", { done: true, updatedAt: now - 2 * 3600e3 }), r("old-fin", { done: true, updatedAt: now - 2 * DAY }),
    r("kept", { done: true, pinned: true, updatedAt: now - 3 * DAY }), r("ancient", { updatedAt: now - 30 * DAY }),
    r("ask", { updatedAt: now - 30 * DAY }), r("bin", { archived: true }),
  ];
  const s = sideOf(rows, st, now);
  assert.deepEqual(s.folders.map((f) => f.name), ["sol", "kaat"]);
  assert.deepEqual(s.folders[0].rows.map((x) => x.id), ["run", "a", "kept", "ask"]);
  assert.deepEqual(s.doneToday.map((x) => x.id), ["fin"]);
  // the wide side still finds what left the narrow one
  assert.deepEqual(wideOf(rows, st, "done").map((x) => x.id), ["bin", "fin", "old-fin", "kept"]);
  assert.deepEqual(wideOf(rows, st, "needs").map((x) => x.id), ["ask"]);
});

test("the five layouts", () => {
  assert.equal(layoutOf(true, false, false), 1);
  assert.equal(layoutOf(false, false, false), 2);
  assert.equal(layoutOf(true, true, false), 3);
  assert.equal(layoutOf(false, true, false), 4);
  assert.equal(layoutOf(true, true, true), 5);
});

test("only ⌘N and ⌘K are shortcuts: ⌘\\ and ⌘, do nothing", () => {
  assert.equal(shortcut({ meta: true, key: "n" }), "fresh");
  assert.equal(shortcut({ meta: true, key: "K" }), "jump");
  assert.equal(shortcut({ meta: true, key: "\\" }), null);
  assert.equal(shortcut({ meta: true, key: "," }), null);
  assert.equal(shortcut({ meta: true, shift: true, key: "n" }), null);
  assert.equal(shortcut({ meta: false, key: "n" }), null);
});

test("the folded side soft-opens at the left edge and soft-closes when the cursor moves away", () => {
  const run = (...evs: SoftEv[]) => evs.reduce<Soft>(soft, SHUT);
  assert.equal(softOpen(SHUT), false);
  assert.equal(softOpen(run("edge")), true);                    // the cursor at the window's left edge
  assert.equal(softOpen(run("edge", "enter")), true);           // ...onto the side itself
  assert.equal(softOpen(run("edge", "enter", "leave")), false); // ...and away: it closes
  assert.equal(softOpen(run("keys")), true);                    // ← from the talk lands on it
  assert.equal(softOpen(run("keys", "blur")), false);           // the focus leaves: it closes
  assert.equal(softOpen(run("keys", "edge", "leave")), true);   // the keys still hold it while the cursor passes
  assert.equal(softOpen(run("edge", "keys", "blur")), true);    // the cursor still holds it after the focus leaves
});

test("with the side folded, ← from the talk still lands on the side", () => {
  const act = go("left", { level: "thing", place: "talk", kind: "message" }, ["side", "talk"]);
  assert.deepEqual(act, { do: "place", to: "side" });
});
