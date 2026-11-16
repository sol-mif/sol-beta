// The notch (#701, sitting 7; desk_pin's successor): a block pinned there (the agent's place with `pin`, or your
// "notch" on its head) is a folded chip on the notch with its state dot; a click opens its session in Sol's window
// (renovation.ts askOpen, as a ping's Open does). The engine lists every pinned block (work.stage.pinned, blocks.ts
// pinnedAll); asked when the notch opens and every few seconds while it stays open. Nothing pinned: nothing drawn.
import { useEffect, useState } from "react";
import { askOpen } from "../renovation";
import "./stage.css";

export type Pinned = { project: string; sessionId: string; id: string; title: string; kind: string; state: string };
/** how often an open notch asks again */
const AGAIN_MS = 5000;

/** the chips' words (pure): the title, and the state when it is not plainly live */
export function pinWords(p: Pinned): string { return p.state === "live" ? p.title : `${p.title} · ${p.state}`; }

export function NotchPins({ open, ask }: { open: boolean; ask: () => Promise<{ pinned?: Pinned[]; error?: string }> }) {
  const [pins, setPins] = useState<Pinned[]>([]);
  useEffect(() => {
    if (!open) return;
    let gone = false;
    const once = () => void ask().then((r) => { if (!gone) setPins(Array.isArray(r.pinned) ? r.pinned : []); });
    once();
    const t = setInterval(once, AGAIN_MS);
    return () => { gone = true; clearInterval(t); };
  }, [open, ask]);
  if (!open || !pins.length) return null;
  return (
    <div className="st-notchpins" data-nopress>
      {pins.map((p) => (
        <button key={`${p.sessionId}/${p.id}`} type="button" className="st-chip" title="open its session"
          onClick={(e) => { e.stopPropagation(); askOpen({ seat: "claude", sessionId: p.sessionId, id: `pin:${p.sessionId}/${p.id}@${Date.now()}` }); }}>
          <span className={`st-dot ${p.state}`} />{pinWords(p)}
        </button>
      ))}
    </div>
  );
}
