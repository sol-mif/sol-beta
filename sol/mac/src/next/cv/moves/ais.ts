// owned by slice 5 (AIs, voice, the AI's marks), docs/port/slices.md
// This slice's moves, merged into M by moves/index.ts; each answers Done ({ ok, id, undo }).
//   pass(run, to)            give a run to another AI with its steps so far (runs.js pass; #13, a drop on an AI row)
//   point(target, words, ai) an AI's ring on a thing, with one line and "go there" (#23; agent.js point)
//   headline(outcome, proof, ai)  an AI offers the coming-back headline, real only while its proof stands (#21: "no" live)
// Each of the last two goes through the AI's call path (agent/calls.ts): gated, one ledger row, undone alone. Follow is
// the store's own (core.ts M.follow, engine.js's), drawn on the AIs page. Live, the ledger is slice 7's (map.md "no"):
// point keeps its ring in the face and tells a stage session by work.stage.point; pass goes by work.switch when it names
// the talk's other seat; the rest answers "not yet". Also seeds ai-night's night (hooks.onLoad) and hands the counts the
// agent (hooks.agent, dev page and tests). Signed: marcocyl04-ux's agent, slice 5 of the port (#1615).
import { D, MODE, done, hooks, notYet, render, S, type Ai, type Data, type Done, type Moves, type Piece } from "../core.ts";
import { agent, call, find, seedNight, undo as undoRow, VOICE } from "../../agent/calls.ts";
import { engine } from "../../ais/link.ts";

/** every AI by name: the ones at work and the crew (runs.js aiNames) */
export const aiNames = (): string[] => [...new Set([...D.ais.map((a: Ai) => a.name), ...((D.crew as { name: string }[] | undefined) || []).map((c) => c.name)])];
export const aiNamed = (w: unknown): string | null => { const s = String(w || "").toLowerCase(); return aiNames().find((n) => n.toLowerCase() === s) || null; };
/** what the person points at: the piece open at Near, or the one chosen at Middle (runs.js current) */
export function current(): string | null {
  if (S.dist === "near") return S.piece;
  if (S.dist === "middle") { const ps = Object.values(D.pieces).filter((p) => p.region === S.region); return ps[S.sel % Math.max(ps.length, 1)]?.id ?? null; }
  return null;
}
/** a move whose undo is the data as it was (runs.js move()): D is plain JSON */
function undoable(f: () => { ok?: boolean; id?: string } | null): Done {
  const before = JSON.stringify(D);
  const r = f();
  if (!r || r.ok === false) return done(false);
  render();
  return done(true, r.id, () => { const d = JSON.parse(before) as Data; for (const k of Object.keys(D)) delete D[k]; Object.assign(D, d); render(); });
}
/** a call's row as a Done: its undo is the row's own (one row alone) */
function viaCall(ai: string, fn: string, args: Record<string, unknown>): Done {
  const r = call(ai, fn, args);
  return { ok: r.ok && r.gate !== "refused", id: r.id, why: r.line ?? undefined, undo: () => { undoRow(r.id); } };
}

const SEATS = ["claude", "codex"];
const moves: Moves = {
  pass(id?: string, to?: string) {
    if (MODE === "live") {
      // live: today's engine passes a talk to its other seat with the gist (work.switch); handing to a named AI is not yet
      const p = D.pieces[id || current() || ""], e = engine(), seat = String(to || "").toLowerCase();
      if (!p || !e || typeof p.sessionId !== "string" || !SEATS.includes(seat) || seat === p.seat) return notYet();
      e.send({ type: "work.switch", rid: `nx-pass-${Date.now().toString(36)}`, sessionId: p.sessionId, seat: p.seat ?? (seat === "claude" ? "codex" : "claude") });
      return done(true, p.id);
    }
    return undoable(() => {
      const f = find(id || current()), ai = aiNamed(to) || to;
      if (!f || f.p.kind !== "session" || !ai || ai === f.p.ai) return { ok: false };
      const p: Piece = f.p, from = p.ai as string, talk = (p.talk ||= []);
      const steps = Math.max(1, talk.length - 1);
      p.passed = [...((p.passed as unknown[]) || []), { from, to: ai }]; p.ai = ai;
      if (!p.part) p.name = `${ai} in ${p.copy}`;
      talk.push(`${from}: passed this to ${ai} with its ${steps} step${steps === 1 ? "" : "s"} so far.`);
      if (!D.ais.some((x) => x.name === ai)) D.ais.push({ name: ai, piece: p.id });
      return { id: p.id };
    });
  },
  point(target?: string, words?: string, ai: string = VOICE) {
    if (!target) return done(false);
    if (MODE === "live") {
      // live: the ring is the face's; a stage session hears it too (work.stage.point, stage blocks only)
      const was = (D.rings as Record<string, unknown> | undefined)?.[target];
      D.rings = { ...((D.rings as object) || {}), [target]: { by: ai, words, t: Date.now() } };
      const p = D.pieces[target], e = engine();
      if (p && typeof p.sessionId === "string" && e) e.send({ type: "work.stage.point", sessionId: p.sessionId, at: [{ id: target }] });
      render();
      return done(true, target, () => { const rs = { ...(D.rings as Record<string, unknown>) }; if (was) rs[target] = was; else delete rs[target]; D.rings = rs; render(); });
    }
    return viaCall(ai, "point", { target, words });
  },
  headline(outcome?: string, proof?: unknown, ai: string = VOICE) {
    if (!outcome) return done(false);
    return viaCall(ai, "headline", { outcome, proof });
  },
};
export default moves;

hooks.onLoad.push(seedNight);
(hooks as unknown as { agent: typeof agent }).agent = agent;
