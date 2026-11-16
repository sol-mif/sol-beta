// The stage's blocks (#695, work/blocks.ts): the store under <home>/<project>/blocks/<id>/, the signed ledger, a
// session's stage.json, the six verbs as the agent's tools (tools.ts), the watch on a bound source, the events to the
// face, and the old tools as aliases with the switch on (untouched off). All in a home of its own; never the real one.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "sol-stage-home-"));
const REPO = mkdtempSync(join(tmpdir(), "sol-stage-repo-"));
mkdirSync(join(REPO, ".git"));
const TEAM = join(mkdtempSync(join(tmpdir(), "sol-team-")), "team.json");
writeFileSync(TEAM, JSON.stringify({ me: { login: "tester", name: "T" }, repos: [] }));
process.env.SOL_HOME = HOME;
process.env.SOL_TEAM = TEAM;
process.env.SOL_TEAM_OFFLINE = "1";

const S = await import("../src/work/blocks.ts");
const tools = await import("../src/work/tools.ts");
const desk = await import("../src/desk.ts");

const heard: any[] = [];
S.setStageBus((m) => heard.push(m));
S.setStageFinder(async () => ({ cwd: REPO, by: "tester's agent" }));
const SID = "sess-aaaa1111";
const project = S.projectOf(REPO);
const who = (sessionId = SID) => ({ project, sessionId, by: "tester's agent", cwd: REPO });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (r: { content: { text: string }[] }) => r.content[0].text;
after(() => { S.disarmAll(); S.setStageBus(null); });

test("the project is the repo's name, a side copy's repo, never one of the home's own folders", () => {
  assert.equal(S.projectName("Sol Dev"), "sol-dev");
  assert.equal(S.projectName("memory"), "memory-project");
  assert.equal(S.projectName(""), "project");
  const main = mkdtempSync(join(tmpdir(), "main-"));
  const copy = mkdtempSync(join(tmpdir(), "copy-"));
  mkdirSync(join(main, ".git", "worktrees", "x"), { recursive: true });
  writeFileSync(join(copy, ".git"), `gitdir: ${join(main, ".git", "worktrees", "x")}\n`);
  mkdirSync(join(copy, "sub"));
  assert.equal(S.projectOf(join(copy, "sub")), S.projectName(main.split("/").pop()!));
});

test("compose: block.json, body/, a signed ledger, the session's stage.json, and an event for the face", () => {
  heard.length = 0;
  const b = S.compose(who(), { kind: "card", title: "hello", body: "hello" });
  const dir = join(HOME, project, "blocks", b.id);
  const kept = JSON.parse(readFileSync(join(dir, "block.json"), "utf8"));
  assert.deepEqual(Object.keys(kept).sort(), ["at", "bind", "id", "kind", "parent", "sessions", "state", "title", "versions"]);
  assert.equal(kept.state, "live");
  assert.deepEqual(kept.sessions, [SID]);
  assert.equal(readFileSync(join(dir, "body", "index.md"), "utf8"), "hello");
  const l = S.ledger(project, b.id);
  assert.equal(l.length, 1);
  assert.equal(l[0].ev, "composed");
  assert.equal(l[0].by, "tester's agent");
  assert.ok(S.ledgerWhole(l));
  const st = JSON.parse(readFileSync(join(HOME, project, "sessions", SID, "stage.json"), "utf8"));
  assert.equal(st.lens, "app");
  assert.equal(st.tiled, false);
  const p = st.blocks.find((x: any) => x.id === b.id);
  assert.deepEqual([p.w, p.h, p.folded], [...S.SIZES.card, false]);
  assert.ok(heard.some((m) => m.type === "work.stage.changed" && m.block?.id === b.id && m.line?.ev === "composed"));
  assert.ok(heard.some((m) => m.type === "work.stage.changed" && m.stage && m.sessionId === SID));
});

test("compose refuses an unknown kind or slot, and a page in words is kept as markdown", () => {
  assert.throws(() => S.compose(who(), { kind: "poster" as any, title: "x" }), /kind is one of/);
  assert.throws(() => S.compose(who(), { kind: "page", title: "x", slot: "middle" as any }), /slot is one of/);
  assert.equal(S.formatOf("page", "# hi"), "md");
  assert.equal(S.formatOf("page", "<p>hi</p>"), "html");
  assert.equal(S.formatOf("list", "[]"), "json");
});

test("the ledger is append only and signed: a line changed afterwards breaks it", () => {
  const b = S.compose(who(), { kind: "page", title: "the week", body: "<p>v</p>" });
  S.update(who(), { id: b.id, body: "<p>w</p>" });
  S.update(who(), { id: b.id, waits: true });
  const l = S.ledger(project, b.id);
  assert.deepEqual(l.map((x) => x.ev), ["composed", "ran", "waits"]);
  assert.ok(S.ledgerWhole(l));
  assert.equal(S.ledgerWhole([l[0], { ...l[1], note: "something else" }, l[2]]), false);
  assert.equal(S.ledgerWhole([l[0], l[2]]), false);
});

test("update changes the body and says working-then-live by its state; waits needs the person's yes", () => {
  const b = S.compose(who(), { kind: "list", title: "steps", body: "[]" });
  const u = S.update(who(), { id: b.id, body: '{"steps":[]}', waits: true });
  assert.equal(u.state, "waits");
  assert.equal(S.bodyOf(project, b.id)?.text, '{"steps":[]}');
  assert.equal(S.yes(who(), { id: b.id }).state, "live");
  assert.equal(S.ledger(project, b.id).at(-1)?.ev, "yes");
  assert.throws(() => S.update(who(), { id: "nope", body: "x" }), /no block/);
});

test("freeze copies the body to versions/n, which never changes; a refinement is live again beside it", async () => {
  const b = S.compose(who(), { kind: "page", title: "draft", body: "<p>one</p>" });
  const f = S.freeze(who(), { id: b.id });
  assert.equal(f.state, "frozen");
  assert.deepEqual(f.versions.map((v) => v.n), [1]);
  S.update(who(), { id: b.id, body: "<p>two</p>" });
  assert.equal(S.getBlock(project, b.id)?.state, "working");   // the frame says working while it runs (#709)
  await wait(S.SETTLE_MS + 60);
  assert.equal(S.getBlock(project, b.id)?.state, "live");
  assert.equal(S.bodyOf(project, b.id, 1)?.text, "<p>one</p>");
  assert.equal(S.bodyOf(project, b.id)?.text, "<p>two</p>");
  assert.equal(S.freeze(who(), { id: b.id }).versions.length, 2);
  assert.equal(S.bodyOf(project, b.id, 2)?.text, "<p>two</p>");
  assert.ok(S.ledger(project, b.id).filter((l) => l.ev === "frozen").length === 2);
});

test("place: a slot, fold, the notch's pin (one at a time), carry to another session (one ledger), close (the ledger stays)", () => {
  const a = S.compose(who(), { kind: "diff", title: "Side.tsx", body: "" });
  const b = S.compose(who(), { kind: "card", title: "the gate", body: "green" });
  const r = S.place(who(), { id: a.id, slot: "right" });
  assert.equal(r.placed?.slot, "right");
  assert.deepEqual(S.slotRect("right"), { x: r.placed!.x, y: r.placed!.y, w: r.placed!.w, h: r.placed!.h });
  assert.equal(S.place(who(), { id: a.id, fold: true }).placed?.folded, true);
  assert.equal(S.place(who(), { id: a.id, fold: false }).placed?.folded, false);
  S.place(who(), { id: a.id, pin: true });
  S.place(who(), { id: b.id, pin: true });
  const st = S.getStage(project, SID);
  assert.deepEqual(st.blocks.filter((p) => p.pinned).map((p) => p.id), [b.id]);
  const other = "sess-bbbb2222";
  const c = S.place(who(), { id: a.id, carry: other });
  assert.equal(c.to, other);
  assert.deepEqual(S.getBlock(project, a.id)?.sessions, [SID, other]);
  assert.ok(S.getStage(project, other).blocks.some((p) => p.id === a.id));
  assert.equal(S.ledger(project, a.id).at(-1)?.ev, "carried");
  S.place(who(), { id: a.id, close: true });
  assert.equal(S.getBlock(project, a.id)?.state, "dead");
  assert.ok(!S.getStage(project, SID).blocks.some((p) => p.id === a.id));
  assert.ok(!S.getStage(project, other).blocks.some((p) => p.id === a.id));
  assert.equal(S.ledger(project, a.id).at(-1)?.ev, "closed");
  assert.ok(S.ledgerWhole(S.ledger(project, a.id)));
  assert.throws(() => S.place(who(), { id: a.id, slot: "left" }), /closed/);
});

test("read: the stage as a short list, what the person points at, and which block waits", () => {
  const sid = "sess-read0001";
  const p = S.compose(who(sid), { kind: "page", title: "the week", body: "<p/>", slot: "left" });
  const s = S.compose(who(sid), { kind: "shots", title: "stills", body: "[]", waits: true });
  S.point(sid, { id: p.id, part: "Thu" });
  const out = S.read(who(sid));
  assert.match(out, /2 blocks/);
  assert.match(out, new RegExp(`${p.id} · the week · page · live · left`));
  assert.match(out, new RegExp(`${s.id} · stills · shots · waits`));
  assert.match(out, /points at: the week › Thu/);
  assert.match(out, /Waiting on the person: stills/);
  assert.match(S.read(who("sess-empty001")), /The stage is empty/);
});

test("point and say (#698): picked blocks, the ask's paragraph for the agent, and the person's line split off it", () => {
  const sid = "sess-ask00001";
  const wk = S.compose(who(sid), { kind: "page", title: "the week", body: "<p/>" });
  const d = S.compose(who(sid), { kind: "diff", title: "Side.tsx", body: "" });
  S.point(sid, [{ id: wk.id }, { id: d.id }]);
  assert.match(S.read(who(sid)), /The person picked 2: the week \(.+\) · Side\.tsx/);
  S.point(sid, null);
  assert.doesNotMatch(S.read(who(sid)), /points at|picked/);
  // nothing pointed and one thing: no paragraph, the words alone
  assert.equal(S.askLine(project, { things: [{ kind: "page", title: "the week" }] }), "");
  const line = S.askLine(project, {
    on: [{ id: wk.id, part: "Thu › 14:00" }],
    things: [{ kind: "page", title: "the week" }, { kind: "list", title: "the kit's side", slot: "left" }, { kind: "diff", title: "Side.tsx", slot: { x: 412, y: 24, w: 440, h: 290 } }],
  });
  assert.ok(line.startsWith(S.ASK));
  assert.match(line, /on: the week › Thu › 14:00 \(block /);
  assert.match(line, /1\. page "the week"; 2\. list "the kit's side", slot left; 3\. diff "Side\.tsx", at \{x:412,y:24,w:440,h:290\}/);
  const said = `this one's padding is off\n\n${line}`;
  assert.deepEqual(S.splitAsk(said), { text: "this one's padding is off", on: ["the week › Thu › 14:00"] });
  assert.deepEqual(S.splitAsk("plain words"), { text: "plain words" });
  // a block that is not there is not named
  assert.equal(S.askLine(project, { on: [{ id: "nope-0000" }] }), "");
});

test("a full stage tiles itself: no free spot left, a new block sets tiled", () => {
  const sid = "sess-full0001";
  for (let i = 0; i < 6; i++) S.compose(who(sid), { kind: "browser", title: `b${i}`, body: "{}" });
  assert.equal(S.getStage(project, sid).tiled, true);
});

test("the face's layout is written as it is, and only blocks that exist", () => {
  const sid = "sess-lay00001";
  const b = S.compose(who(sid), { kind: "table", title: "rows", body: "{}" });
  const s = S.layout(project, sid, { lens: "ide", tiled: true, blocks: [{ id: b.id, x: 40, y: 50, w: 300, h: 200, z: 3, folded: false }, { id: "ghost0", x: 0, y: 0, w: 1, h: 1, z: 1, folded: false }] });
  assert.equal(s.lens, "ide");
  assert.deepEqual(s.blocks.map((p) => [p.id, p.x, p.y]), [[b.id, 40, 50]]);
});

test("bind: a file is watched; its change makes the block working, then live, with a ran line; a page shows the file", async () => {
  const f = join(REPO, "page.html");
  writeFileSync(f, "<p>one</p>");
  const b = S.compose(who(), { kind: "page", title: "page", body: "" });
  const bound = S.bind(who(), { id: b.id, source: "page.html" });
  assert.deepEqual(bound.bind, { source: f, watch: "file" });
  assert.equal(S.bodyOf(project, b.id)?.text, "<p>one</p>");
  assert.ok(S.watching().includes(b.id));
  heard.length = 0;
  await wait(50);
  writeFileSync(f, "<p>two</p>");
  await wait(300);
  assert.ok(heard.some((m) => m.block?.id === b.id && m.block.state === "working"), "working while it changes");
  assert.equal(S.ledger(project, b.id).at(-1)?.ev, "ran");
  assert.equal(S.bodyOf(project, b.id)?.text, "<p>two</p>");
  await wait(S.SETTLE_MS + 100);
  assert.equal(S.getBlock(project, b.id)?.state, "live");
  S.place(who(), { id: b.id, close: true });
  assert.ok(!S.watching().includes(b.id), "a closed block is no longer watched");
});

test("bind: a URL and a PR are asked every so often; a change is a ran line; a frozen block keeps its version", async () => {
  assert.equal(S.watchOf("https://x.test/a"), "url");
  assert.equal(S.watchOf("#123"), "pr");
  assert.equal(S.watchOf("https://github.com/o/r/pull/9"), "pr");
  assert.equal(S.watchOf("log.txt", "test"), "test");
  assert.equal(S.watchOf("a.txt", false), false);
  let n = 0;
  S.setAsker(async () => String(n));
  const b = S.compose(who(), { kind: "card", title: "remote", body: "x" });
  S.bind(who(), { id: b.id, source: "https://x.test/a" });
  await wait(20);
  n = 1;
  S.sourceChanged(project, b.id);   // what the poll does on a new answer (the poll's own interval is 30 s)
  assert.equal(S.ledger(project, b.id).at(-1)?.ev, "ran");
  S.freeze(who(), { id: b.id });
  S.sourceChanged(project, b.id);
  assert.equal(S.getBlock(project, b.id)?.state, "frozen");
  assert.match(S.ledger(project, b.id).at(-1)?.note ?? "", /frozen version is kept/);
  S.setAsker(null);
  S.disarmAll();
});

test("a page written in a session is a page block bound to it, once", async () => {
  const pending = new Map<string, string>();
  const path = join(REPO, "mock.html");
  writeFileSync(path, "<h1>m</h1>");
  assert.deepEqual(S.pagesWritten({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Write", input: { file_path: path } }, { type: "tool_use", id: "t2", name: "Write", input: { file_path: "/x/a.ts" } }] } }, pending), []);
  assert.deepEqual(S.pagesWritten({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1" }] } }, pending), [path]);
  assert.equal(pending.size, 0);
  S.pagesWritten({ type: "assistant", message: { content: [{ type: "tool_use", id: "t3", name: "Edit", input: { file_path: path } }] } }, pending);
  assert.deepEqual(S.pagesWritten({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t3", is_error: true }] } }, pending), [], "a failed edit is no page");
  const a = await S.pageWritten(SID, path);
  const b = await S.pageWritten(SID, path);
  assert.equal(a.id, b.id);
  assert.equal(a.kind, "page");
  assert.equal(S.bodyOf(project, a.id)?.text, "<h1>m</h1>");
  S.disarmAll();
});

test("the six tools: every session's (the swap, #718), each answering a line; update_plan is gone", async () => {
  assert.ok(!tools.WORK_TOOLS.some((t) => t.name === "update_plan"));
  for (const n of ["compose", "update", "bind", "freeze", "place", "read"]) assert.ok(tools.WORK_TOOLS.some((t) => t.name === n), n);
  const c = await tools.runWorkTool("compose", { kind: "card", title: "via tool", body: "hi", slot: "top" }, SID);
  assert.ok(!c.isError, text(c));
  const id = /^composed ([a-z0-9-]+) /.exec(text(c))![1];
  assert.match(text(await tools.runWorkTool("update", { id, body: "ho" }, SID)), /updated .* working/);   // working while it runs, live a moment later (#709)
  writeFileSync(join(REPO, "notes.md"), "n");
  assert.match(text(await tools.runWorkTool("bind", { id, source: "notes.md" }, SID)), /watched as file/);
  assert.match(text(await tools.runWorkTool("freeze", { id }, SID)), /v1/);
  assert.match(text(await tools.runWorkTool("place", { id, fold: true }, SID)), /folded/);
  assert.match(text(await tools.runWorkTool("read", {}, SID)), new RegExp(`${id} · via tool · card · frozen v1 · folded`));
  assert.equal((await tools.runWorkTool("freeze", { id: "nope" }, SID)).isError, true);
  // a chip dropped on the stage (#698): the agent's compose takes the spot as the person left it
  const dropped = /^composed ([a-z0-9-]+) /.exec(text(await tools.runWorkTool("compose", { kind: "diff", title: "dropped", body: "", at: { x: 412, y: 24, w: 440, h: 290 } }, SID)))![1];
  assert.match(text(await tools.runWorkTool("read", {}, SID)), new RegExp(`${dropped} · dropped · diff · live · at 412,24 440×290`));
  S.disarmAll();
});

test("the desk's aliases are gone (the swap, #718): the desk is Home's own, never a Work session's", async () => {
  assert.equal(typeof (desk as Record<string, unknown>).deskAlias, "undefined");
  const turn = { sessionId: "sess-desk0001", seat: "work" };
  await desk.runDeskTool("desk_show", { kind: "note", text: "a desk note, swap-718" }, turn);
  assert.equal(desk.getDesk(turn.sessionId).length, 1, "a desk card, never a block");
  assert.ok(!S.allBlocks(project).some((b) => S.bodyOf(project, b.id)?.text === "a desk note, swap-718"));
});

test("GET /blocks's answer: each project's blocks with their last ledger line", () => {
  const all = S.blocksNow();
  const mine = all.find((p) => p.project === project);
  assert.ok(mine && mine.blocks.length > 3);
  assert.ok(mine.blocks.every((b) => b.state !== "dead" && b.last?.sig));
  assert.deepEqual(S.blocksNow("no-such-project"), []);
  assert.ok(existsSync(join(HOME, project, "blocks")));
});

test("the join (#709): the person's compose keeps the place asked; the engine's own spot is marked auto; seen gives the body and the last lines", () => {
  const w = who("sess-join0001");
  const at = S.compose(w, { kind: "card", title: "mine", body: "# gate green\nidle", format: "md", at: { x: 40, y: 50, w: 260, h: 140, z: 7 } });
  const auto = S.compose(w, { kind: "list", title: "theirs", body: JSON.stringify({ steps: [] }) });
  const st = S.getStage(project, "sess-join0001");
  const a = st.blocks.find((p) => p.id === at.id)!, b = st.blocks.find((p) => p.id === auto.id)!;
  assert.deepEqual([a.x, a.y, a.w, a.h, a.z, a.auto], [40, 50, 260, 140, 7, undefined]);
  assert.equal(b.auto, true);
  // the face's layout drops the mark: it has laid the block out on its own width
  const laid = S.layout(project, "sess-join0001", { blocks: st.blocks });
  assert.equal(laid.blocks.find((p) => p.id === auto.id)!.auto, undefined);
  const seen = S.seen(project, at.id)!;
  assert.deepEqual(seen.body, { format: "md", text: "# gate green\nidle" });
  assert.equal(seen.lines.at(-1)!.ev, "composed");
  assert.equal(S.seen(project, "nope-none"), null);
});

test("#744: a page bound to an html file says where its own files are, under this start's key; nothing else does", async () => {
  const { PANE_KEY, assetOf } = await import("../src/work/page.ts");
  const base = S.pageBase({ kind: "page", bind: { source: "/home/me/mine/look/stage/kinds-743/kinds.html", watch: "file" } });
  assert.equal(base, `/pane-asset/k.${PANE_KEY}/${encodeURIComponent("/home/me/mine/look/stage/kinds-743")}/`);
  // the asset server reads it back to the file's folder and the image under it
  assert.deepEqual(assetOf(`${base}kinds/x.png`), { dir: "/home/me/mine/look/stage/kinds-743", rel: "kinds/x.png" });
  assert.equal(S.pageBase({ kind: "page", bind: { source: "https://example.com", watch: "url" } }), undefined);
  assert.equal(S.pageBase({ kind: "diff", bind: { source: "/a/b.html", watch: "file" } }), undefined);
  assert.equal(S.pageBase({ kind: "page" }), undefined);
});
