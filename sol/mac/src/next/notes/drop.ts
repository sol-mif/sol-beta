// The safe drops (BR1, mine/look/br1/sessions.html part 4; Marco's go 12:45). Only two things take a drop: a session (it
// reads what it is given) and a folder (it keeps what is put in it); a piece, the Diary or the empty canvas never do, so
// dragging there only moves things. A target arms only after the pointer rests on it (DWELL_MS): an armed session shows
// a solid ring and "Give to <task> as your next message", an armed folder a dashed outline and "Put in <folder>". Esc,
// or letting go where nothing is armed, changes nothing. A session never arms on a session (no merging), only on another
// folder. A folder dragged (BR1 item 5) arms only on another folder's card it can go in: never itself, one inside it, or
// the folder it is in already. The note's drag (notes/Layer.tsx) and the plane's (plane/index.tsx) both call track / land / stop.
// BR1 inside.html (builder E): a piece of the canvas (a page, a note, a list) arms on a session too, and a session kept
// beside the canvas or its table (data-takes) takes a piece or a note: given, it is on the session's table.
// Signed: marcocyl04-ux's agent, BR1 parts 5 and 6 (#1615).
import { D, M, regionOf } from "../cv/index.ts";
import { ancestors, canNest, parentOf } from "../cv/core.ts";
import { titleOf } from "../plane/layout.ts";
import { sayDrop } from "./read.ts";

export const DWELL_MS = 400;
export type Dragged = { kind: "note" | "session" | "folder" | "piece"; id: string };
export type Target = { kind: "session" | "folder"; to: string; piece?: string; name: string; label: string; rect: { x: number; y: number; w: number; h: number } };
type State = { armed: Target | null; at: { x: number; y: number } | null; what?: Dragged | null };

let state: State = { armed: null, at: null, what: null };
let near: string | null = null, timer: ReturnType<typeof setTimeout> | null = null, keys: ((e: KeyboardEvent) => void) | null = null;
const subs = new Set<() => void>();
const set = (s: Partial<State>) => { state = { ...state, ...s }; subs.forEach((f) => f()); };
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const snapshot = () => state;

const box = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };

/** what would take this drop under the pointer, by the rules above; null for a piece, the Diary, the canvas, itself */
export function targetAt(x: number, y: number, what: Dragged): Target | null {
  if (typeof document === "undefined" || !document.elementsFromPoint) return null;
  const own = what.kind === "session" ? D.pieces[what.id] : undefined;
  // a folder dragged: its own card, the folders and pieces inside it move with it and never take it
  const mine = (rid: string | undefined) => what.kind === "folder" && !!rid && (rid === what.id || ancestors(rid).includes(what.id));
  for (const el of document.elementsFromPoint(x, y)) {
    if (el.closest("[data-note], .nt-arm, .nt-tip")) continue;   // the dragged note and the marks themselves
    if (el.closest(".pl-diary, [data-zone-go='diary']")) return null;
    // BR1 inside.html §2-3 (builder E): a session kept beside the canvas, or its table as a tab, takes a note or a piece
    const tk = el.closest("[data-takes]") as HTMLElement | null;
    if (tk?.dataset.takes) {
      const p = D.pieces[tk.dataset.takes];
      if (!p || p.kind !== "session" || (what.kind !== "note" && what.kind !== "piece")) return null;
      const t = tk.dataset.takesName || titleOf(p), host = tk.closest("[data-kept]") ?? tk;
      return { kind: "session", to: String(p.sessionId ?? p.id), piece: p.id, name: t, label: sayDrop({ kind: "session", name: t }), rect: box(host) };
    }
    const pc = el.closest("[data-piece]") as HTMLElement | null;
    if (pc?.dataset.piece) {
      const p = D.pieces[pc.dataset.piece];
      if (what.kind === "session" && pc.dataset.piece === what.id) continue;   // the session being dragged
      if (mine(p?.region)) continue;
      if (what.kind === "folder") return null;      // a folder goes in a folder, never a piece
      if (what.kind === "piece" && pc.dataset.piece === what.id) continue;   // the piece being dragged
      if (!p || p.kind !== "session") return null;   // a piece never takes a drop
      if (what.kind === "session") return null;      // a session on a session: no merging
      const t = titleOf(p);
      return { kind: "session", to: String(p.sessionId ?? p.id), piece: p.id, name: t, label: sayDrop({ kind: "session", name: t }), rect: box(pc) };
    }
    // a folder by its card, its name, or its ground when it is not the one the person is in (that ground is the canvas)
    const fo = (el.closest(".pl-card[data-region], .pl-lab") ?? el.closest(".pl-area[data-area]:not(.pl-here)")) as HTMLElement | null;
    const rid = fo ? (fo.dataset.region || fo.dataset.area || (fo.closest(".pl-area") as HTMLElement | null)?.dataset.area) : undefined;
    if (rid && what.kind === "piece") return null;   // a piece goes in a folder by where it is let go (the plane's place)
    if (rid) {
      const r = regionOf(rid);
      if (mine(rid)) continue;
      if (!r || (own && own.region === rid)) return null;   // a session over its own folder only moves
      if (what.kind === "folder" && (parentOf(what.id) === rid || !canNest(what.id, rid))) return null;   // in it already, or too deep
      const label = what.kind === "folder" ? `Let go to put it in ${r.name}` : sayDrop({ kind: "folder", name: r.name });
      return { kind: "folder", to: rid, name: r.name, label, rect: box(fo!.closest(".pl-area") ?? fo!) };
    }
  }
  return null;
}

/** every place on screen that would take this drag, by the same rules as targetAt (BR1 inside.html, the second moment:
 *  while anything is dragged each lights up and says its verb): sessions on the canvas and the one kept beside it for a
 *  note or a piece, folders for a note, a session or a folder; never the thing itself */
export function takers(what: Dragged): Target[] {
  if (typeof document === "undefined") return [];
  const out: Target[] = [], seen = new Set<string>();
  // what takes the drop at that point, with its own box (a card hidden under the pane beside the canvas is the pane there)
  const add = (x: number, y: number) => { const t = targetAt(x, y, what); if (t && !seen.has(`${t.kind}:${t.to}`)) { seen.add(`${t.kind}:${t.to}`); out.push(t); } };
  const els = what.kind === "note" || what.kind === "piece" ? "[data-takes], #pl [data-piece]" : "#pl .pl-card[data-region], #pl .pl-area[data-area]:not(.pl-here)";
  const folders = what.kind === "note" ? ", #pl .pl-card[data-region], #pl .pl-area[data-area]:not(.pl-here)" : "";
  for (const el of document.querySelectorAll(els + folders)) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue;
    // the point a person would let go at: a piece's middle, a folder's corner by its name (its middle may hold a piece)
    const mid = el.matches("[data-piece], [data-takes]"), cx = mid ? r.left + r.width / 2 : r.left + 12, cy = mid ? r.top + Math.min(r.height / 2, 24) : r.top + 12;
    const x = Math.min(innerWidth - 1, Math.max(0, cx)), y = Math.min(innerHeight - 1, Math.max(0, cy));
    add(x, y);
  }
  return out;
}

/** the pointer moved while dragging: a new target waits DWELL_MS before it arms; leaving it disarms at once */
export function track(x: number, y: number, what: Dragged): void {
  if (!keys) { keys = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); stop(); near = "esc"; } }; addEventListener("keydown", keys, true); }   // only the drag hears Esc
  if (near === "esc") { set({ at: { x, y } }); return; }   // Esc: nothing arms again until this drag ends
  const t = targetAt(x, y, what), key = t ? `${t.kind}:${t.to}` : null;
  set({ at: { x, y }, ...(state.what?.id === what.id && state.what.kind === what.kind ? {} : { what }) });
  if (key === near) return;
  near = key;
  if (timer) { clearTimeout(timer); timer = null; }
  if (state.armed) set({ armed: null });
  if (t) timer = setTimeout(() => { timer = null; if (near === key) set({ armed: t }); }, DWELL_MS);
}

/** the drag ended: the armed target (if any), "esc" when Esc was pressed (the thing goes back, nothing changes), and
 *  every mark gone */
export function land(): Target | "esc" | null {
  const t = near === "esc" ? "esc" : state.armed;
  stop();
  return t;
}

/** drop everything: no target, no mark, no key listener */
export function stop(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  if (keys) { removeEventListener("keydown", keys, true); keys = null; }
  near = null;
  set({ armed: null, at: null, what: null });
}

/** the plane's hook while a piece is dragged at Middle (plane/index.tsx): only a session arms, and only on a folder */
export function planeOver(id: string, x: number, y: number): void {
  const k = D.pieces[id]?.kind;
  if (k === "session") track(x, y, { kind: "session", id });
  else if (k && GIVES.has(k)) track(x, y, { kind: "piece", id });   // BR1 inside.html: a piece arms only on a session
}
/** the pieces a session can be given (cv/moves/table.ts): a page, a note, a list, a file, never a folder's own parts */
const GIVES = new Set(["doc", "page", "sticky", "note", "list", "row", "file", "image", "photo", "link", "block", "table"]);
/** the plane's hook while a folder is dragged at Far or Middle (plane/index.tsx): it arms only on a folder it can go in */
export function planeFolderOver(id: string, x: number, y: number): void {
  track(x, y, { kind: "folder", id });
}
/** the plane's hook on letting go of a folder: "esc" (it goes back, nothing changes), the folder armed under it, or null */
export function planeFolderDrop(): string | "esc" | null {
  const t = land();
  return t === "esc" ? "esc" : t?.kind === "folder" ? t.to : null;
}
/** the plane's hook on letting go: true when Esc sent the piece back (no place); an armed folder takes the session first */
export function planeDrop(id: string): boolean {
  const k = D.pieces[id]?.kind;
  if (k && GIVES.has(k)) {   // given to the session armed under it; the piece goes back where it was
    const t = land();
    if (t === "esc") return true;
    if (t?.kind === "session" && t.piece) { M.table_give(t.piece, id); return true; }
    return false;
  }
  if (k !== "session") return false;
  const t = land();
  if (t === "esc") return true;
  if (t?.kind === "folder") M.into_folder(id, t.to);
  return false;
}
