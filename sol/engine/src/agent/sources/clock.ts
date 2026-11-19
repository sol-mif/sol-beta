// The clock as a source: a rule whose sentence says a time fires at that time. Kept simple on purpose:
//   "03:00", "19:30"                 every day at that time
//   "on a class day (Tue/Thu)"       only on the days named (Mon … Sun, in any spelling of three letters or more)
//   "the night before class"         21:00 on the day before a class day
//   "exam-3"                         only on the day three days before the exam (EXAM=YYYY-MM-DD in exam/schedule.md)
//   "every 30 min 08:00–23:00"       every 30 minutes inside that window (step 2), once per slot
// Step 2: the class days and the exam come from the folder's calendar.md (agent/calendar.ts) when it has them; a line
// Marco wrote there wins, then exam/schedule.md's EXAM=, then a found exam.
// A rule fires once per day per time, in the hour after its time (an engine that was off at 03:00 and is back at 03:40
// still runs it; one back at noon does not: a 03:00 read is not a noon read). What fired is kept in clock-last.json.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Rule } from "../harness.js";
import { calendarOf, examIn } from "../calendar.js";
import { classIn, headerOf } from "../about.js";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export type When = { times: { h: number; m: number }[]; days: number[] | null; examMinus: number | null; every?: { mins: number; from: number; to: number } };

/** what a rule's sentence says about when (pure); null when it names no time. classDays: the folder's (calendar.md),
 *  for "the night before class" and "on a class day" when the sentence names no days (Tue/Thu without them) */
export function whenOf(sentence: string, classDays: number[] | null = null): When | null {
  let s = sentence.toLowerCase();
  const ev = /\bevery\s+(\d{1,3})\s*min(?:ute)?s?\s+([01]?\d|2[0-3]):([0-5]\d)\s*(?:[–—-]|to)\s*([01]?\d|2[0-3]):([0-5]\d)/.exec(s);
  let every: When["every"];
  if (ev) {
    every = { mins: Math.max(5, Number(ev[1])), from: Number(ev[2]) * 60 + Number(ev[3]), to: Number(ev[4]) * 60 + Number(ev[5]) };
    s = s.replace(ev[0], " ");
  }
  const times = [...s.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)].map((m) => ({ h: Number(m[1]), m: Number(m[2]) }));
  const named = DAYS.map((d, i) => (new RegExp(`\\b${d}[a-z]*\\b`).test(s) ? i : -1)).filter((i) => i >= 0);
  let days: number[] | null = named.length ? named : null;
  if (/night before class/.test(s)) {
    times.push({ h: 21, m: 0 });
    days = (days ?? classDays ?? [2, 4]).map((d) => (d + 6) % 7);
  } else if (!days && /\bclass day\b/.test(s) && classDays) days = classDays;
  const ex = /\bexam-(\d{1,2})\b/.exec(s);
  if (!times.length && !every) return null;
  return { times, days, examMinus: ex ? Number(ex[1]) : null, ...(every ? { every } : {}) };
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** the exam day in a folder's exam/schedule.md (`EXAM=2026-11-27`), or null */
export function examOf(folder: string): string | null {
  const cal = calendarOf(folder);
  const mine = examIn({ ...cal, items: cal.items.filter((i) => i.mine) });
  if (mine) return mine;
  try { const e = /\bEXAM=(\d{4}-\d{2}-\d{2})\b/.exec(readFileSync(join(folder, "exam", "schedule.md"), "utf8"))?.[1]; if (e) return e; } catch { /* none */ }
  return examIn(cal);
}
/** the folder's class days: calendar.md's class line, else policy.md's `class:` line, else brain.md (null: none known) */
export function classDaysOf(folder: string): number[] | null {
  const read = (f: string) => { try { return readFileSync(join(folder, f), "utf8"); } catch { return ""; } };
  return calendarOf(folder).classDays ?? classIn(headerOf(read("policy.md"), "class") ?? read("brain.md")).days;
}

/** the keys of the times that are due now for a rule and not fired yet (pure). A key: `<rule>@<day> <HH:MM>` */
export function dueNow(rule: Rule, now: Date, fired: string[], exam: string | null = null, classDays: number[] | null = null): string[] {
  const w = whenOf(rule.sentence, classDays);
  if (!w || rule.mode === "off") return [];
  if (w.days && !w.days.includes(now.getDay())) return [];
  if (w.examMinus !== null) {
    if (!exam) return [];
    const d = new Date(`${exam}T12:00:00`);
    d.setDate(d.getDate() - w.examMinus);
    if (dayKey(d) !== dayKey(now)) return [];
  }
  const mins = now.getHours() * 60 + now.getMinutes();
  const slot = w.every && mins >= w.every.from && mins <= w.every.to ? w.every.from + Math.floor((mins - w.every.from) / w.every.mins) * w.every.mins : null;
  const every = slot === null ? [] : [`${rule.id}@${dayKey(now)} ${String(Math.floor(slot / 60)).padStart(2, "0")}:${String(slot % 60).padStart(2, "0")}`].filter((k) => !fired.includes(k));
  return [...every, ...w.times
    .filter((t) => mins >= t.h * 60 + t.m && mins < t.h * 60 + t.m + 60)
    .map((t) => `${rule.id}@${dayKey(now)} ${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}`)
    .filter((k) => !fired.includes(k))];
}
