// The folder's agent (agent/): the pure objects (harness.ts), the folder on disk (store.ts), the sources' pure parts,
// the seal, and one whole trigger through Agents with a stand-in turn (no Codex, no browser, no network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { judge, route, open, land, report, parseReport, cardsOf, heldOf, candidates, type Rule, type Trigger } from "../src/agent/harness.ts";
import { parsePolicy, setModeIn, readPolicy, setMode, saveTicket, readTicket, readTickets, appendLedger, readLedger, ledgerMd, saveThread, readThread, newId } from "../src/agent/store.ts";
import { whenOf, dueNow } from "../src/agent/sources/clock.ts";
import { subOf, newFiles, listFiles } from "../src/agent/sources/folder.ts";
import { diff, kindOf, signedOut, walk, type Snapshot } from "../src/agent/sources/blackboard.ts";
import { sealedFor, sealedAt } from "../src/agent/seal.ts";
import { Agents } from "../src/agent/index.ts";
import { promptOf, watchRefusal } from "../src/agent/run.ts";
import { jevBody, makeJev } from "../src/agent/jev.ts";

const POLICY = `# LA245's policy

Some words that are not rules.

- [watch] blackboard: every night at 03:00 read the course; new or changed → "today we do"
- [watch] clock: 19:30 tonight's block from exam/schedule.md
- [watch] clock: 09:40 on a class day (Tue/Thu): the notes and 3 questions for today's class, pinned
- [off, draft] folder: a new file in material/ → read it into brain.md and the bank
- [maybe] clock: not a mode, not a rule
`;
const rules = parsePolicy(POLICY);
const T = (o: Partial<Trigger> = {}): Trigger => ({ id: "g1", at: 1_000, source: "blackboard", kind: "changed", data: {}, thread: "blackboard:_355037_1", ...o });

test("store: policy.md reads one rule per bullet, ids by source and place, rung read unless said", () => {
  assert.deepEqual(rules.map((r) => [r.id, r.source, r.mode, r.rung]), [
    ["blackboard-1", "blackboard", "watch", "read"], ["clock-1", "clock", "watch", "read"], ["clock-2", "clock", "watch", "read"], ["folder-1", "folder", "off", "draft"],
  ]);
  assert.match(rules[0].sentence, /^every night at 03:00/);
});

test("store: a mode is rewritten in its own line only, the rung kept", () => {
  const next = setModeIn(POLICY, "folder-1", "do")!;
  assert.match(next, /^- \[do, draft\] folder: a new file/m);
  assert.equal(next.replace("[do, draft]", "[off, draft]"), POLICY);
  assert.match(setModeIn(POLICY, "clock-2", "off")!, /^- \[off\] clock: 09:40/m);
  assert.equal(setModeIn(POLICY, "clock-9", "do"), null);
});

test("harness: judge takes a rule of the trigger's source, a named rule, and ignores an off one", async () => {
  assert.equal((await judge(T(), rules)).decision, "accept");
  assert.equal((await judge(T({ source: "folder", kind: "new-file" }), rules)).decision, "ignore");   // folder-1 is off
  const named = await judge(T({ source: "clock", data: { rule: "clock-2" } }), rules);
  assert.equal(named.decision === "accept" && named.rule.id, "clock-2");
  assert.equal((await judge(T({ data: { rule: "nope-1" } }), rules)).decision, "ignore");
  assert.deepEqual(candidates(T({ source: "clock" }), rules).map((r) => r.id), ["clock-1", "clock-2"]);
});

test("harness: Jev weighs a trigger that names no rule; below the line it is ignored; no answer falls back", async () => {
  const low = await judge(T(), rules, async () => 0.2);
  assert.equal(low.decision, "ignore");
  const high = await judge(T({ source: "clock" }), rules, async ({ rule }) => (rule.id === "clock-2" ? 0.8 : 0.5));
  assert.equal(high.decision === "accept" && high.rule.id, "clock-2");
  assert.equal((await judge(T(), rules, async () => null)).decision, "accept");
  assert.equal((await judge(T({ kind: "needs-sign-in" }), rules, async () => 0)).decision, "accept");   // a sign-in always needs him
  // a source names its rule; Jev still weighs what it saw, unless he asked for the run
  assert.equal((await judge(T({ data: { rule: "blackboard-1" } }), rules, async () => 0.1)).decision, "ignore");
  assert.equal((await judge(T({ data: { rule: "blackboard-1" } }), rules, async () => 0.9)).decision, "accept");
  assert.equal((await judge(T({ data: { rule: "blackboard-1", asked: true } }), rules, async () => 0.1)).decision, "accept");
});

test("harness: a ticket opens, a trigger on a thread it follows lands on it, an ended one takes none", () => {
  const t = open({ id: "t-20261109-aaaa", folder: "la245", rule: rules[0], trigger: T(), policyVersion: "v1" });
  assert.equal(t.state, "open");
  assert.deepEqual(t.subscriptions, ["ticket:t-20261109-aaaa", "blackboard:_355037_1"]);
  assert.deepEqual(t.mandate, { rung: "read", mode: "watch", policyVersion: "v1" });
  assert.equal(route(T({ id: "g2" }), [t])?.id, t.id);
  assert.equal(route(T({ thread: "ticket:t-20261109-aaaa", kind: "answer" }), [t])?.id, t.id);
  assert.equal(route(T({ thread: "blackboard:other" }), [t]), null);
  assert.equal(route(T(), [{ ...t, state: "ended" }]), null);
  assert.equal(land(t, T({ id: "g2" })).triggers.length, 2);
});

test("harness: report moves the ticket; watch mode marks the card wouldHave", () => {
  const t = open({ id: "t-20261109-bbbb", folder: "la245", rule: rules[0], trigger: T(), policyVersion: "v1" });
  const card = { title: "Today we do", line: "Chapter 11 quiz, closes Fri", choices: ["looks right", "not now"] };
  const r = report(t, { report: "ready", card, at: 2_000, trigger: "g1", said: "made today.md" });
  assert.equal(r.state, "waiting");
  assert.deepEqual(r.needs, { ...card, ticketId: t.id, wouldHave: true });
  assert.equal(heldOf(r), 'would have shown "Today we do"');
  assert.equal(cardsOf([r]).length, 1);
  assert.equal(report(t, { report: "ready", at: 2_000, trigger: "g1" }).state, "ended");
  assert.equal(report(t, { report: "failed", at: 2_000, trigger: "g1" }).state, "open");
  assert.equal(report(t, { report: "blocked", card, at: 2_000, trigger: "g1" }).state, "waiting");
  const doMode = { ...t, mandate: { ...t.mandate, mode: "do" as const } };
  assert.equal(report(doMode, { report: "waiting", card, at: 1, trigger: "g1" }).needs?.wouldHave, undefined);
  // the answer lands: open again, the card gone
  const back = land(r, T({ kind: "answer", source: "you", thread: `ticket:${t.id}` }));
  assert.equal(back.state, "open");
  assert.equal(back.needs, undefined);
});

test("harness: the report line is the last JSON line of the answer", () => {
  assert.deepEqual(parseReport('I read it.\nMade made/notes.md.\n{"report":"ready","card":{"title":"Notes","line":"3 questions","choices":["ok"]}}'),
    { report: "ready", card: { title: "Notes", line: "3 questions", choices: ["ok"] } });
  assert.deepEqual(parseReport('done\n```json\n{"report":"blocked"}\n```'), { report: "blocked" });
  assert.equal(parseReport("no line here"), null);
  assert.equal(parseReport('{"report":"maybe"}'), null);
});

test("store: tickets, the thread, and the ledger live in the folder", () => {
  const dir = mkdtempSync(join(tmpdir(), "sol-agent-store-"));
  writeFileSync(join(dir, "policy.md"), POLICY);
  assert.equal(readPolicy(dir).rules.length, 4);
  assert.ok(setMode(dir, "clock-1", "do"));
  assert.equal(readPolicy(dir).rules[1].mode, "do");
  const id = newId(Date.UTC(2026, 10, 9, 12));
  assert.match(id, /^t-2026110\d-[0-9a-f]{4}$/);
  const t = open({ id, folder: "x", rule: rules[0], trigger: T(), policyVersion: "v" });
  saveTicket(dir, t);
  assert.deepEqual(readTicket(dir, id), t);
  assert.equal(readTickets(dir).length, 1);
  assert.equal(readTicket(dir, "../policy"), null);
  assert.equal(readThread(dir), null);
  saveThread(dir, "th-1");
  assert.equal(readThread(dir), "th-1");
  appendLedger(dir, { at: new Date(2026, 10, 9, 3, 0).getTime(), read: "Blackboard · 12 pages", made: "today.md", held: "nothing", rule: "blackboard-1", ticket: id });
  appendLedger(dir, { at: new Date(2026, 10, 9, 3, 5).getTime(), read: "b", made: "c", held: "d" });
  const md = readFileSync(join(dir, "ledger.md"), "utf8");
  assert.match(md, /- 2026-11-09 03:00 · read: Blackboard - 12 pages · made: today\.md · held: nothing \(blackboard-1, t-/);
  assert.equal(readLedger(dir)[0].read, "b");   // newest first
  assert.equal(ledgerMd({ at: 0, read: "", made: "x", held: "y" }).includes("read: -"), true);
});

test("clock: times, days, the night before class and exam-N", () => {
  assert.deepEqual(whenOf("every night at 03:00 read the course")?.times, [{ h: 3, m: 0 }]);
  assert.deepEqual(whenOf("09:40 on a class day (Tue/Thu)")?.days, [2, 4]);
  assert.deepEqual(whenOf("the night before class: pack")?.days, [1, 3]);
  assert.equal(whenOf("a new file in material/"), null);
  const r: Rule = { id: "clock-2", sentence: "09:40 on a class day (Tue/Thu)", source: "clock", mode: "watch", rung: "read" };
  const tue = new Date(2026, 10, 10, 9, 45), wed = new Date(2026, 10, 11, 9, 45);
  assert.deepEqual(dueNow(r, tue, []), ["clock-2@2026-11-10 09:40"]);
  assert.deepEqual(dueNow(r, tue, ["clock-2@2026-11-10 09:40"]), []);   // once a day
  assert.deepEqual(dueNow(r, wed, []), []);
  assert.deepEqual(dueNow(r, new Date(2026, 10, 10, 11, 0), []), []);   // more than an hour late: not a 09:40 run
  const ex: Rule = { ...r, id: "clock-3", sentence: "19:00 on exam-3 the full mock" };
  assert.deepEqual(dueNow(ex, new Date(2026, 10, 24, 19, 1), [], "2026-11-27"), ["clock-3@2026-11-24 19:00"]);
  assert.deepEqual(dueNow(ex, new Date(2026, 10, 25, 19, 1), [], "2026-11-27"), []);
});

test("folder: the sub-folder a rule names, and what is new", () => {
  assert.equal(subOf("a new file in material/ → read it into brain.md"), "material");
  assert.equal(subOf("a new file → read it"), "");
  assert.deepEqual(newFiles(["a", "b"], ["a", "b", "c"]), ["c"]);
  const dir = mkdtempSync(join(tmpdir(), "sol-agent-folder-"));
  mkdirSync(join(dir, "material", "week"), { recursive: true });
  writeFileSync(join(dir, "material", "a.pdf"), "x");
  writeFileSync(join(dir, "material", ".hidden"), "x");
  writeFileSync(join(dir, "material", "week", "b.md"), "x");
  assert.deepEqual(listFiles(dir, "material"), ["material/a.pdf", "material/week/b.md"]);
});

const snap = (pages: Record<string, string>): Snapshot => ({ course: "c", at: 0, pages: Object.fromEntries(Object.entries(pages).map(([k, h]) => [k, { url: `https://x${k}`, title: k, kind: kindOf(k), hash: h, excerpt: "" }])) });
test("blackboard: the difference between two looks; the first look is a baseline", () => {
  assert.deepEqual(diff(null, snap({ "/a": "1" })), []);
  const d = diff(snap({ "/a": "1", "/b": "2", "/gone": "3" }), snap({ "/a": "1", "/b": "9", "/new/assignment": "4" }));
  assert.deepEqual(d.map((c) => [c.key, c.how]).sort(), [["/b", "changed"], ["/gone", "gone"], ["/new/assignment", "new"]]);
  assert.equal(kindOf("https://learn.bu.edu/ultra/courses/_1/announcements"), "announcement");
  assert.ok(signedOut({ url: "https://shib.bu.edu/idp/profile", text: "Kerberos password" }, "https://learn.bu.edu", "_355037_1"));
  assert.ok(!signedOut({ url: "https://learn.bu.edu/ultra/courses/_355037_1/outline", text: "Course Content _355037_1 Week 9" }, "https://learn.bu.edu", "_355037_1"));
});

test("blackboard: the walk follows the course's own links, two deep", async () => {
  const site: Record<string, { text: string; links: string[] }> = {
    "/ultra/courses/C/outline": { text: "Outline C", links: ["/ultra/courses/C/content/week9", "https://elsewhere.org/x"] },
    "/ultra/courses/C/announcements": { text: "News C", links: [] },
    "/ultra/courses/C/calendar": { text: "Due C", links: [] },
    "/ultra/courses/C/content/week9": { text: "Week 9 C", links: ["/ultra/courses/C/content/week9/assignment1"] },
    "/ultra/courses/C/content/week9/assignment1": { text: "Quiz C 20 pts", links: ["/ultra/courses/C/content/week9/assignment1/deeper"] },
  };
  const read = async (url: string) => { const p = new URL(url).pathname; const s = site[p] ?? { text: "404 not found", links: [] }; return { url, title: p, text: s.text, links: s.links.map((h) => ({ text: h, href: h.startsWith("http") ? h : `https://bb.test${h}` })) }; };
  const got = await walk(read, "https://bb.test", "C");
  assert.equal(got.signedOut, false);
  if (!got.signedOut) assert.deepEqual(Object.keys(got.snapshot.pages).sort(), Object.keys(site).sort());
  const out = await walk(async (url) => ({ url: "https://login.test/", title: "", text: "Sign in", links: [] }), "https://bb.test", "C");
  assert.equal(out.signedOut, true);
});

test("seal: a folder with .agent/ is sealed for a reader outside it", () => {
  const home = mkdtempSync(join(tmpdir(), "sol-agent-seal-"));
  mkdirSync(join(home, "school", "la245", ".agent"), { recursive: true });
  writeFileSync(join(home, "school", "la245", "brain.md"), "x");
  assert.equal(sealedAt(join(home, "school", "la245", "brain.md"), home), join(home, "school", "la245"));
  assert.ok(sealedFor(join(home, "school", "la245", "brain.md"), home, home));
  assert.ok(!sealedFor(join(home, "school", "la245", "brain.md"), join(home, "school", "la245"), home));
  assert.ok(!sealedFor(join(home, "school"), home, home));
});

test("run: watch mode refuses what leaves the folder; the prompt carries the rule, the trigger and the report line", () => {
  assert.ok(watchRefusal("desk_show"));
  assert.ok(watchRefusal("ping"));
  assert.equal(watchRefusal("browser_open"), null);
  const t = open({ id: "t-20261109-cccc", folder: "la245", rule: rules[0], trigger: T({ data: { said: "new file \"Chapter 11 deck\"" } }), policyVersion: "v" });
  const p = promptOf({ folder: "/h/school/la245", rule: rules[0], trigger: t.triggers[0], ticket: t });
  assert.match(p, /rule blackboard-1 \(mode watch, rung read\)/);
  assert.match(p, /Chapter 11 deck/);
  assert.match(p, /Watch mode: everything runs, but nothing leaves this folder/);
  assert.match(p, /\{"report":"ready\|waiting\|blocked"/);
});

test("jev: the question, and no key is no Jev; an answer is read as p", async () => {
  assert.equal(makeJev({ key: null }), null);
  assert.equal(jevBody(rules[0], T()).questions.covers.type, "noul");
  const jev = makeJev({ key: "k", fetch: (async () => new Response(JSON.stringify({ answers: { covers: { noul: 0.83 } } }))) as typeof fetch })!;
  assert.equal(await jev({ rule: rules[0], trigger: T() }), 0.83);
  const bad = makeJev({ key: "k", fetch: (async () => new Response("no", { status: 500 })) as typeof fetch })!;
  assert.equal(await bad({ rule: rules[0], trigger: T() }), null);
});

test("agents: a folder rule run now opens a ticket, the turn's report moves it, the ledger says it, an answer lands on it", async () => {
  const home = mkdtempSync(join(tmpdir(), "sol-agent-home-"));
  const folder = join(home, "school", "la245");
  mkdirSync(join(folder, "material"), { recursive: true });
  writeFileSync(join(folder, "policy.md"), "- [watch] folder: a new file in material/ → read it into brain.md and the bank\n");
  const turns: string[] = [];
  const a = new Agents({
    home, jev: null, now: () => new Date(2026, 10, 9, 20, 0).getTime(),
    turn: async (f, rule, trig) => {
      turns.push(trig.kind);
      if (trig.kind === "answer") return { report: "ready", said: "ok", thread: "th", ms: 1 };
      writeFileSync(join(f, "brain.md"), "read");
      return { report: "ready", card: { title: "Read chapter-11.md", line: "into brain.md, 3 rules for the bank", choices: ["looks right", "redo"] }, said: "read it", thread: "th", ms: 5 };
    },
  });
  assert.deepEqual(a.folders().map((f) => f.name), ["la245"]);
  assert.equal(a.folderOf("la245"), folder);
  assert.equal(a.folderOf("school/la245"), folder);
  assert.equal(a.folderOf("../x"), null);
  // the first look with a file there: run now takes the newest one
  writeFileSync(join(folder, "material", "chapter-11.md"), "Offer and acceptance");
  const r = await a.runRule("la245", "folder-1");
  assert.ok(r.ok && r.ticket, JSON.stringify(r));
  const t = r.ticket!;
  assert.equal(t.state, "waiting");
  assert.equal(t.needs?.wouldHave, true);
  assert.equal(a.view("la245")!.cards.length, 1);
  const led = readLedger(folder);
  assert.match(led[0].read, /new in the folder: material\/chapter-11\.md/);
  assert.equal(led[0].made, "brain.md");
  assert.match(led[0].held, /would have shown "Read chapter-11.md"/);
  assert.ok(existsSync(join(folder, ".agent", "tickets", `${t.id}.json`)));
  // the page shows the card, its choices as buttons, the rule and the ledger
  const html = a.page("la245")!;
  assert.match(html, /Read chapter-11\.md/);
  assert.match(html, /would have shown \(watch\)/);
  assert.match(html, /name="type" value="agent.answer"/);
  assert.match(html, /folder-1/);
  // nothing new: no ticket
  assert.equal((await a.runRule("la245", "folder-1")).ticket, null);
  // the answer lands on the same ticket, which ends
  const ans = await a.answer(t.id, "looks right");
  assert.equal(ans.ticket?.id, t.id);
  assert.equal(ans.ticket?.state, "ended");
  assert.deepEqual(turns, ["new-file", "answer"]);
  // off: run now says so; the rule's line is rewritten
  assert.ok(a.setRule("la245", "folder-1", "off").ok);
  assert.match(readFileSync(join(folder, "policy.md"), "utf8"), /^- \[off\] folder:/);
  assert.equal((await a.runRule("la245", "folder-1")).ok, false);
});
