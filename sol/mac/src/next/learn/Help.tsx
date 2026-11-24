// Help, the session (BR1 #1615; mine/look/br1/learn.html part 3, Marco approved): one standing session in every Sol,
// opened from Help in the sidebar as a tab in the session view. Its head, "Help · knows how Sol works · never changes
// anything"; the questions to start from (Replay a walk ›, and the first-timer's words); what was asked and answered,
// each answer ending with "▶ Show me on my canvas" ({ walk, step } played on the person's own Sol, the Canvas brought to
// the front first) and "Replay <the walk>". The canvas bar talks to it while it is in front (To: Help, Next.tsx Pill).
// Replay a walk lists the six, a paused one with where it stopped. It explains and shows; it never changes anything.
// DOM hooks: [data-help], [data-help-q], [data-help-said], [data-help-show], [data-help-replay], [data-help-walks].
// Signed: marcocyl04-ux's agent (builder T-face), BR1 (#1615).
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { M, useNext } from "../cv/index.ts";
import type { Answer } from "./answers.ts";
import { H, helpAsk } from "./help-state.ts";
import { learnSub, learnVer, showMe, walkStart, walksListed } from "./learn-state.ts";
import { walkOf, type WalkId } from "./walks.ts";
import "./learn.css";

/** the Canvas to the front, then the walk: its steps point at the canvas's parts */
export function onCanvas(f: () => void): void {
  M.tabFront(null);
  requestAnimationFrame(() => requestAnimationFrame(f));
}
export const playShow = (s: { walk: string; step: number }) => onCanvas(() => showMe(s));
export const playWalk = (id: WalkId, step?: number) => onCanvas(() => walkStart(id, step, "help"));

/** an answer's words, Show me and Replay */
export function AnswerActs({ a }: { a: Answer }) {
  const r = a.replay ? walkOf(a.replay) : undefined;
  return (
    <span className="lr-acts">
      {a.show ? <button type="button" className="lr-show" data-help-show={`${a.show.walk}:${a.show.step}`} onClick={() => playShow(a.show!)}>▶ Show me on my canvas</button> : null}
      {r ? <button type="button" className="lr-alt" data-help-replay={r.id} onClick={() => playWalk(r.id, 0)}>Replay “{r.n}”</button> : null}
    </span>
  );
}

export default function HelpSession() {
  useNext(() => H.said.length + ":" + H.said.filter((s) => s.a).length);
  useSyncExternalStore(learnSub, learnVer, learnVer);
  const [walks, setWalks] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [H.said.length, H.said.filter((s) => s.a).length]);
  return (
    <div className="lr-help" data-help>
      <header className="lr-hh"><span className="lr-ht">Help</span><span className="lr-hst">knows how Sol works · never changes anything</span></header>
      <div className="lr-col">
        <div className="lr-qs">
          <button type="button" className={`lr-chip${walks ? " on" : ""}`} data-help-walks aria-expanded={walks} onClick={() => setWalks((w) => !w)}>Replay a walk ›</button>
          {H.starters.map((q) => <button key={q} type="button" className="lr-chip" data-help-q={q} onClick={() => helpAsk(q)}>{q}</button>)}
        </div>
        {walks ? <div className="lr-wlist" role="list" aria-label="The walks">
          {walksListed().map((w, i) => (
            <button key={w.id} type="button" role="listitem" className="lr-wrow" data-help-walk={w.id} onClick={() => { setWalks(false); playWalk(w.id); }}>
              <span className="lr-num" aria-hidden="true">{w.done ? "✓" : i + 1}</span><span className="lr-wn">{w.n}</span>
              <span className="lr-ws">{w.paused != null ? `stopped at step ${w.paused + 1} of ${w.steps}` : w.m}</span>
            </button>
          ))}
        </div> : null}
        {H.said.map((s, i) => (
          <div key={i} className="lr-said" data-help-said={i}>
            {s.q ? <div className="lr-me">{s.q}</div> : null}
            <div className={`lr-ai${s.failed ? " lr-failed" : ""}`} aria-live="polite">{s.a ? <>{s.a.text}<br /><AnswerActs a={s.a} /></> : <span className="lr-wait">Looking it up…</span>}</div>
          </div>
        ))}
        <div ref={end} />
      </div>
    </div>
  );
}
