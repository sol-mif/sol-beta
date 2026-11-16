// Team tools' pure parts (#436; the engine's team/teamtool.ts and team/folds.ts, PROTOCOL round 81). A team tool is a
// block of kind "tool" in blocks.json whose `with` names its page, what it reads and from where, its owner, and the
// members gate. Its data comes only from the engine (`team.tool { id }`), which refuses anyone who is not one of the
// project's members; the face draws what it is given, or the refusal in words. No React here: src/teamtools.test.ts.
import type { Block } from "../blocks/live.ts";

export type Read = { what: string; from: string };
export type TeamTool = { page: string; reads: Read[]; owner: string; gate: "members" | "devs" };
/** the engine's answer to `team.tool` */
export type ToolAnswer = { id: string; tool?: TeamTool; data?: unknown; error?: string; gate?: "none" | "off" | "members" | "devs" | "unknown" | "missing" };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** the team tool a block is, or null (pure): Sol's own calendar, decisions, polls and settings are none */
export function teamToolOf(b: Pick<Block, "kind" | "with">): TeamTool | null {
  const w = b.with;
  if (b.kind !== "tool" || !isObj(w) || !Array.isArray(w.reads) || typeof w.page !== "string" || typeof w.owner !== "string" || (w.gate !== "members" && w.gate !== "devs")) return null;
  const reads = w.reads.filter((r): r is Read => isObj(r) && typeof r.what === "string" && typeof r.from === "string");
  return reads.length ? { page: w.page, reads, owner: w.owner, gate: w.gate } : null;
}

/** who a team tool is for, in words (pure): the project's members, or its Sol developers (#480) */
export const gateWord = (t: Pick<TeamTool, "gate">) => (t.gate === "devs" ? "Sol developers only" : "members only");
/** a team tool's tile line (pure): who it is for and what it reads, before anything is read */
export const teamToolLine = (t: TeamTool) => `${gateWord(t)} · reads ${t.reads.map((r) => r.what.split(":")[0]).join(", ")}`;

// ---- this week's folds (team/folds.ts) ----

export type FoldKind = "folded" | "rechecked" | "sent-back" | "broke" | "passed" | "held" | "landed";
export type Fold = { at: string; day: string; who: string; agent: boolean; kind: FoldKind; number?: number; text: string; url?: string; how?: "slight" | "severe" };
export type FoldsWeek = { since: string; zone: string; days: { day: string; folds: Fold[] }[]; counts: Record<FoldKind, number>; note?: string };

/** the week's answer made safe to draw (pure): null when it is not one */
export function foldsOf(v: unknown): FoldsWeek | null {
  if (!isObj(v) || typeof v.since !== "string" || !Array.isArray(v.days) || !isObj(v.counts)) return null;
  return v as unknown as FoldsWeek;
}

/** the week in one line (pure): "4 into dev · 1 sent back · into beta once" (#477's words; the kinds keep their code names) */
export function weekLine(w: Pick<FoldsWeek, "counts">): string {
  const c = w.counts, parts: string[] = [];
  const n = (k: FoldKind) => c[k] ?? 0;
  if (n("folded") + n("rechecked")) parts.push(`${n("folded") + n("rechecked")} into dev`);
  if (n("sent-back")) parts.push(`${n("sent-back")} sent back`);
  if (n("broke")) parts.push(`${n("broke")} said broken`);
  if (n("passed")) parts.push(`into beta ${n("passed") === 1 ? "once" : `${n("passed")} times`}`);
  if (n("held")) parts.push(`held ${n("held") === 1 ? "once" : `${n("held")} times`}`);
  if (n("landed")) parts.push(`${n("landed")} landed outside the review`);
  return parts.join(" · ") || "nothing went in yet this week";
}

const DAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
/** a day's heading (pure): "today", "yesterday", else "wed 10/28" */
export function dayHead(day: string, today: string): string {
  const [y, m, d] = day.split("-").map(Number), [ty, tm, td] = today.split("-").map(Number);
  const n = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86_400_000);
  return n === 0 ? "today" : n === 1 ? "yesterday" : `${DAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${m}/${d}`;
}
/** a fold's mark word (pure) */
export const KIND_WORD: Record<FoldKind, string> = { folded: "into dev", rechecked: "into dev", "sent-back": "sent back", broke: "broke", passed: "into beta", held: "held", landed: "landed" };

// ---- analytics (team/analytics.ts, #437) ----

export type Counted = { events: number; testers: number };
export type Adoption = { release: string; at?: string; kind?: string; sols: string[]; testers: number; events: number };
export type Analytics = {
  window: { days: number; from: string; to: string };
  total: Counted;
  days: ({ day: string; new: number } & Counted)[];
  names: ({ name: string } & Counted)[];
  modes: ({ mode: string } & Counted)[];
  parts: ({ part: string } & Counted)[];
  active: { span: string; testers: number }[];
  versions: Adoption[];
  releases: { tag: string; at: string; kind: string }[];
  read: string;
  note?: string;
};

/** the engine's counts made safe to draw (pure): null when it is not them */
export function analyticsOf(v: unknown): Analytics | null {
  if (!isObj(v) || !isObj(v.window) || !isObj(v.total) || !Array.isArray(v.days) || !Array.isArray(v.versions)) return null;
  for (const k of ["names", "modes", "parts", "active", "releases"]) if (!Array.isArray(v[k])) return null;
  return v as unknown as Analytics;
}

/** a count as a person reads it (pure): 940, 1.2k, 12k */
export const compact = (n: number) => n < 1000 ? String(n) : n < 10_000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${Math.round(n / 1000)}k`;
/** a day as m/d (pure) */
export const md = (day: string) => { const [, m, d] = day.split("-").map(Number); return `${m}/${d}`; };
/** a release's name, short (pure): dev-2026-10-29 is "dev 10/29", "main" past the last release, "" a build of its own */
export function releaseWord(tag: string): string {
  if (tag === "") return "a build of its own";
  if (tag === "main") return "main, not released yet";
  const m = /^(dev|stable|beta)?-?(\d{4})-(\d{2})-(\d{2})/.exec(tag);
  return m ? `${m[1] ?? "release"} ${Number(m[3])}/${Number(m[4])}` : tag;
}
/** the line over the whole page (pure): "3 testers · 1,240 events over 30 days" */
export function analyticsLine(a: Pick<Analytics, "total" | "window">): string {
  const t = a.total;
  if (!t.events) return `nothing counted in the last ${a.window.days} days`;
  return `${t.testers} tester${t.testers === 1 ? "" : "s"} · ${t.events.toLocaleString("en-US")} events over ${a.window.days} days`;
}
/** how many testers run the newest release (pure): its tag and the count, or null when no version is on a release */
export function onNewest(a: Pick<Analytics, "versions">): { release: string; testers: number } | null {
  const r = a.versions.find((v) => v.release && v.release !== "main");
  return r ? { release: r.release, testers: r.testers } : null;
}

// ---- the Features page (team/area.ts, #480): the feature map, two views, Sol developers only ----

export type Evals = "approved" | "draft" | "none";
export type FeatureRow = {
  id: string; name: string; slug: string; type: "internal" | "product" | "marketing"; label: string; where: string;
  lead: string; support: string[]; dependsOn: string[]; paths: string[]; off: string | null; evals: Evals;
};
/** resort: the last nightly re-sort, from the project's record (.sol/resorts.json); `undo` the command that puts it
 *  back, "" once undone or when it moved nothing */
export type FeaturesData = { features: FeatureRow[]; owners: Record<string, string[]>; resort: { line: string; at: string; undo: string } | null; read: string };

/** the engine's map made safe to draw (pure): null when it is not one */
export function featuresOf(v: unknown): FeaturesData | null {
  if (!isObj(v) || !Array.isArray(v.features) || !isObj(v.owners)) return null;
  const features = v.features.filter((f): f is FeatureRow => isObj(f) && typeof f.id === "string" && typeof f.name === "string" && typeof f.where === "string" && typeof f.label === "string" && typeof f.lead === "string" && Array.isArray(f.support) && Array.isArray(f.dependsOn) && Array.isArray(f.paths));
  const r = isObj(v.resort) && typeof v.resort.line === "string" ? v.resort : null;
  return { features, owners: v.owners as Record<string, string[]>, resort: r ? { line: String(r.line), at: typeof r.at === "string" ? r.at : "", undo: typeof r.undo === "string" ? r.undo : "" } : null, read: typeof v.read === "string" ? v.read : "" };
}

/** the group of the features with no area label (pure word) */
export const NO_AREA = "no area yet";
/** where a feature lives as a Sol user sees it (pure): its `where` up to the first colon ("Home", "the notch") */
export const placeOf = (f: Pick<FeatureRow, "where">) => (f.where.split(":")[0] || "somewhere").trim();
/** a feature's row on the board (pure): the cells the tables' board draws (#434, tables/views.ts) */
export const rowOf = (f: FeatureRow) => ({ id: f.id, title: f.name, place: placeOf(f), label: f.label || NO_AREA, type: f.type, evals: f.evals, who: f.lead });
/** the evals in words (pure) */
export const EVALS_WORD: Record<Evals, string> = { approved: "evals approved", draft: "evals drafted", none: "no evals yet" };
/** the page's one line (pure): "29 features · 3 with evals approved · 2 drafted" */
export function featuresLine(d: Pick<FeaturesData, "features">): string {
  const n = d.features.length, ok = d.features.filter((f) => f.evals === "approved").length, draft = d.features.filter((f) => f.evals === "draft").length;
  if (!n) return "no feature map in the checkout this Sol runs from";
  return `${n} feature${n === 1 ? "" : "s"} · ${ok} with evals approved${draft ? ` · ${draft} drafted` : ""}`;
}
/** "as it's built" (pure): a label a group, in the five area labels' order, with its lead and support as the ownership
 *  table says them, and each feature's own lead and support where the map says others. A feature with no area label
 *  (the old label "product" goes away, decision 18) is in the last group, "no area yet", for the leads to place */
export const LABEL_ORDER = ["base", "life", "work", "cowork", "social"];
export function builtGroups(d: Pick<FeaturesData, "features" | "owners">): { label: string; leads: string[]; features: FeatureRow[] }[] {
  const area = (f: FeatureRow) => (LABEL_ORDER.includes(f.label) ? f.label : NO_AREA);
  const labels = [...LABEL_ORDER.filter((l) => d.features.some((f) => area(f) === l)), ...(d.features.some((f) => area(f) === NO_AREA) ? [NO_AREA] : [])];
  return labels.map((label) => ({ label, leads: label === NO_AREA ? [] : d.owners[label] ?? [], features: d.features.filter((f) => area(f) === label) }));
}

// ---- the live block (team/live.ts, #485) ----

export type FeatureErrors = { id: string; name: string; events: number; testers: number; onNewest: number; types: { type: string; events: number }[]; releases: { release: string; events: number }[] };
export type Live = {
  release: { tag: string; at: string; sha: string } | null;
  morning: { head: string; tag: string; at: string; by?: string; url?: string; green: boolean | null; findings: number | null } | null;
  errors: { window: { days: number; from: string; to: string }; total: number; features: FeatureErrors[]; mapped: boolean } | null;
  read: string;
  notes: string[];
};

/** the engine's live answer made safe to draw (pure): null when it is not one */
export function liveOf(v: unknown): Live | null {
  if (!isObj(v) || !Array.isArray(v.notes) || typeof v.read !== "string") return null;
  if (v.errors !== null && (!isObj(v.errors) || !Array.isArray(v.errors.features))) return null;
  return v as unknown as Live;
}
/** a dev release's name, short (pure): dev-20261031 is "dev 10/31", dev-20261031-1400 "dev 10/31 14:00" */
export function devWord(tag: string): string {
  const m = /^dev-(\d{4})(\d{2})(\d{2})(?:-(\d{2})(\d{2}))?$/.exec(tag);
  if (!m) return releaseWord(tag);
  return `dev ${Number(m[2])}/${Number(m[3])}${m[4] ? ` ${m[4]}:${m[5]}` : ""}`;
}
/** the whole page in one line (pure): what runs and how it is doing */
export function liveLine(l: Pick<Live, "release" | "morning" | "errors">): string {
  const parts: string[] = [l.release ? `${devWord(l.release.tag)} is the newest dev release` : "no dev release yet"];
  const m = l.morning;
  if (m && l.release && m.tag === l.release.tag) parts.push(m.green === true ? "the gate green" : m.green === false ? "the gate red" : "the gate not run");
  else if (l.release) parts.push("no morning run on it yet");
  if (l.errors) {
    const on = l.errors.features.reduce((s, f) => s + f.onNewest, 0);
    parts.push(l.errors.total ? `${l.errors.total} error${l.errors.total === 1 ? "" : "s"} in ${l.errors.window.days} days${l.release ? `, ${on} on it` : ""}` : `no errors in ${l.errors.window.days} days`);
  }
  return parts.join(" · ");
}
