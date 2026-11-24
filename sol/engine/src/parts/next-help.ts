// Help on the wire (#1615 BR1, learn.html parts 3, 7, 8, 9; next/help/help.ts, the shapes in next/help/wire.ts). Its own
// part, modelled on next-canvas.ts. Behind ui.next (read on every message): off, nothing here is answered. On, only
// Sol's own windows are answered.
//   next.help.open { ask? }  → next.help.opened { session|null, title, walks, faq, starters } to the asker (and asks `ask`)
//   next.help.ask { text }   → next.help.said { working: true, session } to every window, then { working: false, session,
//                              text, show?, replay? } when Help's turn ends ({ failed: true, text } when it could not start)
// The canvas bar's "how do I…" (next-canvas.ts calls helpFromBar): next.canvas.said { help: true, working: false, text
// (one line), show?, openHelp: true, ask } at once when the faq or the walks hold it, else { help: true, working: true }
// and the line when Help answers. The bar never says "Not a move I know" to such a question.
// Signed: marcocyl04-ux's agent (builder T-engine), BR1 (#1615).
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import type { Heard, Parts } from "../parts.js";
import { uiNext } from "../settings.js";
import { saidThisTurn } from "../next/canvas-agent.js";
import { FAQ, STARTERS, WALKS, helpSay, helpSession, isHowAsk, oneLine, splitShow, type HelpDeps } from "../next/help/help.js";
import type { BarHelpSaid, HelpOpened, HelpSaid } from "../next/help/wire.js";
import { NOT_OWN } from "./next.js";

type Item = Parameters<typeof saidThisTurn>[0][number];
export type HelpPartDeps = HelpDeps & {
  onTurnEnd: (fn: (id: string) => void) => void;
  items: (id: string) => Item[];
};

async function engineDeps(): Promise<HelpPartDeps> {
  const [{ sessionHands }, runs, { sessionInfo }, { mark }, { giveTool }] = await Promise.all([
    import("../work/one.js"), import("../work/runs.js"), import("../work/sessions.js"), import("../work/state.js"), import("../work/tools.js"),
  ]);
  return {
    say: async (id, text, fresh, how) => { const h = sessionHands(); if (!h) throw new Error("sessions are not wired yet"); await h.say(id, text, fresh, how); },
    known: async (id) => !!runs.getRun(id) || !!(await sessionInfo(id).catch(() => null)),
    mark: (id) => mark(id, { help: true }),
    give: (id, t) => giveTool(id, t),
    cwd: () => homedir(),
    uuid: () => randomUUID(),
    onTurnEnd: (fn) => { runs.onTurnEnd(fn); },
    items: (id) => (runs.getRun(id)?.items.list ?? []) as Item[],
  };
}

type Everyone = (m: object) => void;
// the part's hands, once it started: the bar (next-canvas.ts) reaches Help through them
let asking: ((home: string, text: string, everyone: Everyone, fromBar: boolean) => Promise<{ ok: boolean; session?: string; why?: string }>) | null = null;
const barWaits = new Map<string, string>();   // home → the bar's question, while Help thinks about it

const COULD_NOT = "Help couldn't answer that just now. Open in Help to ask it there.";

/** the canvas bar's words, when they are a "how do I…": answered (one line, Show me, Open in Help) and true; else false,
 *  and the canvas agent takes them */
export async function helpFromBar(home: string, text: unknown, chips: unknown, everyone: Everyone): Promise<boolean> {
  if (typeof text !== "string" || (Array.isArray(chips) && chips.length)) return false;
  const how = isHowAsk(text);
  if (!how) return false;
  const ask = text.trim().slice(0, 4000);
  if (how.found) {
    const m: BarHelpSaid = { type: "next.canvas.said", help: true, working: false, text: oneLine(how.found.text), ...(how.found.show ? { show: how.found.show } : {}), openHelp: true, ask };
    everyone(m);
    return true;
  }
  type Asked = { ok: boolean; session?: string; why?: string };
  const r: Asked = asking ? await asking(home, ask, everyone, true).catch((e): Asked => ({ ok: false, why: String(e) })) : { ok: false };
  if (!r.ok || !r.session) everyone({ type: "next.canvas.said", help: true, working: false, text: COULD_NOT, openHelp: true, ask } satisfies BarHelpSaid);
  else everyone({ type: "next.canvas.said", help: true, working: true, session: r.session } satisfies BarHelpSaid);
  return true;
}

export function helpPart(p: Parts, deps: () => Promise<HelpPartDeps> | HelpPartDeps): void {
  let d: HelpPartDeps | null = null;
  const got = async () => (d ??= await deps());
  const refuse = (h: Heard, asked: string, why: string) => h.send(h.ws, { type: "next.refused", asked, why });

  const ask = async (home: string, text: string, everyone: Everyone, fromBar: boolean) => {
    try {
      const r = await helpSay(home, text, await got());
      if (!r.ok) return r;
      if (fromBar) barWaits.set(home, text); else barWaits.delete(home);
      everyone({ type: "next.help.said", working: true, session: r.session } satisfies HelpSaid);
      return r;
    } catch (e) {
      everyone({ type: "next.help.said", working: false, failed: true, text: `Help didn't start: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 160)}` } satisfies HelpSaid);
      return { ok: false, why: "did not start" };
    }
  };
  asking = ask;

  p.on("next.help.open", async (m: any, h: Heard) => {
    if (!uiNext()) return undefined;
    if (!h.fromSol) return refuse(h, "next.help.open", NOT_OWN);
    const opened: HelpOpened = { type: "next.help.opened", session: helpSession(h.HOME), title: "Help", walks: WALKS, faq: FAQ(), starters: STARTERS };
    h.send(h.ws, opened);
    if (typeof m?.ask === "string" && m.ask.trim()) await ask(h.HOME, m.ask, h.everyone, false);
  });
  p.on("next.help.ask", async (m: any, h: Heard) => {
    if (!uiNext()) return undefined;
    if (!h.fromSol) return refuse(h, "next.help.ask", NOT_OWN);
    if (typeof m?.text !== "string" || !m.text.trim()) return refuse(h, "next.help.ask", "nothing to ask");
    await ask(h.HOME, m.text, h.everyone, false);
  });
  // Help's turn ended: its answer to every window, Show me taken off its last line; the bar's line too when it asked
  p.atStart((e) => {
    void got().then((x) => x.onTurnEnd((id) => {
      if (!uiNext() || id !== helpSession(e.HOME)) return;
      const said = splitShow(saidThisTurn(x.items(id)) || "I don't know that yet.");
      e.everyone({ type: "next.help.said", working: false, session: id, text: said.text, ...(said.show ? { show: said.show, replay: said.replay } : {}) } satisfies HelpSaid);
      const q = barWaits.get(e.HOME);
      if (q !== undefined) {
        barWaits.delete(e.HOME);
        e.everyone({ type: "next.canvas.said", help: true, working: false, text: oneLine(said.text) || COULD_NOT, ...(said.show ? { show: said.show } : {}), openHelp: true, ask: q } satisfies BarHelpSaid);
      }
    })).catch(() => {});
  });
}

export default function (p: Parts) { helpPart(p, engineDeps); }
