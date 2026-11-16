// Tables (#434, D2 of #413; team/tables.ts): a project's tables, `.sol/tables/<id>.json` in its record, with four views
// (list, board, calendar, timeline) saved per table, and a source: its own rows, or the board, the feed or sessions read
// and never kept. The pure parts (the shapes both sides read, a view made valid, a cell, a change laid over a table, the
// sources as rows, the agent's lines) and the store against a fake record: the board in the list before any file, a
// first view saved on it writing board.json, two adds at once both landing, an agent refused on a source table. The
// `table` kind is a block kind, and Sol's own tables block gives the three agent tools.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "sol-tables-"));
after(() => rmSync(DIR, { recursive: true, force: true }));
const FILE = join(DIR, "team.json");
writeFileSync(FILE, JSON.stringify({ me: { login: "marcocyl04-ux", name: "Marco" }, repos: ["sol-mif/sol-dev"] }));
process.env.SOL_TEAM = FILE;
process.env.SOL_TEAM_OFFLINE = "1";
const T = await import("../src/team/tables.ts");
const B = await import("../src/team/blocks.ts");

const at = "2026-10-30T15:00:00.000Z";
const ghError = (full: string) => Object.assign(new Error(full.split("\n")[0]), { full });
function fakeRecord() {
  const on = new Map<string, { text: string; sha: string }>();
  const puts: { path: string; message: string; sha?: string }[] = [];
  const hook: { before?: (path: string) => Promise<void> } = {};
  let n = 0;
  const rec = { files: {
    branch: async () => "main",
    readSha: async (_r: string, path: string) => { const f = on.get(path); if (!f) throw ghError("gh: Not Found (HTTP 404)"); return JSON.stringify({ sha: f.sha, content: Buffer.from(f.text).toString("base64") }); },
    putBody: async (_r: string, path: string, w: { message: string; content: string; sha?: string }) => {
      const b = hook.before; if (b) { hook.before = undefined; await b(path); }
      puts.push({ path, message: w.message, sha: w.sha });
      const f = on.get(path);
      if (f && w.sha !== f.sha) throw ghError(w.sha ? "gh: is at x but expected y (HTTP 409)" : "gh: Invalid request. \"sha\" wasn't supplied. (HTTP 422)");
      on.set(path, { text: Buffer.from(w.content, "base64").toString("utf8"), sha: `s${++n}` });
      return "";
    },
    list: async (_r: string, dir: string) => {
      const here = [...on.entries()].filter(([p]) => p.startsWith(dir + "/"));
      if (!here.length) throw ghError("gh: Not Found (HTTP 404)");
      return JSON.stringify(here.map(([p, f]) => ({ name: p.slice(dir.length + 1), path: p, sha: f.sha, size: f.text.length, type: "file" })));
    },
  } } as any;
  return { d: { record: () => rec }, on, puts, hook };
}
let k = 0;
const fresh = () => { T.tables.forget(); return `o/tables-${++k}`; };
const me = { by: "marcocyl04-ux", at };
const agent = { by: "franktsai2008-eng", agent: true, at };

test("the shapes come from the face's tables.json: the board's columns and its four views, the board view by where each card stands", () => {
  const s = T.parseShapes(readFileSync(T.TABLES_FILE, "utf8"));
  assert.deepEqual(s.sources.board.columns.map((c) => c.key), ["title", "number", "column", "domain", "who", "created", "closed", "pr"]);
  assert.deepEqual(s.sources.board.views.map((v) => v.kind), ["board", "list", "calendar", "timeline"]);
  const board = s.sources.board.views[0];
  assert.equal(board.by, "column");
  assert.deepEqual(board.hide, { column: ["closed"] });
  assert.deepEqual(s.sources.board.columns.find((c) => c.key === "column")!.choices!.map((c) => c.name), ["waiting", "on a branch", "in a PR", "on main", "stable", "closed"]);
  for (const src of ["feed", "sessions"] as const) assert.deepEqual(s.sources[src].views.map((v) => v.kind), ["list", "board", "calendar", "timeline"]);
  assert.deepEqual(s.own.columns.map((c) => c.type), ["text", "choice", "person", "date", "date"]);
});

test("a view names fields the table has, of the right type; a board with no field to group by picks one, a calendar with no date is no view", () => {
  const cols = [{ key: "title", name: "title", type: "text" as const }, { key: "due", name: "due", type: "date" as const }, { key: "status", name: "status", type: "choice" as const, choices: [] }];
  assert.deepEqual(T.cleanView({ id: "b", kind: "board", name: "by status", by: "nope" }, cols), { id: "b", kind: "board", name: "by status", by: "status" });
  assert.deepEqual(T.cleanView({ id: "c", kind: "calendar", date: "title" }, cols), { id: "c", kind: "calendar", name: "calendar", date: "due" });
  assert.equal(T.cleanView({ id: "c", kind: "calendar" }, cols.slice(0, 1)), null);
  assert.deepEqual(T.cleanView({ id: "t", kind: "timeline", start: "due", end: "due" }, cols), { id: "t", kind: "timeline", name: "timeline", start: "due" });
  assert.equal(T.cleanView({ id: "x", kind: "gallery" }, cols), null);
  assert.deepEqual(T.cleanView({ id: "l", kind: "list", sort: { key: "due", desc: true }, hide: { status: ["done"], ghost: ["x"] } }, cols), { id: "l", kind: "list", name: "list", sort: { key: "due", desc: true }, hide: { status: ["done"] } });
});

test("a cell is made valid for its column: a date, a number, a person, one of the choices; empty clears it", () => {
  const choice = { key: "s", name: "s", type: "choice" as const, choices: [{ id: "doing", name: "doing" }] };
  assert.equal(T.cleanCell({ key: "d", name: "d", type: "date" }, "2026-11-02"), "2026-11-02");
  assert.equal(T.cleanCell({ key: "d", name: "d", type: "date" }, "next week"), undefined);
  assert.equal(T.cleanCell({ key: "n", name: "n", type: "number" }, " 12 "), 12);
  assert.equal(T.cleanCell({ key: "p", name: "p", type: "person" }, "@frank"), "frank");
  assert.equal(T.cleanCell(choice, "doing"), "doing");
  assert.equal(T.cleanCell(choice, "dreaming"), undefined);
  assert.equal(T.cleanCell(choice, ""), null);
  const r = T.setCells({ id: "r1" }, [choice], { s: "dreaming" });
  assert.ok("error" in r && /one of doing/.test(r.error));
  assert.ok("error" in T.setCells({ id: "r1" }, [choice], { nope: 1 }));
  assert.equal(T.cleanCell({ key: "d", name: "d", type: "date" }, "2026-02-31"), undefined);   // a day that is
});

test("a column named id never writes over a row's id: its key is id_2, a key of id is refused", () => {
  assert.equal(T.cleanCol({ key: "id", name: "id" }), null);
  const t = T.applyTable(T.parseTable(""), [{ make: { title: "Orders" } }, { column: { name: "ID" } }, { add: { cells: { title: "one", ID: "Order 17" } } }, { add: { cells: { title: "two", ID: "Order 17" } } }], me, "orders").file;
  assert.ok(t.columns.some((c) => c.key === "id_2" && c.name === "ID"));
  assert.equal(new Set(t.rows.map((r) => r.id)).size, 2);
  assert.ok(t.rows.every((r) => r.id !== "Order 17" && r.id_2 === "Order 17"));
  assert.equal(T.parseTable(T.serializeTable(t)).rows.length, 2);   // both rows read back
});

test("a new table of its own rows starts with the default columns and four views; rows are added, changed and taken out, each signed", () => {
  const made = T.applyTable(T.parseTable(""), [{ make: { title: "Launch tasks" } }], me, "launch-tasks");
  assert.ok(made.changed && !made.error);
  const t = made.file;
  assert.equal(t.source, "own");
  assert.deepEqual(t.views.map((v) => `${v.kind}:${v.by ?? v.date ?? v.start ?? ""}`), ["list:", "board:status", "calendar:due", "timeline:start"]);
  assert.equal(t.views[3].end, "due");
  const added = T.applyTable(t, [{ add: { cells: { title: "the invite list", status: "doing", due: "2026-11-02", who: "isaac" } } }], agent, "launch-tasks");
  assert.ok(added.changed, added.error);
  const row = added.file.rows[0];
  assert.equal(row._by, "franktsai2008-eng"); assert.equal(row._agent, true);
  assert.equal(added.file.agent, true);
  assert.match(added.message!, /— franktsai2008-eng's agent/);
  assert.deepEqual(added.result!.rows, [row.id]);
  const set = T.applyTable(added.file, [{ set: { row: row.id, cells: { status: "done" } } }], me, "launch-tasks");
  assert.equal(set.file.rows[0].status, "done"); assert.equal(set.file.rows[0]._by, "marcocyl04-ux"); assert.equal(set.file.rows[0]._agent, undefined);
  assert.equal(T.applyTable(set.file, [{ set: { row: row.id, cells: { status: "done" } } }], me, "launch-tasks").changed, false);
  assert.equal(T.applyTable(set.file, [{ remove: { row: row.id } }], me, "launch-tasks").file.rows.length, 0);
  assert.match(T.applyTable(set.file, [{ remove: { row: "ghost" } }], me, "launch-tasks").error!, /no row ghost/);
  // kept and read back the same
  assert.deepEqual(T.parseTable(T.serializeTable(set.file)), set.file);
});

test("a source table keeps only its title and views: its rows are not written, by a person or an agent", () => {
  const t = T.applyTable(T.parseTable(""), [{ make: { title: "What happened", source: "feed" } }], me, "what-happened").file;
  assert.equal(t.source, "feed");
  assert.deepEqual(T.columnsOf(t).map((c) => c.key), ["text", "kind", "who", "at"]);
  assert.match(T.applyTable(t, [{ add: { cells: { text: "x" } } }], me, "what-happened").error!, /keeps itself current/);
  const kept = JSON.parse(T.serializeTable({ ...t, rows: [{ id: "r1", text: "x" }] }));
  assert.equal(kept.rows, undefined); assert.equal(kept.columns, undefined);
  // a view is saved on any table
  const v = T.applyTable(t, [{ view: { id: "mine", kind: "board", name: "by kind", by: "kind" } }], me, "what-happened");
  assert.ok(v.changed); assert.equal(v.file.views.at(-1)!.by, "kind");
});

test("the sources as rows: the board's cards by where they stand, the feed's lines, the sessions of this project only and never their words", () => {
  const rows = T.boardRows([
    { repo: "sol-mif/sol-dev", number: 31, title: "See", column: "pr", domain: "product", assignees: ["marco"], created: "2026-10-28T10:00:00Z", pr: 42, url: "u" },
    { repo: "sol-mif/sol-dev", number: 17, title: "One wire", column: "stable", assignees: [], created: "2026-10-01T10:00:00Z", closed: "2026-10-20T10:00:00Z" },
  ]);
  assert.deepEqual(rows[0], { id: "sol-dev-31", title: "See", number: 31, column: "pr", domain: "product", who: "marco", created: "2026-10-28T10:00:00.000Z", pr: 42, _url: "u", _repo: "sol-mif/sol-dev" });
  assert.equal(rows[1].who, undefined); assert.equal(rows[1].closed, "2026-10-20T10:00:00.000Z");
  const f = T.feedRows([{ id: "note:x", at: at, who: "frank", agent: true, kind: "handed", text: "handed #34", ref: { url: "https://x" } }]);
  assert.equal(f[0].text, "handed #34"); assert.equal(f[0]._agent, true);
  const s = T.sessionRows([
    { id: "a", title: "tables", createdAt: 1, updatedAt: 2, roomId: "r1" },
    { id: "b", title: "private thing", updatedAt: 3 },
    { id: "c", title: "old", updatedAt: 4, archived: true, roomId: "r1" },
  ], "r1");
  assert.deepEqual(s.map((r) => `${r.title}:${r.state}`), ["tables:open", "old:archived"]);
  assert.deepEqual(T.sessionRows([{ id: "b", title: "x", updatedAt: 3 }], ""), []);
});

test("the store: the board is in the list before any file; a first view saved on it writes board.json as a board-source table", async () => {
  const repo = fresh(), f = fakeRecord();
  const list = await T.tables.list(f.d, repo);
  assert.deepEqual(list.map((t) => `${t.id}:${t.source}`), ["board:board"]);
  const b = await T.tables.read(f.d, repo, "board");
  assert.equal(b!.source, "board"); assert.equal(b!.views[0].kind, "board");
  const r = await T.tables.change(f.d, repo, "board", [{ view: { id: "by-label", kind: "board", name: "by label", by: "domain" } }], me);
  assert.ok(!("error" in r) && r.changed, JSON.stringify(r));
  const kept = JSON.parse(f.on.get(".sol/tables/board.json")!.text);
  assert.equal(kept.source, "board"); assert.equal(kept.rows, undefined);
  assert.deepEqual(kept.views.map((v: any) => v.id), ["board", "list", "calendar", "timeline", "by-label"]);
  assert.match(f.puts[0].message, /^tables: changed the board \(by marcocyl04-ux\)$/);
  assert.equal(await T.tables.read(f.d, repo, "nope"), null);
});

test("the store: a new table takes its title's slug; two adds at once both land; the list puts the board first", async () => {
  const repo = fresh(), f = fakeRecord();
  const m = await T.tables.change(f.d, repo, "", [{ make: { title: "Board" } }], me);
  assert.ok(!("error" in m));
  assert.equal((m as any).id, "board-2");   // "board" is always the board's
  // someone else adds a row between my read and my put: mine reads again and both are there
  f.hook.before = async () => { await T.tables.change(f.d, repo, "board-2", [{ add: { cells: { title: "theirs" } } }], agent); };
  const r = await T.tables.change(f.d, repo, "board-2", [{ add: { cells: { title: "mine" } } }], me);
  assert.ok(!("error" in r), JSON.stringify(r));
  const t = await T.tables.read(f.d, repo, "board-2", true);
  assert.deepEqual(t!.rows.map((x) => x.title).sort(), ["mine", "theirs"]);
  const list = await T.tables.list(f.d, repo, true);
  assert.deepEqual(list.map((x) => x.id), ["board", "board-2"]);
  assert.equal(list[1].rows, 2);
});

test("a table past 896 KB is refused, never written half", () => {
  const t = T.applyTable(T.parseTable(""), [{ make: { title: "big", columns: [{ name: "words" }] } }], me, "big").file;
  const big = "x".repeat(1900);
  const ops = Array.from({ length: 480 }, () => ({ add: { cells: { words: big } } }));
  const r = T.applyTable(t, ops, me, "big");
  assert.match(r.error ?? "", /at most 896 KB; make a second table/);
  assert.equal(r.changed, false);
});

test("the agent: reads any table, writes only one of its own rows, and only where it may speak; its lines are project content", async () => {
  const repo = fresh(), f = fakeRecord();
  const src = {
    board: async () => ({ cards: [{ repo: "o/r", number: 5, title: "a card", column: "waiting", assignees: [], created: at }] }),
    feed: async () => ({ lines: [] }), sessions: async () => [], roomId: () => "r1",
  };
  assert.match(await T.agentTableRead(f.d, src, repo, "board"), /"the board" \(board\), the board, kept current[\s\S]*1 row:\n- r-5 · title: a card · number: 5 · column: waiting/);
  assert.match(await T.agentTableWrite(f.d, { repo, may: true, login: "frank", id: "board", add: [{ title: "x" }] }), /^not written: the board reads the board and keeps itself current/);
  assert.match(await T.agentTableWrite(f.d, { repo, may: false, login: "frank", title: "t" }), /my agent may not speak on GitHub/);
  const made = await T.agentTableWrite(f.d, { repo, may: true, login: "frank", title: "Invites", columns: [{ name: "who", type: "person" }, { name: "sent", type: "date" }], add: [{ who: "isaac", sent: "2026-11-01" }] });
  assert.match(made, /^made the table Invites \(invites\), rows added: r\w+; signed as frank's agent/);
  const read = await T.agentTableRead(f.d, src, repo, "invites");
  assert.match(read, /Columns: who \(person\), sent \(date\)/);
  assert.match(read, /who: isaac · sent: 2026-11-01 · by frank's agent/);
  assert.match(await T.agentTableWrite(f.d, { repo, may: true, login: "frank", id: "invites", add: [{ sent: "soon" }] }), /not written: soon is not a date/);
  assert.match(T.tablesText(await T.tables.list(f.d, repo, true), repo), /- board · the board · the board, kept current\n- invites · Invites · its own rows · 1 row · last by frank's agent/);
});

test("the table kind is a block kind; Sol's own tables block ships off and gives the three tools, refused while it is off", () => {
  assert.ok(B.kindOf("table")?.declarable);
  B.setShipped(null);
  const own = B.shipped().find((b) => b.id === "tables")!;
  assert.equal(own.kind, "table"); assert.equal(own.start, "off");
  assert.deepEqual(own.agents, ["room_tables", "room_table_read", "room_table_write"]);
  assert.match(B.toolRefusal("room_table_write", B.blocksIn({}))!, /tables is not on in this project/);
  assert.equal(B.toolRefusal("room_table_read", B.blocksIn({ tables: { on: true } })), null);
  assert.deepEqual(B.cleanBlock({ id: "roadmap", kind: "table", name: "roadmap", with: { table: "roadmap" } })!.with, { table: "roadmap" });
  assert.equal(B.cleanBlock({ id: "roadmap", kind: "table", name: "roadmap", with: { table: "Not An Id" } }), null);
});
