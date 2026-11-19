// Build becomes yours (#1089, build.yours): the record of signals reads made-up sessions the way it reads Claude Code's
// own transcripts, read-only. The same ask in three sessions is one offer whose blanks are what changed; the same ask
// three times in one session is a retry, not a habit; a "no" after the agent's turn, said three times, is a rule; "is it
// done?" is a family of its own; what is not the person typing (tool results, wrappers, summaries, side chains) is
// never an ask; an artifact moved by hand to the same side, or closed, in three sessions is an arrangement offer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "sol-yours-"));
process.env.SOL_HOME = join(dir, "home");
process.env.SOL_YOURS_DIR = join(dir, "projects");
process.env.SOL_STATE = join(dir, "work.json");
process.env.SOL_YOURS_CHUNK = "200";   // every transcript here is read in many small chunks, lines cut across them
process.env.SOL_YOURS_LINE = "4000";   // a line over 4000 bytes is passed over
const y = await import("../src/work/yours.ts");
const blocks = await import("../src/work/blocks.ts");

let t = Date.parse("2026-11-10T09:00:00Z");
const next = () => new Date((t += 60_000)).toISOString();
const you = (sid: string, cwd: string, text: string) => JSON.stringify({ type: "user", sessionId: sid, cwd, timestamp: next(), message: { role: "user", content: text } });
const agent = (sid: string, text = "done") => JSON.stringify({ parentUuid: "x", isSidechain: false, message: { role: "assistant", content: [{ type: "text", text }] }, type: "assistant", sessionId: sid, timestamp: next() });
const toolResult = (sid: string) => JSON.stringify({ parentUuid: "x", isSidechain: false, type: "user", message: { role: "user", content: [{ tool_use_id: "t1", type: "tool_result", content: "You are the reviewer of PR #1 on acme" }] }, sessionId: sid, timestamp: next() });
/** one transcript under a folder of the projects dir */
function session(folder: string, sid: string, lines: string[]) {
  mkdirSync(join(dir, "projects", folder), { recursive: true });
  writeFileSync(join(dir, "projects", folder, `${sid}.jsonl`), lines.join("\n") + "\n");
}
const R = "/work/garden";
const review = (pr: number, slice: string) => `You are the reviewer of PR #${pr} on acme/garden (the spring run of #40, slice ${slice}), in a fresh context. Read-only: you change no file and push nothing. Read the diff with gh pr diff ${pr} and say at most three findings.`;

test("the same ask in three sessions is one offer; what changed between them are its blanks, the template fills them", async () => {
  session("-work-garden", "s1", [you("s1", R, review(23, "p4")), agent("s1")]);
  session("-work-garden", "s2", [you("s2", R, review(17, "q7")), agent("s2")]);
  session("-work-garden", "s3", [you("s3", R, review(31, "r2")), agent("s3")]);
  const asks = await y.readAsks(process.env.SOL_YOURS_DIR, 30, t);
  assert.equal(asks.length, 3);
  const os = y.offers({ asks, stage: [] });
  assert.equal(os.length, 1);
  const o = os[0];
  assert.equal(o.kind, "ask");
  assert.equal(o.count, 3);
  assert.equal(o.sessions, 3);
  assert.equal(o.folder, R);
  const pr = o.blanks.find((b) => b.name === "PR");
  assert.ok(pr, `a PR blank among ${o.blanks.map((b) => b.name)}`);
  assert.deepEqual(pr.values, ["#31", "#17", "#23"]);   // newest first
  const slice = o.blanks.find((b) => b.name === "name");
  assert.deepEqual(slice?.values, ["r2", "q7", "p4"], "a blank is named by its value's kind, never the word before it");
  assert.match(o.template, /^You are the reviewer of PR \{PR\} on acme\/garden \(the spring run of #40, slice \{name\}\)/);
  // a send of the same ask belongs to it; another ask does not
  assert.ok(y.belongs(o, review(52, "t6")));
  assert.ok(!y.belongs(o, "Make the greeting in greet.js friendlier, keep the test green"));
  assert.ok(y.belongs(o, "You are the reviewer of PR #48 on acme/garden (the spring run of #40, slice u8), in a fresh context. Read-only: say ok."), "a shorter wording of the same ask");
  assert.ok(!y.belongs(o, "You are the builder of PR #48: fix the test"), "a few shared words are not the same ask");
  assert.ok(!o.blanks.some((b) => b.values.includes("#40")), "a value the same every time is fixed words, not a blank");
  assert.match(o.sentence, /asked this 3 times, changing only the PR and name/);
  assert.equal(o.examples.length, 3);
  assert.match(o.examples[0], /#31/);
  // the offer's id holds while the group grows
  session("-work-garden", "s4", [you("s4", R, review(44, "s5"))]);
  const again = y.offers({ asks: await y.readAsks(process.env.SOL_YOURS_DIR, 30, t), stage: [] });
  assert.equal(again[0].id, o.id);
  assert.equal(again[0].count, 4);
});

test("the same ask three times in one session is a retry, not a habit; two sessions of it is below the bar", () => {
  const one = [you("r1", R, "Make the greeting in greet.js friendlier, keep the test green"), agent("r1"), you("r1", R, "Make the greeting in greet.js friendlier, keep the test green please"), agent("r1"), you("r1", R, "make the greeting in greet.js friendlier and keep the test green")];
  const asks = y.asksOf(one.join("\n"));
  assert.equal(asks.length, 3);
  assert.equal(y.offers({ asks, stage: [] }).filter((o) => o.kind === "ask").length, 0);
  const two = [...y.asksOf(you("a", R, review(1, "c1"))), ...y.asksOf(you("b", R, review(2, "c2")))];
  assert.equal(y.offers({ asks: two, stage: [] }).length, 0);
});

test("only the person typing is an ask: tool results, wrappers, meta lines, summaries and side chains are not", () => {
  const lines = [
    toolResult("w"),
    JSON.stringify({ type: "user", isMeta: true, sessionId: "w", timestamp: next(), message: { role: "user", content: "a meta line" } }),
    you("w", R, "<command-name>/clear</command-name>"),
    you("w", R, "Caveat: the messages below were generated by the user while running local commands."),
    you("w", R, "This session is being continued from a previous conversation that ran out of context."),
    JSON.stringify({ type: "user", isSidechain: true, sessionId: "w", timestamp: next(), message: { role: "user", content: "a helper's prompt" } }),
    "not json at all",
    you("w", R, "the one real ask"),
  ];
  const asks = y.asksOf(lines.join("\n"));
  assert.deepEqual(asks.map((a) => a.text), ["the one real ask"]);
  assert.equal(asks[0].afterAgent, false);
  // a transcript written with spaces after the colons reads the same
  const spaced = [JSON.stringify(JSON.parse(agent("w")), null, 0).replace(/":/g, '": '), you("w", R, "after the agent").replace(/":/g, '": ')].join("\n");
  assert.deepEqual(y.asksOf(spaced).map((a) => [a.text, a.afterAgent]), [["after the agent", true]]);
});

test("a no after the agent's turn, said the same way three times, is a rule to keep; the same words first in a session are not", () => {
  const fixes = ["no, no bullet lists, write it as plain sentences", "no bullet lists again, plain sentences please", "I said no bullet lists, plain sentences"];
  const asks = fixes.flatMap((f, i) => y.asksOf([you(`f${i}`, R, "write the release note"), agent(`f${i}`, "- one\n- two"), you(`f${i}`, R, f)].join("\n")));
  assert.equal(asks.filter((a) => a.afterAgent).length, 3);
  assert.ok(asks.filter((a) => a.afterAgent).every(y.isCorrection));
  const os = y.offers({ asks, stage: [] });
  const rule = os.find((o) => o.kind === "correction");
  assert.ok(rule, JSON.stringify(os.map((o) => o.kind)));
  assert.equal(rule.count, 3);
  assert.match(rule.sentence, /corrected the agent this way 3 times/);
  assert.match(rule.template, /plain sentences/);
  assert.ok(y.belongs(rule, "no bullet lists, plain sentences", true));
  assert.ok(!y.belongs(rule, "no bullet lists, plain sentences", false), "said first, not after the agent: not a correction");
  // the same words as a first ask are not a correction
  assert.equal(y.isCorrection({ text: "no bullet lists in the note", afterAgent: false }), false);
});

test('"is it done?" is a family of its own, whatever the words around it', () => {
  const qs = ["is it done?", "where is it now", "is it merged yet?", "ok is that landed?"];
  assert.ok(qs.slice(0, 3).every(y.isCheckin));
  const asks = qs.slice(0, 3).flatMap((q, i) => y.asksOf([you(`c${i}`, R, "build the thing"), agent(`c${i}`), you(`c${i}`, R, q)].join("\n")));
  const o = y.offers({ asks, stage: [] }).find((x) => x.kind === "checkin");
  assert.ok(o);
  assert.equal(o.count, 3);
  assert.equal(y.isCheckin("Is it done? Then read the whole of the design note, the plan, the PR and every comment on it before you go on to the next part of the work"), false);
});

test("a project's offers: only the asks made in its folder or under it", () => {
  const asks = [1, 2, 3].flatMap((i) => y.asksOf(you(`p${i}`, i < 3 ? R : "/work/other", review(i, `c${i}`))));
  assert.equal(y.offers({ asks, stage: [], folder: R }).length, 0);
  const sub = [1, 2, 3].flatMap((i) => y.asksOf(you(`q${i}`, `${R}/sol/mac`, review(i, `c${i}`))));
  assert.equal(y.offers({ asks: sub, stage: [], folder: R }).length, 1);
});

test("an old transcript is not read; a changed one is read again", async () => {
  const p = join(dir, "projects", "-work-garden", "s1.jsonl");
  const old = (t - 40 * 86_400_000) / 1000;
  utimesSync(p, old, old);
  assert.ok(!(await y.readAsks(process.env.SOL_YOURS_DIR, 30, t)).some((a) => a.session === "s1"));
  const now = Date.now() / 1000; utimesSync(p, now, now);
  assert.ok((await y.readAsks(process.env.SOL_YOURS_DIR, 30, Date.now())).some((a) => a.session === "s1"));
  assert.ok(statSync(p).size > 0 && readdirSync(join(dir, "projects")).length > 0);
});

test("the stage's own record: the same artifact moved by hand to the right in three sessions, and one closed three times", () => {
  const project = "garden";
  for (const sid of ["st-1", "st-2", "st-3"]) {
    const w = { project, sessionId: sid, by: "you" };
    const d = blocks.compose(w, { kind: "diff", title: "the diff", body: "+a" });
    blocks.layout(project, sid, { blocks: [{ id: d.id, x: 640, y: 12, w: 240, h: 300, z: 1, folded: false, hand: true }] });
    const r = blocks.compose(w, { kind: "list", title: "Runs", body: "[]" });
    blocks.place(w, { id: r.id, close: true });
  }
  // a fourth session where the diff stayed where the agent put it: not the hand's, so not counted
  const w4 = { project, sessionId: "st-4", by: "you" };
  const d4 = blocks.compose(w4, { kind: "diff", title: "the diff", body: "+b" });
  blocks.layout(project, "st-4", { blocks: [{ id: d4.id, x: 12, y: 12, w: 240, h: 300, z: 1, folded: false }] });
  const os = y.stageOffers();
  const arr = os.find((o) => o.kind === "arrangement");
  assert.ok(arr, JSON.stringify(os));
  assert.equal(arr.count, 3);
  assert.deepEqual(arr.target, { title: "the diff", kind: "diff", side: "right" });
  assert.match(arr.sentence, /put the diff on the right in 3 sessions/);
  // a project with no artifact yet is read too: only its sessions' talk was set
  for (const sid of ["np-1", "np-2", "np-3"]) blocks.layout("no-blocks-yet", sid, { talk: { dock: "bottom" } });
  assert.ok(y.stageOffers().some((o) => o.folder === "no-blocks-yet" && o.target?.dock === "bottom"));
  // the look: the talk set the same way by hand in three sessions
  for (const sid of ["st-1", "st-2", "st-3"]) blocks.layout(project, sid, { talk: { dock: "right", width: 0.42 } });
  const look = y.stageOffers().find((o) => o.target?.kind === "talk" && o.folder === project);
  assert.ok(look, "the talk's place is a look to keep");
  assert.match(look.sentence, /set the talk on the right, 40% wide in 3 sessions/);
  const closed = os.find((o) => o.kind === "closed");
  assert.ok(closed);
  assert.equal(closed.count, 3);
  assert.match(closed.sentence, /closed Runs 3 times/);
  assert.equal(y.sideOf(12, 240), "left");
  assert.equal(y.sideOf(330, 240), "middle");
  // a project's offers keep the stage's of that project
  assert.equal(y.offers({ asks: [], folder: "/somewhere/garden" }).filter((o) => o.kind === "arrangement").length, 2, "the diff place and the talk place");
  assert.equal(y.offers({ asks: [], folder: "/somewhere/else" }).length, 0);
});

test("each transcript is read from where the last read stopped: added lines only, a half-written line waits, a file gone is dropped", async () => {
  const { appendFileSync, rmSync } = await import("node:fs");
  const folder = join(dir, "projects", "-work-inc");
  session("-work-inc", "inc", [you("inc", "/work/inc", "the first ask of this one"), agent("inc")]);
  const p = join(folder, "inc.jsonl");
  const now = Date.now();
  const mine = async () => (await y.readAsks(process.env.SOL_YOURS_DIR, 30, now)).filter((a) => a.session === "inc");
  assert.deepEqual((await mine()).map((a) => [a.text, a.afterAgent]), [["the first ask of this one", false]]);
  // a line still being written (no newline yet) waits; the agent spoke last before it, and that is remembered
  const line = you("inc", "/work/inc", "the second ask, after the agent");
  appendFileSync(p, line.slice(0, 30));
  assert.equal((await mine()).length, 1);
  appendFileSync(p, line.slice(30) + "\n");
  assert.deepEqual((await mine()).map((a) => [a.text, a.afterAgent]), [["the first ask of this one", false], ["the second ask, after the agent", true]]);
  // rewritten shorter: read again from the start
  writeFileSync(p, you("inc", "/work/inc", "a new start") + "\n");
  assert.deepEqual((await mine()).map((a) => a.text), ["a new start"]);
  rmSync(folder, { recursive: true });
  assert.equal((await mine()).length, 0, "a file no longer there is dropped");
  // the send path never waits: the asks as last read, at once, and a read in the background
  y._forget();
  assert.deepEqual(y.asksNow(), [], "nothing read yet: the first send finds none");
  assert.ok((await y.scanNow()).length > 0);
  assert.ok(y.asksNow().length > 0);
});

test("only a person's sessions: an agent's runs (claude -p, an orchestrator) are not the person's habit", () => {
  const as = (entrypoint: string | undefined, text: string) => JSON.stringify({ type: "user", sessionId: "e", cwd: R, timestamp: next(), message: { role: "user", content: text }, ...(entrypoint ? { entrypoint } : {}) });
  const asks = y.asksOf([as("cli", "typed in claude code"), as("sdk-ts", "typed in sol"), as("sdk-cli", "a claude -p prompt"), as("sdk-py", "a script"), as(undefined, "an older line")].join("\n"));
  // sdk-cli is read here and judged by the person rule below (Sol's own Build sessions are written as sdk-cli too)
  assert.deepEqual(asks.map((a) => a.text), ["typed in claude code", "typed in sol", "a claude -p prompt", "an older line"]);
});

test("a Sol session counts only when the person had it open, and is no agent's part nor started by another session", async () => {
  const st = await import("../src/work/state.ts");
  const line = (sid: string, text: string) => JSON.stringify({ type: "user", sessionId: sid, cwd: "/work/sol-own", timestamp: new Date(Date.now() - 60_000).toISOString(), entrypoint: "sdk-ts", message: { role: "user", content: text } });
  session("-work-sol-own", "mine-1", [line("mine-1", "an ask the person typed in Sol")]);
  session("-work-sol-own", "exec-1", [line("exec-1", "an executor's prompt Sol started")]);
  session("-work-sol-own", "rev-1", [line("rev-1", "a reviewer's prompt")]);
  session("-work-sol-own", "side-1", [line("side-1", "a side session's prompt")]);
  st.mark("mine-1", { seen: Date.now() });
  st.mark("rev-1", { seen: Date.now(), role: "reviewer" });
  st.mark("side-1", { seen: Date.now(), parent: "mine-1" });
  // the same rule for sdk-cli: Sol's Build session (open in Build) counts; a claude -p run (never open in Build) does not
  const cli = (sid: string, text: string) => JSON.stringify({ type: "user", sessionId: sid, cwd: "/work/sol-own", timestamp: new Date(Date.now() - 30_000).toISOString(), entrypoint: "sdk-cli", message: { role: "user", content: text } });
  session("-work-sol-own", "build-1", [cli("build-1", "an ask typed in Build, written as sdk-cli")]);
  session("-work-sol-own", "p-1", [cli("p-1", "a claude -p prompt")]);
  st.mark("build-1", { seen: Date.now() });
  // opened is not typed: a claude -p run he only opened (seen) does not count
  session("-work-sol-own", "seen-1", [cli("seen-1", "a claude -p prompt he only opened")]);
  st.mark("seen-1", { seen: Date.now() });
  y.setTypedIn((sid) => ["mine-1", "rev-1", "side-1", "build-1"].includes(sid));
  const asks = (await y.readAsks(process.env.SOL_YOURS_DIR, 30, Date.now())).filter((a) => a.cwd === "/work/sol-own");
  assert.deepEqual(asks.map((a) => a.text).sort(), ["an ask the person typed in Sol", "an ask typed in Build, written as sdk-cli"].sort());
  y.setTypedIn(() => false);
});

test("a long folder name before the line's type is still read; a line far over the chunk is read across chunks", () => {
  const long = JSON.stringify({ cwd: "/w/" + "x".repeat(900), type: "user", sessionId: "lg", timestamp: next(), message: { role: "user", content: "after a long folder" } });
  assert.deepEqual(y.asksOf(long).map((a) => a.text), ["after a long folder"]);
});

test("read-only: reading the records writes nothing in the transcripts' folder", async () => {
  const before = readdirSync(join(dir, "projects", "-work-garden")).map((f) => `${f}:${statSync(join(dir, "projects", "-work-garden", f)).mtimeMs}`).sort();
  await y.readAsks(); y.offers();
  const after = readdirSync(join(dir, "projects", "-work-garden")).map((f) => `${f}:${statSync(join(dir, "projects", "-work-garden", f)).mtimeMs}`).sort();
  assert.deepEqual(after, before);
});

test("the reader stays small: a line far too long is passed over for good, a file keeps its newest asks only, a link is not read", async () => {
  y._forget();
  const D = join(dir, "projects", "-work-bounds");
  mkdirSync(D, { recursive: true });
  const huge = JSON.stringify({ type: "user", sessionId: "b1", cwd: R, timestamp: next(), message: { role: "user", content: "pasted " + "z".repeat(9000) } });
  writeFileSync(join(D, "b1.jsonl"), [you("b1", R, "before the long line, an ask of mine"), huge, you("b1", R, "after the long line, an ask of mine")].join("\n") + "\n");
  let asks = (await y.readAsks(process.env.SOL_YOURS_DIR, 30, t)).filter((a) => a.session === "b1");
  assert.deepEqual(asks.map((a) => a.text), ["before the long line, an ask of mine", "after the long line, an ask of mine"], "the asks around it are read");
  appendFileSync(join(D, "b1.jsonl"), you("b1", R, "one more after it") + "\n");
  asks = (await y.readAsks(process.env.SOL_YOURS_DIR, 30, t)).filter((a) => a.session === "b1");
  assert.equal(asks.length, 3, "read on from where it stopped: the long line is not read again");
  // a file with more than PER_FILE asks keeps its newest
  const many = Array.from({ length: y.PER_FILE + 30 }, (_, i) => you("b2", R, `ask number ${i} of a long day`));
  writeFileSync(join(D, "b2.jsonl"), many.join("\n") + "\n");
  asks = (await y.readAsks(process.env.SOL_YOURS_DIR, 30, t)).filter((a) => a.session === "b2");
  assert.equal(asks.length, y.PER_FILE);
  assert.equal(asks.at(-1)?.text, `ask number ${y.PER_FILE + 29} of a long day`);
  // a link into the folder is not followed
  const elsewhere = join(dir, "elsewhere.jsonl");
  writeFileSync(elsewhere, you("b3", R, "a file somewhere else on this machine") + "\n");
  symlinkSync(elsewhere, join(D, "b3.jsonl"));
  asks = (await y.readAsks(process.env.SOL_YOURS_DIR, 30, t)).filter((a) => a.session === "b3");
  assert.equal(asks.length, 0);
});

test("the list opened reads on: an ask appended after the first read is there at once, without a full read again", async () => {
  y._forget();
  const D = join(dir, "projects", "-work-fresh");
  mkdirSync(D, { recursive: true });
  const now = new Date().toISOString();
  const me = (text: string) => JSON.stringify({ type: "user", sessionId: "f1", cwd: "/work/fresh", timestamp: now, message: { role: "user", content: text } });
  writeFileSync(join(D, "f1.jsonl"), me("the first ask of the morning, about the hedges") + "\n");
  await y.scanNow();
  assert.ok(!y.reading(), "the first read is done");
  assert.ok(y.asksNow().some((a) => a.text.startsWith("the first ask")));
  appendFileSync(join(D, "f1.jsonl"), me("the ask sent a minute ago, about the gate") + "\n");
  await y.freshen(10_000);
  assert.ok(!y.asksNow().some((a) => a.text.startsWith("the ask sent a minute ago")), "a read under 10 s old is not read again");
  await y.freshen(0);
  assert.ok(y.asksNow().some((a) => a.text.startsWith("the ask sent a minute ago")), "read on: the new ask is there");
  assert.ok(!y.reading(), "no 'reading 30 days' on a read on");
});
