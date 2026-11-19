// node --test src/*.test.ts: the seat opens a Settings drawer or a pane for the person (#1521, spine/openFor.ts). The
// engine's word is read strictly; Settings and panes are Build's, so another view hops to Build first; and only the
// window the person looks at opens it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { looking, openForOf, openPlan } from "./spine/openFor.ts";

test("the engine's word: a drawer or a pane by its id, nothing else", () => {
  assert.deepEqual(openForOf({ type: "open.for", what: "settings", drawer: "look" }), { what: "settings", drawer: "look" });
  assert.deepEqual(openForOf({ what: "pane", button: "action-board" }), { what: "pane", button: "action-board" });
  for (const bad of [null, "look", {}, { what: "settings" }, { what: "settings", drawer: "<b>" }, { what: "pane", button: 3 }, { what: "run", button: "x" }])
    assert.equal(openForOf(bad), null, JSON.stringify(bad));
});

test("from Build it opens in place; from Home it hops to Build, and Settings closes back to Home", () => {
  assert.deepEqual(openPlan("build", { what: "settings", drawer: "look" }), { hop: null, back: null, event: "sol:settings", detail: "look" });
  assert.deepEqual(openPlan("home", { what: "settings", drawer: "voice" }), { hop: "build", back: "home", event: "sol:settings", detail: "voice" });
  assert.deepEqual(openPlan("home", { what: "pane", button: "changes" }), { hop: "build", back: null, event: "sol:pane", detail: "changes" });
  assert.deepEqual(openPlan("build", { what: "pane", button: "changes" }), { hop: null, back: null, event: "sol:pane", detail: "changes" });
});

test("only the window in sight opens it", () => {
  assert.equal(looking({ visibilityState: "visible" }), true);
  assert.equal(looking({ visibilityState: "hidden" }), false);
});
