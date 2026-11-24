// BR1 root part 3 (#1615, mine/look/br1/strategy/root.html "A piece at each distance"): formOf picks what a piece draws at
// its size on screen; a name is never cut, it wraps or the piece drops a form, and below far its words are not drawn.
// With invented people: Dev (a coder, repos with long dashed names) and Denise (a writer, a Life folder of notes). Then
// every zoom step on every fixture scene, and the lint: no band switch, no cut on a canvas name.
// Signed: marcocyl04-ux's agent (builder E), BR1 root (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import * as L from "./next/plane/layout.ts";
import { FACE_PX, LINES, farWord, fits, folderSays, formOf, lineSays, linesOf, nearLine, opened, widthOf, wordsOf, wordsShown } from "./next/form.ts";
import { placeFrom, placeOf } from "./next/place.ts";
import type { Piece, Region } from "./next/cv/types.ts";
import { TYPE } from "./kit/tokens.ts";

const R = (id: string, name: string, more: Partial<Region> = {}): Region => ({ id, name, kind: id.startsWith("h:") ? "life" : "code", ...more });
const S = (id: string, region: string, state: string): Piece => ({ id, region, kind: "session", name: id, state, term: { lines: [], waiting: null, stateWord: "" } });
const N = (id: string, region: string): Piece => ({ id, region, kind: "sticky", name: id, text: "plant the bulbs" });

// ---------------------------------------------------------------- the measure

test("a name breaks only after a space, a dash, a slash, an underscore or a dot", () => {
  assert.deepEqual(wordsOf("clean-room redesign"), ["clean-", "room ", "redesign"]);
  assert.deepEqual(wordsOf("dev/api_v2.final"), ["dev/", "api_", "v2.", "final"]);
});

test("a word wider than the room cannot be set whole: Infinity lines, never a cut", () => {
  const w = widthOf("authentication", TYPE.head[0], true);
  assert.equal(linesOf("authentication", TYPE.head[0], w + 1, true), 1);
  assert.equal(linesOf("authentication", TYPE.head[0], w - 1, true), Infinity);
  assert.equal(linesOf("migrate the sessions table", TYPE.head[0], widthOf("sessions table", TYPE.head[0], true) + 1, true), 2);
});

// ---------------------------------------------------------------- Dev's folders

const devApi = R("w:/code/payments-reconciliation-service", "payments-reconciliation-service");
const dev = placeFrom(devApi, [S("a", devApi.id, "working"), S("b", devApi.id, "working"), S("c", devApi.id, "working"), S("d", devApi.id, "idle")], []);

test("Dev's folder far off: its name and one word with its count", () => {
  assert.equal(farWord(dev), "3 working");
  assert.deepEqual(folderSays(dev).far, [["payments-reconciliation-service", "head"], ["3 working", "label"]]);
  assert.equal(farWord(placeFrom(devApi, Array.from({ length: 38 }, (_, i) => S("o" + i, devApi.id, "idle")), [])), "38 sessions");
});

test("an empty folder says one line in every view: far off as near, never blank far and \"Nothing in it yet\" near (try 5, BR1 #1615)", () => {
  const nw = placeFrom(R("w:/new", "World Building"), [], []), says = folderSays(nw);
  assert.equal(nw.line, "Nothing in it yet");
  assert.equal(farWord(nw), nw.line);
  assert.deepEqual(says.far, [["World Building", "head"], ["Nothing in it yet", "label"]]);
  assert.equal(nearLine(says), nw.line, "near: the same line");
  assert.equal(farWord(placeFrom(R("w:/new", "World Building"), [], [], 0, 0, false)), "Reading…", "before the sessions are heard: the same Reading… near and far");
  // a card too small for the line: its name alone, as with any word, never a part of the line
  const shown = Array.from({ length: 400 }, (_, w) => wordsShown(says, w + 1, 60));
  assert.ok(shown.includes(1) && shown.includes(2), "some cards draw the name alone, wider ones the name and the line");
  assert.deepEqual([...shown].sort((a, b) => a - b), shown, "a wider card never says less");
});

test("a quiet folder far off says its line's count in its line's words (BR1 words): 38 sessions, 3 notes, never \"quiet\"", () => {
  const quiet = placeFrom(devApi, [], [], 0, 38);
  assert.equal(quiet.line, "Nothing running · 38 sessions");
  assert.equal(farWord(quiet), "38 sessions", "near says Nothing running · 38 sessions, far the same count and word");
  assert.equal(farWord(placeFrom(devApi, [], [], 0, 1)), "1 session");
  const garden = R("h:garden", "Garden");
  assert.equal(farWord(placeFrom(garden, [N("n1", garden.id), N("n2", garden.id), N("n3", garden.id)], [])), "3 notes", "Denise's notes: near \"three notes\", far \"3 notes\"");
});

test("far off, a folder at rest says its one count, the number its line says (BR1 hold 3)", () => {
  const two = [S("d1", devApi.id, "done"), S("d2", devApi.id, "done")], n = (f: ReturnType<typeof placeFrom>) => f.line.match(/\d+/)?.[0];
  const read = placeFrom(devApi, two, [], 0, 495);
  assert.equal(farWord(read), "495 sessions", "two drawn done of 495 read: never \"2 done\" or a third number");
  assert.equal(n(read), "495");
  assert.equal(farWord(placeFrom(devApi, two, [])), "2 done", "all of its sessions drawn and done");
  assert.equal(farWord(placeFrom(devApi, [], [], 0, 38)), "38 sessions", "none drawn: the read's");
});

test("Dev's folder by width: near once its name and line fit, far below, and its words gone when even far does not fit", () => {
  const says = folderSays(dev), tall = 400;
  const steps = [600, 300, 212, 160, 120, 90, 60, 36].map((w) => ({ w, form: formOf(says, w, tall, Infinity), words: wordsShown(says, w, tall) }));
  const order = { far: 0, near: 1, whole: 2 };
  for (let i = 1; i < steps.length; i++) assert.ok(order[steps[i].form] <= order[steps[i - 1].form], `narrower never draws a bigger form: ${JSON.stringify(steps)}`);
  assert.equal(steps[0].form, "near");
  assert.equal(steps.at(-1)!.form, "far");
  assert.equal(steps.at(-1)!.words, 0, "36px: the shape alone");
  for (const s of steps) if (s.form === "far" && s.words) assert.ok(s.words === 2 || !fits(says.far, s.w, tall), "the word drops before the name");
  for (const s of steps) if (s.form === "near") assert.ok(fits(says.near, s.w, tall));
});

test("a short card drops a form even when it is wide: the height counts", () => {
  const says = folderSays(dev);
  assert.equal(formOf(says, 600, 400, Infinity), "near");
  assert.equal(formOf(says, 600, 30, Infinity), "far");
  assert.equal(wordsShown(says, 600, 30), 0, "too short even for its name");
});

test("far drops its word before its name: a card tall enough for one line keeps Dev's folder's name", () => {
  const says = folderSays(dev), one = 2 * 12 + TYPE.head[1], two = one + 4 + TYPE.label[1];
  assert.equal(wordsShown(says, 600, two), 2, "name and \"3 working\"");
  assert.equal(wordsShown(says, 600, one), 1, "the name alone");
  assert.equal(wordsShown(says, 600, one - 1), 0, "the shape alone");
  assert.equal(wordsShown(folderSays(placeFrom(R("w:/new", "new"), [], [])), 600, one), 1, "an empty folder's far is its name alone");
});

test("a folder opens (whole) when its pieces are a face wide: the same width on screen for every folder", () => {
  assert.equal(opened(904, FACE_PX / 400 - 0.001, 400), false);
  assert.equal(opened(904, FACE_PX / 400, 400), true);
  assert.equal(opened(2000, FACE_PX / 400, 400), true, "a wider folder opens at the same zoom: its pieces are the same width");
  assert.equal(formOf(folderSays(dev), FACE_PX, Infinity), "whole");
});

// ---------------------------------------------------------------- Denise's notes and a session's line

test("Denise's note as a line: near says its state, far its name, below that its dot", () => {
  const says = lineSays("plant the bulbs before the frost", "a page");
  const wide = widthOf("plant the bulbs before the frost", TYPE.head[0], true) + 40;
  assert.equal(formOf(says, wide + widthOf("a page", TYPE.label[0]), Infinity, Infinity), "near");
  assert.equal(formOf(says, 20, Infinity, Infinity), "far");
  assert.equal(wordsShown(says, 20), 0);
  assert.equal(wordsShown(says, wide), 1);
});

test("a name of more than two lines' worth drops a form; never a third line", () => {
  const long = "the quarterly reconciliation of every payment provider and its refunds";
  const w = 140;
  assert.ok(linesOf(long, TYPE.read[0], w - 24, true) > LINES);
  assert.equal(fits([[long, "read"]], w), false);
});

// ---------------------------------------------------------------- every zoom step, every scene

const SIZE: [number, number][] = [[1440, 900], [2560, 1440]];
test("every scene, every zoom step: a folder is opened exactly when it draws whole, and its words fit whenever drawn", () => {
  let seen = 0;
  for (const name of Object.keys(CV.SCEN)) {
    if (!CV.load(name)) continue;
    for (const [vw, vh] of SIZE) {
      for (let z = L.ZMIN; z <= L.ZMAX; z *= L.ZSTEP) {
        for (const r of CV.D.regions) {
          const q = CV.D.pos?.[r.id];
          if (!q) continue;
          const says = folderSays(placeOf(r.id)), w = q.w * z, h = q.h * z * 0.66;
          const form = L.openAt(r.id, { x: 0, y: 0, z }) ? "whole" : formOf(says, w, h, Infinity);
          assert.equal(form === "whole", L.PIECE_W * z >= FACE_PX, `${name} ${vw}×${vh} z ${z.toFixed(3)}: ${r.id}`);
          if (form === "near") assert.ok(fits(says.near, w, h), `${name}: ${r.id} near at ${w.toFixed(0)}px`);
          seen++;
        }
      }
    }
  }
  assert.ok(seen > 500, `folders at every zoom step: ${seen}`);
});

// ---------------------------------------------------------------- the lint

test("the two-band switch and the canvas's cuts are gone", () => {
  const src = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
  assert.doesNotMatch(src("./next/plane/layout.ts"), /\bbandOf\b|\bBAND_PX\b|\bZ_MID\b/, "layout.ts: no band switch");
  const CANVAS = ["./next/plane/plane.css", "./next/plane/folder.css", "./next/plane/pieces.css", "./next/pieces/pieces.css", "./next/lead/lead.css", "./next/notes/notes.css"];
  const hits = CANVAS.flatMap((f) => src(f).split("\n").map((l, i) => [f, i + 1, l] as const).filter(([, , l]) => /text-overflow:\s*ellipsis|line-clamp/.test(l)).map(([f, n]) => `${f}:${n}`));
  assert.deepEqual(hits, [], "a name on the canvas wraps or drops a form, never an ellipsis or a clamp");
});

// BR1 (orchestrator 07:32, #1615): the folders inside are named on the line, and naming them never drops a card a form
test("a card too small for the folders inside says its line without them, and stays near", () => {
  const sol = placeFrom(R("w:/code/sol", "sol"), [], [], ["clean-room", "engine", "mac", "web", "site", "docs", "app"], 495);
  assert.equal(sol.line, "Nothing running · 495 sessions · inside: clean-room, engine and 5 more");
  assert.equal(sol.bare, "Nothing running · 495 sessions");
  const one = 2 * 12 + TYPE.read[1] + 4 + TYPE.head[1];   // the name and one line of the line
  assert.equal(nearLine(folderSays(sol, [], 300, one)), "Nothing running · 495 sessions", "a wider card: the bare line");
  assert.equal(nearLine(folderSays(sol, [], 212, one)), "495 sessions", "a rest-size card: its count, the quiet word left out (BR1 words)");
  assert.equal(formOf(folderSays(sol, [], 212, one), 212, one, Infinity), "near", "still near, its line drawn");
  assert.equal(nearLine(folderSays(sol, [], 600, 400)), sol.line, "room for it: the whole line");
  assert.equal(nearLine(folderSays(sol)), sol.line, "no box given: the whole line");
});
