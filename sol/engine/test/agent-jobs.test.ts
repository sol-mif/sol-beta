// The jobs folder's agent (agent/jobs/): the A/B test, people's states, the applications board, the trip plan, the
// policy's rules, the refusals, and one whole flow through Agents with a stand-in turn (no Codex, no browser, no network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assign, chanceBest, verdict, tally, abWords, interval, meanOf, logGamma } from "../src/agent/jobs/ab.ts";
import { parsePerson, personMd, canMove, move, slugOf, followUpsDue, checkReach, byState, type Person } from "../src/agent/jobs/people.ts";
import { applyTitle, boardMd, parsePosting, postingTitle, setHead, pick, nextOf, type App } from "../src/agent/jobs/applications.ts";
import { planRows, parsePlan, planMd } from "../src/agent/jobs/trip.ts";
import { editOf, editLine, parseVariant, variantMd, startingVariants } from "../src/agent/jobs/outreach.ts";
import { ruleKind, jobsHooks } from "../src/agent/jobs/index.ts";
import { refusalFor } from "../src/agent/jobs/refuse.ts";
import { parsePolicy } from "../src/agent/store.ts";
import { whenOf } from "../src/agent/sources/clock.ts";
import { watchRefusal } from "../src/agent/run.ts";
import { Agents } from "../src/agent/index.ts";
import type { RunOut } from "../src/agent/run.ts";

const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };

test("ab: each new person goes to a variant with the fewest people, at random among those", () => {
  const live = ["a", "b", "c", "d"];
  const counts: Record<string, number> = {};
  const rnd = seq(0.9, 0.1, 0.5, 0.3, 0.7, 0.2);
  for (let i = 0; i < 40; i++) { const v = assign(live, counts, rnd)!; counts[v] = (counts[v] ?? 0) + 1; }
  assert.deepEqual(Object.values(counts), [10, 10, 10, 10]);
  assert.equal(assign(live, { a: 3, b: 2, c: 3, d: 3 }, () => 0.99), "b");
  assert.equal(assign([], {}), null);
  // the pick among the least is the dice's: 0 → the first by name, 0.99 → the last
  assert.equal(assign(["b", "a"], {}, () => 0), "a");
  assert.equal(assign(["b", "a"], {}, () => 0.99), "b");
});

test("ab: the posterior: Beta means, the interval, the chance of being best", () => {
  assert.ok(Math.abs(logGamma(5) - Math.log(24)) < 1e-9);
  assert.equal(meanOf({ sent: 0, replied: 0 }), 0.5);
  assert.equal(meanOf({ sent: 8, replied: 2 }), 0.3);
  const [lo, hi] = interval({ sent: 20, replied: 5 });
  assert.ok(lo > 0.12 && lo < 0.145 && hi > 0.42 && hi < 0.45, `${lo} ${hi}`);   // Beta(6,16): about 0.13 to 0.44
  // two equal variants: a coin toss; four with nothing sent: a quarter each
  const eq = chanceBest([{ variant: "a", sent: 10, replied: 3 }, { variant: "b", sent: 10, replied: 3 }]);
  assert.ok(Math.abs(eq.a - 0.5) < 0.01);
  const none = chanceBest(["a", "b", "c", "d"].map((v) => ({ variant: v, sent: 0, replied: 0 })));
  for (const v of Object.values(none)) assert.ok(Math.abs(v - 0.25) < 0.01);
  // 8/20 against 2/20: P(a > b) is about 0.98 (the exact Beta(9,13) vs Beta(3,19) value)
  const far = chanceBest([{ variant: "a", sent: 20, replied: 8 }, { variant: "b", sent: 20, replied: 2 }]);
  assert.ok(far.a > 0.97 && far.a < 0.995, String(far.a));
  assert.ok(Math.abs(far.a + far.b - 1) < 1e-9);
});

test("ab: no winner below 15 sent each, nor below 90 %; then the winner, and the loser to retire", () => {
  const T = (v: string, sent: number, replied: number) => ({ variant: v, assigned: sent, sent, replied, met: 0 });
  // a huge lead, but b has 14 sent
  const short = verdict([T("a", 30, 15), T("b", 14, 0)]);
  assert.equal(short.winner, null);
  assert.match(short.why, /^no winner yet: b has 14 sent, each needs 15$/);
  // enough sent, a close race
  const close = verdict([T("a", 15, 4), T("b", 15, 3), T("c", 15, 3), T("d", 15, 2)]);
  assert.equal(close.winner, null);
  assert.match(close.why, /^no winner yet: a leads, \d+ % likely the best; a winner needs 90 %$/);
  // a clear winner among four
  const won = verdict([T("a", 20, 10), T("b", 20, 2), T("c", 20, 1), T("d", 20, 3)]);
  assert.equal(won.winner, "a");
  assert.equal(won.loser, "c");
  assert.ok(won.best.a >= 0.9);
  // small numbers: nothing sent at all, one variant alone
  assert.equal(verdict([T("a", 0, 0), T("b", 0, 0)]).winner, null);
  assert.equal(verdict([T("a", 40, 30)]).winner, null);
  assert.equal(verdict([]).winner, null);
  // Beta(3,1) against a flat Beta(1,1): P(a > b) is a's mean, 3/4
  const words = abWords([T("a", 2, 2), T("b", 0, 0)], verdict([T("a", 2, 2), T("b", 0, 0)]));
  assert.equal(words[0], "a: 2 sent, 2 replied (100 %), 0 met; 75 % likely the best.");
  assert.equal(words[1], "b: 0 sent, 0 replied, 0 met; 25 % likely the best.");
  assert.match(words[2], /^No winner yet: a has 2 sent, b has 0 sent, each needs 15\.$/);
});

test("ab: tally counts a reply or a meeting only for a person sent a message", () => {
  const t = tally(["a", "b"], [
    { variant: "a", sent: true, replied: true, met: true }, { variant: "a", sent: true, replied: false, met: false },
    { variant: "a", sent: false, replied: false, met: false, dropped: true }, { variant: "b", sent: false, replied: false, met: false },
  ]);
  assert.deepEqual(t, [{ variant: "a", assigned: 2, sent: 2, replied: 1, met: 1 }, { variant: "b", assigned: 1, sent: 0, replied: 0, met: 0 }]);
});

const FILE = `# Dana Lee

- where: San Francisco
- company: Acme Agents
- role: Staff engineer, agent tooling
- why: She wrote the post on tool-calling evals.
- link: https://acme.example/team
- reach: email dana@acme.example (shown on https://acme.example/team)
- state: found
- variant:

## Touches

- 2026-11-09 found on https://acme.example/team

## His notes
Met her once at a BU talk.
`;

test("people: a file reads and writes back the same; the states go one way", () => {
  const p = parsePerson("dana-lee", FILE);
  assert.equal(p.name, "Dana Lee");
  assert.equal(p.company, "Acme Agents");
  assert.equal(p.state, "found");
  assert.deepEqual(p.touches, ["2026-11-09 found on https://acme.example/team"]);
  assert.match(p.rest, /Met her once/);
  assert.deepEqual(parsePerson("dana-lee", personMd(p)), p);
  assert.equal(slugOf("Zoë O'Neil-Park"), "zoe-o-neil-park");
  assert.ok(canMove("found", "drafted") && canMove("drafted", "sent") && canMove("sent", "met") && canMove("met", "follow-up"));
  assert.ok(!canMove("sent", "drafted") && !canMove("replied", "found") && !canMove("sent", "sent"));
  assert.ok(canMove("found", "dropped") && canMove("drafted", "dropped") && !canMove("sent", "dropped") && !canMove("dropped", "found"));
  const at = Date.parse("2026-11-10T09:00:00");
  const sent = move(move(p, "drafted", at)!, "sent", at)!;
  assert.equal(sent.state, "sent");
  assert.deepEqual(sent.touches.slice(1), ["2026-11-10 drafted", "2026-11-10 sent"]);
  assert.equal(move(sent, "found", at), null);
  assert.equal(parsePerson("x", "# X\n- state: banana\n").state, "found");
  assert.equal(byState([p, sent]).found, 1);
  assert.equal(byState([p, sent]).sent, 1);
});

test("people: a follow-up is due 5 days after sent with no reply, once", () => {
  const p = (touches: string[], state: Person["state"] = "sent"): Person => ({ ...parsePerson("p", FILE), state, touches });
  assert.equal(followUpsDue([p(["2026-11-04 sent"])], "2026-11-09").length, 1);
  assert.equal(followUpsDue([p(["2026-11-05 sent"])], "2026-11-09").length, 0);
  assert.equal(followUpsDue([p(["2026-11-01 sent", "2026-11-06 follow-up drafted"])], "2026-11-09").length, 0);
  assert.equal(followUpsDue([p(["2026-11-01 sent"], "replied")], "2026-11-09").length, 0);
});

test("people: an address stays only with the public page that shows it", () => {
  assert.deepEqual(checkReach("email dana@acme.example (shown on https://acme.example/team) · LinkedIn https://linkedin.com/in/dana"), { reach: "email dana@acme.example (shown on https://acme.example/team) · LinkedIn https://linkedin.com/in/dana", removed: [] });
  assert.deepEqual(checkReach("email dana@acme.example · LinkedIn https://linkedin.com/in/dana"), { reach: "LinkedIn https://linkedin.com/in/dana", removed: ["dana@acme.example"] });
  assert.deepEqual(checkReach("email first.last@acme.example (probably)"), { reach: "(probably)", removed: ["first.last@acme.example"] });
  assert.deepEqual(checkReach("dana@acme.example"), { reach: "none found", removed: ["dana@acme.example"] });
});

const app = (o: Partial<App>): App => ({ slug: "x", company: "Acme", role: "Intern", link: "https://acme.example/jobs/1", seen: "2026-11-09", where: "SF", cover: "no", score: "7", jev: "", state: "found", next: "", files: [], ...o });

test("applications: the board, the head lines, who gets their folder finished", () => {
  const md = boardMd([app({ slug: "a", role: "Infra intern", state: "applied", seen: "2026-11-08" }), app({ slug: "b", role: "Product intern", state: "drafted" }), app({ slug: "c", role: "PM | growth", state: "passed", next: "none: score 3/10 < 6 (no Jev)" })]);
  const rows = md.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| role"));
  assert.deepEqual(rows, [
    "| Product intern | Acme | drafted | 2026-11-09 | open the form, apply yourself, press applied |",
    "| Infra intern | Acme | applied | 2026-11-08 | wait; a follow-up in two weeks |",
    "| PM / growth | Acme | passed | 2026-11-09 | none: score 3/10 < 6 (no Jev) |",
  ]);
  assert.equal(nextOf({ state: "found", next: "" }), "being weighed");
  const p = parsePosting("acme-intern", "# Product engineer intern at Acme Agents\n- link: https://a\n- cover: yes\n- score: 8/10\n\nWe build agents.\n- state: found\n");
  assert.equal(p.role, "Product engineer intern");
  assert.equal(p.company, "Acme Agents");
  assert.equal(p.cover, "yes");
  const t = setHead("# R at C\n- state: found\n\nbody\n", { state: "drafted", jev: "0.81" });
  assert.equal(t, "# R at C\n- jev: 0.81\n- state: drafted\n\nbody\n");
  // Jev decides when it answered; with no Jev the run's score; at most the top 3
  const picked = pick([{ slug: "a", score: 9, jev: 0.2 }, { slug: "b", score: 4, jev: 0.8 }, { slug: "c", score: 7, jev: null }, { slug: "d", score: 5, jev: null }, { slug: "e", score: 8, jev: 0.6 }, { slug: "f", score: 6, jev: 0.55 }], 3);
  assert.deepEqual(picked.take, ["b", "c", "e"]);
  assert.deepEqual(picked.pass.map((x) => x.slug).sort(), ["a", "d", "f"]);
  assert.match(picked.pass.find((x) => x.slug === "f")!.why, /past today's top 3/);
  assert.match(picked.pass.find((x) => x.slug === "a")!.why, /^Jev 0\.20 < 0\.5$/);
});

// the Apply card's title (#1327): a card read "Apply: at" when the run wrote posting.md's head in bold and its heading
// without " at ", so neither role nor company was read. Invented postings, one per case
test("the Apply card reads whole from what is known, never an empty \"at\"", () => {
  const card = (text: string) => applyTitle(parsePosting("p", text), postingTitle(text));
  // the reproduction: the head in Markdown bold, the heading with a dash: both are read now
  assert.equal(card("# Staff Engineer — Northwind\n- **Company:** Northwind Tiles\n- **Role:** Staff engineer\n- **link:** https://northwind.example/jobs/7\n"), "Apply: Staff engineer at Northwind Tiles");
  assert.equal(card("# Posting\n- **company**: Bramble Bakery\n- **role**: Night baker\n"), "Apply: Night baker at Bramble Bakery");
  assert.equal(card("# Line cook at Bramble Bakery\n- link: https://b\n"), "Apply: Line cook at Bramble Bakery", "the heading's \" at \" as before");
  // what was empty before, now: the posting's own title, else the role, else the company, else Apply alone
  assert.equal(card("# Weekend tutor — two evenings\n- link: https://t\n"), "Apply: Weekend tutor — two evenings", "no role, no company: the posting's own title");
  assert.equal(card("- role: Weekend tutor\n"), "Apply: Weekend tutor", "role only");
  assert.equal(card("- company: Larkspur Library\n"), "Apply to Larkspur Library", "company only");
  assert.equal(card("- company:\n- role:\n"), "Apply", "nothing known: no line after it");
  assert.equal(card("# \n- role: \n- company: \n"), "Apply", "an empty heading is not a title");
  for (const t of ["", "- company:\n", "# \n- role: \n- company: \n"]) assert.doesNotMatch(card(t), / at $|: at|^Apply: $/);
});

test("trip: who replied or met gets a row, a day with room, never Thanksgiving; a filled cell is kept", () => {
  const ps = ["a", "b", "c", "d"].map((s, i) => ({ ...parsePerson(s, `# ${s.toUpperCase()}\n`), state: (["replied", "met", "sent", "replied"] as const)[i] }));
  const rows = planRows(ps, []);
  assert.deepEqual(rows.map((r) => [r.slug, r.day, r.state]), [["a", "Sat Nov 28", "replied: to book"], ["b", "Sat Nov 28", "met"], ["d", "Sat Nov 28", "replied: to book"]]);
  const filled = parsePlan(planMd(rows).replace("| [A](../people/a.md) | Sat Nov 28 | - | - |", "| [A](../people/a.md) | Sun Nov 29 | Blue Bottle, Mint Plaza | how they hire |"));
  const again = planRows([...ps, { ...parsePerson("e", "# E\n"), state: "replied" }], filled);
  assert.deepEqual(again.map((r) => [r.slug, r.day, r.where]), [["a", "Sun Nov 29", "Blue Bottle, Mint Plaza"], ["b", "Sat Nov 28", "-"], ["d", "Sat Nov 28", "-"], ["e", "Sat Nov 28", "-"]]);
  assert.ok(!planMd(again).includes("Nov 26 |"));
});

test("outreach: what he cut and added; a variant reads and writes back; the four differ in one thing from a neighbour", () => {
  const e = editOf("Hi Dana, I hope this finds you well. I'm a BU junior building Sol.", "Hi Dana, I'm a BU junior building Sol, one window for your AI.");
  assert.deepEqual(e.removed, ["I hope this finds you well.", "Sol."]);
  assert.deepEqual(e.added, ["Sol, one window for your AI."]);
  assert.deepEqual(e.removed.length + e.added.length > 0, true);
  assert.equal(editLine(editOf("same words", "same  words")), "sent as drafted");
  const vs = startingVariants("2026-11-09");
  assert.equal(vs.length, 4);
  for (const v of vs) assert.deepEqual(parseVariant(v.name, variantMd(v)), v);
  const diff = (a: typeof vs[0], b: typeof vs[0]) => (["opener", "ask", "channel"] as const).filter((k) => a[k] !== b[k] && !(k === "channel" && a.ask !== b.ask));
  assert.deepEqual(diff(vs[0], vs[1]), ["opener"]);
  assert.deepEqual(diff(vs[0], vs[2]), ["ask"]);
  assert.deepEqual(diff(vs[2], vs[3]), ["opener"]);
  for (const v of vs) assert.doesNotMatch(v.ask.replace("never Thanksgiving, Thu Nov 26", ""), /Nov 26/);   // offered only as the day not to meet
});

const POLICY = readFileSync(join(import.meta.dirname, "fixtures", "jobs-policy.md"), "utf8");

test("policy: each jobs rule is known by its words, and the clock reads the right time and days", () => {
  const rules = parsePolicy(POLICY);
  assert.deepEqual(rules.map((r) => [r.id, r.mode, r.rung, ruleKind(r)]), [
    ["clock-1", "watch", "draft", "postings"], ["clock-2", "watch", "draft", "people"], ["people-1", "watch", "draft", "kept"],
    ["clock-3", "watch", "draft", "follow-up"], ["people-2", "watch", "draft", "plan"], ["clock-4", "watch", "read", "lesson"], ["folder-1", "watch", "draft", "resume"],
  ]);
  const w = rules.map((r) => whenOf(r.sentence));
  assert.deepEqual(w.map((x) => x && [x.times.map((t) => `${t.h}:${t.m}`).join(","), x.days]), [["7:30", null], ["8:0", null], null, ["9:0", null], null, ["18:0", [0]], null]);
});

test("refusals: the jobs folder never types into a page, in any mode; other folders as before", () => {
  const jobs = refusalFor("/h/jobs", "do", watchRefusal)!;
  assert.match(jobs("browser_type")!, /refused in the jobs folder/);
  assert.equal(jobs("browser_open"), null);
  assert.equal(jobs("desk_show"), null);
  assert.match(refusalFor("/h/jobs", "watch", watchRefusal)!("desk_show")!, /watch mode/);
  assert.equal(refusalFor("/h/school/la245", "do", watchRefusal), undefined);
  assert.equal(refusalFor("/h/school/la245", "watch", watchRefusal), watchRefusal);
});

// ---- one whole flow, in process: the people rule → card → keep → draft → sent ×N → replied → the plan ----
test("flow: people found → keep → a draft from a variant → sent → replied → the numbers and the plan", { timeout: 30_000 }, async () => {
  const home = mkdtempSync(join(tmpdir(), "sol-jobs-")), folder = join(home, "jobs");
  mkdirSync(join(folder, "sf-trip"), { recursive: true });
  writeFileSync(join(folder, "policy.md"), POLICY);
  writeFileSync(join(folder, "me.md"), "# me\n- BU Questrom junior building Sol.\n");
  writeFileSync(join(folder, "sf-trip", "approach.md"), "BU alumni in SF.\n");
  let clock = Date.parse("2026-11-10T08:00:00");
  const prompts: string[] = [];
  // the stand-in turn: does what the task asks, as Codex would, by the job in the trigger's data
  const turn = async (f: string, _r: unknown, trig: { data: any }): Promise<RunOut> => {
    const d = trig.data;
    prompts.push(String(d.task ?? ""));
    if (d.job === "people") for (const [n, c] of [["Dana Lee", "Acme"], ["Sam Roe", "Beta"], ["Ana Diaz", "Gamma"]]) {
      const s = n.toLowerCase().replace(" ", "-");
      writeFileSync(join(f, "people", `${s}.md`), `# ${n}\n- where: San Francisco\n- company: ${c}\n- role: Engineer\n- why: builds agent tools.\n- link: https://${c}.example/team\n- reach: email ${s}@${c}.example\n- state: found\n- variant:\n\n## Touches\n- 2026-11-10 found on https://${c}.example/team\n`);
    }
    if (d.job === "draft") writeFileSync(join(f, "outreach", "drafts", d.kind === "first" ? `${d.person}.md` : `${d.person}-${d.kind}.md`), `# To ${d.person}\nHi, I'm Marco. I hope this finds you well. Coffee on Nov 28?\n`);
    if (d.job === "plan") writeFileSync(join(f, "sf-trip", "plan.md"), readFileSync(join(f, "sf-trip", "plan.md"), "utf8").replace("| - | - |", "| Blue Bottle | how they hire |"));
    return { report: "ready", said: `did ${d.job}`, thread: "t", ms: 1 };
  };
  mkdirSync(join(folder, "people"), { recursive: true });
  const a = new Agents({ home, turn: turn as any, now: () => clock, jev: null });
  jobsHooks.rnd = () => 0;
  const settle = async () => { for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r)); await (a as any).chains.get(folder); await new Promise((r) => setTimeout(r, 20)); };

  const r = await a.runRule("jobs", "clock-2");
  assert.equal(r.ok, true);
  assert.equal(r.ticket!.state, "waiting");
  const card = r.ticket!.needs!;
  assert.equal(card.title, "3 new people: keep / drop");
  assert.equal(card.wouldHave, true);
  assert.deepEqual(card.items!.map((i) => i.key), ["ana-diaz", "dana-lee", "sam-roe"]);
  assert.match(prompts[0], /^Find 10 people in San Francisco/);
  // the guessed addresses (no page shown) were taken out
  assert.match(readFileSync(join(folder, "people", "dana-lee.md"), "utf8"), /- reach: none found/);
  assert.equal(readdirCount(join(folder, "outreach", "variants")), 4);

  await a.answer(card.ticketId, "drop · ana-diaz");
  let t = JSON.parse(readFileSync(join(folder, ".agent", "tickets", `${card.ticketId}.json`), "utf8"));
  assert.deepEqual(t.needs.items.map((i: any) => i.key), ["dana-lee", "sam-roe"]);
  assert.match(readFileSync(join(folder, "people", "ana-diaz.md"), "utf8"), /- state: dropped/);
  await a.answer(card.ticketId, "keep all");
  await settle(); await settle();
  t = JSON.parse(readFileSync(join(folder, ".agent", "tickets", `${card.ticketId}.json`), "utf8"));
  assert.equal(t.state, "ended");
  const dana = readFileSync(join(folder, "people", "dana-lee.md"), "utf8"), sam = readFileSync(join(folder, "people", "sam-roe.md"), "utf8");
  assert.match(dana, /- state: drafted/);
  const dv = /- variant: (\S+)/.exec(dana)![1], sv = /- variant: (\S+)/.exec(sam)![1];
  assert.notEqual(dv, sv);   // balanced: two people, two different variants
  assert.ok(existsSync(join(folder, "outreach", "drafts", "dana-lee.agent.md")));
  const draftT = a.view("jobs")!.tickets.find((x) => x.subscriptions.includes("person:dana-lee"))!;
  assert.equal(draftT.needs!.title, `Draft to Dana Lee (${dv})`);
  assert.deepEqual(draftT.needs!.choices, ["sent", "edit", "skip"]);
  assert.match(draftT.needs!.body!, /Coffee on Nov 28/);

  // he edits the draft, then presses sent
  writeFileSync(join(folder, "outreach", "drafts", "dana-lee.md"), "# To dana-lee\nHi Dana, I'm Marco. Coffee on Nov 28?\n");
  await a.answer(draftT.id, "edit");
  await a.answer(draftT.id, "sent");
  assert.match(readFileSync(join(folder, "people", "dana-lee.md"), "utf8"), /- state: sent/);
  const edits = readFileSync(join(folder, "outreach", "edits.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(edits[0].edit.removed, ["Hi,", "I hope this finds you well."]);
  // the board shows the person waiting with the presses; the page shows the board
  const html = a.page("jobs")!;
  assert.match(html, /<h2>People<\/h2>/);
  assert.match(html, /name="choice" value="replied"/);
  assert.match(html, new RegExp(`<b>${dv}</b><span>1 sent · 0 replied`));

  // replied → the plan gets a row (the plan rule's own ticket), the numbers move
  await a.answer(draftT.id, "replied");
  await settle(); await settle();
  assert.match(readFileSync(join(folder, "people", "dana-lee.md"), "utf8"), /- state: replied/);
  const plan = readFileSync(join(folder, "sf-trip", "plan.md"), "utf8");
  assert.match(plan, /\| \[Dana Lee\]\(\.\.\/people\/dana-lee\.md\) \| Sat Nov 28 \| Blue Bottle \| how they hire \| replied: to book \|/);
  assert.match(a.page("jobs")!, new RegExp(`<b>${dv}</b><span>1 sent · 1 replied`));

  // five days on, no reply from Sam (sent today): the 09:00 rule drafts nothing for Dana (replied), nothing for Sam yet
  const samT = a.view("jobs")!.tickets.find((x) => x.subscriptions.includes("person:sam-roe"))!;
  await a.answer(samT.id, "sent");
  clock += 6 * 86_400_000;
  await a.runRule("jobs", "clock-3");
  await settle(); await settle();
  assert.ok(existsSync(join(folder, "outreach", "drafts", "sam-roe-follow-up.md")));
  assert.equal(a.view("jobs")!.tickets.find((x) => x.subscriptions.includes("person:sam-roe"))!.needs!.title, "Follow-up to Sam Roe");
  // once: a second run drafts no second one
  const again = await a.runRule("jobs", "clock-3");
  assert.equal(again.ticket?.runs.at(-1)?.said, "no follow-up due");
});

function readdirCount(dir: string) { try { return readdirSync(dir).length; } catch { return 0; } }

test("flow: met → how did it go → a thank-you; a winner retires the loser and proposes one; the lesson; noteReply", { timeout: 30_000 }, async () => {
  const home = mkdtempSync(join(tmpdir(), "sol-jobs-")), folder = join(home, "jobs");
  mkdirSync(join(folder, "people"), { recursive: true });
  writeFileSync(join(folder, "policy.md"), POLICY);
  const { seedVariants, readVariants } = await import("../src/agent/jobs/outreach.ts");
  const { noteReply } = await import("../src/agent/jobs/index.ts");
  seedVariants(folder, "2026-11-01");
  // 15 sent on each variant; coffee-their-work got 9 replies, the others 1 or 2
  const replies: Record<string, number> = { "coffee-their-work": 9, "coffee-his-project": 2, "question-their-work": 2, "question-his-project": 1 };
  for (const [v, r] of Object.entries(replies)) for (let i = 0; i < 15; i++)
    writeFileSync(join(folder, "people", `${v}-${i}.md`), `# P ${v} ${i}\n- variant: ${v}\n- state: ${i < r ? "replied" : "sent"}\n\n## Touches\n- 2026-11-02 sent\n`);
  // one more: the one he will meet, its reply the one that tips the test (coffee-their-work 10 of 16)
  writeFileSync(join(folder, "people", "kim-li.md"), `# Kim Li\n- variant: coffee-their-work\n- state: found\n\n## Touches\n- 2026-11-02 kept; variant coffee-their-work\n`);
  let clock = Date.parse("2026-11-15T18:00:00");   // a Sunday
  const tasks: string[] = [];
  const turn = async (f: string, _r: unknown, trig: { data: any }): Promise<RunOut> => {
    const d = trig.data;
    tasks.push(`${d.job ?? "?"}: ${String(d.task ?? "").split("\n")[0]}`);
    if (d.job === "draft") writeFileSync(join(f, "outreach", "drafts", d.kind === "first" ? `${d.person}.md` : `${d.person}-${d.kind}.md`), `# To ${d.person}\n${d.kind === "thanks" ? "Thanks for the coffee, Kim." : "Hi Kim."}\n`);
    if (/new variant to try/.test(d.task ?? "")) writeFileSync(join(f, "outreach", "variants", "coffee-their-work-short.md"), "# coffee-their-work-short\n- status: active\n- opener: their work\n- ask: coffee\n- length: at most 50 words\n- channel: email\n- changes: the length (50 words) against coffee-their-work\n- since: 2026-11-15\n");
    if (d.job === "lesson") writeFileSync(join(f, "lessons", "2026-11-15.md"), "# Lesson\n## Practise\npractise: cut the first sentence.\n");
    return { report: "ready", said: "ok", thread: "t", ms: 1 };
  };
  const a = new Agents({ home, turn: turn as any, now: () => clock, jev: null });
  const settle = async () => { for (let k = 0; k < 3; k++) { for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r)); await (a as any).chains.get(folder); await new Promise((r) => setTimeout(r, 20)); } };
  const ticketOf = (slug: string) => a.view("jobs")!.tickets.find((x) => x.subscriptions.includes(`person:${slug}`))!;

  await a.runRule("jobs", "people-1");   // run now on "kept": Kim's draft
  await settle();
  await a.answer(ticketOf("kim-li").id, "sent");
  // the mail source's door: a reply seen → the same as his press
  assert.equal(await noteReply(a as any, folder, "kim-li"), true);
  await settle();
  assert.match(readFileSync(join(folder, "people", "kim-li.md"), "utf8"), /- state: replied/);
  // the reply tipped the test: coffee-their-work wins, question-his-project (the least likely best) is retired, a new one proposed
  const vs = readVariants(folder);
  assert.equal(vs.find((v) => v.name === "question-his-project")!.status, "retired");
  assert.match(vs.find((v) => v.name === "question-his-project")!.notes, /Retired 2026-11-15: coffee-their-work wins/);
  const prop = a.view("jobs")!.cards.find((c) => c.title.startsWith("New variant to try"))!;
  assert.equal(prop.title, "New variant to try: coffee-their-work-short");
  assert.equal(vs.find((v) => v.name === "coffee-their-work-short")!.status, "proposed");
  await a.answer(prop.ticketId, "use it");
  assert.equal(readVariants(folder).find((v) => v.name === "coffee-their-work-short")!.status, "active");

  // met → how did it go → a thank-you → sent: follow-up, the next touch in six weeks, the ticket ends
  await a.answer(ticketOf("kim-li").id, "met");
  await settle();
  const how = ticketOf("kim-li").needs!;
  assert.equal(how.title, "How did it go with Kim Li?");
  await a.answer(how.ticketId, "it went well");
  const thanks = ticketOf("kim-li").needs!;
  assert.equal(thanks.title, "Thank-you to Kim Li");
  assert.match(thanks.body!, /Thanks for the coffee/);
  await a.answer(thanks.ticketId, "sent");
  const kim = readFileSync(join(folder, "people", "kim-li.md"), "utf8");
  assert.match(kim, /- state: follow-up/);
  assert.match(kim, /met: it went well/);
  assert.match(kim, /next touch around 2026-12-27/);
  assert.equal(ticketOf("kim-li"), undefined);   // ended

  // Sunday 18:00: the lesson, one card, its line the thing to practise
  mkdirSync(join(folder, "lessons"), { recursive: true });
  const l = await a.runRule("jobs", "clock-4");
  assert.equal(l.ticket!.needs!.title, "This week's lesson");
  assert.equal(l.ticket!.needs!.line, "cut the first sentence.");
  const lessonTask = tasks.find((t) => t.startsWith("lesson"))!;
  assert.match(lessonTask, /^lesson: Write lessons\/2026-11-15\.md/);
  clock += 0;
});
