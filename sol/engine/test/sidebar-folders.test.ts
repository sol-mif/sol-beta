import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";

// Work's marks in a file of their own, never the real ones; no other process holds a session here
const top = mkdtempSync(join(tmpdir(), "sol-folders-"));
process.env.SOL_STATE = join(top, "work.json");
process.env.SOL_SESSIONS_DIR = join(top, "sessions");
const { workState, groupOp, folderOp, setOrder, setPrefs, prefs, PREFS, mark } = await import("../src/work/state.ts");
const { fileSessions, topicsFor } = await import("../src/work/sessions.ts");
const { topicFrom } = await import("../src/titles.ts");

// folders that are there (on every machine, and not inside a repo's side copy) and ones that are not
const SRC = "/usr/lib", TEST = "/usr/bin";
const GONE = "/nonexistent-sol-test/old-project";
const APP = join(homedir(), "Library/Application Support/Claude/scratch-workspaces/abc123-sol-test");   // not there either: stale shows it
let n = 0;
const s = (cwd: string) => ({ sessionId: `s${++n}`, cwd, summary: `in ${cwd}`, lastModified: 1000 + n, fileSize: 10 }) as any;

test("a group holds folders, and move puts a folder in one group at most (or none)", () => {
  const a = groupOp("add", { name: "archive", folders: [SRC] })!;
  const b = groupOp("add", { name: "builds" })!;
  assert.deepEqual(workState().groups.find((g) => g.id === a)?.folders, [SRC]);
  groupOp("move", { id: b, folder: SRC });
  assert.equal(workState().groups.find((g) => g.id === a)?.folders, undefined, "taken out of the first group");
  assert.deepEqual(workState().groups.find((g) => g.id === b)?.folders, [SRC]);
  const { projects } = fileSessions([s(SRC), s(TEST)]);
  assert.equal(projects.find((p) => p.path === SRC)?.group, b, "the folder says its group");
  assert.equal(projects.find((p) => p.path === TEST)?.group, undefined);
  groupOp("rename", { id: b, name: "b", folders: [TEST] });
  assert.deepEqual(workState().groups.find((g) => g.id === b)?.folders, [TEST], "rename with folders sets the list");
  groupOp("move", { id: null, folder: TEST });
  assert.ok(workState().groups.every((g) => !g.folders?.length), "out of any group");
  groupOp("delete", { id: a }); groupOp("delete", { id: b });
});

test("a folder wears its own name on the disk (#181): no label of Sol's, parent/name when two share one", () => {
  // two folders of one name made here, not the machine's: /usr/local/lib is not on every Mac (none without Homebrew
  // there), and a folder that is not there drops out, which left one "lib". The temp folder is scratch to the sidebar,
  // so they are added by hand (what Marco does with a folder of his own), and taken out again after
  const UL = join(top, "usr", "lib"), LL = join(top, "local", "lib");
  mkdirSync(UL, { recursive: true }); mkdirSync(LL, { recursive: true });
  folderOp("add", UL);
  folderOp("name", UL);   // the old label op does nothing now
  assert.equal(fileSessions([s(UL)]).projects[0].name, "lib");
  assert.equal("names" in workState(), false);
  folderOp("add", LL);
  const two = fileSessions([s(UL), s(LL)]).projects.map((p) => p.name).sort();
  assert.deepEqual(two, ["local/lib", "usr/lib"]);
  for (const f of [UL, LL]) { folderOp("hide", f); folderOp("show", f); }
});

test("the Claude app's scratch workspaces and gone folders stay out unless stale is on", () => {
  const list = [s(SRC), s(APP), s(GONE), s(GONE)];
  let r = fileSessions(list);
  assert.deepEqual(r.projects.map((p) => p.path), [SRC]);
  assert.deepEqual(r.sessions.map((x) => x.cwd), [SRC]);
  setPrefs({ stale: true });
  r = fileSessions(list);
  assert.deepEqual(r.projects.map((p) => p.path).sort(), [APP, GONE, SRC].sort());
  assert.equal(r.sessions.filter((x) => x.cwd === GONE && x.gone).length, 2, "shown, marked gone");
  setPrefs({ stale: false });
  // a gone folder added by hand stays
  folderOp("add", GONE);
  assert.ok(fileSessions(list).projects.some((p) => p.path === GONE));
  folderOp("hide", GONE); folderOp("show", GONE);
  // /tmp scratch stays out even with stale on
  setPrefs({ stale: true });
  assert.equal(fileSessions([s("/tmp/fixture")]).projects.length, 0);
  setPrefs({ stale: false });
});

test("a folder that moved (#129): its sessions file under the new place, not gone, the row's folder the new one; the twin's too", () => {
  // the old place is under this home and gone; it moved to NEW (/usr, there on every machine, /usr/bin inside it).
  // work.json says so (live --rename writes it); a session the other machine made in the old place comes along
  const OLD = join(homedir(), "nonexistent-sol-test/ecosystem"), NEW = "/usr";
  const TWIN = OLD.replace(/^\/(Users|home)\/[^/]+/, "/home/other-machine");
  workState().moved = { [OLD]: NEW };
  const list = [s(OLD), s(OLD + "/bin"), s(TWIN)];
  const r = fileSessions(list);
  assert.deepEqual(r.projects.map((p) => [p.path, p.count]), [[NEW, 2], [NEW + "/bin", 1]], "the new folder and its subfolder, nothing under the old path");
  assert.deepEqual(r.sessions.map((x) => x.cwd), [NEW, NEW + "/bin", TWIN], "the Mac's rows say the new place; the other machine's keeps its own path, as before");
  assert.deepEqual(r.sessions.map((x) => x.project), [NEW, NEW + "/bin", NEW]);
  assert.ok(r.sessions.every((x) => !x.gone), "none gone");
  assert.equal(r.sessions[2].machine, "nucbox");
  // the folder the session was dragged to still wins
  mark(list[0].sessionId, { folder: TEST });
  assert.equal(fileSessions(list).sessions[0].project, TEST);
  mark(list[0].sessionId, { folder: null });
  // without the entry, as before: gone, out of the side
  workState().moved = {};
  assert.deepEqual(fileSessions(list).projects, []);
});

test("newIn: the folder a fresh session starts in, off by default, a full path", () => {
  assert.equal(PREFS.newIn, "");
  assert.equal(PREFS.stale, false);
  assert.equal(prefs().newIn, "");
  assert.equal(setPrefs({ newIn: SRC + "/" }).newIn, SRC);
  assert.throws(() => setPrefs({ newIn: "relative/path" }), /full path/);
  assert.equal(setPrefs({ newIn: "" }).newIn, "");
});

test("a topic group sits inside a folder, holds sessions only, and says what it is for", () => {
  const t = groupOp("add", { name: "notes", in: SRC, about: "  the notes   pane " })!;
  const g = workState().groups.find((x) => x.id === t)!;
  assert.equal(g.in, SRC);
  assert.equal(g.about, "the notes pane");
  groupOp("move", { id: t, folder: TEST });
  assert.equal(g.folders, undefined, "a folder never goes in a topic group");
  groupOp("add", { name: "x", in: SRC, folders: [TEST] });
  assert.ok(workState().groups.every((x) => !x.folders?.length));
  groupOp("rename", { id: t, about: "" });
  assert.equal(g.about, undefined, "an empty line clears it");
  groupOp("rename", { id: t, about: "the notes pane", in: SRC });
  for (const x of [...workState().groups]) if (x.id !== t) groupOp("delete", { id: x.id });
});

test("the model's pick: only the folder's topic groups that say what they are for, one number back", () => {
  // the topic group the test above leaves in SRC, or its own when it runs alone (the eval's check picks it by name)
  const t = workState().groups.find((x) => x.in === SRC && x.about) ?? { id: groupOp("add", { name: "notes", in: SRC, about: "the notes pane" })! };
  groupOp("add", { name: "bare", in: SRC });   // says nothing: not offered
  groupOp("add", { name: "elsewhere", in: TEST, about: "tests" });
  assert.deepEqual(topicsFor("fresh-1", SRC + "/deeper").length, 0, "a subfolder is its own folder");
  assert.deepEqual(topicsFor("fresh-1", SRC), [{ id: t.id, about: "the notes pane" }]);
  mark("fresh-2", { folder: TEST });
  assert.deepEqual(topicsFor("fresh-2", SRC).map((x) => x.about), ["tests"], "a session moved to a folder gets that folder's");
  mark("fresh-2", { folder: null });
  assert.equal(topicFrom("1", 2), 0);
  assert.equal(topicFrom("Group 2.", 2), 1);
  assert.equal(topicFrom("0", 2), null);
  assert.equal(topicFrom("3", 2), null);
  assert.equal(topicFrom("none", 2), null);
  for (const x of [...workState().groups]) groupOp("delete", { id: x.id });
});

test("a session shown under another folder keeps its cwd; clearing the mark sends it home", () => {
  const a = s(SRC);
  mark(a.sessionId, { folder: TEST });
  let r = fileSessions([a]);
  assert.equal(r.sessions[0].project, TEST);
  assert.equal(r.sessions[0].cwd, SRC);
  assert.equal(r.sessions[0].folder, TEST);
  assert.deepEqual(r.projects.map((p) => p.path), [TEST]);
  mark(a.sessionId, { folder: null });
  r = fileSessions([a]);
  assert.equal(r.sessions[0].project, SRC);
  assert.equal(workState().marks[a.sessionId], undefined);
});

test("the top rows' order: set, replaced whole, junk left out, kept in the file (#73)", async () => {
  assert.deepEqual(workState().order, [], "none until Marco drags one");
  setOrder(["g:archive", SRC, TEST]);
  assert.deepEqual(workState().order, ["g:archive", SRC, TEST]);
  setOrder([TEST, "g:archive"]);
  assert.deepEqual(workState().order, [TEST, "g:archive"], "a new list replaces the last, it does not merge");
  setOrder([SRC, 7, "", null, "junk", "not-a-row", SRC, { k: 1 }, TEST]);
  assert.deepEqual(workState().order, [SRC, TEST], "only paths and group keys, each once");
  setOrder("not a list");
  assert.deepEqual(workState().order, []);
  setOrder([SRC, "g:x"]);
  await new Promise((r) => setTimeout(r, 300));   // the file is written a moment after
  assert.deepEqual(JSON.parse(readFileSync(process.env.SOL_STATE!, "utf8")).order, [SRC, "g:x"]);
  setOrder([]);
});

test("a run the list does not know yet shows at once, under its folder, with its marks (#111)", async () => {
  const { withRuns } = await import("../src/work/sessions.ts");
  const filed = fileSessions([s(SRC)]);
  const out = withRuns(filed, [{ sessionId: "fresh1", cwd: TEST, since: 5 }, { sessionId: filed.sessions[0].id, cwd: SRC }]);
  assert.equal(out.sessions.length, 2, "the known run adds no row; the fresh one does");
  const row = out.sessions.find((x) => x.id === "fresh1")!;
  assert.equal(row.project, TEST);
  assert.equal(row.updatedAt, 5);
  assert.equal(out.projects.find((p) => p.path === TEST)?.count, 1, "its folder appears with it");
  assert.equal(out.projects.find((p) => p.path === SRC)?.count, 1, "the other folder is untouched");
  assert.equal(filed.projects.find((p) => p.path === TEST), undefined, "the filed list itself is not changed");
});

test("a folder's last activity counts every session in it (#1179): pinned and in a topic group too, archived ones not", () => {
  const a = s(SRC), b = s(SRC), c = s(SRC), d = s(SRC);   // no transcript on the disk: each row's time is its lastModified, rising with n
  const g = groupOp("add", { name: "topic", in: SRC })!;
  mark(a.sessionId, { pinned: true }); mark(b.sessionId, { group: g }); mark(d.sessionId, { archived: true });
  const at = () => fileSessions([a, b, c, d]).projects.find((p) => p.path === SRC)?.latest;
  assert.equal(at(), c.lastModified, "the newest that is not archived; the pinned and the grouped count");
  mark(c.sessionId, { group: g }); mark(a.sessionId, { pinned: null, group: g });
  assert.equal(at(), c.lastModified, "every session in a topic group: the folder is as fresh as its newest, not 0");
  mark(c.sessionId, { archived: true });
  assert.equal(at(), b.lastModified, "archived: out of the count");
  for (const x of [a, b, c, d]) mark(x.sessionId, { pinned: null, group: null, archived: null });
  groupOp("delete", { id: g });
});

test("a cowork session is in its fold only: marked cowork with its room's id, it does not move its folder's activity, and nothing else is marked", async () => {
  // The fold is the face's (WorkSidebar draws the rows marked cowork under "cowork", one fold per project by name, and
  // leaves them out of every folder). This is what the engine sends it: the mark, the room's id, and no part in the folder.
  const { roomMark, withRoomIds } = await import("../src/team/here.ts");
  const room = { id: "room-a", provider: "cloud", hub: "wss://cloud.example/relay", code: "ABCDEF", record: "cloud:ABCDEF" };
  const plain = s(SRC), co = s(SRC), left = s(SRC);   // the cowork ones are newer: lastModified rises with n
  mark(co.sessionId, { mode: "cowork", room: roomMark(room, room.record), roomId: room.id });
  mark(left.sessionId, { mode: "cowork", roomId: "room-i-left" });
  try {
    const filed = fileSessions([plain, co, left]);
    const rows = withRoomIds(filed.sessions, [room]);   // what the list message does before it goes to the face
    const row = (x: { sessionId: string }) => rows.find((r) => r.id === x.sessionId)!;
    assert.equal(row(co).mode, "cowork", "the row says cowork");
    assert.equal(row(co).roomId, room.id, "and which project it belongs to, for the fold's name");
    assert.equal(row(left).mode, "cowork");
    assert.equal(row(left).roomId, undefined, "a project I left: the fold says so, no folder takes it");
    assert.equal(row(plain).mode, undefined, "a Work session is not marked");
    assert.deepEqual(rows.filter((r) => r.mode !== "cowork").map((r) => r.id), [plain.sessionId], "what Home's folders keep");
    // the folder's last activity is its own sessions', though the cowork ones are newer
    assert.ok(co.lastModified > plain.lastModified);
    assert.equal(filed.projects.find((p) => p.path === SRC)?.latest, plain.lastModified, "a cowork session does not freshen the folder");
  } finally { for (const x of [co, left]) mark(x.sessionId, { mode: null, room: null, roomId: null }); }
});
