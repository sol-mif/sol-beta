// The one list (root part 4, mine/look/br1/strategy/root.html "When a list grows"; meta-build.md "Lists"): a holder, a
// shelf or a folder draws what takes space, ranked, each with its reason; everything else is one count line that opens
// the history, newest first, grouped by day. No caps and no "+N more" of a place's own: 1, 30 or 3,000 things look the
// same calm, because only what ranks is drawn. The view is Collection.tsx; this half is plain so it is tested without
// React. Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).

/** how a place ranks its things: a number draws it (lower first), null folds it into the count line; at is when it
 *  happened (ms), for the history's days; why is the reason drawn beside a ranked thing */
export type Ranking<T> = { rank: (x: T) => number | null; at?: (x: T) => number | undefined; why?: (x: T) => string | undefined };
export type Day<T> = { day: string; items: T[] };
export type Collected<T> = { drawn: T[]; rest: T[]; days: Day<T>[] };

const DAY = 86_400_000;
const start = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** a day's words, from now: Today, Yesterday, the weekday within the week, then the date; no time, Earlier */
export function dayOf(t: number | undefined, now = Date.now()): string {
  if (!t || !Number.isFinite(t)) return "Earlier";
  const ago = Math.round((start(now) - start(t)) / DAY);
  if (ago <= 0) return "Today";
  if (ago === 1) return "Yesterday";
  const d = new Date(t);
  if (ago < 7) return d.toLocaleDateString("en", { weekday: "long" });
  return d.toLocaleDateString("en", { month: "short", day: "numeric", ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } : {}) });
}

/** split a place's things: the ranked ones drawn in their order (ties keep the place's own order), the rest counted and
 *  grouped by day for the history, newest first; a thing with no time goes last, under Earlier */
export function collect<T>(items: readonly T[], r: Ranking<T>, now = Date.now()): Collected<T> {
  const ranked: { x: T; k: number; i: number }[] = [], rest: T[] = [];
  items.forEach((x, i) => { const k = r.rank(x); if (k == null) rest.push(x); else ranked.push({ x, k, i }); });
  ranked.sort((a, b) => a.k - b.k || a.i - b.i);
  const at = (x: T) => r.at?.(x) ?? 0;
  const newest = [...rest].sort((a, b) => at(b) - at(a));
  const days: Day<T>[] = [];
  for (const x of newest) {
    const d = dayOf(r.at?.(x), now), last = days[days.length - 1];
    if (last?.day === d) last.items.push(x); else days.push({ day: d, items: [x] });
  }
  return { drawn: ranked.map((y) => y.x), rest: newest, days };
}
