// The gather line (BR1 item 3, the calm screen, #1615): when more asks sit on the faces on screen than the screen holds
// presses for, they gather into one line in Middle's head, "N things here need you", and their pieces drop their own
// first press (plane.css .pl-gathered; it comes back on the piece's hover or focus). A press on the line opens their
// list beside it, each ask answered there as on its piece (AskRow); Esc, a second press or a press outside folds it.
// What is "on screen" and the cap are calm.ts's: an ask on a face drawn whole and in the view. Each row heads with who asks
// and where, as the Diary says it (F's diary/asks.ts askSaid), so the line and the Diary name an ask the same way.
// Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { useEffect, useLayoutEffect, useRef } from "react";
import { render, type Ask } from "../cv/index.ts";
import { Pop } from "../Overlay.tsx";
import { boxOf } from "../layers.ts";
import { askSaid } from "../diary/asks.ts";
import { AskRow } from "./Face.tsx";
import { gatherWords } from "./calm.ts";

let on = false;
const said = (a: Ask) => { const s = askSaid(a); return [s.who, s.where].filter(Boolean).join(" · "); };
const close = () => { if (on) { on = false; render(); } };

/** the line itself, inside Middle's head; its list a pop-up beside it */
export function Gather({ asks }: { asks: Ask[] }) {
  const btn = useRef<HTMLButtonElement>(null), box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!on) return;
    const key = (e: KeyboardEvent) => { if (e.key !== "Escape") return; e.preventDefault(); e.stopPropagation(); close(); btn.current?.focus(); };
    const down = (e: PointerEvent) => { const t = e.target as Element | null; if (!t?.closest?.("#pl-glist,.pl-gather")) close(); };
    addEventListener("keydown", key, true);
    addEventListener("pointerdown", down, true);
    return () => { removeEventListener("keydown", key, true); removeEventListener("pointerdown", down, true); };
  });
  // the list is placed (Pop) in the frame after its first draw, hidden until then: focus goes in once it shows
  useLayoutEffect(() => { if (on) requestAnimationFrame(() => box.current?.querySelector<HTMLElement>("button")?.focus()); }, [on]);
  useEffect(() => () => { on = false; }, []);   // gone (the asks fell under the cap, or Middle left): folded with it
  return (
    <>
      <button type="button" ref={btn} className="pl-gather" data-gather={asks.length} aria-haspopup="dialog" aria-expanded={on}
        onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); on = !on; render(); }}>
        <span className="nx-aura" aria-hidden="true" />{gatherWords(asks.length)}
      </button>
      {on ? (
        <Pop className="pl-glist" id="pl-glist" role="dialog" aria-label={gatherWords(asks.length)} ref={box} prefer="below"
          anchor={() => (btn.current ? boxOf(btn.current) : null)} onPointerDown={(e) => e.stopPropagation()}>
          {asks.map((a) => (
            <div key={a.id} className="pl-gi" data-gather-ask={a.id}>
              <div className="pl-gw">{said(a)}</div>
              <AskRow a={a} />
            </div>
          ))}
        </Pop>
      ) : null}
    </>
  );
}
