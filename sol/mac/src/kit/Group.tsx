// A group (#1879 step 0; decisions.md 2026-11-25, "always group of 4 or less", "keep it white"): a plain white group with a
// hairline, its label inside, at most 4 in a 2×2 grid. Past 4 it says "N more <word>" with one mark per folder the rest
// are in, and a press on it opens the rest; a group with no `more` word (Recent) shows its 4 and stops. Zero items: the
// group goes quiet but keeps its place.
import type { ReactNode } from "react";
import { Mark, type Paint } from "./Signs";
import "./parts.css";

/** how many a group shows: never more (decisions.md 2026-11-25) */
export const GROUP_FIT = 4;

export function Group<T>({ label, count, aside, items, render, more, paintOf, onMore, quiet, opened }: {
  label: string; count?: number; aside?: ReactNode; items: readonly T[]; render: (t: T, i: number) => ReactNode;
  /** the word after "N more": "live", or one and many ["folder", "folders"]; left out, the group shows its 4 and no more row (Recent) */
  more?: string | readonly [string, string]; paintOf?: (t: T) => Paint; onMore?: () => void;
  /** what the group says when it holds nothing */
  quiet?: string;
  /** the list "N more" opened: every item, no more row (decisions.md 2026-11-25: "a press lists all of them") */
  opened?: boolean;
}) {
  const fit = opened ? items.length : GROUP_FIT, shown = items.slice(0, fit), rest = items.slice(fit);
  const marks = paintOf ? [...new Set(rest.map(paintOf))] : [];
  return (
    <section className="kp-part kp-group" data-part={`group ${label}`}>
      <div className="kp-group-head">
        <span className="kp-label">{label}{count != null && <em>{count}</em>}</span>
        {aside && <span className="kp-group-aside">{aside}</span>}
      </div>
      {shown.length ? <div className="kp-grid">{shown.map(render)}</div> : quiet ? <div className="kp-group-quiet">{quiet}</div> : null}
      {rest.length > 0 && more != null && (
        <button className="kp-more" data-part={`${label}: more`} onClick={onMore}>
          <span>{rest.length} more {typeof more === "string" ? more : more[rest.length === 1 ? 0 : 1]}</span>
          <span className="kp-more-marks">{marks.map((p) => <Mark key={p} paint={p} size="tiny" />)}</span>
          <span className="kp-more-go">›</span>
        </button>
      )}
    </section>
  );
}
