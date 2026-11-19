// node --test src/*.test.ts: the plane by rule (#1615, slice 1; next/plane/layout.ts, next/cv/moves/plane.ts, wire, say):
// the zones side by side with every folder in the zone of its kind, nothing over anything, the bands by size on screen,
// the camera at Far and Middle, an AI's piece lands in the Diary, a full folder grows, a new folder goes under its zone's
// last, the person's moves answer { ok, id, undo } and are held back live where the engine cannot do them yet, the wire
// reads today's messages, and the phrases make the moves.
// Signed: marcocyl04-ux's agent, the port's slice 1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import * as L from "./next/plane/layout.ts";
import { fromPlaces, fromSessions } from "./next/cv/wire/plane.ts";

const things = () => Object.entries(CV.D.pos!).filter(([id]) => L.isThing(id));

test("the first layout: three zones side by side, each folder in the zone of its kind, nothing over anything", () => {
  for (const name of ["dev-morning", "jayden", "denise", "minji", "thirty", "fresh"]) {
    CV.load(name);
    const Z = CV.D.zones!;
    assert.ok(Z.diary.x + Z.diary.w <= Z.build.x && Z.build.x + Z.build.w <= Z.life.x, `${name}: Diary · Build · Life, left to right`);
    for (const r of CV.D.regions) assert.equal(L.zoneOf(r.id), L.homeOf(r.id), `${name}: ${r.id} in its zone`);
    const rs = CV.D.regions.map((r) => CV.D.pos![r.id]);
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) assert.ok(!L.overlaps(rs[i], rs[j]), `${name}: folders ${i} and ${j} apart`);
    for (const p of Object.values(CV.D.pieces)) {
      const q = CV.D.pos![p.id];
      if (!q) { assert.ok(p.inside || p.kind === "arrivals", `${name}: ${p.id} has a place`); continue; }
      const R = CV.D.pos![p.region];
      assert.ok(q.x >= R.x && q.x + q.w <= R.x + R.w && q.y >= R.y && q.y + q.h <= R.y + R.h, `${name}: ${p.id} inside its folder`);
      assert.equal(q.by, "rule");
    }
  }
  CV.load("dev-morning");
  assert.deepEqual(L.zoneOrderOnPlane(), CV.zoneOrder(), "the sidebar's order is the plane's");
});

test("a folder gets exactly the rows it fills; a split's parts are never pieces of their own", () => {
  CV.load("thirty");
  assert.equal(L.regionCols(31), 6);
  assert.equal(L.onPlane("api").length, 31);
  assert.ok(!Object.keys(CV.D.pos!).some((id) => id.startsWith("s-split.")));
  const box = L.regionBox("api");
  assert.equal(box.w, 6 * L.CELL_W - (L.CELL_W - L.PIECE_W) + 2 * L.PAD);
  assert.equal(box.h, 6 * L.CELL_H - (L.CELL_H - L.PIECE_H) + L.PAD_T + L.PAD);
});

test("the band is a piece's size on screen, never a zoom number; zooming never enters Near", () => {
  assert.equal(L.bandOf(L.BAND_PX / L.PIECE_W - 0.001), "far");
  assert.equal(L.bandOf(L.BAND_PX / L.PIECE_W), "middle");
  CV.load("dev-morning");
  assert.equal(CV.S.dist, "far");
  assert.ok(L.PIECE_W * CV.S.cam.z < L.BAND_PX, "Far fits below the band");
  CV.M.goto("api");
  assert.equal(CV.S.dist, "middle");
  assert.ok(L.PIECE_W * CV.S.cam.z >= L.BAND_PX, "Middle at or above it");
  for (let i = 0; i < 30; i++) CV.M.zoom(L.ZSTEP);
  assert.notEqual(CV.S.dist, "near");
  assert.equal(CV.S.cam.z, L.ZMAX);
});

test("pan and zoom move the camera only: no history step, no move counted, the folder follows the camera", () => {
  CV.load("dev-morning");
  CV.M.goto("api");
  const moves = CV.S.c.moves, hist = CV.S.hist.length, pos = JSON.stringify(CV.D.pos);
  const r = CV.M.pan(-400, 0);
  assert.equal(r.ok, true);
  assert.equal(CV.S.c.moves, moves);
  assert.equal(CV.S.hist.length, hist);
  assert.equal(JSON.stringify(CV.D.pos), pos);
  r.undo();
  assert.equal(CV.S.region, "api");
  for (let i = 0; i < 12; i++) CV.M.zoom(1 / L.ZSTEP);
  assert.equal(CV.S.dist, "far");
  assert.equal(CV.S.region, null);
});

test("Far shows every card whole or names the zone at its edge; the chips' presses go there", () => {
  CV.load("dev-morning");
  for (const k of L.ZONES) assert.equal(L.edge(k), "whole", k);
  const d = CV.M.toDiary();
  assert.equal(d.ok, true);
  assert.equal(CV.S.dist, "far");
  d.undo();
  CV.M.zoom(3);   // closer: a zone goes past an edge
  if (CV.S.dist === "far") {
    const off = L.ZONES.find((k) => L.edge(k) !== "whole");
    if (off) { assert.equal(CV.M.toZone(off).ok, true); assert.notEqual(L.zoneCam(off), null); }
  }
});

test("an AI places in the Diary only, unless the person asked; the person's places never move", () => {
  CV.load("dev-morning");
  CV.D.pieces.note = { id: "note", region: "api", kind: "doc", name: "a note", by: "Ada" };
  assert.equal(L.put("note", L.spotForRegion("api"), "ai"), true);
  assert.equal(L.zoneOf("note"), "diary");
  assert.equal(L.isNew("note"), true);
  L.touch("note");
  assert.equal(L.isNew("note"), false);
  const q = { ...CV.D.pos!["note"] };
  CV.D.pos!["note"].by = "person";
  assert.equal(L.put("note", L.spotForRegion("api"), "ai"), false, "an AI never moves the person's place");
  assert.equal(CV.D.pos!["note"].x, q.x);
});

test("what lands in a full folder grows it, and what sits under it by rule moves down", () => {
  CV.load("dev-morning");
  const h0 = CV.D.pos!.api.h, under = CV.D.regions.find((r) => r.id !== "api" && CV.D.pos![r.id].x === CV.D.pos!.api.x && CV.D.pos![r.id].y > CV.D.pos!.api.y);
  const y0 = under ? CV.D.pos![under.id].y : 0;
  let n = 0;
  for (; n < 10; n++) {
    const sp = L.spotForRegion("api");
    CV.D.pieces["x" + n] = { id: "x" + n, region: "api", kind: "session", name: "x" + n };
    L.put("x" + n, sp, "person");
    if (sp?.grow) break;
  }
  assert.ok(n < 10, "a full folder answers with a cell that grows it");
  assert.equal(CV.D.pos!.api.h, h0 + L.CELL_H);
  if (under) assert.equal(CV.D.pos![under.id].y, y0 + L.CELL_H);
});

test("make's landing (#6): a piece made without a place lands in its folder, marked new; land undoes", () => {
  CV.load("jayden");
  CV.D.pieces.made = { id: "made", region: "cs", kind: "session", name: "Bo in hw4", ai: "Bo", copy: "hw4" };
  assert.equal(L.unplaced(), true);
  const r = CV.M.land();
  assert.equal(r.ok, true);
  const q = CV.D.pos!.made, R = CV.D.pos!.cs;
  assert.ok(q && q.x >= R.x && q.y >= R.y);
  assert.equal(L.isNew("made"), true);
  assert.equal(CV.M.touch("made").ok, true);
  assert.equal(L.isNew("made"), false);
  r.undo();
  assert.equal(CV.D.pos!.made, undefined);
});

test("place (#7): the person's spot for a piece or a folder; undo puts it back; live it is not yet", () => {
  CV.load("dev-morning");
  const q0 = { ...CV.D.pos!["s-Ada"] }, R = CV.D.pos!.web;
  const r = CV.M.place("s-Ada", R.x + L.PAD, R.y + L.PAD_T);
  assert.equal(r.ok, true);
  assert.equal(CV.D.pos!["s-Ada"].by, "person");
  assert.equal(CV.D.pieces["s-Ada"].region, "web", "dropped inside a folder, it belongs there now");
  r.undo();
  assert.equal(CV.D.pos!["s-Ada"].x, q0.x);
  assert.equal(CV.D.pieces["s-Ada"].region, "api");
  const f0 = { ...CV.D.pos!.money }, ps = things().filter(([id]) => CV.D.pieces[id]?.region === "money").map(([id, q]) => [id, q.x] as const);
  const d = CV.M.place("money", f0.x + 100, f0.y);
  assert.equal(d.ok, true);
  for (const [id, x] of ps) assert.equal(CV.D.pos![id].x, x + 100, "a folder's pieces go with it");
  d.undo();
  assert.equal(CV.D.pos!.money.x, f0.x);
  CV.setMode("live");
  try { assert.deepEqual({ ...CV.M.place("s-Ada", 0, 0), undo: null }, { ok: false, why: "not yet", undo: null }); } finally { CV.setMode("fixture"); }
});

test("a new folder goes under the last folder of its zone; undo takes it away while it is empty", () => {
  CV.load("denise");
  const r = CV.M.newFolder("Garden", "stickies");
  assert.equal(r.ok, true);
  assert.equal(r.id, "garden");
  assert.equal(L.zoneOf("garden"), "life");
  assert.equal(CV.D.pos!.garden.by, "person");
  for (const x of CV.D.regions) if (x.id !== "garden") assert.ok(!L.overlaps(CV.D.pos!.garden, CV.D.pos![x.id]), x.id);
  assert.equal(CV.M.newFolder("Garden", "life").id, "garden-2");
  r.undo();
  assert.ok(!CV.regionOf("garden"));
  assert.equal(CV.M.newFolder("  ").ok, true, "unsaid, it is a New folder");
});

test("pause, resume and stop on a face (#15); a split job asks before it stops; live, a held run is not yet", () => {
  CV.load("thirty");
  const p = CV.D.pieces["s-split"];
  const a = CV.M.pause("s-split");
  assert.equal(a.ok, true);
  assert.equal(p.state, "paused");
  assert.ok(p.parts!.filter((x) => x.state !== "done").every((x) => x.state === "paused"));
  assert.equal(CV.M.resume("Vi").ok, true, "by its AI's name too");
  assert.equal(p.state, "working");
  const s = CV.M.stop("s-split");
  assert.equal(s.ok, true);
  assert.equal(p.state, "working", "it asks first");
  const ask = Object.values(CV.D.asks).find((x) => x.piece === "s-split" && /Stop Vi/.test(x.text));
  assert.ok(ask);
  assert.equal(CV.M.stop("s-split", { confirmed: true }).ok, true);
  assert.equal(p.state, "stopped");
  assert.equal(CV.M.stop("s-split").ok, false);
  CV.setMode("live");
  try { assert.equal(CV.M.pause("s4").why, "not yet"); assert.equal(CV.M.stop("s4").ok, false, "no engine, no stop"); } finally { CV.setMode("fixture"); }
});

test("the wire reads today's messages: work.sessions into Build folders and sessions, home.places into Life folders", () => {
  const w = fromSessions({ projects: [{ path: "/home/x/api", name: "api" }], sessions: [
    { id: "a1", title: "fix login", cwd: "/home/x/api", project: "/home/x/api", branch: "ai/fix" },
    { id: "a2", title: "old", project: "/home/x/api", gone: true },
    { id: "a3", title: "cli", cwd: "/home/x/cli", project: "/home/x/cli" },
  ] });
  assert.deepEqual(w.regions.map((r) => [r.id, r.name, r.kind]), [["w:/home/x/api", "api", "code"], ["w:/home/x/cli", "cli", "code"]]);
  assert.deepEqual(w.pieces.map((p) => [p.id, p.region, p.kind, p.copy]), [["a1", "w:/home/x/api", "session", "ai/fix"], ["a3", "w:/home/x/cli", "session", "cli"]]);
  assert.deepEqual(fromPlaces({ places: [{ id: "school", name: "school" }, { id: "school-bio", name: "bio", parent: "school" }] }).map((r) => [r.id, r.kind]), [["h:school", "life"]]);
});

test("the phrases make the plane's moves", () => {
  CV.load("dev-morning");
  CV.M.goto("api");
  const z = CV.S.cam.z;
  assert.equal(CV.say("closer")?.ok, true);
  assert.ok(CV.S.cam.z > z);
  assert.equal(CV.say("further")?.ok, true);
  assert.equal(CV.say("today's page")?.ok, true);
  assert.equal(CV.S.dist, "far");
  assert.equal(CV.say("new folder taxes for stickies")?.id, "taxes");
  assert.equal(L.zoneOf("taxes"), "life");
  assert.equal(CV.say("pause ada")?.ok, true);
  assert.equal(CV.D.pieces["s-Ada"].state, "paused");
  assert.equal(CV.say("resume ada")?.ok, true);
});
