// Reach's tools on the sol server (#1166, team/reach.ts), both seats: ask a teammate's agent, hand work over, offer to
// take neglected work, take or decline what waits on me, and the Agents' room (the thread and who holds what, shown on
// this session's stage as a page of the project). A woken session (#1151, and an answering one) has none of Sol's tools,
// so an answer can never ask again: no loop between agents.
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolResult, TurnCtx } from "../browser.js";
import { getTeam, mayAgentSpeak } from "./settings.js";
import { reachTools, reachRoom } from "../settings.js";
import { ask, handOver, offerTake, reply, requestTurnOn, roomNow, roomFile } from "./reach.js";
import { REPO_ROOT } from "./worktype.js";

const run = promisify(execFile);
const tx = (text: string, isError = false): ToolResult => ({ content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) });
const OFF = "My agent may not speak to the team (Settings, my agent: Cowork), so it does not ask or hand over to teammates' agents.";

export const REACH_TOOLS: { name: string; description: string; shape: z.ZodRawShape }[] = [
  {
    name: "ask_agent",
    description: "Ask a teammate's agent a question, the way you would text them: it answers on its own, read-only, from its Sol " +
      "(its release, branch, commits, open work, hand-overs, drift, its repository's files), usually within a minute; this call waits " +
      "for the answer. For where something stands or what they built, not for work (hand_over is for work). Kept in the team's Agents' room.",
    shape: {
      to: z.string().describe("the teammate's GitHub login, e.g. octocat"),
      question: z.string().describe("the question, short and plain"),
      about: z.string().optional().describe("what it is about: an issue (#1150), a PR, a release"),
    },
  },
  {
    name: "hand_over",
    description: "Hand work to a teammate's agent: recorded on the team's relay, seen in their next session, where their agent takes it or " +
      "declines with a reason, with them there. Who holds what is a record every teammate's Jelly reads (agents_room).",
    shape: {
      to: z.string().describe("the teammate's GitHub login"),
      issue: z.number().int().optional().describe("the issue it is about, when there is one"),
      what: z.string().describe("what is handed over: the work, where it stands, the files or branch"),
      why: z.string().describe("why them, why now"),
    },
  },
  {
    name: "ask_turn_on",
    description: "After a teammate's agent refused your ask because answering is off in their Sol: send that person one request to turn it on " +
      "(#1504), a card where they are, saying what was refused and where the switch is. It turns nothing on; only they do. Once a day a person; tell your person first.",
    shape: {
      to: z.string().describe("the teammate whose agent refused, their GitHub login"),
      why: z.string().optional().describe("why you want to ask their agent, one line"),
    },
  },
  {
    name: "offer_take",
    description: `Offer to take a teammate's issue that nobody touched in ${7} days. Their agent takes the offer or declines it in their next session.`,
    shape: { to: z.string().describe("the teammate who holds the issue"), issue: z.number().int(), why: z.string() },
  },
  {
    name: "hand_reply",
    description: "Take or decline a hand-over or an offer that waits on your person (its id is in agents_room and in this session's opening). " +
      "Only with your person's word: taking work is theirs to decide.",
    shape: { id: z.string(), accept: z.boolean(), why: z.string().optional().describe("the reason, above all when declining") },
  },
  {
    name: "agents_room",
    description: "The team's Agents' room: who holds what, and the last asks, answers and hand-overs between the team's agents. " +
      "show: true puts it on this session's stage as a page of the project, kept up to date.",
    shape: { show: z.boolean().optional() },
  },
];
export const REACH_NAMES = new Set(REACH_TOOLS.map((t) => t.name));
/** which of them a switch keeps on now (#1276): agents_room with reach.room, the others with reach.tools; both off
 *  by default, so a Sol offers none until its person turns one on */
const switchOn = (name: string) => (name === "agents_room" ? reachRoom() : reachTools());
export const reachToolsNow = () => REACH_TOOLS.filter((t) => switchOn(t.name));
const SWITCHED_OFF = (name: string) => name === "agents_room"
  ? "The Agents' room is off on this Sol (the setting reach.room, or SOL_REACH_ROOM=on, turns it on)."
  : "Asking or handing over to teammates' agents is off on this Sol (the setting reach.tools, or SOL_REACH_TOOLS=on, turns it on).";

/** days since an issue of this repository was last touched, or null when it cannot be read */
async function idleDays(issue: number): Promise<number | null> {
  try {
    const r = await run("gh", ["issue", "view", String(issue), "--json", "updatedAt"], { cwd: REPO_ROOT, timeout: 15_000 });
    const at = Date.parse(JSON.parse(r.stdout).updatedAt);
    return Number.isFinite(at) ? Math.floor((Date.now() - at) / 86_400_000) : null;
  } catch { return null; }
}

/** the Agents' room on this session's stage: one page block of the project, bound to the room's file */
async function show(sessionId?: string): Promise<string> {
  if (!sessionId) return "no session to show it in";
  const stage = await import("../work/blocks.js");
  const w = await stage.whoFor(sessionId);
  const id = "agents-room";
  if (stage.getBlock(w.project, id)) { stage.withProject(w.project, sessionId); return "the Agents' room is on this project's stage already (its chip, folded until opened)"; }
  stage.compose(w, { id, kind: "page", title: "Agents' room", body: roomNow(), format: "md", scope: "project", person: true, bind: { source: roomFile(), watch: "file" } });
  return "the Agents' room is on the stage, a page of the project kept up to date";
}

export async function runReachTool(name: string, args: unknown, turn: TurnCtx = {}): Promise<ToolResult> {
  const a = (args ?? {}) as Record<string, any>;
  if (REACH_NAMES.has(name) && !switchOn(name)) return tx(SWITCHED_OFF(name), true);   // called by name with its switch off (#1276)
  if (name === "agents_room") {
    if (a.show) { try { return tx(`${await show(turn.sessionId)}\n\n${roomNow()}`); } catch (e) { return tx(String((e as Error)?.message ?? e), true); } }
    return tx(roomNow());
  }
  if (!mayAgentSpeak(getTeam(), "cowork")) return tx(OFF, true);
  // the asking session is kept with what it asked (#1298): a late answer or a reply lands back in it
  const r = name === "ask_agent" ? await ask(a.to, a.question, a.about, undefined, turn.sessionId)
    : name === "hand_over" ? handOver(a.to, a.what, a.why, a.issue, turn.sessionId)
    : name === "ask_turn_on" ? requestTurnOn(a.to, a.why, turn.sessionId)
    : name === "offer_take" ? offerTake(a.to, a.issue, a.why, Number.isInteger(a.issue) ? await idleDays(a.issue) : null, turn.sessionId)
    : name === "hand_reply" ? reply(a.id, a.accept, a.why)
    : `Unknown tool: ${name}`;
  return tx(r, /^(refused|not sent|reach is not|Unknown)/.test(r));
}
