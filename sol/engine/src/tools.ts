// Every tool on the MCP server "sol", both seats: the browser's, the desk's, the ping and the team chat's line (Talk
// #37, team/talk.ts), the arrangement's (#133, arrange.ts) and Home's group offer (#321, suggest.ts, not on Work), routed by name.

import { TOOLS, runBrowserTool, type ToolResult, type TurnCtx } from "./browser.js";
import { DESK_TOOLS, runDeskTool } from "./desk.js";
import { PING_TOOLS, runPingTool } from "./notify.js";
import { TALK_TOOLS, runTalkTool } from "./team/talk.js";   // Talk (#37): a line in the team's chat, both seats
import { ARRANGE_TOOLS, runArrangeTool } from "./arrange.js";
import { SUGGEST_TOOLS, runSuggestTool } from "./suggest.js";   // Home offers a group once (#321)
import { runThingTool, useSolTools, kernelNow } from "./kernel.js";   // a block's own tools, thing_<id>_<name>, with the frame on (#633); listed by thingTools()
import { guardSolTool } from "./home/ceiling.js";   // Home 5: the upper limit at position two, behind home.whole
import { INSTALL_TOOLS, runInstallTool } from "./install.js";   // the install tool (the design's step 4): take a block in now, hear how it went
import { BLOCK_TOOLS, runTrackerTool } from "./team/tracker.js";
import { WAY_NAMES, runWayTool, wayTools } from "./team/way-tools.js";   // a way's moves, looked at and pressed by my agent, each press on a card (#1281)
import { OPEN_NAMES, openToolsNow, runOpenTool } from "./openfor.js";   // open a Settings drawer or a pane for the person, change a setting they asked for (#1521)
import { PLACE_NAMES, PLACE_TOOLS, runPlaceTool } from "./homeplaces.js";   // make a place inside another, or move one under another, on the person's word (#1662)
import { READS_NAMES, readsToolsNow, runReadsTool } from "./reads.js";   // stop or resume reading a source on the person's word (#1656)
import { REACH_TOOLS, REACH_NAMES, reachToolsNow, runReachTool } from "./team/reach-tools.js";   // ask a teammate's agent, hand over (#1166)   // Sol's tools for blocks only (step 7): file it asks Settings here
import { byCards, offeredIn, toolsCards } from "./tools/fromcards.js";   // a tool a card offers only in a mode its card's station has reached (#1589)
import { versionMode } from "./settings.js";

/** who calls when a block calls one of Sol's tools: no seat can be named so (a ":" is in no block's id, no seat's name) */
const BLOCK_SEAT = "sol:block";
/** Sol's own tools, main's list as it is: what a seat is offered with the frame off */
export const SOL_TOOLS = [...TOOLS, ...DESK_TOOLS, ...PING_TOOLS, ...TALK_TOOLS, ...ARRANGE_TOOLS, ...SUGGEST_TOOLS, ...REACH_TOOLS, ...PLACE_TOOLS];
/** what a seat is offered now: Sol's tools, a way's two with the ways' switch on (#1281), and the install tool only while
 *  the kernel is there (the frame on), since with it off the tool could only answer "the frame is off" (the off switch,
 *  step 0c). Asked at each turn's start */
export const seatTools = () => [...solToolsNow(), ...wayTools(), ...(kernelNow() ? INSTALL_TOOLS : [])];
/** Sol's tools less reach's whose switch is off (#1276, reach-tools.ts reachToolsNow), with the three that open a thing
 *  for the person while open.for is on (#1521), set_reading while reads.voice is on (#1656), less any a card offers whose station this mode has not reached (#1589,
 *  tools/fromcards.ts; with tools.cards off, untouched): what a seat or the stdio server offers */
export const solToolsNow = () => { const on = new Set(reachToolsNow().map((t) => t.name)); return byCards([...SOL_TOOLS.filter((t) => !REACH_NAMES.has(t.name) || on.has(t.name)), ...openToolsNow(), ...readsToolsNow()]); };

export function runSolTool(name: string, args: unknown, turn: TurnCtx = {}): Promise<ToolResult> {
  return guardSolTool(name, args, turn, () => solTool(name, args, turn));   // Home's ceiling (home/ceiling.ts): only inside a Home Run, with home.whole on
}
function solTool(name: string, args: unknown, turn: TurnCtx): Promise<ToolResult> {
  if (toolsCards() && !offeredIn(name, versionMode()))   // not offered in this mode (#1589): a call that names it anyway is refused
    return Promise.resolve({ content: [{ type: "text", text: `${name} is not part of this Sol yet.` }], isError: true });
  const no = turn.refuse?.(name);   // a folder's agent in watch mode: nothing that reaches past its folder (agent/run.ts); its rung moves into the ceiling after #1146
  if (no) return Promise.resolve({ content: [{ type: "text", text: no }], isError: true });
  if (name.startsWith("thing_")) return runThingTool(name, args, turn.seat);   // a seat's step through a block's tool (#633)
  if (name === "ping") return runPingTool(name, args, turn);
  if (name === "talk") return runTalkTool(name, args, turn);   // Talk (#37)
  if (REACH_NAMES.has(name)) return runReachTool(name, args, turn);   // #1166
  if (WAY_NAMES.has(name)) return runWayTool(name, args, turn);   // #1281
  if (OPEN_NAMES.has(name)) return runOpenTool(name, args, turn);   // #1521: refused while open.for is off
  if (PLACE_NAMES.has(name)) return runPlaceTool(name, args, turn);   // #1662: only on the person's words this turn
  if (READS_NAMES.has(name)) return runReadsTool(name, args, turn);   // #1656: refused while reads.voice is off
  if (name === "arrange") return runArrangeTool(name, args, turn);
  if (name === "suggest_group") return runSuggestTool(name, args, turn);
  // the kernel's two names answer only while the kernel is there; with the frame off a name is routed as main routes it
  if (name === "things" && kernelNow()) return runInstallTool(name, args);
  if (name === "tracker" && kernelNow()) return turn.seat === BLOCK_SEAT ? runTrackerTool() : Promise.resolve({ content: [{ type: "text", text: "tracker is a tool for blocks" }], isError: true });
  return name.startsWith("desk_") ? runDeskTool(name, args, turn) : runBrowserTool(name, args, turn);
}
// a big room calls the Sol tools its record names (needs.sol) through the kernel's door, with no seat's turn behind it
useSolTools((name, args) => runSolTool(name, args, { seat: BLOCK_SEAT }), [...SOL_TOOLS, ...INSTALL_TOOLS, ...BLOCK_TOOLS].map((t) => t.name));
