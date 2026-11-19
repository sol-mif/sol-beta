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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { stageWhole } from "../flag";   // B15
import { FOOT } from "../kit/feel";   // B25
import { JellyLayer } from "../Body";
import { useSize } from "../kit";
import { follow, type Follow, dur } from "../motion";
import { Orb } from "../Orb";
import type { Item } from "../work/useWork";
import { Stage } from "./Stage";
import { talkMove, talkLetGo, nearSeam } from "../screens/throw";   // #1090: the talk carried to the other window
import { fixtureAsked, pour } from "./fixture";
import { useJelly } from "./useJelly";
import { barSession, wordsIn } from "./bar";
import { StartLines } from "./StartLines";
import type { StageStore } from "./store";
import { cliAsks } from "./lens";
import { fileOf, madeIn, ownHere, type Block, DEFAULT_TALK, DOCK_GHOSTS, TALK, roomFor, dockBack, dockTo, lastExchange, nearestDock, seamShare, talkRow, talkWidth, talkWholeWidth, type Dock, type Talk } from "./model";
import { oneLens, useUserLens } from "./userLens";   // #954: the lens, one setting of yours
import "./space.css";   // stage.whole: the talk and the stage are one space
import { YoursOffer } from "../yours/Offer";   // #1089: Build becomes yours, the offer above the box (build.yours)
import { useTried } from "../yours/Look";   // #1089: a layout tried on this stage while the pointer is on its glyph
import { keptLayNow, useKeptLay } from "../yours/live";   // #1089: the project's kept layout, where every session never set by hand opens
import { useCross } from "../cross/flag";   // #1045: a thing carried from Home lands here while the stage is folded away

/** what the talk's head says of its dock, on hover, and the toast a dock says once */
const DOCK_WORDS: Record<Dock, [string, string]> = {
  left: ["docked left", "the talk left, at reading width"],
  right: ["docked right", "the talk right"],
  bottom: ["docked at the foot", "the talk a row at the foot; it rises while you write"],
  full: ["full · the blocks are chips at its foot", "the talk full · ⌘↓ brings the stage back"],
};
const STAGE_WANT = 480;
const GHOST_WORDS: Record<Dock, string> = { left: "left", right: "right", bottom: "bottom", full: "full  ⌘↑" };
const GLYPHS: [Dock, string, ReactNode][] = [
  ["left", "dock left · ⌘⇧←", <rect key="f" className="f" x="1.5" y="1.5" width="4" height="8" rx="1" />],
  ["right", "dock right · ⌘⇧→", <rect key="f" className="f" x="7.5" y="1.5" width="4" height="8" rx="1" />],
  ["bottom", "dock at the foot · ⌘⇧↓", <rect key="f" className="f" x="1.5" y="6" width="10" height="3.5" rx="1" />],
  ["full", "the talk full · ⌘↑", <rect key="f" className="f" x="1.5" y="1.5" width="10" height="8" rx="1" />],
];

export function StageColumn({ store, session, items, busy, talk, box, writing, onType, onSend, files, titleOf, empty: emptyTalk }: {
  /** a session's title by its id: the name over each group of blocks carried in from it */
  titleOf?: (session: string) => string | undefined;
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
    if (!oneLens() || seen.ready === false || (seen.stage.lens ?? "app") === mine) return;
    store.place(session, { ...store.read(session).stage, lens: mine });
  }, [mine, seen.ready, seen.stage.lens, session, store]);
  const live = seen.blocks.filter((b) => b.state !== "dead");
  const asks = lens === "cli" && cliAsks(live, seen.stage.blocks);
  const tried = useTried(), keptLay = useKeptLay();   // #1089: a try first, then the session's own, then the kept look
  const kept: Talk = tried ?? seen.stage.talk ?? keptLay ?? DEFAULT_TALK;
  // CLI: the talk alone until a block asks; then the stage opens for it beside the talk where it is docked
  // landing: a stage with every block folded takes no room. The talk is alone until a block is open (unfolded, or just
  // born and not placed yet), or the count chip is pressed to look at the folded ones; the dock kept is untouched
  const [more, setMore] = useState(false);
  const crossHere = useCross();   // #1045
  useEffect(() => { setMore(false); }, [session]);
  const anyOpen = live.some((b) => { const p = seen.stage.blocks.find((x) => x.id === b.id); return !p || (!p.folded && !p.popped); });
  // stage.whole: a stage still being read is the talk alone too, so a session never opens on an empty half and then closes it
  const empty = lens === "app" && (stageWhole() || seen.ready !== false) && !anyOpen;
  const asked: Dock = (lens === "cli" && !asks) || empty ? "full" : kept.dock;
  useEffect(() => { barSession(session); }, [session]);

  const room = useRef<HTMLDivElement>(null), probe = useRef<HTMLSpanElement>(null);
  const [W, H] = useSize(room);
  // the talk eases its width (.st-talk's transition), but not from the guess it is drawn at before the room is measured:
  // the room is read in a layout effect, which lays the talk out at that guess, so the width the room then gives would
  // glide in from it over a stage already laid at the right one, the box reaching over the stage for as long as the
  // glide (space.html, 2026-11-12). `laid` turns the glide on a frame after the first measured width (space.css)
  const [laid, setLaid] = useState(false);
  useEffect(() => { if (!W || laid) return; const f = requestAnimationFrame(() => setLaid(true)); return () => cancelAnimationFrame(f); }, [W, laid]);
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
  // the stage beside the talk is wide enough to hold a block as it is born (half the room, 480 at most): the talk gives
  // the rest of a width kept from when the stage was empty (2026-11-09: a 224 px stage, six blocks on top of each other)
  // One block: half the room, 480 at most. Two or three: the talk at reading width. Four or more: the talk at its floor.
  const openN = live.filter((b) => { const p = seen.stage.blocks.find((x) => x.id === b.id); return p && !p.folded && !p.popped; }).length;
  const stageWant = openN <= 1 ? Math.min(W / 2, STAGE_WANT) : W - (openN <= 3 ? TALK.read : TALK.floor) * ch;
  // #954, stage.whole: the talk keeps one width however many blocks are open (TALK_WHOLE), unless one is kept or dragged
  const width = W ? (stageWhole() && (dragW ?? kept.width) === undefined ? talkWholeWidth(W, ch) : talkWidth(W, ch, dragW ?? kept.width, stageWant)) : TALK.read * ch;
  const height = talkRow(H || 1, writing);
  // a room too small for the stage beside the talk at its floor (a narrow window, a pane open): the talk docks at the foot
  // and the stage takes the room over it (#872: a 900 px window still shows its blocks); with no room for that either the
  // talk shows full, the blocks as chips, until there is room again; stage.json keeps the dock asked
  const dock: Dock = W && H && !roomFor(asked, W, H, width, height)
    ? (asked !== "full" && roomFor("bottom", W, H, width, height) ? "bottom" : "full") : asked;

  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), dur("pour") * 2); return () => clearTimeout(t); }, [toast]);
  const keep = (t: Talk) => store.place(session, { ...store.read(session).stage, talk: t });
  const setDock = (d: Dock) => { const now = store.read(session).stage.talk ?? keptLayNow() ?? DEFAULT_TALK; if (d === now.dock) return; keep(dockTo(now, d)); setToast(DOCK_WORDS[d][1]); };
  const back = () => { const now = store.read(session).stage.talk ?? keptLayNow() ?? DEFAULT_TALK; if (now.dock !== "full") return; const b = dockBack(now); keep(b); setToast(DOCK_WORDS[b.dock][1]); };

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
      // B25: Esc brings the stage back, unless what has the keys leaves with it first: ⌘K's jump, the box asking on the
      // side or stopping a turn (#1111)
      const own = (e.target as HTMLElement | null)?.closest?.(".hc-jump, .ask-inner.aside, .ask-inner.running");
      if (stageWhole() && e.key === "Escape" && !meta && k.full && !own) { e.preventDefault(); e.stopImmediatePropagation(); k.back(); return; }
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
      if (share !== null) { keep({ ...(store.read(session).stage.talk ?? keptLayNow() ?? DEFAULT_TALK), width: share }); setToast(`the talk ${Math.round(talkWidth(r.width, ch, share) / ch)}ch wide`); }
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
      setLifted(nearSeam(ev.clientX, ev.clientY) ? null : near);   // #1090: going to the seam, not docking: the ghosts fade
      talkMove(ev.clientX, ev.clientY);   // #1090: near the seam, the other window sees the talk coming
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
      setLifted(null);
      if (ev.type === "pointerup" && near && talkLetGo(ev.clientX, ev.clientY)) return;   // #1090: the talk went to the other window
      if (near && ev.type === "pointerup") setDock(near);
    };
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  };

  // the grip (stage.whole) is all buttons: a press is the button's, a drag from anywhere on it lifts the talk
  const onGrip = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const r = room.current!.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
    let near: Dock | null = null;
    const mv = (ev: PointerEvent) => {
      if (near === null && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      near = nearestDock((ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height);
      setLifted(nearSeam(ev.clientX, ev.clientY) ? null : near);   // #1090: going to the seam, not docking: the ghosts fade
      talkMove(ev.clientX, ev.clientY);   // #1090
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      setLifted(null);
      if (!near) return;
      if (ev.type === "pointerup" && talkLetGo(ev.clientX, ev.clientY)) return;   // #1090: the talk went to the other window
      // the press that ends a drag is not a button's
      const eat = (c: Event) => { c.stopPropagation(); c.preventDefault(); };
      window.addEventListener("click", eat, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", eat, true), 0);
      if (ev.type === "pointerup") setDock(near);
    };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  };

  // the talk follows its end; it jumps when the session opens or the dock changes, and the orb glides it back
  const scroller = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  const [flw, setFlw] = useState<Follow | null>(null);
  useLayoutEffect(() => {
    if (!scroller.current || !inner.current) return;
    const f = follow(scroller.current, inner.current);
    setFlw(f); f.jump();
    // docked at the foot the row is short: it opens on the last message's first lines, not its end (#872 pass 2)
    const top = dock === "bottom" ? requestAnimationFrame(() => {
      const last = inner.current?.lastElementChild as HTMLElement | null, sc = scroller.current;
      if (last && sc) sc.scrollTop = Math.max(0, sc.scrollTop + last.getBoundingClientRect().top - sc.getBoundingClientRect().top - 8);
    }) : 0;
    return () => { cancelAnimationFrame(top); f.destroy(); setFlw(null); };
  }, [session, dock]);
  // #1001: a message of the person's own, sent while they read further up, brings the talk to it (it stayed up there, the
  // send said only by the orb's dot); the agent's words never pull them down
  const lastMine = useRef<string | null>(null);
  useEffect(() => {
    const me = [...items].reverse().find((i) => i.kind === "me")?.id ?? null;
    const was = lastMine.current;
    lastMine.current = me;
    if (stageWhole() && was !== null && me !== null && me !== was) flw?.glide();
  }, [items, flw]);

  // the jelly: its layer covers the stage alone (a block's place is its box), its home the stage's foot
  const stageBox = useRef<HTMLDivElement>(null), rest = useRef<HTMLSpanElement>(null);
  const jelly = useJelly(stageBox, rest);
  // the stage is handed the jelly's verbs alone (the same functions for its life), so a flight or a letter typed in the
  // box does not draw the stage again (#866)
  const verbs = useMemo(() => jelly, [jelly.travelTo, jelly.birth, jelly.death, jelly.home, jelly.sitBy, jelly.jump]); // eslint-disable-line react-hooks/exhaustive-deps
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

  const said = useMemo(() => (dock === "bottom" ? lastExchange(items) : items), [dock, items]);
  // the talk is drawn again when what is said changed, not on each letter in the box (#866; Home hands a stable `talk`)
  const spoken = useMemo(() => (said.length ? talk(said) : null), [talk, said]);
  // B25: with stage.whole on, the talk full has no chips (the stage's foot row carries the blocks)
  const placed = dock === "full" && !stageWhole() ? live.filter((b) => seen.stage.blocks.some((p) => p.id === b.id)) : [];
  // the talk full: this session's own blocks by name; what was carried in is one count, opened as groups named by the
  // session that made each. A chip opens its block on the stage, and the stage with it
  const chips = placed.filter((b) => ownHere(b, session));
  const groups = madeIn(placed.filter((b) => !ownHere(b, session)), titleOf);
  const openBlock = (id: string) => { const s = store.read(session).stage; store.place(session, { ...s, ...(s.talk ? { talk: dockBack(s.talk) } : {}), blocks: s.blocks.map((p) => (p.id === id ? { ...p, folded: false, z: Math.max(0, ...s.blocks.map((x) => x.z ?? 0)) + 1 } : p)) }); };
  const chip = (b: Block) => <button key={b.id} className="st-chip" tabIndex={-1} title={fileOf(b) || "open it on the stage"} onClick={() => openBlock(b.id)}><span className={`st-dot ${b.state}`} />{b.title}</button>;
  // #1045: with the talk full and the stage folded away (his Build, an empty stage), the stage has no size to put a
  // thing down on: the room is its drop place then (the box inside it stays the talk's); the block that lands brings the
  // stage back, as any first block does
  const crossRoom = crossHere && dock === "full" && !stageWhole();
  return (
    <div ref={room} {...(crossRoom ? { "data-cross-drop": "stage" } : {})} className={`st-room ${stageWhole() ? "whole" : ""} ${laid ? "laid" : ""} ${lens} ${asks ? "asks" : ""} ${lifted ? "lifting" : ""} ${dragW !== null ? "seaming" : ""}`} data-dock={dock} data-lens={lens}
      style={{ "--st-talkw": `${width}px`, "--st-talkh": `${height}px`, "--st-fullw": `${FOOT.talk}px`, "--st-foot": `${openN ? FOOT.pad : 0}px` } as React.CSSProperties}>{/* B25: the talk full's column and the row under it; no row, no rise */}
      <section className="st-talk" data-part="the talk" aria-label="the talk">
        {/* #954: whole.html draws the talk with no head: no title, no dock words, no dock buttons (the keys stay) */}
        {!stageWhole() && <div className="st-talkhead" onPointerDown={onHead}>
          <span className="st-talkmk" aria-hidden />
          <b>the talk</b>
          <span className="st-talkmeta">{lens === "cli" && !asks ? "CLI · the stage opens when an artifact asks" : stageWhole() && dock === "full" ? "full · ⌘↓, Esc or a press on an artifact brings the stage back" : DOCK_WORDS[dock][0]}{/* B25 */}</span>
          <span className="st-runchips" ref={setChipAt} />
          <span className="st-docks">
            {GLYPHS.map(([d, t, f]) => (
              <button key={d} tabIndex={-1} className={dock === d ? "on" : ""} title={t} aria-label={t} aria-pressed={dock === d} onClick={() => (d === "full" && dock === "full" ? back() : setDock(d))}>
                <svg viewBox="0 0 13 11" aria-hidden><rect x=".6" y=".6" width="11.8" height="9.8" rx="2" />{f}</svg>
              </button>
            ))}
          </span>
        </div>}
        {/* with stage.whole the talk has no head; the docks stay within reach: a small grip at its top edge, the four
            buttons, and a drag on it lifts the talk to the dock ghosts as the head did */}
        {stageWhole() && <div className="st-dockgrip" data-part="the chat's size" onPointerDown={onGrip}>
          {/* 2026-11-12 ("why is how the stage moves button in the middle just hanging out there"): the chat has three sizes,
              small (the box and the last exchange, at the bottom), normal (a column), wide (the whole space); two buttons
              step through them, shown when the pointer is at the chat's top edge. The keys and the drag stay */}
          <span className="st-docks">
            <button tabIndex={-1} disabled={dock === "bottom"} title="chat smaller · ⌘⇧↓" aria-label="chat smaller" onClick={() => (dock === "full" ? back() : setDock("bottom"))}>
              <svg viewBox="0 0 13 11" aria-hidden><rect x=".6" y=".6" width="11.8" height="9.8" rx="2" /><rect className="f" x="1.5" y="6" width="10" height="3.5" rx="1" /></svg>
            </button>
            <button tabIndex={-1} disabled={dock === "full"} title="chat larger · ⌘↑" aria-label="chat larger" onClick={() => setDock(dock === "bottom" ? "left" : "full")}>
              <svg viewBox="0 0 13 11" aria-hidden><rect x=".6" y=".6" width="11.8" height="9.8" rx="2" /><rect className="f" x="1.5" y="1.5" width="10" height="8" rx="1" /></svg>
            </button>
          </span>
        </div>}
        <div className="st-talkwrap">
          <div className="talk" ref={scroller}>
            <div className="talk-inner" ref={inner}>
              {dock !== "bottom" && <StartLines store={store} session={session} />}
              {spoken ?? (stageWhole() ? (emptyTalk ?? null) : <p className="wpempty">{busy ? "" : "nothing said yet. Ask for one thing, or three at once."}</p>)}{/* #954: with stage.whole the empty talk says nothing, or where you left off */}
            </div>
          </div>
          <Orb f={flw} />
        </div>
        {(chips.length > 0 || groups.length > 0) && (
          <div className="st-talkchips" aria-label="the artifacts, folded while the talk is full">
            {chips.map(chip)}
            {groups.length > 0 && <button className="st-chip st-chipmore" tabIndex={-1} aria-expanded={more} title="artifacts carried in from earlier sessions, by the session that made them" onClick={() => setMore((v) => !v)}>{more ? "fewer" : `${placed.length - chips.length} earlier`}</button>}
            {more && groups.map((g) => <div key={g.from} className="st-chipgroup"><span className="st-chipfrom">{g.name}</span>{g.blocks.map(chip)}</div>)}
          </div>
        )}
        <YoursOffer session={session} items={items} lay={seen.stage.talk ?? null} />
        <div className="st-talkbox">{box}</div>
        {(dock === "left" || dock === "right") && <div className="st-seam" onPointerDown={onSeam} role="separator" aria-orientation="vertical" aria-label="the talk's width" />}
      </section>
      <div className="st-main" inert={dock === "full" && !stageWhole()}>{/* B25: the stage stays, its blocks the foot row */}
        {lens === "ide" && files && <div className="st-files" data-part="files">{files}</div>}
        <div className="st-stagebox" ref={stageBox}>
          <Stage store={store} session={session} by="you" active={dock !== "full"} jelly={verbs} chipAt={chipAt} busy={busy} onTalk={onType} talkFull={stageWhole() && dock === "full"} onFootBack={back} />{/* B25 */}
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
