// An opened folder's head, in words (first-timer line 1, BR1 #1615): with no session drawn here yet, what the move-in read
// counted ("336 earlier sessions in Claude Code"), never "no sessions yet" against a busy folder; and where the folder is
// on the Mac, for Files' Open in Finder. Pure, so the tests read it. Signed: marcocyl04-ux's agent (builder F).

import type { Known } from "../known.ts";

const APP: Record<string, string> ={ claude: "Claude Code", codex: "Codex" };

/** a folder's pages: its own pieces that are not a session, a folder, a card or a frame, by title (BR1 conform #3) */
const NOT_PAGES = new Set(["session", "folder", "starter", "place", "level", "fit"]);
export function pagesOf<P extends { kind: string; inside?: unknown }>(pieces: readonly P[], title: (p: P) => string): string[] {
  return pieces.filter((p) => !NOT_PAGES.has(p.kind) && !p.inside).map(title).filter((t) => !!t.trim());
}

/** what the read counted in a folder, as the head says it; "" when it counted none */
export function earlier(row: { sessions?: number; found?: { sessions?: Partial<Record<string, number>> } } | undefined): string {
  const n = row?.sessions ?? 0;
  if (!(n > 0)) return "";
  const apps = Object.entries(row?.found?.sessions ?? {}).filter(([, k]) => (k ?? 0) > 0).map(([a]) => APP[a] ?? a);
  return `${n} earlier session${n === 1 ? "" : "s"}${apps.length ? ` in ${apps.join(" and ")}` : ""}`;
}

/** the head's one line (BR1 hold 3, #1615): the folder's one count of sessions (place.ts sessionsOf, the number its card
 *  and its far word say), in the apps the read saw them in, then what of them needs the person or is at work, each only
 *  above 0; the shelves' drawn count is never a second total ("311 done" against 495). With none, `none`: an empty
 *  folder's own line ("Nothing in it yet", the words its card says, try 5's first-timer), else "no sessions yet" */
export function headOf(n: number, needs: number, working: number, row?: { found?: { sessions?: Partial<Record<string, number>> } }, none = "no sessions yet"): string {
  const apps = Object.entries(row?.found?.sessions ?? {}).filter(([, k]) => (k ?? 0) > 0).map(([a]) => APP[a] ?? a);
  const total = n > 0 ? `${n} session${n === 1 ? "" : "s"}${apps.length ? ` in ${apps.join(" and ")}` : ""}` : none;
  return [total, needs ? `${needs} need${needs === 1 ? "s" : ""} you` : "", working ? `${working} working` : ""].filter(Boolean).join(" · ");
}

/** of what Sol knows at a folder, what a session started there is given, the facts knowsRows lists ("A repo", "Has
 *  CLAUDE.md", what the person told it, what the AIs kept), never what is of the person (their share of time, their
 *  hours, their AIs): an empty folder's card says these (place.ts knowing; walk 3: no "25% of your time" on a card) */
export const givenOf = (ks: readonly Known[]): Known[] =>
  ks.filter((f) => (/^seen:.*:holds$/.test(f.k) && f.fact !== "No code in it") || /^seen:.*:rules:/.test(f.k) || f.k.startsWith("fact:") || f.k.startsWith("learned:"));

/** one row of "What every session here knows" (frame.html part 5): what, then its small grey words; rules carries the
 *  facts it stands for, each forgettable where the engine holds it */
export type KnowRow = { k: "place" | "rules" | "pages"; what: string; small: string; n: number; facts?: Known[] };   // n: the things it says
const said = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** what a session started here is given (sol/engine next/folders.ts contextText), as the drawing's rows, never what Sol
 *  knows of the person (their share of time, their hours, which AIs they use: You says those, BR1 conform #3): its place
 *  on disk (a repo, when the read found one), its rules (its rules files by name, then what the person told it and what
 *  the AIs kept, the live ones first), its pages. place is the path as said (~/…); nothing known, no row */
export function knowsRows(place: string | null, ks: readonly Known[], pages: readonly string[]): KnowRow[] {
  const out: KnowRow[] = [];
  const repo = ks.some((f) => /^seen:.*:holds$/.test(f.k) && f.fact === "A repo");
  if (place) out.push({ k: "place", what: place, small: repo ? "its place on disk · a repo" : "its place on disk", n: 1 });
  const files = [...new Set(ks.filter((f) => /^seen:.*:rules:/.test(f.k)).map((f) => f.k.split(":rules:").pop()!))];
  const told = ks.filter((f) => f.k.startsWith("fact:") || f.k.startsWith("learned:")).sort((a, b) => Number(!!a.stale) - Number(!!b.stale));
  const n = files.length + told.length;
  if (n) {
    const from = [...files, ...(told.some((f) => f.by === "person") ? ["you"] : []), ...(told.some((f) => f.by !== "person") ? ["the AIs"] : [])];
    out.push({ k: "rules", what: [...files, ...told.map((f) => f.fact)].join(" · "), small: `its rules, ${n} · from ${said(from)}`, n, facts: told });
  }
  if (pages.length) out.push({ k: "pages", what: pages.slice(0, 3).join(" · ") + (pages.length > 3 ? ` · ${pages.length - 3} more` : ""), small: pages.length === 1 ? "its page" : "its pages", n: pages.length });
  return out;
}

/** how many things the opened folder lists under "What every session here knows" and "From finished sessions": its
 *  place, each rule, each page, each note pinned, each thing a finished session wrote back. The folder card's badge says
 *  this same number: one count per folder (BR1 #1615, "one place, one summary") */
export const knowsCount = (rows: readonly KnowRow[], notes: number, backs: number): number =>
  rows.reduce((n, r) => n + r.n, 0) + notes + backs;

/** what a new session in this folder starts knowing, said where it is started (BR1 conform #6, sessions.html §1: "It
 *  already knows what the folder knows"): the same rows the folder lists, short; [] when the folder knows nothing yet */
export function startsKnowing(rows: readonly KnowRow[], notes: number, backs: number): string[] {
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  const out = rows.map((r) => (r.k === "place" ? r.what : r.k === "rules" ? (r.n <= 3 ? r.what : n(r.n, "rule")) : n(r.n, "page")));
  if (notes) out.push(n(notes, "note"));
  if (backs) out.push(n(backs, "thing a finished session wrote back", "things finished sessions wrote back"));
  return out;
}

/** where a folder is on the Mac: its region's path, else the path in a work folder's id ("w:<path>"); a folder only in
 *  Sol's home has none */
export const pathOf = (rid: string, r?: { [k: string]: unknown }): string | null =>
  typeof r?.path === "string" && r.path ? r.path : rid.startsWith("w:") ? rid.slice(2) : null;
