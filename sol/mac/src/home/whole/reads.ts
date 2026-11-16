// The five reads for a sentence (#792, plan Part C slice 29; home/whole.md "The judge"; scenes 2 and 3), behind
// sol.home.whole. Face half; the engine half is #827 (Frank's). The pure half: a sentence split into parts (at ", ",
// "; " and " and then "), each part's read over the five (a note, a date, for you, a job, a thing to make) with its
// probabilities, the folder, the day and hour it lands on, the verdict word under the pill ("sure", "a guess · or X?",
// "asks you on ↵"), where it will go in plain words, and the receipt once it is filed. Nothing here draws; Say.tsx does.
//
// Stubbed until #827 lands: `readOf` stands in for Jev's two `choice` questions (the read over the five, the folder over
// the person's folders) on the state {sentence, today's week, the folders' names}. It is a keyword judge; whole.md says
// so ("the page's keyword judge is a stand-in and only shows the shape"). Its answer has the engine's shape: the
// message `home.read` below. Filing (`home.file`) and the learned line (`home.learn`) are answered by today.ts's stub.
import type { Mark, Thing } from "./today.ts";

export const READS = ["note", "date", "you", "job", "make"] as const;
export type Read = (typeof READS)[number];
/** the pill's words, in the track's order (whole.md "Five reads") */
export const READ_WORDS: Record<Read, string> = { note: "a note", date: "a date", you: "for you", job: "a job", make: "a thing to make" };
/** a part as the engine reads it: its words, the read with the probability of each of the five, the folder, when it
 *  lands (ms since the epoch) and after what, and the event already there it found (a date that adds nothing) */
export type Part = { text: string; read: Read; p: Record<Read, number>; folder: string; at?: number; after?: string; found?: string };
/** the engine's answer to `home.say {text}` (#827): the parts and how long the read took */
export type ReadMsg = { type: "home.read"; text: string; ms: number; parts: Part[] };
/** what Enter sends (#827 `home.file`): each part with the read it goes as (the person's, where they pressed another) */
export type Filed = { text: string; read: Read; folder: string; at?: number; after?: string; found?: string; was?: Read };
/** an override, logged as a learned line (#827 `home.learn`; whole.md: "make it a rule / wrong" reads it later) */
export type Learned = { text: string; from: Read; to: Read };

/** "sure" (≥ .7), "a guess · or X?" (≥ .45, X the next best), else "asks you on ↵"; a read the person picked is theirs */
export type Verdict = "sure" | "guess" | "asks" | "yours";
export const verdictOf = (p: number): Exclude<Verdict, "yours"> => (p >= 0.7 ? "sure" : p >= 0.45 ? "guess" : "asks");
export function verdictWords(part: Part, picked: Read): string {
  if (picked !== part.read) return "yours";
  const v = verdictOf(part.p[part.read]);
  if (v === "sure") return "sure";
  if (v === "guess") { const next = READS.filter((r) => r !== part.read).sort((a, b) => part.p[b] - part.p[a])[0]; return `a guess · or ${READ_WORDS[next]}?`; }
  return "asks you on ↵";
}
/** ⇥: the next read along the track */
export const cycle = (r: Read): Read => READS[(READS.indexOf(r) + 1) % READS.length];

/** the parts of a sentence (whole.md "The judge": at ", ", "; " and " and then ") */
export function split(sentence: string): string[] {
  return sentence.split(/\s*[,;]\s+|\s+and then\s+/i).map((s) => s.trim()).filter(Boolean);
}

// ── when ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY = new RegExp(`\\b(${DAYS.join("|")}|today|tonight|tomorrow)\\b`, "i");
const CLOCK = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b(?=\s|$)/i;
const startOf = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
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
export const bare = (text: string) => text.replace(WEEKDAY, " ").replace(/\b(on|at|by)\s+(?=\s|$)/gi, " ").replace(/\s+/g, " ").trim();
/** the short name a mark wears on the ribbon ("call Sam"): the bare words up to "about", "for", "with" or "re" */
export const labelOf = (text: string) => bare(text).split(/\s+(?:about|for|with|re|regarding)\s+/i)[0];

// ── the stand-in judge ────────────────────────────────────────────────────────────────────────────────────────────
// for you: what only the person does (a call is never an agent's, whole.md); a job: work an agent can do now; a thing to
// make: a page, a tracker or a deck; a date: an event's noun with a day; a note: anything else
const YOU = /\b(call|phone|ring|text|visit|meet|see|pick up|drop off|pay|sign|go to|book|buy|talk to|ask)\b/i;
const JOB = /\b(make notes|notes from|summari[sz]e|draft|research|find|compare|collect|sort|clean up|fix|check|translate|outline)\b/i;
const MAKE = /\b(a |an )?(page|tracker|deck|table|board|list|sheet)\b(?! of you)/i;
const EVENT = /\b(exam|midterm|final|lecture|class|lab|meeting|appointment|dinner|lunch|party|interview|seminar|call with|game|concert|flight)\b/i;
const FOLDERS: [RegExp, string][] = [
  [/\b(bio|biology|slides|midterm)\b/i, "school › bio 201"], [/\b(chem|chemistry|lab|equilibrium)\b/i, "school › chem 110"],
  [/\b(stats|statistics|survey|maya)\b/i, "school › stats 140"], [/\b(offer|interview|application|cv|cover letter|recruiter|sam|shopify)\b/i, "jobs"],
  [/\b(exam|lecture|class|course|homework|set \d)\b/i, "school"],
];
const spread = (pick: Read, p: number, second?: Read): Record<Read, number> => {
  const rest = READS.filter((r) => r !== pick), out = { note: 0, date: 0, you: 0, job: 0, make: 0 } as Record<Read, number>;
  out[pick] = p;
  const left = 1 - p, s2 = second ? left * 0.6 : 0;
  for (const r of rest) out[r] = r === second ? s2 : (left - s2) / (second ? rest.length - 1 : rest.length);
  for (const r of READS) out[r] = Math.round(out[r] * 100) / 100;
  return out;
};
/** the folder a part is filed to (the second `choice`, over the person's folders) */
export function folderOf(text: string, folders: string[] = []): string {
  for (const [re, f] of FOLDERS) if (re.test(text)) return folders.find((x) => x === f || x.startsWith(f)) ?? f;
  return "life";
}
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
/** one part, read: the five with their probabilities, the folder, when it lands, the event it found */
export function readPart(text: string, week: Mark[], now: number, folders: string[] = []): Part {
  const day = dayOf(text, now), folder = folderOf(text, folders), found = foundOf(text, week, day, now);
  let read: Read, p: Record<Read, number>;
  if (YOU.test(text)) { read = "you"; p = spread("you", 0.86, JOB.test(text) ? "job" : "date"); }
  else if (MAKE.test(text) && !EVENT.test(text)) { read = "make"; p = spread("make", 0.74, "job"); }
  else if (JOB.test(text)) { read = "job"; p = spread("job", 0.82, "make"); }
  else if (day !== null && (EVENT.test(text) || found)) { read = "date"; p = spread("date", found ? 0.91 : 0.78, "note"); }
  else if (day !== null) { read = "date"; p = spread("date", 0.52, "you"); }
  else { read = "note"; p = spread("note", 0.4, "job"); }
  const part: Part = { text, read, p, folder };
  if (found) { part.found = found.id; part.at = found.at; }
  else if (day !== null) Object.assign(part, whenOf(text, day, week, now));
  return part;
}
/** the stand-in for `home.say` (#827): the sentence split, each part read; `ms` as the engine would time it */
export function readOf(sentence: string, week: Mark[], now: number, folders: string[] = [], ms = 0): ReadMsg {
  return { type: "home.read", text: sentence, ms, parts: split(sentence).map((t) => readPart(t, week, now, folders)) };
}

// ── words ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const hm = (ms: number) => { const d = new Date(ms); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
/** a day as the person says it: "today", "tomorrow", "Thursday" */
export function dayWord(at: number, now: number): string {
  const n = Math.round((startOf(at) - startOf(now)) / 864e5);
  return n === 0 ? "today" : n === 1 ? "tomorrow" : new Date(at).toLocaleDateString("en-GB", { weekday: "long" });
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const when = (at: number, now: number) => `${cap(dayWord(at, now))} ${hm(at)}`;
/** below the pill: where the part will go, in plain words (scenes 2 and 3) */
export function whereOf(part: Part, read: Read, week: Mark[], now: number): string {
  const after = part.after ? `, after your ${part.after}` : "";
  if (read === "date") {
    const f = part.found ? week.find((m) => m.id === part.found) : null;
    if (f) return `already on your calendar · ${when(f.at, now)}, ${f.label} · nothing added`;
    return part.at !== undefined ? `${when(part.at, now)} · on your calendar` : "on your calendar · say a day";
  }
  if (read === "you") return `${part.at !== undefined ? `${when(part.at, now)}${after} · ` : ""}${part.folder} · only you do it; Sol prepares it`;
  if (read === "job") return `${part.folder} · an agent starts now${part.at !== undefined ? ` · ready ${when(part.at, now)}` : ""}`;
  if (read === "make") return `${part.folder} · a page to make, opened on Build's stage`;
  return `kept in ${part.folder} · nothing happens`;
}
/** the receipt once filed (scene 3-2: "↳ jobs · for you, Thursday 13:00, after your exam · it joins this list Thursday
 *  morning, prepared"), one clause per part */
export function receiptLine(parts: Filed[], now: number): string {
  return parts.map((f) => {
    const after = f.after ? `, after your ${f.after}` : "";
    if (f.read === "you") return f.at !== undefined
      ? `${f.folder} · for you, ${when(f.at, now)}${after} · it joins this list ${dayWord(f.at, now) === "today" ? "now" : `${cap(dayWord(f.at, now))} morning`}, prepared`
      : `${f.folder} · for you · on this list now`;
    if (f.read === "date") return f.found ? `${labelOf(f.text)} · already on your calendar, nothing added` : `${labelOf(f.text)} · on your calendar${f.at !== undefined ? `, ${when(f.at, now)}` : ""}`;
    if (f.read === "job") return `${f.folder} · a job, started${f.at !== undefined ? ` · ready ${when(f.at, now)}` : ""}`;
    if (f.read === "make") return `${f.folder} · a thing to make, ready on Build's stage`;
    return `${f.folder} · a note, kept`;
  }).join("; ");
}

/** the thing a filed part becomes (today.ts's stub files it; #827 will): one id, its read, its folder, where it lands */
export function thingOf(f: Filed, id: string, now: number): Thing | null {
  const base = { id, folder: f.folder, words: f.read === "you" || f.read === "date" ? labelOf(f.text) : bare(f.text), at: now, links: [], made: [] };
  if (f.read === "date") return f.found ? null : { ...base, read: "date", state: "read", waitsOn: "none", due: f.at };
  if (f.read === "you") {
    const today = f.at === undefined || startOf(f.at) <= startOf(now);
    return { ...base, read: "you", state: "you", waitsOn: today ? "you" : "none", due: f.at,
      card: { source: "sol", title: cap(bare(f.text)) + ".", why: `Only you do it${f.after ? `, after your ${f.after}` : ""}; Sol has it prepared.`, chips: [], answers: ["done", "move it"], touches: [], edge: labelOf(f.text) } };
  }
  if (f.read === "job") return { ...base, read: "job", state: "moving", waitsOn: "agent", due: f.at ?? now + 6 * 36e5 };
  if (f.read === "make") return { ...base, read: "make", state: "read", waitsOn: "none" };
  return { ...base, read: "note", state: "read", waitsOn: "none" };
}
