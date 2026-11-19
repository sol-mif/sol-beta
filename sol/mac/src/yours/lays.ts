// Build becomes yours (#1089), the look: a layout's words and its versions, pure (the designer's rule; Look.tsx draws it)

/** the stage's Talk without its history: where the talk stands and, in a column, its share of the room */
export type Lay = { dock: "left" | "right" | "bottom" | "full"; width?: number };
/** a layout to try, with the two or three words that say it (the glyph says it first) */
export type LayVersion = { lay: Lay; words: string };

/** the layout in the fewest words, for the chip's title and for a screen reader (pure) */
export const layTitle = (l: Lay) => (l.dock === "bottom" ? "Talk at the foot" : l.dock === "full" ? "Talk, the whole window" : `Talk on the ${l.dock}`);

/** the versions of a layout the Sol user set by hand: theirs first, then one step further the way they were going, then
 *  the dock that gives the most of what they were after (pure). They made the talk narrower (or only moved it): they
 *  want the stage, so "narrower" and "at the foot". They made it wider: they want to read, so "wider" and "the whole
 *  window". `read` and `floor` are the stage's own reading width and floor, as shares of the room */
export function laysOf(theirs: Lay, read = 0.36, floor = 0.24): LayVersion[] {
  const first: LayVersion = { lay: theirs, words: "as you leave it" };
  if (theirs.dock === "full") return [first];
  if (theirs.dock === "bottom") return [first, { lay: { dock: "right", width: floor }, words: "narrow, on the right" }, { lay: { dock: "left", width: floor }, words: "narrow, on the left" }];
  const w = theirs.width ?? read;
  if (w > read + 0.02) return [first, { lay: { dock: theirs.dock, width: Math.min(0.6, Math.round((w + 0.12) * 100) / 100) }, words: "wider" }, { lay: { dock: "full" }, words: "the whole window" }];
  const out = [first];
  if (w > floor + 0.08) out.push({ lay: { dock: theirs.dock, width: floor }, words: "narrower" });
  out.push({ lay: { dock: "bottom" }, words: "at the foot" });
  return out;
}

