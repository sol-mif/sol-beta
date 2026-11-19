// Agents mode (#1327), the face's core, pure: what the engine's agents.* wire says (sol/engine/src/parts/agents.ts),
// read into what each screen of the flow shows (pass 2, play.html): who stands in front on the floor and the one
// question each asks, how far an agent goes, what it does and what stays yours, Home's peek on a sticky, the offer's
// tiles and proof, a desk's lines; and the wire's ask, matched on rid. No React here, so agents.test.ts reads it with
// no window.
// Agents are a functional use of the current jelly creature (Marco, 2026-11-16): each one is the jelly put to one job.

export type Mode = "off" | "watch" | "do";
export type State = "working" | "needs" | "stuck" | "resting" | "off";
export type Line = { at: number; ticket?: string; rule?: string; read: string; made: string; held: string };
export type RuleRow = {
  folder: string; rule: string; sentence: string; mode: Mode; rung?: string; source: string;
  runs: number; made: number; blocked: number; nothing: number; last?: Line;
  held?: { why: "stuck" | "idle" | "asked"; until: string; site?: string };
};
export type Day = { day: string; runs: number; made: number; blocked: number };
/** how far it goes in a place (the engine's Trust): looks, drafts, does; asks is money, a submission or a deletion */
export type Trust = "looks" | "drafts" | "does" | "asks";
export type Trigger = { kind: "input"; source: string } | { kind: "date"; leadDays: number; hour: number; learned: string } | { kind: "own" };
/** one place it works in: its rule there, how far it goes there, its own trigger; `first` caps its first run */
export type PlaceRow = { place: string; name: string; trust: Trust; first?: Trust; trigger: Trigger; folder: string; rule: string };
export type Learned = { id: string; line: string; place: string | null; at: string };
/** a fix waiting on "Always like this?" */
export type AskRow = { fix: string; place: string; before: string; after: string; q: string };
/** a site its rules stopped at (a sign-in): since when (ms), and the rule's own next run (ms) */
export type Stuck = { site: string; folder: string; rule: string; since: number; next?: number };
/** one step of its day (the engine's day.ts): when as a person says it ("07:30", "when a file comes"), what it does */
/** `at`: minutes of the day it starts, null for a step that waits on something ("when a file comes") */
export type DayStep = { when: string; at: number | null; what: string; folder: string; rule: string };
export type AgentRow = {
  id: string; name: string; job: string; turn: number; part: string; born?: { how: string; at: string };
  state: State; next?: string;
  /** the calm pass: its job in ≤12 words, its steps as times of day, its work waiting in Home, the sites it stopped at */
  role?: string; steps?: DayStep[]; waits?: number; stucks?: Stuck[];
  parameter?: string | null; kinds?: string[]; reach?: Trust | null; places?: PlaceRow[]; learned?: Learned[]; asks?: AskRow[];
  stuck?: { site: string; label: string };
  needs?: { title: string; ticketId: string; choices: string[]; wouldHave?: boolean };
  working?: { ticketId: string; since: string };
  rules: RuleRow[]; week: Day[];
};
/** `cause`: why Sol made a change by itself (the keeper); none, the person's own press or the grouping */
export type Cause = "sign-in" | "idle" | "through" | "first-run" | "joined";
export type Change = { id: string; at: string; kind: string; agent: string; line: string; undo: object | null; undone: boolean; undoneAt?: string; cause?: Cause; rules?: { folder: string; rule: string }[] };
/** a rule no agent holds: a routine (one step in one place), or the stickies helper; `stuck` where it stopped */
export type FolderRule = { folder: string; name?: string; part?: string; rule: string; sentence: string; mode: Mode; source?: string; helper?: true; stuck?: Stuck };
/** a join ask (agents.list's joins): two rules in places of one kind that Sol was not sure are one job, the two
 *  agents they are now, both rules' steps side by side ("<place>" where the place was). `inPlace`: two rules of one
 *  place that may be one chain ("One agent for these two steps?"); `p` null: the person's own model said so, no score */
export type JoinRow = { id: string; places: string[]; names: string[]; steps: string[][]; p: number | null; at: string; agents: { id: string; name: string; turn: number }[]; inPlace?: boolean };
/** `looking`: the engine's first grouping (no agents yet) or late look (a join card may still come) is still running in
 *  the background */
export type List = {
  ok: boolean; why?: string; agents: AgentRow[]; folderRules: FolderRule[]; changes: Change[]; offers?: number; joins?: JoinRow[]; looking?: boolean;
  /** changes only when a stored offer does (offersStamp) */
  offersKey?: string;
  /** when the person first saw the floor (agents.meet); `intro`: before that, the sign-in pauses Sol made, one undo */
  met?: string; intro?: { ids: string[]; agents: number; sites: string[] };
  /** the engine's asks (meta/asks.ts) and, past seven agents, its shelves: ranked and counted there, only drawn here */
  asks?: Asks; shelves?: ShelfWire[] | null;
  /** the one line, said once, when the person's own model asked in Jev's place (agents.noted ends it) */
  jevNote?: string;
};

/** a join ask's question: both places by name; two steps of one place, as steps */
export const joinQuestion = (j: Pick<JoinRow, "names" | "inPlace">) => (j.inPlace ? "One agent for these two steps?" : `One agent for ${j.names[0]} and ${j.names[1]}?`);
/** a step as the person reads it, in its own place's column: the masked place said by that place's name */
export const stepWords = (s: string, name: string) => s.replace(/<place>/gi, name);

/** a job Sol noticed (agents.offers): what it would be, the times it saw (the proof), the places of its kind as tiles */
export type OfferPlace = { place: string; name: string; checked: boolean; why?: string; ask?: true };
export type Offer = {
  id: string; name: string; job: string; steps: string[]; parameter: string; kind: string | null; places: OfferPlace[];
  reach: Trust; count: number; showMe?: true; seen: { place: string; at: string; text: string }[]; on: { place: string; sticky: string } | null;
};
/** a desk's reads (agents.desk): what each place's last runs made, as lines; the other places of its kind */
export type Work = { place: string; name: string; folder: string; rule: string; at: number; made: string; file?: string; lines: string[]; unread?: string };
export type More = { place: string; name: string; why?: string; ask?: true };
export type DeskRead = { work: Work[]; more: More[] };

/** stuck > needs > working > resting > off: the order the engine decides a state by, and the floor's order */
export const RANK: Record<State, number> = { stuck: 0, needs: 1, working: 2, resting: 3, off: 4 };
/** the jelly's doing for a state: rest breathes, work drifts its bands, needs lifts */
export const doingOf = (s: State): "rest" | "work" | "needs" => (s === "working" ? "work" : s === "needs" || s === "stuck" ? "needs" : "rest");
/** the floor's jelly works while Sol is still looking (the late look, agents.list `looking`), but only once this long has
 *  passed since the floor drew: a look that ends sooner shows nothing at all */
export const LOOK_SIGN_MS = 3000;
/** ms until the sign shows (0: now; null: never, the list is not looking or the floor has not drawn) (pure) */
export const lookSignIn = (looking: boolean, drewAt: number | null, now: number): number | null =>
  looking && drewAt !== null ? Math.max(0, drewAt + LOOK_SIGN_MS - now) : null;
/** the first grouping still running (looking, no agents yet): the floor shows the jelly at work at once, never "No agents
 *  yet" (that is for a grouping that ended and found nothing) and never an error (pure) */
export const grouping = (l: Pick<List, "looking" | "agents"> | null) => !!l?.looking && l.agents.length === 0;


// ---------------------------------------------------------------- an agent in words

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
/** a time ahead, said as a person says it: "21:00", "tomorrow 07:30", "Sun 18:00", "Nov 24" */
export function whenWord(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t), n = new Date(now);
  const day0 = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day0(d) - day0(n)) / 86_400_000);
  if (days === 0) return hm(d);
  if (days === 1) return `tomorrow ${hm(d)}`;
  if (days > 1 && days < 7) return `${DAYS[d.getDay()]} ${hm(d)}`;
  if (days === -1) return `yesterday ${hm(d)}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** the state in a few words, the thing the person reads first on a card */
export function stateWord(a: AgentRow, now: number): string {
  switch (a.state) {
    case "stuck": return a.stuck ? `stuck: ${a.stuck.label}` : "stuck at a sign-in";
    case "needs": return a.needs ? `needs you: ${a.needs.title}` : "needs you";
    case "working": return a.working ? `working since ${hm(new Date(a.working.since))}` : "working";
    case "resting": {
      const on = a.rules.filter((r) => r.mode !== "off");
      if (on.length && on.every((r) => r.held?.why === "asked")) return "resting until you wake it";
      if (on.length && on.every((r) => r.held?.why === "idle")) return `resting: nothing to do${a.next ? ` · back ${whenWord(a.next, now)}` : ""}`;
      return a.next ? `next ${whenWord(a.next, now)}` : "resting";
    }
    default: return "off";
  }
}

/** resting by the person's hand: every rule held as asked */
export const restingByHand = (a: AgentRow) => a.rules.length > 0 && a.rules.every((r) => r.held?.why === "asked");

/** the agents working in a folder (any of their rules is there), for Home's folder cards */
export const agentsIn = (agents: AgentRow[], folder: string) => agents.filter((a) => a.rules.some((r) => r.folder === folder));

// ---------------------------------------------------------------- making one

/** under four words is a sticky, not an agent (the engine says the same: "a sticky is enough") */
export const tooShort = (line: string) => line.trim().split(/\s+/).filter(Boolean).length < 4;
export const STICKY = "a sticky is enough";

// ---------------------------------------------------------------- the wire: an ask, its answer by rid

type Send = (o: object) => boolean | void;
type Subscribe = (f: (m: any) => void) => () => void;
/** a question with a rid and its answer back (the useAsk pattern of Home, without React): null on time out, or when the
 *  socket never took it. `agents.changed` is not an answer; `onChanged` hears it. */
export function asker(send: Send, subscribe: Subscribe, opts: { prefix?: string; retries?: number; retryMs?: number; onChanged?: () => void } = {}) {
  const waits = new Map<string, (m: any) => void>();
  let n = 0;
  const off = subscribe((m: any) => {
    if (m?.type === "agents.changed") { opts.onChanged?.(); return; }
    const f = typeof m?.rid === "string" ? waits.get(m.rid) : undefined;
    if (f) { waits.delete(m.rid); f(m); }
  });
  const ask = <T>(o: { type: string } & Record<string, unknown>, ms: number) => new Promise<T | null>((res) => {
    const rid = `${opts.prefix ?? "ag"}-${Date.now().toString(36)}-${++n}`;
    const t = setTimeout(() => { waits.delete(rid); res(null); }, ms);
    waits.set(rid, (m) => { clearTimeout(t); res(m as T); });
    // a socket still opening: tried again every half second before giving up (as Home's useAsk)
    const go = (k: number) => {
      if (send({ ...o, rid }) !== false) return;
      if (k < (opts.retries ?? 20)) { setTimeout(() => go(k + 1), opts.retryMs ?? 500); return; }
      clearTimeout(t); waits.delete(rid); res(null);
    };
    go(0);
  });
  // closed, every ask still waiting is answered null at once, so nothing waits on a socket nobody hears any more
  return { ask, close: () => { off(); const fs = [...waits.values()]; waits.clear(); fs.forEach((f) => f(null)); }, waiting: () => waits.size };
}

/** what one press said back, as one line the person reads under it (never a blank) */
export function saidOf(r: { ok?: boolean; why?: string; line?: string; change?: Change } | null, what: string): { ok: boolean; line: string } {
  if (!r) return { ok: false, line: `${what}: the engine did not answer. Nothing changed; try again in a moment.` };
  if (!r.ok) return { ok: false, line: `${what}: ${r.why ?? "it was refused"}.` };
  return { ok: true, line: r.change?.line ?? r.line ?? `${what}: done.` };
}

// ---------------------------------------------------------------- pass 2: the flow (play.html's screens in the kit)

/** the one question a front agent asks and its one answer: what the press sends */
export type Question = { q: string; yes: string; send: { type: string } & Record<string, unknown>; desk?: true };
export function questionOf(a: AgentRow): Question | null {
  if (a.state === "stuck" && a.stuck) return { q: `It stopped at a sign-in: ${a.stuck.label.replace(/^sign in to /, "")}.`, yes: "Sign in", send: { type: "agents.signin", id: a.id } };
  if (a.state === "needs" && a.needs) {
    const yes = a.needs.choices[0];
    return yes ? { q: a.needs.title, yes, send: { type: "agent.answer", ticketId: a.needs.ticketId, choice: yes } } : { q: a.needs.title, yes: "Look", send: { type: "agents.list" }, desk: true };
  }
  const k = a.asks?.[0];
  if (k) return { q: `Always like this: ${quote(k.before)} → ${quote(k.after)}?`, yes: "Look", send: { type: "agents.list" }, desk: true };
  return null;
}
const quote = (s: string) => `“${s.length > 48 ? `${s.slice(0, 47)}…` : s}”`;

/** the three steps of how far, in the order they go */
export const HOW = ["looks", "drafts", "does"] as const;
/** how far it goes now: the step most of its places are at (asks aside); "asks" when every place asks; null with none */
export function howFar(a: Pick<AgentRow, "places">): Trust | null {
  const ps = a.places ?? [];
  if (!ps.length) return null;
  const counts = HOW.map((h) => ps.filter((p) => (p.first ?? p.trust) === h).length);
  const top = Math.max(...counts);
  return top ? HOW[counts.indexOf(top)] : "asks";
}
/** what a step of how far means, in words */
export function howWords(t: Trust | null): string {
  switch (t) {
    case "looks": return "it shows you what it would do, and does nothing";
    case "drafts": return "it gets it ready; you say go";
    case "does": return "it does it; you see it done, with undo";
    case "asks": return "it asks you each time: money, a submission or a deletion";
    default: return "no place yet";
  }
}
/** what it does and what stays yours, from its reach (the offer's two lines) */
export function reachWords(t: Trust): { it: string; you: string } {
  switch (t) {
    case "does": return { it: "does it, in your own things", you: "see it done, and undo any of it" };
    case "drafts": return { it: "gets it ready", you: "send it: what others see waits for you" };
    case "asks": return { it: "gets it ready", you: "say yes each time" };
    default: return { it: "looks, and shows you what it would do", you: "decide what it does" };
  }
}
/** may it go to does? Not when what it makes goes to others, or touches money */
export const mayDo = (a: Pick<AgentRow, "reach">) => a.reach !== "drafts" && a.reach !== "asks";

/** a place's tile line on the desk: how far it goes there, its first run's cap, its trigger */
export function placeLine(p: PlaceRow, now: number): string {
  const how = p.first ? `${p.first} first, then ${p.trust}` : p.trust === "asks" ? "asks each time" : p.trust;
  const t = p.trigger;
  const when = t.kind === "input" ? `when ${t.source} brings something` : t.kind === "date" ? (t.leadDays ? `${t.leadDays} day${t.leadDays === 1 ? "" : "s"} before each date` : "on each date") : "";
  void now;
  return when ? `${how} · ${when}` : how;
}

/** Home's peek: the open offer that was noticed on this sticky of this place (its did: passed the gate) */
export function peekOf(offers: Offer[] | null, place: string | undefined, sticky: string): Offer | null {
  if (!offers || !place) return null;
  const t = sticky.trim().toLowerCase();
  return offers.find((o) => o.on && (o.on.place === place || o.on.place.startsWith(`${place}#`)) && o.on.sticky.trim().toLowerCase() === t) ?? null;
}
/** the offer's head line, its proof: "You did this 3 times" */
export const timesLine = (n: number) => `You did this ${n === 1 ? "once" : n === 2 ? "twice" : `${n} times`}`;
/** one time it saw, as a chip: the place's name and the day */
export function seenChip(s: { place: string; at: string }, places: { place: string; name: string }[]): string {
  const name = places.find((p) => p.place === s.place)?.name ?? s.place.split(/[#/]/).pop() ?? s.place;
  const d = Date.parse(s.at);
  return Number.isFinite(d) ? `${name} · ${new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : name;
}
/** the tiles the offer starts with: checked where its inputs and trigger exist */
export const firstTicks = (o: Offer) => Object.fromEntries(o.places.map((p) => [p.place, p.checked && !p.ask]));
/** a tile's small line: where it is unchecked, the reason; an unsure one asks */
export const tileLine = (p: OfferPlace, kind: string | null) => (p.ask ? `is ${p.name} a ${kind ?? "place like these"}?` : p.why ?? "");

/** the change line that wrote a learned line (its undo), the newest not undone */
export function changeOfLearned(changes: Change[], agent: string, line: string): Change | null {
  return changes.find((c) => c.agent === agent && c.kind === "learned" && !c.undone && c.line.includes(line)) ?? null;
}
/** a run's title on the desk: the place, and when */
export function workTitle(w: Pick<Work, "name" | "at">, now: number): string {
  const d = new Date(w.at), days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(w.at).setHours(0, 0, 0, 0)) / 86_400_000);
  const when = days === 0 ? `today ${hm(d)}` : days === 1 ? `yesterday ${hm(d)}` : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${w.name} · ${when}`;
}
/** a run's lines as the desk draws them (pure): plain lines, and a markdown table as a table. A table's rule row
 *  (|---|) is dropped; a row whose first cell is blank or a dash names nothing and is counted, not drawn (`blank`).
 *  `i`: the line's index, so a press fixes that line in the file */
export type WorkPart = { k: "line"; t: string; i: number } | { k: "table"; head: string[]; rows: { cells: string[]; i: number }[]; blank: number };
const cellsOf = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isRule = (cs: string[]) => cs.every((c) => /^:?-{2,}:?$/.test(c));
const nothing = (c: string | undefined) => !c || /^[-–—]$/.test(c);
export function workParts(lines: string[]): WorkPart[] {
  const out: WorkPart[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith("|")) { out.push({ k: "line", t: lines[i], i }); continue; }
    const t: Extract<WorkPart, { k: "table" }> = { k: "table", head: [], rows: [], blank: 0 };
    for (let first = true; i < lines.length && lines[i].trim().startsWith("|"); i++, first = false) {
      const cs = cellsOf(lines[i]);
      if (isRule(cs)) continue;
      if (first && i + 1 < lines.length && isRule(cellsOf(lines[i + 1]))) { t.head = cs; continue; }
      if (nothing(cs[0])) t.blank++; else t.rows.push({ cells: cs.map((c) => (nothing(c) ? "" : c)), i });
    }
    i--;
    out.push(t);
  }
  return out;
}
/** a table with no row filled in: one quiet line in its place */
export const blankLine = (n: number, filled = 0) =>
  !n ? "Nothing in this table yet" : filled ? `${n} more row${n === 1 ? "" : "s"} not filled in yet` : `${n} row${n === 1 ? "" : "s"}, none filled in yet`;
// Agents in use (#1327, the engine's agent/inuse.ts): what a drawn place said, counted, never sent as words
/** how many times a rule's own id (`clock-3`: a word the person never wrote) stands in text the person reads (pure) */
export function idsIn(text: string, ids: string[]): number {
  let n = 0;
  for (const id of new Set(ids.filter((x) => /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(x)))) {
    n += text.match(new RegExp(`(?<![A-Za-z0-9-])${id}(?![A-Za-z0-9-])`, "g"))?.length ?? 0;
  }
  return n;
}
/** lines drawn as raw markdown (pure): a table row `| a | b |`, a `## heading`, `**bold**`, a `- [ ]` box */
export const rawIn = (lines: string[]) => lines.filter((l) => /^\s*\|.*\|\s*$/.test(l) || /^\s*#{1,6}\s/.test(l) || /\*\*[^*\s][^*]*\*\*/.test(l) || /^\s*[-*]\s\[[ xX]\]/.test(l)).length;
/** every rule id the list knows: its agents' and the routines' */
export const ruleIdsOf = (l: Pick<List, "agents" | "folderRules">) => [...l.agents.flatMap((a) => a.rules.map((r) => r.rule)), ...l.folderRules.map((r) => r.rule)];

/** a typed job for the dashed jelly: under four words it is a sticky */
export const typedJob = (line: string): { ok: true; line: string } | { ok: false; say: string } =>
  tooShort(line) ? { ok: false, say: "One step: a sticky is enough. Say what comes in and what it makes." } : { ok: true, line: line.trim() };

/** a made file with one line rewritten as the person fixed it (pure): the first line that reads `before` (its trimmed
 *  text, headings' marks aside), else null when the file has no such line any more */
export function withLine(text: string, before: string, after: string): string | null {
  const ls = text.split("\n");
  const i = ls.findIndex((l) => l.replace(/^#+\s*/, "").trim() === before.trim());
  if (i < 0) return null;
  const head = /^(#+\s*)/.exec(ls[i])?.[1] ?? "", lead = /^(\s*)/.exec(ls[i].replace(/^#+\s*/, ""))?.[1] ?? "";
  ls[i] = `${head}${lead}${after.trim()}`;
  return ls.join("\n");
}

// ---------------------------------------------------------------- the calm pass (2026-11-17, calm.html)
// What needs the person is the engine's (sol/engine/src/agent/meta/asks.ts): agents.list sends the asks ranked, the one in
// front, the ones under "Then", "N more" and how many need you; and past seven agents, the shelves. Nothing here ranks,
// counts or groups them: this file turns what came into words and into the few things a screen shows (posture, rail,
// the day line, "X only", a join's shades).

/** a site a sign-in ask stopped at: its rule (what "Sign in" sends) and whom it frees */
export type SiteRow = { site: string; folder: string; rule: string; frees: string[] };
/** an ask that blocks: counted in "N need you", on the floor. A join ask names its join (agents.list's joins); a fix ask its agent */
export type Blocked =
  | { need: "blocked"; kind: "signin"; id: "signin"; title: string; sites: SiteRow[]; freed: number; score: number }
  | { need: "blocked"; kind: "join"; id: string; title: string; join: string; freed: number; score: number; where?: string }
  | { need: "blocked"; kind: "fix"; id: string; title: string; agent: string; freed: number; score: number }
  /** an older Sol grouped these agents: `before` now, `after` once regrouped (agents.regroup answers it) */
  | { need: "blocked"; kind: "regroup"; id: "regroup"; title: string; before: number; after: number; freed: number; score: number };
/** work waiting for the person (a draft to send, a payment): Home's card, never on the floor; its agent only counts it */
export type Waits = { need: "waits"; kind: "work"; id: string; title: string; folder: string; rule: string; agent: string | null };
export type FloorAsk = Blocked | Waits;
export type Asks = { front: Blocked | null; then: Blocked[]; more: number; need: number; all: FloorAsk[]; home: Waits[] };
export const noAsks = (): Asks => ({ front: null, then: [], more: 0, need: 0, all: [], home: [] });
/** past seven agents: a shelf by place; `agents` are ids (blocked first), a shelf with a blocked agent is `open`, and
 *  `shown` of its cards stand (the rest "N more") */
export type ShelfWire = { part: string; agents: string[]; blocked: number; open: boolean; shown?: number };

/** the asks as they arrived (an engine that sends none: nothing needs you) */
export const asksIn = (l: Pick<List, "asks">): Asks => l.asks ?? noAsks();
/** the floor's heading: how many need you (only the blocked count), else that nothing does */
export const headingOf = (need: number) => (need <= 0 ? "Nothing needs you" : need === 1 ? "One needs you" : `${need} need you`);
/** a calm floor's line under the heading: the rest is on it; with nothing blocked, how the agents stand */
export function floorSub(need: number, agents: AgentRow[]): string {
  if (need > 0) return "The rest is on it.";
  const n = { working: 0, resting: 0, paused: 0, blocked: 0 };
  for (const a of agents) n[postureOf(a)]++;
  const parts = ([["working", n.working], ["resting", n.resting], ["paused", n.paused]] as const).filter(([, k]) => k > 0).map(([w, k]) => `${k} ${w}`);
  return parts.join(" · ");
}
/** the join an ask is about (agents.list's joins), the agent a fix ask is about; null when it was answered meanwhile */
export const joinOfAsk = (l: Pick<List, "joins">, q: Blocked): JoinRow | null => (q.kind === "join" ? (l.joins ?? []).find((j) => j.id === q.join) ?? null : null);
export const agentOfAsk = (l: Pick<List, "agents">, q: Blocked): AgentRow | null => (q.kind === "fix" ? l.agents.find((a) => a.id === q.agent) ?? null : null);
/** a queued ask's small line */
export const askMeta = (q: Blocked) => (q.kind === "signin" ? `frees ${[...new Set(q.sites.flatMap((s) => s.frees))].join(", ")}` : q.kind === "join" ? (q.where ? `two steps in ${q.where}` : "a question about their job") : q.kind === "regroup" ? "how they are grouped" : "a fix it learned");
/** what Regroup and Keep as is send */
export const regroupSend = (answer: "regroup" | "keep") => ({ type: "agents.regroup" as const, answer });
/** what one site's "Sign in" sends: the rule that stopped there */
export const signinSend = (s: Pick<SiteRow, "folder" | "rule">) => ({ type: "agents.signin" as const, folder: s.folder, rule: s.rule });
/** a site's tile letter: its first word's, past "the", "a", "my" ("the ward roster" → "W") */
export const siteMark = (site: string) => (site.split(/\s+/).find((w) => w && !/^(the|a|an|my|your|our)$/i.test(w)) ?? site).charAt(0).toUpperCase();
/** the first open's one button: it goes to the top ask */
export const startLabel = (q: Blocked | null) => (!q ? "See your agents" : q.kind === "signin" ? "Start with the sign-in" : "Start with the question");

/** nothing yet: no agents, no routines, no job Sol noticed, and the grouping is not running */
export const emptySol = (l: Pick<List, "agents" | "folderRules" | "looking">, offers = 0) => l.agents.length === 0 && l.folderRules.length === 0 && offers === 0 && !l.looking;

// ---- posture: what an agent is doing, in the four ways the floor and the rail draw it

export type Posture = "working" | "blocked" | "resting" | "paused";
/** blocked is a sign-in it stopped at or a question about its job; its work waiting in Home ("needs") is no block: it
 *  stands by its other posture, with the count. Paused is the person's hand (rules off, or all held as asked). */
export function postureOf(a: AgentRow): Posture {
  if ((a.stucks?.length ?? 0) > 0 || (a.asks?.length ?? 0) > 0 || a.state === "stuck") return "blocked";
  if (a.state === "off" || restingByHand(a)) return "paused";
  return a.state === "working" ? "working" : "resting";
}
const POSTURE_RANK: Record<Posture, number> = { blocked: 0, working: 1, resting: 2, paused: 3 };
/** the side rail's state word: a word, never a dot */
export const railWord = (a: AgentRow): string => postureOf(a);
/** the rail holds at most this many agent rows (the engine's CAST: past it the floor stands them on shelves) */
export const RAIL = 7;
/** the rail's rows: blocked first, then working, resting, paused, each group in the list's order; `rest` are the ones left to the floor */
export function railOf(agents: AgentRow[], max = RAIL): { rows: AgentRow[]; rest: number } {
  const all = agents.map((a, i) => ({ a, i })).sort((x, y) => POSTURE_RANK[postureOf(x.a)] - POSTURE_RANK[postureOf(y.a)] || x.i - y.i).map((x) => x.a);
  return { rows: all.slice(0, max), rest: Math.max(0, all.length - max) };
}

/** a card's line under its name: what it waits on, that it works, its next run, or that you paused it. Its work waiting
 *  in Home is a count (homeCount), never the state. */
export function cardStatus(a: AgentRow, now: number): string {
  switch (postureOf(a)) {
    case "blocked":
      if (a.stucks?.length) return `Waiting on ${a.stucks.map((s) => s.site).join(", ")}`;
      if (a.state === "stuck" && a.stuck) return `Waiting on ${a.stuck.label.replace(/^sign in to /, "")}`;
      return "Waiting on your answer";
    case "working": return "Working now";
    case "paused": return "Paused by you";
    default:
      if (a.state === "needs") return a.next ? `Next ${whenWord(a.next, now)}` : "Resting";
      return stateWord(a, now).replace(/^next /, "Next ").replace(/^resting/, "Resting");
  }
}
/** its work waiting in Home, as the card says it; null with none */
export const homeCount = (a: Pick<AgentRow, "waits">) => (a.waits ? `${a.waits} waiting in Home` : null);

// ---- the day line: each agent's runs today on one axis (shown when nothing is blocked)

export type TodayMark = { id: string; name: string; turn: number; at: number; what: string; kind: "past" | "live" | "next"; held: boolean; x: number; lane: number };
/** a mark is kept this far (percent of the axis) from the last one of its lane, else it goes up a lane */
export const MARK_GAP = 12;
export const MARK_LANES = 3;
/** the minutes of the day at `ms` */
export const minutesOf = (ms: number) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };
/** where a minute of the day sits on the axis, in percent */
export const axisX = (min: number) => Math.round((min / 14.4) * 100) / 100;
/** each agent's steps that have an hour, today (pure): past before `now`, live inside an "every hour 07–19" window, next
 *  after; a blocked agent's are held (they will not run); a paused one's are left out */
export function todayOf(agents: AgentRow[], now: number): { marks: TodayMark[]; lanes: number; now: number } {
  const nowMin = minutesOf(now);
  const marks: Omit<TodayMark, "lane">[] = [];
  for (const a of agents) {
    const p = postureOf(a);
    if (p === "paused") continue;
    for (const s of a.steps ?? []) {
      if (s.at === null || s.at === undefined || s.at < 0 || s.at >= 1440) continue;
      const day = /\b(sun|mon|tues|wednes|thurs|fri|satur)day\b/i.exec(s.when);
      if (day && DAYS.findIndex((d) => d.toLowerCase() === day[1].slice(0, 3).toLowerCase()) !== new Date(now).getDay()) continue;   // a step of another weekday is not today's
      const win = /(\d\d)[–-](\d\d)$/.exec(s.when);
      const end = win && /^every /.test(s.when) ? Number(win[2]) * 60 : null;
      const kind: TodayMark["kind"] = end !== null ? (nowMin >= end ? "past" : nowMin >= s.at ? "live" : "next") : s.at < nowMin ? "past" : "next";
      marks.push({ id: a.id, name: a.name, turn: a.turn, at: s.at, what: s.what, kind, held: p === "blocked", x: Math.min(97, Math.max(3, axisX(s.at))) });
    }
  }
  marks.sort((p, q) => p.at - q.at);
  // one agent's steps closer than MARK_GAP are one run, one mark (live if any step is); a mark with no lane free is
  // left out, never drawn over another's name (its card still says it)
  const runs: Omit<TodayMark, "lane">[] = [];
  for (const m of marks) {
    const r = [...runs].reverse().find((x) => x.id === m.id);
    if (r && m.x - r.x < MARK_GAP) { if (m.kind === "live" || (m.kind === "next" && r.kind === "past")) r.kind = m.kind; continue; }
    runs.push({ ...m });
  }
  const last: number[] = [];
  const out: TodayMark[] = [];
  for (const m of runs) {
    let lane = last.findIndex((x) => m.x - x >= MARK_GAP);
    if (lane < 0 && last.length < MARK_LANES) lane = last.length;
    if (lane < 0) continue;
    last[lane] = m.x;
    out.push({ ...m, lane });
  }
  return { marks: out, lanes: Math.max(1, last.length), now: axisX(nowMin) };
}

// ---- the desk's day: "X only" on a step that runs in one place of an agent with two or more

export type DayRow = { when: string; what: string; only: string | null };
/** its steps as the desk lists them: the same step in several places is one row; a step in some places only says which */
export function dayRows(a: Pick<AgentRow, "steps" | "places">): DayRow[] {
  const places = a.places ?? [];
  const total = new Set(places.map((p) => p.name)).size;
  const rows = new Map<string, DayRow & { in: Set<string> }>();
  for (const s of a.steps ?? []) {
    const name = (places.find((p) => p.folder === s.folder && p.rule === s.rule) ?? places.find((p) => p.folder === s.folder))?.name;
    const key = `${s.when}|${s.what.trim().toLowerCase()}`;
    const r = rows.get(key) ?? { when: s.when, what: s.what, only: null, in: new Set<string>() };
    if (name) r.in.add(name);
    rows.set(key, r);
  }
  return [...rows.values()].map(({ when, what, in: ps }) => ({ when, what, only: total >= 2 && ps.size > 0 && ps.size < total ? [...ps].join(", ") : null }));
}

// ---- the join ask: the steps both places share in one shade, the place-only steps in another

const maskStep = (s: string, name: string) => s.replace(/\s+/g, " ").trim().toLowerCase().split(name.toLowerCase()).join("<place>");
/** per column, per step: true when the other column has the same step (compared with the place masked) */
export function joinShades(j: Pick<JoinRow, "names" | "steps">): [boolean[], boolean[]] {
  const col = (i: number) => (j.steps[i] ?? []).map((s) => maskStep(s, j.names[i] ?? ""));
  const [a, b] = [col(0), col(1)];
  return [a.map((s) => b.includes(s)), b.map((s) => a.includes(s))];
}

// ---- shelves (past seven agents): the engine's, read into rows

export type Shelf = { part: string; agents: AgentRow[]; blocked: number; open: boolean; line: string; shown: number };
export const shelfLine = (n: number, blocked: number) => `${n} agent${n === 1 ? "" : "s"} · ${blocked ? `${blocked} wait${blocked === 1 ? "s" : ""} on you` : "all fine"}`;
/** the engine's shelves with their agents; null when it sent none (seven agents or fewer) */
export function shelvesRead(l: Pick<List, "agents" | "shelves">): Shelf[] | null {
  if (!l.shelves) return null;
  return l.shelves.map((s) => {
    const agents = s.agents.map((id) => l.agents.find((a) => a.id === id)).filter((a): a is AgentRow => !!a);
    return { part: s.part, agents, blocked: s.blocked, open: s.open, line: shelfLine(agents.length, s.blocked), shown: Math.min(agents.length, s.shown ?? agents.length) };
  });
}

/** Sol's own changes by cause (rule 6, pure): one line and one undo for each cause; the person's presses one by one */
export type CauseGroup = { key: string; cause: Cause | null; ids: string[]; at: string; line: string; lines: string[]; undone: boolean };
// who a cause's line names: its agents by name, three at most and then how many more; a routine has no name, so a count
const whoOf = (names: string[], n: number) =>
  !names.length ? String(n) : names.length === 1 ? names[0]
    : names.length <= 3 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
    : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
const CAUSE_LINE: Record<Cause, (who: string, one: boolean, n: number) => string> = {
  "sign-in": (w, one) => `Paused ${w} at a sign-in, instead of a retry every hour; ${one ? "it wakes" : "they wake"} when you sign in`,
  idle: (w, one) => `Rested ${w} with nothing to do; ${one ? "it wakes" : "they wake"} when something comes`,
  through: (w, one) => `Woke ${w}: what ${one ? "it" : "they"} waited on came through`,
  "first-run": (w, one) => `Let ${w} past ${one ? "its" : "their"} careful first run`,
  joined: (w, _one, n) => `${n === 1 ? "A new place" : `${n} new places`} joined ${w}, at drafts first`,
};
/** `nameOf`: an agent's name by its id (the page's agents); without it, or for a routine, the line counts */
export function causesOf(changes: Change[], nameOf: (agent: string) => string | undefined = () => undefined): CauseGroup[] {
  const out: CauseGroup[] = [];
  for (const c of changes) {
    if (!c.cause) { out.push({ key: c.id, cause: null, ids: [c.id], at: c.at, line: c.line, lines: [c.line], undone: c.undone }); continue; }
    const key = `${c.cause}|${c.undone ? "u" : ""}`;
    const g = out.find((x) => x.key === key);
    if (g) { g.ids.push(c.id); g.lines.push(c.line); if (c.at > g.at) g.at = c.at; }
    else out.push({ key, cause: c.cause, ids: [c.id], at: c.at, line: "", lines: [c.line], undone: c.undone });
  }
  for (const g of out) {
    if (!g.cause) continue;
    const names = g.ids.map((id) => nameOf(changes.find((c) => c.id === id)?.agent ?? ""));
    const known = names.every(Boolean) ? [...new Set(names as string[])] : [];
    const n = g.ids.length, one = known.length ? known.length === 1 : n === 1;
    const who = known.length ? whoOf(known, n) : g.cause === "joined" ? (one ? "its agent" : "their agents") : String(n);
    g.line = CAUSE_LINE[g.cause](who, one, n);
  }
  return out.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
}
/** the floor's foot: how many things Sol changed by itself this week, counted by cause */
const DAY = 86_400_000;
export const changedCount =(changes: Change[], now: number) => causesOf(changes.filter((c) => !c.undone && Date.parse(c.at) > now - 7 * DAY)).length;

/** the floor's foot: what Sol changed this week, as the link says it */
export const changedLine = (n: number) => (n > 0 ? `Sol changed ${n} thing${n === 1 ? "" : "s"} this week` : "Sol changed nothing this week");

/** the wire's agents.list as the face keeps it (pure): every part defaulted (asks: nothing needs you; shelves: none), the
 *  first open's two (met, intro) kept */
export const listOf = (r: Partial<List>): List => ({
  ok: true, agents: r.agents ?? [], folderRules: r.folderRules ?? [], changes: r.changes ?? [], offers: r.offers ?? 0, joins: r.joins ?? [], looking: r.looking === true,
  asks: r.asks ?? noAsks(), shelves: r.shelves ?? null, ...(typeof r.offersKey === "string" ? { offersKey: r.offersKey } : {}),
  ...(r.met ? { met: r.met } : {}), ...(r.intro ? { intro: r.intro } : {}), ...(typeof r.jevNote === "string" && r.jevNote ? { jevNote: r.jevNote } : {}),
});
/** what the list says of the stored offers (pure): agents.offers is read again only when this changes, never on each
 *  list (#1429: each read of the offers told every face, whose list read the offers again). An engine without
 *  offersKey: the open count */
export const offersStamp = (l: Pick<List, "offers" | "offersKey">) => l.offersKey ?? `n${l.offers ?? 0}`;
/** Home's read of the agents (HomeTags), one call per agents.changed: the list each time, the open offers only when
 *  offersStamp changed (none open: none asked). `got` hears each list that read */
export function agentsReader(ask: <T>(o: { type: string }, ms: number) => Promise<T | null>, got: (agents: AgentRow[], offers: Offer[], need: number) => void) {
  let stamp: string | null = null, offers: Offer[] = [];
  return async () => {
    const r = await ask<List>({ type: "agents.list" }, 15_000);
    if (!r?.ok) return;
    const s = offersStamp(r);
    if (s !== stamp) {
      const o = r.offers ? await ask<{ ok: boolean; offers?: Offer[] }>({ type: "agents.offers" }, 60_000) : null;
      if (!r.offers || o?.ok) { stamp = s; offers = o?.offers ?? []; }
    }
    got(r.agents ?? [], offers, asksIn(r).need);
  };
}
/** the first open's one sentence (rule 6): the sign-in pauses before the first visit, with one undo for all; null with none */
export function introOf(l: Pick<List, "met" | "intro">): { line: string; ids: string[] } | null {
  if (l.met || !l.intro?.ids.length) return null;
  const n = l.intro.agents, sites = l.intro.sites;
  const who = n === 1 ? "One of them was" : `${n} of them were`;
  return { line: `${who} stuck at a sign-in${sites.length ? ` (${sites.join(", ")})` : ""}, so Sol paused ${n === 1 ? "it" : "them"} instead of letting ${n === 1 ? "it" : "them"} retry every hour. Nothing is lost.`, ids: l.intro.ids };
}
/** the routines' line at the floor's foot (rule 3) */
export const routinesLine = (rs: FolderRule[]) => (rs.length ? `${rs.length} routine${rs.length === 1 ? "" : "s"} stay${rs.length === 1 ? "s" : ""} in ${rs.length === 1 ? "its folder" : "their folders"}` : "");
/** the first open's lead: what Sol read, and how many agents it made */
export const meetLine = (agents: number, rules: number, places: number) =>
  `Sol read your ${places === 1 ? "place" : `${places} places`}: ${rules} rule${rules === 1 ? "" : "s"}, doing ${agents} job${agents === 1 ? "" : "s"}. Each job has one agent.`;
