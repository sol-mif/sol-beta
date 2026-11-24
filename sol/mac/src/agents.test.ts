// node --test src/*.test.ts: Agents mode's face core (#1327, pass 2, agents/model.ts) on the invented homes of
// agents/fixture.ts (a baker with market stalls, a nurse on shifts, a freelance translator, a parent of two, an empty
// home): who stands in front on the floor and the one question each asks, how far an agent goes and what it may reach,
// Home's peek on the sticky ticked done, the offer's tiles and proof; and the wire, through the engine in memory: an
// offer kept with the places ticked, a fix asked then learned, a change rehearsed, scope and how far, each with undo.
// The checks are on the mechanics; every home, place and name in them is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agentsReader, askMeta, asksIn, axisX, cardStatus, causesOf, changedCount, dayRows, emptySol, headingOf, homeCount, idsIn, introOf, joinShades, listOf, meetLine, offersStamp, postureOf, railOf, railWord, rawIn, routinesLine, shelvesRead, siteMark, todayOf } from "./agents/model.ts";
import { asker, withLine, joinQuestion, grouping, LOOK_SIGN_MS, lookSignIn, stepWords, doingOf, firstTicks, howFar, howWords, mayDo, peekOf, placeLine, questionOf, reachWords, restingByHand, saidOf, seenChip, stateWord, tileLine, timesLine, tooShort, typedJob, whenWord, workTitle, workParts, blankLine, type AgentRow } from "./agents/model.ts";
import { HOMES, fakeEngine, fixtureList, fixtureOf, shelvesFor } from "./agents/fixture.ts";
import { buildSwitch, MINE_ON, VERSION_KEY, type SwitchEnv } from "./flag.ts";
import { AGENTS_KEPT, agentsReading, agentsSaidOf } from "./agents/flag.ts";

const NOW = new Date(2026, 10, 16, 21, 30).getTime();
const L = fixtureList(NOW);
const by = (id: string, l = L) => l.agents.find((a) => a.id === id)!;
const iso = (t: number) => new Date(t).toISOString();

// ---- the calm pass (2026-11-17): rules 4 to 7 of the face, on invented homes; each fails when its rule is taken out

const stuckAt = (site: string, folder: string, rule: string, since: number, next?: number) => ({ site, folder, rule, since, ...(next ? { next } : {}) });
const bare = (id: string, extra: Partial<AgentRow> = {}): AgentRow => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), job: "does a thing", turn: 0, part: "shop", state: "resting", rules: [], week: [], ...extra });

// The ranking, the counting and the shelving moved to the engine (sol/engine/src/agent/meta/asks.ts, tested there in
// sol/engine/test/agents-calm-brief.test.ts d and g, and in the engine in memory below). Here: the face draws what came,
// in four postures, the rail, the day line, "X only" and a join's two shades.

test("the heading counts only what blocks (the engine's need); work waiting is a count on its card, Home's", () => {
  const l = fixtureList(NOW);
  const q = asksIn(l);
  assert.equal(q.front?.kind, "signin");
  assert.equal(q.front?.title, "Sign in to 2 sites");
  assert.deepEqual(q.front?.kind === "signin" && q.front.sites.map((s) => [s.site, s.frees]), [["the shop's mail", ["Orders"]], ["the school's site", ["Family"]]]);
  assert.deepEqual(q.then, [], "the baker has nothing else blocked: its card waiting is Home's");
  assert.equal(q.need, 1, "the waiting draft is not counted");
  assert.ok(q.home.some((w) => w.agent === "suppliers"));
  assert.equal(headingOf(q.need), "One needs you");
  assert.equal(headingOf(0), "Nothing needs you");
  assert.equal(headingOf(5), "5 need you");
  assert.equal(by("suppliers", l).state, "needs");
  assert.equal(homeCount(by("suppliers", l)), "1 waiting in Home");
  assert.equal(homeCount(by("reviews", l)), null);
  assert.equal(cardStatus(by("orders", l), NOW), "Waiting on the shop's mail");
  assert.equal(cardStatus(by("reviews", l), NOW), "Working now");
  // an engine that sends no asks: nothing needs you
  assert.equal(asksIn(listOf({ agents: l.agents })).need, 0);
  // the student: one in front, three under "Then", one more
  const s = asksIn(fixtureList(NOW, "student"));
  assert.deepEqual([!!s.front, s.then.length, s.more, s.need], [true, 3, 1, 5]);
  assert.equal(s.front?.kind, "signin");
});

test("four postures: blocked (a sign-in or a question), working, resting, paused by you; waiting work is no block", () => {
  const fix = { fix: "f", place: "p", before: "x", after: "y", q: "Always like this?" };
  assert.equal(postureOf(bare("a", { stucks: [stuckAt("the mail", "x", "r", NOW)] })), "blocked");
  assert.equal(postureOf(bare("a", { asks: [fix] })), "blocked");
  assert.equal(postureOf(bare("a", { state: "working" })), "working");
  assert.equal(postureOf(bare("a", { state: "needs", waits: 2 })), "resting");
  assert.equal(postureOf(bare("a", { state: "off" })), "paused");
  assert.equal(cardStatus(bare("a", { state: "off" }), NOW), "Paused by you");
  assert.equal(cardStatus(bare("a", { asks: [fix] }), NOW), "Waiting on your answer");
});

test("the rail: at most seven agent rows, blocked first, each with a state word; the rest are counted for the floor", () => {
  const xs = [bare("r1"), bare("w1", { state: "working" }), bare("p1", { state: "off" }), bare("b1", { stucks: [stuckAt("s", "x", "r", NOW)] }),
    bare("r2"), bare("r3"), bare("w2", { state: "working" }), bare("r4"), bare("b2", { stucks: [stuckAt("s", "y", "r", NOW)] })];
  const r = railOf(xs);
  assert.equal(r.rows.length, 7);
  assert.equal(r.rest, 2);
  assert.deepEqual(r.rows.map((a) => a.id), ["b1", "b2", "w1", "w2", "r1", "r2", "r3"]);
  assert.deepEqual(r.rows.map(railWord), ["blocked", "blocked", "working", "working", "resting", "resting", "resting"]);
  assert.equal(railOf(xs.slice(0, 3)).rest, 0);
});

test("Today: the runs with an hour on one axis, past before now, live inside an hourly window, next after; held when blocked, paused ones out", () => {
  const at = new Date(2026, 10, 16, 13, 30).getTime();
  const step = (when: string, min: number | null, what: string) => ({ when, at: min, what, folder: "x", rule: "r" });
  const t = todayOf([
    bare("m", { steps: [step("07:00", 420, "morning"), step("15:00", 900, "afternoon"), step("when mail comes", null, "mail")] }),
    bare("h", { state: "working", steps: [step("every hour 07–19", 420, "hourly")] }),
    bare("b", { stucks: [stuckAt("s", "x", "r", NOW)], steps: [step("16:00", 960, "held")] }),
    bare("p", { state: "off", steps: [step("10:00", 600, "paused")] }),
  ], at);
  assert.deepEqual(t.marks.map((m) => [m.id, m.kind, m.held]), [["m", "past", false], ["h", "live", false], ["m", "next", false], ["b", "next", true]]);
  assert.ok(t.now > axisX(420) && t.now < axisX(900));
  // one agent's close steps are one mark; past three lanes, a mark is left out rather than drawn over a name
  const close = todayOf([bare("f", { steps: [step("15:00", 900, "add"), step("16:00", 960, "write"), step("16:10", 970, "attach"), step("16:20", 980, "leave")] })], at);
  assert.deepEqual(close.marks.map((m) => [m.id, m.at]), [["f", 900]]);
  // 16 Nov 2026 is a Monday: a Friday step is not today's, a Monday one is
  const week = todayOf([bare("w", { steps: [step("Friday 15:00", 900, "fri"), step("Monday 09:00", 540, "mon")] })], at);
  assert.deepEqual(week.marks.map((m) => m.what), ["mon"]);
  // a sign-in row's tile: the site's own first letter, never "t" for every "the …"
  assert.deepEqual(["the ward roster", "a club site", "Gmail", "the"].map(siteMark), ["W", "C", "G", "T"]);
  const crowd = todayOf(["a", "b", "c", "d"].map((id) => bare(id, { steps: [step("16:00", 960, id)] })), at);
  assert.equal(crowd.marks.length, 3);
  assert.equal(crowd.lanes, 3);
  assert.equal(new Set(crowd.marks.map((m) => m.lane)).size, 3, "no two on one lane");
});

test("the desk's day: a step every place shares is one row; a step of one place says \"X only\"", () => {
  const a = by("friday-update", fixtureList(NOW, "translator"));
  const rows = dayRows(a);
  assert.equal(rows.length, 4, "three shared steps, one of one place");
  assert.deepEqual(rows.filter((r) => r.only).map((r) => [r.what, r.only]), [["Attach the glossary changes", "Harbor Press"]]);
  assert.equal(dayRows({ steps: a.steps, places: a.places?.slice(0, 1) }).filter((r) => r.only).length, 0, "one place: nothing is \"only\"");
});

test("a join's two shades: a step both places have (the place masked) is shared, the rest is one place's own", () => {
  const [x, y] = joinShades({ names: ["Pine", "Oak"], steps: [["read the Pine mail into notes.md", "the menu into menu.md"], ["read the oak mail into notes.md", "the hours into hours.md"]] });
  assert.deepEqual([x, y], [[true, false], [true, false]]);
});

test("past seven, the engine's shelves are drawn with their agents (nobody lost or twice); seven or fewer, cards; nothing yet, the empty Sol", () => {
  assert.equal(shelvesRead(fixtureList(NOW)), null, "six agents: cards");
  const many = fixtureList(NOW, "many");
  assert.ok(many.agents.length > 7);
  const s = shelvesRead(many)!;
  assert.ok(s.length > 1);
  assert.equal(s.reduce((n, x) => n + x.agents.length, 0), many.agents.length, "nobody lost, nobody twice");
  for (const x of s) assert.equal(x.open, x.agents.some((a) => postureOf(a) === "blocked"), x.part);
  assert.ok(s.some((x) => x.open) && s.some((x) => !x.open));
  assert.match(s.find((x) => !x.open)!.line, /all fine$/);
  assert.equal(emptySol(fixtureList(NOW, "empty")), true);
  assert.equal(emptySol({ ...fixtureList(NOW, "empty"), looking: true }), false, "still grouping: the jelly at work, not the empty Sol");
  assert.equal(emptySol(fixtureList(NOW)), false);
});

test("a shelf with a blocked agent stands its blocked ones first and at most seven cards; the rest are N more", () => {
  const eleven = Array.from({ length: 11 }, (_, i) => bare(`p${i}`, { part: "garden" }));
  eleven[6] = bare("p6", { part: "garden", state: "stuck", stuck: { site: "gate", label: "sign in to the gate" } });
  const wire = shelvesFor([...eleven, bare("k", { part: "kitchen" })])!;
  const s = shelvesRead({ agents: [...eleven, bare("k", { part: "kitchen" })], shelves: wire })!;
  const garden = s.find((x) => x.part === "garden")!;
  assert.equal(garden.agents[0].id, "p6", "the blocked one first");
  assert.equal(garden.shown, 7, "seven stand");
  assert.equal(garden.agents.length - garden.shown, 4, "and 4 more");
  assert.equal(garden.open, true);
  // a wire without `shown` (an older engine): every card stands, as before
  assert.equal(shelvesRead({ agents: eleven, shelves: [{ part: "garden", agents: eleven.map((a) => a.id), blocked: 1, open: true }] })![0].shown, 11);
});

test("its work: a markdown table drawn as one, its rule row dropped; rows that name nothing counted, one quiet line when none is filled", () => {
  const lines = ["Jobs", "| job | client | due |", "|-----|--------|-----|", "| Brochure | Harbor | Nov 21 |", "| - | - | new |", "| Labels | - | Nov 28 |", "Kind regards"];
  const p = workParts(lines);
  assert.deepEqual(p.map((x) => x.k), ["line", "table", "line"]);
  const t = p[1] as Extract<ReturnType<typeof workParts>[number], { k: "table" }>;
  assert.deepEqual(t.head, ["job", "client", "due"]);
  assert.deepEqual(t.rows.map((r) => r.cells), [["Brochure", "Harbor", "Nov 21"], ["Labels", "", "Nov 28"]], "a dash cell is drawn blank");
  assert.deepEqual(t.rows.map((r) => lines[r.i]), ["| Brochure | Harbor | Nov 21 |", "| Labels | - | Nov 28 |"], "a press fixes that very line");
  assert.equal(t.blank, 1);
  assert.equal((p[2] as { i: number }).i, 6);
  const empty = workParts(["| a | b |", "|---|---|", "| - | - |", "| — | x |"]);
  assert.deepEqual(empty, [{ k: "table", head: ["a", "b"], rows: [], blank: 2 }]);
  assert.equal(blankLine(2), "2 rows, none filled in yet");
  assert.equal(blankLine(0), "Nothing in this table yet");
  assert.equal(blankLine(2, 2), "2 more rows not filled in yet", "under filled rows it never says none");
  // plain lines are as they were; a table with no head keeps its first row
  assert.deepEqual(workParts(["Hello", "Kind regards"]).map((x) => x.k), ["line", "line"]);
  assert.deepEqual((workParts(["| x | y |"])[0] as { rows: unknown[] }).rows.length, 1);
});

test("rule 6: Sol's own changes by cause, one line and one undo each; the person's presses one by one", () => {
  const cs = [
    { id: "c1", at: iso(1), kind: "held", agent: "a", line: "A held", undo: {}, undone: false, cause: "sign-in" as const },
    { id: "c2", at: iso(2), kind: "held", agent: "b", line: "B held", undo: {}, undone: false, cause: "sign-in" as const },
    { id: "c3", at: iso(3), kind: "rested", agent: "c", line: "C rested", undo: {}, undone: false, cause: "idle" as const },
    { id: "c4", at: iso(4), kind: "renamed", agent: "a", line: "A is now Z.", undo: {}, undone: false },
    { id: "c5", at: iso(5), kind: "renamed", agent: "b", line: "B is now Y.", undo: {}, undone: false },
  ];
  const g = causesOf(cs);
  assert.equal(g.length, 4);
  const held = g.find((x) => x.cause === "sign-in")!;
  assert.deepEqual(held.ids, ["c1", "c2"]);
  assert.match(held.line, /^Paused 2 at a sign-in/);
  assert.deepEqual(g.filter((x) => !x.cause).map((x) => x.ids), [["c5"], ["c4"]], "newest first, one by one");
  assert.equal(changedCount(cs, 10), 4);
  // an undone change stands apart from its cause's open ones
  const u = causesOf([...cs.slice(0, 1).map((c) => ({ ...c, undone: true })), cs[1]]);
  assert.equal(u.length, 2);
  // with the page's agents, a cause's line names them: never an id, three by name, past three how many more
  const named = causesOf(cs, (id) => ({ a: "Pond Log", b: "Seed Run", c: "Shed List" } as Record<string, string>)[id]);
  assert.match(named.find((x) => x.cause === "sign-in")!.line, /^Paused Pond Log and Seed Run at a sign-in, .*they wake/);
  assert.match(named.find((x) => x.cause === "idle")!.line, /^Rested Shed List with nothing to do; it wakes/);
  const three = causesOf(cs.map((c) => ({ ...c, cause: "sign-in" as const })), (id) => id.toUpperCase());
  assert.match(three.find((x) => x.cause === "sign-in")!.line, /^Paused A, B and C at a sign-in/);
  const five = causesOf(["a", "b", "c", "d", "e"].map((x, i) => ({ ...cs[0], id: `s${i}`, agent: x })), (id) => id.toUpperCase());
  assert.match(five[0].line, /^Paused A, B, C and 2 more at a sign-in, .*they wake/);
  // Agents in use: a drawn place's rule ids and raw markdown, counted
  assert.equal(idsIn("Orders stopped: clock-3 and mail-1, not mail-10 or xmail-1", ["clock-3", "mail-1", "Orders"]), 2);
  assert.equal(idsIn("nothing here", []), 0);
  assert.equal(rawIn(["| - | - | drafted |", "## Jobs", "a **bold** word", "- [ ] a box", "Brochure, spring", "a | b"]), 4);
  assert.match(causesOf([{ ...cs[0], agent: "", cause: "joined" as const }], () => undefined)[0].line, /^A new place joined its agent/, "a routine: no name, no id");
});

test("rule 6: before the first visit the sign-in pauses are one sentence with one undo; after it, none", () => {
  const first = fixtureList(NOW);
  const meet = fixtureOf(NOW, "baker", { meet: true }).list;
  assert.equal(introOf(first), null, "met: no intro");
  const i = introOf(meet)!;
  assert.deepEqual(i.ids, ["c-3"]);
  assert.match(i.line, /^One of them was stuck at a sign-in \(the shop's mail\), so Sol paused it/);
  assert.equal(introOf({ intro: { ids: [], agents: 0, sites: [] } }), null);
  // the wire's list keeps both as it reaches the face: met (no first open again) and the intro
  assert.equal(listOf(first).met, first.met);
  assert.deepEqual(introOf(listOf(meet))?.ids, ["c-3"]);
  assert.equal(routinesLine(meet.folderRules), "2 routines stay in their folders");
  assert.equal(meetLine(6, 8, 2), "Sol read your 2 places: 8 rules, doing 6 jobs. Each job has one agent.");
});

test("rule 6 through the engine in memory: agents.meet ends the first open; one cause's changes undo together", async () => {
  const e = fakeEngine(() => NOW, "baker", { meet: true });
  const w = asker(e.send, e.subscribe);
  const l0 = await w.ask<any>({ type: "agents.list" }, 1000);
  assert.equal(l0.met, undefined);
  assert.deepEqual(l0.intro.ids, ["c-3"]);
  const u = await w.ask<any>({ type: "agents.undo", changeIds: l0.intro.ids }, 1000);
  assert.equal(u.ok, true);
  const l1 = await w.ask<any>({ type: "agents.list" }, 1000);
  assert.deepEqual(l1.agents.find((a: AgentRow) => a.id === "orders").stucks, []);
  await w.ask({ type: "agents.meet" }, 1000);
  const l2 = await w.ask<any>({ type: "agents.list" }, 1000);
  assert.ok(l2.met);
  assert.equal(l2.intro, undefined);
  // a routine signs in by its rule
  const s = await w.ask<any>({ type: "agents.signin", folder: "family", rule: "web-1" }, 1000);
  assert.equal(s.ok, true);
  w.close();
});

test("one question and its one answer: a sign-in for the stuck, the first choice for a card, the desk for a fix's ask", () => {
  const stuck = questionOf(by("orders"))!;
  assert.deepEqual([stuck.yes, stuck.send], ["Sign in", { type: "agents.signin", id: "orders" }]);
  assert.match(stuck.q, /the shop's mail/);
  const card = questionOf(by("suppliers"))!;
  assert.deepEqual([card.q, card.yes, card.send], ["The flour order for Millstone Supply is drafted. Send it?", "Send it", { type: "agent.answer", ticketId: "t-sup-4", choice: "Send it" }]);
  const fix = questionOf({ ...by("bake-list"), asks: [{ fix: "x", place: "shop", before: "Regards", after: "Best", q: "Always like this?" }] })!;
  assert.equal(fix.desk, true);
  assert.match(fix.q, /“Regards” → “Best”/);
  assert.equal(questionOf(by("bake-list")), null);
});

test("an agent in words: the state first, with what it waits on or when it runs next; its jelly's doing", () => {
  assert.equal(stateWord(by("orders"), NOW), "stuck: sign in to the shop's mail");
  assert.match(stateWord(by("reviews"), NOW), /^working since \d\d:\d\d$/);
  assert.equal(stateWord(by("bake-list"), NOW), "next tomorrow 06:00");
  assert.match(stateWord(by("birthdays"), NOW), /^resting: nothing to do · back /);
  assert.equal(stateWord(by("meals"), NOW), "off");
  assert.ok(!restingByHand(by("birthdays")));
  assert.equal(doingOf("working"), "work");
  assert.equal(doingOf("stuck"), "needs");
  assert.equal(doingOf("off"), "rest");
  const at = (d: number, h: number, m = 0) => new Date(2026, 10, 16 + d, h, m).toISOString();
  assert.equal(whenWord(at(1, 7, 30), NOW), "tomorrow 07:30");
  assert.equal(whenWord(at(10, 9), NOW), "Nov 26");
});

test("how far: the step most of its places are at; asks stays asks; reach decides whether it may go to does", () => {
  const T = fixtureList(NOW, "translator");
  const up = by("friday-update", T);
  assert.equal(howFar(up), "drafts");
  assert.equal(howFar({ places: [] }), null);
  assert.equal(howFar(by("suppliers")), "asks");
  assert.equal(howFar({ places: [{ ...up.places![0], trust: "does", first: "drafts" }, up.places![1]] }), "drafts", "a capped first run counts at its cap");
  assert.ok(!mayDo(up), "what goes to clients waits for you");
  assert.ok(mayDo(by("bake-list")));
  assert.match(howWords("looks"), /does nothing/);
  assert.deepEqual(reachWords("drafts"), { it: "gets it ready", you: "send it: what others see waits for you" });
  assert.match(placeLine(up.places![0], NOW), /^drafts · on each date$/);
  assert.match(placeLine({ ...up.places![0], trust: "does", first: "drafts", trigger: { kind: "date", leadDays: 2, hour: 9, learned: "place" } }, NOW), /^drafts first, then does · 2 days before each date$/);
});

test("Home's peek: the open offer noticed on this sticky of this place (an item's place counts for its folder), else none", () => {
  const nurse = fixtureOf(NOW, "nurse"), baker = fixtureOf(NOW, "baker");
  assert.equal(peekOf(nurse.offers, "work", "Ward C rota from Dec 1 → my calendar")?.id, "o-rota", "the ward is an item of the work folder");
  assert.equal(peekOf(baker.offers, "markets/saturday", "Pre-orders → Saturday's bake list")?.id, "o-market");
  assert.equal(peekOf(baker.offers, "markets/saturday", "Ask the hall about a second table"), null, "another sticky");
  assert.equal(peekOf(baker.offers, "markets/wednesday", "Pre-orders → Saturday's bake list"), null, "another place");
  assert.equal(peekOf(null, "work", "x"), null);
  for (const who of HOMES) for (const o of fixtureOf(NOW, who).offers) {
    const place = o.on!.place.split("#")[0], st = fixtureOf(NOW, who).stickies[place];
    assert.ok(st?.items.some((m) => m.done && m.t === o.on!.sticky), `${who}: the sticky the offer peeks on is one the person ticked done`);
  }
});

test("the offer: its proof (the times it saw), its tiles checked where inputs exist, an unsure one asks, unchecked say why", () => {
  const o = fixtureOf(NOW, "baker").offers[0];
  assert.equal(timesLine(o.count), "You did this 3 times");
  assert.equal(timesLine(1), "You did this once");
  assert.match(seenChip(o.seen[0], o.places), /^Saturday market · Nov \d+$/);
  assert.deepEqual(firstTicks(o), { "markets/saturday": true, "markets/wednesday": true, "markets/harbour": false, "markets/winter": false });
  assert.equal(tileLine(o.places[2], o.kind), "no pre-orders here yet");
  assert.equal(tileLine(o.places[3], o.kind), "is Winter fair a market?");
  assert.equal(tileLine(o.places[0], o.kind), "");
});

test("a typed job: under four words a sticky is enough; a run's title says the place and when", () => {
  assert.ok(tooShort("buy milk"));
  assert.deepEqual(typedJob("buy milk"), { ok: false, say: "One step: a sticky is enough. Say what comes in and what it makes." });
  assert.deepEqual(typedJob(" each new invoice into the books "), { ok: true, line: "each new invoice into the books" });
  assert.match(workTitle({ name: "Linden Studio", at: NOW - 3_600_000 }, NOW), /^Linden Studio · today 20:30$/);
});

test("a fix written into the made file: the first line that reads the same, its heading's marks kept; gone, nothing", () => {
  assert.equal(withLine("Hi,\nThis week: 6 h.\nKind regards", "Kind regards", "Best wishes"), "Hi,\nThis week: 6 h.\nBest wishes");
  assert.equal(withLine("# Kind regards\nx", " Kind regards ", "Best"), "# Best\nx");
  assert.equal(withLine("Hi", "Kind regards", "Best"), null);
});

test("the wire: an answer is matched on its rid, a stranger's is not, agents.changed re-asks, a silent engine is null", async () => {
  let heard: ((m: any) => void) | null = null;
  const sent: any[] = [];
  let changed = 0;
  const w = asker((o) => { sent.push(o); }, (f) => { heard = f; return () => { heard = null; }; }, { onChanged: () => changed++ });
  const p = w.ask<any>({ type: "agents.list" }, 500);
  heard!({ type: "agents.list", rid: "someone-else", ok: false });
  heard!({ type: "agents.changed" });
  heard!({ type: "agents.list", rid: sent[0].rid, ok: true, agents: [] });
  assert.deepEqual((await p).agents, []);
  assert.equal(changed, 1);
  assert.equal(await w.ask({ type: "agents.list" }, 20), null);
  w.close();
  assert.deepEqual(saidOf(null, "rest"), { ok: false, line: "rest: the engine did not answer. Nothing changed; try again in a moment." });
});

test("through the engine in memory: an offer kept with the places ticked becomes an agent; undo puts the offer back", async () => {
  const e = fakeEngine(() => NOW, "baker");
  const w = asker(e.send, e.subscribe);
  const [o] = (await w.ask<any>({ type: "agents.offers" }, 1000)).offers;
  assert.equal((await w.ask<any>({ type: "agents.offer", id: o.id, answer: "keep", places: [] }, 1000)).why, "tick at least one place");
  const k = await w.ask<any>({ type: "agents.offer", id: o.id, answer: "keep", places: ["markets/saturday", "markets/harbour"] }, 1000);
  assert.deepEqual(k.agent.places.map((p: any) => p.name), ["Saturday market", "Harbour fair"]);
  assert.match(k.change.line, /Market bake kept, in Saturday market and Harbour fair/);
  assert.deepEqual((await w.ask<any>({ type: "agents.offers" }, 1000)).offers, []);
  const d = await w.ask<any>({ type: "agents.desk", id: k.agent.id }, 1000);
  assert.deepEqual(d.more.map((m: any) => m.name), ["Wednesday market", "Winter fair"], "the unticked places of its kind wait as dashed tiles");
  await w.ask({ type: "agents.undo", changeId: k.change.id }, 1000);
  assert.equal((await w.ask<any>({ type: "agents.offers" }, 1000)).offers.length, 1);
  assert.ok(!e.peek().agents.some((a: AgentRow) => a.id === k.agent.id));
  const later = await w.ask<any>({ type: "agents.offer", id: o.id, answer: "later" }, 1000);
  assert.match(later.change.line, /^Not now/);
  w.close();
});

test("the join ask: two places by name, the floor counts it, each step said in its own place; together and apart undo", async () => {
  const l = fixtureList(NOW, "parent");
  const [j] = l.joins!;
  assert.equal(joinQuestion(j), "One agent for Chess and Swim?");
  assert.equal(stepWords(j.steps[0][0], j.names[0]), "every night 21:00 check the Chess club's site and note anything new in news.md");
  assert.equal(j.steps.length, 2);
  const e = fakeEngine(() => NOW, "parent");
  const w = asker(e.send, e.subscribe);
  const n = (await w.ask<any>({ type: "agents.list" }, 1000)).agents.length;
  const t = await w.ask<any>({ type: "agents.join", id: j.id, answer: "together" }, 1000);
  assert.deepEqual(t.agent.places.map((p: any) => p.name), ["Chess", "Swim"]);
  assert.match(t.change.line, /one agent now, on Chess and Swim\.$/);
  const after = await w.ask<any>({ type: "agents.list" }, 1000);
  assert.deepEqual([after.agents.length, after.joins.length], [n - 1, 0]);
  await w.ask({ type: "agents.undo", changeId: t.change.id }, 1000);
  const back = await w.ask<any>({ type: "agents.list" }, 1000);
  assert.deepEqual([back.agents.length, back.joins.length], [n, 1], "the two and the ask come back");
  const a = await w.ask<any>({ type: "agents.join", id: j.id, answer: "apart" }, 1000);
  assert.match(a.change.line, /stay two agents; Sol won't ask about these two again\.$/);
  assert.deepEqual((await w.ask<any>({ type: "agents.list" }, 1000)).joins, []);
  await w.ask({ type: "agents.undo", changeId: a.change.id }, 1000);
  assert.equal((await w.ask<any>({ type: "agents.list" }, 1000)).joins.length, 1);
  w.close();
});

test("two steps of one place: its own question on the floor and its screen; together joins the routine in, apart is said, the line about Jev is said once", async () => {
  const l = fixtureOf(NOW, "translator", { steps: true }).list;
  const j = l.joins!.find((x) => x.inPlace)!;
  assert.equal(joinQuestion(j), "One agent for these two steps?");
  assert.equal(j.p, null, "the person's own model asked: no score");
  assert.equal(j.agents[1].id, "", "the second step is a routine");
  assert.ok(l.jevNote);
  const e = fakeEngine(() => NOW, "translator", { steps: true });
  const w = asker(e.send, e.subscribe);
  const first = await w.ask<any>({ type: "agents.list" }, 1000);
  const q = asksIn(first).all.find((x: any) => x.kind === "join" && x.join === j.id) as any;
  assert.equal(q.title, "One agent for these two steps?");
  assert.equal(askMeta(q), `two steps in ${j.names[0]}`);
  const n = first.agents.length, r = first.folderRules.length;
  const t = await w.ask<any>({ type: "agents.join", id: j.id, answer: "together" }, 1000);
  assert.match(t.change.line, /is one agent now, doing both steps in /);
  const after = await w.ask<any>({ type: "agents.list" }, 1000);
  assert.deepEqual([after.agents.length, after.folderRules.length], [n, r - 1], "the routine became one of the agent's steps");
  await w.ask({ type: "agents.undo", changeId: t.change.id }, 1000);
  const a = await w.ask<any>({ type: "agents.join", id: j.id, answer: "apart" }, 1000);
  assert.match(a.change.line, /stay apart; Sol won't ask about them again\.$/);
  assert.ok(!(await w.ask<any>({ type: "agents.list" }, 1000)).joins.some((x: any) => x.id === j.id));
  assert.equal((await w.ask<any>({ type: "agents.noted" }, 1000)).ok, true);
  assert.equal((await w.ask<any>({ type: "agents.list" }, 1000)).jevNote, undefined, "seen: gone");
  w.close();
});

test("an older Sol's grouping: one ask with both counts; Regroup gives the home's agents with undo; Keep as is is not asked again", async () => {
  const e = fakeEngine(() => NOW, "translator", { regroup: true });
  const w = asker(e.send, e.subscribe);
  const first = await w.ask<any>({ type: "agents.list" }, 1000);
  const want = fixtureOf(NOW, "translator").list.agents.length;
  const qs = asksIn(first).all.filter((x: any) => x.kind === "regroup") as any[];
  assert.equal(qs.length, 1, "one ask for the one cause");
  assert.equal(qs[0].title, `Sol groups agents better now: ${first.agents.length} → ${want}`);
  assert.ok(first.agents.length > want, "the older grouping has more agents");
  assert.equal(askMeta(qs[0]), "how they are grouped");
  const r = await w.ask<any>({ type: "agents.regroup", answer: "regroup" }, 1000);
  assert.match(r.change.line, /^Sol regrouped your \d+ agents into \d+, one per job; what you set stays as it was\.$/);
  assert.ok(r.change.undo, "What Sol changed can undo it");
  const after = await w.ask<any>({ type: "agents.list" }, 1000);
  assert.equal(after.agents.length, want);
  assert.ok(!asksIn(after).all.some((x: any) => x.kind === "regroup"), "answered: asked no more");
  await w.ask({ type: "agents.undo", changeId: r.change.id }, 1000);
  assert.ok(asksIn(await w.ask<any>({ type: "agents.list" }, 1000)).all.some((x: any) => x.kind === "regroup"), "undone: asked again");
  const k = await w.ask<any>({ type: "agents.regroup", answer: "keep" }, 1000);
  assert.match(k.change.line, /stay as they are; Sol won't ask about grouping them again\.$/);
  const kept = await w.ask<any>({ type: "agents.list" }, 1000);
  assert.equal(kept.agents.length, first.agents.length);
  assert.ok(!asksIn(kept).all.some((x: any) => x.kind === "regroup"));
  w.close();
});

test("through the engine in memory: the first fix asks, just once closes it; the same fix twice is learned, with undo", async () => {
  const e = fakeEngine(() => NOW, "translator");
  const w = asker(e.send, e.subscribe);
  const one = { type: "agents.fix", id: "friday-update", place: "clients/harbor-press", before: "Kind regards", after: "Best wishes" };
  assert.equal((await w.ask<any>(one, 1000)).ask, "Always like this?");
  assert.equal(by("friday-update", e.peek()).asks!.length, 1);
  await w.ask<any>({ ...one, always: false }, 1000);
  assert.equal(by("friday-update", e.peek()).asks!.length, 0, "just once: answered");
  await w.ask<any>({ ...one, place: "clients/linden" }, 1000);
  const two = await w.ask<any>({ ...one, place: "clients/harbor-press", before: "Kind regards", after: "Best wishes" }, 1000);
  assert.ok(two.learned, "the same fix a second time is learned anyway");
  const d = await w.ask<any>({ type: "agents.desk", id: "friday-update" }, 1000);
  assert.ok(d.work.every((r: any) => !r.lines.includes("Kind regards")), "its open work is redone");
  await w.ask({ type: "agents.undo", changeId: two.change.id }, 1000);
  assert.equal(by("friday-update", e.peek()).learned!.length, 0);
  w.close();
});

test("through the engine in memory: a change rehearsed shows before and after and writes nothing; scope and how far undo", async () => {
  const e = fakeEngine(() => NOW, "translator");
  const w = asker(e.send, e.subscribe);
  const r = await w.ask<any>({ type: "agents.change", id: "friday-update", line: "add the hours as a total" }, 1000);
  assert.ok(r.after.startsWith(r.before) && r.after.length > r.before.length);
  assert.equal(by("friday-update", e.peek()).job, "writes each client a short Friday update from your hours and files", "a rehearsal writes nothing");
  assert.match((await w.ask<any>({ type: "agents.trust", id: "friday-update", trust: "does" }, 1000)).why, /drafts at most/);
  const t = await w.ask<any>({ type: "agents.trust", id: "friday-update", trust: "looks" }, 1000);
  assert.equal(howFar(by("friday-update", e.peek())), "looks");
  await w.ask({ type: "agents.undo", changeId: t.change.id }, 1000);
  assert.equal(howFar(by("friday-update", e.peek())), "drafts");
  const add = await w.ask<any>({ type: "agents.scope", id: "friday-update", add: "clients/quill" }, 1000);
  assert.match(add.change.line, /Quill & Co added/);
  const out = await w.ask<any>({ type: "agents.scope", id: "friday-update", remove: "clients/linden" }, 1000);
  assert.match(out.change.line, /taken out.*stays/);
  await w.ask({ type: "agents.undo", changeId: out.change.id }, 1000);
  assert.ok(by("friday-update", e.peek()).places!.some((p) => p.place === "clients/linden"));
  w.close();
  const empty = fakeEngine(() => NOW, "empty");
  const we = asker(empty.send, empty.subscribe);
  assert.deepEqual((await we.ask<any>({ type: "agents.list" }, 1000)).agents, []);
  we.close();
});

test("the switch: agents.mode off untouched in a test's window, on by its storage or link, and no longer on the concept-only list", () => {
  const env = (o: Record<string, string> = {}, search = ""): SwitchEnv => ({ storage: () => ({ getItem: (k) => o[k] ?? null, setItem: (k, v) => { o[k] = v; } }), search: () => search, target: new EventTarget() });
  assert.equal(buildSwitch("agents.mode", env()).get(), false);
  assert.equal(buildSwitch("agents.mode", env({ "agents.mode": "1" })).get(), true);
  assert.equal(buildSwitch("agents.mode", env({}, "?agents.mode=on")).get(), true);
  // #18 (gate one question 2): where its card stands is the engine's to say (agents/flag.ts agentsReading), not this list's
  assert.equal(MINE_ON.has("agents.mode"), false);
});

test("agents.mode reads the engine's reading the way the views do: the link, then storage, then the engine, then what was kept (#18)", () => {
  const kv = (o: Record<string, string> = {}) => ({ getItem: (k: string) => o[k] ?? null });
  assert.equal(agentsSaidOf(null), undefined, "no settings yet");
  assert.equal(agentsSaidOf({ window: null }), undefined, "the engine's first moment");
  assert.equal(agentsSaidOf({ window: { "view.home": true } }), undefined, "an engine that sends no reading for it");
  assert.equal(agentsSaidOf({ window: { "agents.mode": true } }), true);
  assert.equal(agentsSaidOf({ window: { "agents.mode": false } }), false);
  // the engine's word wins over the old concept-only rule both ways
  assert.equal(agentsReading(true, "", kv({ [VERSION_KEY]: "complete" })), true, "complete, the card at complete: on");
  assert.equal(agentsReading(false, "", kv({ [VERSION_KEY]: "concept" })), false, "the person said off by their AI: off");
  // the Settings row (storage) and a link still win over it
  assert.equal(agentsReading(true, "", kv({ "agents.mode": "0" })), false, "off in its row");
  assert.equal(agentsReading(false, "", kv({ "agents.mode": "1" })), true, "on in its row");
  assert.equal(agentsReading(true, "?agents.mode=off", kv({ "agents.mode": "1" })), false, "the link's off for one load");
  assert.equal(agentsReading(false, "?agents.mode=on", kv()), true, "the link's on");
  // before the engine says: what this window kept from it, else the rule before (#1427), so concept is unchanged
  assert.equal(agentsReading(undefined, "", kv({ [AGENTS_KEPT]: "1", [VERSION_KEY]: "complete" })), true, "kept on");
  assert.equal(agentsReading(undefined, "", kv({ [AGENTS_KEPT]: "0", [VERSION_KEY]: "concept" })), false, "kept off");
  assert.equal(agentsReading(undefined, "", kv({ [VERSION_KEY]: "concept" })), true, "concept, nothing said yet: on, as before");
  assert.equal(agentsReading(undefined, "", kv({ [VERSION_KEY]: "complete" })), false, "complete, nothing said yet: off");
  assert.equal(agentsReading(undefined, "", kv()), false, "the version unknown: off");
  assert.equal(agentsReading(undefined, "", null), false);
});

test("once stations.json says complete, a complete Sol's window reads agents.mode on; at concept, as today (#18)", async () => {
  // the engine's own ladder (engine versions.ts onFor) on this table, as settings.ts readings sends it in settings.window
  const V = await import(new URL("../../engine/src/versions.ts", import.meta.url).href);
  const table = JSON.parse(readFileSync(new URL("./stations.json", import.meta.url), "utf8"));
  assert.equal(table["agents.mode"].side, "window");
  const windowIn = (t: unknown, mode: string) => ({ window: { "agents.mode": V.onFor("agents.mode", mode, undefined, V.stationsFrom(t).stages) as boolean } });
  const kv = (o: Record<string, string>) => ({ getItem: (k: string) => o[k] ?? null });
  const complete = kv({ [VERSION_KEY]: "complete" }), concept = kv({ [VERSION_KEY]: "concept" });
  const moved = { ...table, "agents.mode": { ...table["agents.mode"], station: "complete" } };
  assert.equal(agentsReading(agentsSaidOf(windowIn(moved, "complete")), "", complete), true, "complete card, complete Sol: on with no hand");
  assert.equal(agentsReading(agentsSaidOf(windowIn(moved, "concept")), "", concept), true, "complete card, the team's concept: on");
  assert.equal(agentsReading(agentsSaidOf(windowIn(moved, "product")), "", kv({})), false, "complete card, a tester's Sol: off");
  assert.equal(agentsReading(agentsSaidOf(windowIn(moved, "complete")), "", kv({ [VERSION_KEY]: "complete", "agents.mode": "0" })), false, "its row's off still wins");
  const atConcept = { ...table, "agents.mode": { ...table["agents.mode"], station: "concept" } };
  assert.equal(agentsReading(agentsSaidOf(windowIn(atConcept, "concept")), "", concept), true, "concept card, concept Sol: on, as before");
  assert.equal(agentsReading(agentsSaidOf(windowIn(atConcept, "complete")), "", complete), false, "concept card, complete Sol: off, as before");
});

test("Sol still looking: the floor's jelly works only once LOOK_SIGN_MS has passed since the floor drew, never before", () => {
  const drew = 1_000_000;
  assert.equal(lookSignIn(true, drew, drew), LOOK_SIGN_MS, "just drawn: not yet");
  assert.equal(lookSignIn(true, drew, drew + LOOK_SIGN_MS - 1), 1);
  assert.equal(lookSignIn(true, drew, drew + LOOK_SIGN_MS), 0, "past the delay: the sign shows");
  assert.equal(lookSignIn(false, drew, drew + 60_000), null, "the list came back without looking: gone");
  assert.equal(lookSignIn(true, null, drew), null, "the floor has not drawn");
});

test("the first open: looking with no agents yet is the first grouping (the jelly at work), never the empty floor", () => {
  assert.equal(grouping({ looking: true, agents: [] }), true);
  assert.equal(grouping({ looking: false, agents: [] }), false, "a grouping that ended and found nothing: the empty text");
  assert.equal(grouping({ looking: true, agents: [{} as AgentRow] }), false, "agents there: the late look's small sign");
  assert.equal(grouping(null), false, "not read yet");
});

test("the engine in memory's first grouping: looking and no agents, then agents.changed and the agents", async () => {
  const e = fakeEngine(() => NOW, "parent", { first: 60 });
  let heard = 0;
  const w = asker(e.send, e.subscribe, { prefix: "fg", onChanged: () => { heard++; } });
  const l0 = await w.ask<any>({ type: "agents.list" }, 1000);
  assert.deepEqual([l0.ok, l0.looking, l0.agents.length], [true, true, 0]);
  await new Promise((r) => setTimeout(r, 250));
  assert.ok(heard >= 1);
  const l1 = await w.ask<any>({ type: "agents.list" }, 1000);
  assert.ok(l1.agents.length > 0);
  assert.equal(grouping(l1), false);
  w.close();
});

test("the engine in memory says looking, then agents.changed and a list without it", async () => {
  const e = fakeEngine(() => NOW, "parent", { looking: 60 });
  let heard = 0;
  const w = asker(e.send, e.subscribe, { prefix: "lk", onChanged: () => { heard++; } });
  assert.equal((await w.ask<any>({ type: "agents.list" }, 1000)).looking, true);
  await new Promise((r) => setTimeout(r, 250));
  assert.ok(heard >= 1, "agents.changed when the look ends");
  assert.equal((await w.ask<any>({ type: "agents.list" }, 1000)).looking, undefined);
  w.close();
});

test("Agents open ten seconds with nothing changing: a few messages, then none, even from an engine that pushes agents.changed on every offers read (#1429)", { timeout: 15_000 }, async () => {
  const e = fakeEngine(() => NOW, "parent");
  // the engine before the fix: each agents.offers ended in agents.changed to every face
  const subs = new Set<(m: any) => void>();
  const sent: { type: string; at: number }[] = [];
  const t0 = Date.now();
  const wire = {
    send: (o: any) => { sent.push({ type: o.type, at: Date.now() - t0 }); e.send(o); if (o.type === "agents.offers") setTimeout(() => subs.forEach((f) => f({ type: "agents.changed" })), 5); },
    subscribe: (f: (m: any) => void) => { subs.add(f); const off = e.subscribe(f); return () => { subs.delete(f); off(); }; },
  };
  let lists = 0;
  const w = asker(wire.send, wire.subscribe, { prefix: "calm", onChanged: () => void read() });
  const read = agentsReader((o, ms) => w.ask(o, ms), () => { lists++; });
  await read();
  await new Promise((r) => setTimeout(r, 10_000));
  w.close();
  assert.ok(lists >= 2, "the push after the offers was heard: the list read again");
  assert.deepEqual(sent.map((s) => s.type), ["agents.list", "agents.offers", "agents.list"], "the list, its offers once, the list once more on the push; then nothing");
  assert.deepEqual(sent.filter((s) => s.at > 2_000), [], "nothing after the first two seconds");
});

test("the offers are read again only when what is stored changes: offersKey from the engine, else the open count", () => {
  const base = { agents: [], folderRules: [], changes: [] };
  assert.equal(offersStamp(listOf({ ...base, offers: 1, offersKey: "o-1:open:3:3" })), "o-1:open:3:3");
  assert.notEqual(offersStamp(listOf({ ...base, offers: 1, offersKey: "o-1:open:4:4" })), "o-1:open:3:3", "a trace more on the offer: read again");
  assert.equal(offersStamp(listOf({ ...base, offers: 2 })), "n2", "an engine without offersKey: the count");
  assert.equal(offersStamp(listOf({ ...base, offers: 2 })), offersStamp(listOf({ ...base, offers: 2, looking: true })), "a list that only says looking: not read again");
});
