// Analytics (#437, E2 of #413): the second team tool (teamtool.ts) and the first to read outside the project. It reads
// Sol's cloud's GET /relay/track/summary (sol/cloud/src/track.ts) with this Sol's own ticket there: the beta testers'
// counts over 30 days, by day, event name, mode and `sol` version, Cowork's parts used (#431's cowork.used), the testers
// new each day and how often they came. Counts only: the cloud never sends a row, a tester's code, name or email, and
// this file keeps only the numbers and words it expects from the answer. Each version (a commit of Sol) is placed on
// the timeline's releases (#424, timeline.ts), so the page says which release the testers run. Two gates stand before
// it: the project's members (teamtool.ts, strict here because track data names people: `people: true`), and the
// cloud's own, a ticket of the cloud whose Sol name is in SOL_TRACK_READERS. It writes nothing.
import { defineTool, type ReaderCtx } from "./teamtool.js";
import { releaseOfCommit } from "./timeline.js";

const WORD = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const rows = (v: unknown) => (Array.isArray(v) ? v.filter(isObj) : []);

export type Counted = { events: number; testers: number };
export type ReleaseRef = { tag: string; sha: string; at: string; kind: "dev" | "stable" | "next" };
/** one place a version can stand: a release by its tag, "main" (past the last release), or "" (a build of its own) */
export type Adoption = { release: string; at?: string; kind?: string; sols: string[]; testers: number; events: number };
export type Analytics = {
  window: { days: number; from: string; to: string };
  total: Counted;
  days: ({ day: string; new: number } & Counted)[];   // every day of the window, nothing as 0
  names: ({ name: string } & Counted)[];   // the eight most used, the rest as one "other"
  modes: ({ mode: string } & Counted)[];
  parts: ({ part: string } & Counted)[];   // cowork.used by part
  active: { span: string; testers: number }[];
  versions: Adoption[];   // newest release first, then main, then builds of their own; testers on each by their newest event
  releases: { tag: string; at: string; kind: string }[];   // the releases made in the window, for the time line's marks
  read: string;
  note?: string;
};

export const TOP_NAMES = 8;

/** the cloud's answer kept to what the page draws (pure): numbers, days and words only; null when it is no summary */
export function cleanSummary(v: unknown) {
  if (!isObj(v) || !isObj(v.window) || !isObj(v.total) || !Array.isArray(v.byDay)) return null;
  const w = v.window, word = (x: unknown) => (typeof x === "string" && WORD.test(x) ? x : "");
  if (typeof w.from !== "string" || !DAY.test(w.from) || typeof w.to !== "string" || !DAY.test(w.to)) return null;
  return {
    window: { days: Math.max(1, Math.min(120, n(w.days))), from: w.from, to: w.to },
    total: { events: n(v.total.events), testers: n(v.total.testers) },
    byDay: rows(v.byDay).filter((r) => typeof r.day === "string" && DAY.test(r.day)).map((r) => ({ day: r.day as string, events: n(r.events), testers: n(r.testers) })),
    byName: rows(v.byName).filter((r) => word(r.name)).map((r) => ({ name: r.name as string, events: n(r.events), testers: n(r.testers) })),
    byMode: rows(v.byMode).filter((r) => word(r.mode)).map((r) => ({ mode: r.mode as string, events: n(r.events), testers: n(r.testers) })),
    bySol: rows(v.bySol).filter((r) => r.sol === "" || word(r.sol)).map((r) => ({ sol: r.sol as string, events: n(r.events), testers: n(r.testers), latest: n(r.latest) })),
    byPart: rows(v.byPart).filter((r) => word(r.part)).map((r) => ({ part: r.part as string, events: n(r.events), testers: n(r.testers) })),
    newByDay: rows(v.newByDay).filter((r) => typeof r.day === "string" && DAY.test(r.day)).map((r) => ({ day: r.day as string, testers: n(r.testers) })),
    activeDays: rows(v.activeDays).filter((r) => typeof r.span === "string" && /^[0-9+-]{1,5}$/.test(r.span)).map((r) => ({ span: r.span as string, testers: n(r.testers) })),
  };
}
export type Summary = NonNullable<ReturnType<typeof cleanSummary>>;

/** the days from..to, each once (pure) */
export function daysFrom(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T12:00:00Z`), end = Date.parse(`${to}T12:00:00Z`); t <= end && out.length < 200; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** the page's data from the cloud's summary and the timeline's releases (pure) */
export function analyticsOf(s: Summary, line: { releases: ReleaseRef[]; spots: Record<string, string> } | null, readAt: Date): Analytics {
  const byDay = new Map(s.byDay.map((d) => [d.day, d])), fresh = new Map(s.newByDay.map((d) => [d.day, d.testers]));
  // a tester's file may say tomorrow (clocks): the window runs to the last day that has anything
  const last = [s.window.to, ...s.byDay.map((d) => d.day)].sort().pop()!;
  const days = daysFrom(s.window.from, last).map((day) => ({ day, events: byDay.get(day)?.events ?? 0, testers: byDay.get(day)?.testers ?? 0, new: fresh.get(day) ?? 0 }));
  const names = s.byName.slice(0, TOP_NAMES);
  const rest = s.byName.slice(TOP_NAMES);
  // the rest as one row; its testers are not a sum (one tester may be in several), so at least the most of any one
  if (rest.length) names.push({ name: "other", events: rest.reduce((a, r) => a + r.events, 0), testers: Math.max(...rest.map((r) => r.testers)) });
  // each version on its release; versions on the same release add up
  const rel = (line?.releases ?? []).filter((r) => r.kind !== "next");
  const placed = new Map<string, Adoption>();
  for (const v of s.bySol) {
    const tag = line ? releaseOfCommit(v.sol, rel, line.spots) ?? "" : "";
    const r = rel.find((x) => x.tag === tag);
    const a = placed.get(tag) ?? { release: tag, ...(r ? { at: r.at, kind: r.kind } : {}), sols: [], testers: 0, events: 0 };
    a.sols.push(v.sol || "unknown");
    a.testers += v.latest;
    a.events += v.events;
    placed.set(tag, a);
  }
  const order = (a: Adoption) => (a.release === "" ? -2 : a.release === "main" ? Number.MAX_SAFE_INTEGER : rel.findIndex((r) => r.tag === a.release));
  const versions = [...placed.values()].sort((a, b) => order(b) - order(a));
  const releases = rel.filter((r) => r.at.slice(0, 10) >= s.window.from && r.at.slice(0, 10) <= last).map((r) => ({ tag: r.tag, at: r.at, kind: r.kind }));
  return {
    window: s.window, total: s.total, days, names, modes: s.byMode, parts: s.byPart, active: s.activeDays, versions, releases,
    read: readAt.toISOString(),
  };
}

/** the cloud's answer as words a person can act on (pure): a refusal or a failure says who can change it */
export function refusalOf(status: number, error?: string): string {
  if (status === 0) return "Sol's cloud did not answer: try again in a minute";
  if (status === 401 || status === 403) return /members only/.test(error ?? "")
    ? "Sol's cloud keeps these counts for the people on its readers list, and your Sol name is not on it: whoever runs the cloud adds it (SOL_TRACK_READERS)"
    : "sign in to Sol's cloud (Settings, Cowork) to read the counts: they are kept there";
  if (status === 404) return "Sol's cloud does not keep these counts yet: it needs its next update";
  if (status === 429) return "Sol's cloud asked to slow down: try again in a minute";
  return `Sol's cloud said ${status}${error ? `: ${error.slice(0, 120)}` : ""}`;
}

export type AnalyticsDeps = {
  /** my ticket on Sol's cloud, "" when there is none (nothing is asked of the cloud then) */
  ticket: () => Promise<string>;
  /** GET <cloud>/relay/track/summary with that ticket: its status and JSON body; status 0 when it did not answer */
  summary: (ticket: string) => Promise<{ status: number; body: unknown }>;
  /** the timeline's releases and spots, or null when they cannot be read (the page still draws, versions unplaced) */
  releases: () => Promise<{ releases: ReleaseRef[]; spots: Record<string, string>; error?: string } | null>;
  now?: () => Date;
};

export const CACHE_MS = 2 * 60_000;

/** the tool's reader, wired once (wire.ts hands in the cloud and the timeline). The summary is kept two minutes, past
 *  the gate only (every open passes the members gate first, the cache never answers one that did not), and for the
 *  same ticket only: another sign-in on the cloud asks the cloud again, so its readers list decides for that person */
export function useAnalytics(d: AnalyticsDeps) {
  let kept: { at: number; ticket: string; data: Analytics } | null = null;
  const now = d.now ?? (() => new Date());
  defineTool("analytics", async (ctx: ReaderCtx) => {
    const ticket = await d.ticket().catch(() => "");
    if (!ticket) { kept = null; throw new Error(refusalOf(403)); }
    if (!ctx.refresh && kept && kept.ticket === ticket && now().getTime() - kept.at < CACHE_MS) return kept.data;
    const r = await d.summary(ticket);
    if (r.status !== 200) { kept = null; throw new Error(refusalOf(r.status, isObj(r.body) && typeof r.body.error === "string" ? r.body.error : undefined)); }
    const s = cleanSummary(r.body);
    if (!s) throw new Error("Sol's cloud answered with something that is not the counts");
    const line = await d.releases().catch(() => null);
    const data = analyticsOf(s, line, now());
    if (!line) data.note = "the releases could not be read just now, so the versions are not placed on them";
    else if (line.error) data.note = `the releases were read with a problem (${line.error.slice(0, 120)}), so a version may be unplaced`;
    kept = { at: now().getTime(), ticket, data };
    return data;
  }, { people: true });
}
