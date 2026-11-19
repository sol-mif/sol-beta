// The press on any block (#1298, work/blocks.ts asks, work/asks.ts): a block that asks waits; the person's press is
// answered once, keyed by the block; it goes back to who asked (a turn in the composing session, or reach's reply for a
// hand-over or an offer); a block that arrives is placed where the person is; the Room's three layers. A home of its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "sol-press-home-"));
const REPO = mkdtempSync(join(tmpdir(), "sol-press-repo-"));
mkdirSync(join(REPO, ".git"));
const TEAM = join(mkdtempSync(join(tmpdir(), "sol-press-team-")), "team.json");
writeFileSync(TEAM, JSON.stringify({ me: { login: "a", name: "A" }, repos: [] }));
process.env.SOL_HOME = HOME;
process.env.SOL_TEAM = TEAM;
process.env.SOL_TEAM_OFFLINE = "1";

const S = await import("../src/work/blocks.ts");
const P = await import("../src/work/asks.ts");
S.setStageBus(() => {});
S.setStageFinder(async () => ({ cwd: REPO, by: "a's agent" }));
const project = S.projectOf(REPO);
const agent = (sessionId: string) => ({ project, sessionId, by: "a's agent · " + sessionId.slice(0, 8), cwd: REPO });
const person = (sessionId: string) => ({ project, sessionId, by: "a · " + sessionId.slice(0, 8), cwd: REPO });

test("asksOf: yes · no · later by default; a question and two to four short choices, or the reason", () => {
  const a = S.asksOf({ q: "  Merge the gate fix?​ " }, "sess-1", "b1");
  assert.ok(typeof a !== "string");
  assert.deepEqual(a, { q: "Merge the gate fix?", choices: ["yes", "no", "later"], by: "sess-1", ref: { kind: "self", id: "b1" } });
  assert.match(String(S.asksOf({ q: "" }, "s", "b")), /needs q/);
  assert.match(String(S.asksOf({ q: "x", choices: ["one"] }, "s", "b")), /two to four/);
  assert.match(String(S.asksOf({ q: "x", choices: ["a", "b", "c", "d", "e"] }, "s", "b")), /two to four/);
  const h = S.asksOf({ q: "take it?", ref: { kind: "hand", id: "hand-0001" }, from: { login: "b", agent: true }, about: "#12" }, "s", "b") as any;
  assert.deepEqual([h.ref, h.from, h.about], [{ kind: "hand", id: "hand-0001" }, { login: "b", agent: true }, 12]);
  assert.equal((S.asksOf({ q: "x", from: { login: "not a login!" }, ref: { kind: "delete", id: "x" } }, "s", "b1") as any).from, undefined);
  assert.deepEqual((S.asksOf({ q: "x", ref: { kind: "delete", id: "x" } }, "s", "b1") as any).ref, { kind: "self", id: "b1" });
});

test("a block that asks waits, stays waiting through an update, and is answered once: a second press changes nothing", async () => {
  const turns: { sid: string; text: string }[] = [];
  P.setPressDeps({ turn: async (sid, text) => { turns.push({ sid, text }); } });
  const b = S.compose(agent("sess-asker1"), { kind: "table", title: "Two ways to ship", body: JSON.stringify({ columns: ["way"], rows: [["now"]] }), asks: { q: "Ship the first way?" } });
  assert.equal(b.state, "waits");
  assert.equal(b.asks?.by, "sess-asker1");
  assert.equal(S.update(agent("sess-asker1"), { id: b.id, body: JSON.stringify({ columns: ["way"], rows: [["now"], ["later"]] }) }).state, "waits", "it still asks");
  await assert.rejects(P.pressed(person("sess-asker1"), { id: b.id, choice: "maybe" }), /yes · no · later/);

  const one = await P.pressed(person("sess-asker1"), { id: b.id, choice: "yes" });
  assert.equal(one.first, true);
  assert.deepEqual([one.answer?.choice, one.answer?.by], ["yes", "a"]);
  assert.equal(one.block.state, "live");
  const two = await P.pressed(person("sess-other02"), { id: b.id, choice: "no" });
  assert.equal(two.first, false);
  assert.equal(two.answer?.choice, "yes", "the first answer stands");
  assert.equal(turns.length, 1, "one turn, for the first press only");
  assert.equal(turns[0].sid, "sess-asker1");
  assert.match(turns[0].text, /^<the press on artifact [a-z0-9]+>\na pressed yes on "Two ways to ship" \(Ship the first way\?\)\.$/);
  const lines = S.ledger(project, b.id);
  assert.equal(lines.filter((l) => l.ev === "yes").length, 1, "one ledger line for the answer");
  assert.ok(S.ledgerWhole(lines));
});

test("later answers nothing: the block stays waiting, marked later, and is still answered once after", async () => {
  const turns: string[] = [];
  P.setPressDeps({ turn: async (_s, text) => { turns.push(text); } });
  const b = S.compose(agent("sess-asker2"), { kind: "card", title: "The logo", body: "two options", asks: { q: "Pick A?", choices: ["A", "B", "later"] } });
  const l = await P.pressed(person("sess-asker2"), { id: b.id, choice: "later" });
  assert.deepEqual([l.later, l.block.state], [true, "waits"]);
  assert.match(String(l.block.asks?.later), /^\d{4}-\d{2}-\d{2}$/, "later keeps the day it was pressed");
  assert.match(turns[0], /pressed later[\s\S]*Cowork › Room/);
  assert.equal((await P.pressed(person("sess-asker2"), { id: b.id, choice: "later" })).first, false, "a second later says nothing again");
  const a = await P.pressed(person("sess-asker2"), { id: b.id, choice: "B" });
  assert.equal(a.answer?.choice, "B");
  assert.equal(a.block.asks?.later, undefined, "answered, no longer later");
  assert.equal(turns.length, 2);
});

test("routing: a hand-over's press is reach's reply, yes takes it and no declines with who said it; a gone session is said", async () => {
  const replies: [string, boolean, string | undefined][] = [];
  P.setPressDeps({ turn: async () => { throw new Error("no such session"); }, reply: (id, accept, why) => { replies.push([id, accept, why]); return accept ? "taken" : "declined"; } });
  const h = S.compose(agent("sess-asker3"), { kind: "card", title: "b hands you #12", body: "the relay's tail", asks: { q: "Take it?", choices: ["yes", "no"], ref: { kind: "hand", id: "hand-0001" }, from: { login: "b", agent: true }, about: 12 } });
  assert.equal((await P.pressed(person("sess-asker3"), { id: h.id, choice: "yes" })).routed?.to, "relay");
  const o = S.compose(agent("sess-asker3"), { kind: "card", title: "c offers to take #13", body: "", asks: { q: "Let c take it?", ref: { kind: "offer", id: "offer-0001" } } });
  await P.pressed(person("sess-asker3"), { id: o.id, choice: "no" });
  assert.deepEqual(replies, [["hand-0001", true, undefined], ["offer-0001", false, "a said no"]]);

  const s = S.compose(agent("sess-gone00"), { kind: "card", title: "q", body: "", asks: { q: "ok?" } });
  const r = await P.pressed(person("sess-asker3"), { id: s.id, choice: "yes" });
  assert.equal(r.routed?.to, "nowhere");
  assert.match(S.ledger(project, s.id).at(-1)?.note ?? "", /gone[\s\S]*Cowork › Room/);
});

test("quiet: a press on a hand-over or an offer sends no reply, settles here, and the ledger says what was not sent", async () => {
  const replies: string[] = [];
  P.setPressDeps({ turn: async () => {}, reply: (id) => { replies.push(id); return "declined"; } });
  process.env.SOL_QUIET = "1";
  try {
    const h = S.compose(agent("sess-asker5"), { kind: "card", title: "b hands you #14", body: "", asks: { q: "Take it?", choices: ["on it", "later", "not mine"], ref: { kind: "hand", id: "hand-0005" }, from: { login: "b", agent: true }, about: 14 } });
    const r = await P.pressed(person("sess-asker5"), { id: h.id, choice: "not mine" });
    assert.equal(r.routed?.to, "nowhere");
    assert.equal(r.answer?.choice, "not mine", "settled here");
    assert.match(S.ledger(project, h.id).at(-1)?.note ?? "", /^quiet \(SOL_QUIET\): settled here; not sent: the reply to b's agent$/);
    const o = S.compose(agent("sess-asker5"), { kind: "card", title: "c offers to take #15", body: "", asks: { q: "Let c take it?", ref: { kind: "offer", id: "offer-0005" } } });
    assert.match((await P.pressed(person("sess-asker5"), { id: o.id, choice: "yes" })).routed?.said ?? "", /not sent: the reply to the handing agent/);
    assert.deepEqual(replies, [], "nothing went to reach's reply");
  } finally { delete process.env.SOL_QUIET; }
});

test("placeFor: the session whose run names the issue, else the latest turn, else none (the Room)", () => {
  const seats = [{ id: "s1", issue: 12, last: 10 }, { id: "s2", issue: null, last: 30 }, { id: "s3", issue: 13, last: 20, gone: true }];
  assert.equal(P.placeFor(12, seats), "s1");
  assert.equal(P.placeFor(13, seats), "s2", "a gone session is never the place");
  assert.equal(P.placeFor(undefined, seats), "s2");
  assert.equal(P.placeFor(12, []), null);
});

test("the Room's layers: waiting (later first, then oldest), settled folded by issue (none last), the thread", () => {
  const mk = (id: string, at: number, asks: any) => ({ id, kind: "card", title: id, bind: null, state: asks.answer ? "live" : "waits", parent: null, versions: [], sessions: ["s"], at, asks: { q: "?", choices: ["yes", "no"], by: "s", ref: { kind: "self", id }, ...asks }, project: "p" }) as any;
  const r = P.roomRead([
    mk("w1", 1, {}), mk("w2", 2, { later: true }), mk("w3", 0, {}),
    mk("d1", 1, { about: 12, answer: { choice: "yes", by: "a", at: 50 } }), mk("d2", 1, { answer: { choice: "no", by: "a", at: 60 } }),
    mk("d3", 1, { about: 12, answer: { choice: "no", by: "a", at: 70 } }), mk("d4", 1, { about: 13, answer: { choice: "yes", by: "a", at: 40 } }),
    { ...mk("x", 1, {}), state: "dead" },
  ], [{ type: "ask" }], 99);
  assert.deepEqual(r.waiting.map((b) => b.id), ["w2", "w3", "w1"]);
  assert.deepEqual(r.settled.map((g) => [g.issue, g.blocks.map((b) => b.id)]), [[12, ["d3", "d1"]], [13, ["d4"]], [null, ["d2"]]]);
  assert.deepEqual(r.thread, [{ type: "ask" }]);
  assert.equal(r.readAt, 99);
  assert.deepEqual(r.today, { asked: 7, answered: 4, ms: 49 + 59 + 69 + 39 }, "E6: today's presses, read off the blocks");
});

test("later comes back on a later day's first session only: pressed today it stays put; answered or closed it never comes", () => {
  const mk = (id: string, asks: any, state = "waits") => ({ id, kind: "card", title: id, bind: null, state, parent: null, versions: [], sessions: ["s"], at: 1, asks: { q: "?", choices: ["yes", "no", "later"], by: "s", ref: { kind: "self", id }, ...asks } }) as any;
  const back = P.backToday([
    mk("y", { later: "2026-11-15" }), mk("t", { later: "2026-11-16" }), mk("n", {}),
    mk("a", { later: "2026-11-15", answer: { choice: "yes", by: "a", at: 2 } }), mk("d", { later: "2026-11-15" }, "dead"),
  ], "2026-11-16");
  assert.deepEqual(back.map((b) => b.id), ["y"]);
});

test("the agent's own ask is about its session's issue: compose with asks keeps about when it is given", () => {
  const b = S.compose(agent("sess-asker4"), { kind: "card", title: "x", body: "y", asks: { q: "ok?", about: 972 } });
  assert.equal(b.asks?.about, 972);
});
