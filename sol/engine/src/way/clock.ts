// A way's clock (FORMAT §1.5, §1.4): `daily HH:MM` and `weekly <day> HH:MM` in the way's own zone, and the calendar
// day a moment falls on there (a rule's `d` counts those days, not 24-hour blocks). Pure: the moment comes in as ms and
// the zone is the way's; the wall clock is read back through Intl with that zone, never this machine's clock or zone,
// so a Sol in Taipei runs a New York way at New York's 09:30, on both sides of a change of the clocks.
// A wall time the clocks skip (02:30 on a spring-forward night) happens at the first instant at or after it, the
// instant the clocks jump (03:00 local); a wall time the clocks show twice (01:30 on a fall-back night) happens once, the
// first time.

const DAY = 86_400_000;
const MIN = 60_000;
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const LONG = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** a clock trigger's `on`, read: the weekday (0 Sunday) for a weekly one, and the minutes after midnight */
export type On = { weekday: number | null; minutes: number };

/** an `on` read (pure): null for one that is not `daily HH:MM` or `weekly <day> HH:MM` (an `event:<kind>` is not a
 *  clock's). Days are English, short or long: mon, monday */
export function readOn(on: unknown): On | null {
  if (typeof on !== "string") return null;
  const m = /^(?:daily|weekly ([a-z]+)) ([01]\d|2[0-3]):([0-5]\d)$/.exec(on);
  if (!m) return null;
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  if (!on.startsWith("weekly")) return { weekday: null, minutes };
  const day = DAYS.indexOf(m[1]) >= 0 ? DAYS.indexOf(m[1]) : LONG.indexOf(m[1]);
  return day < 0 ? null : { weekday: day, minutes };
}
/** whether an `on` names a kind of event instead of a time (pure) */
export const isEventOn = (on: unknown): boolean => typeof on === "string" && /^event:[a-z][a-z0-9]*\.[a-z][a-z0-9]*$/.test(on);

/** whether a zone is one Intl knows (pure) */
export function zoneOk(zone: unknown): boolean {
  if (typeof zone !== "string" || !zone) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return true; } catch { return false; }
}

/** the furthest moment either way that counts as a time: what a Date can hold, less a year, so the clock can look a
 *  few days around any time without leaving what a Date reads */
const FAR = 8.64e15 - 366 * DAY;
/** whether a value is a time a clock can read (pure): a number a Date holds. A signed number can be any number
 *  (1e300 is JSON), and a Date asked for one it cannot hold throws */
export const isTime = (t: unknown): t is number => typeof t === "number" && t >= -FAR && t <= FAR;

/** a zone's reader, made once and kept: making one costs far more than a reading, and a replay reads a zone thousands
 *  of times. What is kept changes no answer (a reader holds the zone and nothing else). A zone Intl does not know
 *  throws here, as it did, and is not kept; a zone can be spelled many ways, so the readers kept are counted. Only a
 *  zone that is said is kept: with none (not a string; a way always says one) Intl reads this machine's zone, which
 *  can change under a kept reader, so that reader is made for the one reading */
const readers = new Map<string, Intl.DateTimeFormat>();
function reader(zone: string): Intl.DateTimeFormat {
  let f = typeof zone === "string" ? readers.get(zone) : undefined;
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", era: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    if (typeof zone !== "string") return f;
    if (readers.size >= 64) readers.clear();
    readers.set(zone, f);
  }
  return f;
}

/** the wall clock at a moment in a zone (pure): the day as days since 1970-01-01, and the minutes since its midnight.
 *  For a number that is no time both are NaN: it compares false with everything and never throws. The year is read
 *  with its era (1 BC is the year 0) and set as it is: Date.UTC takes a year under 100 for one of the 1900s */
function wall(t: number, zone: string): { day: number; minutes: number } {
  if (!isTime(t)) return { day: NaN, minutes: NaN };
  const p = Object.fromEntries(reader(zone).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  const year = p.era === "BC" ? 1 - Number(p.year) : Number(p.year);
  return { day: Math.floor(new Date(0).setUTCFullYear(year, Number(p.month) - 1, Number(p.day)) / DAY), minutes: Number(p.hour) * 60 + Number(p.minute) };
}
/** the calendar day a moment falls on in a zone (pure), as days since 1970-01-01: what a rule's `d` counts */
export const dayOf = (t: number, zone: string): number => wall(t, zone).day;

/** the moment a wall-clock time on a day happens in a zone (pure). Both offsets near that day are tried (the one half a
 *  day before, the one half a day after): a time that either gives back is the moment, the first when both do (a time
 *  shown twice); a time neither gives back was skipped, and the first minute the wall clock reaches it or passes it is
 *  the moment */
export function momentOf(day: number, minutes: number, zone: string): number {
  const W = day * DAY + minutes * MIN;
  const at = (t: number) => { const w = wall(t, zone); return w.day * DAY + w.minutes * MIN; };
  const off = (t: number) => at(t) - Math.floor(t / MIN) * MIN;
  const a = W - off(W - DAY / 2), b = W - off(W + DAY / 2);
  const hit = [a, b].filter((t) => at(t) === W).sort((x, y) => x - y);
  if (hit.length) return hit[0];
  let lo = Math.min(a, b), hi = Math.max(a, b);
  if (at(lo) >= W || at(hi) < W) return hi;
  while (hi - lo > MIN) { const mid = lo + Math.floor((hi - lo) / (2 * MIN)) * MIN; if (at(mid) >= W) hi = mid; else lo = mid; }
  return hi;
}

/** the last moment at or before `now` that an `on` names (pure): the tick a trigger fires for. Ticks of a past day the
 *  Sol was closed are not each given: only the latest (FORMAT §1.5: a trigger waits for the runner's Sol to open) */
export function lastTick(on: On, now: number, zone: string): number {
  const today = wall(now, zone).day;
  for (let back = 0; back <= 8; back++) {
    const day = today - back;
    if (on.weekday !== null && new Date(day * DAY).getUTCDay() !== on.weekday) continue;
    const t = momentOf(day, on.minutes, zone);
    if (t <= now) return t;
  }
  return -Infinity;
}

/** whether a moment is one an `on` names (pure): a firing's tick must be one */
export const isTick = (on: On, t: number, zone: string): boolean => lastTick(on, t, zone) === t;

/** every tick of an `on` after `from` and at or before `to` (pure), in order: what replay walks */
export function ticksBetween(on: On, from: number, to: number, zone: string): number[] {
  const out: number[] = [];
  if (!(to > from)) return out;
  for (let day = wall(from, zone).day - 1, last = wall(to, zone).day + 1; day <= last; day++) {
    if (on.weekday !== null && new Date(day * DAY).getUTCDay() !== on.weekday) continue;
    const t = momentOf(day, on.minutes, zone);
    if (t > from && t <= to) out.push(t);
  }
  return out;
}
