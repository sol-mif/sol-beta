// When a sticky is due (Today, #1487 "See what is due"). The engine keeps a due as a line
// under the sticky, "due: 2026-11-20 18:00", in the person's own clock (agent/stickies.ts); a hand or an agent writes the
// same line. Here: the due read from the words of a new sticky (only a phrase at the end, so a name like "Friday club"
// stays a name), the line read back, Today's one rule (due within a day on either side: older late ones wait at the top
// of their place, the held-out test), and the few words on its chip. Pure: Home and a place draw them.

export const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const at = (d: Date, h: number, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
/** the line's time, in the engine's form */
export const dueText = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WD = "(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues|tue|wed|thurs|thur|thu|fri|sat|sun)";
const MO = "(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\\.?";
const END = new RegExp(`\\s*,?\\s+(?:(by|on|due|before)\\s+)?(tonight|today|tomorrow|tmrw|${WD}|${MO}\\s+(\\d{1,2})(?:st|nd|rd|th)?|(\\d{1,2})(?:st|nd|rd|th)?\\s+${MO})\\s*[.!]?$`, "i");

/** the due a new sticky's words name at their end, and the words without it; null when they name none (or are only a
 *  day). A day's short name counts only after "by" or "on" ("by Fri"), so "in the sun" stays words. */
export function dueIn(words: string, now = Date.now()): { t: string; due: string } | null {
  const m = END.exec(words);
  if (!m) return null;
  const [, prep, phrase, wd, mo1, d1, d2, mo2] = m;
  if (wd && wd.length <= 5 && !/day$/i.test(wd) && !prep) return null;
  const t = words.slice(0, m.index).trim().replace(/[,;:–-]+$/, "").trim();
  if (!t) return null;
  const d = new Date(now), w = phrase.toLowerCase();
  let due: number;
  if (w === "tonight") due = at(d, 20);
  else if (w === "today") due = at(d, 18);
  else if (w === "tomorrow" || w === "tmrw") due = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 18).getTime();
  else if (wd) due = new Date(d.getFullYear(), d.getMonth(), d.getDate() + ((DAYS.indexOf(wd.slice(0, 3).toLowerCase()) - d.getDay() + 7) % 7), 18).getTime();   // that day this week, today included
  else {
    const mo = MONTHS.indexOf((mo1 ?? mo2).slice(0, 3).toLowerCase()), day = Number(d1 ?? d2);
    if (day < 1 || day > 31) return null;
    due = new Date(d.getFullYear(), mo, day, 18).getTime();
    if (due < now - 30 * DAY) due = new Date(d.getFullYear() + 1, mo, day, 18).getTime();   // "Jan 4" said in December
  }
  return { t, due: dueText(due) };
}

const LINE = /^due:\s*(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})\s*$/i;
/** the due a sticky's lines hold, or null */
export function dueOf(notes: readonly string[]): number | null {
  for (const n of notes) { const m = LINE.exec(n); if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime(); }
  return null;
}

/** Today's one rule: due within a day on either side */
export const soon = (due: number | null, now = Date.now()) => due !== null && due >= now - DAY && due <= now + DAY;
/** older than a day late: it waits at the top of its place, its chip red */
export const late = (due: number | null, now = Date.now()) => due !== null && due < now - DAY;

const dayOf = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
/** the chip's words: today 18:00 · tomorrow 09:00 · yesterday 18:00 · 3 days late · Fri · Dec 3 */
export function dueWord(due: number, now = Date.now()): string {
  const days = Math.round((dayOf(due) - dayOf(now)) / DAY), d = new Date(due), hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (days === 0) return `today ${hm}`;
  if (days === 1) return `tomorrow ${hm}`;
  if (days === -1) return `yesterday ${hm}`;
  if (days < -1) return `${-days} days late`;
  if (days < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
/** where tomorrow starts: the hairline in Today goes before the first one due from then on */
export const tomorrowOf = (now = Date.now()) => { const d = new Date(now); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); };

type One = { done: boolean; t: string; notes: string[] };
/** Today's row: each open sticky due within a day on either side, from every place, nearest first */
export function todayOf<M extends One>(lists: readonly { place: string; items: readonly M[] }[], now = Date.now()): { place: string; m: M; due: number }[] {
  const out: { place: string; m: M; due: number }[] = [];
  for (const { place, items } of lists) for (const m of items) { const due = dueOf(m.notes); if (!m.done && soon(due, now)) out.push({ place, m, due: due! }); }
  return out.sort((a, b) => a.due - b.due);
}
/** a place's open stickies in the order they are drawn: the older late ones first (nearest first), then the rest as written */
export function placeOrder<M extends One>(open: readonly M[], now = Date.now()): M[] {
  const lateOnes = open.filter((m) => late(dueOf(m.notes), now)).sort((a, b) => dueOf(a.notes)! - dueOf(b.notes)!);
  return [...lateOnes, ...open.filter((m) => !lateOnes.includes(m))];
}
