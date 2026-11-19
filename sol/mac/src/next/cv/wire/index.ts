// The wires (#1604, docs/port/slices.md "Fixture or live"): in a real Sol the store starts empty and each slice's wire
// fills D from the engine's messages; the fixture is never loaded there. One file per slice, so no two builders touch
// one file; this one only gathers them. Signed: marcocyl04-ux's agent, the port's prep (#1615).
import type { Engine } from "./types.ts";
import { attach as plane } from "./plane.ts";
import { attach as needs } from "./needs.ts";
import { attach as near } from "./near.ts";
import { attach as life } from "./life.ts";
import { attach as ais } from "./ais.ts";
import { attach as settings } from "./settings.ts";
import { attach as engine } from "./engine.ts";
import { attach as people } from "./people.ts";

export type { Engine };
const WIRES = { plane, needs, near, life, ais, settings, engine, people };

/** attach every slice's wire to the engine (Next.tsx, live only); the answer takes them all off again */
export function attach(e: Engine): () => void {
  const offs: (() => void)[] = [];
  for (const [name, w] of Object.entries(WIRES)) {
    try { const off = w(e); if (typeof off === "function") offs.push(off); } catch (err) { console.error(`next: the ${name} wire failed`, err); }
  }
  return () => { for (const f of offs) { try { f(); } catch { /* one wire's trouble is never another's */ } } };
}
