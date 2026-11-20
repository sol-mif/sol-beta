// The groups home (#1537): what each table shows, and which Cowork opens (cowork/groups/view.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agoOf, opensShell, STAGE, stageOf, stageWith, tablesOf, talkRows, titleOf, type HomeIn } from "./cowork/groups/view.ts";

const NOW = Date.parse("2026-11-18T20:00:00Z");
const base: HomeIn = {
  me: "frank", inUse: "sol", now: NOW,
  rooms: [
    { id: "sol", name: "sol", provider: "cloud", repos: ["sol-mif/sol-dev"], hub: "wss://cloud.example.net/relay", code: "AAAAAA", joined: true },
    { id: "cap", name: "capstone", provider: "drive", repos: ["drive:x"], code: "BBBBBB", mine: true },
    { id: "team", name: "", provider: "github", repos: [] },   // the made-up room: no table
  ],
  people: { sol: ["frank", "marco", "isaac"], cap: ["frank", "mei"] },
  agents: [{ of: "marco", working: true }, { of: "mei", working: true }],
  hands: [], pending: [],
};

test("a table per group, the made-up room left out; the others sit first and I sit last", () => {
  const t = tablesOf(base);
  assert.deepEqual(t.map((x) => x.name), ["sol", "capstone"]);
  assert.deepEqual(t[0].seats.map((s) => s.login), ["marco", "isaac", "frank"]);
  assert.equal(t[0].seats[2].me, true);
  assert.equal(titleOf(t), "two tables.");
});

test("an AI's coin works only where the engine says so: the room in use; another table's AI rests", () => {
  const [sol, cap] = tablesOf(base);
  assert.deepEqual(sol.seats.map((s) => s.coin), ["work", "rest", "rest"]);
  assert.equal(sol.line.text, "marco's ai is at work");
  assert.deepEqual(cap.seats.map((s) => s.coin), ["rest", "rest"]);
  assert.equal(cap.line.text, "nothing here yet");
});

test("a hand to me waits at the table its repository is at; its sender's coin asks; the page says who waits", () => {
  const t = tablesOf({ ...base, pending: [{ id: "h1", from: "marco", repo: "sol-mif/sol-dev", issue: 12, title: "ship the relay to beta tonight?", at: "2026-11-18T19:48:00Z" }] });
  assert.equal(t[0].ask?.title, "ship the relay to beta tonight?");
  assert.equal(t[0].seats[0].coin, "ask");
  assert.equal(t[1].ask, null);
  assert.equal(titleOf(t), "marco is waiting.");
  assert.equal(agoOf(t[0].ask?.at, NOW), "12 min ago");
});

test("the number is what was handed there today, else who sits there; the line is the last hand, else how quiet", () => {
  const hands = [
    { repo: "sol-mif/sol-dev", number: 3, at: "2026-11-18T18:00:00Z", how: "hand", from: "isaac", to: "frank" },
    { repo: "sol-mif/sol-dev", number: 4, at: "2026-11-18T19:00:00Z", how: "hand", from: "marco", to: "isaac" },
    { repo: "drive:x", number: 1, at: "2026-11-16T10:00:00Z", how: "hand", from: "mei", to: "frank" },
  ];
  const [sol, cap] = tablesOf({ ...base, agents: [], hands });
  assert.deepEqual(sol.count, { n: 2, word: "handed today" });
  assert.equal(sol.line.text, "marco handed #4 to isaac");
  assert.deepEqual(cap.count, { n: 2, word: "at the table" });
  assert.equal(cap.line.text, "quiet since monday");
});

test("a table with nobody read is me alone; more than four are counted", () => {
  const t = tablesOf({ ...base, people: { sol: ["frank", "a", "b", "c", "d", "e"] } });
  assert.equal(t[0].seats.length, 4);
  assert.equal(t[0].more, 2);
  assert.deepEqual(t[1].seats.map((s) => s.login), ["frank"]);
});

test("the way in: the team's shell for a Sol on the team or in concept, the groups home for everyone else", () => {
  assert.equal(opensShell([{ org: "sol-mif" }], "complete"), false, "a table in a GitHub org is anyone's: not the team's pages (gate one q1)");
  assert.equal(opensShell([{ org: "" }], "concept"), true);
  assert.equal(opensShell([{ org: "" }, {}], "complete"), false);
  assert.equal(opensShell(undefined, null), false);
});

test("gate one q3: a table's stage is its real hand-overs, newest first, said plainly; none means an empty stage", () => {
  const hands = [
    { repo: "sol-mif/sol-dev", number: 34, at: "2026-11-18T19:00:00Z", how: "hand", from: "marco", to: "frank", brief: "the card is yours" },
    { repo: "sol-mif/sol-dev", number: 36, at: "2026-11-18T18:00:00Z", how: "passed", from: "isaac", to: "marco", line: "not mine" },
    { repo: "drive:x", number: 2, at: "2026-11-18T17:00:00Z", how: "taken", from: "mei", to: "frank" },
  ];
  const [sol, cap] = tablesOf({ ...base, hands });
  assert.deepEqual(sol.stage.map((r) => [r.text, r.brief]), [["marco handed #34 to you", "the card is yours"], ["isaac passed #36 back", "not mine"]]);
  assert.deepEqual(cap.stage.map((r) => r.text), ["mei took #2"]);
  assert.deepEqual(tablesOf(base)[0].stage, [], "nothing handed: nothing made up");
  assert.equal(stageOf(Array.from({ length: 9 }, (_, n) => ({ ...hands[0], number: n })), "frank").length, STAGE);
});

test("gate one q3: the table page draws no made-up shapes", () => {
  const page = readFileSync(new URL("./cowork/groups/Page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /gh-ghost|a repo: what merged|a report: which chapter|an event: what's booked/);
  assert.match(page, /data-stage="empty"/);
  assert.match(page, /data-stage="things"/);
});

test("gate one q3: a cloud table's stage is its talk, the newest first, a person's ai named, merged with hand-overs", () => {
  const lines = [
    { id: "a", at: Date.parse("2026-11-18T19:00:00Z"), from: "isaac", text: "dinner friday at 7?" },
    { id: "b", at: Date.parse("2026-11-18T19:30:00Z"), from: "frank", text: "" , artifact: { title: "menu.pdf" } },
    { id: "c", at: Date.parse("2026-11-18T19:40:00Z"), from: "noa's agent", agent: true, text: "booked the table for six" },
    { id: "d", at: Date.parse("2026-11-18T19:41:00Z"), from: "noa", text: "   " },
  ];
  const rows = talkRows(lines, "frank");
  assert.deepEqual(rows.map((r) => [r.text, r.brief]), [["noa's ai", "booked the table for six"], ["you", "menu.pdf"], ["isaac", "dinner friday at 7?"]]);
  const hands = stageOf([{ repo: "o/x", number: 3, at: "2026-11-18T19:35:00Z", how: "hand", from: "mei", to: "frank" }], "frank");
  assert.deepEqual(stageWith(hands, rows).map((r) => r.text), ["noa's ai", "mei handed #3 to you", "you", "isaac"]);
});
