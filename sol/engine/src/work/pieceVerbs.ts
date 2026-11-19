// A piece's third face, its verbs (#1092, S/design/design.md NOW 1 of 04:36): a session's agent uses a piece seated on
// its stage under the piece's ceiling. `read` (any ceiling): the rows as plain lines and what it may do. `say` (draft or
// more): write a row's drafted line. `put_away` (act or more): put a row away, as his own press does, in the session's
// name. `read_now`: read its source again. Past the ceiling it asks him on the piece ("let it act"), never acts; with no
// press nothing happens, ever. The stage's update, bind and freeze are refused on a piece's block: its rows come from
// its source, and a piece is changed only through its verbs (one state, one ledger).
import { z } from "zod";
import * as blocks from "./blocks.js";
import { CEILINGS, askMay, heldTo, isPiece, keptIn, keptTitled, now, saySaid, tick, type Ceiling } from "./pieces.js";
import { saidOf } from "./pieceTend.js";

export const PIECE_TOOL = {
  name: "piece",
  description: "Use a piece seated on this stage (a block whose id starts piece-: waits on me, runs, the night…) by its verbs, " +
    "under its ceiling. do: read (its rows as lines, and what you may do; any ceiling), say (write a row's drafted line: " +
    "`row` its id or title, `text` one or two sentences; ceiling draft or more), put_away (put a row away as the person's own " +
    "press does; ceiling act or more), read_now (read its source again). Past its ceiling it asks the person on the piece and " +
    "you wait for their word. Never use update, bind or freeze on a piece.",
  shape: { name: z.string().max(60), do: z.enum(["read", "say", "put_away", "read_now"]), row: z.string().max(200).optional(), text: z.string().max(400).optional() },
} as const;

const WORDS: Record<Ceiling, string> = { look: "read", draft: "read and draft", act: "read, draft and act", spend: "read, draft, act and spend" };
const NEEDS: Record<string, Ceiling> = { read: "look", read_now: "look", say: "draft", put_away: "act" };
/** may this ceiling do this verb (pure) */
export const mayDo = (ceiling: Ceiling, verb: string) => CEILINGS.indexOf(ceiling) >= CEILINGS.indexOf(NEEDS[verb] ?? "spend");

/** the stage's own verbs refused on a piece's block, in words (pure): its rows come from its source */
export function stageRefusal(tool: string, id: string, title?: string): string | null {
  if (!["update", "bind", "freeze"].includes(tool) || !isPiece(id)) return null;
  return `${title ?? id.replace(/^piece-/, "")} is a piece: its rows come from its source. Use \`piece\` (read, say, put_away, read_now).`;
}

type Who = { project: string; sessionId: string; by: string; cwd?: string };
/** the session as he knows it: its own title when it fits whole in 24 letters ("orchestrator"); a longer one is the last
 *  line sent to it, not a name, so "an agent" (the designer's NOW 1 of 05:14); no title: the engine's signature */
async function sessionName(w: Who): Promise<string> {
  try {
    const { workSessions } = await import("./sessions.js");
    const t = (await workSessions()).sessions.find((x) => x.id === w.sessionId)?.title?.trim();
    if (t) return t.length <= 24 ? t : "an agent";
  } catch { /* the list is not there: the signature */ }
  return w.by;
}
/** the person this engine is (the team settings' name), else "the person" */
async function personName(): Promise<string> {
  try { const { getTeam } = await import("../team/settings.js"); const s = getTeam() as { me?: { name?: string; login?: string } }; return s.me?.name?.split(" ")[0] || s.me?.login || "the person"; } catch { return "the person"; }
}
/** one call of the tool; the session's name is the ledger's `by` */
export async function runPiece(w: Who, a: { name?: unknown; do?: unknown; row?: unknown; text?: unknown }): Promise<{ ok: boolean; text: string }> {
  const name = String(a.name ?? "").replace(/^piece-/, "").trim().toLowerCase().replace(/\s+/g, "-");
  const verb = String(a.do ?? "");
  const k = keptIn(w.project, name) ?? keptTitled(w.project, String(a.name ?? ""));
  if (!k) return { ok: false, text: `no piece "${a.name}" in this project: \`read\` the stage for the pieces seated here` };
  // held to the ceiling Sol's own window last wrote, never more than the recipe's (an edited file raises nothing)
  const id = `piece-${k.recipe.name}`, title = k.recipe.title, ceiling = heldTo(k.cwd, k.recipe.name, k.recipe.ceiling);
  if (!NEEDS[verb]) return { ok: false, text: "do is read, say, put_away or read_now" };
  // only a piece seated in this session: the person put it here, so its rows are this talk's business
  if (!(blocks.getBlock(k.project, id)?.sessions ?? []).includes(w.sessionId)) return { ok: false, text: `${title} is not seated in this session: the person drops it in from the folder first` };
  if (!mayDo(ceiling, verb)) {
    const need = NEEDS[verb];
    // the head says who asks only when the session has a name that fits; else "an agent asks"
    const by = await sessionName(w);
    askMay(k, need, w.sessionId, by !== w.by ? by : "an agent");
    const who = await personName();
    return { ok: false, text: `${title} lets an agent ${WORDS[ceiling]}, not ${verb === "say" ? "draft" : "act"}. It is asking ${who} on the piece; you will hear when they let it.` };
  }
  const steps = (() => { try { return (JSON.parse(blocks.bodyOf(k.project, id)?.text ?? "{}") as { steps?: { id?: string; t: string; st: string; note?: string; press?: string; said?: string }[] }).steps ?? []; } catch { return []; } })();
  const which = () => { const r = String(a.row ?? ""); const i = steps.findIndex((s) => s.id === r || s.t === r); return i >= 0 ? i : steps.findIndex((s) => s.t.toLowerCase().startsWith(r.toLowerCase()) && r.length > 3); };
  if (verb === "read") {
    const lines = steps.filter((s) => s.st !== "done").slice(0, 40).map((s) => `- ${s.t}${s.note ? ` · ${s.note}` : ""}${s.st === "wait" ? ` · ${s.press ?? "waits"}` : ""}${s.said ? ` · drafted: ${s.said}` : ""}${s.id ? ` [${s.id}]` : ""}`);
    return { ok: true, text: `${title}, a piece: ${lines.length} rows; you may ${WORDS[ceiling]}.\n${lines.join("\n") || "(nothing open)"}` };
  }
  if (verb === "read_now") { const p = await now(k.cwd, k.recipe.name, false); return { ok: true, text: `read ${title} again: ${p?.wants ?? 0} want the person, ${p?.total ?? 0} rows` }; }
  const i = which();
  if (i < 0) return { ok: false, text: `no row "${a.row}" in ${title}: \`read\` it for the rows and their ids` };
  if (verb === "say") {
    const s = saidOf(String(a.text ?? ""), steps[i].t);
    if (!s) return { ok: false, text: "say one or two whole sentences (160 letters at most) that do not repeat the row's title" };
    saySaid(k, { id: steps[i].id, t: steps[i].t }, s, await sessionName(w));
    return { ok: true, text: `drafted a line on ${title} for ${steps[i].t}` };
  }
  // put_away: the person's own press, in this session's name
  if (steps[i].st === "done") return { ok: true, text: `${steps[i].t} is put away already` };
  tick(k.cwd, k.recipe.name, { ...(steps[i].id ? { id: steps[i].id } : {}), t: steps[i].t }, await sessionName(w));
  return { ok: true, text: `put away ${steps[i].t} on ${title}; the person sees it leave and may undo it` };
}
