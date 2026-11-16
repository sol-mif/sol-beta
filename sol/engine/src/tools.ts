// Every tool on the MCP server "sol", both seats: the browser's, the desk's, the ping and the team chat's line (Talk
// #37, team/talk.ts), the arrangement's (#133, arrange.ts) and Home's group offer (#321, suggest.ts, not on Work), routed by name.

import { TOOLS, runBrowserTool, type ToolResult, type TurnCtx } from "./browser.js";
import { DESK_TOOLS, runDeskTool } from "./desk.js";
import { PING_TOOLS, runPingTool } from "./ping.js";
import { TALK_TOOLS, runTalkTool } from "./team/talk.js";   // Talk (#37): a line in the team's chat, both seats
import { ARRANGE_TOOLS, runArrangeTool } from "./arrange.js";
import { SUGGEST_TOOLS, runSuggestTool } from "./suggest.js";   // Home offers a group once (#321)
import { runThingTool, useSolTools, kernelNow } from "./kernel.js";   // a block's own tools, thing_<id>_<name>, with the frame on (#633); listed by thingTools()
import { INSTALL_TOOLS, runInstallTool } from "./install.js";   // the install tool (the design's step 4): take a block in now, hear how it went
import { BLOCK_TOOLS, runTrackerTool } from "./team/tracker.js";   // Sol's tools for blocks only (step 7): file it asks Settings here

/** who calls when a block calls one of Sol's tools: no seat can be named so (a ":" is in no block's id, no seat's name) */
const BLOCK_SEAT = "sol:block";
/** Sol's own tools, main's list as it is: what a seat is offered with the frame off */
export const SOL_TOOLS = [...TOOLS, ...DESK_TOOLS, ...PING_TOOLS, ...TALK_TOOLS, ...ARRANGE_TOOLS, ...SUGGEST_TOOLS];
/** what a seat is offered now: Sol's tools, and the install tool only while the kernel is there (the frame on), since
 *  with it off the tool could only answer "the frame is off" (the off switch, step 0c). Asked at each turn's start */
export const seatTools = () => (kernelNow() ? [...SOL_TOOLS, ...INSTALL_TOOLS] : SOL_TOOLS);

export function runSolTool(name: string, args: unknown, turn: TurnCtx = {}): Promise<ToolResult> {
  if (name.startsWith("thing_")) return runThingTool(name, args, turn.seat);   // a seat's step through a block's tool (#633)
  if (name === "ping") return runPingTool(name, args, turn);
  if (name === "talk") return runTalkTool(name, args, turn);   // Talk (#37)
  if (name === "arrange") return runArrangeTool(name, args, turn);
  if (name === "suggest_group") return runSuggestTool(name, args, turn);
  // the kernel's two names answer only while the kernel is there; with the frame off a name is routed as main routes it
  if (name === "things" && kernelNow()) return runInstallTool(name, args);
  if (name === "tracker" && kernelNow()) return turn.seat === BLOCK_SEAT ? runTrackerTool() : Promise.resolve({ content: [{ type: "text", text: "tracker is a tool for blocks" }], isError: true });
  return name.startsWith("desk_") ? runDeskTool(name, args, turn) : runBrowserTool(name, args, turn);
}
// a big room calls the Sol tools its record names (needs.sol) through the kernel's door, with no seat's turn behind it
useSolTools((name, args) => runSolTool(name, args, { seat: BLOCK_SEAT }), [...SOL_TOOLS, ...INSTALL_TOOLS, ...BLOCK_TOOLS].map((t) => t.name));
