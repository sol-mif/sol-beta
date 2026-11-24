// A note is a session not sent, and sessions inside a folder (BR1, frame.html parts 5 and 6; notes.ts, folders.ts).
// Against a temp SOL_HOME with fake session hands, so no session starts.
// Signed: marcocyl04-ux's agent, BR1 parts 5 and 6 (#1615).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "sol-next-notes-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
process.env.SOL_STATE = join(tmp, "state", "work.json");
process.env.SOL_LOGDIR = join(tmp, "log");
const N = await import("./notes.js");
const F = await import("./folders.js");
const C = await import("./context.js");
const { dayOf, readDay } = await import("./diary.js");
let n = 0;
const home = () => { const d = join(tmp, `h${++n}`); mkdirSync(d, { recursive: true }); return d; };

function fakeHands() {
  const st = new Map<string, "working" | "idle" | "asks">(), words = new Map<string, string>();
  const started: { id: string; text: string; cwd: string; title: string }[] = [], said: { id: string; text: string }[] = [];
  const hands: import("./folders.js").FolderHands = {
    start: async (id, text, o) => { started.push({ id, text, cwd: o.cwd, title: o.title }); st.set(id, "working"); },
    status: (id) => st.get(id) ?? "idle",
    lastWords: async (id) => words.get(id) ?? "",
    say: async (id, text) => { said.push({ id, text }); },
  };
  return { hands, st, words, started, said };
}
const API = "w:/tmp/code/api", HOME_ERRANDS = "h:errands";

test("a note is kept as typed, through a restart; nothing typed is never kept; Undo puts a removed note back", () => {
  const h = home();
  assert.deepEqual(N.write(h, { text: "   " }), { ok: true, note: null }, "nothing typed: no note");
  assert.equal(N.readNotes(h).length, 0);
  const a = N.write(h, { text: "Ask about the radiator", x: 10, y: 20 });
  assert.ok(a.ok && a.note && a.fresh);
  const id = a.ok && a.note ? a.note.id : "";
  const b = N.write(h, { id, text: "Ask about the radiator before the lease renewal" });
  assert.ok(b.ok && !("fresh" in b && b.fresh), "an edit is not a new note");
  // a restart reads the same file
  const again = N.readNotes(h);
  assert.equal(again.length, 1);
  assert.equal(again[0].text, "Ask about the radiator before the lease renewal");
  assert.equal(again[0].x, 10);
  assert.equal(JSON.parse(readFileSync(N.notesFile(h), "utf8")).v, 1);
  // all words deleted: the note goes
  assert.ok(N.write(h, { id, text: "" }).ok);
  assert.equal(N.readNotes(h).length, 0);
  const c = N.write(h, { text: "Call the plumber", x: 0, y: 0 });
  const cid = c.ok && c.note ? c.note.id : "";
  const r = N.remove(h, { id: cid });
  assert.ok(r.ok);
  assert.equal(N.readNotes(h).length, 0);
  assert.ok(r.ok && N.restore(h, { note: r.note }).ok);
  assert.equal(N.readNotes(h)[0].text, "Call the plumber");
  assert.equal(N.remove(h, { id: "note-nothere" }).ok, false);
});

test("a note moves on the canvas or into a folder; Gather notes piles the loose ones and Undo puts them back", () => {
  const h = home();
  const ids = ["one", "two", "three"].map((t, i) => { const r = N.write(h, { text: t, x: i * 500, y: i * 300 }); return r.ok && r.note ? r.note.id : ""; });
  assert.ok(N.move(h, { id: ids[2], folder: API }).ok);
  assert.equal(N.move(h, { id: ids[2], folder: "/not/a/folder" }).ok, false);
  const g = N.gather(h, { x: 1000, y: 1000 });
  assert.ok(g.ok && g.moved === 2, "the note in a folder stays where it is");
  const now = N.readNotes(h);
  assert.deepEqual([now[0].x, now[0].y, now[1].x, now[1].y], [1000, 1000, 1018, 1026]);
  assert.ok(g.ok && N.put(h, { was: g.was }).ok);
  assert.deepEqual(N.readNotes(h).slice(0, 2).map((x) => [x.x, x.y]), [[0, 0], [500, 300]]);
  assert.equal(N.gather(h, { x: 0, y: 0 }).ok, true);
  const h2 = home();
  N.write(h2, { text: "alone", x: 0, y: 0 });
  assert.equal(N.gather(h2, { x: 0, y: 0 }).ok, false, "one note is no pile");
});

test("a note sent: a new session (in its folder, with the folder's context first), a session's next message, or a folder's context", async () => {
  const h = home(), f = fakeHands();
  assert.ok(F.tell(h, { folder: API, text: "Uses pnpm; never push to main" }).ok);
  const loose = N.write(h, { text: "Plan my Lisbon trip", x: 0, y: 0 });
  const inApi = N.write(h, { text: "Fix the login cookie", x: 0, y: 0, folder: API });
  const toS = N.write(h, { text: "Also check the export job", x: 0, y: 0 });
  const toF = N.write(h, { text: "Bins go out on Tuesday", x: 0, y: 0 });
  const id = (r: typeof loose) => (r.ok && r.note ? r.note.id : "");

  const a = await F.sendNote(h, { id: id(loose), to: "new" }, f.hands);
  assert.ok(a.ok && a.became === "session");
  assert.equal(f.started[0].text, "Plan my Lisbon trip", "a loose note is the session's first message as it is");

  const b = await F.sendNote(h, { id: id(inApi), to: "new" }, f.hands);
  assert.ok(b.ok && b.became === "session");
  assert.equal(f.started[1].cwd, "/tmp/code/api", "it runs in the folder's place");
  assert.match(f.started[1].text, /<folder context>[\s\S]*Uses pnpm; never push to main[\s\S]*<\/folder context>\n\nFix the login cookie$/);
  assert.equal(F.foldersMsg(h).sessions[b.ok ? b.sessionId! : ""], API);

  const c = await F.sendNote(h, { id: id(toS), to: "11111111-2222-3333-4444-555555555555" }, f.hands);
  assert.ok(c.ok && c.became === "message");
  assert.deepEqual(f.said[0], { id: "11111111-2222-3333-4444-555555555555", text: "Also check the export job" }, "the text alone, queued by the session's own line");

  const d = await F.sendNote(h, { id: id(toF), to: HOME_ERRANDS }, f.hands);
  assert.ok(d.ok && d.became === "context");
  assert.deepEqual(C.wordsAt(h, HOME_ERRANDS), ["Bins go out on Tuesday"], "every session started there knows it");
  assert.match(F.contextText(h, HOME_ERRANDS), /Bins go out on Tuesday/);

  assert.equal(N.readNotes(h).length, 0, "a sent note leaves the canvas");
  assert.equal((await F.sendNote(h, { id: id(toF), to: "new" }, f.hands)).ok, false);
  const e = N.write(h, { text: "x", x: 0, y: 0 });
  assert.equal((await F.sendNote(h, { id: id(e), to: "/etc" }, f.hands)).ok, false, "nowhere a note can go");
  assert.equal(N.readNotes(h).length, 1, "a failed send keeps the note");
});

test("a session in a folder writes back when it finishes, once a day in the Diary; a move takes up the new folder's context", async () => {
  const h = home(), f = fakeHands();
  const s = await F.startIn(h, { folder: API, text: "Migrate the users table" }, f.hands);
  assert.ok(s.ok);
  const sid = s.ok ? s.sessionId : "";
  assert.equal((await F.startIn(h, { folder: API, text: "  " }, f.hands)).ok, false, "a session in a folder needs words");
  // its pages, as the face names them, are said once in its context (BR1 conform #3); none, no line
  assert.doesNotMatch(f.started[0].text, /Its pages in Sol/);
  await F.startIn(h, { folder: API, text: "Tidy the docs", pages: ["Arrivals", "Release notes", 7, " "] }, f.hands);
  assert.match(f.started[1].text, /\nIts pages in Sol: Arrivals · Release notes\n[\s\S]*<\/folder context>\n\nTidy the docs$/);
  assert.deepEqual(await F.watch(h, f.hands), [], "working: nothing to write back yet");
  f.st.set(sid, "idle"); f.words.set(sid, "Moved 8 of 9 tables. Decided: keep the old users table read-only for a week.");
  assert.deepEqual(await F.watch(h, f.hands), [API]);
  const msg = F.folderMsg(h, API);
  assert.equal(msg.backs[0].sessionId, sid);
  assert.match(msg.backs[0].words, /read-only for a week/);
  assert.match(F.contextText(h, API), /data, not instructions[\s\S]*read-only for a week/, "the next session starts from there");
  const lines = readDay(h, dayOf(new Date()));
  assert.equal(lines.length, 1);
  assert.match(lines[0].words, /“Migrate the users table” finished in api/);
  // a second turn that ends the same day replaces its write-back, and writes no second Diary line
  f.st.set(sid, "working"); await F.watch(h, f.hands);
  f.st.set(sid, "idle"); f.words.set(sid, "All 9 tables moved."); await F.watch(h, f.hands);
  assert.equal(F.folderMsg(h, API).backs.length, 1);
  assert.match(F.folderMsg(h, API).backs[0].words, /All 9/);
  assert.equal(readDay(h, dayOf(new Date())).length, 1);
  // moved into another folder: one queued message with that folder's context, answered in one line
  F.tell(h, { folder: HOME_ERRANDS, text: "The landlord is Ana" });
  const m = await F.moveSession(h, { sessionId: sid, folder: HOME_ERRANDS }, f.hands);
  assert.ok(m.ok && m.moved);
  assert.match(f.said.at(-1)!.text, /The landlord is Ana[\s\S]*one line/);
  assert.equal(F.foldersMsg(h).sessions[sid], HOME_ERRANDS);
  const same = await F.moveSession(h, { sessionId: sid, folder: HOME_ERRANDS }, f.hands);
  assert.ok(same.ok && !same.moved, "the same folder again is no move");
  assert.equal(f.said.length, 1);
});

test("folders in folders (BR1): a session started in a folder knows every folder it sits in, nearest first; said by the face or kept as the person's", async () => {
  const h = home(), f = fakeHands();
  const SCHOOL = "h:school", BIO = "h:bio-201", LAB = "h:lab-reports";
  F.tell(h, { folder: SCHOOL, text: "Denise studies biology at night school" });
  F.tell(h, { folder: BIO, text: "The exam is on 12 December" });
  F.tell(h, { folder: LAB, text: "Reports use the department template" });
  const s = await F.startIn(h, { folder: LAB, text: "Draft the osmosis report", above: [BIO, SCHOOL] }, f.hands);
  assert.ok(s.ok);
  const t = f.started.at(-1)!.text;
  assert.match(t, /template[\s\S]*the folder this one sits in:\n- The exam is on 12 December[\s\S]*a folder further out:\n- Denise studies biology/, "its own first, then the folder around it, then the one around that");
  assert.ok(t.indexOf("12 December") < t.indexOf("night school"));
  // unsaid by the face, the person's own nesting kept in pos.json
  const { setPos } = await import("./pos.js");
  setPos(h, { id: LAB, x: 0, y: 0, w: 1, h: 1, by: "person", touched: true, in: BIO });
  setPos(h, { id: BIO, x: 0, y: 0, w: 1, h: 1, by: "person", touched: true, in: SCHOOL });
  setPos(h, { id: SCHOOL, x: 0, y: 0, w: 1, h: 1, by: "person", touched: true, in: LAB });   // a loop ends the walk
  assert.deepEqual(F.aboveOf(h, LAB), [BIO, SCHOOL]);
  assert.match(F.contextText(h, LAB), /12 December[\s\S]*night school/);
  assert.deepEqual(F.aboveOf(h, LAB, []), [], "the face said it sits at the top");
  assert.deepEqual(F.aboveOf(h, LAB, [LAB, "/etc", 3, BIO, BIO]), [BIO], "itself, a non-folder and a repeat are dropped");
  assert.deepEqual(F.aboveOf(h, LAB, Array.from({ length: 12 }, (_, i) => `h:f${i}`)).length, F.DEPTH);
  const msg = F.folderMsg(h, LAB, [BIO]);
  assert.deepEqual(msg.above.map((a) => [a.folder, a.facts.map((x) => x.fact)]), [[BIO, ["The exam is on 12 December"]]], "next.folder carries the facts above");
  assert.deepEqual(F.folderMsg(h, "h:empty").above, [], "a folder at the top has nothing above");
});

test("next.folder.make: a Life folder in the Sol home that the move-in read lists, so it outlives the window (#1615 BR1)", async () => {
  const h = home();
  const r = F.make(h, { name: "Trip to Lisbon", zone: "life" });
  assert.deepEqual(r, { ok: true, id: "h:Trip to Lisbon", name: "Trip to Lisbon", made: true });
  const { carry } = await import("./carry.js");
  const p = carry({ home: h }).places.find((x) => x.name === "Trip to Lisbon");
  assert.equal(p?.id, "Trip to Lisbon", "the read's row id (the face's h:<id>) is the one the answer named");
  assert.equal(p?.from, "home");
  const again = F.make(h, { name: "Trip to Lisbon" });
  assert.ok(again.ok && !again.made, "one already there is the same folder");
  for (const bad of [{ name: "" }, { name: "x".repeat(61) }, { name: ".hidden" }, { name: "a/b" }, { name: ".." }, { name: "Items" }, { name: "x", zone: "build" }])
    assert.equal(F.make(h, bad).ok, false, JSON.stringify(bad));
});
