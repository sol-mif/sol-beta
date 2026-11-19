// People (#1297): the engine's read (engine/src/team/people.ts, GET /team/people, `team.people` on the socket) and what a
// card says of it. Pure, so the card and its test read the same words.

export type Hold = { n: number; title: string; url?: string; kind: string; area: string; since: number; now?: true };
export type WaitWhy = "review" | "decision" | "ask" | "hand" | "offer";
export type Wait = { n?: number; id?: string; title: string; url?: string; why: WaitWhy; since: number; from: string };
export type Flight = { n?: number; title: string; url?: string; state: "building" | "pr" | "answering"; since: number };
export type Landed = { n?: number; pr?: number; title: string; url?: string; when: number };
/** coordination minutes: counted for the reader's own card only; null is "not counted" and reads "—", never 0 */
export type Minutes = { today: number | null; week: number | null };
/** `holds`: the one issue they hold; `open`: every other issue given to them (a count, the titles on opening) */
export type PersonRead = { login: string; name: string; holds: Hold | null; open: Hold[]; waits: Wait[]; agent: { inFlight: Flight[] }; landed: Landed[]; minutes: Minutes };
/** `failed`: a newer read failed and this is the last good one, read at `at` (the engine's keeper) */
export type PeopleRead = { at: number; me: string; tools: boolean; repo: string; people: PersonRead[]; failed?: string };

/** one item of a card's row, as the card draws it */
export type Item = { key: string; title: string; note: string; url?: string; act?: { id: string; words: string } };
/** one of a card's rows: its words, its count, every item (the closed card shows the first two; `hidden`: none until
 *  the card is opened) */
export type Line = { id: "holds" | "open" | "waits" | "agent" | "landed"; words: string; items: Item[]; hidden?: true };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
/** how long ago, short (pure) */
export function ago(at: number, now: number): string {
  const m = Math.max(1, Math.round((now - at) / 60_000));
  return m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`;
}
const num = (n?: number, pr?: number) => (pr ? `#${pr}` : n ? `#${n}` : "");
const WHY: Record<WaitWhy, string> = { review: "review asked", decision: "a decision of your area", ask: "an ask", hand: "handed to you", offer: "offers to take it" };

/** the rows of a person's card (pure). `mine`: the card is the reader's own, so a hand or an offer has its press */
export function linesOf(p: PersonRead, o: { mine: boolean; names: (login: string) => string; now: number }): Line[] {
  const who = (l: string) => (l ? o.names(l) : "");
  const join = (...xs: string[]) => xs.filter(Boolean).join(" · ");
  const hold = (h: Hold) => ({ key: `h${h.n}`, title: h.title, url: h.url, note: join(num(h.n), h.now ? "now" : "", h.area, h.kind) });
  return [
    { id: "holds", words: "holds", items: p.holds ? [hold(p.holds)] : [] },
    { id: "open", words: o.mine ? "open, given to you" : "open, given to them", items: p.open.map(hold), hidden: true },
    { id: "waits", words: o.mine ? "waits on you" : `waits on ${p.name}`, items: p.waits.map((w, i) => ({ key: `w${w.id ?? w.n ?? i}`, title: w.title, url: w.url,
      note: join(num(w.n), w.why === "decision" ? (o.mine ? WHY.decision : "a decision of their area") : w.why === "hand" && !o.mine ? "handed over" : WHY[w.why], w.from ? `from ${who(w.from)}` : "", ago(w.since, o.now)),
      ...(o.mine && w.id && (w.why === "hand" || w.why === "offer") ? { act: { id: w.id, words: w.why === "hand" ? "take" : "answer" } } : {}) })) },
    { id: "agent", words: "agent in flight", items: p.agent.inFlight.map((f, i) => ({ key: `f${f.n ?? i}${f.state}`, title: f.title, url: f.url,
      note: join(num(f.n), f.state === "pr" ? "change open" : f.state === "building" ? "building" : "answering", ago(f.since, o.now)) })) },
    { id: "landed", words: "landed today", items: p.landed.map((l, i) => ({ key: `l${l.pr ?? l.n ?? i}`, title: l.title, url: l.url,
      note: join(num(l.n, l.pr), l.pr ? "merged" : "closed", ago(l.when, o.now)) })) },
  ];
}

/** a person with nothing in any row (pure): their card says so in one line */
export const quiet = (p: PersonRead) => !p.holds && !p.open.length && !p.waits.length && !p.agent.inFlight.length && !p.landed.length && !p.minutes.today;
/** the one line of a card with nothing (pure) */
export const quietWords = (p: PersonRead, mine: boolean) => `${mine ? "You hold" : `${p.name} holds`} nothing open, nothing waits, and nothing landed today.`;
/** the reader's own card first, the others as the read gives them (pure) */
export const ordered = (r: PeopleRead) => [...r.people].sort((a, b) => (same(b.login, r.me) ? 1 : 0) - (same(a.login, r.me) ? 1 : 0));
/** a clock time, as the reader's own Mac says it (pure but for the zone) */
const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
/** the line over the cards when the read is an old one (pure): its time and why the newer read failed; "" for a fresh one */
export const oldWords = (r: PeopleRead, now: number, at: (t: number) => string = clock) =>
  r.failed ? `As read at ${at(r.at)}, ${ago(r.at, now)} ago: the newer read failed (${r.failed}).` : "";
/** the minutes a card shows (pure): a count, or "—" when it is not counted (another person's), never 0 for that */
export const minutesShown = (m: Minutes | undefined) => ({
  today: m?.today == null ? "—" : String(m.today),
  words: m?.week == null ? "minutes coordinating today" : `minutes coordinating today · ${m.week} this week`,
});
