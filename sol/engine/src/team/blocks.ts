// Team blocks (#429, C3 of #413): Cowork's tiles, card actions and project tools as one registry. A block is declared
// once: its id, its kind, what it shows, what it can do, and which tools it gives agents. Sol's own blocks are declared
// in the face's mac/src/cowork/blocks/blocks.json (the one file both sides read, as buttons/presets.json is); the face
// draws each by its id and the engine reads the same file for the agents' tools. A block is live in a project when the
// project says so: the `blocks` part of `.sol/project.json` (project.ts), changed only by a proposal the team agrees to
// in the project's polls (#428). A block with no word in the project yet is as its declaration starts it ("on" for every
// block Sol shipped before blocks existed, so nothing anyone sees changed; a new one ships "off" and a project turns it
// on). A `fixed` block (the project settings, where blocks are turned on) is always live.
// A kind is what kind of place a block takes: "tile" on the board's dashboard, "action" in a card's menu, "tool" a page
// in the project's centre with its tile in "what we're making". A new kind (round 4: pages, tables, templates, team
// tools) is one `defineKind` call in a file of its own, imported once by wire.ts, and one place in the face that draws
// the live blocks of that kind (sol/README.md, "Team blocks"); nothing here changes. A kind that is `declarable` can be
// declared by a team in its own record, with no code: the declaration travels in the proposal that turns it on and is
// kept in the project's `blocks` part. A kind this Sol does not know (a newer Sol's) is kept as written, never live here.
// Pure but for the one read of blocks.json.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Block = {
  id: string; kind: string; name: string;
  shows: string;        // what it shows, in a line
  does: string[];       // what a person can do with it
  agents: string[];     // the agent tools it gives (their names); while it is not live they are refused
  start: "on" | "off";  // live in a project that has not said
  fixed?: true;         // always live (it can never be turned off)
  glyph?: string;       // the face's drawing for it, when the kind draws one
  with?: Record<string, unknown>;   // the kind's own fields (a page's file, a tool's data), as the kind cleans them
};
/** a project's word on its blocks (the `blocks` part of .sol/project.json): on or off, by id, and the declaration of a
 *  block the team made itself (a declarable kind), kept here with it */
export type BlocksPart = Record<string, { on: boolean; block?: Block }>;
export type BlockView = Block & { live: boolean; from: "code" | "record"; known: boolean };
export type KindDef = {
  kind: string;
  where: string;                 // where its blocks show, in a few words (room_blocks says it)
  declarable?: boolean;          // a team may declare one in its record, without code
  /** the kind's own fields made valid; null refuses the block */
  clean?: (raw: Record<string, unknown>) => Record<string, unknown> | null;
};

export const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const TOOL = /^[a-z][a-z0-9_]{0,59}$/;
export const BLOCKS_MAX = 60;
const WITH_MAX = 4000;   // a kind's own fields, as JSON, at most
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const oneLine = (v: unknown, max: number) => (typeof v === "string" ? v : "").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);

// ---- the kinds ----

const KINDS = new Map<string, KindDef>();
/** a kind of block: the core never changes for a new one */
export function defineKind(k: KindDef) { if (ID.test(k.kind)) KINDS.set(k.kind, k); }
export const kindOf = (kind: string) => KINDS.get(kind);
export const kinds = () => [...KINDS.values()];
defineKind({ kind: "tile", where: "a tile on the board's dashboard, read-only" });
defineKind({ kind: "action", where: "an item in a card's menu on the action board" });
defineKind({ kind: "tool", where: "a page in the project's centre, its tile pinned first in what we're making" });

// ---- one block made valid (pure) ----

/** a declaration made valid; null when it is not a block. `kept` (a record's): a kind this Sol does not know, or whose
 *  fields it cannot clean, is kept as written so a newer Sol's block survives an older one's write */
export function cleanBlock(v: unknown, kept = false): Block | null {
  if (!isObj(v)) return null;
  const id = typeof v.id === "string" ? v.id.trim() : "", kind = typeof v.kind === "string" ? v.kind.trim() : "";
  const name = oneLine(v.name, 60);
  if (!ID.test(id) || !ID.test(kind) || !name) return null;
  const list = (x: unknown, max: number, each: (s: string) => string) => (Array.isArray(x) ? x : []).map((s) => each(String(s))).filter(Boolean).slice(0, max);
  const b: Block = {
    id, kind, name, shows: oneLine(v.shows, 200),
    does: list(v.does, 8, (s) => oneLine(s, 60)),
    agents: [...new Set(list(v.agents, 8, (s) => (TOOL.test(s.trim()) ? s.trim() : "")))],
    start: v.start === "on" ? "on" : "off",
  };
  if (v.fixed === true) b.fixed = true;
  const glyph = oneLine(v.glyph, 30);
  if (glyph) b.glyph = glyph;
  // the kind's own fields: cleaned by the kind (which may refuse the block); kept as written when this Sol cannot
  const k = KINDS.get(kind), raw = isObj(v.with) ? v.with : undefined;
  if (k?.clean) {
    const w = k.clean(raw ?? {});
    if (w === null) { if (!kept) return null; if (raw) b.with = raw; }
    else if (Object.keys(w).length) b.with = w;
  } else if (raw) b.with = raw;
  if (b.with && !kept && JSON.stringify(b.with).length > WITH_MAX) return null;
  return b;
}

/** the project's part as read (pure): an id's on/off, and a team's own declaration with it */
export function cleanBlocksPart(v: unknown): BlocksPart | null {
  if (!isObj(v)) return null;
  const out: BlocksPart = {};
  for (const [id, x] of Object.entries(v)) {
    if (!ID.test(id) || !isObj(x) || typeof x.on !== "boolean") continue;
    const e: BlocksPart[string] = { on: x.on };
    if (isObj(x.block)) { const b = cleanBlock({ ...x.block, id }, true); if (b) e.block = b; }
    out[id] = e;
    if (Object.keys(out).length === BLOCKS_MAX) break;
  }
  return out;
}
/** the part in one order (pure), so a write that changes nothing is never a commit */
export const sortBlocks = (p: BlocksPart): BlocksPart => Object.fromEntries(Object.keys(p).sort().map((k) => [k, p[k]]));

// ---- Sol's own (the one file) ----

const HERE = dirname(fileURLToPath(import.meta.url));
const SOL = resolve(HERE, "..", "..", "..");   // src/team or dist/team, two down from the engine
export const BLOCKS_FILE = join(SOL, "mac", "src", "cowork", "blocks", "blocks.json");
/** blocks.json read into blocks (pure): unknown kinds and bad ones left out, the first of an id kept */
export function parseShipped(text: unknown): Block[] {
  let raw: unknown;
  try { raw = JSON.parse(String(text ?? "")); } catch { return []; }
  const out: Block[] = [];
  for (const x of isObj(raw) && Array.isArray(raw.blocks) ? raw.blocks : []) {
    const b = cleanBlock(x);
    if (b && KINDS.has(b.kind) && !out.some((y) => y.id === b.id)) out.push(b);
  }
  return out;
}
let shippedNow: Block[] | null = null;
/** Sol's own blocks; none when the file cannot be read (then no agent tool is ever refused for a block) */
export function shipped(): Block[] {
  if (!shippedNow) { try { shippedNow = parseShipped(readFileSync(BLOCKS_FILE, "utf8")); } catch { shippedNow = []; } }
  return shippedNow;
}
/** the tests' own list (null: read the file again) */
export const setShipped = (l: Block[] | null) => { shippedNow = l; };

// ---- what is live (pure) ----

/** every block of a project: Sol's own first, then the team's own, each with whether it is live here */
export function blocksIn(part: BlocksPart | null | undefined, own: Block[] = shipped()): BlockView[] {
  const p = part ?? {};
  const out: BlockView[] = own.map((b) => ({ ...b, from: "code" as const, known: true, live: !!b.fixed || (p[b.id]?.on ?? b.start === "on") }));
  for (const [id, e] of Object.entries(p)) {
    if (!e.block || own.some((b) => b.id === id)) continue;   // Sol's own id: its declaration is the code's
    const known = !!KINDS.get(e.block.kind)?.declarable;
    const { fixed: _fixed, ...b } = e.block;   // only Sol's own can be fixed
    out.push({ ...b, from: "record", known, live: known && e.on });
  }
  return out;
}
export const liveIds = (views: BlockView[]) => views.filter((b) => b.live).map((b) => b.id);

/** an agent tool's refusal while no block that gives it is live (pure); null when it may run, and for a tool no block
 *  gives (so with no blocks read, nothing is refused) */
export function toolRefusal(tool: string, views: BlockView[]): string | null {
  // a tool one of Sol's own blocks gives is given by those alone: a team's own block cannot claim it past them
  const all = views.filter((b) => b.agents.includes(tool)), code = all.filter((b) => b.from === "code");
  const givers = code.length ? code : all;
  if (!givers.length || givers.some((b) => b.live)) return null;
  const names = givers.map((b) => b.name).join(" or ");
  return `${names} ${givers.length > 1 ? "are" : "is"} not on in this project, so ${tool} is not either. The team turns a block on in the project settings, by agreement; you may propose it with room_block_propose when your human wants it`;
}

/** a change asked for, laid over the part as it is (pure): the ids named change, the rest stay; `null` takes a team's
 *  own block off. Refused with words when it names a block that is not there, turns a fixed one off, or declares a
 *  block of a kind a team cannot declare */
export function mergeBlocks(now: BlocksPart, change: unknown, own: Block[] = shipped()): { part: BlocksPart } | { error: string } {
  if (!isObj(change) || !Object.keys(change).length) return { error: "which block? name it by its id" };
  const part: BlocksPart = { ...now };
  for (const [id, x] of Object.entries(change)) {
    const mine = own.find((b) => b.id === id);
    if (x === null) { if (mine) return { error: `${mine.name} is Sol's own: it can be turned off, not taken away` }; delete part[id]; continue; }
    if (!ID.test(id) || !isObj(x)) return { error: `no block called ${oneLine(id, 40) || "that"}` };
    const on = typeof x.on === "boolean" ? x.on : part[id]?.on ?? true;
    if (mine) {
      if (mine.fixed && !on) return { error: `${mine.name} is always on: it is where blocks are turned on` };
      part[id] = { on };
      continue;
    }
    const block = isObj(x.block) ? cleanBlock({ ...x.block, id }) : part[id]?.block ?? null;
    if (!block) return { error: `no block called ${id}: a new one needs its declaration (kind, name, what it shows)` };
    const k = KINDS.get(block.kind);
    if (!k) return { error: `this Sol does not know blocks of kind ${block.kind}: update Sol first` };
    if (!k.declarable) return { error: `a ${block.kind} block needs code: it ships with Sol, one file and a line in blocks.json, then the project turns it on` };
    const { fixed: _fixed, ...b } = block;
    part[id] = { on, block: { ...b, start: "off" } };
  }
  const n = Object.keys(part).length;
  if (n > BLOCKS_MAX) return { error: `a project keeps at most ${BLOCKS_MAX} blocks` };
  return { part: sortBlocks(part) };
}

/** whether two words on the blocks come to the same project (pure): the same blocks, each live or not as before, the
 *  team's own declared the same. "on" said for a block that starts on is no change */
export function sameBlocks(a: BlocksPart, b: BlocksPart, own: Block[] = shipped()): boolean {
  const key = (p: BlocksPart) => JSON.stringify(blocksIn(p, own).map((x) => [x.id, x.live, x.from === "record" ? x : null]));
  return key(a) === key(b);
}

/** a blocks change in a few words (pure): "the calendar off, eyes wanted on, roadmap (page) added" */
export function blocksSummary(after: BlocksPart, before: BlocksPart | undefined, own: Block[] = shipped()): string {
  const was = blocksIn(before ?? {}, own), now = blocksIn(after, own);
  const ch: string[] = [];
  for (const b of now) {
    const a = was.find((x) => x.id === b.id);
    if (!a) ch.push(`${b.name} (${b.kind}) added${b.live ? "" : ", off"}`);
    else if (a.live !== b.live) ch.push(`${b.name} ${b.live ? "on" : "off"}`);
  }
  for (const a of was) if (!now.some((b) => b.id === a.id)) ch.push(`${a.name} taken off`);
  return ch.join(", ") || "as they are";
}

/** room_blocks's answer (pure): each block, whether it is on, what it shows and does, and what it gives agents */
export function blocksText(views: BlockView[], waiting?: string): string {
  if (!views.length) return "this Sol could not read its blocks";
  const lines = views.map((b) => `- ${b.id} (${b.kind}${b.from === "record" ? ", the team's own" : ""}): ${b.live ? "on" : b.known ? "off" : "off here, a newer Sol's kind"}${b.fixed ? ", always" : ""} · ${b.name}${b.shows ? ` · shows ${b.shows}` : ""}${b.does.length ? ` · can ${b.does.join("; ")}` : ""}${b.agents.length ? ` · gives agents ${b.agents.join(", ")}` : ""}`);
  return [`The project's blocks (a block that is off shows nowhere and its agent tools are refused):`, ...lines, ...(waiting ? [`Waiting for agreement: ${waiting}`] : [])].join("\n");
}
