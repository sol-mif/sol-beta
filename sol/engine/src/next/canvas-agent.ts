// The bar's agent (#1615 BR1; Marco 2026-11-22 21:20: "the chatbar is always agentic"). Words typed into the canvas's
// bar that no instant move takes go to one standing session per home: started on the person's own Claude the way Sol
// starts any session (work.say fresh), with their settings, so Sol's skills and the sol tools (the canvas's own moves
// among them, next/canvas-tool.ts) are there. It is kept and continued: its id lives in SOL_HOME/next/canvas.json
// { v: 1, session, at, brief }, and a session gone (no run, no transcript), or begun on an older brief, is started
// again. It is marked `canvas` (work/state.ts), so no list draws it as a session of a folder. It runs on claude-opus-5-5 at low effort and bypassPermissions (Marco 2026-11-22 23:4x): nothing it tries
// is refused or asked, so it never tells the person to grant a permission (a dontAsk session answered "allow file
// writes for this canvas bar"). Pieces dropped on the bar ride with the words as chips (id and title).
// Signed: marcocyl04-ux's agent (builder B), BR1 (#1615).
import { join } from "node:path";
import { nextDir, readJson, writeJson } from "./file.js";

export const canvasFile = (home: string) => join(nextDir(home), "canvas.json");
const ID = /^[A-Za-z0-9_-]{8,80}$/;

/** how the bar's session runs (Marco 2026-11-22 23:4x): nothing it tries is refused, so it never asks for a permission */
export const HOW = { mode: "bypassPermissions", model: "claude-opus-5-5", effort: "low" } as const;
/** the brief's version: a session begun on an older one (dontAsk, the cheapest Claude) is not continued */
export const BRIEF_V = 2;

/** the standing session of this home, or null when there is none yet (or it was begun on an older brief) */
export function canvasSession(home: string): string | null {
  const d = readJson(canvasFile(home)).data, s = d.session;
  return typeof s === "string" && ID.test(s) && d.brief === BRIEF_V ? s : null;
}

export type Chip = { id: string; title: string };
/** the chips as said (pure): each an id and a title, at most 12 */
export function cleanChips(v: unknown): Chip[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 12).flatMap((c) => {
    const x = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    const id = typeof x.id === "string" ? x.id.trim().slice(0, 300) : "";
    return id && !/[\u0000-\u001f]/.test(id) ? [{ id, title: String(x.title ?? id).replace(/[\u0000-\u001f]/g, " ").slice(0, 160) }] : [];
  });
}

/** told once, at the session's first turn: what it is and how it answers */
export const BRIEF = "You are Sol's canvas agent. The person typed the words below into the bar at the foot of their Sol " +
  "canvas, where their folders, sessions, notes and the Diary are laid out. You act for them on that canvas with the sol " +
  "canvas tools: canvas_read (what is there, where, how big, folded or not), canvas_place, canvas_fold, canvas_arrange and " +
  "canvas_open. Read the canvas before you move anything, then do what they asked; to organise or tidy, arrange the top of " +
  "the canvas and fold what is plainly idle. For anything else they ask, answer from what you know and can read; Sol's other " +
  "tools are there too. Your answer shows as one line above the bar, so write one or two short plain sentences saying what " +
  "you did or the answer, never a list. Do not make stage blocks and do not call wrap_up. Ask back only when the words " +
  "cannot be acted on. Never ask the person to grant, allow or turn on a permission: nothing you try is refused. When " +
  "Sol has no way to do what they ask, say plainly that Sol can't do that yet. The words:";

/** the words as the session reads them (pure): the brief first on a fresh session, the dropped pieces after the words */
export function canvasWords(text: string, chips: Chip[], fresh: boolean): string {
  const t = text.trim();
  const dropped = chips.length ? `\n\nDropped on the bar with these words (canvas ids for the canvas tools):\n${chips.map((c) => `- “${c.title}” (${c.id})`).join("\n")}` : "";
  return `${fresh ? `${BRIEF}\n\n` : ""}${t || (chips.length ? "(no words: they dropped these on the bar)" : "")}${dropped}`;
}

export type AgentDeps = {
  /** the engine's say (work/one.ts sessionHands): fresh starts a new session in that folder */
  say: (id: string, text: string, fresh?: { cwd: string }, how?: { model?: string; mode?: "bypassPermissions"; effort?: string }) => Promise<void>;
  /** the session is still there: a run, or a transcript to resume */
  known: (id: string) => Promise<boolean>;
  /** marked the bar's own, so no list draws it (work/state.ts mark { canvas: true }) */
  mark: (id: string) => void;
  /** the folder a fresh one starts in: the person's home folder */
  cwd: () => string;
  uuid: () => string;
};

/** the words to the bar's standing session: continued when it is there, else started (and kept) */
export async function canvasSay(home: string, m: { text?: unknown; chips?: unknown }, d: AgentDeps, now = Date.now()): Promise<{ ok: true; session: string; fresh: boolean } | { ok: false; why: string }> {
  const text = typeof m.text === "string" ? m.text.slice(0, 8000) : "", chips = cleanChips(m.chips);
  if (!text.trim() && !chips.length) return { ok: false, why: "nothing to say" };
  const was = canvasSession(home), keep = was && (await d.known(was).catch(() => false)) ? was : null;
  const id = keep ?? d.uuid(), fresh = !keep;
  if (fresh) { d.mark(id); writeJson(canvasFile(home), { v: 1, session: id, at: now, brief: BRIEF_V }); }
  // each time, so a run the engine resumed keeps them too
  await d.say(id, canvasWords(text, chips, fresh), fresh ? { cwd: d.cwd() } : undefined, { ...HOW });
  return { ok: true, session: id, fresh };
}

type Item = { kind: string; text?: unknown; recap?: unknown; parent?: unknown };
/** what the session said this turn (pure): its words after the person's last line, else its wrap_up's recap */
export function saidThisTurn(items: Item[]): string {
  let i = items.length - 1;
  while (i >= 0 && items[i].kind !== "me") i--;
  const turn = items.slice(i + 1).filter((x) => !x.parent);
  const words = turn.filter((x) => x.kind === "you" && String(x.text ?? "").trim()).map((x) => String(x.text).trim());
  if (words.length) return words[words.length - 1];
  const wrap = turn.filter((x) => x.kind === "wrap" && String(x.recap ?? "").trim()).pop();
  if (wrap) return String(wrap.recap).trim();
  const err = turn.filter((x) => x.kind === "error").pop();
  return err ? `It stopped: ${String(err.text ?? "").slice(0, 200)}` : "";
}
