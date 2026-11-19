// The window's moments, drawn in place (#845; the store and the wire are moments.ts).
//   MomentDot    beside a session's title in the side: one dot in the colour of its newest unseen moment (a second
//                behind it when there are more), until the session is opened
//   BarMoment    over the box: the jelly lights once as any moment lands (the halo's arriving), and the line says it.
//                The session in front: its line stays until it is seen (×, a press, or words sent in the session).
//                Another session: the line shows 4 s and folds; its row's dot keeps it. A press opens that session.
// No sound, no dock bounce, no count, no banner: the window is on his screen, so the moment lands here and only here.
import { useEffect, useRef, useState } from "react";
import { Body, haloDoing } from "../Body";
import { dotPaint, forSession, seen, useMoments, type Kind, type Moment } from "./moments";
import "./notify.css";

const WORD: Record<Kind, string> = { done: "your move", question: "asks you", permission: "waits on you", failed: "failed", green: "green", hand: "handed to you", stable: "new stable", ping: "ping" };
export const momentWords = (m: Moment) => m.line || WORD[m.kind];

export function MomentDot({ sessionId }: { sessionId?: string | null }) {
  useMoments();
  const mine = forSession(sessionId);
  if (!mine.length) return null;
  const last = mine[mine.length - 1];
  return (
    <span className="mo-dots" title={momentWords(last)} data-moment={last.kind}>
      {mine.slice(-2).reverse().map((m) => <i key={m.id} className="mo-dot" style={{ background: dotPaint(m.kind) }} />)}
    </span>
  );
}

const LIGHT_MS = 1400, FOLD_MS = 4000;
export function BarMoment({ live, onOpen }: { live: string | null; onOpen?: (sessionId: string) => void }) {
  const r = useMoments();
  const [lit, setLit] = useState(false);
  const [passing, setPassing] = useState<Moment | null>(null);
  const first = useRef(r.arrived);
  // a moment landed: the jelly lights once; another session's line passes for 4 s
  useEffect(() => {
    if (r.arrived === first.current || !r.last) return;
    first.current = r.arrived;
    setLit(true);
    const off = window.setTimeout(() => setLit(false), LIGHT_MS);
    let fold = 0;
    if (r.last.sessionId !== live) { setPassing(r.last); fold = window.setTimeout(() => setPassing(null), FOLD_MS); }
    return () => { window.clearTimeout(off); window.clearTimeout(fold); };
  }, [r.arrived]); // eslint-disable-line react-hooks/exhaustive-deps
  const front = forSession(live);
  const held = front[front.length - 1] ?? null;
  const gonePassing = passing && !r.moments.some((m) => m.id === passing.id) ? null : passing;
  const m = held ?? gonePassing;
  if (!m && !lit) return null;
  return (
    <div className={`mo-bar ${lit ? "lit" : ""}`} data-part="the bar's moment" aria-live="polite">
      <span className="mo-jelly" aria-hidden><Body size={16} state="settled" halo={haloDoing(lit ? "arriving" : "rest")} /></span>
      {m && <i className="mo-dot" style={{ background: dotPaint(m.kind) }} aria-hidden />}
      {m && (
        <button className="mo-line" tabIndex={-1} title={m.sessionId && m.sessionId !== live ? "open it" : "seen"}
          onClick={() => { if (m.sessionId && m.sessionId !== live) onOpen?.(m.sessionId); else seen(m.id); }}>
          {momentWords(m)}
        </button>
      )}
      {m && <button className="mo-x" tabIndex={-1} title="seen" aria-label="seen" onClick={() => { seen(m.id); setPassing(null); }}>×</button>}
    </div>
  );
}
