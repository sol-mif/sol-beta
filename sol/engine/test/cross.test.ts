import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CrossBook, crossFile, cleanThing, carriedBody, homeLine, lookFromWords, titleOf } from "../src/cross.ts";

// Home and Build, one place (#1031): what crossed by hand stays, and each crossing has its undo
const thing = { id: "t1", words: "the lab report", place: "bio", path: "school › bio 201", knows: [{ kind: "syllabus", label: "the syllabus" }] };

test("a thing from the wire is cleaned: words and folder are needed, an address only if it is http(s)", () => {
  assert.equal(cleanThing({ words: "", place: "bio" }), null);
  assert.equal(cleanThing({ words: "x" }), null);
  assert.equal(cleanThing({ ...thing, url: "javascript:alert(1)" })?.url, undefined);
  assert.equal(cleanThing({ ...thing, url: "https://canvas.example/bio" })?.url, "https://canvas.example/bio");
  assert.equal(cleanThing({ ...thing, knows: Array.from({ length: 40 }, (_, i) => ({ kind: "file", label: `f${i}` })) })?.knows?.length, 12);
});

test("a carried thing's block holds its words, where it came from and what the folder knows", () => {
  const b = carriedBody(cleanThing(thing)!);
  assert.match(b, /^# the lab report/);
  assert.match(b, /From Home › school › bio 201/);
  assert.match(b, /- the syllabus \(syllabus\)/);
});

test("the talk's line names each piece with its folder; no pieces, no line", () => {
  assert.equal(homeLine(undefined), "");
  assert.equal(homeLine([{ words: "" }]), "");
  const l = homeLine([thing]);
  assert.match(l, /brought these from Home/);
  assert.match(l, /Home › school › bio 201: the lab report; the folder knows the syllabus/);
});

test("carried and seated are kept in the file, read back by a new book, and each undoes alone", () => {
  const home = mkdtempSync(join(tmpdir(), "sol-cross-"));
  const a = new CrossBook(crossFile(home));
  const c = a.carried(cleanThing(thing)!, "b-1", "s-1");
  const s = a.seat({ block: "b-2", session: "s-1", place: "bio", title: "the survey", blockKind: "table" });
  const b = new CrossBook(crossFile(home));
  assert.deepEqual(b.state().crossings.map((x) => x.kind), ["carried", "seated"]);
  assert.equal(JSON.parse(readFileSync(crossFile(home), "utf8")).crossings.length, 2);
  assert.equal(b.undo(c.id)?.kind, "carried");
  assert.equal(b.undo(c.id), null);
  assert.deepEqual(b.state().crossings.map((x) => x.id), [s.id]);
});

test("a block sits in one folder at a time: seated again, it moves", () => {
  const a = new CrossBook(crossFile(mkdtempSync(join(tmpdir(), "sol-cross-"))));
  a.seat({ block: "b-2", session: "s-1", place: "bio", title: "t", blockKind: "page" });
  a.seat({ block: "b-2", session: "s-1", place: "thesis", title: "t", blockKind: "page" });
  assert.deepEqual(a.state().crossings.map((x) => x.kind === "seated" && x.place), ["thesis"]);
});

const LOOK = { color: "#000000", alpha: 0.78, blur: 48, bubble: "edge", text: 15, skin: "pearl" };
test("say it: a sentence names the look's rows it moves, each from where it was to where it goes", () => {
  assert.deepEqual(lookFromWords("make the text bigger", LOOK), { patch: { text: 18 }, moved: [{ row: "text", from: 15, to: 18 }] });
  assert.deepEqual(lookFromWords("calmer please", LOOK).patch, { alpha: 0.9, blur: 60 });
  assert.deepEqual(lookFromWords("more see-through, and no blur", LOOK).patch, { alpha: 0.64, blur: 0 });
  assert.deepEqual(lookFromWords("a forest window with glass bubbles", LOOK).patch, { color: "#0c2418", bubble: "glass" });
  assert.deepEqual(lookFromWords("text 20", LOOK).patch, { text: 20 });
  assert.deepEqual(lookFromWords("home in ink", LOOK).patch, { skin: "ink" });
});
test("say it: a sentence that names no row moves nothing, and nothing leaves its range", () => {
  assert.deepEqual(lookFromWords("what's due first in this class?", LOOK), { patch: {}, moved: [] });
  assert.deepEqual(lookFromWords("I love green tea", LOOK).patch, {});   // a colour word with no window named
  assert.deepEqual(lookFromWords("text 40", LOOK).patch, { text: 24 });
  assert.deepEqual(lookFromWords("see through", { ...LOOK, alpha: 0.55 }).patch, { alpha: 0.5 });
  assert.deepEqual(lookFromWords("make the text bigger", { ...LOOK, text: 24 }).moved, []);
});

test("a session's title is the person's words, never the Home line read under them", () => {
  const sent = ["plan my week", homeLine([thing])].join("\n\n");
  assert.equal(titleOf(sent), "plan my week");
  assert.equal(titleOf(sent.replace(/\n+/g, " ")), "plan my week");   // the SDK's first prompt, flattened
  assert.equal(titleOf(homeLine([thing])), "the lab report");          // only a piece sent: its words
  assert.equal(titleOf("no home here"), "no home here");
  assert.equal(titleOf("what's due first? [the stage] on: the lab report › Maya " + homeLine([thing]).replace(/\n/g, " ")), "what's due first?");   // the stage's line too
});

// #1045: his own folders take a block or a whole session; either is there after a reload (a new book reads the file)
test("a session put down on one of his folders is kept by kind, beside a block, and stays after a reload", () => {
  const file = crossFile(mkdtempSync(join(tmpdir(), "cross-his-")));
  const a = new CrossBook(file);
  const sid = "7a1c0a00-0000-4000-8000-000000001045";
  a.seat({ block: "b-lab", session: sid, place: "la245", title: "the lab report", blockKind: "page" });
  a.seat({ block: sid, session: sid, place: "jobs.SF trip", title: "plan the SF trip", blockKind: "session" });
  const b = new CrossBook(file).state().crossings;
  assert.deepEqual(b.map((c) => [c.kind, c.place, (c as { blockKind?: string }).blockKind]), [["seated", "la245", "page"], ["seated", "jobs.SF trip", "session"]]);
  // put down on another folder, it moves; its undo takes it out
  const moved = new CrossBook(file);
  const s = moved.seat({ block: sid, session: sid, place: "is223", title: "plan the SF trip", blockKind: "session" });
  assert.deepEqual(moved.state().crossings.filter((c) => c.kind === "seated" && c.block === sid).map((c) => c.place), ["is223"]);
  moved.undo(s.id);
  assert.equal(new CrossBook(file).state().crossings.length, 1);
});
