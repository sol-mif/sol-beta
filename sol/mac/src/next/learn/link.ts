// Help's link to the engine (BR1 #1615): the contract is the engine's, sol/engine/src/next/help/README.md and wire.ts.
//   face → engine   next.help.open { ask? }   the Help session found or made (and asked those words, from Open in Help)
//                   next.help.ask { text }    words typed into Help
//                   next.canvas.say           the canvas bar as always (cv/wire/canvas.ts askAgent)
//   engine → face   next.help.opened { session, title, walks, faq, starters }
//                   next.help.said { working, session, text?, show?, replay? } | { failed, text }   to every window
//                   next.canvas.said { help: true, working, text?, show?, openHelp, ask }          the bar's one line
// On the dev page and in tests there is no engine: live() is false and the face answers from answers.ts.
// Signed: marcocyl04-ux's agent (builder T-face), BR1 (#1615).
import { MODE } from "../cv/core.ts";
import { canvasLink, helpBar } from "../cv/wire/canvas.ts";
import type { Answer } from "./answers.ts";
import { walkOf } from "./walks.ts";

/** an answer as the engine sent it, made safe: its words, and Show me only when it names a walk's step there is */
export function fromEngine(m: unknown): Answer | null {
  const o = m as { text?: unknown; show?: { walk?: unknown; step?: unknown }; replay?: unknown } | null;
  const text = typeof o?.text === "string" ? o.text.trim() : "";
  if (!text) return null;
  const w = walkOf(String(o?.show?.walk ?? "")), step = Number(o?.show?.step);
  const show = w && Number.isInteger(step) && step >= 0 && step < w.steps.length ? { walk: w.id, step } : undefined;
  const replay = walkOf(String(o?.replay ?? ""))?.id ?? show?.walk;
  return { text, ...(show ? { show } : {}), ...(replay ? { replay } : {}) };
}

type Heard = { said?: (m: Record<string, unknown>) => void; opened?: (m: Record<string, unknown>) => void; bar?: (m: Record<string, unknown>) => void };
/** what help.ts does with each message (set there, so this file holds no state of Help's) */
export const helpHeard: Heard = {};
// the canvas bar's answers come through the canvas session's own wire (cv/wire/canvas.ts), heard from the first
helpBar.heard = (m) => helpHeard.bar?.(m);

let on: unknown = null;
/** the engine's link, listened to once per engine */
function engine() {
  const e = canvasLink.e;
  if (MODE !== "live" || !e) return null;
  if (on !== e) {
    on = e;
    e.subscribe((m: { type?: string; help?: unknown }) => {
      if (m?.type === "next.help.said") helpHeard.said?.(m as Record<string, unknown>);
      else if (m?.type === "next.help.opened") helpHeard.opened?.(m as Record<string, unknown>);
    });
  }
  return e;
}

export const helpLink = {
  /** a real engine is there */
  live: (): boolean => !!engine(),
  open(ask?: string): boolean { const e = engine(); if (!e) return false; e.send({ type: "next.help.open", ...(ask ? { ask } : {}) }); return true; },
  ask(text: string): boolean { const e = engine(); if (!e) return false; e.send({ type: "next.help.ask", text }); return true; },
};
