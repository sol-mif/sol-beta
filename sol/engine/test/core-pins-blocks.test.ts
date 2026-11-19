// Core pins (#892): blocks.ts, in a home of its own. What it promises: a block lives once per project with a ledger of
// signed lines (append only, whole when untouched); a closed block refuses changes; files are written whole; a stage that
// does not read is an empty stage, never a throw; ids and session ids are checked before any path is made of them; the
// ask's stage paragraph splits back off the person's words; a page written in a session is one block bound to its file.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const D = mkdtempSync(join(tmpdir(), "sol-core-blocks-"));
process.env.SOL_HOME = join(D, "home");
process.env.SOL_STAGE_WHOLE = "off";   // the stage before stage.whole (a lens per session), which is on by default since #691
const S = await import("../src/work/blocks.ts");
after(() => { S.disarmAll(); S.setStageBus(null); });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const w = (sessionId = "s1") => ({ project: "app", sessionId, by: "agent", cwd: D });

test("the ledger: each event a line signed over the one before; a line changed by hand is caught", () => {
  const b = S.compose(w(), { kind: "card", title: "x", body: "hi" });
  S.update(w(), { id: b.id, body: "two" });
  S.freeze(w(), { id: b.id });
  const lines = S.ledger("app", b.id);
  assert.deepEqual(lines.map((l) => [l.n, l.ev]), [[1, "composed"], [2, "ran"], [3, "frozen"]]);
  assert.equal(S.ledgerWhole(lines), true);
  assert.equal(S.ledgerWhole([lines[0], lines[2]]), false, "a line taken out");
  assert.equal(S.ledgerWhole([{ ...lines[0], by: "someone else" }, ...lines.slice(1)]), false, "a line rewritten");
  assert.equal(S.ledgerWhole([]), true);
  assert.deepEqual(S.ledger("app", "nosuch"), []);
});

test("the same id twice is refused; a bad id is never a path; a bad session id never makes a stage", () => {
  S.compose(w(), { kind: "list", id: "fixed-1", body: "[]" });
  assert.throws(() => S.compose(w(), { kind: "list", id: "fixed-1" }), /there already/);
  const odd = S.compose(w(), { kind: "card", id: "../../escape" });   // an id that is not one: a new one is made
  assert.match(odd.id, /^[0-9a-f]{8}$/);
  assert.equal(S.getBlock("app", "../../etc"), null);
  assert.throws(() => S.layout("app", "../x", {}), /bad session id/);
  assert.throws(() => S.compose(w(), { kind: "nope" as any }), /kind is one of/);
  assert.throws(() => S.compose(w(), { kind: "card", slot: "middle" as any }), /slot is one of/);
  assert.throws(() => S.compose(w(), { kind: "card", parent: "ghost-parent" }), /no parent/);
});

test("a closed block refuses every change but a reopen; closing twice is harmless", () => {
  const b = S.compose(w(), { kind: "card", title: "to close" });
  S.place(w(), { id: b.id, close: true });
  assert.throws(() => S.update(w(), { id: b.id, body: "x" }), /closed/);
  assert.throws(() => S.freeze(w(), { id: b.id }), /closed/);
  assert.throws(() => S.setBody("app", b.id, "x"), /closed/);
  assert.throws(() => S.place(w(), { id: b.id, slot: "left" }), /closed/);
  S.place(w(), { id: b.id, close: true });
  assert.equal(S.getStage("app", "s1").blocks.some((p) => p.id === b.id), false);
  S.reopen(w(), { id: b.id });
  assert.equal(S.getBlock("app", b.id)!.state, "live");
  assert.equal(S.getStage("app", "s1").blocks.some((p) => p.id === b.id), true);
  assert.throws(() => S.update(w(), { id: "no-such-block", body: "x" }), /no block/);
});

test("a stage.json that does not read is an empty stage, and the next change writes a whole one", () => {
  const f = join(process.env.SOL_HOME!, "app", "sessions", "torn", "stage.json");
  mkdirSync(join(f, ".."), { recursive: true });
  writeFileSync(f, '{"lens":"tui","blocks":[{"id":"ab');
  assert.deepEqual(S.getStage("app", "torn"), { lens: "app", blocks: [], tiled: false });
  const s = S.layout("app", "torn", { lens: "cli", talk: { dock: "left", width: 7 } as any, blocks: [{ id: "not-a-block" } as any] });
  assert.equal(s.lens, "cli");
  assert.deepEqual(s.talk, { dock: "left" }, "a width out of 0..1 is dropped");
  assert.deepEqual(s.blocks, [], "a block that does not exist is never laid out");
  assert.equal(JSON.parse(readFileSync(f, "utf8")).lens, "cli");
  assert.deepEqual(readdirSync(join(f, "..")), ["stage.json"], "no temp file left behind");
});

test("a block.json that does not read is skipped by the list, never a throw", () => {
  const b = S.compose(w(), { kind: "card", title: "torn" });
  writeFileSync(join(S.blockPath("app", b.id), "block.json"), "{");
  assert.equal(S.getBlock("app", b.id), null);
  assert.equal(S.allBlocks("app").some((x) => x.id === b.id), false);
  assert.ok(S.blocksNow("app")[0].blocks.length > 0);
});

test("huge and empty: a title is cut at 80, an empty title is the kind, an empty body is kept as empty", () => {
  const b = S.compose(w(), { kind: "page", title: "t".repeat(500), body: "" });
  assert.equal(b.title.length, 80);
  assert.equal(S.compose(w(), { kind: "table", title: "   " }).title, "table");
  assert.equal(S.bodyOf("app", b.id)!.text, "");
});

test("a full stage tiles itself; a slot is its rectangle; a cell takes the next free one", () => {
  const s = "full-stage";
  for (let i = 0; i < 12; i++) S.compose(w(s), { kind: "browser", title: `b${i}` });
  assert.equal(S.getStage("app", s).tiled, true);
  assert.equal(S.freeSpot(10_000, 10, []), null);
  const c1 = S.slotRect("cell", []), c2 = S.slotRect("cell", [{ id: "a", ...c1, z: 1, folded: false }]);
  assert.notDeepEqual(c1, c2);
});

test("a watched source that changes on a waiting block: working, then back to waiting; on a frozen block, the version is kept", async () => {
  const src = join(D, "plan.md"); writeFileSync(src, "v1");
  const b = S.compose(w(), { kind: "card", title: "waits", waits: true, bind: { source: src, watch: false } });
  S.sourceChanged("app", b.id);
  assert.equal(S.getBlock("app", b.id)!.state, "working");
  await wait(S.SETTLE_MS + 80);
  assert.equal(S.getBlock("app", b.id)!.state, "waits");
  S.yes(w(), { id: b.id });
  assert.equal(S.getBlock("app", b.id)!.state, "live");
  S.freeze(w(), { id: b.id });
  S.sourceChanged("app", b.id);
  assert.equal(S.getBlock("app", b.id)!.state, "frozen");
  assert.match(S.ledger("app", b.id).at(-1)!.note!, /frozen version is kept/);
  S.sourceChanged("app", "no-such-block");   // a block that is gone: nothing
});

test("a body changed is working for a moment, then live; a close in that moment stays closed", async () => {
  const b = S.compose(w(), { kind: "card", title: "u" });
  S.update(w(), { id: b.id, body: "new" });
  assert.equal(S.getBlock("app", b.id)!.state, "working");
  S.place(w(), { id: b.id, close: true });
  await wait(S.SETTLE_MS + 80);
  assert.equal(S.getBlock("app", b.id)!.state, "dead");
});

test("the ask's stage paragraph splits back off the person's words, with what they pointed at", () => {
  const b = S.compose(w(), { kind: "table", title: "The week" });
  const line = S.askLine("app", { on: [{ id: b.id, part: "Thu" }, { id: "gone-block" }], things: [{ kind: "page", title: "a" }, { kind: "list", title: "b", slot: "left" }] });
  const sent = `move this\n\n${line}`;
  assert.deepEqual(S.splitAsk(sent), { text: "move this", on: ["The week › Thu"] });
  assert.deepEqual(S.splitAsk("plain words"), { text: "plain words" });
  assert.equal(S.askLine("app", { things: [{ kind: "page", title: "one" }] }), "", "one chip and no target: nothing to say");
  assert.equal(S.askLine("app", null), "");
});

test("pagesWritten: a page counts once its result is ok; an error, a relative path, or a result with no call counts nothing", () => {
  const pending = new Map<string, string>();
  const call = (id: string, file: string) => ({ type: "assistant", message: { content: [{ type: "tool_use", id, name: "Write", input: { file_path: file } }] } });
  const res = (id: string, is_error = false) => ({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, is_error }] } });
  assert.deepEqual(S.pagesWritten(res("t0"), pending), []);
  S.pagesWritten(call("t1", "/x/a.html"), pending);
  S.pagesWritten(call("t2", "rel/b.html"), pending);
  S.pagesWritten(call("t3", "/x/c.html"), pending);
  S.pagesWritten(call("t4", "/x/d.ts"), pending);
  assert.deepEqual(S.pagesWritten(res("t1"), pending), ["/x/a.html"]);
  assert.deepEqual(S.pagesWritten(res("t1"), pending), [], "the same result twice counts once");
  assert.deepEqual(S.pagesWritten(res("t3", true), pending), []);
  assert.equal(pending.size, 0);
  assert.deepEqual(S.pagesWritten(null, pending), []);
});

test("a page written twice (two writes, back to back) is one block bound to its file", async () => {
  S.setStageFinder(async () => ({ cwd: D }));
  const page = join(D, "mock.html"); writeFileSync(page, "<p>1</p>");
  await Promise.all([S.pageWritten("pg1", page), S.pageWritten("pg1", page)]);
  await S.pageWritten("pg2", page);   // another session writes it too
  const project = S.projectOf(D);
  const bound = S.allBlocks(project).filter((b) => b.bind?.source === page);
  assert.equal(bound.length, 1);
  assert.deepEqual(bound[0].sessions.sort(), ["pg1", "pg2"]);
  S.disarmAll();
});

test("projectName: a folder name safe in the home; the home's own folders are never a project", () => {
  assert.equal(S.projectName("My Repo!!"), "my-repo");
  assert.equal(S.projectName(""), "project");
  assert.equal(S.projectName("../.."), "project");
  assert.equal(S.projectName("memory"), "memory-project");
  assert.equal(S.projectName("x".repeat(200)).length, 60);
});
