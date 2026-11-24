// canvas_read, canvas_place, canvas_fold, canvas_arrange, canvas_open: the canvas's own moves, given to an AI (#1615 BR1,
// Marco 2026-11-22 21:20 "the chatbar is always agentic"). The bar's agent (next/canvas-agent.ts) and any session with
// ui.next on can see what is on the canvas and move it as the hand would: put a folder or a piece at a spot, fold or
// unfold it, lay several out in a grid, a row or a column, open one. Every change is a place kept by the engine as the
// AI's (next/pos.ts setPos, by "ai"), told to every window as next.pos.ai, which the face does as the hand would (a
// folder takes its pieces with it, a fold takes its folded size; sol/mac/src/next/cv/wire/canvas.ts) and keeps. Open is
// the face's own tab (next.tab.ai, tabs-tool.ts).
// What the canvas holds (names, kinds, which folder a thing sits in) is the window's: it hands its picture over with
// each bar message (next.canvas.say { canvas }), kept here in memory per home; the places kept since win over it.
// Offered only while ui.next is on (read at each turn's start); listed and routed through next/workspace-tool.ts.
// Signed: marcocyl04-ux's agent (builder B), BR1 (#1615).
import { z } from "zod";
import type { ToolResult } from "../browser.js";
import { uiNext } from "../settings.js";
import { readPos, setPos, type Pos } from "./pos.js";

/** one thing on the canvas as the window drew it: a folder, a piece, the Diary, a holder; plane units (x right, y down) */
export type Seen = { id: string; name: string; kind: string; x: number; y: number; w: number; h: number; folded: boolean; in?: string | null };
const okId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 300 && !/[\u0000-\u001f]/.test(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e7;

/** the window's picture, cleaned (pure): a line that is not a thing is dropped, at most 400 */
export function cleanSeen(v: unknown): Seen[] {
  if (!Array.isArray(v)) return [];
  const out: Seen[] = [];
  for (const x of v.slice(0, 400)) {
    const s = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    if (!okId(s.id) || !num(s.x) || !num(s.y) || !num(s.w) || !num(s.h)) continue;
    out.push({ id: s.id, name: String(s.name ?? s.id).slice(0, 160), kind: String(s.kind ?? "piece").slice(0, 40), x: s.x, y: s.y, w: s.w, h: s.h, folded: s.folded === true, ...(okId(s.in) ? { in: s.in } : {}) });
  }
  return out;
}

const seen = new Map<string, { at: number; items: Seen[] }>();
/** the window's picture of the canvas, as it handed it over (next.canvas.say) */
export function setSeen(home: string, items: unknown, now = Date.now()): number {
  const c = cleanSeen(items);
  if (c.length || Array.isArray(items)) seen.set(home, { at: now, items: c });
  return c.length;
}
/** what is on the canvas now: the window's picture, each place kept since it (pos.json, the AI's or the person's) over it */
export function canvasNow(home: string): Seen[] {
  const s = seen.get(home), pos = readPos(home).pos;
  return (s?.items ?? []).map((x) => {
    const q = pos[x.id];
    return q && q.at >= s!.at ? { ...x, x: q.x, y: q.y, w: q.w, h: q.h, folded: q.folded } : x;
  });
}
/** a thing by its id, else by its name when only one has it (any case) */
export function findOn(items: Seen[], key: string): Seen | null {
  const k = key.trim();
  const byId = items.find((x) => x.id === k);
  if (byId) return byId;
  const named = items.filter((x) => x.name.toLowerCase() === k.toLowerCase());
  return named.length === 1 ? named[0] : null;
}

export type How = "grid" | "row" | "column";
export const GAP = 96;   // the plane's gap between folders (plane/layout.ts R_GAP)
/** the spots for these things laid out from where the first of them stands (pure): a grid (as near square as it goes),
 *  a row or a column, each keeping its own size, GAP between */
export function arrangeSpots(items: Seen[], how: How, gap = GAP): { id: string; x: number; y: number }[] {
  if (!items.length) return [];
  const x0 = Math.min(...items.map((q) => q.x)), y0 = Math.min(...items.map((q) => q.y));
  const cols = how === "row" ? items.length : how === "column" ? 1 : Math.ceil(Math.sqrt(items.length));
  const out: { id: string; x: number; y: number }[] = [];
  const widths: number[] = [];
  for (let i = 0; i < items.length; i++) widths[i % cols] = Math.max(widths[i % cols] ?? 0, items[i].w);
  let y = y0;
  for (let r = 0; r * cols < items.length; r++) {
    const row = items.slice(r * cols, r * cols + cols);
    let x = x0;
    row.forEach((q, c) => { out.push({ id: q.id, x, y }); x += widths[c] + gap; });
    y += Math.max(...row.map((q) => q.h)) + gap;
  }
  return out;
}
/** reading order: top to bottom, then left to right (pure) */
const reading = (a: Seen, b: Seen) => (Math.abs(a.y - b.y) > 40 ? a.y - b.y : a.x - b.x);

const thing = z.string().min(1).max(300);
export const CANVAS_TOOLS = [
  {
    name: "canvas_read",
    description: "What is on the person's canvas now: every folder, piece, the Diary and the holders, each with its id, its " +
      "name, its kind, where it stands and its size (plane units: x to the right, y down), whether it is folded, and the folder it " +
      "sits in. Read it before moving anything; the other canvas tools take these ids (or a name only one thing has).",
    shape: {},
  },
  {
    name: "canvas_place",
    description: "Put one thing on the canvas at a spot (x, y: its top left, plane units), optionally with a new size (w, h). " +
      "A folder takes the things inside it along. Kept as your place; the person can move it again.",
    shape: { id: thing, x: z.number(), y: z.number(), w: z.number().positive().optional(), h: z.number().positive().optional() },
  },
  {
    name: "canvas_fold",
    description: "Fold a thing where it stands (folded: true; a folder to its tab, a session to its chip, the Diary to its " +
      "spine) or unfold it (folded: false). Folding what the person is not using is the quickest tidy.",
    shape: { id: thing, folded: z.boolean() },
  },
  {
    name: "canvas_arrange",
    description: "Lay several things out again from where the first of them stands, each keeping its size: `how` grid (as near " +
      "square as it goes), row or column. `ids` in the order you want them; left out, every thing at the top of the canvas " +
      "(not inside a folder) in reading order. Use it when the person asks to organise or tidy the canvas.",
    shape: { ids: z.array(thing).max(200).optional(), how: z.enum(["grid", "row", "column"]) },
  },
  {
    name: "canvas_open",
    description: "Open a thing for the person: `as` tab (default) takes it out to a tab in front, as ⤢ does, unless they are " +
      "typing; `as` place opens it where it stands on the canvas.",
    shape: { id: thing, as: z.enum(["tab", "place"]).optional() },
  },
] as const;
export const CANVAS_NAMES = new Set<string>(CANVAS_TOOLS.map((t) => t.name));

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) });
const round = (v: number) => Math.round(v);
const line = (x: Seen) => `${x.id} · ${x.name} · ${x.kind} · at ${round(x.x)},${round(x.y)} size ${round(x.w)}×${round(x.h)}${x.folded ? " · folded" : ""}${x.in ? ` · in ${x.in}` : ""}`;

/** one place kept as the AI's and told to every window; the picture follows it */
function put(home: string, tell: (m: object) => void, x: Seen, to: { x?: number; y?: number; w?: number; h?: number; folded?: boolean }): { ok: true; pos: Pos } | { ok: false; why: string } {
  const was = readPos(home).pos[x.id];
  const r = setPos(home, { id: x.id, x: to.x ?? x.x, y: to.y ?? x.y, w: to.w ?? x.w, h: to.h ?? x.h, by: "ai", touched: true, folded: to.folded ?? x.folded, ...(was?.in !== undefined ? { in: was.in } : {}) });
  if (!r.ok) return r;
  const s = seen.get(home);
  if (s) s.items = s.items.map((q) => (q.id === x.id ? { ...q, x: r.pos.x, y: r.pos.y, w: r.pos.w, h: r.pos.h, folded: r.pos.folded } : q));
  try { tell({ type: "next.pos.ai", id: r.id, ...r.pos }); } catch { /* the window reads the places again with next.state */ }
  return { ok: true, pos: r.pos };
}

/** the tool run against a home (the engine's, or a test's), its changes told to `tell` (every window) */
export async function runCanvasTool(name: string, args: unknown, home: string, tell: (m: object) => void): Promise<ToolResult> {
  if (!CANVAS_NAMES.has(name)) return text(`unknown tool ${name}`, true);
  if (!uiNext()) return text(`${name} is not part of this Sol yet.`, true);
  if (!home) return text("not done: Sol has not started its home yet", true);
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const items = canvasNow(home);
  if (name === "canvas_read") {
    if (!items.length) return text("The canvas has not been read yet: the person's window hands it over with their next words in the bar.");
    return text(`The canvas (plane units; x to the right, y down), ${items.length} thing${items.length === 1 ? "" : "s"}:\n${items.map(line).join("\n")}`);
  }
  const miss = (k: unknown) => text(`there is no “${String(k ?? "")}” on the canvas; canvas_read lists what is there`, true);
  if (name === "canvas_arrange") {
    const how = a.how === "row" || a.how === "column" ? a.how : a.how === "grid" ? "grid" : null;
    if (!how) return text("say how: grid, row or column", true);
    let chosen: Seen[];
    if (Array.isArray(a.ids) && a.ids.length) {
      chosen = [];
      for (const k of a.ids) { const x = typeof k === "string" ? findOn(items, k) : null; if (!x) return miss(k); if (!chosen.includes(x)) chosen.push(x); }
    } else chosen = items.filter((x) => !x.in).sort(reading);
    if (!chosen.length) return text("nothing to arrange: the canvas is empty", true);
    for (const s of arrangeSpots(chosen, how)) { const r = put(home, tell, chosen.find((x) => x.id === s.id)!, { x: s.x, y: s.y }); if (!r.ok) return text(`not arranged: ${r.why}`, true); }
    return text(`arranged ${chosen.length} thing${chosen.length === 1 ? "" : "s"} in a ${how}: ${chosen.map((x) => x.name).join(", ")}.`);
  }
  const x = typeof a.id === "string" ? findOn(items, a.id) : null;
  if (!x) return miss(a.id);
  if (name === "canvas_open") {
    const verb = a.as === "place" ? "open" : "tab";
    try { tell({ type: "next.tab.ai", verb, piece: x.id, ...(verb === "tab" ? { front: true } : {}) }); } catch { return text("not done: Sol's window didn't hear it", true); }
    return text(`asked Sol's window to open “${x.name}” ${verb === "tab" ? "in a tab in front (unless the person is typing)" : "where it stands"}.`);
  }
  if (name === "canvas_fold") {
    if (typeof a.folded !== "boolean") return text("say folded: true or false", true);
    if (x.folded === a.folded) return text(`“${x.name}” is already ${a.folded ? "folded" : "open"}.`);
    const r = put(home, tell, x, { folded: a.folded });
    return r.ok ? text(`${a.folded ? "folded" : "unfolded"} “${x.name}”.`) : text(`not done: ${r.why}`, true);
  }
  // canvas_place
  if (!num(a.x) || !num(a.y)) return text("say where: x and y, numbers in plane units", true);
  const w = num(a.w) && a.w > 0 ? a.w : undefined, h = num(a.h) && a.h > 0 ? a.h : undefined;
  const r = put(home, tell, x, { x: a.x, y: a.y, w, h });
  return r.ok ? text(`put “${x.name}” at ${round(r.pos.x)},${round(r.pos.y)}${w || h ? ` size ${round(r.pos.w)}×${round(r.pos.h)}` : ""}.`) : text(`not done: ${r.why}`, true);
}
