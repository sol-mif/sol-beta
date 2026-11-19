// Life's rules (#1604; the mockup's merge/life.js, round 3 · B3, functions.json K4), ported as they are: the canvas's
// clock in minutes, a due time from words, the trust gate (what a sticky's words reach), what the folder's AI makes from
// them, and the board's order. Pure on D and the scenario; the moves (cv/moves/life.ts) and the views read these.
// Signed: marcocyl04-ux's agent, slice 4 (#1615).
import { D, SCN, open, piecesIn, regionOf, type Ask, type Piece } from "../cv/core.ts";

/** one thing a sticky's run made, kept under it, newest first */
export type Made = {
  id: string; kind: string; title: string; text: string; at: number; by: string;
  state: "kept" | "waits" | "held" | "sent" | "paid" | "done" | "held back"; isNew?: boolean; goes?: string; until?: number;
};
/** a sticky: a piece of kind "sticky" in its folder */
export type Sticky = Piece & {
  words: string; by: string; state: "open" | "done" | "dropped"; at: number; due: number | null; allDay: boolean; made: Made[];
  isNew?: boolean; ran?: number; ai?: string; ended?: number; note?: string;
};

// ---------------------------------------------------------------- the clock: minutes from the canvas's Wednesday 00:00

const NOW: Record<string, number> = { jayden: 23 * 60, denise: 8 * 60 + 10, denise11: 23 * 60 + 5, p1: 23 * 60, loop: 2 * 60, minji: 10 * 60, "ai-night": 6 * 60 + 30 };
/** now, in minutes from the canvas's day 0 (a real Sol: the minutes since today's midnight) */
export function nowMin(): number {
  if (SCN) return NOW[SCN] ?? 7 * 60 + 30;
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
export const DAYS = ["Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Monday", "Tuesday"];
export const hhmm = (m: number) => { m = ((m % 1440) + 1440) % 1440; return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };
export const dayOf = (m: number) => Math.floor(m / 1440);
export function whenLabel(m: number, allDay?: boolean): string {
  const d = dayOf(m), t = allDay ? "" : " " + hhmm(m);
  if (d === 0) return "Today" + t; if (d === 1) return "Tomorrow" + t; if (d === -1) return "Yesterday" + t;
  if (d > 1 && d < 7) return DAYS[d % 7] + t;
  return d >= 7 ? "Next week" : DAYS[((d % 7) + 7) % 7] + t;
}
export function agoLabel(m: number): string {
  const n = nowMin() - m;
  if (n < 1) return "just now"; if (n < 60) return `${n} min ago`;
  if (dayOf(m) === dayOf(nowMin())) return `today ${hhmm(m)}`;
  if (dayOf(m) === dayOf(nowMin()) - 1) return "yesterday";
  return DAYS[((dayOf(m) % 7) + 7) % 7];
}
/** words → a time: "9am", "23:59", "11:59pm", "tonight", "tomorrow 9am", "friday", "next week" */
export function parseWhen(w: unknown): { at: number; allDay: boolean } | null {
  if (w == null) return null;
  if (typeof w === "number") return { at: w, allDay: false };
  const s = String(w).toLowerCase().trim();
  let day: number | null = null, min: number | null = null, m: RegExpExecArray | null;
  const today = dayOf(nowMin());
  if (/\btoday\b/.test(s)) day = today;
  if (/\btonight\b/.test(s)) { day = today; min = 21 * 60; }
  if (/\btomorrow\b/.test(s)) day = today + 1;
  if (/\bnext week\b/.test(s)) day = today + 7;
  DAYS.forEach((n, i) => { if (new RegExp("\\b" + n.toLowerCase() + "\\b").test(s)) { let d = i; while (d <= today) d += 7; day = d; } });
  if ((m = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.exec(s))) { let h = +m[1] % 12; if (m[3] === "pm") h += 12; min = h * 60 + (+m[2] || 0); }
  else if ((m = /\b(\d{1,2}):(\d{2})\b/.exec(s))) min = +m[1] * 60 + +m[2];
  else if (/\bnoon\b/.test(s)) min = 12 * 60;
  if (day == null && min == null) return null;
  if (day == null) { day = today; if ((min as number) <= nowMin() - today * 1440) day++; }   // a bare time already gone today means tomorrow
  return { at: day * 1440 + (min ?? 23 * 60 + 59), allDay: min == null };
}
/** "read chapter 5 by friday" → words "read chapter 5", due friday */
export function splitDue(words: string): { words: string; due: { at: number; allDay: boolean } | null } {
  const m = /\s+(?:by|due|before|for)\s+((?:today|tonight|tomorrow|next week|(?:mon|tues|wednes|thurs|fri|satur|sun)day)(?:\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}:\d{2})\s*$/i.exec(words);
  if (!m) return { words, due: null };
  const due = parseWhen(m[1]);
  return due ? { words: words.slice(0, m.index).trim(), due } : { words, due: null };
}

// ---------------------------------------------------------------- which folders are life folders, whose AI works there

/** build, life or both (the plane's kindOf when it is there, else the folder's own kind) */
export function kindOfRegion(rid: string | null | undefined): "life" | "both" | "build" | null {
  const r = regionOf(rid);
  if (!r) return null;
  return r.kind === "life" ? "life" : r.kind === "mixed" ? "both" : "build";
}
export const isLife = (rid: string | null | undefined) => { const k = kindOfRegion(rid); return k === "life" || k === "both"; };
export const lifeRegions = () => D.regions.filter((r) => isLife(r.id));
export const VOICE = "Your AI";
export function aiOf(rid: string): string {
  const r = regionOf(rid);
  if (r && typeof r.ai === "string") return r.ai;
  const a = D.ais.find((x) => D.pieces[x.piece] && D.pieces[x.piece].region === rid && D.pieces[x.piece].kind !== "session");
  return a ? a.name : VOICE;
}

// ---------------------------------------------------------------- a folder's stickies, in the board's order

export const all = (rid: string | null): Sticky[] => piecesIn(rid).filter((p) => p.kind === "sticky") as Sticky[];
export const live = (p: Sticky) => p.state !== "done" && p.state !== "dropped";
export const lateBy = (p: Sticky) => (live(p) && p.due != null ? nowMin() - p.due : -Infinity);
export const isLate = (p: Sticky) => lateBy(p) > 0;
export const asksOf = (p: Piece): Ask[] => open().filter((a) => a.piece === p.id);
export const waits = (p: Sticky) => (p.made || []).some((m) => m.state === "waits" || m.state === "held");
/** late first (the latest highest), then what needs you (an ask, a draft to send), then by due time, then newest first */
export function order(rid: string | null): Sticky[] {
  const ps = all(rid).filter(live);
  const tier = (p: Sticky) => (isLate(p) ? 0 : asksOf(p).length || waits(p) ? 1 : p.due != null ? 2 : 3);
  return ps.sort((a, b) => tier(a) - tier(b) || (tier(a) === 0 ? lateBy(b) - lateBy(a) : tier(a) === 2 ? (a.due as number) - (b.due as number) : (b.at || 0) - (a.at || 0)));
}
/** finished or dropped: kept a day under the board, newest first, each with undo */
export const gone = (rid: string | null) => all(rid).filter((p) => !live(p) && nowMin() - (p.ended ?? 0) < 1440).sort((a, b) => (b.ended || 0) - (a.ended || 0));

// ---------------------------------------------------------------- the trust gate: what the words reach

const LEAVES = /\b(send|email|e-mail|mail|reply|text|message|post|submit|share|tweet|invite|hand in|turn in)\b/;
const COSTS = /\b(pay|buy|order|book|renew|subscribe|purchase|donate|tip)\b|\$\d/;
const DELETES = /\b(delete|remove|cancel|unsubscribe|clear out|erase|throw away)\b/;
export type Reach = "deletes" | "costs" | "leaves" | "stays";
export function reach(words: unknown): Reach {
  const w = String(words || "").toLowerCase();
  if (DELETES.test(w)) return "deletes"; if (COSTS.test(w)) return "costs"; if (LEAVES.test(w)) return "leaves";
  return "stays";
}
export function price(w: string): number {
  const m = /\$(\d+(?:\.\d\d)?)/.exec(w);
  if (m) return +m[1];
  const t = String(w).toLowerCase();
  return /bill|electric|phone|plan|insurance/.test(t) ? 64 : /book|ticket|slot|appointment|dentist|physio/.test(t) ? 25 : /gift|present/.test(t) ? 30 : 12;
}

// ---------------------------------------------------------------- what the folder's AI makes from a sticky's words

export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const after = (w: string, re: RegExp) => cap(w.replace(re, "").trim()) || cap(w);
export function madeFrom(words: string): { kind: string; title: string; text: string } {
  const w = String(words).trim(), l = w.toLowerCase(), of = (re: RegExp) => after(w, re);
  if (/^(read|skim)\b/.test(l)) return { kind: "doc", title: `${of(/^(read|skim)\s+/i)} · one-page summary`, text: "The main ideas in your words, the two terms to learn, and three questions to check yourself." };
  if (/^(study|revise|learn|review)\b/.test(l)) return { kind: "list", title: `${of(/^(study|revise|learn|review)( for)?\s+/i)} · 20 flashcards`, text: "Made from your notes; the hard ones first." };
  if (/^(write|draft|finish)\b/.test(l)) return { kind: "doc", title: `${of(/^(write|draft|finish)\s+/i)} · first draft`, text: "From your notes and the brief. Your words are kept; mine are marked." };
  if (/^(plan|organi[sz]e|sort|schedule)\b/.test(l)) return { kind: "table", title: `${of(/^(plan|organi[sz]e|sort|schedule)\s+/i)} · a plan`, text: "Day by day, with what each step needs." };
  if (/^(find|look up|research|compare|choose|pick)\b/.test(l)) return { kind: "table", title: `${of(/^(find|look up|research|compare|choose|pick)\s+/i)} · three options`, text: "Side by side, with what each costs and the one I would pick." };
  if (/^(pack|shop|get|pick up|print|bring)\b/.test(l) || /grocer|list/.test(l)) return { kind: "list", title: `${cap(w)} · a list`, text: "Grouped by where you get each thing." };
  if (/^(check|fix|proofread)\b/.test(l)) return { kind: "doc", title: `${of(/^(check|fix|proofread)\s+/i)} · what to fix`, text: "Two things to change, each with where it is." };
  if (/^(call|ring|phone)\b/.test(l)) return { kind: "doc", title: `${of(/^(call|ring|phone)\s+/i)} · what to say`, text: "The three points, and the number." };
  return { kind: "doc", title: `${cap(w)} · notes`, text: "What I found, and the next step." };
}
export function draftFrom(words: string): { kind: string; title: string; text: string } {
  const w = String(words).trim(), l = w.toLowerCase(), to = /\b(?:to|with)\s+(.+)$/i.exec(w), about = /\babout\s+(.+)$/i.exec(w);
  const kind = /text|message/.test(l) ? "Message" : /post|tweet/.test(l) ? "Post" : /submit|hand in|turn in/.test(l) ? "To hand in" : "Email";
  return { kind: "draft", title: `${kind}${to ? " to " + to[1].replace(/\s+about\s+.*$/i, "") : ""}${about ? " · " + about[1] : ""}`.replace(/^(Email|Message)$/, "$1 · " + cap(w)), text: "Drafted from the thread. Nothing is sent until you press Send." };
}
