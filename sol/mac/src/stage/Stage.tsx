// The stage (#696, sitting 2 of the stage build): a free surface inside the session where everything the agent makes is
// a block you can move, snap, tile, focus, fold, freeze and close. Ported from the prototype (mine/look/stage/play.html,
// its §10: move, snap, resize, fold, freeze, focus; the marquee; the keys), as React on the kit: each block's frame is
// the kit's Glass on the continuous curve (kit/curve.ts), never border-radius; its rim says its state (working the jelly's
// bands drift, waits yellow, frozen pearl); a block is born warm and cools to glass over one pour. The geometry is
// model.ts's, the data the store's (store.ts: block.json, stage.json, the ledger), every value tokens.json's.
//   drag a head            snaps to the stage's edges, the others' edges and the gap, else the grid of 8; yellow guides
//   drag to an edge        a dashed ghost of the slot: the sides a half, the top the whole, the bottom the lower half
//   the corner grip        resizes, with the same snapping
//   ⌘⇧T / ⌘⇧F              tile every block on the stage / put them back exactly where they were
//   double-click, ⌘1-9     focus: the block fills the stage; esc back
//   fold                   the block becomes a chip at the stage's foot; a click unfolds it where it was
//   freeze                 a version with your yes; the pills switch between the versions and live
//   ×, ⌘⌫                  close: the block dies on the stage, its ledger keeps it
//   ⇧click, a marquee      select several
//   the dot                the block's ledger, and the sessions it is in
//   drag a head off Sol    popped out (#701, pop.ts): its own window over the desktop, the same block; the stage keeps
//                          a chip in its slot; the chip, the window's "back", or the window dragged over Sol returns it
//   the lens               app · TUI · CLI · IDE (lens.ts, LensPill.tsx): placement rules over these same blocks; the
//                          TUI's terminal lists the others as lines, ⌘1-9 opens one; leaving restores what it folded
//   drag a head to a row   carried (#700): the side's session row lights "carry here"; dropped, the block is in that
//                          session too (the same artifact, one ledger) and stays here; the row says "n carried"
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type DragEvent as RDragEvent, type PointerEvent as RPointerEvent } from "react";
import { curve, useSize } from "../kit";
import { CURVE } from "../kit/tokens";
import { dur } from "../motion";
import { useStageSaid, useStageWhole } from "../flag";
import { StageNext } from "./StageNext";
import { GAP, MIN, bornSize, fileOf, flow, ownHere, fit, free, keep, overlaps, readingOrder, settle, snap, snapSize, tile, within, zoneAt, zoneRect, type Block, type Guides, type Lens, type Place, type Rect, type StageJson, type Zone } from "./model";
import { doneOf } from "./kinds";
import type { StageStore } from "./store";
import type { Jelly } from "./useJelly";
import { ghostAt, targetWords } from "./ask";
import { CHIP, CHIP_EVENT, attach, barState, keptOn, pointAt, setCrowded, setRoom, slotThing, useBar } from "./bar";
import { nameOf, rowAt, setCarryOver } from "./carry";
import { LENS_WORDS, TUI_TITLE, adopt, switchLens, tuiLines } from "./lens";
import { backBlock, onBack, outside, popOutBlock } from "./pop";
import { nearSeam, carryMove, carryEnd, throwOnLetGo } from "../screens/throw";
import { crossed } from "../screens/store";
import { screensOn } from "../screens/flag";   // #1090: a block that came from another window is not born here   // #1090: toward the edge that faces another window, a throw
import { createPortal } from "react-dom";
import { RunChip } from "./kinds/RunRows";
import { isRunBody } from "./kinds/runs";
import { StageHere } from "./kinds/here";
import { Frame } from "./kinds/Frame";
import { Mark } from "./kinds/Mark";
import "./stage.css";
import { useCross } from "../cross/flag";   // #1031: the stage takes a thing carried from Home
import { folderAt, isHomeRow, placeOfRow } from "../cross/shelf";   // #1045: and a block of this stage is carried to a Home folder, as on StageNext
import { seat } from "../cross/store";
import { folderName } from "../cross/folders";

const R = CURVE.radius.block, S = CURVE.smoothing;
const NO_GUIDES: Guides = { x: null, y: null };
const NO_LINES: never[] = [];
/** how long the stage's size must stand before a block opened on it is checked (the talk's pour moves it every frame) */
const SETTLE = 140;
/** a block shown as working while the jelly's rim drifts on it: one object per block, so its frame draws once */
const workedMemo = new WeakMap<Block, Block>();
const workedOf = (b: Block): Block => { let w = workedMemo.get(b); if (!w) { w = { ...b, state: "working" }; workedMemo.set(b, w); } return w; };
/** how long the pointer rests on a part before it is the target (play.html's 320 ms) */
const HOVER = 320;


export type StageProps = {
  store: StageStore; session: string;
  /** who your presses are signed as in a ledger */
  by?: string;
  /** the stage answers its keys only while it shows (a pane kept behind another tab does not) */
  active?: boolean;
  /** the agent's body on the stage (useJelly.ts, #709): born, travels, waits, leaves, dies with the blocks. Its layer is
   *  laid over a box whose top left is the stage's (StageColumn.tsx), so a block's place is the jelly's box as it is */
  jelly?: Jelly;
  /** where a folded run's chip sits: the talk's head (#703, #734, StageColumn.tsx); without one, with the other chips */
  chipAt?: HTMLElement | null;
  /** the agent's turn is running: an untaken ghost fades only after it ends (#737; the switched stage, StageNext.tsx) */
  busy?: boolean;
  /** Esc from a held block: the keys go back to the talk's box (#737; StageNext.tsx) */
  onTalk?: () => void;
  /** B25: the talk is full (stage.whole): the blocks fly to the foot row; a press on one calls onFootBack and holds it */
  talkFull?: boolean;
  onFootBack?: () => void;
};

/** the slots the engine names, as the stage's own on its real width (an agent's `place` with a slot, #709) */
const SLOT: Record<string, (s: { w: number; h: number }) => Rect> = {
  full: (s) => zoneRect(s, "full"), left: (s) => zoneRect(s, "left"), right: (s) => zoneRect(s, "right"), bottom: (s) => zoneRect(s, "bottom"),
  top: (s) => { const f = zoneRect(s, "full"), b = zoneRect(s, "bottom"); return { ...f, h: b.h }; },
};

/** one stage per session: another session's is another stage, so coming back opens exactly its stage.json, with no
 *  births, no jelly acts and no focus or tile kept from the session before (#700) */
// With stage.whole or stage.said on, the night's stage (StageNext.tsx) is drawn instead: one switch, one stage, never both
export const Stage = memo(function Stage(p: StageProps) {
  const whole = useStageWhole(), said = useStageSaid();
  return whole || said ? <StageNext {...p} /> : <OneStage key={p.session} {...p} />;
});

/** a block's frame, drawn again only when its own block, its place or its looks changed (#866): a drag, a letter typed
 *  or another block's change leaves it alone. Its presses are the same functions for its whole life (handlersOf) */
type FrameProps = ComponentProps<typeof Frame>;
const SameFrame = memo(Frame, (a: FrameProps, b: FrameProps) => {
  for (const k of Object.keys(b) as (keyof FrameProps)[]) {
    if (k === "r") { if (a.r.x !== b.r.x || a.r.y !== b.r.y || a.r.w !== b.r.w || a.r.h !== b.r.h || a.r.z !== b.r.z) return false; }
    else if (a[k] !== b[k]) return false;
  }
  return true;
});
type Presses = Pick<FrameProps, "act" | "onHead" | "onGrip" | "onFocus" | "onFold" | "onFreeze" | "onClose" | "onLedger" | "onVersion" | "onRef">;

function OneStage({ store, session, by = "you", active = true, jelly, chipAt }: StageProps) {
  const cross = useCross();
  const seen = useSyncExternalStore(useCallback((f: () => void) => store.subscribe(session, f), [store, session]), () => store.read(session));
  const el = useRef<HTMLDivElement>(null);
  // #1090: the live carry's Esc listener, so it is gone if the stage goes mid-carry, and the stage's own Esc waits for it
  const carryStop = useRef<(() => void) | null>(null);
  useEffect(() => () => { carryStop.current?.(); }, []);
  const [W, H] = useSize(el);
  const size = { w: W, h: H };
  const [drag, setDrag] = useState<{ id: string; r: Rect } | null>(null);
  const [guides, setGuides] = useState<Guides>(NO_GUIDES);
  const [ghost, setGhost] = useState<Rect | null>(null);
  const [marq, setMarq] = useState<Rect | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState<Set<string>>(new Set());
  const [born, setBorn] = useState<Set<string>>(new Set());
  const [coming, setComing] = useState<Set<string>>(new Set());
  const [worked, setWorked] = useState<Set<string>>(new Set());   // the jelly at work on it: the rim drifts (#709)   // arrived, its six still in the air (the jelly's birth)
  const [dying, setDying] = useState<Set<string>>(new Set());
  const [allFolds, setAllFolds] = useState(false);
  useEffect(() => { setAllFolds(false); }, [session]);
  const [ledger, setLedger] = useState<string | null>(null);
  const [shown, setShown] = useState<Record<string, number>>({});   // the version a frozen block shows, 1-based
  const [toast, setToast] = useState<string | null>(null);
  const focusBack = useRef<Place | null>(null);
  const freeRects = useRef<Place[] | null>(null);
  const known = useRef<Set<string> | null>(null);
  const bar = useBar();
  // the bar reads the stage's room for "beside the week" (ask.ts beside)
  const anyOpen = seen.stage.blocks.some((p) => !p.folded && !p.popped);
  useEffect(() => { setCrowded(anyOpen); }, [anyOpen]);
  useEffect(() => () => setCrowded(false), []);
  useEffect(() => { if (W && H) setRoom({ size: { w: W, h: H }, places: seen.stage.blocks.filter((p) => !p.folded).map((p) => ({ ...p, title: seen.blocks.find((b) => b.id === p.id)?.title ?? "" })) }); }, [seen, W, H]);

  const live = seen.blocks.filter((b) => b.state !== "dead");
  // #1042 (join fit of #1043): a block that leaves this stage leaves the box's "on" with it; only a block that was here
  // and went, never one not loaded yet (this stage holds no closes for an undo: a close leaves at once)
  const hereNow = live.map((b) => b.id).join(" ");
  const wasHere = useRef(new Set<string>());
  useEffect(() => {
    const now = new Set(hereNow ? hereNow.split(" ") : []), gone = new Set([...wasHere.current].filter((id) => !now.has(id)));
    wasHere.current = now;
    if (!active || !gone.size) return;
    const keep = keptOn(barState().on, gone);
    if (keep) pointAt(keep, barState().picked && keep.length > 1);
  }, [hereNow, active]);
  const placeOf = (id: string) => seen.stage.blocks.find((p) => p.id === id);
  // a place as this stage shows it: fitted when the stage is narrower than it was laid on (model.ts fit)
  const shownAt = (id: string) => { const p = placeOf(id); return p && W && H ? { ...p, ...fit({ w: W, h: H }, p) } : p; };
  const on = seen.stage.blocks.filter((p) => !p.folded && !p.popped && live.some((b) => b.id === p.id)).map((p) => shownAt(p.id)!);
  const lens: Lens = seen.stage.lens ?? "app";
  // the TUI's terminal, and the other blocks as its lines (lens.ts): ⌘1-9 opens those
  const term = lens === "tui" ? seen.stage.blocks.find((p) => p.tui && !p.folded && live.some((b) => b.id === p.id)) ?? null : null;
  const lines = term ? tuiLines(seen.stage.blocks, live, term.id) : null;
  const others = (id: string) => on.filter((p) => p.id !== id);
  // the block that may ask for the eye (#872): the first waiting on you in reading order, else the newest at work; every
  // other block's rim is still, so at most one thing on the stage moves to be seen
  const order = readingOrder(on);
  const asks = order.find((id) => live.find((b) => b.id === id)?.state === "waits")
    ?? [...order].reverse().find((id) => worked.has(id) || live.find((b) => b.id === id)?.state === "working") ?? null;
  // the stage laid by rule (model.ts flow): no block touches another, the sizes follow the stage and the count. Not in
  // another lens, not while a block is focused or a run covers the stage (those cover on purpose)
  const laid = (blocks: Place[], at: { w: number; h: number }, ord?: string[], later: string[] = []) => {
    const s = store.read(session);
    if ((s.stage.lens ?? "app") !== "app" || focusBack.current || !at.w || !at.h) return null;
    const alive = new Set(s.blocks.filter((b) => b.state !== "dead").map((b) => b.id));
    const full = zoneRect(at, "full");
    if (blocks.some((p) => alive.has(p.id) && !p.folded && !p.popped && isRunBody(s.blocks.find((b) => b.id === p.id)?.body) && p.w >= full.w - 1 && p.h >= full.h - 1)) return null;
    const mine = blocks.filter((p) => alive.has(p.id));
    const big = mine.find((p) => !p.folded && !p.popped && s.blocks.find((b) => b.id === p.id)?.state === "waits")?.id ?? later[later.length - 1] ?? null;
    // the foot's chips keep their own row: the blocks are laid over it, never under it
    const foot = el.current?.querySelector<HTMLElement>(".st-folds:not(.all)")?.getBoundingClientRect().height ?? 0;
    const r = flow(foot ? { w: at.w, h: at.h - Math.ceil(foot) - GAP / 2 } : at, mine, ord ?? readingOrder(mine, later), big);
    const next = blocks.map((p) => r.places.find((q) => q.id === p.id) ?? p);
    const moved = next.filter((p, i) => { const q = blocks[i]; return p.x !== q.x || p.y !== q.y || p.w !== q.w || p.h !== q.h || !!p.folded !== !!q.folded; }).map((p) => p.id);
    return { blocks: next, moved, folded: r.folded };
  };

  const say = useCallback((m: string) => setToast(m), []);
  // the key hints are not burned into the frame (v4 §4): the toast at the stage's foot names a verb the first time it is used
  const named = useRef(new Set<string>());
  const hint = (verb: string, words: string) => { if (named.current.has(verb)) return; named.current.add(verb); say(`${verb} · ${words}`); };
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), dur("pour") * 2); return () => clearTimeout(t); }, [toast]);
  const pour = (ids: string[]) => {
    setMoving((m) => new Set([...m, ...ids]));
    setTimeout(() => setMoving((m) => { const n = new Set(m); ids.forEach((i) => n.delete(i)); return n; }), dur("pour"));
  };
  // the stage as it is now, not as it was when a drag or a timer began: a block that arrived meanwhile keeps its place
  const latest = () => store.read(session).stage;
  const write = (blocks: Place[], patch: Partial<StageJson> = {}) => store.place(session, { ...latest(), ...patch, blocks });
  const setPlace = (id: string, p: Partial<Place>, patch?: Partial<StageJson>) => write(latest().blocks.map((x) => (x.id === id ? { ...x, ...p } : x)), patch);
  const zTop = () => Math.max(0, ...latest().blocks.map((p) => p.z));
  // the focused block back at its place in these blocks: a lens, a fold, a tile or leaving the session never leaves it
  // full with no Esc to bring it back (only this stage knows where it was)
  const unfocused = (blocks: Place[], only?: string) => {
    const f = focusBack.current;
    if (!f || (only && f.id !== only)) return blocks;
    focusBack.current = null;
    return blocks.map((x) => (x.id === f.id ? { ...x, x: f.x, y: f.y, w: f.w, h: f.h } : x));
  };
  useEffect(() => () => { if (focusBack.current) store.place(session, { ...store.read(session).stage, blocks: unfocused(store.read(session).stage.blocks) }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const lift = (id: string) => { const p = placeOf(id); if (p && p.z !== zTop()) setPlace(id, { z: zTop() + 1 }); };

  // a block with no place yet is born where the stage is free; when nothing is free the stage tiles itself
  // A block the engine placed on its own nominal stage (`auto`) or in a slot it named is laid out again here, on the
  // stage's real width (#709)
  useLayoutEffect(() => {
    if (!W || !H || seen.ready === false) return;
    const ids = new Set(live.map((b) => b.id));
    if (known.current === null) known.current = new Set(seen.stage.blocks.map((p) => p.id));   // what was here stays still
    const wire = (id: string) => placeOf(id) as (Place & { auto?: boolean; slot?: string }) | undefined;
    const fresh = live.filter((b) => !placeOf(b.id) || wire(b.id)?.auto);
    const slotted = live.filter((b) => { const p = wire(b.id); return p && !p.auto && p.slot && SLOT[p.slot] && !known.current!.has(b.id) && !crossed(b.id); });
    const arrived = live.filter((b) => !known.current!.has(b.id) && !crossed(b.id)).map((b) => b.id);
    known.current = ids;
    if (arrived.length && jelly) setComing((s) => new Set([...s, ...arrived]));
    else if (arrived.length) {
      setBorn((s) => new Set([...s, ...arrived]));
      setTimeout(() => setBorn((s) => { const n = new Set(s); arrived.forEach((i) => n.delete(i)); return n; }), dur("pour"));
    }
    if (!fresh.length && !slotted.length) return;
    const bare = (p: Place) => { const { auto: _a, slot: _s, ...q } = p as Place & { auto?: boolean; slot?: string }; return q; };
    let blocks = seen.stage.blocks.filter((p) => !fresh.some((b) => b.id === p.id)).map((p) => {
      const sl = slotted.some((b) => b.id === p.id) ? (p as Place & { slot?: string }).slot : undefined;
      return sl ? { ...bare(p), ...SLOT[sl](size) } : p;
    });
    let z = zTop(), full = false;
    for (const b of fresh) {
      const s = bornSize(size, b.kind), spot = free(size, s.w, s.h, blocks.filter((p) => !p.folded));
      if (!spot) full = true;
      const was = placeOf(b.id);
      blocks.push({ id: b.id, x: spot?.x ?? 0, y: spot?.y ?? 0, ...s, z: ++z, ...(was?.folded ? { folded: true } : {}) });
    }
    const l = laid(blocks, size, undefined, fresh.map((b) => b.id));
    if (l) { blocks = l.blocks; if (l.folded.length) say(`no room: ${l.folded.length} folded to the foot`); }
    else if (full) {
      const shown = blocks.filter((p) => !p.folded), cells = tile(size, shown.length);
      blocks = blocks.map((p) => { const i = shown.indexOf(p); return i < 0 ? p : { ...p, ...cells[i] }; });
      say("no room: the stage re-arranged");
    }
    write(blocks, full && !l ? { tiled: true } : {});
  }, [seen, W, H]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── the stage keeps its rule (#872): whenever the open blocks change (one opened from its chip, the side's row or the
  // agent's place; one folded, closed or popped) or the stage's size does, every open block is laid again (laid, flow):
  // none on another, the sizes from the stage and the count. A size still pouring (the talk gave room) waits until it
  // stands; a drag in progress is left alone
  const sizeAt = useRef({ w: 0, h: 0, t: 0 });
  const [settled, kick] = useState(0);
  const laidSig = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (seen.ready === false) return;
    if (sizeAt.current.w !== W || sizeAt.current.h !== H) sizeAt.current = { w: W, h: H, t: performance.now() };
    if (!W || !H || drag || lens !== "app") return;
    const open = seen.stage.blocks.filter((p) => !p.folded && !p.popped && !(p as Place & { auto?: boolean }).auto && live.some((b) => b.id === p.id));
    const sig = `${open.map((p) => p.id).sort().join(",")}|${W}x${H}`;
    if (sig === laidSig.current) return;
    if (performance.now() - sizeAt.current.t < SETTLE) { const t = setTimeout(() => kick((n) => n + 1), SETTLE); return () => clearTimeout(t); }
    laidSig.current = sig;
    const l = laid(seen.stage.blocks, size);
    if (!l || !l.moved.length) return;
    pour(l.moved);
    write(l.blocks);
    if (l.folded.length) say(`no room: ${l.folded.length} folded to the foot`);
  }, [seen, W, H, drag, settled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── the lens (#701, lens.ts): the pill writes it to stage.json; here its placement is laid, once per change. The lens
  // a stage opens in is as it was left (no change, nothing laid). The TUI with no terminal composes one, and takes it
  // full when it arrives (adopt).
  const lensWas = useRef<Lens | null>(null);
  const wantTerm = useRef(false);
  useLayoutEffect(() => {
    if (seen.ready === false) return;
    if (lensWas.current === null) { lensWas.current = lens; return; }
    if (lensWas.current === lens || (lens !== "cli" && (!W || !H))) return;
    lensWas.current = lens;
    const r = switchLens({ ...seen.stage, blocks: unfocused(seen.stage.blocks) }, live, lens, zoneRect(size, "full"));
    store.place(session, r.stage);
    say(LENS_WORDS[lens]);
    wantTerm.current = r.want === "terminal";
    if (wantTerm.current) {
      const id = `term-${Date.now().toString(36)}`;
      store.compose(session, { id, kind: "terminal", title: TUI_TITLE, state: "live", versions: [], sessions: [session], body: {} }, { ...zoneRect(size, "full"), z: zTop() + 1 }, by);
    }
  }, [lens, seen, W, H]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!wantTerm.current || lens !== "tui" || !W || !H) return;
    const t = live.find((b) => b.kind === "terminal" && placeOf(b.id) && !(placeOf(b.id) as Place & { auto?: boolean }).auto);
    if (!t) return;
    wantTerm.current = false;
    store.place(session, adopt(seen.stage, t.id, zoneRect(size, "full")));
  }, [seen, lens, W, H]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── pop out (#701, pop.ts): a popped block comes back when its window says so, or the app does (dragged over Sol)
  const back = useRef<(id: string) => void>(() => {});
  back.current = (id) => { if (placeOf(id)?.popped) { pour([id]); setPlace(id, { popped: false, z: zTop() + 1 }); store.update(session, id, {}, "back on the stage", by); } };
  useEffect(() => onBack((id) => back.current(id)), []);

  // ── the jelly (useJelly.ts, #709): one act at a time, in the order the stage changed. A block arrived: its six fly
  // to it and its frame is born warm as they land (compose → birth). Working: it travels to the block (update →
  // travelTo). Waits: it sits by it. Frozen: it leaves (home). Closed: the six fly back from it (death). Between acts
  // it goes home at the stage's foot, or sits by the block that waits on you.
  const was = useRef<Map<string, Block["state"]> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const acts = useRef(0);
  const flying = useRef(new Set<string>());
  const view = useRef({ seen, placeOf });
  view.current = { seen, placeOf };
  const then = (f: () => Promise<void> | void) => {
    const n = ++acts.current;
    chain.current = chain.current.then(f).catch(() => {}).then(() => {
      if (n !== acts.current || !jelly) return;
      const { seen: s, placeOf: at } = view.current;
      const w = s.blocks.find((b) => b.state === "waits" && at(b.id) && !at(b.id)!.folded);
      void (w ? jelly.sitBy(at(w.id)!) : jelly.home());
    });
  };
  useEffect(() => {
    if (!jelly || !W || seen.ready === false) return;
    const before = was.current, now = new Map(seen.blocks.map((b) => [b.id, b.state] as const));
    was.current = now;
    if (!before) return;
    for (const b of live) {
      const p = placeOf(b.id);
      if (!p || p.folded || (p as Place & { auto?: boolean }).auto) continue;
      if (coming.has(b.id) && !flying.current.has(b.id)) {
        // one flight for a burst of births: the blocks that arrive while the six are in the air are born as they are
        if (flying.current.size) {
          setComing((s) => { const n = new Set(s); n.delete(b.id); return n; });
          setBorn((s) => new Set([...s, b.id]));
          setTimeout(() => setBorn((s) => { const n = new Set(s); n.delete(b.id); return n; }), dur("pour"));
          continue;
        }
        flying.current.add(b.id);
        then(() => jelly.birth(p).then(() => {
          flying.current.delete(b.id);
          setComing((s) => { const n = new Set(s); n.delete(b.id); return n; });
          setBorn((s) => new Set([...s, b.id]));
          setTimeout(() => setBorn((s) => { const n = new Set(s); n.delete(b.id); return n; }), dur("pour"));
        }));
        continue;
      }
      const s0 = before.get(b.id);
      if (s0 === undefined || s0 === b.state) continue;
      if (b.state === "working") {
        // the rim drifts while the jelly works there: kept until it has travelled and stayed a pour, however short the
        // engine's working was
        // the jelly stays where it is (2026-11-09: "i have to look at the creature 20 times"): the block's own rim says it
        setWorked((w) => new Set([...w, b.id]));
        setTimeout(() => setWorked((w) => { const n = new Set(w); n.delete(b.id); return n; }), dur("pour") * 2);
      }
      else if (b.state === "waits") then(() => jelly.sitBy(p));
      else if (b.state === "frozen") then(() => jelly.home());
    }
  }, [seen, W, coming]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── the verbs a press is ──────────────────────────────────────────────────────────────────────────────────────
  const fold = (id: string) => { write(unfocused(latest().blocks, id).map((x) => (x.id === id ? { ...x, folded: true } : x))); store.update(session, id, {}, "folded to the strip", by); hint("fold", "its chip at the foot puts it back"); };
  const unfold = (id: string) => setPlace(id, { folded: false, z: zTop() + 1 });
  const popOut = (b: Block, r: Rect) => {
    void popOutBlock(b.id, session, b.title, r).then((ok) => {
      if (!ok) { say("pop out needs Sol.app, or this page's popups"); return; }
      write(unfocused(latest().blocks, b.id).map((x) => (x.id === b.id ? { ...x, popped: true } : x)));
      store.update(session, b.id, {}, "popped out", by);
      say(`${b.title} is its own window · drag it back over Sol, or click its chip`);
    });
  };
  const unpop = (id: string) => { void backBlock(id); back.current(id); };
  // a run's chip opens the run as one block over the whole stage (runs.html scene 2); fold puts it back by the talk
  const openRun = (id: string) => { pour([id]); setPlace(id, { ...zoneRect(size, "full"), folded: false, z: zTop() + 1 }); };
  const freeze = (id: string) => { store.freeze(session, id, by); setShown((s) => { const n = { ...s }; delete n[id]; return n; }); hint("freeze", "a version with your yes; its stamp says which"); };
  const close = (id: string) => {
    setDying((s) => new Set([...s, id]));
    setPicked((s) => { const n = new Set(s); n.delete(id); return n; });
    if (focusBack.current?.id === id) focusBack.current = null;
    setTimeout(() => { store.close(session, id, by); setDying((s) => { const n = new Set(s); n.delete(id); return n; }); }, dur("pour"));
    hint("close", "⌘⌫ · its ledger keeps it");
  };
  const unfocus = () => {
    const f = focusBack.current;
    focusBack.current = null;
    if (f && placeOf(f.id)) { pour([f.id]); setPlace(f.id, { x: f.x, y: f.y, w: f.w, h: f.h }); }
  };
  const focus = (id: string) => {
    const p = placeOf(id);
    if (!p) return;
    if (focusBack.current?.id === id) { unfocus(); return; }
    let blocks = latest().blocks;
    const was = focusBack.current;
    if (was) blocks = blocks.map((x) => (x.id === was.id ? { ...x, x: was.x, y: was.y, w: was.w, h: was.h } : x));
    focusBack.current = { ...p, folded: false };
    pour(was ? [id, was.id] : [id]);
    write(blocks.map((x) => (x.id === id ? { ...x, ...zoneRect(size, "full"), folded: false, z: zTop() + 1 } : x)));
    hint("pop", "⌘1-9 · esc puts it back");
  };
  const tileAll = () => {
    if (!on.length) return;
    // a focused block is tiled from its own place, so ⌘⇧F puts it back there, not full
    const base = unfocused(latest().blocks), ids = on.map((p) => p.id);
    freeRects.current = base.filter((p) => ids.includes(p.id)).map((p) => ({ ...p }));
    const cells = tile(size, ids.length);
    pour(ids);
    write(base.map((p) => { const i = ids.indexOf(p.id); return i < 0 ? p : { ...p, ...cells[i] }; }), { tiled: true });
    say("tile · ⌘⇧T · ⌘⇧F puts them back");
  };
  const untile = () => {
    const f = freeRects.current;
    if (!f) return;
    freeRects.current = null;
    pour(f.map((p) => p.id));
    write(latest().blocks.map((p) => { const was = f.find((x) => x.id === p.id); return was ? { ...p, x: was.x, y: was.y, w: was.w, h: was.h } : p; }), { tiled: false });
  };

  // ── move, snap, the slots ────────────────────────────────────────────────────────────────────────────────────
  const onHead = (b: Block) => (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button,.st-vers") || e.button !== 0) return;
    if (e.shiftKey) { setPicked((s) => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; }); hint("select", "⇧click or a marquee · esc lets go"); return; }
    const p = shownAt(b.id), box = el.current?.getBoundingClientRect();
    if (!p || !box) return;
    lift(b.id);
    const head = e.currentTarget, ox = e.clientX - box.left - p.x, oy = e.clientY - box.top - p.y;
    head.setPointerCapture(e.pointerId);
    let r: Rect = { x: p.x, y: p.y, w: p.w, h: p.h }, zone: Zone | null = null, moved = false, row: string | null = null, off = false;
    const mv = (ev: PointerEvent) => {
      moved = true;
      // off Sol's window: let go and it is its own window (pop out)
      const was = off;
      off = outside({ w: window.innerWidth, h: window.innerHeight }, ev.clientX, ev.clientY);
      if (off !== was) say(off && !nearSeam(ev.clientX, ev.clientY) ? "let go: its own window" : "");
      carryMove(b.id, b.title, { x: ev.clientX - ox, y: ev.clientY - oy, w: p.w, h: p.h }, ev.clientX, ev.clientY, b.kind);   // #1090: the other window's peek
      const sn = snap(size, r, ev.clientX - box.left - ox, ev.clientY - box.top - oy, others(b.id));
      r = { ...r, ...keep(size, r, sn.x, sn.y) };
      // a session row under the pointer: carry (play.html's overRow); the stage's own slots wait. #1045: with cross on, a
      // Home folder on the shelf by the spine first (folderAt opens the shelf near the spine; nothing while it is off)
      row = nearSeam(ev.clientX, ev.clientY) ? null : folderAt({ x: ev.clientX, y: ev.clientY }, { id: b.id, title: b.title }) ?? rowAt(ev.clientX, ev.clientY, session);
      setCarryOver(row);
      zone = row || nearSeam(ev.clientX, ev.clientY) ? null : zoneAt(size, ev.clientX - box.left, ev.clientY - box.top);   // #1090: at the seam the other window's peek is the answer, no landing box
      setDrag({ id: b.id, r }); setGuides(row ? NO_GUIDES : sn.guides); setGhost(zone ? zoneRect(size, zone) : null);
    };
    const up = (ev: PointerEvent) => {
      head.removeEventListener("pointermove", mv); head.removeEventListener("pointerup", up); head.removeEventListener("pointercancel", up);
      setDrag(null); setGuides(NO_GUIDES); setGhost(null); setCarryOver(null);
      if (!moved) return;
      // #1090: past the seam, half over it, or flicked toward it: it lands on the other window, the same block
      if (ev.type === "pointerup" && throwOnLetGo(b.id, { x: ev.clientX - ox, y: ev.clientY - oy, w: p.w, h: p.h }, ev.clientX, ev.clientY)) return;   // it slides out here; its wash plays where it lands
      carryEnd(b.id);
      if (off && ev.type === "pointerup") {
        pour([b.id]);
        popOut(b, { x: ev.screenX - ox, y: ev.screenY - oy, w: p.w, h: p.h });
        return;
      }
      if (row && ev.type === "pointerup" && isHomeRow(row)) {
        // #1045: put down in a Home folder: it lives there by reference (the engine's cross record); here it pours back
        pour([b.id]);
        const id = placeOfRow(row);
        seat({ id: b.id, title: b.title }, session, { id, name: folderName(id) });
        return;
      }
      if (row && ev.type === "pointerup") {
        // carried: the same block there too; here it pours back to where it was
        pour([b.id]);
        store.carry(session, b.id, row, by);
        say(`${b.title} is in "${nameOf(row)}" too · the same artifact, one ledger`);
        return;
      }
      if (zone === "full") { focus(b.id); store.update(session, b.id, {}, "placed: full", by); return; }
      if (zone) r = { ...r, ...zoneRect(size, zone) };
      else { const s = settle(size, r); r = { ...r, ...s }; }
      if (focusBack.current?.id === b.id) focusBack.current = null;
      // let go where it reads (#872): its place in the reading order is where it was dropped, and the stage is laid again
      // round it, so it never lands on another; where the rule cannot lay it, it stays where it was let go
      const z = zTop() + 1, here = latest().blocks.map((x) => (x.id === b.id ? { ...x, ...r, z } : x));
      const l = laid(here, size, readingOrder(here.filter((x) => live.some((k) => k.id === x.id))));
      if (l) { pour(l.blocks.map((x) => x.id)); write(l.blocks); }
      else { pour([b.id]); setPlace(b.id, { ...r, z }); }
      store.update(session, b.id, {}, zone ? `placed: ${zone}` : "moved", by);
    };
    head.addEventListener("pointermove", mv); head.addEventListener("pointerup", up); head.addEventListener("pointercancel", up);
    // #1090, only with the switch on (off: Esc reaches the stage's own, as before): Esc during a carry puts it back where
    // it was, writing nothing, and the other window's peek goes. Gone with the carry, however it ends
    if (!screensOn()) return;
    const stop = () => {
      window.removeEventListener("keydown", esc, true);
      head.removeEventListener("pointerup", stop); head.removeEventListener("pointercancel", stop); head.removeEventListener("lostpointercapture", stop);
      if (carryStop.current === stop) carryStop.current = null;
    };
    carryStop.current?.();
    carryStop.current = stop;
    const esc = (k: KeyboardEvent) => {
      if (k.key !== "Escape") return;
      k.preventDefault(); k.stopPropagation();
      head.removeEventListener("pointermove", mv); head.removeEventListener("pointerup", up); head.removeEventListener("pointercancel", up);
      stop();
      try { head.releasePointerCapture(e.pointerId); } catch { /* not held */ }
      setDrag(null); setGuides(NO_GUIDES); setGhost(null); setCarryOver(null); say("");
      carryEnd(b.id);
      pour([b.id]);
    };
    window.addEventListener("keydown", esc, true);
    head.addEventListener("pointerup", stop); head.addEventListener("pointercancel", stop); head.addEventListener("lostpointercapture", stop);
  };
  const onGrip = (b: Block) => (e: RPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const p = shownAt(b.id);
    if (!p) return;
    lift(b.id);
    const g = e.currentTarget, x0 = e.clientX, y0 = e.clientY;
    g.setPointerCapture(e.pointerId);
    let r: Rect = { x: p.x, y: p.y, w: p.w, h: p.h };
    const mv = (ev: PointerEvent) => {
      const sn = snapSize(size, r, p.w + ev.clientX - x0, p.h + ev.clientY - y0, others(b.id));
      // the grip stops a gap short of a neighbour (#872): a block is never pulled over another
      let w = sn.w, h = sn.h;
      for (const o of others(b.id)) {
        if (!overlaps({ ...r, w, h }, o)) continue;
        if (o.x >= p.x + p.w + GAP - 1) w = Math.max(MIN.w, Math.min(w, o.x - GAP - r.x));
        if (overlaps({ ...r, w, h }, o) && o.y >= p.y + p.h + GAP - 1) h = Math.max(MIN.h, Math.min(h, o.y - GAP - r.y));
      }
      if (others(b.id).some((o) => overlaps({ ...r, w, h }, o))) return;
      r = { ...r, w, h };
      setDrag({ id: b.id, r }); setGuides(sn.guides);
    };
    const up = () => {
      g.removeEventListener("pointermove", mv); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up);
      setDrag(null); setGuides(NO_GUIDES);
      setPlace(b.id, { w: r.w, h: r.h });
      store.update(session, b.id, {}, "resized", by);
    };
    g.addEventListener("pointermove", mv); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
  };

  // a marquee on the bare stage picks what it touches
  const onBare = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).closest(".st-empty")) return;
    const box = el.current!.getBoundingClientRect(), x0 = e.clientX - box.left, y0 = e.clientY - box.top, me = e.currentTarget;
    setPicked(new Set());
    me.setPointerCapture(e.pointerId);
    let n = 0;
    const mv = (ev: PointerEvent) => {
      const x = ev.clientX - box.left, y = ev.clientY - box.top, q = { x: Math.min(x, x0), y: Math.min(y, y0), w: Math.abs(x - x0), h: Math.abs(y - y0) };
      setMarq(q);
      const ids = within(q, on);
      n = ids.length;
      setPicked(new Set(ids));
    };
    const up = () => {
      me.removeEventListener("pointermove", mv); me.removeEventListener("pointerup", up); me.removeEventListener("pointercancel", up);
      setMarq(null);
      if (n > 1) say(`${n} picked · @ on one of them attaches all ${n} to your next message`);
    };
    me.addEventListener("pointermove", mv); me.addEventListener("pointerup", up); me.addEventListener("pointercancel", up);
  };

  // ── point and say (#698, play.html's wireParts), chosen on purpose (#953): the pointer resting on a part of a block
  // (any element with data-part; a page's own parts tell it from their frame) only lights it after a beat. Nothing goes
  // with a message until the block's reference icon (@, its head) is pressed: it attaches the lit part, else the block,
  // else, on a picked block, all the picks; the bar shows each beside the box with its ×. A hover, a scroll or a click
  // attaches nothing. The engine hears what is attached as it changes (work.stage.point), so its read names only that
  const hoverT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lit = useRef<HTMLElement | null>(null);
  const litPart = useRef<{ id: string; part: string } | null>(null);
  const titleOf = (id: string) => seen.blocks.find((b) => b.id === id)?.title ?? id;
  // #954: each carries its block's kind, for the "on" token's mark
  const words = (t: { id: string; part?: string }) => ({ ...t, words: targetWords(titleOf(t.id), t.part), kind: live.find((b) => b.id === t.id)?.kind });
  const reference = (id: string) => {
    if (picked.has(id) && picked.size > 1) { pointAt([...picked].map((p) => words({ id: p }))); return; }
    const part = litPart.current?.id === id ? litPart.current.part : undefined;
    attach(words({ id, ...(part ? { part } : {}) }));
  };
  const light = (p: HTMLElement | null) => { lit.current?.classList.remove("st-on"); lit.current = p; p?.classList.add("st-on"); };
  const onOver = (e: RPointerEvent<HTMLDivElement>) => {
    if (drag) return;
    const p = (e.target as HTMLElement).closest<HTMLElement>("[data-part]"), blk = p?.closest<HTMLElement>("[data-block]");
    clearTimeout(hoverT.current);
    // gone to another block, or off the blocks: the lit part goes out, so the icon never attaches a part looked at long ago
    if (litPart.current && (e.target as HTMLElement).closest<HTMLElement>("[data-block]")?.dataset.block !== litPart.current.id) { light(null); unlitPages(); litPart.current = null; }
    if (!p || !blk || p === lit.current) return;
    hoverT.current = setTimeout(() => { light(p); unlitPages(); litPart.current = { id: blk.dataset.block!, part: p.dataset.part! }; }, HOVER);
  };
  const unlitPages = (but?: Window | null) => el.current?.querySelectorAll("iframe").forEach((f) => { if (f.contentWindow !== but) f.contentWindow?.postMessage({ sol: "unpart" }, "*"); });
  useEffect(() => {
    const hear = (ev: MessageEvent) => {
      const m = ev.data as { sol?: string; part?: string } | null;
      if (m?.sol !== "part" || typeof m.part !== "string") return;
      const f = [...(el.current?.querySelectorAll("iframe") ?? [])].find((x) => x.contentWindow === ev.source);
      const id = f?.closest<HTMLElement>("[data-block]")?.dataset.block;
      if (!id) return;
      light(null); unlitPages(ev.source as Window);
      litPart.current = { id, part: m.part.slice(0, 80) };
    };
    window.addEventListener("message", hear);
    return () => window.removeEventListener("message", hear);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  // the engine hears what is attached, as it changes: attached, taken off, sent
  const onKey = bar.on.map((o) => `${o.id} ${o.part ?? ""}`).join("|");
  useEffect(() => { store.point?.(session, bar.on.map(({ id, part }) => ({ id, ...(part ? { part } : {}) }))); }, [onKey, session]); // eslint-disable-line react-hooks/exhaustive-deps

  // a chip dragged from the bar onto the stage: the ghost of its kind's size follows; dropped, it is that thing's slot
  const chipOf = (e: RDragEvent) => e.dataTransfer.types.includes(CHIP);
  const spotOf = (e: RDragEvent, i?: number) => {
    const box = el.current!.getBoundingClientRect(), things = barState().things;
    const t = things[i ?? dragging.current ?? things.findIndex((x) => !x.slot)] ?? things[0];
    return ghostAt(size, t?.kind ?? "page", e.clientX - box.left, e.clientY - box.top);
  };
  const onDragOver = (e: RDragEvent<HTMLDivElement>) => {
    if (!chipOf(e)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "move";
    setGhost(spotOf(e));
  };
  const onDrop = (e: RDragEvent<HTMLDivElement>) => {
    const i = e.dataTransfer.getData(CHIP);
    if (i === "" || !barState().things[+i]) { setGhost(null); return; }
    e.preventDefault();
    slotThing(+i, spotOf(e, +i));
    say(`${barState().things[+i]?.title ?? "it"} will land there`);
    setGhost(null);
  };
  const dragging = useRef<number | null>(null);
  useEffect(() => { const f = (ev: Event) => { dragging.current = (ev as CustomEvent<number | null>).detail; if (dragging.current === null) setGhost(null); }; window.addEventListener(CHIP_EVENT, f); return () => window.removeEventListener(CHIP_EVENT, f); }, []);

  // ── the keys (play.html's #keys line), answered first so Esc goes back before it stops a turn ───────────────────
  const numbered = lines ?? live.filter((b) => !placeOf(b.id)?.popped);
  const keys = useRef({ tileAll, untile, focus, unfocus, unfold, close, picked, live: numbered, placeOf, ledger, setLedger, setPicked });
  keys.current = { tileAll, untile, focus, unfocus, unfold, close, picked, live: numbered, placeOf, ledger, setLedger, setPicked };
  useEffect(() => {
    if (!active) return;
    const down = (e: KeyboardEvent) => {
      if (!el.current?.offsetParent) return;   // a pane kept behind another tab: not showing, not answering
      const k = keys.current, meta = e.metaKey || e.ctrlKey, typing = (e.target as HTMLElement | null)?.closest?.("input,textarea,[contenteditable=true]");
      const took = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (e.key === "Escape") {
        if (carryStop.current) return;   // #1090: a block is being carried: its own Esc puts it back
        if (focusBack.current) { took(); k.unfocus(); }
        else if (k.ledger) { took(); k.setLedger(null); }
        else if (k.picked.size) { took(); k.setPicked(new Set()); }
        else if (barState().on.length) { took(); pointAt([]); }
        return;
      }
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (e.shiftKey && key === "t") { took(); k.tileAll(); return; }
      if (e.shiftKey && key === "f") { took(); k.untile(); return; }
      if (!e.shiftKey && /^[1-9]$/.test(e.key)) {
        const b = k.live[+e.key - 1];
        if (!b) return;
        took();
        if (k.placeOf(b.id)?.folded) k.unfold(b.id);
        k.focus(b.id);
        return;
      }
      if (e.key === "Backspace" && k.picked.size && !typing) { took(); [...k.picked].forEach((id) => k.close(id)); }
    };
    window.addEventListener("keydown", down, true);
    return () => window.removeEventListener("keydown", down, true);
  }, [active]);

  // a frame's presses, the same functions for the block's whole life: each reads the stage as it is when pressed
  const now = useRef({ onHead, onGrip, focus, fold, freeze, close, reference: (_id: string) => {}, openLine: (_id: string) => {}, blocks: seen.blocks });
  const presses = useRef(new Map<string, Presses>());
  const pressesOf = (id: string): Presses => {
    let h = presses.current.get(id);
    if (h) return h;
    const blk = () => now.current.blocks.find((b) => b.id === id);
    h = {
      act: (patch, line) => store.update(session, id, patch, line, by),
      onHead: (e) => { const b = blk(); if (b) now.current.onHead(b)(e); },
      onGrip: (e) => { const b = blk(); if (b) now.current.onGrip(b)(e); },
      onRef: () => now.current.reference(id),   // #953: the @ in its head attaches it
      onFocus: () => now.current.focus(id), onFold: () => now.current.fold(id), onFreeze: () => now.current.freeze(id), onClose: () => now.current.close(id),
      onLedger: () => setLedger((l) => (l === id ? null : id)),
      onVersion: (v) => {
        const b = blk();
        if (!b) return;
        if (v > b.versions.length) { setShown((s) => ({ ...s, [id]: v })); store.update(session, id, { state: "live" }, `back to live · v${b.versions.length + 1} is what changes next`, by); }
        else { setShown((s) => ({ ...s, [id]: v })); if (b.state !== "frozen") store.update(session, id, { state: "frozen" }, `showing v${v}`, by); }
      },
    };
    presses.current.set(id, h);
    return h;
  };
  const onLine = useCallback((id: string) => now.current.openLine(id), []);
  // in the TUI the blocks it folded are its lines, not chips too
  const folded = live.filter((b) => placeOf(b.id)?.folded && !placeOf(b.id)?.popped && !(term && placeOf(b.id)?.lensed) && !isRunBody(b.body));
  const popped = live.filter((b) => placeOf(b.id)?.popped);
  // the foot names this session's own; what was carried in from earlier sessions is one chip until pressed
  const foldedOwn = allFolds ? folded : folded.filter((b) => ownHere(b, session)), carried = folded.length - folded.filter((b) => ownHere(b, session)).length;
  // opened from the TUI's lines: unfolded where it was and focused
  const openLine = (id: string) => { if (placeOf(id)?.folded) unfold(id); focus(id); };
  now.current = { onHead, onGrip, focus, fold, freeze, close, reference, openLine, blocks: seen.blocks };
  // a run opened over the whole stage (its chip pressed) is the stage while it covers it: the blocks under it wait unseen
  const full = W ? zoneRect(size, "full") : null;
  const cover = focusBack.current ? on.find((p) => p.id === focusBack.current!.id) : undefined;
  const runOver = full ? on.filter((p) => isRunBody(live.find((b) => b.id === p.id)?.body) && p.w >= full.w - 1 && p.h >= full.h - 1).sort((x, y) => y.z - x.z)[0] : undefined;
  // stage: joins runs (#703): the project's runs, folded, are chips by the talk
  const here = useMemo(() => ({ store, session }), [store, session]);
  const runChips = live.filter((b) => placeOf(b.id)?.folded && isRunBody(b.body)).map((b) => <RunChip key={b.id} body={b.body as never} onOpen={() => openRun(b.id)} />);
  return (
    <StageHere.Provider value={here}>
    <div ref={el} className={`st-stage marks-pearl ${drag ? "dragging" : ""}`} onPointerDown={onBare} data-stage={session} data-lens={lens} {...(cross ? { "data-cross-drop": "stage" } : {})}
      onPointerOver={onOver} onPointerLeave={() => clearTimeout(hoverT.current)} onDragOver={onDragOver} onDragLeave={(e) => { if (e.currentTarget === e.target) setGhost(null); }} onDrop={onDrop}>
      {!live.length && <div className="st-empty"><div><b>nothing on the stage</b>ask for one thing, or three at once</div></div>}
      {live.map((b, i) => {
        const p = shownAt(b.id);
        if (!p || p.folded || p.popped || !W) return null;
        if (runOver && runOver.id !== b.id && p.z < runOver.z) return null;   // under the opened run: glass would show it through
        if (cover && cover.id !== b.id && p.z < cover.z) return null;   // under the focused block: it covers on purpose, nothing peeks
        const r = drag?.id === b.id ? { ...p, ...drag.r } : p;
        return (
          <SameFrame key={b.id} session={session} b={worked.has(b.id) && b.state === "live" ? workedOf(b) : b} r={r} n={i + 1} made={seen.ledger[b.id]?.[0]?.at} picked={picked.has(b.id)} still={asks !== b.id} moving={moving.has(b.id)} born={born.has(b.id)} coming={coming.has(b.id)} dying={dying.has(b.id)} dragged={!!drag}
            ledger={ledger === b.id ? seen.ledger[b.id] ?? NO_LINES : null} sessions={b.sessions} shown={shown[b.id]}
            lines={term?.id === b.id && lines ? lines : undefined} onLine={onLine} {...pressesOf(b.id)} attached={bar.on.some((o) => o.id === b.id)} />
        );
      })}
      {guides.x !== null && <div className="st-guide v" style={{ left: guides.x }} />}
      {guides.y !== null && <div className="st-guide h" style={{ top: guides.y }} />}
      {ghost && <div className="st-ghost" style={{ left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h }}><svg width={ghost.w} height={ghost.h} aria-hidden><path d={curve(ghost.w - 1, ghost.h - 1, R, S, 0.5, 0.5)} /></svg></div>}
      {marq && <div className="st-marq" style={{ left: marq.x, top: marq.y, width: marq.w, height: marq.h }} />}
      {chipAt ? createPortal(runChips, chipAt) : null}
      {(folded.length > 0 || popped.length > 0 || (!chipAt && runChips.length > 0)) && (
        <div className={`st-folds ${allFolds ? "all" : ""}`}>
          {!chipAt && runChips}
          {carried > 0 && <button className="st-chip st-chipmore" aria-expanded={allFolds} title="blocks carried in from earlier sessions" onClick={() => setAllFolds((v) => !v)}>{allFolds ? "fewer" : `${carried} earlier`}</button>}
          {foldedOwn.map((b) => <button key={b.id} className="st-chip" title={fileOf(b) || undefined} onClick={() => { unfold(b.id); setAllFolds(false); }}><Mark kind={b.kind} />{b.title}{b.kind === "list" ? ` · ${doneOf(b.body as never)} of ${(b.body as { steps?: unknown[] })?.steps?.length ?? 0}` : ""}</button>)}
          {popped.map((b) => <button key={b.id} className="st-chip popped" title="its own window · a click brings it back" data-popped={b.id} onClick={() => unpop(b.id)}><Mark kind={b.kind} />{b.title}<span className="st-chipk">popped out</span></button>)}
        </div>
      )}
      <Toast words={asks && live.find((b) => b.id === asks)?.state === "waits" ? null : toast} />
    </div>
    </StageHere.Provider>
  );
}

/** the toast at the stage's foot: the verb in the jelly's bands, then its words ("fold · its chip at the foot puts it
 *  back"); one at a time, gone after two pours */
function Toast({ words }: { words: string | null }) {
  const [verb, ...rest] = (words ?? "").split(" · ");
  return <div className={`st-toast ${words ? "on" : ""}`}>{rest.length ? <><b>{verb}</b>{rest.join(" · ")}</> : verb}</div>;
}
