// The tab row, the window's top row (#1615 BR1 row 19, frame.html and keep.html; moves cv/moves/tabs.ts, engine
// next/tabs.ts): the Canvas tab first, always, its words the crumb while the canvas is in front (Canvas / newsletter, each step a way back; "Canvas" behind a tab), then one
// tab per piece taken out, "+N" for the tabs a narrow window cannot hold (its menu lists them), and ＋, a
// new session. The keys for here and Shortcuts sit at the row's right end on its hover (Next.tsx Top). Only the tab in front draws live (the view is Near on its piece); a tab
// behind is its task, its folder's mark and a status dot, so ten tabs cost about what one does. A press brings a tab to the front; × or a
// middle press closes it, and the piece is where it always was on the canvas; dragged down onto the canvas, it is put
// there, into a folder when dropped on one. An AI's tab is marked ✦ until it has been in front. Under the row: Sol's
// offer once a kind has been taken out four times today, and the line an AI leaves when it puts a tab of the person's
// back, with Undo. DOM hooks: #tabs, [data-tab], [data-tab-offer], [data-tab-undo]; a piece dragged onto #tabs opens
// there (plane/index.tsx).
// Signed: marcocyl04-ux's agent, BR1 tabs (#1615); the row on top, builder G.
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { D, M, asksOn, useNext, type Piece } from "../cv/index.ts";
import { TB, offerNow, tabShown, type Tab } from "../cv/moves/tabs.ts";
import { boxOf, room } from "../layers.ts";
import { Pop } from "../Overlay.tsx";
import { FolderMark, RunPill, taskOf } from "./Label.tsx";
import "./tabs.css";

/** a tab's title: the piece's task (a session is not its AI: no AI's name or face on a tab) */
const titleOf = taskOf;
/** the one status a tab behind keeps: asks you, working, or nothing */
function dotOf(p: Piece): { c: string; t: string } | null {
  if (asksOn(p.id).length) return { c: "ask", t: "asks you" };
  if (p.kind === "session" && p.term && !p.term.waiting) return { c: "run", t: "working" };
  if (p.state === "failing" || p.state === "bad") return { c: "bad", t: "something failed" };
  return null;
}

/** fold the tabs that do not fit into "+N": unhide every tab, then hide from the end of the row, never the
 *  one in front, until the row (its tabs, "+N" and ＋) fits; the answer is the folded tabs' ids, in the row's order */
function fitTabs(row: HTMLElement): string[] {
  const tabs = [...row.querySelectorAll<HTMLElement>(".tb-tab[data-tab]:not(.tb-canvas)")], more = row.querySelector<HTMLElement>(".tbar-more");
  for (const x of tabs) x.hidden = false;
  if (more) more.hidden = true;
  const over = () => row.scrollWidth > row.clientWidth + 1;
  if (!more || !over()) return [];
  more.hidden = false;
  const cut: HTMLElement[] = [];
  for (const x of [...tabs].reverse()) {
    if (!over()) break;
    if (x.classList.contains("on")) continue;
    x.hidden = true; cut.unshift(x);
  }
  const label = more.firstElementChild as HTMLElement | null;
  if (label) label.textContent = `+${cut.length}`;
  return cut.map((x) => x.dataset.tab!);
}

/** the window's top row (BR1 row 19, frame.html, keep.html): the Canvas tab, whose words are the crumb, then a tab per
 *  piece taken out, "+N" for those that do not fit, and ＋ New session; `children` sit at its right end (the keys) */
export default function Tabs({ crumb, children }: { crumb: ReactNode; children?: ReactNode }) {
  useNext(() => 0);
  const t = TB(), shown = tabShown(), offer = offerNow(), row = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; el: HTMLElement; moved: boolean } | null>(null);
  const swallow = useRef(false);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const [cut, setCut] = useState<string[]>([]);
  const [menu, setMenu] = useState(false);
  // the offer goes on any press outside it (BR1: it had sat over the session view's Change button), until the count
  // grows; set aside, not answered: it asks again then
  const [aside, setAside] = useState("");
  const offerKey = offer ? `${offer.kind}:${offer.n}` : "";
  useEffect(() => {
    if (!offerKey || aside === offerKey) return;
    const go = (e: Event) => { if (!(e.target as Element | null)?.closest?.("[data-tab-offer]")) setAside(offerKey); };
    document.addEventListener("pointerdown", go, true);
    return () => document.removeEventListener("pointerdown", go, true);
  }, [offerKey, aside]);
  const refit = () => { const r = row.current; if (!r) return; const c = fitTabs(r); setCut((was) => (was.join() === c.join() ? was : c)); };
  useLayoutEffect(refit);
  useEffect(() => {
    const r = row.current;
    if (!r || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(refit);
    ro.observe(r);
    const off = (e: MouseEvent) => { if (!(e.target as Element | null)?.closest?.("#tabmore,.tbar-more")) setMenu(false); };
    document.addEventListener("click", off, true);
    return () => { ro.disconnect(); document.removeEventListener("click", off, true); };
  }, []);

  const down = (e: RPointerEvent, id: string) => {
    if (e.button !== 0 || (e.target as Element).closest(".tb-x")) return;
    drag.current = { id, sx: e.clientX, sy: e.clientY, el: e.currentTarget as HTMLElement, moved: false };
    const mv = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 5) return;
      d.moved = true;
      d.el.style.translate = `${ev.clientX - d.sx}px ${ev.clientY - d.sy}px`;
      document.body.classList.toggle("tb-dropping", !!row.current && ev.clientY > boxOf(row.current).y + boxOf(row.current).h);
    };
    const up = (ev: PointerEvent) => {
      removeEventListener("pointermove", mv); removeEventListener("pointerup", up);
      const d = drag.current;
      drag.current = null;
      document.body.classList.remove("tb-dropping");
      if (!d) return;
      d.el.style.translate = "";
      if (!d.moved) return;
      swallow.current = true; setTimeout(() => { swallow.current = false; });
      // dropped on the canvas: below the row and inside the room a piece may take (layers.ts room(), the bar's band off)
      const b = row.current ? boxOf(row.current) : null, v = room();
      if (b && ev.clientY > b.y + b.h && ev.clientX >= v.x && ev.clientX <= v.x + v.w && ev.clientY <= v.y + v.h) M.tabDrop(d.id, ev.clientX - v.x, ev.clientY - v.y);
    };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  };
  const front = (id: string | null) => { if (!swallow.current) M.tabFront(id); };

  const tabs = t.tabs.filter((x) => D.pieces[x.id]);
  const undoP = t.undo ? D.pieces[t.undo.tab.id] : undefined;
  return (
    <header className="nx-top tbar" id="top" data-tabs-n={tabs.length}>
      <div className="tb-row" id="tabs" role="tablist" aria-label="Tabs" ref={row}>
        {/* the Canvas tab: in front, its words are the crumb, each step a way back; behind a tab, one press brings it to the front */}
        <div className={`tb-tab tb-canvas${shown ? "" : " on"}`} role="tab" aria-selected={!shown} tabIndex={shown ? 0 : -1} data-tab="canvas" title={shown ? "Canvas" : undefined}
          onClick={() => { if (shown) front(null); }} onKeyDown={(e) => { if (shown && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); front(null); } }}>
          <svg className="tb-mark tb-icon" viewBox="0 0 16 16" strokeWidth="1.4" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></svg>
          {shown ? <span className="nx-crumb" id="crumb"><span>Canvas</span></span> : crumb}
        </div>
        {tabs.map((x: Tab) => {
          const p = D.pieces[x.id], on = shown === x.id, dot = on ? null : dotOf(p), name = titleOf(p);
          return (
            <div key={x.id} className={`tb-tab${on ? " on" : ""}${x.fresh ? " fresh" : ""}`} role="tab" aria-selected={on} tabIndex={0} data-tab={x.id} title={name}
              onPointerDown={(e) => down(e, x.id)} onClick={() => front(x.id)}
              onAuxClick={(e) => { if (e.button === 1) M.tabClose(x.id); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); front(x.id); } }}>
              <FolderMark p={p} />
              <span className="tb-name">{name}</span>
              <RunPill p={p} />
              {x.fresh ? <span className="tb-ai" title="Your AI opened this tab">✦</span> : null}
              {dot ? <span className={`tb-dot ${dot.c}`} title={dot.t} /> : null}
              <button className="tb-x" aria-label={`Close ${name}; it stays on the canvas`} onClick={(e) => { e.stopPropagation(); M.tabClose(x.id); }}>×</button>
            </div>
          );
        })}
        <button ref={moreBtn} className="tb-tab tbar-more" hidden aria-haspopup="menu" aria-expanded={menu} title="The tabs that do not fit"
          onClick={(e) => { e.stopPropagation(); setMenu((m) => !m); }}><span>+0</span></button>
        <button className="tb-new" data-act="tabNew" data-new-session aria-label="New session" title="New session ⌘N">＋</button>
      </div>
      {children}
      {menu && cut.length ? (
        <Pop id="tabmore" className="tb-menu" role="menu" prefer="below" align="end" anchor={() => (moreBtn.current ? boxOf(moreBtn.current) : null)}>
          {cut.map((id) => { const p = D.pieces[id]; return p ? (
            <button key={id} className="nx-mv" role="menuitem" data-tabmore={id} onClick={(e) => { e.stopPropagation(); setMenu(false); M.tabFront(id); }}>
              <FolderMark p={p} /><span className="tb-name">{titleOf(p)}</span>
            </button>
          ) : null; })}
        </Pop>
      ) : null}
      {offer && aside !== offerKey ? (
        <div className={`tb-offer${shown ? " tb-low" : ""}`} role="status" data-tab-offer={offer.kind}>
          <span>{offer.says}</span>
          <div className="tb-btns">
            <button className="tb-yes" onClick={() => M.tabOffer(offer.kind, true)}>Yes, as tabs</button>
            <button onClick={() => M.tabOffer(offer.kind, false)}>Keep in place</button>
          </div>
        </div>
      ) : null}
      {t.undo && undoP ? (
        <div className={`tb-offer tb-undo${shown ? " tb-low" : ""}`} role="status" data-tab-undo>
          <span>✦ Your AI put “{titleOf(undoP)}” back on the canvas.</span>
          <div className="tb-btns"><button className="tb-yes" onClick={() => M.tabUndo()}>Undo</button><button onClick={() => M.tabUndoGone()}>OK</button></div>
        </div>
      ) : null}
    </header>
  );
}
