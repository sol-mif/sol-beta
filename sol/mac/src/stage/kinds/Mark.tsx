// A kind's mark (v4 §4, #738): 16px, the kind's glyph on its colour (tokens.json material.colour mark-<kind>). Colour or
// pearl is one class on the stage's root, `marks-colour` | `marks-pearl` (stage.css); pearl wears the colour on hover.
import type { Kind } from "../model";

/** each kind's glyph, the design's (v4.html KIND) */
export const GLYPH: Record<Kind, string> = { page: "Aa", list: "≡", card: "▤", diff: "±", shots: "▣", browser: "↗", terminal: "›_", table: "⊞", system: "◎", session: "◐" , clock: "◷", systems: "⊚" };

export function Mark({ kind, onClick, label }: { kind: Kind; onClick?: () => void; label?: string }) {
  const g = GLYPH[kind] ?? GLYPH.page;
  // the glyph in the mark's own 16 units, so it sits at the design's size whatever the face's type does
  const inner = <svg viewBox="0 0 16 16" aria-hidden><text x="8" y="11.2" textAnchor="middle" fontSize={g.length > 1 ? 8 : 10}>{g}</text></svg>;
  return onClick
    ? <button className={`st-mark k-${kind}`} onClick={onClick} aria-label={label} title={label}>{inner}</button>
    : <span className={`st-mark k-${kind}`} aria-hidden>{inner}</span>;
}
