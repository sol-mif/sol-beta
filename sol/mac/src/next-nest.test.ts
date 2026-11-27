// node --test src/*.test.ts: folders in folders (BR1, #1615, item 2). A folder sits in another (Region.parent) as deep as
// eight; the tree's rules never hide a folder (a loop or a gone parent reads as the top); the person puts a folder in
// another and takes it out, with one Undo; it is drawn in its folder's cell at a scale, opens later than its folder and
// is focused inside it; a new folder made with a folder open goes inside; its place counts and says what is inside it;
// the wire reads a place's sub-places and a project inside a project as folders inside; live, the engine keeps the
// person's `in` and every folder message carries the folders above it.
// Invented people only (Denise, Dev). Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import * as L from "./next/plane/layout.ts";
import { FACE_PX } from "./next/form.ts";
import { placeFrom, placeOf } from "./next/place.ts";
import { attach as planeAttach, fromPlaces, fromSessions, link as planeLink } from "./next/cv/wire/plane.ts";
import { attach } from "./next/cv/wire/notes.ts";

const R = (id: string) => CV.D.regions.find((r) => r.id === id)!;
const inside = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;

test("the tree's rules: parent, the folders above, inside, the folders in it; a loop or a gone parent reads as the top", () => {
  CV.load("denise");   // house, kids, work
  R("kids").parent = "house";
  assert.equal(CV.parentOf("kids"), "house");
  assert.deepEqual(CV.ancestors("kids"), ["house"]);
  assert.deepEqual(CV.childrenOf("house"), ["kids"]);
  assert.ok(CV.within("kids", "house") && CV.within("house", "house") && CV.within("kids", null));
  assert.ok(!CV.within("house", "kids"), "a folder is not inside the folder inside it");
  R("house").parent = "kids";   // a loop: both read as the top, so neither is hidden
  assert.equal(CV.parentOf("kids"), null);
  assert.equal(CV.parentOf("house"), null);
  delete R("house").parent;
  R("work").parent = "gone";
  assert.equal(CV.parentOf("work"), null, "a parent that is gone: the top");
  R("work").parent = "work";
  assert.equal(CV.parentOf("work"), null, "itself: the top");
});

test("canNest: never into itself or a folder inside it, never deeper than eight", () => {
  CV.load("denise");
  assert.ok(CV.canNest("kids", "house"));
  assert.ok(CV.canNest("kids", null), "the top always takes a folder");
  R("kids").parent = "house";
  assert.ok(!CV.canNest("house", "kids"), "into the folder inside it");
  assert.ok(!CV.canNest("house", "house"), "into itself");
  assert.ok(!CV.canNest("house", "nowhere"), "into a folder that is not there");
  // at most eight folders above a folder: a chain whose last has eight above it takes nothing more
  CV.load("denise");
  for (let i = 0; i <= CV.DEPTH; i++) CV.D.regions.push({ id: `d${i}`, name: `d${i}`, kind: "life", ...(i ? { parent: `d${i - 1}` } : {}) });
  assert.equal(CV.ancestors(`d${CV.DEPTH}`).length, CV.DEPTH);
  assert.ok(!CV.canNest("kids", `d${CV.DEPTH}`), "nine above it: refused");
  assert.ok(CV.canNest("kids", `d${CV.DEPTH - 1}`), "eight above it");
});

test("Denise puts kids in house: drawn in house's cell at a scale, its notes with it, one Undo puts it all back", () => {
  CV.load("denise");
  const before = JSON.stringify(CV.D.pos), kidsNotes = CV.piecesIn("kids").filter((p) => CV.D.pos![p.id]).map((p) => p.id);
  const r = CV.M.nest("kids", "house");
  assert.equal(r.ok, true);
  assert.equal(CV.parentOf("kids"), "house");
  const H = CV.D.pos!.house, K = CV.D.pos!.kids;
  assert.equal(K.in, "house", "the person's: the engine keeps it");
  assert.equal(K.by, "person");
  assert.ok(K.s! > 0 && K.s! < 1, `drawn smaller than its folder (s ${K.s})`);
  assert.ok(inside(K, H), "inside house's box");
  for (const id of kidsNotes) assert.ok(inside(CV.D.pos![id], K), `${id} inside kids`);
  for (const p of CV.piecesIn("house")) { const q = CV.D.pos![p.id]; if (q) assert.ok(!L.overlaps(q, K), `${p.id} not under kids`); }
  const tops = CV.D.regions.filter((x) => !CV.parentOf(x.id)).map((x) => CV.D.pos![x.id]);
  for (let i = 0; i < tops.length; i++) for (let j = i + 1; j < tops.length; j++) assert.ok(!L.overlaps(L.caseRect(tops[i]), L.caseRect(tops[j])), `top folders ${i} and ${j} apart (their cases at rest; an opened area may lean into the next row)`);
  assert.deepEqual(CV.folderOrder().slice(CV.folderOrder().indexOf("house"), CV.folderOrder().indexOf("house") + 2), ["house", "kids"], "the sidebar lists kids right under house");
  assert.equal(CV.M.nest("house", "kids").ok, false, "house can't go into kids now");
  assert.equal(CV.M.nest("kids", "house").ok, false, "it is in there already");
  r.undo();
  assert.equal(CV.parentOf("kids"), null);
  assert.equal(JSON.stringify(CV.D.pos), before, "every place as it was");
});

test("taken out to the canvas: kids is a top folder again, and the person said so (in: null)", () => {
  CV.load("denise");
  CV.M.nest("kids", "house");
  const r = CV.M.nest("kids", null);
  assert.equal(r.ok, true);
  assert.equal(CV.parentOf("kids"), null);
  assert.equal(CV.D.pos!.kids.in, null);
  assert.equal(CV.D.pos!.kids.s ?? 1, 1, "drawn at full size at the top");
  // a rule's parent (a place's sub-place) gives way to what the person said
  R("kids").parent = "house"; R("kids").parentBy = "rule";
  L.layoutPlane();
  assert.equal(CV.parentOf("kids"), null, "the person took it out: it stays out");
});

test("a folder inside opens later than its folder, and the middle of the view inside it focuses it", () => {
  CV.load("denise");
  CV.M.nest("kids", "house");
  const s = CV.D.pos!.kids.s!, zHouse = (FACE_PX / L.PIECE_W) * 1.01, zKids = (FACE_PX / (L.PIECE_W * s)) * 1.01;
  assert.ok(L.openAt("house", { x: 0, y: 0, z: zHouse }));
  assert.ok(!L.openAt("kids", { x: 0, y: 0, z: zHouse }), "at the zoom house opens, kids is still a card");
  assert.ok(!L.drawsWhole("kids", { x: 0, y: 0, z: zHouse }), "its notes are not drawn yet");
  assert.ok(L.drawsWhole("house", { x: 0, y: 0, z: zHouse }));
  assert.ok(L.openAt("kids", { x: 0, y: 0, z: zKids }));
  const K = CV.D.pos!.kids, { w, h } = CV.viewSize(), sa = L.safe("middle"), sx = sa.l + (w - sa.l - sa.r) / 2, sy = sa.t + (h - sa.t - sa.b) / 2;
  const kx = K.x + K.w / 2, ky = K.y + K.h / 2, p = L.toPlane(sx, sy, { x: kx, y: ky, z: zKids });
  const cam = { x: kx + (kx - p.x), y: ky + (ky - p.y), z: zKids };
  assert.equal(L.focusAt(cam), "kids", "the middle is in kids and kids is open: kids");
  assert.equal(L.focusAt({ ...cam, z: zHouse }), "house", "kids not open yet: house");
  CV.M.fold("house", true);
  assert.ok(!L.drawsWhole("kids", cam), "house folded: nothing inside it is drawn");
});

test("Make a folder with a folder open makes it inside; at Far it goes to the top", () => {
  CV.load("denise");
  CV.M.goto("house");
  assert.equal(CV.S.dist, "middle");
  const a = CV.M.newFolder("recipes", "life");
  assert.equal(a.ok, true);
  assert.equal(CV.parentOf(a.id!), "house");
  assert.ok(inside(CV.D.pos![a.id!], CV.D.pos!.house));
  a.undo();
  assert.ok(!CV.D.regions.some((r) => r.id === a.id), "undo takes the empty folder away");
  CV.S.dist = "far"; CV.S.region = null;
  const b = CV.M.newFolder("taxes", "life");
  assert.equal(CV.parentOf(b.id!), null);
  const c = CV.M.newFolder("old taxes", "life", b.id);
  assert.equal(CV.parentOf(c.id!), b.id, "into, when the caller says where");
});

test("a life folder's board starts under the folders inside it and fits in its folder, stickies or none", () => {
  CV.load("denise");
  CV.M.nest("kids", "house");
  const K = CV.D.pos!.kids;
  assert.ok(L.boardTop("house") >= K.y + K.h - 0.5, `house's board (${L.boardTop("house")}) starts under kids (${K.y + K.h})`);
  CV.S.dist = "far"; CV.S.region = null;
  const t = CV.M.newFolder("trips", "life"), u = CV.M.newFolder("japan", "life", t.id);
  const T = CV.D.pos![t.id!], U = CV.D.pos![u.id!], y = L.boardTop(t.id!);
  assert.ok(y >= U.y + U.h - 0.5, `an empty folder's board (${y}) starts under japan (${U.y + U.h})`);
  assert.ok(y + L.PIECE_H <= T.y + T.h + 0.5, `and fits in trips (${y + L.PIECE_H} ≤ ${T.y + T.h})`);
});

test("a place counts everything in the folders inside it, and says them; a folder of folders is never \"Nothing\"", () => {
  CV.load("denise");
  const own = placeOf("house").counts.pieces, kids = placeOf("kids").counts.pieces;
  CV.M.nest("kids", "house");
  const h = placeOf("house");
  assert.equal(h.counts.pieces, own + kids);
  assert.equal(placeFrom({ id: "h:garden", name: "Garden", kind: "life" }, [{ id: "g1", region: "h:garden", kind: "sticky", name: "g1", text: "bulbs" }], [], ["Bulbs"]).line,
    "Nothing running · one note · inside: Bulbs", "a quiet line says the folders in it, by name");
  assert.equal(h.name, "home", "its name is still its own");
  CV.load("denise");
  const t = CV.M.newFolder("trips", "life", null), u = CV.M.newFolder("japan", "life", t.id);
  assert.equal(CV.parentOf(u.id!), t.id);
  assert.equal(placeOf(t.id!).line, "Inside: japan");
  assert.equal(placeOf(t.id!).empty, false);
  assert.equal(placeOf(u.id!).line, "Nothing in it yet");
});

test("the wire: a place's sub-places and a project inside a project are folders inside, by the rule", () => {
  const ps = fromPlaces({ places: [{ id: "school", name: "school" }, { id: "bio-201", name: "Bio 201", parent: "school" }, { id: "lab", name: "lab reports", parent: "bio-201" }, { id: "x", name: "x", parent: "gone" }] });
  assert.deepEqual(ps.map((r) => [r.id, r.parent ?? null, r.parentBy ?? null]),
    [["h:school", null, null], ["h:bio-201", "h:school", "rule"], ["h:lab", "h:bio-201", "rule"], ["h:x", null, null]]);
  const w = fromSessions({ projects: [{ path: "/home/you/code", name: "code" }, { path: "/home/you/code/api", name: "api" }, { path: "/home/you/code/api/docs", name: "docs" }, { path: "/home/you/code-old", name: "code-old" }], sessions: [] });
  const by = Object.fromEntries(w.regions.map((r) => [r.id, r.parent ?? null]));
  assert.equal(by["w:/home/you/code/api"], "w:/home/you/code");
  assert.equal(by["w:/home/you/code/api/docs"], "w:/home/you/code/api", "the deepest project that holds it");
  assert.equal(by["w:/home/you/code-old"], null, "a name that only starts the same is not inside");
  assert.equal(by["w:/home/you/code"], null);
});

test("live: the engine keeps the person's `in`, and a folder's messages carry the folders above it", () => {
  CV.load("denise");
  const sent: { type: string; [k: string]: unknown }[] = [];
  CV.setMode("live");
  const was = planeLink.e;
  planeLink.e = { send: (o: { type: string }) => { sent.push(o); return true; }, subscribe: () => () => {} } as never;
  const off = attach({ send: (o: { type: string }) => { sent.push(o); return true; }, subscribe: () => () => {} } as never);
  try {
    assert.equal(CV.M.nest("kids", "house").ok, true);
    const set = sent.find((m) => m.type === "next.pos.set" && m.id === "kids");
    assert.equal(set?.in, "house");
    CV.M.folder_start("kids", "plan the summer camp");
    // with its pages, by title (BR1 conform #3: a session started in a folder is told its pages)
    assert.deepEqual(sent.at(-1), { type: "next.folder.start", folder: "kids", text: "plan the summer camp", above: ["house"],
      pages: ["Mia", "Sign Mia’s school form", "Pack Mia’s swim bag", "Book Mia’s dentist follow-up"] });
    CV.M.folder_start("house", "fix the gutter");
    assert.deepEqual(sent.at(-1)?.above, [], "a top folder: none above, said so");
  } finally { off(); planeLink.e = was; CV.setMode("fixture"); }
});

test("live: Undo of a nest tells the engine the place is the rule's again, and a refused one says why", () => {
  CV.load("denise");
  const sent: { type: string; [k: string]: unknown }[] = [], flashed: string[] = [];
  CV.setMode("live");
  const was = planeLink.e, fl = CV.hooks.flash;
  planeLink.e = { send: (o: { type: string }) => { sent.push(o); return true; }, subscribe: () => () => {} } as never;
  CV.hooks.flash = (t) => flashed.push(t);
  try {
    const r = CV.M.nest("kids", "house");
    sent.length = 0;
    r.undo();
    const back = sent.filter((m) => m.type === "next.pos.set" && m.id === "kids");
    assert.equal(back.at(-1)?.by, "rule", "the engine forgets it was the person's, so a reload draws it at the top");
    assert.equal("in" in (back.at(-1) ?? {}), false);
    assert.equal(CV.M.nest("kids", null).ok, false);
    assert.match(flashed.at(-1) ?? "", /kids is on the canvas already/);
  } finally { planeLink.e = was; CV.hooks.flash = fl; CV.setMode("fixture"); }
});

test("live: the engine's places come before the folders they place, and the person's `in` still holds when they come", () => {
  CV.load("denise");
  CV.setMode("live");
  CV.D.regions = []; CV.D.pieces = {}; CV.D.pos = {};
  let hear: (m: { type: string; [k: string]: unknown }) => void = () => {};
  const was = planeLink.e;
  const off = planeAttach({ send: () => true, subscribe: (f: typeof hear) => { hear = f; return () => {}; } } as never);
  try {
    hear({ type: "next.state", pos: { "h:kids": { x: 900, y: 40, w: 300, h: 200, by: "person", touched: true, folded: false, at: 1, in: "h:house" } } });
    hear({ type: "home.places", places: [{ id: "house", name: "house" }, { id: "kids", name: "kids" }] });
    assert.equal(CV.parentOf("h:kids"), "h:house", "kids is in house after a reload");
    assert.equal(CV.D.pos!["h:kids"].in, "h:house");
  } finally { if (typeof off === "function") off(); planeLink.e = was; CV.setMode("fixture"); }
});

test("live: Dev's project put in a home folder the move-in drew stays in it through a reload's messages", () => {
  CV.load("denise");
  CV.setMode("live");
  CV.D.regions = []; CV.D.pieces = {}; CV.D.pos = {};
  let hear: (m: { type: string; [k: string]: unknown }) => void = () => {};
  const was = planeLink.e;
  const off = planeAttach({ send: () => true, subscribe: (f: typeof hear) => { hear = f; return () => {}; } } as never);
  const sessions = { type: "work.sessions", projects: [{ path: "/home/you/code/web", name: "web" }, { path: "/home/you/code/api", name: "api" }], sessions: [] };
  try {
    hear(sessions);
    CV.D.regions.push({ id: "h:life", name: "life", kind: "life", from: "places" });   // as the move-in draws a kept home folder (place.ts listed)
    hear({ type: "next.state", pos: { "w:/home/you/code/web": { x: 900, y: 40, w: 300, h: 200, by: "person", touched: true, folded: false, at: 1, in: "h:life" } } });
    assert.equal(CV.parentOf("w:/home/you/code/web"), "h:life", "after next.state");
    // the move-in's redraw (movein/live.ts) while the project is off the plane: its place is dropped there
    const web = "w:/home/you/code/web";
    CV.D.regions = CV.D.regions.filter((r) => r.id !== web); delete CV.D.pos![web]; CV.hooks.layout?.();
    assert.equal(CV.D.pos![web], undefined);
    hear(sessions);
    assert.equal(CV.parentOf(web), "h:life", "after the sessions come again");
    assert.equal(CV.D.pos![web].by, "person");
    assert.equal(CV.D.pos![web].in, "h:life");
  } finally { if (typeof off === "function") off(); planeLink.e = was; CV.setMode("fixture"); }
});

test("a folder the disk's rule put inside another and then took out is a top again at full size, in the row, over nothing (BR1, #1615, builder S)", () => {
  CV.load("denise");
  L.layoutPlane();
  R("kids").parent = "house"; R("kids").parentBy = "rule";
  L.layoutPlane();
  assert.ok((CV.D.pos!.kids.s ?? 1) < 1, "inside house: drawn at its cell's scale");
  delete R("kids").parent; delete R("kids").parentBy;
  L.layoutPlane();
  const K = CV.D.pos!.kids;
  assert.equal(K.s, undefined, "a top holds no cell's scale");
  const others = CV.D.regions.filter((r) => r.id !== "kids" && !CV.parentOf(r.id)).map((r) => CV.D.pos![r.id]);
  for (const q of others) assert.ok(!L.overlaps(K, q), "over no other folder, so the canvas never draws them as one stack");
  assert.ok(others.some((q) => q.y === K.y), "in a row of folders, never under the folder it left");
});
