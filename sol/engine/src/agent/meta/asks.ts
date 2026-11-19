// Agents' meta (#1327, the calm pass, 2026-11-17): what needs the person, decided here so the face only draws it.
//   asksOf      every ask once per cause, each with its need. blocked: a sign-in (one ask for every site, a row per site
//               with what it frees), a question about how agents are grouped (a join), a question about its job (a fix:
//               "always like this?"), an older Sol's grouping worked out again ("9 → 3", meta/regroup.ts); these stand on the floor, ranked (rule 5), one in front, QUEUED under "Then", the
//               rest "N more", and only these count in "N need you". waits: its work for the person (a draft to send,
//               keep or drop, a payment, "Apply…"): a card in Home (the folder's tickets), never on the floor; its
//               agent shows only the count (rule 4).
//   shelvesOf   past CAST agents, shelves by place; a shelf with a blocked ask opens by itself (rule 7).
// Pure: list() (agents.ts) hands in what it read.
import { CAST, DAY_MS, DUE_MS, QUEUED, RANK_DUE, RANK_FREED } from "./numbers.js";

export type Need = "blocked" | "waits";
export type Stop = { site: string; folder: string; rule: string; since: number; next?: number };
export type SiteRow = { site: string; folder: string; rule: string; frees: string[] };
export type JoinIn = { id: string; names: string[]; at: string; inPlace?: boolean };
export type Ask =
  | { need: "blocked"; kind: "signin"; id: "signin"; title: string; sites: SiteRow[]; freed: number; score: number }
  /** `where`: the place of two steps asked about (an in-place join), for the row's small line */
  | { need: "blocked"; kind: "join"; id: string; title: string; join: string; freed: number; score: number; where?: string }
  | { need: "blocked"; kind: "fix"; id: string; title: string; agent: string; freed: number; score: number }
  /** an older Sol's grouping: `before` agents now, `after` once regrouped */
  | { need: "blocked"; kind: "regroup"; id: "regroup"; title: string; before: number; after: number; freed: number; score: number }
  | { need: "waits"; kind: "work"; id: string; title: string; folder: string; rule: string; agent: string | null };
export type Blocked = Extract<Ask, { need: "blocked" }>;
export type Waits = Extract<Ask, { need: "waits" }>;

export type AgentIn = { id: string; name: string; stucks: Stop[]; fixes: { at: string }[] };
export type RoutineIn = { folder: string; rule: string; name: string; stuck?: Stop };
export type WorkIn = { ticket: string; title: string; folder: string; rule: string; agent: string | null };

/** the rank (rule 5): agents freed ×RANK_FREED + due within DUE_MS ×RANK_DUE + age in whole days */
export const rankOf = (freed: number, due: boolean, ageDays: number) => freed * RANK_FREED + (due ? RANK_DUE : 0) + Math.max(0, Math.floor(ageDays));
const KIND = { signin: 0, regroup: 1, join: 2, fix: 3 } as const;
export type RegroupIn = { before: number; after: number; at: string };

/** the asks: every cause once with its need; the blocked ones ranked, in front, under "Then" and "N more" */
export function asksOf(x: { agents: AgentIn[]; routines: RoutineIn[]; joins: JoinIn[]; work: WorkIn[]; regroup?: RegroupIn | null }, now: number) {
  const blocked: Blocked[] = [];
  // the sign-ins: one ask; a row per site with who it frees (agents by name, routines by their place)
  const rows = new Map<string, SiteRow & { since: number; next?: number; agents: Set<string> }>();
  const add = (s: Stop, who: string) => {
    const r = rows.get(s.site) ?? { site: s.site, folder: s.folder, rule: s.rule, frees: [], since: s.since || now, agents: new Set<string>() };
    if (!r.frees.includes(who)) r.frees.push(who);
    r.agents.add(who);
    r.since = Math.min(r.since, s.since || now);
    if (s.next && (!r.next || s.next < r.next)) r.next = s.next;
    rows.set(s.site, r);
  };
  for (const a of x.agents) for (const s of a.stucks) add(s, a.name);
  for (const r of x.routines) if (r.stuck) add(r.stuck, r.name);
  if (rows.size) {
    const sites = [...rows.values()];
    const freed = new Set(sites.flatMap((s) => [...s.agents])).size;
    const due = sites.some((s) => s.next !== undefined && s.next - now <= DUE_MS);
    const age = (now - Math.min(...sites.map((s) => s.since))) / DAY_MS;
    blocked.push({ need: "blocked", kind: "signin", id: "signin", title: sites.length === 1 ? `Sign in to ${sites[0].site}` : `Sign in to ${sites.length} sites`,
      sites: sites.map(({ site, folder, rule, frees }) => ({ site, folder, rule, frees })), freed, score: rankOf(freed, due, age) });
  }
  // how they are grouped: an older Sol's grouping is one cause, then each join its own
  if (x.regroup) blocked.push({ need: "blocked", kind: "regroup", id: "regroup", title: `Sol groups agents better now: ${x.regroup.before} → ${x.regroup.after}`, before: x.regroup.before, after: x.regroup.after, freed: 0, score: rankOf(0, false, (now - (Date.parse(x.regroup.at) || now)) / DAY_MS) });
  for (const j of x.joins) blocked.push({ need: "blocked", kind: "join", id: j.id, title: j.inPlace ? "One agent for these two steps?" : `One agent for ${j.names[0]} and ${j.names[1]}?`, join: j.id, freed: 0, score: rankOf(0, false, (now - (Date.parse(j.at) || now)) / DAY_MS), ...(j.inPlace ? { where: j.names[0] } : {}) });
  // its job ("always like this?"): one per agent, answered on its desk
  for (const a of x.agents) if (a.fixes.length) {
    const age = (now - Math.min(...a.fixes.map((f) => Date.parse(f.at) || now))) / DAY_MS;
    blocked.push({ need: "blocked", kind: "fix", id: `fix-${a.id}`, title: `${a.name}: always like this?`, agent: a.id, freed: 0, score: rankOf(0, false, age) });
  }
  blocked.sort((p, q) => q.score - p.score || KIND[p.kind] - KIND[q.kind]);
  const home: Waits[] = x.work.map((w) => ({ need: "waits", kind: "work", id: w.ticket, title: w.title, folder: w.folder, rule: w.rule, agent: w.agent }));
  return { front: blocked[0] ?? null, then: blocked.slice(1, 1 + QUEUED), more: Math.max(0, blocked.length - 1 - QUEUED), need: blocked.length, all: [...blocked, ...home] as Ask[], home };
}

/** past CAST agents, shelves by place (pure): null at CAST or fewer; a shelf with a blocked ask opens, its blocked
 *  agents first, and at most `shown` (CAST) of its cards stand; the rest are "N more" */
export type Shelf = { part: string; agents: string[]; blocked: number; open: boolean; shown: number };
export function shelvesOf(agents: { id: string; part: string }[], blockedIds: Set<string>, max = CAST): Shelf[] | null {
  if (agents.length <= max) return null;
  const parts = [...new Set(agents.map((a) => a.part || "Other"))];
  return parts.map((part) => {
    const xs = agents.filter((a) => (a.part || "Other") === part).map((a) => a.id);
    const first = [...xs.filter((id) => blockedIds.has(id)), ...xs.filter((id) => !blockedIds.has(id))];
    const n = xs.length - xs.filter((id) => !blockedIds.has(id)).length;
    return { part, agents: first, blocked: n, open: n > 0, shown: Math.min(first.length, Math.max(max, n)) };
  });
}
