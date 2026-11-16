// Jev, all day (#803, plan Part C slice 40; flows.md "Jev, all day", scene 8; "Decisions" 8: a suggested threshold
// comes only from his own overrides), behind sol.home.whole. Face half; the engine half is #832 (Frank's). The pure half
// and its stub: a day of Jev's reads (each a probability against its question's line: through at or above it, held
// below it, and where you overrode it), one row per question with its distribution and its line, the counts of what
// would pass at a line, and the one suggestion an override earns. Nothing here draws; JevAllDay.tsx does.
//
// Stubbed until #832 lands: `stub()` answers `judge.reads {day}` and `judge.line.set {questionId, line}` (flows.md's
// messages), and `home.undo {ledgerId}`, with one `judge.reads` message of the shape below (flows.md's JudgeQuestion
// and JudgeRead).

/** a question Jev asks (flows.md JudgeQuestion {id, flowId, type, instructions, criteria, line}); `where` names the
 *  flow or the place that asks it */
export type JudgeQuestion = { id: string; flowId: string; where: string; type: "choice" | "noul" | "score"; text: string; line: number };
/** a read (flows.md JudgeRead {at, questionId, thingId, p, line, verdict, overriddenBy?}); `label` what was read;
 *  `overriddenBy` the person's word against Jev's verdict, and whether it turned out a yes */
export type JudgeRead = { at: number; questionId: string; thingId: string; label: string; p: number; line: number; verdict: "through" | "guess" | "held";
  overriddenBy?: { to: "through" | "held"; outcome?: "yes" | "no" } };
export type JudgeDone = { ledgerId: string; line: string };
/** the engine's message after every ask (#832) */
export type JudgeMsg = { type: "judge.reads"; day: number; questions: JudgeQuestion[]; reads: JudgeRead[]; done: JudgeDone | null };
export type JudgeAsk = { type: "judge.reads"; day?: number } | { type: "judge.line.set"; questionId: string; line: number } | { type: "home.undo"; ledgerId: string };

/** the verdict at a line (#755's judge: through at or above the line, a guess down to .45, else held) */
export const verdictAt = (p: number, line: number): JudgeRead["verdict"] => (p >= line ? "through" : p >= 0.45 ? "guess" : "held");
/** what would pass at a line (pure): the reads at or above it; the rest are held */
export function countsAt(reads: JudgeRead[], line: number): { through: number; held: number; you: number } {
  const through = reads.filter((r) => r.p >= line).length;
  return { through, held: reads.length - through, you: reads.filter((r) => r.overriddenBy).length };
}
/** the day's one line (scene 8: "Jev read 101 things today. It let 30 through, held 71; you overrode it 4 times.") */
export function dayLine(qs: JudgeQuestion[], reads: JudgeRead[]): [string, string] {
  let through = 0;
  for (const q of qs) through += countsAt(reads.filter((r) => r.questionId === q.id), q.line).through;
  const you = reads.filter((r) => r.overriddenBy).length;
  return [`Jev read ${reads.length} things today.`, `It let ${through} through, held ${reads.length - through}; you overrode it ${you} ${you === 1 ? "time" : "times"}.`];
}
/** a line as the page writes it: .70 */
export const lineWord = (l: number) => (l >= 1 ? "1.00" : l.toFixed(2).replace(/^0/, ""));
/** the one suggestion (flows.md "Decisions" 8): only from an override: you let through something Jev held and it was a
 *  yes, so lower the line to just under it; or you held something Jev let through and it was a no, so raise it just
 *  over. Nothing else ever suggests a line. */
export function suggestionOf(q: JudgeQuestion, reads: JudgeRead[]): { line: number; because: JudgeRead } | null {
  const mine = reads.filter((r) => r.questionId === q.id && r.overriddenBy?.outcome);
  const yes = mine.filter((r) => r.overriddenBy!.to === "through" && r.overriddenBy!.outcome === "yes" && r.p < q.line).sort((a, b) => a.p - b.p)[0];
  if (yes) return { line: Math.floor((yes.p - 0.005) * 100) / 100, because: yes };
  const no = mine.filter((r) => r.overriddenBy!.to === "held" && r.overriddenBy!.outcome === "no" && r.p >= q.line).sort((a, b) => b.p - a.p)[0];
  if (no) return { line: Math.ceil((no.p + 0.005) * 100) / 100, because: no };
  return null;
}
/** the suggestion in words (scene 8: "You let through one posting Jev held (Datadog, .66), and it was a yes. Lower …") */
export function suggestionWords(q: JudgeQuestion, s: { line: number; because: JudgeRead }): string {
  const b = s.because, down = s.line < q.line;
  return down ? `You let through ${b.label}, which Jev held at ${lineWord(b.p)}, and it was a yes. Lower “${q.text}” to ${lineWord(s.line)}?`
    : `You held ${b.label}, which Jev let through at ${lineWord(b.p)}, and it was a no. Raise “${q.text}” to ${lineWord(s.line)}?`;
}
/** clamp and round a dragged line (pure) */
export const snap = (l: number) => Math.min(0.95, Math.max(0.05, Math.round(l * 100) / 100));

// ── the stub (until #832) ────────────────────────────────────────────────────────────────────────────────────────
export const QUESTIONS: JudgeQuestion[] = [
  { id: "q-posting", flowId: "applications", where: "applications", type: "choice", text: "Is this posting for you?", line: 0.7 },
  { id: "q-draft", flowId: "applications", where: "applications", type: "noul", text: "Is the draft ready for you?", line: 0.8 },
  { id: "q-todo", flowId: "school", where: "school", type: "choice", text: "Is this something to do?", line: 0.7 },
  { id: "q-touch", flowId: "follow-ups", where: "follow-ups", type: "noul", text: "Someone to keep in touch with?", line: 0.7 },
  { id: "q-read", flowId: "home", where: "the box", type: "choice", text: "Which of the five reads?", line: 0.7 },
  { id: "q-fix", flowId: "calendar", where: "the calendar", type: "choice", text: "Which fix is most like you?", line: 0.7 },
];
/** scene 8's day: per question, how many went through and how many were held (101 in all, 30 through, 71 held) */
const COUNTS: Record<string, [number, number]> = { "q-posting": [3, 38], "q-draft": [6, 3], "q-todo": [4, 19], "q-touch": [3, 3], "q-read": [11, 7], "q-fix": [3, 1] };
/** a steady pseudo-random, so the day is the same every time it is drawn */
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
export function seedReads(now: number): JudgeRead[] {
  const d = new Date(now), from = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 7, 30).getTime(), span = Math.max(36e5, now - from);
  const r = rng(803), out: JudgeRead[] = [];
  for (const q of QUESTIONS) {
    const [through, held] = COUNTS[q.id];
    for (let i = 0; i < through + held; i++) {
      const p = i < through ? q.line + (1 - q.line) * (0.05 + 0.9 * r()) : q.line * (0.08 + 0.9 * r());
      out.push({ at: from + Math.floor(r() * span), questionId: q.id, thingId: `${q.id}-${i}`, label: `${q.where} read ${i + 1}`, p: Math.round(p * 100) / 100, line: q.line, verdict: verdictAt(p, q.line) });
    }
  }
  // the four overrides of scene 8: a posting Jev held that you let through, and it was a yes (Datadog, .66); one more
  // in follow-ups; two in the box
  const set = (qid: string, nth: number, change: Partial<JudgeRead>) => { const x = out.filter((y) => y.questionId === qid)[nth]; Object.assign(x, change); };
  set("q-posting", 3 + 5, { label: "Datadog", p: 0.66, verdict: "guess", overriddenBy: { to: "through", outcome: "yes" } });
  set("q-touch", 3 + 1, { label: "Priya, from the career fair", p: 0.58, verdict: "guess", overriddenBy: { to: "through" } });
  set("q-read", 11 + 2, { label: "“call the dentist”", p: 0.52, verdict: "guess", overriddenBy: { to: "through" } });
  set("q-read", 11 + 3, { label: "“lunch with Maya”", p: 0.5, verdict: "guess", overriddenBy: { to: "through" } });
  return out.sort((a, b) => a.at - b.at);
}

export function stub(now: () => number = Date.now) {
  let questions = QUESTIONS.map((q) => ({ ...q }));
  const reads = seedReads(now());
  const kept = new Map<string, JudgeQuestion[]>();
  let n = 0;
  // the receipt standing now: a set at the line a question already has changes nothing, so it keeps this one and its undo
  let last: JudgeDone | null = null;
  const day = () => { const d = new Date(now()); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const msg = (done: JudgeDone | null): JudgeMsg => ({ type: "judge.reads", day: day(), questions, reads, done });
  return (a: JudgeAsk): JudgeMsg => {
    if (a.type === "judge.reads") return msg(last);
    if (a.type === "home.undo") { const was = kept.get(a.ledgerId); if (was) { questions = was; kept.delete(a.ledgerId); if (last?.ledgerId === a.ledgerId) last = null; } return msg(last); }
    const q = questions.find((x) => x.id === a.questionId);
    const line = snap(a.line);
    if (!q || q.line === line) return msg(last);
    const ledgerId = `j${++n}`;
    kept.set(ledgerId, questions);
    const mine = reads.filter((r) => r.questionId === q.id), was = countsAt(mine, q.line).through, will = countsAt(mine, line).through;
    questions = questions.map((x) => (x.id === q.id ? { ...x, line } : x));
    last = { ledgerId, line: `“${q.text}” at ${lineWord(line)}: ${will} would have passed today, ${was} did at ${lineWord(q.line)} · from now on` };
    return msg(last);
  };
}
