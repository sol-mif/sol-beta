// node --test src/*.test.ts: a folder's setup in fit mode (BR1 people item 2, #1615; mine/look/br1/three.html "every
// folder has a setup … its agent sorts new things in, every move shown and undoable"): every word is the engine's
// (next.folder.setup), a take of a field is the engine's preview and Keep, Back and Undo send its token; "Use this
// setup" and "Sort now" ask the engine; a sort's moves come back with the run, and its Undo sends next.folder.sort.back.
// Live only: on the fixture none of it moves. Signed: marcocyl04-ux's agent, BR1 people item 2 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { FSs, fsLink, heard, lookOf, type FolderSetup } from "./next/cv/moves/setup.ts";
import { MOVE_FN, PERSON_ONLY } from "./next/agent/calls.ts";

const setup = (o: Partial<FolderSetup> = {}): FolderSetup => ({
  folder: "h:school", scope: "home/school", because: ["Sol saw dates ahead in syllabus.md"], history: false, set: null, look: "notebook", sorts: true,
  fields: [
    { field: "job", n: "What it’s for", take: "learn", name: "Learning", by: "default", takes: [{ id: "learn", n: "Learning" }, { id: "keep", n: "Keeping" }] },
    { field: "order", n: "How it’s organized", take: "week", name: "By week", by: "default", takes: [{ id: "week", n: "By week" }, { id: "recent", n: "Newest first" }] },
  ],
  ...o,
});

test("on the fixture: nothing moves, nothing is sent", () => {
  CV.load("dev-week");
  const sent: object[] = [];
  fsLink.e = { send: (o: object) => { sent.push(o); return true; } } as never;
  try {
    assert.equal(CV.M.fsLoad("h:school").ok, false);
    assert.equal(CV.M.fsSort("h:school").ok, false);
    assert.deepEqual(sent, []);
  } finally { fsLink.e = null; }
});

test("live: the engine's setup is drawn as it says; a take is its preview, Keep sends the token, Undo takes it back", () => {
  CV.load("dev-week");
  const sent: Record<string, unknown>[] = [];
  fsLink.e = { send: (o: object) => { sent.push(o as Record<string, unknown>); return true; } } as never;
  CV.setMode("live");
  try {
    assert.ok(CV.M.fsLoad("h:school").ok);
    assert.deepEqual(sent.at(-1), { type: "next.folder.setup", folder: "h:school" });
    heard({ type: "next.folder.setup", setup: setup() });
    assert.equal(FSs().by["h:school"].because[0], "Sol saw dates ahead in syllabus.md");
    assert.ok(!("kind" in FSs().by["h:school"]), "no folder is read as a kind");
    assert.equal(lookOf("h:school"), "notebook", "its look is drawn from the engine's word");
    assert.equal(CV.M.fsTry("h:school", "order", "week").ok, false, "what stands there already is not a try");
    assert.equal(CV.M.fsTry("h:school", "order", "nope").ok, false, "a take the engine did not offer is not tried");
    assert.ok(CV.M.fsTry("h:school", "order", "recent").ok);
    assert.deepEqual(sent.at(-1), { type: "next.folder.setup.set", folder: "h:school", field: "order", take: "recent", by: "pick" });
    assert.equal(FSs().trying?.token, null);
    assert.equal(CV.M.fsKeep().ok, false, "nothing to keep before the preview comes");
    heard({ type: "next.folder.setup.set", preview: { token: "old", changes: [{ folder: "h:school", field: "job", to: "keep" }] } });
    assert.deepEqual(sent.at(-1), { type: "next.folder.setup.set", folder: "h:school", token: "old", back: true }, "a preview for another try is sent back");
    heard({ type: "next.folder.setup.set", preview: { token: "t1", changes: [{ folder: "h:school", field: "order", to: "recent", fromN: "By week", toN: "Newest first" }] } });
    assert.equal(FSs().trying?.token, "t1");
    assert.equal(FSs().trying?.fromN, "By week");
    assert.ok(CV.M.fsKeep().ok);
    assert.deepEqual(sent.at(-1), { type: "next.folder.setup.set", folder: "h:school", token: "t1", keep: true });
    heard({ type: "next.folder.setup.set", kept: true, token: "t1", setup: setup({ set: { at: 1, by: "person" } }) });
    assert.equal(FSs().trying, null);
    assert.equal(FSs().kept?.toN, "Newest first");
    assert.ok(CV.M.fsUndo().ok);
    assert.deepEqual(sent.at(-1), { type: "next.folder.setup.set", folder: "h:school", token: "t1", back: true });
    heard({ type: "next.folder.setup.set", back: true, token: "t1" });
    assert.equal(FSs().kept, null);
    // a try then Back: the preview is let go
    CV.M.fsTry("h:school", "job", "keep");
    heard({ type: "next.folder.setup.set", preview: { token: "t2", changes: [{ folder: "h:school", field: "job", to: "keep" }] } });
    assert.ok(CV.M.fsBack().ok);
    assert.deepEqual(sent.at(-1), { type: "next.folder.setup.set", folder: "h:school", token: "t2", back: true });
    assert.equal(FSs().trying, null);
    // a refusal is said where the try is
    CV.M.fsTry("h:school", "job", "keep");
    heard({ type: "next.folder.setup.set", ok: false, why: "That folder is gone." });
    assert.equal(FSs().trying?.why, "That folder is gone.");
    CV.M.fsBack();
  } finally { CV.setMode("fixture"); fsLink.e = null; }
});

test("live: Use this setup, Sort now, the run's moves and its Undo; a refusal is said", () => {
  CV.load("dev-week");
  const sent: Record<string, unknown>[] = [];
  fsLink.e = { send: (o: object) => { sent.push(o as Record<string, unknown>); return true; } } as never;
  CV.setMode("live");
  try {
    heard({ type: "next.folder.setups", setups: [setup(), setup({ folder: "w:work/acme", scope: "work/acme", history: true, look: "workbench", sorts: false })] });
    assert.equal(lookOf("w:work/acme"), "workbench");
    assert.equal(CV.M.fsUse("w:nowhere").ok, false, "a folder the engine never said is not set up");
    assert.ok(CV.M.fsUse("h:school").ok);
    assert.deepEqual(sent.at(-1), { type: "next.folder.setup.keep", folder: "h:school" });
    assert.ok(CV.M.fsSort("h:school").ok);
    assert.deepEqual(sent.at(-1), { type: "next.folder.sort", folder: "h:school" });
    const run = { id: "r1", at: 2, folder: "h:school", by: "person" as const, moves: [{ thing: { kind: "note" as const, id: "n1", label: "Lecture 3 notes" }, from: "h:school", to: "h:school/week-16-nov", toN: "Week of 16 Nov 2026", why: "made that week", made: true }] };
    heard({ type: "next.folder.sorted", run });
    assert.equal(FSs().runs["h:school"].moves[0].toN, "Week of 16 Nov 2026");
    assert.ok(CV.M.fsSortBack("r1").ok);
    assert.deepEqual(sent.at(-1), { type: "next.folder.sort.back", run: "r1" });
    assert.ok(CV.M.fsSortBack("r1", 0).ok);
    assert.deepEqual(sent.at(-1), { type: "next.folder.sort.back", run: "r1", move: 0 });
    heard({ type: "next.folder.sorted", run: null, refused: [{ why: "Sol never sorts inside a code project." }] });
    assert.equal(FSs().says, "Sol never sorts inside a code project.");
    heard({ type: "next.folder.sort", ok: false, why: "Sol is paused." });
    assert.equal(FSs().says, "Sol is paused.");
  } finally { CV.setMode("fixture"); fsLink.e = null; }
});

test("the AI's side: it may look and offer; keeping, setting up and taking a sort back are the person's", () => {
  for (const m of ["fsLoad", "fsTry", "fsKeep", "fsBack", "fsUndo", "fsUse", "fsSort", "fsSortBack"]) assert.ok(MOVE_FN[m], `function for ${m}`);
  for (const m of ["fsKeep", "fsUndo", "fsUse", "fsSortBack"]) assert.equal(PERSON_ONLY[m], "setting");
  assert.equal(PERSON_ONLY.fsTry, undefined);
});
