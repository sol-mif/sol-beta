// Workspace changes' wire (#1615 BR1; engine next/workspace.ts, protocol next/protocol/WS.md): in a real Sol,
// D.workspace is the engine's next.workspace (the suggestions and the changes kept), asked once on attach and again after
// each keep, discard, undo or new suggestion; the moves' answers (cv/moves/workspace.ts heard) fold the rest in.
// Signed: marcocyl04-ux's agent, BR1 carry (#1615).
import type { Engine } from "./types.ts";
import { heard, wsLink } from "../moves/workspace.ts";

export function attach(e: Engine): void | (() => void) {
  wsLink.e = e;
  const off = e.subscribe((m: { type?: string }) => {
    if (m?.type === "next.workspace.changed") { e.send({ type: "next.workspace" }); return; }   // an AI suggested a setup (suggest_setup): ask again
    if (typeof m?.type === "string" && m.type.startsWith("next.workspace")) heard(m);
  });
  e.send({ type: "next.workspace" });
  return () => { off(); if (wsLink.e === e) wsLink.e = null; };
}
