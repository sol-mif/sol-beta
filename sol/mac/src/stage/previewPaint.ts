// Draws the drop preview (#774, #751 B11; preview.ts says what) into the stage's preview layer, outside React, in the
// hand's own frame: two pearl guide lines whose opacity follows the pull, a dashed pearl-line outline (the block's
// curve) for each block the drop would move, and the trade target dimmed with a pearl rim. Nothing moves: only
// opacity, and the outlines' own place. clear() takes it all away, the dim with it, before the release runs.
import { curve } from "../kit/curve.ts";
import { CURVE } from "../kit/tokens.ts";
import { OUTLINE, TARGET_DIM, Z } from "../kit/feel.ts";
import type { Guide, Preview } from "./preview.ts";
import "./preview.css";

const NS = "http://www.w3.org/2000/svg";
const R = CURVE.radius.block, S = CURVE.smoothing, half = OUTLINE.line / 2;
type Out = { el: HTMLDivElement; svg: SVGSVGElement; path: SVGPathElement; key: string };
export type Painter = { show: (p: Preview) => void; clear: () => void };

export function previewPainter(layer: HTMLElement, elOf: (id: string) => HTMLElement | null): Painter {
  const line = (axis: "v" | "h") => {
    const d = document.createElement("div");
    d.className = `st-pv-guide ${axis}`;
    d.style.zIndex = String(Z.guide);
    d.style.opacity = "0";
    layer.appendChild(d);
    return d;
  };
  const v = line("v"), h = line("h");
  const outs: Out[] = [];
  const out = (i: number): Out => {
    while (outs.length <= i) {
      const el = document.createElement("div");
      el.className = "st-pv-out";
      el.style.zIndex = String(Z.outline);
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(NS, "path");
      path.setAttribute("stroke-width", String(OUTLINE.line));
      path.setAttribute("stroke-dasharray", OUTLINE.dash);
      svg.appendChild(path);
      el.appendChild(svg);
      layer.appendChild(el);
      outs.push({ el, svg, path, key: "" });
    }
    return outs[i];
  };
  const put = (el: HTMLDivElement, g: Guide, axis: "v" | "h") => {
    if (!g) { el.style.opacity = "0"; return; }
    el.style.opacity = g.o.toFixed(2);
    const a = g.a ?? 0, len = g.a !== undefined && g.b !== undefined ? `${g.b - g.a}px` : "100%";
    el.style.transform = axis === "v" ? `translate(${g.line - half}px, ${a}px)` : `translate(${a}px, ${g.line - half}px)`;
    if (axis === "v") el.style.height = len; else el.style.width = len;
  };
  let dimmed: HTMLElement | null = null;
  const undim = () => { if (!dimmed) return; dimmed.style.opacity = ""; delete dimmed.dataset.target; dimmed = null; };
  const dim = (id: string | null) => {
    const e = id ? elOf(id) : null;
    if (e === dimmed) return;
    undim();
    if (e) { e.style.opacity = String(TARGET_DIM); e.dataset.target = ""; dimmed = e; }
  };
  return {
    show(p) {
      put(v, p.guides.v, "v");
      put(h, p.guides.h, "h");
      p.outlines.forEach((o, i) => {
        const d = out(i);
        d.el.style.display = "block";
        d.el.style.transform = `translate(${o.r.x}px, ${o.r.y}px)`;
        d.el.style.width = `${o.r.w}px`;
        d.el.style.height = `${o.r.h}px`;
        const key = `${o.r.w}x${o.r.h}`;
        if (key !== d.key) {
          d.key = key;
          d.svg.setAttribute("width", String(o.r.w));
          d.svg.setAttribute("height", String(o.r.h));
          d.path.setAttribute("d", curve(o.r.w - OUTLINE.line, o.r.h - OUTLINE.line, R, S, half, half));
        }
      });
      for (let i = p.outlines.length; i < outs.length; i++) outs[i].el.style.display = "none";
      dim(p.dim);
    },
    clear() {
      v.style.opacity = "0";
      h.style.opacity = "0";
      outs.forEach((o) => (o.el.style.display = "none"));
      undim();
    },
  };
}
