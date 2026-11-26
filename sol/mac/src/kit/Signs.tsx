// The frame's small signs (#1879 step 0; decisions.md 2026-11-24, round 3 rule 6: small marks carry meaning): a folder's
// mark in its gradient, the asks dot, a count. Tokens only (kit/parts.css).
import "./parts.css";

/** the seven folder paints, in the order a new folder takes them (decisions.md 2026-11-25: the gradient set is seven) */
export const PAINTS = ["api", "web", "infra", "home", "citrus", "rose", "pearl"] as const;
export type Paint = (typeof PAINTS)[number];
/** the paint for the folder at place i (0 first): the next token in the set, round again past seven */
export const paintAt = (i: number): Paint => PAINTS[((i % PAINTS.length) + PAINTS.length) % PAINTS.length];
/** a folder's window (the big gradient) and its mark (the small one), as css: each token by its whole name */
const WINDOWS: Record<Paint, string> = {
  api: "var(--gradient-api)", web: "var(--gradient-web)", infra: "var(--gradient-infra)", home: "var(--gradient-home)",
  citrus: "var(--gradient-citrus)", rose: "var(--gradient-rose)", pearl: "var(--gradient-pearl)",
};
const MARKS: Record<Paint, string> = {
  api: "var(--mark-api)", web: "var(--mark-web)", infra: "var(--mark-infra)", home: "var(--mark-home)",
  citrus: "var(--mark-citrus)", rose: "var(--mark-rose)", pearl: "var(--mark-pearl)",
};
export const windowOf = (p: Paint) => WINDOWS[p];
export const markOf = (p: Paint) => MARKS[p];

export function Mark({ paint, size }: { paint: Paint; size?: "s" | "tiny" }) {
  return <i className={`kp-mark${size ? ` kp-mark-${size}` : ""}`} style={{ background: markOf(paint) }} />;
}
export const Dot = () => <i className="kp-dot" />;
export const Count = ({ n }: { n: number }) => <em className="kp-count">{n}</em>;
