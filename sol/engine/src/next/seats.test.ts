// next/seats.ts (#1620 pieces under next/): which AI uses which seat and what blocks it, a renew a week ahead, a
// sign-in learned done, and the way back to the old Sol as a confirm then a state. Rows as connections.ts keeps them
// (#1631, #1632); every write against a temp SOL_HOME. The panel's people only.
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Connection } from "../connections.js";
import { doneOf, goBack, readBack, renewOf, seatsOf, WEEK } from "./seats.js";
import part, { useReaders } from "../parts/next-calls.js";

const NOW = Date.UTC(2026, 10, 19, 9, 0), DAY = 864e5;
const dirs: string[] = [];
const temp = () => { const d = mkdtempSync(join(tmpdir(), "sol-next-seats-")); dirs.push(d); return d; };
const wasEnv = process.env.SOL_UI_NEXT;
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); if (wasEnv === undefined) delete process.env.SOL_UI_NEXT; else process.env.SOL_UI_NEXT = wasEnv; });
beforeEach(() => { process.env.SOL_UI_NEXT = "on"; });

const rows: Connection[] = [
  { id: "seat:claude", name: "Claude", from: "seat", state: "connected", account: "dev@example.com", fix: { kind: "run", run: "claude auth login" } },
  { id: "seat:codex", name: "Codex", from: "seat", state: "missing", why: "signed out on this Mac", fix: { kind: "run", run: "codex login" } },
  { id: "site:jayden:canvas", name: "Canvas", from: "site", state: "lapsed", why: "Canvas needs a sign-in", fix: { kind: "send", type: "agent.signin", with: { folder: "jayden", site: "canvas" } } },
  { id: "tool:gh", name: "GitHub", from: "mac-tool", state: "connected", expires: NOW + 3 * DAY },
  { id: "claude:gmail", name: "Gmail", from: "claude-account", state: "connected" },
];
const ais = [{ ai: "Work", seat: "claude" as const }, { ai: "Home", seat: "codex" as const }, { ai: "jayden", seat: "codex" as const, folder: "jayden" }];

test("renew: ran out, this week, not counted, or nothing while it is fine", () => {
  assert.equal(renewOf({ from: "mac-tool", state: "connected", expires: NOW - 1 }, NOW), "ran out");
  assert.equal(renewOf({ from: "mac-tool", state: "connected", expires: NOW + WEEK }, NOW), "this week");
  assert.equal(renewOf({ from: "mac-tool", state: "connected", expires: NOW + WEEK + 1 }, NOW), undefined);
  assert.equal(renewOf({ from: "seat", state: "connected" }, NOW), "not counted", "no end given: never a promise of a week's warning");
  assert.equal(renewOf({ from: "claude-account", state: "connected" }, NOW), undefined);
});

test("which AI uses which seat, and what blocks it, by connections.ts's one rule", () => {
  const m = seatsOf(rows, ais, NOW);
  assert.equal(m.known, true);
  assert.deepEqual(m.seats.map((s) => s.id), ["seat:claude", "seat:codex", "site:jayden:canvas", "tool:gh"], "seats, sites and any row that runs out; not the rest");
  const by = Object.fromEntries(m.seats.map((s) => [s.id, s]));
  assert.deepEqual(by["seat:claude"].usedBy, ["Work"]);
  assert.deepEqual(by["seat:codex"].usedBy, ["Home", "jayden"]);
  assert.deepEqual(by["seat:codex"].blocks, ["Home", "jayden"]);
  assert.deepEqual(by["site:jayden:canvas"].usedBy, ["jayden"]);
  assert.equal(by["tool:gh"].renew, "this week");
  assert.deepEqual(m.ais.find((a) => a.ai === "Work")!.blocked, null, "known, and nothing blocks it");
  assert.deepEqual(m.ais.find((a) => a.ai === "jayden")!.blocked, { by: "seat:codex", why: "signed out on this Mac" });
  // the seat signed in again: the site it stopped at is what blocks it now
  const again = seatsOf(rows.map((r) => (r.id === "seat:codex" ? { ...r, state: "connected" as const } : r)), ais, NOW);
  assert.deepEqual(again.ais.find((a) => a.ai === "jayden")!.blocked, { by: "site:jayden:canvas", why: "Canvas needs a sign-in" });
  assert.equal(again.ais.find((a) => a.ai === "Home")!.blocked, null);
});

test("nothing kept yet: not known, and blocked is absent (not 'not blocked')", () => {
  const m = seatsOf(null, ais, NOW);
  assert.equal(m.known, false);
  assert.deepEqual(m.seats, []);
  for (const a of m.ais) assert.ok(!("blocked" in a));
});

test("a sign-in learned done: the changed rows that are connected now", () => {
  assert.deepEqual(doneOf(rows, ["seat:claude", "seat:codex"]), ["seat:claude"]);
  assert.deepEqual(doneOf(null, ["seat:claude"]), []);
});

test("back to the old Sol: a confirm first (nothing written), then back.json whole and the switch off", async () => {
  const dir = temp();
  const on = new Map<string, (msg: any, h: any) => unknown>();
  part({ on: (t: string, f: any) => on.set(t, f), atStart: () => {}, route: () => {} } as any);
  const got: any[] = [];
  const h = { HOME: dir, fromSol: true, face: { send: (m: object) => got.push(m) } };
  await on.get("next.back")!({ type: "next.back" }, h);
  assert.equal(got[0].type, "next.back");
  assert.match(got[0].confirm, /Back to the old Sol\?/);
  assert.equal(got[0].back, null);
  assert.deepEqual(readdirSync(dir), [], "the confirm writes nothing");
  // the yes itself, with the switch turned off by a stand-in (the part's own calls settings.ts patchSettings)
  let off = 0;
  const b = goBack(dir, NOW, true, () => { off++; });
  assert.equal(off, 1);
  assert.deepEqual(readBack(dir), { at: NOW, was: true });
  assert.deepEqual(b, { at: NOW, was: true });
  assert.deepEqual(readdirSync(join(dir, "next")), ["back.json"], "only under SOL_HOME/next/, no temp left");
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "next", "back.json"), "utf8")), { at: NOW, was: true });
});

test("a broken back.json is not read and not thrown away", async () => {
  const dir = temp();
  goBack(dir, NOW, true, () => {});
  const f = join(dir, "next", "back.json");
  (await import("node:fs")).writeFileSync(f, "{not json");
  assert.equal(readBack(dir), null);
  assert.ok(existsSync(f));
});

test("the part answers next.seats from the kept list; off, nothing", async () => {
  const dir = temp();
  const on = new Map<string, (msg: any, h: any) => unknown>();
  part({ on: (t: string, f: any) => on.set(t, f), atStart: () => {}, route: () => {} } as any);
  const unread = useReaders({ ais: () => ais });
  try {
    const got: any[] = [];
    const h = { HOME: dir, fromSol: true, face: { send: (m: object) => got.push(m) } };
    await on.get("next.seats")!({ type: "next.seats", rid: "s" }, h);
    assert.equal(got[0].type, "next.seats");
    assert.equal(got[0].rid, "s");
    assert.equal(typeof got[0].known, "boolean");
    assert.equal(got[0].ais.length, 3);
    process.env.SOL_UI_NEXT = "off";
    await on.get("next.seats")!({ type: "next.seats" }, h);
    assert.equal(got.length, 1);
  } finally { unread(); }
});
