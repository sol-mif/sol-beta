// Every folder has a setup, and its agent keeps it organized (BR1 item 2; setup.ts). Against a temp SOL_HOME with
// invented people: Denise (a bakery), Lucy (her classes), Dev (two projects for one client). No folder is read as a
// kind: each starts plain, its because is what Sol saw in it (look.ts), the same under any name.
// Signed: marcocyl04-ux's agent, BR1 item 2 (#1615).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "sol-next-setup-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
process.env.SOL_STATE = join(tmp, "state", "work.json");
process.env.SOL_LOGDIR = join(tmp, "log");
const S = await import("./setup.js");
const N = await import("./notes.js");
const F = await import("./folders.js");
const { readDay, dayOf, pauseDiary } = await import("./diary.js");
const { personSet } = await import("./fits.js");
let n = 0;
const home = () => { const d = join(tmp, `h${++n}`); mkdirSync(d, { recursive: true }); return d; };
const files = (dir: string, names: string[]) => { mkdirSync(dir, { recursive: true }); for (const f of names) { const p = join(dir, f); if (f.endsWith("/")) mkdirSync(p, { recursive: true }); else writeFileSync(p, "x"); } };

test("no folder is read as a kind: every setup starts plain, and its because is what Sol saw in it, never its name", () => {
  const h = home();
  files(join(h, "a"), [".git/", "README.md"]);
  files(join(h, "d"), ["Week 1.pdf", "Week 2.pdf", "Week 3.pdf", "syllabus.pdf"]);
  files(join(h, "f"), ["IMG_1.jpg", "IMG_7.heic", "IMG_9.png", "x.md"]);
  files(join(h, "h"), []);
  const s = (x: string) => S.setupOf(h, `w:${join(h, x)}`);
  // the same plain setup for each, whatever it holds; no kind is said
  assert.deepEqual(["a", "d", "f", "h"].map((x) => s(x).fields.map((f) => f.take)), Array(4).fill(["plain", "recent", "count", "newest-first", "plain"]));
  assert.ok(["a", "d", "f", "h"].every((x) => !("kind" in s(x)) && !("kindN" in s(x))));
  // the because is the facts seen: a history of changes, most new files pictures; nothing seen: plain, from use
  assert.match(s("a").because[0], /keeps a history of its changes/);
  assert.equal(s("a").history, true);
  assert.match(s("f").because.join(" "), /pictures \(3 of 4\)/);
  assert.deepEqual(s("h").because, [S.PLAIN]);
  assert.equal(s("h").history, false);
  // the same contents under a name that says otherwise: the same because, the name aside
  files(join(h, "School"), [".git/"]);
  assert.match(s("School").because[0], /keeps a history of its changes/);
  assert.equal(s("School").history, true);
  assert.equal(S.setupOf(h, "h:nowhere-at-all").because[0], S.PLAIN);
});

test("defaults start plain, the look follows the job, and a parent's take is never the child's", () => {
  const h = home(), w = { sol: h, user: h };
  files(join(h, "lucy-course"), ["Week 1.pdf", "Week 2.pdf", "Week 3.pdf"]);
  files(join(h, "lucy-course", "essays"), []);
  const s0 = S.setupOf(h, "h:lucy-course");
  assert.deepEqual(s0.fields.map((f) => f.take), ["plain", "recent", "count", "newest-first", "plain"]);
  assert.ok(s0.fields.every((f) => f.by === "default" && f.takes.length && f.n && f.name));
  assert.equal(s0.set, null);
  assert.equal(s0.sorts, false, "not set up: its agent does not sort yet");
  // Lucy's own word first: this folder is for learning
  const j = S.setField(w, { folder: "h:lucy-course", field: "job", take: "learn" });
  assert.ok(S.setField(w, { folder: "h:lucy-course", token: (j as any).preview.token, keep: true }).ok);
  const s = S.setupOf(h, "h:lucy-course");
  assert.equal(s.scope, "home/lucy-course");
  const take = (x: typeof s, f: string) => x.fields.find((y) => y.field === f)!;
  assert.deepEqual(s.fields.map((f) => f.take), ["learn", "week", "next-due", "due-first", "notebook"]);
  assert.ok(s.fields.every((f) => f.by === (f.field === "job" ? "person" : "default") && f.takes.length && f.n && f.name));
  assert.equal(s.set?.by, "person");
  assert.equal(s.sorts, true, "set up by her word: its agent sorts");
  // the job changed by the person: the look and the order follow it
  const p = S.setField(w, { folder: "h:lucy-course", field: "job", take: "deliver" });
  assert.ok(p.ok && "preview" in p);
  const c = (p as any).preview.changes[0];
  assert.equal(c.from, "learn"); assert.equal(c.to, "deliver"); assert.equal(c.folder, "h:lucy-course"); assert.ok(c.toN);
  assert.equal(take(S.setupOf(h, "h:lucy-course"), "job").take, "learn", "a preview changes nothing");
  const k = S.setField(w, { folder: "h:lucy-course", token: (p as any).preview.token, keep: true });
  assert.ok(k.ok);
  const after1 = S.setupOf(h, "h:lucy-course");
  assert.equal(take(after1, "job").by, "person");
  assert.equal(after1.look, "desk");
  assert.equal(take(after1, "order").take, "deliverable");
  assert.equal(after1.set?.by, "person", "a kept field sets the folder up");
  // the child folder keeps its own defaults
  assert.equal(take(S.setupOf(h, "h:lucy-course/essays"), "job").take, "plain");
  // Back takes the kept field back
  const b = S.setField(w, { folder: "h:lucy-course", token: (p as any).preview.token, back: true });
  assert.ok(b.ok);
  assert.equal(take(S.setupOf(h, "h:lucy-course"), "job").take, "learn");
  // a take that isn't one, a field that isn't one: refused
  assert.equal(S.setField(w, { folder: "h:lucy-course", field: "look", take: "neon" }).ok, false);
  assert.equal(S.setField(w, { folder: "h:lucy-course", field: "colour", take: "desk" }).ok, false);
  // a take written by hand outside the list is not read as the folder's
  personSet(h, { knob: "folder.look", scope: "home/lucy-course", take: "neon" });
  assert.equal(S.setupOf(h, "h:lucy-course").look, "notebook");
});

test("a folder kept by week has its agent file a new note into its week, once; Back puts it back, pins it and takes the empty week away", () => {
  const h = home(), w = { sol: h, user: h };
  files(join(h, "lucy-course"), ["Week 1.pdf", "Week 2.pdf", "Week 3.pdf"]);
  const at = new Date(2026, 10, 18, 10).getTime(); // a Wednesday
  const note = N.write(h, { text: "Reading notes for chapter four", folder: "h:lucy-course" }, at);
  assert.ok(note.ok && note.note);
  // not set up: Sol's pass leaves it
  assert.deepEqual(S.sortRun(h, "h:lucy-course", "sol", at), { ok: true, run: null });
  // Lucy says how it is organized, by week, and keeps it: set up
  const o = S.setField(w, { folder: "h:lucy-course", field: "order", take: "week" });
  assert.ok(S.setField(w, { folder: "h:lucy-course", token: (o as any).preview.token, keep: true }).ok);
  assert.ok(S.keepSetup(h, { folder: "h:lucy-course" }).ok);
  const r = S.sortRun(h, "h:lucy-course", "sol", at);
  assert.ok(r.ok && r.run);
  const m = r.run!.moves[0];
  assert.equal(m.to, "h:lucy-course/Week of 16 Nov 2026");
  assert.equal(m.made, true);
  assert.match(m.why, /week/);
  assert.ok(existsSync(join(h, "lucy-course", "Week of 16 Nov 2026")));
  assert.equal(N.readNotes(h)[0].folder, m.to);
  const line = readDay(h, dayOf(new Date(at))).find((l) => l.id === r.run!.line);
  assert.ok(line && /Sol sorted one thing in lucy-course/.test(line.words) && (line.embed as any).sort === r.run!.id);
  // moved once: the next pass has nothing new
  assert.deepEqual(S.sortRun(h, "h:lucy-course", "sol", at + 1000), { ok: true, run: null });
  // Back: the note goes back, the empty week folder goes, and the note is pinned at the top
  const b = S.sortBack(h, { run: r.run!.id });
  assert.ok(b.ok && !b.refused.length);
  assert.equal(N.readNotes(h)[0].folder, "h:lucy-course");
  assert.equal(existsSync(join(h, "lucy-course", "Week of 16 Nov 2026")), false);
  assert.deepEqual(S.sortRun(h, "h:lucy-course", "sol", at + 2000), { ok: true, run: null });
});

test("by words: a note goes to the one subfolder it clearly speaks of; a tie or nothing shared stays put", () => {
  const h = home();
  files(join(h, "denise", "orders"), []); files(join(h, "denise", "suppliers"), []);
  S.keepSetup(h, { folder: "h:denise" });
  const at = Date.now();
  N.write(h, { id: "n1", text: "Three new orders for Friday's bread", folder: "h:denise" }, at);
  N.write(h, { id: "n2", text: "Call the plumber", folder: "h:denise" }, at);
  N.write(h, { id: "n3", text: "orders and suppliers both late", folder: "h:denise" }, at);
  const r = S.sortRun(h, "h:denise", "sol", at);
  assert.ok(r.ok && r.run);
  assert.deepEqual(r.run!.moves.map((m) => [m.thing.id, m.toN]), [["n1", "orders"]]);
  const by = Object.fromEntries(N.readNotes(h).map((x) => [x.id, x.folder]));
  assert.deepEqual(by, { n1: "h:denise/orders", n2: "h:denise", n3: "h:denise" });
  // a folder Sol sorts by words never makes one
  assert.equal(r.run!.moves[0].made, false);
});

test("a quiet session is filed, a working one is not; Back refuses what the person moved since", () => {
  const h = home();
  files(join(h, "denise", "orders"), []);
  S.keepSetup(h, { folder: "h:denise" });
  // two sessions in the folder, through the folders' own store
  const raw = { v: 1, sessions: {
    "sess-quiet-1": { folder: "h:denise", title: "Weekend orders list", at: 1, working: false, diaried: null, moved: null },
    "sess-busy-22": { folder: "h:denise", title: "Orders for Monday", at: 1, working: true, diaried: null, moved: null } }, backs: {} };
  mkdirSync(join(h, "next"), { recursive: true });
  writeFileSync(F.foldersFile(h), JSON.stringify(raw));
  const r = S.sortRun(h, "h:denise", "person");
  assert.ok(r.ok && r.run);
  assert.deepEqual(r.run!.moves.map((m) => m.thing.id), ["sess-quiet-1"]);
  assert.equal(F.readFolderSessions(h)["sess-quiet-1"].folder, "h:denise/orders");
  assert.equal(F.readFolderSessions(h)["sess-busy-22"].folder, "h:denise");
  // the person moves it elsewhere; Back leaves it where they put it
  assert.equal(F.refile(h, "sess-quiet-1", "h:denise/orders", "h:denise/other"), true);
  const b = S.sortBack(h, { run: r.run!.id });
  assert.ok(b.ok);
  assert.match(b.refused[0].why, /you moved it since/);
  assert.equal(F.readFolderSessions(h)["sess-quiet-1"].folder, "h:denise/other");
});

test("never inside a folder that keeps a history of its changes, never on the person's disk, and resting while Sol is paused", () => {
  const h = home(), w = { sol: h, user: h };
  const dev = join(h, "work", "client");
  files(join(dev, "api"), [".git/"]); files(join(dev, "site"), [".git/"]);
  files(join(h, "repo"), [".git/", "src/"]);
  const repo = `w:${join(h, "repo")}`, client = `w:${dev}`;
  S.keepSetup(h, { folder: repo }); S.keepSetup(h, { folder: client });
  assert.equal(S.setupOf(h, repo).sorts, false);
  N.write(h, { id: "r1", text: "src cleanup", folder: repo });
  assert.equal(S.sortRun(h, repo, "person").ok, false);
  assert.equal(N.readNotes(h).find((x) => x.id === "r1")!.folder, repo);
  // a client's folder sorts into its repos by words, and makes no folder on the disk
  assert.equal(S.setupOf(h, client).history, false, "the folders inside keep histories; it keeps none of its own");
  N.write(h, { id: "c1", text: "the site needs a new header", folder: client });
  const r = S.sortRun(h, client, "sol");
  assert.ok(r.ok && r.run);
  assert.equal(r.run!.moves[0].to, `${client}/site`);
  // a folder kept by week on the person's disk: no week folder made there
  files(join(h, "disk-course"), ["Week 1.pdf", "Week 2.pdf", "Week 3.pdf"]);
  const course = `w:${join(h, "disk-course")}`;
  const o = S.setField(w, { folder: course, field: "order", take: "week" });
  assert.ok(S.setField(w, { folder: course, token: (o as any).preview.token, keep: true }).ok);
  assert.equal(S.setupOf(h, course).fields.find((f) => f.field === "order")!.take, "week");
  S.keepSetup(h, { folder: course });
  N.write(h, { id: "d1", text: "notes", folder: course });
  assert.deepEqual(S.sortRun(h, course, "sol"), { ok: true, run: null });
  // paused: nothing moves, not even when asked; let go, the note is sorted
  N.write(h, { id: "c2", text: "the api returns errors", folder: client });
  pauseDiary(h, true);
  assert.deepEqual(S.sortRun(h, client, "person"), { ok: true, run: null });
  assert.equal(N.readNotes(h).find((x) => x.id === "c2")!.folder, client);
  pauseDiary(h, false);
  assert.equal(S.sortRun(h, client, "sol").ok && N.readNotes(h).find((x) => x.id === "c2")!.folder, `${client}/api`);
});

test("the move-in runs a setup as Sol's; the person's own take is never written over", () => {
  const h = home(), w = { sol: h, user: h };
  files(join(h, "lucy-course"), ["Week 1.pdf", "Week 2.pdf", "Week 3.pdf"]);
  const p = S.setField(w, { folder: "h:lucy-course", field: "look", take: "paper" });
  S.setField(w, { folder: "h:lucy-course", token: (p as any).preview.token, keep: true });
  const r = S.runSetup(h, "h:lucy-course", { look: "desk", rest: "count" }, "moving in saw dates in its files");
  assert.ok(r.ok);
  const f = (x: string) => r.ok && r.setup.fields.find((y) => y.field === x)!;
  assert.deepEqual([(f("look") as any).take, (f("look") as any).by], ["paper", "person"]);
  assert.deepEqual([(f("rest") as any).take, (f("rest") as any).by], ["count", "sol"]);
  assert.equal(r.ok && r.setup.set?.by, "person", "set up by the person first: still theirs");
  assert.ok(S.setupsOf(h).some((s) => s.folder === "h:lucy-course"));
  assert.equal(S.weekOf(new Date(2026, 10, 22).getTime()), "Week of 16 Nov 2026", "a Sunday is the end of its week");
});
