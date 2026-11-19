// node --test src/*.test.ts: the one session at team size (#1002, one/team.ts, build.one.team): a hand to me is a piece,
// a hand of mine untaken is a line I can pull back, a teammate's is one quiet line; the area's lead comes first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSwitch } from "./flag.ts";
import { TEAM_FLAG, piecesOf, linesOf, whoFor, givable, canPullBack, initial, LINES } from "./one/team.ts";
import type { HandRow, Handed } from "./cowork/handed.ts";
import type { Card } from "./cowork/useTeam.ts";

const R = "acme/sol";
const sign = (login: string) => ({ login, agent: false });
const row = (o: Partial<HandRow>): HandRow => ({ repo: R, number: 1, at: "2026-11-11T03:00:00Z", how: "hand", from: "marco", to: "frank", sign: sign("marco"), ...o });
const handed = (o: Partial<Handed>): Handed => ({ id: `${R}#34`, from: "frank", repo: R, issue: 34, title: "the notch card", brief: "the notch card is yours", branch: "", at: "2026-11-11T03:00:00Z", ...o });
const env = (o: Record<string, string> = {}, search = "") => ({ storage: () => ({ getItem: (k: string) => o[k] ?? null, setItem: (k: string, v: string) => { o[k] = v; } }), search: () => search, target: new EventTarget() });

test("build.one.team is its own switch, off by default", () => {
  assert.equal(TEAM_FLAG, "build.one.team");
  assert.equal(buildSwitch(TEAM_FLAG, env()).get(), false);
  assert.equal(buildSwitch(TEAM_FLAG, env({ "build.one": "1" })).get(), false, "the one session on does not turn the team on");
  assert.equal(buildSwitch(TEAM_FLAG, env({ "build.one.team": "1" })).get(), true);
});

test("a hand to me is a piece; put off till later it leaves the stage; a review is not a piece; a pass back says so", () => {
  const p = piecesOf([handed({}), handed({ id: `${R}#9`, issue: 9, review: true })], () => false);
  assert.deepEqual(p.map((x) => x.issue), [34]);
  assert.equal(p[0].whose, "yours");
  assert.equal(piecesOf([handed({})], (id) => id === `${R}#34`).length, 0);
  const back = piecesOf([handed({ from: "isaac" })], () => false, [row({ number: 34, how: "passed", from: "isaac", to: "marco" })]);
  assert.equal(back[0].passedBack, true);
});

test("the lines: mine untaken can be pulled back; taken, it says who took it; a teammate's is quiet; a hand to me is never a line", () => {
  const rows: HandRow[] = [
    row({ number: 5, at: "2026-11-11T03:05:00Z", how: "taken", from: "marco", to: "frank" }),
    row({ number: 4, at: "2026-11-11T03:04:00Z", how: "hand", from: "frank", to: "isaac" }),
    row({ number: 3, at: "2026-11-11T03:03:00Z", how: "hand", from: "frank", to: "marco" }),
    row({ number: 2, at: "2026-11-11T03:02:00Z", how: "hand", from: "marco", to: "frank", brief: "the give piece" }),
    row({ number: 5, at: "2026-11-11T03:01:00Z", how: "hand", from: "marco", to: "frank" }),
  ];
  const l = linesOf("marco", rows);
  assert.deepEqual(l.map((x) => [x.issue, x.kind]), [[5, "took"], [4, "theirs"], [2, "sent"]]);
  assert.equal(l[0].text, "frank took #5");
  assert.equal(l[1].text, "frank gave #4 to isaac");
  assert.equal(l[1].quiet, true);
  assert.equal(l[2].text, "#2 went to frank: the give piece");
  assert.deepEqual(l.map(canPullBack), [false, false, true], "only my own untaken hand can be pulled back");
});

test("pulled back: my line says so, the receiver's is quiet; at most LINES lines, newest first", () => {
  const rows = [row({ number: 2, at: "2026-11-11T03:09:00Z", how: "back", from: "marco", to: "frank" }), row({ number: 2, from: "marco", to: "frank" })];
  assert.equal(linesOf("marco", rows)[0].text, "you pulled #2 back from frank");
  assert.equal(linesOf("frank", rows)[0].text, "marco pulled #2 back");
  assert.equal(linesOf("frank", rows)[0].quiet, true);
  const many = Array.from({ length: 12 }, (_, i) => row({ number: i + 1, at: `2026-11-11T03:${String(10 + i).padStart(2, "0")}:00Z` }));
  const l = linesOf("marco", many);
  assert.equal(l.length, LINES);
  assert.equal(l[0].issue, 12);
});

test("whose window: the leads of the issue's area first, then the others, never me", () => {
  const board = { repos: [R], leads: { [R]: { work: ["frank"], product: ["isaac", "marco"] } } };
  const card = { repo: R, labels: ["work"] };
  assert.deepEqual(whoFor(card, board, ["marco", "frank", "isaac"], "marco"), [{ login: "frank", leads: "work" }, { login: "isaac" }]);
  assert.deepEqual(whoFor({ repo: R, labels: ["product"] }, board, ["marco", "frank", "isaac"], "Marco"), [{ login: "isaac", leads: "product" }, { login: "frank" }]);
  assert.deepEqual(whoFor(null, board, ["frank"], "marco"), [{ login: "frank" }]);
});

test("what I can give: my own open issues", () => {
  const c = (n: number, o: Partial<Card> = {}) => ({ repo: R, number: n, title: `t${n}`, state: "open", labels: [], assignees: ["marco"], author: "marco", ...o }) as Card;
  assert.deepEqual(givable([c(1), c(2, { assignees: ["frank"] }), c(3, { state: "closed" }), c(4, { assignees: ["Marco"] })], "marco").map((x) => x.number), [1, 4]);
  assert.equal(initial("frank"), "F");
});
