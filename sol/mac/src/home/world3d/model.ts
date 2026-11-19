// Home's world (#1093): what the world draws, as plain data, and where each thing stands. Pure, so the tests read it
// without a window. Every object is a real thing with a real state: a part of life (a district), a folder (a pearl
// block in it), a sticky (a tile on the block), a project of Build (a block in the workshop) with its sessions (small
// jellies on it), a teammate (a light on the dock). Districts never move (build-world, 2026-11-12: "districts that never
// move"); inside one, a folder keeps its slot by its order.
import type { Made } from "../folders/stickies.ts";

/** a sticky's state, as the world shows it: waiting (still), running (green, turning), wants you (yellow, it rises toward
 *  you), done (settles at the foot and, by the evening, onto the shelf) */
export type Mood = "wait" | "run" | "ask" | "done";
/** old: done before today's first look (on its folder's figure, not on today's shelf) */
export type Thing = { id: string; name: string; mood: Mood; folder: string; i: number; needs?: string; old?: boolean };
export type Folder = { id: string; name: string; part: string; rel: string; set: boolean; things: Thing[] };
export type Part = { id: string; name: string; folders: Folder[] };
export type Session = { id: string; title: string; busy: boolean; waiting: boolean; failed: boolean; at?: number };   // at: its last message (ms)
export type Health = "ok" | "broken" | "idle";
/** cwd: where its newest session works (the folder its pieces live in; the engine's `path` is its grouping) */
export type Project = { id: string; name: string; path: string; cwd?: string; health: Health; sessions: Session[]; jelly?: boolean; checks?: { name: string; ok: boolean }[] };
export type Mate = { name: string; on: boolean };
export type WorldData = { who: string; parts: Part[]; projects: Project[]; mates: Mate[]; social: number; source: "live" | "made-up"; at: number };

/** a sticky's state from its line in stickies.md: [x] done; "← now" the folder's agent is on it; a note "needs you…"
 *  (the folder agent's line when it stops for the person) wants him; else it waits */
export function moodOf(m: Made): Mood {
  if (m.done) return "done";
  if (m.notes.some((n) => /^needs you\b/i.test(n.trim()))) return "ask";
  if ([m.t, m.s, ...m.notes].some((x) => /← now\s*$/.test(x ?? ""))) return "run";
  return "wait";
}
/** the line a sticky asks him, from its newest "needs you: …" note (empty when it asks nothing) */
export const needsOf = (m: Made): string | undefined => {
  const n = [...m.notes].reverse().find((x) => /^needs you\b/i.test(x.trim()));
  return n ? n.trim().replace(/^needs you:?\s*/i, "").trim() || undefined : undefined;
};
export const thingsOf = (folder: string, items: Made[]): Thing[] =>
  items.map((m, i) => { const mood = moodOf(m), needs = mood === "ask" ? needsOf(m) : undefined; return { id: `${folder}#${i}`, name: m.t.replace(/\s*← now\s*$/, ""), mood, folder, i, ...(needs ? { needs } : {}) }; });

/** Build's projects from the engine's session list (work.sessions): a project per folder that has sessions; broken when
 *  its last session failed, idle when nothing moved in a week, else ok */
export function projectsOf(
  projects: { path: string; name: string; title?: string }[],
  sessions: { id: string; title: string; project: string; cwd?: string; updatedAt: number; failed?: boolean; archived?: boolean; gone?: boolean }[],
  runs: Record<string, { busy?: boolean; waiting?: number; tasks?: unknown[] }>,
  now = Date.now(),
): Project[] {
  const out: Project[] = [];
  for (const p of projects) {
    const ss = sessions.filter((s) => s.project === p.path && !s.archived && !s.gone).sort((a, b) => b.updatedAt - a.updatedAt);
    if (!ss.length) continue;
    const live = ss.filter((s) => runs[s.id]?.busy || !!runs[s.id]?.tasks?.length || (runs[s.id]?.waiting ?? 0) > 0);
    const shown = (live.length ? live : ss.slice(0, 1)).slice(0, 4).map((s): Session => ({ id: s.id, title: s.title, busy: !!runs[s.id]?.busy || !!runs[s.id]?.tasks?.length, waiting: (runs[s.id]?.waiting ?? 0) > 0, failed: !!s.failed, at: s.updatedAt }));
    const health: Health = ss[0].failed ? "broken" : now - ss[0].updatedAt > 7 * 864e5 && !live.length ? "idle" : "ok";
    out.push({ id: p.path, name: p.title?.trim() || p.name, path: p.path, ...(ss[0].cwd ? { cwd: ss[0].cwd } : {}), health, sessions: shown, jelly: /(^|\/)(sol|sol-dev)$/i.test(ss[0].cwd ?? p.path) || /(^|\/)(sol|sol-dev)$/i.test(p.path) });
  }
  // each project keeps its place (districts never move): the Jelly project first, then by name
  // one Jelly project: the repository the registry is read from; any other match is a plate like the rest
  // which eight stand (a home with many): the Jelly project, then any working or waiting now, then the latest; never one
  // cut that is working or wants him while a quiet one stands
  const at = new Map(projects.map((p) => [p.path, Math.max(0, ...sessions.filter((s) => s.project === p.path).map((s) => s.updatedAt))]));
  const live = (p: Project) => p.sessions.some((s) => s.busy || s.waiting);
  const chosen = [...out].sort((a, b) => Number(!!b.jelly) - Number(!!a.jelly) || Number(live(b)) - Number(live(a)) || (at.get(b.path) ?? 0) - (at.get(a.path) ?? 0)).slice(0, 8);
  const sorted = chosen.sort((a, b) => Number(!!b.jelly) - Number(!!a.jelly) || a.name.localeCompare(b.name));
  return sorted.map((p, i) => (p.jelly && i > 0 ? { ...p, jelly: false } : p));
}

// ---- where things stand ----
export type Box = { x: number; z: number; w: number; d: number };
export type Spot = { x: number; z: number; w: number; d: number; h: number };
export const ISLAND = { w: 24, d: 15 } as const;
/** the four fixed districts of Home's ground at the back, the workshop in front, the plaza, the shelf and the dock */
export const SLOTS: Box[] = [
  { x: -7.4, z: -3.4, w: 7.6, d: 5.4 }, { x: 0.8, z: -3.4, w: 7.6, d: 5.4 }, { x: 7.6, z: -3.4, w: 4.6, d: 5.4 },
];
export const WORKSHOP: Box = { x: -4.2, z: 3.4, w: 13.8, d: 4.6 };
export const PLAZA = { x: 5.6, z: 3.2 } as const;
export const SHELF: Box = { x: 8.8, z: 4.4, w: 3.6, d: 1.6 };
export const DOCK = { x: 12.6, z: -1 } as const;

/** a folder's block: taller the more it holds (capped), in a grid inside its district */
export function folderSpots(part: Part, slot: Box): Map<string, Spot> {
  const n = part.folders.length, cols = Math.max(1, Math.min(n, slot.w > 6 ? 4 : 2)), rows = Math.max(1, Math.ceil(n / cols));
  const cw = slot.w / cols, rd = (slot.d - 1.2) / rows, m = new Map<string, Spot>();
  part.folders.forEach((f, i) => {
    const c = i % cols, r = Math.floor(i / cols), open = f.things.filter((t) => t.mood !== "done").length;
    m.set(f.id, { x: slot.x - slot.w / 2 + cw * (c + 0.5), z: slot.z - slot.d / 2 + 0.4 + rd * (r + 0.5), w: Math.min(1.5, cw * 0.62), d: Math.min(1.1, rd * 0.55), h: 0.5 + Math.min(open, 6) * 0.22 });
  });
  return m;
}
export function projectSpots(ps: Project[]): Map<string, Spot> {
  const n = Math.max(1, ps.length), cw = WORKSHOP.w / Math.max(4, n), m = new Map<string, Spot>();
  ps.forEach((p, i) => m.set(p.id, { x: WORKSHOP.x - WORKSHOP.w / 2 + cw * (i + 0.5), z: WORKSHOP.z - 0.2, w: Math.min(1.9, cw * 0.62), d: 1.5, h: 0.9 + Math.min(p.sessions.length, 4) * 0.4 + (p.jelly ? 0.5 : 0) }));
  return m;
}

/** what wants him, first the oldest */
export const asks = (d: WorldData) => [
  ...d.parts.flatMap((p) => p.folders.flatMap((f) => f.things.filter((t) => t.mood === "ask").map((t) => ({ kind: "thing" as const, id: t.id, name: t.name, where: f.name })))),
  ...d.projects.flatMap((p) => p.sessions.filter((s) => s.waiting).map((s) => ({ kind: "session" as const, id: s.id, name: s.title, where: p.name }))),
];
export const running = (d: WorldData) =>
  d.parts.reduce((n, p) => n + p.folders.reduce((k, f) => k + f.things.filter((t) => t.mood === "run").length, 0), 0) + d.projects.reduce((n, p) => n + p.sessions.filter((s) => s.busy).length, 0);
export const doneToday = (d: WorldData) => d.parts.reduce((n, p) => n + p.folders.reduce((k, f) => k + f.things.filter((t) => t.mood === "done").length, 0), 0);

/** the sky from the real hour: 0 deep night, 1 full day; dawn 6-8, dusk 18-20 */
export function daylight(d: Date): number {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 6 || h >= 20) return 0;
  if (h < 8) return (h - 6) / 2;
  if (h >= 18) return 1 - (h - 18) / 2;
  return 1;
}
/** the weather from how the day is going: clear when nothing is broken and little waits on him; haze when things wait;
 *  rain when something is broken */
export type Weather = "clear" | "haze" | "rain";
export function weatherOf(d: WorldData): Weather {
  if (d.projects.some((p) => p.health === "broken")) return "rain";
  return asks(d).length >= 3 ? "haze" : "clear";
}

/** the one line at the top: where you are, what is happening, what needs you (stable-ui-four-questions) */
export function lineOf(d: WorldData): string {
  const a = asks(d).length, r = running(d), done = doneToday(d);
  const bits = [r ? `${r} working` : "nothing working", a ? `${a} ${a === 1 ? "wants" : "want"} you` : "nothing waits on you"];
  if (done) bits.push(`${done} done`);
  return bits.join(" · ");
}

/** a sticky moved from one folder to another (dropped on it): the two lists after the move */
export function fileInto(from: Made[], i: number, to: Made[]): { from: Made[]; to: Made[] } | null {
  const m = from[i];
  if (!m) return null;
  return { from: from.filter((_, k) => k !== i), to: [...to, m] };
}

/** teammates for the dock, from Cowork's team.state (never drawn): every member but me, lit when their agent is working
 *  on a session now */
export function matesOf(st: { me?: { login?: string }; members?: string[]; agents?: { of: string; working: boolean }[] } | null): Mate[] {
  if (!st?.members?.length) return [];
  const me = (st.me?.login ?? "").toLowerCase();
  return st.members.filter((m) => m.toLowerCase() !== me).slice(0, 6).map((m) => ({ name: m, on: !!st.agents?.some((a) => a.of.toLowerCase() === m.toLowerCase() && a.working) }));
}
