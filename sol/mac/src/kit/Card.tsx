// A card (#674, look.md: corners): glass at the card's shade on the continuous curve, its corner the soft 26 (card c,
// Marco's pick, the token CURVE.radius.card; tight and between are its alternates). The inside is the card's own. With no
// `h` it grows with what it holds (#647); a card that floats over the talk (a picker's, the context's) is the pop step,
// so the words under it never read through: its shade, and the window's blur under it (the shade alone let them through).
import type { CSSProperties, ReactNode } from "react";
import { Glass } from "./Glass";
import { CURVE, SHADE, type Step } from "./tokens";

export function Card({ w, h, step = "card", style, children }: { w: number; h?: number; step?: Step; style?: CSSProperties; children?: ReactNode }) {
  const blur = step === "pop" ? SHADE.blur : undefined;
  if (h !== undefined) return <Glass w={w} h={h} r={CURVE.radius.card} step={step} blur={blur} style={style}>{children}</Glass>;
  return (
    // the blur on the card's own box: inside it (its glass lies at -1 in an isolated group) the blur finds nothing behind
    <div style={{ position: "relative", isolation: "isolate", width: w, ...(blur ? { backdropFilter: `blur(${blur}px)`, WebkitBackdropFilter: `blur(${blur}px)`, borderRadius: CURVE.radius.card } : {}), ...style }}>
      <Glass r={CURVE.radius.card} step={step} />
      {children}
    </div>
  );
}
