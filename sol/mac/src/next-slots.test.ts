// node --test src/*.test.ts: the slots (BR1 item 1, #1615). A folder's own Diary is a piece, "diary:<folder>", one per
// folder: M.make("diary", "Diary", folder) makes it on the fixture and live, placed in its folder as the person's; live
// its place is kept by the engine (next.pos.set) and the piece is made again from that place on a reload, once its
// folder is back. Up close it has three ways out, each back to where it opened from: Esc, Back, a press outside.
// Invented people only (Denise). Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { attach as planeAttach, link as planeLink } from "./next/cv/wire/plane.ts";
import { atDiary, backTo, diaryKeys, leaveDiary } from "./next/near/diary.ts";

const key = (k: string, target: unknown = null) => ({ key: k, metaKey: false, altKey: false, ctrlKey: false, target }) as unknown as KeyboardEvent;

test("make diary: one per folder, in its folder, the person's; none without a folder", () => {
  CV.load("denise");
  const r = CV.M.make("diary", "Diary", "kids");
  assert.ok(r.ok, "made on the fixture");
  assert.equal(r.id, "diary:kids");
  const p = CV.D.pieces["diary:kids"];
  assert.equal(p.kind, "diary");
  assert.equal(p.region, "kids");
  assert.equal(CV.D.pos!["diary:kids"]?.by, "person", "placed in its folder as the person's");
  assert.equal(CV.M.make("diary", "Diary", "kids").id, "diary:kids", "a second press opens the one there");
  assert.equal(Object.keys(CV.D.pieces).filter((id) => CV.isFolderDiary(id)).length, 1);
  assert.equal(CV.M.make("diary", "Diary", "nowhere").ok, false, "a folder that is not there");
  assert.equal(CV.M.make("diary", "Diary").ok, false, "the top of the canvas: no folder to scope it");
});

test("live: make diary is kept by its place, and a reload makes the piece again once its folder is back", () => {
  CV.load("denise");
  CV.setMode("live");
  CV.D.regions = []; CV.D.pieces = {}; CV.D.pos = {};
  const sent: Record<string, unknown>[] = [];
  let hear: (m: { type: string; [k: string]: unknown }) => void = () => {};
  const was = planeLink.e;
  const off = planeAttach({ send: (m: Record<string, unknown>) => { sent.push(m); return true; }, subscribe: (f: typeof hear) => { hear = f; return () => {}; } } as never);
  try {
    hear({ type: "home.places", places: [{ id: "house", name: "house" }] });
    const r = CV.M.make("diary", "Diary", "h:house");
    assert.ok(r.ok, "live, not \"not yet\"");
    const set = sent.find((m) => m.type === "next.pos.set" && m.id === "diary:h:house");
    assert.ok(set, "its place goes to the engine");
    assert.equal(set!.by, "person");
    const kept = { x: Number(set!.x), y: Number(set!.y), w: Number(set!.w), h: Number(set!.h), by: "person", touched: false, folded: false, at: 1 };
    // a reload: the places come before the folders they place
    CV.load("denise");
    CV.D.regions = []; CV.D.pieces = {}; CV.D.pos = {};
    hear({ type: "next.state", pos: { "diary:h:house": kept } });
    assert.equal(CV.D.pieces["diary:h:house"], undefined, "no folder yet: no piece");
    hear({ type: "home.places", places: [{ id: "house", name: "house" }] });
    const p = CV.D.pieces["diary:h:house"];
    assert.ok(p, "made again from its place");
    assert.equal(p.kind, "diary");
    assert.equal(p.region, "h:house");
    assert.equal(CV.D.pos!["diary:h:house"]?.by, "person");
  } finally { if (typeof off === "function") off(); planeLink.e = was; CV.setMode("fixture"); }
});

test("up close, Esc and Back go back where the Diary opened from: the canvas, or the folder", () => {
  CV.load("denise");
  const id = CV.M.make("diary", "Diary", "kids").id!;
  CV.M.map();
  CV.M.goto(id);
  assert.ok(atDiary(), "at the Diary, up close");
  assert.equal(backTo(CV.D.pieces[id]), "all your folders", "the canvas, in a newcomer's words");
  assert.ok(diaryKeys(key("Escape")), "Esc is taken");
  assert.equal(CV.S.dist, "far", "Esc: back on the canvas");

  CV.M.goto("kids");
  assert.equal(CV.S.dist, "middle");
  CV.M.goto(id);
  assert.ok(atDiary());
  assert.equal(backTo(CV.D.pieces[id]), CV.regionOf("kids")!.name);
  leaveDiary();   // the Back press and a press outside
  assert.equal(CV.S.dist, "middle", "Back: in the folder it opened from");
  assert.equal(CV.S.region, "kids");

  CV.S.hist.length = 0;   // no history: one step out, to its folder
  CV.M.goto(id); CV.S.hist.length = 0;
  leaveDiary();
  assert.equal(CV.S.dist, "middle");
  assert.equal(CV.S.region, "kids");
});

test("Esc is the Diary's only at the Diary, and words being written keep their field's Esc", () => {
  CV.load("denise");
  const id = CV.M.make("diary", "Diary", "kids").id!;
  CV.M.map();
  assert.equal(diaryKeys(key("Escape")), false, "on the canvas: not the Diary's");
  CV.M.goto(id);
  const field = { matches: () => true, value: "a line half written" };
  assert.equal(diaryKeys(key("Escape", field)), false, "words in the field: the field's Esc");
  assert.ok(atDiary(), "still at the Diary");
  assert.equal(diaryKeys(key("Enter")), false);
  assert.ok(diaryKeys(key("Escape", { matches: () => true, value: "" })), "an empty field: out");
});
