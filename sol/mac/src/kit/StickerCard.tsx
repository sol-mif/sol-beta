// A sticker card (#1879 step 0; decisions.md 2026-11-25, depth and motion are sticker): pressed onto the page with a
// white cut edge, a hairline outside it and a tight shadow (--depth-rest). Hover peels it up 2px and -1° on its
// bottom-left corner as a second shadow fades in (--peeled, --depth-peel); a press presses it flat (--pressed). A card
// that holds a box (`flat`) doesn't peel: it nudges up and squeezes on a press. `tilt` is the angle it lands from when
// dealt in, `n` its place when a pane deals its cards in one after another (kp-deal). `hover` holds the hover look on (a still).
import type { CSSProperties, ReactNode } from "react";
import "./parts.css";

export function StickerCard({ flat, tilt = 0, n, hover, className, style, part, onClick, children }: {
  flat?: boolean; tilt?: number; n?: number; hover?: boolean; className?: string; style?: CSSProperties; part?: string; onClick?: () => void; children?: ReactNode;
}) {
  const cls = `kp-card ${flat ? "kp-flat" : "kp-peel"}${hover ? " kp-is-hover" : ""}${className ? ` ${className}` : ""}`;
  return (
    <div role="button" tabIndex={0} className={cls} data-part={part} style={{ ["--tilt" as string]: `${tilt}deg`, ...(n != null ? { ["--n" as string]: n } : {}), ...style }} onClick={onClick}
      onKeyDown={onClick && ((e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } })}>
      {children}
    </div>
  );
}
