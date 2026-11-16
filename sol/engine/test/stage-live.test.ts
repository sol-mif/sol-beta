// The kinds that are programs (#699, work/live.ts): a terminal block's pty (opened with the block, written, read, killed
// when the block closes, its end in the ledger), a browser block's wheel (the agent's tools refused while the person
// holds it), the address a bare host gets, and the face's own compose of both. A home of its own; never the real one.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "sol-live-home-"));
const REPO = mkdtempSync(join(tmpdir(), "sol-live-repo-"));
mkdirSync(join(REPO, ".git"));
const TEAM = join(mkdtempSync(join(tmpdir(), "sol-team-")), "team.json");
writeFileSync(TEAM, JSON.stringify({ me: { login: "tester", name: "T" }, repos: [] }));
process.env.SOL_HOME = HOME;
process.env.SOL_TEAM = TEAM;
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SHELL = "/bin/sh";   // a plain shell: no profile's words in what the test reads

const S = await import("../src/work/blocks.ts");
const L = await import("../src/work/live.ts");
const P = await import("../src/work/panes.ts");
const tools = await import("../src/work/tools.ts");
const browser = await import("../src/browser.ts");

const heard: any[] = [];
S.setStageBus((m) => heard.push(m));
L.setLiveOut((m) => heard.push(m));
S.setStageFinder(async () => ({ cwd: REPO, by: "tester's agent" }));
const SID = "sess-live1111";
const project = S.projectOf(REPO);
const who = { project, sessionId: SID, by: "tester's agent", cwd: REPO };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (r: { content: { type: string; text?: string }[] }) => r.content.map((c) => c.text ?? "").join("\n");
async function until(f: () => boolean, ms = 5000) { const end = Date.now() + ms; while (!f() && Date.now() < end) await wait(25); return f(); }
const tidOf = (id: string) => JSON.parse(S.bodyOf(project, id)!.text!).tid as string;
after(() => { S.disarmAll(); S.setStageBus(null); for (const t of P.allTerms()) P.closeTerm(t.tid); });

test("plain words: colours, titles and cursor moves out, a line rewritten in place is its last state", () => {
  assert.equal(L.plain("\x1b[32mok\x1b[0m done\r\n"), "ok done\n");
  assert.equal(L.plain("\x1b]0;title\x07$ ls"), "$ ls");
  assert.equal(L.plain("10%\r50%\r100%\nnext"), "100%\nnext");
  assert.equal(L.tail("a\nb\nc\n\n", 2), "b\nc");
});

test("a bare host: http for this machine, https for the rest; a scheme is kept", () => {
  assert.equal(L.addressOf("localhost:1420"), "http://localhost:1420");
  assert.equal(L.addressOf("127.0.0.1:7777/health"), "http://127.0.0.1:7777/health");
  assert.equal(L.addressOf("example.com"), "https://example.com");
  assert.equal(L.addressOf("http://x.test/"), "http://x.test/");
  assert.equal(L.addressOf(""), "");
});

test("a terminal block: the pty opens with it, runs what it was given, is written and read, and dies with the block", async () => {
  const b = L.composeTerminal(who, { run: "echo sol-$((40+2))" });
  assert.equal(b.kind, "terminal");
  assert.equal(b.title, "echo sol-$((40+2))");
  const tid = tidOf(b.id);
  assert.ok(P.getTerm(tid)?.alive, "the engine owns a live pty, its id in the block's body");
  assert.ok(heard.some((m) => m.type === "work.terms" && m.terms.some((t: any) => t.tid === tid)), "the faces hear of the terminal");
  assert.ok(await until(() => L.termRead(who, b.id).includes("sol-42")), "the command ran in it");
  assert.ok(heard.some((m) => m.type === "work.term.out" && m.tid === tid), "its output goes to the faces");

  L.termWrite(who, b.id, "echo second-$((1+1))");
  assert.ok(await until(() => L.termRead(who, b.id).includes("second-2")), "the agent's words ran");
  assert.ok(S.ledger(project, b.id).some((l) => l.ev === "ran" && l.note === "ran: echo second-$((1+1))"), "a ledger line says what ran");
  assert.ok(!L.termRead(who, b.id, 1).includes("sol-42"), "read gives the last lines asked for");

  S.place(who, { id: b.id, close: true });
  assert.equal(P.getTerm(tid), undefined, "closing the block kills its pty");
  assert.throws(() => L.termRead(who, b.id), /no terminal block/);
});

test("the shell ending is a line in the block's ledger; a dead shell refuses words", async () => {
  const b = L.composeTerminal(who, { title: "short", run: "exit 3" });
  assert.ok(await until(() => S.ledger(project, b.id).some((l) => l.note === "the shell ended (3)")), "the end is in the ledger");
  assert.throws(() => L.termWrite(who, b.id, "ls"), /the shell has ended/);
  assert.match(L.termRead(who, b.id), /\[the shell ended \(3\)\]/);
  S.place(who, { id: b.id, close: true });
});

test("the agent's tools: terminal_run composes a terminal and types into one; terminal_read reads it", async () => {
  assert.ok(tools.WORK_TOOLS.some((t) => t.name === "terminal_run") && tools.WORK_TOOLS.some((t) => t.name === "terminal_read"));
  const r = await tools.runWorkTool("terminal_run", { command: "echo from-the-agent", title: "the lint" }, SID);
  assert.ok(!r.isError, text(r));
  const id = /composed (\w+)/.exec(text(r))![1];
  assert.equal(S.getBlock(project, id)?.title, "the lint");
  let read = "";
  assert.ok(await until(() => { void L.runLiveTool("terminal_read", { id, lines: 20 }, SID).then((x) => { read = text(x); }); return read.includes("from-the-agent"); }));
  const typed = await tools.runWorkTool("terminal_run", { command: "echo again", id }, SID);
  assert.match(text(typed), new RegExp(`typed into ${id}`));
  assert.ok((await tools.runWorkTool("terminal_read", { id: "nope0000" }, SID)).isError);
  const tid = tidOf(id);
  await tools.runWorkTool("place", { id, close: true }, SID);
  assert.equal(P.getTerm(tid), undefined);
  // compose with kind terminal is the same program
  const c = await tools.runWorkTool("compose", { kind: "terminal", title: "a shell", body: JSON.stringify({ run: "true" }) }, SID);
  const cid = /composed (\w+)/.exec(text(c))![1];
  assert.ok(P.getTerm(tidOf(cid))?.alive);
  await tools.runWorkTool("place", { id: cid, close: true }, SID);

  assert.ok(tools.WORK_TOOLS.some((t) => t.name === "terminal_run"), "every session's (the swap, #718)");
});

test("a browser block's wheel: the person's hand refuses the agent's tools; sol's hand lets them through; the ledger says who", async () => {
  const b = L.composeBrowser(who, { url: "localhost:1420" });
  assert.equal(b.title, "localhost:1420");
  assert.deepEqual(L.browserBody(project, b.id), { url: "http://localhost:1420", hand: "sol" });

  L.wheel(who, b.id, "you");
  assert.equal(L.browserBody(project, b.id).hand, "you");
  assert.ok(S.ledger(project, b.id).some((l) => l.note === "you took the wheel"));
  const r = await browser.runBrowserTool("browser_click", { block: b.id, text: "x" }, { sessionId: SID });
  assert.ok(r.isError);
  assert.match(text(r), /the person holds the wheel of "localhost:1420"/);
  // with no block named, the agent's own browser block is one it holds: the person's is never picked
  const none = await browser.runBrowserTool("browser_read", {}, { sessionId: SID });
  assert.match(text(none), /No page is open/, "no block of its own: today's tab, and there is none");

  L.wheel(who, b.id, "sol");
  assert.ok(S.ledger(project, b.id).some((l) => l.note === "sol drives"));
  const bad = await browser.runBrowserTool("browser_read", { block: "nope0000" }, { sessionId: SID });
  assert.match(text(bad), /no browser block "nope0000"/);

  // the person's page moving: the body follows, no ledger line
  const lines = S.ledger(project, b.id).length;
  L.at(project, b.id, "http://localhost:1420/settings");
  assert.equal(L.browserBody(project, b.id).url, "http://localhost:1420/settings");
  assert.equal(S.ledger(project, b.id).length, lines);
  assert.throws(() => L.wheel(who, "nope0000", "you"), /no browser block/);
  S.place(who, { id: b.id, close: true });
});

test("a shot lays a still in the browser block's stills: one stills block each, waiting on the person, the picture kept", () => {
  const b = L.composeBrowser(who, { url: "https://example.com" });
  const png = Buffer.from("89504e470d0a1a0a", "hex");
  const s1 = L.keepShot(who, b.id, png);
  assert.equal(s1.kind, "shots");
  assert.equal(s1.state, "waits");
  assert.equal(s1.parent, b.id);
  const s2 = L.keepShot(who, b.id, png);
  assert.equal(s2.id, s1.id, "the same stills block grows");
  const list = JSON.parse(S.bodyOf(project, s1.id)!.text!);
  assert.equal(list.length, 2);
  assert.match(list[0].name, /^example\.com · \d\d:\d\d$/);
  assert.ok(list[0].path.startsWith(S.blockPath(project, s1.id)), "kept beside the stills block, not in its body");
  assert.ok(S.ledger(project, b.id).some((l) => l.note === `a shot, to ${s1.title}`));
  S.place(who, { id: b.id, close: true });
});
