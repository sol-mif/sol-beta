// Fit mode's wire (BR1 people item 1, #1615): in a real Sol the moves send next.fit.try (cv/moves/fitmode.ts) through
// this engine, and its answers (a preview with a token, a keep, a back, a refusal) land in S.fm by heard(). The fits
// themselves are read again by Settings' wire (next.fits), which the in-place drawing reads.
// Signed: marcocyl04-ux's agent, BR1 people (#1615).
import type { Engine } from "./types.ts";
import { fmLink, heard } from "../moves/fitmode.ts";

export function attach(e: Engine): () => void {
  fmLink.e = e;
  const off = e.subscribe((m: { type?: string } & Parameters<typeof heard>[0]) => { if (m?.type === "next.fit.try") heard(m); });
  return () => { off(); if (fmLink.e === e) fmLink.e = null; };
}
