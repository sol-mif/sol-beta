// owned by slice 2 (Needs), docs/port/slices.md
// The Needs list's pure rules (#1615), ported as they were from the mockup (merge/engine.js arrivalView, tooMuchData,
// applyFix; views/needs.js reason, yesWords, glyph; agent.js rankFor; runs.js nextRank, evidence; views/arrivals.js
// history). The list's order itself is core.ts open() (by rank; "fold" keeps one of each run of repeats); these name the
// reason an ask stands where it stands, word its yes, rank a new ask, fold arrivals and pick "too much"'s one fix. They
// read only what they are given, never the store, so the tests (next-needs.test.ts) run them on plain data.
// Signed: marcocyl04-ux's agent, slice 2 of the port (#1615).
import type { Arrival, Ask, Data, Piece } from "../cv/types.ts";

export const cap = (t: string) => String(t).charAt(0).toUpperCase() + String(t).slice(1);
/** who asks: the AI of its piece, else the first word of its source ("Mia", "landlord") */
export const who = (d: Data, a: Ask) => (d.pieces[a.piece]?.ai as string | undefined) || String(a.source).split(" · ")[0];

/** why it stands where it stands: the clean room's one ladder, worded from the ask itself. It never re-ranks */
export function reason(d: Data, a: Ask): { rung: string; long: string } {
  const t = a.text, s = String(a.source).toLowerCase(), w = who(d, a);
  if (a.serious) return { rung: "Can’t be undone", long: `${w} marked it serious: it can’t be taken back, so you look at its session before you answer.` };
  if (/\$\d|spending limit/i.test(t)) return { rung: "Spends money", long: "It spends money, so it waits for you." };
  if (/failed|broke|check "/i.test(t) && /check/.test(s)) return { rung: "Broke", long: "Something broke; one answer repairs it." };
  if (/collision|permission|decision|terminal|allow|waits/i.test(s + " " + t) && a.kind === "code") return { rung: `Holds ${w} up`, long: `${w} has stopped until you answer.` };
  if (/change ready/i.test(t)) return { rung: "Waits to be kept", long: "Finished work, waiting for you to keep it. Nothing is held up." };
  const due = t.match(/\b(today|tonight|tomorrow|11:59pm|9am|friday)\b/i);
  if (due) return { rung: `Due ${/11:59|tonight/i.test(due[1]) ? "tonight" : /9am|tomorrow/i.test(due[1]) ? "tomorrow" : due[1].toLowerCase()}`, long: "It has a deadline, so it ranks above work that has none." };
  return { rung: "Waits for your yes", long: "A yes or a later; nothing is held up meanwhile." };
}

/** the yes, written as what it does (answers are outcomes; money says so on the button) */
export function yesWords(a: Ask): string {
  const t = a.text;
  let m: RegExpMatchArray | null;
  if (typeof a.yes === "string" && a.yes) return a.yes;
  if ((m = t.match(/revert (\w+)\?/i))) return `Revert ${m[1]}`;
  if ((m = t.match(/Raise to (\$\d+)/))) return `Raise to ${m[1]}`;
  if ((m = t.match(/(\w+) waits\?/))) return `${m[1]} waits`;
  if (/migration on prod/i.test(t)) return "Run it on prod";
  if ((m = t.match(/--(\w+) or --\w+\?/))) return `Use --${m[1]}`;
  if (/allow /i.test(t)) return "Allow";
  if (/Accept\?|change ready/i.test(t)) return "Keep the change";
  if (/Confirm\?/i.test(t)) return "Confirm";
  if (/Retry\?|failed again/i.test(t)) return "Retry";
  if (/approve/i.test(t)) return "Approve";
  if (/sign\?/i.test(t)) return "Sign it";
  if (/reply/i.test(t)) return "Reply now";
  if (/failing|chapter|pages/i.test(t)) return "Open it";
  return "Yes";
}

/** the mark beside an ask: serious, broke, or an ask */
export function glyph(d: Data, a: Ask): ["serious" | "broke" | "ask", string] {
  const r = reason(d, a).rung;
  return a.serious ? ["serious", "Can’t be undone"] : r === "Broke" ? ["broke", "Broke"] : ["ask", "Asks you"];
}

// ---------------------------------------------------------------- a new ask's rank (agent.js rankFor, runs.js nextRank)

/** rank is computed, never claimed: the AI says what it reaches and when it is due */
export const TIER: Record<string, number> = { serious: 1, money: 2, holds: 3, due: 4, other: 6 };
export function rankFor(d: Data, a: { serious?: boolean; reaches?: string | null; due?: unknown }): number {
  const t = a.serious ? "serious" : a.reaches && a.reaches in TIER ? a.reaches : a.due ? "due" : "other";
  const same = Object.values(d.asks).filter((x) => !x.answered && Math.floor(x.rank) === TIER[t]).length;
  return TIER[t] + 0.5 + same * 0.01;
}
/** an ask a move raises (take back, group): after every open one, before the ones said later */
export function nextRank(d: Data): number {
  const r = Object.values(d.asks).map((a) => a.rank).filter((x) => x < 100);
  return (r.length ? Math.max(...r) : 0) + 1;
}

// ---------------------------------------------------------------- group on evidence only (runs.js evidence)

/** the evidence that some pieces belong together: a shared repository alone is not enough */
export function evidence(d: Data, ids: string[]): string[] | null {
  const ps = ids.map((i) => d.pieces[i]).filter(Boolean) as Piece[];
  if (ps.length < 2) return null;
  const out: string[] = [];
  const r0 = d.regions.find((r) => r.id === ps[0].region);
  if (ps.every((p) => p.region === ps[0].region) && r0 && r0.kind !== "life") out.push(`same repository: ${r0.name.replace(/ \(repo\)$/, "")}`);
  const touch = (p: Piece) => (Array.isArray(p.touch) ? (p.touch as string[]) : []);
  const files = touch(ps[0]).filter((t) => ps.every((p) => touch(p).includes(t)));
  if (files.length) out.push(`same files: ${files.join(", ")}`);
  if (ps.every((p) => p.branch && p.branch === ps[0].branch)) out.push(`same branch: ${ps[0].branch}`);
  if (ps.every((p) => p.from && p.from === ps[0].from)) out.push("one job, split");
  return out.length > (out[0]?.startsWith("same repository") ? 1 : 0) ? out : null;
}

// ---------------------------------------------------------------- arrivals (engine.js arrivalView, views/arrivals.js)

/** the prototype's week: day 7 is today */
export const TODAY = 7;
export type ArrivalRow = { ai: string; text: string };
/** nothing is placed without a press. Folded: one row per AI, today's and yesterday's counted in it; an arrival nobody
 *  accepted by its second morning moves to that AI's history, still findable there */
export function arrivalView(items: Arrival[], today = TODAY, fold = true): { rows: ArrivalRow[]; waiting: number; toHistory: number } {
  const un = items.filter((a) => !a.accepted);
  if (!fold) return { rows: un.map((a) => ({ ai: a.ai, text: `${a.ai} · ${a.what} · day ${a.day}` })), waiting: un.length, toHistory: 0 };
  const live = un.filter((a) => today - a.day <= 1), old = un.length - live.length;
  const by: Record<string, { today: number; yday: number }> = {};
  live.forEach((a) => { (by[a.ai] = by[a.ai] || { today: 0, yday: 0 })[a.day === today ? "today" : "yday"]++; });
  return {
    rows: Object.entries(by).map(([ai, n]) => ({ ai, text: `${ai} · ${n.today ? n.today + " today" : ""}${n.today && n.yday ? ", " : ""}${n.yday ? n.yday + " yesterday" : ""}` })),
    waiting: live.length, toHistory: old,
  };
}
const DAYS = ["", "Thursday", "Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Today"];
export const dayName = (n: number, today = TODAY) => (n === today ? "Today" : n === today - 1 ? "Yesterday" : DAYS[n] || "Day " + n);
/** every arrival on the plane, from every arrivals piece */
export const allArrivals = (d: Data): Arrival[] => Object.values(d.pieces).filter((p) => p.kind === "arrivals").flatMap((p) => p.items ?? []);
/** an AI's history: its aged, unkept arrivals by day, newest first */
export function history(d: Data, ai: string, today = TODAY): { n: number; days: { day: number; name: string; what: string[] }[] } {
  const items = allArrivals(d).filter((x) => x.ai === ai && !x.accepted && today - x.day > 1);
  const by: Record<number, string[]> = {};
  items.forEach((x) => (by[x.day] = by[x.day] || []).push(x.what));
  return { n: items.length, days: Object.keys(by).map(Number).sort((a, b) => b - a).map((n) => ({ day: n, name: dayName(n, today), what: by[n] })) };
}
/** "notes, 2 × a sketch": a day's things, repeats counted */
export function countWords(list: string[]): string {
  const m: Record<string, number> = {};
  list.forEach((w) => (m[w] = (m[w] || 0) + 1));
  return Object.entries(m).map(([w, n]) => (n > 1 ? `${n} × ${w}` : w)).join(", ");
}

// ---------------------------------------------------------------- too much (engine.js tooMuchData, applyFix)

export type Fix = "fold" | "cap" | "hold";
/** now, why, one fix: the first ask, the asks by source (a run of repeats by its key), the one fix that helps most */
export function tooMuchData(o: Ask[]): { first: Ask | undefined; groups: [string, number][]; top: [string, number]; fix: Fix } {
  const by: Record<string, number> = {};
  o.forEach((a) => { const k = a.same || a.source; by[k] = (by[k] || 0) + 1; });
  const groups = Object.entries(by).sort((a, b) => b[1] - a[1]);
  const top = groups[0] || ["", 0];
  return { first: o[0], groups, top, fix: top[1] >= 3 ? "fold" : o.length > 3 ? "cap" : "hold" };
}
/** the fix pressed: fold a run of three or more repeats, else cap the asks at Near */
export function fixFor(o: Ask[]): "fold" | "cap" {
  const by: Record<string, number> = {};
  o.forEach((a) => { if (a.same) by[a.same] = (by[a.same] || 0) + 1; });
  return Object.values(by).some((n) => n >= 3) ? "fold" : "cap";
}
/** "Rex · check login" → Rex’s “check login” */
export const said = (n: string) => { const [w, ...k] = String(n).split(" · "); return k.length ? `${w}’s “${k.join(" ")}”` : n; };
