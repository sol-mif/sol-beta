// The session's room (#734, v4 §2 and rules 1, 2, 6): the talk, one block every session has, docked beside the stage.
// The talk is the session's whole chat (WorkTalk: your words, the agent's answers, its tool lines folded into one steps
// line, the cards) with the box at its foot; it cannot be closed, folded or covered, and its box never scrolls out of
// view. It docks left (the default, a column at reading width, 64ch, never under 44ch), right, bottom (a row holding the
// last exchange and the box, 200 px, rising while you write) or full (the talk alone, the blocks as chips at its foot).
// The stage (Stage.tsx) is the room beside it: a block arriving takes a slot there, never the talk's room.
//   drag the seam           the talk's width (left, right); kept in stage.json as a share of the room
//   the four glyphs         dock left, right, bottom, full
//   drag the talk's head    the four dock ghosts; the nearest lights; let go docks there
//   ⌘⇧← ⌘⇧→ ⌘⇧↓            dock left, right, bottom; ⌘↑ full; ⌘↓ back to the dock before; ⌘J the box; ⌘↵ sends
// The dock and width live in the session's stage.json (`talk: { dock, width, was }`, model.ts Talk), written through the
// store's place like any layout. The lenses (#701, lens.ts): CLI is the talk full until a block asks; IDE lays the file
// column at the stage's left. The jelly's layer covers the stage alone, so a block's place is the jelly's box; its home
// is the stage's foot (useJelly.ts).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { stageWhole } from "../flag";   // B15, #891
import { FOOT } from "../kit/feel";   // B25
import { JellyLayer } from "../Body";
import { useSize } from "../kit";
import { follow, type Follow, dur } from "../motion";
import { Orb } from "../Orb";
import type { Item } from "../work/useWork";
import { Stage } from "./Stage";
import { fixtureAsked, pour } from "./fixture";
import { useJelly } from "./useJelly";
import { barSession, wordsIn } from "./bar";
import { StartLines } from "./StartLines";
import type { StageStore } from "./store";
import { cliAsks } from "./lens";
import { footHeight } from "./model";
import { useUserLens } from "./userLens";   // #954: the lens, one setting of yours
import { TYPE } from "../kit/tokens";
import { DEFAULT_TALK, DOCK_GHOSTS, TALK, roomFor, dockBack, dockTo, lastExchange, nearestDock, seamShare, talkRow, talkWidth, type Dock, type Talk } from "./model";

/** what the talk's head says of its dock, on hover, and the toast a dock says once */
const DOCK_WORDS: Record<Dock, [string, string]> = {
  left: ["docked left", "the talk left, at reading width"],
  right: ["docked right", "the talk right"],
  bottom: ["docked at the foot", "the talk a row at the foot; it rises while you write"],
  full: ["full · the blocks are chips at its foot", "the talk full · ⌘↓ brings the stage back"],
};
const GHOST_WORDS: Record<Dock, string> = { left: "left", right: "right", bottom: "bottom", full: "full  ⌘↑" };
const GLYPHS: [Dock, string, ReactNode][] = [
  ["left", "dock left · ⌘⇧←", <rect key="f" className="f" x="1.5" y="1.5" width="4" height="8" rx="1" />],
  ["right", "dock right · ⌘⇧→", <rect key="f" className="f" x="7.5" y="1.5" width="4" height="8" rx="1" />],
  ["bottom", "dock at the foot · ⌘⇧↓", <rect key="f" className="f" x="1.5" y="6" width="10" height="3.5" rx="1" />],
  ["full", "the talk full · ⌘↑", <rect key="f" className="f" x="1.5" y="1.5" width="10" height="8" rx="1" />],
];

export function StageColumn({ store, session, items, busy, talk, box, writing, onType, onSend, files, empty }: {
  store: StageStore; session: string; items: Item[]; busy: boolean;
  /** the session's chat drawn (WorkTalk) for the items the dock shows: all of them, or the bottom dock's last exchange */
  talk: (items: Item[]) => ReactNode;
  /** the box (Composer), at the talk's foot */
  box: ReactNode;
  /** words are in the box: the bottom dock rises while they are */
  writing: boolean;
  /** ⌘J: the focus to the box */
  onType: () => void;
  /** ⌘↵ from anywhere: the box's words go */
  onSend?: () => void;
  /** the IDE lens's file column (Home's FilePane, search first) */
  files?: ReactNode;
  /** #954, stage.whole: what the talk shows before anything is said (whole.html scene 1: where you left off) */
  empty?: ReactNode;
}) {
  const seen = useSyncExternalStore(useCallback((f: () => void) => store.subscribe(session, f), [store, session]), () => store.read(session));
  const lens = seen.stage.lens ?? "app";
  // #954, stage.whole: the lens is yours, picked once in Settings; a stage that opens in another is laid in yours
  const mine = useUserLens();
  useEffect(() => {
    if (!stageWhole() || seen.ready === false || (seen.stage.lens ?? "app") === mine) return;
    store.place(session, { ...store.read(session).stage, lens: mine });
  }, [mine, seen.ready, seen.stage.lens, session, store]);
  const live = seen.blocks.filter((b) => b.state !== "dead");
  const asks = lens === "cli" && cliAsks(live, seen.stage.blocks);
  const kept: Talk = seen.stage.talk ?? DEFAULT_TALK;
  // CLI: the talk alone until a block asks; then the stage opens for it beside the talk where it is docked
  const asked: Dock = lens === "cli" && !asks ? "full" : kept.dock;
  useEffect(() => { barSession(session); }, [session]);

  const room = useRef<HTMLDivElement>(null), probe = useRef<HTMLSpanElement>(null);
  const [W, H] = useSize(room);
  const [ch, setCh] = useState(8);
  // a ch in px: ten zeros at the talk's type, measured again when they change size (the face's font arrives after the
  // first frame), so 64ch is the font's 64ch from the moment it draws
  useLayoutEffect(() => {
    const el = probe.current;
    if (!el) return;
    const read = () => { const w = el.getBoundingClientRect().width; if (w) setCh(w / 10); };
    read();
    const o = new ResizeObserver(read);
    o.observe(el);
    return () => o.disconnect();
  }, []);
  // the seam while dragged: shown at once, written when let go
  const [dragW, setDragW] = useState<number | null>(null);
  // before the room is measured: reading width, so the stage is never first laid out on a room the talk then takes back
  // #891, behind stage.whole: the talk yields width as blocks open
  const open = seen.stage.blocks.filter((p) => !p.folded && !p.popped && live.some((b) => b.id === p.id)).length;
  const width = W ? talkWidth(W, ch, dragW ?? kept.width, stageWhole() ? open : undefined) : TALK.read * ch;
  // the talk's scroller, here so the foot can read its padding (#891); it follows its end below
  const scroller = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  const headAt = useRef<HTMLDivElement>(null), boxAt = useRef<HTMLDivElement>(null);
  const [, headH] = useSize(headAt), [, boxH] = useSize(boxAt);
  const row = talkRow(H || 1, writing);
  // the talk's own padding above and below its words counts too: without it two lines were one, cut (#891)
  const padY = (() => { const t = scroller.current; if (!t) return 0; const c = getComputedStyle(t); return parseFloat(c.paddingTop) + parseFloat(c.paddingBottom); })();
  const height = stageWhole() && boxH ? footHeight(row, headH, boxH + padY, TYPE.read[1]) : row;   // #891
  // a room too small for the stage beside the talk at its floor (a narrow window, a pane open): the talk shows full, the
  // blocks as chips, until there is room again; stage.json keeps the dock asked
  const dock: Dock = W && H && !roomFor(asked, W, H, width, height) ? "full" : asked;   // B25 under stage.whole: full keeps the stage as a foot row

  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), dur("pour") * 2); return () => clearTimeout(t); }, [toast]);
  const keep = (t: Talk) => store.place(session, { ...store.read(session).stage, talk: t });
  const setDock = (d: Dock) => { const now = store.read(session).stage.talk ?? DEFAULT_TALK; if (d === now.dock) return; keep(dockTo(now, d)); setToast(DOCK_WORDS[d][1]); };
  const back = () => { const now = store.read(session).stage.talk ?? DEFAULT_TALK; if (now.dock !== "full") return; const b = dockBack(now); keep(b); setToast(DOCK_WORDS[b.dock][1]); };

  // the fixture, once, on a stage the engine says is empty (What to try with no agent: ?stage=fixture)
  const poured = useRef(false);
  useEffect(() => store.subscribe(session, () => {
    const s = store.read(session);
    if (poured.current || !fixtureAsked() || s.ready === false || s.blocks.length) return;
    poured.current = true;
    void pour(store, session);
  }), [store, session]);
  useEffect(() => { const s = store.read(session); if (!poured.current && fixtureAsked() && s.ready && !s.blocks.length) { poured.current = true; void pour(store, session); } }, [store, session]);

  // the keys, answered before Home's: the docks, full and back, the box, send
  const keys = useRef({ setDock, back, onSend, onType, full: dock === "full" });   // B25: full
  keys.current = { setDock, back, onSend, onType, full: dock === "full" };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = keys.current, meta = e.metaKey || e.ctrlKey;
      if (stageWhole() && e.key === "Escape" && !meta && k.full) { e.preventDefault(); e.stopImmediatePropagation(); k.back(); return; }   // B25: Esc brings the stage back
      if (!meta || e.altKey) return;
      const took = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (e.key === "Enter" && k.onSend) { took(); k.onSend(); return; }
      if (e.key.toLowerCase() === "j" && !e.shiftKey) { took(); k.onType(); return; }
      // an arrow in a field with words in it moves in the words (⌘⇧← selects to the line's start); in an empty one it docks
      if (wordsIn(e.target)) return;
      if (e.shiftKey && e.key === "ArrowLeft") { took(); k.setDock("left"); }
      else if (e.shiftKey && e.key === "ArrowRight") { took(); k.setDock("right"); }
      else if (e.shiftKey && e.key === "ArrowDown") { took(); k.setDock("bottom"); }
      else if (!e.shiftKey && e.key === "ArrowUp") { took(); k.setDock("full"); }
      else if (!e.shiftKey && e.key === "ArrowDown") { took(); k.back(); }
    };
    window.addEventListener("keydown", down, true);
    return () => window.removeEventListener("keydown", down, true);
  }, []);

  // the seam: the talk's edge beside the stage follows the pointer, held to its floors; kept when let go
  const onSeam = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (dock !== "left" && dock !== "right")) return;
    e.preventDefault();
    const el = e.currentTarget, r = room.current!.getBoundingClientRect();
    el.setPointerCapture(e.pointerId);
    let share: number | null = null;
    const mv = (ev: PointerEvent) => { share = seamShare(dock, r.width, ch, ev.clientX - r.left); setDragW(share); };
    const up = () => {
      el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
      if (share !== null) { keep({ ...(store.read(session).stage.talk ?? DEFAULT_TALK), width: share }); setToast(`the talk ${Math.round(talkWidth(r.width, ch, share) / ch)}ch wide`); }
      setDragW(null);
    };
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  };

  // the head lifted: the four dock ghosts over the room, the nearest lit; let go, the talk docks there
  const [lifted, setLifted] = useState<Dock | null>(null);
  const onHead = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    const el = e.currentTarget, r = room.current!.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
    el.setPointerCapture(e.pointerId);
    let near: Dock | null = null;
    const mv = (ev: PointerEvent) => {
      if (near === null && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      near = nearestDock((ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height);
      setLifted(near);
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
      setLifted(null);
      if (near && ev.type === "pointerup") setDock(near);
    };
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  };

  // the talk follows its end; it jumps when the session opens or the dock changes, and the orb glides it back
  const [flw, setFlw] = useState<Follow | null>(null);
  useLayoutEffect(() => {
    if (!scroller.current || !inner.current) return;
    const f = follow(scroller.current, inner.current);
    setFlw(f); f.jump();
    return () => { f.destroy(); setFlw(null); };
  }, [session, dock]);

  // the jelly: its layer covers the stage alone (a block's place is its box), its home the stage's foot
  const stageBox = useRef<HTMLDivElement>(null), rest = useRef<HTMLSpanElement>(null);
  const jelly = useJelly(stageBox, rest);
  // the stage moved or changed size (a dock, the seam, the window): the jelly is at once where it belongs on the stage as
  // it is now, by the block that waits on you, else home; its springs keep the stage's px, not the window's. Watched on
  // the stage's own box, every frame it changes: the talk eases its width (.st-talk's transition), so the stage is still
  // changing size after the room and the talk's width have settled, and a jump read once would leave the jelly where the
  // stage's foot was mid-ease (#926)
  const where = useRef({ seen, jelly });
  where.current = { seen, jelly };
  useLayoutEffect(() => {
    const el = stageBox.current;
    if (!el) return;
    const o = new ResizeObserver(() => {
      const { seen: s, jelly: j } = where.current;
      const w = s.blocks.find((b) => b.state === "waits" && s.stage.blocks.some((p) => p.id === b.id && !p.folded));
      j.jump(w && s.stage.blocks.find((x) => x.id === w.id));
    });
    o.observe(el);
    return () => o.disconnect();
  }, []);
  // the project's runs, folded: their chip sits in the talk's head (#703)
  const [chipAt, setChipAt] = useState<HTMLSpanElement | null>(null);

  const said = dock === "bottom" ? lastExchange(items) : items;
  const chips = dock === "full" && !stageWhole() ? live.filter((b) => seen.stage.blocks.some((p) => p.id === b.id)) : [];
  return (
    <div ref={room} className={`st-room ${stageWhole() ? "whole" : ""} ${lens} ${asks ? "asks" : ""} ${lifted ? "lifting" : ""} ${dragW !== null ? "seaming" : ""}`} data-dock={dock} data-lens={lens}
      style={{ "--st-talkw": `${width}px`, "--st-talkh": `${height}px`, "--st-fullw": `${FOOT.talk}px`, "--st-foot": `${FOOT.pad}px` } as React.CSSProperties}>{/* B25: the talk full's column and the row under it */}
      <section className="st-talk" data-part="the talk" aria-label="the talk">
        {/* #954: whole.html draws the talk with no head: no title, no dock words, no dock buttons (the keys stay) */}
        {!stageWhole() && <div className="st-talkhead" ref={headAt} onPointerDown={onHead}>
          <span className="st-talkmk" aria-hidden />
          <b>the talk</b>
          <span className="st-talkmeta">{lens === "cli" && !asks ? "CLI · the stage opens when a block asks" : stageWhole() && dock === "full" ? "full · ⌘↓, Esc or a press on a block brings the stage back" : DOCK_WORDS[dock][0]}{/* B25 */}</span>
          <span className="st-runchips" ref={setChipAt} />
          <span className="st-docks">
            {GLYPHS.map(([d, t, f]) => (
              <button key={d} tabIndex={-1} className={dock === d ? "on" : ""} title={t} aria-label={t} aria-pressed={dock === d} onClick={() => (d === "full" && dock === "full" ? back() : setDock(d))}>
                <svg viewBox="0 0 13 11" aria-hidden><rect x=".6" y=".6" width="11.8" height="9.8" rx="2" />{f}</svg>
              </button>
            ))}
          </span>
        </div>}
        <div className="st-talkwrap">
          <div className="talk" ref={scroller}>
            <div className="talk-inner" ref={inner}>
              {dock !== "bottom" && <StartLines store={store} session={session} />}
              {said.length ? talk(said) : stageWhole() ? (empty ?? null) : <p className="wpempty">{busy ? "" : "nothing said yet. Ask for one thing, or three at once."}</p>}{/* #954: the empty talk says nothing, or where you left off */}
            </div>
          </div>
          <Orb f={flw} />
        </div>
        {chips.length > 0 && (
          <div className="st-talkchips" aria-label="the blocks, folded while the talk is full">
            {chips.map((b) => <button key={b.id} className="st-chip" tabIndex={-1} title="⌘↓ the stage back" onClick={back}><span className={`st-dot ${b.state}`} />{b.title}</button>)}
          </div>
        )}
        <div className="st-talkbox" ref={boxAt}>{box}</div>
        {(dock === "left" || dock === "right") && <div className="st-seam" onPointerDown={onSeam} role="separator" aria-orientation="vertical" aria-label="the talk's width" />}
      </section>
      <div className="st-main" inert={dock === "full" && !stageWhole()}>{/* B25: the stage stays, its blocks the foot row */}
        {lens === "ide" && files && <div className="st-files" data-part="files">{files}</div>}
        <div className="st-stagebox" ref={stageBox}>
          <Stage store={store} session={session} by="you" active={dock !== "full"} jelly={jelly} chipAt={chipAt} busy={busy} onTalk={onType} talkFull={stageWhole() && dock === "full"} onFootBack={back} />{/* B25 */}
          <span ref={rest} className="st-home" aria-hidden />
          <JellyLayer {...jelly.layer} />
        </div>
      </div>
      {lifted && (
        <div className="st-ghosts" aria-hidden>
          {(Object.keys(DOCK_GHOSTS) as Dock[]).map((d) => {
            const g = DOCK_GHOSTS[d];
            return <div key={d} className={`st-dockghost ${lifted === d ? "near" : ""}`} style={{ left: `${g.x * 100}%`, top: `${g.y * 100}%`, width: `${g.w * 100}%`, height: `${g.h * 100}%` }}>{GHOST_WORDS[d]}</div>;
          })}
        </div>
      )}
      <span ref={probe} className="st-chprobe" aria-hidden>0000000000</span>
      {!stageWhole() && <div className={`st-toast st-roomtoast ${toast ? "on" : ""}`}>{toast}</div>}{/* B15, #883 B25-4: no toast with stage.whole on */}
    </div>
  );
}
