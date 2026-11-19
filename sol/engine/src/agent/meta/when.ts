// Agents' meta (#1327, pass 2): when each place runs, and how far an agent goes. Pure.
//   triggerFor   each place its own trigger: its input arriving, when the input can be watched (a source that brings
//                its own trigger when something lands: WATCHED); else the place's date minus a lead time learned from
//                that place's past traces (the median of how early the person did it), else from the job's other
//                places, else the stated default (DEFAULT_LEAD_DAYS). The hour the same way. Never one hour for all.
//   nextFire     the next time a date trigger fires for a place's dates
//   reachOf      the trust the reach of its work sets: only the person sees it → does; someone else sees it → drafts;
//                money, a submission or a deletion → asks each time. A source Sol never read: the first run is a look.
//   mandateOf    the trust as policy.md's [mode, rung]
import { dateIn, type Trace } from "./traces.js";
import { DAY_MS, DEFAULT_HOUR, DEFAULT_LEAD_DAYS } from "./numbers.js";
import type { Mode, Rung } from "../harness.js";

/** the sources that bring their own trigger when something lands (the engine watches a folder rule's folder) */
export const WATCHED = new Set(["folder"]);

export type Trigger =
  | { kind: "input"; source: string }
  | { kind: "date"; leadDays: number; hour: number; learned: "place" | "job" | "default" };

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const leadOf = (ts: Trace[]) => { const m = median(ts.filter((t) => t.date).map((t) => Math.max(0, Math.round((Date.parse(`${t.date}T12:00:00`) - t.at) / DAY_MS)))); return m === null ? null : Math.round(m); };
const hourOf = (ts: Trace[]) => { const h = median(ts.map((t) => new Date(t.at).getHours())); return h === null ? null : Math.round(h); };

/** a place's trigger (pure): `linked` the place's own linked sources; `job` the sources the job reads */
export function triggerFor(placeTraces: Trace[], jobTraces: Trace[], job: string[], linked: string[]): Trigger {
  const input = job.find((s) => WATCHED.has(s) && linked.includes(s)) ?? linked.find((s) => WATCHED.has(s) && job.length === 0);
  if (input) return { kind: "input", source: input };
  const lp = leadOf(placeTraces), lj = leadOf(jobTraces);
  const hp = hourOf(placeTraces), hj = hourOf(jobTraces);
  if (lp !== null) return { kind: "date", leadDays: lp, hour: hp ?? hj ?? DEFAULT_HOUR, learned: "place" };
  if (lj !== null) return { kind: "date", leadDays: lj, hour: hp ?? hj ?? DEFAULT_HOUR, learned: "job" };
  return { kind: "date", leadDays: DEFAULT_LEAD_DAYS, hour: hp ?? hj ?? DEFAULT_HOUR, learned: "default" };
}
/** a date trigger's next fire after `now` over a place's dates (YYYY-MM-DD), or null (pure) */
export function nextFire(t: Trigger, dates: string[], now: number): { at: number; date: string } | null {
  if (t.kind !== "date") return null;
  const fires = dates.map((date) => {
    const [y, m, d] = date.split("-").map(Number);
    return { at: new Date(y, m - 1, d - t.leadDays, t.hour, 0).getTime(), date };
  }).filter((x) => Number.isFinite(x.at) && x.at > now).sort((a, b) => a.at - b.at);
  return fires[0] ?? null;
}
/** the fires due in (since, now] (pure): each date once */
export const firesDue = (t: Trigger, dates: string[], since: number, now: number) =>
  t.kind !== "date" ? [] : dates.filter((date) => { const [y, m, d] = date.split("-").map(Number); const at = new Date(y, m - 1, d - t.leadDays, t.hour, 0).getTime(); return at > since && at <= now; });

export type Trust = "looks" | "drafts" | "does" | "asks";
export const TRUSTS: Trust[] = ["looks", "drafts", "does"];
const WEIGHTY = /\b(pay|pays|paid|payment|transfer|top(?:s|ped)? up|buy|bought|order(?:ed)? (?:from|more)|invoice[sd]? (?:sent|paid)|refund|submit|submitted|submission|apply|applied|hand(?:ed)? in|file (?:the|a) (?:claim|return|form)|delete|deleted|remove|removed|trash|cancel)\b|[$€£¥]\s?\d/i;

/** the trust its reach sets (pure): what it makes and for whom, in its own words */
export function reachOf(made: { for: "self" | "others" }, words: string): Exclude<Trust, "looks"> {
  if (WEIGHTY.test(words)) return "asks";
  return made.for === "others" ? "drafts" : "does";
}
// What a sticky asks reaches someone (pure): a message, a reply, a post, a booking: something another person sees
const TOWARD = /\b(send|e-?mail|mail|reply|respond|message|text|write to|tell|invite|post|share|ask|call|remind|thank|nudge|rsvp|book|reserve)\b/i;
/** the trust a sticky's own words set, read at its press (Home's trust gate, #1497): money, a submission or a deletion
 *  asks; what reaches someone drafts; the rest, the person's own, does */
export const reachOfAsk = (words: string) => reachOf({ for: TOWARD.test(words) ? "others" : "self" }, words);
/** a trust at most another (asks stays asks: it is never raised or lowered by a cap) */
export function capped(t: Trust, cap: Trust): Trust {
  if (t === "asks") return "asks";
  return TRUSTS.indexOf(t) <= TRUSTS.indexOf(cap) ? t : cap;
}
/** the trust as policy.md's bracket */
export function mandateOf(t: Trust): { mode: Mode; rung: Rung } {
  return t === "looks" ? { mode: "watch", rung: "read" } : t === "asks" ? { mode: "do", rung: "propose" } : { mode: "do", rung: "draft" };
}

/** a place's coming dates (pure over the texts): its open stickies' titles and its calendar.md lines that name one */
export function datesOf(stickies: string, calendar: string, now: number, item?: string): string[] {
  const open = [...stickies.matchAll(/^- \[ \]\s+(.*)$/gm)].map((m) => m[1].split(" — ")[0]);
  const lines = [...open, ...calendar.split("\n")].filter((t) => !item || new RegExp(`\\b${item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(t));
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return [...new Set(lines.map((t) => dateIn(t, now)).filter((d): d is string => !!d && Date.parse(`${d}T23:59:59`) >= today.getTime()))].sort();
}

