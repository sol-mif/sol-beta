// The one session at team size (#1002, team.html), behind its own switch `build.one.team` (off by default; Settings ›
// me › "one session, with the team"). Pure: what the team's hands record (cowork/handed.ts, the engine's hand.ts) is in
// one person's window. One grammar, one more axis, whose:
//   yours        a hand to me, untaken: a piece on my stage with my hands on it (take · pass · later)
//   a send       a hand I gave, untaken: one line, "went to frank", with pull back until they act (team.hand.back)
//   a teammate's what happened between two others: one quiet line; seen, never acted on
// Nothing here is a board of people or a feed: at most LINES lines, newest first, and only the pieces that need me.
// My setting decides how a hand to me reaches me: asks first (a piece), does then tells (my agent takes it and starts
// the session; a line says so), does (the same, the line only in "earlier").
import type { Handed, HandRow } from "../cowork/handed";
import type { Board, Card } from "../cowork/useTeam";

export const TEAM_FLAG = "build.one.team";
export type Setting = "asks" | "tells" | "does";
export const SETTING_WORDS: Record<Setting, string> = { asks: "asks first", tells: "does, then tells", does: "does" };
export const LINES = 6;

export type TeamPiece = Handed & { whose: "yours"; passedBack: boolean };
export type LineKind = "sent" | "took" | "passed" | "back" | "mine-took" | "theirs";
export type TeamLine = { id: string; at: string; kind: LineKind; who: string; text: string; repo: string; issue: number; quiet: boolean };

const lc = (s: string) => s.toLowerCase();
const short = (s: string | undefined, n = 80) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
/** the first line of a brief, without the "#N title, handed to me" head a session's brief opens with */
export const gist = (h: { brief?: string; title?: string; issue?: number }) => short(h.title || String(h.brief ?? "").split("\n")[0] || (h.issue ? `#${h.issue}` : ""), 90);

/** the pieces: what is handed to me now and not put off, newest first; passedBack when it came back to me with a line
 *  (the record's latest line on it is a pass) (pure) */
export function piecesOf(pending: Handed[], laterOf: (id: string) => boolean, rows: HandRow[] = []): TeamPiece[] {
  return pending.filter((h) => !h.review && !laterOf(h.id)).map((h) => {
    const last = rows.find((r) => `${r.repo}#${r.number}` === h.id);
    return { ...h, whose: "yours" as const, passedBack: last?.how === "passed" };
  });
}

/** the lines: the latest hands line of each issue, in my words, newest first, at most LINES (pure).
 * A hand to me untaken is a piece, never a line; a pass back to me is a piece too (pendingFor) */
export function linesOf(me: string, rows: HandRow[], max = LINES): TeamLine[] {
  const I = lc(me);
  const latest = new Map<string, HandRow>();
  for (const r of rows) { const k = `${r.repo}#${r.number}`; if (!latest.has(k)) latest.set(k, r); }   // rows are newest first
  const out: TeamLine[] = [];
  for (const [id, r] of latest) {
    const from = lc(r.from), to = lc(r.to), n = `#${r.number}`, base = { id, at: r.at, repo: r.repo, issue: r.number };
    if (r.how === "review") continue;   // a review asked is the reviewer's, on GitHub
    if (r.how === "hand" && from === I) out.push({ ...base, kind: "sent", who: r.to, text: `${n} went to ${r.to}: ${short(r.brief, 70)}`, quiet: false });
    else if (r.how === "hand" && to === I) continue;   // a piece
    else if (r.how === "taken" && from === I) out.push({ ...base, kind: "took", who: r.to, text: `${r.to} took ${n}`, quiet: false });
    else if (r.how === "taken" && to === I) out.push({ ...base, kind: "mine-took", who: r.from, text: `you took ${n} from ${r.from}`, quiet: false });
    else if (r.how === "passed" && to === I) continue;  // a piece: it came back to me
    else if (r.how === "passed" && from === I) out.push({ ...base, kind: "passed", who: r.to, text: `you passed ${n} back to ${r.to}`, quiet: false });
    else if (r.how === "back" && from === I) out.push({ ...base, kind: "back", who: r.to, text: `you pulled ${n} back from ${r.to}`, quiet: false });
    else if (r.how === "back" && to === I) out.push({ ...base, kind: "back", who: r.from, text: `${r.from} pulled ${n} back`, quiet: true });
    else if (from !== I && to !== I) {
      // a teammate's: one quiet line
      const t = r.how === "hand" ? `${r.from} gave ${n} to ${r.to}` : r.how === "taken" ? `${r.to} took ${n} from ${r.from}` : r.how === "passed" ? `${r.from} passed ${n} back to ${r.to}` : `${r.from} pulled ${n} back`;
      out.push({ ...base, kind: "theirs", who: r.how === "taken" ? r.to : r.from, text: t, quiet: true });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, max);
}

/** whose window a give goes to: the leads of the issue's area first (CODEOWNERS, the board's leads), then the others;
 *  never me (pure) */
export function whoFor(card: Pick<Card, "repo" | "labels"> | null, board: Pick<Board, "leads" | "repos"> | null, people: string[], me: string): { login: string; leads?: string }[] {
  const I = lc(me);
  const out: { login: string; leads?: string }[] = [];
  for (const label of card?.labels ?? []) {
    for (const l of board?.leads?.[card!.repo]?.[label] ?? []) if (lc(l) !== I && !out.some((o) => lc(o.login) === lc(l))) out.push({ login: l, leads: label });
  }
  for (const p of people) if (lc(p) !== I && !out.some((o) => lc(o.login) === lc(p))) out.push({ login: p });
  return out;
}

/** what I can give: my own open issues on the board, newest first (pure) */
export function givable(cards: Card[], me: string, max = 6): Card[] {
  const I = lc(me);
  return cards.filter((c) => c.state === "open" && c.assignees.some((a) => lc(a) === I)).slice(0, max);
}

/** the hand I may pull back: the line is a send (my hand, untaken) */
export const canPullBack = (l: TeamLine) => l.kind === "sent";

/** a person's initial, for the small round mark beside a line (pure) */
export const initial = (login: string) => (login.trim()[0] ?? "?").toUpperCase();
