// One real Codex turn on the group-chat rule (not part of npm test: it uses Marco's Codex sign-in and takes minutes).
// A copy of the law-project folder (its policy, AGENTS.md, brain.md) and school/me.md in a temporary home, a fake
// WhatsApp Web with a group of 30 messages, the gc rule run by agent.run on a real engine (its own port), then what
// came back: owed.md, drafts.md, the card, the ledger. Run: npx tsx test/agent-gc-live.ts
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

const ENGINE = join(import.meta.dirname, "..");
const PORT = 7980 + Math.floor(Math.random() * 9);
const dir = mkdtempSync(join(tmpdir(), "sol-gc-live-"));
const school = join(dir, "home", "school"), folder = join(school, "law-project");
mkdirSync(folder, { recursive: true });
for (const f of ["policy.md", "AGENTS.md", "brain.md"]) cpSync(join(ENGINE, "..", "home", "school", "law-project", f), join(folder, f));
cpSync(join(ENGINE, "..", "home", "school", "me.md"), join(school, "me.md"));

// the group: Sat Nov 7 to Mon Nov 9, 2026 (30 messages; Marco's own are "out")
const CHAT: [string, string, string][] = [
  ["11/7/2026 18:02", "Leslie Garcia", "ok team, Lomax moved the Day in Court paper to Monday Nov 16 11:59pm"],
  ["11/7/2026 18:03", "Jiachen Xie", "nice!! more time"],
  ["11/7/2026 18:05", "Londyn Gray", "can we split it into sections tonight?"],
  ["11/7/2026 18:07", "Leslie Garcia", "rubric is analysis 20, research 20, writing 10"],
  ["11/7/2026 18:09", "Leslie Garcia", "I'll do analysis of the proceeding"],
  ["11/7/2026 18:10", "Londyn Gray", "I'll do intro + the case facts"],
  ["11/7/2026 18:12", "Jiachen Xie", "I can do the conclusion and formatting"],
  ["11/7/2026 18:15", "Leslie Garcia", "Marco can you take research and application? need at least one outside authority"],
  ["11/7/2026 18:31", "Marco", "yeah I'll take research. Kuehn v. Pub Zone works for the outside authority"],
  ["11/7/2026 18:33", "Leslie Garcia", "perfect"],
  ["11/7/2026 18:40", "Jiachen Xie", "everyone put your court notes in the shared doc pls"],
  ["11/7/2026 18:41", "Londyn Gray", "👍"],
  ["11/7/2026 21:15", "Jiachen Xie", "doc link is pinned"],
  ["11/8/2026 10:02", "Londyn Gray", "my notes are in"],
  ["11/8/2026 10:20", "Leslie Garcia", "mine too"],
  ["11/8/2026 11:00", "Jiachen Xie", "Marco when can you have your notes in?"],
  ["11/8/2026 11:45", "Marco", "tonight"],
  ["11/8/2026 14:30", "Leslie Garcia", "should we meet before we submit?"],
  ["11/8/2026 14:31", "Jiachen Xie", "Sat Nov 14 2pm Mugar library?"],
  ["11/8/2026 14:33", "Londyn Gray", "works for me"],
  ["11/8/2026 14:40", "Leslie Garcia", "works"],
  ["11/8/2026 22:10", "Jiachen Xie", "still missing Marco's notes btw"],
  ["11/9/2026 08:55", "Leslie Garcia", "drafts of each section by Thursday Nov 12 so we can edit Fri?"],
  ["11/9/2026 08:57", "Londyn Gray", "yes"],
  ["11/9/2026 09:01", "Jiachen Xie", "yes, Thursday night latest"],
  ["11/9/2026 09:03", "Leslie Garcia", "Marco does Thursday work for research section + notes?"],
  ["11/9/2026 09:30", "Londyn Gray", "also who is doing the cover page with all names + team number"],
  ["11/9/2026 09:31", "Jiachen Xie", "me, with formatting"],
  ["11/9/2026 09:40", "Leslie Garcia", "and someone needs to email Lomax which hearing we saw (she asked in class)"],
  ["11/9/2026 09:41", "Londyn Gray", "Marco you were going to do that right?"],
];
const site = createServer((req, res) => {
  const lines = CHAT.map(([t, who, text]) => {
    const [d, hm] = t.split(" ");
    return `<div class="${who === "Marco" ? "message-out" : "message-in"}"><div data-pre-plain-text="[${hm}, ${d}] ${who}: "><span class="selectable-text">${text}</span></div></div>`;
  }).join("");
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<!doctype html><meta charset="utf-8"><title>WhatsApp</title><div id="pane-side" aria-label="Chat list"><h1>Chats</h1><span title="Day in Court Team 3">Day in Court Team 3</span></div><div id="main">${lines}<footer><div contenteditable="true" aria-label="Type a message"></div></footer></div>`);
});
await new Promise<void>((r) => site.listen(0, "127.0.0.1", () => r()));

const engine = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  cwd: ENGINE, stdio: ["ignore", "ignore", "inherit"],
  env: { ...process.env, SOL_PORT: String(PORT), SOL_HOME: join(dir, "home"), SOL_PROFILE: join(dir, "profile"), SOL_STATE: join(dir, "work.json"),
    SOL_TEAM: join(dir, "team.json"), SOL_LOG: join(dir, "engine.log"), SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off",
    SOL_AGENT_CLOCK: "off", SOL_SIGNIN_SCREEN: "off", SOL_WHATSAPP: `http://127.0.0.1:${(site.address() as { port: number }).port}` },
});
try {
  for (let i = 0; i < 150; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  await new Promise((r, no) => { ws.once("open", r); ws.once("error", no); });
  const got = new Promise<any>((ok) => ws.on("message", (raw) => { const x = JSON.parse(String(raw)); if (x.rid === "live") ok(x); }));
  const t0 = Date.now();
  ws.send(JSON.stringify({ type: "agent.run", folder: "law-project", ruleId: "gc-1", rid: "live" }));
  const r = await got;
  ws.close();
  const show = (f: string) => existsSync(join(folder, f)) ? readFileSync(join(folder, f), "utf8") : "(none)";
  console.log(`run (${Math.round((Date.now() - t0) / 1000)} s):`, JSON.stringify({ ok: r.ok, line: r.line, state: r.ticket?.state, needs: r.ticket?.needs, report: r.ticket?.runs?.at(-1)?.report, thread: r.ticket?.runs?.at(-1)?.thread }, null, 1));
  console.log("\nsaid:\n" + (r.ticket?.runs?.at(-1)?.said ?? ""));
  console.log("\nowed.md:\n" + show("owed.md"));
  console.log("\ndrafts.md:\n" + show("drafts.md"));
  console.log("\ncalendar.md:\n" + show("calendar.md"));
  console.log("\nledger.md:\n" + show("ledger.md"));
  console.log("\nchat-log.md lines:", show("chat-log.md").split("\n").filter((l) => l.startsWith("- ")).length);
} finally {
  engine.kill();
  site.close();
  await new Promise((r) => setTimeout(r, 1500));
  if (!process.env.KEEP) rmSync(dir, { recursive: true, force: true }); else console.log("kept:", dir);
}
