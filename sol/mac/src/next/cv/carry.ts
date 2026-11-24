// The carry (harmony S26, #1615; harmony/canvas.md §2, immersion.md §1 "Transitions carry state", flow.html steps 7–8):
// where you were, kept per place and per distance, so leaving and coming back lands on the same spot. Each place (a folder,
// or Far, Needs, a page) keeps, per distance, the face last focused there, the pane, the scroll, the selection and every
// half-typed input. Coming back to Middle of a place lands on the face you last focused; closing the window zooms out past
// Far into the place's glance card, and pressing a card grows the window back into that place, at the distance and on the
// face you left. This is next.where {dist, region, piece, pause} plus {scroll, selection, draft} (slices.md); the wire is
// slice 7's and not built, so the face keeps it in its own store (S.carry) and, live, hands it to one stub (onWhere).
// The file has no runtime import: install(store) takes the store (cv/core.ts's names, or the dev page's window.CV), so the
// counts can load it into the built dev page before the join imports it (docs/port/requests/carry.md).
// Signed: marcocyl04-ux's agent, port slice S26 (#1615).
import type { Data, Done, Moves, State } from "./types.ts";

/** what one place keeps at one distance */
export type Where = {
  dist: string; region: string | null; piece: string | null; pane: string; beside: string | null; page: string | null;
  /** the face last focused here: a piece at Middle and Near, a folder at Far */
  face: string | null;
  /** scrollTop by element key (#view, a pane) */
  scroll: Record<string, number>;
  /** the caret in the input last focused here */
  selection: { key: string; start: number; end: number } | null;
  /** half-typed words by input key */
  draft: Record<string, string>;
};
/** the carry's own state, in S.carry: every place's every distance, each place's last distance, and the window */
export type Carry = { by: Record<string, Where>; last: Record<string, string>; closed: boolean; at: string };
/** the message slice 7's wire will send (slices.md "next.where") */
export type WhereMsg = { t: "next.where"; dist: string; region: string | null; piece: string | null; pause: boolean; scroll: Record<string, number>; selection: Where["selection"]; draft: Record<string, string> };

/** the store as install() needs it: cv/core.ts's names (live bindings) or the dev page's window.CV (getters) */
export type Store = {
  readonly D: Data; readonly S: State; readonly MODE: string; M: Moves;
  render(): void; subscribe(f: () => void): () => void;
  go(spot: Partial<State>, how: string, viaKey?: boolean): Done;
  done(ok: boolean, id?: string, undo?: () => void): Done;
  /** the seams (core.ts hooks): hooks.agent's one set of moves (slice 5, count 13) learns the carry's two */
  readonly hooks?: { agent?: { MOVE_FN?: Record<string, string>; PERSON_ONLY?: Record<string, string> } } & Record<string, unknown>;
};

/** the carry's moves in the AI's one set (count 13; slice 5's agent/calls.ts tables): closing the window and pressing a
 *  glance card move what the person sees, so an AI that calls them is refused as a camera move ("look" and "point" are
 *  the functions it uses for the same end) */
export const CARRY_FN: Record<string, string> = { closeWindow: "look", glance: "point" };

// ---------------------------------------------------------------- the pure rules (next-carry.test.ts)

/** the place the person is in: a page over the canvas, a folder, Needs, or Far */
export const placeKey = (s: Pick<State, "page" | "region" | "dist">): string =>
  s.page ? `page:${s.page}` : s.dist === "needs" ? "needs" : s.dist === "far" || !s.region ? "far" : s.region;
/** the place at its distance: what the carry keeps one Where for */
export const whereKey = (s: Pick<State, "page" | "region" | "dist">): string => {
  const p = placeKey(s);
  return p.startsWith("page:") || p === "needs" || p === "far" ? p : `${p}|${s.dist}`;
};
/** the pieces at Middle in their order (core.ts piecesShown, on the data given) */
export const shownIn = (d: Data, region: string | null): string[] => Object.values(d.pieces).filter((p) => p.region === region && !p.inside).map((p) => p.id);
/** the face focused now: at Far the folder chosen, at Middle the piece chosen (S.sel, as the plane draws .pl-sel), at Near
 *  the piece open */
export function faceOf(d: Data, s: State): string | null {
  if (s.page) return null;
  if (s.dist === "near") return s.piece;
  if (s.dist === "middle") { const ids = shownIn(d, s.region); return ids.length ? ids[s.sel % ids.length] : null; }
  if (s.dist === "far") { const n = d.regions.length; return n ? d.regions[s.sel % n].id : null; }
  return null;
}
/** a fresh carry */
export const freshCarry = (): Carry => ({ by: {}, last: {}, closed: false, at: "" });
const blank = (s: State): Where => ({ dist: s.dist, region: s.region, piece: s.piece, pane: s.pane, beside: s.beside, page: s.page, face: null, scroll: {}, selection: null, draft: {} });
/** note where the person is now: the spot and the focused face of this place at this distance, and this place's last
 *  distance. Scroll, selection and drafts are kept as they come (the DOM's events) */
export function note(c: Carry, d: Data, s: State): Where {
  const k = whereKey(s), w = c.by[k] ?? (c.by[k] = blank(s));
  Object.assign(w, { dist: s.dist, region: s.region, piece: s.piece, pane: s.pane, beside: s.beside, page: s.page, face: faceOf(d, s) });
  if (!s.page) c.last[placeKey(s)] = k;
  return w;
}
/** coming back to a place at a distance: the chosen index that lands on the face last focused there (null: nothing kept,
 *  or that face is gone). Middle and Far only: at Near the piece is the face. One step out from Near lands on the piece
 *  you were in (the zoom out starts from it, immersion.md §1); from Middle to Far, on its folder */
export function arrive(c: Carry, d: Data, s: State, from?: Where | null): number | null {
  if (s.dist !== "middle" && s.dist !== "far") return null;
  const ids = s.dist === "middle" ? shownIn(d, s.region) : d.regions.map((r) => r.id);
  const out = from && !from.page && (s.dist === "middle" ? from.dist === "near" && from.region === s.region ? from.piece : null : from.dist === "middle" ? from.region : null);
  const face = out && ids.includes(out) ? out : c.by[whereKey(s)]?.face;
  const i = face ? ids.indexOf(face) : -1;
  return i < 0 ? null : i;
}
/** pressing a place's glance card: the spot the window grows back into, the place at the distance it was left at, on its
 *  face (canvas.md §2, flow.html step 8); a place never visited lands at its Middle */
export function reopen(c: Carry, d: Data, region: string): Partial<State> | null {
  if (!d.regions.some((r) => r.id === region)) return null;
  const w = c.by[c.last[region] ?? ""];
  if (w && w.dist === "near" && w.piece && d.pieces[w.piece]?.region === region)
    return { dist: "near", region, piece: w.piece, pane: w.pane, beside: w.beside && d.pieces[w.beside] ? w.beside : null, part: null, page: null };
  return { dist: "middle", region, piece: null, beside: null, part: null, page: null };
}
/** the place the window shrinks into when it closes (its glance card): the folder, or none at Far, Needs or a page */
export const cardOf = (s: State): string | null => (s.page || s.dist === "far" || s.dist === "needs" ? null : s.region);
/** the next.where message for where the person is now */
export function whereMsg(c: Carry, s: State): WhereMsg {
  const w = c.by[whereKey(s)];
  return { t: "next.where", dist: s.dist, region: s.region, piece: s.piece, pause: c.closed, scroll: { ...(w?.scroll ?? {}) }, selection: w?.selection ?? null, draft: { ...(w?.draft ?? {}) } };
}
/** an input's key, kept across its redraws: its id, the piece it talks to, its label. The talk pill (#say) and Find (#gq)
 *  belong to the shell, not a place, and are never carried */
export function inputKey(a: { id?: string; pid?: string | null; label?: string | null; placeholder?: string | null; type?: string }): string | null {
  if (a.type === "password" || a.id === "say" || a.id === "gq") return null;
  if (a.id) return `#${a.id}`;
  if (a.pid) return `say:${a.pid}`;
  if (a.label) return `aria:${a.label}`;
  if (a.placeholder) return `ph:${a.placeholder}`;
  return null;
}

// ---------------------------------------------------------------- live: the stub slice 7's wire replaces

/** live, every next.where goes here; slice 7's wire sets it to its send (docs/port/requests/carry.md). A no-op until then */
export let onWhere: (m: WhereMsg) => void = () => {};
export function wireWhere(send: (m: WhereMsg) => void): () => void { const was = onWhere; onWhere = send; return () => { onWhere = was; }; }

// ---------------------------------------------------------------- install: the store's listener, the moves, the DOM

type Field = HTMLInputElement | HTMLTextAreaElement;
const FIELDS = "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=range]),textarea";
const keyOf = (el: Field) => inputKey({ id: el.id, pid: el.getAttribute("data-pid"), label: el.getAttribute("aria-label"), placeholder: el.getAttribute("placeholder"), type: (el as HTMLInputElement).type });
const scrollKey = (el: Element): string | null => el.id ? `#${el.id}` : el.getAttribute("data-pane") ? `pane:${el.getAttribute("data-pane")}` : null;

/** put the carry on a store: S.carry, the moves closeWindow and glance, the listener that notes and lands, and (with a
 *  document) the drafts, scroll and selection. Once per store; returns the carry's handle */
export function install(cv: Store) {
  const M = cv.M as Moves & { __carry?: unknown };
  if (M.__carry) return M.__carry as ReturnType<typeof make>;
  const h = make(cv);
  Object.defineProperty(M, "__carry", { value: h, enumerable: false });
  return h;
}

function make(cv: Store) {
  let S0: State | null = null, at = "", sentAt = "", busy = false;
  const C = (): Carry => {
    const s = cv.S as State & { carry?: Carry };
    if (!s.carry) s.carry = freshCarry();
    return s.carry;
  };
  /** after every change: a new S (a scenario loaded) starts a fresh carry; an arrival lands on the face kept; then note */
  const heard = () => {
    if (busy) return;
    busy = true;
    try {
      const s = cv.S, c = C();
      if (s !== S0) { S0 = s; at = whereKey(s); c.at = at; note(c, cv.D, s); pend = at; return; }
      const k = whereKey(s);
      if (k !== at) {
        const from = c.by[at] ?? null;
        at = k; c.at = k; pend = k;
        const i = arrive(c, cv.D, s, from);
        if (i !== null && i !== s.sel) { s.sel = i; cv.render(); }
      }
      note(c, cv.D, s);
      if (cv.MODE === "live" && (k + c.closed) !== sentAt) { sentAt = k + c.closed; try { onWhere(whereMsg(c, s)); } catch { /* the wire's trouble is never the face's */ } }
    } finally { busy = false; }
  };
  cv.subscribe(heard);

  const moves: Moves = {
    /** the window closes: it shrinks into the glance card of the place it was in (a zoom out past Far) */
    closeWindow() {
      const c = C();
      if (c.closed) return cv.done(false);
      const card = cardOf(cv.S);
      heard();
      c.closed = true; (cv.S.sig as Record<string, unknown>).away = true;
      const r = cv.go({ dist: "far", region: null, piece: null, beside: null, part: null, page: null }, "close");
      if (!r.ok) cv.render();
      return cv.done(true, card ?? undefined, () => { c.closed = false; (cv.S.sig as Record<string, unknown>).away = false; r.undo(); cv.render(); });
    },
    /** a glance card pressed: the window grows from it into that place, where you were in it */
    glance(region?: string) {
      const c = C(), sp = region ? reopen(c, cv.D, region) : null;
      if (!sp) return cv.done(false);
      const was = c.closed;
      c.closed = false; (cv.S.sig as Record<string, unknown>).away = false;
      const r = cv.go(sp, "glance", false);
      if (!r.ok) cv.render();
      return cv.done(true, region, () => { c.closed = was; (cv.S.sig as Record<string, unknown>).away = was; r.undo(); cv.render(); });
    },
  };
  Object.assign(cv.M, moves);
  const A = cv.hooks?.agent;
  for (const [m, f] of Object.entries(CARRY_FN)) { if (A?.MOVE_FN) A.MOVE_FN[m] ??= f; if (A?.PERSON_ONLY) A.PERSON_ONLY[m] ??= "camera"; }

  // ------------------------------------------------ the DOM: drafts, scroll, selection (the dev page and a real Sol)
  let pend = "";
  const seen = new WeakMap<Element, string>();
  const here = (): Where => note(C(), cv.D, cv.S);
  const setValue = (el: Field, v: string) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));   // a controlled input's onChange hears it
  };
  /** every field on screen: a fresh one (new, or now in another place) gets this place's draft back; a known one is noted */
  const scan = () => {
    if (typeof document === "undefined") return;
    const w = here(), k = whereKey(cv.S);
    for (const el of document.querySelectorAll<Field>(FIELDS)) {
      const key = keyOf(el);
      if (!key) continue;
      const tag = `${k}~${key}`;
      if (seen.get(el) !== tag) {
        seen.set(el, tag);
        const v = w.draft[key];
        if (v && el.value !== v) {
          setValue(el, v);
          const sel = w.selection;
          if (sel?.key === key) { try { el.setSelectionRange(sel.start, sel.end); } catch { /* a field without a caret */ } }
        }
        continue;
      }
      if (el.value) w.draft[key] = el.value; else delete w.draft[key];
    }
    const a = document.activeElement as Field | null;
    if (a?.matches?.(FIELDS)) { const key = keyOf(a); if (key && a.selectionStart !== null) w.selection = { key, start: a.selectionStart, end: a.selectionEnd ?? a.selectionStart }; }
    if (pend === k) {
      let left = 0;
      for (const [sk, top] of Object.entries(w.scroll)) {
        const el = sk.startsWith("#") ? document.getElementById(sk.slice(1)) : document.querySelector(`#view [data-pane="${sk.slice(5)}"]`);
        if (!el) { left++; continue; }
        if (Math.abs(el.scrollTop - top) > 1) { el.scrollTop = top; if (Math.abs(el.scrollTop - top) > 1) left++; }
      }
      if (!left) pend = "";
    }
  };
  if (typeof document !== "undefined") {
    const later = () => requestAnimationFrame(scan);
    document.addEventListener("input", scan, true);
    document.addEventListener("keyup", scan, true);
    document.addEventListener("keydown", later, true);
    document.addEventListener("mouseup", scan, true);
    // the person's own hand ends a landing's scroll; then each scroll is noted for this place
    for (const ev of ["wheel", "pointerdown", "keydown", "touchstart"]) document.addEventListener(ev, () => { pend = ""; }, { capture: true, passive: true });
    document.addEventListener("scroll", (e) => {
      const el = e.target as Element;
      if (pend || !(el instanceof Element)) return;
      const sk = scrollKey(el);
      if (!sk || !(el.id === "view" || el.closest("#view"))) return;
      here().scroll[sk] = el.scrollTop;
    }, true);
    // the join (#1615): a pan draws the plane every frame (S32); the page is not scanned for a change that was the camera's
    // alone (no field arrived, no landing's scroll waits); every other change is scanned as before
    const camOnly = () => !!(cv as { camOnlyNow?: () => boolean }).camOnlyNow?.();
    const fieldIn = (rs: MutationRecord[]) => rs.some((r) => r.type === "attributes" || Array.from(r.addedNodes).some((n) => n instanceof Element && (n.matches(FIELDS) || !!n.querySelector(FIELDS))));
    new MutationObserver((rs) => { if (camOnly() && !pend && !fieldIn(rs)) return; scan(); }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["value"] });
    cv.subscribe(() => { if (camOnly() && !pend) return; later(); });
  }
  heard();
  return { C, scan, moves, whereMsg: () => whereMsg(C(), cv.S) };
}
