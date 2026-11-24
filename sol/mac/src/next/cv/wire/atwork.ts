// See what's at work's wire (BR1 item 7): what work.run says of each session that the store does not keep (its helpers'
// words, since when, held by Pause) and the engine's Pause everything (next.atwork { held, paused }), into atwork/act.ts;
// the presses go back through it. Signed: marcocyl04-ux's agent (builder F), BR1 item 7 (#1615).
import { render } from "../core.ts";
import { setEngine, st } from "../../atwork/act.ts";
import type { Held } from "../../atwork/model.ts";
import type { Engine } from "./types.ts";

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function heldOf(v: unknown): Held | null {
  const h = v as Partial<Held> | null;
  return h && typeof h.at === "number" ? { at: h.at, folder: typeof h.folder === "string" ? h.folder : null, sessions: strs(h.sessions), autos: strs(h.autos) } : null;
}

export function attach(e: Engine): () => void {
  setEngine(e);
  const off = e.subscribe((m: { type?: string; [k: string]: unknown }) => {
    if (m.type === "work.run" && typeof m.sessionId === "string") {
      const id = m.sessionId;
      if (m.ended) { const { [id]: _gone, ...rest } = st.runs; st.runs = rest; }
      else st.runs = { ...st.runs, [id]: { tasks: strs(m.tasks).map((t) => t.slice(0, 120)), since: typeof m.since === "number" ? m.since : 0, paused: m.paused === true } };
      render();
    } else if (m.type === "next.atwork") {
      st.held = heldOf(m.held);
      const paused = new Set(strs(m.paused));
      for (const [id, r] of Object.entries(st.runs)) if (r.paused !== paused.has(id)) st.runs = { ...st.runs, [id]: { ...r, paused: paused.has(id) } };
      render();
    }
  });
  e.send({ type: "next.atwork.get" });
  return () => { off?.(); setEngine(null); };
}
