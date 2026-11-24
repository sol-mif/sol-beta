// node --test src/*.test.ts: a folder the person sized holds folders (BR1, #1615, the live plane that drew none). The
// engine keeps a person's place without its columns; the folders inside it are still laid out in its cells, at finite
// places, and the camera stays finite. Invented people only (Denise). Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import * as L from "./next/plane/layout.ts";
import { S } from "./next/cv/core.ts";

const R = (id: string) => CV.D.regions.find((r) => r.id === id)!;
const finite = (q: { x: number; y: number; w: number; h: number }) => [q.x, q.y, q.w, q.h].every(Number.isFinite);

test("a person-sized folder with no columns kept: its folders inside sit in its cells, every place finite", () => {
  CV.load("denise");   // house, kids, work
  R("kids").parent = "house";
  R("work").parent = "kids";   // two deep, as the live home's projects › sol/home › its places
  CV.D.pos = { house: { x: 0, y: 1710, w: 904, h: 972, by: "person", touched: true, folded: false, hand: "fold", at: 0 } as never };
  L.layoutPlane();
  const bad = Object.entries(CV.D.pos!).filter(([, q]) => !finite(q)).map(([id]) => id);
  assert.deepEqual(bad, [], "no place at NaN");
  assert.equal(L.colsOf("house"), 2, "as many columns as its width holds");
  const h = CV.D.pos!.house, k = CV.D.pos!.kids;
  assert.ok(k.x >= h.x && k.x + k.w <= h.x + h.w + 0.5, "the folder inside is in its folder's width");
  const b = L.bounds();
  assert.ok(finite(b), "the plane's bounds are finite");
  S.dist = "far";
  L.settleCam();
  assert.ok([S.cam.x, S.cam.y, S.cam.z].every(Number.isFinite), "the camera is finite");
});

test("a place at NaN never moves the camera's bounds", () => {
  CV.load("denise");
  L.layoutPlane();
  const before = L.bounds();
  CV.D.pos!.kids = { ...CV.D.pos!.kids, x: NaN, y: NaN };
  const after = L.bounds();
  assert.ok(finite(after));
  assert.ok(after.w <= before.w + 0.5 && after.h <= before.h + 0.5);
});
