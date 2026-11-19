// owned by slice 5 (AIs, voice, the AI's marks), docs/port/slices.md
// The AI's marks as rules (views/agent.js), pure on D: which told lines show, where a ring sits, the proof's steps.
// Tested in next-ais.test.ts. Signed: marcocyl04-ux's agent, slice 5 of the port (#1615).
import type { Data, Piece, Pos } from "../cv/types.ts";

export type Told = { ai: string; words: string; proof: unknown; piece: string | null; region: string | null; t: number };
/** one line each, newest first, three at most; with a region, only lines about it */
export const toldLines = (d: Data, region: string | null): Told[] =>
  ((d.told as Told[] | undefined) || []).filter((x) => !region || x.region === region).slice().sort((a, b) => b.t - a.t).slice(0, 3);

/** what a ring sits on: the piece; a part, its parent; at Far, the folder the piece is drawn in */
export function spotOf(d: Data, dist: string, isRegion: (id: string) => boolean, id: string): { id: string; q: Pos } | null {
  let p: Piece | undefined = d.pieces[id];
  if (!p) for (const q of Object.values(d.pieces)) if (((q.parts || []) as Piece[]).some((x) => x && x.id === id)) { p = q; break; }
  if (!p) return d.pos && d.pos[id] && isRegion(id) ? { id, q: d.pos[id] } : null;
  const on = dist === "far" ? p.region : p.id, q = d.pos && d.pos[on];
  return q ? { id: p.id, q } : null;
}
type Ring = { by: string; words?: string; t: number };
/** every ring not yet gone to, on what it sits */
export function ringSpots(d: Data, dist: string, isRegion: (id: string) => boolean, seen: Set<string>) {
  const out: { target: string; id: string; q: Pos; by: string; words?: string }[] = [];
  for (const [target, r] of Object.entries((d.rings as Record<string, Ring> | undefined) || {})) {
    const s = spotOf(d, dist, isRegion, target);
    if (!s || seen.has(s.id)) continue;
    out.push({ target, id: s.id, q: s.q, by: r.by, words: r.words });
  }
  return out;
}
/** the headline's proof: its rows, by their short form, the same steps folded into one with their times */
export function proofSteps(proof: { rows?: string[] }, rows: { id: string; at: string; brief: string }[]): { brief: string; at: string[] }[] {
  const steps: { brief: string; at: string[] }[] = [];
  for (const id of proof.rows || []) {
    const r = rows.find((x) => x.id === id); if (!r) continue;
    const last = steps[steps.length - 1];
    if (last && last.brief === r.brief) last.at.push(r.at); else steps.push({ brief: r.brief, at: [r.at] });
  }
  return steps;
}
