// Step 2 end to end, one per source, on a real engine (its own port, home and browsers): four fake sites on 127.0.0.1,
// each with two snapshots, and a stand-in Codex (SOL_CODEX) that writes what the run asks for, so nothing leaves the
// machine. Each source: the first look → the site changes → agent.run → a wouldHave card on the folder's page and the
// right files in the folder.
//   BU mail          LA245 mail-1    a new message from Prof. Lomax asking something → drafts/<date>-lomax.md, mail.md,
//                                    calendar.md; the card "Reply to Prof. Lomax: …"; "open the draft" goes to it
//   Teams            LA245 teams-1   a new chat message from Leslie → drafts/<date>-leslie.md, teams.md, a card
//   WhatsApp Web     law-project gc-1  the group's new messages → chat-log.md, owed.md, drafts.md, a card with the
//                                    draft's text and "copied"
//   Blackboard       IS223 blackboard-1  the course _348751_1 (the folder's, not LA245's), a control without a link that
//                                    opens a panel in place → its fine print in blackboard.md, its date in calendar.md
// Set SOL_AGENT_E2E_OUT=<file> to keep what each step answered (REPORT-comms.md quotes it).
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { WebSocket } from "ws";
import { freePort } from "./test-engine.ts";

const ENGINE = join(import.meta.dirname, "..");
const PORT = await freePort();   // a port nobody holds (#938): a fixed range of nine met another suite on the same runner
const dir = mkdtempSync(join(tmpdir(), "sol-comms-e2e-"));
const home = join(dir, "home"), school = join(home, "school");
const la = join(school, "la245"), is = join(school, "is223"), law = join(school, "law-project");
const record: Record<string, unknown> = {};
const page = (title: string, body: string) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body>${body}</body>`;

// ---- the fakes: each a site of its own (its own origin), its pages a function of the snapshot ----
const servers: Server[] = [];
async function site(pages: (path: string) => string | null): Promise<string> {
  const s = createServer((req, res) => {
    const html = pages((req.url ?? "/").split("?")[0].replace(/(.)\/+$/, "$1"));
    res.writeHead(html ? 200 : 404, { "content-type": "text/html" });
    res.end(html ?? page("Not found", "404 not found"));
  });
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  return `http://127.0.0.1:${(s.address() as { port: number }).port}`;
}
const snap = { mail: 1, teams: 1, gc: 1, bb: 1 };

// BU mail (Outlook's shape): the list, and each message at its own address
type M = { id: string; name: string; addr: string; subject: string; time: string; body: string };
const MAIL1: M[] = [
  { id: "AAQk-old1", name: "Dionne Lomax", addr: "dlomax@bu.edu", subject: "Slides for Chapter 10", time: "Oct 20", body: "The Chapter 10 slides are posted." },
  { id: "AAQk-old2", name: "BU Dining", addr: "dining@bu.edu", subject: "Menu this week", time: "Oct 21", body: "Tacos on Tuesday." },
];
const MAIL2: M[] = [
  { id: "AAQk-new1", name: "Dionne Lomax", addr: "dlomax@bu.edu", subject: "Team 3 courtroom write-up", time: "10:42 AM", body: "Hi Marco,\nCan you confirm which hearing Team 3 observed, and send me the case name by Fri Nov 13?\nThanks,\nProf. Lomax" },
  { id: "AAQk-new2", name: "Spotify", addr: "no-reply@spotify.com", subject: "Your week in music", time: "9:00 AM", body: "Can you guess your top song?" },
  { id: "AAQk-new3", name: "Leslie Garcia", addr: "lgarcia@bu.edu", subject: "court notes", time: "8:15 AM", body: "Uploaded my notes to the shared folder." },
  ...MAIL1,
];
const OUTLOOK = await site((p) => {
  const list = snap.mail === 1 ? MAIL1 : MAIL2;
  if (p === "/mail/inbox" || p === "/mail") return page("Mail - Inbox", `<h1>Inbox</h1><div role="listbox">${list.map((m) => `<div role="option" data-convid="${m.id}"><div><span title="${m.addr}">${m.name}</span></div><div>${m.subject}</div><div>${m.time}</div><div>${m.body.split("\n")[0]}</div></div>`).join("")}</div>`);
  const id = /^\/mail\/inbox\/id\/(.+)$/.exec(p)?.[1];
  const m = id && list.find((x) => x.id === decodeURIComponent(id));
  return m ? page(m.subject, `<h1>Inbox</h1><div role="main"><h2>${m.subject}</h2><div aria-label="Message body">${m.body.replace(/\n/g, "<br>")}</div><button>Reply</button></div>`) : null;
});

// Teams: the chat list, each chat at its own address, the activity feed
const TEAMS = await site((p) => {
  const two = snap.teams === 2;
  const c1 = [{ mid: "1", who: "Leslie Garcia", t: "2026-11-08T20:00", text: "court notes are up" }, ...(two ? [{ mid: "2", who: "Leslie Garcia", t: "2026-11-09T09:14", text: "Marco can you send your observations section by Thursday Nov 12?" }] : [])];
  const c2 = [{ mid: "1", who: "Sam Park", t: "2026-11-08T19:00", text: "anyone for basketball" }, ...(two ? [{ mid: "2", who: "Sam Park", t: "2026-11-09T09:30", text: "tonight 8?" }] : [])];
  const row = (id: string, name: string, ms: typeof c1) => `<div data-tid="chat-list-item" data-chat-id="${id}"><div>${name}</div><div>${ms.at(-1)!.t}</div><div>${ms.at(-1)!.text}</div></div>`;
  const msgs = (ms: typeof c1) => ms.map((m) => `<div data-tid="chat-pane-message" data-mid="${m.mid}"><span data-tid="message-author-name">${m.who}</span><time datetime="${m.t}">${m.t}</time><div data-tid="chat-pane-message-body">${m.text}</div></div>`).join("");
  if (p === "/v2") return page("Chat | Microsoft Teams", `<h1>Chat</h1>${row("19:c1", "Leslie Garcia", c1)}${row("19:c2", "Sam Park", c2)}`);
  if (p === "/v2/activity") return page("Activity | Microsoft Teams", `<h1>Activity</h1>`);
  if (p === `/l/chat/${encodeURIComponent("19:c1")}/conversations`) return page("Leslie Garcia | Chat", `<h1>Chat</h1>${msgs(c1)}`);
  if (p === `/l/chat/${encodeURIComponent("19:c2")}/conversations`) return page("Sam Park | Chat", `<h1>Chat</h1>${msgs(c2)}`);
  return null;
});

// WhatsApp Web: the chat list and the open group (a click on it changes nothing here: its messages are already drawn)
const GC1 = [
  ["10:02, 11/8/2026", "Leslie Garcia", "ok so the paper is due Nov 2?? no wait it moved", false],
  ["10:05, 11/8/2026", "Jiachen Xie", "it's due Monday Nov 16 now, Lomax posted it", false],
  ["10:06, 11/8/2026", "Marco", "nice, more time", true],
  ["10:10, 11/8/2026", "Londyn Gray", "I'll do the intro", false],
  ["10:12, 11/8/2026", "Leslie Garcia", "I take the analysis part", false],
] as const;
const GC2 = [
  ...GC1,
  ["9:01, 11/9/2026", "Leslie Garcia", "marco can you do the outside authority section? Kuehn v. Pub Zone", false],
  ["9:03, 11/9/2026", "Jiachen Xie", "and we need everyone's notes in the doc by Thu Nov 12", false],
  ["9:04, 11/9/2026", "Londyn Gray", "👍", false],
  ["9:10, 11/9/2026", "Jiachen Xie", "meet Sat Nov 14 at 2pm in the library to put it together?", false],
] as const;
const WHATSAPP = await site((p) => {
  if (p !== "/") return null;
  const lines = (snap.gc === 1 ? GC1 : GC2).map(([t, who, text, out]) => `<div class="${out ? "message-out" : "message-in"}"><div data-pre-plain-text="[${t}] ${who}: "><span class="selectable-text">${text}</span></div></div>`).join("");
  return page("WhatsApp", `<div id="app"><div id="side"><h1>Chats</h1><div id="pane-side" aria-label="Chat list"><div role="listitem"><span title="Roommates">Roommates</span></div><div role="listitem"><span title="Day in Court Team 3">Day in Court Team 3</span></div></div></div><div id="main">${lines}<footer><div contenteditable="true" aria-label="Type a message"></div><button aria-label="Send">send</button></footer></div></div>`);
});

// Blackboard, IS223's course: a row that opens its panel in place (a button, no link), as Ultra does
const C = "/ultra/courses/_348751_1";
const panel = (id: string, label: string, fine: string) => `<div class="row"><button aria-expanded="false" onclick="document.getElementById('${id}').hidden=false;this.setAttribute('aria-expanded','true')">${label}</button><div id="${id}" role="dialog" hidden><h3>${label}</h3><p>${fine}</p><button>Start attempt</button></div></div>`;
const BLACKBOARD = await site((p) => {
  const two = snap.bb === 2;
  const pages: Record<string, string> = {
    [`${C}/outline`]: page("IS223 A1 · Course Content", `<h1>Course Content</h1><p>Course _348751_1</p><p><a href="${C}/content/week10">Week 10</a></p>` +
      panel("lab6", "Lab 6: ER diagram", "Due Fri Nov 20 at 11:59 pm · 2 attempts · late: 10% a day · submit one PDF · 25 pts") +
      (two ? panel("quiz7", "Quiz 7: SQL basics", "Due Wed Nov 11 at 10:00 am · 1 attempt · 20 min time limit · no late submissions · 10 pts") : "")),
    [`${C}/announcements`]: page("Announcements", two ? "<p>Nov 9 · Quiz 7 is up; it closes before class on Wednesday.</p>" : "<p>Nov 2 · Welcome back.</p>"),
    [`${C}/calendar`]: page("Calendar", two ? "<p>Nov 11 · Quiz 7 due 10:00 am</p><p>Nov 20 · Lab 6 due 11:59 pm</p>" : "<p>Nov 20 · Lab 6 due 11:59 pm</p>"),
    [`${C}/content/week10`]: page("Week 10", "<p>Chapter 6: SQL. Slides posted Nov 6.</p>"),
  };
  return pages[p] ?? null;
});

// ---- the stand-in Codex: answers like `codex exec --experimental-json`; writes what the prompt asks for ----
writeFileSync(join(dir, "codex"), `#!${process.execPath}
const a = process.argv.slice(2), cd = a[a.indexOf("--cd") + 1] ?? process.cwd();
const fs = require("fs"), path = require("path");
let input = ""; process.stdin.on("data", (d) => input += d); process.stdin.on("end", () => {
  fs.appendFileSync(path.join(${JSON.stringify(dir)}, "prompts.txt"), "\\n=====\\n" + input);
  let answer;
  const draft = /"draft": "(drafts\\/[^"]+)"/.exec(input);
  if (draft) {
    const who = /"who": "([^"]+)"/.exec(input)[1];
    fs.mkdirSync(path.join(cd, "drafts"), { recursive: true });
    const text = who.startsWith("Prof") ? "Hi Prof. Lomax, Team 3 observed Saboya v. Herman, a motion hearing in Courtroom 3." : "yep, observations to you by Thursday";
    fs.writeFileSync(path.join(cd, draft[1]), "# Reply to " + who + "\\n\\n" + text + "\\n");
    answer = ["Read the message. Wrote " + draft[1] + ".", JSON.stringify({ report: "ready", card: { title: "Reply to " + who + ": " + (who.startsWith("Prof") ? "the hearing we saw" : "observations by Thu"), line: text, choices: ["open the draft", "not needed"] } })];
  } else if (/chat-log\\.md/.test(input)) {
    fs.writeFileSync(path.join(cd, "owed.md"), "# Owed\\n- [ ] Leslie: the outside authority section (Kuehn v. Pub Zone) — by Mon Nov 16 — Leslie, Nov 9 9:01\\n- [ ] Jiachen: my notes in the doc — by Thu Nov 12 — Jiachen, Nov 9 9:03\\n");
    fs.writeFileSync(path.join(cd, "drafts.md"), "# Drafts\\n\\n## 2026-11-09 — replying to Leslie\\n> yep I'll take Kuehn v. Pub Zone, notes in the doc by thu\\n");
    answer = ["Read 4 new messages. Updated owed.md (2 open) and drafts.md.", JSON.stringify({ report: "ready", card: { title: "Reply in the group: Kuehn section", line: "see drafts.md", choices: ["copied"] } })];
  } else {
    fs.mkdirSync(path.join(cd, "made"), { recursive: true });
    fs.writeFileSync(path.join(cd, "made", "today.md"), "Today we do:\\n1. Quiz 7: SQL basics — Course Content › Quiz 7: SQL basics — due Wed Nov 11 10:00 am — \\"1 attempt · 20 min time limit · no late submissions\\" — 30 min — first: open the Chapter 6 slides\\n");
    answer = ["Read blackboard.md. Made made/today.md.", JSON.stringify({ report: "ready", card: { title: "Today we do: Quiz 7 (SQL basics)", line: "due Wed 10:00 am, 1 attempt, 20 min, no late submissions", choices: ["looks right", "not now"] } })];
  }
  const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
  out({ type: "thread.started", thread_id: a.includes("resume") ? a[a.indexOf("resume") + 1] : "fake-thread-" + path.basename(cd) });
  out({ type: "turn.started" });
  out({ type: "item.completed", item: { id: "m1", type: "agent_message", text: answer.join("\\n") } });
  out({ type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } });
});
`);
chmodSync(join(dir, "codex"), 0o755);

// ---- the home: three folders, their policies (the fixtures are copies of the real ones), all in watch ----
const fx = (f: string) => readFileSync(join(import.meta.dirname, "fixtures", f), "utf8");
for (const d of [la, is, law]) mkdirSync(d, { recursive: true });
writeFileSync(join(school, "me.md"), "# me\n- Voice: short, first names, one ask per message, no sign-off.\n");
writeFileSync(join(la, "policy.md"), fx("la245-comms-policy.md"));
writeFileSync(join(la, "brain.md"), "# LA245\n\nSection A1 with Professor Dionne Lomax. Blackboard course `_355037_1`.\n- Marco is on Day in Court Team 3 with Leslie Garcia, Jiachen Xie, and Londyn Gray.\n");
writeFileSync(join(is, "policy.md"), fx("is223-policy.md"));
writeFileSync(join(is, "brain.md"), "# IS223\n\nSection A1, MWF at 10:10 a.m. Professor Wiles. Blackboard course `_348751_1`.\n");
writeFileSync(join(law, "policy.md"), fx("law-project-policy.md"));
writeFileSync(join(law, "brain.md"), "# law project (Day in Court, Team 3)\n");

// the fake sites' dates were written on 2026-11-10: the engine runs on that day's clock (noon, then on) so they stay ahead of it
const NOW = new Date(2026, 10, 10, 12).getTime();
const CLOCK = pathToFileURL(join(ENGINE, "test", "clock.mjs")).href;
let engine: ChildProcess | null = null;
const sockets: WebSocket[] = [];
before(async () => {
  engine = spawn(process.execPath, ["--import", "tsx", "--import", CLOCK, "src/index.ts"], {
    cwd: ENGINE, stdio: ["ignore", "ignore", "inherit"],
    env: {
      ...process.env, SOL_PORT: String(PORT), SOL_HOME: home, SOL_PROFILE: join(dir, "profile"),
      SOL_STATE: join(dir, "work.json"), SOL_TEAM: join(dir, "team.json"), SOL_LOG: join(dir, "engine.log"),
      SOL_CODEX: join(dir, "codex"), SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off",
      SOL_BLACKBOARD: BLACKBOARD, SOL_OUTLOOK: OUTLOOK, SOL_TEAMS: TEAMS, SOL_WHATSAPP: WHATSAPP,
      SOL_AGENT_CLOCK: "off", SOL_SIGNIN_SCREEN: "off", JEV_API_KEY: "", SOL_TEST_NOW: String(NOW),
    },
  });
  for (let i = 0; i < 450; i++) {   // 90 s: a CI machine running every suite at once starts an engine slowly (#1703)
    try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("the test engine did not come up");
});
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
  for (const s of servers) s.close();
  if (process.env.SOL_AGENT_E2E_OUT) writeFileSync(process.env.SOL_AGENT_E2E_OUT, JSON.stringify(record, null, 2) + "\n");
  rmSync(dir, { recursive: true, force: true });
});

type Msg = { type: string; [k: string]: any };
async function ask(m: object & { type: string }, ms = 120_000): Promise<Msg> {
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
const html = async (f: string) => (await fetch(`http://127.0.0.1:${PORT}/agent/${f}`)).text();
const ledger = (d: string) => readFileSync(join(d, "ledger.md"), "utf8").trim().split("\n").filter((l) => l.startsWith("- "));
const today = (() => { const d = new Date(NOW); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();

test("BU mail: a new message from Prof. Lomax → a draft in drafts/, a wouldHave card \"Reply to Prof. Lomax\"; open the draft goes to it", { timeout: 240_000 }, async () => {
  const first = await ask({ type: "agent.run", folder: "la245", ruleId: "mail-1" });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.line, "baseline of 2 messages");
  snap.mail = 2;
  const second = await ask({ type: "agent.run", folder: "la245", ruleId: "mail-1" });
  record.mail = { first: first.line, second: second.line, card: second.ticket?.needs };
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.match(second.line, /2 kept, 1 need an answer: Prof\. Lomax/);
  const t = second.ticket;
  assert.equal(t.state, "waiting");
  assert.equal(t.needs.wouldHave, true);
  assert.match(t.needs.title, /^Reply to Prof\. Lomax: /);
  assert.deepEqual(t.needs.choices, ["open the draft", "not needed"]);
  assert.match(t.needs.line, /Saboya v\. Herman/);
  const draft = join(la, "drafts", `${today}-lomax.md`);
  assert.ok(existsSync(draft), readdirSync(la).join(" "));
  const mail = readFileSync(join(la, "mail.md"), "utf8");
  assert.match(mail, /Dionne Lomax · Team 3 courtroom write-up · Hi Marco,/);   // its whole text, read at its own address
  assert.match(mail, /Leslie Garcia · court notes/);
  assert.doesNotMatch(mail, /Spotify|Dining/);
  assert.match(readFileSync(join(la, "calendar.md"), "utf8"), /- 2026-11-13 · .*found: BU mail, Dionne Lomax/);
  const prompts = readFileSync(join(dir, "prompts.txt"), "utf8");
  assert.match(prompts, /rule mail-1 \(mode watch, rung draft\)/);
  assert.match(prompts, /read \.\.\/me\.md/);
  const pg = await html("la245");
  assert.match(pg, /Reply to Prof\. Lomax/);
  assert.match(pg, /would have shown \(watch\)/);
  assert.match(pg, /value="agent.signin"/);
  record.mailLedger = ledger(la).slice(-2);
  // "open the draft": the ticket ends, the page goes to the draft
  const post = await fetch(`http://127.0.0.1:${PORT}/agent/la245`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ type: "agent.answer", ticketId: t.id, choice: "open the draft" }).toString() });
  assert.equal(post.status, 303);
  const to = post.headers.get("location")!;
  assert.match(to, /^\/file\?path=/);
  assert.match(await (await fetch(`http://127.0.0.1:${PORT}${to}`)).text(), /Saboya v\. Herman/);
  assert.equal(JSON.parse(readFileSync(join(la, ".agent", "tickets", `${t.id}.json`), "utf8")).state, "ended");
});

test("Teams: a new chat message from Leslie → a draft, teams.md, a wouldHave card; Sam (not LA245's) is left out", { timeout: 240_000 }, async () => {
  const first = await ask({ type: "agent.run", folder: "la245", ruleId: "teams-1" });
  assert.equal(first.line, "baseline of 2 chats", JSON.stringify(first));
  snap.teams = 2;
  const second = await ask({ type: "agent.run", folder: "la245", ruleId: "teams-1" });
  record.teams = { first: first.line, second: second.line, card: second.ticket?.needs };
  assert.match(second.line, /1 kept, 1 need an answer: Leslie/, JSON.stringify(second));
  assert.equal(second.ticket.needs.wouldHave, true);
  assert.match(second.ticket.needs.title, /^Reply to Leslie: /);
  assert.ok(existsSync(join(la, "drafts", `${today}-leslie.md`)));
  const teams = readFileSync(join(la, "teams.md"), "utf8");
  assert.match(teams, /Leslie Garcia · Marco can you send your observations section by Thursday Nov 12\?/);
  assert.doesNotMatch(teams, /Sam Park|basketball|tonight 8/);
  assert.match(await html("la245"), /Reply to Leslie/);
});

test("WhatsApp: the group's new messages → chat-log.md, owed.md, drafts.md, a wouldHave card with the draft and \"copied\"", { timeout: 240_000 }, async () => {
  const first = await ask({ type: "agent.run", folder: "law-project", ruleId: "gc-1" });   // the first look reads back what is loaded
  assert.equal(first.line, '5 new in "Day in Court Team 3"', JSON.stringify(first));
  await ask({ type: "agent.answer", ticketId: first.ticket.id, choice: "copied" });
  snap.gc = 2;
  const second = await ask({ type: "agent.run", folder: "law-project", ruleId: "gc-1" });
  record.gc = { first: first.line, second: second.line, card: second.ticket?.needs };
  assert.equal(second.line, '4 new in "Day in Court Team 3"', JSON.stringify(second));
  const t = second.ticket;
  assert.equal(t.needs.wouldHave, true);
  assert.deepEqual(t.needs.choices, ["copied", "not needed"]);
  assert.equal(t.needs.line, "yep I'll take Kuehn v. Pub Zone, notes in the doc by thu");
  const log = readFileSync(join(law, "chat-log.md"), "utf8").trim().split("\n").filter((l) => l.startsWith("- "));
  assert.equal(log.length, 9);   // 5 then 4, none twice
  assert.equal(log[5], "- 2026-11-09 09:01 · Leslie Garcia · marco can you do the outside authority section? Kuehn v. Pub Zone");
  assert.equal(log[2], "- 2026-11-08 10:06 · Marco · nice, more time");
  assert.ok(existsSync(join(law, "owed.md")));
  assert.ok(existsSync(join(law, "drafts.md")));
  const cal = readFileSync(join(law, "calendar.md"), "utf8");
  record.gcCalendar = cal.trim().split("\n").filter((l) => l.startsWith("- "));
  assert.match(cal, /- 2026-11-14 14:00 · .*found: WhatsApp "Day in Court Team 3", Jiachen Xie/);
  const prompts = readFileSync(join(dir, "prompts.txt"), "utf8");
  assert.match(prompts, /rule gc-1 \(mode watch, rung draft\)/);
  assert.match(prompts, /9:01|09:01 · Leslie Garcia · marco can you do the outside authority section/);
  const pg = await html("law-project");
  assert.match(pg, /Reply in the group: Kuehn section/);
  assert.match(pg, /<button class="yes">copied<\/button>/);
  record.gcLedger = ledger(law);
  // a look with nothing new: no ticket
  assert.equal((await ask({ type: "agent.run", folder: "law-project", ruleId: "gc-1" })).line, "nothing new");
});

test("Blackboard, IS223's own course: a panel that opens in place is read; the fine print in blackboard.md, the date in calendar.md, a wouldHave card", { timeout: 240_000 }, async () => {
  const first = await ask({ type: "agent.run", folder: "is223", ruleId: "blackboard-1" });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.match(first.line, /^baseline of \d+ pages$/);
  const kept = JSON.parse(readFileSync(join(is, ".agent", "blackboard-last.json"), "utf8"));
  assert.equal(kept.course, "_348751_1");
  assert.ok(Object.keys(kept.pages).some((k) => k.endsWith("#lab-6-er-diagram")), Object.keys(kept.pages).join(" "));
  snap.bb = 2;
  const second = await ask({ type: "agent.run", folder: "is223", ruleId: "blackboard-1" });
  record.blackboard = { first: first.line, second: second.line, card: second.ticket?.needs };
  assert.match(second.line, /new assignment "Quiz 7: SQL basics"/, JSON.stringify(second));
  assert.equal(second.ticket.needs.wouldHave, true);
  const bb = readFileSync(join(is, "blackboard.md"), "utf8");
  assert.match(bb, /## Course Content › Quiz 7: SQL basics\n\nassignment, opened in place/);
  assert.match(bb, /1 attempt · 20 min time limit · no late submissions/);
  assert.doesNotMatch(readFileSync(join(is, ".agent", "blackboard-last.json"), "utf8"), /attempt started/i);
  const cal = readFileSync(join(is, "calendar.md"), "utf8");
  record.isCalendar = cal.trim().split("\n").filter((l) => l.startsWith("- "));
  assert.match(cal, /^- class: Mon\/Wed\/Fri 10:10 · found: brain\.md$/m);
  assert.match(cal, /^- 2026-11-11 10:00 · .*Quiz 7.*found: blackboard/m);
  assert.ok(existsSync(join(is, "made", "today.md")));
  assert.match(await html("is223"), /Today we do: Quiz 7/);
  record.isLedger = ledger(is);
});
