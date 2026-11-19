// The folder's agent, as the engine runs it (step 1: LA245 first, record-only). A folder under the home with a
// policy.md is an agent; its sources (the clock, the folder, Blackboard) bring triggers, harness.ts decides, run.ts
// works the ticket in Codex, store.ts keeps it all in the folder. The engine's side (index.ts) hands in Codex and its
// turns, starts the clock, and routes the wire:
//   agent.tickets {folder}           → the open tickets and their cards
//   agent.answer {ticketId, choice}  → the choice becomes a trigger on the ticket's thread
//   agent.rule {folder, ruleId, mode} → policy.md's line rewritten
//   agent.run {folder, ruleId}       → the rule run now (for the try)
//   agent.show {folder, project, sessionId} → a page block on that session's stage, the page below
//   agent.stickies {folder}          → the folder's stickies (stickies.md), each with its reach (does · drafts · asks),
//                                      what can be undone, the run going now
//   agent.sticky {folder, op, …}     → one change to them: make (with an optional due) · edit · remove · undo · done · due · keep · note
//   agent.press {folder, key, yes?}  → the one press (#1228): marked "← now" with the trust gate (#1497), the stickies rule
//                                      written, the agent run; yes: a draft's or an ask's did: line, its one step, then done;
//                                      answered when the run ends. Every run, pressed or by the clock, tells the
//                                      faces as it goes: agent.step {folder, step} (start · tool · made · end)
//   GET /agent/<folder>              → the page: cards that need him, the rules (off · watch · do), the ledger
//   POST /agent/<folder>             → the page's buttons (the same messages, as a form)
import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { homedir } from "node:os";
import { makeDirs, realish, under } from "../dirs.js";   // Home's folders, made by the engine (#1511, #1510)
import { readRecord } from "../consent.js";
import { setSessionProfiles, profileFor, setAgentGuard } from "../browser.js";
import { cardsOf, heldOf, judge, land, note, open, report, route, type Decision, type Jev, type LedgerLine, type Mode, type Rule, type Ticket, type Trigger } from "./harness.js";
import { appendLedger, newId, readLast, readLedger, readPolicy, readTicket, readTickets, saveLast, saveTicket, setMode } from "./store.js";
import { dueNow, examOf, classDaysOf } from "./sources/clock.js";
import { listFiles, newFiles, subOf, watchFolder } from "./sources/folder.js";
import { COURSE, blackboardBase, changeLine, diff, walk, type Read, type Snapshot } from "./sources/blackboard.js";
import { afterWalk, lookComms, quickAnswer, signInAnswer, signInCard, signinsOf, startSignIn, summaryOf } from "./comms.js";   // step 2
import { guardTool } from "./guard.js";
import { aboutOf } from "./about.js";
import { panelReader } from "./panels.js";
import type { SignInOpts } from "./signin.js";
import type { Site } from "./sites.js";
import { runTicket, sessionOf, type RunDeps, type RunOut } from "./run.js";
import { pageHtml } from "./page.js";
import { jobsTurn } from "./jobs/index.js";   // the jobs folder (step 3): its turns pass through here first
import { askFirst, askForm, askWhere } from "./whereJev.js";   // Home's world (#1093): Jev's picks 1, 2 and 6
import { finishedFor } from "./doneJev.js";   // Home's world (#1093): Jev's pick 3
import { askOpens } from "./opensJev.js";   // Home's world (#1093): Jev's pick 5
import { askTied } from "./tiedJev.js";   // Home's world (#1093): Jev's pick 4
import { readAreas, SYSTEMS_BOARD } from "./areas.js";
import * as St from "./stickies.js";   // a folder's stickies, kept by the engine (#1228)
import { heldNow, keep as keepAgents, signedIn as agentsSignedIn, hasAgentsFile, type Say } from "./agents.js";   // Agents (#1327): the keeper
import { keepMeta } from "./meta/keeper.js";   // Agents (#1327, pass 2): first runs, joining, date triggers
import { notice } from "./meta/offer.js";   // Agents (#1327, pass 2): offers noticed on the tick
import { makeAsk, type Ask } from "./meta/jev.js";
import { codexSay } from "./meta/say.js";
import { worldMates } from "./mates.js";   // Home's world (#1093): the dock's lamps, read-only   // Home's world (#1093): part 5's registry by area

export type AgentDeps = {
  home: string;
  run?: RunDeps;
  /** a ticket's turn; the default is run.ts's Codex turn (a test hands in its own) */
  turn?: (folder: string, rule: Rule, trigger: Trigger, ticket: Ticket) => Promise<RunOut>;
  jev?: Jev | null;
  /** how a page is read for a folder (the default: the engine's browser in the folder's profile) */
  read?: (folder: string) => Read;
  now?: () => number;
  /** a folder's tickets changed (the wire tells the faces) */
  changed?: (folder: string) => void;
  /** the sign-in window's options (a test hands in a headless window and its own hand) */
  signin?: Partial<SignInOpts>;
  /** a run's step, as it happens (the wire tells the faces: agent.step) (#1228) */
  step?: (folder: string, step: RunStep) => void;
  /** Agents' meta (#1327): Jev's same-job, same-kind and same-fix questions (default: the real Jev, null without a key) */
  ask?: Ask;
  /** Agents' meta (#1327): one whole Sol turn that answers in words (default: a read-only Codex turn in the home) */
  say?: Say;
  /** the person's own home, where ~/.sol/record/me.json is (default: the OS's; a test hands in its own) */
  me?: string;
};
/** one step of a run the folder draws: it started (what started it), a tool in use (the browser on a page, the desk),
 *  a file it made, it ended (how). `id` is the same for a tool's start and end */
export type RunStep = { kind: "start" | "tool" | "made" | "end"; at: number; text: string; id?: string; rule?: string; sticky?: string; done?: boolean; ok?: boolean; report?: string };
export type Running = { rule: string; sticky?: string; at: number; steps: RunStep[] };

const SKIP = new Set(["node_modules", "things", "memory", "desk", "voice", "track", "attachments", "browser-profile", "log", "data", "blocks", "sessions"]);
const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

export class Agents {
  private chains = new Map<string, Promise<unknown>>();
  private timer: NodeJS.Timeout | null = null;
  private watchers: (() => void)[] = [];
  /** the run going now in each folder (by path), with its steps so far: a face opened late draws it whole */
  readonly running = new Map<string, Running>();
  private pressing = new Set<string>();
  constructor(readonly d: AgentDeps) {
    d.ask ??= makeAsk();
    if (!d.say && d.run) d.say = codexSay(d.run, d.home);
    setSessionProfiles((sid) => { const m = /^agent:(.+)$/.exec(sid); const f = m ? this.folderOf(m[1]) : null; return f ? profileFor(f) : undefined; });
    setAgentGuard(guardTool);   // read only where people talk (guard.ts), in every mode
  }
  private now = () => (this.d.now ?? Date.now)();

  /** every folder under the home with a policy.md (three deep), by name */
  folders(): { name: string; path: string }[] {
    const out: { name: string; path: string }[] = [];
    const look = (dir: string, depth: number) => {
      let names: string[] = [];
      try { names = readdirSync(dir); } catch { return; }
      if (depth > 0 && names.includes("policy.md")) out.push({ name: basename(dir).toLowerCase(), path: dir });
      if (depth >= 3) return;
      for (const n of names) {
        if (n.startsWith(".") || SKIP.has(n)) continue;
        try { if (statSync(join(dir, n)).isDirectory()) look(join(dir, n), depth + 1); } catch { /* gone */ }
      }
    };
    look(this.d.home, 0);
    return out;
  }
  /** a folder by its name (la245) or its path under the home (school/la245) */
  folderOf(name: string): string | null {
    const n = String(name ?? "").toLowerCase().replace(/^\/+|\/+$/g, "");
    if (!n) return null;
    if (n.includes("/")) { const p = join(this.d.home, n); return !relative(this.d.home, p).startsWith("..") && existsSync(join(p, "policy.md")) ? p : null; }
    return NAME.test(n) ? this.folders().find((f) => f.name === n)?.path ?? null : null;
  }

  /** one thing at a time per folder: two triggers never work the same tickets at once */
  private serial<T>(folder: string, f: () => Promise<T>): Promise<T> {
    const next = (this.chains.get(folder) ?? Promise.resolve()).then(f, f);
    this.chains.set(folder, next.catch(() => {}));
    return next;
  }

  private step(folder: string, s: Omit<RunStep, "at">) {
    const st: RunStep = { at: this.now(), ...s };
    const r = this.running.get(folder);
    if (r) { const i = st.id ? r.steps.findIndex((x) => x.id === st.id) : -1; if (i >= 0) r.steps[i] = st; else r.steps.push(st); if (r.steps.length > 60) r.steps.splice(1, r.steps.length - 60); }
    try { this.d.step?.(basename(folder), st); } catch { /* a face gone: the run goes on */ }
  }

  private ledger(folder: string, line: Omit<LedgerLine, "at">, t?: Ticket): Ticket | undefined {
    const l: LedgerLine = { at: this.now(), ...line, ...(t ? { ticket: t.id, rule: t.rule } : {}) };
    appendLedger(folder, l);
    return t ? note(t, l) : undefined;
  }

  /** a trigger, judged, routed or opened, run, reported, kept. Returns the ticket, or null when it was ignored */
  trigger(folder: string, trig: Trigger): Promise<{ decision: Decision; ticket: Ticket | null }> {
    return this.serial(folder, async () => {
      const { rules, version } = readPolicy(folder);
      const tickets = readTickets(folder);
      const onto = route(trig, tickets);
      const decision: Decision = onto
        ? { decision: "accept", rule: rules.find((r) => r.id === onto.rule) ?? { id: onto.rule, sentence: "", source: trig.source, mode: onto.mandate.mode, rung: onto.mandate.rung }, why: `lands on ${onto.id}, which follows ${trig.thread}` }
        : await judge(trig, rules, this.d.jev ?? null);
      if (decision.decision === "ignore") {
        this.ledger(folder, { read: summary(trig), made: "nothing", held: `ignored: ${decision.why}`, ...(decision.rule ? { rule: decision.rule.id } : {}) });
        return { decision, ticket: null };
      }
      const rule = decision.rule;
      let t = onto ? land(onto, trig) : open({ id: newId(trig.at), folder: basename(folder), rule, trigger: trig, policyVersion: version });
      saveTicket(folder, t);
      const sticky = typeof trig.data.sticky === "string" ? trig.data.sticky : undefined;
      this.running.set(folder, { rule: rule.id, ...(sticky ? { sticky } : {}), at: this.now(), steps: [] });
      this.step(folder, { kind: "start", rule: rule.id, ...(sticky ? { sticky } : {}), text: sticky ?? summary(trig) });
      const sink = (s: { id: string; text: string; done: boolean; ok?: boolean; detail?: string }) => this.step(folder, { kind: "tool", id: s.id, text: s.detail && s.ok === false ? `${s.text}: ${s.detail}` : s.text, done: s.done, ...(s.ok !== undefined ? { ok: s.ok } : {}) });
      try {
      const before = filesWithTimes(folder);
      const quick = trig.kind === "answer" && onto ? quickAnswer(onto, String(trig.data.choice ?? "")) : null;
      const out = trig.kind === "needs-sign-in" ? signInCard(folder, trig)
        : trig.kind === "answer" && onto?.triggers[0]?.kind === "needs-sign-in" ? await signInAnswer(this, folder, onto.triggers[0], String(trig.data.choice ?? ""))
        : quick ? quick
        : await jobsTurn(this, folder, rule, trig, t, this.d.turn ?? ((f, r, tr, tk) => runTicket(f, r, tr, tk, { ...this.d.run!, sink })));
      const made = madeSince(folder, before);
      for (const p of made.filter((x) => x !== St.FILE && !x.startsWith(".agent/")).slice(0, 6)) this.step(folder, { kind: "made", text: p });
      t = report(t, { report: out.report, card: out.card ?? null, at: this.now(), trigger: trig.id, said: out.said, ms: out.ms, ...(out.thread ? { thread: out.thread } : {}) });
      t = this.ledger(folder, { read: summary(trig), made: made.length ? made.slice(0, 6).join(", ") + (made.length > 6 ? ` and ${made.length - 6} more` : "") : `nothing (${out.report})`, held: heldOf(t) }, t)!;
      saveTicket(folder, t);
      this.step(folder, { kind: "end", rule: rule.id, report: out.report, ok: out.report !== "failed", text: out.report === "failed" ? firstLine(out.said) : t.needs?.title ?? (made.length ? `made ${made.filter((x) => x !== St.FILE).slice(0, 3).join(", ") || "a change to the stickies"}` : "made nothing new") });
      this.d.changed?.(basename(folder));
      return { decision, ticket: t };
      } catch (e) {
        this.step(folder, { kind: "end", rule: rule.id, report: "failed", ok: false, text: firstLine(String((e as Error)?.message ?? e)) });
        throw e;
      } finally { this.running.delete(folder); }
    });
  }

  /** Blackboard's look: walk the course, keep what was seen, the difference is the trigger */
  async lookBlackboard(folder: string, rule: Rule, asked = false): Promise<{ ticket: Ticket | null; line: string }> {
    const read = this.d.read ? this.d.read(folder) : panelReader({ sessionId: sessionOf(folder), profile: profileFor(folder) });
    const at = this.now();
    const COURSE = aboutOf(folder, rule.sentence).course ?? DEFAULT_COURSE;   // the folder's course (about.ts), step 2
    let got;
    try { got = await walk(read, blackboardBase(), COURSE); }
    catch (e) { const why = String((e as Error)?.message ?? e).split("\n")[0]; this.ledger(folder, { rule: rule.id, read: "Blackboard", made: "nothing", held: `the look failed: ${why}` }); return { ticket: null, line: why }; }
    if (got.signedOut) {
      const r = await this.trigger(folder, { id: `g-${at}`, at, source: "blackboard", kind: "needs-sign-in", thread: `blackboard:${COURSE}:sign-in`, data: { rule: rule.id, course: COURSE, site: "blackboard" } });
      return { ticket: r.ticket, line: "not signed in" };
    }
    const before = readLast<Snapshot>(folder, "blackboard");
    const changes = diff(before, got.snapshot);
    saveLast(folder, "blackboard", got.snapshot);
    afterWalk(folder, got.snapshot, at);   // blackboard.md and calendar.md (comms.ts)
    const pages = Object.keys(got.snapshot.pages).length;
    if (!before) { this.ledger(folder, { rule: rule.id, read: `Blackboard ${COURSE}, ${pages} pages`, made: "the first look, kept as the baseline", held: "nothing" }); return { ticket: null, line: `baseline of ${pages} pages` }; }
    if (!changes.length) { this.ledger(folder, { rule: rule.id, read: `Blackboard ${COURSE}, ${pages} pages`, made: "nothing", held: "nothing changed" }); return { ticket: null, line: "nothing changed" }; }
    const r = await this.trigger(folder, { id: `g-${at}`, at, source: "blackboard", kind: "changed", thread: `blackboard:${COURSE}`, data: { rule: rule.id, ...(asked ? { asked } : {}), course: COURSE, changes: changes.slice(0, 30), said: changeLine(changes) } });
    return { ticket: r.ticket, line: changeLine(changes) };
  }

  /** the folder's look: the files new since the last look, one trigger for them */
  async lookFolder(folder: string, rule: Rule, asked = false): Promise<{ ticket: Ticket | null; line: string }> {
    const sub = subOf(rule.sentence);
    const now = listFiles(folder, sub);
    const last = readLast<{ files: string[] }>(folder, `folder-${rule.id}`);
    saveLast(folder, `folder-${rule.id}`, { files: now });
    const fresh = last ? newFiles(last.files, now) : asked ? now.slice(-1) : [];
    if (!fresh.length) { if (asked) this.ledger(folder, { rule: rule.id, read: `${sub || "the folder"}, ${now.length} files`, made: "nothing", held: last ? "no new file" : "the first look, kept as the baseline" }); return { ticket: null, line: last ? "no new file" : "baseline" }; }
    const at = this.now();
    const r = await this.trigger(folder, { id: `f-${at}`, at, source: "folder", kind: "new-file", thread: `folder:${fresh[0]}`, data: { rule: rule.id, ...(asked ? { asked } : {}), files: fresh } });
    return { ticket: r.ticket, line: `new: ${fresh.join(", ")}` };
  }

  /** run a rule: now, as he asked (agent.run: Jev is not asked), or by the clock at its time (Jev weighs what was seen) */
  async runRule(name: string, ruleId: string, asked = true, extra: { sticky?: string } = {}): Promise<{ ok: boolean; why?: string; ticket?: Ticket | null; line?: string }> {
    const folder = this.folderOf(name);
    if (!folder) return { ok: false, why: `no folder agent "${name}" (a folder with a policy.md)` };
    const rule = readPolicy(folder).rules.find((r) => r.id === ruleId);
    if (!rule) return { ok: false, why: `no rule ${ruleId} in ${name}/policy.md` };
    if (rule.mode === "off") return { ok: false, why: `${ruleId} is off` };
    if (rule.source === "blackboard") return { ok: true, ...(await this.lookBlackboard(folder, rule, asked)) };
    if (rule.source === "folder") return { ok: true, ...(await this.lookFolder(folder, rule, asked)) };
    const comms = lookComms(this, folder, rule, asked);   // mail, teams, gc (comms.ts)
    if (comms) return { ok: true, ...(await comms) };
    const at = this.now();
    // a pressed sticky is its own thread: two stickies pressed the same day are two tickets, the same one pressed again lands on its own
    const thread = extra.sticky ? `${rule.source}:${rule.id}:${extra.sticky.slice(0, 120)}` : `${rule.source}:${rule.id}:${new Date(at).toDateString()}`;
    const r = await this.trigger(folder, { id: `c-${at}`, at, source: rule.source, kind: "time", thread, data: { rule: rule.id, ...(asked ? { asked } : {}), at: new Date(at).toString(), ...(extra.sticky ? { sticky: extra.sticky } : {}) } });
    return { ok: true, ticket: r.ticket, line: r.decision.why };
  }

  /** the person's answer on a card: a trigger on the ticket's own thread */
  async answer(ticketId: string, choice: string): Promise<{ ok: boolean; why?: string; ticket?: Ticket | null }> {
    for (const f of this.folders()) {
      const t = readTicket(f.path, ticketId);
      if (!t) continue;
      if (t.state === "ended") return { ok: false, why: `${ticketId} has ended` };
      const at = this.now();
      const r = await this.trigger(f.path, { id: `a-${at}`, at, source: "you", kind: "answer", thread: `ticket:${t.id}`, data: { choice: String(choice).slice(0, 200), card: t.needs?.title ?? "" } });
      return { ok: true, ticket: r.ticket };
    }
    return { ok: false, why: `no ticket ${ticketId}` };
  }

  /** the one press (#1228): the sticky marked "← now", the stickies rule in policy.md (kept as written when there is one),
   *  the folder's agent run on it; after the run the mark off and, when the agent wrote none, a "did:" line from what
   *  it made. One press at a time per folder: the mark is what the agent reads. The trust gate (#1497) goes into the
   *  mark: how far, from the sticky's words. `yes` is the person's act on a draft or an ask (one of the sticky's own
   *  "did: draft:" / "did: ask:" lines): that one step is run, and when the run ends well the sticky is done */
  async press(name: string, key: string, yes?: string): Promise<{ ok: boolean; why?: string; ticket?: Ticket | null; line?: string }> {
    const folder = St.dirIn(this.d.home, name);
    if (!folder) return { ok: false, why: `no folder "${name}" in the home` };
    if (!St.hasAgent(folder)) return { ok: false, why: "This folder has no agent yet. The sticky is kept." };
    const run = this.running.get(folder);
    if (this.pressing.has(folder) || run?.sticky) return { ok: false, why: `Its agent is on "${run?.sticky ?? "another sticky"}" now. Press this one when that ends.` };
    St.ensureRule(folder);
    const rule = readPolicy(folder).rules.find((r) => r.source === "stickies");
    if (!rule) return { ok: false, why: "policy.md has no stickies rule" };
    if (rule.mode === "off") return { ok: false, why: "The stickies rule is off in this folder's policy.md." };
    const k = St.keyOf(key);
    const m = St.change(folder, (l) => {
      const x = l.find((s) => St.keyOf(s.t) === k);
      if (!x) return { why: "that sticky is not there any more" };
      if (yes !== undefined && !St.yesFits(l, k, yes)) return { why: "That is not a draft or an ask of this sticky any more." };
      return St.mark(l, k, St.stamp(), St.gateWords(St.reachOfSticky(x), yes));
    });
    if ("why" in m) return { ok: false, why: m.why };
    this.pressing.add(folder);
    this.d.changed?.(basename(folder));
    try {
      const r = await this.runRule(relative(realpathSync(this.d.home), folder), rule.id, true, { sticky: k });
      const last = r.ticket?.ledger?.[r.ticket.ledger.length - 1]?.made;
      St.change(folder, (l) => ({ items: St.settle(l, k, last && !/^nothing/.test(last) ? last : undefined) }));
      // the person's act finishes it: the step said yes to ran, so the sticky is done (they bring it back from the pile)
      if (yes !== undefined && r.ok) St.change(folder, (l) => St.done(l, k, true));
      return r;
    } catch (e) {
      St.change(folder, (l) => ({ items: St.settle(l, k) }));
      return { ok: false, why: firstLine(String((e as Error)?.message ?? e)) };
    } finally { this.pressing.delete(folder); this.d.changed?.(basename(folder)); }
  }

  /** folders Home needs (#1511, #1510): the record's under ~/.sol, a place's under Sol's home, with their parents, never
   *  by a terminal; `home` is Sol's home, so a face with no terminal to read $SOL_HOME from still knows it */
  mkdir(paths: readonly unknown[]) {
    const me = this.d.me ?? homedir();
    const r = makeDirs(paths.map((p) => String(p ?? "").replace(/^~(?=\/|$)/, me)), [join(me, ".sol"), this.d.home]);
    return { ...r, home: realish(this.d.home) };
  }
  /** a place's folder for its stickies (#1511): there, or made now when it is loose/ or a place the record names (a place
   *  in the record always has its folder), under Sol's home only; any other name stays null */
  private placeDir(name: string): string | null {
    const have = St.dirIn(this.d.home, name);
    if (have) return have;
    const n = String(name ?? "").trim();
    const id = n ? under(this.d.home, n.startsWith("/") ? n : join(this.d.home, n)) : null;
    if (!id) return null;
    const rec = readRecord(this.d.me ?? homedir());
    const ours = typeof rec === "object" && (!rec.solHome || realish(rec.solHome) === realish(this.d.home));
    const places = ours && Array.isArray(rec.areas) ? rec.areas.map((a) => String(a?.id ?? "")) : [];
    if (id !== St.LOOSE && !places.includes(id)) return null;
    return makeDirs([join(realish(this.d.home), id)], [this.d.home]).ok ? St.dirIn(this.d.home, id) : null;
  }

  /** the folder's stickies, what can still be undone, and the run going now */
  stickies(name: string) {
    const folder = this.placeDir(name);
    if (!folder) return null;
    return { items: St.read(folder).items.map((x) => ({ ...x, reach: St.reachOfSticky(x) })), removed: St.removedOf(folder, this.now()).map((r) => ({ id: r.id, t: r.item.t, at: r.at })), agent: St.hasAgent(folder), running: this.running.get(folder) ?? null };
  }
  /** one change to a folder's stickies, on the file as it is now */
  sticky(name: string, m: Record<string, any>): { ok: boolean; why?: string; items?: St.Sticky[]; undo?: string; key?: string } {
    const folder = this.placeDir(name);
    if (!folder) return { ok: false, why: St.NO_PLACE };
    const key = String(m.key ?? ""), busy = (l: St.Sticky[]) => l.some((x) => St.keyOf(x.t) === St.keyOf(key) && x.notes.some((n) => n.endsWith(St.NOW)));
    let r: St.Change & { id?: string; key?: string };
    switch (String(m.op)) {
      case "make": { const k: { key?: string } = {}; r = St.change(folder, (l) => { const x = St.make(l, String(m.line ?? ""), m.due ? String(m.due) : null); k.key = x.key; return x; }); if ("items" in r) r = { ...r, key: k.key }; break; }
      case "edit": r = St.change(folder, (l) => (busy(l) ? { why: "its agent is working on it; change it when the run ends" } : St.edit(l, key, String(m.t ?? ""), String(m.s ?? "")))); break;
      case "done": r = St.change(folder, (l) => St.done(l, key, !!m.done)); break;
      case "due": r = St.change(folder, (l) => St.withDue(l, key, m.due ? String(m.due) : null)); break;
      case "remove": r = St.remove(folder, key, this.now()); break;
      case "undo": r = St.undo(folder, String(m.id ?? ""), this.now()); break;
      case "keep": r = St.change(folder, (l) => ({ items: St.keep(l, { done: !!m.item?.done, t: String(m.item?.t ?? ""), s: String(m.item?.s ?? ""), notes: Array.isArray(m.item?.notes) ? m.item.notes.map(String) : [] }) })); break;
      case "note": r = St.change(folder, (l) => (l.some((x) => St.keyOf(x.t) === St.keyOf(key)) ? { items: l.map((x) => (St.keyOf(x.t) === St.keyOf(key) ? { ...x, notes: [...x.notes, String(m.line ?? "").replace(/\s+/g, " ").trim()] } : x)) } : { why: "that sticky is not there any more" })); break;
      default: return { ok: false, why: "which change? make, edit, remove, undo, done, due, keep or note" };
    }
    if ("why" in r) return { ok: false, why: r.why };
    this.d.changed?.(basename(folder));
    return { ok: true, items: r.items, ...(r.id ? { undo: r.id } : {}), ...(r.key ? { key: r.key } : {}) };
  }

  /** a sign-in to a site ended well in a folder: the rules Agents held for that site wake (#1327) */
  signedIn(folder: string, site: Site) {
    try { if (agentsSignedIn(this.d.home, relative(this.d.home, folder).split("\\").join("/"), site, this.now())) this.d.changed?.(basename(folder)); } catch { /* agents.json unreadable: nothing held to wake */ }
  }

  setRule(name: string, ruleId: string, mode: Mode): { ok: boolean; why?: string } {
    const folder = this.folderOf(name);
    if (!folder) return { ok: false, why: `no folder agent "${name}"` };
    if (!setMode(folder, ruleId, mode)) return { ok: false, why: `no rule ${ruleId}, or ${mode} is not off, watch or do` };
    this.ledger(folder, { rule: ruleId, read: "policy.md", made: `${ruleId} set to ${mode}`, held: "nothing" });
    this.d.changed?.(basename(folder));
    return { ok: true };
  }

  /** what agent.tickets answers: the open and waiting tickets, the cards, the rules */
  view(name: string) {
    const folder = this.folderOf(name);
    if (!folder) return null;
    const all = readTickets(folder), live = all.filter((t) => t.state !== "ended");
    const rules = readPolicy(folder).rules;
    return { folder: basename(folder), path: folder, rules, tickets: live, cards: cardsOf(live), ended: all.length - live.length, ledger: readLedger(folder, 40), signins: signinsOf(rules) };
  }
  page(name: string, base = ""): string | null {
    const v = this.view(name);
    return v ? pageHtml(v, base) : null;
  }

  /** the clock: every minute, each rule whose time has come; and a watch on each folder rule's sub-folder */
  tick(at = new Date(this.now())): Promise<unknown[]> {
    const jobs: Promise<unknown>[] = [];
    // Agents (#1327): the keeper first (held, rested, woken; nothing until agents.json exists), then the clock skips
    // what it holds. policy.md is not changed for it
    try { keepAgents(this.d.home, at.getTime()); } catch { /* a torn agents.json: the clock runs as before */ }
    // Agents' meta: a capped first run lifted, a new sibling joined, a date trigger due (each date once); then the
    // offers noticed in the background (one scan at a time), once the Agents view has made agents.json
    let due: { folder: string; rule: string }[] = [];
    try { due = keepMeta(this.d.home, at.getTime()).due; } catch { /* a torn agents.json: as before */ }
    for (const r of due) jobs.push(this.runRule(r.folder, r.rule, true).catch(() => {}));
    if (hasAgentsFile(this.d.home)) void notice(this, true).catch(() => {});
    const held = heldNow(this.d.home, at.getTime());
    for (const f of this.folders()) {
      const fired = readLast<{ keys: string[] }>(f.path, "clock")?.keys ?? [];
      const exam = examOf(f.path);
      const days = classDaysOf(f.path);
      const rel = relative(this.d.home, f.path).split("\\").join("/");
      const due = readPolicy(f.path).rules.filter((r) => !held.has(`${rel}#${r.id}`)).flatMap((r) => dueNow(r, at, fired, exam, days).map((k) => ({ r, k })));
      if (!due.length) continue;
      saveLast(f.path, "clock", { keys: [...fired, ...due.map((x) => x.k)].slice(-200) });
      for (const { r } of due) jobs.push(this.runRule(f.name, r.id, false).catch(() => {}));
    }
    return Promise.all(jobs);
  }
  start(everyMs = 60_000) {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.tick(); }, everyMs);
    this.timer.unref?.();
    for (const f of this.folders()) for (const r of readPolicy(f.path).rules.filter((x) => x.source === "folder")) {
      void this.lookFolder(f.path, r).catch(() => {});   // the first look: a baseline, or what came while the engine was off
      this.watchers.push(watchFolder(f.path, subOf(r.sentence), () => {
        const now = readPolicy(f.path).rules.find((x) => x.id === r.id);
        if (now && now.mode !== "off") void this.lookFolder(f.path, now).catch(() => {});
      }));
    }
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const w of this.watchers) w();
    this.watchers = [];
  }
}

const DEFAULT_COURSE = COURSE;
const firstLine = (x: string) => (x.split("\n").find((l) => l.trim() && !l.trim().startsWith("{")) ?? x).trim().slice(0, 200);

/** a trigger in a few words, for the ledger's "read" (pure) */
export function summary(t: Trigger): string {
  const d = t.data as Record<string, any>;
  const step2 = summaryOf(t);
  if (step2) return step2;
  if (t.kind === "changed" && typeof d.said === "string") return `Blackboard: ${d.said}`;
  if (t.kind === "new-file" && Array.isArray(d.files)) return `new in the folder: ${d.files.join(", ")}`;
  if (t.kind === "answer") return `your answer: "${d.choice}"${d.card ? ` on "${d.card}"` : ""}`;
  if (t.kind === "needs-sign-in") return "Blackboard asked for a sign-in";
  if (t.kind === "time") return `the clock, ${new Date(t.at).toTimeString().slice(0, 5)}`;
  return `${t.source} ${t.kind}`;
}

/** the folder's files and their times, outside .agent, three deep (to tell what a run made) */
function filesWithTimes(folder: string): Map<string, number> {
  const out = new Map<string, number>();
  const look = (rel: string, depth: number) => {
    let names: string[] = [];
    try { names = readdirSync(join(folder, rel)); } catch { return; }
    for (const n of names) {
      if (n.startsWith(".") || n === "ledger.md") continue;
      const p = rel ? `${rel}/${n}` : n;
      try {
        const st = statSync(join(folder, p));
        if (st.isFile()) out.set(p, st.mtimeMs); else if (st.isDirectory() && depth < 3) look(p, depth + 1);
      } catch { /* gone */ }
    }
  };
  look("", 0);
  return out;
}
function madeSince(folder: string, before: Map<string, number>): string[] {
  return [...filesWithTimes(folder)].filter(([p, t]) => before.get(p) !== t).map(([p]) => p);
}

// ---- the engine's one set of folder agents ----
let agents: Agents | null = null;
export const agentsNow = () => agents;
export function startAgents(d: AgentDeps, clock = true): Agents {
  agents?.stop();
  agents = new Agents(d);
  if (clock) agents.start();
  return agents;
}

/** a message on the wire (agent.*): its answer, under the same type and rid */
export async function handleAgent(m: Record<string, any>): Promise<object> {
  const a = agents, rid = m.rid !== undefined ? { rid: m.rid } : {};
  if (!a) return { type: m.type, ...rid, ok: false, why: "the folder agents are not running on this engine" };
  switch (m.type) {
    case "agent.tickets": { const v = a.view(String(m.folder ?? "")); return v ? { type: m.type, ...rid, ok: true, ...v } : { type: m.type, ...rid, ok: false, why: `no folder agent "${m.folder}"` }; }
    case "agent.answer": return { type: m.type, ...rid, ...(await a.answer(String(m.ticketId ?? ""), String(m.choice ?? ""))) };
    case "agent.rule": return { type: m.type, ...rid, ...a.setRule(String(m.folder ?? ""), String(m.ruleId ?? ""), String(m.mode ?? "") as Mode) };
    case "agent.stickies": { const v = a.stickies(String(m.folder ?? "")); return v ? { type: m.type, ...rid, ok: true, ...v } : { type: m.type, ...rid, ok: false, why: St.NO_PLACE }; }
    case "agent.sticky": return { type: m.type, ...rid, ...a.sticky(String(m.folder ?? ""), m) };
    case "agent.mkdir": return { type: m.type, ...rid, ...a.mkdir(Array.isArray(m.paths) ? m.paths : []) };
    case "agent.press": return { type: m.type, ...rid, ...(await a.press(String(m.folder ?? ""), String(m.key ?? ""), typeof m.yes === "string" ? m.yes : undefined)) };
    case "agent.made.open": return { type: m.type, ...rid, ok: true };   // Home's made thing opened (#1490): only counted (track.ts home.made.open)
    case "agent.run": return { type: m.type, ...rid, ...(await a.runRule(String(m.folder ?? ""), String(m.ruleId ?? ""))) };
    case "agent.where": return { type: m.type, ...rid, ok: true, ...((await askWhere(String(m.sticky ?? ""), Array.isArray(m.folders) ? m.folders : [])) ?? { folder: null }) };   // Home's world (#1093): Jev's pick 1
    case "agent.first": return { type: m.type, ...rid, ok: true, ...((await askFirst(Array.isArray(m.things) ? m.things : [])) ?? { first: null }) };   // Home's world (#1093): Jev's pick 2
    case "agent.form": return { type: m.type, ...rid, ok: true, ...((await askForm({ name: String(m.name ?? ""), part: String(m.part ?? ""), things: Array.isArray(m.things) ? m.things.map(String) : [] })) ?? { form: null }) };   // Home's world (#1093): Jev's pick 6
    case "agent.finished": {   // Home's world (#1093): Jev's pick 3, told the talk's shape only: a title can be the first prompt, so it stays here
      try {
        const { workSessions, sessionItems, itemsOf } = await import("../work/sessions.js");
        return { type: m.type, ...rid, ok: true, p: await finishedFor(String(m.sessionId ?? ""), { sessions: async () => (await workSessions()).sessions, items: async (id) => itemsOf(await sessionItems(id)) }) };
      } catch { return { type: m.type, ...rid, ok: true, p: null }; }   // a failed import or read: no answer, never a rejected handler
    }
    case "agent.opens": {   // Home's world (#1093): Jev's pick 5, told titles and district names only
      const strs = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
      const places = Array.isArray(m.places) ? m.places.map((x: any) => ({ id: String(x?.id ?? ""), name: String(x?.name ?? "") })).filter((x: { id: string }) => x.id) : [];
      return { type: m.type, ...rid, ok: true, ...((await askOpens({ hour: Number(m.hour) || 0, waiting: strs(m.waiting), working: strs(m.working), places, recent: strs(m.recent) })) ?? { part: null }) };
    }
    case "agent.tied": return { type: m.type, ...rid, ok: true, p: await askTied({ a: m.a ?? {}, b: m.b ?? {}, days: Number(m.days) || 0 }) };   // Home's world (#1093): Jev's pick 4, names, kinds and a count
    case "agent.mates": { try { return { type: m.type, ...rid, ok: true, ...worldMates() }; } catch { return { type: m.type, ...rid, ok: false }; } }   // Home's world (#1093): no team.hello, so no Cowork sync
    case "agent.areas": { const areas = readAreas(); return { type: m.type, ...rid, ok: !!areas, areas: areas ?? [], board: SYSTEMS_BOARD }; }   // Home's world (#1093)
    case "agent.signin": return { type: m.type, ...rid, ...(await startSignIn(a, String(m.folder ?? ""), String(m.site ?? ""), m.ruleId ? String(m.ruleId) : undefined)) };
    default: return { type: m.type, ...rid, ok: false, why: `unknown message ${m.type}` };
  }
}
