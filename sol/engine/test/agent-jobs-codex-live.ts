// One real Codex turn for the jobs folder (not part of npm test: it uses Marco's Codex sign-in and takes minutes).
// A copy of the jobs folder's policy, AGENTS.md, me.md and sf-trip/approach.md in a temporary home, one made-up person
// already kept with the variant coffee-their-work, then the "kept" rule run by agent.run on a real engine (its own
// port): the draft Codex writes is printed, so Marco can judge the voice. Nothing is sent; the person does not exist.
// Run: npx tsx test/agent-jobs-codex-live.ts   (VARIANT=question-his-project to try another recipe)
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

const ENGINE = join(import.meta.dirname, "..");
const PORT = 7980 + Math.floor(Math.random() * 9);
const dir = mkdtempSync(join(tmpdir(), "sol-jobs-live-"));
const folder = join(dir, "home", "jobs"), real = join(ENGINE, "..", "home", "jobs");
const variant = process.env.VARIANT ?? "coffee-their-work";
mkdirSync(join(folder, "sf-trip"), { recursive: true });
mkdirSync(join(folder, "people"), { recursive: true });
for (const f of ["policy.md", "AGENTS.md", "me.md", "sf-trip/approach.md"]) cpSync(join(real, f), join(folder, f));
if (existsSync(join(real, "outreach", "variants"))) cpSync(join(real, "outreach", "variants"), join(folder, "outreach", "variants"), { recursive: true });
writeFileSync(join(folder, "people", "jordan-park.md"), [
  "# Jordan Park", "",
  "- where: San Francisco",
  "- company: Northwind Agents (made up for this check)",
  "- role: Staff engineer, agent tooling",
  "- why: Jordan wrote a public post on keeping one long-running agent thread per project folder, which is how Sol's folder agents work.",
  "- link: https://northwind.example/blog/one-thread-per-folder",
  "- reach: LinkedIn https://www.linkedin.com/in/jordan-park-example · mutual: none known",
  "- state: found",
  `- variant: ${variant}`, "",
  "## Touches", "",
  "- 2026-11-09 found on https://northwind.example/blog/one-thread-per-folder",
  `- 2026-11-09 kept; variant ${variant}`, "",
].join("\n"));

const engine = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  cwd: ENGINE, stdio: ["ignore", "ignore", "inherit"],
  env: { ...process.env, SOL_PORT: String(PORT), SOL_HOME: join(dir, "home"), SOL_PROFILE: join(dir, "profile"), SOL_STATE: join(dir, "work.json"),
    SOL_TEAM: join(dir, "team.json"), SOL_LOG: join(dir, "engine.log"), SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off", SOL_AGENT_CLOCK: "off" },
});
try {
  for (let i = 0; i < 150; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
  const ask = async (m: object) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    await new Promise((r, no) => { ws.once("open", r); ws.once("error", no); });
    const got = new Promise<any>((ok) => ws.on("message", (raw) => { const x = JSON.parse(String(raw)); if (x.rid === "live") ok(x); }));
    ws.send(JSON.stringify({ ...m, rid: "live" }));
    const x = await got; ws.close(); return x;
  };
  const t0 = Date.now();
  console.log("run:", JSON.stringify(await ask({ type: "agent.run", folder: "jobs", ruleId: "people-1" })));
  const draft = join(folder, "outreach", "drafts", "jordan-park.md");
  for (let i = 0; i < 600 && !existsSync(join(folder, "outreach", "drafts", "jordan-park.agent.md")); i++) await new Promise((r) => setTimeout(r, 1000));
  const v = await ask({ type: "agent.tickets", folder: "jobs" });
  const card = v.cards.find((c: any) => /Jordan/.test(c.title));
  console.log(`\n${Math.round((Date.now() - t0) / 1000)} s; card:`, JSON.stringify(card ? { title: card.title, line: card.line, choices: card.choices, wouldHave: card.wouldHave } : null));
  console.log(`\n--- ${variant}: outreach/drafts/jordan-park.md ---\n` + (existsSync(draft) ? readFileSync(draft, "utf8") : "(not written)"));
  console.log("--- people/jordan-park.md now ---\n" + readFileSync(join(folder, "people", "jordan-park.md"), "utf8"));
  console.log("--- ledger.md ---\n" + readFileSync(join(folder, "ledger.md"), "utf8"));
} finally {
  engine.kill();
  await new Promise((r) => setTimeout(r, 1500));
  if (!process.env.KEEP) rmSync(dir, { recursive: true, force: true }); else console.log("kept:", dir);
}
