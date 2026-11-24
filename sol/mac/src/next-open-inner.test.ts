// node --test src/*.test.ts: opening a folder shows the folders inside it and opens each (H3, BR1 #1615). The folder its
// card says "inside: …" of lists those folders under its head, each with its own card line, each opening as it did; the
// path names every folder on the way ("All folders / house / kids"), each step opening its own folder.
// Invented people only (Denise). Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { folderPath, placeOf } from "./next/place.ts";
import { barHere } from "./next/bar/here.ts";

const R = (id: string) => CV.D.regions.find((r) => r.id === id)!;

test("an opened folder's path names every folder it sits in, outermost first, then itself", () => {
  CV.load("denise");   // house, kids, work
  R("kids").parent = "house";
  assert.deepEqual(folderPath("kids").map((f) => f.name), [R("house").name, R("kids").name]);
  assert.deepEqual(folderPath("house").map((f) => f.id), ["house"], "a folder at the top: itself alone");
  R("work").parent = "kids";
  assert.deepEqual(folderPath("work").map((f) => f.id), ["house", "kids", "work"], "three deep: every step");
  assert.deepEqual(folderPath("gone"), [], "a folder that is gone: nothing");
  delete R("work").parent; delete R("kids").parent;
});

test("the folder the card says is inside is the one the opened folder lists, and opening it opens that folder", () => {
  CV.load("denise");
  R("kids").parent = "house";
  assert.match(placeOf("house").line, new RegExp(`inside: ${R("kids").name}`), "the card names it");
  assert.deepEqual(CV.childrenOf("house"), ["kids"], "the opened folder lists the same");
  assert.equal(CV.M.folder_open("kids").ok, true);
  assert.equal(CV.S.page, "folder");
  assert.equal(CV.S.folder, "kids");
  assert.equal(CV.act("folder_open:house").ok, true, "a crumb's step opens its folder");
  assert.equal(CV.S.folder, "house");
  delete R("kids").parent;
});

test("the folder page draws its inner folders as buttons that open them, and the crumb draws every step", () => {
  const page = readFileSync(new URL("./next/folder/index.tsx", import.meta.url), "utf8");
  assert.match(page, /<Inside rid=\{v\.rid\} name=\{r\.name\} \/>/, "drawn under the head");
  assert.match(page, /childrenOf\(rid\)/);
  assert.match(page, /onClick=\{\(\) => M\.folder_open\(c\)\}/);
  const next = readFileSync(new URL("./next/Next.tsx", import.meta.url), "utf8");
  assert.match(next, /folderPath\(String\(S\.folder\)\)/);
  assert.match(next, /act: `folder_open:\$\{a\.id\}`/);
});

test("an opened folder keeps the bar, another page does not; the bar's − closes the folder (BR1 conform 2, bar-folder.html #open)", () => {
  CV.load("denise");
  CV.S.page = null; CV.S.dist = "far"; CV.S.calm = false;
  assert.equal(barHere(), true, "the canvas, far: the bar");
  assert.equal(CV.M.folder_open("kids").ok, true);
  assert.equal(barHere(), true, "a folder opened: the bar stays");
  CV.S.page = "settings";
  assert.equal(barHere(), false, "Settings: no bar");
  CV.S.page = "work";
  assert.equal(barHere(), false, "another page: no bar");
  assert.equal(CV.M.folder_open("kids").ok, true);
  assert.equal(CV.M.out().ok, true);
  assert.equal(CV.S.page, null, "− (M.out) closes the opened folder");
  const bar = readFileSync(new URL("./next/bar/Bar.tsx", import.meta.url), "utf8");
  assert.match(bar, /disabled=\{band === "far" && !folder\} onClick=\{\(\) => M\.out\(\)\}/, "− stays pressable over an opened folder at far");
  assert.match(bar, /S\.page === "folder" && S\.folder/, "Add drops into the opened folder");
});
