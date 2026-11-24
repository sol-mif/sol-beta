// owned by slice 1 (Plane), docs/port/slices.md
// The engine's messages the plane reads into D, live only (the fixture never runs a wire). Today's "yes" wires
// (docs/port/map.md rows 2, 15, "Middle"): work.sessions (each project a Build folder, each session a piece of kind
// session), work.run (a session's busy, waiting and cost), home.places (each top folder a Life folder). Slice 7's
// next.state and next.pos are read when they come (the person's places); until then every place is the rule's, laid out
// again when what is on the plane changes, so nothing is stored and nothing is written (switch.md, "carried, never
// converted"). The plane's one act on the engine today is work.stop (moves/plane.ts holds `link` for it).
// Signed: marcocyl04-ux's agent, the port's slice 1 (#1615).
import { D, M, S, change, hooks, lostHere, ready, render, type Piece, type Pos, type Region } from "../core.ts";
import { said } from "../../bar/undo.ts";
import type { Engine } from "./types.ts";
import { keptPlace, isOff } from "../../plane/layout.ts";
import { OPENING_MS, canvasAttached, sessionsHeard } from "../../place.ts";
import { archivedFrom, heardArchived, holderIds } from "../../holders/model.ts";
import { live } from "../../movein/state.ts";

/** the engine, while the new face is open in a real Sol (moves/plane.ts sends work.stop through it) */
export const link: { e: Engine | null } = { e: null };

type Row = { id: string; title?: string; cwd?: string; project?: string; branch?: string; worktree?: string; gone?: boolean; archived?: boolean; done?: boolean; createdAt?: number; updatedAt?: number; seat?: "codex" };
type Proj = { path: string; name: string };
type Place = { id: string; name: string; parent?: string; from?: { source?: string; ref?: string } };
type Run = { sessionId: string; busy?: boolean; waiting?: number; cost?: number; model?: string; failed?: boolean; tasks?: string[] };

const base = (p?: string) => String(p || "").split("/").filter(Boolean).pop() || "";

/** work.sessions → the Build folders and their sessions (pure: what to put in D, given the message) */
export function fromSessions(m: { sessions?: Row[]; projects?: Proj[] }): { regions: Region[]; pieces: Piece[] } {
  const regions: Region[] = [], pieces: Piece[] = [], seen = new Set<string>();
  for (const p of m.projects || []) { const id = "w:" + p.path; if (seen.has(id)) continue; seen.add(id); regions.push({ id, name: p.name || base(p.path), kind: "code", from: "work", path: p.path }); }
  for (const s of m.sessions || []) {
    if (s.gone || s.archived) continue;
    const rid = "w:" + (s.project || s.cwd || "");
    if (!seen.has(rid)) { seen.add(rid); regions.push({ id: rid, name: base(s.project || s.cwd) || "sessions", kind: "code", from: "work" }); }
    const copy = s.branch || base(s.worktree || s.cwd) || "main";
    pieces.push({ id: s.id, sessionId: s.id, region: rid, kind: "session", name: s.title || copy, ai: s.title || "Claude", copy, branch: s.branch || copy,   // no files: no engine message gives a session's changed files yet (place.ts counts.files)
      state: s.done ? "done" : "idle", term: { lines: [], waiting: null, stateWord: s.done ? "done" : "" }, talk: [], from: "work", ...(s.seat === "codex" ? { seat: "codex" } : {}), ...(s.createdAt ? { born: s.createdAt } : {}), ...(s.updatedAt ? { last: s.updatedAt } : {}) });   // last: the Sessions holder's "by when" (BR1 holders.html)   // working only once work.run says so (a fresh Sol read "338 working")
  }
  return { regions: nestByPath(regions), pieces };
}
/** one wire's folders into the list, in place (pure): a folder already there keeps its index, so its colour (the plane's
 *  regionIndex % 4) and its place in the sidebar's order hold across the engine's pushes; a new one comes last, a gone one
 *  leaves. Before, each push put its own wire's folders last (work.sessions after home.places, then the reverse), and the
 *  engine lists a wire's projects latest first, so the sidebar's Folders changed order and colour as sessions ran (BR1
 *  18:20, builder G) */
export function mergeRegions(old: Region[], from: string, got: Region[]): Region[] {
  const by = new Map(got.map((r) => [r.id, r]));
  const out = old.flatMap((r) => (r.from !== from ? [r] : by.has(r.id) ? [by.get(r.id)!] : []));
  const have = new Set(out.map((r) => r.id));
  return [...out, ...got.filter((r) => !have.has(r.id))];
}
/** BR1 first-timer P 3 (#1615): a place that holds everything is never a folder's parent: the person's home, Sol's own
 *  home (SOL_HOME, from the move-in read), an app's storage (~/Library, ~/AppData, a dot folder in the home) and a sync
 *  root (iCloud Drive, Dropbox, Google Drive, OneDrive); a project inside one sits at the top */
const sol = { home: "" };
export const setSolHome = (p: string) => { sol.home = p.replace(/\/+$/, ""); };
/** Sol's own home, once the move-in read or next.state said it ("" before) */
export const solHome = () => sol.home;
export function holdsAll(path: string): boolean {
  const p = path.replace(/\/+$/, ""), home = /^\/(?:Users|home)\/[^/]+/.exec(p)?.[0];
  if (!p || p === "/" || p === "/Users" || p === "/home" || p === home || (sol.home && p === sol.home)) return true;
  if (!home) return false;
  const rest = p.slice(home.length + 1);
  return /^(Library|AppData|\.[^/]+)(\/|$)/.test(rest) || /^(Dropbox|Google Drive|OneDrive[^/]*|iCloud Drive|Box)$/.test(rest);
}
/** BR1, folders in folders: a project whose path lies inside another project's sits in the nearest such one, by rule
 *  ("~/code/shop/api" in "~/code/shop"); one at the top stays there, and so does one whose only outer holds everything
 *  (holdsAll) (pure) */
export function nestByPath(rs: Region[]): Region[] {
  const paths = rs.filter((r) => typeof r.path === "string" && r.path && !holdsAll(String(r.path))).map((r) => ({ id: r.id, p: String(r.path).replace(/\/+$/, "") }));
  // a folder of Sol's home sits only in another of that home, never in what holds the home (a Sol developer's checkout,
  // #1816)
  const inSol = (p: string) => !!sol.home && p.startsWith(sol.home + "/");
  return rs.map((r) => {
    const mine = typeof r.path === "string" ? r.path.replace(/\/+$/, "") : "";
    const outer = mine ? paths.filter((o) => o.id !== r.id && o.p && mine.startsWith(o.p + "/") && (!inSol(mine) || inSol(o.p))).sort((a, b) => b.p.length - a.p.length)[0] : undefined;
    return outer ? { ...r, parent: outer.id, parentBy: "rule" as const } : r;
  });
}
/** BR1 first-timer P 3 (#1615): no nesting is silent. A folder the rule put inside another for the first time is said on
 *  the frame's line, with Back: every such folder out to the top of the canvas, the person's own place from then on.
 *  Said once per folder and parent (kept in this window's storage), so a reload says nothing new */
const TOLD = "sol.next.nest.told";
/** only what the canvas draws inside another (BR1 hold 1, the banner count): a parent the one list no longer holds (a
 *  "sol" of another checkout, read before the list came) draws the folder at the top, and a folder on the Shelf, or
 *  inside one, is off the canvas; neither is said */
export function newNests(rs: readonly Region[], told: ReadonlySet<string>, off: (id: string) => boolean = () => false): { id: string; name: string; into: string; copy?: true }[] {
  const by = new Map(rs.map((r) => [r.id, r]));
  const drawn = (id: string) => { for (let r = by.get(id), n = 0; r && n < 16; r = r.parent ? by.get(r.parent) : undefined, n++) if (off(r.id)) return false; return true; };
  return rs.filter((r) => r.parent && r.parentBy === "rule" && r.parent !== r.id && by.has(r.parent) && drawn(r.id) && !told.has(`${r.id}>${r.parent}`))
    .map((r) => ({ id: r.id, name: r.name, into: by.get(r.parent!)!.name, ...(r.copy ? { copy: true as const } : {}) }));
}
/** a copy (another checkout of the repo, BR1 order 4e) is said as one, never "as on your disk" */
export const nestWords = (n: { name: string; into: string; copy?: true }[]) => {
  const why = n.every((x) => x.copy) ? (n.length === 1 ? ": another copy of it on your disk" : ": other copies of it on your disk") : n.some((x) => x.copy) ? "" : ", as on your disk";
  const one = new Set(n.map((x) => x.into)).size === 1;
  return n.length === 1 ? `${n[0].name} is inside ${n[0].into} now${why}`
    : one ? `${n.length} folders are inside ${n[0].into} now${why}`
      : `${n.length} folders are inside others now${why.startsWith(":") ? ": other copies on your disk" : why}`;
};
export function tellNests(): void {
  if (live.words) return;   // the person said where each folder goes (#1816 round 2): nothing moved by a rule to tell
  let told: Set<string>;
  try { told = new Set(JSON.parse(globalThis.localStorage?.getItem(TOLD) || "[]")); } catch { told = new Set(); }
  const n = newNests(D.regions, told, isOff);
  if (!n.length) return;
  for (const x of n) told.add(`${x.id}>${D.regions.find((r) => r.id === x.id)!.parent}`);
  try { globalThis.localStorage?.setItem(TOLD, JSON.stringify([...told])); } catch { /* a window with no storage says it again next time */ }
  said(nestWords(n), () => { for (const x of n) M.nest?.(x.id, null); });
}

/** home.places → the Life folders, each sub-folder inside its folder (BR1, folders in folders: before, only the top ones) */
export function fromPlaces(m: { places?: Place[] }): Region[] {
  const ids = new Set((m.places || []).map((p) => p.id));
  // its folder on disk, so the move-in's tree finds it as the one folder it is (#1816, place.ts listed); a place of the
  // person's Things only (from "you") has none
  return (m.places || []).map((p) => ({ id: "h:" + p.id, name: p.name, kind: "life" as const, from: "places",
    ...(p.from?.source === "files" && p.from.ref ? { path: p.from.ref } : {}),
    ...(p.parent && p.parent !== p.id && ids.has(p.parent) ? { parent: "h:" + p.parent, parentBy: "rule" as const } : {}) }));
}

/** what the plane holds changed: the rule lays it out again; the person's places (by "person") stay where they are, and
 *  one dropped while its folder was away comes back with it (layout.ts keptPlace) */
function relayout(): void {
  if (!D.pos) D.pos = {};
  const ids = new Set([...D.regions.map((r) => r.id), ...Object.keys(D.pieces), "diary", ...holderIds()]);   // the Diary is a piece with a place (BR1), and so is a holder (holders.html)
  for (const [id, q] of Object.entries(D.pos)) if (q.by === "rule" || !ids.has(id)) delete D.pos[id];
  // under the person's tree this redraw is half way (their folders come back with the move-in's, movein/live.ts), so
  // only that one judges whether the view's folder is gone: judged here, every work.sessions closed the open tab
  const followed = S.cam === S.camRule, lost = live.folders.length ? false : lostHere();
  hooks.layout?.();
  if (followed || !S.camSet || lost) hooks.settleCam?.();
}

/** the move-in's lead, on its message or inside the kept answers; undefined when it says nothing */
const leadIn = (m: Record<string, unknown>): "day" | "work" | "both" | null | undefined => { const v = m.lead ?? (m.movein as Record<string, unknown> | undefined)?.lead; return v === "day" || v === "work" || v === "both" || v === null ? v : undefined; };

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
    // Sol's own home, where the move-in read finds its top folders: never a folder's parent (holdsAll)
    if ((m.type === "next.movein" || m.type === "next.state") && Array.isArray(m.places)) {
      const top = (m.places as { path?: string; from?: string; parent?: string }[]).find((p) => p.from === "home" && !p.parent && p.path);
      if (top) setSolHome(top.path!.slice(0, top.path!.lastIndexOf("/")));
    }
    if (m.type === "work.sessions") change((d) => {
      sessionsHeard();   // from here a folder with nothing in it may say so (place.ts)
      const got = fromSessions(m as never);
      heardArchived(archivedFrom(m as never));   // the archived ones, for Sessions › Archived (BR1 holders.html)
      d.regions = mergeRegions(d.regions, "work", got.regions);
      for (const [id, p] of Object.entries(d.pieces)) if (p.from === "work") delete d.pieces[id];
      for (const p of got.pieces) d.pieces[p.id] = p;
      for (const r of Object.values(runs)) applyRun(r);
      relayout();   // its nests are said by the move-in's wire, once the one list is applied (BR1 hold 1)
    });
    else if (m.type === "work.run") change(() => { const r = m as unknown as Run; runs[r.sessionId] = r; applyRun(r); });
    else if (m.type === "home.places") change((d) => { d.regions = mergeRegions(d.regions, "places", fromPlaces(m as never)); relayout(); });
    // slice 7's, when the engine has them: the person's places, kept beside the old stores
    else if (m.type === "next.state" && m.pos && typeof m.pos === "object") change((d) => { for (const [id, q] of Object.entries(m.pos as Record<string, Pos>)) keptPlace(id, q); d.pos = { ...(d.pos || {}), ...(m.pos as Record<string, Pos>) }; relayout(); });
    else if (m.type === "next.pos" && typeof m.id === "string") change((d) => { keptPlace(m.id as string, m as unknown as Pos); d.pos = { ...(d.pos || {}), [m.id as string]: m as unknown as Pos }; });
    // BR1 (#1615): what the move-in said leads (day, work or both), kept by its helper in movein.json and read as optional;
    // the starting arrangement follows it while nothing on the plane is the person's (plane/layout.ts startArrangement)
    else if ((m.type === "next.movein" || m.type === "next.movein.kept") && leadIn(m) !== undefined) change((d) => { d.movein = { ...((d.movein as object) || {}), lead: leadIn(m) }; relayout(); });
  });
  // the person's places are kept by the engine (next.pos.set, pos.ts): moving, folding and resizing work live now
  ready("place");
  canvasAttached();
  const giveUp = setTimeout(render, OPENING_MS + 50);   // "Opening your canvas…" goes at its ceiling even with nothing heard
  e.send({ type: "next.state" });
  e.send({ type: "work.list" });
  e.send({ type: "home.places" });
  return () => { clearTimeout(giveUp); off(); link.e = null; sessionsHeard(false); };
}
