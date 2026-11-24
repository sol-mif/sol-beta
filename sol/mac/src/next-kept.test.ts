// node --test src/*.test.ts: a piece kept open beside the canvas (BR1 Q1, keep.html; cv/moves/kept.ts). Keep open closes
// an opened folder and draws the piece beside the canvas, one at a time: keeping a second sends the first to the tab row.
// The pane's ⤢ takes it out to a tab, × closes it, and a tab's "◧ Beside the canvas" brings it back.
// Invented people only (the dev-morning fixture). Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { keptNow } from "./next/cv/moves/kept.ts";
import { TB } from "./next/cv/moves/tabs.ts";

const two = () => Object.values(CV.D.pieces).filter((p) => p.kind === "session").slice(0, 2).map((p) => p.id);

test("Keep open closes the opened folder and keeps the piece beside the canvas", () => {
  CV.load("dev-morning");
  const [a] = two(), rid = String(CV.D.pieces[a].region);
  CV.M.folder_open(rid);
  assert.equal(CV.S.page, "folder");
  assert.equal(CV.M.besideKeep(a).ok, true);
  assert.equal(CV.S.page, null, "the folder closed");
  assert.equal(keptNow(), a);
  assert.equal(CV.M.besideDrop().ok, true);
  assert.equal(keptNow(), null, "× closes it");
  assert.equal(CV.M.besideDrop().ok, false, "nothing kept: nothing to close");
});

test("one at a time: keeping a second sends the first to the tab row, behind", () => {
  CV.load("dev-morning");
  const [a, b] = two();
  CV.M.besideKeep(a);
  CV.M.besideKeep(b);
  assert.equal(keptNow(), b);
  assert.ok(TB().tabs.some((t) => t.id === a), "the first is a tab now");
  assert.notEqual(TB().front, a, "behind, not in front");
  CV.M.besideDrop();
});

test("⤢ takes it out to a tab in front; ◧ from the tab brings it back beside and closes its tab", () => {
  CV.load("dev-morning");
  const [a] = two();
  CV.M.besideKeep(a);
  assert.equal(CV.M.besideTab().ok, true);
  assert.equal(keptNow(), null);
  assert.equal(TB().front, a, "its tab is in front");
  assert.equal(CV.M.besideFromTab(a).ok, true);
  assert.equal(keptNow(), a);
  assert.ok(!TB().tabs.some((t) => t.id === a), "its tab closed");
  CV.M.besideDrop();
});

test("undo puts back what was there: the folder open again, nothing kept", () => {
  CV.load("dev-morning");
  const [a] = two(), rid = String(CV.D.pieces[a].region);
  CV.M.folder_open(rid);
  const r = CV.M.besideKeep(a);
  r.undo();
  assert.equal(keptNow(), null);
  assert.equal(CV.S.page, "folder");
  assert.equal(CV.S.folder, rid);
});

test("the Diary is kept beside too; it has no tab, so keeping another just closes it there", () => {
  CV.load("dev-morning");
  const [a] = two();
  assert.equal(CV.M.besideKeep("diary").ok, true);
  assert.equal(keptNow(), "diary");
  assert.equal(CV.M.besideTab().ok, false, "no ⤢ for the Diary");
  CV.M.besideKeep(a);
  assert.equal(keptNow(), a);
  assert.ok(!TB().tabs.some((t) => t.id === "diary"), "the Diary never goes to the tab row");
  CV.M.besideDrop();
});

test("a piece that is not here is never kept", () => {
  CV.load("dev-morning");
  assert.equal(CV.M.besideKeep("nobody").ok, false);
  assert.equal(keptNow(), null);
});
