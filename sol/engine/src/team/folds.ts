// "This week's nights" (#436; called "this week's folds" until #477, and the code names stay): the first team tool
// (teamtool.ts), and the one that proves the contract. It reads the project's feed (feed.ts, the same read Cowork's
// "what happened" makes, once a minute at most) and keeps this week's review words: what went into the project (Into
// sol-dev), sent back (slight or severe), said to have broken, re-checked, and the dev releases into beta or held; with
// each change that landed on main outside a review (one the review did not take in, so nothing is counted twice). The
// feed's older words ("folded #N", "passed the dev release") still count, so a week that spans #477 reads whole. The
// week starts Monday at midnight in the project's time zone (its rhythm), or this Mac's when the project names none.
// It writes nothing.
import type { FeedLine } from "./feed.js";
import { defineTool, type ReaderCtx } from "./teamtool.js";

export type FoldKind = "folded" | "rechecked" | "sent-back" | "broke" | "passed" | "held" | "landed";
export type Fold = { at: string; day: string; who: string; agent: boolean; kind: FoldKind; number?: number; text: string; url?: string; how?: "slight" | "severe" };
export type FoldsWeek = { since: string; zone: string; days: { day: string; folds: Fold[] }[]; counts: Record<FoldKind, number> };

const KINDS: FoldKind[] = ["folded", "rechecked", "sent-back", "broke", "passed", "held", "landed"];

/** the calendar day of a moment in a time zone, as YYYY-MM-DD (pure); "" zone is this machine's */
export function dayIn(at: Date, zone: string): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: zone || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(at); }
  catch { return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(at); }
}
const zoneOk = (z: string) => { if (!z) return true; try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return true; } catch { return false; } };
/** this week's Monday in a time zone, YYYY-MM-DD (pure) */
export function mondayOf(now: Date, zone: string): string {
  const [y, m, d] = dayIn(now, zone).split("-").map(Number);
  const noon = new Date(Date.UTC(y, m - 1, d, 12));
  const back = (noon.getUTCDay() + 6) % 7;   // Monday 0 … Sunday 6
  return new Date(noon.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

/** a feed line as a fold, or null when it is none of the review's words (pure) */
export function foldOf(l: FeedLine, zone: string): Fold | null {
  const at = new Date(l.at);
  if (Number.isNaN(at.getTime())) return null;
  const base = { at: l.at, day: dayIn(at, zone), who: l.who, agent: l.agent, text: l.text, ...(l.ref?.number ? { number: l.ref.number } : {}), ...(l.ref?.url ? { url: l.ref.url } : {}) };
  if (l.kind === "landed") return { ...base, kind: "landed" };
  if (l.kind !== "reviewed") return null;
  const t = l.text;
  if (/^#\d+ into /.test(t) || /^folded #/.test(t)) return { ...base, kind: "folded" };
  if (/^re-checked #/.test(t)) return { ...base, kind: "rechecked" };
  const back = /^sent back #\d+ \((slight|severe)\)/.exec(t);
  if (back) return { ...base, kind: "sent-back", how: back[1] as "slight" | "severe" };
  if (/^said #\d+ broke/.test(t)) return { ...base, kind: "broke" };
  if (/^the dev release of \S+ into beta$/.test(t) || /^passed the dev release/.test(t)) return { ...base, kind: "passed" };
  if (/^held the dev release/.test(t)) return { ...base, kind: "held" };
  return null;   // the nightly catch-up and anything newer: not a fold
}

/** this week's folds from the feed's lines (pure): newest first within a day, the newest day first; a landing the
 *  review folded (or re-checked) is dropped, its fold says it */
export function weekOf(lines: FeedLine[], now: Date, zoneAsked: string): FoldsWeek {
  const zone = zoneOk(zoneAsked) ? zoneAsked : "";   // a zone that is no zone: this machine's, and said so
  const since = mondayOf(now, zone), today = dayIn(now, zone);
  const all = lines.map((l) => foldOf(l, zone)).filter((f): f is Fold => !!f && f.day >= since && f.day <= today);
  const reviewed = new Set(all.filter((f) => (f.kind === "folded" || f.kind === "rechecked") && f.number).map((f) => f.number));
  const seen = new Set<string>();
  const kept = all.filter((f) => {
    if (f.kind === "landed" && f.number && reviewed.has(f.number)) return false;
    const k = `${f.kind}|${f.number ?? f.text}|${f.at}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => b.at.localeCompare(a.at));
  const days: FoldsWeek["days"] = [];
  for (const f of kept) { const d = days.find((x) => x.day === f.day); if (d) d.folds.push(f); else days.push({ day: f.day, folds: [f] }); }
  const counts = Object.fromEntries(KINDS.map((k) => [k, kept.filter((f) => f.kind === k).length])) as Record<FoldKind, number>;
  return { since, zone, days, counts };
}

/** the tool's reader, wired once (wire.ts hands in the project's feed) */
export function useFolds(read: (key: string, refresh: boolean) => Promise<{ lines: FeedLine[]; error?: string }>, now: () => Date = () => new Date()) {
  defineTool("folds", async (ctx: ReaderCtx) => {
    const r = await read(ctx.key, ctx.refresh);
    return { ...weekOf(r.lines, now(), ctx.zone), ...(r.error ? { note: "part of the feed could not be read just now" } : {}) };
  });
}
