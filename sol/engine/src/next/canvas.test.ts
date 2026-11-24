// The canvas bar is always agentic (#1615 BR1; next/canvas-tool.ts, next/canvas-agent.ts, parts/next-canvas.ts), on a temp
// SOL_HOME: the canvas tools read the window's picture and keep each change as the AI's place (pos.json by "ai"), told to
// every window as next.pos.ai; arrange lays things out from where the first stands; open asks the window for a tab. The
// bar's words start the home's standing session once (fresh, cheapest Claude, dontAsk, marked canvas, the brief first) and
// continue it after; a gone one is started again; dropped pieces ride as chips; its turn's words come back to every
// window. Off (ui.next), nothing is answered; another connection is refused. No list draws the bar's own session.
// Signed: marcocyl04-ux's agent (builder B), BR1 (#1615).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const tmp = mkdtempSync("/var/tmp/sol-next-canvas-");   // not under /tmp: the session list skips /tmp as scratch
const wasEnv = process.env.SOL_UI_NEXT;
Object.assign(process.env, { HOME: tmp, SOL_SETTINGS: join(tmp, "settings.json"), SOL_STATE: join(tmp, "work.json"), SOL_SESSIONS_DIR: join(tmp, "sessions") });
after(() => { rmSync(tmp, { recursive: true, force: true }); if (wasEnv === undefined) delete process.env.SOL_UI_NEXT; else process.env.SOL_UI_NEXT = wasEnv; });
process.env.SOL_UI_NEXT = "on";

const C = await import("./canvas-tool.js");
const A = await import("./canvas-agent.js");
const P = await import("./pos.js");
const W = await import("./workspace-tool.js");
const { canvasPart } = await import("../parts/next-canvas.js");

let n = 0;
const home = () => { const h = join(tmp, `h${++n}`); mkdirSync(h, { recursive: true }); return h; };
const said = (r: { content: { text: string }[]; isError?: boolean }) => r.content[0].text;
const PICTURE = [
  { id: "w:/code/shop", name: "shop", kind: "folder", x: 900, y: 110, w: 1000, h: 800, folded: false },
  { id: "h:school", name: "School", kind: "folder", x: 2100, y: 110, w: 1000, h: 1200, folded: false },
  { id: "s-1", name: "Fix login", kind: "session", x: 950, y: 220, w: 400, h: 400, folded: false, in: "w:/code/shop" },
  { id: "diary", name: "the Diary", kind: "diary", x: 0, y: 110, w: 1240, h: 1000, folded: false },
  { id: "bad" },
];

test("the canvas tools are offered with the workspace's while ui.next is on, and refused while it is off", async () => {
  const names = W.workspaceToolsNow().map((t) => t.name);
  for (const t of ["canvas_read", "canvas_place", "canvas_fold", "canvas_arrange", "canvas_open"]) assert.ok(names.includes(t), t);
  assert.ok(W.WORKSPACE_NAMES.has("canvas_place"));
  process.env.SOL_UI_NEXT = "off";
  assert.deepEqual(W.workspaceToolsNow(), []);
  const r = await C.runCanvasTool("canvas_read", {}, home(), () => {});
  assert.equal(r.isError, true);
  process.env.SOL_UI_NEXT = "on";
});

test("canvas_read lists the window's picture: ids, names, places, folded, the folder a thing sits in", async () => {
  const h = home();
  assert.match(said(await C.runCanvasTool("canvas_read", {}, h, () => {})), /not been read yet/);
  assert.equal(C.setSeen(h, PICTURE), 4, "a line that is not a thing is dropped");
  const t = said(await C.runCanvasTool("canvas_read", {}, h, () => {}));
  assert.match(t, /4 things/);
  assert.match(t, /w:\/code\/shop · shop · folder · at 900,110 size 1000×800/);
  assert.match(t, /s-1 · Fix login · session · at 950,220 size 400×400 · in w:\/code\/shop/);
});

test("a tool's place is kept by:ai and told to every window; the next read sees it", async () => {
  const h = home(), told: any[] = [];
  C.setSeen(h, PICTURE);
  const r = await C.runCanvasTool("canvas_place", { id: "School", x: 900, y: 1100 }, h, (m) => told.push(m));
  assert.ok(!r.isError, said(r));
  const q = P.readPos(h).pos["h:school"];
  assert.equal(q.by, "ai");
  assert.deepEqual([q.x, q.y, q.w, q.h, q.touched, q.folded], [900, 1100, 1000, 1200, true, false], "its size stays when none is said");
  assert.deepEqual(told.map((m) => [m.type, m.id, m.by, m.x, m.y]), [["next.pos.ai", "h:school", "ai", 900, 1100]]);
  assert.match(said(await C.runCanvasTool("canvas_read", {}, h, () => {})), /h:school · School · folder · at 900,1100/);
  // a size said is kept too
  await C.runCanvasTool("canvas_place", { id: "diary", x: 0, y: 0, w: 800, h: 600 }, h, () => {});
  assert.deepEqual([P.readPos(h).pos.diary.w, P.readPos(h).pos.diary.h, P.readPos(h).pos.diary.by], [800, 600, "ai"]);
  // a thing that is not there changes nothing
  const miss = await C.runCanvasTool("canvas_place", { id: "nope", x: 1, y: 1 }, h, (m) => told.push(m));
  assert.equal(miss.isError, true);
  assert.match(said(miss), /no “nope” on the canvas/);
  assert.equal(told.length, 1);
});

test("canvas_fold folds and unfolds by:ai; already folded says so and writes nothing", async () => {
  const h = home(), told: any[] = [];
  C.setSeen(h, PICTURE);
  await C.runCanvasTool("canvas_fold", { id: "w:/code/shop", folded: true }, h, (m) => told.push(m));
  assert.deepEqual([P.readPos(h).pos["w:/code/shop"].folded, P.readPos(h).pos["w:/code/shop"].by], [true, "ai"]);
  assert.match(said(await C.runCanvasTool("canvas_fold", { id: "w:/code/shop", folded: true }, h, (m) => told.push(m))), /already folded/);
  assert.equal(told.length, 1);
  assert.equal(told[0].folded, true);
});

test("canvas_arrange lays the top of the canvas out from where the first stands, each keeping its size", async () => {
  const h = home(), told: any[] = [];
  C.setSeen(h, PICTURE);
  const r = await C.runCanvasTool("canvas_arrange", { how: "row" }, h, (m) => told.push(m));
  assert.match(said(r), /arranged 3 things in a row/);
  const pos = P.readPos(h).pos;
  assert.equal(pos["s-1"], undefined, "a thing inside a folder goes with its folder, not on its own");
  // reading order: the Diary (x 0), shop, School; from x 0, y 110, GAP between
  assert.deepEqual([pos.diary.x, pos["w:/code/shop"].x, pos["h:school"].x], [0, 1240 + C.GAP, 1240 + C.GAP + 1000 + C.GAP]);
  assert.ok(Object.values(pos).every((q) => q.by === "ai" && q.y === 110));
  assert.equal(told.length, 3);
  // a grid of four is two by two; a column stacks
  const spots = C.arrangeSpots([1, 2, 3, 4].map((i) => ({ id: `p${i}`, name: "", kind: "", x: i * 10, y: 0, w: 100, h: 50, folded: false })), "grid", 10);
  assert.deepEqual(spots.map((s) => [s.x, s.y]), [[10, 0], [120, 0], [10, 60], [120, 60]]);
  assert.deepEqual(C.arrangeSpots(PICTURE.slice(0, 2) as never, "column", 10).map((s) => [s.x, s.y]), [[900, 110], [900, 920]]);
  // ids in the order given; one not there arranges nothing
  assert.equal((await C.runCanvasTool("canvas_arrange", { how: "grid", ids: ["s-1", "zzz"] }, h, () => {})).isError, true);
});

test("canvas_open asks the window for the piece's tab in front, or opens it where it stands", async () => {
  const h = home(), told: any[] = [];
  C.setSeen(h, PICTURE);
  await C.runCanvasTool("canvas_open", { id: "Fix login" }, h, (m) => told.push(m));
  await C.runCanvasTool("canvas_open", { id: "s-1", as: "place" }, h, (m) => told.push(m));
  assert.deepEqual(told, [{ type: "next.tab.ai", verb: "tab", piece: "s-1", front: true }, { type: "next.tab.ai", verb: "open", piece: "s-1" }]);
});

// ---------------------------------------------------------------- the bar's words to the standing session

function bar() {
  const hs = new Map<string, any>(), starts: ((e: any) => void)[] = [];
  const says: { id: string; text: string; fresh?: { cwd: string }; how?: { model?: string; mode?: string; effort?: string } }[] = [], marked: string[] = [];
  let ids = 0, gone = new Set<string>(), ends: ((id: string) => void) | null = null, items: any[] = [];
  const deps = {
    say: async (id: string, text: string, fresh?: { cwd: string }, how?: { model?: string; mode?: "bypassPermissions"; effort?: string }) => { says.push({ id, text, fresh, how }); },
    known: async (id: string) => !gone.has(id),
    mark: (id: string) => marked.push(id),
    cwd: () => "/Users/someone",
    uuid: () => `canvas-session-${++ids}`,
    onTurnEnd: (fn: (id: string) => void) => { ends = fn; },
    items: () => items,
  };
  canvasPart({ on: (t: string, f: never) => hs.set(t, f), atStart: (f: (e: any) => void) => starts.push(f), route: () => {} } as never, () => deps);
  const h = home(), told: any[] = [], sent: any[] = [];
  const conn = (fromSol: boolean) => ({ HOME: h, PORT: 0, ws: {}, send: (_w: unknown, m: object) => sent.push(m), everyone: (m: object) => told.push(m), face: { send: (m: object) => sent.push(m) }, conn: { chars: 0 }, fromSol, fromApp: fromSol });
  const ask = (m: any, fromSol = true) => hs.get("next.canvas.say")(m, conn(fromSol));
  const start = async () => { for (const f of starts) f({ HOME: h, PORT: 0, send() {}, everyone: (m: object) => told.push(m) }); await new Promise((r) => setTimeout(r, 5)); };
  return { h, ask, says, marked, told, sent, start, gone, end: (id: string) => ends!(id), setItems: (x: any[]) => { items = x; } };
}

test("unmatched text starts the canvas session once, then continues it; a gone one is started again", async () => {
  const b = bar();
  await b.ask({ type: "next.canvas.say", text: "can you organize my canvas right now, everything is out of whack", canvas: PICTURE });
  assert.equal(b.says.length, 1);
  const first = b.says[0];
  assert.equal(first.id, "canvas-session-1");
  assert.deepEqual(first.fresh, { cwd: "/Users/someone" });
  assert.deepEqual(first.how, { mode: "bypassPermissions", model: "claude-opus-5-5", effort: "low" }, "Opus 5.5 at low effort, nothing refused or asked");
  assert.ok(first.text.startsWith(A.BRIEF), "the brief first");
  assert.match(first.text, /organize my canvas right now/);
  assert.deepEqual(b.marked, ["canvas-session-1"], "marked, so no list draws it");
  assert.equal(A.canvasSession(b.h), "canvas-session-1", "kept for the home");
  assert.deepEqual(b.told.at(-1), { type: "next.canvas.said", working: true, session: "canvas-session-1" });
  assert.equal(C.canvasNow(b.h).length, 4, "the window's picture is kept for canvas_read");

  await b.ask({ type: "next.canvas.say", text: "now fold School" });
  assert.equal(b.says[1].id, "canvas-session-1", "continued");
  assert.equal(b.says[1].fresh, undefined);
  assert.equal(b.says[1].text, "now fold School", "no brief the second time");
  assert.deepEqual(b.says[1].how, { mode: "bypassPermissions", model: "claude-opus-5-5", effort: "low" }, "continued the same way");
  assert.deepEqual(b.marked, ["canvas-session-1"]);

  b.gone.add("canvas-session-1");
  await b.ask({ type: "next.canvas.say", text: "and again" });
  assert.equal(b.says[2].id, "canvas-session-2");
  assert.ok(b.says[2].fresh);
  assert.equal(A.canvasSession(b.h), "canvas-session-2");
});

test("a session begun on the older brief (dontAsk, the cheapest Claude) is not continued; the brief never sends the person to grant a permission", async () => {
  const b = bar();
  mkdirSync(join(b.h, "next"), { recursive: true });
  writeFileSync(A.canvasFile(b.h), JSON.stringify({ v: 1, session: "old-haiku-session", at: 1 }));
  assert.equal(A.canvasSession(b.h), null);
  await b.ask({ type: "next.canvas.say", text: "save the layout of my current folders" });
  assert.equal(b.says[0].id, "canvas-session-1", "a fresh one, on the brief of now");
  assert.ok(b.says[0].fresh);
  assert.equal(A.canvasSession(b.h), "canvas-session-1");
  assert.match(A.BRIEF, /Never ask the person to grant, allow or turn on a permission/);
  assert.match(A.BRIEF, /Sol can't do that yet/);
  assert.doesNotMatch(A.BRIEF, /dontAsk|allow file writes/);
});

test("pieces dropped on the bar ride with the words as chips; nothing at all is refused", async () => {
  const b = bar();
  await b.ask({ type: "next.canvas.say", text: "what is this", chips: [{ id: "s-1", title: "Fix login" }, { id: "" }, "x"] });
  assert.match(b.says[0].text, /what is this\n\nDropped on the bar with these words \(canvas ids for the canvas tools\):\n- “Fix login” \(s-1\)$/);
  await b.ask({ type: "next.canvas.say", chips: [{ id: "diary", title: "the Diary" }] });
  assert.match(b.says[1].text, /^\(no words: they dropped these on the bar\)\n\nDropped/);
  await b.ask({ type: "next.canvas.say", text: "   " });
  assert.equal(b.says.length, 2);
  assert.deepEqual(b.sent.at(-1), { type: "next.refused", asked: "next.canvas.say", why: "nothing to say" });
});

test("its turn's words come back to every window, and only for the canvas session", async () => {
  const b = bar();
  await b.start();
  await b.ask({ type: "next.canvas.say", text: "tidy up" });
  b.setItems([{ kind: "me", text: "older" }, { kind: "you", text: "old answer" }, { kind: "me", text: "tidy up" }, { kind: "you", text: "Reading the canvas." },
    { kind: "tool", name: "mcp__sol__canvas_arrange" }, { kind: "you", text: "Laid your 3 folders out in a row and folded School." }]);
  b.end("someone-else");
  assert.equal(b.told.filter((m) => m.working === false).length, 0);
  b.end("canvas-session-1");
  assert.deepEqual(b.told.at(-1), { type: "next.canvas.said", working: false, session: "canvas-session-1", text: "Laid your 3 folders out in a row and folded School." });
  assert.equal(A.saidThisTurn([{ kind: "me" }, { kind: "wrap", recap: "Arranged." }]), "Arranged.");
  assert.match(A.saidThisTurn([{ kind: "me" }, { kind: "error", text: "rate limited" }]), /It stopped: rate limited/);
});

test("off, nothing is answered or written; another connection is refused", async () => {
  const b = bar();
  process.env.SOL_UI_NEXT = "off";
  await b.ask({ type: "next.canvas.say", text: "tidy" });
  assert.equal(b.says.length, 0);
  assert.equal(A.canvasSession(b.h), null);
  process.env.SOL_UI_NEXT = "on";
  await b.ask({ type: "next.canvas.say", text: "tidy" }, false);
  assert.equal(b.says.length, 0);
  assert.equal(b.sent.at(-1).type, "next.refused");
});

test("no list draws the bar's own session, nor counts its folder", async () => {
  const S = await import("../work/state.js");
  const X = await import("../work/sessions.js");
  const d = join(tmp, "code", "app"); mkdirSync(d, { recursive: true });
  S.mark("canvas-1", { canvas: true });
  const row = (sessionId: string, cwd: string) => ({ sessionId, cwd, summary: sessionId, lastModified: 1000 }) as never;
  const f = X.fileSessions([row("s1", d), row("canvas-1", tmp)]);
  assert.deepEqual(f.sessions.map((s) => s.id), ["s1"]);
  assert.deepEqual(f.projects.map((p) => p.path), [d]);
  const w = X.withRuns({ sessions: [], projects: [] }, [{ sessionId: "canvas-1", cwd: tmp }]);
  assert.deepEqual(w.sessions, []);
});
