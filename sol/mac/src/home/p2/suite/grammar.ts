// The grammar every Home block shares (#692 suite step 1, mine/look/home/suite.html and sticky.html), the pure half:
// the four forms and when the hand's drag of a corner changes one into the next, the bounds (one intent, one folder,
// one tool, one run: past one, it offers the next form), the ring a block's state draws, the shelf's three layers, and
// the swap line a refile says. Pure, so the face's tests reach it (suite.test.ts); Piece.tsx draws it.
import type { Block2, Folder, Form, Tool } from "../pass2";

export const FORMS: Form[] = ["line", "sticky", "tool", "block"];
export const TOOLS: Tool[] = ["browser", "write", "list", "calendar", "ask"];
/** what each form says when the hand brings it there (sticky.html's line under the board) */
export const FORM_SAYS: Record<Form, string> = {
  line: "a line: back in your notes, just your words",
  sticky: "a sticky: one thing, one folder, one run",
  tool: "a tool opens inside it: the one it needs next",
  block: "a block: past a sticky's bounds, a session behind it",
};

/** how far the corner went, as one number: right and down grow it, left and up shrink it */
export const growthOf = (dx: number, dy: number) => dx + dy;
/** the corner's thresholds, in px of growth from where the drag began */
export const GROW = { line: -24, tool: 64, block: 220 } as const;
/** the form a drag of the corner brings a block to, from the form it began in. One step at a time down (a block folds
 *  to a tool, a tool to a sticky, a sticky to a line); up as far as the hand goes, the block form only past the tool's. */
export function formAfter(from: Form, g: number): Form {
  const at = FORMS.indexOf(from);
  if (g <= GROW.line) return FORMS[Math.max(0, at - 1)];
  if (from === "line") return g >= -GROW.line ? "sticky" : "line";
  if (g >= GROW.block) return "block";
  if (g >= GROW.tool) return at < 2 ? "tool" : from;
  return from;
}

/** a tool picked while another is open is past a sticky's bounds: it offers to lift (two tools side by side are a block's) */
export const pastBounds = (b: Pick<Block2, "tool" | "form">, t: Tool) => b.form !== "block" && !!b.tool && b.tool !== t;

/** the ring's tone for a block's state (the stickies' own markOf reads a sticky closer; this is any block's) */
export type Tone = "fresh" | "run" | "you" | "fail" | "done" | "dim";
export function toneOf(state: string): Tone {
  switch (state) {
    case "filed": return "fresh";
    case "running": return "run";
    case "asks": return "you";
    case "failed": return "fail";
    case "done": return "done";
    default: return "dim";
  }
}

/** the shelf's three layers as pills: the folder's (inherited, read-only), its own (what its tools found), kept */
export type Shelf = { name: string; layer: "folder" | "own" | "kept" }[];
export function shelfOf(b: Pick<Block2, "folder" | "own" | "kept">, folders: Folder[] | undefined): Shelf {
  const f = folders?.find((x) => x.id === b.folder);
  return [...(f ? [{ name: f.name, layer: "folder" as const }] : []), ...b.own.map((o) => ({ name: o.name, layer: "own" as const })), ...b.kept.map((o) => ({ name: o.name, layer: "kept" as const }))];
}

/** what a refile swaps, in the words sticky.html says it */
export const swapLine = (to: string, from: string) => `now reads ${to}'s context · keeps its own shelf · forgets ${from}'s`;

/** the fan's five pills on a ring around the card's middle (sticky.html's fan, kept inside the card: the list it sits in
 *  clips anything outside it), the first at the top, then clockwise: each its offset from the centre, in px */
export function fanAt(w: number, h: number, n = TOOLS.length): { x: number; y: number }[] {
  const rx = Math.max(0, w / 2 - 44), ry = Math.max(36, h / 2 - 18);
  return Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; return { x: Math.round(Math.cos(a) * rx), y: Math.round(Math.sin(a) * ry) }; });
}

/** what a lifted block draws inside (#692, Marco 2026-11-08): a recipe with its own shape in the registry (shapes.ts)
 *  draws that shape, wide; one without (a sticky, a made recipe) draws a sticky's two tools side by side */
export function liftedInside(recipe: string, hasShape: (recipe: string) => boolean): "shape" | "tools" {
  return recipe !== "sticky" && hasShape(recipe) ? "shape" : "tools";
}
