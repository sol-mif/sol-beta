// Mark up's own root (BR1, #1615): drawn in the pop-ups' layer (#nx-over, next/layers.ts), made the first time Mark up
// turns on, so the shell and the chat bar need nothing but the attach menu's entry (markUp()). Signed: marcocyl04-ux's
// agent (builder P), BR1 (#1615).
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

let root: Root | null = null;

export function mount(): void {
  if (root || typeof document === "undefined") return;
  const host = document.getElementById("nx-over");
  if (!host) return;
  const d = document.createElement("div");
  d.className = "mu-root";
  host.appendChild(d);
  root = createRoot(d);
  void import("./MarkUp.tsx").then((v) => root?.render(createElement(v.default)));
}
