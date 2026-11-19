// The tray (#739; trayRules.ts says the rules): a hairline with a count at the stage's foot, folded by default. Opened (a
// press on the hairline, or a block dragged over it), it shows miniatures: the stage's own folded blocks in front,
// solid-small, then the project's other blocks as outlines, grouped by the session that made them. A miniature is the
// block's frame at 1/6 with its kind's mark (kinds/Mark.tsx, #738) and its title clipped in the head. A press on one
// brings it onto the stage; a drag puts it where it is let go (Stage.tsx owns the drag, it knows the stage's size).
import type { PointerEvent as RPointerEvent } from "react";
import { curve } from "../kit";
import { CURVE } from "../kit/tokens";
import { nameOf } from "./carry";
import { Mark } from "./kinds/Mark";
import { MINI, count, miniSize, type Group, type Mini } from "./trayRules";

export function Tray({ groups, open, over, dragging, onToggle, onPick, onLift }: {
  groups: Group[];
  /** shown open (pressed, or a block dragged near) */
  open: boolean;
  /** a block's head dragged over it: let go, it folds here */
  over: boolean;
  /** a block is being dragged on the stage: the hairline shows, even with nothing in the tray, so it can be dropped on */
  dragging: boolean;
  onToggle: () => void;
  /** a press on a miniature: onto the stage */
  onPick: (m: Mini) => void;
  /** a miniature's drag began: the stage follows it */
  onLift: (m: Mini, e: RPointerEvent<HTMLElement>) => void;
}) {
  const n = count(groups);
  if (!n && !over && !dragging) return null;
  return (
    <div className={`st-tray ${open || over ? "open" : ""} ${over ? "over" : ""}`} data-tray data-part="the tray">
      <button className="st-trayline" tabIndex={-1} onClick={onToggle} aria-expanded={open} aria-label={`the tray, ${n} artifact${n === 1 ? "" : "s"}`}>
        <span className="st-trayhair" aria-hidden /><span className="st-traycount">{n}</span><span className="st-trayhair" aria-hidden />
      </button>
      {(open || over) && (
        <div className="st-trayshelf">
          {groups.map((g) => (
            <div key={g.from ?? "here"} className={`st-traygroup ${g.from ? "" : "own"}`} title={g.from ? `made in "${nameOf(g.from)}"` : "folded here"} data-from={g.from ?? ""}>
              {g.minis.map((m) => <MiniFrame key={m.id} m={m} onPick={onPick} onLift={onLift} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniFrame({ m, onPick, onLift }: { m: Mini; onPick: (m: Mini) => void; onLift: (m: Mini, e: RPointerEvent<HTMLElement>) => void }) {
  const { w, h } = miniSize(m.kind);
  // the block's own curve at a sixth, on the half pixel so the hairline is crisp
  const d = curve(w - 1, h - 1, CURVE.radius.block * MINI, CURVE.smoothing, 0.5, 0.5);
  return (
    <div role="button" tabIndex={-1} className={`st-mini ${m.own ? "own" : ""} ${m.popped ? "popped" : ""}`} style={{ width: w, height: h }} data-mini={m.id} title={m.title}
      onPointerDown={(e) => { if (e.button === 0) onLift(m, e); }} onClick={() => onPick(m)}>
      <svg className="st-miniframe" width={w} height={h} aria-hidden><path d={d} /></svg>
      <span className="st-minihead"><Mark kind={m.kind} /><span className="st-minit">{m.title}</span></span>
    </div>
  );
}
