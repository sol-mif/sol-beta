// Where Sol put folders, live (BR1 item 4, #1615; sol/PROTOCOL.md "next.placed"): the folders Sol placed and the person has
// not seen, for the canvas's dot (plane/placed.ts). Asked once the engine has said what Sol knows (next.known: an engine
// without it refuses the message), and again after every change that may take one away: next.known again (That's right
// and a move back refresh it), a move-in kept. Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { render } from "../core.ts";
import { setUnseen, unseenOk } from "../../plane/placed.ts";
import type { Engine } from "./types.ts";

export function attach(e: Engine): () => void {
  const ask = () => e.send({ type: "next.placed" });
  const off = e.subscribe((m: { type?: string; ok?: boolean; placed?: unknown }) => {
    if (m?.type === "next.placed" && m.ok !== false) { setUnseen(unseenOk(m.placed)); render(); }
    else if ((m?.type === "next.known" && m.ok !== false) || m?.type === "next.movein.kept") ask();
  });
  return () => { off(); setUnseen([]); };
}
