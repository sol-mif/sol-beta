// A folder's stickies, kept by the engine (#1228): the pure changes over stickies.md, the file with remove and its undo
// across a restart, and the one press through Agents with a stand-in turn (no Codex, no browser, no network): marked,
// the rule written once, run, the mark off and a "did:" line, each step told as it happens.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as St from "../src/agent/stickies.ts";
import { Agents, type RunStep } from "../src/agent/index.ts";

const FILE = `# work · your stickies

Some words a person wrote.

- [ ] Outline offer — the elements, one case each
  - asked Nov 10 19:40
  - did: made/offer.md
- [x] Quiz 4
`;

test("stickies: the file reads and writes back as it was", () => {
  const p = St.parse(FILE);
  assert.deepEqual(p.items.map((i) => [i.done, i.t, i.s, i.notes.length]), [[false, "Outline offer", "the elements, one case each", 2], [true, "Quiz 4", "", 0]]);
  assert.equal(St.serialize(p.head, p.items), FILE);
  assert.equal(St.serialize(St.HEAD("x"), []), `${St.HEAD("x").replace(/\n+$/, "")}\n\n`);
});

test("stickies: a due is a line under the sticky, set on make or after, replaced, taken off, and refused when it is no time (#1487)", () => {
  const l = St.parse(FILE).items;
  const m = St.make(l, "Swim gala kit", "2026-11-20 18:00");
  assert.ok("items" in m && m.items[2].notes[0] === "due: 2026-11-20 18:00");
  assert.match(St.serialize("", "items" in m ? m.items : []), /- \[ \] Swim gala kit\n {2}- due: 2026-11-20 18:00/);
  assert.ok("why" in St.make(l, "Swim gala kit", "Friday"));
  const d = St.withDue(l, "Outline offer", "2026-11-19 09:00");
  assert.ok("items" in d && d.items[0].notes[0] === "due: 2026-11-19 09:00" && d.items[0].notes.length === 3, "set first, the other notes kept");
  const d2 = St.withDue("items" in d ? d.items : [], "Outline offer", "2026-11-21 18:00");
  assert.ok("items" in d2 && d2.items[0].notes.filter((n) => St.DUE.test(n)).length === 1 && d2.items[0].notes[0] === "due: 2026-11-21 18:00", "one due, replaced");
  const off = St.withDue("items" in d2 ? d2.items : [], "Outline offer", null);
  assert.ok("items" in off && off.items[0].notes.length === 2 && !off.items[0].notes.some((n) => St.DUE.test(n)));
  assert.ok("why" in St.withDue(l, "gone", null));
});

test("stickies: make, edit and done refuse what would lose or double a sticky", () => {
  const l = St.parse(FILE).items;
  const m = St.make(l, "Brief Hadley — facts, issue, rule");
  assert.ok("items" in m && m.items[2].t === "Brief Hadley" && m.items[2].s === "facts, issue, rule");
  assert.ok("why" in St.make(l, "Quiz 4"));
  assert.ok("why" in St.make(l, "   "));
  const e = St.edit(l, "Outline offer", "Outline offer and acceptance", "one page");
  assert.ok("items" in e && e.items[0].t === "Outline offer and acceptance" && e.items[0].notes.length === 2);
  assert.ok("why" in St.edit(l, "Outline offer", "Quiz 4", ""));
  assert.ok("why" in St.edit(l, "gone", "x", ""));
  const d = St.done(l, "Quiz 4", false);
  assert.ok("items" in d && !d.items[1].done);
});

test("stickies: a press marks one, the mark taken off every other; settle writes did: only when the agent wrote none", () => {
  const l = St.parse(FILE).items;
  const m = St.mark([{ ...l[0], t: "Outline offer ← now" }, l[1]], "Quiz 4", "Nov 15 09:00");
  assert.ok("items" in m);
  assert.equal(m.items[0].t, "Outline offer");
  assert.deepEqual(m.items[1].notes, ["asked Nov 15 09:00 ← now"]);
  const s1 = St.settle(m.items, "Quiz 4", "made/quiz.md");
  assert.deepEqual(s1[1].notes, ["asked Nov 15 09:00", "did: made/quiz.md"]);
  const s2 = St.settle([m.items[0], { ...m.items[1], notes: [...m.items[1].notes, "did: the agent's own line"] }], "Quiz 4", "made/quiz.md");
  assert.deepEqual(s2[1].notes, ["asked Nov 15 09:00", "did: the agent's own line"]);
  // an older "did:" before this ask does not count as this run's
  const s3 = St.settle(St.mark(l, "Outline offer", "Nov 15").items as St.Sticky[], "Outline offer", "made/two.md");
  assert.equal(s3[0].notes.at(-1), "did: made/two.md");
});

test("stickies: remove keeps it for its undo, back in its place, across a new read of the folder", () => {
  const home = mkdtempSync(join(tmpdir(), "stickies-")), f = join(home, "work");
  mkdirSync(f);
  writeFileSync(join(f, St.FILE), FILE);
  const r = St.remove(f, "Outline offer", 1000);
  assert.ok("id" in r);
  assert.deepEqual(St.read(f).items.map((i) => i.t), ["Quiz 4"]);
  assert.equal(St.removedOf(f, 2000).length, 1);
  assert.equal(St.removedOf(f, 1000 + St.UNDO_MS).length, 0);   // too old
  const u = St.undo(f, (r as { id: string }).id, 2000);
  assert.ok("items" in u);
  assert.equal(readFileSync(join(f, St.FILE), "utf8"), FILE);
  assert.ok("why" in St.undo(f, (r as { id: string }).id, 3000));   // once
  assert.equal(St.dirIn(home, "work"), f);
  assert.equal(St.dirIn(home, "./work"), f);
  assert.equal(St.dirIn(home, f), f);
  assert.equal(St.dirIn(home, "../x"), null);
  assert.equal(St.dirIn(home, "/etc"), null);
  assert.equal(St.dirIn(home, home), null);
  // the home named through a link (the shell's $SOL_HOME) is the same home
  const link = join(mkdtempSync(join(tmpdir(), "stickies-link-")), "h");
  symlinkSync(home, link);
  assert.equal(St.dirIn(home, `${link}/work`), realpathSync(f));
  assert.equal(St.dirIn(link, f), realpathSync(f));
});

test("stickies: the rule is added once, an existing one kept as written (its rung is the person's level)", () => {
  const f = mkdtempSync(join(tmpdir(), "stickies-rule-"));
  assert.equal(St.ensureRule(f), null);
  writeFileSync(join(f, "policy.md"), "# x\n\n- [watch, draft] stickies: the onboarding's own words\n");
  St.ensureRule(f);
  assert.equal(readFileSync(join(f, "policy.md"), "utf8"), "# x\n\n- [watch, draft] stickies: the onboarding's own words\n");
  writeFileSync(join(f, "policy.md"), "# y\n");
  St.ensureRule(f); St.ensureRule(f);
  assert.equal(readFileSync(join(f, "policy.md"), "utf8"), `# y\n\n${St.STICKY_RULE}\n`);
});

test("agents: one press marks, writes the rule, runs the agent on the marked one, settles, and tells each step", async () => {
  const home = mkdtempSync(join(tmpdir(), "press-")), f = join(home, "school", "la245");
  mkdirSync(f, { recursive: true });
  writeFileSync(join(f, "policy.md"), "# LA245\n");
  writeFileSync(join(f, St.FILE), FILE);
  const steps: RunStep[] = [], seen: string[] = [];
  let release!: () => void;
  const hold = new Promise<void>((r) => { release = r; });
  const a = new Agents({
    home, jev: null, now: () => 5000, step: (_f, s) => steps.push(s),
    turn: async (dir, rule, trig) => {
      seen.push(rule.source, String(trig.data.sticky));
      // the agent reads which one is pressed from the file
      seen.push(St.read(dir).items.find((i) => i.notes.some((n) => n.endsWith(St.NOW)))?.t ?? "none");
      mkdirSync(join(dir, "made"), { recursive: true });
      writeFileSync(join(dir, "made", "quiz.md"), "q");
      await hold;
      return { report: "ready", said: "made it", thread: "th", ms: 1 };
    },
  });
  const p = a.press("school/la245", "Quiz 4");
  await new Promise((r) => setTimeout(r, 30));
  // while it runs: the run is there for a face opened late, and a second press waits
  assert.equal(a.stickies("school/la245")?.running?.sticky, "Quiz 4");
  assert.match((await a.press("school/la245", "Outline offer")).why ?? "", /on "Quiz 4"/);
  assert.ok("why" in a.sticky("school/la245", { op: "remove", key: "Quiz 4" }));   // not while its agent is on it
  release();
  const r = await p;
  assert.equal(r.ok, true);
  assert.deepEqual(seen, ["stickies", "Quiz 4", "Quiz 4"]);
  assert.match(readFileSync(join(f, "policy.md"), "utf8"), /^- \[watch\] stickies: /m);
  const q = St.read(f).items.find((i) => i.t === "Quiz 4")!;
  assert.ok(q.notes.every((n) => !n.endsWith(St.NOW)));
  assert.equal(q.notes.at(-1), "did: made/quiz.md");
  assert.deepEqual(steps.map((s) => s.kind), ["start", "made", "end"]);
  assert.equal(steps[0].sticky, "Quiz 4");
  assert.equal(steps[2].ok, true);
  assert.equal(a.stickies("school/la245")?.running, null);
  // a folder with no agent: the sticky is kept, nothing runs
  mkdirSync(join(home, "life"));
  assert.match((await a.press("life", "x")).why ?? "", /no agent/);
});

test("the trust gate: how far is read from the sticky's words; a draft waits for the person's yes, which runs its one step and finishes it", async () => {
  // only the person's own → does; reaches someone → drafts; money, a submission or a deletion → asks
  assert.equal(St.reachOfSticky({ t: "Sort the photos", s: "by year" }), "does");
  assert.equal(St.reachOfSticky({ t: "Reply to the landlord", s: "about the boiler" }), "drafts");
  assert.equal(St.reachOfSticky({ t: "Book the dentist", s: "" }), "drafts");
  assert.equal(St.reachOfSticky({ t: "Pay the term's fees", s: "" }), "asks");
  assert.equal(St.reachOfSticky({ t: "Email the form", s: "submit it by Friday" }), "asks");
  assert.equal(St.gateWords("does"), "");
  const home = mkdtempSync(join(tmpdir(), "gate-")), f = join(home, "house");
  mkdirSync(f);
  writeFileSync(join(f, "policy.md"), "# house\n");
  writeFileSync(join(f, St.FILE), "# house · your stickies\n\n- [ ] Reply to the landlord — about the boiler\n");
  const asked: string[] = [];
  const a = new Agents({
    home, jev: null, now: () => 9000,
    turn: async (dir) => {
      const m = St.read(dir).items[0], line = m.notes.find((n) => n.endsWith(St.NOW))!;
      asked.push(line);
      // the stand-in agent does what the line says: a draft, then (on the yes) the send
      St.change(dir, (l) => ({ items: [{ ...l[0], notes: [...l[0].notes, /· yes:/.test(line) ? "did: sent the reply" : "did: draft: reply in made/reply.md"] }] }));
      return { report: "ready", said: "ok", thread: "th", ms: 1 };
    },
  });
  assert.equal(a.stickies("house")?.items[0].reach, "drafts");
  assert.equal((await a.press("house", "Reply to the landlord")).ok, true);
  assert.match(asked[0], /^asked .* · drafts: make it ready to send and never send it/);
  let m = St.read(f).items[0];
  assert.equal(m.done, false);   // a draft finishes nothing
  assert.equal(m.notes.at(-1), "did: draft: reply in made/reply.md");
  // a yes must name one of its own waiting lines
  assert.match((await a.press("house", "Reply to the landlord", "did: draft: something else")).why ?? "", /not a draft or an ask/);
  assert.equal((await a.press("house", "Reply to the landlord", "did: draft: reply in made/reply.md")).ok, true);
  assert.match(asked[1], /· yes: do this one step now and nothing more, "reply in made\/reply\.md"/);
  m = St.read(f).items[0];
  assert.equal(m.done, true);   // the act finished it
  assert.equal(m.notes.at(-1), "did: sent the reply");
});

test("agents: the face's changes go through the engine: make, edit, done, remove and undo", () => {
  const home = mkdtempSync(join(tmpdir(), "sticky-ops-")), f = join(home, "life");
  mkdirSync(f);
  const a = new Agents({ home, jev: null, now: () => 7000 });
  assert.equal(a.sticky("life", { op: "make", line: "Call the bank — about the card" }).key, "Call the bank");
  assert.match(readFileSync(join(f, St.FILE), "utf8"), /^# life · your stickies/);
  assert.equal(a.sticky("life", { op: "make", line: "Call the bank" }).ok, false);
  assert.equal(a.sticky("life", { op: "edit", key: "Call the bank", t: "Call the bank today", s: "" }).ok, true);
  assert.equal(a.sticky("life", { op: "done", key: "Call the bank today", done: true }).items?.[0].done, true);
  const rm = a.sticky("life", { op: "remove", key: "Call the bank today" });
  assert.ok(rm.undo);
  assert.equal(a.stickies("life")?.items.length, 0);
  assert.equal(a.stickies("life")?.removed[0]?.t, "Call the bank today");
  assert.equal(a.sticky("life", { op: "undo", id: rm.undo }).items?.[0].t, "Call the bank today");
  assert.equal(a.sticky("../x", { op: "make", line: "y" }).ok, false);
  // a due, on make and after (#1487)
  assert.equal(a.sticky("life", { op: "make", line: "Swim gala kit", due: "2026-11-20 18:00" }).items?.at(-1)?.notes[0], "due: 2026-11-20 18:00");
  assert.equal(a.sticky("life", { op: "due", key: "Call the bank today", due: "2026-11-18 18:00" }).items?.[0].notes[0], "due: 2026-11-18 18:00");
  assert.match(readFileSync(join(f, St.FILE), "utf8"), /- \[x\] Call the bank today\n {2}- due: 2026-11-18 18:00/);
  assert.equal(a.sticky("life", { op: "due", key: "Call the bank today", due: null }).items?.[0].notes.length, 0);
  assert.equal(a.sticky("life", { op: "due", key: "Call the bank today", due: "soon" }).ok, false);
});
