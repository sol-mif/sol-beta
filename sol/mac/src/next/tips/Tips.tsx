// The tip of a first moment (tips.ts): one pop-up beside what just happened, in the pop-ups' layer (Overlay.tsx Pop):
//   keep   beside the pane's head (kept/Kept.tsx), on the canvas's side
//   tab    under the tab in front (tabs/Tabs.tsx)
//   esc    above the bar's To, while the bar talks to a session (cv/moves/talkto.ts addressee, its × and Esc) or replies
//          to the folder the hand points at (plane/raise.ts toOf, Esc)
// It takes no press. A press anywhere, Esc, its time, or its anchor gone (the pane closed, the tab left, the hand moved
// off) and it goes. Signed: marcocyl04-ux's agent (builder P9), BR1 (#1615).
import { useEffect, useState, useSyncExternalStore } from "react";
import { D, useNext } from "../cv/index.ts";
import { keptNow } from "../cv/moves/kept.ts";
import { tabShown } from "../cv/moves/tabs.ts";
import { addressee } from "../cv/moves/talkto.ts";
import { titleOf } from "../plane/layout.ts";
import { toOf, useHand } from "../plane/raise-state.ts";
import { Pop } from "../Overlay.tsx";
import type { Side } from "../layers.ts";
import { TIP, TIP_HAND, tipGone, tipNow, tipSub, type Moment } from "./tips-state.ts";
import "./tips.css";

const AT: Record<Moment, { sel: string; prefer: Side }> = {
  keep: { sel: ".kp .kp-h", prefer: "left" },
  tab: { sel: "#tabs .tb-tab.on:not(.tb-canvas)", prefer: "below" },
  esc: { sel: "#talk .nx-to.nx-to-on", prefer: "above" },
};
const elOf = (m: Moment) => document.querySelector<HTMLElement>(AT[m].sel);
const boxOf = (el: HTMLElement | null) => { const b = el?.getBoundingClientRect(); return b && b.width ? { x: b.left, y: b.top, w: b.width, h: b.height } : null; };

export default function Tips() {
  const m = useSyncExternalStore(tipSub, tipNow, () => null);
  useNext(() => `${keptNow()}|${tabShown()}|${addressee()}`);   // drawn again when the pane, the tab in front or the To changes
  useHand();                                      // and when the bar's To does
  // the moment's own press drew its anchor in the same turn: look for it once that is on screen
  const [seen, setSeen] = useState<Moment | null>(null);
  useEffect(() => { if (!m) { setSeen(null); return; } const r = requestAnimationFrame(() => setSeen(m)); return () => cancelAnimationFrame(r); }, [m]);
  const el = m && seen === m ? elOf(m) : null;
  useEffect(() => { if (m && seen === m && !el) tipGone(); });
  useEffect(() => {
    if (!m) return;
    const down = () => tipGone();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") tipGone(); };
    addEventListener("pointerdown", down, true);
    addEventListener("keydown", key, true);
    return () => { removeEventListener("pointerdown", down, true); removeEventListener("keydown", key, true); };
  }, [m]);
  if (!m || !el) return null;
  const t = TIP[m], hand = toOf(), sid = hand ? null : addressee(), who = hand?.name ?? (sid && D.pieces[sid] ? titleOf(D.pieces[sid]) : null);
  return (
    <Pop className="tp-tip" role="note" data-tip={m} anchor={() => boxOf(elOf(m))} prefer={AT[m].prefer} align="start">
      <b>{m === "esc" && who ? `You're talking to ${who}` : t.head}</b><span>{m === "esc" && hand ? TIP_HAND : t.line}</span>
    </Pop>
  );
}
