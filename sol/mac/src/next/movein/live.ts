// The move-in, live (BR1, #1615; mine/look/br1/movein.html): the engine's read (next.movein: carry.ts, carry-apps.ts)
// made into the screen's rows, and what the person chose sent back and applied to the folders the plane draws.
//   rows      a place: id "h:<id>" for the Sol home's (as the plane's home.places), "w:<path>" for a work folder and for a
//             Claude Code or Codex project (as the plane's work.sessions), so a choice lands on the folder drawn; its
//             small line "~/code/api · 38 sessions", what Sol learned of it ("A repo", "Claude Code works here", "Has CLAUDE.md")
//             chips under it (known.ts ofFound). A project with no code is a folder like the rest: Sol asks nothing
//             about what kind it is (the zone question is gone, BR1 #1615). An app is one row
//             under Your AIs ("6 skills · 3 connected tools (names only) · asks before it edits"), nothing to fix or drop
//   kept      next.movein.keep { keep, fix: { <id>: { name? } }, drop }; each kept app
//             project becomes a folder of Sol's (work.folder add, the path the read gave), so it stays when its sessions go
//   applied   after every work.sessions, home.places and next.state: a fixed name, a drop (the folder out of
//             the plane; nothing is deleted anywhere), then the rule lays the plane out again
// Nothing here writes to Claude Code or Codex: the engine only reads them. Signed: marcocyl04-ux's agent, BR1 (#1615).
import { D, MODE, S, change, hooks, lostHere, M, render } from "../cv/core.ts";
import { apply, blank, copy, gone, linesOf, nm, zoneOf, type Choices, type Person, type Row, type Unsure } from "./data.ts";
import { homeDirOf, listed, tilde, type KeptFolder } from "../place.ts";   // BR1 root part 2: which folders, a path in one form
import { DONE, EDIT, LIVE, live, st } from "./state.ts";
import { readHeard, sup } from "./startup-state.ts";
import { note } from "../people/diary.ts";
import { said } from "../bar/undo.ts";
import type { Engine } from "../cv/wire/types.ts";
import type { Found } from "../known.ts";
import { migKeep, planOf, type Judged } from "./plan.ts";

type App = "claude" | "codex";
type Place = {
  id: string; name: string; path: string; parent?: string; from: "home" | "work" | App | "said"; kind: "build" | "life" | null;
  /** read 2 (engine carry-said.ts): the person's own day-to-day words, as written, that name this folder */
  said?: string[];
  holds?: { repo?: boolean; code?: boolean; stickies?: number; things?: number }; label?: string; rules?: string[]; sessions?: Partial<Record<App, number>>;
  /** another checkout of the repo at this path (engine carry-apps.ts copiesOf) */
  copyOf?: string;
};
type Ai = { id: string; name: string; job?: string; app?: App; skills?: string[]; tools?: string[]; mode?: string };
type Kept = { keep?: string[]; fix?: Record<string, Record<string, unknown>>; drop?: string[]; batch?: string } | null;
export type Read = { type?: string; places?: Place[]; ais?: Ai[]; apps?: { app: App; projects: number; sessions: number }[]; kept?: Kept; folders?: unknown; judged?: Judged[] };

const APP: Record<string, string> = { claude: "Claude Code", codex: "Codex" };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const isApp = (f: string): f is App => f === "claude" || f === "codex";

/** the engine, while a real Sol is open (the wire sets it) */
export const link: { e: Engine | null; openOnAnswer: boolean } = { e: null, openOnAnswer: false };

/** a place's row id: the id of the folder the plane draws for it */
export const rowId = (p: Pick<Place, "id" | "path" | "from">) => (p.from === "home" ? "h:" + p.id : "w:" + p.path);

/** the line under a folder: what Sol does with it. How much is in it is the place's to say (place.ts placeOf, the row's
 *  line), never a second count from the read */
function plusOf(p: Place, n: number): string {
  const st = p.holds?.stickies ?? 0, th = p.holds?.things ?? 0;
  if (n) return "its sessions, kept inside it";   // a session lives inside its folder (decision b)
  if (st || th) return `its ${[st ? "stickies" : "", th ? "things" : ""].filter(Boolean).join(" and ")} on this folder`;
  return "";
}

/** the engine's read, as the screen's person */
export function fromRead(m: Read): Person {
  const rows: Row[] = [], unsure: Unsure[] = [], home = homeDirOf(m.places ?? []);
  for (const p of m.places ?? []) {
    if (p.parent) continue;   // a sub-folder is inside its folder, not a folder of the plane
    const id = rowId(p), n = Object.values(p.sessions ?? {}).reduce((a: number, b) => a + (b ?? 0), 0), app = isApp(p.from);
    // what it holds, its AIs and its rules files are facts (known.ts ofFound), chips under the row; the line keeps where (how many is the place's line, place.ts placeOf)
    // another checkout of a repo listed here: its row names the repo's, and its folder stands inside that one (BR1 order 4e)
    const of = p.copyOf ? (m.places ?? []).find((q) => q !== p && !q.parent && q.path === p.copyOf) : undefined;
    const found: Found = { id: p.id, place: id, app, ...(p.holds ? { holds: p.holds } : {}), ...(p.rules ? { rules: p.rules } : {}), ...(p.sessions ? { sessions: p.sessions } : {}), ...(of ? { copyOf: of.name } : {}) };
    const where = p.from === "home" ? "in your Sol home" : home ? tilde(p.path, home) : p.label ?? p.path;
    const small = where, plus = plusOf(p, n);
    // what the read saw (a repo, code) goes with the row for the plane; with nothing seen there is nothing to ask
    const z = p.kind === "life" ? "Life" : p.kind === "build" ? "Build" : app ? undefined : p.from === "work" ? "Build" : "Life";
    rows.push({ id, k: "place", n: p.name, ...(z ? { z } : {}), small, ...(plus ? { plus } : {}), sessions: n, path: p.path, ...(app ? { app: p.from } : {}), ...(of ? { copyOf: rowId(of) } : {}), ...(p.said?.length ? { said: p.said } : {}), found });
  }
  for (const a of m.ais ?? []) {
    if (a.app) rows.push({ id: a.id, k: "ai", n: a.name, app: a.app, locked: true,
      small: [plural(a.skills?.length ?? 0, "skill"), `${plural(a.tools?.length ?? 0, "connected tool")} (names only)`, a.mode].filter(Boolean).join(" · "),
      plus: "every session it runs, in any folder, answered from one place: Waiting on you" });
    else rows.push({ id: a.name, k: "ai", n: a.name, seat: "Sol", rt: a.job || "", small: a.job ? `in Sol · ${a.job}` : "in Sol" });
  }
  const apps = (m.apps ?? []).map((x) => ({ ...x, name: APP[x.app] ?? x.app }));
  // the migration (migration.html C): the judge's own calls as moves and asks, when the engine sent them
  const plan = Array.isArray(m.judged) ? planOf(m.judged, rows) : undefined;
  return { who: "you", moved: !!m.kept, finished: 0, rows, unsure, apps, live: true, ...(plan ? { plan } : {}) };
}

/** what was kept (next.movein.json), as the screen's choices */
export function choicesOf(k: Kept, p: Person): Choices {
  const c = blank();
  for (const id of k?.drop ?? []) if (p.rows.some((r) => r.id === id)) c.drop[id] = 1;
  for (const [id, f] of Object.entries(k?.fix ?? {})) {
    if (typeof f.name === "string" && f.name) c.name[id] = f.name;
  }
  c.seen = 1;
  return c;
}

/** the choices, as next.movein.keep says them */
export function toKeep(p: Person, c: Choices): { keep: string[]; fix: Record<string, Record<string, unknown>>; drop: string[]; apart?: string[]; into?: Record<string, string> } {
  const keep: string[] = [], drop: string[] = [], fix: Record<string, Record<string, unknown>> = {};
  // the migration's answers (plan.ts migKeep): an ask put on the Shelf is a drop; a move changed back, an ask folded in
  const mg = migKeep(p.plan, c), shelved = new Set(mg.drop);
  for (const r of p.rows) {
    ((gone(c, r) || shelved.has(r.id)) && !r.locked ? drop : keep).push(r.id);
    const f: Record<string, unknown> = {};
    if (c.name[r.id] != null && c.name[r.id] !== r.n) f.name = c.name[r.id];
    if (Object.keys(f).length) fix[r.id] = f;
  }
  return { keep, fix, drop, ...(mg.apart.length ? { apart: mg.apart } : {}), ...(Object.keys(mg.into).length ? { into: mg.into } : {}) };
}

/** the plane laid out again by the rule (the person's own places stay), as the plane's wire does */
function relayout(): void {
  if (!D.pos) D.pos = {};
  const ids = new Set([...D.regions.map((r) => r.id), ...Object.keys(D.pieces)]);
  for (const [id, q] of Object.entries(D.pos)) if (q.by === "rule" || !ids.has(id)) delete D.pos[id];
  const followed = S.cam === S.camRule, lost = lostHere();
  hooks.layout?.();
  if (followed || !S.camSet || lost) hooks.settleCam?.();
}

/** the choices made, applied to the folders the plane draws now (after each message that redraws them); which folders
 *  are drawn is the place's rule (place.ts listed) */
export function applyLive(): void {
  const p = live.data[LIVE], c = DONE[LIVE];
  if (MODE !== "live" || (!p && !live.folders.length)) return;
  // under the engine's tree, the move-in's choices draw none but its folders (#1816)
  const tree = live.folders.length ? new Set(live.folders.map((f) => f.id)) : undefined;
  change((d) => { listed(d, p ? p.rows.filter((r) => r.k === "place") : [], live); if (p && c) apply(d, p, c, tree); relayout(); });
}

/** the move-in's answers as the engine keeps them now (`movein` on next.state and next.movein.kept): the choices applied
 *  to the plane follow, so a folder kept again (the Shelf's Take back) is never removed by an older choice (BR1 order 2) */
export function movedHeard(k: unknown): void {
  const at = (k as { at?: unknown } | null)?.at;
  if (typeof at === "number" && at > 0) live.movedAt = at;
  // the person's words set their folders (#1816 round 2): only the tree is drawn from now on, the rest not sorted yet
  const words = !!k && typeof k === "object" && !!(k as { said?: unknown }).said;
  if (words !== live.words) { live.words = words; live.unsorted.clear(); }
  const p = live.data[LIVE];
  if (!p || EDIT[LIVE] || !k || typeof k !== "object" || !Array.isArray((k as { drop?: unknown }).drop)) return;
  DONE[LIVE] = choicesOf(k as Kept, p);
}

/** the canvas holds the one list: the read or the engine's list has come (outside live, always); before, the plane holds
 *  every folder work.sessions names, so nothing it nests is said yet (BR1 hold 1, the banner count) */
export const listHeard = (): boolean => MODE !== "live" || !!live.data[LIVE] || live.folders.length > 0;

/** how many folders are kept, for Settings' "Add your files and AI chats": live the engine's one list (next.state's
 *  `folders`), the number the canvas and the sidebar read, never the move-in's rows with its AIs and chats among them
 *  (BR1 hold H4: "15 kept" beside 13 folders); outside live the folders the move-in keeps. null: nothing kept is known */
export function keptN(p: Person | undefined, c: Choices | undefined): number | null {
  if (MODE === "live") return live.folders.filter((f) => !f.by).length || null;   // a parent only the disk added is not kept
  return p && c ? p.rows.filter((r) => r.k === "place" && !gone(c, r)).length : null;
}

/** the engine's tree of the person's folders (`folders` on next.state, next.movein and next.movein.kept, engine
 *  next/tree.ts): each is drawn where the tree puts it; the kept are those but a parent only the disk added (`by`) */
export function foldersHeard(v: unknown): void {
  if (!Array.isArray(v)) return;
  live.folders = v.filter((f): f is KeptFolder => !!f && typeof f.id === "string" && /^[wh]:./.test(f.id) && typeof f.name === "string")
    .map((f) => ({ id: f.id, name: f.name.slice(0, 200), ...(typeof f.path === "string" ? { path: f.path } : {}), ...(typeof f.real === "string" ? { real: f.real } : {}),
      ...(typeof f.parent === "string" ? { parent: f.parent } : {}), ...(f.by === "disk" ? { by: "disk" as const } : {}),
      ...(Array.isArray(f.also) ? { also: f.also.filter((a): a is string => typeof a === "string").slice(0, 50) } : {}) }));
  live.kept = live.folders.filter((f) => !f.by).map((f) => f.id);
  const p = live.data[LIVE];
  if (p) keptRows(p, live.folders.filter((f) => !f.by));
}

/** every folder kept is a row of "Here's what you already have", read or not: one the read no longer finds (an empty Sol
 *  home folder, a project gone quiet) stays kept and drawn, so the page lists it beside the read's, after them (BR1 hold
 *  H4: "12 folders" there beside Settings' "13 folders kept", life missing). A row is never taken away here: one the
 *  person removes stays as removed, with Bring back */
export function keptRows(p: Person, folders: KeptFolder[]): void {
  const has = new Set(p.rows.map((r) => r.id)), add = folders.filter((f) => !has.has(f.id));
  if (!add.length) return;
  const home = homeDirOf(p.rows.flatMap((r) => (r.path ? [{ path: r.path }] : [])));
  const rows: Row[] = add.map((f) => {
    const w = f.id.startsWith("w:"), path = f.path ?? (w ? f.id.slice(2) : undefined);
    return { id: f.id, k: "place", n: f.name, z: w ? "Build" : "Life", small: w && path ? tilde(path, home) : "in your Sol home", sessions: 0, ...(path ? { path } : {}) };
  });
  const at = p.rows.reduce((n, r, i) => (r.k === "place" ? i + 1 : n), 0);
  p.rows.splice(at, 0, ...rows);
}

/** the engine's answer to next.movein.read */
export function heard(m: Read): void {
  const p = fromRead(m);
  live.data[LIVE] = p; live.ready = true; live.answered = true; live.at ||= Date.now(); live.kept = m.kept?.keep ?? live.kept; live.batch = m.kept?.batch ?? null;
  foldersHeard(m.folders);
  if (m.kept && !EDIT[LIVE]) DONE[LIVE] = choicesOf(m.kept, p);
  const first = !m.kept && !live.asked && (p.apps?.length ?? 0) > 0 && p.rows.some((r) => r.k === "place");
  const open = link.openOnAnswer || first;
  link.openOnAnswer = false; live.asked = true;
  applyLive();
  render();
  // the first-launch start-up (startup.ts) holds the screen until its "Let’s move in", which opens it
  if (open && st.open !== LIVE && !sup.up) M.move_in(LIVE);
  readHeard();
}

/** ask the engine to read again; `open`: the screen opens when it answers (Settings › Bring in what you have). False
 *  when nothing went out (no link, or the socket not open: socket.ts queues nothing) */
export function askRead(open = false): boolean {
  if (!link.e) return false;
  link.openOnAnswer = open;
  return link.e.send({ type: "next.movein.read" }) !== false;
}

/** the link is up again (wire movein.ts, on every "open"): what went out on the old link was lost with it and nothing
 *  asked there is answered on the new one, so a read never answered, or one the start-up still waits for, is asked
 *  again, once (the start-up then owes that one answer). Isaac's update, 2026-11-25: the read went out while the engine
 *  renewed itself, and "Having a look around…" waited for it for ever */
export function relinked(): void {
  if (!link.e) return;
  if (sup.words && !sup.told) sup.told = link.e.send({ type: "next.you.day", words: sup.words }) !== false;
  if (live.answered && sup.owed === 0) return;
  if (sup.owed > 0) sup.owed = 1;
  askRead(link.openOnAnswer);
}

/** These are mine, live: the choices kept by the engine, each kept app project a folder of Sol's, then applied */
export function keepLive(c: Choices): void {
  const p = live.data[LIVE];
  if (!p) return;
  const e = link.e;
  e?.send({ type: "next.movein.keep", ...toKeep(p, c) });
  for (const r of p.rows) if (r.k === "place" && r.app && r.path && !gone(c, r)) e?.send({ type: "work.folder", op: "add", path: r.path });
  for (const l of linesOf(LIVE, p, c)) note({ who: "person", kind: "decided", key: l.key, what: l.what, why: l.why });
  applyLive();
  e?.send({ type: "work.list" }); e?.send({ type: "home.places" });   // the folders drawn again (a drop undone comes back)
}

/** the move-in's one Back, live (BR1 item 7): every placement of the last keep's batch out and the answers as they were
 *  before it (next.movein.back); false when there is no batch to take back */
export function backLive(): boolean {
  if (!link.e || !live.batch) return false;
  link.e.send({ type: "next.movein.back", batch: live.batch });
  return true;
}
export const AGAIN = "You’ve changed things yourself since moving in, so it can’t all go back at once: here is what Sol reads now, to choose again";
/** the engine's next.movein.kept: a keep's batch kept; a Back done forgets it; a Back refused (again) opens the read
 *  again, so the person chooses afresh instead of a reset */
export function keptHeard(m: { batch?: unknown; ok?: unknown; again?: unknown; undone?: unknown; movein?: { keep?: unknown } | null; folders?: unknown }): void {
  foldersHeard(m.folders); movedHeard(m.movein);
  if (typeof m.batch === "string" && Array.isArray(m.undone)) { live.batch = null; if (!Array.isArray(m.folders)) live.kept = Array.isArray(m.movein?.keep) ? m.movein.keep : []; return; }
  if (typeof m.batch === "string") { live.batch = m.batch; return; }
  if (m.ok === false && m.again === true) { said(AGAIN, null); askRead(true); }
}

/** a row's line on the folder: "4 folders · 70 sessions · 2 AIs" (the foot of the screen, BR1) */
export function footOf(p: Person, c: Choices): string {
  const kept = p.rows.filter((r) => !gone(c, r));
  const f = kept.filter((r) => r.k === "place").length, s = kept.reduce((n, r) => n + (r.k === "place" ? r.sessions ?? 0 : 0), 0), a = kept.filter((r) => r.k === "ai").length;
  return [plural(f, "folder"), s ? plural(s, "session") : "", a ? plural(a, "AI") : ""].filter(Boolean).join(" · ");
}

export { copy, nm, zoneOf };
