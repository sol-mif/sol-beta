// The judge of a sentence (#827; design §7.6; specs home-plan §6 Home 3): a sentence split into parts, and each part's
// read over the five (a note, a date, for you, a job, a thing to make) with the probability of each, the day and hour
// it lands on and after what, and the event of the week it found (a date that adds nothing). The folder is the filer's
// (filer.ts). The only judge tonight is the rule judge, a port of Marco's keyword judge (origin/marco/mine-run
// sol/mac/src/home/whole/reads.ts l.40-128): the design makes his rules each seam's default. Nothing leaves the
// machine: no model, no Jev (a hard gate, not built), no fetch. Pure: the same text, week and time give the same parts.
//   split      at ", ", "; " and " and then "
//   the five   for you: what only the person does (a call is never an agent's); a job: work an agent can do now; a thing
//              to make: a page, a tracker or a deck; a date: an event's noun with a day; a note: anything else. Every
//              part has all five, summing to one within .02
//   verdict    sure at .7 or more, a guess at .45 or more, else it asks
//   when       the hour it names; else after the day's last event that ends by 17:00, an hour on; else 10:00
import type { Mark } from "../contract/home/today.js";
import { READS, type Read } from "../contract/home/reads.js";

export { READS, type Read };
/** one part as a judge reads it (the folder is the filer's) */
export type Reading = { text: string; read: Read; p: Record<Read, number>; at?: number; after?: string; found?: string };
/** a judge: a sentence, the week as the person sees it, and the time, in; its parts out */
export type Judge = { name: string; read: (sentence: string, week: Mark[], now: number) => Reading[] };

/** "sure" (.7 or more), "guess" (.45 or more), else "asks" (MR reads.ts l.29) */
export const verdictOf = (p: number): "sure" | "guess" | "asks" => (p >= 0.7 ? "sure" : p >= 0.45 ? "guess" : "asks");

/** the parts of a sentence (MR reads.ts l.41-43) */
export function split(sentence: string): string[] {
  return sentence.split(/\s*[,;]\s+|\s+and then\s+/i).map((s) => s.trim()).filter(Boolean);
}

// ── when (MR reads.ts l.46-72) ──
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY = new RegExp(`\\b(${DAYS.join("|")}|today|tonight|tomorrow)\\b`, "i");
const CLOCK = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b(?=\s|$)/i;
const dayAt = (base: number, plus: number, h: number, m = 0) => { const d = new Date(base); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + plus, h, m).getTime(); };
/** the day a part names, as days from today, or null: a weekday is its next one (today if it is today) */
export function dayOf(text: string, now: number): number | null {
  const m = WEEKDAY.exec(text);
  if (!m) return null;
  const w = m[1].toLowerCase();
  if (w === "today" || w === "tonight") return 0;
  if (w === "tomorrow") return 1;
  return (DAYS.indexOf(w) - new Date(now).getDay() + 7) % 7;
}
/** an hour the part names ("14:00", "at 3pm"), or null; a bare number counts only with "at" or am/pm */
function clockOf(text: string): [number, number] | null {
  const m = CLOCK.exec(text.replace(WEEKDAY, " "));
  if (!m || (!m[2] && !m[3] && !/\bat\s+\d/i.test(text))) return null;
  let h = Number(m[1]); const min = Number(m[2] ?? 0);
  if (m[3]?.toLowerCase() === "pm" && h < 12) h += 12;
  if (m[3]?.toLowerCase() === "am" && h === 12) h = 0;
  return h < 24 && min < 60 ? [h, min] : null;
}
/** the words of a part without its day and hour ("call Sam about the offer Thursday" → "call Sam about the offer") */
export const bare = (text: string): string => text.replace(WEEKDAY, " ").replace(/\b(on|at|by)\s+(?=\s|$)/gi, " ").replace(/\s+/g, " ").trim();
/** the short name a mark wears on the ribbon ("call Sam"): the bare words up to "about", "for", "with" or "re" */
export const labelOf = (text: string): string => bare(text).split(/\s+(?:about|for|with|re|regarding)\s+/i)[0];

// ── the rule judge (MR reads.ts l.75-128) ──
const YOU = /\b(call|phone|ring|text|visit|meet|see|pick up|drop off|pay|sign|go to|book|buy|talk to|ask)\b/i;
const JOB = /\b(make notes|notes from|summari[sz]e|draft|research|find|compare|collect|sort|clean up|fix|check|translate|outline)\b/i;
const MAKE = /\b(a |an )?(page|tracker|deck|table|board|list|sheet)\b(?! of you)/i;
const EVENT = /\b(exam|midterm|final|lecture|class|lab|meeting|appointment|dinner|lunch|party|interview|seminar|call with|game|concert|flight)\b/i;
const spread = (pick: Read, p: number, second?: Read): Record<Read, number> => {
  const rest = READS.filter((r) => r !== pick), out = { note: 0, date: 0, you: 0, job: 0, make: 0 } as Record<Read, number>;
  out[pick] = p;
  const left = 1 - p, s2 = second ? left * 0.6 : 0;
  for (const r of rest) out[r] = r === second ? s2 : (left - s2) / (second ? rest.length - 1 : rest.length);
  for (const r of READS) out[r] = Math.round(out[r] * 100) / 100;
  return out;
};
/** the event already on the week a part names: same day, a word of its label in the part */
export function foundOf(text: string, week: Mark[], day: number | null, now: number): Mark | null {
  if (day === null) return null;
  const from = dayAt(now, day, 0), to = from + 864e5, words = bare(text).toLowerCase().split(/\s+/);
  return week.find((m) => (m.kind === "event" || m.kind === "big") && m.at >= from && m.at < to && m.label.toLowerCase().split(/\s+/).some((w) => w.length > 2 && words.includes(w))) ?? null;
}
/** when a part lands: the hour it names, else after the day's last event that ends by 17:00 (an hour on), else 10:00 */
function whenOf(text: string, day: number, week: Mark[], now: number): { at: number; after?: string } {
  const c = clockOf(text);
  if (c) return { at: dayAt(now, day, c[0], c[1]) };
  const from = dayAt(now, day, 0), cut = dayAt(now, day, 17);
  const before = week.filter((m) => (m.kind === "event" || m.kind === "big") && m.at >= from && (m.end ?? m.at) <= cut).sort((a, b) => (b.end ?? b.at) - (a.end ?? a.at))[0];
  if (before) { const end = new Date(before.end ?? before.at); return { at: dayAt(now, day, end.getHours() + 1, 0), after: before.label }; }
  return { at: dayAt(now, day, 10) };
}
/** one part, read: the five with their probabilities, when it lands, the event it found */
export function readPart(text: string, week: Mark[], now: number): Reading {
  const day = dayOf(text, now), found = foundOf(text, week, day, now);
  let read: Read, p: Record<Read, number>;
  if (YOU.test(text)) { read = "you"; p = spread("you", 0.86, JOB.test(text) ? "job" : "date"); }
  else if (MAKE.test(text) && !EVENT.test(text)) { read = "make"; p = spread("make", 0.74, "job"); }
  else if (JOB.test(text)) { read = "job"; p = spread("job", 0.82, "make"); }
  else if (day !== null && (EVENT.test(text) || found)) { read = "date"; p = spread("date", found ? 0.91 : 0.78, "note"); }
  else if (day !== null) { read = "date"; p = spread("date", 0.52, "you"); }
  else { read = "note"; p = spread("note", 0.4, "job"); }
  const part: Reading = { text, read, p };
  if (found) { part.found = found.id; part.at = found.at; }
  else if (day !== null) Object.assign(part, whenOf(text, day, week, now));
  return part;
}

/** the factory default: Marco's rules */
export const ruleJudge: Judge = { name: "rule", read: (sentence, week, now) => split(sentence).map((t) => readPart(t, week, now)) };
