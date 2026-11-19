// The clean Home's side (#589): what it lists, worked out from the sessions. Pure, so it is tested (src/homeKeys.test.ts).
// The side is the only list: every session in its folder, each row one mark saying how it is. A done session sits in
// "done today" for a day, then leaves the side (the side opened wide still finds it) unless it is pinned. The narrow
// side keeps the last week and anything running, waiting or pinned; older work is the wide side's.

export type St = "needs" | "running" | "failed" | "unread" | "done" | "";
export type Row = { id: string; title: string; cwd: string; project: string; folder?: string; machine?: string; updatedAt: number;
  pinned?: boolean; done?: boolean; archived?: boolean; gone?: boolean; parent?: string;
  under?: string; kind?: "orchestration" };   // under: the orchestration session that runs it (sideSort folds by it alone)
export type Folder<R extends Row = Row> = { key: string; name: string; rows: R[]; at: number };

export const DAY = 86_400_000;
const WEEK = 7 * DAY;
export const base = (p?: string) => (p ? p.replace(/\/+$/, "").split("/").pop() || p : "");
export const folderOf = (r: Row) => r.folder || r.project || r.cwd || "~";

/** the narrow side: folders (newest first, rows newest first) and "done today" */
export function sideOf<R extends Row>(rows: R[], st: (r: R) => St, now = Date.now()): { folders: Folder<R>[]; doneToday: R[] } {
  const by = new Map<string, Folder<R>>();
  const doneToday: R[] = [];
  for (const r of rows) {
    if (r.archived || r.gone) continue;
    const s = st(r);
    const live = s === "needs" || s === "running";
    if (r.done && !r.pinned && !live) { if (now - r.updatedAt < DAY) doneToday.push(r); continue; }
    if (!live && !r.pinned && now - r.updatedAt > WEEK) continue;
    const key = folderOf(r);
    const f = by.get(key) ?? { key, name: key === "~" ? "home" : base(key), rows: [], at: 0 };
    f.rows.push(r); f.at = Math.max(f.at, r.updatedAt);
    by.set(key, f);
  }
  const newest = (a: R, b: R) => b.updatedAt - a.updatedAt;
  const folders = [...by.values()].sort((a, b) => b.at - a.at);
  for (const f of folders) f.rows.sort(newest);
  return { folders, doneToday: doneToday.sort(newest) };
}

export type Filter = "all" | "running" | "needs" | "done";
/** the side opened wide: every session but the deleted, one filter, newest first */
export function wideOf<R extends Row>(rows: R[], st: (r: R) => St, f: Filter): R[] {
  return rows.filter((r) => {
    if (r.gone) return false;
    const s = st(r);
    return f === "all" ? true : f === "done" ? !!r.done || !!r.archived || s === "done" : s === f;
  }).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** a time as the side says it: now, 2m, 1h, 3d, Oct 28 */
export function when(t: number, now = Date.now()): string {
  const d = (now - t) / 1000;
  if (d < 60) return "now";
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)}d`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export type Layout = 1 | 2 | 3 | 4 | 5;
/** which of the five layouts the window is in: side + talk, talk alone, side + talk + pane, talk + big pane, side wide */
export const layoutOf = (side: boolean, pane: boolean, wide: boolean): Layout => (wide ? 5 : pane ? (side ? 3 : 4) : side ? 1 : 2);
