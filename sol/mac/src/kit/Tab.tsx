// A tab (#1879 step 0; decisions.md 2026-11-25, "⌘1–⌘9 go to the tabs from left to right"): an icon slot and a name; the
// tab in front sits on the ground. While ⌘ is held each tab's slot shows its number instead of its icon (Tabs numbers
// them left to right, the Canvas ⌘1, up to 9). useCmdHeld follows the key; `held` on Tabs overrides it (a still).
import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { Mark, type Paint } from "./Signs";
import "./parts.css";

export type TabItem = { id: string; label: string; icon?: IconName; paint?: Paint; front?: boolean };

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

export function Tab({ label, icon, paint, front, digit, onPick, after }: { label: string; icon?: IconName; paint?: Paint; front?: boolean; digit?: number; onPick?: () => void; after?: ReactNode }) {
  return (
    <button className={`kp-tab${front ? " kp-front" : ""}`} data-part={`tab ${label}`} onClick={onPick}>
      <span className="kp-tab-slot">
        {paint ? <Mark paint={paint} /> : <Icon name={icon ?? "page"} small />}
        {digit != null && digit <= 9 && <kbd className="kp-digit">{digit}</kbd>}
      </span>
      <span>{label}</span>
      {after}
    </button>
  );
}

/** the tab row: digits 1–9 left to right while ⌘ is held */
export function Tabs({ tabs, held, onPick }: { tabs: readonly TabItem[]; held?: boolean; onPick?: (id: string) => void }) {
  const cmd = useCmdHeld(), on = held ?? cmd;
  return (
    <nav className={`kp-part kp-tabs${on ? " kp-held" : ""}`} data-part="tabs">
      {tabs.map((t, i) => <Tab key={t.id} label={t.label} icon={t.icon} paint={t.paint} front={t.front} digit={i < 9 ? i + 1 : undefined} onPick={onPick && (() => onPick(t.id))} />)}
    </nav>
  );
}
