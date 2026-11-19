// A session's agent on a project's Cowork ways, with its person there (#1281; docs/cowork-ways-2026-11-10/AGENT-PRESS.md
// section 10, step 2): two tools on the sol server. way_look reads each way of a project, its things, and the moves on
// each that my agent holds a role for (and those only I hold, so the agent can say "that one is yours"). way_press
// presses one of them, signed with my agent's key (`agent:<me>` on the trail, a role naming my agent, never me):
//   judged first    the press is judged at the time it would be written at, nothing written (way-writer.ts press,
//                   write "none"); refused, the refusal is said and nothing reaches the trail (a refusal there is
//                   permanent and reaches every teammate)
//   a card          allowed, a card goes in front of the person, whatever mode the session runs in (the tool never
//                   leans on the permission picker: a session may run with nothing asked). The card names the way, the
//                   thing, the move, every value it would write and an act the move owes, in its title (the window
//                   show a title whole; values too long for it are not offered). It is a go: the one
//                   session never answers it for the person (oneLong.ts kindOf). No card can be shown (no Work
//                   session behind the call, or Home's seat, which is not offered the press): nothing is pressed
//   then written    on a yes, pressed under the version judged (`ver`: a version applied while the card waited makes it
//                   `old_version`) and written only when it passes again (write "ok")
// Not offered, ever: agreeing, applying, reverting or proposing a version (changing the rules stays a person's press),
// and `because` (the press names no event). An act a move owes is said, not run: nothing runs a seam's act yet.
// Listed only when a team's ways run (the ways' switch, on unless it says off (#691), and Cowork v3's); this file is
// outside team/v3 and imports nothing of it until a tool runs (the switch off loads no v3 module, test/v3-off.test.ts),
// so it asks the switches as v3/way-switch.ts does, and a test holds the two the same.
import { z } from "zod";
import type { ToolResult, TurnCtx } from "../browser.js";
import { coworkV3 } from "../settings.js";
import { waysOn } from "../way-switch.js";
import { getTeam } from "./settings.js";

/** the agent a Work session presses as: Claude's key under my login (pair.ts PAIR_AGENTS) */
export const AGENT = "claude";

export const WAY_TOOLS: { name: string; description: string; shape: z.ZodRawShape }[] = [
  {
    name: "way_look",
    description: "Look at a project's Cowork ways: each way in force, its things and their states, and the moves on each that you " +
      "(your person's agent) may press, and those only your person may. Read-only. Without a project, every project of the team.",
    shape: {
      project: z.string().optional().describe("the project: a room id or its project id; omit for every project"),
      way: z.string().optional().describe("one way's id, e.g. sol.drafts"),
    },
  },
  {
    name: "way_press",
    description: "Press one move on a thing of a Cowork way, as your person's agent (signed with your own key): only a move way_look " +
      "lists as yours. It is judged first and nothing is written if it would be refused; if it passes, a card asks your person, and " +
      "only their yes presses it. Agreeing, applying or reverting a version is never yours: your person does that.",
    shape: {
      project: z.string().describe("the project, as way_look names it"),
      way: z.string().describe("the way's id"),
      thing: z.string().describe("the thing's id; for a move that starts a new thing, the new id"),
      move: z.string().describe("the move's id"),
      kind: z.string().optional().describe("the thing's kind, only for a move that starts a new thing"),
      set: z.record(z.string(), z.unknown()).optional().describe("the values the move sets, by field: each one is on the card"),
    },
  },
];
export const WAY_NAMES = new Set(WAY_TOOLS.map((t) => t.name));
/** whether a team's ways run, as v3/way-switch.ts asks it (teamWaysOn): the ways' switch and Cowork v3's both on */
export const waysNow = (): boolean => waysOn() && coworkV3();
/** the tools a seat is offered: none with the ways' switch off */
export const wayTools = () => (waysNow() ? WAY_TOOLS : []);

/** a card in front of the person of a session: yes, no, or null when no card can be shown there */
export type Card = (sessionId: string | undefined, c: { title: string; description: string; decisionReason: string; input: Record<string, unknown> }) => Promise<boolean | null>;
/** what the tools need: my login (exactly as Sol keeps it), the team's projects, this Sol, the clock, the card */
export type WayToolDeps = {
  me: () => string; projects: () => string[];
  sol?: () => import("./v3/way-writer.js").WaySol; clock?: () => number; card?: Card;
};

const tx = (text: string, isError = false): ToolResult => ({ content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) });
const str = (x: unknown): string => (typeof x === "string" ? x : "");

/** the card of a Work session: its run's own (work/runs.ts card), asked whatever the mode */
const workCard: Card = async (sessionId, c) => {
  if (!sessionId) return null;
  const run = (await import("../work/runs.js")).getRun(sessionId);
  return run ? run.card(`mcp__sol__way_press`, c.input, { title: c.title, description: c.description, decisionReason: c.decisionReason }) : null;
};
const defaults = (): WayToolDeps => ({ me: () => getTeam().me.login, projects: () => getTeam().rooms.map((r) => r.id) });

/** one move on a thing as way_look says it */
type Open = { thing: string; kind: string; state: string | null; move: string; to: string; sets: string[]; mine: boolean; agent: boolean; when: boolean };

/** the moves of one way open on each thing (and the births), for me and my agent (pure) */
export async function openMoves(way: import("../way/types.js").Way, things: Record<string, import("../way/types.js").ThingNow>, me: string): Promise<Open[]> {
  const { fromList, lifeOf } = await import("../way/types.js");
  const { rolesOf } = await import("../way/moves.js");
  const mine = rolesOf(way, `person:${me}`), agents = rolesOf(way, `agent:${me}`);
  const out: Open[] = [];
  const add = (thing: string, kind: string, state: string | null, m: import("../way/types.js").Move) => {
    const by = m.by.filter((b) => !b.startsWith("trigger:"));
    out.push({ thing, kind, state, move: m.id, to: m.to, sets: m.set ?? [], mine: by.some((b) => mine.includes(b)), agent: by.some((b) => agents.includes(b)), when: !!m.when });
  };
  for (const t of Object.values(things).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const life = lifeOf(way, t.kind);
    for (const m of life?.moves ?? []) if (m.from !== null && fromList(m.from).includes(t.state ?? "")) add(t.id, t.kind, t.state, m);
  }
  for (const kind of Object.keys(way.life).sort()) for (const m of way.life[kind].moves) if (m.from === null) add("(new)", kind, null, m);
  return out.filter((o) => o.mine || o.agent);
}

/** way_look's words: per project and way, the version, the things, the moves open to my agent and to me only */
async function look(d: WayToolDeps, project: string, only: string): Promise<string> {
  const { readOf, waySol } = await import("./v3/way-wire.js");
  const { projectFor } = await import("./v3/project-id.js");
  const me = d.me(), s = (d.sol ?? waySol)(), now = Math.floor((d.clock ?? Date.now)());
  const lines: string[] = [];
  for (const room of project ? [project] : d.projects()) {
    const p = projectFor(room);
    const ways = readOf(s, p, me, now, only || undefined) as { way: string; ver: string; file: import("../way/types.js").Way | null; things: Record<string, import("../way/types.js").ThingNow> }[];
    for (const w of ways) {
      if (!w.file) { lines.push(`${p} · ${w.way}: no version in force`); continue; }
      const open = await openMoves(w.file, w.things, me);
      const n = Object.keys(w.things).length;
      lines.push(`${p} · ${w.way} (${w.file.name}), version ${w.ver.slice(0, 12)}: ${n} thing${n === 1 ? "" : "s"}`);
      for (const t of Object.values(w.things)) lines.push(`  ${t.id}: a ${t.kind}, ${t.state ?? "not born"}`);
      const say = (o: Open) => `    ${o.thing === "(new)" ? `new ${o.kind}` : o.thing} → ${o.move} (to ${o.to})${o.sets.length ? `, sets ${o.sets.join(", ")}` : ""}${o.when ? ", has a rule" : ""}`;
      const yours = open.filter((o) => o.agent), theirs = open.filter((o) => !o.agent);
      lines.push(yours.length ? "  yours to press (way_press):" : "  none yours to press: no role of this way names your person's agent");
      lines.push(...yours.map(say));
      if (theirs.length) lines.push("  your person's only:", ...theirs.map(say));
    }
  }
  return lines.length ? lines.join("\n") : "no way in force in that project";
}

/** the most a card says of the values a press writes: the window shows the card's title whole, so a
 *  press whose values do not fit is not offered; the person makes it */
export const CARD_MAX = 400;
/** a press as the card says it: the title names the move and every value it writes (and an act it owes); the reason,
 *  which the window shows under it, says it again in a sentence. null: too long to show whole */
export function cardOf(project: string, way: string, a: { thing: string; move: string; kind?: string; set?: Record<string, unknown> }, born: boolean, acts: { seam: string }[]): { title: string; description: string; decisionReason: string } | null {
  const values = Object.entries(a.set ?? {}).map(([k, v]) => `${k} = ${JSON.stringify(v)}`);
  const owes = acts.length ? `; then owes ${acts.map((x) => x.seam).join(", ")} (nothing runs it yet)` : "";
  const title = `Your agent presses "${a.move}" on ${born ? `a new ${a.kind}, ${a.thing}` : a.thing}${values.length ? `, writing ${values.join("; ")}` : ""}${owes}`;
  if (title.length > CARD_MAX) return null;
  const description = `In ${way} (${project}), signed as your agent, seen by the whole team.`;
  return { title, description, decisionReason: `${description} ${values.length ? `It writes ${values.join("; ")}.` : "It writes no value."}${owes ? ` It${owes.slice(1)}.` : ""}` };
}

/** way_press: judged, a card, then written only when it passes again */
async function pressOne(d: WayToolDeps, a: Record<string, unknown>, sessionId: string | undefined): Promise<ToolResult> {
  const { press } = await import("./v3/way-writer.js");
  const { readOf, waySol } = await import("./v3/way-wire.js");
  const { projectFor } = await import("./v3/project-id.js");
  const { PROJECT } = await import("./v3/trail.js");
  const { ID, isObj } = await import("../way/types.js");
  const project = projectFor(str(a.project)), way = str(a.way), thing = str(a.thing), move = str(a.move);
  if (!PROJECT.test(project)) return tx("which project? (way_look names them)", true);
  if (!ID.test(way)) return tx("which way? (way_look names them)", true);
  if (!thing || !move) return tx("which thing, which move?", true);
  const me = d.me();
  if (!me) return tx("sign in to GitHub first: a way's events are signed under your person's login", true);
  const s = (d.sol ?? waySol)(), clock = d.clock ?? Date.now;
  const now = readOf(s, project, me, Math.floor(clock()), way)[0] as { ver?: string; things?: Record<string, unknown> } | undefined;
  const ver = str(now?.ver), born = !Object.hasOwn(now?.things ?? {}, thing);
  const ask = { thing, move, ...(typeof a.kind === "string" ? { kind: a.kind } : {}), ...(isObj(a.set) ? { set: a.set } : {}), ...(ver ? { ver } : {}) };
  const who = { person: me, agent: AGENT };
  const trial = press(s, project, way, who, ask, clock, {}, { write: "none" });
  if (!trial.ok) return tx(`refused before anything was written: ${trial.why}${trial.error ? ` (${trial.error})` : ""}. Nothing reached the team.`, true);
  const c = cardOf(project, way, ask, born, trial.acts);
  if (!c) return tx(`not offered: the values are too long to show whole on your person's card (${CARD_MAX} characters at most). Nothing written; your person can make this move.`, true);
  const yes = await (d.card ?? workCard)(sessionId, { ...c, input: { project, way, thing, move, ...(ask.kind ? { kind: ask.kind } : {}), ...(ask.set ? { set: ask.set } : {}) } });
  if (yes === null) return tx("no card can be shown to your person here, so nothing is pressed: a press is only from a Work session", true);
  if (!yes) return tx("your person said no: nothing pressed");
  const p = press(s, project, way, who, ask, clock, {}, { write: "ok" });
  if (!p.ok) return tx(`not pressed: by the time of the yes it would be refused (${p.why}). Nothing written.`, true);
  const acts = p.acts.length ? ` It owes ${p.acts.map((x) => `${x.seam} on ${x.thing}`).join(", ")}: nothing runs that yet, your person sees it waiting.` : "";
  return tx(`pressed: ${move} on ${thing}, ${p.written.length} event${p.written.length === 1 ? "" : "s"} on the team's trail, signed as your person's agent${p.whole ? "" : " (not all of it was written: the next read says what stands)"}.${acts}`);
}

export async function runWayTool(name: string, args: unknown, turn: TurnCtx = {}, deps: Partial<WayToolDeps> = {}): Promise<ToolResult> {
  if (!waysNow()) return tx("Cowork ways are off on this Sol", true);
  const d = { ...defaults(), ...deps };
  const a = (args ?? {}) as Record<string, unknown>;
  try {
    if (name === "way_look") return tx(await look(d, str(a.project), str(a.way)));
    if (name === "way_press") return await pressOne(d, a, turn.sessionId);
    return tx(`Unknown tool: ${name}`, true);
  } catch (e) { return tx(String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200), true); }
}
