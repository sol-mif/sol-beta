// The move-in's own screen (round 6 · M1, #1615; merge/movein.js lay/show): #mvi, a dialog over the whole window, drawn in
// a root of its own so the shell (Next.tsx) needs no slot for it. While it is up the shell is hidden (body.moving, in
// movein.css) and the screen's scroll area ends above the talk pill. The screen's view is loaded the first time it opens.
// Signed: marcocyl04-ux's agent, port slice 11 (#1615).
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { layerRoot } from "../layers.ts";

let root: Root | null = null, loading: Promise<void> | null = null;

/** the screen's element, made once */
function lay(): HTMLElement {
  let d = document.getElementById("mvi");
  if (d) return d;
  d = document.createElement("div");
  d.id = "mvi"; d.className = "mvi"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Moving in"); d.dataset.face = "next"; d.hidden = true;
  layerRoot(d);   // the four layers (next/layers.ts), as on .nx
  document.body.appendChild(d);
  return d;
}

/** the screen up (over the window, the shell hidden) or down */
export function show(on: boolean): void {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("moving", on);
  const el = lay();
  el.hidden = !on;
  if (on && !root && !loading) {
    loading = import("./index.tsx").then((v) => {
      root = createRoot(el);
      root.render(createElement(v.default));
    });
  }
}
