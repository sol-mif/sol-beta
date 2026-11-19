// A service the person said "not here" to in Settings › home (#1229): the consent names it, `account:<name>` "no", and a
// read turn through the Claude account refuses its tools by name from the next turn on; turned back on, it reads again.
// A made-up person's home (a temp folder); no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import { connectorsGuard, servicesOff } from "../src/connectors.ts";

const home = mkdtempSync(join(tmpdir(), "sol-off-"));
mkdirSync(join(home, ".sol", "record"), { recursive: true });
const write = (sources: Record<string, string>) => writeFileSync(join(home, ".sol", "record", "me.json"), JSON.stringify({ v: 1, consent: { sources } }));
const base: CanUseTool = async (_n, input) => ({ behavior: "allow", updatedInput: input });
const ask = (g: CanUseTool, name: string) => g(name, {}, { signal: new AbortController().signal, toolUseID: "t" } as Parameters<CanUseTool>[2]);

test("connectors: a service said not here is refused by name on the next read turn; the others read as before", async () => {
  write({ "account:Gmail": "no", "claude-sessions": "no" });
  const off = servicesOff(home);
  assert.ok(off.has("claude_ai_Gmail"));
  const g = connectorsGuard(base, new Map(), off);
  const r = await ask(g, "mcp__claude_ai_Gmail__list_threads");
  assert.equal(r.behavior, "deny");
  assert.match((r as { message: string }).message, /not here.*Gmail.*Settings › home/);
  assert.equal((await ask(g, "mcp__claude_ai_Google_Calendar__list_events")).behavior, "allow");
  assert.equal((await ask(g, "mcp__claude_ai_Google_Calendar__send_invite")).behavior, "deny");   // a read turn still only reads
});

test("connectors: turned back on (a yes), the next turn reads it; no record refuses nothing by name", async () => {
  write({ "account:Gmail": "yes" });
  assert.equal((await ask(connectorsGuard(base, new Map(), servicesOff(home)), "mcp__claude_ai_Gmail__list_threads")).behavior, "allow");
  assert.equal(servicesOff(join(home, "nobody")).size, 0);
});
