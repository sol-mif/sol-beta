// The jobs folder's agent: the step 1 agent (agent/index.ts) runs it like any folder, and every turn of a folder
// named "jobs" comes through jobsTurn first. Code does what must be exact (who gets which variant, the people's
// states, the A/B numbers, the board, the cards); Codex does the reading and the writing (people from public pages,
// the drafts, the postings, the lesson), asked through the trigger's `task`.
//
// What fires what:
//   clock 07:30 "postings"   → Codex finds postings → Jev "worth his time?" → the top ones: a trigger each
//                              (application:<slug>) → answers.md, cover.md → card "Apply: <role> at <company>"
//   clock 08:00 "people"     → Codex finds people → one card "N new people: keep / drop", a choice per person
//   his keep                 → the person gets a variant (balanced, at random) → a trigger (person:<slug>) on the
//                              "kept" rule → the draft → card "sent / edit / skip". The agent never sends
//   his sent                 → what he sent and his edits kept; the person's ticket stays open for the board's
//                              presses: replied · no reply after 5 days · met (noteReply is the mail source's door)
//   clock 09:00 "follow-up"  → each person sent 5 days ago with no reply: a follow-up draft, once
//   replied / met            → a trigger on the plan rule: sf-trip/plan.md; met → "how did it go?" → a thank-you draft
//   sent, replied            → the A/B verdict: a winner retires the loser and a new variant is proposed (a card)
//   clock Sunday 18:00       → lessons/<date>.md and one card
//   a new file in resume/    → me.md's facts, fit.md redone; with resume/ empty, one card asks for it
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { Card, Rule, Ticket, Trigger } from "../harness.js";
import type { RunOut } from "../run.js";
import { readPolicy, readLast, saveLast, readTickets } from "../store.js";
import { openTab } from "../../browser.js";
import { abRow, checkReach, dayOf, didReply, followUpsDue, hasTouch, move, readPeople, readPerson, savePerson, touch, type Person } from "./people.js";
import { assign, tally, verdict, abWords } from "./ab.js";
import { draftName, keepAgentWords, liveVariants, markSent, readDraft, readEdits, readVariants, saveVariant, seedVariants, editLine, stripHead, type DraftKind } from "./outreach.js";
import { applyTitle, ensureResumeDir, hasResume, makeWorth, pick, postingTitle, readApp, readApps, scoreOf, setApp, writeBoard, type Worth } from "./applications.js";
import { parsePlan, planMd, planRows } from "./trip.js";
import { applicationTask, draftTask, lessonTask, peopleTask, planTask, postingsTask, resumeTask, variantTask } from "./tasks.js";

export type TurnFn = (folder: string, rule: Rule, trigger: Trigger, ticket: Ticket) => Promise<RunOut>;
type Host = { trigger: (folder: string, t: Trigger) => Promise<unknown>; d: { now?: () => number } };

/** what tests swap: the dice, Jev's "worth his time", how a form's page is opened */
export const jobsHooks: { rnd: () => number; worth: Worth | null | undefined; open: (url: string, sessionId: string) => Promise<unknown> } = {
  rnd: Math.random, worth: undefined, open: (url, sid) => openTab(url, sid),
};

export const isJobs = (folder: string) => basename(folder).toLowerCase() === "jobs";

export type RuleKind = "postings" | "people" | "kept" | "follow-up" | "plan" | "lesson" | "resume";
/** which jobs rule a policy line is, by its words, so Marco can reorder or reword the policy (pure) */
export function ruleKind(r: Pick<Rule, "sentence" | "source">): RuleKind | null {
  const s = r.sentence.toLowerCase();
  if (r.source === "folder" && /\bresume\b|résumé/.test(s)) return "resume";
  if (/\blesson/.test(s)) return "lesson";
  if (/follow-?up/.test(s) && /\b5 days\b|five days/.test(s)) return "follow-up";
  if (/\bkept\b/.test(s)) return "kept";
  if (/plan\.md|\brepl(y|ies)\b/.test(s)) return "plan";
  if (/posting/.test(s)) return "postings";
  if (/\bpeople\b/.test(s)) return "people";
  return null;
}
const ruleOf = (folder: string, kind: RuleKind) => readPolicy(folder).rules.find((r) => ruleKind(r) === kind) ?? null;

// ---- what a card is waiting for, by ticket (in .agent/jobs-last.json) ----
type Ask =
  | { what: "people"; slugs: string[] }
  | { what: "draft"; slug: string; kind: DraftKind }
  | { what: "how"; slug: string }
  | { what: "apply"; app: string }
  | { what: "resume" }
  | { what: "variant"; name: string }
  | { what: "note" };
/** asks: what each card waits for. proposing: a loser was retired and its replacement not yet answered (one at a time) */
type JobsState = { asks: Record<string, Ask>; proposing?: string };
const readState = (folder: string): JobsState => readLast<JobsState>(folder, "jobs") ?? { asks: {} };
function setAsk(folder: string, ticket: string, ask: Ask | null) {
  const s = readState(folder);
  if (ask) s.asks[ticket] = ask; else delete s.asks[ticket];
  saveLast(folder, "jobs", s);
}

const answerOf = (t: Trigger) => String((t.data as any).choice ?? "").trim();
const fileText = (p: string) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
const say = (out: RunOut, extra: string): RunOut => ({ ...out, said: [out.said, extra].filter(Boolean).join("\n") });
const done = (said: string): RunOut => ({ report: "ready", said, thread: null, ms: 0 });
const keepOpen = (said: string): RunOut => ({ report: "progress", said, thread: null, ms: 0 });
const ask = (folder: string, t: Ticket, a: Ask, card: Omit<Card, "ticketId">, base: Partial<RunOut> = {}): RunOut => {
  setAsk(folder, t.id, a);
  return { report: "waiting", said: "", thread: null, ms: 0, ...base, card };
};

/** fire a trigger after this one is done (the folder works one trigger at a time; this one is still running) */
function later(h: Host, folder: string, t: Omit<Trigger, "id" | "at">) {
  setImmediate(() => { const at = (h.d.now ?? Date.now)(); void h.trigger(folder, { ...t, id: `j-${at}-${Math.random().toString(36).slice(2, 6)}`, at }).catch(() => {}); });
}

/** a jobs folder's turn; any other folder's goes straight to `codex` */
export async function jobsTurn(h: Host, folder: string, rule: Rule, trig: Trigger, ticket: Ticket, codex: TurnFn): Promise<RunOut> {
  if (!isJobs(folder)) return codex(folder, rule, trig, ticket);
  const now = (h.d.now ?? Date.now)();
  const c: Ctx = { h, folder, rule, trig, ticket, codex, now, today: dayOf(now) };
  if (trig.kind === "answer") return answer(c, answerOf(trig));
  const job = (trig.data as any).job as string | undefined;
  if (job === "draft") return draft(c, String((trig.data as any).person), ((trig.data as any).kind ?? "first") as DraftKind);
  if (job === "application") return application(c, String((trig.data as any).app));
  if (job === "resume-card") return resumeCard(c);
  if (job === "variant") return proposeVariant(c, (trig.data as any).winner, (trig.data as any).loser, (trig.data as any).why);
  switch (ruleKind(rule)) {
    case "people": return people(c);
    case "kept": return keptNow(c);
    case "follow-up": return followUps(c);
    case "plan": return plan(c);
    case "lesson": return lesson(c);
    case "postings": return postings(c);
    case "resume": return resume(c);
    default: return codex(folder, rule, trig, ticket);
  }
}

type Ctx = { h: Host; folder: string; rule: Rule; trig: Trigger; ticket: Ticket; codex: TurnFn; now: number; today: string };
const run = (c: Ctx, data: Record<string, unknown>) => c.codex(c.folder, c.rule, { ...c.trig, data: { ...c.trig.data, ...data } }, c.ticket);

// ---- people ----
async function people(c: Ctx): Promise<RunOut> {
  seedVariants(c.folder, c.today);
  const before = new Set(readPeople(c.folder).map((p) => p.slug));
  const where = c.today < "2026-11-26" ? "in San Francisco (the Bay Area) who fit sf-trip/approach.md" : "who fit sf-trip/approach.md and me.md, anywhere";
  const out = await run(c, { job: "people", task: peopleTask({ n: 10, where, known: [...before] }) });
  const fresh = readPeople(c.folder).filter((p) => !before.has(p.slug) && p.state === "found");
  const notes: string[] = [];
  for (const p of fresh) {
    const k = checkReach(p.reach);
    if (k.removed.length) { savePerson(c.folder, touch({ ...p, reach: k.reach }, c.now, `address taken out (no public page shown for it): ${k.removed.join(", ")}`)); notes.push(`${p.slug}: an address with no page was taken out`); }
  }
  if (!fresh.length) return { ...say(out, "no new people"), report: out.report === "failed" ? "failed" : "ready", card: undefined };
  return ask(c.folder, c.ticket, { what: "people", slugs: fresh.map((p) => p.slug) }, peopleCard(c.folder, fresh.map((p) => p.slug)), { said: [out.said, ...notes].join("\n"), thread: out.thread, ms: out.ms });
}
function peopleCard(folder: string, slugs: string[]): Omit<Card, "ticketId"> {
  const ps = slugs.map((s) => readPerson(folder, s)).filter((p): p is Person => !!p);
  return {
    title: `${ps.length} new ${ps.length === 1 ? "person" : "people"}: keep / drop`,
    line: "Found on public pages. Keep: a draft from one of the variants, for you to send. Drop: left alone.",
    choices: ["keep all", "drop all"],
    items: ps.map((p) => ({ key: p.slug, line: `${p.name}, ${p.role || "?"} at ${p.company || "?"}: ${p.why}`, choices: ["keep", "drop"] })),
  };
}
const undecided = (folder: string, slugs: string[]) => slugs.filter((s) => { const p = readPerson(folder, s); return p && p.state === "found" && !hasTouch(p, "kept"); });

function keep(c: Ctx, slug: string): string {
  const p = readPerson(c.folder, slug);
  if (!p || p.state !== "found" || hasTouch(p, "kept")) return `${slug}: not open`;
  seedVariants(c.folder, c.today);
  const live = liveVariants(c.folder).map((v) => v.name);
  const counts = Object.fromEntries(tally(live, readPeople(c.folder).map(abRow)).map((t) => [t.variant, t.assigned]));
  const variant = p.variant && live.includes(p.variant) ? p.variant : assign(live, counts, jobsHooks.rnd) ?? "";
  savePerson(c.folder, touch({ ...p, variant }, c.now, `kept; variant ${variant}`));
  const r = ruleOf(c.folder, "kept");
  if (r) later(c.h, c.folder, { source: "you", kind: `kept ${slug}`, thread: `person:${slug}`, data: { rule: r.id, asked: true, job: "draft", person: slug, kind: "first" } });
  return `${slug}: kept, variant ${variant}${r ? "" : " (no rule for kept people in policy.md: no draft)"}`;
}
function drop(c: Ctx, slug: string): string {
  const p = readPerson(c.folder, slug);
  const m = p && move(p, "dropped", c.now, "dropped");
  if (m) savePerson(c.folder, m);
  return `${slug}: ${m ? "dropped" : "not open"}`;
}

/** the "kept" rule run by hand: a draft for each kept person who has none yet */
async function keptNow(c: Ctx): Promise<RunOut> {
  const todo = readPeople(c.folder).filter((p) => p.state === "found" && hasTouch(p, "kept"));
  for (const p of todo) later(c.h, c.folder, { source: "you", kind: `kept ${p.slug}`, thread: `person:${p.slug}`, data: { rule: c.rule.id, asked: true, job: "draft", person: p.slug, kind: "first" } });
  return done(todo.length ? `drafts queued for ${todo.map((p) => p.slug).join(", ")}` : "no kept person waits for a draft");
}

// ---- drafts ----
async function draft(c: Ctx, slug: string, kind: DraftKind, note?: string): Promise<RunOut> {
  const p = readPerson(c.folder, slug);
  if (!p) return done(`no person ${slug}`);
  const variant = p.variant || liveVariants(c.folder)[0]?.name || "";
  const file = `outreach/drafts/${draftName(slug, kind)}`;
  mkdirSync(join(c.folder, "outreach", "drafts"), { recursive: true });
  const before = readDraft(c.folder, slug, kind);
  const out = await run(c, { job: "draft", person: slug, kind, task: draftTask({ person: slug, variant, kind, file, note }) });
  const text = readDraft(c.folder, slug, kind);
  if (!text || text === before) return { ...say(out, `${file} was not written`), report: "failed", card: undefined };
  keepAgentWords(c.folder, slug, kind);
  const now = readPerson(c.folder, slug)!;
  const moved = kind === "first" ? move(now, "drafted", c.now, `drafted (${variant})`) : null;
  savePerson(c.folder, moved ?? touch(now, c.now, `${kind} drafted`));
  return ask(c.folder, c.ticket, { what: "draft", slug, kind }, draftCard(c.folder, slug, kind, variant), { said: out.said, thread: out.thread, ms: out.ms });
}
function draftCard(folder: string, slug: string, kind: DraftKind, variant: string, edit = false): Omit<Card, "ticketId"> {
  const p = readPerson(folder, slug)!;
  const file = `outreach/drafts/${draftName(slug, kind)}`;
  const what = kind === "first" ? "Draft" : kind === "follow-up" ? "Follow-up" : "Thank-you";
  return {
    title: `${what} to ${p.name}${kind === "first" ? ` (${variant})` : ""}`,
    line: edit
      ? `Change the words in ${file} to what you will send, send it yourself, then press sent.`
      : `Reach: ${p.reach || "none found"}. Copy it, send it from your own mail or LinkedIn, then press sent. Changing words? Edit ${file} first: your edits teach the variants.`,
    choices: edit ? ["sent", "skip"] : ["sent", "edit", "skip"],
    body: readDraft(folder, slug, kind) ?? "",
  };
}

// ---- his answers ----
async function answer(c: Ctx, choice: string): Promise<RunOut> {
  const a = readState(c.folder).asks[c.ticket.id];
  // a press from the board on a person's open ticket (no card): replied, no reply, met
  const person = c.ticket.subscriptions.find((s) => s.startsWith("person:"))?.slice(7);
  if (!a && person) return personPress(c, person, choice);
  if (!a) return done(`"${choice}" noted`);
  setAsk(c.folder, c.ticket.id, null);
  switch (a.what) {
    case "people": {
      const m = /^(keep|drop)(?: all)?(?:\s*·\s*([a-z0-9-]+))?$/i.exec(choice);
      if (!m) return ask(c.folder, c.ticket, a, peopleCard(c.folder, undecided(c.folder, a.slugs)), { said: `"${choice}" is not keep or drop` });
      const which = m[2] ? [m[2]].filter((s) => a.slugs.includes(s)) : undecided(c.folder, a.slugs);
      const lines = which.map((s) => (m[1].toLowerCase() === "keep" ? keep(c, s) : drop(c, s)));
      const left = undecided(c.folder, a.slugs);
      return left.length ? ask(c.folder, c.ticket, { what: "people", slugs: a.slugs }, peopleCard(c.folder, left), { said: lines.join("\n") }) : done(lines.join("\n"));
    }
    case "draft": {
      const p = readPerson(c.folder, a.slug);
      if (!p) return done(`no person ${a.slug}`);
      if (/^sent$/i.test(choice)) return sent(c, p, a.kind);
      if (/^edit$/i.test(choice)) return ask(c.folder, c.ticket, a, draftCard(c.folder, a.slug, a.kind, p.variant, true));
      // skip
      if (a.kind === "first") { const m = move(p, "dropped", c.now, "draft skipped"); savePerson(c.folder, m ?? touch(p, c.now, "draft skipped")); return done(`${p.name}: skipped`); }
      savePerson(c.folder, touch(p, c.now, `${a.kind} skipped`));
      return a.kind === "thanks" ? done(`${p.name}: thank-you skipped`) : keepOpen(`${p.name}: follow-up skipped`);
    }
    case "how": {
      const p = readPerson(c.folder, a.slug);
      if (!p) return done(`no person ${a.slug}`);
      savePerson(c.folder, touch(p, c.now, `met: ${choice}`));
      if (/not happen/i.test(choice)) return keepOpen(`${p.name}: the meeting did not happen`);
      return draft(c, a.slug, "thanks", `How it went, in his words: "${choice}". Read the person's file for what they talked about; if nothing is written, keep it general and mark [gap: one thing they said].`);
    }
    case "apply": {
      const app = readApp(c.folder, a.app);
      if (!app) return done(`no application ${a.app}`);
      if (/open/i.test(choice)) {
        if (app.link) void jobsHooks.open(app.link, `agent:${basename(c.folder).toLowerCase()}`).catch(() => {});
        return ask(c.folder, c.ticket, a, applyCard(c.folder, a.app), { said: `opened ${app.link} in the jobs browser` });
      }
      const applied = /applied/i.test(choice);
      setApp(c.folder, a.app, { state: applied ? "applied" : "skipped", next: applied ? `wait; a follow-up around ${dayOf(c.now + 14 * 86_400_000)}` : "none" });
      writeBoard(c.folder);
      return done(`${app.role} at ${app.company}: ${applied ? "applied" : "skipped"}`);
    }
    case "resume":
      if (/done/i.test(choice) && !hasResume(c.folder)) return ask(c.folder, c.ticket, a, resumeCardOf(true));
      return done(hasResume(c.folder) ? "a résumé is in resume/" : "later");
    case "variant": {
      const v = readVariants(c.folder).find((x) => x.name === a.name);
      if (!v) return done(`no variant ${a.name}`);
      const use = /use/i.test(choice);
      saveVariant(c.folder, { ...v, status: use ? "active" : "dropped", since: use ? c.today : v.since });
      saveLast(c.folder, "jobs", { ...readState(c.folder), proposing: undefined });
      return done(`${a.name}: ${use ? "now live in the A/B test" : "not used"}`);
    }
    case "note": return done("seen");
  }
}

async function sent(c: Ctx, p: Person, kind: DraftKind): Promise<RunOut> {
  const e = markSent(c.folder, p.slug, kind, p.variant, c.now);
  const words = e ? editLine(e) : "sent";
  if (kind === "first") savePerson(c.folder, move(p, "sent", c.now, `sent (${p.variant}); ${words}`) ?? touch(p, c.now, `sent; ${words}`));
  else if (kind === "follow-up") savePerson(c.folder, touch(p, c.now, `follow-up sent; ${words}`));
  else {
    const next = dayOf(c.now + 42 * 86_400_000);
    savePerson(c.folder, touch(move(p, "follow-up", c.now, `thank-you sent; ${words}`) ?? p, c.now, `next touch around ${next}`));
    return done(`${p.name}: thanked; next touch around ${next}`);
  }
  checkWinner(c);
  return keepOpen(`${p.name}: ${kind === "first" ? "sent" : "follow-up sent"} (${words}). Press replied, no reply or met on the board.`);
}

/** the board's presses on a person: replied · no reply after 5 days · met (and noteReply, for the mail source) */
async function personPress(c: Ctx, slug: string, choice: string): Promise<RunOut> {
  const p = readPerson(c.folder, slug);
  if (!p) return done(`no person ${slug}`);
  if (/^repl/i.test(choice)) {
    const m = move(p, "replied", c.now, (c.trig.data as any).via ? `replied (${(c.trig.data as any).via})` : "replied");
    if (!m) return keepOpen(`${p.name} is ${p.state} already`);
    savePerson(c.folder, m);
    firePlan(c, slug);
    checkWinner(c);
    return keepOpen(`${p.name} replied: answer them from your own mail; the trip plan gets a row`);
  }
  if (/no reply/i.test(choice)) {
    if (hasTouch(p, "follow-up")) return keepOpen(`${p.name}: a follow-up was already drafted once`);
    savePerson(c.folder, touch(p, c.now, "no reply after 5 days"));
    return draft(c, slug, "follow-up");
  }
  if (/^met/i.test(choice)) {
    const m = move(p, "met", c.now, "met");
    if (!m) return keepOpen(`${p.name} is ${p.state} already`);
    savePerson(c.folder, m);
    firePlan(c, slug);
    checkWinner(c);
    return ask(c.folder, c.ticket, { what: "how", slug }, { title: `How did it go with ${p.name}?`, line: "Your answer goes in their file, and a thank-you is drafted for you to send.", choices: ["it went well", "it was so-so", "it did not happen"] });
  }
  return keepOpen(`"${choice}" noted for ${p.name}`);
}
function firePlan(c: Ctx, slug: string) {
  const r = ruleOf(c.folder, "plan");
  if (r) later(c.h, c.folder, { source: "you", kind: `marked ${slug} ${readPerson(c.folder, slug)?.state ?? "replied"}`, thread: "sf-trip:plan", data: { rule: r.id, asked: true, job: "plan", person: slug } });
}

/** the A/B verdict after a sent or a reply: a winner retires the loser, and a new variant is proposed (a card) */
function checkWinner(c: Ctx) {
  if (readState(c.folder).proposing) return;
  const live = liveVariants(c.folder).map((v) => v.name);
  const v = verdict(tally(live, readPeople(c.folder).map(abRow)));
  if (!v.winner || !v.loser) return;
  const loser = readVariants(c.folder).find((x) => x.name === v.loser)!;
  saveVariant(c.folder, { ...loser, status: "retired", notes: `${loser.notes}\n\nRetired ${c.today}: ${v.why}.`.trim() });
  saveLast(c.folder, "jobs", { ...readState(c.folder), proposing: v.loser });
  const r = ruleOf(c.folder, "kept");
  if (r) later(c.h, c.folder, { source: "the A/B test", kind: `${v.winner} won`, thread: "variants:new", data: { rule: r.id, asked: true, job: "variant", winner: v.winner, loser: v.loser, why: v.why } });
}

async function proposeVariant(c: Ctx, winner: string, loser: string, why: string): Promise<RunOut> {
  const before = new Set(readVariants(c.folder).map((v) => v.name));
  const out = await run(c, { task: variantTask({ winner, loser, why }) });
  const fresh = readVariants(c.folder).find((v) => !before.has(v.name));
  if (!fresh) saveLast(c.folder, "jobs", { ...readState(c.folder), proposing: undefined });
  if (!fresh) return { ...say(out, `${loser} retired; no new variant was written`), report: "ready", card: { title: `${winner} wins; ${loser} retired`, line: why, choices: ["ok"] } };
  if (fresh.status !== "proposed") saveVariant(c.folder, { ...fresh, status: "proposed" });
  return ask(c.folder, c.ticket, { what: "variant", name: fresh.name }, { title: `New variant to try: ${fresh.name}`, line: `${why}; ${loser} is retired. This one changes ${fresh.changes || "one thing"}.`, choices: ["use it", "not now"], body: fileText(join(c.folder, "outreach", "variants", `${fresh.name}.md`)) }, { said: out.said, thread: out.thread, ms: out.ms });
}

// ---- follow-ups at day 5 ----
async function followUps(c: Ctx): Promise<RunOut> {
  const due = followUpsDue(readPeople(c.folder), c.today, 5);
  for (const p of due) {
    savePerson(c.folder, touch(p, c.now, "no reply after 5 days"));
    later(c.h, c.folder, { source: "no reply in 5 days:", kind: p.slug, thread: `person:${p.slug}`, data: { rule: c.rule.id, asked: true, job: "draft", person: p.slug, kind: "follow-up" } });
  }
  return done(due.length ? `follow-ups due: ${due.map((p) => p.slug).join(", ")}` : "no follow-up due");
}

// ---- the SF plan ----
async function plan(c: Ctx): Promise<RunOut> {
  const file = join(c.folder, "sf-trip", "plan.md");
  mkdirSync(join(c.folder, "sf-trip"), { recursive: true });
  const rows = planRows(readPeople(c.folder), parsePlan(fileText(file)));
  writeFileSync(file, planMd(rows));
  if (!rows.some((r) => r.where === "-" || r.ask === "-")) return done(`sf-trip/plan.md: ${rows.length} rows`);
  const out = await run(c, { job: "plan", task: planTask() });
  const after = parsePlan(fileText(file));
  if (after.length < rows.length) writeFileSync(file, planMd(planRows(readPeople(c.folder), after)));   // a row lost by the run comes back
  return { ...say(out, `sf-trip/plan.md: ${rows.length} rows`), report: out.report === "failed" ? "failed" : "ready", card: undefined };
}

// ---- the Sunday lesson ----
async function lesson(c: Ctx): Promise<RunOut> {
  const all = readVariants(c.folder).filter((v) => v.status === "active" || v.status === "retired").map((v) => v.name);
  const ps = readPeople(c.folder);
  const ts = tally(all, ps.map(abRow));
  const numbers = abWords(ts, verdict(ts.filter((t) => liveVariants(c.folder).some((v) => v.name === t.variant))));
  const edits = readEdits(c.folder, c.now - 7 * 86_400_000).slice(-20).map((e) => `${e.person} (${e.variant}, ${e.kind}): ${editLine(e.edit)}`);
  const replies = ps.filter(didReply).map((p) => `${p.name} (${p.variant}): ${p.touches.slice(-3).join("; ")}`);
  const file = `lessons/${c.today}.md`;
  mkdirSync(join(c.folder, "lessons"), { recursive: true });
  const out = await run(c, { job: "lesson", task: lessonTask({ file, numbers, edits, replies }) });
  const text = fileText(join(c.folder, file));
  if (!text) return { ...say(out, `${file} was not written`), report: "failed", card: undefined };
  const practise = /^\s*[-*]?\s*practi[sc]e:\s*(.+)$/im.exec(text)?.[1] ?? numbers.at(-1)!;
  return ask(c.folder, c.ticket, { what: "note" }, { title: "This week's lesson", line: practise, choices: ["got it"], body: text }, { said: out.said, thread: out.thread, ms: out.ms });
}

// ---- applications ----
async function postings(c: Ctx): Promise<RunOut> {
  ensureResumeDir(c.folder);
  if (!hasResume(c.folder)) {
    const open = readTickets(c.folder).some((t) => t.state !== "ended" && t.subscriptions.includes("resume:empty"));
    if (!open) later(c.h, c.folder, { source: "resume/", kind: "is empty", thread: "resume:empty", data: { rule: c.rule.id, asked: true, job: "resume-card" } });
  }
  const before = new Set(readApps(c.folder).map((a) => a.slug));
  const out = await run(c, { job: "postings", task: postingsTask({ n: 8, known: [...before], resume: hasResume(c.folder) }) });
  const fresh = readApps(c.folder).filter((a) => !before.has(a.slug) && a.state === "found");
  const worth = jobsHooks.worth === undefined ? makeWorth() : jobsHooks.worth;
  const me = fileText(join(c.folder, "me.md"));
  const weighed = [];
  for (const a of fresh) {
    const p = worth ? await worth(me, fileText(join(c.folder, "applications", a.slug, "posting.md"))) : null;
    if (p !== null) setApp(c.folder, a.slug, { jev: p.toFixed(2) });
    weighed.push({ slug: a.slug, score: scoreOf(a), jev: p });
  }
  const { take, pass } = pick(weighed, 3);
  for (const x of pass) setApp(c.folder, x.slug, { state: "passed", next: `none: ${x.why}` });
  for (const s of take) {
    setApp(c.folder, s, { next: "answers being drafted" });
    later(c.h, c.folder, { source: "worth your time:", kind: s, thread: `application:${s}`, data: { rule: c.rule.id, asked: true, job: "application", app: s } });
  }
  writeBoard(c.folder);
  return { ...say(out, `postings: ${fresh.length} new; drafting ${take.join(", ") || "none"}; passed ${pass.map((x) => `${x.slug} (${x.why})`).join(", ") || "none"}`), report: out.report === "failed" ? "failed" : "ready", card: undefined };
}
async function application(c: Ctx, slug: string): Promise<RunOut> {
  const a = readApp(c.folder, slug);
  if (!a) return done(`no application ${slug}`);
  const cover = /^y/i.test(a.cover);
  const out = await run(c, { job: "application", app: slug, task: applicationTask({ slug, cover, resume: hasResume(c.folder) }) });
  const now = readApp(c.folder, slug)!;
  const missing = ["posting.md", "fit.md", "answers.md", ...(cover ? ["cover.md"] : [])].filter((f) => !now.files.includes(f));
  if (missing.length) { setApp(c.folder, slug, { next: `missing ${missing.join(", ")}` }); writeBoard(c.folder); return { ...say(out, `applications/${slug}: missing ${missing.join(", ")}`), report: "failed", card: undefined }; }
  setApp(c.folder, slug, { state: "drafted", next: "open the form, apply yourself, press applied" });
  writeBoard(c.folder);
  return ask(c.folder, c.ticket, { what: "apply", app: slug }, applyCard(c.folder, slug), { said: out.said, thread: out.thread, ms: out.ms });
}
function applyCard(folder: string, slug: string): Omit<Card, "ticketId"> {
  const a = readApp(folder, slug)!;
  const posting = fileText(join(folder, "applications", slug, "posting.md"));
  const fit = stripHead(fileText(join(folder, "applications", slug, "fit.md"))).split("\n").filter((l) => l.trim()).slice(0, 6).join("\n");
  return {
    title: applyTitle(a, postingTitle(posting)),
    line: `${a.link ? `${a.link}. ` : ""}Answers in applications/${slug}/answers.md${a.files.includes("cover.md") ? " and cover.md" : ""}. You fill and submit the form; the agent never does.`,
    choices: ["open the form", "applied", "skip"],
    body: fit,
  };
}
const resumeCardOf = (still = false): Omit<Card, "ticketId"> => ({
  title: "Put your résumé PDF in jobs/resume/",
  line: still ? "resume/ is still empty. The drafts are written from me.md until it is there." : "The application drafts are written from me.md until it is there; once it is, me.md's facts and each fit.md are redone.",
  choices: ["done", "later"],
});
async function resumeCard(c: Ctx): Promise<RunOut> {
  if (hasResume(c.folder)) return done("a résumé is in resume/");
  return ask(c.folder, c.ticket, { what: "resume" }, resumeCardOf(), { report: "blocked" });
}
async function resume(c: Ctx): Promise<RunOut> {
  const files = ((c.trig.data as any).files as string[] | undefined) ?? [];
  const file = files.find((f) => f.startsWith("resume/")) ?? files[0] ?? (readdirSync(join(c.folder, "resume")).filter((n) => !n.startsWith("."))[0] ? `resume/${readdirSync(join(c.folder, "resume")).filter((n) => !n.startsWith("."))[0]}` : "");
  if (!file) return done("resume/ is empty");
  const open = readApps(c.folder).filter((a) => a.state === "found" || a.state === "drafted").map((a) => a.slug);
  const out = await run(c, { job: "resume", task: resumeTask({ file, open }) });
  for (const t of readTickets(c.folder).filter((t) => t.state !== "ended" && t.subscriptions.includes("resume:empty"))) setAsk(c.folder, t.id, null);
  return ask(c.folder, c.ticket, { what: "note" }, { title: "Résumé read", line: `${file} is in me.md's facts; fit.md redone for ${open.length} open application${open.length === 1 ? "" : "s"}.`, choices: ["ok"] }, { said: out.said, thread: out.thread, ms: out.ms, report: out.report === "failed" ? "failed" : "ready" });
}

/** the mail source's door (the other builder's sources/mail.ts): a reply from this person was seen. Lands as the
 *  "replied" press on the person's open ticket; with no open ticket, the person's file is moved directly */
export async function noteReply(h: Host & { answer: (ticketId: string, choice: string) => Promise<unknown> }, folder: string, slug: string): Promise<boolean> {
  const t = readTickets(folder).find((x) => x.state !== "ended" && x.subscriptions.includes(`person:${slug}`));
  if (t) { await h.answer(t.id, "replied"); return true; }
  const p = readPerson(folder, slug);
  const m = p && move(p, "replied", (h.d.now ?? Date.now)(), "replied (seen in mail)");
  if (m) savePerson(folder, m);
  return !!m;
}

