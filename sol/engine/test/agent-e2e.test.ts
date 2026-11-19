// The folder's agent end to end, on a real engine (its own port, home and browser profile): a fake Blackboard (a local
// static site with two snapshots of the course) → the 03:00 rule run by agent.run → the first look kept as the
// baseline → the course changes → a ticket in watch mode with a wouldHave card → GET /agent/la245 shows it.
// The Codex turn is a stand-in (SOL_CODEX) that answers like Codex does and writes one file in the folder, so nothing
// leaves the machine. Set SOL_AGENT_E2E_OUT=<file> to keep what each step answered (REPORT.md quotes it).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { freePort } from "./test-engine.ts";

const ENGINE = join(import.meta.dirname, "..");
const PORT = await freePort();   // a port nobody holds (#938): a fixed range of nine met another suite on the same runner
const dir = mkdtempSync(join(tmpdir(), "sol-agent-e2e-"));
const home = join(dir, "home"), folder = join(home, "school", "la245");
const C = "/ultra/courses/_355037_1";
const record: Record<string, unknown> = {};

// ---- the fake Blackboard: two snapshots of the course as static pages ----
const page = (title: string, body: string) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body><h1>${title}</h1>${body}</body>`;
const link = (href: string, text: string) => `<p><a href="${href}">${text}</a></p>`;
const ONE: Record<string, string> = {
  [`${C}/outline`]: page("LA245 A1 · Course Content", "Course _355037_1" + link(`${C}/content/week9`, "Week 9") + link(`${C}/assignments/day-in-court`, "Day in Court team paper")),
  [`${C}/announcements`]: page("Announcements", "<p>Oct 20 · Read Leonard v. PepsiCo before Thursday.</p>"),
  [`${C}/calendar`]: page("Calendar", "<p>Oct 29 · Day in Court team paper due 11:59 pm</p>"),
  [`${C}/content/week9`]: page("Week 9", link(`${C}/content/week9/chapter-10-deck`, "10.20.26 Chapter 10_STUDENT FINAL.pptx")),
  [`${C}/content/week9/chapter-10-deck`]: page("Chapter 10 deck", "<p>Intro to Contracts. Posted Oct 20.</p>"),
  [`${C}/assignments/day-in-court`]: page("Day in Court team paper", "<p>Due Oct 29 11:59 pm · 1 attempt · 100 pts · PDF upload · one paper per team</p>"),
};
const TWO: Record<string, string> = {
  ...ONE,
  [`${C}/outline`]: page("LA245 A1 · Course Content", "Course _355037_1" + link(`${C}/content/week9`, "Week 9") + link(`${C}/content/week10`, "Week 10") + link(`${C}/assignments/day-in-court`, "Day in Court team paper") + link(`${C}/assignments/chapter-11-quiz`, "Chapter 11 quiz")),
  [`${C}/announcements`]: page("Announcements", "<p>Nov 9 · The final exam is Tuesday, November 24, in class.</p><p>Oct 20 · Read Leonard v. PepsiCo before Thursday.</p>"),
  [`${C}/calendar`]: page("Calendar", "<p>Nov 13 · Chapter 11 quiz closes 11:59 pm</p><p>Nov 24 · Final exam</p>"),
  [`${C}/content/week10`]: page("Week 10", link(`${C}/content/week10/chapter-11-deck`, "11.10.26 Chapter 11_STUDENT FINAL.pptx")),
  [`${C}/content/week10/chapter-11-deck`]: page("Chapter 11 deck", "<p>Agreement: offer and acceptance. Posted Nov 9.</p>"),
  [`${C}/assignments/chapter-11-quiz`]: page("Chapter 11 quiz", "<p>Opens Nov 10 · closes Fri Nov 13 11:59 pm · 1 attempt · 20 min · 20 pts</p>"),
};
let site = ONE;
const bb: Server = createServer((req, res) => {
  const p = (req.url ?? "/").split("?")[0].replace(/\/+$/, "");
  const html = site[p];
  res.writeHead(html ? 200 : 404, { "content-type": "text/html" });
  res.end(html ?? page("Not found", "404 not found"));
});
await new Promise<void>((r) => bb.listen(0, "127.0.0.1", () => r()));
const BB = `http://127.0.0.1:${(bb.address() as { port: number }).port}`;

// ---- the stand-in Codex: answers like `codex exec --experimental-json`, writes made/today.md in its folder ----
const ANSWER = [
  "Read the course: the exam is set for Nov 24, Chapter 11 deck and quiz are new.",
  "Made made/today.md (today we do) and made/chapter-11-notes.md with 3 questions.",
  JSON.stringify({ report: "ready", card: { title: "Today we do: Chapter 11 quiz", line: "closes Fri Nov 13 11:59 pm, 1 attempt, 20 min; exam now Nov 24 (plan rebuilt)", choices: ["looks right", "not now"] } }),
].join("\n");
writeFileSync(join(dir, "codex"), `#!${process.execPath}
const a = process.argv.slice(2), cd = a[a.indexOf("--cd") + 1] ?? process.cwd();
const fs = require("fs"), path = require("path");
let input = ""; process.stdin.on("data", (d) => input += d); process.stdin.on("end", () => {
  fs.mkdirSync(path.join(cd, "made"), { recursive: true });
  fs.writeFileSync(path.join(cd, "made", "today.md"), "Today we do:\\n1. Chapter 11 quiz\\n");
  fs.writeFileSync(path.join(${JSON.stringify(dir)}, "prompt.txt"), input);
  const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
  const resumed = a.includes("resume");
  out({ type: "thread.started", thread_id: resumed ? a[a.indexOf("resume") + 1] : "fake-thread-la245" });
  out({ type: "turn.started" });
  out({ type: "item.completed", item: { id: "m1", type: "agent_message", text: ${JSON.stringify(ANSWER)} } });
  out({ type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } });
});
`);
chmodSync(join(dir, "codex"), 0o755);

// ---- the home: LA245 with its policy, everything in watch ----
mkdirSync(join(folder, "material"), { recursive: true });
writeFileSync(join(folder, "policy.md"), readFileSync(join(import.meta.dirname, "fixtures", "la245-policy.md"), "utf8"));
writeFileSync(join(folder, "brain.md"), "# LA245\n\nBlackboard course `_355037_1`.\n");

let engine: ChildProcess | null = null;
const sockets: WebSocket[] = [];
after(async () => {
  for (const s of sockets) s.terminate();
  const e = engine;
  if (e && e.exitCode === null && e.signalCode === null) {
    const gone = new Promise((r) => e.once("exit", r));
    e.kill();
    const t = setTimeout(() => e.kill("SIGKILL"), 5000);
    await gone;
    clearTimeout(t);
  }
  bb.close();
  if (process.env.SOL_AGENT_E2E_OUT) writeFileSync(process.env.SOL_AGENT_E2E_OUT, JSON.stringify(record, null, 2) + "\n");
  rmSync(dir, { recursive: true, force: true });
});

async function up() {
  engine = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ENGINE, stdio: ["ignore", "ignore", "inherit"],
    env: {
      ...process.env, SOL_PORT: String(PORT), SOL_HOME: home, SOL_PROFILE: join(dir, "profile"),
      SOL_STATE: join(dir, "work.json"), SOL_TEAM: join(dir, "team.json"), SOL_LOG: join(dir, "engine.log"),
      SOL_CODEX: join(dir, "codex"), SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off",
      SOL_BLACKBOARD: BB, SOL_AGENT_CLOCK: "off", JEV_API_KEY: "",
    },
  });
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("the test engine did not come up");
}

type Msg = { type: string; [k: string]: any };
async function ask(m: object & { type: string }, ms = 90_000): Promise<Msg> {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  sockets.push(ws);
  await new Promise((r, no) => { ws.once("open", r); ws.once("error", no); });
  const rid = Math.random().toString(36).slice(2);
  const got = new Promise<Msg>((ok, no) => {
    const t = setTimeout(() => no(new Error(`no answer to ${m.type}`)), ms);
    ws.on("message", (raw) => { const x = JSON.parse(raw.toString()) as Msg; if (x.type === m.type && x.rid === rid) { clearTimeout(t); ok(x); } });
  });
  ws.send(JSON.stringify({ ...m, rid }));
  const x = await got;
  ws.close();
  return x;
}

test("the folder's agent: a fake Blackboard, the 03:00 rule by agent.run, a wouldHave card on /agent/la245", { timeout: 240_000 }, async () => {
  await up();
  const first = await ask({ type: "agent.run", folder: "la245", ruleId: "blackboard-1" });
  record.firstRun = first;
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.ticket, null);
  assert.match(first.line, /^baseline of \d+ pages$/);
  const kept = JSON.parse(readFileSync(join(folder, ".agent", "blackboard-last.json"), "utf8"));
  assert.ok(Object.keys(kept.pages).some((k) => k.endsWith("/assignments/day-in-court")), Object.keys(kept.pages).join(" "));

  site = TWO;   // the course changes overnight
  const second = await ask({ type: "agent.run", folder: "la245", ruleId: "blackboard-1" });
  record.secondRun = { ok: second.ok, line: second.line, ticket: second.ticket && { id: second.ticket.id, state: second.ticket.state, mandate: second.ticket.mandate, needs: second.ticket.needs, runs: second.ticket.runs.map((r: any) => ({ report: r.report, thread: r.thread })) } };
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.match(second.line, /new content "Week 10"/);
  assert.match(second.line, /new assignment "Chapter 11 quiz"/);
  assert.match(second.line, /changed announcement "Announcements"/);
  const t = second.ticket;
  assert.equal(t.state, "waiting");
  assert.equal(t.mandate.mode, "watch");
  assert.equal(t.needs.wouldHave, true);
  assert.equal(t.needs.title, "Today we do: Chapter 11 quiz");
  assert.equal(t.runs[0].thread, "fake-thread-la245");
  assert.ok(existsSync(join(folder, "made", "today.md")));
  assert.equal(JSON.parse(readFileSync(join(folder, ".agent", "thread.json"), "utf8")).thread, "fake-thread-la245");
  const prompt = readFileSync(join(dir, "prompt.txt"), "utf8");
  assert.match(prompt, /rule blackboard-1 \(mode watch, rung read\)/);
  assert.match(prompt, /Chapter 11 quiz/);

  const tickets = await ask({ type: "agent.tickets", folder: "la245" });
  record.tickets = { cards: tickets.cards, rules: tickets.rules.map((r: any) => `${r.id} [${r.mode}]`) };
  assert.equal(tickets.cards.length, 1);
  assert.equal(tickets.cards[0].wouldHave, true);

  const html = await (await fetch(`http://127.0.0.1:${PORT}/agent/la245`)).text();
  record.page = html.replace(/<style>[\s\S]*?<\/style>/, "<style>…</style>").replace(/>\s*</g, ">\n<").split("\n").filter((l) => /Today we do|would have|ledger|read<\/b>|blackboard-1/i.test(l)).slice(0, 12);
  assert.match(html, /Today we do: Chapter 11 quiz/);
  assert.match(html, /would have shown \(watch\)/);
  assert.match(html, /<button class="yes">looks right<\/button>/);
  assert.match(html, /every night at 03:00 read the course/);
  const ledger = readFileSync(join(folder, "ledger.md"), "utf8");
  record.ledger = ledger.trim().split("\n").filter((l) => l.startsWith("- "));
  assert.match(ledger, /made: the first look, kept as the baseline/);
  assert.match(ledger, /held: would have shown "Today we do: Chapter 11 quiz"/);
  assert.match(ledger, /made: made\/today\.md/);

  // his answer from the page's button: a form POST, the page back; the answer lands on the same ticket (the thread resumed)
  const post = await fetch(`http://127.0.0.1:${PORT}/agent/la245`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ type: "agent.answer", ticketId: t.id, choice: "looks right" }).toString() });
  assert.equal(post.status, 303);
  const after = JSON.parse(readFileSync(join(folder, ".agent", "tickets", `${t.id}.json`), "utf8"));
  record.afterAnswer = { state: after.state, runs: after.runs.length, triggers: after.triggers.map((x: any) => x.kind) };
  assert.deepEqual(after.triggers.map((x: any) => x.kind), ["changed", "answer"]);
  assert.equal(after.runs.length, 2);

  // a page from another site cannot press the buttons (the door)
  const evil = await fetch(`http://127.0.0.1:${PORT}/agent/la245`, { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" }, body: "type=agent.rule&ruleId=blackboard-1&mode=do" });
  assert.equal(evil.status, 403);
  // off · watch · do rewrites the line
  const rule = await ask({ type: "agent.rule", folder: "la245", ruleId: "clock-1", mode: "off" });
  assert.equal(rule.ok, true);
  assert.match(readFileSync(join(folder, "policy.md"), "utf8"), /^- \[off\] clock: 19:30/m);
});
