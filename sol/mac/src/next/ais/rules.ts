// owned by slice 5 (AIs, voice, the AI's marks), docs/port/slices.md
// The AIs page's rules (views/ais.js), pure on D and S: one AI's state in words, read from its work and never stored,
// what it is on, and the page's one line. Tested in next-ais.test.ts. Signed: marcocyl04-ux's agent, slice 5 (#1615).
import type { Ai, Ask, Data, Piece, Routine } from "../cv/types.ts";

export type AiState = { cls: "st-need" | "st-work" | "st-rest"; say: string; asks: Ask[] };
/** live, a run's busy / waiting by its session id (cv/wire/ais.ts) */
type Runs = Record<string, { busy: boolean; waiting: unknown; ended: boolean }>;

/** one AI's state in words, from its piece and its asks: the same rule everywhere */
export function stateOf(d: Data, open: Ask[], ai: Ai): AiState {
  const p: Piece | undefined = d.pieces[ai.piece];
  const asks = open.filter((a) => a.piece === ai.piece);
  const run = p && typeof p.sessionId === "string" ? (d.runs as Runs | undefined)?.[p.sessionId] : undefined;
  if ((p && p.term && p.term.waiting) || (run && run.waiting)) return { cls: "st-need", say: "Waiting for you at its terminal", asks };
  if (asks.length) return { cls: "st-need", say: asks.length === 1 ? "Has a question" : `Has ${asks.length} questions`, asks };
  if (p && p.kind === "session") return { cls: "st-work", say: `Working · ${p.term?.stateWord ?? (run?.busy ? "busy" : "between steps")}`, asks };
  // live, an agent from agents.list has no piece: its state is the engine's word
  if (!p && ai.from === "agents") {
    const st = String(ai.state || "resting");
    if (st === "needs" || st === "stuck") return { cls: "st-need", say: st === "stuck" ? "Stopped where it got stuck" : "Has a question", asks };
    if (st === "working") return { cls: "st-work", say: "Working", asks };
  }
  return { cls: "st-rest", say: "Resting", asks };
}

/** what it is on: its copy and folder, or the page it keeps; live, its job in words */
export function onWhat(d: Data, ai: Ai, regionName: (id: string) => string | undefined): { what: string; where: string; tail: string } | null {
  const p = d.pieces[ai.piece];
  if (!p) return ai.job ? { what: String(ai.job), where: "", tail: "" } : null;
  const where = regionName(p.region) ?? "";
  return p.kind === "session" ? { what: String(p.copy ?? p.name), where, tail: `${p.files ?? 0} files changed so far` } : { what: p.name, where, tail: "" };
}

/** the page's one line: how many, who needs you, who works */
export function sayLine(states: AiState[]): string {
  if (!states.length) return "No AIs yet. One appears when you hand a piece of work to it.";
  const need = states.filter((s) => s.cls === "st-need").length, work = states.filter((s) => s.cls === "st-work").length;
  return [`${states.length} AI${states.length === 1 ? "" : "s"}.`, need ? `${need === 1 ? "One of them needs" : need + " of them need"} you;` : "", work ? `${work} working.` : "", !need && !work ? "All resting." : ""]
    .filter(Boolean).join(" ").replace(/;$/, ".");
}

export const routinesOf = (d: Data, name: string): Routine[] => (d.routines || []).filter((r) => r.ai === name);
