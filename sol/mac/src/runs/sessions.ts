// A project's sessions under its tab (#906), as pure rules: which project a session belongs to (by its folder,
// sheet.ts FOLDERS), and in which of three groups it sits: waiting on you, working, done and unread. Read from the same
// list the side list draws (the engine's `work.sessions` message, its sessions and runs); nothing here changes it.
//
// Stubbed until the engine half lands: the board serving each project's sessions itself.
import { ELSEWHERE, folderTable, projectOfFolder } from "./sheet.ts";
import { span } from "./rules.ts";

/** the fields of the side list's session (work/useWork.ts WorkSession) this reads */
export interface SessionIn {
  id: string; title: string; cwd: string; project?: string; folder?: string; updatedAt?: number;
  unread?: boolean; done?: boolean; failed?: boolean; archived?: boolean; gone?: boolean; running?: boolean; mode?: string;
}
/** the fields of a session's run (work/useWork.ts RunInfo) this reads */
export interface RunIn { sessionId: string; busy?: boolean; waiting?: number; tasks?: string[]; failed?: boolean; since?: number }

export type Group = "waits" | "working" | "unread";
export const GROUPS: { id: Group; word: string }[] = [
  { id: "waits", word: "waiting on you" }, { id: "working", word: "working" }, { id: "unread", word: "done, not read yet" },
];
export const PER_GROUP = 4;

/** the group a session sits in, the side list's rule (WorkSidebar rowState): asking him first, then at work, then
 *  finished and unseen; a session that stopped on an error waits on him. Any other is not drawn here */
export function groupOf(s: SessionIn, r?: RunIn): Group | null {
  if (s.archived || s.gone || (s.mode && s.mode !== "work")) return null;
  if (r?.waiting) return "waits";
  if (r?.busy || r?.tasks?.length || s.running) return "working";
  if (r ? r.failed : s.failed) return "waits";
  if (s.unread) return "unread";
  return null;
}

export interface Row { id: string; title: string; line: string; group: Group; at: number }
/** a session's one line, in words */
export function lineOf(s: SessionIn, r: RunIn | undefined, g: Group, nowMs: number): string {
  if (g === "waits") return r?.waiting ? `asks you something${r.waiting > 1 ? ` (${r.waiting} things)` : ""}` : "stopped on an error";
  if (g === "working") { const t = r?.since ? span(Math.max(0, (nowMs - r.since) / 1000)) : ""; return !t ? "working" : t === "just now" ? "just started" : `working for ${t}`; }
  const ago = s.updatedAt ? span(Math.max(0, (nowMs - s.updatedAt) / 1000)) : "";
  return ago ? (ago === "just now" ? "finished just now" : `finished ${ago} ago`) : "finished";
}

export interface Groups { waits: Row[]; working: Row[]; unread: Row[]; count: number }
const empty = (): Groups => ({ waits: [], working: [], unread: [], count: 0 });

/** every drawn session by project, in its group, newest first; a session whose folder fits no project on the board
 *  goes under "elsewhere" */
export function sessionsByProject(sessions: SessionIn[], runs: RunIn[], projects: { id: string; path?: string }[], nowMs: number): Map<string, Groups> {
  const table = folderTable(projects), ids = new Set(projects.map((p) => p.id));
  const byRun = new Map(runs.map((r) => [r.sessionId, r]));
  const out = new Map<string, Groups>();
  for (const s of sessions) {
    const r = byRun.get(s.id), g = groupOf(s, r);
    if (!g) continue;
    let p = projectOfFolder(s.folder || s.cwd || s.project || "", table);
    if (!ids.has(p)) p = ELSEWHERE;
    const at = g === "working" && r?.since ? r.since : s.updatedAt ?? 0;
    const gs = out.get(p) ?? empty();
    gs[g].push({ id: s.id, title: s.title || "a session with no name yet", line: lineOf(s, r, g, nowMs), group: g, at });
    gs.count++;
    out.set(p, gs);
  }
  for (const gs of out.values()) for (const { id } of GROUPS) gs[id].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  return out;
}

/** a group as drawn: at most PER_GROUP rows; the rest one count ("and 3 more"). One over is drawn, never "and 1 more" */
export function fold(rows: Row[], cap = PER_GROUP): { shown: Row[]; more: number } {
  if (rows.length <= cap + 1) return { shown: rows, more: 0 };
  return { shown: rows.slice(0, cap), more: rows.length - cap };
}

/** the mark a project wears with its sessions: a session waiting on him makes it "needs you" whatever the builders say;
 *  a calm project with a session at work is working */
export function markWithSessions<M extends { mark: string; word: string; detail: string }>(m: M, g: Groups | undefined): M {
  const n = g?.waits.length ?? 0, w = g?.working.length ?? 0;
  if (!n && w && m.mark === "calm") return { ...m, mark: "working", word: "working", detail: `${w} session${w === 1 ? "" : "s"} working` };
  if (!n) return m;
  const said = `${n} session${n === 1 ? "" : "s"} waiting on you`;
  return { ...m, mark: "needs", word: "needs you", detail: m.mark === "needs" ? `${m.detail}, ${said}` : said };
}
