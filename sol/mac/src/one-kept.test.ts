// node --test src/*.test.ts: how the one session is kept (#1002, one/kept.ts): the engine's numbers to what the face
// shows: the fill and its word, the renewal line at 60% on the ring, a renewal's lines newest first, and the two states
// a renewal can be in besides done (under way, did not go), with the press that cannot go twice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fillOf, levelY, linesOf, renewalsOf, stateOf, canRenew, renewWord, runsOf, homesOf, shortPath, quietOf, STALE_MS, type Kept, type Renewal } from "./one/kept.ts";
import type { Row } from "./one/model.ts";

const NOW = new Date(2026, 10, 12, 12, 0).getTime();
const r = (o: Partial<Renewal> = {}): Renewal => ({ at: NOW - 3 * 3_600_000, from: "a", to: "b", why: "asked", context: 0, window: 1_000_000, file: "/x/one-handovers/1.md", carried: ["one"], dropped: ["two"], pieces: 1, sessions: 0, ...o });
const kept = (o: Partial<Kept> = {}): Kept => ({ sessionId: "s", madeAt: 0, cwd: "/", context: 12_749, window: 1_000_000, renewAt: 0.6, renewing: null, failed: null, renewals: [], past: [],
  pieces: { open: 1, kept: 3, cap: 60 }, did: { kept: 0, cap: 40 }, runs: [], homes: { state: "/Users/m/Library/Application Support/com.marcol04.sol/one.json", handovers: "/Users/m/Library/Application Support/com.marcol04.sol/one-handovers", long: "/s/one-long.json" }, ...o });

test("the fill: context of window, its percent and a word; the renewal line at 60%", () => {
  const f = fillOf(kept());
  assert.equal(f.counted, true); assert.equal(f.pct, 1); assert.equal(f.atPct, 60); assert.equal(f.at, 0.6); assert.equal(f.word, "fresh"); assert.equal(f.past, false);
  assert.ok(Math.abs(f.fill - 0.012749) < 1e-9);
  assert.equal(fillOf(kept({ context: 300_000 })).word, "roomy");
  assert.equal(fillOf(kept({ context: 500_000 })).word, "renews soon");
  const over = fillOf(kept({ context: 640_000 }));
  assert.equal(over.word, "renews after this turn"); assert.equal(over.past, true); assert.equal(over.pct, 64);
  assert.equal(fillOf(kept({ context: 2_000_000 })).fill, 1, "never past full");
  assert.equal(fillOf(kept({ renewing: { at: NOW, why: "full" } })).word, "renewing");
});
test("no window yet reads as not counted, never as empty; a broken renewAt falls back to 60%", () => {
  const f = fillOf(kept({ context: 0, window: 0 }));
  assert.equal(f.counted, false); assert.equal(f.word, "not counted yet");
  assert.equal(fillOf(kept({ renewAt: 0 })).atPct, 60); assert.equal(fillOf(kept({ renewAt: 0.5 })).atPct, 50);
});
test("the 60% mark sits on the ring where its liquid stands at 60%", () => {
  // a 56 px ring: the disc's bottom at 28 + 23.52, its top at 28 - 23.52
  assert.ok(Math.abs(levelY(56, 0) - 51.52) < 1e-9); assert.ok(Math.abs(levelY(56, 1) - 4.48) < 1e-9);
  assert.ok(Math.abs(levelY(56, 0.6) - (51.52 - 0.6 * 47.04)) < 1e-9);
  assert.ok(levelY(24, 0.6) < 12, "above the middle");
});
test("a renewal's lines: heads, short leads, numbered facts as written", () => {
  const ls = linesOf(["My role: I am the one session.", "Facts the check asked me to keep, word for word:", "1. The word is \"heron-41\".", "  ", "How earlier answers were worded and the talk around them: the check scores facts."]);
  assert.deepEqual(ls[0], { lead: "My role", text: "I am the one session." });
  assert.deepEqual(ls[1], { head: true, text: "Facts the check asked me to keep, word for word" });
  assert.deepEqual(ls[2], { text: "1. The word is \"heron-41\"." });
  assert.equal(ls.length, 4, "blank lines dropped");
  assert.equal(ls[3].lead, undefined, "a long name stays in the line");
});
test("renewals newest first: when, why, how full, what crossed and what was left out", () => {
  const rs = renewalsOf([r({ at: NOW - 86_400_000 * 2, why: "full", context: 610_000, carried: ["a", "b"], dropped: [] }), r({ carried: ["x"], dropped: ["y", "z"], sessions: 2 })], NOW);
  assert.deepEqual(rs.map((x) => x.n), [2, 1]);
  assert.equal(rs[0].why, "on ask"); assert.equal(rs[1].why, "it filled up");
  assert.equal(rs[0].full, "fullness not counted", "a renewal with no count says so");
  assert.equal(rs[1].full, "at 61% full");
  assert.equal(rs[0].note, "fullness not counted · 1 carried over · 2 left out");
  assert.equal(rs[0].when, "09:00 · 3 h ago");
  assert.match(rs[1].when, /^Nov 10, 12:00 · 2 d ago$/);
  assert.equal(rs[0].with, "it crossed with 1 piece open and 2 sessions running");
  assert.deepEqual(rs[0].dropped.map((l) => l.text), ["y", "z"]);
});
test("renewing: shown as under way, the press held; stale after ten minutes, the press back", () => {
  const k = kept({ renewing: { at: NOW - 40_000, why: "full" } });
  const s = stateOf(k, NOW);
  assert.equal(s.kind, "renewing"); assert.equal(s.kind === "renewing" && s.line, "it filled up; writing its handover · 40 s");
  assert.equal(canRenew(k, NOW, false), false); assert.equal(renewWord(k, NOW, false), "renewing…");
  const later = NOW + STALE_MS;
  assert.equal(canRenew(k, later, false), true); assert.equal(renewWord(k, later, false), "renew now");
  assert.equal(stateOf(k, later).kind === "renewing" && (stateOf(k, later) as { stale: boolean }).stale, true);
  assert.equal(quietOf(k, NOW).line, "renewing");
});
test("failed: the reason shown; the press free again", () => {
  const k = kept({ failed: { at: NOW - 120_000, why: "it wrote no handover; it stays as it is" } });
  const s = stateOf(k, NOW);
  assert.equal(s.kind, "failed"); assert.equal(s.kind === "failed" && s.why, "it wrote no handover; it stays as it is");
  assert.equal(s.kind === "failed" && s.line, "the last renewal did not go · 2 min ago");
  assert.equal(canRenew(k, NOW, false), true); assert.equal(quietOf(k, NOW).line, "renewal did not go");
});
test("the press cannot go twice: held while on its way, and with no one session", () => {
  assert.equal(canRenew(kept(), NOW, true), false); assert.equal(renewWord(kept(), NOW, true), "asking…");
  assert.equal(canRenew(kept({ sessionId: null }), NOW, false), false);
  assert.equal(canRenew(kept(), NOW, false), true); assert.equal(stateOf(kept(), NOW).kind, "kept");
});
test("what it runs, with titles from the roster where it has them; where each fact is written", () => {
  const rows = [{ id: "k1", title: "You are the builder of the kept block. Build it." } as Row];
  assert.deepEqual(runsOf([], rows), { count: 0, titles: [], line: "no sessions now" });
  const two = runsOf(["k1", "k2"], rows);
  assert.equal(two.line, "2 sessions"); assert.deepEqual(two.titles, ["the builder of the kept block"]);
  const h = homesOf(kept().homes);
  assert.deepEqual(h.map((x) => x.name), ["what it keeps", "its handovers", "the long view"]);
  assert.equal(h[0].path, "…/com.marcol04.sol/one.json"); assert.equal(h[2].path, "/s/one-long.json");
  assert.equal(shortPath("/Users/m/a.json"), "~/a.json");
});
test("the quiet mark's label says the fill and the line", () => {
  assert.deepEqual(quietOf(kept(), NOW), { label: "1% full · renews itself at 60%", line: "" });
  assert.equal(quietOf(kept({ window: 0, context: 0 }), NOW).label, "not counted yet · renews itself at 60%");
});
