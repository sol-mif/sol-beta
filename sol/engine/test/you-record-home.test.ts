// The record follows the run's home (BR1, #1615; next/you.ts recordHomeOf, parts/next-you.ts): a run on a fresh
// SOL_HOME never writes the person's own record (~/.sol/record/me.json), nor anything else in their home. A real engine
// on its own port, HOME a made-up person's (Tomás, from the panel: docs/marketing/brand/pack/panel.md) whose record
// belongs to another Sol, SOL_HOME a fresh folder; every message that writes is sent, then the person's home is
// compared, file by file, with how it was. Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { freePort, ownHealth } from "./test-engine.ts";
import { recordHomeOf } from "../src/next/you.ts";

const ENGINE = join(import.meta.dirname, "..");
const dir = mkdtempSync(join(tmpdir(), "sol-rec-home-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const user = join(dir, "tomas"), theirs = join(user, "sol-home"), fresh = join(dir, "fresh");
const RECORD = join(user, ".sol", "record", "me.json");
mkdirSync(join(user, ".sol", "record"), { recursive: true }); mkdirSync(theirs, { recursive: true }); mkdirSync(fresh);
writeFileSync(RECORD, JSON.stringify({ name: "Tomás", said: "go", solHome: theirs, areas: [], consent: { sources: { notes: "no" } }, aims: [{ w: "Work", said: true, ok: true, at: "2026-11-18" }] }, null, 2));
// one Claude Code session of theirs, so the read has a source to read and a consent to write
const proj = join(user, ".claude", "projects", "-clients");
mkdirSync(proj, { recursive: true }); mkdirSync(join(user, "clients"));
writeFileSync(join(proj, "s0.jsonl"), JSON.stringify({ type: "user", cwd: join(user, "clients"), timestamp: new Date().toISOString() }) + "\n");
// this run's words come from the rules: the on-device planner is marked as one this Mac cannot build, in the fresh home
const swift = readFileSync(join(ENGINE, "src", "next", "planner.swift"));
mkdirSync(join(fresh, "next", "bin"), { recursive: true });
writeFileSync(join(fresh, "next", "bin", `planner-${createHash("sha256").update(swift).digest("hex").slice(0, 16)}.failed`), String(Date.now()));

/** every file under a folder, with its bytes' hash and its last write */
function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else out[p] = `${createHash("sha256").update(readFileSync(p)).digest("hex")} ${statSync(p).mtimeMs}`; } };
  walk(root);
  return out;
}

test("whose record: SOL_RECORD_HOME first; the person's own when it is this Sol's or there is none; else one inside SOL_HOME", () => {
  assert.equal(recordHomeOf(fresh, user, { SOL_RECORD_HOME: join(dir, "panel") }), join(dir, "panel"));
  assert.equal(recordHomeOf(fresh, user, { SOL_RECORD_HOME: "relative/path" }), join(fresh, "next", "home"), "only an absolute path");
  assert.equal(recordHomeOf(theirs, user, {}), user, "the record is this Sol's");
  assert.equal(recordHomeOf(fresh, user, {}), join(fresh, "next", "home"), "another Sol's record: a home inside SOL_HOME");
  assert.equal(recordHomeOf(fresh, join(dir, "nobody"), {}), join(dir, "nobody"), "no record yet: nothing will write one");
});

test("a run on a fresh SOL_HOME writes nothing in the person's home: not their record, not anything else", { timeout: 90_000 }, async () => {
  const before = snapshot(user);
  const port = await freePort();
  const env: NodeJS.ProcessEnv = {
    ...process.env, HOME: user, SOL_PORT: String(port), SOL_HOME: fresh, SOL_PROFILE: join(dir, "profile"),
    SOL_STATE: join(dir, "work.json"), SOL_TEAM: join(dir, "team.json"), SOL_LOG: join(dir, "engine.log"),
    SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_UI_NEXT: "on",
    // the gh CLI the engine calls keeps its own device id under ~/.local/state: gh's file, not Sol's, kept out of the count
    XDG_STATE_HOME: join(dir, "xdg-state"),
  };
  delete env.SOL_RECORD_HOME;
  const engine = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], { cwd: ENGINE, stdio: "ignore", env });
  try {
    await ownHealth(engine, port);
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const got: { type: string; [k: string]: any }[] = [];
    ws.on("message", (raw) => got.push(JSON.parse(raw.toString())));
    await new Promise((r, no) => { ws.once("open", r); ws.once("error", no); });
    let rid = 0;
    const ask = async (m: object) => {
      const id = ++rid;
      ws.send(JSON.stringify({ ...m, rid: id }));
      for (let i = 0; i < 400 && !got.some((g) => g.rid === id); i++) await new Promise((r) => setTimeout(r, 50));
      const a = got.find((g) => g.rid === id);
      assert.ok(a, `an answer to ${JSON.stringify(m)}`);
      return a!;
    };
    // the read (its press writes consent.sources), each field the person sets, an answer, Skip
    const read = await ask({ type: "next.you.read", sources: ["claude-sessions"], by: "device" });
    assert.equal(read.ok, true, JSON.stringify(read));
    assert.ok(read.you.parts.some((p: { name: string }) => p.name === "clients"), "the read read their sessions");
    assert.equal((await ask({ type: "next.you.aims", aims: ["Work", "The book"] })).ok, true);
    assert.equal((await ask({ type: "next.you.sieve", keep: ["money"] })).ok, true);
    assert.equal((await ask({ type: "next.you.again", weekly: true })).ok, true);
    assert.equal((await ask({ type: "next.you.part.drop", id: join(user, "clients") })).ok, true);
    assert.equal((await ask({ type: "next.you.read", sources: ["notes"], by: "none" })).ok, true);
    // the fields are kept, inside the fresh home (no record there yet: SOL_HOME/next/you.json holds them)
    const you = await ask({ type: "next.you" });
    assert.deepEqual(you.you.aims.map((a: { w: string }) => a.w), ["Work", "The book"]);
    assert.ok(existsSync(join(fresh, "next", "you.json")));
    ws.close();
  } finally { engine.kill(); }
  // their home exactly as it was: the record's bytes and every other file
  assert.deepEqual(snapshot(user), before);
  assert.deepEqual(JSON.parse(readFileSync(RECORD, "utf8")).consent, { sources: { notes: "no" } });
});
