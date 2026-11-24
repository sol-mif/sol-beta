// owned by slice R8 (fits you can see and take back), docs/port/slices.md
// Round 8 fixes, F2 and F4 (#1615; merge/shell.js fitDiary, fitTop, topMenu and engine.js whole, ported as they are):
//   fitDiary(el)   the Diary's card ends on a whole row with "+N more", the way the sidebar does: whole rows are hidden from
//                  the foot up, then any later one that still fits is given back; a week card whose rows all folded goes;
//                  the open why and the card's subject (ui.keep) fold last. "+N more" shows the whole page, which scrolls.
//   keepWidth(c)   today's page keeps its width: never under DIARY_PX on screen at Far. When the camera would draw it
//                  narrower, the page grows leftwards from its first right edge (zones.page0), found by bisection, and the
//                  camera fits again; the canvas pans, the card is never squeezed. (plane/layout.ts farCam calls it.)
//   fitTop(top)    the top bar folds into ⋯ instead of cutting: the hints, then Moves, then the working chip (the mockup's
//                  Aa is not in this face); the crumb never shrinks under its words.
// On the DOM only, after the draw; never D (except zones.page, the plane's, as engine.js whole does).
// Signed: marcocyl04-ux's agent, port slice R8 (#1615).
import { D, rectOn, viewSize, type Cam } from "../cv/core.ts";
import { EDGE_PX, Z_GAP, safe } from "../plane/layout.ts";
import { hooks } from "../cv/core.ts";
import { ui } from "./state.ts";

// ---------------------------------------------------------------- F2: the Diary's card ends on a whole row

/** the canvas whose Diary was opened whole by "+N more" (until the next load) */
let dyAll: unknown = null;
type Unit = { el?: Element | null; sec?: Element | null; n: number };
const hide = (e: HTMLElement) => { e.hidden = true; e.style.display = "none"; e.dataset.dyfit = "1"; };
const show = (e: HTMLElement) => { e.hidden = false; e.style.display = ""; e.removeAttribute("data-dyfit"); };
export function fitDiary(el: HTMLElement): void {
  const art = el.querySelector<HTMLElement>(".dy") || el;
  el.querySelectorAll(".dy-more").forEach((e) => e.remove());
  el.querySelectorAll<HTMLElement>("[data-dyfit]").forEach(show);
  if (dyAll === D || !el.clientHeight) return;
  const over = () => el.scrollHeight > el.clientHeight + 1;
  if (!over()) return;
  const units: Unit[] = [];
  for (const c of Array.from(art.children)) {
    if (c.matches(".dy-story") && ui.keep) { c.querySelectorAll(":scope>.dy-ask").forEach((x) => units.push({ el: x, n: 1 })); continue; }   // with a subject to keep, the story's own ask rows fold before it
    if (c.matches(".dy-top,.dy-story,header,.ft-dyfit")) continue;
    if (c.matches(".ft-week")) { Array.from(c.children).forEach((x, i) => units.push(i ? { el: x, n: Math.max(1, x.querySelectorAll(".ft-sf,.ft-wheld").length) } : { sec: c, n: 0 })); continue; }   // the week's summary: its head with the whole of it
    if (c.matches(".dy-f")) {
      const ls = Array.from(c.children).filter((l) => l.matches(".dy-l"));
      ls.forEach((l, i) => units.push({ el: i === 0 ? null : l, sec: i === 0 ? c : null, n: 1 }));
      if (!ls.length) units.push({ sec: c, n: 0 });
      // the port's folder also ends on its quiet lines (details.dy-quiet): one whole unit after its lines
      Array.from(c.children).filter((x) => x.matches(".dy-quiet")).forEach((x) => units.push({ el: x, n: Math.max(1, x.querySelectorAll(".dy-l").length) }));
    } else units.push({ el: c, n: Math.max(1, c.querySelectorAll(".dy-l").length) });
  }
  /* the port's card is narrower than the mockup's for its words (the date wraps at DIARY_PX): when the story alone would
     still run past the foot, its proof row folds, last of all (its headline and its need line always stay) */
  const proof = art.querySelector(":scope>.dy-story>.dy-proof");
  if (proof) units.unshift({ el: proof, n: 1 });
  if (!units.length) return;
  const more = document.createElement("button");
  more.className = "nx-row dy-more"; more.type = "button"; more.title = "Show the whole page; it scrolls";
  more.onclick = (e) => {
    e.stopPropagation(); dyAll = D;
    const first = el.querySelector("[data-dyfit]");
    fitDiary(el);
    if (first) el.scrollTop += first.getBoundingClientRect().top - el.getBoundingClientRect().top - 12;
  };
  art.append(more);
  /* what the person just opened (an open why) and the card's subject go last */
  const ks = [".ft-whytext:not([hidden])", ui.keep].filter(Boolean).join(",");
  const keep = (u: Unit) => { const e = (u.el || u.sec)!; return e.matches(ks) || !!e.querySelector(ks) || !!e.closest(ks); };
  const order = [...units.filter((u) => !keep(u)).reverse(), ...units.filter(keep).reverse()];
  let n = 0;
  const done: Unit[] = [];
  for (const u of order) { hide((u.el || u.sec) as HTMLElement); done.push(u); n += u.n; more.textContent = `+${n} more`; if (!over()) break; }
  /* then give back, from the top of what was folded, every whole unit that still fits, so the foot keeps no empty band */
  for (const u of units.filter((u) => done.includes(u))) {
    const e = (u.el || u.sec) as HTMLElement;
    show(e); n -= u.n; more.textContent = `+${n} more`;
    if (over()) { hide(e); n += u.n; more.textContent = `+${n} more`; break; }
  }
  /* a week whose rows all folded shows no lone header */
  art.querySelectorAll<HTMLElement>(".ft-week:not([data-dyfit])").forEach((w) => { const rows = Array.from(w.children).slice(1) as HTMLElement[]; if (rows.length && rows.every((r) => r.dataset.dyfit)) hide(w); });
  if (!n && !art.querySelector("[data-dyfit]")) more.remove();
}

// ---------------------------------------------------------------- F4: today's page keeps its width at Far

export const DIARY_PX = 360;
type Z = { page: { x: number; y: number; w: number; h: number }; diary: { x: number; w: number }; page0?: { x: number; w: number } };
/** `whole` is the plane's whole-cards fit; `floor` its least zoom at Far (FAR_FLOOR × LINE_FLOOR) */
let ZFLOOR = 0;
export function keepWidth(c: Cam, whole: (c: Cam) => Cam, floor: number): Cam {
  ZFLOOR = floor;
  if (!D.zones) return whole(c);
  const Zs = D.zones as unknown as Z, pg = Zs.page;
  if (!Zs.page0) Zs.page0 = { x: pg.x, w: pg.w };
  const set = (x: number, w: number) => { pg.x = x; pg.w = w; Zs.diary.x = x; Zs.diary.w = w; };
  set(Zs.page0.x, Zs.page0.w);
  const { w } = viewSize(), sa = safe("far"), want = Math.min(DIARY_PX, w - sa.l - sa.r - EDGE_PX), right = Zs.page0.x + Zs.page0.w;
  const r = whole(c);
  if (pg.w * r.z >= want - 0.5) return r;
  /* the least page that is drawn at least DIARY_PX: the camera's zoom moves with the page (a wider page can drop a column
     and zoom in), so search the page's width between what it was and DIARY_PX at the floor's least zoom */
  let lo = pg.w, hi = Math.max(pg.w, want / (floor * 0.5)), best: { nw: number; t: Cam } | null = null;
  for (let i = 0; i < 18; i++) { const nw = (lo + hi) / 2; set(right - nw, nw); const t = whole(c); if (nw * t.z >= want - 0.5) { best = { nw, t }; hi = nw; } else lo = nw; }
  if (!best) { set(right - hi, hi); return whole(c); }
  set(right - best.nw, best.nw);
  return best.t;
}

/** a line at the Diary's foot runs the page's width from the page's left, wherever a narrow window grew the page to
 *  (shell.js pieceHTML); elsewhere as wide as its piece, or the page as laid out at Far */
export function foldBox(q: { x: number }, rect: { x: number; w: number }, far: boolean | undefined, z: number): { x: number; w: number } {
  const Zs = D.zones as unknown as Z | undefined, pg = far && Zs ? Zs.page : null, pr = pg && q.x >= pg.x - 1 && q.x < pg.x + pg.w ? rectOn(pg) : null;
  const pw = Zs ? (Zs.page0 || Zs.page).w : 0;
  return pr ? { x: pr.x, w: Math.max(pr.w, 120) } : { x: rect.x, w: Math.max(rect.w, far && Zs ? pw * z : 120, 120) };
}

// ---------------------------------------------------------------- F4: the top bar folds into ⋯

const TOPFOLD = ["#hints", "#movesbtn", "#workingchip"];
/** fold what does not fit; the answer is how many items are folded */
export function fitTop(top: HTMLElement): number {
  const crumb = top.querySelector<HTMLElement>("#crumb"), right = top.querySelector<HTMLElement>(".nx-right");
  top.querySelectorAll<HTMLElement>("[data-topfold]").forEach((e) => { e.style.display = ""; e.removeAttribute("data-topfold"); });
  if (!crumb || !right) return 0;
  const cs = getComputedStyle(top), room = top.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0");
  const over = () => crumb.scrollWidth + right.scrollWidth + parseFloat(cs.columnGap || cs.gap || "0") > room + 1;
  for (const q of TOPFOLD) { if (!over()) break; const e = top.querySelector<HTMLElement>(q); if (e && e.getClientRects().length) { e.style.display = "none"; e.dataset.topfold = "1"; } }
  return top.querySelectorAll("[data-topfold]").length;
}
/** what the ⋯ menu lists: each folded item (each hint on its own), in words, and the element its press presses */
export function topItems(top: HTMLElement): { word: string; key: string; el: HTMLElement }[] {
  const items = Array.from(top.querySelectorAll<HTMLElement>("[data-topfold]")).flatMap((e) => (e.id === "hints" ? Array.from(e.querySelectorAll<HTMLElement>(".nx-hint")) : [e]));
  return items.map((e) => ({
    el: e,
    word: e.id === "workingchip" ? (top.querySelector("#working")?.textContent ?? "") : e.id === "movesbtn" ? "Every move" : e.title || (e.textContent ?? "").trim(),
    key: e.id === "movesbtn" ? "?" : e.querySelector(".nx-kbd")?.textContent ?? "",
  }));
}

// for count 23 (window.CV.hooks.fits on the dev page): the page's least width, the zones' gap, the least Far zoom
Object.defineProperties((hooks as unknown as { fits: object }).fits, { DIARY_PX: { value: DIARY_PX }, fitDiary: { value: fitDiary }, Z_GAP: { get: () => Z_GAP }, ZFLOOR: { get: () => ZFLOOR } });
