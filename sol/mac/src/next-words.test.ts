// node --test src/*.test.ts: the words pass's rows for the canvas and the sidebar (BR1 words, #1615). The ask bar's
// examples are two moves the talk really runs, on the person's own first two folders, never fixed words; "Waiting on you"
// is the list's one name wherever it is a label, and the talk still hears its old name; a quiet folder's card line says
// "Nothing running". Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { voice } from "./next/cv/say/index.ts";
import { QUIET, askHint, countsOf, lineFrom, placeFrom, sayToo } from "./next/place.ts";
import type { Piece, Region } from "./next/cv/types.ts";

const as = (w: string) => { const h = voice(w, "pill"); return h && h.fn ? `${h.fn}(${h.args})` : "none"; };
const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the ask bar says the drawing's words, whole, whatever folders the person has (BR1 conform row 30)", () => {
  assert.equal(askHint(["sol", "misc"]), "Ask, make, or change anything");
  assert.equal(askHint(["newsletter", "a folder with a long name"]), "Ask, make, or change anything", "never a name in it, so never cut mid-word");
  assert.equal(askHint([]), "Ask, make, or change anything");
  assert.match(src("./next/Next.tsx"), /const firstNames = \(\) => folderOrder\(\)\.filter\(\(id\) => !isOff\(id\) && !ancestors\(id\)\.some\(isOff\) && regionOf\(id\)\?\.named !== false\)\.slice\(0, 2\)/,
    "the canvas's own order, as the sidebar lists it; a folder still without a name of its own is skipped (the talk hears names)");
  assert.match(src("./next/Next.tsx"), /placeholder=\{sess \? "Reply, or drag something in" : setup \? "Change how this folder works…" : askHint\(firstNames\(\)\)\}/,
    "the ask bar reads those names (a session it talks to says Reply: inside.html §1; a folder's open setup says setup.html §2's own words)");
});

test("Every move's spoken examples go to the person's own first folder, never a fixed name (BR1 words)", () => {
  assert.equal(sayToo("Garden"), "Say it too: “next ask”, “go to Garden”, “zoom out”, “this is a lot”");
  assert.equal(sayToo(), "Say it too: “next ask”, “zoom out”, “this is a lot”", "no folder kept: no go-to example");
  const next = src("./next/Next.tsx");
  assert.match(next, /\{sayToo\(firstNames\(\)\[0\]\)\}/, "the pop reads the ask bar's first name");
  assert.doesNotMatch(next, /go to api/, "no fixed folder name in the pop");
  CV.load("denise");
  const a = CV.D.regions.find((r) => r.id === CV.folderOrder()[0])!;
  const said = [...sayToo(String(a.name)).matchAll(/“([^”]+)”/g)].map((m) => m[1]).find((s) => s.startsWith("go to "))!;
  assert.notEqual(as(said), "none", "“go to <first folder>” is a move the talk runs");
});

test("opening a folder and archiving one are moves the talk runs, on whichever folders the person has", () => {
  CV.load("denise");
  const [a, b] = CV.folderOrder().map((id) => CV.D.regions.find((r) => r.id === id)!);
  const said = [`open ${a.name}`, `archive ${b.name}`];
  assert.equal(said.length, 2);
  assert.equal(as(said[0]), `folder_open(["${a.id}"])`, "open <folder> opens its page");
  assert.equal(CV.S.page, "folder"); assert.equal(CV.S.folder, a.id);
  assert.equal(as(said[1]), `offCanvas(["${b.id}"])`, "archive <folder>, the ⋯ menu's own word (holders.html)");
  CV.load("denise");
  assert.equal(as(`put ${b.name} on the Shelf`), `offCanvas(["${b.id}"])`, "the old words are still heard");
  CV.load("denise");
  assert.equal(as("open nothing by this name"), "none", "a name no folder has is not a move");
  assert.notEqual(as("open settings"), "none", "settings' own words still reach Settings");
});

test("go to <name>: a folder named so wins over one whose name only contains it", () => {
  CV.load("denise");
  const sol: Region = { id: "w:/code/sol", name: "sol", kind: "code" }, mine: Region = { id: "w:/code/my-sol", name: "my-sol", kind: "code" };
  CV.D.regions.unshift(mine); CV.D.regions.push(sol);
  assert.equal(CV.findByWords("sol"), sol.id, "sol, though my-sol comes first");
  assert.equal(CV.findByWords("my-"), mine.id, "a part of a name still finds it");
  assert.equal(as("go to sol"), `goto(["${sol.id}"])`);
});

test("Waiting on you is the list's name wherever it is a label, and the talk hears both names", () => {
  for (const [f, re] of [["./next/needs/Needs.tsx", /data-m1="what">Waiting on you<\/h1>/], ["./next/Next.tsx", /data-act="needs"[^>]*>Waiting on you</],
    ["./next/notes/read.ts", /\{ id: "needs", say: "Waiting on you" \}/], ["./next/auto/model.ts", /say: "Waiting on you"/],
    ["./next/settings/model.ts", /l: "Waiting on you", k: \["attention"\]/]] as const) assert.match(src(f), re, f);
  const work = src("./next/work/read.ts");
  assert.equal(work.match(/"needs you": "Waiting on you"/g)?.length, 2, "a step's and a run's word");
  for (const w of ["needs you", "waiting on you"]) { CV.load("denise"); assert.equal(as(w), "needs([])", w); }
});

test("a quiet folder's card line: Nothing running, with what is in it; never two dots with nothing between", () => {
  assert.equal(QUIET, "Nothing running");
  const S = (id: string, region: string, state: string): Piece => ({ id, region, kind: "session", name: id, state, term: { lines: [], waiting: null, stateWord: "" } });
  const house: Region = { id: "w:/house", name: "house", kind: "code" };
  assert.equal(placeFrom(house, [], [], 0, 38).line, "Nothing running · 38 sessions");
  assert.equal(placeFrom(house, [S("d1", house.id, "done"), S("d2", house.id, "done")], [], ["Garden", "Kids"]).line, "Nothing running · two sessions · inside: Garden and Kids");
  // sol on try 5: things counted that are none of its own to name, folders in it: it read "Quiet · · inside: dev-web, …"
  assert.equal(lineFrom("quiet", { ...countsOf([], []), pieces: 2 }, [], ["Garden", "Kids"]), "Nothing running · inside: Garden and Kids");
});

test("the canvas's line (a move, a nest after the move-in) waits while Settings, a page or the move-in covers the canvas", () => {
  const bar = src("./next/bar/Bar.tsx");
  assert.match(bar, /const canvas = shown && !onMoveIn\(\);/, "shown: no page (Settings is one), no calm, no code session; and #mvi is not up");
  assert.match(bar, /if \(!float \|\| !canvas\) return; const t = setTimeout\(\(\) => setFloat\(0\), LINE_MS\)/, "its time runs only while the canvas shows");
  assert.match(bar, /frame\.hold\("arrange", canvas && float && did && card !== "arrange" \?/, "held on the frame's line only over the canvas");
  assert.match(src("./next/cv/wire/plane.ts"), /said\(nestWords\(n\), /, "the nest line is the canvas's line");
});

test("2b: away from Far the plane's fade never runs through a card; it drops below one that ends above the bar, else lifts above it", () => {
  const plane = src("./next/plane/index.tsx");
  assert.match(plane, /const foot = vb \? cutNone\(pl, vb, /, "the foot is measured, then moved");
  assert.match(plane, /if \(!foot \|\| S\.dist === "far"\) return foot;/, "Far keeps rule (d)");
  assert.match(plane, /if \(!\(r\.top < line && r\.bottom > line && r\.top > vb\.top\)\) continue;/, "only a card the fade crosses");
  assert.match(plane, /if \(r\.bottom <= bar\) low = Math\.max\(low, r\.bottom\);\n\s+else if \(r\.height < line - vb\.top\) top = Math\.min\(top, r\.top\);/,
    "one ending above the bar is shown whole; one running under it is lifted over, if it fits above");
  assert.match(plane, /return low \? Math\.min\(foot, Math\.round\(vb\.bottom - low - FOOT_FADE\)\) : foot;/);
});
