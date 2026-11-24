// node --test src/*.test.ts: notes and sessions inside a folder in the new face (BR1, frame.html parts 5 and 6; #1615).
// The engine's notes and folders are read through an allowlist; a note is kept as typed, deleted with an Undo, gathered
// with an Undo, sent; a note dropped is held 5 s with an Undo before it is sent; a session moved into a folder says so in one line, and keeps that folder after the plane's own
// list comes again; a session an automation started carries "automation · x" and never an agent's name; the wire says a
// refusal only for its own messages. Signed: marcocyl04-ux's agent, BR1 parts 5 and 6 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanFolder, cleanInFolder, cleanNotes, empty, firstLine, folderShort, sayDrop, sayHeld, saySent, shelfOf, type Notes } from "./next/notes/read.ts";
import { HOLD_MS } from "./next/cv/moves/notes.ts";
import { D, M, S, load, setMode } from "./next/cv/index.ts";
import { FIXTURE } from "./next/cv/fixture.ts";
import { attach, marks } from "./next/cv/wire/notes.ts";
import { link } from "./next/notes/link.ts";

const N = () => D.notes as Notes;
const fresh = () => { assert.ok(FIXTURE["dev-morning"]); load("dev-morning"); D.notes = empty(); };
const aSession = () => Object.values(D.pieces).find((p) => p.kind === "session" && !p.inside && !p.part)!;

test("notes and folders are read by an allowlist: a field the page does not draw never reaches it", () => {
  const [n] = cleanNotes({ notes: [{ id: "note-1", text: "ring the bank", x: 10, y: 20, w: 300, h: 180, folder: null, at: 5, secret: 1 }, { id: "bad id", text: "x" }] });
  assert.equal(n.id, "note-1");
  assert.equal((n as unknown as Record<string, unknown>).secret, undefined);
  assert.equal(cleanNotes({ notes: [{ id: "note-2", text: "x", folder: "../etc" }] })[0]?.folder ?? null, null, "a folder that is not one is dropped");
  assert.deepEqual(cleanInFolder({ sessions: { "s-1": "w:/Users/x/api", "s-2": "nope" } }), { "s-1": "w:/Users/x/api" });
  const f = cleanFolder({ type: "next.folder", folder: "w:/Users/x/api", place: "/Users/x/api", facts: [{ id: "f1", fact: "tests run with npm test", source: "you told this folder", stale: false, home: "/x" }], backs: [{ sessionId: "s-1", title: "fix login", words: "login fixed", at: 9 }], sessions: [] });
  assert.equal(f?.facts[0].fact, "tests run with npm test");
  assert.equal((f?.facts[0] as unknown as Record<string, unknown>).home, undefined);
  assert.equal(f?.backs[0].words, "login fixed");
  assert.equal(cleanFolder({ folder: "nope" }), null);
});

test("the words are plain: an armed drop says what letting go does, a send says what it became, a folder is its short name", () => {
  assert.equal(firstLine("  ring the bank\nabout the card "), "ring the bank");
  assert.equal(sayDrop({ kind: "session", name: "fix login" }), "Give to “fix login” as your next message");
  assert.equal(sayDrop({ kind: "folder", name: "api" }), "Put in api");
  assert.match(sayHeld({ kind: "session", name: "fix login" }), /fix login.*5 seconds/);
  assert.equal(sayHeld({ kind: "folder", name: "api" }), "Put in api");
  assert.match(saySent("session", ""), /new session/i);
  assert.match(saySent("message", "fix login"), /fix login/);
  assert.match(saySent("context", "api"), /api/);
  assert.equal(folderShort("w:/Users/x/api/"), "api");
  const words = [sayDrop({ kind: "session", name: "a" }), sayDrop({ kind: "folder", name: "b" }), sayHeld({ kind: "session", name: "a" }), saySent("session", ""), saySent("message", "a"), saySent("context", "b")].join(" ");
  assert.equal(/provider|local\b|agent/i.test(words), false);
});

test("a session starts on its shelf from what it already says: Needs you, Working, Done", () => {
  assert.equal(shelfOf("working", true), "needs", "an ask on it puts it under Needs you");
  assert.equal(shelfOf("asks you", false), "needs");
  assert.equal(shelfOf("waiting", false), "needs");
  assert.equal(shelfOf("failed", false), "needs");
  assert.equal(shelfOf("working", false), "working");
  assert.equal(shelfOf("starting", false), "working");
  assert.equal(shelfOf("done", false), "done");
  assert.equal(shelfOf("idle", false), "done");
  assert.equal(shelfOf("taken back", false), "done");
});

test("a note on the page: kept as typed, an empty one is never kept, Delete has an Undo, Gather has an Undo, Send takes it off", () => {
  fresh();
  const a = M.note_new(100, 100);
  assert.ok(a.ok && a.id);
  assert.equal(S.noteFocus, a.id);
  M.note_write(a.id!, "");
  assert.equal(N().notes.length, 0, "a note with nothing typed is gone");
  const b = M.note_new(100, 100), c = M.note_new(600, 400);
  M.note_write(b.id!, "ring the bank"); M.note_write(c.id!, "book the dentist");
  assert.equal(N().notes.length, 2);
  M.note_delete(b.id!);
  assert.equal(N().notes.length, 1);
  assert.equal(N().undo?.kind, "note");
  M.note_undo();
  assert.equal(N().notes.length, 2);
  assert.ok(N().notes.some((n) => n.text === "ring the bank"));
  const was = N().notes.map((n) => [n.x, n.y]);
  assert.ok(M.notes_gather().ok);
  const [p, q] = N().notes;
  assert.equal(q.x! - p.x!, 18, "the pile steps by a little");
  M.note_undo();
  assert.deepEqual(N().notes.map((n) => [n.x, n.y]), was, "each note back where it was");
  M.note_move(c.id!, 50, 60);
  assert.deepEqual([N().notes.find((n) => n.id === c.id)!.x, N().notes.find((n) => n.id === c.id)!.y], [50, 60]);
  assert.ok(M.note_send(c.id!, "new").ok);
  assert.equal(N().notes.some((n) => n.id === c.id), false);
  assert.match(N().said ?? "", /new session/i);
  assert.equal(M.note_send(b.id!, "").ok, false, "a send needs where to");
});

test("a session moved into another folder says so in one line, keeps that folder after the plane's list, and has an Undo", () => {
  fresh();
  const s = aSession(), from = s.region, to = D.regions.find((r) => r.id !== from)!;
  const r = M.into_folder(s.id, to.id);
  assert.ok(r.ok);
  assert.equal(D.pieces[s.id].region, to.id);
  assert.match(N().said ?? "", new RegExp(`works in ${to.name.replace(/[()]/g, "\\$&")} from its next message`));
  assert.equal(M.into_folder(s.id, to.id).ok, false, "the same folder is no move");
  D.pieces[s.id].region = from;   // the plane's own list comes again and files it by its project
  marks(D as never);
  assert.equal(D.pieces[s.id].region, to.id, "the person's folder is put back on it");
  assert.equal(N().undo?.kind, "moved", "the line after the drop has an Undo");
  r.undo?.();
  assert.equal(D.pieces[s.id].region, from);
  assert.equal(N().undo, null);
});

test("a note dropped on a session or a folder is held 5 s: Undo inside puts it back unsent; after, the session reads it", (t) => {
  fresh();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const a = M.note_new(100, 100);
  M.note_write(a.id!, "ring the bank");
  const at = { x: N().notes[0].x, y: N().notes[0].y }, s = aSession(), sid = String(s.sessionId ?? s.id);
  assert.equal(M.note_give(a.id!, sid, "piece", "x").ok, false, "only a session or a folder takes a drop");
  assert.ok(M.note_give(a.id!, sid, "session", "fix login").ok);
  assert.equal(N().notes.length, 0, "off the canvas at once");
  assert.equal(N().undo?.kind, "held");
  t.mock.timers.tick(HOLD_MS - 1);
  M.note_undo();
  assert.deepEqual(N().notes.map((n) => [n.text, n.x, n.y]), [["ring the bank", at.x, at.y]], "back where it was, unsent");
  t.mock.timers.tick(HOLD_MS);
  assert.equal(N().said, null, "taken back: nothing is sent later");
  M.note_give(a.id!, sid, "session", "fix login");
  t.mock.timers.tick(HOLD_MS);
  assert.equal(N().undo, null);
  assert.match(N().said ?? "", /fix login.*next message/);
  const b = M.note_new(300, 300), rid = D.regions[0];
  M.note_write(b.id!, "tests run with npm test");
  M.note_give(b.id!, rid.id, "folder", rid.name);
  const c = M.note_new(500, 500);
  M.note_write(c.id!, "a second drop sends the first now");
  M.note_give(c.id!, sid, "session", "fix login");
  assert.match(N().said ?? "", /keeps it/, "one held at a time: the earlier one went");
  assert.equal(N().undo?.kind, "held");
  M.note_undo();
  assert.ok(N().notes.some((n) => n.id === c.id), "the later one taken back");
});

test("live, a held note is sent only after 5 s, and the engine's list does not bring it back meanwhile", (t) => {
  fresh();
  setMode("live");
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let hear: (m: unknown) => void = () => {};
  const sent: { type: string; [k: string]: unknown }[] = [];
  const off = attach({ send: (o: { type: string }) => { sent.push(o); return true; }, subscribe: (f: (m: unknown) => void) => { hear = f; return () => {}; } } as never);
  try {
    const n = M.note_new(10, 10);
    M.note_write(n.id!, "ring the bank");
    assert.ok(M.note_give(n.id!, "sess-1", "session", "fix login").ok);
    assert.equal(N().undo?.kind, "held");
    assert.equal(sent.some((m) => m.type === "next.note.send"), false, "not yet");
    hear({ type: "next.notes", notes: [{ id: n.id, text: "ring the bank", x: 10, y: 10, w: 300, h: 180, folder: null, at: 1 }] });
    assert.equal(N().notes.length, 0, "still held, still off the canvas");
    t.mock.timers.tick(HOLD_MS);
    assert.deepEqual(sent.filter((m) => m.type === "next.note.send"), [{ type: "next.note.send", id: n.id, to: "sess-1" }]);
  } finally { if (typeof off === "function") off(); setMode("fixture"); }
});

test("a session an automation started carries 'automation · x'; no session is given an agent's name", () => {
  fresh();
  const s = aSession();
  D.work = { plans: [], autos: [{ id: "a1", name: "morning digest", last: { sessionId: s.id } }] } as never;
  marks(D as never);
  assert.equal(D.pieces[s.id].label, "automation · morning digest");
  const others = Object.values(D.pieces).filter((p) => p.kind === "session" && p.id !== s.id);
  assert.ok(others.every((p) => p.label === undefined));
});

test("the wire: it asks for notes and folders, keeps the note being typed, holds a deleted note for Undo, and says only its own refusals", () => {
  fresh();
  setMode("live");
  let hear: (m: unknown) => void = () => {};
  const sent: { type: string; [k: string]: unknown }[] = [];
  const off = attach({ send: (o: { type: string }) => { sent.push(o); return true; }, subscribe: (f: (m: unknown) => void) => { hear = f; return () => {}; } } as never);
  try {
    assert.deepEqual(sent.map((s) => s.type), ["next.notes.get", "next.folders.get"]);
    assert.ok(link.e);
    const n = M.note_new(10, 10);
    M.note_write(n.id!, "half a thought");
    assert.equal(sent.at(-1)?.type, "next.note.write");
    assert.equal(sent.at(-1)?.text, "half a thought");
    S.noteFocus = n.id;
    N().notes[0].text = "half a thought, more";
    hear({ type: "next.notes", notes: [{ id: n.id, text: "half a thought", x: 10, y: 10, w: 300, h: 180, folder: null, at: 1 }] });
    assert.equal(N().notes[0].text, "half a thought, more", "the words on screen are not taken back from under the person");
    S.noteFocus = null;
    hear({ type: "next.note.removed", note: { id: n.id, text: "half a thought", x: 10, y: 10, w: 300, h: 180, folder: null, at: 1 } });
    assert.equal(N().undo?.kind, "note");
    M.note_undo();
    assert.equal(sent.at(-1)?.type, "next.note.restore");
    hear({ type: "next.folder.started", folder: "w:/Users/x/api", sessionId: "sess-9" });
    assert.equal(N().inFolder["sess-9"], "w:/Users/x/api");
    hear({ type: "next.refused", asked: "next.note.send", why: "That session has ended; the note stays." });
    assert.match(N().note ?? "", /the note stays/);
    hear({ type: "next.refused", asked: "next.plans.start", why: "not ours" });
    assert.match(N().note ?? "", /the note stays/, "another page's refusal is not said here");
    assert.ok(M.folder_start("w:/Users/x/api", "add a health check").ok);
    assert.deepEqual(sent.at(-1), { type: "next.folder.start", folder: "w:/Users/x/api", text: "add a health check" });
    M.folder_tell("w:/Users/x/api", "tests run with npm test");
    assert.equal(sent.at(-1)?.type, "next.folder.tell");
    // Forget on a folder's fact: the engine's one forget, then the folder read again; Back undoes it the same way
    assert.ok(M.folder_forget("w:/Users/x/api", "fact:f7").ok);
    assert.deepEqual(sent.slice(-2), [{ type: "next.you.fact.forget", k: "fact:f7" }, { type: "next.folder.get", folder: "w:/Users/x/api" }]);
    M.folder_forget("w:/Users/x/api", "fact:f7", true);
    assert.deepEqual(sent.at(-2), { type: "next.you.fact.forget", k: "fact:f7", back: true });
    assert.equal(M.folder_forget("w:/Users/x/api", "seen:w:/Users/x/api:hours").ok, false, "what Sol works out from the fields has nothing to forget");
  } finally { if (typeof off === "function") off(); setMode("fixture"); }
  assert.equal(link.e, null);
});

test("a folder's fact forgotten on the page (no engine): it leaves the folder, and Back brings the same fact back", () => {
  fresh();
  const rid = "w:/Users/you/orders";
  N().folders[rid] = { folder: rid, place: "/Users/you/orders", backs: [], sessions: [], facts: [{ id: "d1", fact: "Orders close at noon", source: "you told this folder", stale: false }] };
  const r = M.folder_forget(rid, "fact:d1");
  assert.ok(r.ok);
  assert.deepEqual(N().folders[rid].facts, []);
  M.folder_forget(rid, "fact:d1", true);
  assert.deepEqual(N().folders[rid].facts.map((f) => f.fact), ["Orders close at noon"]);
});
