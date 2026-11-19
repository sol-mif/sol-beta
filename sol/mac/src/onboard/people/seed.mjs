#!/usr/bin/env node
// Made-up people for the one onboarding (#1088): a home folder per person, in the shapes a real Mac has (apps, Claude's
// and Codex's folders, gh's hosts file, a calendar's .ics, files by name, git folders, Chrome's History database), so the
// explorer (../explore.mjs) reads them exactly as it reads a real one. Nobody here is real; no file has a secret in it.
//   node seed.mjs <person> <dir>        persons: noa (student, freelances, runs), dev (developer on a team),
//                                       ines (careful: no AI tools, nothing connected), sam (parent, small business),
//                                       lee (nothing at all on the machine)
// A test engine is then started with HOME=<dir>, so its terminal's explorer reads that home.
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const [who = "noa", dir] = process.argv.slice(2);
if (!dir) { console.error("seed: node seed.mjs <person> <dir>"); process.exit(2); }
const put = (p, text = "") => { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); };
const app = (n) => mkdirSync(join(dir, "Applications", `${n}.app`, "Contents", "MacOS"), { recursive: true });
const repo = (p, url) => put(`${p}/.git/config`, `[core]\n\tbare = false\n[remote "origin"]\n\turl = ${url}\n`);

// a weekly event, or one date; times are written for the week of 2026-11-09 and moved by whole weeks to the week the seed
// runs in, so the explorer (which reads only what is still on) always finds this person's term current
const WEEKS = Math.max(0, Math.floor((Date.now() - Date.UTC(2026, 10, 9)) / (7 * 864e5)));
const ev = (name, at, { days, where, hours = 1 } = {}) => {
  const d = new Date(Date.UTC(+at.slice(0, 4), +at.slice(4, 6) - 1, +at.slice(6, 8)) + WEEKS * 7 * 864e5);
  const start = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}${at.slice(8)}`;
  const end = start.replace(/T(\d\d)/, (_, h) => `T${String(+h + hours).padStart(2, "0")}`);
  return ["BEGIN:VEVENT", `SUMMARY:${name}`, `DTSTART:${start}`, `DTEND:${end}`, days ? `RRULE:FREQ=WEEKLY;BYDAY=${days}` : "", where ? `LOCATION:${where}` : "", "END:VEVENT"].filter(Boolean).join("\n");
};
/** a message's text in a seeded session file: it must never reach the explorer's file */
const MESSAGE_TEXT = "MESSAGE-TEXT-NEVER-READ";
const sessionAt = () => new Date(Date.now() - 2 * 864e5).toISOString();
/** a Claude Code session (~/.claude/projects/<the folder, dashed>/<id>.jsonl): a message, then its title line */
const claudeSession = (cwdRel, id, { ai, custom } = {}) => {
  const cwd = join(dir, cwdRel);
  const lines = [
    { type: "user", cwd, sessionId: id, timestamp: sessionAt(), message: { role: "user", content: `${MESSAGE_TEXT}: "cwd":"/elsewhere"` } },
    ...(ai ? [{ type: "ai-title", aiTitle: ai, sessionId: id }] : []),
    ...(custom ? [{ type: "custom-title", customTitle: custom, sessionId: id }] : []),
  ];
  put(`.claude/projects/${cwd.replace(/[^a-zA-Z0-9]/g, "-")}/${id}.jsonl`, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
};
/** a Codex session (~/.codex/sessions/YYYY/MM/DD/rollout-<when>-<id>.jsonl, session_meta first) and its title in the index */
const codexSession = (cwdRel, id, title) => {
  const at = sessionAt(), [y, m, d] = at.slice(0, 10).split("-");
  put(`.codex/sessions/${y}/${m}/${d}/rollout-${at.slice(0, 19).replace(/:/g, "-")}-${id}.jsonl`,
    [{ timestamp: at, type: "session_meta", payload: { id, timestamp: at, cwd: join(dir, cwdRel), originator: "codex_cli" } },
     { timestamp: at, type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: MESSAGE_TEXT }] } }].map((l) => JSON.stringify(l)).join("\n") + "\n");
  put(".codex/session_index.jsonl", JSON.stringify({ id, thread_name: title, updated_at: at }) + "\n");
};
const cal = (name, evs) => put(`Library/Calendars/${name}.ics`, ["BEGIN:VCALENDAR", "VERSION:2.0", ...evs, "END:VCALENDAR", ""].join("\n"));

async function history(sites) {
  const { DatabaseSync } = await import("node:sqlite");
  const f = join(dir, "Library/Application Support/Google/Chrome/Default/History");
  mkdirSync(dirname(f), { recursive: true });
  if (existsSync(f)) rmSync(f);
  const db = new DatabaseSync(f);
  db.exec("CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, title TEXT, visit_count INTEGER, last_visit_time INTEGER); CREATE TABLE visits (id INTEGER PRIMARY KEY, url INTEGER, visit_time INTEGER)");
  const now = (Date.now() / 1000 + 11644473600) * 1e6;
  let u = 0, v = 0;
  for (const [url, title, n] of sites) {
    db.prepare("INSERT INTO urls VALUES (?, ?, ?, ?, ?)").run(++u, url, title, n, now);
    for (let i = 0; i < n; i++) db.prepare("INSERT INTO visits VALUES (?, ?, ?)").run(++v, u, now - i * 6.3 * 3600 * 1e6);
  }
  db.close();
}

const PEOPLE = {
  // Noa Patel: second-year design student at Westbrook, freelances for two clients, training for a half marathon
  async noa() {
    ["Figma", "Notion", "Slack", "Spotify", "Strava", "Google Chrome", "Claude", "Zoom"].forEach(app);
    put(".gitconfig", "[user]\n\tname = Noa Patel\n");
    put(".claude.json", JSON.stringify({ mcpServers: { figma: { command: "npx" }, notion: { command: "npx" }, "google-drive": { command: "npx" } } }, null, 2));
    put(".claude/.credentials.json", "{\"made_up\":true}\n");
    mkdirSync(join(dir, ".codex"), { recursive: true });
    put(".config/gh/hosts.yml", "github.com:\n    user: noa-makes\n    git_protocol: https\n");
    cal("westbrook", [
      ev("DES 210 Studio", "20261110T140000", { days: "TU,TH", where: "Hall B", hours: 2 }),
      ev("ART 140 Drawing", "20261109T100000", { days: "MO,WE", where: "Arts 3" }),
      ev("PSY 101", "20261109T130000", { days: "MO,WE", where: "Lecture Hall 1" }),
      ev("Long run", "20261115T080000", { days: "SU", hours: 2 }),
      ev("DES 210 crit", "20261119T150000", { where: "Hall B" }),
      ev("Lumen review call", "20261118T110000", { where: "Zoom" }),
      ev("Riverside Half Marathon", "20270117T070000", { where: "Riverside Park", hours: 3 }),
    ]);
    put("Documents/Westbrook/DES 210/DES 210 syllabus.pdf");
    put("Documents/Westbrook/ART 140/ART 140 syllabus.pdf");
    put("Documents/Westbrook/PSY 101/PSY 101 midterm guide.pdf");
    put("Documents/Clients/Lumen/Lumen invoice 014.pdf");
    put("Documents/Clients/Lumen/Lumen contract.pdf");
    put("Documents/Clients/Okra/Okra brief v2.pdf");
    put("Documents/Training/half marathon plan.pdf");
    put("Downloads/resume 2026.pdf");
    put("Downloads/IMG_2231.jpg");
    repo("code/portfolio", "https://github.com/noa-makes/portfolio.git");
    repo("code/lumen-site", "https://github.com/lumen-studio/site.git");
    // what she has been working on with her AI tools (#1217): Claude Code's and Codex's session files in their real shapes;
    // each holds a message whose text must never leave the file (MESSAGE_TEXT, the tests look for it)
    claudeSession("code/portfolio", "s1", { ai: "Portfolio case study layout" });
    claudeSession("code/portfolio", "s2", { custom: "Portfolio: about page" });
    claudeSession("Documents/Westbrook/DES 210", "s3", { ai: "DES 210 crit prep" });
    codexSession("code/lumen-site", "0199aaaa-0000-7000-8000-000000000001", "Lumen site nav fix");
    await history([
      ["https://canvas.westbrook.edu/courses/210", "DES 210 Studio — Canvas", 38],
      ["https://canvas.westbrook.edu/courses/101", "PSY 101 — Canvas", 17],
      ["https://www.figma.com/file/okra", "Okra app — Figma", 29],
      ["https://www.figma.com/file/lumen", "Lumen site — Figma", 21],
      ["https://mail.google.com/mail/u/0", "Inbox (4) - Gmail", 44],
      ["https://www.notion.so/lumen", "Lumen — Notion", 12],
      ["https://www.strava.com/dashboard", "Dashboard | Strava", 14],
      ["https://www.behance.net/noa", "Noa Patel on Behance", 6],
      ["https://docs.google.com/document/d/okra", "Okra brief v2 - Google Docs", 9],
      ["https://www.google.com/search?q=x", "x - Google Search", 60],
    ]);
  },
  // Dev Ruiz: developer on a three-person startup, runs a side project
  async dev() {
    put(".gitconfig", "[user]\n\tname = Dev Ruiz\n");
    ["Visual Studio Code", "Ghostty", "Slack", "Linear", "Google Chrome", "Claude", "Docker"].forEach(app);
    put(".claude.json", JSON.stringify({ mcpServers: { linear: {}, github: {}, sentry: {} } }));
    put(".claude/.credentials.json", "{\"made_up\":true}\n");
    put(".codex/auth.json", "{\"made_up\":true}\n");
    put(".codex/config.toml", "[mcp_servers.linear]\ncommand = \"npx\"\n");
    put(".config/gh/hosts.yml", "github.com:\n    user: devruiz\n");
    cal("work", [ev("Standup", "20261109T093000", { days: "MO,TU,WE,TH,FR" }), ev("Climbing", "20261110T190000", { days: "TU,TH", hours: 2 }), ev("Launch review", "20261120T160000")]);
    put("Documents/Kite/Kite pitch deck.pdf"); put("Downloads/Kite contract.pdf");
    repo("src/kite-api", "https://github.com/kite-labs/api.git"); repo("src/kite-web", "https://github.com/kite-labs/web.git"); repo("src/tinyrss", "https://github.com/devruiz/tinyrss.git");
    // his own AI setup (#1423): his rules, his team's rules in a repo, settings shared with his terminal, a hook, memory
    put(".claude/CLAUDE.md", "# How I work\n\n- Short answers, no summary at the end.\n- Commit by yourself once the tests pass.\n- Never push to main.\n- Use pnpm, never npm.\n\n```sh\npnpm test\n```\n");
    put(".claude/settings.json", JSON.stringify({ model: "sonnet", autoCompactWindow: 120000, env: { SECRET_TOKEN: "made-up-never-read" },
      permissions: { defaultMode: "acceptEdits", allow: ["Bash(pnpm test:*)", "Bash(git status)"], deny: ["Bash(rm -rf:*)"] },
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "bash ~/.claude/hooks/no-force-push.sh" }] }] } }, null, 2));
    put(".claude/hooks/no-force-push.sh", "#!/bin/sh\nexit 0\n");
    put("src/kite-api/CLAUDE.md", "# kite-api\n\n- Every endpoint gets a test in test/api.\n- Ask before changing a migration.\n");
    put("src/tinyrss/CLAUDE.md", "- Keep it under 500 lines.\n");
    ["prefers-short-answers", "kite-deploys-on-friday", "tinyrss-feeds"].forEach((n) => put(`.claude/projects/-src-kite-api/memory/${n}.md`, "---\nname: made-up\n---\nmade up\n"));
    await history([["https://linear.app/kite", "Kite — Linear", 40], ["https://github.com/kite-labs/api", "kite-labs/api", 52], ["https://vercel.com/kite", "kite – Vercel", 11], ["https://news.ycombinator.com/", "Hacker News", 30]]);
  },
  // Ines Moreau: careful; a few apps, nothing connected, no AI tools; she will pick "just what I tell you"
  async ines() {
    ["Safari", "Pages", "Numbers"].forEach(app);
    put("Documents/Clinic/rota november.pdf"); put("Documents/Clinic/invoice october.pdf");
    cal("home", [ev("Clinic shift", "20261109T070000", { days: "MO,TU,WE", hours: 8 }), ev("Choir", "20261112T193000", { days: "TH" })]);
  },
  // Sam Okafor: parent, runs a small bakery; Google connected through gog, a shared family calendar
  async sam() {
    ["Google Chrome", "Square", "WhatsApp", "Claude"].forEach(app);
    put(".claude/.credentials.json", "{\"made_up\":true}\n");
    put(".config/gogcli/config.json", "{}\n");
    cal("family", [ev("School run", "20261109T080000", { days: "MO,TU,WE,TH,FR" }), ev("Market stall", "20261114T070000", { days: "SA", hours: 6 }), ev("Ada's recital", "20261121T180000", { where: "St Mary's" })]);
    put("Documents/Bakery/supplier invoice 88.pdf"); put("Documents/Bakery/menu winter.pdf"); put("Downloads/school letter term 2.pdf");
    await history([["https://squareup.com/dashboard", "Square Dashboard", 25], ["https://mail.google.com/mail/u/0", "Inbox (12)", 33], ["https://www.bbcgoodfood.com/", "BBC Good Food", 8]]);
  },
  // Max Ortega: as full as a real power user's computer (24 apps, 16 calendar entries, 8 projects, 12 sites)
  async max() {
    ["Figma", "Notion", "Slack", "Spotify", "Google Chrome", "Arc", "Claude", "ChatGPT", "Cursor", "Visual Studio Code", "Ghostty", "Linear", "Discord", "WhatsApp",
      "Zoom", "Obsidian", "Raycast", "1Password", "Docker", "Postman", "TablePlus", "Things", "Fantastical", "Telegram"].forEach(app);
    put(".gitconfig", "[user]\n\tname = Max Ortega\n");
    put(".claude.json", JSON.stringify({ mcpServers: { github: {}, linear: {}, notion: {}, figma: {}, "google-drive": {}, slack: {} } }));
    put(".claude/.credentials.json", "{\"made_up\":true}\n"); put(".codex/auth.json", "{\"made_up\":true}\n");
    put(".config/gh/hosts.yml", "github.com:\n    user: maxo\n"); put(".config/gogcli/config.json", "{}\n");
    cal("life", [
      ev("BIO 140 Contracts", "20261110T093000", { days: "TU,TH", where: "Hall 3" }), ev("MKT 210 Systems", "20261109T140000", { days: "MO,WE", where: "Room 5" }),
      ev("STAT 330 Seminar", "20261111T160000", { days: "WE" }), ev("ECON 305 Markets", "20261113T110000", { days: "FR" }),
      ev("Standup", "20261109T090000", { days: "MO,TU,WE,TH,FR" }), ev("Gym", "20261109T070000", { days: "MO,WE,FR" }),
      ev("Team sync", "20261112T170000", { days: "TH" }), ev("Mom call", "20261115T190000", { days: "SU" }),
      ev("BIO 140 midterm", "20261119T093000", { where: "Hall 3" }), ev("Demo day", "20261121T150000"), ev("Dentist", "20261118T080000"),
      ev("MKT 210 project due", "20261124T235900"), ev("Trip home", "20261127T060000"), ev("Investor call", "20261117T130000"),
      ev("ECON 305 quiz", "20261120T110000"), ev("Birthday dinner", "20261122T200000"),
    ]);
    ["BIO 140 syllabus", "BIO 140 case list", "MKT 210 syllabus", "STAT 330 reading", "ECON 305 problem set 4"].forEach((f) => put(`Documents/School/${f}.pdf`));
    ["Kite pitch deck", "Kite cap table", "Kite contract"].forEach((f) => put(`Documents/Kite/${f}.pdf`)); put("Downloads/resume 2026.pdf");
    [["code/sol-dev", "https://github.com/sol-mif/sol-dev.git"], ["code/kite-api", "https://github.com/kite-labs/api.git"], ["code/kite-web", "https://github.com/kite-labs/web.git"],
      ["code/dotfiles", "https://github.com/maxo/dotfiles.git"], ["code/notes", "https://github.com/maxo/notes.git"], ["code/bio140-notes", "https://github.com/maxo/bio140-notes.git"],
      ["code/scraper", "https://github.com/maxo/scraper.git"], ["code/site", "https://github.com/maxo/site.git"]].forEach(([d, u]) => repo(d, u));
    await history([["https://learn.school.edu/bio140", "BIO 140 — Blackboard", 60], ["https://mail.google.com/mail/u/0", "Inbox (31)", 90], ["https://github.com/sol-mif/sol-dev", "sol-dev", 80],
      ["https://linear.app/kite", "Kite — Linear", 40], ["https://www.figma.com/file/kite", "Kite — Figma", 25], ["https://www.notion.so/max", "Notes — Notion", 30],
      ["https://web.whatsapp.com/", "WhatsApp", 45], ["https://claude.ai/", "Claude", 70], ["https://news.ycombinator.com/", "Hacker News", 35],
      ["https://www.linkedin.com/feed/", "LinkedIn", 20], ["https://calendar.google.com/", "Google Calendar", 28], ["https://drive.google.com/", "My Drive", 22]]);
  },
  // Lee: a new machine, nothing on it
  async lee() { mkdirSync(join(dir, "Documents"), { recursive: true }); },
};

if (!PEOPLE[who]) { console.error(`seed: no person ${who} (${Object.keys(PEOPLE).join(", ")})`); process.exit(2); }
mkdirSync(dir, { recursive: true });
await PEOPLE[who]();
mkdirSync(join(dir, "sol"), { recursive: true });
console.log(`seed: ${who} at ${dir}`);
