// Agents in use (#1327, agent/inuse.ts): whether Agents works right while a person uses it, counted and read back.
// The checks from a drawn place's numbers, the stray chat, a sign-in that frees its agent within one run, the counts
// written through track.ts and read back green and red by day and version. Invented homes only, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHECKS, checksOfSeen, inUseHere, inUseOf, noteSeen, seenOf, signinsDecided, strayChats } from "../src/agent/inuse.ts";
import { dayFile, setTrackHome } from "../src/track.ts";
import type { AgentsFile } from "../src/agent/agents.ts";
import type { LedgerLine } from "../src/agent/harness.ts";

const T0 = Date.parse("2026-11-17T09:00:00Z"), H = 3_600_000;
const signInLine = (rule: string, at: number): LedgerLine => ({ at, rule, read: "Seed shop asked for a sign-in", made: "nothing (blocked)", held: 'would have shown "Sign in to Seed shop"' });
const madeLine = (rule: string, at: number): LedgerLine => ({ at, rule, read: "two new orders", made: "a reply in drafts/", held: "" });
const woke = (id: string, at: number, rules: { folder: string; rule: string }[]) => ({ id, at: new Date(at).toISOString(), kind: "woke", agent: "seed-orders", line: "Seed orders runs again: you signed in to Seed shop.", rules, undo: null, undone: false, cause: "through" });

test("a drawn place's numbers: kept as numbers, each check its own", () => {
  assert.equal(seenOf({ what: "garden" }), null);
  assert.deepEqual(seenOf({ what: "floor", paintMs: 412.6, cards: 7, ids: "two", raw: -1 }), { what: "floor", paintMs: 413, cards: 7 }, "a word or a negative is dropped");
  assert.equal(seenOf({ what: "floor", paintMs: 99_999 })!.paintMs, 10_000, "never past the 10 s a floor that never came is");
  assert.deepEqual(checksOfSeen({ what: "floor", paintMs: 412, cards: 7, ids: 0 }), [["floor-1s", true], ["read-3s", true], ["cards-7", true], ["no-ids", true]]);
  assert.deepEqual(checksOfSeen({ what: "floor", paintMs: 1500, cards: 11, ids: 2 }), [["floor-1s", false], ["read-3s", true], ["cards-7", false], ["no-ids", false]]);
  assert.deepEqual(checksOfSeen({ what: "floor", paintMs: 10_000 }), [["floor-1s", false], ["read-3s", false]], "Reading your agents… past 3 s");
  assert.deepEqual(checksOfSeen({ what: "desk", ids: 0, raw: 3 }), [["no-ids", true], ["no-raw", false]]);
  assert.deepEqual(checksOfSeen({ what: "changes", ids: 1, raw: 3 }), [["no-ids", false]], "raw markdown is a desk's check only");
});

test("a stray chat is an agent's own thread in the list of talks", () => {
  assert.equal(strayChats(["th-a", null, "th-b"], new Set(["th-b", "th-person"])), 1);
  assert.equal(strayChats([null, "th-a"], new Set(["th-person"])), 0);
});

test("a sign-in frees its agent within one run: decided once its first run after came, once", () => {
  const f = { changes: [woke("c-1", T0, [{ folder: "shop", rule: "web-1" }]), woke("c-2", T0, [{ folder: "yard", rule: "web-2" }]), woke("c-3", T0, [{ folder: "shed", rule: "clock-1" }])] } as unknown as AgentsFile;
  const ledgers: Record<string, LedgerLine[]> = {
    shop: [madeLine("web-1", T0 + 2 * H), signInLine("web-1", T0 + H), signInLine("web-1", T0 - H)],   // newest first: the first run after stopped again
    yard: [madeLine("web-2", T0 + H), signInLine("web-2", T0 - H)],
    shed: [signInLine("clock-1", T0 - H)],   // no run since: not decided yet
  };
  const got = signinsDecided(f, (folder) => ledgers[folder] ?? [], new Set());
  assert.deepEqual(got, [{ id: "c-1", ok: false }, { id: "c-2", ok: true }]);
  assert.deepEqual(signinsDecided(f, (folder) => ledgers[folder] ?? [], new Set(["c-1", "c-2"])), [], "each is decided once");
  const undone = { changes: [{ ...woke("c-4", T0, [{ folder: "yard", rule: "web-2" }]), undone: true }] } as unknown as AgentsFile;
  assert.deepEqual(signinsDecided(undone, (folder) => ledgers[folder] ?? [], new Set()), []);
});

test("the counts written and read back: green and red by day and version, the moments, the failures", async () => {
  const home = mkdtempSync(join(tmpdir(), "sol-inuse-"));
  let now = new Date(T0);
  setTrackHome(home, { version: "abc1234", consent: () => ({ usage: true }), now: () => now });
  const f = { changes: [woke("c-1", T0 - 3 * H, [{ folder: "yard", rule: "web-2" }])] } as unknown as AgentsFile;
  const d = { file: () => f, ledgerOf: () => [madeLine("web-2", T0 - H)], threads: () => ["th-a"], listed: async () => new Set(["th-a"]), trackDir: join(home, "track") };
  const first = await noteSeen({ what: "floor", paintMs: 380, cards: 7, ids: 0 }, d);
  assert.deepEqual(first, [["floor-1s", true], ["read-3s", true], ["cards-7", true], ["no-ids", true], ["no-stray-chat", false], ["signin-frees", true]]);
  const again = await noteSeen({ what: "floor", paintMs: 2400, cards: 11, ids: 2 }, d);
  assert.ok(!again.some(([c]) => c === "signin-frees"), "the sign-in was decided on the first floor, kept beside the track files");
  now = new Date(T0 + 24 * H);
  await noteSeen({ what: "desk", ids: 0, raw: 4 }, d);
  assert.deepEqual(await noteSeen({ what: "nowhere" }, d), []);
  const text = readFileSync(dayFile(new Date(T0)), "utf8");
  assert.ok(!/th-a|web-2|yard|Seed/.test(text), "no thread, rule, folder or word reaches the counts");

  const u = inUseHere(join(home, "track"), 14, T0 + 24 * H);
  const by = Object.fromEntries(u.checks.map((c) => [c.check, c]));
  assert.deepEqual(u.checks.map((c) => c.check), [...CHECKS]);
  assert.deepEqual([by["floor-1s"].ok, by["floor-1s"].bad], [1, 1]);
  assert.deepEqual([by["cards-7"].ok, by["cards-7"].bad, by["cards-7"].lastBad], [1, 1, "2026-11-17"]);
  assert.deepEqual([by["no-stray-chat"].ok, by["no-stray-chat"].bad], [0, 2]);
  assert.deepEqual([by["signin-frees"].ok, by["signin-frees"].bad], [1, 0]);
  assert.deepEqual([by["no-raw"].ok, by["no-raw"].bad], [0, 1]);
  assert.deepEqual(u.days.map((x) => [x.day, x.sol]), [["2026-11-18", "abc1234"], ["2026-11-17", "abc1234"]], "newest first, by day and version");
  assert.equal(u.moments.find((m) => m.name === "opened")?.n, 3);

  // the moments and failures as the track lines say them (what Sol's cloud keeps is the same lines)
  const r = inUseOf([
    { at: "2026-11-17T10:00:00Z", sol: "abc1234", name: "agents.join", props: { answer: "together" } },
    { at: "2026-11-17T10:01:00Z", sol: "abc1234", name: "agents.signin" },
    { at: "2026-11-17T10:02:00Z", sol: "abc1234", name: "agents.read.failed" },
    { at: "2026-11-17T10:03:00Z", sol: "abc1234", name: "error.count", props: { file: "src:agent:agents.ts", type: "TypeError", kind: "work", msg: "agents.list" } },
    { at: "2026-11-17T10:04:00Z", sol: "abc1234", name: "error.count", props: { file: "src:team:pages.ts", type: "TypeError", kind: "team", msg: "team.page.write" } },
    { at: "2026-11-17T10:05:00Z", sol: "abc1234", name: "agents.check", props: { check: "made-up", ok: true } },
    { at: "not a time", sol: "abc1234", name: "agents.undo" },
    { at: "2026-11-17T10:06:00Z", sol: "a path/with spaces", name: "agents.undo" },
  ]);
  assert.equal(r.failed, 2, "a failed read and an error caught on agents.*; never another part's error");
  assert.deepEqual(r.moments.map((m) => m.name), ["join answered", "sign-in started", "undo"]);
  assert.equal(r.days.find((x) => x.sol === "")?.moments.undo, 1, "a version that is not a word is kept as none");
  assert.ok(r.checks.every((c) => c.ok + c.bad === 0), "a check not in the list is passed over");
});
