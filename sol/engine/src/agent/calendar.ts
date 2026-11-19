// The folder's calendar (step 2): one file, <folder>/calendar.md, that the agent keeps. The class times (from brain.md)
// and every dated thing the Blackboard walk, the mail and the chats found (a due date, the exam, a meeting), each with
// where it was found. clock.ts's "class day" and "exam-N" read it. A line Marco writes himself wins over a found one:
// a found line carries "· found: …"; his has no such mark, and a found thing with the same name as his is not written.
//
//   # Calendar
//   - class: Mon/Wed/Fri 10:10 · found: brain.md
//   - 2026-11-13 23:59 · Chapter 11 quiz closes · found: blackboard /ultra/courses/_355037_1/assignments/chapter-11-quiz
//   - 2026-11-24 · final exam                       ← his own line
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";

export type Dated = { date: string; time?: string; what: string; source: string };
export type Line = Dated & { mine: boolean };
export type Calendar = { classDays: number[] | null; classTime: string | null; classMine: boolean; items: Line[] };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** calendar.md read (pure) */
export function parseCalendar(text: string): Calendar {
  const cal: Calendar = { classDays: null, classTime: null, classMine: false, items: [] };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("-")) continue;
    const parts = line.replace(/^-\s*/, "").split(/\s+·\s+/);
    const found = parts.find((p) => /^found:/i.test(p));
    const mine = !found;
    const cls = /^class:\s*(.+)$/i.exec(parts[0]);
    if (cls) {
      if (cal.classDays && !mine) continue;   // his line came first and wins
      if (cal.classMine && !mine) continue;
      const days = [...cls[1].toLowerCase().matchAll(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*/g)].map((m) => DAY[m[1]]);
      cal.classDays = days.length ? days : null;
      cal.classTime = /\b(\d{1,2}):(\d{2})\b/.exec(cls[1])?.slice(1, 3).map((x) => pad(Number(x))).join(":") ?? null;
      cal.classMine = mine;
      continue;
    }
    const d = /^(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?$/.exec(parts[0]);
    if (!d || !parts[1]) continue;
    cal.items.push({ date: d[1], ...(d[2] ? { time: d[2].padStart(5, "0") } : {}), what: parts[1], source: found ? found.replace(/^found:\s*/i, "") : "Marco", mine });
  }
  return cal;
}

/** the name a thing is matched by (pure): lower case, no dates, times or punctuation, its first six words */
export const keyOf = (what: string) => what.toLowerCase().replace(/\b\d{1,2}(:\d{2})?\s*(am|pm)\b|\b\d+\b/g, " ").replace(/[^a-z ]+/g, " ").split(/\s+/).filter(Boolean).slice(0, 6).join(" ");

const lineOf = (d: Dated) => `- ${d.date}${d.time ? ` ${d.time}` : ""} · ${d.what.replace(/\s+·\s+/g, " - ").slice(0, 120)} · found: ${d.source.slice(0, 160)}`;

/** calendar.md with what was found merged in (pure). His lines stay as written; a found thing he already has is left
 *  out; a found thing seen before with a new date is moved; the class line is written when there is none */
export function mergeCalendar(text: string, found: Dated[], cls?: { days: number[] | null; time: string | null; from: string }): string {
  const cal = parseCalendar(text);
  let lines = text.trim() ? text.replace(/\s+$/, "").split("\n") : ["# Calendar", "", "Kept by this folder's agent: the class times and every dated thing it found, with where. A line you write yourself (no \"found:\") wins over a found one."];
  const mineKeys = new Set(cal.items.filter((i) => i.mine).map((i) => keyOf(i.what)));
  if (cls?.days && cal.classDays === null) {
    const at = lines.findIndex((l) => /^-\s/.test(l));
    const cl = `- class: ${cls.days.map((d) => DAYS[d]).join("/")}${cls.time ? ` ${cls.time}` : ""} · found: ${cls.from}`;
    if (at < 0) lines.push("", cl); else lines.splice(at, 0, cl);
  }
  for (const f of found) {
    const k = keyOf(f.what);
    if (!k || mineKeys.has(k)) continue;
    const at = lines.findIndex((l) => { const p = parseCalendar(l).items[0]; return !!p && !p.mine && keyOf(p.what) === k; });
    if (at >= 0) {
      const was = parseCalendar(lines[at]).items[0];
      if (was.date !== f.date || (f.time && was.time !== f.time)) lines[at] = lineOf(f);
      continue;
    }
    lines.push(lineOf(f));
  }
  // dated lines in date order, his and found together, after the heading and the class line
  const head = lines.filter((l) => !parseCalendar(l).items.length);
  const dated = lines.filter((l) => parseCalendar(l).items.length).sort((a, b) => a.replace(/^-\s*/, "").localeCompare(b.replace(/^-\s*/, "")));
  return [...head, ...dated].join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

/** the exam day (pure): his line first, else a found one; the soonest line that names an exam, midterm or final */
export function examIn(cal: Calendar, today = ""): string | null {
  const ex = (i: Line) => /\b(exam|midterm|final)\b/i.test(i.what) && !/\b(review|practice|extra credit|sample)\b/i.test(i.what) && i.date >= today;
  return cal.items.filter((i) => i.mine && ex(i)).sort((a, b) => a.date.localeCompare(b.date))[0]?.date
    ?? cal.items.filter((i) => !i.mine && ex(i)).sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? null;
}

/** the words that make a date a thing to do or be at (a due date, an exam, a meeting), not a date in passing */
const WORTH = /\b(due|deadline|closes?|opens?|until|by|exam|midterm|final|quiz|test|lab|assignment|paper|project|presentation|present|meet|meeting|class|session|office hours|submit|turn in|hand in|moved|rescheduled|cancel+ed|court|hearing|rehearse|call)\b/i;

/** the dated things in a text (pure), each with the words around it. `ref` gives the year (a month far behind it is next year's) */
export function datesIn(text: string, ref: Date, source: string): Dated[] {
  const out: Dated[] = [];
  const seen = new Set<string>();
  const MON = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const TIME = "(?:\\s*(?:at|,|@)?\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?))?";
  const re = new RegExp(`\\b${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?${TIME}|\\b(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?${TIME}|\\b(\\d{4})-(\\d{2})-(\\d{2})\\b`, "gi");
  for (const piece of text.split(/\n|(?<=[.!?])\s+(?=[A-Z])/)) {
    const s = piece.trim();
    if (!s) continue;
    for (const m of s.matchAll(re)) {
      let y: number, mo: number, d: number, hh: string | undefined, mm: string | undefined, ap: string | undefined;
      if (m[1]) { mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()); d = Number(m[2]); y = m[3] ? Number(m[3]) : NaN; [hh, mm, ap] = [m[4], m[5], m[6]]; }
      else if (m[7]) { mo = Number(m[7]) - 1; d = Number(m[8]); y = m[9] ? Number(m[9].length === 2 ? `20${m[9]}` : m[9]) : NaN; [hh, mm, ap] = [m[10], m[11], m[12]]; }
      else { y = Number(m[13]); mo = Number(m[14]) - 1; d = Number(m[15]); }
      if (mo < 0 || mo > 11 || d < 1 || d > 31) continue;
      if (!Number.isFinite(y)) { y = ref.getFullYear(); if (mo < ref.getMonth() - 6) y++; else if (mo > ref.getMonth() + 6) y--; }
      if (!hh) { const t = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?=\W|$)/i.exec(s.replace(m[0], " ")); if (t) [hh, mm, ap] = [t[1], t[2], t[3]]; }
      if (!WORTH.test(s) && !hh) continue;   // a posted date, a date in passing: not a dated thing (a date with an hour is)
      let time: string | undefined;
      if (hh) { let h = Number(hh) % 12; if (ap && /p/i.test(ap)) h += 12; time = `${pad(h)}:${mm ?? "00"}`; }
      const what = s.replace(m[0], " ").replace(/\s+([.,;])/g, "$1").replace(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s*$/i, "").replace(/^[\s·:,–—-]+|[\s·:,–—-]+$/g, "").replace(/\s+/g, " ").replace(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s*(?=[·,]|$)/i, "").trim().slice(0, 100);
      if (!what) continue;
      const date = `${y}-${pad(mo + 1)}-${pad(d)}`, k = `${date}|${keyOf(what)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ date, ...(time ? { time } : {}), what, source });
    }
  }
  return out;
}

const read = (f: string) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };
export const calendarOf = (folder: string) => parseCalendar(read(join(folder, "calendar.md")));

/** keep what a look found in the folder's calendar.md; returns how many lines it added or moved */
export function keepCalendar(folder: string, found: Dated[], cls?: { days: number[] | null; time: string | null; from: string }): number {
  const file = join(folder, "calendar.md");
  const before = read(file);
  const next = mergeCalendar(before, found, cls);
  if (next === before) return 0;
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, next);
  renameSync(tmp, file);
  const was = new Set(before.split("\n"));
  return next.split("\n").filter((l) => l.startsWith("- ") && !was.has(l)).length;
}
