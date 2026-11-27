// Tabs on top of the canvas (#1615 BR1; engine next/tabs.ts, protocol next/protocol/TABS.md): a click opens a piece in
// place; ⤢, ⌘-click or a drag onto the row takes it out to a tab, another view of the same piece, which keeps its place
// on the canvas. The Canvas tab is always first and is never closed. Only the tab in front draws live (it is Near on its
// piece); a tab behind is its title and a status dot. Closing a tab, or dragging it down onto the canvas, puts the piece
// back: there is nothing to move, it never left (dropped on a folder, it is filed there). A tab an AI opens arrives
// behind, marked ✦, and comes forward only when asked and only while the person is not typing in the talk bar; an AI
// closing the person's tab leaves a line with Undo. After four of a kind taken out in a day, Sol offers once to open that
// kind as tabs (the knobs open-session and open-page, kept as fits with source "Sol offered").
// A folder can be kept as a tab (#1879 step 2; decisions.md 2026-11-25): its tab id is `folder:<folder id>`, its kind
// "folder", and it opens the folder's page form (folder_open as "page"); it is no piece, so it never draws Near.
// Live, each move sends one next.tab.* and the row is the engine's (cv/wire/tabs.ts); on the dev page and in tests the
// row is kept here alone. Named tab* so none meets a shared move. The row is tabs/Tabs.tsx.
// Signed: marcocyl04-ux's agent, BR1 tabs (#1615).
import { D, M, MODE, S, findByWords, go, hooks, regionOf, render, snap, spotFor, toPlane, done, type Done, type Moves, type Piece } from "../core.ts";
import type { Engine } from "../wire/types.ts";
import { W } from "./settings.ts";
import { send as sendSettings } from "../../settings/link.ts";

export type Tab = { id: string; by: "person" | "ai"; kind?: string; fresh?: true; at: number };
/** D.tabs: the row, the one in front (null: the Canvas), today's counts and quiets, the last line an AI left */
export type TabsState = {
  tabs: Tab[]; front: string | null;
  taken: Record<string, { day: string; n: number }>; quiet: Record<string, string>;
  undo: { tab: Tab; at: number } | null;
  /** where the person was on the canvas before a tab came to the front (snap()), given back by the Canvas tab */
  back: string | null;
};
export const OFFER_AT = 4;
/** a folder kept as a tab stands under this id: `folder:` and the folder's id */
export const FOLDER_TAB = "folder:";
/** the folder a tab id names, if it is a folder's tab */
export const folderOfTab = (id: string): string | null => (id.startsWith(FOLDER_TAB) && id.length > FOLDER_TAB.length ? id.slice(FOLDER_TAB.length) : null);
/** is a tab's subject here: a piece on the canvas, or a folder that exists */
export const tabSubject = (id: string): boolean => { const f = folderOfTab(id); return f ? !!regionOf(f) : !!D.pieces[id]; };
/** the folder tab drawn now: its folder open as a page, and the tab in front */
export const folderTabShown = (): string | null => {
  const t = TB(), f = t.front ? folderOfTab(t.front) : null;
  return f && S.page === "folder" && S.folderAs === "page" && S.folder === f ? t.front : null;
};
/** a piece's kind as the knobs and the offer count it */
export const kindOf = (p: Piece | undefined): "session" | "page" => (p?.kind === "session" ? "session" : "page");
/** the knob that says how a kind opens */
export const KNOB = { session: "open-session", page: "open-page" } as const;
const PLURAL = { session: "sessions", page: "pages" } as const;

/** the engine the moves send to: set by the wire in a real Sol, null on the dev page and in tests */
export const tabsLink: { e: Engine | null } = { e: null };
const live = () => MODE === "live" && !!tabsLink.e;
const send = (o: object) => { if (tabsLink.e) tabsLink.e.send(o); };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** the store's tab state, made when first read */
export function TB(): TabsState {
  let t = D.tabs as TabsState | undefined;
  if (!t) { t = { tabs: [], front: null, taken: {}, quiet: {}, undo: null, back: null }; D.tabs = t; }
  return t;
}
/** the piece a word names: its id, a session's id, or its name */
export function pieceFor(w: string): string | undefined {
  if (D.pieces[w]) return w;
  const s = Object.values(D.pieces).find((p) => String(p.sessionId ?? "") === w);
  if (s) return s.id;
  const f = findByWords(w);
  return f && D.pieces[f] ? f : undefined;
}
/** is this piece's tab the one drawn now: in front, and the view is Near on it */
export const tabShown = (): string | null => {
  const t = TB();
  return t.front && !S.page && S.dist === "near" && S.piece === t.front && D.pieces[t.front] ? t.front : null;
};
/** how this kind opens here: "tab" or "place" (the knob's take standing here) */
export const opensAs = (p: Piece | undefined): "tab" | "place" => {
  try { return W().prefs.kept[KNOB[kindOf(p)]] === "tab" ? "tab" : "place"; } catch { return "place"; }
};
/** the offer standing now, if any: a kind taken out OFFER_AT times today, not quieted today, still opening in place */
export function offerNow(): { kind: "session" | "page"; n: number; says: string } | null {
  const t = TB(), d = today();
  for (const kind of ["session", "page"] as const) {
    const c = t.taken[kind];
    if (!c || c.day !== d || c.n < OFFER_AT || t.quiet[kind] === d) continue;
    if (opensAs({ kind } as Piece) === "tab") continue;
    return { kind, n: c.n, says: `You've taken ${c.n} ${PLURAL[kind]} out to tabs today. Open ${PLURAL[kind]} as tabs from now on?` };
  }
  return null;
}
/** the person typing in the talk bar: an AI's tab never takes the front then */
const typing = () => { const el = typeof document !== "undefined" ? document.activeElement as HTMLInputElement | null : null; return !!el && el.id === "say" && !!el.value; };

/** the row as kept here, changed as the engine would (the dev page, and live before the engine answers) */
function openHere(id: string, by: Tab["by"], front: boolean) {
  const t = TB(), p = D.pieces[id], kind = folderOfTab(id) ? "folder" : kindOf(p);
  if (!t.tabs.some((x) => x.id === id)) {
    t.tabs.push({ id, by, kind, ...(by === "ai" ? { fresh: true as const } : {}), at: Date.now() });
    if (by === "person" && kind !== "folder") { const d = today(), c = t.taken[kind]; t.taken[kind] = { day: d, n: c && c.day === d ? c.n + 1 : 1 }; }
  }
  if (front) frontHere(id);
}
/** a tab's piece now stands under another id (a new session's starter, once it has started: cv/moves/near.ts startCard):
 *  the tab keeps its place in the row and the front. False when no tab held it */
export function swapTab(was: string, now: string): boolean {
  const t = TB(), i = t.tabs.findIndex((x) => x.id === was);
  if (i < 0 || !D.pieces[now]) return false;
  const front = t.front === was, by = t.tabs[i].by, oldKind = t.tabs[i].kind, kind = kindOf(D.pieces[now]);
  t.tabs[i] = { ...t.tabs[i], id: now, kind };
  // its count moves with it, as the engine moves it (next.tab.open swapped): a ⌘N is one session taken out, not a page too
  if (by === "person" && oldKind !== kind) {
    const d = today(), c = oldKind ? t.taken[oldKind] : undefined, k = t.taken[kind];
    if (c && c.day === d && c.n > 0) t.taken[oldKind!] = { day: d, n: c.n - 1 };
    t.taken[kind] = { day: d, n: k && k.day === d ? k.n + 1 : 1 };
  }
  if (front) { t.front = now; const sp = spotFor(now); if (sp) go(sp, "tab"); }
  // live, the engine has no rename: an open naming the id it swaps (so the engine moves the place, the front and the
  // count) and a close, the open first, both held until the engine's row shows them (BR1 gate 1b: the close's answer, a
  // row without the tab in front, took the view back to the Canvas)
  if (live()) { sendOpen(now, by, front, was); sendClose(was); }
  render();
  return true;
}
/** this window's opens and closes the engine's row does not show yet: an answer or a row sent before them is read with
 *  them (heard), so a tab just opened is not dropped, nor the front with it, and one just closed does not come back */
const opening = new Set<string>(), closing = new Set<string>();
function sendOpen(id: string, by: Tab["by"], front: boolean, swapped?: string) {
  opening.add(id); closing.delete(id);
  send({ type: "next.tab.open", id, by, kind: folderOfTab(id) ? "folder" : kindOf(D.pieces[id]), ...(front ? { front: true } : {}), ...(swapped ? { swapped } : {}) });
}
function sendClose(id: string) { closing.add(id); opening.delete(id); send({ type: "next.tab.close", id }); }
hooks.onLoad.push(() => { opening.clear(); closing.clear(); });
/** a new session's tab left before anything was said in it (BR1 gate 1b): the tab closes and its starter goes, so no
 *  empty "new session" stays behind. Words typed and not yet sent keep it (session/Port.tsx keeps them as the draft) */
function leftStarter(id: string) {
  const p = D.pieces[id], t = TB();
  if (p?.kind !== "starter" || !t.tabs.some((x) => x.id === id)) return;
  if (String(p.words ?? "").trim() || String(p.draft ?? "").trim() || (p.given as string[] | undefined)?.length) return;
  if (t.front === id) { t.front = null; t.back = null; }
  t.tabs = t.tabs.filter((x) => x.id !== id);
  if (live()) sendClose(id);
  M.closeStarter(id);
}
hooks.left.push(leftStarter);
function frontHere(id: string | null) {
  const t = TB();
  if (id && !t.tabs.some((x) => x.id === id)) return;
  if (id) {
    if (!tabShown() && !folderTabShown()) t.back = snap();
    t.front = id;
    t.tabs = t.tabs.map((x) => (x.id === id && x.fresh ? { id: x.id, by: x.by, kind: x.kind, at: x.at } : x));
    const fid = folderOfTab(id);
    if (fid) { M.folder_open(fid, "page"); return; }
    const sp = spotFor(id);
    if (sp) go(sp, "tab");
  } else {
    const was = tabShown(), back = t.back, fold = folderTabShown();
    t.front = null;
    if (fold) M.page(null);
    if (was) {
      if (back) { const o = JSON.parse(back); go({ ...o, page: null }, "tab"); }
      else go({ dist: "far", piece: null, beside: null, page: null }, "tab");
    }
    t.back = null;
  }
}

const moves: Moves = {
  /** take a piece out to a tab: in front (⤢, a drag onto the row), or behind (⌘-click); by an AI, always behind */
  tabOpen: (id: string, front = true, by: Tab["by"] = "person") => {
    if (!tabSubject(id)) return { ok: false, why: folderOfTab(id) ? "that folder isn't here" : "that piece isn't here", undo: () => {} };
    const had = TB().tabs.some((x) => x.id === id), f = front && by === "person";
    openHere(id, by, f);
    if (live()) sendOpen(id, by, f);
    render();
    return done(true, id, () => { if (!had) moves.tabClose(id); });
  },
  /** close a tab: the piece is where it always was on the canvas */
  tabClose: (id: string) => {
    const t = TB(), tab = t.tabs.find((x) => x.id === id);
    if (!tab) return { ok: false, why: "that tab isn't open", undo: () => {} };
    if (t.front === id) frontHere(null);
    t.tabs = t.tabs.filter((x) => x.id !== id);
    if (live()) sendClose(id);
    render();
    return done(true, id, () => { moves.tabOpen(id, false, tab.by); });
  },
  /** a tab to the front; null or "canvas": the Canvas */
  tabFront: (id: string | null) => {
    const to = !id || id === "canvas" ? null : id, was = TB().front;
    if (to && !TB().tabs.some((x) => x.id === to)) return { ok: false, why: "that tab isn't open", undo: () => {} };
    frontHere(to);
    if (live()) send({ type: "next.tab.front", id: to ?? "canvas" });
    render();
    return done(true, to ?? "canvas", () => { moves.tabFront(was); });
  },
  /** ⌘1–⌘9 (decisions.md 2026-11-25): ⌘1 is the Canvas, ⌘2–⌘9 the tabs left to right; a tab past nine has no number */
  tabKey: (n: number) => {
    const row = TB().tabs.filter((x) => tabSubject(x.id)), id = n === 1 ? null : row[n - 2]?.id;
    if (n < 1 || n > 9 || (n > 1 && !id)) return { ok: false, why: "no tab has that number", undo: () => {} };
    return moves.tabFront(id ?? null);
  },
  /** a tab dragged down onto the canvas: closed, and the piece placed where it was dropped (sx, sy: on #view), so a
   *  folder it lands in holds it (the plane's place); dropped on a tab's own view, it is only closed */
  tabDrop: (id: string, sx?: number, sy?: number) => {
    const shown = tabShown() === id, r = moves.tabClose(id) as Done;
    const q = D.pos?.[id];
    if (r.ok && !shown && q && typeof sx === "number" && typeof sy === "number" && S.dist !== "near") {
      const p = toPlane(sx, sy);
      M.place(id, p.x - q.w / 2, p.y - q.h / 2);
    }
    return r;
  },
  /** the offer answered: Yes keeps "As a tab" for this kind (a fit with source "Sol offered"); Keep in place asks no more today */
  tabOffer: (kind: "session" | "page", yes: boolean) => {
    const t = TB();
    if (yes) {
      const knob = KNOB[kind], w = W();
      w.prefs.kept[knob] = "tab";
      if (MODE === "live") sendSettings({ type: "next.fit.set", knob, scope: "~", take: "tab", source: "Sol offered" });
      hooks.flash?.(`${kind === "session" ? "Sessions" : "Pages"} open as tabs now. Change it in Settings › How things open.`);
    }
    t.quiet[kind] = today();
    if (live()) send({ type: "next.tab.quiet", kind });
    render();
    return done(true, kind);
  },
  /** the line an AI left when it closed a tab of the person's: Undo opens it again, as it was */
  tabUndo: () => {
    const t = TB(), u = t.undo;
    if (!u) return { ok: false, why: "nothing to undo", undo: () => {} };
    t.undo = null;
    return moves.tabOpen(u.tab.id, false, u.tab.by);
  },
  tabUndoGone: () => { TB().undo = null; render(); return done(true); },
};
export default moves;

/** an AI's verb, handed over by the engine (next.tab.ai): the window finds the piece and does what the hand would */
export function heardAi(m: { verb?: string; piece?: string; front?: boolean }): void {
  const id = typeof m.piece === "string" ? pieceFor(m.piece) : undefined;
  if (!id) { hooks.flash?.(`Your AI asked for “${m.piece ?? ""}”, which isn't on your canvas`); return; }
  if (m.verb === "open") { const sp = spotFor(id); if (sp) go(sp, "ai"); return; }
  if (m.verb === "tab") {
    moves.tabOpen(id, false, "ai");
    if (m.front && !typing()) moves.tabFront(id);
    return;
  }
  if (m.verb === "back") {
    const tab = TB().tabs.find((x) => x.id === id);
    if (!tab) return;
    moves.tabClose(id);
    if (tab.by === "person") { TB().undo = { tab, at: Date.now() }; render(); }
  }
}
/** the engine's row folded in (next.tabs, and each answer); the front and the way back stay this window's */
export function heard(m: { type?: string; ok?: boolean; tabs?: Tab[]; front?: string | null; taken?: TabsState["taken"]; quiet?: TabsState["quiet"] }): void {
  if (!m?.ok || !Array.isArray(m.tabs)) return;
  const t = TB();
  // this window's opens and closes not in the row yet are read with it; one the row shows is done
  const has = (id: string) => m.tabs!.some((x) => x.id === id);
  for (const id of closing) if (!has(id)) closing.delete(id);
  for (const id of opening) if (has(id)) opening.delete(id);
  const rows = m.tabs.filter((x) => !closing.has(x.id));
  for (const id of opening) { const x = t.tabs.find((y) => y.id === id); if (x) rows.push(x); }
  // the row keeps this window's order (the engine only adds at the end and takes out), so a new session's tab stays where
  // its start was and is not folded into "+N"; a tab new here goes after, in the engine's order
  const at = new Map(t.tabs.map((x, k) => [x.id, k]));
  t.tabs = rows.map((x, k) => ({ x, k: at.get(x.id) ?? t.tabs.length + k })).sort((a, b) => a.k - b.k).map((r) => r.x);
  if (m.taken) t.taken = m.taken;
  if (m.quiet) t.quiet = m.quiet;
  if (t.front && !t.tabs.some((x) => x.id === t.front)) frontHere(null);
  render();
}
