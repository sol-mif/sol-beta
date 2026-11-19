// The crossing card (fr-30, slice 1): the thing's own lower edge, never a second card. Ready: "→ <project> · <spot>
// Send  Keep in Home" (no Undo before Send: nothing has happened yet). Send: the card flies into the project's row in
// the sidebar and this edge becomes a chip, "✓ <title> · in <project>", with Undo and its 8-second ring. The black
// card's recipe: the black slab, the pearl words, the first answer filled.
import { useEffect, useRef } from "react";
import type { Thing } from "./store";

const SPOT: Record<string, string> = { plan: "Plan", space: "Space", artifacts: "Artifacts", automations: "Automations" };
export const spotName = (s: string) => SPOT[s] ?? s;
/** a project's mark: its initial on the slab (the creature's tones come with slice 2's tiles) */
export const PMark = ({ name }: { name: string }) => <span className="v3-pmark" aria-hidden>{(name.trim()[0] ?? "•").toUpperCase()}</span>;

const Tick = () => <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden><path d="M2.5 6.3 5 8.6l4.6-5.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export function CrossingFoot({ t, onSend, onKeep }: { t: Thing; onSend: () => void; onKeep: () => void }) {
  return (
    <div className="v3-cross edge" data-state={t.state}>
      <span className="v3-xto"><span className="arr">→</span>
        <span className="v3-dest"><PMark name={t.projectName} />{t.projectName}<span className="spot">· {spotName(t.spot)}</span></span>
      </span>
      <span className="grow" />
      <button className="v3-press ink" onClick={onSend} disabled={t.state === "sending"}>Send</button>
      <button className="v3-press ghost" onClick={onKeep} disabled={t.state === "sending"}>Keep in Home</button>
    </div>
  );
}

/** what Send leaves on the stage: one chip, Undo, the ring running out over 8 s */
export function SentChip({ t, onUndo, onSettle }: { t: Thing; onUndo: () => void; onSettle: () => void }) {
  const ring = useRef<SVGCircleElement>(null);
  const left = Math.max(0, (t.until ?? Date.now() + 8000) - Date.now());
  useEffect(() => {
    const id = window.setTimeout(onSettle, left);
    // the ring: full now, empty when Undo goes
    const c = ring.current;
    if (c) { c.style.transition = "none"; c.style.strokeDashoffset = String(44 * (1 - left / 8000)); requestAnimationFrame(() => requestAnimationFrame(() => { c.style.transition = `stroke-dashoffset ${left}ms linear`; c.style.strokeDashoffset = "44"; })); }
    return () => window.clearTimeout(id);
  }, [t.token]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="v3-cross sent" role="status">
      <span className="tick"><Tick /></span>
      <span className="sl"><b>{t.title}</b> · in {t.projectName}</span>
      <svg className="v3-ring" viewBox="0 0 18 18" aria-hidden><circle className="bg" cx="9" cy="9" r="7" /><circle ref={ring} className="fg" cx="9" cy="9" r="7" strokeDasharray="44" strokeDashoffset="0" /></svg>
      <button className="v3-press ghost" onClick={onUndo}>Undo</button>
    </div>
  );
}
