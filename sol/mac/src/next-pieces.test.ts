// node --test src/*.test.ts: Your own pieces (slice 12 of the port, #1615; merge/pieces.js): the rules on their own
// state (what is drawn, the update's line, a failing proposal never used, set all aside and its exact undo, Find's
// "something's off"), then the moves on the fixture (a proposal under the headline, use, the way that passes, each
// change one Diary line), the talk pill's chain, and live: every move but see_pieces is "not yet" and nothing is drawn.
// Signed: marcocyl04-ux's agent, port slice 12 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { allLines } from "./next/diary/book.ts";
import {
  PEOPLE, asideAll, canUse, clear, freshSt, hits, hitsFor, isDrawn, list, listOf, me, st, stateOf, undoAll, updateLine, yoursIn,
} from "./next/pieces/model.ts";
import { provider } from "./next/pieces/extra.ts";
import { EXTRA } from "./next/people/extra.ts";

const lines = () => allLines().filter((l) => !l.removed).length;

test("the rules: in use is drawn, the update's line counts what came along, set aside and remade", () => {
  const s = freshSt(), dev = PEOPLE.Dev, mj = PEOPLE["Min-ji"];
  assert.deepEqual(listOf(dev, s).filter((x) => isDrawn(x, s)).map((x) => x.id), ["rk", "ship", "board"], "remade is drawn too");
  assert.deepEqual(listOf(mj, s).filter((x) => isDrawn(x, s)).map((x) => x.id), ["client", "figma"], "set aside is not");
  assert.equal(updateLine(dev, s), "2 of your 3 pieces came along as they were, 1 remade.");
  assert.equal(updateLine(mj, s), "2 of your 3 pieces came along as they were, 1 set aside.");
  assert.equal(updateLine(PEOPLE.Jayden, s), "Nothing of yours to carry.");
  s.pc.board = "sols";
  assert.equal(isDrawn(dev.pieces[2], s), false, "Sol's in use: yours rests, not drawn");
});

test("a failing proposal is never used, its way that passes is", () => {
  assert.equal(canUse(PEOPLE.Jayden.ask, false), false);
  assert.equal(canUse(PEOPLE.Jayden.ask, true), true);
  assert.equal(canUse(PEOPLE.Dev.ask, false), true);
});

test("set all aside puts every piece to Sol's; undo restores each exactly, untouched ones untouched", () => {
  const s = freshSt(), xs = listOf(PEOPLE.Dev, s);
  s.pc.rk = "last";
  const before = JSON.stringify(s.pc);
  assert.equal(asideAll(xs, s), true);
  assert.ok(xs.every((x) => stateOf(x, s) === "sols"));
  assert.equal(asideAll(xs, s), false, "once: it is aside already");
  assert.equal(undoAll(s), true);
  assert.equal(JSON.stringify(s.pc), before, "exactly: rk back to last, the others with no state of their own");
  assert.equal(undoAll(s), false);
  assert.equal(asideAll([], freshSt()), false, "nothing of yours: nothing to set aside");
});

test("Find: something's off offers set all aside, only to someone with pieces", () => {
  assert.equal(hitsFor("something’s off", true, 3)[0].r6, "off");
  assert.equal(hitsFor("something’s off", true, 3)[0].row, "all");
  assert.equal(hitsFor("this looks wrong", true, 1)[0].r6, "off");
  assert.equal(hitsFor("something’s off", true, 0)[0].l, "Your own pieces", "nothing of yours to set aside: the page itself");
  assert.deepEqual(hitsFor("something’s off", false, 0), []);
  assert.equal(hitsFor("my custom keys", true, 2)[0].l, "Your own pieces");
  assert.deepEqual(hitsFor("dark mode", true, 2), []);
});

test("the moves on the fixture: proposed under the headline, used, one Diary line each; Jayden's only by the way that passes", () => {
  clear(); CV.load("dev-morning");
  assert.equal(me(), PEOPLE.Dev);
  CV.M.goto("api");
  assert.equal(CV.say("a key that runs /ship in the repo I’m in")?.ok, true, "the talk pill proposes it");
  assert.equal(CV.S.dist, "far", "at Far, under the headline");
  assert.equal(st().prop?.state, "proposed");
  const l0 = lines();
  assert.equal(CV.M.use_piece("use").ok, true);
  assert.ok(list().some((x) => x.id === "shipkey"));
  assert.deepEqual(yoursIn("api").map((x) => x.id), ["rk", "ship", "shipkey"]);
  assert.equal(lines(), l0 + 1, "one Diary line");
  const d = CV.M.set_pieces_aside();
  assert.equal(d.ok, true); assert.equal(yoursIn("api").length, 0);
  assert.equal(lines(), l0 + 2);
  assert.equal(CV.M.set_pieces_aside(true).ok, true); assert.equal(yoursIn("api").length, 3);

  clear(); CV.load("jayden");
  assert.equal(CV.M.propose_piece("hide the Needs you count, it stresses me out").ok, true);
  const n0 = list().length;
  assert.equal(CV.M.use_piece("use").ok, false, "a failing piece is never added");
  assert.equal(list().length, n0);
  assert.equal(CV.M.use_piece("alt").ok, true);
  assert.equal(CV.M.use_piece("use").ok, true);
  assert.equal(list().length, n0 + 1);
  clear();
});

test("the chain: other words pass on untouched; a piece persists across a load, as a setting does", () => {
  clear(); CV.load("denise");
  assert.equal(CV.M.propose_piece("go to kids").ok, false, "words that are not the ask propose nothing");
  assert.equal(CV.say("Mia’s things at the top in the morning")?.ok, true);
  CV.M.use_piece("use");
  CV.load("denise");
  assert.ok(list().some((x) => x.id === "miafirst"), "kept across a load");
  clear(); CV.load("dev-morning");
});

test("the provider asks nothing, and is not in the queue unless the join registers it", () => {
  assert.deepEqual(provider.items(), []);
  assert.ok(!EXTRA.includes(provider));
});

test("live: no pieces, and every move but see_pieces is not yet", () => {
  clear(); CV.load("dev-morning");
  CV.setMode("live");
  try {
    assert.equal(me(), null);
    assert.deepEqual(list(), []);
    assert.deepEqual(hits("something’s off"), []);
    for (const m of ["propose_piece", "use_piece", "piece_state", "set_pieces_aside"]) assert.equal(CV.M[m]("x").why, "not yet", m);
  } finally { CV.setMode("fixture"); CV.load("dev-morning"); }
});
