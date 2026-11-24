// Help (#1615 BR1; next/help/help.ts, parts/next-help.ts, the bar's routing in parts/next-canvas.ts), on a temp SOL_HOME:
// the shipped faq holds the page's nine answers word for word and nothing of one person's home; the six walks carry
// learn.html's steps under the ids the face uses; the Help session is started once and continued, marked Help's, and
// given its one tool before every turn, so it is narrow (no shell, no edits, no other tool: read-only); it answers from
// the faq and the walks, and an answer ends with Show me { walk, step }; the canvas bar sends a "how do I…" to Help and
// answers in one line with Show me and Open in Help, never "Not a move I know", while a move stays the canvas agent's.
// Signed: marcocyl04-ux's agent (builder T-engine), BR1 (#1615).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const tmp = mkdtempSync("/var/tmp/sol-next-help-");
const wasEnv = process.env.SOL_UI_NEXT;
Object.assign(process.env, { HOME: tmp, SOL_SETTINGS: join(tmp, "settings.json"), SOL_STATE: join(tmp, "work.json"), SOL_SESSIONS_DIR: join(tmp, "sessions") });
after(() => { rmSync(tmp, { recursive: true, force: true }); if (wasEnv === undefined) delete process.env.SOL_UI_NEXT; else process.env.SOL_UI_NEXT = wasEnv; });
process.env.SOL_UI_NEXT = "on";

const H = await import("./help/help.js");
const T = await import("../work/tools.js");
const { helpPart } = await import("../parts/next-help.js");
const { canvasPart } = await import("../parts/next-canvas.js");

let n = 0;
const home = () => { const h = join(tmp, `h${++n}`); mkdirSync(h, { recursive: true }); return h; };

// ---------------------------------------------------------------- the faq and the walks

const PAGE: [string, string][] = [
  ["What does \"Sol knows 12\" mean?", "Sol has read 12 things in this folder (notes, files, chats), so a session here starts already knowing them."],
  ["What's a seat?", "An AI plan you're signed into, like Claude or Codex. \"1 coming up\" means one is still signing in."],
  ["What do \"only looks\", \"prepares\" and \"does it\" mean?", "How much Sol may do in a place: read only, get things ready for your OK, or act on its own."],
  ["What is \"What every session here knows\"?", "The folder's notes every new session reads first. Edit them and every session after uses the change."],
  ["What does Unfold do?", "It shows what's inside a stack of folders, card by card. Press again to stack them back."],
  ["What are MCP tools?", "Extra abilities your AI can use, like reading your calendar. You add them in Claude or Codex, and Sol shows the ones you have."],
  ["What's the digest?", "A short summary of what happened while you were away, at the top of the Diary."],
  ["Why does the AI ask first?", "Asks first is on for that session. Switch it in the model chip, under \"Before acting\"."],
  ["Is anything deleted when I tidy?", "No. The Shelf and Arrange only move things, and Undo brings them back."],
];

test("the shipped faq: its first nine answers are the page's, word for word, and nothing of one person's home", () => {
  const faq = H.FAQ();
  assert.ok(faq.length >= 9);
  assert.deepEqual(faq.slice(0, 9).map((e) => [e.q, e.a]), PAGE);
  const raw = readFileSync(H.faqFile(), "utf8");
  for (const w of [/marco/i, /\/Users\//, /\/home\//, /sol-live/i, /nucbox/i, /legion/i, /jev/i, /\b\d\d:\d\d\b/]) assert.doesNotMatch(raw, w);
  for (const e of faq) if (e.show) assert.deepEqual(H.stepOf(e.show), e.show, `${e.q}: a real walk step`);
  assert.deepEqual(faq[8].show, { walk: "folders", step: 3 }, "tidying shows the Shelf");
});

test("the six walks: the face's ids, learn.html's steps, numbered from 0", () => {
  assert.deepEqual(H.WALKS.map((w) => w.id), ["around", "folders", "ai", "bar", "needs", "yours"]);
  assert.deepEqual(H.WALKS.map((w) => w.title), ["Getting around", "Your folders", "Working with an AI", "The bar", "What needs you", "Make it yours"]);
  assert.deepEqual(H.WALKS.map((w) => w.steps.length), [4, 5, 5, 5, 3, 4]);
  assert.equal(H.WALKS[1].steps[2], "Drag a folder onto another to put it inside");
  assert.equal(H.WALKS[3].steps[1], "A move or a question: \"put X next to Y\", \"what's left in Z?\"");
  for (const w of H.WALKS) for (const s of w.steps) assert.doesNotMatch(s, /your \d\d:\d\d line|\.html/, "no note to the drawing's reader");
  assert.deepEqual(H.stepOf({ walk: "folders", step: 2 }), { walk: "folders", step: 2 });
  assert.equal(H.stepOf({ walk: "folders", step: 5 }), null);
  assert.equal(H.stepOf({ walk: "nope", step: 0 }), null);
});

test("finding an answer: a step or a faq answer for a how-question; a canvas question finds nothing", () => {
  assert.deepEqual(H.findHelp("how do I put a folder inside another one")?.show, { walk: "folders", step: 2 });
  assert.deepEqual(H.findHelp("how do I zoom out")?.show, { walk: "around", step: 1 });
  assert.equal(H.findHelp("what's a seat?")?.from, "faq");
  assert.equal(H.isHowAsk("what's left in shop?"), null, "the canvas agent's");
  assert.equal(H.isHowAsk("put shop next to school"), null, "a move");
  assert.equal(H.isHowAsk("can you organize my canvas"), null, "a move, asked politely");
  assert.ok(H.isHowAsk("how do I bake bread"), "Help's, though the faq does not hold it");
  assert.equal(H.isHowAsk("how do I bake bread")!.found, null, "so Help itself is asked");
  assert.ok(H.isHowAsk("where is the Diary")?.found);
  assert.ok(H.isHowAsk("is anything deleted when I tidy")?.found);
});

test("Show me comes off the answer's last line, checked against the walks", () => {
  assert.deepEqual(H.splitShow("Drag it onto the other folder.\nShow me: folders 2"), { text: "Drag it onto the other folder.", show: { walk: "folders", step: 2 }, replay: "folders" });
  assert.deepEqual(H.splitShow("Drag it.\n\n**Show me:** { walk: folders, step: 2 }\n"), { text: "Drag it.", show: { walk: "folders", step: 2 }, replay: "folders" });
  assert.deepEqual(H.splitShow("Drag it.\nShow me: folders 9"), { text: "Drag it." }, "no such step: no Show me");
  assert.deepEqual(H.splitShow("Plain answer."), { text: "Plain answer." });
  assert.equal(H.oneLine("- a\n- b"), "a b");
  assert.ok(H.oneLine("x".repeat(300)).length <= 200);
});

// ---------------------------------------------------------------- the Help session

function help() {
  const hs = new Map<string, any>(), starts: ((e: any) => void)[] = [];
  const says: { id: string; text: string; fresh?: { cwd: string }; how?: object; narrow: boolean }[] = [], marked: string[] = [];
  let ids = 0, ends: ((id: string) => void)[] = [], items: any[] = [];
  const gone = new Set<string>(), canvasSays: string[] = [];
  const deps = {
    say: async (id: string, text: string, fresh?: { cwd: string }, how?: object) => { says.push({ id, text, fresh, how, narrow: T.narrowFor(id) }); },
    known: async (id: string) => !gone.has(id),
    mark: (id: string) => marked.push(id),
    give: (id: string, t: any) => T.giveTool(id, t),
    cwd: () => "/Users/someone",
    uuid: () => `help-session-${++ids}`,
    onTurnEnd: (fn: (id: string) => void) => { ends.push(fn); },
    items: () => items,
  };
  const parts = { on: (t: string, f: never) => hs.set(t, f), atStart: (f: (e: any) => void) => starts.push(f), route: () => {} } as never;
  helpPart(parts, () => deps);
  // the canvas bar beside it, whose own agent must not be asked a "how do I…"
  canvasPart(parts, () => ({ ...deps, say: async (_id: string, text: string) => { canvasSays.push(text); }, mark: () => {}, uuid: () => `canvas-${++ids}` }) as never);
  const h = home(), told: any[] = [], sent: any[] = [];
  const conn = (fromSol: boolean) => ({ HOME: h, PORT: 0, ws: {}, send: (_w: unknown, m: object) => sent.push(m), everyone: (m: object) => told.push(m), face: { send: (m: object) => sent.push(m) }, conn: { chars: 0 }, fromSol, fromApp: fromSol });
  const msg = (type: string, m: any, fromSol = true) => hs.get(type)({ type, ...m }, conn(fromSol));
  const start = async () => { for (const f of starts) f({ HOME: h, PORT: 0, send() {}, everyone: (m: object) => told.push(m) }); await new Promise((r) => setTimeout(r, 5)); };
  return { h, msg, says, marked, told, sent, start, gone, canvasSays, end: (id: string) => ends.forEach((f) => f(id)), setItems: (x: any[]) => { items = x; } };
}

test("the Help session is started once, read-only (narrow: its one tool, nothing else), then continued; a gone one again", async () => {
  const b = help();
  await b.msg("next.help.ask", { text: "how do I put a folder inside another one" });
  const first = b.says[0];
  assert.equal(first.id, "help-session-1");
  assert.deepEqual(first.fresh, { cwd: "/Users/someone" });
  assert.equal(first.narrow, true, "given its tool before the run starts: narrow, so no shell, no edits, no other tool");
  assert.deepEqual(T.toolsOnlyFor("help-session-1").map((t) => [t.name, !!t.beside]), [["help_find", false]]);
  assert.deepEqual(first.how, { model: "claude-opus-5-5", effort: "low" }, "no bypass: nothing it could do needs one");
  assert.ok(first.text.startsWith("You are Help"), "the brief first");
  assert.match(first.text, /You never change anything: no file, no setting/);
  for (const [, a] of PAGE) assert.ok(first.text.includes(a), "it answers from the faq");
  assert.match(first.text, /folders 2: Drag a folder onto another to put it inside/, "and the walks, by walk and step");
  assert.match(first.text, /how do I put a folder inside another one$/);
  assert.deepEqual(b.marked, ["help-session-1"], "marked Help's, so no list draws it");
  assert.equal(H.helpSession(b.h), "help-session-1");
  assert.deepEqual(b.told.at(-1), { type: "next.help.said", working: true, session: "help-session-1" });

  T.takeTool("help-session-1", "help_find");   // as after a restart: the tool is in memory only
  await b.msg("next.help.ask", { text: "and out again?" });
  assert.equal(b.says[1].id, "help-session-1", "continued");
  assert.equal(b.says[1].text, "and out again?", "no brief the second time");
  assert.equal(b.says[1].narrow, true, "given its tool again before every turn");

  b.gone.add("help-session-1");
  await b.msg("next.help.ask", { text: "what is a seat" });
  assert.equal(b.says[2].id, "help-session-2");
  assert.ok(b.says[2].fresh);
  assert.equal(b.canvasSays.length, 0);
});

test("help_find reads the faq and the walks and returns the step that shows it", async () => {
  assert.equal(await H.HELP_TOOL.run({ words: "put a folder inside another" }), "Drag a folder onto another to put it inside\nShow me: folders 2");
  assert.match(await H.HELP_TOOL.run({ words: "zzqx" }), /Nothing/);
});

test("Help's answer reaches every window with Show me { walk, step } and the walk to replay", async () => {
  const b = help();
  await b.start();
  await b.msg("next.help.ask", { text: "how do I put a folder inside another one" });
  b.setItems([{ kind: "me", text: "how do I…" }, { kind: "you", text: "Drag it onto the other folder on the canvas, and it goes inside.\nShow me: folders 2" }]);
  b.end("someone-else");
  assert.equal(b.told.filter((m) => m.working === false).length, 0, "another session's turn tells nothing");
  b.end("help-session-1");
  assert.deepEqual(b.told.at(-1), { type: "next.help.said", working: false, session: "help-session-1", text: "Drag it onto the other folder on the canvas, and it goes inside.", show: { walk: "folders", step: 2 }, replay: "folders" });
  assert.equal(b.told.filter((m) => m.type === "next.canvas.said").length, 0, "asked in Help, so the bar says nothing");
});

test("next.help.open gives the face the session, the walks, the faq and the starters; with `ask` it asks too", async () => {
  const b = help();
  await b.msg("next.help.open", {});
  const o = b.sent.at(-1);
  assert.equal(o.type, "next.help.opened");
  assert.equal(o.session, null, "none until its first question");
  assert.equal(o.title, "Help");
  assert.deepEqual(o.walks.map((w: any) => w.id), ["around", "folders", "ai", "bar", "needs", "yours"]);
  assert.equal(o.faq[0].q, PAGE[0][0]);
  assert.equal(o.starters[0], "Replay a walk");
  assert.equal(b.says.length, 0);
  await b.msg("next.help.open", { ask: "how do I bake bread" });
  assert.equal(b.says.length, 1);
  await b.msg("next.help.open", {});
  assert.equal(b.sent.at(-1).session, "help-session-1");
  // another connection is refused; off, nothing is answered
  await b.msg("next.help.ask", { text: "hi" }, false);
  assert.equal(b.sent.at(-1).type, "next.refused");
  process.env.SOL_UI_NEXT = "off";
  assert.equal(await b.msg("next.help.open", {}), undefined);
  process.env.SOL_UI_NEXT = "on";
});

// ---------------------------------------------------------------- the canvas bar sends "how do I…" to Help

test("the bar answers a \"how do I…\" in one line with Show me and Open in Help, at once, never asking the canvas agent", async () => {
  const b = help();
  await b.msg("next.canvas.say", { text: "how do I put a folder inside another one" });
  assert.equal(b.canvasSays.length, 0, "not the canvas agent's");
  assert.equal(b.says.length, 0, "the walks hold it: no session asked");
  assert.deepEqual(b.told.at(-1), { type: "next.canvas.said", help: true, working: false, text: "Drag a folder onto another to put it inside", show: { walk: "folders", step: 2 }, openHelp: true, ask: "how do I put a folder inside another one" });
  for (const q of ["where is the Diary", "what's a seat?", "How can I change the colours?", "is anything deleted when I tidy"]) {
    await b.msg("next.canvas.say", { text: q });
    const m = b.told.at(-1);
    assert.equal(m.help, true, q);
    assert.equal(m.openHelp, true, q);
    assert.doesNotMatch(m.text, /not a move I know/i, q);
    assert.doesNotMatch(m.text, /\n/, `${q}: one line`);
  }
  assert.equal(b.canvasSays.length, 0);
});

test("a \"how do I…\" the faq does not hold goes to Help, and the bar gets its one line when Help answers", async () => {
  const b = help();
  await b.start();
  await b.msg("next.canvas.say", { text: "how do I bake bread in Sol" });
  assert.equal(b.canvasSays.length, 0);
  assert.equal(b.says.length, 1, "Help is asked");
  assert.deepEqual(b.told.at(-1), { type: "next.canvas.said", help: true, working: true, session: "help-session-1" });
  b.setItems([{ kind: "me", text: "how do I bake bread" }, { kind: "you", text: "Sol can't bake bread. It keeps your folders and sessions.\nMore words that the bar never shows on a second line." }]);
  b.end("help-session-1");
  const bar = b.told.at(-1);
  assert.equal(bar.type, "next.canvas.said");
  assert.equal(bar.help, true);
  assert.equal(bar.openHelp, true);
  assert.equal(bar.ask, "how do I bake bread in Sol");
  assert.doesNotMatch(bar.text, /\n/);
  assert.doesNotMatch(bar.text, /not a move I know/i);
  assert.equal(b.told.filter((m) => m.type === "next.help.said" && m.working === false).length, 1, "Help's thread has it too");
});

test("a move or a canvas question stays the canvas agent's; dropped pieces with the words do too", async () => {
  const b = help();
  await b.msg("next.canvas.say", { text: "put shop next to school" });
  await b.msg("next.canvas.say", { text: "what's left in shop?" });
  await b.msg("next.canvas.say", { text: "how do I tidy these", chips: [{ id: "w:/a", title: "a" }] });
  assert.equal(b.canvasSays.length, 3);
  assert.equal(b.says.length, 0);
  assert.equal(b.told.filter((m) => m.help).length, 0);
});
