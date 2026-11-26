// The lid box (#1879 step 0; decisions.md 2026-11-25, Check in): a banded square whose band is a lid hinged at its left
// corner. On hover the lid lifts ajar (--lid-ajar) and the glyph inside rises; a press swings it open (--lid-open) as its
// list arrives; both on the overshoot curve (--overshoot). The drawing is the icon module's BoxGlyph; this moves it.
// BoxCard is the Check in card that holds it: a flat sticker card (no peel) with the count, the name and a hint on hover;
// at zero it goes quiet and keeps its place.
import { BoxGlyph, type BoxInside } from "./icons";
import { StickerCard } from "./StickerCard";
import "./parts.css";

/** the box alone; `open` holds it open (its list is showing), otherwise it follows the hover and press of the card around it */
export function BoxIcon({ inside, open }: { inside: BoxInside; open?: boolean }) {
  return <span className={`kp-check-box${open ? " kp-open" : ""}`}><BoxGlyph inside={inside} /></span>;
}

export function BoxCard({ inside, name, n, hint, open, hover, tilt, onOpen }: {
  inside: BoxInside; name: string; n: number; hint: string; open?: boolean; hover?: boolean; tilt?: number; onOpen?: () => void;
}) {
  return (
    <StickerCard flat hover={hover} tilt={tilt} part={`check in: ${name}`} onClick={onOpen}
      className={`kp-part kp-check${open ? " kp-open" : ""}${n === 0 ? " kp-zero" : ""}`}>
      <span className="kp-check-top"><BoxGlyph inside={inside} /><b>{n}</b></span>
      <span className="kp-check-name">{name}</span>
      <span className="kp-tip">{hint}</span>
    </StickerCard>
  );
}
