// next/raise.ts (BR1 quiet canvas, #1615; quiet.html §3): silence by default, the one judgment written as a sentence,
// the floor for stopped work, the outcomes and the bar, kept by ask; and parts/next-raises.ts on the wire. The model is
// always a stub here: what the judgment says is checked by the judged cases (next/fixtures/judged.ts), not by these.
// Invented homes only.
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ACTED_FLOOR, ACTED_MIN, JUDGE_AGAIN_MS, OFFER_MOST, STOPPED_WHY, WEEK_MS, actedOf, candOf, careOf, caresOf, judge, judgePrompt, outcomeLines, outcomesFrom, readJudgment, readRaises, type Cand, type Moment, type Outcome } from "./raise.js";
import part, { actedNow, judgeNow, linesAt, useSay } from "../parts/next-raises.js";
import { noteFixIn, outcomesOf, type FixHow } from "./you-known.js";
import { addNeeds, needsList, useHome, useReaders } from "../parts/next-calls.js";

const NOW = Date.UTC(2026, 10, 22, 15, 0);
const dirs: string[] = [];
const home = () => { const d = mkdtempSync(join(tmpdir(), "sol-raise-")); dirs.push(d); return d; };
const wasEnv = process.env.SOL_UI_NEXT;
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); if (wasEnv === undefined) delete process.env.SOL_UI_NEXT; else process.env.SOL_UI_NEXT = wasEnv; });
beforeEach(() => { process.env.SOL_UI_NEXT = "on"; });

const ask: Cand = { id: "t:1", folder: "Client sites", words: "Photos for cakes and ices, or leave space?", from: "a thing in the folder waits on the person", stopped: false, due: NOW + 5 * 3600e3 };
const perm: Cand = { id: "p:s1:i1", folder: "Invoices", words: "allow run npm test?", from: "a working session asks permission", stopped: true };
const moment = (o: Partial<Moment> = {}): Moment => ({ now: NOW, lines: {}, bar: "usual", ...o });
const said = (id: string, care: boolean, level: string, because: string) => JSON.stringify({ id, care, level, because });

// ---------------------------------------------------------------- rule 1: silence is the default

test("rule 1: no judgment is silence; a judgment that does not care is silence, with its because kept", () => {
  assert.deepEqual(careOf(ask, undefined, "usual"), { level: 0, why: "" });
  assert.deepEqual(careOf(ask, { care: false, level: 0, because: "It can wait until tomorrow." }, "usual"), { level: 0, why: "It can wait until tomorrow." });
  const p = judgePrompt(moment(), [ask]);
  assert.match(p, /Silence is the default/);
  assert.match(p, /"Something happened" is never enough on its own/);
  assert.match(p, /go to the diary, not to a raise/);
});

// ---------------------------------------------------------------- rule 2: one question, one sentence, no score from words

test("rule 2: the one question is asked over the folder's context, and the because is the model's one sentence", () => {
  const p = judgePrompt(moment({ here: "Client sites", lines: { "Client sites": ["You talked to Desserts page (3 min ago)", "You promised the client preview for today"] } }), [ask, perm]);
  assert.match(p, /would this person genuinely care about it, now, in this context\?/);
  assert.match(p, /the person is in Client sites/);
  assert.match(p, /FOLDER Client sites\n  - You talked to Desserts page \(3 min ago\)\n  - You promised the client preview for today\n  ITEM t:1: Photos for cakes/);
  assert.match(p, /ITEM p:s1:i1: allow run npm test\? \(a working session asks permission; work is stopped until they answer\)/);
  assert.match(p, /due in 5 h/);
  const got = readJudgment(`here you go\n${said("t:1", true, "question", "You promised the preview today and it can't go on without this.")}\n${said("p:s1:i1", false, "dot", "It is a routine test run.")}\n{"id":"zz","care":true,"level":"line","because":"not asked"}`, ["t:1", "p:s1:i1"]);
  assert.deepEqual(got, {
    "t:1": { care: true, level: 3, because: "You promised the preview today and it can't go on without this." },
    "p:s1:i1": { care: false, level: 0, because: "It is a routine test run." },
  });
  assert.deepEqual(readJudgment(`{"id":"t:1","care":true,"level":"line"}`, ["t:1"]), {}, "no because, no judgment");
  assert.deepEqual(readJudgment(null, ["t:1"]), {});
});

test("rule 2: the care is the judgment's, never the words': the same judgment over other words is the same care", () => {
  const j = { care: true, level: 2 as const, because: "You asked for it on Friday." };
  for (const words of ["URGENT pay $500 today!!", "a note", "failed check \"build\"", "Can't be undone: delete prod"]) assert.deepEqual(careOf({ ...ask, words }, j, "usual"), { level: 2, why: j.because });
});

test("rule 2: meta designed blind: the prompt's own words name no person, folder or home", () => {
  const fixed = judgePrompt(moment(), []);
  for (const name of ["Marco", "Frank", "Isaac", "Dev", "Denise", "Min-ji", "Tomás", "Lucy", "Client sites", "Invoices", "School", "/Users/"]) assert.ok(!fixed.includes(name), `the prompt names ${name}`);
  const src = readFileSync(new URL("./raise.ts", import.meta.url), "utf8");
  assert.ok(!/\.test\(\s*c\.words|c\.words\.match|words\)\s*\?/.test(src), "no rule reads the ask's words");
});

// ---------------------------------------------------------------- the floor: stopped work is never silent

test("the floor: work stopped on the person is at least a dot, judged or not, and a raised bar never lowers it", () => {
  assert.deepEqual(careOf(perm, undefined, "usual"), { level: 1, why: STOPPED_WHY });
  assert.deepEqual(careOf(perm, { care: false, level: 0, because: "It is routine." }, "usual"), { level: 1, why: "It is routine." });
  assert.deepEqual(careOf(perm, { care: true, level: 3, because: "It holds the invoice run." }, "raised"), { level: 3, why: "It holds the invoice run." });
  assert.equal(candOf({ id: "p:s:i", piece: "s", words: "allow x?", why: "Bash · permission", due: null }).stopped, true, "a permission stops a session");
  assert.equal(candOf({ id: "d:f:s", piece: "f", words: "order it", why: "f · it stopped before the step", due: null, stopped: true }).stopped, true);
  assert.equal(candOf({ id: "t:x", piece: "f", words: "sign it", why: "f", due: null }).stopped, false);
});

// ---------------------------------------------------------------- rule 3: each raise is checked afterwards

test("rule 3: the outcomes are known()'s fix lines for an ask whose how is a raise's: answer, open, later, pass, read through K's outcomesOf", () => {
  const sol = home();
  const write = (how: FixHow, reason: string, place: string, h: number) => assert.equal(noteFixIn(sol, { how, what: `the thing ${reason}`, place, reason }, NOW - h * 3600e3).ok, true);
  write("answer", "ask:t:1", "w:somewhere/sites", 1);
  write("pass", "ask:t:2", "w:somewhere/portfolio", 2);
  write("later", "ask:t:3", "w:somewhere/portfolio", 3);
  write("open", "ask:t:4", "w:somewhere/invoices", 4);
  write("hide", "ask:t:5", "w:somewhere/x", 1);           // not an outcome
  write("later", "movein:b1", "w:somewhere/x", 1);       // answers no ask
  const outs = outcomesFrom(outcomesOf(sol));
  assert.deepEqual(outs.map((o) => [o.how, o.place, o.reason]), [["open", "w:somewhere/invoices", "ask:t:4"], ["later", "w:somewhere/portfolio", "ask:t:3"], ["pass", "w:somewhere/portfolio", "ask:t:2"], ["answer", "w:somewhere/sites", "ask:t:1"]], "oldest first");
  assert.deepEqual(outcomesFrom([{ how: "answer", at: "not a date", place: null, reason: "ask:t:6" }]), [], "a line with no readable time is none");
});

test("rule 3: an offer's Sort them and Leave them are builder T's answer lines and count as acted on; its Undo and a move-in keep are not outcomes", () => {
  const sol = home();
  const write = (how: FixHow, reason: string, now: string | undefined, h: number) => noteFixIn(sol, { how, what: "cli inside shop", place: "w:somewhere/shop", reason, ...(now ? { now } : {}) }, NOW - h * 3600e3);
  write("answer", "ask:o:inside:w:somewhere/shop", "Sort them", 3);
  write("answer", "ask:o:group:w:somewhere/notes", "Leave them", 2);
  write("undo", "ask:o:inside:w:somewhere/shop", undefined, 1);
  write("keep", "movein:b1", undefined, 1);
  const a = actedNow(sol, NOW);
  assert.deepEqual([a.n, a.acted, a.rate], [2, 2, 1]);
});

test("rule 3 through K's helper: outcomes written by noteFixIn are what the meter counts and what the next judgment reads", () => {
  const sol = home(), wasHome = process.env.HOME;
  process.env.HOME = home();
  try {
    const t = NOW - 3600e3;
    const write = (how: "answer" | "open" | "later" | "pass", reason: string) => noteFixIn(sol, { how, what: "the client sites session", place: "w:somewhere/sites", reason, was: "allow run tests?" }, t);
    for (const [how, reason] of [["answer", "ask:p:s1:1"], ["open", "ask:p:s1:2"], ["later", "ask:p:s1:3"], ["pass", "ask:p:s1:4"], ["pass", "ask:p:s1:5"]] as const) assert.equal(write(how, reason).ok, true, `${how} is a fix K's helper takes`);
    assert.equal(noteFixIn(sol, { how: "answer", what: "x", place: "", reason: "ask:p:s1:6" }, t).ok, false, "no place: refused, nothing counted");
    const a = actedNow(sol, NOW);
    assert.deepEqual([a.n, a.acted, a.rate, a.raised], [5, 2, 0.4, true], "two of five acted on: under the floor, the bar rises");
    const lines = linesAt(sol, [{ id: "p:s1:4", folder: "s1", words: "allow run tests?", from: "a working session asks permission", stopped: true }], NOW);
    assert.ok(lines.s1.some((l) => l.startsWith("You passed by this ask: allow run tests?")), "the next judgment reads this ask's own pass");
  } finally { if (wasHome === undefined) delete process.env.HOME; else process.env.HOME = wasHome; }
});

test("rule 3: the next judgment reads the folder's outcome lines and is told to raise less of what was passed by", () => {
  const p = judgePrompt(moment({ lines: { Portfolio: ["You passed by Case study draft: Read it, or leave it? (2 h ago)", "You said later to Case study draft (1 days ago)"] } }), [{ ...ask, id: "t:2", folder: "Portfolio" }]);
  assert.match(p, /You passed by Case study draft/);
  assert.match(p, /what this person passed by or put off, raise less of the same/);
});

test("rule 3: an ask's own outcomes reach its folder by the ask's id, whatever region the face named as their place", () => {
  const outs: Outcome[] = [
    { how: "pass", at: NOW - 2 * 3600e3, place: "w:somewhere/else", reason: "ask:p:s1:7" },
    { how: "later", at: NOW - 864e5, place: "w:somewhere/else", reason: "ask:p:s1:7" },
    { how: "answer", at: NOW - 3600e3, place: "w:somewhere/else", reason: "ask:t:other" },
  ];
  const got = outcomeLines(outs, [{ ...ask, id: "p:s1:7", folder: "s1", words: "allow run tests?" }], NOW);
  assert.deepEqual(got.s1.map((r) => r.line), ["You passed by this ask: allow run tests? (2 h ago)", "You said later to this ask: allow run tests? (24 h ago)"]);
  assert.deepEqual(Object.keys(got), ["s1"], "another ask's outcome stays with that ask");
});

// ---------------------------------------------------------------- rule 4: the floor's meter and the bar

test("rule 4: raises acted on this week; under 70% with enough outcomes the bar rises", () => {
  const o = (how: Outcome["how"], hAgo: number): Outcome => ({ how, at: NOW - hAgo * 3600e3 });
  assert.deepEqual(actedOf([], NOW), { rate: null, n: 0, acted: 0, floor: ACTED_FLOOR, raised: false });
  const seven = [...Array(7)].map((_, i) => o(i % 2 ? "open" : "answer", i + 1)), three = [o("pass", 1), o("later", 2), o("pass", 3)];
  assert.deepEqual(actedOf([...seven, ...three], NOW), { rate: 0.7, n: 10, acted: 7, floor: 0.7, raised: false }, "at the floor: not raised");
  assert.equal(actedOf([...seven.slice(1), ...three, o("pass", 4)], NOW).raised, true, "6 of 10: raised");
  assert.equal(actedOf([o("pass", 1), o("pass", 2)], NOW).raised, false, `under ${ACTED_MIN} outcomes the week tells nothing yet`);
  assert.equal(actedOf([...[...Array(6)].map(() => o("pass", WEEK_MS / 3600e3 + 1)), o("answer", 1)], NOW).rate, 1, "last week's outcomes are not this week's");
});

test("rule 4: a raised bar tells the judgment and says every raise but stopped work one step less", () => {
  assert.match(judgePrompt(moment({ bar: "raised" }), [ask]), /fewer than 70% of raises were acted on, so the bar is higher/);
  assert.doesNotMatch(judgePrompt(moment(), [ask]), /bar is higher/);
  const j = { care: true, level: 3 as const, because: "You promised it today." };
  assert.deepEqual(careOf(ask, j, "raised"), { level: 2, why: j.because });
  assert.deepEqual(careOf(ask, { ...j, level: 1 }, "raised"), { level: 0, why: j.because }, "a dot under a raised bar goes quiet");
});

// ---------------------------------------------------------------- kept by ask: the model is asked once per ask

test("judge: one turn for the new asks, kept by ask; asked again when the words change or after a while; gone asks dropped", async () => {
  const sol = home();
  const asked: string[] = [];
  const say = async (p: string) => { asked.push(p); return [...p.matchAll(/ITEM (\S+):/g)].map((m) => said(m[1], m[1] === "t:1", "question", `Because ${m[1]}.`)).join("\n"); };
  assert.equal(await judge(sol, [ask, perm], moment(), say), true);
  assert.equal(asked.length, 1, "one turn for both");
  assert.deepEqual(caresOf(readRaises(sol), [ask, perm]), { "t:1": { level: 3, why: "Because t:1." }, "p:s1:i1": { level: 1, why: "Because p:s1:i1." } });
  assert.equal(await judge(sol, [ask, perm], moment({ now: NOW + 60e3 }), say), false, "nothing new: nothing asked, nothing changed");
  assert.equal(asked.length, 1);
  await judge(sol, [{ ...ask, words: "Photos now, the client asked again" }, perm], moment({ now: NOW + 120e3 }), say);
  assert.equal(asked.length, 2);
  assert.match(asked[1], /ITEM t:1/);
  assert.doesNotMatch(asked[1], /ITEM p:s1:i1/, "only the changed one");
  await judge(sol, [perm], moment({ now: NOW + JUDGE_AGAIN_MS + 1e6 }), say);
  assert.equal(asked.length, 3, "judged again once its context had time to move");
  assert.deepEqual(Object.keys(readRaises(sol).judged), ["p:s1:i1"], "the answered ask is dropped");
});

test("judge: with no model (a test, a quiet Sol, no answer) stopped work is a dot, the rest silent, and both are asked again next time", async () => {
  const sol = home();
  await judge(sol, [ask, perm], moment(), null);
  assert.deepEqual(caresOf(readRaises(sol), [ask, perm]), { "t:1": { level: 0, why: "" }, "p:s1:i1": { level: 1, why: STOPPED_WHY } });
  let n = 0;
  await judge(sol, [ask, perm], moment({ now: NOW + 1000 }), async () => { n++; return said("t:1", true, "line", "You asked for it."); });
  assert.equal(n, 1, "unjudged asks are asked again");
  assert.deepEqual(caresOf(readRaises(sol), [ask, perm])["t:1"], { level: 2, why: "You asked for it." });
});

// ---------------------------------------------------------------- the wire

test("next.raises answers Sol's own windows at once, judges in the background, and tells the asking window what changed", async () => {
  const sol = home();
  const on = new Map<string, (msg: any, h: any) => unknown>();
  part({ on: (t: string, f: any) => on.set(t, f), atStart: () => {}, route: () => {} } as any);
  const unuse = useHome(() => null);
  const unread = useReaders({ drafts: () => [{ folder: "shop", sticky: "Order", line: "did: ask: order the flour, order.md" }, { folder: "shop", sticky: "Sign", line: "did: draft: the shop sign, sign.md" }] });
  const unsay = useSay(async (p) => [...p.matchAll(/ITEM (\S+):/g)].map((m) => said(m[1], m[1].endsWith("Order"), "question", "You run out of flour on Monday.")).join("\n"));
  try {
    const got: any[] = [], all: any[] = [];
    await on.get("next.raises")!({ type: "next.raises" }, { HOME: sol, fromSol: true, ws: 1, send: (_w: unknown, m: object) => got.push(m), everyone: (m: object) => all.push(m) });
    assert.ok(got.length >= 1);
    assert.deepEqual(got[0].care, { "d:shop:Order": { level: 1, why: STOPPED_WHY }, "d:shop:Sign": { level: 0, why: "" } }, "before the judgment: the floor only");
    assert.equal(got[0].acted.rate, null);
    await judgeNow(sol, [], () => {});   // waits for the background one
    assert.equal(all.length, 0, "a person's raises never go to every window");
    assert.equal(got.length, 2);
    assert.deepEqual(got[1].care, { "d:shop:Order": { level: 3, why: "You run out of flour on Monday." }, "d:shop:Sign": { level: 0, why: "You run out of flour on Monday." } });
    const other: any[] = [];
    await on.get("next.raises")!({ type: "next.raises" }, { HOME: sol, fromSol: false, ws: 2, send: (_w: unknown, m: object) => other.push(m), everyone: () => {} });
    assert.equal(other[0].type, "next.refused");
  } finally { unuse(); unread(); unsay(); }
});

// ---------------------------------------------------------------- an offer (builder T's tidy offers) is one more raise

test("an offer joins the list through addNeeds, is judged like any ask but never stops work nor asks more than a line, and rides on next.raises", async () => {
  const c = candOf({ id: "o:inside:w:somewhere/acme", piece: "w:somewhere/acme", words: "Put api and web inside acme?", why: "as when you moved in", due: null, stopped: true });
  assert.equal(c.stopped, false, "an offer holds nothing up");
  assert.equal(c.most, OFFER_MOST);
  assert.deepEqual(careOf(c, { care: true, level: 3, because: "You just made two folders for acme." }, "usual"), { level: OFFER_MOST, why: "You just made two folders for acme." });
  assert.deepEqual(careOf(c, undefined, "usual"), { level: 0, why: "" }, "not judged yet: silent");

  const sol = home();
  const on = new Map<string, (msg: any, h: any) => unknown>();
  part({ on: (t: string, f: any) => on.set(t, f), atStart: () => {}, route: () => {} } as any);
  const unuse = useHome(() => null), unread = useReaders({ drafts: () => [] });
  const unadd = addNeeds(() => [{ id: "o:inside:w:somewhere/acme", piece: "w:somewhere/acme", words: "Put api and web inside acme?", kind: "code", yes: "Sort them", no: "Leave them", serious: false, due: null, rank: 6.5, why: "as when you moved in", offer: { kind: "inside", to: "w:somewhere/acme", folders: ["w:somewhere/api", "w:somewhere/web"] } }]);
  const unbad = addNeeds(() => { throw new Error("a part that fails gives no offers"); });
  const unsay = useSay(async (p) => [...p.matchAll(/ITEM (\S+):/g)].map((m) => said(m[1], true, "line", "You just made two folders for acme.")).join("\n"));
  try {
    const got: any[] = [];
    await on.get("next.raises")!({ type: "next.raises" }, { HOME: sol, fromSol: true, ws: 1, send: (_w: unknown, m: object) => got.push(m), everyone: () => {} });
    await judgeNow(sol, [], () => {});
    assert.deepEqual(got[0].offers, [{ id: "o:inside:w:somewhere/acme", piece: "w:somewhere/acme", words: "Put api and web inside acme?", why: "as when you moved in", rank: 6.5, yes: "Sort them", no: "Leave them", offer: { kind: "inside", to: "w:somewhere/acme", folders: ["w:somewhere/api", "w:somewhere/web"] } }]);
    assert.deepEqual(got[0].care["o:inside:w:somewhere/acme"], { level: 0, why: "" });
    assert.deepEqual(got[1].care["o:inside:w:somewhere/acme"], { level: 2, why: "You just made two folders for acme." }, "judged: a line");
    assert.equal(got[1].offers.length, 1, "the judged answer carries the offers too");
  } finally { unuse(); unread(); unadd(); unbad(); unsay(); }
});

test("an offer that comes in by two ways (the part's addNeeds and needsList's own call) is listed and raised once", async () => {
  const unuse = useHome(() => null), unread = useReaders({ drafts: () => [] });
  const o = { id: "o:inside:w:somewhere/acme", piece: "w:somewhere/acme", words: "Put api and web inside acme?", kind: "code" as const, serious: false, due: null, rank: 6.5, why: "as when you moved in" };
  const one = addNeeds(() => [o]), two = addNeeds(() => [{ ...o }]);
  try {
    const list = (await needsList(home())) as { id: string }[];
    assert.equal(list.filter((n) => n.id === o.id).length, 1);
  } finally { unuse(); unread(); one(); two(); }
});
