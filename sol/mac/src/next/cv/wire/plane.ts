// owned by slice 1 (Plane), docs/port/slices.md
// The engine's messages the plane reads into D, live only (the fixture never runs a wire). Today's "yes" wires
// (docs/port/map.md rows 2, 15, "Middle"): work.sessions (each project a Build folder, each session a piece of kind
// session), work.run (a session's busy, waiting and cost), home.places (each top folder a Life folder). Slice 7's
// next.state and next.pos are read when they come (the person's places); until then every place is the rule's, laid out
// again when what is on the plane changes, so nothing is stored and nothing is written (switch.md, "carried, never
// converted"). The plane's one act on the engine today is work.stop (moves/plane.ts holds `link` for it).
// Signed: marcocyl04-ux's agent, the port's slice 1 (#1615).
import { D, S, change, hooks, type Piece, type Pos, type Region } from "../core.ts";
import type { Engine } from "./types.ts";

/** the engine, while the new face is open in a real Sol (moves/plane.ts sends work.stop through it) */
export const link: { e: Engine | null } = { e: null };

type Row = { id: string; title?: string; cwd?: string; project?: string; branch?: string; worktree?: string; gone?: boolean; archived?: boolean; done?: boolean };
type Proj = { path: string; name: string };
type Place = { id: string; name: string; parent?: string };
type Run = { sessionId: string; busy?: boolean; waiting?: number; cost?: number; model?: string; failed?: boolean; tasks?: string[] };

const base = (p?: string) => String(p || "").split("/").filter(Boolean).pop() || "";

/** work.sessions → the Build folders and their sessions (pure: what to put in D, given the message) */
export function fromSessions(m: { sessions?: Row[]; projects?: Proj[] }): { regions: Region[]; pieces: Piece[] } {
  const regions: Region[] = [], pieces: Piece[] = [], seen = new Set<string>();
  for (const p of m.projects || []) { const id = "w:" + p.path; if (seen.has(id)) continue; seen.add(id); regions.push({ id, name: p.name || base(p.path), kind: "code", from: "work" }); }
  for (const s of m.sessions || []) {
    if (s.gone || s.archived) continue;
    const rid = "w:" + (s.project || s.cwd || "");
    if (!seen.has(rid)) { seen.add(rid); regions.push({ id: rid, name: base(s.project || s.cwd) || "sessions", kind: "code", from: "work" }); }
    const copy = s.branch || base(s.worktree || s.cwd) || "main";
    pieces.push({ id: s.id, sessionId: s.id, region: rid, kind: "session", name: s.title || copy, ai: s.title || "Claude", copy, branch: s.branch || copy, files: 0,
      state: s.done ? "done" : "working", term: { lines: [], waiting: null, stateWord: s.done ? "done" : "" }, talk: [], from: "work" });
  }
  return { regions, pieces };
}
/** home.places → the Life folders: the top ones only (a sub-folder is inside its folder, not a folder of the plane) */
export function fromPlaces(m: { places?: Place[] }): Region[] {
  return (m.places || []).filter((p) => !p.parent).map((p) => ({ id: "h:" + p.id, name: p.name, kind: "life" as const, from: "places" }));
}

/** what the plane holds changed: the rule lays it out again; the person's places (by "person") stay where they are */
function relayout(): void {
  if (!D.pos) D.pos = {};
  const ids = new Set([...D.regions.map((r) => r.id), ...Object.keys(D.pieces)]);
  for (const [id, q] of Object.entries(D.pos)) if (q.by === "rule" || !ids.has(id)) delete D.pos[id];
  const followed = S.cam === S.camRule;
  hooks.layout?.();
  if (followed || !S.camSet) hooks.settleCam?.();
}

export function attach(e: Engine): void | (() => void) {
  link.e = e;
  const runs: Record<string, Run> = {};
  const applyRun = (r: Run) => {
    const p = D.pieces[r.sessionId];
    if (!p || p.kind !== "session") return;
    const working = !!r.busy || !!r.tasks?.length;
    p.state = r.failed ? "failed" : working ? "working" : p.state === "done" ? "done" : "idle";
    p.term = { lines: p.term?.lines ?? [], waiting: r.waiting ? "waits for you" : null, stateWord: r.failed ? "failed" : working ? "working" : "idle" };
    if (r.cost != null) p.cost = r.cost;
    if (r.model) p.model = r.model;
  };
  const off = e.subscribe((m: { type?: string; [k: string]: unknown }) => {
    if (m.type === "work.sessions") change((d) => {
      const got = fromSessions(m as never);
      d.regions = [...d.regions.filter((r) => r.from !== "work"), ...got.regions];
      for (const [id, p] of Object.entries(d.pieces)) if (p.from === "work") delete d.pieces[id];
      for (const p of got.pieces) d.pieces[p.id] = p;
      for (const r of Object.values(runs)) applyRun(r);
      relayout();
    });
    else if (m.type === "work.run") change(() => { const r = m as unknown as Run; runs[r.sessionId] = r; applyRun(r); });
    else if (m.type === "home.places") change((d) => { d.regions = [...d.regions.filter((r) => r.from !== "places"), ...fromPlaces(m as never)]; relayout(); });
    // slice 7's, when the engine has them: the person's places, kept beside the old stores
    else if (m.type === "next.state" && m.pos && typeof m.pos === "object") change((d) => { d.pos = { ...(d.pos || {}), ...(m.pos as Record<string, Pos>) }; relayout(); });
    else if (m.type === "next.pos" && typeof m.id === "string") change((d) => { d.pos = { ...(d.pos || {}), [m.id as string]: m as unknown as Pos }; });
  });
  e.send({ type: "work.list" });
  e.send({ type: "home.places" });
  return () => { off(); link.e = null; };
}
