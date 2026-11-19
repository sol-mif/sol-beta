// The folder's agent, in plain objects (step 1, record-only). A folder with a policy.md is an agent that lives there:
// its policy is a list of rules, a source (the clock, the folder, Blackboard) brings a trigger, the judge decides
// whether a rule covers it, the trigger opens a ticket (or lands on the open ticket that follows its thread), the
// ticket is worked in runs, each run ends with a report, and every step is a ledger line.
//
//   source → trigger → judge → policy (the rule, its mode and rung) → ticket → run → ledger
//
// This file is pure: no disk, no network, no clock of its own (every time is handed in). store.ts keeps the objects on
// disk, run.ts runs a ticket's turn in Codex, sources/ make triggers. Modes: off (the rule sleeps), watch (everything
// runs, but the card is marked wouldHave and nothing leaves the folder), do (the card is shown to the person).

export const MODES = ["off", "watch", "do"] as const;
export type Mode = (typeof MODES)[number];
/** how far a rule may go: read (look and record), propose (say what it would do), draft (make it, the person sends) */
export const RUNGS = ["read", "propose", "draft"] as const;
export type Rung = (typeof RUNGS)[number];
export const REPORTS = ["progress", "waiting", "ready", "blocked", "failed"] as const;
export type Report = (typeof REPORTS)[number];
export type State = "open" | "waiting" | "ended";

/** one bullet of policy.md: `- [watch] blackboard: every night at 03:00 read the course …` */
export type Rule = { id: string; sentence: string; source: string; mode: Mode; rung: Rung };
/** something a source saw. `thread` names what it is about, so a later trigger on the same subject finds its ticket */
export type Trigger = { id: string; at: number; source: string; kind: string; data: Record<string, unknown>; thread: string };
/** what a ticket needs from the person: a title, one line, the choices as buttons. wouldHave: watch mode, never shown */
export type Card = { ticketId: string; title: string; line: string; choices: string[]; wouldHave?: boolean; body?: string; items?: { key: string; line: string; choices: string[] }[] };   // body, items: jobs/ (a draft shown whole; a choice per person)
/** one turn of work on a ticket */
export type Run = { at: number; trigger: string; report: Report; said: string; ms?: number; thread?: string };
/** one line of what happened: what was read, what was made, what was held back (watch mode holds the card) */
export type LedgerLine = { at: number; ticket?: string; rule?: string; read: string; made: string; held: string };
export type Ticket = {
  id: string; folder: string; rule: string; thread: string; state: State;
  /** what the rule allowed when the ticket opened: its rung, and the policy.md it was read from (a short hash) */
  mandate: { rung: Rung; mode: Mode; policyVersion: string };
  needs?: Card;
  /** the threads whose triggers land on this ticket: its own (`ticket:<id>`, where the person's answers come) and its trigger's */
  subscriptions: string[];
  triggers: Trigger[];
  runs: Run[];
  ledger: LedgerLine[];
  opened: number;
};

/** Jev's read, handed in: the probability that the rule covers the trigger, or null when Jev could not be asked */
export type Jev = (q: { rule: Rule; trigger: Trigger }) => Promise<number | null>;
export type Decision =
  | { decision: "accept"; rule: Rule; why: string; p?: number }
  | { decision: "ignore"; rule?: Rule; why: string; p?: number };
/** Jev's line for a rule: at or above it, the trigger is taken (low: a record-only run is cheap, a missed one is not) */
export const LINE = 0.45;

/** the rules a trigger could be for: the same source, not off; a trigger that names its rule (agent.run, an answer) only that one */
export function candidates(trigger: Trigger, rules: Rule[]): Rule[] {
  const named = typeof trigger.data.rule === "string" ? trigger.data.rule : null;
  return rules.filter((r) => r.mode !== "off" && (named ? r.id === named : r.source === trigger.source));
}

/** judge: is there a rule for this trigger? Code picks the candidates (the rule a source names, else every rule of its
 *  source); Jev, when there is one, weighs what the source saw against each. What the person asked for (agent.run,
 *  data.asked) and what needs him (a sign-in, his answer) is always taken */
export async function judge(trigger: Trigger, rules: Rule[], jev?: Jev | null): Promise<Decision> {
  const named = typeof trigger.data.rule === "string" ? trigger.data.rule : null;
  if (named) {
    const r = rules.find((x) => x.id === named);
    if (!r) return { decision: "ignore", why: `no rule ${named} in policy.md` };
    if (r.mode === "off") return { decision: "ignore", rule: r, why: `${r.id} is off` };
  }
  const list = candidates(trigger, rules);
  if (!list.length) return { decision: "ignore", why: `no rule watches ${trigger.source}` };
  if (trigger.data.asked === true) return { decision: "accept", rule: list[0], why: "asked for now" };
  if (trigger.kind === "needs-sign-in" || trigger.kind === "answer") return { decision: "accept", rule: list[0], why: trigger.kind };
  if (!jev) return { decision: "accept", rule: list[0], why: "the rule's source (no Jev)" };
  let best: { rule: Rule; p: number } | null = null, asked = false;
  for (const rule of list) {
    const p = await jev({ rule, trigger });
    if (p === null) continue;
    asked = true;
    if (!best || p > best.p) best = { rule, p };
  }
  if (!asked) return { decision: "accept", rule: list[0], why: "the rule's source (Jev did not answer)" };
  return best && best.p >= LINE
    ? { decision: "accept", rule: best.rule, p: best.p, why: `Jev ${best.p.toFixed(2)} ≥ ${LINE}` }
    : { decision: "ignore", rule: best?.rule, p: best?.p, why: `Jev ${best?.p.toFixed(2)} < ${LINE}` };
}

/** route: a trigger on a thread an open ticket follows lands on that ticket (no new one); else null, a new ticket */
export function route(trigger: Trigger, tickets: Ticket[]): Ticket | null {
  return tickets.find((t) => t.state !== "ended" && t.subscriptions.includes(trigger.thread)) ?? null;
}

/** open a ticket for a trigger under a rule */
export function open(a: { id: string; folder: string; rule: Rule; trigger: Trigger; policyVersion: string }): Ticket {
  return {
    id: a.id, folder: a.folder, rule: a.rule.id, thread: a.trigger.thread, state: "open",
    mandate: { rung: a.rule.rung, mode: a.rule.mode, policyVersion: a.policyVersion },
    subscriptions: [...new Set([`ticket:${a.id}`, a.trigger.thread])],
    triggers: [a.trigger], runs: [], ledger: [], opened: a.trigger.at,
  };
}

/** a trigger landing on a ticket it follows: kept, and a waiting ticket is open again (the answer came) */
export function land(t: Ticket, trigger: Trigger): Ticket {
  return { ...t, state: t.state === "waiting" ? "open" : t.state, needs: trigger.kind === "answer" ? undefined : t.needs, triggers: [...t.triggers, trigger] };
}

/** report: a run's end moves the ticket. waiting and blocked need the person (a card); ready with a card waits for his
 *  look, ready without one ends; progress and failed stay open. In watch mode the card is marked wouldHave */
export function report(t: Ticket, r: { report: Report; card?: Omit<Card, "ticketId" | "wouldHave"> | null; at: number; trigger: string; said?: string; ms?: number; thread?: string }): Ticket {
  const card: Card | undefined = r.card ? { ...r.card, ticketId: t.id, choices: r.card.choices?.length ? r.card.choices.slice(0, 4) : ["ok"], ...(t.mandate.mode === "watch" ? { wouldHave: true } : {}) } : undefined;
  const state: State = r.report === "waiting" || r.report === "blocked" ? "waiting" : r.report === "ready" ? (card ? "waiting" : "ended") : "open";
  const run: Run = { at: r.at, trigger: r.trigger, report: r.report, said: (r.said ?? "").slice(0, 2000), ...(r.ms !== undefined ? { ms: r.ms } : {}), ...(r.thread ? { thread: r.thread } : {}) };
  return { ...t, state, needs: state === "waiting" ? card ?? t.needs : undefined, runs: [...t.runs, run] };
}

/** a ledger line on a ticket (store.ts also writes it to the folder's ledger) */
export function note(t: Ticket, line: LedgerLine): Ticket {
  return { ...t, ledger: [...t.ledger, line] };
}

/** what the card holds back in watch mode, as the ledger's "held" */
export const heldOf = (t: Ticket): string => (t.needs ? `${t.needs.wouldHave ? "would have shown" : "shows"} "${t.needs.title}"` : "nothing");

/** the cards that need the person: in do mode the real ones; watch mode's wouldHave cards too, for the try page */
export const cardsOf = (tickets: Ticket[]): Card[] => tickets.filter((t) => t.state === "waiting" && t.needs).map((t) => t.needs!);

/** the last JSON line of a turn's answer: { report, card? } (the run's contract); null when there is none */
export function parseReport(answer: string): { report: Report; card?: Omit<Card, "ticketId"> } | null {
  const lines = answer.trim().split("\n").map((l) => l.trim()).filter(Boolean).reverse();
  for (const l of lines.slice(0, 6)) {
    const s = l.replace(/^```(json)?|```$/g, "").trim();
    if (!s.startsWith("{")) continue;
    try {
      const j = JSON.parse(s) as { report?: unknown; card?: any };
      if (!REPORTS.includes(j.report as Report)) continue;
      const c = j.card;
      const card = c && typeof c === "object" && typeof c.title === "string"
        ? { title: c.title.slice(0, 120), line: String(c.line ?? "").slice(0, 400), choices: Array.isArray(c.choices) ? c.choices.map(String).filter(Boolean).slice(0, 4) : [] }
        : undefined;
      return { report: j.report as Report, ...(card ? { card } : {}) };
    } catch { /* not this line */ }
  }
  return null;
}
