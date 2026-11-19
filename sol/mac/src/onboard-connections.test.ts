// node --test src/*.test.ts: Settings › home's one list of the ways in (#1229, onboard/connections.ts). Each way's state
// from what the engine and the reader say: connected, lapsed with one press to renew, never, blocked by an organisation
// with the way round on the same row, off by the person's rule with one press back, and no connector said once. The
// onboarding's reader is handed the same state (serviceState) so the two say the same word.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rowsOf, serviceState, needs, wayOf, APPS_PAGE, type Check } from "./onboard/connections.ts";
import { emptyConsent } from "./onboard/consent.ts";
import { empty } from "./onboard/record.ts";
import type { Service } from "./onboard/reach.ts";

const svc = (name: string, status: Service["status"], error?: string): Service => ({ name, server: `claude.ai ${name}`, status, read: ["list_threads", "get_thread"], refused: ["send_message"], ...(error ? { error } : {}) });
const ok: Check = { ok: true };
const checks: Record<string, Check> = { github: ok, gdrive: ok, gmail: ok, "claude-sessions": ok, "codex-sessions": { ok: false, need: { kind: "missing", line: "not on this computer" } }, notes: { ok: false, need: { kind: "switch", line: "Sol needs a switch" } }, calendar: ok };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const by = (rows: { id: string }[], id: string) => rows.find((r) => r.id === id) as any;

test("connections: the engine's word becomes the state; an organisation's refusal is blocked, never lapsed", () => {
  assert.equal(serviceState(svc("Gmail", "connected")), "connected");
  assert.equal(serviceState(svc("Gmail", "needs-auth")), "lapsed");
  assert.equal(serviceState(svc("Gmail", "failed", "token expired")), "lapsed");
  assert.equal(serviceState(svc("Gmail", "failed", "Access blocked: your organization's administrator has not allowed this app")), "blocked");
  assert.equal(serviceState(svc("Gmail", "failed", "admin_policy_enforced")), "blocked");
  assert.equal(serviceState(svc("Gmail", "disabled")), "never");
});

test("connections: Gmail lapsed is one press to sign in to Google again, named in the person's words, never the Claude account", () => {
  const { rows } = rowsOf({ services: [svc("Gmail", "needs-auth"), svc("Google Calendar", "connected")], checks, consent: null, rec: null });
  const g = by(rows, "account:Gmail");
  assert.equal(g.state, "lapsed");
  assert.deepEqual(g.fix, { kind: "page", url: APPS_PAGE, words: "sign in to Google again" });
  assert.equal(g.where, "through your Google sign-in");
  assert.ok(!rows.some((r) => /claude account/i.test(`${r.line} ${r.where} ${r.fix?.words ?? ""}`)));
  assert.equal(by(rows, "account:Google Calendar").state, "connected");
  assert.equal(wayOf("Google Drive"), "Google");
  assert.equal(needs(rows), 1);
});

test("connections: blocked by the organisation has no renew, and the way round on the same row", () => {
  const { rows } = rowsOf({ services: [svc("Gmail", "failed", "Your organization's admin has blocked access to this app")], checks, consent: null, rec: null });
  const g = by(rows, "account:Gmail");
  assert.equal(g.state, "blocked");
  assert.equal(g.line, "blocked by your organisation");
  assert.equal(g.fix, undefined);
  assert.match(g.round, /Mail on this Mac/);
});

test("connections: not here by the person's rule is off, with one press back; the onboarding's found connector is kept when it went", () => {
  const rec = { ...empty(), connectors: [{ name: "Notion", via: "claude account" }, { name: "linear", via: "claude code", src: "Claude's connectors" }], ai: [{ name: "ChatGPT", signed: false, reach: "export" as const }] };
  const consent = { ...emptyConsent(), sources: { "account:Gmail": "no" as const, github: "no" as const } };
  const { rows } = rowsOf({ services: [svc("Gmail", "connected")], checks, consent, rec });
  assert.equal(by(rows, "account:Gmail").state, "off");
  assert.equal(by(rows, "account:Gmail").fix.kind, "yes");
  assert.equal(by(rows, "github").state, "off");
  assert.equal(by(rows, "account:Notion").state, "lapsed");   // found at the onboarding, no longer listed
  assert.equal(by(rows, "tool:claude code:linear").state, "connected");
  assert.equal(by(rows, "export:ChatGPT").state, "export");
});

test("connections: the sign-ins, the session files and the Mac's stores, each from the reader's own check", () => {
  const once = (line: string, run: string): Check => ({ ok: false, need: { kind: "once", line, run } });
  const g = once("sign in to Google once", "gog auth add a@b.c --services gmail,drive");
  const { rows } = rowsOf({ services: [], checks: { ...checks, github: once("sign in to GitHub once", "gh auth login --web"), gdrive: g, gmail: g }, consent: null, rec: null });
  assert.deepEqual([by(rows, "github").state, by(rows, "github").fix.kind], ["lapsed", "github"]);
  assert.deepEqual([by(rows, "gdrive").state, by(rows, "gdrive").fix.kind, by(rows, "gdrive").fix.run], ["lapsed", "run", "gog auth add a@b.c --services gmail,drive"]);
  assert.equal(by(rows, "claude-sessions").state, "connected");
  assert.match(by(rows, "claude-sessions").line, /never what was said/);
  assert.equal(by(rows, "codex-sessions").state, "never");
  assert.equal(by(rows, "notes").state, "never");
  assert.equal(by(rows, "notes").fix.kind, "page");
  assert.equal(by(rows, "calendar-store").state, "connected");
});

test("connections: careful consent reads a session list only on its yes; what could not be asked is named, not drawn as gone", () => {
  const careful = { ...emptyConsent(), agreed: { said: "only what I tell you" as const, at: "", by: "" } };
  const { rows, unread } = rowsOf({ services: null, checks: null, consent: careful, rec: { ...empty(), connectors: [{ name: "Gmail", via: "claude account" }] } });
  assert.equal(rows.length, 0);
  assert.ok(unread.some((u) => /which apps are connected/.test(u)));
  const r2 = rowsOf({ services: [], checks, consent: careful, rec: null }).rows;
  assert.equal(by(r2, "claude-sessions").state, "never");
  assert.equal(by(r2, "claude-sessions").fix.kind, "yes");
});

test("connections: the reader's check finds an AI tool's session folder by its place, nothing read", async () => {
  const { mkdtempSync, mkdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  // @ts-expect-error a plain .mjs beside the face
  const { checkWays } = await import("./onboard/places/read.mjs");
  const home = mkdtempSync(join(tmpdir(), "sol-ways-"));
  mkdirSync(join(home, ".claude", "projects"), { recursive: true });
  const r = checkWays({ home, from: null, check: ["claude-sessions", "codex-sessions"], bin: home, days: 30, hosts: [], max: 1, chats: null });
  assert.equal(r.checks["claude-sessions"].ok, true);
  assert.equal(r.checks["codex-sessions"].ok, false);
  assert.equal(r.checks["codex-sessions"].need.kind, "missing");
});
