// open_piece, take_to_tab, put_back: the three verbs the hand has on the canvas, given to an AI (#1615 BR1; next/tabs.ts,
// next/protocol/TABS.md). Open in place, take out to a tab, put back: nothing more. The pieces are the window's, so each
// call is handed to Sol's windows as next.tab.ai { verb, piece, front? }, and the window finds the piece (its id, a
// session's id, or its name) and does what the hand would. A tab an AI opens arrives in the background, marked ✦, and
// comes to the front only when asked and only while the person is not typing in the talk bar. Putting back a tab the
// person opened always shows them a line with Undo. Offered only while ui.next is on (settings.ts uiNext(), read at
// each turn's start); a call while it is off is refused. Listed and routed through next/workspace-tool.ts.
// Signed: marcocyl04-ux's agent, BR1 tabs (#1615).
import { z } from "zod";
import type { ToolResult, TurnCtx } from "../browser.js";
import { uiNext } from "../settings.js";

const piece = z.string().min(1).max(300);
export const TABS_TOOLS = [
  {
    name: "open_piece",
    description: "Open a piece on the person's canvas in place: it grows where it is and the canvas stays around it, as a " +
      "click does. `piece` is a piece's id, a session's id or its name. Use it when the person asks " +
      "to see something (\"show me the failing ones\").",
    shape: { piece },
  },
  {
    name: "take_to_tab",
    description: "Take a piece out of the canvas to a tab, as ⤢ does: the piece keeps its place on the canvas and the tab " +
      "is another view of it. It arrives in the background marked ✦; with `front: true` (\"give me Rex full screen\") it " +
      "comes to the front, unless the person is typing. `piece` as in open_piece.",
    shape: { piece, front: z.boolean().optional() },
  },
  {
    name: "put_back",
    description: "Close a piece's tab; the piece is where it always was on the canvas. A tab the person opened is closed " +
      "with an Undo line they see. Use it when asked to tidy tabs. `piece` as in open_piece.",
    shape: { piece },
  },
] as const;
export const TABS_NAMES = new Set<string>(TABS_TOOLS.map((t) => t.name));
/** the three while ui.next is on, none while it is off (read at each turn's start) */
export const tabsToolsNow = () => (uiNext() ? [...TABS_TOOLS] : []);

let tell: ((m: object) => void) | null = null;
/** Sol's windows, handed over at start (parts/next-tabs.ts) */
export function setTabsTool(everyone: (m: object) => void): void { tell = everyone; }

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) });
const VERB = { open_piece: "open", take_to_tab: "tab", put_back: "back" } as const;
const SAID = { open: "opened in place", tab: "taken out to a tab", back: "put back on the canvas" } as const;

/** the tool: handed to the windows (`to`, the engine's own when left out) */
export async function runTabsTool(name: string, args: unknown, turn: TurnCtx = {}, to = tell): Promise<ToolResult> {
  const verb = VERB[name as keyof typeof VERB];
  if (!verb) return text(`unknown tool ${name}`, true);
  if (!uiNext()) return text(`${name} is not part of this Sol yet.`, true);
  const a = (args && typeof args === "object" ? args : {}) as { piece?: unknown; front?: unknown };
  const p = typeof a.piece === "string" && a.piece.trim() ? a.piece.trim().slice(0, 300) : turn.sessionId;
  if (!p) return text("say which piece: its id, a session's id or its name", true);
  if (!to) return text("not done: Sol's window isn't open", true);
  try { to({ type: "next.tab.ai", verb, piece: p, ...(verb === "tab" && a.front === true ? { front: true } : {}) }); } catch { return text("not done: Sol's window didn't hear it", true); }
  return text(`asked Sol's window: “${p}” ${SAID[verb]}${verb === "tab" ? (a.front === true ? ", in front unless the person is typing" : ", in the background with ✦") : ""}${verb === "back" ? "; a tab the person opened shows them an Undo line" : ""}.`);
}
