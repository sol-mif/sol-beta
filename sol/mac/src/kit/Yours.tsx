// What the person picks for their own window (brand.md, Colour and The type, 2026-11-15, #1237; Customization, 11-04):
// the palette set the pieces wear, the cut headings and big numbers are set in, and the ground the window lies on. The
// jelly is none of these: it keeps its pure six (brand.md, Colour; rules.md 16), so a page that re-lights its pieces
// draws the body inside <Pure>. Read straight from tokens.json (palette.sets, palette.font.display, palette.ground) until
// tokens.mjs generates them into tokens.ts; nothing here holds a value of its own.
import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import tokens from "../../../design/system/tokens.json";
import { LitSet, TODAY, type Lit } from "./Accent";
import { GLASS, JELLY } from "./tokens";

// ---- the set (rule 15) ------------------------------------------------------------------------------------------------
type SetsJson = { default: string } & Record<string, { name: string; six: string[] } | string>;
const RAW = tokens.palette.sets as unknown as SetsJson;
export type PaletteSet = { id: string; name: string; six: readonly string[] };
/** the sets in tokens.json's order, the default (the brand's six softened) first */
export const SETS: readonly PaletteSet[] = Object.entries(RAW)
  .filter((e): e is [string, { name: string; six: string[] }] => typeof e[1] === "object" && Array.isArray((e[1] as { six?: unknown }).six))
  .map(([id, s]) => ({ id, name: s.name, six: s.six }));
export const DEFAULT_SET = RAW.default;
/** a set as the token set the kit's pieces read (Accent's Lit): its six as Sol's bands, the middle four as the warm run,
 *  the jelly's angle and softness, the one light */
export function litOf(id: string): Lit {
  const s = SETS.find((x) => x.id === id) ?? SETS.find((x) => x.id === DEFAULT_SET)!;
  return { jelly: { six: s.six, warm: s.six.slice(1, 5), angle: JELLY.angle, soft: JELLY.soft, veil: JELLY.veil }, light: GLASS.light };
}
/** the jelly's own set inside a re-lit window: its pure six, whatever the pieces wear (rule 16) */
export const Pure = ({ children }: { children: ReactNode }) => <LitSet value={TODAY}>{children}</LitSet>;

// ---- the cut (rule 23) ------------------------------------------------------------------------------------------------
const D = tokens.palette.font.display;
export type CutId = "display" | "rounded" | "newyork";
export type Cut = { id: CutId; name: string; family: string; weight: number; tracking: number };
/** SF Pro Display Black, the default; SF Pro Rounded and New York, the person's to pick (brand.md, The type) */
export const CUTS: readonly Cut[] = [
  { id: "display", name: "Display Black", family: D.value, weight: D.weight, tracking: D.tracking },
  { id: "rounded", name: "Rounded", family: `ui-rounded, "SF Pro Rounded", ${D.value}`, weight: D.weight, tracking: D.tracking * 0.75 },
  { id: "newyork", name: "New York", family: `ui-serif, "New York", "Iowan Old Style", Georgia, serif`, weight: D.weight, tracking: D.tracking * 0.5 },
];
const CutCtx = createContext<Cut>(CUTS[0]);
export const CutSet = CutCtx.Provider;
export const useCut = () => useContext(CutCtx);
/** the cut as css, for a heading or a big number */
export const cutStyle = (c: Cut): CSSProperties => ({ fontFamily: c.family, fontWeight: c.weight, letterSpacing: `${c.tracking}em` });
/** a heading in the person's cut (rule 23), tight, one line */
export function Display({ size, color, children, style }: { size: number; color: string; children: ReactNode; style?: CSSProperties }) {
  const c = useCut();
  return <span style={{ ...cutStyle(c), fontSize: size, lineHeight: 1.05, color, whiteSpace: "nowrap", ...style }}>{children}</span>;
}
/** a big number (rules 21, 23, 35): the zine's giant count, tabular, in the cut; play lives here, at the edge */
export function BigNum({ size, color, children, style }: { size: number; color: string; children: ReactNode; style?: CSSProperties }) {
  const c = useCut();
  return <span style={{ ...cutStyle(c), fontSize: size, lineHeight: 0.9, fontVariantNumeric: "tabular-nums", color, ...style }}>{children}</span>;
}

// ---- the ground -------------------------------------------------------------------------------------------------------
export type GroundId = "glass" | "cream";
/** what the person may lay the window on (palette.ground): black glass over the desk (the default) or cream paper */
export const GROUNDS: readonly { id: GroundId; name: string }[] = [
  { id: "glass", name: "black glass" },
  { id: "cream", name: "cream" },
];
