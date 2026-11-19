// Releases (#1299): the engine's read (engine/src/team/releases.ts, team.releases) said for a person. Pure, so the
// Mac's tests read it (src/releases.test.ts); Releases.tsx draws it.

export type Channel = "dev" | "beta" | "stable";
export type ReleasePr = { n: number; title: string; issue?: number; by: string; agentOf?: string };
export type Knot = { what: string; where: string; severity: string };
/** a person against main (timeline.ts placePeople, from what their Sol says it runs): the release they are on ("main" past
 *  the last release), how many releases came after it; null both when their Sol has not said */
export type Behind = { login: string; name: string; on: string | null; releases: number | null; prs: { n: number; title: string }[] };
export type Waits = { press: "beta"; who: string[] } | { held: true };
export type ReleaseRow = { tag: string; when: string; by: string; channel: Channel; prs: ReleasePr[]; knots: Knot[]; behind: Behind[]; next?: true; latest?: true; waits?: Waits };
export type Decision = { issue: number; title: string; when: string; saidBy: string; signedBy: string; agent?: true; session?: string; words: string; proof?: { url: string } };
export type ReleasesRead = { at: string; me?: string; releases: ReleaseRow[]; decisions: Decision[]; repo?: string; error?: string };

/** the engine's answer, or null when it is not one (pure) */
export function releasesOf(m: any): ReleasesRead | null {
  if (!m || typeof m !== "object" || !Array.isArray(m.releases)) return null;
  return { at: String(m.at ?? ""), ...(m.me ? { me: String(m.me) } : {}), releases: m.releases, decisions: Array.isArray(m.decisions) ? m.decisions : [], ...(m.error ? { error: String(m.error) } : {}) };
}

const ms = (s: string) => Date.parse(s) || 0;
const same = (a = "", b = "") => a.toLowerCase() === b.toLowerCase();

/** the line, newest first: each release, and each decision between the releases it was said between (pure) */
export type Item = { k: "release"; r: ReleaseRow } | { k: "decision"; d: Decision };
export function lineOf(read: ReleasesRead): Item[] {
  const items: Item[] = [...read.releases.map((r) => ({ k: "release" as const, r })), ...read.decisions.map((d) => ({ k: "decision" as const, d }))];
  // main past the release stays on top; the rest by time, a decision above the release it came after
  const at = (i: Item) => (i.k === "release" ? (i.r.next ? Infinity : ms(i.r.when)) : ms(i.d.when));
  return items.sort((a, b) => at(b) - at(a));
}

/** a release's PRs by person, the person with the most first, then by login (pure) */
export function byPerson(prs: ReleasePr[]): { by: string; prs: ReleasePr[] }[] {
  const m = new Map<string, ReleasePr[]>();
  for (const p of prs) { const k = p.by || "unknown"; m.set(k, [...(m.get(k) ?? []), p]); }
  return [...m.entries()].map(([by, prs]) => ({ by, prs })).sort((a, b) => b.prs.length - a.prs.length || a.by.localeCompare(b.by));
}

/** how a person stands against main, in a few words (pure) */
export function behindWords(b: Behind): string {
  if (b.releases === null || !b.on) return "not known: their Sol has not said what it runs";
  if (b.on === "main") return "on main, past the newest release";
  if (b.releases === 0) return "up to date: on the newest release";
  return `${b.releases} ${b.releases === 1 ? "release" : "releases"} behind (on ${b.on})`;
}

/** the one line on top: which release I am on and whether I am behind, read in under five seconds (pure) */
export function standing(read: ReleasesRead): { on: string; behind: string; late: boolean } {
  const latest = read.releases.find((r) => r.latest);
  const me = latest?.behind.find((b) => same(b.login, read.me));
  const on = me?.on ?? latest?.tag ?? "no release yet";
  if (!me) return { on, behind: read.me ? "this Sol does not know where you stand" : "", late: false };
  return { on, behind: behindWords(me), late: (me.releases ?? 0) > 0 };
}

/** the channel in words, for a title (pure) */
export const channelWords = (c: Channel) => (c === "dev" ? "dev: the team's" : c === "beta" ? "beta: passed by the beta reviewer" : "stable: stamped");

/** a moment as people say it: today 9:00, yesterday 21:30, Mon 14 9:00 (pure) */
export function when(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (!ms(iso)) return "";
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const gap = Math.round((day(now) - day(d)) / 86_400_000);
  if (gap === 0) return `today ${hm}`;
  if (gap === 1) return `yesterday ${hm}`;
  return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getDate()} ${hm}`;
}

/** what a press card says for a release that waits (pure); null when it waits on nothing */
export function pressOf(r: ReleaseRow, me = ""): { title: string; body: string; who: string; why: string } | null {
  const w = r.waits;
  if (!w || "held" in w) return null;
  const mine = w.who.some((x) => same(x, me));
  return {
    title: `${r.tag} waits on the beta pass: into beta?`,
    body: `${r.prs.length} ${r.prs.length === 1 ? "change" : "changes"} joined${r.knots.length ? `, ${r.knots.length} ${r.knots.length === 1 ? "knot" : "knots"}` : ", no knots"}. Yes passes it to beta, no holds it, later asks again at the night.`,
    who: w.who.join(", "),
    // the press lives in the reviewer's review session (tonight.ts, the card's key), never on this page
    why: mine ? "press it in your review session, where its card is" : `the beta pass is ${w.who.join(" or ")}'s press, in their review session`,
  };
}
