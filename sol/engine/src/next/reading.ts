// Replay readings (#1617 Harmony slice S25; named reading.ts, as agreed on #1617, because way/replay.ts already owns
// "replay"): a night, a week or a month's fits read back as stops, in the order that matters, sized to fit 60 seconds.
// Read only, like home/ledger.ts: it reads the Diary (slice 7's next/diary.ts) and the needs (slice 7's next/needs.ts
// rank, read by parts/next-calls.ts) and writes nothing, anywhere.
// The order: each place's best needs.ts rank among the needs open on it (best first; places with none after), then its
// count of acts in the span (most first), then its name. The time: 60 s at most in all; each stop at least 2 s and at
// most 15 s, the rest shared by count of acts; places that do not fit at 2 s each are left out and counted (`rest`).
//   next.replay {span: "night"|"week"|"month-fits"} → next.replay {span, from, to, stops: [{place, at, outcome, ms}], rest}
// A stop: its place, when the span's first act there was, how it came out (waits on you, the last outcome there (a run's end, a pace wait), or
// what was last done there), and how long the reading stays on it.
// Signed: franktsai2008-eng's agent, Harmony slice S25 (#1617).
import { readDay, daysKept, dayOf } from "./diary.js";
import { rankNeeds, type NeedsIn } from "./needs.js";
import type { Heard, Parts } from "../parts.js";

export const BUDGET = 60_000, MIN_MS = 2_000, MAX_MS = 15_000;
export const SPANS = ["night", "week", "month-fits"] as const;
export type Span = (typeof SPANS)[number];
export type Act = { at: number; act: string; place: string; outcome?: string; ask?: string; need?: { src: string; [k: string]: unknown } };
export type Stop = { place: string; at: number; outcome: string; ms: number };
export type Ranks = Map<string, number>;
/** the acts a month's fits are read from */
export const FIT_ACTS = new Set(["fit.set", "fit.back", "offer", "keep", "notnow"]);

/** the asks still open at the end of a list of acts */
const openAsks = (acts: Act[]) => {
  const answered = new Set(acts.filter((a) => a.act === "answer").map((a) => a.ask));
  return acts.filter((a) => a.act === "ask" && a.need && !answered.has(a.ask));
};
const needId = (n: any) => (n.src === "perm" ? `p:${n.sessionId}:${n.item?.id}` : n.src === "thing" ? `t:${n.id}` : n.src === "stage" ? `s:${n.project}/${n.id}` : `d:${n.folder}:${n.sticky}`);

/** each place's best rank, from asks carried in the acts themselves (an ask act holds its needs.ts input) */
export function ranksFromAsks(acts: Act[]): Ranks {
  const open = openAsks(acts), placeOf = new Map(open.map((a) => [needId(a.need), a.place]));
  const i: NeedsIn = { things: [], perms: [], stage: [], drafts: [] };
  const key = { thing: "things", perm: "perms", stage: "stage", draft: "drafts" } as const;
  for (const a of open) { const { src, ...rest } = a.need!; const k = key[src as keyof typeof key]; if (k) (i[k] as unknown[]).push(rest); }
  const best: Ranks = new Map();
  for (const n of rankNeeds(i)) { const p = placeOf.get(n.id); if (p !== undefined && !best.has(p)) best.set(p, n.rank); }
  return best;
}
/** each place's best rank, from the live needs (next.needs rows: piece is the place) */
export function ranksFromNeeds(needs: { piece?: unknown; rank?: unknown }[]): Ranks {
  const best: Ranks = new Map();
  for (const n of needs) if (typeof n.piece === "string" && typeof n.rank === "number" && !(best.get(n.piece)! <= n.rank)) best.set(n.piece, n.rank);
  return best;
}

/** the places in the order that matters (pure) */
export function orderOf(acts: Act[], ranks: Ranks): string[] {
  const count = new Map<string, number>();
  for (const a of acts) count.set(a.place, (count.get(a.place) ?? 0) + 1);
  return [...count.keys()].sort((x, y) => (ranks.get(x) ?? Infinity) - (ranks.get(y) ?? Infinity) || count.get(y)! - count.get(x)! || (x < y ? -1 : x > y ? 1 : 0));
}

/** the stops of a reading (pure): ordered, sized, never over 60 s */
export function reading(acts: Act[], ranks: Ranks): { stops: Stop[]; rest: number } {
  const order = orderOf(acts, ranks), fit = order.slice(0, Math.floor(BUDGET / MIN_MS));
  const open = new Set(openAsks(acts).map((a) => a.place));
  const mine = (p: string) => acts.filter((a) => a.place === p);
  const total = fit.reduce((n, p) => n + mine(p).length, 0), spare = BUDGET - fit.length * MIN_MS;
  const stops = fit.map((place) => {
    const as = mine(place), ends = as.filter((a) => typeof a.outcome === "string");
    const outcome = open.has(place) ? "waits on you" : ends.length ? ends[ends.length - 1].outcome! : as[as.length - 1].act;
    return { place, at: Math.min(...as.map((a) => a.at)), outcome, ms: Math.min(MAX_MS, MIN_MS + Math.floor((spare * as.length) / total)) };
  });
  return { stops, rest: order.length - fit.length };
}

/** a span's bounds, in the Mac's local time: the night before (18:00 to 09:00, or to now), the last 7 days, the last 30 */
export function spanOf(span: Span, now: Date): { from: number; to: number } {
  const at = (d: number, h: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, h).getTime();
  if (span === "night") {
    const from = now.getTime() >= at(0, 18) ? at(0, 18) : at(-1, 18);
    return { from, to: Math.min(now.getTime(), from + 15 * 3600e3) };
  }
  return { from: at(span === "week" ? -7 : -30, 0), to: now.getTime() };
}

/** the Diary's lines in a span, as acts: a line's region is its place (none: "diary"); a pace wait is a run that waits */
export function diaryActs(home: string, from: number, to: number): Act[] {
  const first = dayOf(new Date(from)), last = dayOf(new Date(to));
  return daysKept(home).filter((d) => d >= first && d <= last).flatMap((d) => readDay(home, d))
    .filter((l) => l.at >= from && l.at <= to)
    .map((l) => {
      const fit = (l.embed as any)?.fit, pace = (l.embed as any)?.pace;
      return { at: l.at, place: l.region || "diary", act: fit ? "fit.set" : pace ? "run.wait" : "say", ...(pace ? { outcome: "waits" } : {}) };
    });
}

/** next.replay's answer: read only (the Diary and the needs given), nothing written */
export function replayMsg(home: string, span: Span, needs: { piece?: unknown; rank?: unknown }[], now = new Date()) {
  const { from, to } = spanOf(span, now);
  let acts = diaryActs(home, from, to);
  if (span === "month-fits") acts = acts.filter((a) => FIT_ACTS.has(a.act));
  return { type: "next.replay", span, from, to, ...reading(acts, ranksFromNeeds(needs)) };
}

/** the wire, registered by parts/next-s25.ts (exact type only); `behind` is the ui.next switch */
export function wireReading(p: Parts, behind: (f: (m: any, h: Heard) => unknown) => (m: any, h: Heard) => unknown, needs: () => Promise<unknown[]>) {
  p.on("next.replay", behind(async (m, h) => {
    const refuse = (why: string) => h.send(h.ws, { type: "next.refused", asked: "next.replay", why });
    if (!h.fromSol) return refuse("only Sol's own windows");
    const span = m?.span ?? "night";
    if (!(SPANS as readonly string[]).includes(span)) return refuse(`a span is one of ${SPANS.join(", ")}`);
    const n = await needs().catch(() => []);
    h.send(h.ws, replayMsg(h.HOME, span, n as { piece?: unknown; rank?: unknown }[]));
  }));
}
