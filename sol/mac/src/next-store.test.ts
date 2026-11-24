// node --test src/*.test.ts: the new face's store (#1604, next/cv): the mockup's names, every scenario loads at its start,
// the shared moves answer { ok, id, undo }, a "no" move is held back live, the talk pill's chain makes the moves.
// Signed: marcocyl04-ux's agent, the port's prep (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import { FIXTURE } from "./next/cv/fixture.ts";

test("every scenario of the mockup loads, at its start, with the panel's people", () => {
  assert.deepEqual(Object.keys(FIXTURE), ["dev-morning", "dev-landed", "dev-focus", "dev-week", "loop", "p1", "jayden", "denise", "denise11", "minji", "stress", "thirty", "fresh", "dev-runs", "ai-night"]);
  for (const name of Object.keys(FIXTURE)) {
    assert.ok(CV.load(name), name);
    assert.equal(CV.SCN, name);
    assert.equal(CV.MODE, "fixture");
    const st = FIXTURE[name].start;
    assert.equal(CV.S.dist, st === "far" ? "far" : st.region ? "middle" : "near", name);
    for (const a of Object.values(CV.D.asks)) assert.ok(CV.D.pieces[a.piece], `${name}: ask ${a.id} on a piece`);
  }
  CV.load("dev-morning");
  assert.equal(CV.open().length, 10);
  assert.equal(CV.sessions().length, 8);
  assert.equal(CV.working(), 8);
  assert.deepEqual(CV.folderOrder(), ["api", "web", "infra", "cli", "home", "money", "health"], "one list of folders in the canvas's reading order, no zones (BR1)");
  assert.equal(CV.D.routines?.filter((r) => r.ai === "Ada").length, 2);
});

test("the shared moves go, count and undo; the next ask is brought to the line or opened at Near", () => {
  CV.load("dev-morning");
  const r = CV.M.goto("api");
  assert.equal(r.ok, true);
  assert.equal(CV.S.dist, "middle");
  assert.equal(CV.S.region, "api");
  assert.equal(CV.S.c.moves, 1);
  r.undo();
  assert.equal(CV.S.dist, "far");
  CV.load("dev-morning");
  const n = CV.M.next();   // a1 is serious: it opens its piece at Near
  assert.equal(n.id, "a1");
  assert.equal(CV.S.dist, "near");
  assert.equal(CV.S.piece, "s-Kai");
  assert.equal(CV.answer("a1"), true, "a serious ask is answered with its evidence in front");
  CV.M.map();
  CV.M.next();
  assert.equal(CV.S.askLine, "a2", "an in-place ask comes to the line");
  assert.equal(CV.say("yes")?.ok, true);
  assert.equal(CV.D.asks.a2.answered, true);
  assert.equal(CV.say("go to infra")?.ok, true);
  assert.equal(CV.S.region, "infra");
  assert.equal(CV.say("blue whales"), null);
  assert.equal(CV.act("page:ais").ok, true);
  assert.equal(CV.S.page, "ais");
});

test("live, a move whose engine row is no is held back until a wire says the engine has it; the fixture runs it", () => {
  assert.ok(CV.NOT_YET.has("place") && CV.NOT_YET.has("write") && CV.NOT_YET.has("withdraw"));
  CV.setMode("live");
  try {
    assert.equal(CV.isReady("place"), false);
    assert.equal(CV.isReady("goto"), true, "a move with a yes row runs live");
    assert.deepEqual({ ...CV.notYet(), undo: null }, { ok: false, why: "not yet", undo: null });
    CV.ready("place");
    assert.equal(CV.isReady("place"), true);
  } finally { CV.setMode("fixture"); }
  assert.equal(CV.isReady("write"), true);
});
