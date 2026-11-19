// Tickets (the superagent model in Sol's engine, first sitting 2026-11-12; mine/notes/2026-11-07-superagent-sessions.md).
// A ticket is one piece of work: the person's ask, its mandate (what may be done, how far), its state, its log and who
// hears of it. It lives in a file apart from any session, so a session's talk can fill, end or be replaced and nothing
// is lost: the ticket owns the state. One executor session works a ticket at a time, in its own folder, started and
// resumed from the ticket (executor.ts). An orchestration session with tickets on (one.ts, `build.tickets`) routes the
// person's words to tickets and holds only a short summary of them.
//
// This file is the contract between the three: types only, no code. tickets.ts implements `Store`; executor.ts takes a
// `Store` through its deps and implements `Door`; one.ts takes a `Door` through its deps.
//
//   <STATE_DIR>/tickets/<id>.json          the ticket (written whole, tmp + rename)
//   <STATE_DIR>/tickets/<id>/work/         its executor's own folder, when the work has no project folder of its own

/** open: no executor yet or none at work · working: its executor is in a turn · waiting: on the person (waitsOn says
 *  for what) · done · dropped. done and dropped are closed: no executor is started or woken for them. */
export type TicketState = "open" | "working" | "waiting" | "done" | "dropped";
export const CLOSED: readonly TicketState[] = ["done", "dropped"];

/** what may be done, how far. `until` is where the work stops and comes back ("a draft PR, never a merge").
 *  `where` is the project folder the work is about; `free` is how the executor works there: ask before every step, or
 *  change files in its own folder on its own (commands still ask). */
export type Mandate = { may: string[]; mayNot: string[]; until: string; where?: string; free: "ask" | "edits" };

export type By = "person" | "orchestrator" | "executor" | "engine";
/** opened · words (said to the ticket) · report (its executor ended a turn: what it said, cut) · note (the executor
 *  wrote down what it did or learned) · state · mandate · executor (started, resumed, replaced, stopped) */
export type LogKind = "opened" | "words" | "report" | "note" | "state" | "mandate" | "executor";
export type LogLine = { at: number; by: By; kind: LogKind; text: string; session?: string };

/** who hears of the ticket, and what later talk reaches it without anyone naming it again. This sitting only
 *  `session` is used (key = a session id: that session hears the ticket's reports); `thread` and `issue` are kept
 *  for the sources that come later (GitHub, mail) and are stored and looked up the same way. */
export type Sub = { kind: "session" | "thread" | "issue"; key: string; at: number };

/** the session working the ticket now: its id, its folder, when it started, and which copy it is (1 = the first) */
export type Executor = { sessionId: string; cwd: string; at: number; n: number; context?: number; window?: number };
/** a copy that was replaced: how full it was, why, and whether it wrote its closing note */
export type Past = { sessionId: string; from: number; to: number; context: number; window: number; why: "full" | "asked" | "lost"; noted: boolean };

export type Ticket = {
  id: string;            // 8 hex
  n: number;             // a short number a person can say: "ticket 3"
  title: string;         // <= 80
  ask: string;           // the person's words, verbatim, <= 4000
  mandate: Mandate;
  state: TicketState;
  waitsOn?: string;      // state waiting: what it waits on, in a person's words
  summary: string;       // one line, <= 160: where it stands now
  log: LogLine[];        // newest last, capped (LOG_CAP); lines pushed out go to <id>.log.jsonl
  subs: Sub[];
  executor?: Executor;
  past: Past[];
  at: number; updatedAt: number;
};

export type OpenIn = { title: string; ask: string; mandate?: Partial<Mandate>; by?: By; sub?: Sub["key"] /* a session that hears of it */ };

/** tickets.ts: the file store. Every write is whole and atomic; every change calls the listeners. Sync. */
export type Store = {
  open(a: OpenIn): Ticket;
  get(id: string | number): Ticket | undefined;        // by id, or by number ("3", 3, "#3", "ticket 3")
  list(f?: { closed?: boolean }): Ticket[];            // newest updated first; closed ones only when asked
  /** the tickets a line of talk could mean: by number, id, or words of the title and ask; best first */
  find(q: string): Ticket[];
  log(id: string, line: Omit<LogLine, "at">): Ticket;
  setState(id: string, s: { state: TicketState; summary?: string; waitsOn?: string; by: By }): Ticket;
  setMandate(id: string, patch: Partial<Mandate>, by: By): Ticket;
  /** a new executor for the ticket; the one before it (if any) goes to `past` with why it was replaced */
  setExecutor(id: string, e: { sessionId: string; cwd: string } | null, was?: { why: Past["why"]; noted: boolean }): Ticket;
  /** the folder the current executor really works in, once known (the engine's side copy of a repo is not `where`);
   *  a fresh copy starts there. Only an absolute path; nothing changes without a current executor (join, 2026-11-12) */
  setCwd(id: string, cwd: string): Ticket;
  /** how full the executor's talk is, from its last ended turn */
  setFill(id: string, context: number, window: number): Ticket;
  subscribe(id: string, sub: Omit<Sub, "at">): Ticket;
  unsubscribe(id: string, sub: Omit<Sub, "at">): Ticket;
  subscribed(kind: Sub["kind"], key: string): Ticket[];
  /** every subscription of one key moved to another (an orchestration session renewed: its fresh copy hears what the old one heard) */
  repoint(kind: Sub["kind"], from: string, to: string): number;
  /** the ticket whose executor (now) is this session */
  ofSession(sessionId: string): Ticket | undefined;
  /** the ticket as an executor starts from it: title, the ask verbatim, the mandate, state and summary, then the log's
   *  tail (notes first), under `max` letters (default 6000). All a fresh executor knows. `next`: read for the copy that
   *  is about to replace the current one, before `setExecutor` records it (a live replacement keeps the old one until
   *  the fresh one has started): it says the copy number `setExecutor` will then give, and why (join, 2026-11-12) */
  brief(id: string, max?: number, next?: { why: Past["why"]; noted: boolean }): string;
  /** what an orchestration session holds: one line per open ticket ("#3 [working] title: summary"), waiting ones first, and a count
   *  of the closed ones; never more than `max` letters (default 1200) however many tickets there are */
  summary(max?: number): string;
  onChange(fn: (t: Ticket) => void): () => void;
  /** for the tests: forget what was read */
  _reload(): void;
};

/** executor.ts: what an orchestration session (and the wire) may do with tickets. Every call here is the engine acting; the session
 *  never talks to an executor session directly. */
export type Door = {
  /** a new ticket, its executor started from it; returns the ticket */
  open(from: string, a: OpenIn): Promise<Ticket>;
  /** words to an existing ticket: logged, then said to its executor (started or resumed from the ticket when there is
   *  none alive); refused for a closed ticket unless `reopen`. `from` a session not yet subscribed (a renewed or second
   *  orchestration session) is subscribed, so it hears the answer; "person" is no session and is not */
  send(from: string, ticket: string, words: string, o?: { reopen?: boolean }): Promise<Ticket>;
  /** done or dropped: its executor's turn is stopped, the ticket closed, nothing deleted */
  close(from: string, ticket: string, state: "done" | "dropped", summary?: string): Promise<Ticket>;
  /** change the mandate; the executor is told as a turn */
  mandate(from: string, ticket: string, patch: Partial<Mandate>): Promise<Ticket>;
  /** replace the executor now by a fresh one from the ticket (the person asked) */
  replace(ticket: string): Promise<Ticket>;
  summary(max?: number): string;
  read(ticket: string, max?: number): string;          // one ticket whole, as text (Store.brief)
  find(q: string): Ticket[];
  /** the tickets themselves, for the faces (Store.list; join, 2026-11-12) */
  list(f?: { closed?: boolean }): Ticket[];
  /** an orchestration session renewed: what the old copy heard, the fresh one hears */
  repoint(from: string, to: string): number;
};
