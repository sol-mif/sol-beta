// Born at the content's size (#780, #751 B17), for the stage behind `stage.whole`: whole.md "arrival" (born at the
// size of its content: a list its rows, a page its measure of 412, a run wide) and "Engine changes" (no fixed pixels
// per kind; the judge gives the band, the face reports the content's size, the engine places on the real stage).
// Pure: the band a block is born in, its first size from its content, and the height it is fitted to once it has
// rendered (Stage.tsx measures it with Edges.ts fitOf).
import type { Kind, Size } from "./model.ts";
import { BLOCK_MIN, PAD } from "./geometry.ts";
import { BORN } from "../kit/feel.ts";

/** the judge's band (#821 sends it on the place; today's engine sends none): read at the measure, or the stage wide */
export type Band = "measure" | "wide";
const WIDE: Kind[] = ["terminal", "browser", "shots"];
export const bandOf = (kind: Kind, said?: unknown): Band => (said === "measure" || said === "wide" ? said : WIDE.includes(kind) ? "wide" : "measure");

/** the content's height, guessed from what the body holds: a list's rows and its foot; text by the lines it wraps to
 *  at the measure; anything else by none (the fit then finds it) */
export function contentGuess(kind: Kind, body: unknown, w: number): number {
  const b = (body ?? {}) as { steps?: unknown[]; text?: string; md?: string };
  if (kind === "list" && Array.isArray(b.steps)) return b.steps.length * BORN.row + BORN.listFoot;
  const text = typeof b.text === "string" ? b.text : typeof b.md === "string" ? b.md : "";
  if (!text) return 0;
  const per = Math.max(1, Math.floor((w - 2 * BORN.side) / BORN.ch));
  const lines = text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / per)), 0);
  return lines * BORN.line;
}

/** the size a block is born at: its band's width, its content's height (with its head and foot), inside the stage */
export function bornAt(stage: Size, kind: Kind, body: unknown, band?: unknown, left = 0): Size {
  const room = { w: stage.w - 2 * PAD - left, h: stage.h - 2 * PAD };
  // #954: a list is as wide as its rows (whole.html scene 5 draws it 300 wide), a page at its measure
  const w = bandOf(kind, band) === "wide" ? room.w : kind === "list" ? BORN.list : BORN.measure + 2 * BORN.side;
  const c = contentGuess(kind, body, w);
  const h = c ? BORN.head + c + BORN.foot : BLOCK_MIN.h;
  return { w: Math.round(Math.max(BLOCK_MIN.w, Math.min(w, room.w))), h: Math.round(fitH(h, stage)) };
}

/** the height a block is fitted to once its content has rendered (head and body as they are): never under block.min,
 *  never past the stage */
export const fitH = (measured: number, stage: Size) => Math.max(BLOCK_MIN.h, Math.min(Math.ceil(measured), stage.h - 2 * PAD));
