// People (#1297): the definitive state by person. One read, GET /team/people (parts/people.ts): per person, what they
// hold, what waits on them, what their agent has in flight, and what landed for them today. Proposed on #1297 to
// Frank's agent before it was built.
//
//   who      the three: `.sol/rhythm.json` dev + beta, and the leads `.github/CODEOWNERS` names (path lines, `# leads:`)
//   holds    the one issue they hold (#1297, decided by the lead on Frank's proposal): the `now` issue a live Work
//            run's branch names on their Sol (work/runs.ts `issue`, set by issueAt), known only for the reader's own
//            Sol; else the most recently updated `now` issue given to them; else none
//   open     every other open issue given to them: a count, the titles on opening
//   minutes  coordination minutes, { today, week }: the reader's own only (parts/people.ts counts them), null for others
//   waits    review    an open PR, not a draft, that asks their review
//            decision  an open `decision` issue of an area they lead (CODEOWNERS), given to nobody or to them
//            ask       an ask to them in reach's thread with no answer or refusal yet (their agent answers it)
//            hand      a hand-over to them, open (reach's holdsOf)
//            offer     an offer to take their issue, open
//   agent    building  the issue they hold, while no open PR of theirs names it yet
//            pr        an open PR by them (their agent opens PRs as them)
//            answering an ask to them their agent has not answered yet
//   landed   a PR of theirs merged today, an issue given to them closed today (the team's day, the rhythm's zone)
//
// Everything here is pure; parts/people.ts reads GitHub (the engine's runGh) and reach's thread and keeps the answer.
import type { Entry, Held as ReachHeld } from "./reach.js";
import { tableOf } from "./codeowners.js";

export type GhLabel = { name: string };
export type GhIssue = { number: number; title: string; url?: string; assignees?: { login: string }[]; labels?: GhLabel[]; createdAt?: string; updatedAt?: string; closedAt?: string };
export type GhPr = { number: number; title: string; url?: string; body?: string; author?: { login?: string }; isDraft?: boolean; createdAt?: string; mergedAt?: string; reviewRequests?: { login?: string }[]; headRefName?: string };

export type Hold = { n: number; title: string; url?: string; kind: string; area: string; since: number; now?: true };
export type WaitWhy = "review" | "decision" | "ask" | "hand" | "offer";
export type Wait = { n?: number; id?: string; title: string; url?: string; why: WaitWhy; since: number; from: string };
export type Flight = { n?: number; title: string; url?: string; state: "building" | "pr" | "answering"; since: number };
export type Landed = { n?: number; pr?: number; title: string; url?: string; when: number };
/** coordination minutes (#1297): counted on the reader's own Sol only; null is "not counted", never 0 */
export type Minutes = { today: number | null; week: number | null };
export const NO_MINUTES: Minutes = { today: null, week: null };
export type PersonRead = { login: string; name: string; holds: Hold | null; open: Hold[]; waits: Wait[]; agent: { inFlight: Flight[] }; landed: Landed[]; minutes: Minutes };
/** `at` is when GitHub was read; `failed` is set when a newer read failed and this is the last good one (keeper) */
export type PeopleRead = { at: number; me: string; tools: boolean; repo: string; people: PersonRead[]; failed?: string };

/** every open issue, not the newest few: `gh issue list` pages by itself up to its --limit and gives the newest first,
 *  so a limit under the count drops the oldest without a word (457 open on 2026-11-16) and the oldest are exactly the
 *  held and neglected work. Far above the count */
export const EVERY = 5000;
/** the arguments of a read of every open issue with these fields (pure) */
export const openIssues = (fields: string) => ["issue", "list", "--state", "open", "--json", fields, "--limit", String(EVERY)];

/** the area and kind labels, as .github/labels.json groups them */
export const AREAS = ["base", "life", "work", "cowork", "social", "product", "marketing", "sales"];
export const KINDS = ["bug", "feature", "decision", "chore"];

const low = (s: string) => s.toLowerCase();
const same = (a: string, b: string) => low(a) === low(b);
const t = (s?: string) => { const n = Date.parse(s ?? ""); return Number.isFinite(n) ? n : 0; };
const names = (i: GhIssue) => (i.labels ?? []).map((l) => l.name);
const given = (i: GhIssue, login: string) => (i.assignees ?? []).some((a) => same(a.login, login));
/** a title as a person reads it: no "area: " lead, no trailing period */
export const titleOf = (s: string) => s.replace(/^\s*(?:[a-z][a-z ·-]{1,24}:\s+)+/, "").replace(/[\s.]+$/, "").trim() || s;

/** a PR names issue `n` (pure): `#n` in its title or body ("12 files" names nothing), or its branch ends in `-n` (the
 *  team's `<you>/<label>-<what>-<issue>`, as team/show.ts issueOfBranch reads it) */
export const namesIssue = (p: Pick<GhPr, "title" | "body" | "headRefName">, n: number) =>
  new RegExp(`#${n}(?!\\d)`).test(`${p.title} ${p.body ?? ""}`) || new RegExp(`-${n}$`).test(p.headRefName ?? "");

/** who the read is about (pure): the rhythm's dev and beta, then CODEOWNERS' leads, each once, in that order */
export function whoOf(rhythm: { dev?: string[]; beta?: string[] } | null, codeowners: string): string[] {
  const out: string[] = [];
  const add = (l: unknown) => { if (typeof l === "string" && /^[A-Za-z0-9-]{1,39}$/.test(l) && !out.some((x) => same(x, l))) out.push(l); };
  for (const l of [...(rhythm?.dev ?? []), ...(rhythm?.beta ?? [])]) add(l);
  for (const leads of Object.values(tableOf(codeowners))) for (const l of leads) add(l);
  return out;
}

/** the start of today in a time zone, as epoch ms (pure): the team's day, not this machine's */
export function dayStart(now: number, zone: string): number {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(now)).map((p) => [p.type, p.value]));
    const into = (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000;
    return now - into - (now % 1000);
  } catch { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); }
}

export type Sources = {
  logins: string[];
  names?: Record<string, string>;
  me: string;
  tools: boolean;
  codeowners: string;
  open: GhIssue[];        // open issues
  prs: GhPr[];            // open PRs
  merged: GhPr[];         // PRs merged lately (today's are kept)
  closed: GhIssue[];      // issues closed lately (today's are kept)
  thread: Entry[];        // reach's thread
  holds: ReachHeld[];     // reach's holdsOf(thread)
  running?: number[];     // the issues this Sol's live Work runs' branches name, the one at work first (the reader's own)
  today: number;          // the start of the team's day
  now: number;
};

/** the read (pure): one card a person, the person whose Sol it is first, then the others by name */
export function peopleRead(s: Sources): PeopleRead {
  const leads = tableOf(s.codeowners);
  const leadOf = (login: string) => Object.entries(leads).filter(([, l]) => l.some((x) => same(x, login))).map(([a]) => a);
  const answered = new Set(s.thread.filter((e) => e.type === "answer" || e.type === "refused").map((e) => (e as { re: string }).re));
  const openAsks = s.thread.filter((e): e is Extract<Entry, { type: "ask" }> => e.type === "ask" && !answered.has(e.id));
  const decisions = s.open.filter((i) => names(i).includes("decision"));
  const nameOf = (l: string) => s.names?.[low(l)] ?? l;
  // the repository's page, from any URL GitHub gave: a hand or an offer names an issue with no URL of its own
  const repo = [...s.open, ...s.prs, ...s.merged, ...s.closed].map((x) => /^(https:\/\/github\.com\/[^/]+\/[^/]+)\//.exec(x.url ?? "")?.[1]).find(Boolean) ?? "";
  const link = (u?: string) => (u ? { url: u } : {});
  const issueUrl = (n?: number) => link(n && repo ? `${repo}/issues/${n}` : undefined);
  const byNewest = <T,>(f: (x: T) => number) => (a: T, b: T) => f(b) - f(a);

  const people = s.logins.map((login): PersonRead => {
    const theirIssues = s.open.filter((i) => given(i, login));
    const nows = theirIssues.filter((i) => names(i).includes("now"));
    const run = same(login, s.me) ? (s.running ?? []).map((n) => nows.find((i) => i.number === n)).find(Boolean) : undefined;
    const held = run ?? [...nows].sort(byNewest((i: GhIssue) => t(i.updatedAt)))[0];
    const hold = (i: GhIssue): Hold => {
      const l = names(i);
      return { n: i.number, title: titleOf(i.title), ...link(i.url), kind: l.find((x) => KINDS.includes(x)) ?? "", area: l.find((x) => AREAS.includes(x)) ?? "",
        since: t(i.createdAt), ...(l.includes("now") ? { now: true as const } : {}) };
    };
    const holds = held ? hold(held) : null;
    const open = theirIssues.filter((i) => i !== held).map(hold).sort(byNewest((h) => h.since));

    const mine = leadOf(login);
    const waits: Wait[] = [
      ...s.prs.filter((p) => !p.isDraft && (p.reviewRequests ?? []).some((r) => same(r.login ?? "", login)))
        .map((p) => ({ n: p.number, title: titleOf(p.title), ...link(p.url), why: "review" as const, since: t(p.createdAt), from: p.author?.login ?? "" })),
      ...decisions.filter((i) => names(i).some((a) => mine.includes(a)) && (!(i.assignees ?? []).length || given(i, login)))
        .map((i) => ({ n: i.number, title: titleOf(i.title), ...link(i.url), why: "decision" as const, since: t(i.createdAt), from: "" })),
      ...openAsks.filter((a) => same(a.to, login))
        .map((a) => ({ id: a.id, title: a.question.split("\n")[0].slice(0, 140), why: "ask" as const, since: a.at, from: a.from })),
      ...s.holds.filter((h) => h.state === "open" && same(h.to, login))
        .map((h) => ({ id: h.id, ...(h.issue ? { n: h.issue, ...issueUrl(h.issue) } : {}), title: h.what.split("\n")[0].slice(0, 140), why: h.kind, since: h.at, from: h.from })),
    ].sort(byNewest((w) => w.since));

    const theirs = s.prs.filter((p) => same(p.author?.login ?? "", login));
    const named = (n: number) => theirs.some((p) => namesIssue(p, n));
    const inFlight: Flight[] = [
      ...theirs.map((p) => ({ n: p.number, title: titleOf(p.title), ...link(p.url), state: "pr" as const, since: t(p.createdAt) })),
      ...(holds && !named(holds.n) ? [holds] : []).map((h) => ({ n: h.n, title: h.title, ...link(h.url), state: "building" as const, since: h.since })),
      ...openAsks.filter((a) => same(a.to, login)).map((a) => ({ title: `answering ${nameOf(a.from)}: ${a.question.split("\n")[0].slice(0, 100)}`, state: "answering" as const, since: a.at })),
    ].sort(byNewest((f) => f.since));

    const landed: Landed[] = [
      ...s.merged.filter((p) => same(p.author?.login ?? "", login) && t(p.mergedAt) >= s.today).map((p) => ({ pr: p.number, title: titleOf(p.title), ...link(p.url), when: t(p.mergedAt) })),
      ...s.closed.filter((i) => given(i, login) && t(i.closedAt) >= s.today).map((i) => ({ n: i.number, title: titleOf(i.title), ...link(i.url), when: t(i.closedAt) })),
    ].sort(byNewest((x) => x.when));

    return { login, name: nameOf(login), holds, open, waits, agent: { inFlight }, landed, minutes: NO_MINUTES };
  });
  people.sort((a, b) => (same(b.login, s.me) ? 1 : 0) - (same(a.login, s.me) ? 1 : 0) || a.name.localeCompare(b.name));
  return { at: s.now, me: s.me, tools: s.tools, repo, people };
}

/** the read kept (#1297): served while it is under `keep` old and no drop came since it was asked. A drop during a read
 *  in flight is not lost: each drop bumps a generation and a read stands only for the generation it began in, so the
 *  next ask reads again. A read that fails gives the last good one, its own `at`, `failed` the reason (as
 *  team/timeline.ts worse() keeps the last good line); with none kept, the failure is the answer. One read at a time
 *  per generation */
export function keeper(fresh: () => Promise<PeopleRead>, o: { keep: number; now?: () => number }) {
  const now = o.now ?? Date.now;
  let good: PeopleRead | null = null, goodGen = -1, gen = 0;
  let asking: { gen: number; p: Promise<PeopleRead> } | null = null;
  const said = (err: unknown) => (err instanceof Error ? err.message.split("\n")[0] : String(err));
  const read = (): Promise<PeopleRead> => {
    if (good && goodGen === gen && now() - good.at < o.keep) return Promise.resolve(good);
    if (asking && asking.gen === gen) return asking.p;
    const g = gen;
    const p: Promise<PeopleRead> = fresh()
      .then((r) => { if (g >= goodGen) { good = r; goodGen = g; } return r; },
        (err) => { if (!good) throw err; return { ...good, failed: said(err) }; })
      .finally(() => { if (asking?.p === p) asking = null; });
    asking = { gen: g, p };
    return p;
  };
  return { read, drop: () => { gen++; } };
}

/** Coordination minutes (#1297, counted as Frank's agent laid out on #1297): the reader's own, on their own Sol. A Work
 *  turn counts when the issue its run's branch names has people given to it and the reader is none of them: the
 *  turn's span, as distinct minutes (two runs at once count a minute once), kept per team day in a small file in the
 *  engine's home folder. Minutes with Cowork's tab open are not counted: track.ts keeps no tab or view event and its
 *  presence heartbeat is never recorded, so there is nothing to count them from today. Others' minutes are on their own
 *  Macs only: null here, never 0. */
export type MinutesKept = { days: Record<string, number[]> };   // a team day (YYYY-MM-DD) → its distinct minutes (epoch minute)
export const MINUTE = 60_000;
/** the longest one turn may add: a turn whose start was lost (a sleep, a stuck run) never fills a day */
export const TURN_MAX = 4 * 60 * MINUTE;
/** days kept in the file: the week and one more */
export const DAYS_KEPT = 8;

/** the team day a moment falls in, YYYY-MM-DD in the rhythm's zone (pure) */
export function dayKey(at: number, zone: string): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at)); }
  catch { return new Date(at).toISOString().slice(0, 10); }
}

/** whether a turn on this issue is coordination for me (pure): it has people, and I am not one of them */
export const othersIssue = (assignees: string[], me: string) => !!me && assignees.length > 0 && !assignees.some((a) => same(a, me));

/** the kept minutes with one turn's span added (pure): each minute it touched, once, in its team day; the oldest days
 *  past DAYS_KEPT dropped */
export function addSpan(k: MinutesKept, from: number, to: number, zone: string): MinutesKept {
  if (!(from > 0) || !(to >= from)) return k;
  from = Math.max(from, to - TURN_MAX);
  const days: Record<string, number[]> = Object.fromEntries(Object.entries(k.days ?? {}).map(([d, l]) => [d, [...l]]));
  for (let m = Math.floor(from / MINUTE); m <= Math.floor(to / MINUTE); m++) {
    const d = dayKey(m * MINUTE, zone);
    const l = (days[d] ??= []);
    if (!l.includes(m)) l.push(m);
  }
  const keep = Object.keys(days).sort().slice(-DAYS_KEPT);
  return { days: Object.fromEntries(keep.map((d) => [d, days[d]])) };
}

/** today's and the week's minutes (pure): the week is today and the six team days before it */
export function minutesOf(k: MinutesKept | null, now: number, zone: string): Minutes {
  const n = (d: string) => k?.days?.[d]?.length ?? 0;
  const week = new Set(Array.from({ length: 7 }, (_, i) => dayKey(now - i * 86_400_000, zone)));
  return { today: n(dayKey(now, zone)), week: [...week].reduce((s, d) => s + n(d), 0) };
}
