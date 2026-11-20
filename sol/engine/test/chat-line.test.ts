// The Agents' room as a group chat (#1417, objective 1 step 11): the @ rule (no @ runs no model and tells nobody; "@b's
// agent" hands a person's line to b's agent alone, as an ask; "@c" pings c and runs no model), an artifact on a line
// (carried in the Discussion's mark or a fenced block, checked before the face opens it), the chat read that merges
// the Discussion's lines with the agents' thread, and the quicker read while the room is open. Logins are a, b, c.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
process.env.SOL_TEAM = join(tmp("sol-team-"), "team.json");
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_STATE = join(tmp("sol-state-"), "work.json");
process.env.SOL_HOME = tmp("sol-home-");
const C = await import("../src/team/chatline.ts");
const talk = await import("../src/team/talk.ts");
const { patchTeam, getTeam } = await import("../src/team/settings.ts");
const { bodyOf, lineOf, due, QUICK_MS, EVERY_MS } = await import("../src/seams/discussions.ts");
const reach = await import("../src/team/reach.ts");

const PEOPLE = ["a", "b", "c"];
patchTeam({ me: { login: "a", name: "A" }, repos: ["o/r"] });

test("the @ rule: who a line names, by @ only, never inside a code fence, never me", () => {
  assert.deepEqual(C.mentionsIn("can a chat line carry an artifact?", PEOPLE, "a"), { agents: [], people: [] }, "no @: nobody");
  assert.deepEqual(C.mentionsIn("b and c, the build is up", PEOPLE, "a"), { agents: [], people: [] }, "a name as a word tells nobody");
  assert.deepEqual(C.mentionsIn("@b's agent can a chat line carry an artifact?", PEOPLE, "a"), { agents: ["b"], people: [] });
  assert.deepEqual(C.mentionsIn("@b’s agent and @c look", PEOPLE, "a"), { agents: ["b"], people: ["c"] }, "a curly apostrophe is one");
  assert.deepEqual(C.mentionsIn("@b @b's agent", PEOPLE, "a"), { agents: ["b"], people: ["b"] }, "the person and the agent are two members");
  assert.deepEqual(C.mentionsIn("@a's agent and @a", PEOPLE, "a"), { agents: [], people: [] }, "never me");
  assert.deepEqual(C.mentionsIn("```\n@b's agent\n```\nnothing", PEOPLE, "a"), { agents: [], people: [] }, "a fence is words");
  assert.deepEqual(C.mentionsIn("mail x@b.io or @bc", PEOPLE, "a"), { agents: [], people: [] }, "an address and a longer login are not b");
});

test("say: no @ runs no model; @b's agent is one ask to b; @c is a ping; an agent's line and a #N line ask nobody", () => {
  talk._talkAt(tmp("sol-talk-"), tmp("sol-home-"));
  const out: Record<string, unknown>[] = [], asked: [string, string, string][] = [];
  talk._talkSend((_k, p = {}) => { out.push(p); return true; });
  talk.setChatLogins(() => PEOPLE);
  talk.setAskAgent((to, q, id) => { asked.push([to, q, id]); return true; });
  const s = getTeam();
  try {
    const none = talk.say("general", "nice", s, false).line;
    assert.equal(asked.length, 0, "no @: no ask, so no model runs");
    assert.equal(none.woke, undefined); assert.equal(none.pinged, undefined);

    const q = talk.say("general", "@b's agent can a chat line carry an artifact?", s, false).line;
    assert.deepEqual(asked, [["b", "@b's agent can a chat line carry an artifact?", q.id]], "one ask, its id the line's");
    assert.deepEqual(q.woke, ["b"]);
    assert.deepEqual(out.at(-1)!.woke, ["b"], "the line carries who read it, so every Sol shows the same rule");

    const p = talk.say("general", "@c one press for you", s, false).line;
    assert.equal(asked.length, 1, "a person @'d: no ask");
    assert.deepEqual(p.pinged, ["c"]);

    talk.say("general", "@b's agent and you?", s, true);
    talk.say("#5", "@b's agent on the issue", s, false);
    assert.equal(asked.length, 1, "an agent never wakes an agent; an issue's line is the wake's (wake.ts)");

    talk.setAskAgent(() => false);
    assert.equal(talk.say("general", "@b's agent are you there?", s, false).line.woke, undefined, "an ask that did not go: nobody read it");
  } finally { talk._talkSend(null); talk.setAskAgent(null); talk.setChatLogins(() => []); }
});

test("an artifact: checked against the group's repositories, its link kept in the words, carried by the mark", async () => {
  const pr = { kind: "pr", ref: "https://github.com/o/r/pull/12", title: "Room.tsx" };
  assert.equal(C.refOk(C.artifactOf(pr)!, ["o/r"]), true);
  assert.equal(C.refOk(C.artifactOf(pr)!, ["o/other"]), false, "another repository's is not opened");
  assert.equal(C.refOk(C.artifactOf({ ...pr, ref: "https://evil.example/o/r/pull/12" })!, ["o/r"]), false);
  assert.equal(C.refOk(C.artifactOf({ kind: "diff", ref: "https://github.com/o/r/pull/12/files", title: "" })!, ["o/r"]), true);
  assert.equal(C.refOk(C.artifactOf({ kind: "file", ref: "https://github.com/o/r/blob/main/README.md", title: "" })!, ["o/r"]), true);
  assert.equal(C.refOk(C.artifactOf({ kind: "block", ref: "card-1", title: "a card" })!, []), true);
  assert.equal(C.artifactOf({ kind: "zip", ref: "x", title: "" }), null);

  const f = C.artifactInText('Yes, under 2 MB.\n```sol-artifact\n{"kind":"pr","ref":"https://github.com/o/r/pull/12","title":"Room.tsx +42 −8"}\n```');
  assert.equal(f.text, "Yes, under 2 MB.");
  assert.deepEqual(f.artifact, { kind: "pr", ref: "https://github.com/o/r/pull/12", title: "Room.tsx +42 −8" });
  assert.deepEqual(C.prInText("up: https://github.com/o/r/pull/7", ["o/r"]), { kind: "pr", ref: "https://github.com/o/r/pull/7", title: "#7" });

  talk._talkAt(tmp("sol-talk-"), tmp("sol-home-"));
  const out: Record<string, unknown>[] = [];
  talk._talkSend((_k, p = {}) => { out.push(p); return true; });
  try {
    const r = await talk.typed("general", "have a look", getTeam(), undefined, null, pr, ["o/r"]);
    assert.ok(r.ok);
    assert.equal(out.at(-1)!.text, "have a look\nRoom.tsx: https://github.com/o/r/pull/12", "an old Sol sees the link");
    assert.deepEqual(out.at(-1)!.artifact, pr);
    const bad = await talk.typed("general", "x", getTeam(), undefined, null, { ...pr, ref: "https://github.com/x/y/pull/1" }, ["o/r"]);
    assert.equal(bad.ok, false);
  } finally { talk._talkSend(null); }

  // the Discussion's mark carries it, and who read the line, with GitHub's page seeing only the words
  const body = bodyOf({ id: "l1", text: "have a look\nhttps://github.com/o/r/pull/12", artifact: pr, woke: ["b"], pinged: ["c"] }, false, "a");
  assert.match(body, /^have a look\nhttps:\/\/github.com\/o\/r\/pull\/12\n<!-- sol-talk /);
  const back = lineOf({ id: 1, login: "a", bot: false, body, created: "2026-11-17T10:00:00Z", association: "MEMBER" }, "general", false)!;
  const l = talk.lineFromRelay(back)!;
  assert.deepEqual(l.artifact, pr); assert.deepEqual(l.woke, ["b"]); assert.deepEqual(l.pinged, ["c"]);
  assert.equal(talk.lineFromRelay({ ...back, woke: ["no such login!"], artifact: { kind: "x" } } as never)!.woke, undefined, "junk is dropped");
});

test("reach: a person's chat line is one ask, its id the line's, never waited on", () => {
  const dir = tmp("reach-chat-"), sent: Record<string, unknown>[] = [];
  reach.startReach({
    me: () => "a", team: () => PEOPLE, send: (p) => { sent.push(p); return true; },
    say: async () => {}, give: () => {}, name: () => {}, working: () => false, lastWords: async () => "", state: async () => "", file: async () => "",
    file_: join(dir, "reach.json"), room: join(dir, "room.md"), home: join(dir, "work"),
  });
  const id = "0b9a7c1e-1111-4222-8333-444455556666";
  assert.equal(reach.askFromChat("b", "@b's agent can a chat line carry an artifact?", id), true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "ask"); assert.equal(sent[0].to, "b"); assert.equal(sent[0].id, id);
  assert.equal(reach.askFromChat("b", "again", id), false, "one ask a line");
  assert.equal(reach.askFromChat("a", "me?", "0b9a7c1e-1111-4222-8333-444455556667"), false, "never my own agent");
});

test("the chat read: the line, its answer under it with its artifact, a refusal under the line it refuses, a settled ask as one line", () => {
  const T = Date.UTC(2026, 10, 17, 10);
  const lines = [
    { id: "q1", from: "a", at: T, text: "@b's agent can a chat line carry an artifact?", woke: ["b"] },
    { id: "q2", from: "c", at: T + 3_000, text: "nice" },
    { id: "q3", from: "a", at: T + 4_000, text: "@c one press for you", pinged: ["c"] },
    { id: "q4", from: "a", at: T + 5_000, text: "@c's agent?", woke: ["c"] },
  ];
  const thread = [
    { type: "ask", id: "q1", from: "a", at: T, to: "b", question: "…" },
    { type: "answer", id: "r1", re: "q1", from: "b", at: T + 2_000, to: "a", text: "Yes, under 2 MB: https://github.com/o/r/pull/12" },
    { type: "refused", id: "r2", re: "q4", from: "c", at: T + 6_000, to: "a", why: "c's agent does not answer asks (turned off in their Sol)" },
  ];
  const settled = [{ id: "blk", title: "Ship it?", issue: 9, answer: { choice: "yes", by: "a", at: T + 7_000 } }];
  const chat = C.chatOf({ lines, thread, settled, repos: ["o/r"] });
  assert.deepEqual(chat.map((l) => l.id), ["q1", "r1", "q2", "q3", "q4", "settled-blk"], "time order; the ask a line made is that line");
  assert.deepEqual(C.ruleWords(chat[0].rule), ["read by b's agent · b's usage"]);
  assert.equal(chat[0].rule.runs, 1);
  assert.deepEqual(chat[1].artifact, { kind: "pr", ref: "https://github.com/o/r/pull/12", title: "#12" });
  assert.equal(chat[1].re, "q1");
  assert.deepEqual(C.ruleWords(chat[2].rule), ["no agent reads this"]);
  assert.equal(chat[2].rule.runs, 0, "the un-@'d line runs no model");
  assert.deepEqual(C.ruleWords(chat[3].rule), ["notifies c · no usage"]);
  assert.equal(chat[3].rule.runs, 0, "an @ to a person runs no model");
  assert.equal(chat[4].rule.runs, 0, "refused: nobody read it");
  assert.match(C.ruleWords(chat[4].rule)[0], /^c's agent did not read it: .* · no usage$/);
  assert.equal(chat[5].text, "#9 · Ship it?: a said yes");

  // a block artifact opens only where a block of that id is on this machine
  const blk = { id: "q9", from: "a", at: T, text: "here", artifact: { kind: "block" as const, ref: "card-1", title: "a card" } };
  assert.equal(C.chatOf({ lines: [blk], thread: [], settled: [], repos: [] })[0].artifact, undefined);
  assert.equal(C.chatOf({ lines: [blk], thread: [], settled: [], repos: [], blocks: { "card-1": "s1" } })[0].artifact?.session, "s1");

  assert.deepEqual(C.membersOf(["c", "b", "a"], "a").map((m) => `${m.login}${m.agent ? "'s agent" : ""}`), ["a", "a's agent", "b", "b's agent", "c", "c's agent"], "n people, 2n members, me first");
});

test("alone at a table (#1677): my line naming my own agent is read by it on my usage; reach never asks it; others' lines are not", () => {
  const T = Date.UTC(2026, 10, 20, 10);
  assert.equal(C.namesOwnAgent("@a's agent what is open?", "a"), true);
  assert.equal(C.namesOwnAgent("@A’s agent look", "a"), true);
  assert.equal(C.namesOwnAgent("@a look", "a"), false, "me as a person is not my agent");
  assert.equal(C.namesOwnAgent("```\n@a's agent\n```", "a"), false, "a code fence names nobody");
  assert.deepEqual(C.mentionsIn("@a's agent look", PEOPLE, "a"), { agents: [], people: [] }, "never asked over reach");
  const lines = [
    { id: "s1", from: "a", at: T, text: "@a's agent what is open?" },
    { id: "s2", from: "b", at: T + 1_000, text: "@a's agent hi" },
    { id: "s3", from: "a's agent", agent: true, at: T + 2_000, text: "@a's agent" },
  ];
  const chat = C.chatOf({ lines, thread: [], settled: [], repos: [], me: "a" });
  assert.deepEqual(C.ruleWords(chat[0].rule), ["read by a's agent · a's usage"]);
  assert.equal(chat[0].rule.runs, 1);
  assert.deepEqual(C.ruleWords(chat[1].rule), ["no agent reads this"], "b's line: b's window opens nothing of mine");
  assert.equal(chat[2].rule.runs, 0, "an agent's line wakes nobody");
  assert.equal(C.chatOf({ lines, thread: [], settled: [], repos: [] })[0].rule.runs, 0, "without me, as before");
  assert.deepEqual(C.membersOf([], "a").map((m) => `${m.login}${m.agent ? "'s agent" : ""}`), ["a", "a's agent"], "alone: me and my agent");
});

test("live: every 10 s while the room is open, every minute otherwise", () => {
  assert.equal(QUICK_MS, 10_000);
  assert.equal(due(10_000, 0, 0), false, "closed: not before a minute");
  assert.equal(due(EVERY_MS, 0, 0), true);
  assert.equal(due(10_000, 0, 30_000), true, "open: every 10 s");
  assert.equal(due(5_000, 0, 30_000), false);
});
