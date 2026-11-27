// A tab (#1879 steps 0 and 2; decisions.md 2026-11-25, "One rule for a tab", "⌘1–⌘9 go to the tabs from left to right"):
// an icon slot and a name; the tab in front sits on the ground. Colour = where (the icon filled with its folder's mark,
// white: in no folder), glyph = what (TabIcon), corner = how (asks: a solid amber dot; working: a turning green ring;
// failed: a red diamond). While ⌘ is held each slot shows its number in the same shell and colour, × steps aside
// (Tabs numbers them left to right, the Canvas ⌘1, up to 9). An AI's fresh tab has ✦ after its name; an automation its
// loop and name in the field's grey; the Canvas in front with a folder open says `Canvas › web`; +N is the folded tabs.
// useCmdHeld follows the key; `held` on Tabs overrides it (a still).
import { useEffect, useState } from "react";
import { Icon, TabIcon, type IconName } from "./icons";
import { Mark, type Paint } from "./Signs";
import "./parts.css";

export type Corner = "ask" | "run" | "bad";
export type TabItem = {
  id: string; label: string; icon?: IconName; paint?: Paint; front?: boolean;
  corner?: Corner; fresh?: boolean; pill?: string; crumb?: { label: string; paint?: Paint }; more?: number;
};

/** true while ⌘ is held down in this window; let go, or the window losing focus, ends it */
export function useCmdHeld(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === "Meta") setHeld(true); };
    const up = (e: KeyboardEvent) => { if (e.key === "Meta") setHeld(false); };
    const off = () => setHeld(false);
    addEventListener("keydown", down); addEventListener("keyup", up); addEventListener("blur", off);
    return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); removeEventListener("blur", off); };
  }, []);
  return held;
}

const CORNER: Record<Corner, string> = { ask: "asks you", run: "working", bad: "something failed" };
/** a tab's contents: the icon with its corner, the name, an automation's pill, ✦ and × (the real row wraps it in its own element) */
export function TabFace({ label, icon, paint, digit, corner, fresh, pill, crumb, close }: Omit<TabItem, "id" | "front" | "more"> & { digit?: number; close?: boolean }) {
  return (
    <>
      <span className="kp-tab-slot">
        <TabIcon name={icon ?? "page"} paint={paint} digit={digit} />
        {corner && <i className={`kp-corner kp-corner-${corner}`} title={CORNER[corner]} />}
      </span>
      <span className="kp-tab-name">{label}</span>
      {crumb && <span className="kp-crumb"><span className="kp-crumb-sep">›</span>{crumb.paint && <Mark paint={crumb.paint} size="tiny" />}<span>{crumb.label}</span></span>}
      {pill && <span className="kp-pill" title={`automation · ${pill}`}><Icon name="loop" className="kp-pill-i" />{pill}</span>}
      {fresh && <Icon name="ai" className="kp-ai" />}
      {close && <Icon name="close" small className="kp-tab-close" />}
    </>
  );
}

export function Tab({ id, front, digit, more, onPick, ...face }: TabItem & { digit?: number; onPick?: () => void }) {
  if (more != null) return <button className="kp-tab kp-more-tab" data-part="tab more" onClick={onPick}>+{more}{face.fresh && <Icon name="ai" className="kp-ai" />}</button>;
  return (
    <button className={`kp-tab${front ? " kp-front" : ""}`} data-part={`tab ${face.label}`} onClick={onPick}>
      <TabFace {...face} digit={digit} close={front && face.icon !== "canvas"} />
    </button>
  );
}

/** the tab row: digits 1–9 left to right while ⌘ is held (+N takes none) */
export function Tabs({ tabs, held, onPick }: { tabs: readonly TabItem[]; held?: boolean; onPick?: (id: string) => void }) {
  const cmd = useCmdHeld(), on = held ?? cmd;
  let n = 0;
  return (
    <nav className={`kp-part kp-tabs${on ? " kp-held" : ""}`} data-part="tabs">
      {tabs.map((t) => <Tab key={t.id} {...t} digit={t.more != null ? undefined : ++n <= 9 ? n : undefined} onPick={onPick && (() => onPick(t.id))} />)}
    </nav>
  );
}
