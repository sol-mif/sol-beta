// A folder's setup and its agent, the wire (BR1 people item 2, #1615): the moves in cv/moves/setup.ts send through this
// engine, and its answers (a setup, every setup, a preview, a keep, a back, a sort) land in S.fs by heard(). On attach it
// asks for every folder set up, so their looks are drawn from the first frame.
// Signed: marcocyl04-ux's agent, BR1 people item 2 (#1615).
import type { Engine } from "./types.ts";
import { fsLink, heard } from "../moves/setup.ts";

const TYPES = new Set(["next.folder.setup", "next.folder.setups", "next.folder.setup.set", "next.folder.sorted"]);

export function attach(e: Engine): () => void {
  fsLink.e = e;
  const off = e.subscribe((m: { type?: string } & Parameters<typeof heard>[0]) => { if (m?.type && TYPES.has(m.type)) heard(m); });
  e.send({ type: "next.folder.setups" });
  return () => { off(); if (fsLink.e === e) fsLink.e = null; };
}
