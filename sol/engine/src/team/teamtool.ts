// Team tools (#436, E1 of #413): how a tool the team uses together plugs into Cowork. A team tool is a team block of
// kind "tool" (#429, blocks.ts) whose declaration says four things more, in its `with`:
//   page    the face's page that draws it (cowork/teamtools/<page>), opened in the project's centre as the calendar,
//           decisions and polls are, its tile pinned first in "what we're making"
//   reads   what it reads and from where, each in a line ("the review session's words · the project's feed"); shown on
//           its page, so a member always sees what a tool looks at before it is turned on
//   owner   the GitHub login who answers for it
//   gate    "members": only the project's members may open it, and the engine refuses, never only the face hiding it.
//           "devs" (#480): the project's members who are also its Sol developers (the people its settings name: the
//           leads of the ownership table and the dev and beta reviewers of the rhythm), for the team's own tools
// It is turned on and off like any block, through the project's settings (a proposal the team agrees to). Its data
// comes from the engine alone, by `team.tool { id }`: the engine checks the block is a team tool, live in the project
// in use, and that this Sol's person is one of the project's members, then runs the tool's reader (`defineTool`, in the
// tool's own file, imported once by wire.ts). Nothing in blocks.ts changes: this file gives the kind "tool" its own
// fields by `defineKind`, and a block of kind "tool" with no `reads` (Sol's own calendar, decisions, polls, settings)
// is as it was.
import { defineKind, ID, type Block, type BlockView } from "./blocks.js";

export type Read = { what: string; from: string };
export type TeamTool = { page: string; reads: Read[]; owner: string; gate: "members" | "devs" };
export type ToolReader = (ctx: ReaderCtx) => Promise<unknown>;
/** what a reader is handed: the project the gate let it into (`key`, its feed's key: a reader reads that project and
 *  no other, even when the person switches projects meanwhile), its time zone ("" for this Mac's), and whether to read
 *  again past a cache */
export type ReaderCtx = { key: string; zone: string; refresh: boolean };

const LOGIN = /^[A-Za-z0-9-]{1,39}$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const oneLine = (v: unknown, max: number) => (typeof v === "string" ? v : "").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** a tool's own fields made valid (pure). No `reads`: one of Sol's own project tools, nothing to add ({}). With `reads`:
 *  a team tool, which must name its page, at least one read (what and from where), an owner, and the members gate;
 *  null refuses the block when any is missing, so a tool can never ship without saying what it reads or who may open it */
export function cleanTool(raw: Record<string, unknown>): Record<string, unknown> | null {
  if (raw.reads === undefined && raw.gate === undefined && raw.owner === undefined && raw.page === undefined) return {};
  const page = typeof raw.page === "string" ? raw.page.trim() : "";
  const reads = (Array.isArray(raw.reads) ? raw.reads : []).flatMap((r): Read[] => {
    if (!isObj(r)) return [];
    const what = oneLine(r.what, 160), from = oneLine(r.from, 160);
    return what && from ? [{ what, from }] : [];
  }).slice(0, 6);
  const owner = typeof raw.owner === "string" ? raw.owner.trim() : "";
  if (!ID.test(page) || !reads.length || !LOGIN.test(owner) || (raw.gate !== "members" && raw.gate !== "devs")) return null;
  const t: TeamTool = { page, reads, owner, gate: raw.gate };
  return t;
}

defineKind({
  kind: "tool",
  where: "a page in the project's centre, its tile pinned first in what we're making; a team tool says what it reads and opens for the project's members only",
  clean: cleanTool,
});

/** the team tool a block is (pure): null for any other block, Sol's own project tools among them */
export function toolOf(b: Pick<Block, "kind" | "with">): TeamTool | null {
  if (b.kind !== "tool" || !b.with || !isObj(b.with)) return null;
  const t = cleanTool(b.with);
  return t && "reads" in t ? (t as TeamTool) : null;
}

// ---- the readers: one a tool, in the tool's own file ----

const READERS = new Map<string, ToolReader>();
const NAMES_PEOPLE = new Set<string>();
/** a team tool's reader, by its block's id: what the engine sends the face once the gate let it through. `people`: what
 *  it reads names people (track data, #437), so its gate is strict: the members read again past a minute, and a read
 *  that fails shuts it, never the list from before */
export function defineTool(id: string, read: ToolReader, o: { people?: boolean } = {}) {
  if (!ID.test(id)) return;
  READERS.set(id, read);
  if (o.people) NAMES_PEOPLE.add(id); else NAMES_PEOPLE.delete(id);
}
export const readerOf = (id: string) => READERS.get(id);
/** does this tool's reader read data that names people (its gate strict)? */
export const namesPeople = (id: string) => NAMES_PEOPLE.has(id);

// ---- the gate (pure) ----

export type GateNo = { error: string; gate: "none" | "off" | "members" | "devs" | "unknown" | "missing" };
/** the refusals that need no members (pure): no such team tool here, or it is off in the project */
function shut(id: unknown, views: BlockView[]): { tool: TeamTool; block: BlockView } | GateNo {
  const block = typeof id === "string" ? views.find((b) => b.id === id) : undefined;
  const tool = block ? toolOf(block) : null;
  if (!block || !tool) return { error: `no team tool called ${oneLine(id, 40) || "that"} in this project`, gate: "none" };
  if (!block.live) return { error: `${block.name} is not on in this project: the team turns it on in the project settings, by agreement`, gate: "off" };
  return { tool, block };
}

/** whether this Sol's person may open a team tool here (pure): the block a team tool, live in the project, and `me`
 *  among the project's members. `members` null or empty: the members could not be read, so it stays shut. A tool whose
 *  gate is "devs" (#480) also needs `me` among `devs`, the project's Sol developers; none known: shut */
export function gate(id: unknown, views: BlockView[], me: string, members: string[] | null, devs: string[] | null = null): { tool: TeamTool; block: BlockView } | GateNo {
  const s = shut(id, views);
  if ("error" in s) return s;
  const { block } = s;
  if (!members?.length) return { error: `${block.name} is for this project's members, and Sol could not tell who they are (the project names no GitHub org or cloud group, or GitHub did not answer), so it stays shut`, gate: "unknown" };
  const who = me.toLowerCase();
  if (!who || !members.some((m) => m.toLowerCase() === who)) return { error: `${block.name} is for this project's members only, and ${me || "this Sol's person"} is not one`, gate: "members" };
  if (s.tool.gate === "devs" && !devs?.some((d) => d.toLowerCase() === who)) return { error: `${block.name} is for this project's Sol developers only (the leads and reviewers its settings name), and ${me} is not one`, gate: "devs" };
  if (!READERS.has(block.id)) return { error: `this Sol cannot read ${block.name} yet: update Sol`, gate: "missing" };
  return s;
}

/** `team.tool`'s answer: the gate, then the tool's reader. Everything the engine knows is handed in, so the tests run
 *  with no record and no network. `members(strict)`: strict for a tool that names people (`defineTool`'s `people`) */
export async function openTool(a: { id: unknown; views: BlockView[]; me: string; members: (strict: boolean) => Promise<string[] | null>; devs?: () => Promise<string[] | null>; ctx: ReaderCtx }):
  Promise<{ id: string; tool: TeamTool; data: unknown } | (GateNo & { id: string })> {
  const id = typeof a.id === "string" ? a.id : "";
  // the cheap refusals first, so an off tool never costs a read of the members
  const first = shut(id, a.views);
  if ("error" in first) return { id, ...first };
  const members = await a.members(NAMES_PEOPLE.has(id)).catch(() => null);
  const devs = first.tool.gate === "devs" && a.devs ? await a.devs().catch(() => null) : null;
  const g = gate(id, a.views, a.me, members, devs);
  if ("error" in g) return { id, ...g };
  try { return { id, tool: g.tool, data: await READERS.get(id)!(a.ctx) }; }
  catch (e) { return { id, error: `couldn't read ${g.block.name}: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 160)}`, gate: "missing" }; }
}
