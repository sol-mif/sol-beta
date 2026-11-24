// node --test src/*.test.ts: the carry (harmony S26, #1615; next/cv/carry.ts): where you were is kept per place and per
// distance. Coming back to Middle of a place lands on the face last focused there; closing the window zooms out past Far
// and pressing the place's glance card lands where you were, at its distance and on its face; next.where is the message
// slice 7's wire will send, through one stub, live only; the drafts' keys leave the shell's own fields out.
// Signed: marcocyl04-ux's agent, port slice S26 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import {
  arrive, cardOf, faceOf, freshCarry, inputKey, install, note, placeKey, reopen, shownIn, whereKey, whereMsg, wireWhere, type Carry, type WhereMsg,
} from "./next/cv/carry.ts";

const carry = install(CV);
const C = (): Carry => (CV.S as unknown as { carry: Carry }).carry;
/** a folder with at least n pieces shown at Middle */
const folderWith = (n: number) => CV.D.regions.find((r) => shownIn(CV.D, r.id).length >= n)!.id;

test("the keys: a place is a folder, Far, Needs or a page; a folder keeps one Where per distance", () => {
  const s = { page: null, region: "api", dist: "middle" as const };
  assert.equal(placeKey(s), "api");
  assert.equal(whereKey(s), "api|middle");
  assert.equal(whereKey({ ...s, dist: "near" }), "api|near");
  assert.equal(whereKey({ ...s, dist: "far", region: null }), "far");
  assert.equal(whereKey({ ...s, dist: "needs" }), "needs");
  assert.equal(whereKey({ ...s, page: "settings" }), "page:settings");
});

test("install is once per store, and gives the moves closeWindow and glance", () => {
  assert.equal(install(CV), carry);
  assert.equal(typeof CV.M.closeWindow, "function");
  assert.equal(typeof CV.M.glance, "function");
});

test("one set of moves (count 13): the carry's two moves meet an AI's function, and an AI that calls them is refused", () => {
  CV.load("dev-morning");
  const A = (CV.hooks as unknown as { agent: { MOVE_FN: Record<string, string>; PERSON_ONLY: Record<string, string>; call(ai: string, fn: string, args: object): { gate: string } } }).agent;
  assert.equal(A.MOVE_FN.closeWindow, "look"); assert.equal(A.MOVE_FN.glance, "point");
  const s0 = CV.snap();
  for (const m of ["closeWindow", "glance"]) assert.equal(A.call("probe", m, {}).gate, "refused", m);
  assert.equal(CV.snap(), s0, "nothing moved");
});

test("coming back to Middle of a place lands on the face last focused there", () => {
  for (const name of ["dev-morning", "jayden", "denise", "minji"]) {
    CV.load(name);
    const r = folderWith(3), ids = shownIn(CV.D, r);
    assert.ok(CV.M.goto(r).ok, `${name}: to ${r}`);
    CV.M.choose(2);
    assert.equal(faceOf(CV.D, CV.S), ids[2], `${name}: the third face chosen`);
    CV.M.map();
    assert.equal(CV.S.dist, "far");
    assert.ok(CV.M.dive(r).ok);
    assert.equal(CV.S.region, r);
    assert.equal(faceOf(CV.D, CV.S), ids[2], `${name}: back on the same face, though dive chose the first`);
    // from Near, out lands on the piece you came from
    CV.M.dive(ids[1]);
    assert.equal(CV.S.piece, ids[1]);
    CV.M.out();
    assert.equal(faceOf(CV.D, CV.S), ids[1], `${name}: one step out of Near lands on the piece you were in`);
    CV.M.map();
    assert.equal(faceOf(CV.D, CV.S), r, `${name}: and out of Middle, on its folder at Far`);
  }
});

test("closing the window zooms out past Far; the place's card brings back the distance, the piece and the pane", () => {
  CV.load("dev-morning");
  const r = folderWith(2), p = shownIn(CV.D, r)[1];
  CV.M.goto(p);
  CV.S.pane = "terminal"; CV.render();
  assert.equal(cardOf(CV.S), r);
  const shut = CV.M.closeWindow();
  assert.ok(shut.ok); assert.equal(shut.id, r);
  assert.equal(C().closed, true);
  assert.equal(CV.S.dist, "far");
  assert.equal(CV.M.closeWindow().ok, false, "a closed window closes once");
  const back = CV.M.glance(r);
  assert.ok(back.ok);
  assert.deepEqual([CV.S.dist, CV.S.region, CV.S.piece, CV.S.pane], ["near", r, p, "terminal"]);
  assert.equal(C().closed, false);
  back.undo();
  assert.equal(C().closed, true, "its undo closes it again");
  assert.equal(CV.M.glance("no-such-place").ok, false);
});

test("twenty trips keep the place and the focused face (count 42's rule, without the DOM)", () => {
  CV.load("dev-morning");
  const rs = CV.D.regions.filter((x) => shownIn(CV.D, x.id).length).map((x) => x.id), kept: Record<string, [string, string | null]> = {};
  let seed = 7, ok = 0;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let i = 0; i < 20; i++) {
    const r = rs[rnd(rs.length)];
    CV.M.goto(r);
    const ids = shownIn(CV.D, r);
    if (rnd(2)) CV.M.choose(rnd(ids.length)); else CV.M.dive(ids[rnd(ids.length)]);
    kept[r] = [CV.S.dist, faceOf(CV.D, CV.S)];
    CV.M.closeWindow();
    const back = Object.keys(kept)[rnd(Object.keys(kept).length)];
    CV.M.glance(back);
    if (CV.S.region === back && CV.S.dist === kept[back][0] && faceOf(CV.D, CV.S) === kept[back][1]) ok++;
  }
  assert.equal(ok, 20);
});

test("a fresh scenario starts a fresh carry", () => {
  CV.load("dev-morning");
  CV.M.goto(folderWith(1));
  assert.ok(Object.keys(C().by).length >= 2);
  CV.load("jayden");
  assert.deepEqual(Object.keys(C().by), ["far"]);
});

test("the pure rules: note, arrive and reopen on a carry of their own", () => {
  CV.load("denise");
  const c = freshCarry(), r = folderWith(2), ids = shownIn(CV.D, r);
  const s = { ...CV.S, dist: "middle" as const, region: r, sel: 1 };
  assert.equal(note(c, CV.D, s).face, ids[1]);
  assert.equal(c.last[r], `${r}|middle`);
  assert.equal(arrive(c, CV.D, { ...s, sel: 0 }), 1);
  assert.equal(arrive(c, CV.D, { ...s, region: "elsewhere" }), null, "nothing kept for a place never seen");
  assert.equal(arrive(c, CV.D, { ...s, sel: 0 }, { ...c.by[`${r}|middle`], dist: "near", piece: ids[2] ?? ids[0] }), ids[2] ? 2 : 0, "out of Near: the piece you were in");
  assert.deepEqual(reopen(c, CV.D, r), { dist: "middle", region: r, piece: null, beside: null, part: null, page: null });
  note(c, CV.D, { ...s, dist: "near", piece: ids[0], pane: "doc" });
  assert.equal(reopen(c, CV.D, r)?.piece, ids[0]);
  delete CV.D.pieces[ids[0]];
  assert.equal(reopen(c, CV.D, r)?.dist, "middle", "a piece gone lands at its folder's Middle");
  assert.equal(reopen(c, CV.D, "nowhere"), null);
});

test("next.where: dist, region, piece, pause, and the place's scroll, selection and draft; sent live only, through the stub", () => {
  CV.load("dev-morning");
  const r = folderWith(1);
  CV.M.goto(r);
  const w = C().by[`${r}|middle`];
  w.draft["say:x"] = "half a sen"; w.scroll["#view"] = 120; w.selection = { key: "say:x", start: 4, end: 4 };
  const m = whereMsg(C(), CV.S);
  assert.deepEqual(m, { t: "next.where", dist: "middle", region: r, piece: null, pause: false, scroll: { "#view": 120 }, selection: { key: "say:x", start: 4, end: 4 }, draft: { "say:x": "half a sen" } });
  const sent: WhereMsg[] = [];
  const off = wireWhere((x) => sent.push(x));
  CV.M.map();
  assert.equal(sent.length, 0, "the fixture sends nothing");
  CV.setMode("live");
  try {
    CV.M.goto(r);
    CV.M.closeWindow();
    assert.deepEqual(sent.map((x) => [x.dist, x.region, x.pause]), [["middle", r, false], ["far", null, true]]);
  } finally { CV.setMode("fixture"); off(); }
});

test("an input's key: its id, the piece it talks to, its label; the shell's own fields are never carried", () => {
  assert.equal(inputKey({ id: "st-find" }), "#st-find");
  assert.equal(inputKey({ pid: "p1", label: "Talk to Ada" }), "say:p1");
  assert.equal(inputKey({ label: "Write in the diary" }), "aria:Write in the diary");
  assert.equal(inputKey({ id: "say" }), null);
  assert.equal(inputKey({ id: "gq" }), null);
  assert.equal(inputKey({ id: "pw", type: "password" }), null);
  assert.equal(inputKey({}), null);
});
