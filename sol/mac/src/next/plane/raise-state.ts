// The quiet canvas (BR1, #1615; mine/look/br1/quiet.html round 2, Marco's yes 15:58): focus follows the hand, and each
// folder has one raise, a single slot under its card that grows and shrinks (0 quiet, 1 a dot, 2 a line, 3 a question,
// 4 a decision) and never stacks. What the hand is on (pointer or Tab) comes forward and the rest steps back in one motion;
// letting go settles it back. At rest a raise says as much as the folder's distance allows (its card's size on screen: far,
// names and dots only; middle, the first folder Sol judges you care about a question, the second a line; near, more), and
// pointed at it is whole. The ask a raise carries is the folder's first open one (the judged order is the store's rank,
// builder P's judging side); what the person does with it (answered, Later, passed by) goes back as a correction
// (cv/wire/raise.ts). The focus is its own small store, so a hover never draws the plane again.
// Signed: marcocyl04-ux's agent (builder Q), BR1 (#1615).
import { useSyncExternalStore } from "react";
import { D, M, S, asksInRegion, open, piecesIn, regionOf, type Ask, type Piece } from "../cv/index.ts";
import { who, reason } from "../needs/rank.ts";
import { sendOutcome } from "../cv/wire/raise.ts";
import type { Rect } from "./size.ts";
import { sessionOpen } from "../cv/moves/talkto.ts";

export type Lv = 0 | 1 | 2 | 3 | 4;
/** how much a raise says at rest: from the card's size on screen (Folder.tsx's form) */
export type Dist = "far" | "mid" | "near";
/** what a folder's one raise carries: the first ask in it, else a session at work, else nothing */
export type Raise = { k: "ask"; a: Ask } | { k: "run"; p: Piece } | { k: "none" };

/** the hand's delays (the drawing's): pointing waits a breath, letting go a little longer, so crossing a gap never flickers */
export const IN_MS = 90, OUT_MS = 220;

// ---------------------------------------------------------------- what a folder raises, and how much it says

const working = (p: Piece) => p.kind === "session" && !p.term?.waiting && !/paused|stopped|done|taken back|failed|idle/.test(String(p.state ?? ""));
/** the judging side's word on an ask (builder J's next.raises, cv/wire/raises.ts): the most its raise says at rest, 0
 *  silence (no slot, not even a dot) to 3 a question, and why in one sentence. None (an older engine): today's rank alone */
export type Care = { level: 0 | 1 | 2 | 3; why: string };
export const careOf = (a: Ask): Care | undefined => (a as Ask & { care?: Care }).care;
const raised = (a: Ask) => careOf(a)?.level !== 0;
/** an ask's folder: its piece's, or the folder itself when the ask is about the folder (builder T's sort offer) */
const folderOf = (a: Ask): string | undefined => D.pieces[a.piece]?.region ?? (regionOf(a.piece) ? a.piece : undefined);
export function raiseOf(rid: string): Raise {
  const own = asksInRegion(rid), at = open().filter((a) => a.piece === rid && !own.includes(a));
  const a = (at.length ? [...own, ...at].sort((x, y) => x.rank - y.rank) : own).find(raised);
  if (a) return { k: "ask", a };
  const p = piecesIn(rid).find(working);
  return p ? { k: "run", p } : { k: "none" };
}
/** the folders whose raise carries an ask, in the judged order (the first raised ask's rank) */
export function judged(): string[] {
  const out: string[] = [];
  for (const a of open()) { const r = raised(a) ? folderOf(a) : undefined; if (r && !out.includes(r)) out.push(r); }
  return out;
}
/** a raise at rest, by distance: middle, the first judged folder a question and the second a line; near, both questions
 *  and a run a line; far, a dot for anything there. Later and an open session beside the canvas (quiet.html §4) leave a dot */
export function restOf(r: Raise, rank: number, dist: Dist, later: boolean, beside: boolean): Lv {
  const c = r.k === "ask" ? careOf(r.a) : undefined;
  return c ? (Math.min(restBy(r, rank, dist, later, beside), c.level) as Lv) : restBy(r, rank, dist, later, beside);
}
/** by distance and rank alone; the judging side's level caps it (restOf) */
function restBy(r: Raise, rank: number, dist: Dist, later: boolean, beside: boolean): Lv {
  if (r.k === "none") return 0;
  if (dist === "far" || later || beside) return 1;
  if (r.k === "run") return dist === "near" ? 2 : 1;
  if (rank === 0) return 3;
  if (rank === 1) return dist === "near" ? 3 : 2;
  return 1;
}
/** pointed at: an ask whole (a decision), a run its question line, a quiet folder its one line ("Nothing here needs you") */
export const pointedOf = (r: Raise): Lv => (r.k === "ask" ? 4 : r.k === "run" ? 3 : 2);
/** the room under its card each level takes whole, px (raise.css): a line its slot's gap and one line (--s2, --s8 + --s2),
 *  a question the gap and two (--s2, 2 × --s12); a decision whole the room the layout keeps under a row at the person's
 *  scale (layout.ts RAISE_PX, next-raise.test.ts holds them equal) */
export const ROOM: Record<Lv, number> = { 0: 0, 1: 0, 2: 48, 3: 104, 4: 118 };
/** a decision whole is at least this wide on screen, px (raise.css: width max(100%, 260px)) */
export const RAISE_W = 260;
/** a raise never takes more than the room under its card (BR1, #1615): with less it says the most that fits whole, a dot
 *  at the least. Zoomed out a card holds its size while the rows close up (size.ts), and a folder inside a folder sits a
 *  cell's gap above the next; a raise drawn past its room covered the folder below, so a press aimed there opened this
 *  one. `room` px, Infinity when nothing is under it; 1px is the plane's rounding */
export function fitRoom(lv: Lv, room: number): Lv {
  let l = lv;
  while (l > 1 && room < ROOM[l] - 1) l--;
  return l as Lv;
}
/** the room under a card `q` before the first of `others` below it, px at zoom `z`, across the raise's width (the card's,
 *  at least RAISE_W on screen); Infinity when none is. Plane units in, as D.pos and size.ts's held boxes */
export function roomUnder(q: Rect, others: Rect[], z: number): number {
  const w = Math.max(q.w, RAISE_W / z), foot = q.y + q.h;
  let room = Infinity;
  for (const o of others) if (o !== q && o.y > q.y && o.x < q.x + w && q.x < o.x + o.w) room = Math.min(room, Math.max(0, (o.y - foot) * z));
  return room;
}
/** while another folder has the hand, a raise steps back to at most a dot */
export function levelOf(r: Raise, rest: Lv, focus: string | null, rid: string): Lv {
  if (focus === rid) return pointedOf(r);
  return focus ? (Math.min(rest, 1) as Lv) : rest;
}
/** the raise's name line: who asks (a session by its task) */
export const whoOf = (r: Raise): string => (r.k === "ask" ? who(D, r.a) : r.k === "run" ? String(r.p.name || r.p.copy || "A session") : "");
/** a short label for a long choice, for the folded pill at rest ("I'll drop them" → "Drop them") */
export function shortOf(w: string): string {
  const s = w.replace(/^(I['’]ll|I will|Let me|Please)\s+/i, "");
  const t = s.charAt(0).toUpperCase() + s.slice(1);
  return t.length > 16 ? t.slice(0, 15).replace(/\s+\S*$/, "") + "…" : t;
}
/** the because… when the ask names no facts: why it stands where it stands, in one sentence */
export const whyOf = (a: Ask): string => careOf(a)?.why || reason(D, a).long;
/** an open session beside the canvas sits in this folder: the conversation already asks */
export const besideIn = (rid: string): boolean => { const b = S.beside ? D.pieces[S.beside] : undefined; return !!b && b.region === rid; };

// ---------------------------------------------------------------- the hand: one focus, its own store

let focus: string | null = null, to: string | null = null, t: ReturnType<typeof setTimeout> | null = null;
const later = new Set<string>(), acted = new Set<string>(), passed = new Set<string>();
let whole: string | null = null;   // the ask shown whole under the hand, until it is pressed or left
const subs = new Set<() => void>();
let ver = 0;
const tell = () => { ver++; for (const f of [...subs]) f(); };
const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** a view's read of the hand: draws again only when the focus, the bar's To or a Later changes */
export const useHand = () => { useSyncExternalStore(sub, () => ver, () => ver); return { focus, to, later }; };
export const focusNow = () => focus;
export const toNow = () => to;

function set(rid: string | null) {
  if (focus === rid) return;
  if (focus && whole) pass(focus);
  focus = rid;
  if (rid && !sessionOpen()) to = rid;   // a session open: the bar's To is its own (talkto.ts), the hand's gives way
  const r = rid ? raiseOf(rid) : null;
  whole = r?.k === "ask" ? r.a.id : null;
  tell();
}
/** the hand comes onto a folder (pointer, or Tab's focus at once) */
export function point(rid: string, now = false): void {
  if (t) clearTimeout(t);
  if (now) { t = null; set(rid); return; }
  t = setTimeout(() => { t = null; set(rid); }, IN_MS);
}
/** the hand leaves it: settles back after a moment. The bar's To stays while the hand went to the bar (holdTo) */
export function leave(rid: string, now = false): void {
  if (t) clearTimeout(t);
  const go = () => { t = null; if (focus !== rid) return; set(null); if (!barHeld) { to = null; tell(); } };
  if (now) go(); else t = setTimeout(go, OUT_MS);
}
/** Esc: let go of everything, the bar's To too */
export function letGo(): void { if (t) clearTimeout(t); t = null; barHeld = false; set(null); if (to) { to = null; tell(); } }
let barHeld = false;
/** the hand is on the talk (pointer or typing): the To it took stays; off it with nothing typed, it goes */
export function holdTo(on: boolean): void { barHeld = on; if (!on && !focus && to) { to = null; tell(); } }

// ---------------------------------------------------------------- outcomes: each one a correction to the judging side

function line(how: "answer" | "later" | "pass" | "open", rid: string, a: Ask, now?: string) {
  sendOutcome({ how, what: who(D, a), place: rid, reason: `ask:${a.id}`, was: a.text, ...(now ? { now } : {}), ...(a.because?.length ? { because: a.because } : {}) });
}
/** a tidy offer (builder T's "o:<kind>:<to>"): its answer line is the tidy engine's, written when the offer is answered */
const offer = (a: Ask) => a.id.startsWith("o:");
/** a choice pressed (or words sent to it from the bar); an offer's answer goes no further here (builder J) */
export function answered(rid: string, a: Ask, words: string): void { acted.add(a.id); whole = null; if (!offer(a)) line("answer", rid, a, words); if (to === rid) { to = null; } tell(); }
/** Later: the raise shrinks to a dot and waits */
export function putOff(rid: string, a: Ask): void { acted.add(a.id); later.add(a.id); whole = null; line("later", rid, a); tell(); }
/** shown whole under the hand and left with no press: passed by, once per ask */
function pass(rid: string): void {
  const r = raiseOf(rid);
  if (r.k !== "ask" || r.a.id !== whole || acted.has(r.a.id) || passed.has(r.a.id)) return;
  passed.add(r.a.id); line("pass", rid, r.a);
}
/** opened from the raise (its folder or the session that asks): acted on, as an answer is */
export function opened(rid: string, a: Ask): void { acted.add(a.id); whole = null; line("open", rid, a); if (to === rid) { to = null; } tell(); }
export const isLater = (a: Ask) => later.has(a.id);

// ---------------------------------------------------------------- the bar's To: what the hand points at

/** the bar's To: the folder the hand took, while its raise asks or works (quiet.html: lv 3 and up); null is "To: New".
 *  While a session is open (in front or kept beside) the bar is the session's (BR1 inside.html §1, cv/moves/talkto.ts) and
 *  the hand takes no To: its words go to the session, never to a folder pointed at on the way */
export function toOf(rid: string | null = to): { rid: string; r: Exclude<Raise, { k: "none" }>; name: string } | null {
  if (!rid || sessionOpen()) return null;
  const r = raiseOf(rid);
  return r.k === "none" ? null : { rid, r, name: whoOf(r) };
}
/** words sent from the bar with a To: into the thread of what asks (a free answer never runs an ask's yes), and the ask's
 *  outcome is "answer" with those words. False when there is no To, so the bar says them as it always has */
export function sendTo(words: string): boolean {
  const t = toOf();
  if (!t) return false;
  M.talk(t.r.k === "ask" ? t.r.a.piece : t.r.p.id, words);
  if (t.r.k === "ask") answered(t.rid, t.r.a, words);
  else { to = null; tell(); }
  return true;
}
