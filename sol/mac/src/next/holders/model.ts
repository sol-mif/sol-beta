// The holders (BR1 #1615, mine/look/br1/holders.html, Marco's yes 15:05): pieces on the canvas that gather one kind of
// thing from every folder. Every home is born with two, Sessions and Made; more come from the person's words, made by a
// session and marked ✦ until touched. Archive is a word on a session or a folder, never a place: an archived session
// leaves the canvas (work.mark archived, the old face's own mark) and an archived folder goes where the move-in's put-away
// folders go (the engine's next.shelf, P's: shelf/model.ts putOn · takeBack, reused, not rewritten). Both are found
// again under the Archived filter inside Sessions, with Bring back. Each archive and bring-back is one scoped line in what
// Sol knows (next.known.fix how hide · show, its place the folder, its because the session's key).
// Pure where it can be: the lists take D and return lines, so the tests read them without a page.
// Signed: marcocyl04-ux's agent (builder HO), BR1 (#1615).
import { D, MODE, render, regionOf, type Data, type Piece } from "../cv/core.ts";
import { link } from "../cv/wire/plane.ts";
import { said } from "../bar/undo.ts";
import { shelfNow, takeBack, subscribe as onShelfChange, type Shelved } from "../shelf/model.ts";
import type { Ranking } from "../collection-state.ts";
import { lightOff, lightOn, madeBy } from "../plane/landed-state.ts";

export const SESSIONS = "holder:sessions", MADE = "holder:made", ASKED = "holder:ask:";
export const isHolder = (id: string | null | undefined): boolean => !!id && (id === SESSIONS || id === MADE || id.startsWith(ASKED));

/** a session archived: its row as the engine last sent it (work.sessions, archived), or as this face put it away */
export type Archived = { id: string; name: string; region: string; at: number };
/** a holder made from the person's words: what it gathers, and its because ("you asked: …"); new until touched */
export type Asked = { id: string; name: string; words: string; of: "sessions" | "made"; at: number; touched?: boolean };
type Store = { archived: Archived[]; asked: Asked[]; off: string[] };

const KEY = "sol.next.holders";
const blank = (): Store => ({ archived: [], asked: [], off: [] });
/** the holders' own state beside D (never inside it): what was asked for is kept in this window's storage, so a reload
 *  keeps it; the archived list is the engine's when live */
let st: Store = blank();
let loaded = false;
function load(): Store {
  if (loaded) return st;
  loaded = true;
  try { const v = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "null"); if (v && Array.isArray(v.asked)) st.asked = v.asked.filter((a: Asked) => a && typeof a.id === "string" && typeof a.words === "string"); } catch { /* none kept */ }
  return st;
}
const keep = () => { try { globalThis.localStorage?.setItem(KEY, JSON.stringify({ asked: st.asked })); } catch { /* storage full or gone */ } };
const subs = new Set<() => void>();
let ver = 0;
const tell = () => { ver++; subs.forEach((f) => f()); render(); };
export const subscribe = (f: () => void) => { subs.add(f); const off = onShelfChange(f); return () => { subs.delete(f); off(); }; };
export const version = () => ver;

/** the holders on the canvas, in their order: the two every home is born with, then the asked ones */
export const holderIds = (): string[] => [SESSIONS, MADE, ...load().asked.map((a) => a.id)];
export const askedOf = (id: string): Asked | undefined => load().asked.find((a) => a.id === id);
export const nameOf = (id: string): string => (id === SESSIONS ? "Sessions" : id === MADE ? "Made" : askedOf(id)?.name ?? "Holder");
/** the one holder opened up close, if any (face state; Holders.tsx HolderClose draws it), and the filter it opens on */
let opened: { id: string; on?: string } | null = null;
export const openedHolder = () => opened;
export function openHolder(id: string | null, on?: string): boolean {
  if (id && !holderIds().includes(id)) return false;
  opened = id ? { id, ...(on ? { on } : {}) } : null;
  if (id) touchAsked(id);
  tell();
  return true;
}
/** taken off the canvas (its ⋯), for this window: Add brings it back */
export const isOffHolder = (id: string) => load().off.includes(id);
export function setOffHolder(id: string, on: boolean): void { st.off = on ? [...new Set([...load().off, id])] : load().off.filter((x) => x !== id); tell(); }
export const offHolders = () => load().off.filter((id) => holderIds().includes(id));

// ---------------------------------------------------------------- sessions

/** work.sessions' archived rows → the archived list (pure). Newest first */
export function archivedFrom(m: { sessions?: { id: string; title?: string; cwd?: string; project?: string; archived?: boolean; gone?: boolean; updatedAt?: number }[] }): Archived[] {
  return (m.sessions || []).filter((s) => s.archived && !s.gone && typeof s.id === "string")
    .map((s) => ({ id: s.id, name: s.title || "A session", region: "w:" + (s.project || s.cwd || ""), at: Number(s.updatedAt) || 0 }))
    .sort((a, b) => b.at - a.at);
}
/** the wire's (cv/wire/plane.ts): the engine's archived list, whole */
export function heardArchived(a: Archived[]): void { load(); st.archived = a; tell(); }
export const archivedNow = (): Archived[] => load().archived;

export type State = "needs" | "working" | "done" | "idle";
/** a session's state in the holder's words: what needs the person, what is working, done, or resting */
export function stateOf(p: Piece, d: Data = D): State {
  if (Object.values(d.asks).some((a) => a.piece === p.id && !a.answered && !a.withdrawn)) return "needs";
  const s = String(p.state ?? "");
  return s === "working" ? "working" : /done|stopped/.test(s) ? "done" : "idle";
}
/** when it last moved, ms (the engine's updatedAt, else when it began); 0 unknown */
export const lastOf = (p: Piece): number => Number(p.last ?? p.born ?? p.at ?? 0) || 0;
/** every session on the canvas, the parts of a split job left inside it (pure) */
export const sessionsOf = (d: Data = D): Piece[] => Object.values(d.pieces).filter((p) => p.kind === "session" && !p.part);
/** at rest: what needs the person first, then what is working, then the most recent (pure) */
export function restOrder(ps: Piece[], d: Data = D): Piece[] {
  const rank: Record<State, number> = { needs: 0, working: 1, idle: 2, done: 2 };
  return [...ps].sort((a, b) => rank[stateOf(a, d)] - rank[stateOf(b, d)] || lastOf(b) - lastOf(a));
}
export const STATE_W: Record<State, string> = { needs: "needs you", working: "working", done: "done", idle: "" };

// ---------------------------------------------------------------- opened: each list is the one list (Collection, root part 4)

const DAY = 864e5, TIER = 1e14;
const dayStart = (now: number) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** a week of things drawn newest first, anything older folded into the count line (All, Archived, Made) */
export const weekRank = <T,>(at: (x: T) => number, now = Date.now()): Ranking<T> => {
  const week = dayStart(now) - 6 * DAY;
  return { rank: (x) => (at(x) >= week ? -at(x) : null), at };
};
export type SFilter = "needs" | "working" | "recent" | "archived" | "all";
/** how a Sessions filter ranks (pure): Needs you and Working draw all of theirs; Recent draws what needs the person, then
 *  what works, then today's, and folds the rest; All draws the week */
export function sessionRank(f: Exclude<SFilter, "archived">, d: Data = D, now = Date.now()): Ranking<Piece> {
  if (f === "all") return weekRank(lastOf, now);
  const today = dayStart(now), tier: Record<State, number> = { needs: 0, working: 1, idle: 2, done: 2 };
  return {
    rank: (p) => { const s = stateOf(p, d), t = lastOf(p); return f !== "recent" || s === "needs" || s === "working" || t >= today ? tier[s] * TIER - t : null; },
    at: lastOf,
  };
}
/** an archived session or folder, as Archived lists them together; when, ms */
export type ArchivedThing = { k: "session"; a: Archived } | { k: "folder"; x: Shelved };
export const archivedAt = (t: ArchivedThing): number => (t.k === "session" ? t.a.at : Date.parse(t.x.at) || 0);

// ---------------------------------------------------------------- made

export type MadeKind = "pages" | "files" | "notes";
/** what an AI made, on the canvas: a piece of any kind but a session, an arrival or a folder's own Diary, made by an AI
 *  (by "ai", or an AI's name on it) (pure) */
export function madeOf(d: Data = D): Piece[] {
  return Object.values(d.pieces).filter((p) => !p.inside && !p.part && p.kind !== "session" && p.kind !== "arrivals" && p.kind !== "diary"
    && (p.by === "ai" || (typeof p.ai === "string" && p.ai !== "" && p.by !== "person")));
}
export const madeKind = (p: Piece): MadeKind => (/page|doc|block|stills/.test(p.kind) ? "pages" : /code|file|copies/.test(p.kind) ? "files" : "notes");
/** a made thing's row ties to the session that made it, as its piece does on the canvas (plane/landed.ts, ✦ landing):
 *  the hand on the row lights that session wherever it shows. A thing no session made ties to nothing (builder F10) */
export function madeTie(p: Piece, d: Data = D) {
  const mb = madeBy(p, d.pieces);
  return mb ? { "data-made": mb.id, onPointerEnter: () => lightOn(mb.id), onPointerLeave: () => lightOff(mb.id), onFocus: () => lightOn(mb.id), onBlur: () => lightOff(mb.id) } : {};
}
/** a made thing whose folder is archived is archived with it */
export const madeArchived = (p: Piece, shelf: Shelved[] = shelfNow().shelf): boolean => shelf.some((x) => x.folder === p.region);

// ---------------------------------------------------------------- what a holder gathers

/** the words a holder gathers by: its own, without the asking ("keep every … in one place") */
const STOP = new Set(["the", "a", "an", "my", "all", "every", "each", "of", "in", "on", "one", "place", "to", "for", "and", "with", "that", "this", "these", "those", "keep", "put", "gather", "hold", "together", "me"]);
export const termsOf = (words: string): string[] => words.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/s$/, ""));
/** what a piece says about itself: its name, its task, what it was told and what it holds, read whole */
const textOf = (p: Piece) => [p.name, p.words, p.text, p.copy, ...(p.talk ?? []), ...(p.term?.lines ?? [])].filter((x) => typeof x === "string").join(" ").toLowerCase();
/** an asked holder's things: those whose own words carry every one of its terms (pure) */
export function gathered(a: Asked, d: Data = D): Piece[] {
  const t = termsOf(a.words), all = a.of === "sessions" ? sessionsOf(d) : madeOf(d);
  return t.length ? all.filter((p) => { const s = textOf(p); return t.every((w) => s.includes(w)); }) : [];
}

// ---------------------------------------------------------------- the moves

/** next.known.fix, sent when the engine holds it: one scoped line, its because the key of what was moved; a session in no
 *  folder says "everywhere" out loud, since the engine refuses a fix with no place (K's spine, you-known.ts EVERYWHERE) */
function known(how: "hide" | "show", what: string, place: string | null, reason: string): void {
  if (MODE !== "live" || !link.e) return;
  link.e.send({ type: "next.known.fix", how, what, place: place || "everywhere", reason });
}
const folderName = (rid: string) => String(regionOf(rid)?.name ?? (rid.replace(/^[wh]:/, "").split("/").filter(Boolean).pop() || "its folder"));

/** ⋯ Archive on a session (its card, its folder, Sessions): off the canvas at once, live the engine's work.mark; the
 *  line says where it went, with Undo */
export function archive(id: string): boolean {
  const p = D.pieces[id];
  if (!p || p.kind !== "session") return false;
  const was = { ...p }, name = String(p.name || "A session");
  load();
  st.archived = [{ id, name, region: String(p.region ?? ""), at: Date.now() }, ...st.archived.filter((x) => x.id !== id)];
  delete D.pieces[id];
  if (MODE === "live") link.e?.send({ type: "work.mark", sessionId: id, patch: { archived: true } });
  known("hide", `the session ${name}`, p.region ? String(p.region) : null, `session:${id}`);
  tell();
  said(`${name} is archived. It’s in Sessions › Archived`, () => back(id, was));
  return true;
}
/** Bring back: the session where it was (live the engine's work.mark, its row comes back with work.sessions) */
export function bringBack(id: string): boolean { const a = load().archived.find((x) => x.id === id); return a ? (back(id, null, a), true) : false; }
function back(id: string, was: Piece | null, a: Archived | undefined = load().archived.find((x) => x.id === id)): void {
  st.archived = load().archived.filter((x) => x.id !== id);
  if (was) D.pieces[id] = was;
  if (MODE === "live") link.e?.send({ type: "work.mark", sessionId: id, patch: { archived: false } });
  const name = was?.name ?? a?.name ?? "the session", place = String(was?.region ?? a?.region ?? "") || null;
  known("show", `the session ${name}`, place, `session:${id}`);
  tell();
}
/** an archived folder brought back (the engine's next.shelf.take): where it was, at once */
export const bringFolderBack = (folder: string) => takeBack(folder);

/** the person's words make a holder (a session reads them and gathers): "keep every client preview link in one place".
 *  Marked ✦ until touched, its because the words */
export function askHolder(words: string): Asked | null {
  const w = words.trim().replace(/[.!?]+$/, "");
  if (!termsOf(w).length) return null;
  const made = /link|page|file|note|draft|image|picture|photo|preview|doc|made|invoice|logo|copy|design/i.test(w) && !/session|chat|talk/i.test(w);
  const what = w.replace(/^(?:please\s+)?(?:keep|gather|hold|put|collect)\s+(?:all\s+|every\s+|each\s+)?(?:my\s+|the\s+|of\s+my\s+)?/i, "").replace(/\s+(?:in one place|together|in one holder|for me)$/i, "");
  const name = what ? what.charAt(0).toUpperCase() + what.slice(1) : "Holder";
  const a: Asked = { id: ASKED + Date.now().toString(36), name: name.length > 40 ? name.slice(0, 39).replace(/\s+\S*$/, "") + "…" : name, words: w, of: made ? "made" : "sessions", at: Date.now() };
  load(); st.asked = [...st.asked, a]; keep(); tell();
  said(`Made a holder for ${a.name.toLowerCase()}. It gathers by reading what you asked`, () => { st.asked = st.asked.filter((x) => x.id !== a.id); keep(); tell(); });
  return a;
}
/** the ✦ goes once the person touches it */
export function touchAsked(id: string): void { const a = askedOf(id); if (a && !a.touched) { a.touched = true; keep(); tell(); } }

/** the face's own: archived folders, in the shelf's order (the engine's) */
export const archivedFolders = (): Shelved[] => shelfNow().shelf;
export { folderName };

/** tests: back to before anything was heard */
export function reset(): void { st = blank(); loaded = true; ver = 0; opened = null; }
