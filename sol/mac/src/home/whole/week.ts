// The ribbon (#793, plan Part C slice 30; home/whole.md "The ribbon", pick 3 a), behind sol.home.whole: Home's week on
// one line, now to Sunday. The pure half: where a moment falls on the line, which lane a running job's thread takes,
// and which row a label sits on. Ribbon.tsx draws it; the marks come from Today.week (today.ts, stubbed until #790).
import type { Mark } from "./today.ts";

/** each day's share of the line, today first (pick 3 a: nearer days are wider) */
export const WIDTHS = [0.25, 0.17, 0.14, 0.15, 0.12, 0.085, 0.085] as const;
/** a day on the ribbon runs from 7:00 to midnight; earlier and later moments sit at its ends */
export const DAY_FROM = 7, DAY_TO = 24;
/** the ribbon's rows, top down: the day's name, two label rows, the track, then the threads' lanes */
export const GEO = { dayLabel: 0, now: 20, labelHigh: 30, labelLow: 48, track: 74, lane0: 88, lane: 16, foot: 24 } as const;

const dayStart = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
/** whole days from the start of `from`'s day to the start of `t`'s day (a DST day counts as one) */
export const dayIndex = (t: number, from: number) => Math.round((dayStart(t) - dayStart(from)) / 864e5);

/** where day i begins, as a share of the line */
export const dayLeft = (i: number) => WIDTHS.slice(0, Math.max(0, i)).reduce((a, b) => a + b, 0);

/** where a moment falls on a line `w` wide whose first day is `now`'s; null before today or after Sunday's end */
export function xOf(t: number, now: number, w: number): number | null {
  const i = dayIndex(t, now);
  if (i < 0 || i >= WIDTHS.length) return null;
  const d = new Date(t), h = Math.max(DAY_FROM, Math.min(DAY_TO, d.getHours() + d.getMinutes() / 60));
  return (dayLeft(i) + ((h - DAY_FROM) / (DAY_TO - DAY_FROM)) * WIDTHS[i]) * w;
}

/** the days' heads: "today 9", then "Tue 10" … "Sun 15", each with where it starts and how wide it is */
export function daysOf(now: number, w: number): { name: string; date: number; x: number; w: number; today: boolean }[] {
  const d = new Date(now);
  return WIDTHS.map((share, i) => {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
    return { name: i === 0 ? "today" : day.toLocaleDateString("en-GB", { weekday: "short" }), date: day.getDate(), x: dayLeft(i) * w, w: share * w, today: i === 0 };
  });
}

/** a running job's thread (the Try line): it runs from now, or from when it starts if that is later, to its due point.
 *  A job already past due ends at now, a dot with no length; a due point after Sunday runs to the line's end. */
export function threadOf(m: Mark, now: number, w: number): { x0: number; x1: number } | null {
  if (m.kind !== "thread") return null;
  const start = Math.max(now, m.from ?? now);
  const x0 = xOf(start, now, w);
  if (x0 === null) return null;
  const x1 = m.at <= start ? x0 : xOf(m.at, now, w) ?? w;
  return { x0, x1: Math.max(x0, x1) };
}

/** the threads' lanes under the track: each takes the first lane whose last thread ended before it begins */
export function lanesOf(spans: { id: string; x0: number; x1: number }[], gap = 0): Map<string, number> {
  const ends: number[] = [], out = new Map<string, number>();
  for (const s of [...spans].sort((a, b) => a.x0 - b.x0)) {
    let l = ends.findIndex((e) => e + gap <= s.x0);
    if (l < 0) { l = ends.length; ends.push(s.x1); } else ends[l] = s.x1;
    out.set(s.id, l);
  }
  return out;
}

/** each label's row above the track: the low row unless the label before it there would overlap, then the high row.
 *  Where both are taken the label is dropped (null; its mark keeps its title): fit or drop, never two words on one
 *  place (#891, the human checks: labels ran into each other on a narrow week). `wOf` measures a label. */
export function rowsOf(items: { id: string; x: number; label: string }[], wOf: (s: string) => number, gap = 8): Map<string, 0 | 1 | null> {
  const end: [number, number] = [-Infinity, -Infinity], out = new Map<string, 0 | 1 | null>();
  for (const it of [...items].sort((a, b) => a.x - b.x)) {
    const r: 0 | 1 | null = end[0] + gap <= it.x ? 0 : end[1] + gap <= it.x ? 1 : null;
    if (r !== null) end[r] = it.x + wOf(it.label);
    out.set(it.id, r);
  }
  return out;
}

/** where the front card's mark is tied down to the card (home/whole.md "A card"): its point on the week first, else the
 *  end of its running job's thread; none when the front has no mark this week, or its mark lies past `reach` (the card's
 *  right edge, where the tie would hang over nothing). */
export function tieOf(week: Mark[], front: string | null | undefined, now: number, w: number, reach: number): number | null {
  if (!front) return null;
  const mine = week.filter((m) => m.thingId === front);
  const point = mine.find((m) => m.kind !== "thread");
  const pointX = point ? xOf(point.at, now, w) : null;
  const thread = pointX === null ? mine.find((m) => m.kind === "thread") : undefined;
  const x = pointX ?? (thread ? threadOf(thread, now, w)?.x1 ?? null : null);
  return x !== null && x <= reach ? x : null;
}

/** a label set beside `x` reads to the right, unless it would pass the line's end `w`; then it reads to the left of `x`,
 *  so nothing on the week runs past the ribbon's right edge */
export const leftOf = (x: number, labelW: number, w: number, gap = 0) => x + gap + labelW > w;
