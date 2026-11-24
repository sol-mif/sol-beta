// "You, here" on a new session's first turn (BR1, #1615; next/you.ts youHere, the line in index.ts handleSay): with the
// new face on, a new session's first prompt carries the person's aims and this place, at most 600 characters; with it
// off, nothing. A real engine on its own port, with a stand-in codex that writes each prompt it is given to a file and
// ends, so nothing leaves the machine. The person is Lucy, from the panel (docs/marketing/brand/pack/panel.md), in a
// made-up home. Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { freePort, ownHealth } from "./test-engine.ts";

const ENGINE = join(import.meta.dirname, "..");
const dir = mkdtempSync(join(tmpdir(), "sol-here-"));
const user = join(dir, "lucy"), home = join(user, ".sol"), prompts = join(dir, "prompts.log");
mkdirSync(join(home, "record"), { recursive: true });
writeFileSync(join(home, "record", "me.json"), JSON.stringify({ name: "Lucy", said: "go", solHome: home, areas: [], aims: [{ w: "My business", said: true, ok: true, at: "2026-11-18" }, { w: "The newsletter", said: true, ok: true, at: "2026-11-18" }] }));
writeFileSync(join(dir, "codex"), `#!/bin/sh\ncat >> "${prompts}"\nprintf '\\n<<end>>\\n' >> "${prompts}"\nexit 1\n`); chmodSync(join(dir, "codex"), 0o755);

const engines: ChildProcess[] = [];
after(() => { for (const e of engines) e.kill(); rmSync(dir, { recursive: true, force: true }); });

type Msg = { type: string; [k: string]: any };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const said = () => (existsSync(prompts) ? readFileSync(prompts, "utf8").split("\n<<end>>\n").filter(Boolean) : []);
const HERE = /Here for: My business; The newsletter\./;

/** an engine with the new face on or off, and one fresh chat turn on it: the prompt the stand-in was given */
async function firstTurn(next: "on" | "off", text: string): Promise<string> {
  const port = await freePort();
  const engine = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ENGINE, stdio: "ignore",
    env: {
      ...process.env, HOME: user, SOL_PORT: String(port), SOL_HOME: home, SOL_PROFILE: join(dir, `profile-${next}`),
      SOL_STATE: join(dir, `work-${next}.json`), SOL_TEAM: join(dir, "team.json"), SOL_LOG: join(dir, `engine-${next}.log`),
      SOL_CODEX: join(dir, "codex"), SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_UI_NEXT: next,
    },
  });
  engines.push(engine);
  await ownHealth(engine, port);
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const got: Msg[] = [];
  ws.on("message", (raw) => got.push(JSON.parse(raw.toString())));
  await new Promise((r, no) => { ws.once("open", r); ws.once("error", no); });
  const p = said().length;
  ws.send(JSON.stringify({ type: "say", text, seat: "codex", door: "notch", fresh: true }));
  for (let i = 0; i < 150 && !(got.some((m) => m.type === "done") && said().length > p); i++) await wait(100);
  ws.close();
  engine.kill();
  assert.ok(said().length > p, `the turn "${text}" reached the stand-in`);
  return said().at(-1)!;
}

test("a new session's first turn carries you, here (at most 600 characters) with the new face on, and nothing with it off", { timeout: 120_000 }, async () => {
  const on = await firstTurn("on", "plan this week's issue");
  const m = HERE.exec(on);
  assert.ok(m, `you, here is in the prompt:\n${on}`);
  // the line is its own paragraph before the person's words reach the seat, and whole within its cap
  const block = on.split("\n\n").find((b) => HERE.test(b))!;
  assert.ok(block.length <= 600, `${block.length} characters`);
  assert.ok(on.includes("plan this week's issue"));

  const off = await firstTurn("off", "plan next week's issue");
  assert.doesNotMatch(off, HERE, "the old face: no you, here");
});
