// Tabs' wire (#1615 BR1; engine next/tabs.ts, protocol next/protocol/TABS.md): in a real Sol, D.tabs is the engine's
// next.tabs (the row, today's counts), asked once on attach and told again after every change from any window; an AI's
// verb arrives as next.tab.ai and the window does what the hand would (cv/moves/tabs.ts heardAi).
// Signed: marcocyl04-ux's agent, BR1 tabs (#1615).
import type { Engine } from "./types.ts";
import { heard, heardAi, tabsLink } from "../moves/tabs.ts";

export function attach(e: Engine): void | (() => void) {
  tabsLink.e = e;
  const off = e.subscribe((m: { type?: string }) => {
    if (m?.type === "next.tab.ai") { heardAi(m as never); return; }
    if (m?.type === "next.tabs" || (typeof m?.type === "string" && m.type.startsWith("next.tab."))) heard(m as never);
  });
  e.send({ type: "next.tabs" });
  return () => { off(); if (tabsLink.e === e) tabsLink.e = null; };
}
