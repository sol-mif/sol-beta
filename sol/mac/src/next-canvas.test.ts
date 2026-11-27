// The folders and the Diary on the canvas (#1879 step 4): the case's rules, the Diary's rows.
import assert from "node:assert/strict";
import { test } from "node:test";
import { caseOf, deadline, subOf } from "./next/plane/case.ts";
import { fitCount, newestFirst } from "./next/diary/rows.ts";
import { countsOf, placeFrom } from "./next/place.ts";
import { readFileSync } from "node:fs";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import * as L from "./next/plane/layout.ts";

test("every folder at rest is one case, its own size, on a grid of even gaps (#1879)", () => {
  for (const name of ["dev-morning", "thirty", "denise"]) {
    CV.load(name);
    const cs = CV.D.regions.filter((r) => !CV.parentOf(r.id)).map((r) => L.caseRect(CV.D.pos![r.id]));
    for (const c of cs) assert.deepEqual([c.w, c.h], [L.CASE_W, L.CASE_H], `${name}: one size`);
    assert.ok(Math.abs(L.CASE_W * L.Z_PERSON - 185) < 1 && Math.abs(L.CASE_H * L.Z_PERSON - 165) < 1, "185 × 165 px at the rest scale");
    for (const a of cs) for (const b of cs) if (a !== b && Math.abs(a.y - b.y) < 1 && b.x > a.x) assert.ok(b.x - (a.x + a.w) >= L.CASE_GAP - 1, `${name}: a gap between neighbours in a row`);
  }
});

test("at rest nothing hangs under a case: the folder card draws no raise", () => {
  const src = readFileSync(new URL("./next/plane/Folder.tsx", import.meta.url), "utf8");
  assert.ok(!/<Raise\b/.test(src));
});

const counts = (asks: number, working: number) => ({ asks, working, quiet: 0, done: 0, pieces: asks + working, files: 0 });

test("the case's count is the folder's asks, the number the sidebar and its tab show", () => {
  const r = { id: "api", name: "api" } as never;
  const asks = [{ id: "a1", piece: "p1" }, { id: "a2", piece: "p2" }] as never[];
  const pl = placeFrom(r, [], asks), c = caseOf(pl, "");
  assert.equal(c.count, pl.counts.asks);
  assert.equal(c.count, countsOf([], asks).asks);
});

test("a folder with nothing waiting and nothing working draws quiet; working or waiting does not", () => {
  assert.equal(caseOf({ sessions: 3, line: "", counts: counts(0, 0) }, "").quiet, true);
  assert.equal(caseOf({ sessions: 3, line: "", counts: counts(2, 0) }, "").quiet, false);
  const w = caseOf({ sessions: 3, line: "", counts: counts(0, 1) }, "");
  assert.equal(w.quiet, false);
  assert.equal(w.working, true);
});

test("the case's line is its sessions in words, else the place's own line, never a made-up one", () => {
  assert.equal(subOf({ sessions: 1, line: "x" }), "One session");
  assert.equal(subOf({ sessions: 3, line: "x" }), "Three sessions");
  assert.equal(subOf({ sessions: 40, line: "x" }), "40 sessions");
  assert.equal(subOf({ sessions: 0, line: "Nothing in it yet" }), "Nothing in it yet");
});

test("the next deadline is the front line's date, said short; none when it has none", () => {
  assert.equal(deadline("Next: Release · Fri"), "Release Fri");
  assert.equal(deadline("Next: Rent"), "Rent");
  assert.equal(deadline("3 PDFs you opened once"), null);
  assert.equal(deadline(""), null);
});

test("the Diary's rows are newest first, an ask waiting now above all", () => {
  const rows = newestFirst([{ id: "a", t: 1 }, { id: "c", t: 3 }, { id: "now", t: Infinity }, { id: "b", t: 2 }]);
  assert.deepEqual(rows.map((r) => r.id), ["now", "c", "b", "a"]);
  assert.deepEqual(newestFirst([{ id: "x", t: 5 }, { id: "y", t: 5 }]).map((r) => r.id), ["x", "y"], "equal times keep their order");
});

test("the Diary shows as many rows as fit, then +N: all when they fit, at least one, room kept for the +N line", () => {
  const ends = [50, 100, 150, 200];
  assert.equal(fitCount(ends, 200, 30), 4, "they fit whole: no +N");
  assert.equal(fitCount(ends, 190, 30), 3, "the last would not fit: three, with room for the +N under them");
  assert.equal(fitCount(ends, 120, 30), 1);
  assert.equal(fitCount(ends, 10, 30), 1, "never none while there is one");
  assert.equal(fitCount([], 100, 30), 0);
});
