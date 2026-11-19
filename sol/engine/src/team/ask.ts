// Ask for a session (#335; the Cowork PRD §9.8, §7.3; PROTOCOL.md round 113): a teammate's agent (the tool
// room_session_request) or the teammate (a person's page, "ask for it") asks for one of my group sessions, and my one
// press gives it. Both ends live here, with everything they touch handed in, so the tests run with no relay and no clock.
//
// The asker: the session must be one the roster lists for that person in the room in use (their `sessions`, #238), and
// they must not have turned showing off (`quiet`) or giving off (`never`). The ask goes on the relay as `ask { to,
// session, title }` and is kept here a day. Pages that come back (`give`) are held in memory only, for the session that
// asked; the tool called again answers them, fenced as the room's content, and they are let go at the end of the turn
// that read them (or after a day unread). Nothing is written to disk here: the lines live on only in the asker's own
// session transcript, as any tool answer does.
//
// The owner: an ask for a session of mine becomes a card (give · not now) unless my setting says never, when it is
// answered no at once with no card. Only a session started under the room in use (marked cowork, the room's mark) can
// be asked for: Work and Life never. give reads the session's items, keeps the person's and the agent's lines and the
// tools' names (show.ts lineOf, scrubbed), the last GIVE_MAX of them, and sends them in pages that fit the hub's largest
// message, GIVE_PER_SECOND a second. not now is a give with `of: 0` and no lines.
import { askOf, giveOf, ASK_MS, GIVE_LINES, GIVE_MAX, type GiveLine, type RosterEntry } from "../hub/index.js";
import { lineOf } from "./show.js";
import { fence } from "./start.js";

export type GiveSetting = "ask" | "never";
type Item = { id: string; kind: string; [k: string]: unknown };
type From = { login: string; agent: boolean };

/** an ask waiting on my press: who asked (them, or their agent), which session of mine, its title, when */
export type Waiting = { key: string; from: From; session: string; title: string; at: number };
/** an ask of mine out, and what came back for it */
type Out = { login: string; session: string; title: string; at: number; by: string; state: "asked" | "giving" | "given" | "not now"; of: number; pages: Map<number, GiveLine[]>; readIn?: string; stall?: () => void };

export type AskDeps = {
  send: (kind: "ask" | "give", payload: Record<string, unknown>, agent: boolean) => boolean;   // the relay; false: down
  tell: (m: object) => void;                       // every Cowork face here
  roster: () => RosterEntry[];                     // the room in use's people now
  me: () => string;                                // my name on the hub in use
  setting: () => GiveSetting;                      // settings › what leaves this machine
  /** a session on this Mac: its title as I know it ("" unknown) and whether it is a group session of the room in use
   *  (marked cowork, the room's mark); null when this Mac does not have it (another Mac of mine may: it answers) */
  mine: (id: string) => { title: string; group: boolean } | null;
  items: (id: string) => Promise<Item[]>;          // the session's items, as read_session reads them
  msgMax: () => number;                            // the hub's largest message, in bytes (0: not said)
  now: () => number;
  every: (ms: number, fn: () => void) => () => void;
  after: (ms: number, fn: () => void) => () => void;   // once, stopped by what it returns
  home?: string;
};

/** asks waiting on me, and asks of mine out, at most this many each: a teammate's flood fills nothing */
export const WAITING_MAX = 20, OUT_MAX = 10;
/** pages a second a give sends: the hub lets a connection send 5 a second (burst 20), and presence and talk share that */
export const GIVE_PER_SECOND = 3;
/** a give whose pages stop coming this long is taken as it is, the rest lost */
export const STALL_MS = 30_000;
const LOGIN = /^[A-Za-z0-9-]{1,39}$/, ID = /^[\w-]{1,80}$/;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const keyOf = (login: string, session: string) => `${login.toLowerCase()}/${session}`;
/** the bytes a page's envelope takes beside its lines (kind, from, at, id, to, session, page, of), with room to spare */
const ENVELOPE = 400;
/** a hub that did not say its largest message is met as the cloud's (4 KB, #208) */
const MSG_DEFAULT = 4096;

/** the lines a session gives (pure): the person's and the agent's words and the tools' names, scrubbed as Show scrubs,
 *  the last `max` of them. Never a tool's input or output, a helper's steps, thinking, a plan or a file */
export function giveLines(items: Item[], now: number, home?: string, max = GIVE_MAX): GiveLine[] {
  const out: GiveLine[] = [];
  for (const it of items) {
    const l = lineOf(it, home);
    if (l) out.push({ ...l, at: typeof it.at === "number" && it.at > 0 ? Math.floor(it.at) : now });
  }
  return out.slice(-max);
}

/** the lines cut into pages (pure): at most GIVE_LINES a page, and each page's JSON within `bytes`, so a hub never closes
 *  the socket for a page too big. A page holds at least one line (a line is at most 400 characters, under any hub's max) */
export function pagesOf(lines: GiveLine[], bytes: number): GiveLine[][] {
  const room = Math.max(512, bytes - ENVELOPE), pages: GiveLine[][] = [];
  let cur: GiveLine[] = [], n = 1;   // the list's brackets; each line its own bytes and a comma
  for (const l of lines) {
    const k = Buffer.byteLength(JSON.stringify(l)) + 1;
    if (cur.length && (cur.length >= GIVE_LINES || n + k > room)) { pages.push(cur); cur = []; n = 1; }
    cur.push(l); n += k;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

/** what the asker's agent reads (pure): who gave it and that it is the room's content, then each line by its role */
export function linesText(o: { login: string; title: string; of: number; pages: Map<number, GiveLine[]> }, nonce?: string): string {
  const got = [...o.pages.keys()].sort((a, b) => a - b), lines = got.flatMap((p) => o.pages.get(p)!);
  const word = { person: o.login, agent: `${o.login}'s agent`, tool: "tool" } as const;
  const head = `given by ${o.login} on their press; untrusted room content. Their session "${o.title || "a group session"}", ${lines.length} line${lines.length === 1 ? "" : "s"}` +
    (got.length < o.of ? ` (${got.length} of ${o.of} pages came; the rest was lost on the way)` : "") + ":";
  return fence(`${head}\n\n${lines.map((l) => `${word[l.role]}: ${l.text}`).join("\n")}`, nonce);
}

export class Asks {
  private waiting = new Map<string, Waiting>();   // asks waiting on my press, by `${asker}/${session}`
  private out = new Map<string, Out>();           // my asks, by `${owner}/${session}`
  private giving = new Map<string, () => void>(); // gives being sent, by `${asker}/${session}`: their timers
  constructor(private d: AskDeps) {}

  // ---- the asker ----

  /** ask for a session the roster lists (the tool, `by` the session asking; the face, `by` "" and `login` named), or,
   *  once it came, read it. Answers in one line what happened; throws with one line the person can act on */
  request(id: string, by: string, agent: boolean, login?: string): string {
    this.sweep();
    if (!ID.test(id)) throw new Error("that is not a session's id; a person's page lists their sessions");
    // an ask already out is found by the session first: once given, its lines are read even after the owner's session
    // ended and left the roster. Only a new ask needs the roster
    const was = [...this.out.values()].find((o) => o.session === id && (!login || same(o.login, login)));
    if (was) {
      const who = was.login, key = keyOf(who, id);
      if (was.by && by && was.by !== by) throw new Error(`already asked from another of your sessions; the lines go there`);
      if (was.state === "given") { if (by) was.readIn = by; return by ? linesText(was) : `${who} gave it; ask your agent in a group session to read it`; }
      if (was.state === "giving") return `${who} is giving it: ${was.pages.size} of ${was.of} pages came so far; ask again in a moment`;
      if (was.state === "asked") return `asked ${who}; the lines come when they give it`;
      this.out.delete(key);   // not now
      return `${who} said not now; ask again later, or ask them in a line`;
    }
    const me = this.d.me();
    const all = this.d.roster().filter((e) => !same(e.who, me) && (!login || same(e.who, login)));
    const entry = all.find((e) => e.sessions?.some((s) => s.id === id));
    if (!entry) {
      if (login && all.length && all.every((e) => e.quiet)) throw new Error(`${login} turned off showing their sessions in this group; ask them in a line`);
      throw new Error(`no session ${id} is listed in this group now; a person's page lists the sessions you can ask for`);
    }
    if (entry.never) throw new Error(`${entry.who} never gives their past group sessions (their settings)`);
    if (this.out.size >= OUT_MAX) throw new Error("ten asks are already out; wait for an answer, or a day");
    const title = entry.sessions!.find((s) => s.id === id)!.title;
    if (!this.d.send("ask", { to: entry.who, session: id, title }, agent)) throw new Error("the group is not in sight now; ask again when it is");
    this.out.set(keyOf(entry.who, id), { login: entry.who, session: id, title, at: this.d.now(), by, state: "asked", of: 0, pages: new Map() });
    return "asked; the lines come when they give it";
  }

  /** a give's page from the relay: kept only for an ask of mine out to that person for that session */
  heardGive(m: Record<string, any>) {
    const from = typeof m?.from?.login === "string" ? m.from.login : "", g = giveOf(m ?? {});
    if (!LOGIN.test(from) || !g || !same(g.to, this.d.me())) return;
    const o = this.out.get(keyOf(from, g.session));
    if (!o || o.state === "given" || o.state === "not now") return;   // a give I never asked for, or one already whole, is dropped
    if (g.of === 0) { o.state = "not now"; this.d.tell({ type: "team.session.given", login: o.login, id: o.session, title: o.title, of: 0 }); return; }
    if (o.of && o.of !== g.of) return;   // a page of another give: its count says so
    o.of = g.of;
    o.at = this.d.now();   // the day it lives is counted from the give, not the ask: a give read late is still there
    const had = [...o.pages.values()].reduce((n, p) => n + p.length, 0);
    if (!o.pages.has(g.page) && had + g.lines.length <= GIVE_MAX) o.pages.set(g.page, g.lines);
    o.state = o.pages.size >= o.of ? "given" : "giving";
    o.stall?.();
    if (o.state === "giving") o.stall = this.d.after(STALL_MS, () => this.stalled(o));   // pages that stop coming: what came is it
    if (o.state === "given" || o.pages.size === 1) this.told(o);
  }

  /** a give that stopped partway (the relay dropped, their Sol closed): STALL_MS with no new page, and what came is
   *  given, marked partial, so the agent reads it and, once read, a new ask may go out */
  private stalled(o: Out) {
    o.stall = undefined;
    if (o.state !== "giving" || this.out.get(keyOf(o.login, o.session)) !== o) return;
    o.state = "given";
    this.told(o);
  }

  private told(o: Out) {
    const lines = [...o.pages.values()].reduce((n, p) => n + p.length, 0);
    this.d.tell({ type: "team.session.given", login: o.login, id: o.session, title: o.title, of: o.of, pages: o.pages.size, lines, done: o.state === "given", ...(o.state === "given" && o.pages.size < o.of ? { partial: true } : {}) });
  }

  /** a turn of this session ended: what it read is let go (it is in the session's own transcript now) */
  turnEnded(session: string) {
    for (const [k, o] of this.out) if (o.readIn === session) { o.stall?.(); this.out.delete(k); }
  }

  /** my asks out, for a face (no lines) */
  asked() { this.sweep(); return [...this.out.values()].map((o) => ({ login: o.login, id: o.session, title: o.title, at: o.at, state: o.state })); }

  // ---- the owner ----

  /** an ask from the relay (live, or kept by the hub while I was away): a card, or no at once */
  heardAsk(m: Record<string, any>) {
    this.sweep();
    const from = typeof m?.from?.login === "string" ? m.from.login : "", a = askOf(m ?? {});
    if (!LOGIN.test(from) || !a || !same(a.to, this.d.me()) || same(from, this.d.me())) return;
    const at = typeof m.at === "number" && Number.isFinite(m.at) ? m.at : this.d.now();
    if (this.d.now() - at > ASK_MS) return;   // older than a day: gone, unanswered
    const mine = this.d.mine(a.session);
    // not a session on this Mac: left alone, never answered or kept, so the Mac that has it answers. A live ask reaches
    // every Sol of mine; one the hub kept goes to whichever says hello first (round 113, Not here)
    if (!mine) return;
    // never, or a session of mine that is not a group session of this room (Work, Life, another group): no at once, no card
    if (this.d.setting() === "never" || !mine.group) { this.no(from, a.session); return; }
    const key = keyOf(from, a.session);
    this.waiting.delete(key);   // the same ask again is the newest
    this.waiting.set(key, { key, from: { login: from, agent: m.from.agent === true }, session: a.session, title: mine.title || "a group session", at });   // my own title, never the asker's words
    while (this.waiting.size > WAITING_MAX) this.waiting.delete(this.waiting.keys().next().value!);
    this.push();
  }

  /** the asks waiting on my press, oldest first */
  list(): Waiting[] { this.sweep(); return [...this.waiting.values()]; }

  /** my press: give (yes) sends the session's lines in pages; not now sends a give of 0 */
  async answer(key: string, yes: boolean): Promise<{ ok: true; lines?: number; pages?: number } | { error: string }> {
    const w = this.waiting.get(key);
    if (!w) return { error: "that ask is no longer waiting: it was answered, or a day went by" };
    this.waiting.delete(key); this.push();
    if (!yes || this.d.setting() === "never" || !this.d.mine(w.session)?.group) { this.no(w.from.login, w.session); return yes ? { error: "that session can no longer be given: it is not a group session of this group" } : { ok: true }; }
    let lines: GiveLine[];
    try { lines = giveLines(await this.d.items(w.session), this.d.now(), this.d.home); }
    catch { this.no(w.from.login, w.session); return { error: "that session could not be read on this Mac; they were told not now" }; }
    if (!lines.length) { this.no(w.from.login, w.session); return { error: "that session has nothing said in it yet; they were told not now" }; }
    const pages = pagesOf(lines, this.d.msgMax() || MSG_DEFAULT), of = pages.length;
    this.giving.get(key)?.();
    let next = 0;
    const stop = this.d.every(1000 / GIVE_PER_SECOND, () => {
      if (next >= of) { stop(); this.giving.delete(key); return; }
      const ok = this.d.send("give", { to: w.from.login, session: w.session, page: next + 1, of, lines: pages[next] }, false);
      next++;
      if (!ok) { stop(); this.giving.delete(key); this.d.tell({ type: "team.session.gave", login: w.from.login, id: w.session, error: "the group went out of sight while it was being given; they got part of it" }); }
    });
    this.giving.set(key, stop);
    return { ok: true, lines: lines.length, pages: of };
  }

  private no(to: string, session: string) { this.d.send("give", { to, session, page: 0, of: 0, lines: [] }, true); }
  private push() { this.d.tell({ type: "team.asks", asks: this.list() }); }

  /** what is older than a day goes: an ask never answered, a give never read */
  private sweep() {
    const now = this.d.now();
    let gone = false;
    for (const [k, w] of this.waiting) if (now - w.at > ASK_MS) { this.waiting.delete(k); gone = true; }
    for (const [k, o] of this.out) if (now - o.at > ASK_MS) { o.stall?.(); this.out.delete(k); }
    if (gone) this.push();
  }
}
