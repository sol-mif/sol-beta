// The per-tester list (#1355, for Isaac's console, #134): a team tool beside analytics.ts that reads Sol's cloud's
// GET /relay/track/testers with this Sol's own ticket there: one row a tester, who the code is (the Sol name and the
// Mac's user, and since #1607 the email of the Google account it signed in with, read from Supabase), the days it posted, the day of its first post (the counting card's OK, #501), its version and whether
// that is the newest beta, and the last 7 days as counts (turns by seat and mode, faces, breakage, the other tools'
// files). It keeps only the numbers and words it expects from the answer. The same two gates as analytics: the
// project's members, strict (`people: true`), and the cloud's, a ticket whose Sol name is in SOL_TRACK_READERS. The
// columns not counted yet (the tester's own name and the Research Partner answer, #1225; the brief's and the
// onboardings' steps) come through as null. It writes nothing, and nothing of it goes into the repository.
import { defineTool, type ReaderCtx } from "./teamtool.js";
import { releaseOfCommit, type Release } from "./timeline.js";
import { refusalOf, CACHE_MS } from "./analytics.js";

const WORD = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TESTER = /^t_[a-z0-9]{10}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,189}$/;   // the email the tester signed in with (#1607), as the cloud read it from Supabase
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const word = (v: unknown) => (typeof v === "string" && WORD.test(v) ? v : "");
const day = (v: unknown) => (typeof v === "string" && DAY.test(v) ? v : null);
const counts = <K extends string>(v: unknown, keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, n(isObj(v) ? v[k] : 0)])) as Record<K, number>;

const CLAUDE = ["prompts", "sessions", "input", "output", "cache_read", "cache_write"] as const;
const CODEX = ["sessions", "input", "output", "cache_read"] as const;
const PLAN = ["claude", "claude_rate", "codex", "codex_mode"] as const;

export type Tester = {
  tester: string; who: string; user: string;
  email: string | null;     // the Google account the tester signed in with (#1607); null until they did, or when the cloud reads its own track.db
  firstDay: string | null; lastDay: string | null; days: number; agreed: string | null;
  sol: string;
  release: string;          // the release its version came out in ("main" past the last one, "" a build of its own)
  latestBeta: boolean;      // on the newest release that reached beta, or newer (a later dev release, main past the last)
  name: null; partner: null; steps: null;
  week: {
    turns: number; seat: Record<"claude" | "codex" | "none", number>; mode: Record<"home" | "work" | "cowork", number>;
    face: Record<"window" | "notch" | "phone", number>; errors: number; faceBroken: number;
    claude: Record<string, Record<(typeof CLAUDE)[number], number>>; codex: Record<(typeof CODEX)[number], number>;
  };
  plan: Partial<Record<(typeof PLAN)[number], string>> | null;
  apps: Record<string, boolean> | null;
};
export type Testers = { days: number; beta: string; total: number; testers: Tester[]; read: string; note?: string };   // total: how many the cloud knows

/** one row of the cloud's answer kept to what the console shows (pure); null when it is not a tester's row */
export function cleanTester(r: unknown): Omit<Tester, "release" | "latestBeta"> | null {
  if (!isObj(r) || typeof r.tester !== "string" || !TESTER.test(r.tester)) return null;
  const w = isObj(r.week) ? r.week : {};
  const claude: Tester["week"]["claude"] = {};
  if (isObj(w.claude)) for (const [via, c] of Object.entries(w.claude).slice(0, 8)) if (WORD.test(via)) claude[via] = counts(c, CLAUDE);
  const plan = isObj(r.plan) ? Object.fromEntries(PLAN.filter((k) => word(r.plan && (r.plan as Record<string, unknown>)[k])).map((k) => [k, (r.plan as Record<string, string>)[k]])) : null;
  const apps = isObj(r.apps) ? Object.fromEntries(Object.entries(r.apps).filter(([k, v]) => WORD.test(k) && typeof v === "boolean").slice(0, 16)) as Record<string, boolean> : null;
  return {
    tester: r.tester, who: word(r.who), user: word(r.user), email: typeof r.email === "string" && EMAIL.test(r.email) ? r.email : null,
    firstDay: day(r.firstDay), lastDay: day(r.lastDay), days: n(r.days), agreed: day(r.agreed),
    sol: word(r.sol),
    name: null, partner: null, steps: null,
    week: {
      turns: n(w.turns), seat: counts(w.seat, ["claude", "codex", "none"] as const), mode: counts(w.mode, ["home", "work", "cowork"] as const),
      face: counts(w.face, ["window", "notch", "phone"] as const), errors: n(w.errors), faceBroken: n(w.faceBroken),
      claude, codex: counts(w.codex, CODEX),
    },
    plan, apps,
  };
}

/** the console's rows, each version placed on the timeline's releases (pure): the newest beta is the newest release
 *  that reached beta; a tester is up to date when their version came out in it or later (the releases are oldest first) */
export function testersOf(body: unknown, line: { releases: Pick<Release, "tag" | "sha" | "kind" | "beta">[]; spots: Record<string, string> } | null, readAt: Date): Testers | null {
  if (!isObj(body) || !Array.isArray(body.testers)) return null;
  const rel = (line?.releases ?? []).filter((r) => r.kind !== "next");
  const betaAt = rel.map((r) => r.beta).lastIndexOf(true), beta = betaAt < 0 ? "" : rel[betaAt].tag;
  const testers = body.testers.slice(0, 1000).flatMap((r): Tester[] => {
    const t = cleanTester(r);
    if (!t) return [];
    const release = line && t.sol ? releaseOfCommit(t.sol, rel, line.spots) ?? "" : "";
    const at = release === "main" ? rel.length : rel.findIndex((r) => r.tag === release);
    return [{ ...t, release, latestBeta: !!beta && at >= betaAt }];
  });
  const total = Math.max(n(body.total), testers.length);
  // the cloud's own word on where the rows came from (#1555: read from Supabase, what it does not keep), kept as plain words
  const said = typeof body.note === "string" && /^[\w .,;:'()\-]{1,300}$/.test(body.note) ? body.note : "";
  // the cloud sends the newest 1000 at most: a cut is said, never silent
  const cut = total > testers.length ? `the newest ${testers.length} of ${total} testers: the rest are not shown` : "";
  const note = [said, cut].filter(Boolean).join("; ");
  return { days: Math.max(1, Math.min(120, n(body.days) || 7)), beta, total, testers, read: readAt.toISOString(), ...(note ? { note } : {}) };
}

export type TestersDeps = {
  /** my ticket on Sol's cloud, "" when there is none */
  ticket: () => Promise<string>;
  /** GET <cloud>/relay/track/testers with that ticket: its status and JSON body; status 0 when it did not answer */
  testers: (ticket: string) => Promise<{ status: number; body: unknown }>;
  /** the timeline's releases and spots, or null when they cannot be read (the rows still come, unplaced) */
  releases: () => Promise<{ releases: Release[]; spots: Record<string, string>; error?: string } | null>;
  now?: () => Date;
};

/** the tool's reader, wired once (wire.ts). Kept two minutes, past the gate only, for the same ticket only (as analytics) */
export function useTesters(d: TestersDeps) {
  let kept: { at: number; ticket: string; data: Testers } | null = null;
  const now = d.now ?? (() => new Date());
  defineTool("testers", async (ctx: ReaderCtx) => {
    const ticket = await d.ticket().catch(() => "");
    if (!ticket) { kept = null; throw new Error(refusalOf(403)); }
    if (!ctx.refresh && kept && kept.ticket === ticket && now().getTime() - kept.at < CACHE_MS) return kept.data;
    const r = await d.testers(ticket);
    if (r.status !== 200) { kept = null; throw new Error(refusalOf(r.status, isObj(r.body) && typeof r.body.error === "string" ? r.body.error : undefined)); }
    const line = await d.releases().catch(() => null);
    const data = testersOf(r.body, line, now());
    if (!data) throw new Error("Sol's cloud answered with something that is not the testers");
    const also = !line ? "the releases could not be read just now, so nobody is marked on the newest beta"
      : line.error ? `the releases were read with a problem (${line.error.slice(0, 120)}), so a version may be unplaced` : "";
    if (also) data.note = data.note ? `${data.note}; ${also}` : also;
    kept = { at: now().getTime(), ticket, data };
    return data;
  }, { people: true });
}
