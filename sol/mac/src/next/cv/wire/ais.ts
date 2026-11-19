// owned by slice 5 (AIs, voice, the AI's marks), docs/port/slices.md
// The engine's messages this slice reads into D (live only; the fixture never runs a wire):
//   agents.list   the AIs, each with its rules as routines (what, when) and its state; asked again on agents.changed
//   work.run      a run's busy / waiting, kept by session id in D.runs, so an AI's state in words follows its run
//   work.switch   the answer to a pass (moves/ais.ts): the gist goes into the passed piece's talk
// work.stage.point is sent by M.point, never read. next.call / next.undo are slice 7's: until it lands, the AI's call path
// answers "not yet" live (map.md "the gate and the ledger": no), so nothing here sends them.
// Signed: marcocyl04-ux's agent, slice 5 of the port (#1615).
import { change, type Ai, type Routine } from "../core.ts";
import type { Engine } from "./types.ts";
import { setEngine } from "../../ais/link.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = { id: string; name: string; job?: string; role?: string; state?: string; rules?: { sentence?: string; rule?: string; folder?: string }[]; steps?: { when?: string; what?: string }[] };

/** agents.list's rows as D's AIs and routines (pure: next-ais.test.ts) */
export function fromList(rows: Row[]): { ais: Ai[]; routines: Routine[] } {
  const ais: Ai[] = [], routines: Routine[] = [];
  for (const r of rows) {
    if (!r || typeof r.name !== "string") continue;
    ais.push({ name: r.name, piece: `agent:${r.id}`, from: "agents", state: r.state ?? "resting", job: r.role || r.job || "" });
    const steps = Array.isArray(r.steps) && r.steps.length ? r.steps.map((s) => ({ what: s.what ?? "", when: s.when ?? "" }))
      : (r.rules || []).map((x) => ({ what: x.sentence || x.rule || "", when: x.folder ? `in ${x.folder}` : "" }));
    for (const s of steps) if (s.what) routines.push({ ai: r.name, what: s.what, when: s.when });
  }
  return { ais, routines };
}

export function attach(e: Engine): () => void {
  setEngine(e);
  let n = 0, rid = "";
  const ask = () => { rid = `nx-ais-${Date.now().toString(36)}-${++n}`; e.send({ type: "agents.list", rid }); };
  const off = e.subscribe((m: any) => {
    if (!m || typeof m.type !== "string") return;
    if (m.type === "agents.changed") { ask(); return; }
    if (m.type === "agents.list" || (m.rid && m.rid === rid && Array.isArray(m.agents))) {
      if (!m.ok && m.ok !== undefined) return;
      const { ais, routines } = fromList(m.agents || []);
      change((d) => {
        d.ais = [...d.ais.filter((a) => a.from !== "agents"), ...ais];
        d.routines = [...(d.routines || []).filter((r) => !ais.some((a) => a.name === r.ai)), ...routines];
      });
      return;
    }
    if (m.type === "work.run" && typeof m.sessionId === "string") {
      change((d) => { d.runs = { ...((d.runs as object) || {}), [m.sessionId]: { busy: !!m.busy, waiting: m.waiting ?? null, ended: !!m.ended } }; });
      return;
    }
    if (m.type === "work.switch" && typeof m.rid === "string" && m.rid.startsWith("nx-pass-") && typeof m.brief === "string") {
      change((d) => {
        const p = Object.values(d.pieces).find((x) => x.sessionId === m.parent);
        if (p) p.talk = [...(p.talk || []), `passed to ${m.seat} with its gist: ${m.brief.split("\n")[0]}`];
      });
    }
  });
  ask();
  return () => { off(); setEngine(null); };
}
