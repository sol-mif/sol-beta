// Fit mode in place (BR1 people item 1, #1615; mine/look/br1/three.html "see it in place"), drawn by the bottom bar
// (bar/Bar.tsx) in every band, with Customize (Customize.tsx) inside it:
//   FitInPlace  the canvas: the take tried drawn on the thing itself (a look as fitmode.css draws it, a size as the text
//               scale inside it, a colour as its --tint); a kept look, size or colour stays drawn on its folder, session
//               or the whole window (the fits Settings' wire reads, next.fits); a folder's setup look on its card
// Fit Sol's card (FitCard) went when Customize took the bar's place (BR1 item 4): Customize is the way to change a
// thing in place, Settings the rest. Every press is a move (cv/moves/fitmode.ts); the DOM is only decorated after the
// draw, never changed otherwise. Signed: marcocyl04-ux's agent, BR1 people (#1615).
import { useEffect, useLayoutEffect } from "react";
import { D, S, useNext } from "../cv/index.ts";
import type { FM } from "../cv/moves/fitmode.ts";
import { W } from "../cv/moves/settings.ts";
import { FSs } from "../cv/moves/setup.ts";
import { TEXT, TINT, inPlace, scopeOf } from "./model.ts";
import { Customize } from "./Customize.tsx";
import "./fitmode.css";

// ---------------------------------------------------------------- in place: the ring, the take tried, the takes kept

/** look: fit mode's look (a filter); z: a size; job: the folder's setup look, the treatment its job gives it
 *  (cv/moves/setup.ts); tint: a folder's colour (Customize), its --tint */
type Mark = { el: HTMLElement; look?: string; z?: number; job?: string; tint?: string };
let marked: HTMLElement[] = [];
/** the text scale's sizes as the face sets them (palette.css): read once, the base a size take multiplies */
let base: Record<string, number> | null = null;
function baseSizes(): Record<string, number> {
  if (base) return base;
  const cs = getComputedStyle(document.querySelector<HTMLElement>("[data-face=\"next\"]") ?? document.documentElement), out: Record<string, number> = {};
  for (const k of TEXT) for (const s of [k, `${k}-line`]) { const v = parseFloat(cs.getPropertyValue(`--t-${s}`)); if (v) out[s] = v; }
  return (base = out);
}
function clear() {
  for (const el of marked) {
    delete el.dataset.fmHov; delete el.dataset.fmOn; delete el.dataset.fmLook; delete el.dataset.fsLook;
    for (const s of Object.keys(baseSizes())) el.style.removeProperty(`--t-${s}`);
    el.style.removeProperty("--tint");
  }
  marked = [];
}
function paint(m: Mark) {
  marked.push(m.el);
  if (m.look) m.el.dataset.fmLook = m.look;
  if (m.job) m.el.dataset.fsLook = m.job;
  if (m.z) for (const [s, v] of Object.entries(baseSizes())) m.el.style.setProperty(`--t-${s}`, `${+(v * m.z).toFixed(2)}px`);
  if (m.tint) m.el.style.setProperty("--tint", m.tint);
}
/** where a folder's colour shows: its card, its body opened, and the dot by its name (each carries its own tint class) */
function tintEls(scope: string): HTMLElement[] {
  const r = D.regions.find((x) => scopeOf(x.id) === scope);
  if (!r) return [];
  const id = CSS.escape(r.id);
  return [...document.querySelectorAll<HTMLElement>(`#view [data-region="${id}"], #view .pl-area[data-area="${id}"], #view .pl-area[data-area="${id}"] .pl-dot`)];
}
/** a thing's element: the one on the canvas first (a folder is also a row in the sidebar), else wherever it is */
const q = (sel: string | null) => (sel ? document.querySelector<HTMLElement>(sel.split(",").map((s) => `#view ${s}`).join(",")) ?? document.querySelector<HTMLElement>(sel) : null);
/** the element a scope draws as: the whole window for All of Sol (the sidebar, the bar and this card too), a folder by
 *  its region, a session by its piece */
function elOf(scope: string): HTMLElement | null {
  if (scope === "~") return q(".nx[data-face=\"next\"]") ?? q("#view");
  if (scope.startsWith("session:")) {
    const id = scope.slice(8), p = Object.values(D.pieces).find((x) => String(x.sessionId ?? x.id) === id);
    return p ? q(`[data-piece="${CSS.escape(p.id)}"]`) : null;
  }
  const r = D.regions.find((x) => scopeOf(x.id) === scope);
  return r ? q(`[data-region="${CSS.escape(r.id)}"]`) : null;
}

/** drawn by the bar in every band: decorates the canvas after each draw */
export function FitInPlace() {
  useNext(() => 0);
  useLayoutEffect(() => {
    clear();
    const w = W(), fm = S.fm as FM | undefined, f = fm?.open ? fm : null, marks = new Map<HTMLElement, Mark>();
    const put = (el: HTMLElement | null, x: { look?: string; z?: number; job?: string; tint?: string }) => { if (!el) return; const m = marks.get(el) ?? { el }; Object.assign(m, x); marks.set(el, m); };
    // each folder's setup look (its job's treatment): on its card at rest and its body opened, never the sidebar row
    for (const s of Object.values(FSs().by)) if (s.look && s.look !== "plain") {
      const id = CSS.escape(s.folder);
      for (const el of document.querySelectorAll<HTMLElement>(`#view [data-region="${id}"], #view .pl-area[data-area="${id}"]`)) put(el, { job: s.look });
    }
    // kept: each look or size the person or Sol kept for a place, drawn on that place
    for (const fit of w.fits ?? []) if ((fit.knob === "look" || fit.knob === "size") && fit.take) put(elOf(fit.scope), inPlace(w, fit.knob, fit.take));
    // kept: each folder's colour (Customize)
    for (const fit of w.fits ?? []) if (fit.knob === "colour" && fit.take && TINT[fit.take]) for (const el of tintEls(fit.scope)) put(el, { tint: TINT[fit.take] });
    // tried: on the thing pointed at when the take is for its own place, else on the place it is for
    if (f?.trying) {
      const t = f.trying, own = f.target.reach[0]?.scope === t.scope ? q(f.target.sel) : null;
      if (t.knob === "colour") { if (TINT[t.take]) for (const el of tintEls(t.scope)) put(el, { tint: TINT[t.take] }); }
      else put(own ?? elOf(t.scope), inPlace(w, t.knob, t.take));
    }
    for (const m of marks.values()) paint(m);
    if (f) {
      // in Customize the thing is ringed only while its bar is open
      const on = !f.pointing && (!f.cu || f.bar) ? q(f.target.sel) : null, hov = f.pointing ? q(f.hov) : null;
      if (on) { on.dataset.fmOn = ""; marked.push(on); }
      if (hov) { hov.dataset.fmHov = ""; marked.push(hov); }
    }
    document.documentElement.toggleAttribute("data-fm-pointing", !!f?.pointing);
  });
  useEffect(() => () => { clear(); document.documentElement.removeAttribute("data-fm-pointing"); }, []);
  return <Customize />;
}
