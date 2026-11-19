// node --test src/*.test.ts: which views a Sol shows (#1637, Frank 2026-11-19). A tester's Sol is Build only; Home,
// Cowork and Social come when each card reaches product. The engine says each switch's reading (settings.window); the
// link and the console's storage win over it; an engine that says nothing keeps all four, as before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { orderOf, saidOf, shownView, viewsOn } from "./spine/views.ts";

const kv = (o: Record<string, string> = {}) => ({ getItem: (k: string) => (k in o ? o[k] : null) });
const ids = (s: Set<string>) => [...s].sort();
const TESTER = { "view.home": false, "view.cowork": false, "view.social": false };
const TEAM = { "view.home": true, "view.cowork": true, "view.social": true };

test("what the engine sent: nothing yet, no window block (an older engine, a stub), or the three", () => {
  assert.equal(saidOf(null), null);
  assert.equal(saidOf(undefined), null);
  assert.equal(saidOf({}), "none");
  assert.equal(saidOf({ window: { cross: true } }), "none", "a block that names none of the three is an engine before #1637");
  assert.deepEqual(saidOf({ window: { ...TESTER, cross: true } }), TESTER);
  assert.equal(saidOf({ window: [] as unknown }), "none");
  assert.equal(saidOf({ window: null }), null, "the engine does not know its mode yet: not said, never all off");
});

test("a tester's Sol (product): Build alone; the team's (concept): all four", () => {
  assert.deepEqual(ids(viewsOn(TESTER, "", kv())), ["build"]);
  assert.deepEqual(ids(viewsOn(TEAM, "", kv())), ["build", "cowork", "home", "social"]);
  assert.deepEqual(ids(viewsOn({ ...TESTER, "view.home": true }, "", kv())), ["build", "home"], "a card at product comes on by itself");
});

test("an engine that sends no reading, or none yet, keeps all four, as before the switches", () => {
  assert.deepEqual(ids(viewsOn("none", "", kv())), ["build", "cowork", "home", "social"]);
  assert.deepEqual(ids(viewsOn(null, "", kv())), ["build", "cowork", "home", "social"]);
});

test("the zip's first run, before the engine says: Build alone, so nothing shows to someone it may not be for", () => {
  assert.deepEqual(ids(viewsOn(null, "?firstrun=1", kv())), ["build"]);
  assert.deepEqual(ids(viewsOn(TEAM, "?firstrun=1", kv())), ["build", "cowork", "home", "social"], "once it says, it is believed");
});

test("an engine that restarts and does not know its mode yet keeps the team's four, from what was kept", () => {
  const kept = kv({ "sol.views": JSON.stringify(TEAM) });
  assert.deepEqual(ids(viewsOn(saidOf({ window: null }), "", kept)), ["build", "cowork", "home", "social"]);
});

test("before the engine says, the window draws what it kept from the last answer", () => {
  const kept = kv({ "sol.views": JSON.stringify(TESTER) });
  assert.deepEqual(ids(viewsOn(null, "", kept)), ["build"]);
  assert.deepEqual(ids(viewsOn(TEAM, "", kept)), ["build", "cowork", "home", "social"], "the engine's answer wins over what was kept");
  assert.deepEqual(ids(viewsOn(null, "", kv({ "sol.views": "{not json" }))), ["build", "cowork", "home", "social"], "a kept value that does not parse is none");
});

test("the link wins for one load, then the console's storage, over the engine", () => {
  assert.deepEqual(ids(viewsOn(TESTER, "?view.home=on", kv())), ["build", "home"]);
  assert.deepEqual(ids(viewsOn(TEAM, "?view.cowork=off", kv())), ["build", "home", "social"]);
  assert.deepEqual(ids(viewsOn(TESTER, "", kv({ "view.social": "1" }))), ["build", "social"]);
  assert.deepEqual(ids(viewsOn(TEAM, "?view.home=on", kv({ "view.home": "0" }))), ["build", "cowork", "home", "social"], "the link over storage");
});

test("the spine's order is kept, and a view that is off goes to Build", () => {
  assert.deepEqual(orderOf(new Set(["social", "build", "home"])), ["home", "build", "social"]);
  const tester = viewsOn(TESTER, "", kv());
  for (const v of ["home", "cowork", "social"] as const) assert.equal(shownView(v, tester), "build", v);
  assert.equal(shownView("build", tester), "build");
  assert.equal(shownView("cowork", viewsOn(TEAM, "", kv())), "cowork");
});
