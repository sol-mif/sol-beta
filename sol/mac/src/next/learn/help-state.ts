// Help, the face's state (BR1 #1615; mine/look/br1/learn.html part 3): one standing session in every Sol, called Help,
// for "how do I…". It explains and shows, and never changes anything.
//   helpOpen(ask?)  Help in the sidebar: the Help session as a tab in the session view (a piece of its own, kind "help",
//                   on no folder and never drawn on the canvas); live, next.help.open (link.ts, the engine's contract)
//   helpAsk(q)      a question: the answer comes into the Help session (live the engine's next.help.said, else answers.ts)
//   barAsk(q)       a "how do I…" typed into the canvas bar: the answer is the bar's one line, with Show me and Open in
//                   Help (barLine, barGone, barToHelp). Live the bar says it as always (next.canvas.say) and Help's
//                   line comes back as next.canvas.said { help: true }
// Signed: marcocyl04-ux's agent (builder T-face), BR1 (#1615).
import { D, M, hooks, render } from "../cv/core.ts";
import { askAgent } from "../cv/wire/canvas.ts";
import { ASKED, answerOf, type Answer } from "./answers.ts";
import { fromEngine, helpHeard, helpLink } from "./link.ts";

export const HELP_ID = "sol-help";
/** one question and its answer; `failed` when Help could not answer */
export type Said = { q: string; a: Answer | null; failed?: boolean };
export const H = {
  said: [] as Said[],
  /** the bar's one line: its question, its answer once it came */
  line: null as (Said & { at: number }) | null,
  /** the questions to start from: the engine's starters live, else the first-timer's */
  starters: ASKED as string[],
};

/** the Help piece, made when missing (a load makes D afresh) */
export function helpPiece(): void {
  if (!D.pieces[HELP_ID]) D.pieces[HELP_ID] = { id: HELP_ID, region: "", kind: "help", name: "Help", help: true };
}
hooks.onLoad.push(() => helpPiece());

/** Help as a tab, in front; `ask` asked there too (Open in Help) */
export function helpOpen(ask?: string): void {
  helpPiece();
  M.tabOpen(HELP_ID);
  if (helpLink.open(ask) && ask) H.said = [...H.said, { q: ask, a: null }];
  render();
}
export const helpShown = (): boolean => (D.tabs as { front?: string | null } | undefined)?.front === HELP_ID;

/** a question asked in the Help session */
export function helpAsk(q: string): void {
  const t = q.trim();
  if (!t) return;
  const s: Said = { q: t, a: null };
  H.said = [...H.said, s];
  if (!helpLink.ask(t)) { s.a = answerOf(t); H.said = [...H.said]; }
  render();
}

/** a "how do I…" typed into the canvas bar: its answer as the bar's one line */
export function barAsk(q: string): void {
  const t = q.trim(), at = Date.now();
  if (helpLink.live() && askAgent(t)) { H.line = { q: t, a: null, at }; render(); return; }
  H.line = { q: t, a: answerOf(t), at };
  render();
}
/** the bar's line goes (a press elsewhere, Esc, Show me) */
export function barGone(): void { if (H.line) { H.line = null; render(); } }
/** Open in Help: the question carried into the Help session (live, Help is asked it again there; here, with its answer) */
export function barToHelp(): void {
  const l = H.line;
  H.line = null;
  if (!l) { helpOpen(); return; }
  if (helpLink.live()) { helpOpen(l.q); return; }
  H.said = [...H.said, { q: l.q, a: l.a }];
  helpOpen();
}

// ---------------------------------------------------------------- the engine's words (link.ts), live only

helpHeard.said = (m) => {
  if (m.working === true) return;
  const a = fromEngine(m), failed = m.failed === true;
  const open = H.said.findIndex((s) => !s.a && !s.failed);
  if (open >= 0) H.said = H.said.map((s, i) => (i === open ? { ...s, a: a ?? { text: String(m.text ?? "") }, failed } : s));
  else if (a) H.said = [...H.said, { q: "", a, failed }];   // asked in another window: its answer, every window
  render();
};
helpHeard.opened = (m) => {
  const st = Array.isArray(m.starters) ? m.starters.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
  if (st.length) { H.starters = st; render(); }
};
helpHeard.bar = (m) => {
  if (m.help !== true) { if (H.line && !H.line.a && m.working !== true) barGone(); return; }   // the canvas agent took it: its words are the frame's
  if (m.working === true) return;
  const a = fromEngine(m);
  if (!a) return;
  H.line = { q: typeof m.ask === "string" ? m.ask : H.line?.q ?? "", a, at: H.line?.at ?? Date.now() };
  render();
};
