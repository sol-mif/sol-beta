// One real Codex turn for the folder's agent (not part of npm test: it uses Marco's Codex sign-in and takes minutes).
// A copy of the LA245 folder in a temporary home, a small material file, the folder rule run by agent.run on a real
// engine (its own port), then what came back, the ledger and what the turn made. Run: npx tsx test/agent-codex-live.ts
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

const ENGINE = join(import.meta.dirname, "..");
const PORT = 7960 + Math.floor(Math.random() * 9);
const dir = mkdtempSync(join(tmpdir(), "sol-agent-live-"));
const folder = join(dir, "home", "school", "la245");
cpSync(join(ENGINE, "..", "home", "school", "la245"), folder, { recursive: true, filter: (s) => !s.includes("/.agent") && !s.endsWith("ledger.md") });
const engine = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  cwd: ENGINE, stdio: ["ignore", "ignore", "inherit"],
  env: { ...process.env, SOL_PORT: String(PORT), SOL_HOME: join(dir, "home"), SOL_PROFILE: join(dir, "profile"), SOL_STATE: join(dir, "work.json"),
    SOL_TEAM: join(dir, "team.json"), SOL_LOG: join(dir, "engine.log"), SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off", SOL_AGENT_CLOCK: "off" },
});
try {
  for (let i = 0; i < 150; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
  // the first look keeps the baseline; then a small file arrives
  const ask = async (m: object) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    await new Promise((r, no) => { ws.once("open", r); ws.once("error", no); });
    const got = new Promise<any>((ok) => ws.on("message", (raw) => { const x = JSON.parse(String(raw)); if (x.rid === "live") ok(x); }));
    ws.send(JSON.stringify({ ...m, rid: "live" }));
    const x = await got; ws.close(); return x;
  };
  console.log("baseline:", JSON.stringify(await ask({ type: "agent.run", folder: "la245", ruleId: "folder-1" })));
  writeFileSync(join(folder, "material", "11.10.26 Chapter 11 offer and acceptance (notes).md"), [
    "# Chapter 11: Agreement (class notes, Nov 10)",
    "",
    "- An offer needs serious intent, definite terms, and communication to the offeree.",
    "- Mirror image rule (common law): an acceptance must match the offer exactly; a change is a counteroffer.",
    "- UCC 2-207: between merchants, additional terms in an acceptance can become part of the contract unless material.",
    "- Mailbox rule: an acceptance is effective when sent, if sent by an authorized means.",
    "- An offer ends by revocation, rejection, counteroffer, lapse of time, death or incapacity.",
    "",
  ].join("\n"));
  const t0 = Date.now();
  const r = await ask({ type: "agent.run", folder: "la245", ruleId: "folder-1" });
  console.log(`run (${Math.round((Date.now() - t0) / 1000)} s):`, JSON.stringify({ ok: r.ok, line: r.line, state: r.ticket?.state, needs: r.ticket?.needs, report: r.ticket?.runs?.at(-1)?.report, thread: r.ticket?.runs?.at(-1)?.thread }, null, 1));
  console.log("\nsaid:\n" + (r.ticket?.runs?.at(-1)?.said ?? ""));
  console.log("\nledger.md:\n" + readFileSync(join(folder, "ledger.md"), "utf8"));
  console.log("made/:", readdirSync(join(folder, "made")).join(", ") || "(empty)");
  console.log("\nbrain.md now:\n" + readFileSync(join(folder, "brain.md"), "utf8"));
} finally {
  engine.kill();
  await new Promise((r) => setTimeout(r, 1500));
  if (!process.env.KEEP) rmSync(dir, { recursive: true, force: true }); else console.log("kept:", dir);
}
