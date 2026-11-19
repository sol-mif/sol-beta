// Build's side, sorted by what a session asks of you (2026-11-11, Marco: "needs me first + pinned"; Home's sessions stay
// in Home). Since 2026-11-14 (two kinds of session, Marco: "starting a session never folds it") a session folds only
// under an orchestration session that runs it (`under`); `parent` is history ("started by") and folds nothing. Pure, so it is tested (src/sideSort.test.ts); Side.tsx
// draws it, sidePrefs.ts holds what the person set in Build settings › sidebar.
//
// The automatic rule, top to bottom, each session in the first place that fits:
//   needs you   it waits on you, or one of the sessions it runs does
//   pinned      you pinned it: it never leaves
//   active      it works, or one of the sessions it runs does; or it finished and you have not opened it yet;
//               or it is held (`held`: the session you are in after it ran, and a pause between two steps). A turn
//               that ends never takes its row away unseen (Marco 2026-11-11: gone at once looks incompetent,
//               lingering looks stupid): the row leaves for its project once you have opened it
//   its project it failed (this week), or you touched it within `stay` days
//   earlier     marked done today, or quiet for longer than `stay` but within the week: one fold
//   (find only) everything older
// A session an orchestration session runs (`under` it) never has a line of its own: it sits under that one and lifts
// its state when it needs you or runs (the orchestrator's dot is the worst of its children's). A session another
// started but nothing runs (only `parent`) is a row like any other, by recency.
import { DAY, base, folderOf, type Row, type St } from "./sideRows.ts";

export const WEEK = 7 * DAY;
export type Line<R> = { row: R; st: St; kids: R[] };
export type Proj<R> = { key: string; name: string; lines: Line<R>[]; at: number };
export type Sorted<R> = { needs: Line<R>[]; pinned: Line<R>[]; running: Line<R>[]; projects: Proj<R>[]; earlier: Line<R>[] };

const newest = (a: { updatedAt: number }, b: { updatedAt: number }) => b.updatedAt - a.updatedAt;

/** every listed row as a line: the sessions an orchestration session runs (`under`) fold under the top of their chain
 *  and leave the list; the rest keep their order. The one grouping every view of the side uses (the sorted side, the
 *  folders, the side opened wide: the fix round of 2026-11-14), so a fold never holds in one sort and not another.
 *  `all` is what the chain is read in (an orchestrator must be listed for its children to fold; one archived or gone
 *  lets them loose; a chain that loops, or runs past 8, stops). A child shows while it is live, pinned or this week's.
 *  One rule for a pinned child, both sidebars (WorkSidebar's nests): it stays under its orchestrator, its pin marked on
 *  its row inside the fold, never pulled out to the pinned tray. */
export function foldUnder<R extends Row>(rows: R[], st: (r: R) => St, now = Date.now(), all: R[] = rows): Line<R>[] {
  const by = new Map(all.map((r) => [r.id, r]));
  const runner = (r: R) => { const o = r.under ? by.get(r.under) : undefined; return o && o.kind === "orchestration" ? o : undefined; };
  const rootOf = (r: R): R => { let at = r; for (let i = 0; i < 8; i++) { const p = runner(at); if (!p) break; if (p === r) return r; at = p; } return at; };   // a loop: each its own line
  const kids = new Map<string, R[]>();
  const roots: R[] = [];
  const shown = new Set(rows.map((r) => r.id));
  for (const r of rows) {
    const top = rootOf(r);
    if (top === r || !shown.has(top.id)) { roots.push(r); continue; }   // its orchestrator not in this list (a filter): a line of its own
    const s = st(r);
    if (s === "needs" || s === "running" || r.pinned || now - r.updatedAt < WEEK) kids.set(top.id, [...(kids.get(top.id) ?? []), r]);
  }
  return roots.map((r) => {
    const mine = (kids.get(r.id) ?? []).sort(newest), ks = mine.map(st), own = st(r);
    const lifted: St = own === "needs" || ks.includes("needs") ? "needs" : own === "running" || ks.includes("running") ? "running" : own;
    return { row: r, st: lifted, kids: mine };
  });
}

export function sortSide<R extends Row>(all: R[], st: (r: R) => St, o: { stay: number; isHome?: (r: R) => boolean; held?: (r: R) => boolean }, now = Date.now()): Sorted<R> {
  const rows = all.filter((r) => !r.archived && !r.gone && !o.isHome?.(r));
  const out: Sorted<R> = { needs: [], pinned: [], running: [], projects: [], earlier: [] };
  const projects = new Map<string, Proj<R>>();
  // grouped by `under` first, then the groups ordered
  for (const line of foldUnder(rows, st, now)) {
    const r = line.row, mine = line.kids, lifted = line.st;
    const age = now - Math.max(r.updatedAt, ...mine.map((k) => k.updatedAt));
    if (lifted === "needs") out.needs.push(line);
    else if (r.pinned) out.pinned.push(line);
    else if (lifted === "running" || lifted === "unread" || o.held?.(r)) out.running.push(line);
    else if (r.done) { if (age < DAY) out.earlier.push(line); }
    else if (age >= WEEK) continue;
    else if (lifted === "failed" || age < o.stay * DAY) {
      const key = folderOf(r);
      const p = projects.get(key) ?? { key, name: key === "~" ? "home" : base(key), lines: [], at: 0 };
      p.lines.push(line); p.at = Math.max(p.at, r.updatedAt);
      projects.set(key, p);
    } else out.earlier.push(line);
  }
  const byRow = (a: Line<R>, b: Line<R>) => newest(a.row, b.row);
  out.needs.sort(byRow); out.pinned.sort(byRow); out.running.sort(byRow); out.earlier.sort(byRow);
  out.projects = [...projects.values()].sort((a, b) => b.at - a.at);
  for (const p of out.projects) p.lines.sort(byRow);
  return out;
}

/** an orchestration row's words (design 2026-11-14 §2): "3 under", "3 under, 1 needs you", "2 under, 2 need you";
 *  with nothing under it yet, it says so (the fix round of 2026-11-14: the row reads as one from its first moment) */
/** what an orchestration row says where the time was: in a hold tray (needs you, active), one that runs or asks you
 *  says that state, as every row there does; the "n under" words only when it is idle, and always outside the trays */
export const orchSays = (hold: boolean, st: St): "state" | "under" => (hold && (st === "needs" || st === "running") ? "state" : "under");
export function underWords(states: St[]): string {
  const n = states.length, needs = states.filter((s) => s === "needs").length;
  if (!n) return "nothing under yet";
  return `${n} under${needs ? `, ${needs} need${needs === 1 ? "s" : ""} you` : ""}`;
}

/** the side keeps still while sessions work (2026-11-17, Marco: with lots of activity the side "keeps moving all around
 *  the place"): every draw sorted each tray newest first, so each turn that wrote swapped rows. Now a row keeps its place
 *  while it stays in its tray; one that arrives goes on top, newest first among those arriving. A row moves only when its
 *  tray changes. `mem` is what the last draw showed, by tray (the caller keeps it); it is rewritten here */
export function steady<T>(mem: Map<string, string[]>, tray: string, now: T[], id: (t: T) => string): T[] {
  const was = mem.get(tray), at = new Map((was ?? []).map((k, i) => [k, i]));
  const out = !was ? now : [...now.filter((t) => !at.has(id(t))), ...now.filter((t) => at.has(id(t))).sort((a, b) => at.get(id(a))! - at.get(id(b))!)];
  mem.set(tray, out.map(id));
  return out;
}
/** steady over the whole sorted side: the trays, the folders' order, each folder's lines, the helpers under each session */
export function steadySide<R extends Row>(mem: Map<string, string[]>, s: Sorted<R>): Sorted<R> {
  const lines = (tray: string, ls: Line<R>[]) => steady(mem, tray, ls, (l) => l.row.id).map((l) => ({ ...l, kids: steady(mem, `kids ${l.row.id}`, l.kids, (k) => k.id) }));
  return {
    needs: lines("needs", s.needs), pinned: lines("pinned", s.pinned), running: lines("running", s.running), earlier: lines("earlier", s.earlier),
    projects: steady(mem, "projects", s.projects, (p) => p.key).map((p) => ({ ...p, lines: lines(`in ${p.key}`, p.lines) })),
  };
}
