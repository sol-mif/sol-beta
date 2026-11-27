// node --test src/*.test.ts: the plane by rule (#1615, slice 1; next/plane/layout.ts, next/cv/moves/plane.ts, wire, say):
// today's page, then every folder in one flow (BR1, 2026-11-21: no zones, only folders), nothing over anything, the bands
// by size on screen, the camera at Far and Middle, what lies past a side named and reached by its chip, an AI places where
// it aims but never moves the person's place, a full folder grows, a new folder goes under the last at the folders' left
// edge, the person's moves answer { ok, id, undo } and are held back live where the engine cannot do them yet, the wire
// reads today's messages, and the phrases make the moves.
// Signed: marcocyl04-ux's agent, the port's slice 1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import * as L from "./next/plane/layout.ts";
import { FACE_PX } from "./next/form.ts";
import { fromPlaces, fromSessions, mergeRegions } from "./next/cv/wire/plane.ts";
import { toFit } from "./next/plane/fit.ts";

const things = () => Object.entries(CV.D.pos!).filter(([id]) => L.isThing(id));

test("the first layout: today's page on the left, then every folder in one flow, no zones, nothing over anything", () => {
  for (const name of ["dev-morning", "jayden", "denise", "minji", "thirty", "fresh"]) {
    CV.load(name);
    const Z = CV.D.zones!;
    assert.deepEqual(Object.keys(Z).filter((k) => k !== "page0").sort(), ["bottom", "diary", "fit", "page"], `${name}: D.zones holds today's page only, no Build or Life`);
    for (const r of CV.D.regions) assert.ok(CV.D.pos![r.id].x >= Z.page.x + Z.page.w, `${name}: ${r.id} right of today's page`);
    const rs = CV.D.regions.map((r) => CV.D.pos![r.id]);
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) assert.ok(!L.overlaps(L.caseRect(rs[i]), L.caseRect(rs[j])), `${name}: folders ${i} and ${j} apart (their cases at rest; an opened area may lean a gap into the next row)`);
    for (const p of Object.values(CV.D.pieces)) {
      const q = CV.D.pos![p.id];
      if (!q) { assert.ok(p.inside || p.kind === "arrivals", `${name}: ${p.id} has a place`); continue; }
      const R = CV.D.pos![p.region];
      assert.ok(q.x >= R.x && q.x + q.w <= R.x + R.w && q.y >= R.y && q.y + q.h <= R.y + R.h, `${name}: ${p.id} inside its folder`);
      assert.equal(q.by, "rule");
    }
  }
  CV.load("dev-morning");
  assert.deepEqual(L.folderOrderOnPlane(), CV.folderOrder(), "the sidebar's order is the plane's");
  assert.deepEqual(L.folderOrderOnPlane(), CV.D.regions.map((r) => r.id), "one flow in the list's order: a Life folder and a Build folder side by side");
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

test("a folder opens when it draws whole (its pieces FACE_PX on screen), never at a zoom number; zooming never enters Near", () => {
  CV.load("dev-morning");
  const q = CV.D.pos!.api;
  assert.equal(L.openAt("api", { ...CV.S.cam, z: FACE_PX / L.PIECE_W - 0.001 }), false);
  assert.equal(L.openAt("api", { ...CV.S.cam, z: FACE_PX / L.PIECE_W }), true);
  assert.ok(q.w * (FACE_PX / L.PIECE_W) > FACE_PX, "the folder itself is wider than a face when it opens");
  assert.equal(CV.S.dist, "far");
  assert.ok(L.PIECE_W * CV.S.cam.z < FACE_PX, "Far: its pieces narrower than a face");
  CV.M.goto("api");
  assert.equal(CV.S.dist, "middle");
  assert.ok(L.PIECE_W * CV.S.cam.z >= FACE_PX, "opened: its pieces a face wide or more");
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

test("Far shows every card whole or names what lies past a side; the chips' presses go there", () => {
  CV.load("dev-morning");
  for (const s of ["left", "right"] as const) assert.deepEqual(L.past(s), { folders: [], diary: false }, s);
  const d = CV.M.toDiary();
  assert.equal(d.ok, true);
  assert.equal(CV.S.dist, "far");
  d.undo();
  assert.equal(CV.M.toEdge("right").ok, false, "nothing past the right: no pan");
  // the camera a window's width to the left: every folder lies past the right edge, and the chip's press pans right by
  // whole columns, the first column not in view at the safe left edge
  const c0 = CV.S.cam, w = L.viewSize().w;
  CV.S.cam = { ...c0, x: c0.x - w / c0.z };
  assert.deepEqual(L.past("right").folders.sort(), CV.D.regions.map((r) => r.id).sort(), "every folder past the right edge");
  const c = L.edgeCam("right");
  assert.ok(c && c.x > CV.S.cam.x && c.z === c0.z, "the right chip pans right, the zoom stays");
  assert.equal(L.edgeCam("left"), null, "nothing past the left");
  CV.S.cam = c0;
  CV.M.zoom(3);   // closer: some folders go past an edge
  if (CV.S.dist === "far") {
    const s = (["right", "left"] as const).find((k) => L.past(k).folders.length);
    if (s) { assert.equal(CV.M.toEdge(s).ok, true); assert.notEqual(L.edgeCam(s), null); }
  }
});

test("an AI places where it aims (no zones, so no Diary-only rule); the person's places never move", () => {
  CV.load("dev-morning");
  CV.D.pieces.note = { id: "note", region: "api", kind: "doc", name: "a note", by: "Ada" };
  assert.equal(L.put("note", L.spotForRegion("api"), "ai"), true);
  const R = CV.D.pos!.api, nq = CV.D.pos!.note;
  assert.ok(nq.x >= R.x && nq.x + nq.w <= R.x + R.w && nq.y >= R.y && nq.y + nq.h <= R.y + R.h, "it lands in the folder it aimed at");
  assert.equal(L.onDiary("note"), false, "not under today's page");
  CV.D.pieces.ribbon = { id: "ribbon", region: "api", kind: "doc", name: "made unasked", by: "Ada" };
  assert.equal(L.put("ribbon", L.diaryFree(), "ai"), true);
  assert.equal(L.onDiary("ribbon"), true, "aimed under today's page, it is there");
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
  assert.equal(CV.D.pieces["s-Ada"].region, "api", "a session let go unarmed in a folder keeps its own: only the armed drop files it (BR1)");
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

test("a new folder goes under the last folder at the folders' left edge, whatever it is made as; undo takes it away while it is empty", () => {
  CV.load("denise");
  const left = Math.min(...CV.D.regions.map((x) => CV.D.pos![x.id].x));
  const r = CV.M.newFolder("Garden", "stickies");
  assert.equal(r.ok, true);
  assert.equal(r.id, "garden");
  assert.equal(CV.regionOf("garden")!.kind, "life", "made as stickies");
  assert.equal(CV.D.pos!.garden.x, left, "at the folders' left edge, not in a Life zone");
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
  const ask = Object.values(CV.D.asks).find((x) => x.piece === "s-split" && /^Stop “[^”]+” and its \d+ parts\?/.test(x.text) && !/Vi/.test(x.text));
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
  // BR1, folders in folders: a sub-place is a folder inside its place, put there by the rule
  assert.deepEqual(fromPlaces({ places: [{ id: "school", name: "school" }, { id: "school-bio", name: "bio", parent: "school" }] }).map((r) => [r.id, r.kind, r.parent, r.parentBy]),
    [["h:school", "life", undefined, undefined], ["h:school-bio", "life", "h:school", "rule"]]);
});

test("a folder keeps its index across the engine's pushes, so its colour and its sidebar place hold (BR1 18:20)", () => {
  const places = fromPlaces({ places: [{ id: "school", name: "school" }, { id: "money", name: "money" }] });
  const first = fromSessions({ projects: [{ path: "/home/x/api", name: "api" }, { path: "/home/x/web", name: "web" }], sessions: [] });
  let list = mergeRegions(mergeRegions([], "places", places), "work", first.regions);
  const ids = list.map((r) => r.id);
  // the engine lists projects latest first: web ran, so it comes first now; then the places come again
  const again = fromSessions({ projects: [{ path: "/home/x/web", name: "web" }, { path: "/home/x/api", name: "api" }, { path: "/home/x/cli", name: "cli" }], sessions: [] });
  list = mergeRegions(mergeRegions(list, "work", again.regions), "places", places);
  assert.deepEqual(list.map((r) => r.id), [...ids, "w:/home/x/cli"], "every folder where it was, a new one last");
  // a folder the engine no longer sends leaves; the others keep their order
  list = mergeRegions(list, "places", places.slice(1));
  assert.deepEqual(list.map((r) => r.id), ["h:money", "w:/home/x/api", "w:/home/x/web", "w:/home/x/cli"]);
});

test("a folder's colour is its own: the same tint whichever folders came first and wherever it sits, across loads (BR1, P9 18:40)", () => {
  const kept = new Map<string, string>(), was = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) } });
  const keepRegions = CV.D.regions;
  const R = (id: string) => ({ id, name: id.slice(2), kind: id.startsWith("h:") ? "life" : "code" }) as unknown as typeof keepRegions[number];
  const load = (ids: string[]) => { L.tintsForget(); CV.D.regions = ids.map(R); CV.stale(); return Object.fromEntries(ids.map((id) => [id, L.tintOf(id)])); };
  try {
    // P9's two loads of the live home: load 0 heard the places first, load 1 heard the work folders first and more of them
    const a = load(["h:home", "h:clean-room", "w:sol", "w:api"]);
    assert.deepEqual(Object.values(a), [0, 1, 2, 3], "a list seen whole at once: 0, 1, 2, 3 as before");
    const b = load(["w:masakali", "w:rise", "w:api", "w:sol", "h:home", "w:merge", "h:clean-room"]);
    for (const id of Object.keys(a)) assert.equal(b[id], a[id], `${id} keeps its tint`);
    const fresh = ["w:masakali", "w:rise", "w:merge"].map((id) => b[id]);
    assert.deepEqual([...fresh].sort(), [0, 1, 2], "the new ones take the tints fewest folders wear");
    const c = load(["w:merge", "h:clean-room", "w:rise"]);
    assert.deepEqual(c, { "w:merge": b["w:merge"], "h:clean-room": a["h:clean-room"], "w:rise": b["w:rise"] }, "a third load, fewer folders, in another order");
    assert.equal(L.tintOf("w:nowhere"), -1, "no folder, no tint");
    kept.set("sol.tints", "not json"); L.tintsForget();
    assert.ok([0, 1, 2, 3].includes(L.tintOf("w:merge")), "a spoiled store starts again");
  } finally {
    if (was) Object.defineProperty(globalThis, "localStorage", was); else delete (globalThis as { localStorage?: unknown }).localStorage;
    CV.D.regions = keepRegions; CV.stale(); L.tintsForget();
  }
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
  assert.equal(CV.regionOf("taxes")!.kind, "life");
  assert.notEqual(CV.say("pan right"), null, "heard: the side chip's move by name");
  assert.equal(CV.say("to the build zone"), null, "no zones to go to");
  assert.equal(CV.say("pause ada")?.ok, true);
  assert.equal(CV.D.pieces["s-Ada"].state, "paused");
  assert.equal(CV.say("resume ada")?.ok, true);
});

test("fitCards fits only a card with a front: a folded tab carries no data-fh and is never refit (its height is the CSS's)", () => {
  const card = (cls: string, front: boolean, h: string) => ({ className: cls, style: { width: "300px", height: h }, dataset: {} as Record<string, string | undefined>, querySelector: (s: string) => (s === ".fo-front" && front ? {} : null) });
  const whole = card("pl-card", true, "240px"), tab = card("pl-card fo-folded", false, ""), more = card("pl-card fo-folded fo-daymore", false, "");
  assert.deepEqual(toFit([whole, tab, more], 1).map((x) => x.c), [whole], "the first draw fits the whole card only");
  for (const t of [tab, more]) assert.deepEqual(t.dataset, {}, "a folded tab is never stamped: no data-fit, no data-fh=NaN");
  assert.equal(whole.dataset.fh, "240");
  assert.deepEqual(toFit([whole, tab, more], 1), [], "the next draw (a pan) refits nothing: not the whole card, not a tab");
  whole.style.height = "200px";
  assert.deepEqual(toFit([whole, tab], 1).map((x) => x.c), [whole], "a card that shrank is fitted again");
});
