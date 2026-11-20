// The groups home (#1537): a Sol user's own Cowork, one table per group. What each table shows, worked out here and
// pure, so `node --test` reads it: who sits at it (each person a jelly, their AI a coin), one number, one line of what
// is happening, and the one thing that waits on me. Everything comes from what the engine already says (team.state's
// rooms and agents, team.rooms.people, the hands); a state it does not say is drawn at rest, never made up.
import { groupsOf } from "../rooms.ts";

/** an AI's coin: at work (the bands drift), waits on you (yellow ?), done (green tick), at rest (grey) */
export type Coin = "work" | "ask" | "done" | "rest";
export type Seat = { login: string; me: boolean; coin: Coin };
/** what a table is kept in: a GitHub repository, a Drive folder, the cloud */
export type Kind = "github" | "drive" | "cloud";
export type Ask = { id: string; from: string; title: string; at?: string };
/** one real thing on a table's stage: a hand-over at it, newest first (gate one q3: never a made-up shape) */
export type StageRow = { key: string; number: number; text: string; brief: string; at: string };
export type TableView = { id: string; name: string; kind: Kind; seats: Seat[]; more: number; count: { n: number; word: string }; line: { text: string; coin?: Coin }; ask: Ask | null; inUse: boolean; stage: StageRow[] };

export type RoomIn = { id: string; name: string; provider: string; repos: string[]; hub?: string; code?: string; mine?: boolean; joined?: boolean };
export type AgentIn = { of: string; working: boolean };
export type HandIn = { repo: string; number: number; at: string; how: string; from: string; to: string; line?: string; brief?: string };
export type PendingIn = { id: string; from: string; repo: string; issue: number; title: string; at?: string };
export type HomeIn = { rooms: RoomIn[]; inUse: string; me: string; people: Record<string, string[]>; agents: AgentIn[]; hands: HandIn[]; pending: PendingIn[]; now: number };

/** at most this many seats on a table's edge; the rest are counted */
export const SEATS = 4;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const day = (t: number) => new Date(t).toDateString();
const WEEKDAY = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/** a count in words, as the page's one line says it: "three tables." */
export const inWords = (n: number) => WORDS[n] ?? String(n);
/** a person as the table says them: "you" for me */
export const nameOn = (login: string, me: string) => (same(login, me) ? "you" : login);

/** the room a repository belongs to: the first of mine that names it */
const roomOfRepo = (rooms: RoomIn[], repo: string) => rooms.find((r) => r.repos.some((x) => same(x, repo)));

/** every table, in the order the rooms are kept (pure) */
export function tablesOf(i: HomeIn): TableView[] {
  const rooms = groupsOf(i.rooms);
  // what waits on me, each to the table its repository is at; one whose repository no table names waits at the one in use
  const asks = new Map<string, Ask>();
  for (const p of i.pending) {
    const at = roomOfRepo(rooms, p.repo)?.id ?? i.inUse;
    if (!asks.has(at)) asks.set(at, { id: p.id, from: p.from, title: p.title || `#${p.issue}`, ...(p.at ? { at: p.at } : {}) });
  }
  return rooms.map((r) => {
    const inUse = r.id === i.inUse;
    const ask = asks.get(r.id) ?? null;
    const sat = i.people[r.id]?.length ? i.people[r.id] : [i.me];
    // the others first, in the order read, me last: "marco, isaac, you"
    const order = [...sat.filter((l) => !same(l, i.me)), ...(sat.some((l) => same(l, i.me)) ? [i.me] : [])];
    const coinOf = (login: string): Coin => {
      if (ask && same(ask.from, login)) return "ask";
      // the agents the engine names are the room in use's: another table's AI is not read, so it rests
      if (inUse && i.agents.some((a) => same(a.of, login) && a.working)) return "work";
      return "rest";
    };
    const seats = order.slice(0, SEATS).map((login) => ({ login, me: same(login, i.me), coin: coinOf(login) }));
    const rows = i.hands.filter((h) => r.repos.some((x) => same(x, h.repo))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const today = rows.filter((h) => h.how === "hand" && day(Date.parse(h.at)) === day(i.now)).length;
    const count = today ? { n: today, word: "handed today" } : { n: order.length, word: "at the table" };
    const kind: Kind = r.provider === "drive" ? "drive" : r.provider === "cloud" ? "cloud" : "github";
    return { id: r.id, name: r.name || r.id, kind, seats, more: Math.max(0, order.length - SEATS), count, line: lineOf(seats, rows, i), ask, inUse, stage: stageOf(rows, i.me) };
  });
}

/** what sits on a table's stage (pure): its last hand-overs, said as a person says them; empty when nothing was */
export const STAGE = 5;
export function stageOf(rows: HandIn[], me: string): StageRow[] {
  return rows.slice(0, STAGE).map((h) => {
    const who = nameOn(h.from, me), to = nameOn(h.to, me);
    const text = h.how === "taken" ? `${who} took #${h.number}` : h.how === "passed" ? `${who} passed #${h.number} back` : h.how === "back" ? `${who} took #${h.number} back` : h.how === "review" ? `${who} asked ${to} to review #${h.number}` : `${who} handed #${h.number} to ${to}`;
    return { key: `${h.repo}#${h.number}@${h.at}`, number: h.number, text, brief: h.brief || h.line || "", at: h.at };
  });
}

/** a line of the table's talk as the engine's team.chat says it (only what the stage reads) */
export type TalkIn = { id: string; at: number; from: string; agent?: boolean; text: string; kind?: string; artifact?: { title?: string } };
const short = (t: string, n = 140) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
/** what was said at a table (pure): each line of its talk as one stage row, newest first; a thing handed in shows its name */
export function talkRows(lines: readonly TalkIn[], me: string): StageRow[] {
  return [...lines].filter((l) => l.text?.trim() || l.artifact?.title).sort((a, b) => b.at - a.at).slice(0, STAGE).map((l) => {
    const who = l.agent ? `${nameOn(l.from.replace(/'s agent$/i, ""), me) === "you" ? "your" : `${l.from.replace(/'s agent$/i, "")}'s`} ai` : nameOn(l.from, me);
    return { key: `talk:${l.id}`, number: 0, text: who, brief: short(l.text?.trim() || l.artifact?.title || ""), at: new Date(l.at).toISOString() };
  });
}
/** a table's stage (pure): its hand-overs and what was said there, newest first, at most STAGE */
export const stageWith = (hands: readonly StageRow[], talk: readonly StageRow[]): StageRow[] =>
  [...hands, ...talk].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, STAGE);

/** a table's one line: an AI at work, else the last hand there, else how long it has been quiet (pure) */
function lineOf(seats: Seat[], rows: HandIn[], i: HomeIn): TableView["line"] {
  const busy = seats.find((s) => s.coin === "work");
  if (busy) return { text: `${busy.me ? "your" : `${busy.login}'s`} ai is at work`, coin: "work" };
  const last = rows[0];
  if (!last) return { text: "nothing here yet" };
  const t = Date.parse(last.at);
  if (day(t) === day(i.now)) return { text: `${nameOn(last.from, i.me)} ${last.how === "taken" ? "took" : last.how === "passed" ? "passed back" : "handed"} #${last.number}${last.how === "hand" ? ` to ${nameOn(last.to, i.me)}` : ""}` };
  const ago = i.now - t;
  return { text: ago < 6 * 86_400_000 ? `quiet since ${WEEKDAY[new Date(t).getDay()]}` : "quiet for a while" };
}

/** the page's one line (pure): who waits on me, else how many tables */
export function titleOf(tables: TableView[]): string {
  const ask = tables.find((t) => t.ask);
  if (ask?.ask) return `${ask.ask.from} is waiting.`;
  return tables.length === 1 ? "one table." : `${inWords(tables.length)} tables.`;
}

/** how long ago, in the words a person says it: "12 min ago", "3 h ago", "yesterday" (pure) */
export function agoOf(at: string | undefined, now: number): string {
  const t = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(t)) return "";
  const m = Math.max(0, Math.round((now - t) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 24 * 60) return `${Math.round(m / 60)} h ago`;
  return m < 48 * 60 ? "yesterday" : `${Math.round(m / 1440)} days ago`;
}

/** the way in (#1461 step 1): a Sol on the team (a room kept in a GitHub org, or the team's own checkout running as
 *  concept) opens the team's shell; everyone else opens their own groups home (pure) */
export function opensShell(_rooms: { org?: string }[] | undefined, version: string | null): boolean {
  // the team's own Sol only (gate one q1, product/cowork): a table kept in a GitHub org is any person's, not the team's,
  // so it no longer opens the team's pages, which name our people, our machine and our night (versionOf: concept is
  // the team's own checkout running as concept, never a tester's Sol)
  return version === "concept";
}

/** a table's code as the design shows it (pure): "K7Q2MX" → "k7q 2mx"; "" when it has none yet */
export const codeShown = (code: string | undefined) => (code ? `${code.slice(0, 3)} ${code.slice(3)}`.toLowerCase().trim() : "");

/** how far my AI goes, in the design's three words (pure), from the engine's permission mode */
export type Level = "asks first" | "does, then tells" | "just does";
export const LEVELS: Level[] = ["asks first", "does, then tells", "just does"];
export function levelOf(mode: string | undefined): Level {
  return mode === "bypassPermissions" ? "just does" : mode === "acceptEdits" || mode === "auto" ? "does, then tells" : "asks first";
}
/** the permission mode a level means (pure) */
export const modeOf = (l: Level) => (l === "just does" ? "bypassPermissions" : l === "does, then tells" ? "acceptEdits" : "default");

/** the table's people in words for the left column (pure): the others, "marco, isaac"; nobody else, "just you" */
export const othersOf = (seats: { login: string; me: boolean }[], more: number) => {
  const o = seats.filter((s) => !s.me).map((s) => s.login);
  if (!o.length) return "just you";
  return more > 0 ? `${o.join(", ")} +${more}` : o.join(", ");
};

/** "say it to marco and isaac, or hand the table a thing" (pure) */
export function barWords(seats: { login: string; me: boolean }[]): string {
  const o = seats.filter((s) => !s.me).map((s) => s.login);
  const who = o.length === 0 ? "the table" : o.length === 1 ? o[0] : o.length === 2 ? `${o[0]} and ${o[1]}` : `${o.slice(0, -1).join(", ")} and ${o[o.length - 1]}`;
  return `say it to ${who}, or hand the table a thing`;
}
/** who gets a thing handed to the table or to one person (pure). The table's talk is one room: everyone at it sees the
 *  thing; the @ says whose AI acts on it */
export function getsIt(seats: { login: string; me: boolean }[], to: string): string {
  if (to) return `${to}'s ai acts on it. everyone at the table sees it.`;
  const o = seats.filter((s) => !s.me).map((s) => `${s.login}'s`);
  if (!o.length) return "nobody else is here yet; it waits with the table.";
  return `${o.length === 1 ? `${o[0]} ai gets it` : `${o.slice(0, -1).join(", ")} and ${o[o.length - 1]} ai ${o.length === 2 ? "both" : "all"} get it`}. yours won't act on it.`;
}
