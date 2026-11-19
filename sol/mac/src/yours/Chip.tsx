// Build becomes yours (#1089): the chip, the small picture of a tool of theirs. One drawing, three places: the offer
// above the box (dashed hairline: offered, not yet theirs), the line after a keep and each row of Build settings ›
// yours (solid hairline: theirs). It shows the tool's title and at most two blanks as hollow slots holding their last
// value, so the Sol user sees the thing, not a sentence about it. Kit only (Glass, curve, tokens).
import { useState, type ReactNode } from "react";
import { Glass, curve } from "../kit";
import { dim, ink, mute, on, textW } from "../kit/paint";
import { CURVE, SHADE, TYPE as T } from "../kit/tokens";

export type ChipBlank = { name: string; value: string };
const PAD = 10, GAP = 6, SLOT_PAD = 7, MAX_VALUE = 14;
/** a value too long for its slot: its first word when that fits (“Okafor & Co” is “Okafor”), else cut with … (pure) */
export const cut = (s: string, n = MAX_VALUE) => { if (s.length <= n) return s; const first = s.split(/\s+/)[0]; return first.length <= n ? first : `${s.slice(0, n - 1)}…`; };
/** a bare number says nothing alone: with its blank's name it does ("7 hours"; in a chip's slot "7 h"). A name the
 *  reader fell back to ("number", "name") is not said (pure) */
export const bare = (v: string) => /^\d+([.,]\d+)?$/.test(v.trim());
const known = (name: string) => !!name && !/^(number|name)( \d+)?$/.test(name);
/** a bare number never stands alone. A plural name is a unit and follows it ("7 hours"; short, a long unit is its first
 *  letter: "7 m" for minutes); any other name is what the number is, and leads ("order 4417") */
export const withName = (value: string, name: string, short = false) => {
  if (!bare(value) || !known(name)) return value;
  return /s$/.test(name) ? `${value.trim()} ${short && name.length > 5 ? name[0] : name}` : `${name} ${value.trim()}`;
};
/** a blank's slot says its last value; with none, its name (pure) */
export const slotWord = (b: ChipBlank) => cut(withName(b.value, b.name, true).trim() || b.name);

export function Chip({ title, blanks = [], kept = false, undone = false, h = 28, onPress, label, lead, leadW = 26 }: {
  title: string; blanks?: ChipBlank[]; kept?: boolean; undone?: boolean; h?: number; onPress?: () => void; label?: string;
  /** a small picture before the title (a layout's glyph: Look.tsx LayGlyph), and its width */
  lead?: ReactNode; leadW?: number;
}) {
  const [over, setOver] = useState(false);
  const shown = blanks.slice(0, 2), more = blanks.length - shown.length;
  const size = T.body[0], slotH = h - 10;
  const slots = shown.map((b) => ({ word: slotWord(b), w: Math.ceil(textW(slotWord(b), T.label[0])) + SLOT_PAD * 2 }));
  const moreW = more > 0 ? Math.ceil(textW(`+${more}`, T.label[0])) + GAP : 0;
  const w = PAD * 2 + (lead ? leadW + GAP : 0) + Math.ceil(textW(title, size, 500)) + slots.reduce((a, s) => a + s.w + GAP, 0) + moreW;
  const r = CURVE.radius.row, d = curve(w - 1, h - 1, r - 0.5, CURVE.smoothing, 0.5, 0.5);
  return (
    <button type="button" data-yours-chip={kept ? "kept" : "offer"} aria-label={label ?? title} onClick={onPress} disabled={!onPress}
      onPointerEnter={() => setOver(true)} onPointerLeave={() => setOver(false)}
      style={{ all: "unset", cursor: onPress ? "pointer" : "default", flex: "none", display: "inline-block", opacity: undone ? 0.45 : 1 }}>
      <Glass w={w} h={h} r={r} step={over && onPress ? "raised" : "card"} edge={0}>
        <svg width={w} height={h} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden>
          <path d={d} fill="none" stroke={on(kept ? SHADE.on.edge * 1.6 : over ? 0.5 : 0.32)} strokeWidth={1} strokeDasharray={kept ? undefined : "3 3"} />
        </svg>
        <span style={{ height: "100%", display: "flex", alignItems: "center", gap: GAP, padding: `0 ${PAD}px`, fontFamily: T.family, fontSize: size, whiteSpace: "nowrap" }}>
          {lead}
          <b style={{ fontWeight: 500, color: ink, textDecoration: undone ? "line-through" : undefined }}>{title}</b>
          {slots.map((s, i) => (
            <span key={i} style={{ width: s.w, height: slotH, flex: "none", display: "grid", placeItems: "center", boxSizing: "border-box", borderRadius: CURVE.radius.chip - 2,
              boxShadow: `inset 0 0 0 1px ${on(SHADE.on.edge)}`, color: dim, fontSize: T.label[0] }}>{s.word}</span>
          ))}
          {more > 0 && <span style={{ color: mute, fontSize: T.label[0] }}>+{more}</span>}
        </span>
      </Glass>
    </button>
  );
}
