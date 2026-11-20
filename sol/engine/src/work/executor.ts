// Executors: one session per ticket (the superagent model, first sitting 2026-11-12; the contract: ticketTypes.ts). A
// ticket's work is done by one executor session at a time, in its own folder, started from the ticket's brief. It
// writes what it did into the ticket as it goes (ticket_note) and ends each turn by setting the ticket's state
// (ticket_state); its talk is never what lasts. When its talk fills (REPLACE_AT of its window) it is asked for its
// closing notes and a fresh copy starts from the ticket alone, in the same folder. Its reports go, short and batched,
// to the sessions subscribed to the ticket (an orchestration session); nothing here ever talks to the person.
//
// This file implements `Door` over a `Store` (tickets.ts) it is given; it keeps nothing on disk of its own. In memory
// only: which executor was asked for its closing notes (also written in the ticket's log, so wake() finds it again),
// which called ticket_state this turn, and the reports waiting for their batch.
//
//   <STATE_DIR>/tickets/<id>/work/   the executor's folder when the mandate names no project folder (made here)
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { STATE_DIR } from "./state.js";
import { giveTool, takeTool } from "./tools.js";
import { endsAsking, type RunLike } from "./one.js";
import { CLOSED, type Door, type Mandate, type OpenIn, type Past, type Store, type Ticket, type TicketState } from "./ticketTypes.js";

/** how full (of its window) an executor's talk may get before a fresh copy replaces it */
export const REPLACE_AT = 0.6;
/** how long the old copy has to write its closing notes before the fresh one starts anyway */
export const REPLACE_WAIT_MS = 5 * 60_000;
/** reports to one subscriber within this time go as one turn */
export const BATCH_MS = 2500;
/** the two waits, as the code reads them: a test shortens them here */
export const delays = { batch: BATCH_MS, replaceWait: REPLACE_WAIT_MS };
/** what a subscriber hears of one ticket's report, at most (waiting ones only), and of one batch, at most */
export const REPORT_CUT = 600, BATCH_CUT = 3000;
/** how long a batch waits on a subscriber that is holding (a renewal that never ends is not waited on for ever) */
export const HOLD_MAX_MS = 10 * 60_000;

// ---- what the engine gives this file (the join wires it in wire.ts), so nothing here imports wire.ts
export type ExecDeps = {
  store: Store;
  /** say to a session as a turn; `fresh` starts a new session with that id in that folder; worktree: a side copy of the repo at cwd */
  /** `how.from`: the session the ticket was opened from (its first session subscriber), whose own mode the executor starts on when that is bypass */
  say: (sessionId: string, text: string, fresh?: { cwd: string; worktree?: boolean }, how?: { free?: "ask" | "edits"; from?: string }) => Promise<void>;
  run: (id: string) => RunLike | undefined;
  /** the session's transcript is still there (resumable) */
  exists: (id: string) => Promise<boolean>;
  lastWords: (id: string) => Promise<string>;
  isRepo: (dir: string) => boolean;
  tell: (m: object) => void;   // every face: { type: "work.tickets", ... }
  name?: (sessionId: string, title: string) => Promise<void>;
  /** the folder a session really works in (its side copy when the engine made one), when its run is gone: recorded on
   *  the ticket (Store.setCwd) so a fresh copy starts there and never in the repo the side copy was made from */
  cwdOf?: (sessionId: string) => Promise<string | undefined>;
  /** a subscriber that must not be said to now (an orchestration session writing its handover): its batch waits, and goes to whoever
   *  holds the subscription once it is over (the fresh copy, after repoint) */
  holding?: (sessionId: string) => boolean;
};
let deps: ExecDeps | null = null;
let unhook: (() => void) | null = null;
export const setExecDeps = (d: ExecDeps) => {
  unhook?.(); deps = d;
  // every change of a ticket reaches the faces: once per tick however many writes one step made
  unhook = d.store.onChange(() => tellSoon());
};
const need = () => { if (!deps) throw new Error("the executors are not wired yet"); return deps; };

// ---- in memory
type Replacing = { session: string; why: "full" | "asked"; at: number; noted: boolean; timer?: NodeJS.Timeout; failed?: boolean };
const replacing = new Map<string, Replacing>();   // ticket id → its executor asked for closing notes
const stated = new Set<string>();                 // executor sessions that called ticket_state in this turn
const finishing = new Map<string, Promise<void>>(); // ticket ids whose fresh copy is being started, and when it is
type Batch = { lines: Map<string, { line: string; was: string[] }>; timer: NodeJS.Timeout; held?: number };   // was: who heard it then
const batches = new Map<string, Batch>();         // subscriber session → its reports waiting for the batch
const hushed = new Set<string>();                 // executor sessions whose ticket the door closed: their stopped turn reports nothing
const learned = new Set<string>();                // executor sessions whose real folder was looked for
let telling = false;
/** for the tests: forget everything in memory, as an engine restart does */
export const _reload = () => {
  for (const r of replacing.values()) clearTimeout(r.timer);
  for (const b of batches.values()) clearTimeout(b.timer);
  replacing.clear(); stated.clear(); finishing.clear(); batches.clear(); hushed.clear(); learned.clear(); telling = false;
};

const isClosed = (s: TicketState) => CLOSED.includes(s);
const resolve = (ticket: string): Ticket => { const t = need().store.get(ticket); if (!t) throw new Error(`no ticket ${ticket}`); return t; };
const byOf = (from: string) => (from === "person" ? "person" as const : "orchestrator" as const);
const cut = (s: string, n: number) => { const t = s.trim(); return t.length <= n ? t : `${t.slice(0, n - 1)}…`; };
const plain = (s: string) => s.replace(/```[\s\S]*?```/g, " ").replace(/[#*_`>|]/g, "").replace(/\s+/g, " ").trim();
const firstLine = (s: string) => cut(plain(s.split("\n").find((l) => plain(l)) ?? ""), 160) || "said nothing";
/** what it waits on: the last line that asks */
const asked = (s: string) => cut(plain(s.split("\n").reverse().find((l) => l.includes("?")) ?? s), 160);
async function alive(id: string) { const d = need(); return !!d.run(id) || (await d.exists(id).catch(() => false)); }

// ---- its first words: what an executor is, then the ticket's brief
const WHY: Record<Past["why"], string> = { full: "its talk filled", asked: "the person asked for a fresh one", lost: "its session was lost" };
export const FIRST_EXEC = (t: Ticket, brief: string, o: { cwd?: string; side?: boolean; copy?: { n: number; why: Past["why"] } } = {}) =>
  `You are the executor of one ticket in Sol, #${t.n}: one piece of work, below. The brief is all you know of it, and ` +
  "the ticket, not this talk, is what lasts: a fresh copy of you may replace you and start from the ticket alone.\n" +
  "Stay inside the mandate: do what it says you may, never what it says you may not, and stop where `until` says; come back there.\n" +
  "As you go, write into the ticket with ticket_note what you did, decided and learned, one line each: at least at every " +
  "milestone and before any long step. ticket_read gives you the ticket again.\n" +
  "End every turn by calling ticket_state: working (stopped mid-way, more to do when told), waiting (on the person: " +
  "waitsOn says on what) or done, with a one-line summary of where it stands.\n" +
  "You never talk to the person. Your last words of a turn are your report, short: what changed and what, if anything, " +
  "is needed. They go to whoever follows the ticket.\n" +
  (o.cwd ? o.side ? `Your folder is a side copy of ${o.cwd}, made for you: work there, never in ${o.cwd} itself.\n` : `Your folder is ${o.cwd}.\n` : "") +
  (o.copy ? `You are copy ${o.copy.n} of this ticket's executor: the copy before you was replaced because ${WHY[o.copy.why]}. Its notes are in the log below; go on from them, never redo what is noted done.\n` : "") +
  `<ticket>\n${brief.trim()}\n</ticket>\nWork the ask, or the newest words in its log, within the mandate.`;

// ---- its own tools
const TOOLS = ["ticket_note", "ticket_state", "ticket_read"];
function giveTools(ticket: string, session: string) {
  giveTool(session, {
    beside: true,   // it works: its ordinary tools stay (found on the walk: without this it had no Write)
    name: "ticket_note",
    description: "Write one line into your ticket: what you did, decided or learned. At least at every milestone and before a long step; the ticket is what a fresh copy of you starts from.",
    shape: { text: z.string() },
    run: async (a: { text: string }) => {
      need().store.log(ticket, { by: "executor", kind: "note", text: cut(String(a.text), 1000), session });
      const r = replacing.get(ticket); if (r && r.session === session) r.noted = true;
      return "noted";
    },
  });
  giveTool(session, {
    beside: true,   // it works: its ordinary tools stay (found on the walk: without this it had no Write)
    name: "ticket_state",
    description: "Set your ticket's state; call it at the end of every turn. working: stopped mid-way, more to do when told · waiting: on the person, `waitsOn` says on what · done. `summary`: one line, where it stands.",
    shape: { state: z.enum(["working", "waiting", "done"]), summary: z.string(), waitsOn: z.string().optional() },
    run: async (a: { state: "working" | "waiting" | "done"; summary: string; waitsOn?: string }) => {
      const summary = cut(String(a.summary), 160);
      need().store.setState(ticket, { state: a.state, summary, ...(a.state === "waiting" ? { waitsOn: cut(String(a.waitsOn || summary), 160) } : {}), by: "executor" });
      stated.add(session);
      return `the ticket is ${a.state}`;
    },
  });
  giveTool(session, {
    beside: true,   // it works: its ordinary tools stay (found on the walk: without this it had no Write)
    name: "ticket_read",
    description: "Your ticket as it is now: the ask, the mandate, its state and its log (your notes first).",
    shape: {},
    run: async () => need().store.brief(ticket),
  });
}
const takeTools = (session: string) => { for (const t of TOOLS) takeTool(session, t); };

// ---- starting an executor
/** where a copy works: the old copy's folder (its side copy, when it had one); else the project folder (a repo: a side
 *  copy of it); else the ticket's own folder */
async function folderFor(t: Ticket): Promise<{ cwd: string; worktree?: boolean }> {
  const d = need(), old = t.executor, where = t.mandate.where;
  if (old) {
    // the folder recorded on the ticket is where it really worked (learnCwd), unless it is still the repo itself: then
    // the engine is asked once more; its side copy not found (the session is gone): a new side copy, never the repo
    if (!(where && old.cwd === where && d.isRepo(where))) return { cwd: old.cwd };
    const real = await realCwd(old.sessionId);
    if (real && real !== where) return { cwd: real };
    return { cwd: where, worktree: true };
  }
  if (where && d.isRepo(where)) return { cwd: where, worktree: true };
  if (where) return { cwd: where };
  const cwd = join(STATE_DIR, "tickets", t.id, "work");
  mkdirSync(cwd, { recursive: true });
  return { cwd };
}
/** the folder a session works in, as the engine knows it: its run's, else the session's own */
async function realCwd(session: string): Promise<string | undefined> {
  const d = need(), r = d.run(session)?.cwd ?? (await d.cwdOf?.(session).catch(() => undefined));
  return typeof r === "string" && r ? r : undefined;
}
/** the ticket records the folder its executor really works in, as soon as the engine knows it (a side copy is made by
 *  the engine, at a path this file cannot know before) */
async function learnCwd(id: string, session: string) {
  const d = need(), t = d.store.get(id), e = t?.executor;
  if (!e || e.sessionId !== session) return;
  const real = await realCwd(session);
  if (real && real !== e.cwd) d.store.setCwd(id, real);
}
/** a fresh executor for the ticket, from its brief. With `keep` the old one stays the executor until the fresh one has
 *  started (a replacement of a live copy: if it fails, nothing changed); without, the ticket names the new one first,
 *  so a crash between the two leaves a ticket that knows its executor. */
async function startCopy(t: Ticket, was?: { why: Past["why"]; noted: boolean }, keep = false): Promise<Ticket> {
  const d = need(), old = t.executor, id = randomUUID();
  const { cwd, worktree } = await folderFor(t);
  if (old && worktree) d.store.log(t.id, { by: "engine", kind: "executor", text: "the side copy it worked in was not found: a new side copy is made", session: old.sessionId });
  giveTools(t.id, id);   // its tools are its own before its first turn
  // the ticket names the new copy before its brief is read, so the brief and the store agree on which copy it is; a
  // live replacement (keep) cannot, since a fresh copy that fails to start must leave the old one: its brief is read
  // as for the next copy, and its number is the one setExecutor gives after (past + the old one + 1)
  if (!keep) t = d.store.setExecutor(t.id, { sessionId: id, cwd }, old ? was : undefined);
  const nx = keep && old ? (was ?? { why: "lost" as const, noted: false }) : undefined;
  const n = nx ? t.past.length + 2 : t.executor?.n ?? t.past.length + 1;
  const copy = old && was ? { n, why: was.why } : undefined;
  stated.delete(id);
  try { await d.say(id, FIRST_EXEC(t, d.store.brief(t.id, undefined, nx), { cwd, ...(worktree ? { side: true } : {}), ...(copy ? { copy } : {}) }), { cwd, ...(worktree ? { worktree: true } : {}) }, { free: t.mandate.free, from: openerOf(t) }); }
  catch (e) {
    takeTools(id);
    d.store.log(t.id, { by: "engine", kind: "executor", text: `copy ${n} did not start: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300), session: id });
    throw e;
  }
  if (keep) t = d.store.setExecutor(t.id, { sessionId: id, cwd }, was);
  if (worktree) await learnCwd(t.id, id).catch(() => {});   // the side copy the engine just made
  if (old) takeTools(old.sessionId);
  if (d.name) void d.name(id, `#${t.n} ${t.title}`).catch(() => {});
  return t;
}
/** say a turn to the ticket's live executor: its tools are given again (idempotent) and its stated mark cleared */
async function sayTo(t: Ticket, text: string) {
  const d = need(), id = t.executor!.sessionId;
  giveTools(t.id, id); stated.delete(id);
  await d.say(id, text, undefined, { free: t.mandate.free, from: openerOf(t) });
}
/** the session a ticket was opened from: its first session subscriber (none for one the person opened) */
const openerOf = (t: Ticket) => t.subs.find((s) => s.kind === "session")?.key;

// ---- the door
export async function open(from: string, a: OpenIn): Promise<Ticket> {
  const d = need();
  const sub = a.sub ?? (from === "person" ? undefined : from);
  let t = d.store.open({ ...a, ...(sub ? { sub } : {}) });
  t = d.store.setState(t.id, { state: "working", by: "engine" });
  try { t = await startCopy(t); }
  catch (e) {
    d.store.setState(t.id, { state: "open", by: "engine" });
    throw new Error(`ticket #${t.n} is open but its executor did not start: ${e instanceof Error ? e.message : String(e)}`);
  }
  return d.store.get(t.id) ?? t;
}

export async function send(from: string, ticket: string, words: string, o: { reopen?: boolean } = {}): Promise<Ticket> {
  const d = need();
  let t = resolve(ticket);
  if (isClosed(t.state) && !o.reopen) throw new Error(`ticket #${t.n} is closed: say reopen to send it words`);
  // a renewed or second orchestration session that sends words hears the answer; the person is no session
  if (from !== "person" && !t.subs.some((s) => s.kind === "session" && s.key === from)) d.store.subscribe(t.id, { kind: "session", key: from });
  t = d.store.log(t.id, { by: byOf(from), kind: "words", text: words });
  // a closed ticket moves only by a reopen (the store's rule): open first, then at work
  if (isClosed(t.state)) { t = d.store.setState(t.id, { state: "open", by: byOf(from) }); hushed.delete(t.executor?.sessionId ?? ""); }
  t = d.store.setState(t.id, { state: "working", by: "engine" });
  // a fresh copy being started may have read its brief before these words were logged: once it has started, they are
  // said to it like to any live executor, never dropped between the two copies
  const busy = finishing.get(t.id);
  if (busy) { await busy.catch(() => {}); t = resolve(t.id); }
  const e = t.executor, r = replacing.get(t.id);
  try {
    if (e && r && r.session === e.sessionId) await finish(t.id, true);   // mid-replacement: the fresh copy starts with these words in its brief
    else if (e && await alive(e.sessionId)) await sayTo(t, `<words for your ticket, from the person${from === "person" ? "" : " through the orchestration session"}>\n${words}`);
    else await startCopy(t, e ? { why: "lost", noted: false } : undefined);
  } catch (err) {
    d.store.setState(t.id, { state: "open", by: "engine" });   // nobody works it: the words are in its log for the next try
    throw err;
  }
  return d.store.get(t.id) ?? t;
}

export async function close(from: string, ticket: string, state: "done" | "dropped", summary?: string): Promise<Ticket> {
  const d = need(), t = resolve(ticket), e = t.executor;
  if (e) {
    const run = d.run(e.sessionId);
    if (!isClosed(t.state)) hushed.add(e.sessionId);   // the turn it stops is not reported back to who closed it
    if (run?.working) await Promise.resolve(run.stop()).catch(() => {});
    takeTools(e.sessionId);
  }
  forget(t.id);
  const out = d.store.setState(t.id, { state, ...(summary ? { summary: cut(summary, 160) } : {}), by: byOf(from) });
  tellSoon();
  return out;
}

export async function mandate(from: string, ticket: string, patch: Partial<Mandate>): Promise<Ticket> {
  const d = need();
  let t = d.store.setMandate(resolve(ticket).id, patch, byOf(from));
  const e = t.executor;
  if (e && !isClosed(t.state) && await alive(e.sessionId)) {
    const m = t.mandate;
    await sayTo(t, `<the mandate of your ticket changed>\nmay: ${m.may.join("; ") || "nothing named"}\nmay not: ${m.mayNot.join("; ") || "nothing named"}\nuntil: ${m.until}\n` +
      `${m.where ? `where: ${m.where}\n` : ""}free: ${m.free === "edits" ? "change files in your folder on your own" : "ask before every step"}\n` +
      "Work within it from now on; if something you did is outside it now, say so in your report.");
    t = d.store.setState(t.id, { state: "working", by: "engine" });
  }
  return t;
}

/** a fresh copy now, the person asked: the old one writes its closing notes first */
export async function replace(ticket: string): Promise<Ticket> {
  const t = resolve(ticket);
  if (isClosed(t.state)) throw new Error(`ticket #${t.n} is closed: it has no executor to replace`);
  if (!t.executor) throw new Error(`ticket #${t.n} has no executor yet`);
  await askNotes(t, "asked");
  return need().store.get(t.id) ?? t;
}

export const summary = (max?: number) => need().store.summary(max);
export const read = (ticket: string, max?: number) => need().store.brief(resolve(ticket).id, max);
export const find = (q: string) => need().store.find(q);
export const list = (f?: { closed?: boolean }) => need().store.list(f);
export const repoint = (from: string, to: string) => need().store.repoint("session", from, to);

export const door: Door = { open, send, close, mandate, replace, summary, read, find, list, repoint };

// ---- the replacement, two steps like an orchestration session's renewal
const NOTES = (why: "full" | "asked") =>
  `<closing notes>\n${why === "full" ? "Your talk is nearly full" : "The person asked for a fresh copy of you"}: write into the ticket, with ticket_note, ` +
  "everything a fresh copy needs that is not there yet (what is half done and its next step, files changed, decisions), then call ticket_state, then answer: written";
/** step one: ask the old copy for its closing notes (its next ended turn, or REPLACE_WAIT_MS, is step two); at once
 *  when it is not alive. Asked twice: once. */
async function askNotes(t: Ticket, why: "full" | "asked") {
  const d = need(), e = t.executor!;
  const r0 = replacing.get(t.id);
  if (r0 && r0.session === e.sessionId) { if (r0.failed) await finish(t.id); return; }
  const r: Replacing = { session: e.sessionId, why, at: Date.now(), noted: false };
  replacing.set(t.id, r);
  if (!(await alive(e.sessionId))) return void (await finish(t.id));
  d.store.log(t.id, { by: "engine", kind: "executor", text: "asked for its closing notes", session: e.sessionId });
  arm(t.id, r, delays.replaceWait);
  try { await sayTo(t, NOTES(why)); }
  catch { await finish(t.id); return; }
  tellSoon();
}
function arm(id: string, r: Replacing, ms: number) {
  clearTimeout(r.timer);
  r.timer = setTimeout(() => {
    const run = need().run(r.session);
    // two copies never work one folder at once: one still in its turn after the wait is stopped first
    void Promise.resolve(run?.working ? run.stop() : undefined).catch(() => {}).then(() => finish(id)).catch(() => {});
  }, Math.max(0, ms));
  r.timer.unref?.();
}
/** step two: the fresh copy from the ticket. On failure the old one stays, the failure is logged (startCopy), and its
 *  next ended turn tries again. */
async function finish(id: string, rethrow = false) {
  const d = need(), r = replacing.get(id), t = d.store.get(id);
  if (!r || !t?.executor || t.executor.sessionId !== r.session) { if (r) { clearTimeout(r.timer); replacing.delete(id); } return; }
  const busy = finishing.get(id);
  if (busy) return rethrow ? busy : busy.catch(() => {});
  clearTimeout(r.timer);
  const p = (async () => {
    const noted = r.noted || t.log.some((l) => l.kind === "note" && l.by === "executor" && l.session === r.session && l.at >= r.at);
    const live = await alive(r.session);
    await startCopy(t, { why: live ? r.why : "lost", noted }, live);
    replacing.delete(id);
  })();
  finishing.set(id, p);
  try { await p; }
  catch (e) { r.failed = true; if (rethrow) throw e; }
  finally { finishing.delete(id); tellSoon(); }
}
/** a ticket closed or gone: nothing waits on its executor any more */
function forget(id: string) { const r = replacing.get(id); if (r) { clearTimeout(r.timer); replacing.delete(id); } }

// ---- what it hears: every work.run message (the join calls it, as one.hears)
export function hears(m: { type?: string; sessionId?: string; busy?: boolean; ended?: boolean; context?: number; window?: number }) {
  if (m.type !== "work.run" || !m.sessionId || !deps) return;
  const t = deps.store.ofSession(m.sessionId);
  if (!t || t.executor?.sessionId !== m.sessionId) return;
  const where = t.mandate.where;
  if (where && t.executor.cwd === where && !learned.has(m.sessionId)) { learned.add(m.sessionId); void learnCwd(t.id, m.sessionId).catch(() => {}); }
  if (!m.ended) {
    // at work: the ticket says so, unless the executor already set the state this turn (waiting, done) or it is closed
    if (m.busy && t.state !== "working" && !isClosed(t.state) && !stated.has(m.sessionId)) deps.store.setState(t.id, { state: "working", by: "engine" });
    return;
  }
  void ended(t.id, m.sessionId, m).catch((e) => { try { deps?.store.log(t.id, { by: "engine", kind: "executor", text: `its ended turn was not read: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300), session: m.sessionId }); } catch { /* the store refused */ } });
}
async function ended(id: string, session: string, m: { context?: number; window?: number }) {
  const d = need();
  let t = d.store.get(id)!;
  if (typeof m.context === "number" && typeof m.window === "number" && m.window > 0) t = d.store.setFill(id, m.context, m.window);
  const words = await d.lastWords(session).catch(() => "");
  t = d.store.log(id, { by: "executor", kind: "report", text: cut(words, 1500) || "said nothing", session });
  // a truthful state: what it set, else read from its words; "working" is no state for a turn that ended
  const set = stated.delete(session);
  if (!set && !isClosed(t.state)) t = endsAsking(words)
    ? d.store.setState(id, { state: "waiting", summary: firstLine(words), waitsOn: asked(words), by: "engine" })
    : d.store.setState(id, { state: "open", summary: firstLine(words), by: "engine" });
  else if (set && t.state === "working") t = d.store.setState(id, { state: "open", by: "engine" });
  const r = replacing.get(id), closing = !!r && r.session === session;
  // the answer to "write your closing notes" is engine talk, not a report: nobody is told of it
  if (!closing && !hushed.delete(session)) deliver(t, words);
  if (isClosed(t.state)) { takeTools(session); forget(id); tellSoon(); return; }
  if (closing) return void (await finish(id));
  const e = t.executor, ok = typeof m.context === "number" && typeof m.window === "number" && m.window > 0;
  const fill = ok ? m.context! / m.window! : e?.context && e.window ? e.context / e.window : 0;
  if (fill >= REPLACE_AT) await askNotes(t, "full");
}

// ---- delivery: one line per ticket to each subscribed session, batched, never the whole report
export function reportLine(t: Ticket, words: string): string {
  let s = `- #${t.n} [${t.state}] ${cut(t.title, 80)}: ${cut(t.summary || firstLine(words), 160)}`;
  if (t.state === "waiting") s += `\n  waits on: ${cut(t.waitsOn || "an answer", 160)}\n  report: ${cut(plain(words), REPORT_CUT) || "said nothing"}`;
  return s;
}
const hearers = (t: Ticket) => t.subs.filter((s) => s.kind === "session" && s.key !== t.executor?.sessionId).map((s) => s.key);
function deliver(t: Ticket, words: string) {
  const line = reportLine(t, words), was = hearers(t);
  for (const key of was) {
    const b: Batch = batches.get(key) ?? { lines: new Map(), timer: undefined as unknown as NodeJS.Timeout };
    b.lines.delete(t.id); b.lines.set(t.id, { line, was });   // the newest report of a ticket replaces its older one in the batch
    clearTimeout(b.timer);
    b.timer = setTimeout(() => void flush(key), delays.batch);
    b.timer.unref?.();
    batches.set(key, b);
  }
}
export function batchText(lines: string[]): string {
  const head = "<ticket reports>", out: string[] = [];
  let n = head.length;
  for (const l of lines.slice().reverse()) {   // newest first kept when the batch is too long
    if (n + l.length + 1 > BATCH_CUT - 80) break;
    out.unshift(l); n += l.length + 1;
  }
  const more = lines.length - out.length;
  return [head, ...out, ...(more ? [`(${more} more ticket${more > 1 ? "s" : ""} reported: the tickets' summary has them)`] : [])].join("\n");
}
/** the batch goes to whoever hears each ticket now: an orchestration session that renewed while the batch waited had its subscriptions
 *  re-pointed (repoint), and the fresh copy, not the old one, gets the lines */
async function flush(key: string) {
  const b = batches.get(key);
  if (!b?.lines.size || !deps) return void batches.delete(key);
  const now = Date.now();
  if (deps.holding?.(key) && now - (b.held ??= now) < HOLD_MAX_MS) {
    b.timer = setTimeout(() => void flush(key), Math.max(delays.batch, 1000)); b.timer.unref?.();
    return;
  }
  batches.delete(key);
  const to = new Map<string, string[]>();
  for (const [id, { line, was }] of b.lines) {
    // still subscribed: to it; re-pointed: to the hearers it was moved to (not those that have the line in their own batch)
    const t = deps.store.get(id), keys = !t ? [key] : t.subs.some((s) => s.kind === "session" && s.key === key) ? [key] : hearers(t).filter((k) => !was.includes(k));
    for (const k of keys) to.set(k, [...(to.get(k) ?? []), line]);
  }
  for (const [k, lines] of to) await need().say(k, batchText(lines)).catch(() => {});
}

// ---- after an engine restart
/** every open ticket's executor gets its tools again; nothing is said to it (the next send resumes it). One that was at
 *  work has no run left: its ticket says open. One asked for its closing notes is still waited on. */
export function wake() {
  const d = need(), all = d.store.list();
  if (!all.length) return;   // no tickets (tickets never used, or all closed): nothing is touched, nobody is told
  for (const t of all) {
    const e = t.executor;
    if (isClosed(t.state)) continue;
    if (!e) {   // opened, and the engine stopped before its executor was named: nobody works it; the next words start one
      if (t.state === "working") d.store.setState(t.id, { state: "open", summary: "its executor never started: the next words start one", by: "engine" });
      continue;
    }
    giveTools(t.id, e.sessionId);
    if (t.state === "working" && !d.run(e.sessionId)) {
      d.store.log(t.id, { by: "engine", kind: "executor", text: "the engine restarted while it worked; resumed at the next words", session: e.sessionId });
      d.store.setState(t.id, { state: "open", by: "engine" });
    }
    const last = t.log.filter((l) => l.kind === "executor" && l.session === e.sessionId).pop();
    if (last?.text === "asked for its closing notes" && !replacing.has(t.id)) {
      const r: Replacing = { session: e.sessionId, why: "full", at: last.at, noted: false };
      replacing.set(t.id, r);
      arm(t.id, r, last.at + delays.replaceWait - Date.now());
    }
  }
  tellSoon();
}

// ---- the faces
export function ticketsNow() {
  const d = need();
  return d.store.list().filter((t) => !isClosed(t.state)).map((t) => {
    const e = t.executor;
    return { id: t.id, n: t.n, title: t.title, state: t.state, waitsOn: t.waitsOn ?? null, summary: t.summary,
      executor: e?.sessionId ?? null, copy: e?.n ?? 0, fill: e?.context && e.window ? Math.round((e.context / e.window) * 100) / 100 : null,
      replacing: replacing.has(t.id) };
  });
}
function tellSoon() {
  if (telling || !deps) return;
  telling = true;
  queueMicrotask(() => { telling = false; try { need().tell({ type: "work.tickets", tickets: ticketsNow() }); } catch { /* not wired */ } });
}
