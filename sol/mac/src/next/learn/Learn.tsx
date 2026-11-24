// Tutorials, the views (BR1 #1615; mine/look/br1/learn.html draft 1, Marco approved; state in learn.ts, the walks in
// walks.ts):
//   EndCard   part 1: "You're in. Want a quick look around?" over the softened canvas, the six walks (the first lit,
//             each with its steps, ✓ once taken), Not now, and "Then: what Sol opens to ›"
//   LeadAsk   part 1 note 2: after the walks (or Not now), "When you open Sol, what do you want to see first?" with the
//             Settings › Start screen choices (movein/Lead.tsx CHOICES, seenFirst.ts setLead), then done
//   WalkTip   part 2: the dark tip pointing at the real part, the rest of the window softened, one lit ring round the
//             part; its pips, "n · the walk", Skip and Next. Doing the step moves it on; Esc pauses
// DOM hooks: [data-learn-card], [data-learn-walk], [data-learn-notnow], [data-learn-lead], [data-walk], [data-walk-step],
// [data-walk-next], [data-walk-skip]. Signed: marcocyl04-ux's agent (builder T-face), BR1 (#1615).
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { D, S, folderOrder, regionOf, useNext } from "../cv/index.ts";
import { tabShown } from "../cv/moves/tabs.ts";
import { boxOf, place, type Rect } from "../layers.ts";
import { CHOICES } from "../movein/Lead.tsx";
import { setLead } from "../movein/seenFirst.ts";
import { L, cardDone, learnSub, learnVer, notNow, walkNext, walkPause, walkSkip, walkStart, walksListed } from "./learn-state.ts";
import { walkOf, wordsOf, plural, type Here } from "./walks.ts";
import "./learn.css";

/** the person's own folders, in the canvas's order: a walk's examples */
export const ownNames = (): string[] => folderOrder().map((id) => regionOf(id)?.name).filter((n): n is string => !!n).slice(0, 3).map(String);

export default function Learn() {
  useSyncExternalStore(learnSub, learnVer, learnVer);
  if (L.walk) return <WalkTip />;
  if (L.card === "end") return <EndCard />;
  if (L.card === "lead") return <LeadAsk />;
  return null;
}

/** keys while a card is up: Esc is Not now, then done */
function useEsc(f: () => void) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); f(); } };
    addEventListener("keydown", k, true);
    return () => removeEventListener("keydown", k, true);
  }, [f]);
}

function EndCard() {
  const ws = walksListed(), any = ws.some((w) => w.done), first = ws.findIndex((w) => !w.done);
  const go = useRef<HTMLButtonElement>(null);
  useEffect(() => { go.current?.focus({ preventScroll: true }); }, []);
  useEsc(notNow);
  return (
    <div className="lr-dim" data-learn-card="end">
      <section className="lr-card" role="dialog" aria-modal="true" aria-labelledby="lr-h">
        <h2 id="lr-h" className="lr-h">You’re in. Want a quick look around?</h2>
        <p className="lr-say">Six short walks on your own folders, about a minute each. Skip any; they’re always in Help.</p>
        <div className="lr-list" role="list">
          {ws.map((w, i) => (
            <button key={w.id} ref={i === first ? go : undefined} type="button" role="listitem" className={`lr-walk${i === first ? " first" : ""}${w.done ? " done" : ""}`}
              data-learn-walk={w.id} onClick={() => walkStart(w.id, 0, "card")}>
              <span className="lr-num" aria-hidden="true">{w.done ? "✓" : i + 1}</span><span className="lr-wn">{w.n}</span><span className="lr-ws">{w.done ? "done" : plural(w.steps, "step")}</span>
            </button>
          ))}
        </div>
        <div className="lr-foot">
          <button type="button" className="lr-link" data-learn-notnow onClick={notNow}>{any ? "Done for now: the rest are in Help" : "Not now: I’ll find them in Help"}</button>
          <button type="button" className="lr-link" data-learn-then onClick={notNow}>Then: what Sol opens to ›</button>
        </div>
      </section>
    </div>
  );
}

function LeadAsk() {
  useEsc(cardDone);
  const pick = (l: (typeof CHOICES)[number]["id"]) => { setLead(l); cardDone(); };
  return (
    <div className="lr-dim" data-learn-card="lead">
      <section className="lr-card" role="dialog" aria-modal="true" aria-labelledby="lr-lh">
        <h2 id="lr-lh" className="lr-h">When you open Sol, what do you want to see first?</h2>
        <p className="lr-say">You can change it any time in Settings, under What you see first.</p>
        <div className="lr-list" role="radiogroup" aria-label="What you see first">
          {CHOICES.map((c, i) => (
            <button key={c.id} type="button" role="radio" aria-checked={false} className={`lr-walk${i === 0 ? " first" : ""}`} data-learn-lead={c.id} onClick={() => pick(c.id)}>
              <span className="lr-wt"><span className="lr-wn">{c.n}</span><small>{c.say}</small></span>
            </button>
          ))}
        </div>
        <div className="lr-foot"><button type="button" className="lr-link" data-learn-lead="keep" onClick={cardDone}>Keep it as it is</button></div>
      </section>
    </div>
  );
}

/** where a step points: the first of its parts drawn on screen, or null (the tip stands in the middle) */
function partOf(at: string[]): HTMLElement | null {
  for (const s of at) {
    let el: HTMLElement | null = null;
    try { el = document.querySelector<HTMLElement>(s); } catch { el = null; }
    if (el && el.getClientRects().length && !el.closest("[hidden]")) return el;
  }
  return null;
}
/** the softened window with the lit part left clear */
const hole = (b: Rect) => { const W = innerWidth, H = innerHeight; return `path(evenodd, "M0 0H${W}V${H}H0Z M${b.x} ${b.y}h${b.w}v${b.h}h${-b.w}Z")`; };
const here = (typed: boolean): Here => ({ dist: String(S.dist ?? ""), page: (S.page as string | null) ?? null, tab: !!tabShown(), typed, folders: D.regions.length });

function WalkTip() {
  const p = L.walk!, w = walkOf(p.id)!, s = w.steps[p.step];
  const [typed, setTyped] = useState(false);
  const start = useRef<Here | null>(null);
  // the view as it stands, read on every change: a step that asks for an action moves on once the person does it
  const now = useNext(() => JSON.stringify(here(typed)));
  useEffect(() => { start.current = JSON.parse(now) as Here; setTyped(false); }, [p.id, p.step]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = JSON.parse(now) as Here, was = start.current;
    if (s.did && was && !s.did(was) && s.did(h)) walkNext();
  }, [now, s]);
  // typing into the bar is the bar's step
  useEffect(() => {
    const i = (e: Event) => { if ((e.target as HTMLElement | null)?.id === "say") setTyped(true); };
    addEventListener("input", i, true);
    return () => removeEventListener("input", i, true);
  }, []);
  // Esc pauses the walk (heard before the shell's, so the step back is not taken too)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); walkPause(); } };
    addEventListener("keydown", k, true);
    return () => removeEventListener("keydown", k, true);
  }, []);
  // the lit part, measured after each draw and while the window changes
  const [box, setBox] = useState<Rect | null>(null);
  useLayoutEffect(() => {
    let f = 0;
    const look = () => { const el = partOf(s.at); const b = el ? boxOf(el) : null; setBox((o) => (o && b && o.x === b.x && o.y === b.y && o.w === b.w && o.h === b.h ? o : b)); f = requestAnimationFrame(look); };
    look();
    return () => cancelAnimationFrame(f);
  }, [s]);
  // the tip beside it, above when there is room (the drawing), inside the window; it stands over the softened window
  const tip = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<(Rect & { side: string }) | null>(null);
  useLayoutEffect(() => {
    const t = tip.current;
    if (!box || !t) { setAt(null); return; }
    const r = place(box, { w: t.offsetWidth, h: t.offsetHeight }, { x: 0, y: 0, w: innerWidth, h: innerHeight }, box.y > innerHeight / 2 ? "above" : box.x < innerWidth / 4 ? "right" : "below", 14);
    setAt((o) => (o && o.x === r.x && o.y === r.y && o.side === r.side ? o : r));
  }, [box, p.step, p.id]);
  const next = useRef<HTMLButtonElement>(null);
  useEffect(() => { next.current?.focus({ preventScroll: true }); }, [p.id, p.step]);
  const pips = w.steps.map((_, i) => <i key={i} className={i === p.step ? "on" : i < p.step ? "was" : ""} />);
  const last = p.step === w.steps.length - 1;
  const n = walksListed().findIndex((x) => x.id === w.id) + 1;
  const body = (
    <>
      <b className="lr-th">{s.head}</b>
      <p className="lr-tl">{wordsOf(s.line, ownNames())}</p>
      <div className="lr-tf">
        <span className="lr-pips" aria-label={`Step ${p.step + 1} of ${w.steps.length}`}>{pips}</span>
        <span className="lr-tw">{n} · {w.n}</span>
        <button type="button" className="lr-skip" data-walk-skip onClick={walkSkip}>Skip</button>
        <button type="button" ref={next} className="lr-next" data-walk-next onClick={walkNext}>{last ? "Done" : "Next"}</button>
      </div>
    </>
  );
  return (
    <div className="lr-walking" data-walk={w.id} data-walk-step={p.step}>
      <div className="lr-soft" aria-hidden="true" style={box ? { clipPath: hole(box) } : undefined} />
      {box ? <div className="lr-lit" aria-hidden="true" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} /> : null}
      <div ref={tip} className={`lr-tip${box ? "" : " lr-mid"}`} role="dialog" aria-label={`${w.n}, step ${p.step + 1}`} data-side={at?.side}
        style={box ? (at ? { left: at.x, top: at.y } : { visibility: "hidden" }) : undefined}>{body}</div>
    </div>
  );
}
