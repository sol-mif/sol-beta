// One Jelly, several windows onto it (#1090, behind the face's switch `screens.two`). The engine keeps the one record
// of the windows a person has open on it, so nothing is "the second window's data": every window reads the same
// sessions and the same blocks (work/blocks.ts), and this book says only what each window SHOWS of them.
//   windows   each window by its id ("main", "two", …): its role, the screen it stands on, live while its face is
//             connected. A role is kept when the window goes, so it comes back as it was.
//   where     a block's id → the window that holds it. A block named nowhere is at home (the main window). A block
//             whose window is gone is drawn at home too, but its line is kept: plug the screen back in, it returns.
//   open      a window's id → the session it shows; a session pressed in the anchor opens on the stage window.
//   lay       a window's own layout of a session's blocks (the main window's is the engine's stage, blocks.ts).
//   kept      an arrangement per project: which blocks were where and which role each window had, put back on its ask.
// Pure but for the file it is kept in (screens.json in the engine's home). No turn, no model, no block is changed here.
import { readFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeWhole } from "./safewrite.js";

export const ROLES = ["whole", "anchor", "stage", "wall", "watch"] as const;
export type Role = (typeof ROLES)[number];
export const HOME = "main";
export const UNDO_MS = 8000;
export type Screen = { x: number; y: number; w: number; h: number; main?: boolean; name?: string };
export type Win = { win: string; role: Role; screen?: Screen; live: boolean; at: number };
export type Place = { id: string; x: number; y: number; w: number; h: number; z?: number; folded?: boolean };
export type Arrangement = { roles: Record<string, Role>; where: Record<string, string>; at: number;
  /** for another session of the project (design JEV 3): each kind of block, the window it was last left on; the
   *  session that was open; the window that held the talk */
  kinds?: Record<string, string>; session?: string; talk?: string };
export type ScreensState = { home: string; keeps?: string; windows: Win[]; where: Record<string, string>; open: Record<string, string>; lay: Record<string, Record<string, Place[]>>; kept: Record<string, Arrangement> };

const WIN = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** a key of the record's maps, read as its own entry only (never an inherited one: "constructor", "__proto__") */
export const own = <T,>(o: Record<string, T> | null | undefined, k: string): T | undefined => (o && typeof o === "object" && Object.hasOwn(o, k) ? o[k] : undefined);
const isMap = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** a map of strings from the file: only string values under own keys */
const strMap = (v: unknown): Record<string, string> => (isMap(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "string")) as Record<string, string> : {});
// the record's sizes are capped so screens.json never grows without end
export const CAP = { where: 500, lay: 40, kept: 100, windows: 8 };
const capKeys = <T,>(o: Record<string, T>, n: number): Record<string, T> => { const e = Object.entries(o); return e.length > n ? Object.fromEntries(e.slice(e.length - n)) : o; };
const BLOCK = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
export const validWin = (w: unknown): w is string => typeof w === "string" && WIN.test(w);
export const validRole = (r: unknown): r is Role => typeof r === "string" && (ROLES as readonly string[]).includes(r);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** a screen as a face said it, or undefined: four finite numbers, a name cut short (pure) */
export function cleanScreen(s: unknown): Screen | undefined {
  if (!s || typeof s !== "object") return undefined;
  const o = s as Record<string, unknown>, x = num(o.x), y = num(o.y), w = num(o.w), h = num(o.h);
  if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) return undefined;
  return { x, y, w, h, ...(o.main === true ? { main: true } : {}), ...(typeof o.name === "string" && o.name ? { name: o.name.slice(0, 60) } : {}) };
}
/** a window's own places, cleaned: finite rects, at most 40 (pure) */
export function cleanPlaces(p: unknown): Place[] {
  if (!Array.isArray(p)) return [];
  const out: Place[] = [];
  for (const q of p.slice(0, 40)) {
    if (!q || typeof q !== "object") continue;
    const o = q as Record<string, unknown>, x = num(o.x), y = num(o.y), w = num(o.w), h = num(o.h);
    if (typeof o.id !== "string" || !BLOCK.test(o.id) || x === null || y === null || w === null || h === null) continue;
    out.push({ id: o.id, x, y, w, h, ...(num(o.z) !== null ? { z: num(o.z)! } : {}), ...(o.folded === true ? { folded: true } : {}) });
  }
  return out;
}

/** where a block nobody threw is drawn: the window that keeps them (`keeps`, main at first) while it is live and draws a
 *  stage; else the live stage window, a whole one, a wall (pure). That window also keeps the engine's own layout of the
 *  stage; every other window keeps its own. A second window opened by a throw holds only what was carried to it */
export function homeOf(s: { windows: { win: string; role: string; live: boolean }[]; home: string; keeps?: string }): string {
  const live = s.windows.filter((w) => w.live && w.role !== "anchor" && w.role !== "watch");
  const k = s.keeps ?? s.home;
  if (live.some((w) => w.win === k)) return k;
  return (live.find((w) => w.role === "stage") ?? live.find((w) => w.role === "whole") ?? live.find((w) => w.role === "wall"))?.win ?? s.home;
}
/** which window draws a block now: its line if that window is live, else homeOf (pure; the face's rule is the same) */
export function drawnOn(s: Pick<ScreensState, "windows" | "where" | "home" | "keeps">, block: string): string {
  const w = own(s.where, block);
  return w && s.windows.some((x) => x.win === w && x.live && x.role !== "anchor") ? w : homeOf(s);   // an anchor draws no blocks
}

const hasSide = (r: Role) => r === "whole" || r === "anchor";
const hasTalk = (r: Role) => r === "whole" || r === "stage";
const roleOf = (side: boolean, talk: boolean): Role => (side && talk ? "whole" : side ? "anchor" : talk ? "stage" : "wall");
/** among the live windows exactly one has the side and one has the talk, always (pure): a second holder gives it up
 *  (main keeps it), a missing one is taken by the window that has the other, else by main, else the first live one */
export function settled(windows: Win[], home: string): Win[] {
  const live = windows.filter((w) => w.live);
  if (!live.length) return windows;
  const first = live.find((w) => w.win === home) ?? live[0];
  const pickOne = (has: (r: Role) => boolean, other: (r: Role) => boolean) => {
    const holders = live.filter((w) => has(w.role));
    if (holders.length) return (holders.find((w) => w.win === home) ?? holders[0]).win;
    return (live.find((w) => other(w.role)) ?? first).win;
  };
  const side = pickOne(hasSide, hasTalk), talk = pickOne(hasTalk, hasSide);
  return windows.map((w) => (w.live ? { ...w, role: w.role === "watch" && w.win !== side && w.win !== talk ? "watch" : roleOf(w.win === side, w.win === talk) } : w));
}

/** the window a session pressed in an anchor opens on: the live stage window, else a live whole one, else home (pure) */
export function stageWindow(s: Pick<ScreensState, "windows" | "home">, from?: string): string {
  const live = s.windows.filter((w) => w.live && w.win !== from);
  return live.find((w) => w.role === "stage")?.win ?? live.find((w) => w.role === "whole")?.win ?? s.home;
}

/** what an arrangement for the job does (pure): read and review put the block (the newest long one, the diff) alone on
 *  the larger window and keep the talk by the keyboard; watch takes the talk and the blocks to the larger window and
 *  leaves the side by the keyboard. Null when nothing would change. The roles drawn on the map for its offer */
export function arrangePlan(to: string, s: Pick<ScreensState, "windows" | "where" | "home" | "keeps">, me: string, block?: string):
  { put?: { block: string; win: string }; talk?: { from: string; to: string }; roles: Record<string, Role> } | null {
  const live = s.windows.filter((w) => w.live);
  if (live.length < 2) return null;
  const area = (w: Win) => (w.screen ? w.screen.w * w.screen.h : 0);
  const larger = [...live].sort((a, b) => area(b) - area(a))[0], other = live.find((w) => w.win !== larger.win)!;
  const keyboard = live.find((w) => w.win === me) ?? other;
  if (to === "read" || to === "review") {
    if (!block || keyboard.win === larger.win) return null;
    if (drawnOn(s, block) === larger.win) return null;
    return { put: { block, win: larger.win }, roles: { [larger.win]: "wall", [keyboard.win]: "whole" } };
  }
  if (to === "watch") {
    const talkWin = live.find((w) => w.role === "whole" || w.role === "stage");
    if (!talkWin || talkWin.win === larger.win) return null;
    return { talk: { from: talkWin.win, to: larger.win }, roles: { [larger.win]: "stage", [talkWin.win]: "anchor" } };
  }
  return null;
}

export class ScreensBook {
  private s: ScreensState = { home: HOME, windows: [], where: {}, open: {}, lay: {}, kept: {} };
  /** the record as it was before the last crossing, and when: ⌘Z within UNDO_MS puts it back */
  private before: { where: Record<string, string>; keeps?: string; roles: Record<string, Role>; at: number; by?: string } | null = null;
  /** who makes the next crossing (the part sets it from the socket); a batch marks once (an arrangement: put + talk) */
  by: string | undefined;
  private batching = false;
  private mark(now = Date.now()) { if (this.batching) return; this.before = { where: { ...this.s.where }, keeps: this.s.keeps, roles: Object.fromEntries(this.s.windows.map((w) => [w.win, w.role])), at: now, by: this.by }; }
  /** several changes taken back by one ⌘Z */
  batch(fn: () => void) { this.mark(); this.batching = true; try { fn(); } finally { this.batching = false; } }
  /** the last crossing taken back, as one step, if it was within UNDO_MS; false when there is nothing to take back */
  undo(now = Date.now(), by?: string) {
    const b = this.before;
    if (!b || now - b.at > UNDO_MS) return false;
    if (!b.by || !by || b.by !== by) return false;   // only the window that crossed takes it back (an unsigned crossing: none)
    this.before = null;
    const windows = this.s.windows.map((w) => { const r = own(b.roles, w.win); return r && validRole(r) ? { ...w, role: r } : w; });
    this.s = { ...this.s, where: b.where, keeps: b.keeps, windows: settled(windows, this.s.home) };
    this.save();
    return true;
  }
  constructor(private file: string | null) {
    if (!file) return;
    try {
      const j = JSON.parse(readFileSync(file, "utf8"));
      // a window read from the file is not live: its face has to say hello again
      // each field checked: a file that says null, an array or a number where a map goes is read as empty
      const kept = isMap(j?.kept) ? Object.fromEntries(Object.entries(j.kept).filter(([, k]) => isMap(k)).map(([p, k]: [string, any]) => [p, { roles: Object.fromEntries(Object.entries(strMap(k.roles)).filter(([, r]) => validRole(r))) as Record<string, Role>, where: strMap(k.where), at: num(k.at) ?? 0,
        kinds: strMap(k.kinds), ...(typeof k.session === "string" ? { session: k.session.slice(0, 80) } : {}), ...(typeof k.talk === "string" && validWin(k.talk) ? { talk: k.talk } : {}) }])) : {};
      const lay = isMap(j?.lay) ? Object.fromEntries(Object.entries(j.lay).filter(([w, m]) => validWin(w) && isMap(m)).map(([w, m]: [string, any]) => [w, Object.fromEntries(Object.entries(m).map(([sid, p]) => [sid, cleanPlaces(p)]))])) : {};
      this.s = { ...this.s, where: strMap(j?.where), open: strMap(j?.open), lay, kept, ...(typeof j?.keeps === "string" && validWin(j.keeps) ? { keeps: j.keeps } : {}),
        windows: Array.isArray(j?.windows) ? j.windows.filter((w: Win) => validWin(w?.win) && validRole(w?.role)).map((w: Win) => ({ win: w.win, role: w.role, live: false, at: num(w.at) ?? 0, ...(cleanScreen(w.screen) ? { screen: cleanScreen(w.screen) } : {}) })) : [] };
    } catch (e) {
      // a first start (no file), or an unreadable one: an empty book; the unreadable file is kept beside it before the
      // first save overwrites it (the roles and the kept arrangements in it are not lost)
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") {
        try { copyFileSync(file, `${file}.bad-${new Date().toISOString().replace(/[:.]/g, "-")}`); } catch { /* nothing to keep */ }
        // the file could not be read: nothing is written over it this run (kept in memory only), so a file that a
        // moment's error made unreadable is never replaced by an empty book
        this.unreadable = true;
      }
    }
  }
  state(): ScreensState { return this.s; }
  private unreadable = false;
  private save() { if (this.file && !this.unreadable) { try { writeWhole(this.file, JSON.stringify({ ...this.s, windows: this.s.windows.map(({ live: _l, ...w }) => w) }, null, 1), { root: dirname(this.file) }); } catch { /* kept in memory */ } } }
  private winOf(win: string) { return this.s.windows.find((w) => w.win === win); }

  /** a face says which window it is; a new window takes the role it asks for, a known one keeps its own unless it asks */
  /** room for this window in the record: it is known, or there are fewer than CAP.windows, or a gone one (the oldest)
   *  makes room, its lines dropped; with every one live, none (the part refuses the hello) */
  room(win: string) {
    if (this.winOf(win) || this.s.windows.length < CAP.windows) return true;
    const gone = this.s.windows.filter((w) => !w.live && w.win !== HOME).sort((a, b) => a.at - b.at)[0];
    if (!gone) return false;
    const not = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== gone.win));
    this.s = { ...this.s, windows: this.s.windows.filter((w) => w !== gone), lay: not(this.s.lay), open: not(this.s.open),
      where: Object.fromEntries(Object.entries(this.s.where).filter(([, w]) => w !== gone.win)) };
    return true;
  }
  hello(win: string, role?: Role, screen?: Screen, now = Date.now()): Win {
    const was = this.winOf(win);
    // a window coming back (a display plugged in again, a reload) is what it was; a new one is what it asks to be
    const w: Win = { win, role: was?.role ?? role ?? (win === HOME ? "whole" : "stage"), live: true, at: now, ...(screen ?? was?.screen ? { screen: screen ?? was!.screen } : {}) };
    this.s = { ...this.s, windows: [...this.s.windows.filter((x) => x.win !== win), w].sort((a, b) => (a.win === HOME ? -1 : b.win === HOME ? 1 : a.win.localeCompare(b.win))) };
    if (was) this.settle();   // a return: the record stays one side, one talk (it already is, unless something went wrong)
    this.save();
    return this.winOf(win)!;
  }
  /** its face went (closed, or its screen unplugged): drawn nowhere, its blocks drawn at home, its lines kept */
  gone(win: string) {
    if (!this.winOf(win)?.live) return false;
    // its role is kept as it was, so a return restores the arrangement; the window left alone draws everything (face)
    this.s = { ...this.s, windows: this.s.windows.map((w) => (w.win === win ? { ...w, live: false } : w)) };
    return true;
  }
  /** one side and one talk among the live windows (settled) */
  private settle() { this.s = { ...this.s, windows: settled(this.s.windows, this.s.home) }; }
  /** before roles change: the window drawing the unthrown blocks now goes on keeping them, so none of them jumps */
  private pin() { this.s = { ...this.s, keeps: homeOf(this.s) }; }
  role(win: string, role: Role) {
    const w = this.winOf(win);
    if (!w) return false;
    this.pin();
    this.s = { ...this.s, windows: this.s.windows.map((x) => (x.win === win ? { ...x, role } : x)) };
    this.settle();
    this.save();
    return true;
  }
  /** two windows trade what they hold (swap): their roles, the blocks thrown to each, and which keeps the rest */
  swap(a: string, b: string) {
    const A = this.winOf(a), B = this.winOf(b);
    if (!A || !B || a === b) return false;
    this.mark();
    this.pin();
    const other = (w: string | undefined) => (w === a ? b : w === b ? a : w);
    const where = Object.fromEntries(Object.entries(this.s.where).map(([k, w]) => [k, other(w)!]));
    this.s = { ...this.s, where, keeps: other(this.s.keeps), windows: this.s.windows.map((x) => (x.win === a ? { ...x, role: B.role } : x.win === b ? { ...x, role: A.role } : x)) };
    this.save();
    return true;
  }
  /** the talk (and its box) carried from one window to another: a window is what it holds. The one it leaves keeps
   *  its side (anchor) or holds blocks only (wall); the one it reaches has the talk beside its side (whole) or the talk
   *  and the blocks alone (stage). The unthrown blocks go with the talk */
  talk(from: string, to: string) {
    const A = this.winOf(from), B = this.winOf(to);
    if (!A || !B || from === to) return false;
    this.mark();
    const side = (r: Role) => r === "whole" || r === "anchor";
    const roles: Record<string, Role> = { [from]: side(A.role) ? "anchor" : "wall", [to]: side(B.role) ? "whole" : "stage" };
    this.s = { ...this.s, keeps: to, windows: this.s.windows.map((w) => { const r = own(roles, w.win); return r ? { ...w, role: r } : w; }) };
    this.settle();
    this.save();
    return true;
  }
  /** a block put on a window (thrown); home or null brings it back (pulled) */
  put(block: string, win: string | null) {
    this.mark();
    const where = { ...this.s.where };
    if (!win) delete where[block]; else where[block] = win;
    // an anchor draws no blocks and takes no talk by a throw: it stays as it is (the talk is carried by its head)
    this.pin();
    this.s = { ...this.s, where: capKeys(where, CAP.where) };
    this.save();
  }
  /** everything brought to one window at once (gather): every block with a line, and the blocks the face names (those
   *  drawn by default elsewhere); an anchor that gathers takes a stage (whole) */
  gather(to: string, blocks: string[] = []) {
    this.mark();
    const where: Record<string, string> = {};
    for (const b of [...Object.keys(this.s.where), ...blocks]) where[b] = to;
    const n = Object.entries(where).filter(([b]) => this.s.where[b] !== to).length;
    this.pin();
    this.s = { ...this.s, where: capKeys(where, CAP.where) };
    this.save();
    return n;
  }
  /** only for a window in the record (one that said hello); each map capped by the window cap */
  open(win: string, session: string) {
    if (!this.winOf(win)) return;
    this.s = { ...this.s, open: capKeys({ ...this.s.open, [win]: session }, CAP.windows) }; this.save();
  }
  lay(win: string, session: string, places: Place[]) {
    if (!this.winOf(win)) return;
    this.s = { ...this.s, lay: capKeys({ ...this.s.lay, [win]: capKeys({ ...(own(this.s.lay, win) ?? {}), [session]: places.slice(0, 40) }, CAP.lay) }, CAP.windows) };
    this.save();
  }
  /** this project's arrangement kept: the roles of the live windows and where its blocks are */
  keep(project: string, blocks: string[], now = Date.now(), more: { kinds?: Record<string, string>; session?: string } = {}) {
    const roles = Object.fromEntries(this.s.windows.filter((w) => w.live).map((w) => [w.win, w.role]));
    const where = Object.fromEntries(blocks.slice(0, 200).filter((b) => own(this.s.where, b)).map((b) => [b, own(this.s.where, b)!]));
    // each kind of block: the window it is drawn on (the record's line, else the window that keeps the rest); the last of a kind wins
    const keeps = this.s.keeps ?? this.s.home, kinds: Record<string, string> = {};
    for (const b of blocks.slice(0, 200)) { const k = more.kinds ? own(more.kinds, b) : undefined; if (typeof k === "string" && /^[a-z]{1,16}$/.test(k)) kinds[k] = own(this.s.where, b) ?? keeps; }
    const talk = this.s.windows.find((w) => w.live && (w.role === "whole" || w.role === "stage"))?.win;
    const prev = own(this.s.kept, project);
    this.s = { ...this.s, kept: capKeys({ ...this.s.kept, [project]: { roles, where, at: now,
      kinds: { ...(prev?.kinds ?? {}), ...kinds }, ...(more.session ? { session: more.session.slice(0, 80) } : {}), ...(talk ? { talk } : {}) } }, CAP.kept) };
    this.save();
    return own(this.s.kept, project)!;
  }
  /** a project's arrangement put back: the roles of windows that are here, its blocks where they were */
  recall(project: string) {
    const k = own(this.s.kept, project);
    if (!k || !isMap(k.roles) || !isMap(k.where)) return null;
    this.mark();
    const windows = this.s.windows.map((w) => { const r = own(k.roles, w.win); return r && validRole(r) ? { ...w, role: r } : w; });
    this.s = { ...this.s, windows: settled(windows, this.s.home), where: capKeys({ ...this.s.where, ...strMap(k.where) }, CAP.where) };
    this.save();
    return k;
  }
}

export const screensFile = (home: string) => join(home, "screens.json");
