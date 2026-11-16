// Cowork v3, slice 3 (fr-30, #556): Running. One now-line, read left to right: what is red (with its one press), what
// runs now, and the next moment of the project's rhythm. In SOL's own project the dev face adds four things beside it,
// drafts, reads, versions and the nights, each with today's presses. Nothing here presses anything and no press is new:
// every press names the handler that already does it today (wire.ts's team.* cases, the review card's own verdicts
// through Sol's window, the review opener), and the face calls exactly that. This file only reads.
import { abilities, type Role } from "./people.js";

export type Red = { title: string; whose: string; place: string; line: string; at?: string };
export type Run = { title: string; whose: string; agent?: boolean; place?: string; line?: string; paused?: boolean };
export type Rhythm = { handIn?: string; review?: string; release?: string; zone?: string; dev?: string[]; devBackup?: string[] };
export type Press = {
  label: string;
  /** the handler it calls, as today: a team.* wire case, or "review-card" (the verdict on the open review session's card,
   *  whose key only Sol's own window gets), or "review-open" (the opener the night's timer uses, wire.ts tonightNow) */
  via: string;
  body?: Record<string, unknown>;
};
export type NowLine = {
  red: (Red & { press: Press | null })[];
  running: (Run & { press: Press | null })[];
  next: { label: string; at: string; inMinutes: number; whose: string; place: string; line: string } | null;
};

const HHMM = /^(\d{1,2}):(\d{2})$/;
/** minutes past midnight in a time zone (pure) */
export function minutesIn(now: Date, zone?: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone || undefined, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value), m = Number(parts.find((p) => p.type === "minute")?.value);
    if (Number.isFinite(h) && Number.isFinite(m)) return h * 60 + m;
  } catch { /* an unknown zone: the machine's clock */ }
  return now.getHours() * 60 + now.getMinutes();
}
const mins = (t?: string) => { const m = HHMM.exec(String(t ?? "").trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

/** the next moment of the rhythm after now (pure): the hand-in, the review or the release, whichever comes first */
export function nextMoment(r: Rhythm | null | undefined, now: Date): NowLine["next"] {
  if (!r) return null;
  const at = minutesIn(now, r.zone);
  const reviewer = r.dev?.[0] ?? "";
  const moments = ([
    ["Hand-in", r.handIn, reviewer, "record", "what is ready goes into the night"],
    ["Reviews", r.review, reviewer, "calendar", `${reviewer || "the reviewer"} reviews${r.devBackup?.[0] ? `, ${r.devBackup[0]} is backup` : ""}`],
    ["Release", r.release, reviewer, "github", "the night’s work goes out as dev"],
  ] as const).flatMap(([label, t, whose, place, line]) => { const m = mins(t); return m === null ? [] : [{ label, at: t!, inMinutes: (m - at + 1440) % 1440 || 1440, whose, place, line }]; });
  return moments.sort((a, b) => a.inMinutes - b.inMinutes)[0] ?? null;
}

/** E10: the now-line. A guest sees it run; the presses are the members' (F5) */
export function nowLine(a: { reds: Red[]; runs: Run[]; rhythm: Rhythm | null; now: Date; role: Role | null }): NowLine {
  const may = abilities(a.role).presses;
  return {
    red: a.reds.map((r) => ({ ...r, press: may ? { label: r.place === "chat" ? "Grant it again" : "Sign in again", via: "place.signin", body: { place: r.place } } : null })),
    running: a.runs.map((r) => ({ ...r, press: null })),   // pause and resume belong to the automations room (slice 6)
    next: nextMoment(a.rhythm, a.now),
  };
}

// ---------------------------------------------------------------- the dev face
export type PrLike = { repo: string; number: number; title: string; draft: boolean; state: string; author: string; agent?: boolean; url: string; mark?: string; head?: string };
export type ReleaseLike = { tag: string; at: string; kind: string; beta?: boolean; latest?: true; changes?: { number: number }[] };
export type PlacedLike = { login: string; on: string | null; behind: number };
export type WaitingLike = { number: number; title: string; author?: string; url?: string; at?: string };
export type DevCard = { number: number; title: string; author: string; url: string; mark?: string; presses: Press[] };
export type DevFace = {
  repo: string; reviewer: boolean;
  drafts: DevCard[];
  reads: DevCard[];
  versions: { releases: { tag: string; at: string; kind: string; beta: boolean; changes: number }[]; people: PlacedLike[] };
  night: { handIn?: string; review?: string; release?: string; reviewers: string[]; backups: string[]; handedIn: number; presses: Press[] };
};
/** SOL's own project: the dev bundle is a module, never the default; today it is on for the repository Sol is built in */
export const isDevProject = (repos: string[], modules: string[] = []) => modules.includes("dev") || repos.some((r) => /(^|\/)sol-dev$/i.test(r));
export const URGENT_WORDS = "**Urgent OK** from Running: it may go out off-cycle today.";

/** E10: drafts, reads, versions and the night, each card with today's presses, for the person looking (pure) */
export function devFace(a: { repo: string; me: string; role: Role | null; prs: PrLike[]; waiting: WaitingLike[]; releases: ReleaseLike[]; people: PlacedLike[]; rhythm: Rhythm | null; reviewOpen?: string | null }): DevFace {
  const may = abilities(a.role).presses;
  const lower = (xs?: string[]) => (xs ?? []).map((x) => x.toLowerCase());
  const reviewer = may && [...lower(a.rhythm?.dev), ...lower(a.rhythm?.devBackup)].includes(a.me.toLowerCase());
  const tryIt = (n: number): Press => ({ label: "Try it", via: "team.try", body: { repo: a.repo, pr: n } });
  const urgent = (n: number): Press => ({ label: "Urgent", via: "team.pr.comment", body: { repo: a.repo, pr: n, body: URGENT_WORDS } });
  const verdict = (label: string, v: string, n: number): Press => ({ label, via: "review-card", body: { verdict: v, number: n, ...(a.reviewOpen ? { sessionId: a.reviewOpen } : {}) } });
  const into = `Into ${a.repo.split("/").pop() || "main"}`;
  const open = a.prs.filter((p) => p.state === "open" && p.repo.toLowerCase() === a.repo.toLowerCase());
  const drafts = open.filter((p) => p.draft).map((p): DevCard => ({ number: p.number, title: p.title, author: p.author, url: p.url, ...(p.mark ? { mark: p.mark } : {}),
    presses: may ? [tryIt(p.number), ...(reviewer ? [urgent(p.number)] : [])] : [] }));
  const reads = a.waiting.map((w): DevCard => ({ number: w.number, title: w.title, author: w.author ?? "", url: w.url ?? "",
    presses: !may ? [] : [tryIt(w.number), ...(reviewer && a.reviewOpen ? [verdict(into, "fold", w.number), verdict("Send back", "slight", w.number)] : []), ...(reviewer ? [urgent(w.number)] : [])] }));
  return {
    repo: a.repo, reviewer,
    drafts, reads,
    versions: { releases: a.releases.slice(0, 6).map((r) => ({ tag: r.tag, at: r.at, kind: r.kind, beta: !!r.beta, changes: r.changes?.length ?? 0 })), people: a.people },
    night: { handIn: a.rhythm?.handIn, review: a.rhythm?.review, release: a.rhythm?.release, reviewers: a.rhythm?.dev ?? [], backups: a.rhythm?.devBackup ?? [], handedIn: a.waiting.length,
      presses: reviewer && !a.reviewOpen && a.waiting.length ? [{ label: "Start the review", via: "review-open", body: { repo: a.repo } }] : [] },
  };
}

export type RunningAnswer = { project: string; role: Role | null; line: NowLine; dev: DevFace | null };
