// Open a table for me (gate one, #1676, card product/cowork): the person's own AI can start a Cowork table when they ask
// for one, so a Sol with no table is never a page only a hand can leave. One tool on the "sol" server, both seats:
//   open_table { name, yes }   a table by that name, with its code, made as Cowork's "start a table" makes it
//                              (team.room.make on Sol's cloud, never a repository on their GitHub unasked; wire.ts makeTableNow); every Cowork window shows it at once
// `yes` is the person's own words this turn, as set_setting's (openfor.ts saidThisTurn): a guess makes nothing. Offered
// while Cowork's switch (view.cowork) stands on in this Sol's version, refused when it does not. The table's name and
// code go to Sol's cloud, as the face's press sends them; the code is the person's to send to anyone.
import { z } from "zod";
import type { ToolResult, TurnCtx } from "../browser.js";
import { saidThisTurn } from "../openfor.js";
import { versionMode } from "../settings.js";
import { onFor } from "../versions.js";

export const TABLE_TOOLS = [
  {
    name: "open_table",
    description: "Start a Cowork table for the person, when they asked for one in this very turn (\"start a table for our " +
      "trip\"). `name` is what the table is called, short (\"sf trip\"). It comes with a code: tell them the code, which " +
      "they send to whoever should sit down; nobody is added without it. `yes` is the person's own words from this turn " +
      "that ask for it, two words at least, copied exactly: refused when they are not in what they said.",
    shape: { name: z.string().min(1).max(60), yes: z.string().min(2).max(400) },
  },
] as const;
export const TABLE_NAMES = new Set<string>(TABLE_TOOLS.map((t) => t.name));

/** whether Cowork stands on in this Sol (its card's switch, view.cowork, by this version's station) */
export const coworkOn = () => onFor("view.cowork", versionMode(), undefined);
/** the tool while Cowork is on, none while it is off (read at each turn's start) */
export const tableToolsNow = () => (coworkOn() ? [...TABLE_TOOLS] : []);

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) });
type Make = (name: string) => Promise<{ room: { id: string; name: string; code?: string }; warn?: string } | { error: string }>;
const makeNow: Make = async (name) => (await import("./wire.js")).makeTableNow(name);

export async function runTableTool(name: string, args: unknown, turn: TurnCtx = {}, make: Make = makeNow): Promise<ToolResult> {
  if (name !== "open_table") return text(`unknown tool ${name}`, true);
  if (!coworkOn()) return text("Cowork is not on in this Sol, so there are no tables to start yet", true);
  const a = (args ?? {}) as Record<string, unknown>;
  if (!saidThisTurn(turn, String(a.yes ?? ""))) return text("not made: those words are not in what the person said this turn. Ask them what to call it, and make it when they say so.", true);
  const nm = String(a.name ?? "").trim().replace(/\s+/g, " ");
  if (!nm) return text("not made: a table needs a name", true);
  const r = await make(nm).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
  if ("error" in r) return text(`not made: ${r.error}`, true);
  const code = r.room.code ?? "";
  return text(code
    ? `made the table ${r.room.name}; its code is ${code}. Cowork shows it now. Tell the person the code: whoever types it sits down here with their own AI.`
    : `made the table ${r.room.name}, but no code came back${r.warn ? ` (${r.warn})` : ""}. Cowork shows it; its menu's "copy the code" gets one once the cloud answers.`);
}
