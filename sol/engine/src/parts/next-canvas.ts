// The canvas's bar is always agentic (#1615 BR1; Marco 2026-11-22 21:20): words no instant move takes go to the home's
// standing canvas session (next/canvas-agent.ts), which moves things with the canvas tools (next/canvas-tool.ts). Its own
// part, modelled on next-tabs.ts, so no other slice's file is edited. Behind ui.next (read on every message): off,
// nothing here is answered and nothing is read or written. On, only Sol's own windows are answered.
//   next.canvas.say { text, chips?: [{id, title}], canvas?: [Seen] }
//       → next.canvas.said { working: true, session } to every window, once the words reached the session
//       → next.canvas.said { working: false, session, text } to every window when its turn ends (what it said)
//       → next.canvas.said { working: false, failed: true, text } when it could not start
// `canvas` is the window's picture of what is on the canvas (canvas-tool.ts setSeen), read by canvas_read.
// A "how do I / where is / what is…" goes to Help instead (parts/next-help.ts helpFromBar): next.canvas.said { help: true, … }.
// Anything not what it should be changes nothing: next.refused {asked, why} to the asker alone.
// Signed: marcocyl04-ux's agent (builder B), BR1 (#1615).
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import type { Heard, Parts } from "../parts.js";
import { uiNext } from "../settings.js";
import { canvasSay, canvasSession, saidThisTurn, type AgentDeps } from "../next/canvas-agent.js";
import { setSeen } from "../next/canvas-tool.js";
import { NOT_OWN } from "./next.js";
import { helpFromBar } from "./next-help.js";

type Item = Parameters<typeof saidThisTurn>[0][number];
export type CanvasPartDeps = AgentDeps & {
  /** told each time a session's turn ends (work/runs.ts onTurnEnd) */
  onTurnEnd: (fn: (id: string) => void) => void;
  /** a running session's items (its thread), [] when it is not running */
  items: (id: string) => Item[];
};

/** the engine's own hands, loaded when the part starts (work/ reads this file's neighbours) */
async function engineDeps(): Promise<CanvasPartDeps> {
  const [{ sessionHands }, runs, { sessionInfo }, { mark }] = await Promise.all([
    import("../work/one.js"), import("../work/runs.js"), import("../work/sessions.js"), import("../work/state.js"),
  ]);
  return {
    say: async (id, text, fresh, how) => { const h = sessionHands(); if (!h) throw new Error("sessions are not wired yet"); await h.say(id, text, fresh, how); },
    known: async (id) => !!runs.getRun(id) || !!(await sessionInfo(id).catch(() => null)),
    mark: (id) => mark(id, { canvas: true }),
    cwd: () => homedir(),
    uuid: () => randomUUID(),
    onTurnEnd: (fn) => { runs.onTurnEnd(fn); },
    items: (id) => (runs.getRun(id)?.items.list ?? []) as Item[],
  };
}

export function canvasPart(p: Parts, deps: () => Promise<CanvasPartDeps> | CanvasPartDeps): void {
  let d: CanvasPartDeps | null = null;
  const got = async () => (d ??= await deps());
  const refuse = (h: Heard, why: string) => h.send(h.ws, { type: "next.refused", asked: "next.canvas.say", why });
  p.on("next.canvas.say", async (m: any, h: Heard) => {
    if (!uiNext()) return undefined;
    if (!h.fromSol) return refuse(h, NOT_OWN);
    if (m && "canvas" in m) setSeen(h.HOME, m.canvas);
    // a "how do I…" is Help's (#1615, parts/next-help.ts): one line, Show me, Open in Help; never "Not a move I know"
    if (await helpFromBar(h.HOME, m?.text, m?.chips, h.everyone)) return;
    try {
      const r = await canvasSay(h.HOME, m ?? {}, await got());
      if (!r.ok) return refuse(h, r.why);
      h.everyone({ type: "next.canvas.said", working: true, session: r.session });
    } catch (e) {
      h.everyone({ type: "next.canvas.said", working: false, failed: true, text: `Sol's agent didn't start: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 160)}` });
    }
  });
  // its turn ended: what it said, to every window (the bar shows it where its answers show)
  p.atStart((e) => {
    void got().then((x) => x.onTurnEnd((id) => {
      if (!uiNext() || id !== canvasSession(e.HOME)) return;
      const text = saidThisTurn(x.items(id));
      e.everyone({ type: "next.canvas.said", working: false, session: id, text: text || "Done." });
    })).catch(() => {});
  });
}

export default function (p: Parts) { canvasPart(p, engineDeps); }
