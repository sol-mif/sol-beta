// The one list, drawn (root part 4; its rule and its split are collection.ts): what ranks is drawn in its order, with its
// reason when the place gives one; the rest is one count line, and a press on it opens the history, newest first, one
// heading a day. With nothing at all, the place's own empty line. A holder, a shelf or a folder passes its things, how
// they rank and how one is drawn; it adds no cap and no "+N more" of its own. Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { Fragment, useState, type ReactNode } from "react";
import { collect, type Ranking } from "./collection-state.ts";
import "./collection.css";

export type CollectionProps<T> = {
  items: readonly T[];
  ranking: Ranking<T>;
  keyOf: (x: T) => string;
  /** a drawn thing */
  draw: (x: T) => ReactNode;
  /** a thing in the opened history (defaults to draw) */
  drawRest?: (x: T) => ReactNode;
  /** the count line's words for n folded things, e.g. "6 done" */
  more: (n: number) => string;
  /** what an empty place says; nothing when it says nothing */
  none?: ReactNode;
  className?: string;
  label?: string;
};

export default function Collection<T>({ items, ranking, keyOf, draw, drawRest = draw, more, none, className, label }: CollectionProps<T>) {
  const [open, setOpen] = useState(false);
  const c = collect(items, ranking);
  if (!c.drawn.length && !c.rest.length) return <>{none ?? null}</>;
  return (
    <div className={`co${className ? ` ${className}` : ""}`} data-collection={label ?? ""}>
      {c.drawn.map((x) => {
        const why = ranking.why?.(x);
        return why ? <div key={keyOf(x)} className="co-it">{draw(x)}<small className="co-why">{why}</small></div> : <Fragment key={keyOf(x)}>{draw(x)}</Fragment>;
      })}
      {c.rest.length ? (
        <button type="button" className="co-count" data-co-count={c.rest.length} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span>{more(c.rest.length)}</span><i aria-hidden="true">{open ? "▾" : "▸"}</i>
        </button>
      ) : null}
      {open && c.rest.length ? (
        <div className="co-hist" data-co-history>
          {c.days.map((d) => (
            <section key={d.day} className="co-day" aria-label={d.day}>
              <h3>{d.day}</h3>
              <div className="co-its">{d.items.map((x) => <Fragment key={keyOf(x)}>{drawRest(x)}</Fragment>)}</div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
