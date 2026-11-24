// node --test src/*.test.ts: an opened folder's head and what it knows (first-timer line 1, BR1 #1615;
// next/folder/head.ts, known.ts). With no session drawn, the head says what the move-in read counted, never "no sessions
// yet" against a busy folder; what the read found there is among what every session knows; Files knows where the folder
// is on the Mac. Invented folders only (kite, garden). Signed: marcocyl04-ux's agent (builder F).
import { test } from "node:test";
import assert from "node:assert/strict";
import { earlier, givenOf, headOf, knowsCount, knowsRows, pathOf, startsKnowing } from "./next/folder/head.ts";
import { badgeOf } from "./next/movein/you/circle-state.ts";
import { known } from "./next/known.ts";

test("folder head: the read's count, with the apps it ran in; nothing when it counted none", () => {
  assert.equal(earlier({ sessions: 336, found: { sessions: { claude: 300, codex: 36 } } }), "336 earlier sessions in Claude Code and Codex");
  assert.equal(earlier({ sessions: 1, found: { sessions: { claude: 1, codex: 0 } } }), "1 earlier session in Claude Code");
  assert.equal(earlier({ sessions: 4 }), "4 earlier sessions");
  assert.equal(earlier({ sessions: 0 }), "");
  assert.equal(earlier(undefined), "");
});

test("folder head: one total, the folder's one count, then only the states above 0 (BR1 hold 3)", () => {
  const row = { found: { sessions: { claude: 488, codex: 7 } } };
  assert.equal(headOf(495, 0, 0, row), "495 sessions in Claude Code and Codex", "never 0 needs you · 0 working · 311 done");
  assert.equal(headOf(495, 2, 1, row), "495 sessions in Claude Code and Codex · 2 need you · 1 working");
  assert.equal(headOf(1, 1, 0), "1 session · 1 needs you");
  assert.equal(headOf(0, 0, 0), "no sessions yet");
  assert.equal(headOf(0, 0, 0, undefined, "Nothing in it yet"), "Nothing in it yet", "an empty folder: the line its card says (try 5)");
  assert.equal(headOf(3, 0, 0, undefined, "Nothing in it yet"), "3 sessions", "a count wins over the empty line");
});

test("folder knows: what the read found there is listed, once, for the folder's own id", () => {
  const found = { id: "/u/kite", place: "w:/u/kite", app: true, holds: { repo: true }, rules: ["CLAUDE.md"], sessions: { claude: 12 } };
  const facts = known("w:/u/kite", { found: [found] }).map((k) => k.fact);
  assert.deepEqual(facts, ["A repo", "Claude Code works here", "Has CLAUDE.md"]);
  assert.deepEqual(known("w:/u/garden", { found: [found] }), []);
});

test("folder knows, drawn (BR1 conform #3): its place, its rules, its pages; never what Sol knows of the person", () => {
  const found = { id: "/u/kite", place: "w:/u/kite", app: true, holds: { repo: true }, rules: ["CLAUDE.md", "AGENTS.md"], sessions: { claude: 12 } };
  const share = { k: "seen:/u/kite:share", fact: "25% of your time", source: "what Sol read", by: "sol" as const, place: "/u/kite" };
  const told = { k: "fact:a1", fact: "Uses pnpm", source: "you told this folder", by: "person" as const, place: "w:/u/kite" };
  const kept = { k: "fact:a2", fact: "never push to main", source: "an AI kept it", by: "sol" as const, place: "w:/u/kite" };
  const old = { ...told, k: "fact:a3", fact: "Uses npm", stale: true as const };
  const ks = [...known("w:/u/kite", { found: [found] }), share, old, told, kept];
  const rows = knowsRows("~/kite", ks, ["Arrivals", "Release notes"]);
  assert.deepEqual(rows.map((r) => [r.k, r.what, r.small]), [
    ["place", "~/kite", "its place on disk · a repo"],
    ["rules", "CLAUDE.md · AGENTS.md · Uses pnpm · never push to main · Uses npm", "its rules, 5 · from CLAUDE.md, AGENTS.md, you and the AIs"],
    ["pages", "Arrivals · Release notes", "its pages"],
  ]);
  assert.deepEqual(rows[1].facts?.map((f) => f.k), ["fact:a1", "fact:a2", "fact:a3"], "the told ones unfold, the out-of-date last");
  assert.ok(!rows.some((r) => /of your time|works here/.test(r.what)), "the person's share and AIs are You's, not the folder's");
  assert.deepEqual(knowsRows(null, [share], []), [], "a Sol-only folder Sol knows nothing in: no row");
  assert.equal(knowsRows(null, [], ["a", "b", "c", "d", "e"])[0].what, "a · b · c · 2 more");
  assert.equal(knowsRows("~/x", [], [])[0].small, "its place on disk");
  // the card's badge says what the opened folder lists, one count per folder: place 1, rules 5, pages 2, notes, backs
  assert.equal(knowsCount(rows, 2, 1), 1 + 5 + 2 + 2 + 1);
  assert.equal(knowsCount(knowsRows(null, [share], []), 0, 0), 0, "only You's facts here: the folder lists nothing, the badge says nothing");
  assert.equal(badgeOf(ks, { n: knowsCount(rows, 2, 1) })!.w, "11 facts about this folder");
  assert.equal(badgeOf([share], { n: 0 }), null, "never a zero");
  assert.equal(badgeOf([], { n: 2 })!.desc, "", "pages and notes only: a count, no sources to name");
  // an empty folder's card says what a session is given there (BR1 conform #21, walk 3): never the share of time
  assert.deepEqual(givenOf(ks).map((f) => f.fact), ["A repo", "Has CLAUDE.md", "Has AGENTS.md", "Uses npm", "Uses pnpm", "never push to main"]);
  assert.deepEqual(givenOf([share]), [], "only You's facts: the card says nothing it knows");
  // a new session says, before Start, what it will know: the same rows, short (BR1 conform #6)
  assert.deepEqual(startsKnowing(rows, 2, 1), ["~/kite", "5 rules", "2 pages", "2 notes", "1 thing a finished session wrote back"]);
  const few = known("w:/u/kite", { found: [{ ...found, rules: ["CLAUDE.md"] }] });
  assert.deepEqual(startsKnowing(knowsRows("~/kite", few, ["Arrivals"]), 0, 2), ["~/kite", "CLAUDE.md", "1 page", "2 things finished sessions wrote back"]);
  assert.deepEqual(startsKnowing([], 0, 0), [], "nothing known: the card says so in its own words");
  assert.deepEqual(givenOf(known("w:/u/x", { found: [{ id: "/u/x", place: "w:/u/x", app: true }] })), [], "\"No code in it\" is no line for a card");
});

test("folder files: a work folder's path from its id or its region; Sol-home only has none", () => {
  assert.equal(pathOf("w:/u/kite"), "/u/kite");
  assert.equal(pathOf("h:garden", { path: "/u/.sol/garden" }), "/u/.sol/garden");
  assert.equal(pathOf("h:garden", {}), null);
});
