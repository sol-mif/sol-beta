// owned by slice 3 (Near), docs/port/slices.md
// Near (#1615, slice 3; the mockup's views/near.js, as it is): one piece filling the page. The head says what it is in
// words, who is followed, the keys, and what needs the person (⌘J); the body is the piece by its kind (Beside.tsx), or two
// with beside (⌘\). A split job's open part has its way back to the job above. Reads the store, presses moves.
// DOM hooks the counts read: data-front, data-m1, data-pane, data-terminal, data-copy, data-copyrow, data-ask.
// Signed: marcocyl04-ux's agent, slice 3 (#1615).
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { D, M, S, above, isFolderDiary, needWords, open, regionOf, useNext, viewSize, type Piece } from "../cv/index.ts";
import { JobNear } from "../lead/views.tsx";   // slice R7: a render point (requests/lead.md)
import { needsCount } from "../people/queue.ts";
import { Slot, type SlotProps } from "../slots.ts";
import { openPartOf, stateWords } from "./runs.ts";
import { closePart } from "../cv/moves/near.ts";
import { One, Side } from "./Beside.tsx";
import { Session } from "./Session.tsx";
const HelpSession = lazy(() => import("../learn/Help.tsx"));   // BR1 learn.html part 3   // BR1 port: the session's page
import { backTo, leaveDiary, popped } from "./diary.ts";   // BR1 slots: a folder's Diary up close, its ways out
import { tabShown } from "../cv/moves/tabs.ts";   // BR1 tabs (#1615): ⤢ takes the opened piece out to a tab
import { StarterCard } from "./Starter.tsx";   // Look 1 A3: the tab row's ＋ opens it as a tab
import { tintOf } from "../plane/layout.ts";   // a folder's own tint
import { FolderMark, RunPill, taskOf } from "../tabs/Label.tsx";   // BR1 (#1615): the head names the task, not the AI
import "./near.css";

const Kbd = ({ t }: { t: string }) => <span className="nr-kbd">{t}</span>;
const FOLD = ["school", "work", "life", "money"];

/** #view's width, kept as the window changes */
function useWidth(): number {
  const [w, setW] = useState(() => viewSize().w);
  useEffect(() => {
    const f = () => setW(viewSize().w);
    f(); addEventListener("resize", f);
    return () => removeEventListener("resize", f);
  }, []);
  return w;
}

export default function Near(_p: SlotProps) {
  useNext((d, s) => [s.piece, s.part, s.beside, s.keysSide, s.follow, s.askHere, s.askLine, d.pieces]);
  const W = useWidth();
  if (_p.part === "diary") return <CanvasDiary />;
  const job = S.piece ? D.pieces[S.piece] : undefined, part = openPartOf(), p = part || job;
  if (!p) return null;
  if (job && job.kind === "job" && !part) return <JobNear p={job} />;
  // the tab row's ＋ (Look 1 A3): a new tab is the start screen, the starter card itself, and no folder opens
  // BR1 port (#1615): a new session's tab is the session view itself, fresh; its first send starts it (session/Port.tsx).
  // Add's Automation keeps the card, which asks what and when
  if (!part && p.kind === "help") return <Suspense fallback={null}><HelpSession /></Suspense>;   // BR1 learn.html part 3: the Help session (builder T-face)
  if (!part && p.kind === "starter" && p.purpose !== "automation") return <Session p={p} page />;
  if (!part && p.kind === "starter") return <div className="nr-start" data-start-tab><StarterCard id={p.id} /></div>;
  if (!part && !S.beside && p.kind === "diary" && isFolderDiary(p.id)) return <DiaryNear p={p} width={W} />;
  // BR1 port (#1615, Marco 21:20): a session's page is the old face's session view, its own head and way back included
  if (!part && !S.beside && p.kind === "session" && !(p.parts && p.parts.length)) return <Session p={p} page />;
  const o = open(), lifeN = o.filter((a) => a.kind === "life").length;
  const b = S.beside ? D.pieces[S.beside] : undefined;
  const sw = Math.max(0, b ? (W - 32 - 14) / 2 : W - 32);
  const ri = Math.max(0, tintOf(p.region)), r = regionOf(p.region);   // the folder's own tint (plane/layout.ts)
  const st = p.kind === "session" ? stateWords(p) : null;
  const tag = r ? <span className={`nr-tag f-${FOLD[ri]}`}><span className="nr-dot" />{r.name}</span> : null;
  const fol = S.follow ? (() => {
    const ai = D.ais.find((a) => a.name === S.follow), fp = ai && D.pieces[ai.piece];
    const on = S.follow === "Ada" ? "editing session.ts (trail: auth.ts → session.ts)" : fp ? `on ${fp.copy || fp.name}` : "working";
    return <span className="nr-fol"><span className="nr-aura" />Following <b>{S.follow}</b> · {on}</span>;
  })() : null;
  // BR1 (#1615, Marco 11:51): a session is not its AI: the head is the task and its folder's mark (tabs/Label.tsx)
  const title = <><FolderMark p={part ? job || p : p} /><span>{part ? p.name : taskOf(p)}</span><RunPill p={p} /></>;
  const showTitle = p.kind === "session" || !!b;
  return (
    <div className={`nr${p.kind === "session" ? " sess" : ""}`}>
      <div className="nr-head">
        <div className="nr-who">
          {showTitle ? <div className="nr-title" data-m1="what">{title}</div> : null}
          <div className="nr-sub" data-m1={showTitle ? undefined : "what"}>{tag}{st ? <><b>{st.lead}</b>{st.more ? <span>· {st.more}</span> : null}</> : null}</div>
        </div>
        <div className="nr-right">{fol}
          {!part && !tabShown() ? <button className="nr-tabout" data-tabout title="Take it out to a tab" onClick={() => M.tabOpen(p.id, true)}>⤢ as a tab</button> : null}
          {!part && tabShown() === p.id ? <button className="nr-tabout" data-tabbeside title="Keep it open beside the canvas instead, the canvas live next to it (Esc)" onClick={() => M.besideFromTab(p.id)}>◧ Beside the canvas</button> : null}   {/* BR1 Q1 (builder E) */}
          <span className="nr-keys"><Kbd t="⌘↑" /> out · <Kbd t="⌘[" /> back · <Kbd t="⌘\" /> {b ? "close beside" : "beside"}</span>
          {o.length
            ? <button className="nr-needs" data-front data-m1="needs" title="Next ask, ⌘J" onClick={() => M.next()}><span data-m1="next">{needWords(above(), "chip", lifeN ? `${lifeN} from life` : "")}</span><Kbd t="⌘J" /><span className="n">{needsCount()}</span></button>
            : <span className="nr-needs none" data-front data-m1="needs">Nothing needs you<span className="n">0</span></span>}
        </div>
      </div>
      {part && job ? <button className="nr-back" onClick={() => closePart()}><Kbd t="⌘↑" /> {taskOf(job)} · part {(job.parts || []).indexOf(part) + 1} of {(job.parts || []).length}</button> : null}
      <div className={`nr-body${b ? " two" : ""}`}>
        <Side pid={part ? part.id : (S.piece as string)} main two={!!b} width={sw} />
        {b && S.beside ? <Side pid={S.beside} main={false} two width={sw} /> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- a folder's own Diary, up close (BR1 slots, #1615)
// The page in front of you, on its own: no keys line, no needs chip, nothing of because… (the Diary carries its own).
// Three ways out, each back to the folder or the canvas it opened from (the history, M.back; else one step out): Esc,
// the Back press at its top, and a press outside the page.

/** a press outside the page: on the ground around it, not on a pop-up drawn over it (those are outside this element) */
function useOutside(leave: () => unknown) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const x = el.current;
    if (!x) return;
    let skip = false;
    const down = (e: PointerEvent) => { skip = popped() || !!(e.target as Element | null)?.closest?.(".dy, .nr-dyback"); };
    const click = (e: MouseEvent) => { if (!skip && !(e.target as Element | null)?.closest?.(".dy, .nr-dyback")) leave(); skip = false; };
    x.addEventListener("pointerdown", down);
    x.addEventListener("click", click);
    return () => { x.removeEventListener("pointerdown", down); x.removeEventListener("click", click); };
  }, []);
  return el;
}
/** the canvas's Diary up close (first-timer line 4, BR1 #1615): the sidebar's Diary row opens it as a page, M.page("diary").
 *  The same three ways out as a folder's Diary, each back to the canvas: Back, Esc (Next.tsx's, for any page) and a press
 *  outside. The chip at Far still pans to the Diary on the canvas (M.toDiary) */
function CanvasDiary() {
  const el = useOutside(() => M.page(null));
  return (
    <div ref={el} className="nr nr-dy" data-diary-near="">
      <button type="button" className="nr-dyback" data-diary-back onClick={() => M.page(null)} title="Esc">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" /></svg>Back to all your folders
      </button>
      <div className="nr-dypage"><Slot name="diary" band="middle" part="page" /></div>
    </div>
  );
}
function DiaryNear({ p, width }: { p: Piece; width: number }) {
  const el = useOutside(leaveDiary);
  const to = backTo(p);
  return (
    <div ref={el} className="nr nr-dy" data-diary-near={p.region}>
      <button type="button" className="nr-dyback" data-diary-back onClick={leaveDiary} title="Esc">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" /></svg>Back to {to}
      </button>
      <div className="nr-dypage"><One pid={p.id} keysHere beside={false} width={Math.min(width - 32, 760)} /></div>
    </div>
  );
}
