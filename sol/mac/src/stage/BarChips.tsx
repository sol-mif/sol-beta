// The bar's chips (#698, play.html's #ctx and #things): over the box, what you attached with a block's reference icon
// (#953: "on · the week › Thu", one chip each, × takes it off) and the ask split into things, one chip each with its number, title and kind, from two things up. A
// chip is dragged onto the stage to say where it lands (Stage.tsx shows its ghost and takes the drop); "· placed" once it
// has a slot. Composer draws this only on the stage's Home.
import { useLayoutEffect, useRef } from "react";
import { CHIP, CHIP_EVENT, detach, pointAt, useBar } from "./bar";
import { Mark } from "./kinds/Mark";

export function BarChips({ onClear, noOn }: { onClear?: () => void; /** #954: what you point at is the box's own token (OnToken) */ noOn?: boolean }) {
  const { on: all, things } = useBar(), on = noOn ? [] : all;
  // the room of one row is kept while nothing shows, so a hover or the first split never moves the stage above
  if (!on.length && things.length < 2) return <div className="st-bar" aria-hidden />;
  const drag = (i: number | null) => window.dispatchEvent(new CustomEvent(CHIP_EVENT, { detail: i }));
  return (
    <div className="st-bar">
      {on.length > 0 && (
        <div className="st-ctx">
          {on.map((o) => (
            <span key={`${o.id} ${o.part ?? ""}`} className="st-cchip t-label" title="attached to your next message: × takes it off">
              <span className="st-on-w">on</span>{o.words}
              <button tabIndex={-1} aria-label={`take ${o.words} off`} onClick={() => { detach(o); onClear?.(); }}>×</button>
            </span>
          ))}
        </div>
      )}
      {things.length > 1 && (
        <div className="st-things">
          {things.map((t, i) => (
            <span key={i} className={`st-thing ${t.slot ? "slotted" : ""}`} draggable data-i={i} title="drag it onto the stage: it lands there"
              onDragStart={(e) => { e.dataTransfer.setData(CHIP, String(i)); e.dataTransfer.effectAllowed = "move"; drag(i); }} onDragEnd={() => drag(null)}>
              <i>{i + 1}</i>{t.title}<i>{t.kind}</i>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** #954, stage.whole (whole.md "Pointing"; whole.html's .on-tok): what you point at is the sentence's first word, a
 *  token at the head of the box's words, the block's mark and its part. A press lets it go (as Esc does) */
export function OnToken({ onClear }: { onClear?: () => void }) {
  const { on, picked } = useBar();
  const me = useRef<HTMLButtonElement>(null);
  // the words start after it: the field's first line is indented by its width (home.css .wbox, --on-w)
  useLayoutEffect(() => {
    const t = me.current, field = t?.parentElement;
    if (!t || !field) return;
    field.style.setProperty("--on-w", `${t.offsetWidth}px`);
    return () => { field.style.removeProperty("--on-w"); };
  });
  if (!on.length) return null;
  return (
    <button ref={me} className="st-ontok" tabIndex={-1} title="what your words are about: press, or esc, to let it go" onMouseDown={(e) => e.preventDefault()} onClick={() => { pointAt([]); onClear?.(); }}>
      {on[0].kind && <Mark kind={on[0].kind} />}<span>{picked && on.length > 1 ? `${on.length} blocks picked` : on.map((o) => o.words).join(" · ")}</span>
    </button>
  );
}
