// node --test src/*.test.ts: one folder, one region (#1816; place.ts listed, engine next/tree.ts). Once the engine's tree
// has come, the canvas and the sidebar draw it: a folder home.places names by its own id and a session's folder in it are
// that one folder, a session in a folder the person keeps sits in it, Sol's home and its own stores are never drawn, a
// folder of Sol's home never sits in what holds the home, and a parent only the disk added is drawn but never kept.
// Invented people only. Signed: marcocyl04-ux's agent (#1816).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Region } from "./next/cv/core.ts";
import type { Data } from "./next/cv/types.ts";
import { fromPlaces, setSolHome } from "./next/cv/wire/plane.ts";
import { listed, type KeptFolder, type Unsorted } from "./next/place.ts";
import { foldersHeard } from "./next/movein/live.ts";
import { live } from "./next/movein/state.ts";
import { apply, blank } from "./next/movein/data.ts";

// a Sol developer's Mac: Sol's home lies inside the checkout they keep
const H = "/Users/you", C = `${H}/code`, SOL = `${C}/sol/home`;
const w = (path: string, o: Partial<Region> = {}): Region => ({ id: "w:" + path, name: path.split("/").pop()!, kind: "code", from: "work", ...o });
const ses = (id: string, region: string) => ({ id, region, kind: "session", name: id, from: "work", born: 1 });
const TREE: KeptFolder[] = [
  { id: "w:" + C, name: "code", path: C, by: "disk" },
  { id: `w:${C}/sol`, name: "sol", path: `${C}/sol`, parent: "w:" + C },
  { id: `w:${C}/shop`, name: "Shop", path: `${C}/shop`, parent: "w:" + C },
  { id: "h:school", name: "school", path: `${SOL}/school` },
  { id: "h:school/bio", name: "Bio 201", path: `${SOL}/school/bio`, parent: "h:school" },
];

test("home.places' folders carry their folder on disk; a place of the person's Things only has none", () => {
  const rs = fromPlaces({ places: [{ id: "school", name: "school", from: { source: "files", ref: `${SOL}/school` } }, { id: "trip", name: "trip", from: { source: "you", ref: "you" } }] });
  assert.equal(rs[0].path, `${SOL}/school`);
  assert.equal(rs[1].path, undefined);
});

test("the tree is what is drawn: one region per folder, its pieces moved in, none of Sol's, nested as the tree says", () => {
  setSolHome(SOL);
  try {
    const d: Data = { regions: [], pieces: {}, asks: {}, ais: [] };
    // what home.places drew (its crumb ids), and what work.sessions drew (each folder a session ran in)
    d.regions.push(...fromPlaces({ places: [
      { id: "school", name: "school", from: { source: "files", ref: `${SOL}/school` } },
      { id: "school-bio", name: "bio", parent: "school", from: { source: "files", ref: `${SOL}/school/bio` } },
      { id: "next", name: "next", from: { source: "files", ref: `${SOL}/next` } },
      { id: "trip", name: "trip", from: { source: "you", ref: "you" } },
    ] }));
    d.regions.push(w(`${C}/sol`, { path: `${C}/sol` }), w(`${C}/sol/mac`), w(SOL), w(`${SOL}/school/bio`), w(`${SOL}/next`), w(`${H}/elsewhere`));
    Object.assign(d.pieces, { s1: ses("s1", `w:${C}/sol/mac`), s2: ses("s2", "w:" + SOL), s3: ses("s3", `w:${SOL}/school/bio`), s4: ses("s4", `w:${SOL}/next`), s5: ses("s5", `w:${H}/elsewhere`), t1: { id: "t1", region: "h:school-bio", kind: "sticky", name: "t1" } });
    listed(d, [], { kept: [], added: [], at: 10, folders: TREE });
    const ids = d.regions.map((r) => r.id).sort();
    assert.deepEqual(ids, [...TREE.map((f) => f.id), "h:trip"].sort(), "the tree's folders, and the person's Things' folder with no place on disk");
    assert.equal(d.pieces.s1.region, `w:${C}/sol`, "a session in a folder inside one they keep sits in that one");
    assert.equal(d.pieces.s3.region, "h:school/bio", "a session in a folder of Sol's home is in that folder");
    assert.equal(d.pieces.t1.region, "h:school/bio", "home.places' id for it is the same folder");
    assert.ok(!d.pieces.s2 && !d.pieces.s4, "Sol's home and its own stores are never drawn, their sessions with them");
    assert.ok(!d.pieces.s5, "a folder the tree does not hold and nobody listed is not drawn, as before");
    const parent = (id: string) => d.regions.find((r) => r.id === id)!.parent ?? null;
    assert.equal(parent(`w:${C}/sol`), "w:" + C);
    assert.equal(parent(`w:${C}/shop`), "w:" + C);
    assert.equal(parent("h:school"), null, "a folder of Sol's home never sits in the checkout that holds it");
    assert.equal(parent("h:school/bio"), "h:school");
    assert.equal(d.regions.find((r) => r.id === "h:school/bio")!.name, "Bio 201", "the person's name for it");
    // a folder moved to the Trash: the next tree leaves it out, and the canvas with it
    listed(d, [], { kept: [], added: [], at: 10, folders: TREE.filter((f) => f.id !== `w:${C}/shop`) });
    assert.ok(!d.regions.some((r) => r.id === `w:${C}/shop`));
  } finally { setSolHome(""); }
});

test("under the tree a read's row it does not hold is not drawn; a folder worked in since the move-in is, a dot folder never", () => {
  const d: Data = { regions: [], pieces: {}, asks: {}, ais: [] };
  const rows = [{ id: `w:${C}/gone`, n: "gone", path: `${C}/gone` }];
  d.regions.push(w(`${C}/gone`), w(`${H}/new`), w(`${H}/old`), w(`${H}/.app/wake`));
  Object.assign(d.pieces, { a: ses("a", `w:${C}/gone`), b: { ...ses("b", `w:${H}/new`), born: 50 }, c: { ...ses("c", `w:${H}/old`), born: 5 }, e: { ...ses("e", `w:${H}/.app/wake`), born: 50 } });
  listed(d, rows, { kept: [], added: [], at: 100, movedAt: 20, folders: TREE });
  const ids = d.regions.map((r) => r.id);
  assert.ok(!ids.includes(`w:${C}/gone`), "the read listed it, the disk no longer has it: not drawn");
  assert.ok(ids.includes(`w:${H}/new`), "a session in it since the move-in, though before this window read: drawn");
  assert.ok(!ids.includes(`w:${H}/old`) && !ids.includes(`w:${H}/.app/wake`));
  const p = { rows: [{ id: `w:${C}/gone`, k: "place", n: "gone", path: `${C}/gone` }] } as unknown as Parameters<typeof apply>[1];
  apply(d, p, blank(), new Set(TREE.map((f) => f.id)));
  assert.ok(!d.regions.some((r) => r.id === `w:${C}/gone`), "the move-in's choices draw none but the tree's");
});

test("a session where a link of Sol's home leads is in that folder; one in an app's storage is never drawn", () => {
  const d: Data = { regions: [w(`${H}/Notes/School/bio`), w(`${H}/Library/Application Support/x/wake`)], pieces: {}, asks: {}, ais: [] };
  Object.assign(d.pieces, { a: { ...ses("a", `w:${H}/Notes/School/bio`), born: 50 }, b: { ...ses("b", `w:${H}/Library/Application Support/x/wake`), born: 50 } });
  const tree = TREE.map((f) => (f.id === "h:school/bio" ? { ...f, real: `${H}/Notes/School/bio` } : f));
  listed(d, [], { kept: [], added: [], at: 100, movedAt: 20, folders: tree });
  assert.equal(d.pieces.a.region, "h:school/bio");
  assert.ok(!d.pieces.b && !d.regions.some((r) => r.id.includes("Library")));
});

test("a parent only the disk added is drawn, never kept: These are mine never keeps it, Settings never counts it", () => {
  const was = { folders: live.folders, kept: live.kept };
  try {
    foldersHeard(TREE);
    assert.equal(live.folders.length, 5);
    assert.equal(live.folders[0].by, "disk");
    assert.equal(live.folders[1].parent, "w:" + C);
    assert.deepEqual(live.kept, TREE.filter((f) => !f.by).map((f) => f.id));
  } finally { live.folders = was.folders; live.kept = was.kept; }
});

test("the person's words (#1816 round 2): only their tree is drawn, a link folds Sol's copy in, the rest waits not sorted yet", () => {
  setSolHome(SOL);
  try {
    const d: Data = { regions: [], pieces: {}, asks: {}, ais: [] };
    const MINE: KeptFolder[] = [
      { id: `w:${H}/Classes`, name: "Classes", path: `${H}/Classes` },
      { id: `w:${H}/Classes/Bio`, name: "Bio", path: `${H}/Classes/Bio`, parent: `w:${H}/Classes`, also: [`${SOL}/school/bio`] },
      { id: `w:${C}/shop`, name: "Shop", path: `${C}/shop` },
    ];
    d.regions.push(...fromPlaces({ places: [{ id: "school-bio", name: "bio", from: { source: "files", ref: `${SOL}/school/bio` } }, { id: "old", name: "old", from: { source: "files", ref: `${SOL}/old` } }] }));
    d.regions.push(w(`${C}/shop/api`), w(`${C}/side-copy`), w(`${SOL}/next`), w(`${H}/.hidden/run`));
    Object.assign(d.pieces, { s1: ses("s1", `w:${C}/shop/api`), s2: ses("s2", `w:${C}/side-copy`), s3: ses("s3", `w:${SOL}/next`), t1: { id: "t1", region: "h:school-bio", kind: "sticky", name: "t1" } });
    const unsorted = new Map<string, Unsorted>();
    listed(d, [], { kept: [], added: [`${C}/side-copy`], at: 1, movedAt: 1, folders: MINE, words: true, unsorted });
    assert.deepEqual(d.regions.map((r) => r.id).sort(), MINE.map((f) => f.id).sort(), "their tree and nothing else, not even a folder this face added or one worked in since");
    assert.equal(d.pieces.t1.region, `w:${H}/Classes/Bio`, "Sol's home's copy of a class is that class, through the link in it");
    assert.equal(d.pieces.s1.region, `w:${C}/shop`, "a session inside one of theirs sits in it");
    assert.deepEqual([...unsorted.keys()].sort(), [`w:${C}/side-copy`, "h:old"].sort(), "a folder of Sol's home of theirs and a side copy wait; Sol's own runs and hidden ones do not");
    assert.equal(unsorted.get(`w:${C}/side-copy`)!.sessions, 1);
    assert.ok(!d.pieces.s2 && !d.pieces.s3, "nothing not sorted is drawn on the canvas");
    // a folder said later leaves "Not sorted yet"
    listed(d, [], { kept: [], added: [], at: 1, folders: [...MINE, { id: `w:${C}/side-copy`, name: "side-copy", path: `${C}/side-copy` }], words: true, unsorted });
    assert.ok(!unsorted.has(`w:${C}/side-copy`));
  } finally { setSolHome(""); }
});

test("a view on a folder no longer drawn goes back to all folders; one still there stays; the tree's links are kept", async () => {
  const core = await import("./next/cv/core.ts");
  const wasD = { regions: core.D.regions, pieces: core.D.pieces }, wasS = { ...core.S };
  try {
    core.D.regions = [w(`${H}/School`)]; core.D.pieces = {};
    Object.assign(core.S, { dist: "near", region: `w:${H}/Shelf`, piece: null });
    assert.equal(core.lostHere(), true, "the folder it stood on is gone");
    assert.equal(core.S.dist, "far"); assert.equal(core.S.region, null);
    Object.assign(core.S, { dist: "middle", region: `w:${H}/School` });
    assert.equal(core.lostHere(), false, "its folder is still drawn: the view stays");
    assert.equal(core.S.region, `w:${H}/School`);
    foldersHeard([{ id: `w:${H}/School/Bio`, name: "Bio", path: `${H}/School/Bio`, also: [`${SOL}/school/bio`, 7] }]);
    assert.deepEqual(live.folders[0].also, [`${SOL}/school/bio`], "a link's target stays with its folder");
  } finally { core.D.regions = wasD.regions; core.D.pieces = wasD.pieces; Object.assign(core.S, wasS); live.folders = []; live.kept = []; }
});

test("an open session whose folder the tree moved stays open, its folder followed; one gone goes back to all folders", async () => {
  const core = await import("./next/cv/core.ts");
  const wasD = { regions: core.D.regions, pieces: core.D.pieces }, wasS = { ...core.S };
  try {
    core.D.regions = [w(`${C}/sol`)]; core.D.pieces = { s1: ses("s1", `w:${C}/sol`) } as never;
    Object.assign(core.S, { dist: "near", region: `w:${C}/sol/app`, piece: "s1", page: null });
    assert.equal(core.lostHere(), false, "the session is still there: its tab stays");
    assert.equal(core.S.piece, "s1"); assert.equal(core.S.region, `w:${C}/sol`, "the view follows it into its folder");
    core.D.pieces = {};
    assert.equal(core.lostHere(), true, "the session is gone"); assert.equal(core.S.piece, null);
  } finally { core.D.regions = wasD.regions; core.D.pieces = wasD.pieces; Object.assign(core.S, wasS); }
});

test("under the person's words a worktree in a dot folder of theirs sits in that folder; a dot folder outside stays out", () => {
  setSolHome(SOL);
  try {
    const d: Data = { regions: [], pieces: {}, asks: {}, ais: [] };
    const MINE: KeptFolder[] = [{ id: `w:${C}/shop`, name: "Shop", path: `${C}/shop` }];
    d.regions.push(w(`${C}/shop/.claude/worktrees/fix-1`), w(`${H}/.hidden/run`));
    Object.assign(d.pieces, { s1: ses("s1", `w:${C}/shop/.claude/worktrees/fix-1`), s2: ses("s2", `w:${H}/.hidden/run`) });
    listed(d, [], { kept: [], added: [], at: 1, movedAt: 1, folders: MINE, words: true, unsorted: new Map() });
    assert.equal(d.pieces.s1.region, `w:${C}/shop`, "the builder's worktree is in Shop");
    assert.ok(!d.pieces.s2, "a dot folder in no folder of theirs is never drawn");
  } finally { setSolHome(""); }
});
