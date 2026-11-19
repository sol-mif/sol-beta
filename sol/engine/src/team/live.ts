// The live block (#485, dev cycle step 6): what is running and how it is doing, on one page in Cowork, for Sol developers.
// A team tool (teamtool.ts, a block of kind "tool", which blocks.ts's `defineKind` gives its fields), shipped off
// (blocks.json `start: "off"`): the team turns it on in the project settings, by agreement, as every block. It reads
// three things and writes nothing:
//   the release   the newest dev release on the timeline (#424, timeline.ts), what Sol developers run since 9am
//   the morning   the newest "**Morning run**" comment on the open "Night digest" issue (morning.ts morningOf): the gate on
//                 that release and the first-timer's counts, never what the first-timer wrote
//   the errors    Sol's cloud's error counts (track summary `byError`, errcount.ts on each Sol tester's and Sol developer's
//                 Mac) over 30 days, each engine file mapped here to the feature that claims it in specs/features.json
//                 (featuremap.ts until #480 lands), so a count reads as feature, type of error, Sol version. Counts only:
//                 the cloud never sends a message, a path, a tester's code or a name, and this file keeps only the
//                 numbers and words it expects
// Its gate is analytics' (#437), unchanged: the project's members read strictly (`people: true`: the track data names
// people), and the cloud's own, a ticket whose Sol name is in SOL_TRACK_READERS. Without the cloud the page still says
// the release and the morning, and says why the errors are not there.
import { defineTool, type ReaderCtx } from "./teamtool.js";
import { releaseOfCommit } from "./timeline.js";
import { isFileWord } from "../errcount.js";
import { refusalOf, type ReleaseRef } from "./analytics.js";
// TO BE REPLACED by ./features.js (#480) once it lands: the same names
import { featureIn, type Feature } from "./featuremap.js";

const WORD = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = new Set(["uncaught", "turn", "work", "team", "desk", "browser", "face"]);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const word = (v: unknown) => (typeof v === "string" && WORD.test(v) ? v : "");

// ---- the morning run, read back: the newest "**Morning run**" comment (morning.ts writes it; re-exported there) ----

export type MorningSeen = { head: string; tag: string; at: string; by?: string; url?: string; green: boolean | null; findings: number | null };
const MORNING = /^\s*\*\*Morning run\*\*,\s*(dev-\d{8}(?:-\d{4})?):\s*(.*)$/;
const LOGIN = /^[A-Za-z0-9-]{1,39}(\[bot\])?$/;
/** the newest morning run among a digest's comments (pure): its first line in plain words, the release, the gate
 *  (null when not here yet), the first-timer's findings, and who posted it (anyone may comment on the digest, so the
 *  page names the poster); null when there is none */
export function morningOf(comments: { body?: string; createdAt?: string; url?: string; author?: { login?: string } }[]): MorningSeen | null {
  let best: MorningSeen | null = null;
  for (const c of comments) {
    const line = String(c.body ?? "").split("\n")[0] ?? "";
    const m = MORNING.exec(line);
    if (!m || (best && String(c.createdAt ?? "") <= best.at)) continue;
    const rest = m[2], by = String(c.author?.login ?? "");
    best = {
      head: line.replace(/\*\*/g, "").replace(/[\p{Cc}\p{Cf}]/gu, " ").trim().slice(0, 240), tag: m[1], at: String(c.createdAt ?? ""),
      ...(LOGIN.test(by) ? { by } : {}),
      ...(typeof c.url === "string" && /^https:\/\/github\.com\//.test(c.url) ? { url: c.url } : {}),
      green: /\bgate green\b/.test(rest) ? true : /\bgate red\b/.test(rest) ? false : null,
      findings: ((x) => (x ? Number(x[1]) : null))(/(\d+) findings?\b/.exec(rest)),
    };
  }
  return best;
}

// ---- the error counts, by feature ----

export type ErrorRow = { file: string; type: string; kind: string; sol: string; events: number; testers: number };
/** one feature's errors: events, testers (at least: one tester may be in several rows), by type and by release */
export type FeatureErrors = {
  id: string; name: string; events: number; testers: number; onNewest: number;
  types: { type: string; events: number }[];
  releases: { release: string; events: number }[];
};
export type Live = {
  release: { tag: string; at: string; sha: string } | null;
  morning: MorningSeen | null;
  errors: {
    window: { days: number; from: string; to: string };
    total: number;
    features: FeatureErrors[];   // most events first; "" is no feature (a file the map does not claim)
    mapped: boolean;             // false: there is no feature map here, so every count is under ""
  } | null;
  read: string;
  notes: string[];
};

/** the cloud's error counts kept to what the page draws (pure): words and numbers only; null when it is no summary */
export function cleanErrors(v: unknown): { window: { days: number; from: string; to: string }; rows: ErrorRow[] } | null {
  if (!isObj(v) || !isObj(v.window)) return null;
  const w = v.window;
  if (typeof w.from !== "string" || !DAY.test(w.from) || typeof w.to !== "string" || !DAY.test(w.to)) return null;
  const rows = (Array.isArray(v.byError) ? v.byError : []).filter(isObj).flatMap((r): ErrorRow[] => {
    const file = typeof r.file === "string" && isFileWord(r.file) ? r.file : "", type = word(r.type), kind = typeof r.kind === "string" && KINDS.has(r.kind) ? r.kind : "";
    const sol = r.sol === "" ? "" : word(r.sol);
    if (!file || !type || !kind || (r.sol !== "" && !sol)) return [];
    return [{ file, type, kind, sol, events: n(r.events), testers: n(r.testers) }];
  }).slice(0, 500);
  return { window: { days: Math.max(1, Math.min(120, n(w.days))), from: w.from, to: w.to }, rows };
}

/** an error count's file as the repository's path (pure): "src:team:pages.ts" is sol/engine/src/team/pages.ts */
export const pathOfFile = (file: string) => (file === "other" ? "" : `sol/engine/${file.replace(/:/g, "/")}`);

/** the error counts by feature (pure over the map and the releases): each file to the feature that claims it, the
 *  newest dev release's own counts beside the window's */
export function errorsByFeature(rows: ErrorRow[], features: Pick<Feature, "id" | "name" | "paths">[], line: { releases: ReleaseRef[]; spots: Record<string, string> } | null, newest: string): FeatureErrors[] {
  const rel = (line?.releases ?? []).filter((r) => r.kind !== "next");
  const by = new Map<string, FeatureErrors & { t: Map<string, number>; r: Map<string, number> }>();
  for (const row of rows) {
    const path = pathOfFile(row.file);
    const f = path ? featureIn(features as Feature[], path) : null;
    const id = f?.id ?? "";
    const x = by.get(id) ?? { id, name: f?.name ?? "no feature yet", events: 0, testers: 0, onNewest: 0, types: [], releases: [], t: new Map(), r: new Map() };
    x.events += row.events;
    x.testers = Math.max(x.testers, row.testers);
    x.t.set(row.type, (x.t.get(row.type) ?? 0) + row.events);
    const tag = line ? releaseOfCommit(row.sol, rel, line.spots) ?? "" : "";
    x.r.set(tag, (x.r.get(tag) ?? 0) + row.events);
    if (newest && tag === newest) x.onNewest += row.events;
    by.set(id, x);
  }
  const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return [...by.values()]
    .map(({ t, r, ...x }) => ({ ...x, types: sorted(t).map(([type, events]) => ({ type, events })), releases: sorted(r).map(([release, events]) => ({ release, events })) }))
    .sort((a, b) => (a.id === "") !== (b.id === "") ? (a.id === "" ? 1 : -1) : b.events - a.events || a.id.localeCompare(b.id));
}

/** the newest dev release on the timeline (pure) */
export function newestDev(releases: ReleaseRef[]): { tag: string; at: string; sha: string } | null {
  const r = releases.filter((x) => x.kind === "dev").sort((a, b) => b.at.localeCompare(a.at))[0];
  return r ? { tag: r.tag, at: r.at, sha: r.sha.slice(0, 12) } : null;
}

export type LiveDeps = {
  /** my ticket on Sol's cloud, "" when there is none (nothing is asked of the cloud then) */
  ticket: () => Promise<string>;
  /** GET <cloud>/relay/track/summary with that ticket: its status and JSON body; status 0 when it did not answer */
  summary: (ticket: string) => Promise<{ status: number; body: unknown }>;
  /** the timeline's releases and spots, or null when they cannot be read */
  releases: () => Promise<{ releases: ReleaseRef[]; spots: Record<string, string>; error?: string } | null>;
  /** the open "Night digest" issue's comments (body, createdAt, url), [] when there is none */
  digest: () => Promise<{ body?: string; createdAt?: string; url?: string; author?: { login?: string } }[]>;
  /** the feature map of Sol's own checkout ([] when it has none: a Sol tester's, or before #480) */
  features: () => Feature[];
  now?: () => Date;
};

export const CACHE_MS = 2 * 60_000;

/** the page's data (never throws: each part that cannot be read says so in `notes`) */
export async function liveNow(d: LiveDeps): Promise<Live> {
  const now = d.now ?? (() => new Date());
  const notes: string[] = [];
  const line = await d.releases().catch(() => null);
  if (!line) notes.push("the releases could not be read just now");
  else if (line.error) notes.push(`the releases were read with a problem (${line.error.slice(0, 120)})`);
  const release = line ? newestDev(line.releases) : null;
  let morning: MorningSeen | null = null;
  try { morning = morningOf(await d.digest()); if (!morning) notes.push("no morning run on the Night digest yet: it runs on the NucBox at the release hour + 30 minutes, once its timer is on"); }
  catch (e) { notes.push(`the Night digest could not be read (${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 120)})`); }
  let errors: Live["errors"] = null;
  const ticket = await d.ticket().catch(() => "");
  if (!ticket) notes.push(`error counts: ${refusalOf(403)}`);
  else {
    const r = await d.summary(ticket).catch(() => ({ status: 0, body: null }));
    if (r.status !== 200) notes.push(`error counts: ${refusalOf(r.status, isObj(r.body) && typeof r.body.error === "string" ? r.body.error : undefined)}`);
    else {
      const s = cleanErrors(r.body);
      if (!s) notes.push("error counts: Sol's cloud answered with something that is not the counts");
      else {
        if (isObj(r.body) && !Array.isArray(r.body.byError)) notes.push("error counts: Sol's cloud does not keep them yet: it needs its next update");
        let features: Feature[] = [];
        try { features = d.features(); } catch { features = []; }
        if (!features.length) notes.push("there is no feature map here (specs/features.json), so the errors are not put on features yet");
        errors = { window: s.window, total: s.rows.reduce((a, x) => a + x.events, 0), features: errorsByFeature(s.rows, features, line, release?.tag ?? ""), mapped: features.length > 0 };
      }
    }
  }
  return { release, morning, errors, read: now().toISOString(), notes };
}

/** the tool's reader, wired once (wire.ts). Kept two minutes, past the gate only, and for the same cloud ticket only */
export function useLive(d: LiveDeps) {
  let kept: { at: number; ticket: string; data: Live } | null = null;
  const now = d.now ?? (() => new Date());
  defineTool("live", async (ctx: ReaderCtx) => {
    const ticket = await d.ticket().catch(() => "");
    if (!ctx.refresh && kept && kept.ticket === ticket && now().getTime() - kept.at < CACHE_MS) return kept.data;
    const data = await liveNow({ ...d, ticket: async () => ticket });
    kept = { at: now().getTime(), ticket, data };
    return data;
  }, { people: true });
}
