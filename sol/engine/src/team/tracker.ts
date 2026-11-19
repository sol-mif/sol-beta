// What file it needs to know of the engine (step 7 of the design): a Sol tool for blocks only, named in a record's
// needs.sol, never offered to a seat. File it runs in a big room and cannot read Settings, so it asks here: whether my
// agent may speak on GitHub (Settings, my agent), the team's tracker, this engine's health line and the commit it runs,
// and whether Sol is hidden (always no since the notch's eye went, #1584; the block's contract keeps the field).
// The block files nothing when `may` is false, whoever called its tool: a seat's arguments never stand in for Settings.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getTeam, mayAgentSpeak } from "./settings.js";
import { healthNow } from "../health.js";
import { runGit } from "./note.js";
import { healthLine } from "./file.js";
import type { ToolResult } from "../browser.js";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Sol's tools for blocks only: the kernel hands them to a big room that names them, a seat never sees them */
export const BLOCK_TOOLS = [{ name: "tracker", description: "For a block: may my agent speak on GitHub, the team's tracker, this engine's health line and what it runs." }];

/** hidden: a sentence while Sol's window is blank to screencapture; nothing hides it now, so null */
/** window: Sol's own, the one file it's shot takes (the block never takes an app's name from whoever calls it) */
export type Tracker = { may: boolean; repo: string; health: string; build: string; hidden: string | null; window: { owner: string; title: string } };
export async function trackerNow(): Promise<Tracker> {
  const s = getTeam();
  const dir = resolve(HERE, "..", "..", "..", "..");
  const build = await Promise.all([runGit(["rev-parse", "--abbrev-ref", "HEAD"], dir), runGit(["rev-parse", "--short", "HEAD"], dir)]).then((x) => x.map((y) => y.trim()).join(" "), () => "");
  return { may: mayAgentSpeak(s, "github"), repo: s.repos[0] ?? "", health: healthLine(healthNow()), build, hidden: null, window: { owner: "Sol", title: "Sol" } };
}
export async function runTrackerTool(): Promise<ToolResult> {
  return { content: [{ type: "text", text: JSON.stringify(await trackerNow()) }] };
}
