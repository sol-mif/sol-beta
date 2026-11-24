// suggest_setup: the talk path into Workspace changes (#1615 BR1; next/workspace.ts, next/protocol/WS.md). An AI in a
// session suggests a different setup (Home folders, Build folders, notes, checklists, a sticky moved or reworded); it is
// stored as a suggestion and nothing changes: the person reviews it in Settings › Your setup, row by row, and keeps or
// discards it there (Keep, Discard, then Undo). Offered only while ui.next is on (settings.ts uiNext(), read at each
// turn's start); a call while it is off is refused. Every Sol window is told next.workspace.changed and asks again.
// Signed: marcocyl04-ux's agent, BR1 carry (#1615).
import { z } from "zod";
import type { ToolResult } from "../browser.js";
import { uiNext } from "../settings.js";
import { homedir } from "node:os";
import { propose } from "./workspace.js";
import { becauseFor, knownNow, NO_BECAUSE } from "./you-known.js";
import { recordHomeOf, type Where } from "./you.js";
import { TABS_NAMES, TABS_TOOLS, runTabsTool } from "./tabs-tool.js";
import { AUTO_NAMES, AUTO_TOOLS, runAutoTool } from "./automation-tool.js";
import { CANVAS_NAMES, CANVAS_TOOLS, runCanvasTool } from "./canvas-tool.js";   // the canvas's own moves, by an AI (builder B, BR1)

const ref = z.object({ kind: z.literal("sticky"), folder: z.string().min(1).max(500), key: z.string().min(1).max(200) });

export const WORKSPACE_TOOLS = [
  {
    name: "suggest_setup",
    description: "Suggest a different setup of the person's Sol: new Home folders or Build folders, notes, checklists, or a " +
      "sticky moved or reworded. Nothing changes: the suggestion waits in Settings › Your setup, where the person sees each " +
      "change with its reason and keeps or discards it (and can undo a keep). Use it when the person asks how to organise " +
      "their Sol, or after you have seen how they work and a setup would clearly help; say in one line what you suggested " +
      "and that it waits in Settings. Each operation: `key` (short, unique), `reason` (one plain sentence), and `op`: " +
      "create_folder {name, type: home|build}; create_piece {name, kind: note|checklist, region: an existing Home folder " +
      "(its path under Home) or \"$<key>\" of a new Home folder in this suggestion, text, items}; move_piece {ref: {kind: sticky, folder, key: its title}, region}; update_piece " +
      "{ref, name?, text?}. A Home folder whose name is taken is refused at keep; nothing the person already has is replaced. " +
      "`because`: the keys (k) of the facts you acted on, read first with what_sol_knows; a suggestion without one is refused.",
    shape: {
      because: z.array(z.string().min(1).max(300)).min(1).max(40),
      title: z.string().min(1).max(160),
      reason: z.string().min(1).max(4000),
      operations: z.array(z.object({
        key: z.string().min(1).max(40),
        reason: z.string().min(1).max(2000),
        op: z.enum(["create_folder", "create_piece", "move_piece", "update_piece"]),
        name: z.string().max(160).optional(),
        type: z.enum(["home", "build"]).optional(),
        kind: z.enum(["note", "checklist"]).optional(),
        region: z.string().max(500).optional(),
        text: z.string().max(2000).optional(),
        items: z.array(z.string().max(2000)).max(200).optional(),
        ref: ref.optional(),
      })).min(1).max(40),
    },
  },
  {
    name: "what_sol_knows",
    description: "What Sol knows, one list: each fact with its key (k), what it says, where it came from and the place it is " +
      "about, including what the person fixed (fix:…, the person's own: never undo it) and where Sol put things (placed:…). " +
      "`at`: a folder's path or id for what Sol knows there; left out, everything. Read it before suggesting a setup, and " +
      "name the keys you acted on as the suggestion's `because`.",
    shape: { at: z.string().max(1000).optional() },
  },
] as const;
/** with it, the canvas's three verbs (open in place, take out to a tab, put back; next/tabs-tool.ts), a session's
 *  make_automation (next/automation-tool.ts) and the canvas's own moves (read, place, fold, arrange, open;
 *  next/canvas-tool.ts): one door into tools.ts for the port's tools that change what the person sees */
export const WORKSPACE_NAMES = new Set<string>([...WORKSPACE_TOOLS, ...TABS_TOOLS, ...AUTO_TOOLS, ...CANVAS_TOOLS].map((t) => t.name));
/** the tools while ui.next is on, none while it is off (read at each turn's start) */
export const workspaceToolsNow = () => (uiNext() ? [...WORKSPACE_TOOLS, ...TABS_TOOLS, ...AUTO_TOOLS, ...CANVAS_TOOLS] : []);

let HOME = "", tell: (m: object) => void = () => {};
/** the engine's home and its windows, handed over at start (parts/next-workspace.ts) */
export function setWorkspaceTool(home: string, everyone: (m: object) => void): void { HOME = home; tell = everyone; }

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) });

/** the tool run against a home (the engine's, or a test's) */
export async function runWorkspaceTool(name: string, args: unknown, home = HOME, session?: string): Promise<ToolResult> {
  if (TABS_NAMES.has(name)) return runTabsTool(name, args);
  if (CANVAS_NAMES.has(name)) return runCanvasTool(name, args, home, tell);
  if (AUTO_NAMES.has(name)) return runAutoTool(name, args, home, session, session ? (await import("../work/runs.js")).getRun(session)?.cwd : undefined, tell);   // its folder from its run, loaded late (runs.ts reads this file's neighbour)
  if (name !== "suggest_setup" && name !== "what_sol_knows") return text(`unknown tool ${name}`, true);
  if (!uiNext()) return text(`${name} is not part of this Sol yet.`, true);
  if (!home) return text("not suggested: Sol has not started its home yet", true);
  const user = process.env.HOME || homedir(), w: Where = { sol: home, user, rec: recordHomeOf(home, user) };
  if (name === "what_sol_knows") {
    const k = knownNow(w, { at: (args as { at?: unknown } | null)?.at });
    return text(k.facts.length ? k.facts.map((f) => `${f.k} · ${f.fact} · ${f.source}${f.place ? ` · ${f.place}` : ""}`).join("\n") : "Sol knows nothing yet.");
  }
  // an agent's move carries its because (one store, #1615): the keys it names that Sol knows, or its session's told keys
  const because = becauseFor(w, (args as { because?: unknown } | null)?.because, session);
  if (!because) return text(`not suggested: ${NO_BECAUSE}`, true);
  const r = propose(home, { ...(args as object), because }, "a conversation", Date.now(), session);
  if (!r.ok) return text(`not suggested: ${r.why}`, true);
  try { tell({ type: "next.workspace.changed", id: r.plan.id }); } catch { /* the window asks again when Settings opens */ }
  const n = r.plan.operations.length;
  return text(`suggested: “${r.plan.title}”, ${n} change${n === 1 ? "" : "s"}, waiting in Settings › Your setup (id ${r.plan.id}). Nothing has changed; the person keeps or discards it there.`);
}
