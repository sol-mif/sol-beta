// The timeline's shapes and its pure helpers (#424): team.timeline as the engine sends it (engine/src/team/timeline.ts),
// the words for a release and a change's way, and where things sit on the drawing. Pure, so node --test reads it
// (src/timeline.test.ts); Timeline.tsx draws it. Not "timeline.ts": a Mac folder does not tell it from Timeline.tsx

export type Change = { number: number; title: string; author?: string; url?: string; handedIn?: string; folded: string; broke?: true; release?: string; releaseAt?: string; beta?: string; betaAt?: string };
export type Release = { tag: string; sha: string; at: string; kind: "dev" | "stable" | "next"; beta: boolean; held?: boolean; latest?: true; changes: Change[] };
export type Side = { kind: "severe" | "closed" | "held"; from: string; at: string; title: string; why: string; number?: number; author?: string; url?: string; by?: string };
export type Placed = { login: string; you: boolean; on: string | null; mine: number; behind: number; line: string };
export type Night = { handIn: string; review: string; until: string; release: string; zone: string;
  /** who reviews tonight and who backs up from `handover` (#478); an engine before it sends none */
  dev?: string[]; beta?: string[]; devBackup?: string[]; betaBackup?: string[]; handover?: string };
export type Waiting = { number: number; title: string; author?: string; url?: string; at?: string };
export type Timeline = { at: string; source: "dev" | "stable" | "none"; releases: Release[]; sides: Side[]; waiting: Waiting[]; night?: Night; repo?: string; developer: boolean; error?: string; me: string; people: Placed[] };

/** the answer as it came, or null when it is not a timeline (an older engine answers {} or an error) */
export function timelineOf(m: any): Timeline | null {
  if (!m || !Array.isArray(m.releases) || !Array.isArray(m.sides) || !Array.isArray(m.people)) return null;
  return { at: String(m.at ?? ""), source: m.source === "dev" || m.source === "stable" ? m.source : "none", releases: m.releases, sides: m.sides, waiting: Array.isArray(m.waiting) ? m.waiting : [], developer: m.developer !== false, me: String(m.me ?? ""), people: m.people,
    ...(m.night && ["handIn", "review", "until", "release"].every((k) => typeof m.night[k] === "string") ? { night: { ...m.night, zone: typeof m.night.zone === "string" ? m.night.zone : "" } } : {}),
    ...(typeof m.repo === "string" ? { repo: m.repo } : {}), ...(typeof m.error === "string" ? { error: m.error } : {}) };
}

/** a release's short name on the drawing: "Thu 30", "Thu 30 14:00" for a second one that day, "main" (pure) */
export function shortName(r: Pick<Release, "tag" | "at" | "kind">): string {
  if (r.kind === "next") return "main";
  const d = new Date(r.at);
  if (Number.isNaN(+d)) return r.tag;
  const day = `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getDate()}`;
  return /-\d{4}$/.test(r.tag) && r.kind === "dev" ? `${day} ${d.toTimeString().slice(0, 5)}` : day;
}

/** "Thu 30 Oct, 09:00" (pure) */
export function when(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "";
  return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" })}, ${d.toTimeString().slice(0, 5)}`;
}

/** where a release stands, in words (pure) */
export function standing(r: Release): string {
  if (r.kind === "next") return "in, not released yet";
  if (r.held) return "held from beta";
  if (r.kind === "stable") return "a stable release";
  return r.beta ? "on beta" : "on dev";
}

/** a change's way: handed in → in (the dev night took it in, #477) → dev → beta, each with when, or "not yet" (pure) */
export function wayOf(c: Change, source: Timeline["source"]): { step: string; at: string; done: boolean }[] {
  const steps = [
    { step: "handed in", at: c.handedIn ? when(c.handedIn) : "", done: !!c.handedIn },
    { step: "in", at: when(c.folded), done: true },
  ];
  // before the dev releases a stable release was dev and beta at once: one step
  if (source !== "dev" && c.release && c.release.startsWith("stable-")) return [...steps, { step: "released", at: `${c.release} · ${when(c.releaseAt)}`, done: true }];
  return [...steps,
    { step: "dev", at: c.release ? `${c.release} · ${when(c.releaseAt)}` : "the next release", done: !!c.release },
    { step: "beta", at: c.beta ? `${c.beta} · ${when(c.betaAt)}` : "not yet", done: !!c.beta },
  ];
}

/** what the timeline says first, one line (pure) */
export function headline(t: Timeline): string {
  const rel = t.releases.filter((r) => r.kind !== "next");
  if (!rel.length) return t.source === "none" ? "no release yet: what went in waits on main" : "no release in the last 30 days";
  const latest = rel[rel.length - 1];
  const me = t.people.find((p) => p.you);
  const mine = !me || !me.on ? "" : me.on === latest.tag ? ` · you run the latest` : me.on === "main" ? " · you run main, past the latest" : ` · you are ${me.behind} behind`;
  return `${rel.length} release${rel.length === 1 ? "" : "s"} in 30 days · latest ${latest.tag}${mine}`;
}

/** a person's small words under their name: "+12 of mine · 2 behind" (pure) */
export function personWords(p: Placed): string {
  return [p.mine ? `+${p.mine} of mine` : "", p.behind ? `${p.behind} behind` : ""].filter(Boolean).join(" · ");
}

/** the side branches of each release, by its tag (pure) */
export function sidesBy(t: Timeline): Map<string, Side[]> {
  const m = new Map<string, Side[]>();
  for (const s of t.sides) m.set(s.from, [...(m.get(s.from) ?? []), s]);
  return m;
}

/** the side's short label on the drawing (pure) */
export const sideLabel = (s: Side) => s.kind === "held" ? "held from beta" : `#${s.number ?? "?"} ${s.kind === "severe" ? "sent back" : "closed"}`;

// ---- the night's rhythm (#413): hand in → the dev night → fixes until → release, then the day ----
/** the hours #413 decided, when the project has no .sol/rhythm.json */
export const DEFAULT_NIGHT: Night = { handIn: "20:00", review: "21:00", until: "06:00", release: "09:00", zone: "America/New_York" };
const minsOf = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
/** "8pm", "9:30pm", "6am" (pure) */
export function ampm(t: string): string {
  const m = minsOf(t), h = Math.floor(m / 60) % 24, mm = m % 60;
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}
/** minutes since midnight on the wall clock of `zone` ("" = this Mac's) (pure) */
export function minutesIn(now: Date, zone: string): number {
  if (!zone) return now.getHours() * 60 + now.getMinutes();
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
    return (Number(p.hour) % 24) * 60 + Number(p.minute);
  } catch { return now.getHours() * 60 + now.getMinutes(); }
}
export type Stretch = { key: "handed" | "review" | "release" | "day"; word: string; from: number; to: number };
export type Stop = { key: "handIn" | "review" | "until" | "release"; time: string; word: string; x: number };
/** each stretch's share of the drawing: the hours are not to scale, so the hour between hand-in and review reads as
 *  well as the long night; where now is stays to scale inside its stretch */
export const SHARES = [0.22, 0.34, 0.2, 0.24] as const;
/** the night drawn as one turn of the clock from the hand-in (pure): where each step sits (0..1), the stretches between
 *  them, where now is, and the one line saying which stretch it is */
export function nightOf(n: Night | undefined, now: Date): { stops: Stop[]; stretches: Stretch[]; nowX: number; now: Stretch["key"]; line: string; zone: string; assumed: boolean } {
  const night = n ?? DEFAULT_NIGHT;
  const h = minsOf(night.handIn);
  const frac = (m: number) => ((((m - h) % 1440) + 1440) % 1440) / 1440;   // the true place in the turn
  const real = [0, frac(minsOf(night.review)), frac(minsOf(night.until)), frac(minsOf(night.release)), 1];
  const drawn = [0, SHARES[0], SHARES[0] + SHARES[1], SHARES[0] + SHARES[1] + SHARES[2], 1];
  const keys = ["handed", "review", "release", "day"] as const;
  const words = ["handed in, waiting", "dev night, fixes", "the release is made", "the day"];
  const stretches: Stretch[] = keys.map((key, i) => ({ key, word: words[i], from: drawn[i], to: drawn[i + 1] }));
  const stops: Stop[] = [
    { key: "handIn", time: ampm(night.handIn), word: "hand in", x: drawn[0] },
    { key: "review", time: ampm(night.review), word: "dev night", x: drawn[1] },
    { key: "until", time: ampm(night.until), word: "fixes end", x: drawn[2] },
    { key: "release", time: ampm(night.release), word: "release", x: drawn[3] },
  ];
  const f = frac(minutesIn(now, night.zone));
  let i = real.findIndex((r, k) => k < 4 && f >= r && f < real[k + 1]);
  if (i < 0) i = 3;
  const span = real[i + 1] - real[i];
  const nowX = drawn[i] + (span > 0 ? (f - real[i]) / span : 0) * (drawn[i + 1] - drawn[i]);
  const at = stretches[i];
  const line = at.key === "handed" ? `handed in: the review opens at ${ampm(night.review)}`
    : at.key === "review" ? `the dev night is on: taken in or sent back, fixes until ${ampm(night.until)}`
    : at.key === "release" ? `the release comes out at ${ampm(night.release)}`
    : `the day: hand in by ${ampm(night.handIn)}`;
  return { stops, stretches, nowX, now: at.key, line, zone: night.zone, assumed: !n };
}
/** who reviews tonight and who backs up (pure, #478): "dev marco, backup frank from 11pm · beta frank, backup marco
 *  from 11pm"; "" when the engine does not say */
export function whoTonight(n: Night | undefined): string {
  if (!n?.dev && !n?.beta) return "";
  const one = (word: string, who: string[] = [], backup: string[] = []) =>
    `${word} ${who.join(" or ") || "nobody"}${backup.length ? `, backup ${backup.join(" or ")} from ${ampm(n.handover || "23:00")}` : ""}`;
  return [one("dev", n.dev, n.devBackup), one("beta", n.beta, n.betaBackup)].join(" · ");
}
/** "New York time" for a zone, "" for this Mac's own (pure) */
export const zoneWords = (zone: string) => (zone ? `${zone.split("/").pop()!.replace(/_/g, " ")} time` : "");
/** what sits at each step of the night (pure): handed in and waiting, in since the last release, sent back severe
 *  in the last day, the latest release and who runs it */
export function nightItems(t: Timeline, now: Date): Record<Stop["key"], { count: string; names: string[] }> {
  const next = t.releases.find((r) => r.kind === "next");
  const latest = t.releases.filter((r) => r.kind !== "next").pop();
  const day = now.getTime() - 86_400_000;
  const severe = t.sides.filter((s) => s.kind === "severe" && (Date.parse(s.at) || 0) >= day);
  const runs = latest ? t.people.filter((p) => p.on === latest.tag) : [];
  const n = (k: number, one: string, many: string) => (k === 1 ? `1 ${one}` : `${k || "no"} ${many}`);
  const pr = (x: { number?: number; title: string }) => `${x.number ? `#${x.number} ` : ""}${x.title}`;
  return {
    handIn: { count: n(t.waiting.length, "change waiting", "changes waiting"), names: t.waiting.slice(0, 2).map(pr) },
    review: { count: next?.changes.length ? `${next.changes.length} in since the release` : "nothing in since the release", names: (next?.changes ?? []).slice(-2).map(pr) },
    until: { count: severe.length ? `${severe.length} sent back severe` : "nothing sent back severe", names: severe.slice(0, 2).map(pr) },
    release: { count: latest ? `latest ${shortName(latest)}` : "no release yet", names: latest ? [runs.length ? `runs it: ${runs.map((p) => (p.you ? "you" : p.login)).join(", ")}` : "nobody runs it now"] : [] },
  };
}
