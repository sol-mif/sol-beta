// The stage behind the build switches (stage.whole, Part B of #751; stage.said, #903): the night's stage of 2026-11-10,
// joined beside the one Marco's window draws (Stage.tsx, the #872 material) and drawn in its place only while one of
// those switches is on. It carries main's moving between blocks (#737: ⌘1-9 and Tab hold a block, ⌘Z every move, ghosts)
// and the tray (#739), which his window does not show yet; when the switches go on for good, this file becomes Stage.tsx
// and the other goes. What follows is its own header, as it was.
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
//   fold, ⌘W, ⌘⇧W          the block goes to the tray at the stage's foot (Tray.tsx, trayRules.ts): dragged there, or ⌘W on
//                          the focused block, ⌘⇧W all but it; ⌘Z brings the last fold back
//   the tray               a hairline with a count, folded by default; open, the stage's own folded blocks in front,
//                          solid-small, and the project's other blocks as outlines by the session that made them (#739);
//                          a press brings one onto the stage, a drag puts it where it is let go (pulled: carried here)
//   a full stage           a newcomer never shrinks the others: the oldest untouched block folds to the tray and the
//                          newcomer takes its spot; a block moved or resized by hand is never folded for room
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
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type DragEvent as RDragEvent, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from "react";
import { curve, useSize } from "../kit";
import { CURVE } from "../kit/tokens";
import { GAP, PAD, bornSize, fit, fitInto, keep, settle, snap, snapSize, tile, within, zoneAt, zoneRect, type Block, type Guides, type Lens, type Place, type Rect, type StageJson, type Zone } from "./model";
import { type Act } from "./kinds";
import { historyOf } from "./store";
import { applySide, ghostFade, readingOrder, stepOf, walk, zoomStep, type Side, type Step } from "./moving";
import { SIZE as JELLY_SIZE } from "./useJelly";
import { ghostAt, targetWords } from "./ask";
import { CHIP, CHIP_EVENT, attach, barState, keptOn, pointAt, setRoom, slotThing, useBar } from "./bar";
import { nameOf, rowAt, setCarryOver } from "./carry";
import { useCross } from "../cross/flag";   // #1031: Home and Build, one place
import { folderAt, isHomeRow, placeOfRow } from "../cross/shelf";
import { seat } from "../cross/store";
import { folderName } from "../cross/folders";
import { LENS_WORDS, TUI_TITLE, adopt, backFromLens, drawLens, ideGroups, switchLens, tuiLines } from "./lens";   // #1001 backFromLens
import { backBlock, onBack, outside, popOutBlock } from "./pop";
import { createPortal } from "react-dom";
import { RunChip } from "./kinds/RunRows";
import { Tray } from "./Tray";
import { dropAt, focusedOf, groups as trayGroups, makeRoom, unfoldBack, type Mini } from "./trayRules";
import { isRunBody } from "./kinds/runs";
import { Frame } from "./kinds/Frame";
import { anyWhole, stageWhole, stageSaid, useStageSaid } from "../flag";   // B10, #891
import { mover } from "../attention";   // #891
import { wholeDrag } from "./drag";   // B10
import { plan as wholePlan } from "./geometry";   // B12
import { clampIn, fitGrow, freeSpot, fitWhole, inside as insideRoom, overlaps, drawnSolid } from "./geometry";   // B17: the fitted height through the place search; #891 drawnSolid; #1001 fitGrow
import { fitOf } from "./Edges";   // B12
import { wholePinch, wholeResize } from "./resizeHand";   // B12
import type { Edge } from "./resize";   // B12
import { EMPTY_UNDO, record as undoRecord, undo as undoPop, redo as undoRedo, type Snapshot } from "./geometry";   // B15
import { droppedCloses, nothing, nudge, placesAfter, restore, stageShot } from "./undo";   // B15
import { fadeIn, fadeOut, travel } from "./travel";   // B15
import { Scar } from "./Scar";   // B15
import { LIFE } from "../kit/feel";   // B15
import { flushSync } from "react-dom";   // B16
import { TRAY } from "../kit/feel";   // B16
import { copyAt, squareRect, trayGroups as wholeTrayGroups, trayOf, type Mini as WholeMini } from "./trayFold";   // B16 (beside #739's trayRules)
import { flyFromTray, flyToTray, unpaint } from "./trayHand";   // B16
import { WholeTray } from "./WholeTray";   // B16
import { Mark } from "./kinds/Mark";   // B16: a popped block's chip beside the whole tray
import { footRow } from "./footRow";   // B25
import { bornAt, fitH } from "./born";   // B17
import { footBack, footFly } from "./talkFull";   // B25
import { dropPreview, guidesOf, zRanks } from "./preview";   // B11
import { previewPainter, type Painter } from "./previewPaint";   // B11
import { SAID_STAYS, agentStep, closerOf, lostOf, sentence, stepOfShots, type Closer, type Said } from "./said";   // #903; #1001 stepOfShots
import type { StageProps } from "./Stage";
import "./stage.css";
import { dur } from "../motion";

const R = CURVE.radius.block, S = CURVE.smoothing;
const NO_GUIDES: Guides = { x: null, y: null };
/** how long the pointer rests on a part before it is the target (play.html's 320 ms) */
const HOVER = 320;
/** how near the jelly's centre a press picks it up: its frame's half (useJelly SIZE) */
const JELLY_REACH = JELLY_SIZE / 2;



/** the slots the engine names, as the stage's own on its real width (an agent's `place` with a slot, #709) */
const SLOT: Record<string, (s: { w: number; h: number }) => Rect> = {
  full: (s) => zoneRect(s, "full"), left: (s) => zoneRect(s, "left"), right: (s) => zoneRect(s, "right"), bottom: (s) => zoneRect(s, "bottom"),
  top: (s) => { const f = zoneRect(s, "full"), b = zoneRect(s, "bottom"); return { ...f, h: b.h }; },
};

/** one stage per session: another session's is another stage, so coming back opens exactly its stage.json, with no
 *  births, no jelly acts and no focus or tile kept from the session before (#700) */
export function StageNext(p: StageProps) { return <OneStage key={p.session} {...p} />; }

function OneStage({ store, session, by = "you", active = true, jelly, chipAt, busy = false, onTalk, talkFull = false, onFootBack }: StageProps) {   // B25: talkFull, onFootBack
  const seen = useSyncExternalStore(useCallback((f: () => void) => store.subscribe(session, f), [store, session]), () => store.read(session));
  const el = useRef<HTMLDivElement>(null);
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
  const [ledger, setLedger] = useState<string | null>(null);
  const [shown, setShown] = useState<Record<string, number>>({});   // the version a frozen block shows, 1-based
  const [toast, setToast] = useState<string | null>(null);
  // the line of what was just done (#903, said.ts), behind stage.said: the last thing said, the titles this stage has
  // shown (a closed block is still named by its title), who closed a block when the agent's step said it, the blocks
  // this window closed (never called another's close), the read of the stage the agent's step is measured from
  const saidOn = useStageSaid();
  const cross = useCross();   // #1031: the stage takes a thing carried from Home
  const [said, setSaid] = useState<Said | null>(null);
  const titles = useRef(new Map<string, string>());
  const closers = useRef(new Map<string, Closer>());
  const mineClosed = useRef(new Set<string>());
  // moving between blocks (#737): the block that holds the keys (⌘1-9, Tab, a press in it), each block's content zoom,
  // the ghosts fading to the foot
  const [held, setHeld] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Record<string, number>>({});
  const [fading, setFading] = useState<Set<string>>(new Set());
  // ⌘Z's one stack (#737, #739): every step of the hand. With stage.whole on, ⌘Z is the whole stage's (B15, b9's stack):
  // a step this history takes is recorded there too, its before taken here and its after once it is written (write)
  const steps = historyOf(session), wholeStep = useRef<Snapshot | null>(null);
  // #903 (stage.said): every step pushed here is said on the line under the stage; `room` the newcomer a fold made room for
  const history = {
    push: (st: Step | null, room?: string) => {
      if (st && stageWhole() && !wholeStep.current) wholeStep.current = shot();
      steps.push(st);
      if (st && stageSaid()) setSaid({ who: "you", how: "did", step: st, ...(room ? { room } : {}) });
    },
    undo: () => steps.undo(), redo: () => steps.redo(),
  };
  const focusBack = useRef<Place | null>(null);
  /** whether a point is over the tray at the stage's foot (#739) */
  const trayHit = (x: number, y: number) => { const t = el.current?.querySelector("[data-tray]")?.getBoundingClientRect(); return !!t && x >= t.left && x <= t.right && y >= t.top && y <= t.bottom; };
  const freeRects = useRef<Place[] | null>(null);
  const known = useRef<Set<string> | null>(null);
  // the tray (#739): open or folded; a head dragged over it. The folds ⌘Z brings back are steps of the stage's history
  const [trayOpen, setTrayOpen] = useState(false);
  const [ideTab, setIdeTab] = useState<Record<number, string>>({});   // #954: each editor group's open tab
  const [overTray, setOverTray] = useState(false);
  const bar = useBar();
  // the bar reads the stage's room for "beside the week" (ask.ts beside)
  useEffect(() => { if (W && H) setRoom({ size: { w: W, h: H }, places: seen.stage.blocks.filter((p) => !p.folded).map((p) => ({ ...p, title: seen.blocks.find((b) => b.id === p.id)?.title ?? "" })) }); }, [seen, W, H]);

  const live = seen.blocks.filter((b) => b.state !== "dead");
  // B15: the closes the face holds (faded, outlined, undoable) until they can no longer come back
  const closedHeld = useRef(new Set<string>());
  const [, bumpHeld] = useState(0);
  // #1042 (#1043, joined into the stage's next): a block that leaves (closed, or held closed for its undo) leaves the box's
  // "on" with it; only a block that was here and went, never one not loaded yet
  const hereNow = live.filter((b) => !closedHeld.current.has(b.id)).map((b) => b.id).join(" ");
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
  const on = seen.stage.blocks.filter((p) => !p.folded && !p.popped && !closedHeld.current.has(p.id) && live.some((b) => b.id === p.id)).map((p) => shownAt(p.id)!);
  const lens: Lens = seen.stage.lens ?? "app";
  // the TUI's terminal, and the other blocks as its lines (lens.ts): ⌘1-9 opens those
  const term = lens === "tui" ? seen.stage.blocks.find((p) => p.tui && !p.folded && live.some((b) => b.id === p.id)) ?? null : null;
  const lines = term ? tuiLines(seen.stage.blocks, live, term.id) : null;
  const others = (id: string) => on.filter((p) => p.id !== id);

  // #1001: with stage.said on the line says it whatever stage.whole says (a lens, a carry, a block that waits in the
  // tray were silent with both on); stage.whole alone has no toasts (B15)
  const say = useCallback((m: string) => { if (stageSaid()) { setSaid({ who: "note", words: m }); return; } if (stageWhole()) return; setToast(m); }, []);   // B15: no toasts with stage.whole on; #903: with stage.said on, the line says it
  for (const b of seen.blocks) titles.current.set(b.id, b.title);
  const saidTitle = (id: string) => titles.current.get(id) ?? "an artifact";
  useEffect(() => { if (!said) return; const t = setTimeout(() => setSaid(null), SAID_STAYS); return () => clearTimeout(t); }, [said]);
  // the agent's step (#903): measured between two reads of the stage; never said while a block waits on the person (one
  // thing asks at a time), never over the line that already names it (a fold made room for its newcomer)
  const seenWas = useRef<typeof seen | null>(null), roomFor = useRef<typeof seen | null>(null);
  useEffect(() => {
    if (seen.ready === false) return;
    const was = seenWas.current;
    seenWas.current = seen;
    if (!was || !saidOn) return;
    const s = agentStep(was, seen, mineClosed.current);
    for (const id of mineClosed.current) if (!seen.stage.blocks.some((p) => p.id === id)) mineClosed.current.delete(id);
    if (!s) return;
    if (s.who === "agent" || s.who === "elsewhere") if (s.act === "closed") for (const id of s.ids) closers.current.set(id, s.who);
    if (s.who === "agent" && seen.blocks.some((b) => b.state === "waits")) return;
    if (s.who === "agent" && s.act === "opened" && roomFor.current === seen) return;
    setSaid(s);
  }, [seen, saidOn]);
  // the key hints are not burned into the frame (v4 §4): the toast at the stage's foot names a verb the first time it is used
  const named = useRef(new Set<string>());
  const hint = (verb: string, words?: string) => { if (stageSaid() || named.current.has(verb)) return; named.current.add(verb); say(words ? `${verb} · ${words}` : verb); };
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), dur("pour") * 2); return () => clearTimeout(t); }, [toast]);
  const pour = (ids: string[]) => {
    setMoving((m) => new Set([...m, ...ids]));
    setTimeout(() => setMoving((m) => { const n = new Set(m); ids.forEach((i) => n.delete(i)); return n; }), dur("pour"));
  };
  // the stage as it is now, not as it was when a drag or a timer began: a block that arrived meanwhile keeps its place
  const latest = () => store.read(session).stage;
  const write = (blocks: Place[], patch: Partial<StageJson> = {}) => {
    store.place(session, { ...latest(), ...patch, blocks });
    const b = wholeStep.current;   // B15: a history step just written is one entry of the whole stage's undo
    if (b) { wholeStep.current = null; rec("step", b); }
  };
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
  // a move of the person's hand (move, resize, fold, pop, close, tidy, fill): written, and kept as one step for ⌘Z (#737)
  const moved = (blocks: Place[], patch?: Partial<StageJson>) => { history.push(stepOf(latest().blocks, blocks)); write(blocks, patch); };
  const movePlace = (id: string, p: Partial<Place>, patch?: Partial<StageJson>) => moved(latest().blocks.map((x) => (x.id === id ? { ...x, ...p } : x)), patch);
  /** a ghost taken (#737): a press on it, its chip opened, Enter while it is held; the mark goes, the body fills in place */
  const solidOf = (p: Place): Place => { const { ghost: _g, ...q } = p; return q; };
  const take = (id: string) => {
    const p = placeOf(id);
    if (!p?.ghost) return;
    write(latest().blocks.map((x) => (x.id === id ? solidOf(x) : x)));
    // #1001: a ghost was born at a size without its body; taken, it is fitted to what it shows (B17), never left cut
    if (stageWhole()) toFit.current.add(id);
    setFading((s) => { const n = new Set(s); n.delete(id); return n; });
  };
  const lift = (id: string) => { const p = placeOf(id); if (p && p.z !== zTop()) setPlace(id, { z: zTop() + 1 }); };

  // B17 (#780): with stage.whole on, a block is born at its content's size (born.ts) and fitted once it has rendered
  const toFit = useRef(new Set<string>());
  // a block with no place yet is born where the stage is free; when nothing is free the stage tiles itself
  // A block the engine placed on its own nominal stage (`auto`) or in a slot it named is laid out again here, on the
  // stage's real width (#709)
  useLayoutEffect(() => {
    if (!W || !H || seen.ready === false) return;
    const ids = new Set(live.map((b) => b.id));
    if (known.current === null) known.current = new Set(seen.stage.blocks.map((p) => p.id));   // what was here stays still
    const wire = (id: string) => placeOf(id) as (Place & { auto?: boolean; slot?: string }) | undefined;
    const fresh = live.filter((b) => !placeOf(b.id) || wire(b.id)?.auto);
    const slotted = live.filter((b) => { const p = wire(b.id); return p && !p.auto && p.slot && SLOT[p.slot] && !known.current!.has(b.id); });
    const arrived = live.filter((b) => !known.current!.has(b.id)).map((b) => b.id);
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
    // a full stage folds its oldest untouched block to the tray for the newcomer, never shrinks the others (#739, trayRules.ts)
    let z = zTop();
    const roomed: Place[] = [], waited: string[] = [];
    for (const b of fresh) {
      const s = stageWhole() ? bornAt(size, b.kind, b.body, (placeOf(b.id) as { band?: unknown } | undefined)?.band) : bornSize(size, b.kind), was = placeOf(b.id), ghost = was?.ghost ? { ghost: true } : {};   // a ghost stays one (#737); B17: bornAt
      if (stageWhole()) toFit.current.add(b.id);   // B17
      if (was?.folded) { blocks.push({ id: b.id, x: was.x, y: was.y, ...s, z: ++z, folded: true, ...ghost }); continue; }
      if (stageWhole() && W && H) {
        // #954 (the walk, scene 4): a newcomer behind stage.whole takes the first free place at its size, else its spot at
        // the top left, and the whole stage's plan settles the rest around it (moved aside, the oldest untouched folded):
        // nothing is born on top of another, nor under the tray's line
        const roomW = { w: W, h: H - 16 }, shown = blocks.filter((p) => !p.folded && !p.popped), rect = (p: Rect) => ({ x: p.x, y: p.y, w: p.w, h: p.h });
        const r = freeSpot(roomW, s.w, s.h, shown.map(rect)) ?? clampIn(roomW, { x: 0, y: 0, w: Math.min(s.w, roomW.w), h: Math.min(s.h, roomW.h) });
        const pl = wholePlan(roomW, [...shown.map((o) => ({ id: o.id, r: rect(o), touched: o.z, hand: handPlaced.current.has(o.id), born: bornOf(o.id) })), { id: b.id, r, touched: z + 1, hand: false, born: bornOf(b.id) }], new Map([[b.id, r]]));
        const gone = new Set([...pl.fold, ...pl.wait]);
        blocks = blocks.map((x) => { const n = pl.out.get(x.id); if (n) return { ...x, ...n }; if (gone.has(x.id)) { roomed.push(x); return { ...x, folded: true }; } return x; });
        blocks.push({ id: b.id, ...r, z: ++z, ...ghost });
        continue;
      }
      const room = makeRoom(size, s, blocks);
      blocks = room.places;
      roomed.push(...room.before);
      if (!room.at) { waited.push(b.title); blocks.push({ id: b.id, x: 0, y: 0, ...s, z: ++z, folded: true, ...ghost }); continue; }
      blocks.push({ id: b.id, ...room.at, z: ++z, ...ghost });
    }
    if (roomed.length) {
      // one step of the history (#737), so ⌘Z brings them back; the newcomer stays, moved aside if it took their spot
      history.push(stepOf(roomed, roomed.map((p) => ({ ...p, folded: true }))), fresh.map((b) => b.title).join(", "));
      roomFor.current = seen;
      const names = roomed.map((p) => seen.blocks.find((x) => x.id === p.id)?.title ?? "an artifact");
      if (!stageSaid()) say(`${names.join(", ")} to the tray · ⌘Z brings ${roomed.length > 1 ? "them" : "it"} back`);
    } else if (waited.length) say(`${waited.join(", ")} waits in the tray: every artifact here was placed by hand`);
    write(blocks);
  }, [seen, W, H]); // eslint-disable-line react-hooks/exhaustive-deps
  // B17: each block just born is fitted to its content as rendered (Edges.ts fitOf: the head and all of the body), and
  // watched for as long as it arrives (the pour), since a kind can finish drawing a frame later (a list's meter)
  useLayoutEffect(() => {
    if (!stageWhole() || !toFit.current.size || !W) return;
    for (const id of [...toFit.current]) {
      const p = latest().blocks.find((x) => x.id === id), e = el.current?.querySelector<HTMLElement>(`[data-block="${CSS.escape(id)}"]`), body = e?.querySelector<HTMLElement>(".st-body");
      if (!p || p.folded) { toFit.current.delete(id); continue; }
      if (!e || !body) continue;
      toFit.current.delete(id);
      let watching = true;
      const stop = () => { watching = false; ro.disconnect(); mo.disconnect(); };
      const fitNow = () => {
        // a hand verb on it (a resize, a drag) ends the watch: the person's size is never written over (#885 R3)
        if (!watching || handPlaced.current.has(id)) { stop(); return; }
        const q = latest().blocks.find((x) => x.id === id), m = fitOf(e);
        if (!q || q.folded || !m) return;
        const h = fitH(m, size);
        if (Math.abs(h - q.h) <= 1) return;
        // the fitted height goes back through the place search: grown into a neighbour or past the floor, the block
        // moves to the nearest free place for its new size, else it is kept on the stage (#885 R2)
        const room = { w: W, h: H - 16 };
        const others = latest().blocks.filter((x) => x.id !== id && !x.folded && !x.popped).map((x) => ({ x: x.x, y: x.y, w: x.w, h: x.h }));
        const r = { x: q.x, y: q.y, w: q.w, h };
        // #1001 with stage.whole: no free place for the new size, it grows only as far as its neighbour, never over it
        // (fitGrow), and says "+N lines" for the rest (#954); with stage.said alone, the search as before (#885 R2)
        const at = stageWhole() ? fitGrow(room, { x: q.x, y: q.y, w: q.w, h: q.h }, h, others)
          : others.some((o) => overlaps(r, o)) || !insideRoom(room, r) ? freeSpot(room, r.w, h, others, { x: q.x, y: q.y }) ?? clampIn(room, r) : r;
        if (Math.abs(at.h - q.h) <= 1 && at.x === q.x && at.y === q.y) return;
        write(latest().blocks.map((x) => (x.id === id ? { ...x, ...at } : x)));
      };
      // the body itself and anything added to it later (a part that mounts a frame on), for as long as it arrives
      const ro = new ResizeObserver(fitNow), mo = new MutationObserver(fitNow);
      ro.observe(body);
      for (const c of Array.from(body.children)) ro.observe(c);
      mo.observe(body, { childList: true, subtree: true });
      fitNow();
      setTimeout(stop, dur("pour"));
    }
  });

  // ── the stage beside the talk got smaller (#734: the talk took its room, the seam moved, the dock changed): once the
  // size has settled, a block that sticks out moves in, and the stage tiles if that makes two touch (model.ts fitInto).
  // The talk never gives its room to a block
  const fitView = useRef({ seen, write, pour, drag });
  fitView.current = { seen, write, pour, drag };
  useEffect(() => {
    if (!W || !H) return;
    const t = setTimeout(() => {
      const { seen: s, write: put, pour: settle, drag: held } = fitView.current;
      if (s.ready === false || held || (s.stage.lens === "tui" && !stageWhole()) || (s.stage.lens === "ide" && stageWhole())) return;   // #954: a lens only draws; the IDE lays its own groups
      // #954: with stage.whole, never re-tiled: moved in, else to a free place, else the oldest untouched to the tray
      const fit = stageWhole() ? fitWhole({ w: W, h: H - 16 }, s.stage.blocks) : fitInto({ w: W, h: H }, s.stage.blocks);
      if (!fit) return;
      settle(fit.filter((p, i) => p !== s.stage.blocks[i]).map((p) => p.id));
      put(fit);
    }, dur("turn"));   // 160 ms: main says dur("slide") until its switch-over (#936); his Sol has turn at 160
    return () => clearTimeout(t);
  }, [W, H, seen.stage.blocks.length]);

  // ── the lens (#701, lens.ts): the pill writes it to stage.json; here its placement is laid, once per change. The lens
  // a stage opens in is as it was left (no change, nothing laid). The TUI with no terminal composes one, and takes it
  // full when it arrives (adopt).
  const lensWas = useRef<Lens | null>(null);
  const wantTerm = useRef(false);
  // #1001: the places before the IDE's file column narrowed the stage, and the blocks the hand had placed by then
  const lensBefore = useRef<{ places: Place[]; hand: Set<string> } | null>(null);
  useLayoutEffect(() => {
    if (seen.ready === false) return;
    if (lensWas.current === null) { lensWas.current = lens; return; }
    if (lensWas.current === lens || (lens !== "cli" && (!W || !H))) return;
    const prev = lensWas.current;
    lensWas.current = lens;
    let base = unfocused(seen.stage.blocks);
    if (stageWhole() && prev === "ide" && lensBefore.current) {   // #1001 review R2: handPlaced is stage.whole's hand only
      const b = lensBefore.current;
      base = backFromLens(base, b.places, new Set([...handPlaced.current].filter((id) => !b.hand.has(id))));
    }
    lensBefore.current = stageWhole() && lens === "ide" ? { places: base, hand: new Set(handPlaced.current) } : null;
    if (stageWhole()) { store.place(session, drawLens({ ...seen.stage, blocks: base }, lens)); say(LENS_WORDS[lens]); return; }   // #954: a drawing, no toast (say: the line with stage.said, #1001 fix 9)
    const r = switchLens({ ...seen.stage, blocks: base }, live, lens, zoneRect(size, "full"));
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
  back.current = (id) => { if (placeOf(id)?.popped) { pour([id]); movePlace(id, { popped: false, z: zTop() + 1 }); store.update(session, id, {}, "back on the stage", by); } };
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
        setWorked((w) => new Set([...w, b.id]));
        then(() => jelly.travelTo(p).then(() => new Promise<void>((ok) => setTimeout(ok, dur("pour")))).finally(() => setWorked((w) => { const n = new Set(w); n.delete(b.id); return n; })));
      }
      else if (b.state === "waits") then(() => jelly.sitBy(p));
      else if (b.state === "frozen") then(() => jelly.home());
    }
  }, [seen, W, coming]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── the verbs a press is ──────────────────────────────────────────────────────────────────────────────────────
  const act = (id: string): Act => (patch, line) => store.update(session, id, patch, line, by);
  // a fold by hand (–, ⌘W, ⌘⇧W, a head dropped on the tray): one step of the stage's history, so ⌘Z brings it back (#737)
  const foldAll = (ids: string[]) => {
    // a focused block folds from its own place, so ⌘Z brings it back there, not full (#741)
    const now = focusBack.current && ids.includes(focusBack.current.id) ? unfocused(latest().blocks) : latest().blocks;
    const before = now.filter((p) => ids.includes(p.id) && !p.folded);
    if (!before.length) return;
    const next = now.map((p) => (ids.includes(p.id) ? { ...p, folded: true } : p));
    history.push(stepOf(now, next));
    write(next);
    before.forEach((p) => store.update(session, p.id, {}, "folded to the tray", by));
    setPicked((s) => new Set([...s].filter((x) => !ids.includes(x))));
    hint("fold", "the tray at the foot keeps it · ⌘Z brings it back");
  };
  const fold = (id: string) => foldAll([id]);
  // opening a chip is a press: a ghost folded to the foot comes back solid
  const unfold = (id: string) => moved(latest().blocks.map((x) => (x.id === id ? { ...solidOf(x), folded: false, z: zTop() + 1 } : x)));
  const popOut = (b: Block, r: Rect) => {
    void popOutBlock(b.id, session, b.title, r).then((ok) => {
      if (!ok) { say("pop out needs Sol.app, or this page's popups"); return; }
      moved(unfocused(latest().blocks, b.id).map((x) => (x.id === b.id ? { ...x, popped: true } : x)));
      store.update(session, b.id, {}, "popped out", by);
      if (!stageSaid()) say(`${b.title} is its own window · drag it back over Sol, or click its chip`);
    });
  };
  const unpop = (id: string) => { void backBlock(id); back.current(id); };
  // a run's chip opens the run as one block over the whole stage (runs.html scene 2); fold puts it back by the talk
  const openRun = (id: string) => { pour([id]); movePlace(id, { ...zoneRect(size, "full"), folded: false, z: zTop() + 1 }); };
  const freeze = (id: string) => { store.freeze(session, id, by); setShown((s) => { const n = { ...s }; delete n[id]; return n; }); hint("freeze", "a version with your yes; its stamp says which"); };
  const close = (id: string) => {
    setDying((s) => new Set([...s, id]));
    setPicked((s) => { const n = new Set(s); n.delete(id); return n; });
    if (focusBack.current?.id === id) focusBack.current = null;
    const p = placeOf(id);
    if (p) history.push({ before: { [id]: p }, after: { [id]: null } });
    mineClosed.current.add(id);
    if (jelly && p) then(() => jelly.death(p));
    setTimeout(() => { store.close(session, id, by); setDying((s) => { const n = new Set(s); n.delete(id); return n; }); }, dur("pour"));
    hint("close", "⌘⌫ · its ledger keeps it");
  };
  const unfocus = () => {
    const f = focusBack.current;
    focusBack.current = null;
    if (f && placeOf(f.id)) { pour([f.id]); movePlace(f.id, { x: f.x, y: f.y, w: f.w, h: f.h }); }
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
    moved(blocks.map((x) => (x.id === id ? { ...x, ...zoneRect(size, "full"), folded: false, z: zTop() + 1 } : x)));
    hint("pop", "esc puts it back");
  };
  const tileAll = () => {
    if (!on.length) return;
    // a focused block is tiled from its own place, so ⌘⇧F puts it back there, not full
    const base = unfocused(latest().blocks), ids = on.map((p) => p.id);
    freeRects.current = base.filter((p) => ids.includes(p.id)).map((p) => ({ ...p }));
    const cells = tile(size, ids.length);
    pour(ids);
    moved(base.map((p) => { const i = ids.indexOf(p.id); return i < 0 ? p : { ...p, ...cells[i] }; }), { tiled: true });
    if (!stageSaid()) say("tile · ⌘⇧T · ⌘⇧F puts them back");
  };
  const untile = () => {
    const f = freeRects.current;
    if (!f) return;
    freeRects.current = null;
    pour(f.map((p) => p.id));
    moved(latest().blocks.map((p) => { const was = f.find((x) => x.id === p.id); return was ? { ...p, x: was.x, y: was.y, w: was.w, h: was.h } : p; }), { tiled: false });
  };

  // ── ⌘Z and ⇧⌘Z (#737): a step of the person's hand taken back, or done again; the places it changed, and nothing the
  // agent composed since. A close taken back reopens the block where it sat; done again, it closes
  const stepBack = (again = false) => {
    const st = again ? history.redo() : history.undo();
    if (!st) { if (stageSaid()) setSaid({ who: "note", words: again ? "Nothing to do again" : "Nothing to take back" }); return; }
    const side: Side = again ? st.after : st.before, other: Side = again ? st.before : st.after;
    // #892's fix (a block closed since a move stays closed) only behind a switch until its own slice lands (#936)
    const r = applySide(latest().blocks, side, stageWhole() || stageSaid() ? other : undefined);
    // #903: what came back is said, and what could not (closed since, #892), with who closed it when it is known
    if (stageSaid()) {
      const lost = lostOf(side, other, (id) => latest().blocks.some((p) => p.id === id));
      const closer = lost.map((id) => closers.current.get(id) ?? (seen.ledger[id] ? closerOf(seen.ledger[id]) : undefined)).find(Boolean);
      setSaid({ who: "you", how: again ? "redid" : "undid", step: st, ...(lost.length ? { lost, ...(closer ? { closer } : {}) } : {}) });
    }
    // a fold taken back (#739): a block that has taken its spot since moves to a free one (trayRules.ts unfoldBack)
    const unfolded = Object.values(side).filter((p): p is Place => !!p && !p.folded && !!latest().blocks.find((q) => q.id === p.id)?.folded);
    if (unfolded.length) r.blocks = unfoldBack(size, r.blocks, unfolded);
    for (const id of r.back) {
      if (seen.blocks.some((b) => b.id === id && b.state !== "dead")) continue;
      const { id: _i, ...at } = side[id]!;
      store.reopen?.(session, id, at, by);
    }
    pour(Object.keys(side));
    write(r.blocks);
    for (const id of r.gone) { mineClosed.current.add(id); store.close(session, id, by); }
    if (focusBack.current && focusBack.current.id in side) focusBack.current = null;
    hint(again ? "again" : "back");
  };

  // ── the ghosts (#737): one the agent offered and nobody took fades out a while after its turn ends, and goes to the foot
  const ghostIds = on.filter((p) => p.ghost).map((p) => p.id).join(" ");
  const fadeView = useRef({ seen, write });
  fadeView.current = { seen, write };
  useEffect(() => {
    if (busy || !ghostIds) { setFading(new Set()); return; }
    const ids = ghostIds.split(" ");
    let t2: ReturnType<typeof setTimeout> | undefined;
    const t = setTimeout(() => {
      setFading(new Set(ids));
      t2 = setTimeout(() => {
        const { seen: s, write: put } = fadeView.current;
        // folded, it is in the tray at the stage's foot (#739), a ghost still: brought back, it comes solid
        put(s.stage.blocks.map((p) => (ids.includes(p.id) && p.ghost && !p.folded ? { ...p, folded: true } : p)));
        setFading(new Set());
      }, dur("pour"));
    }, ghostFade());
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [busy, ghostIds]);

  // ── moving between blocks (#737): one block holds the keys; its content scrolls and zooms
  const order = readingOrder(on).map((p) => p.id);
  const heldOn = held && on.some((p) => p.id === held) ? held : null;
  const bodyOf = (id: string) => el.current?.querySelector<HTMLElement>(`[data-block="${id}"] .st-body`) ?? null;
  const hold = (id: string | null) => {
    setHeld(id);
    if (!id) return;
    lift(id);
    requestAnimationFrame(() => bodyOf(id)?.focus({ preventScroll: true }));
  };
  const release = () => { setHeld(null); onTalk?.(); };
  const zoomBy = (id: string, how: "in" | "out" | "reset") => setZoom((z) => ({ ...z, [id]: how === "reset" ? 1 : zoomStep(z[id] ?? 1, how === "out") }));
  // the wheel anywhere on the stage, off any block's body, scrolls the held block's content
  const onWheel = (e: RWheelEvent<HTMLDivElement>) => {
    if (!heldOn || (e.target as HTMLElement).closest(".st-body")) return;
    bodyOf(heldOn)?.scrollBy({ left: e.deltaX, top: e.deltaY });
  };

  // ── move, snap, the slots ────────────────────────────────────────────────────────────────────────────────────
  const onHead = (b: Block) => (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button,.st-vers") || e.button !== 0) return;
    if (e.shiftKey) { setPicked((s) => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; }); hint("select", "⇧click or a marquee · esc lets go"); return; }
    const p = shownAt(b.id), box = el.current?.getBoundingClientRect();
    if (!p || !box) return;
    if (stageWhole()) { wholeHead(b, p, e); return; }   // B10: the whole stage's hand (drag.ts)
    lift(b.id);
    const head = e.currentTarget, ox = e.clientX - box.left - p.x, oy = e.clientY - box.top - p.y;
    head.setPointerCapture(e.pointerId);
    let r: Rect = { x: p.x, y: p.y, w: p.w, h: p.h }, zone: Zone | null = null, moved = false, row: string | null = null, off = false, toTray = false;
    const mv = (ev: PointerEvent) => {
      moved = true;
      // off Sol's window: let go and it is its own window (pop out)
      const was = off;
      off = outside({ w: window.innerWidth, h: window.innerHeight }, ev.clientX, ev.clientY);
      if (off !== was) say(off ? "let go: its own window" : "");
      const sn = snap(size, r, ev.clientX - box.left - ox, ev.clientY - box.top - oy, others(b.id));
      r = { ...r, ...keep(size, r, sn.x, sn.y) };
      // a session row under the pointer: carry (play.html's overRow); the stage's own slots wait
      row = rowAt(ev.clientX, ev.clientY, session);
      setCarryOver(row);
      // the tray at the foot: let go over it, the block folds there (#739); it wins over the bottom slot it sits in
      toTray = !row && trayHit(ev.clientX, ev.clientY);
      setOverTray(toTray);
      zone = row || toTray ? null : zoneAt(size, ev.clientX - box.left, ev.clientY - box.top);
      setDrag({ id: b.id, r }); setGuides(row ? NO_GUIDES : sn.guides); setGhost(zone ? zoneRect(size, zone) : null);
    };
    const up = (ev: PointerEvent) => {
      head.removeEventListener("pointermove", mv); head.removeEventListener("pointerup", up); head.removeEventListener("pointercancel", up);
      setDrag(null); setGuides(NO_GUIDES); setGhost(null); setCarryOver(null); setOverTray(false);
      if (!moved) { if (p.ghost) take(b.id); return; }
      if (toTray && ev.type === "pointerup") { fold(b.id); return; }
      if (off && ev.type === "pointerup") {
        pour([b.id]);
        popOut(b, { x: ev.screenX - ox, y: ev.screenY - oy, w: p.w, h: p.h });
        return;
      }
      if (row && ev.type === "pointerup") {
        // carried: the same block there too; here it pours back to where it was
        pour([b.id]);
        store.carry(session, b.id, row, by);
        say(`${b.title} is in "${nameOf(row)}" too · the same artifact, one ledger`);
        return;
      }
      if (zone) { pour([b.id]); r = zoneRect(size, zone); }
      else { const s = settle(size, r); if (s.x !== r.x || s.y !== r.y) { pour([b.id]); r = { ...r, ...s }; } }
      movePlace(b.id, { ...r, z: zTop() + 1, hand: true });
      if (focusBack.current?.id === b.id) focusBack.current = null;
      store.update(session, b.id, {}, zone ? `placed: ${zone}` : "moved", by);
    };
    head.addEventListener("pointermove", mv); head.addEventListener("pointerup", up); head.addEventListener("pointercancel", up);
  };
  // B10 (#773): the whole stage's hand, behind stage.whole: drag.ts follows the finger and lands through the plan;
  // this stage only commits what it says (places, folds), carries to a row, or pops out after the hold
  const handPlaced = useRef(new Set<string>());
  // born: the block's first version (the plan folds the oldest untouched by age, #772 R1)
  const bornOf = (id: string) => Math.min(...(live.find((x) => x.id === id)?.versions ?? []).map((v) => v.at), Infinity);
  // B11 (#774): the drop preview in pearl (preview.ts, previewPaint.ts), drawn into its own layer outside React
  const pvLayer = useRef<HTMLDivElement>(null), pvPaint = useRef<Painter | null>(null);
  const painter = () => (pvPaint.current ??= pvLayer.current ? previewPainter(pvLayer.current, (id) => el.current?.querySelector<HTMLElement>(`[data-block="${CSS.escape(id)}"]`) ?? null) : null);
  const wholeHead = (b: Block, p: Place, e: RPointerEvent<HTMLDivElement>) => {
    const placed = () => on.map((o) => ({ id: o.id, r: { x: o.x, y: o.y, w: o.w, h: o.h }, touched: o.z, hand: handPlaced.current.has(o.id), born: bornOf(o.id) }));
    const me = { id: b.id, r: { x: p.x, y: p.y, w: p.w, h: p.h }, from: { x: p.x, y: p.y, w: p.w, h: p.h }, touched: p.z, hand: handPlaced.current.has(b.id), born: bornOf(b.id) };
    wholeDrag({
      e: e.nativeEvent, head: e.currentTarget, stage: el.current!, me,
      onShow: (s) => painter()?.show(dropPreview({ w: W, h: H - 16 }, me, s, placed())), onUnshow: () => painter()?.clear(),   // B11
      room: () => ({ w: W, h: H - 16 }), blocks: placed,
      elOf: (id) => el.current?.querySelector<HTMLElement>(`[data-block="${CSS.escape(id)}"]`) ?? null,
      rowAt: (c) => folderAt(c, { id: b.id, title: b.title }) ?? rowAt(c.x, c.y, session), onRow: setCarryOver,   // #1031: a Home folder on the shelf, else a session row
      onCarry: (row) => {
        if (isHomeRow(row)) { const id = placeOfRow(row); seat({ id: b.id, title: b.title }, session, { id, name: folderName(id) }); return; }   // #1045: either Home's folder
        store.carry(session, b.id, row, by); say(`${b.title} is in "${nameOf(row)}" too · the same artifact, one ledger`);
      },
      onPop: (r) => popOut(b, r),
      onLanding: () => { landing.current++; },   // #1001
      onLand: (r) => {
        try {
          const before = shot();   // B15
          const gone = new Set([...r.plan.fold, ...r.plan.wait]), z = zTop();
          write(latest().blocks.map((x) => {
            const n = r.plan.out.get(x.id);
            return x.id === b.id ? { ...x, ...n, z: z + 1 } : n ? { ...x, ...n } : gone.has(x.id) ? { ...x, folded: true } : x;
          }));
          handPlaced.current.add(b.id);
          if (r.kind === "trade") r.plan.out.forEach((_, id) => handPlaced.current.add(id));
          if (focusBack.current?.id === b.id) focusBack.current = null;
          store.update(session, b.id, {}, r.kind === "trade" ? "traded" : "moved", by);
          rec(r.kind, before);   // B15
        } finally { settled(); }   // #1001 (review R3): the landing count always comes back down, so ⌘Z is never held for good
      },
    });
  };
  // B12 (#775): the whole stage's resize, behind stage.whole: any edge or corner, the fit detent, a pinch; shown through
  // this stage's drag and guides, committed through the plan (what it now covers steps aside, or folds)
  const sizeDone = (id: string, r: Rect) => {
    const before = shot();   // B15
    const placed = on.map((o) => ({ id: o.id, r: { x: o.x, y: o.y, w: o.w, h: o.h }, touched: o.z, hand: handPlaced.current.has(o.id), born: bornOf(o.id) }));
    const pl = wholePlan({ w: W, h: H - 16 }, placed, new Map([[id, r]])), gone = new Set([...pl.fold, ...pl.wait]), z = zTop();
    write(latest().blocks.map((x) => { const n = pl.out.get(x.id); return n ? { ...x, ...n, ...(x.id === id ? { z: z + 1 } : {}) } : gone.has(x.id) ? { ...x, folded: true } : x; }));
    handPlaced.current.add(id);
    store.update(session, id, {}, "resized", by);
    rec("resize", before);   // B15
  };
  const onEdge = (b: Block) => (e: RPointerEvent<HTMLDivElement>, edge: Edge) => {
    const p = shownAt(b.id);
    if (!p) return;
    wholeResize({
      e: e.nativeEvent, band: e.currentTarget, edge, from: { x: p.x, y: p.y, w: p.w, h: p.h },
      room: () => ({ w: W, h: H - 16 }), others: () => others(b.id).map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h })),
      fit: () => fitOf(el.current?.querySelector<HTMLElement>(`[data-block="${CSS.escape(b.id)}"]`) ?? null),
      onShow: (s) => { setDrag({ id: b.id, r: s.r }); painter()?.show({ guides: guidesOf(s.sx, s.sy, s.r, others(b.id)), outlines: [], dim: null }); },   // B11: pearl guides
      onEnd: (r) => { setDrag(null); painter()?.clear(); if (r) sizeDone(b.id, r); },   // B11
    });
  };
  const pinchAt = useRef({ on, W, H, sizeDone });
  pinchAt.current = { on, W, H, sizeDone };
  useEffect(() => {
    if (!stageWhole() || !el.current) return;
    return wholePinch(el.current, {
      rectOf: (id) => { const o = pinchAt.current.on.find((x) => x.id === id); return o ? { x: o.x, y: o.y, w: o.w, h: o.h } : null; },
      room: () => ({ w: pinchAt.current.W, h: pinchAt.current.H - 16 }),
      onShow: (id, r) => setDrag({ id, r }),
      onEnd: (id, r) => { setDrag(null); pinchAt.current.sizeDone(id, r); },
    });
  }, [session]);
  // B15 (#778): undo for every hand verb, behind stage.whole (feel.md rule 8): each verb records the whole stage before
  // and after (b9's stack, 64 entries); ⌘Z / ⇧⌘Z travel back (travel.ts). A close fades and leaves its outline 6 s with
  // a draining ring (Scar.tsx); the face holds it, so it can come back, and commits it to the store only when no undo
  // can bring it back. "The held block" for ⌥arrows and ⌘⌫ is the one holding the keys (#737), else the one the hand
  // touched last.
  const undoAt = useRef(EMPTY_UNDO);
  const [scars, setScars] = useState<{ id: string; r: Rect }[]>([]);
  const blockEl = (id: string) => el.current?.querySelector<HTMLElement>(`[data-block="${CSS.escape(id)}"]`) ?? null;
  // closing: closed for the undo from the press, still on the stage while it fades (#856 B2)
  const goingOut = useRef(new Set<string>());
  const goOut = (id: string) => {
    const e = blockEl(id), gone = () => { if (goingOut.current.delete(id)) { closedHeld.current.add(id); bumpHeld((v) => v + 1); } };
    goingOut.current.add(id);
    if (e) fadeOut(e, gone); else gone();
  };
  const shot = () => { const s = store.read(session); return stageShot(latest().blocks, new Set([...closedHeld.current, ...goingOut.current]), (id) => s.blocks.find((b) => b.id === id)?.state ?? "live", (id) => s.blocks.find((b) => b.id === id)?.versions.length ?? 0); };
  // this window's own close (#1001): never read back as "closed in another window" when the engine says it left
  const commitClose = (id: string) => { closedHeld.current.delete(id); mineClosed.current.add(id); store.close(session, id, by); };
  const rec = (verb: string, before: Snapshot) => {
    const after = shot(), prev = undoAt.current, next = undoRecord(prev, verb, performance.now(), before, after);
    undoAt.current = next;
    // #1001: each verb of the whole stage is said on the line (#903) as it is done; "step" is the history's own, said there
    if (verb !== "step" && stageSaid()) { const st = stepOfShots(before, after); if (st) setSaid({ who: "you", how: "did", step: st }); }
    droppedCloses(prev, next, closedHeld.current).forEach(commitClose);
  };
  // each outline's 6 s is its own close's (#856 B4): a close again within them starts a fresh one, ⌘Z clears it
  const scarT = useRef(new Map<string, number>());
  const unscar = (id: string) => { clearTimeout(scarT.current.get(id)); scarT.current.delete(id); setScars((s) => s.filter((x) => x.id !== id)); };
  const scar = (id: string, r: Rect) => {
    clearTimeout(scarT.current.get(id));
    setScars((s) => [...s.filter((x) => x.id !== id), { id, r }]);
    scarT.current.set(id, window.setTimeout(() => unscar(id), LIFE.scar));
  };
  // one travel at a time (#856 B3): a ⌘Z pressed while one runs waits for its commit, then starts from the places as
  // they are then (the latest render's apply, through wholeKeys), so two sets of springs never write the same block
  const waiting = useRef<Snapshot[] | null>(null);
  const apply = (to: Snapshot) => {
    if (waiting.current) { waiting.current.push(to); return; }
    const r = restore(shot(), to);
    if (nothing(r)) return;
    for (const id of r.close) {
      // a close done again: held at once, faded, and its outline says what went (#856 B4)
      const p = on.find((o) => o.id === id);
      if (p) scar(id, { x: p.x, y: p.y, w: p.w, h: p.h });
      goOut(id);
    }
    const moves = [...r.travel].flatMap(([id, to]) => { const e = blockEl(id), p = on.find((o) => o.id === id); return e && p ? [{ el: e, from: { x: p.x, y: p.y, w: p.w, h: p.h }, to }] : []; });
    waiting.current = [];
    travel(moves, () => {
      for (const id of r.reopen.keys()) { closedHeld.current.delete(id); goingOut.current.delete(id); unscar(id); }
      write(placesAfter(latest().blocks, r, zTop()));
      bumpHeld((v) => v + 1);
    }, () => {
      for (const id of r.reopen.keys()) { const e = blockEl(id); if (e) fadeIn(e); }
      const q = waiting.current ?? [];
      waiting.current = null;
      while (q.length) {
        wholeKeys.current.apply(q.shift()!);
        if (waiting.current) { (waiting.current as Snapshot[]).push(...q); return; }
      }
    });
  };
  // #1001: what ⌘Z took back and ⇧⌘Z did again is said, and so is a ⌘Z with nothing left to take back
  // the step said is the entry's own, its before and after as recorded, never the stage now: what the agent did since
  // is not this step's (review R1: "Closed A and B again" for a move of A)
  const saidBack = (again: boolean, e: { before: Snapshot; after: Snapshot } | undefined) => {
    if (!stageSaid()) return;
    if (!e) { setSaid({ who: "note", words: again ? "Nothing to do again" : "Nothing to take back" }); return; }
    const st = stepOfShots(e.before, e.after);
    if (st) setSaid({ who: "you", how: again ? "redid" : "undid", step: st });
  };
  // #1001: a ⌘Z pressed while a drop settles or a fold flies to the tray is for that step: it waits until the step is
  // recorded (it lands), then takes it back; before, it took back the step before and the fold landed after it anyway
  const landing = useRef(0), afterLanding = useRef<boolean[]>([]);
  const busyHand = () => landing.current > 0 || inFlight.current.size > 0;
  const settled = () => {
    landing.current = Math.max(0, landing.current - 1);
    if (busyHand() || !afterLanding.current.length) return;
    const q = afterLanding.current.splice(0);
    // after the commit has drawn, with that render's verbs (the places as they are now)
    requestAnimationFrame(() => q.forEach((again) => (again ? wholeKeys.current.wholeRedo() : wholeKeys.current.wholeUndo())));
  };
  const wholeUndo = () => { if (busyHand()) { afterLanding.current.push(false); return; } saidBack(false, undoAt.current.undo[undoAt.current.undo.length - 1]); const u = undoPop(undoAt.current); if (!u) return; undoAt.current = u.u; apply(u.to); };
  const wholeRedo = () => { if (busyHand()) { afterLanding.current.push(true); return; } saidBack(true, undoAt.current.redo[undoAt.current.redo.length - 1]); const u = undoRedo(undoAt.current); if (!u) return; undoAt.current = u.u; apply(u.to); };
  // B16 × B15: a block in the air to the tray is gone for the hand: ⌘W, ⇧⌘W, ⌘⌫ and ⌥ arrows never take it again
  const inFlight = useRef(new Set<string>());
  const lastTouched = () => {
    const here = on.filter((p) => !goingOut.current.has(p.id) && !inFlight.current.has(p.id));
    return here.find((p) => p.id === heldOn) ?? here.reduce<Place | null>((a, p) => (!a || p.z > a.z ? p : a), null);
  };
  // B16 (#779): the tray and the fold flight (tray.ts, trayHand.ts, WholeTray.tsx), with stage.whole on; with it off the
  // stage's tray is #739's (Tray.tsx). A fold flies to the tray's next square and the count bumps; a copy pressed unfolds
  // and travels back; a copy dragged out is b10's drag at once. The fold itself is the stage's own (fold, #739): it is one
  // step of the history and so one entry of the whole undo, its before taken as it lands (#865 F2)
  const trayEl = useRef<HTMLDivElement>(null);
  const [trayBump, setTrayBump] = useState(0);
  const relOf = (x: Element): Rect => { const s = el.current!.getBoundingClientRect(), r = x.getBoundingClientRect(); return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height }; };
  // `counted`: its landing was counted before it started (⇧⌘W's staggered folds, review R4), so a ⌘Z waits for them all
  const wholeFold = (id: string, counted = false) => {
    if (inFlight.current.has(id)) { if (counted) settled(); return; }   // already on its way (#865 F3)
    const p = on.find((o) => o.id === id), e = blockEl(id), row = trayEl.current?.querySelector(".st-tnames");
    // #1001: settled releases a ⌘Z that waited for this fold (counted here unless it was counted before it started)
    const commit = () => { try { inFlight.current.delete(id); flushSync(() => fold(id)); if (e) unpaint(e); setTrayBump((n) => n + 1); } finally { if (!counted) landing.current++; settled(); } };
    if (!p || !e || !row || !el.current) { commit(); return; }
    // the next square counts the ones still in the air, so folds started together land side by side (#865 F2)
    const r = relOf(row), next = row.children.length + inFlight.current.size;
    inFlight.current.add(id);
    flyToTray(e, { x: p.x, y: p.y, w: p.w, h: p.h }, squareRect({ x: r.x + TRAY.inset, y: r.y + (r.h - TRAY.sq.h) / 2 }, next), commit);
  };
  const foldAllBut = (keep: string) => {
    const ids = on.filter((o) => o.id !== keep && !inFlight.current.has(o.id)).map((o) => o.id);
    landing.current += ids.length;   // #1001 review R4: between two staggered folds nothing is in the air, yet ⌘Z must wait
    ids.forEach((id, i) => window.setTimeout(() => wholeFold(id, true), i * TRAY.stagger));
  };
  const wholeUnfold = (id: string, at?: Rect) => {
    const was = latest().blocks.find((x) => x.id === id);
    if (!was) return;
    const copy = el.current?.querySelector(`[data-wmini="${CSS.escape(id)}"]`) ?? trayEl.current?.querySelector(".st-tname"), from = copy ? relOf(copy) : null, before = shot();
    const r = at ?? { x: was.x, y: was.y, w: was.w, h: was.h }, z = zTop();
    const placed = [...on.map((o) => ({ id: o.id, r: { x: o.x, y: o.y, w: o.w, h: o.h }, touched: o.z, hand: handPlaced.current.has(o.id), born: bornOf(o.id) })), { id, r, touched: z + 1, hand: true, born: bornOf(id) }];
    const pl = wholePlan({ w: W, h: H - 16 }, placed, new Map([[id, r]])), gone = new Set([...pl.fold, ...pl.wait]);
    flushSync(() => write(latest().blocks.map((x) => { if (x.id === id) return { ...x, ...r, folded: false, z: z + 1 }; const n = pl.out.get(x.id); return n ? { ...x, ...n } : gone.has(x.id) ? { ...x, folded: true } : x; })));
    store.update(session, id, {}, "unfolded", by);
    rec("unfold", before);
    const e = blockEl(id);
    if (e && from && !at) flyFromTray(e, from, r);
  };
  // #954 (the walk, scene 15; whole.md "waits: comes toward you"): a block that turns to wait on you while it is folded
  // comes out of the tray to its place, once per wait (folded again by hand, it stays folded)
  const waitedOut = useRef(new Set<string>());
  useEffect(() => {
    if (!stageWhole() || !W || seen.ready === false) return;
    for (const b of live) {
      if (b.state !== "waits") { waitedOut.current.delete(b.id); continue; }
      const p = placeOf(b.id);
      if (p?.folded && !p.popped && !waitedOut.current.has(b.id)) { waitedOut.current.add(b.id); wholeUnfold(b.id); }
      else if (p && !p.folded) waitedOut.current.add(b.id);
    }
  }, [seen, W]); // eslint-disable-line react-hooks/exhaustive-deps
  // a copy from another session (the engine's tray, #820): the stage's own pull (#739's carry in), pressed at the first
  // free place, dragged out where the finger is; it is the same artifact, one ledger (#865 F4)
  const pullCopy = (m: WholeMini, ev?: PointerEvent) => {
    const s = el.current?.getBoundingClientRect();
    setTrayOpen(false);
    store.pull(session, m.id, by, ev && s ? { ...copyAt({ x: ev.clientX - s.left, y: ev.clientY - s.top }, bornSize(size, m.kind), { w: W, h: H - 16 }), hand: true } : undefined);
  };
  const liftCopy = (m: WholeMini, ev: PointerEvent) => {
    const was = latest().blocks.find((x) => x.id === m.id), b = live.find((x) => x.id === m.id);
    if (!was || !b || !el.current) return;
    const s = el.current.getBoundingClientRect();
    setTrayOpen(false);
    wholeUnfold(m.id, copyAt({ x: ev.clientX - s.left, y: ev.clientY - s.top }, { w: was.w, h: was.h }, { w: W, h: H - 16 }));
    const p = latest().blocks.find((x) => x.id === m.id), head = blockEl(m.id)?.querySelector<HTMLElement>(".st-head");
    if (p && head) wholeHead(b, p, { nativeEvent: ev, currentTarget: head } as unknown as RPointerEvent<HTMLDivElement>);
  };
  // B25 (#788): the talk full (footRow.ts, talkFull.ts): the shown blocks travel to a foot row of 120×72 copies under
  // the talk, in reading order, and back when it is not full; a press on a copy brings them back, that one held
  const wasFull = useRef(false);
  useLayoutEffect(() => {
    const stage = el.current, room = stage?.closest<HTMLElement>(".st-room");
    if (!stageWhole() || !stage) return;
    const shown = on.map((p) => ({ id: p.id, e: blockEl(p.id), r: { x: p.x, y: p.y, w: p.w, h: p.h } })).filter((x) => x.e);
    if (!talkFull || !room) {
      // back only as the talk stops being full: a later commit never cuts a fold's flight or an undo's travel short
      if (wasFull.current) shown.forEach((x) => { if (x.e!.dataset.foot !== undefined || x.e!.style.transform) footBack(x.e!); });
      wasFull.current = false;
      return;
    }
    wasFull.current = true;
    const s = stage.getBoundingClientRect(), rm = room.getBoundingClientRect();
    const fl = footRow(order, new Map(shown.map((x) => [x.id, x.r])), { w: rm.width, h: rm.height }, { x: s.left - rm.left, y: s.top - rm.top });
    shown.forEach((x) => { const f = fl.get(x.id); if (f) footFly(x.e!, f); });
    // again whenever the shown blocks or the room change while it is full: a block the agent places or unfolds joins the
    // row, and a resized window re-centres it (#883 B25-2)
  }, [talkFull, on.map((p) => `${p.id}:${p.x},${p.y},${p.w},${p.h}`).join(" "), order.join(" "), W, H]); // eslint-disable-line react-hooks/exhaustive-deps
  const onFoot = (e: RPointerEvent<HTMLDivElement>) => {
    if (!talkFull || !stageWhole() || e.button !== 0) return false;
    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-block]")?.dataset.block;
    if (!id) return false;
    e.preventDefault(); e.stopPropagation();
    onFootBack?.();
    hold(id);
    return true;
  };
  const closeHeld = (id: string) => {
    const p = on.find((o) => o.id === id);
    if (!p || goingOut.current.has(id)) return;
    const before = shot();
    setPicked((s) => { const n = new Set(s); n.delete(id); return n; });
    setLedger((l) => (l === id ? null : l)); // its ledger card shuts with it, so it never comes back open
    if (focusBack.current?.id === id) focusBack.current = null;
    scar(id, { x: p.x, y: p.y, w: p.w, h: p.h });
    // recorded at the press (#856 B2): a ⌘Z during the fade takes back this close, never the verb before it; the fade
    // only animates, and the block leaves the stage when it ends
    goOut(id);
    rec("close", before);
  };
  const scarBack = (id: string) => {
    const last = undoAt.current.undo[undoAt.current.undo.length - 1];
    if (last?.verb === "close" && last.after[id]?.closed) { wholeUndo(); return; }
    const before = shot();
    closedHeld.current.delete(id); goingOut.current.delete(id); unscar(id); bumpHeld((v) => v + 1);
    requestAnimationFrame(() => { const e = blockEl(id); if (e) fadeIn(e); });
    rec("reopen", before);
  };
  const wholeNudge = (key: string) => {
    const p = lastTouched();
    if (!p) return false;
    const n = nudge({ x: p.x, y: p.y, w: p.w, h: p.h }, key, { w: W, h: H - 16 });
    if (!n) return false;
    const before = shot();
    setPlace(p.id, { x: n.x, y: n.y });
    handPlaced.current.add(p.id);
    rec("nudge", before);
    return true;
  };
  // a held close becomes a real one when the stage goes (another session, the window closing)
  useEffect(() => {
    const flush = () => { [...closedHeld.current, ...goingOut.current].forEach((id) => store.close(session, id, by)); closedHeld.current.clear(); goingOut.current.clear(); };
    window.addEventListener("beforeunload", flush);
    return () => { window.removeEventListener("beforeunload", flush); flush(); };
  }, [session]);
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
      r = { ...r, w: sn.w, h: sn.h };
      setDrag({ id: b.id, r }); setGuides(sn.guides);
    };
    const up = () => {
      g.removeEventListener("pointermove", mv); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up);
      setDrag(null); setGuides(NO_GUIDES);
      if (r.w !== p.w || r.h !== p.h) movePlace(b.id, { w: r.w, h: r.h, hand: true });
      store.update(session, b.id, {}, "resized", by);
    };
    g.addEventListener("pointermove", mv); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
  };

  // ── the jelly in your hand (#737): pressed and dragged, it follows the pointer; dropped on a block, or on a part of one
  // (data-part), that is "this one" for the next message, and it sits on the block's head. v4: joins talk, the box shows
  // the block's miniature where it now says the target's words
  const onJelly = (e: RPointerEvent<HTMLDivElement>) => {
    if (!jelly || e.button !== 0 || !el.current) return;
    // #1001: a press on a control is the control's, never the jelly's: it sits in the title row of the block that waits,
    // on its fold and pop buttons, and a press there picked the jelly up and did nothing else
    if (stageWhole() && (e.target as HTMLElement | null)?.closest?.("button, a, input, textarea, select, [role=button], [role=switch]")) return;   // review R7: behind the switch
    const box = el.current.getBoundingClientRect(), j = jelly.where();
    if (Math.hypot(e.clientX - box.left - j.x, e.clientY - box.top - j.y) > JELLY_REACH) return;
    e.preventDefault(); e.stopPropagation();
    const me = e.currentTarget;
    me.setPointerCapture(e.pointerId);
    const mv = (ev: PointerEvent) => jelly.hold({ x: ev.clientX - box.left, y: ev.clientY - box.top });
    const up = (ev: PointerEvent) => {
      me.removeEventListener("pointermove", mv); me.removeEventListener("pointerup", up); me.removeEventListener("pointercancel", up);
      jelly.hold(null);
      const under = ev.type === "pointerup" ? document.elementsFromPoint(ev.clientX, ev.clientY) : [];
      const part = under.map((x) => (x as HTMLElement).closest?.<HTMLElement>("[data-part]")).find((x) => x && el.current?.contains(x)) ?? null;
      const blk = (part ?? under.find((x) => (x as HTMLElement).closest?.("[data-block]")) as HTMLElement | undefined)?.closest<HTMLElement>("[data-block]");
      const p = blk ? placeOf(blk.dataset.block!) : undefined;
      if (!blk || !p) { void jelly.home(); return; }
      light(part); unlitPages();
      pointAt([words({ id: p.id, ...(part?.dataset.part ? { part: part.dataset.part } : {}) })]);   // dropped on purpose: it is attached
      if (p.ghost) take(p.id);   // pointing at a ghost takes it
      void jelly.sitBy(p);
      hint("this one");
    };
    me.addEventListener("pointermove", mv); me.addEventListener("pointerup", up); me.addEventListener("pointercancel", up);
  };

  // a marquee on the bare stage picks what it touches
  const onBare = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).closest(".st-empty")) return;
    const box = el.current!.getBoundingClientRect(), x0 = e.clientX - box.left, y0 = e.clientY - box.top, me = e.currentTarget;
    setPicked(new Set());
    setHeld(null);
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
  // ⌘1-9 and Tab walk the shown blocks in reading order (#737); in the TUI ⌘1-9 opens its lines. ⌘W folds the focused
  // block (#739): the one filling the stage, else the one holding the keys, else the one picked alone, else the topmost
  const focused = () => focusedOf(seen.stage.blocks, focusBack.current?.id ?? heldOn, [...picked]);
  const keys = useRef({ tileAll, untile, focus, unfocus, close, picked, lines, openLine: (id: string) => openLine(id), placeOf, ledger, setLedger, setPicked, order, heldOn, hold, release, zoomBy, stepBack, take, fold, foldAll, focused, trayOpen, setTrayOpen, on });
  keys.current = { tileAll, untile, focus, unfocus, close: (id: string) => (stageWhole() ? closeHeld(id) : close(id)), picked, lines, openLine: (id: string) => openLine(id), placeOf, ledger, setLedger, setPicked, order, heldOn, hold, release, zoomBy, stepBack, take, fold, foldAll, focused, trayOpen, setTrayOpen, on };
  const wholeKeys = useRef({ wholeUndo, wholeRedo, wholeNudge, closeHeld, lastTouched, apply, wholeFold, foldAllBut });   // B15, B16
  wholeKeys.current = { wholeUndo, wholeRedo, wholeNudge, closeHeld, lastTouched, apply, wholeFold, foldAllBut };   // B15, B16
  useEffect(() => {
    if (!active) return;
    const down = (e: KeyboardEvent) => {
      if (!el.current?.offsetParent) return;   // a pane kept behind another tab: not showing, not answering
      const k = keys.current, meta = e.metaKey || e.ctrlKey, field = (e.target as HTMLElement | null)?.closest?.("input,textarea,[contenteditable=true]") as HTMLInputElement | HTMLTextAreaElement | null;
      const typing = !!field, words = !!field && (field.value ?? field.textContent ?? "") !== "";
      const took = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (e.key === "Escape") {
        if (k.trayOpen) { took(); k.setTrayOpen(false); }   // what is on top closes first: the list, then the artifact over the stage
        else if (focusBack.current) { took(); k.unfocus(); }
        else if (k.heldOn) { took(); k.release(); }
        else if (k.ledger) { took(); k.setLedger(null); }
        else if (k.picked.size) { took(); k.setPicked(new Set()); }
        else if (barState().on.length) { took(); pointAt([]); }
        return;
      }
      // B15: ⌥arrows nudge 8, ⌘Z / ⇧⌘Z, ⌘⌫ closes (on the block the hand touched last until hold lands)
      if (stageWhole() && !typing) {
        const w = wholeKeys.current;
        if (e.altKey && !meta && e.key.startsWith("Arrow")) { if (w.wholeNudge(e.key)) took(); return; }
        if (meta && e.key.toLowerCase() === "z") { took(); if (e.shiftKey) w.wholeRedo(); else w.wholeUndo(); return; }
        if (meta && e.key === "Backspace" && !k.picked.size) { const p = w.lastTouched(); if (p) { took(); w.closeHeld(p.id); } return; }
        if (meta && e.key.toLowerCase() === "w") { const p = w.lastTouched(); if (p) { took(); if (e.shiftKey) w.foldAllBut(p.id); else w.wholeFold(p.id); } return; }   // B16: ⌘W, ⇧⌘W
      }
      if (!meta && k.heldOn && !typing) {
        if (e.key === "Tab") { took(); k.hold(walk(k.order, k.heldOn, e.shiftKey)); return; }
        if (e.key === "Enter" && k.placeOf(k.heldOn)?.ghost) { took(); k.take(k.heldOn); return; }
      }
      if (!meta) return;
      const key = e.key.toLowerCase();
      // ⌘Z in a field with words in it is the words' own undo; anywhere else it is the stage's
      if (key === "z" && !e.altKey && !words) { took(); k.stepBack(e.shiftKey); return; }
      if (k.heldOn && !typing && (key === "=" || key === "+" || key === "-" || key === "0")) { took(); k.zoomBy(k.heldOn, key === "0" ? "reset" : key === "-" ? "out" : "in"); return; }
      if (e.shiftKey && key === "t") { took(); k.tileAll(); return; }
      if (e.shiftKey && key === "f") { took(); k.untile(); return; }
      // the tray (#739): ⌘W folds the focused block, ⌘⇧W all but it; ⌘Z above brings a fold back, as any step
      if (key === "w" && !typing) {
        const f = k.focused();
        if (!f) return;
        took();
        if (e.shiftKey) k.foldAll(k.on.map((p) => p.id).filter((id) => id !== f)); else k.fold(f);
        return;
      }
      if (!e.shiftKey && /^[1-9]$/.test(e.key)) {
        if (k.lines) {
          const b = k.lines[+e.key - 1];
          if (b) { took(); k.openLine(b.id); }
          return;
        }
        const id = k.order[+e.key - 1];
        if (!id) return;
        took();
        k.hold(id);
        return;
      }
      if (e.key === "Backspace" && k.picked.size && !typing) { took(); [...k.picked].forEach((id) => k.close(id)); }
    };
    window.addEventListener("keydown", down, true);
    return () => window.removeEventListener("keydown", down, true);
  }, [active]);

  // in the TUI the blocks it folded are its lines, not chips too
  const folded = live.filter((b) => !closedHeld.current.has(b.id) && placeOf(b.id)?.folded && !placeOf(b.id)?.popped && !(term && placeOf(b.id)?.lensed) && !isRunBody(b.body));
  const popped = live.filter((b) => placeOf(b.id)?.popped);
  // the tray (#739): the stage's own folded and popped blocks in front, in the order they were placed, then the project's
  const tray = trayGroups(
    seen.stage.blocks.map((p) => [...folded, ...popped].find((b) => b.id === p.id)).filter((b): b is Block => !!b)
      .map((b) => ({ id: b.id, kind: b.kind, title: b.title, own: true, popped: !!placeOf(b.id)?.popped })),
    (seen.tray ?? []).filter((t) => !seen.blocks.some((b) => b.id === t.id)));
  // a miniature pressed: its block onto the stage, where it was (its own) or where the stage finds room (the project's)
  const lifted = useRef(false);
  const pickMini = (m: Mini) => {
    if (lifted.current) { lifted.current = false; return; }
    if (m.popped) unpop(m.id);
    else if (m.own) { pour([m.id]); unfold(m.id); }
    else { store.pull(session, m.id, by); say(`${m.title} is here too · the same artifact, one ledger`); }
  };
  // a miniature dragged: the ghost of its born size follows on the stage; let go there, it lands under the pointer
  const liftMini = (m: Mini, e: RPointerEvent<HTMLElement>) => {
    const me = e.currentTarget, box = el.current?.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
    if (!box) return;
    me.setPointerCapture(e.pointerId);
    const kind = m.own ? live.find((b) => b.id === m.id)?.kind ?? m.kind : m.kind;
    let spot: Rect | null = null, moved = false;
    const inside = (ev: PointerEvent) => ev.clientX >= box.left && ev.clientX <= box.right && ev.clientY >= box.top && ev.clientY <= box.bottom && !trayHit(ev.clientX, ev.clientY);
    const mv = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      moved = true;
      spot = inside(ev) ? dropAt(size, kind, ev.clientX - box.left, ev.clientY - box.top) : null;
      setGhost(spot);
    };
    const up = (ev: PointerEvent) => {
      me.removeEventListener("pointermove", mv); me.removeEventListener("pointerup", up); me.removeEventListener("pointercancel", up);
      setGhost(null);
      if (!moved) return;
      lifted.current = true;
      setTimeout(() => { lifted.current = false; }, 0);
      if (!spot || ev.type !== "pointerup") return;
      if (m.popped) { unpop(m.id); return; }
      if (m.own) { pour([m.id]); movePlace(m.id, { ...spot, folded: false, z: zTop() + 1, hand: true }); }
      else { store.pull(session, m.id, by, { ...spot, hand: true }); say(`${m.title} is here too · the same artifact, one ledger`); }
    };
    me.addEventListener("pointermove", mv); me.addEventListener("pointerup", up); me.addEventListener("pointercancel", up);
  };
  // opened from the TUI's lines: unfolded where it was and focused
  const openLine = (id: string) => { if (placeOf(id)?.folded) unfold(id); focus(id); };
  // a run opened over the whole stage (its chip pressed) is the stage while it covers it: the blocks under it wait unseen
  const full = W ? zoneRect(size, "full") : null;
  const runOver = full ? on.filter((p) => isRunBody(live.find((b) => b.id === p.id)?.body) && p.w >= full.w - 1 && p.h >= full.h - 1).sort((x, y) => y.z - x.z)[0] : undefined;
  // stage: joins runs (#703): the project's runs, folded, are chips by the talk
  const runChips = live.filter((b) => placeOf(b.id)?.folded && isRunBody(b.body)).map((b) => <RunChip key={b.id} body={b.body as never} onOpen={() => openRun(b.id)} />);
  // #954, stage.whole: the IDE lens draws the blocks as editor groups, one tab each (lens.ts ideGroups); the TUI as panes
  const ide = stageWhole() && lens === "ide" && W ? ideGroups(order, { w: W, h: H }, PAD, GAP, TRAY.h) : null;
  const groupOf = (id: string) => ide?.findIndex((g) => g.ids.includes(id)) ?? -1;
  const tabOn = (gi: number) => { const g = ide![gi]; return g.ids.includes(ideTab[gi]) ? ideTab[gi] : g.ids[0]; };
  const zRank = zRanks(on, (id) => live.find((b) => b.id === id)?.state === "waits");   // B11: by last touch, waits above
  // #891, behind the switches: a block is solid only where it crosses another, or while one is dragged
  const solidNow = anyWhole() && W ? drawnSolid(live.flatMap((b) => { const p = shownAt(b.id); if (!p || p.folded || p.popped || p.ghost || closedHeld.current.has(b.id)) return []; return [{ id: b.id, r: drag?.id === b.id ? { ...p, ...drag.r } : p }]; }), !!drag) : null;
  return (
    <>
    <div ref={el} className={`st-stage ${stageWhole() ? "" : "marks-pearl"} ${drag ? "dragging" : ""} ${saidOn ? "st-saidon" : ""}`} data-mover={stageWhole() ? mover(live.some((b) => b.state === "waits") ? ["asks", "running"] : ["running"]) ?? "" : undefined} onPointerDown={onBare} onPointerDownCapture={(e) => { if (onFoot(e)) return; onJelly(e); }} onWheel={onWheel} data-stage={session} data-lens={lens} {...(cross ? { "data-cross-drop": "stage" } : {})}
      onPointerOver={onOver} onPointerLeave={() => clearTimeout(hoverT.current)} onDragOver={onDragOver} onDragLeave={(e) => { if (e.currentTarget === e.target) setGhost(null); }} onDrop={onDrop}>
      {/* #954: with stage.whole the empty stage is empty glass, also while the agent works (Marco, 2026-11-11: no words over it) */}
      {!live.length && !stageWhole() && <div className="st-empty"><div><b>nothing on the stage</b>ask for one thing, or three at once</div></div>}
      {stageWhole() && <div ref={pvLayer} className="st-pv" />}{/* B11: the drop preview's layer */}
      {live.map((b, i) => {
        const p = shownAt(b.id);
        if (!p || p.folded || p.popped || !W || closedHeld.current.has(b.id)) return null;   // B15: a held close is gone
        if (runOver && runOver.id !== b.id && p.z < runOver.z) return null;   // under the opened run: glass would show it through
        const gi = ide ? groupOf(b.id) : -1;
        if (ide && gi >= 0 && tabOn(gi) !== b.id) return null;   // #954: a tab behind its group's open one
        const r0 = gi >= 0 ? { ...p, ...ide![gi].r } : drag?.id === b.id ? { ...p, ...drag.r } : p;
        const r = stageWhole() ? { ...r0, z: zRank.get(b.id) ?? 1 } : r0;   // B11: by last touch, under waits (feel.md z-order)
        const tabs = gi >= 0 ? ide![gi].ids.map((id) => live.find((x) => x.id === id)!).filter(Boolean) : undefined;
        return (
          <Frame key={b.id} session={session} b={worked.has(b.id) && b.state === "live" ? { ...b, state: "working" } : b} r={r} n={i + 1} made={seen.ledger[b.id]?.[0]?.at} picked={picked.has(b.id)}
            ghost={!!p.ghost} held={heldOn === b.id} zoom={zoom[b.id] ?? 1} fading={fading.has(b.id)} onTake={() => take(b.id)} onHold={() => { if (heldOn !== b.id) setHeld(b.id); }} moving={moving.has(b.id)} born={born.has(b.id)} coming={coming.has(b.id)} dying={dying.has(b.id)} dragged={!!drag} solid={solidNow?.has(b.id)}
            ledger={ledger === b.id ? seen.ledger[b.id] ?? [] : null} sessions={b.sessions} shown={shown[b.id]} act={act(b.id)}
            lines={term?.id === b.id && lines ? lines : undefined} onLine={openLine}
            lens={stageWhole() ? lens : undefined} reading={order.indexOf(b.id) + 1} tabs={tabs} onTab={(id) => { setIdeTab((t) => ({ ...t, [gi]: id })); setHeld(id); }}
            onHead={onHead(b)} onGrip={onGrip(b)} onEdge={stageWhole() ? onEdge(b) : undefined} onFocus={() => focus(b.id)} onFold={() => (stageWhole() ? wholeFold(b.id) : fold(b.id))} onFreeze={() => freeze(b.id)} onClose={() => (stageWhole() ? closeHeld(b.id) : close(b.id))}
            onRef={() => reference(b.id)} attached={bar.on.some((o) => o.id === b.id)}
            onPress={(choice) => store.press?.(session, b.id, choice, by)}
            onLedger={() => setLedger((l) => (l === b.id ? null : b.id))}
            onVersion={(v) => {
              if (v > b.versions.length) { setShown((s) => ({ ...s, [b.id]: v })); store.update(session, b.id, { state: "live" }, `back to live · v${b.versions.length + 1} is what changes next`, by); }
              else { setShown((s) => ({ ...s, [b.id]: v })); if (b.state !== "frozen") store.update(session, b.id, { state: "frozen" }, `showing v${v}`, by); }
            }} />
        );
      })}
      {stageWhole() && lens === "tui" && W > 0 && <div className="st-tuikeys" aria-hidden>tab hold · ⌥←→ move · ⌘w fold · ⌘z undo{"\n"}⌘1-9 jump · esc the box</div>}{/* #954, whole.html scene 11 */}
      {guides.x !== null && <div className="st-guide v" style={{ left: guides.x }} />}
      {guides.y !== null && <div className="st-guide h" style={{ top: guides.y }} />}
      {ghost && <div className="st-ghost" style={{ left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h }}><svg width={ghost.w} height={ghost.h} aria-hidden><path d={curve(ghost.w - 1, ghost.h - 1, R, S, 0.5, 0.5)} /></svg></div>}
      {marq && <div className="st-marq" style={{ left: marq.x, top: marq.y, width: marq.w, height: marq.h }} />}
      {chipAt ? createPortal(runChips, chipAt) : null}
      {stageWhole() ? (
        <>
          {/* B16: the whole stage's tray; the run chips and a popped block's chip stay beside it */}
          <WholeTray ref={trayEl} session={session} groups={wholeTrayGroups(session, folded.map((b) => ({ id: b.id, kind: b.kind, title: b.title, made: b.sessions[0], body: b.body })), trayOf(seen))} bump={trayBump} open={trayOpen} onToggle={() => setTrayOpen((o) => !o)} onPick={(m) => { if (!m.own) { pullCopy(m); return; } wholeUnfold(m.id); setTrayOpen(false); }} onLift={(m, ev) => (m.own ? liftCopy(m, ev) : pullCopy(m, ev))} />
          {(popped.length > 0 || (!chipAt && runChips.length > 0)) && (
            <div className="st-folds">
              {!chipAt && runChips}
              {popped.map((b) => <button key={b.id} className="st-chip popped" title="its own window · a click brings it back" data-popped={b.id} onClick={() => unpop(b.id)}><Mark kind={b.kind} />{b.title}<span className="st-chipk">popped out</span></button>)}
            </div>
          )}
        </>
      ) : (
        <>
          {!chipAt && runChips.length > 0 && <div className="st-folds">{runChips}</div>}
          <Tray groups={tray} open={trayOpen} over={overTray} dragging={!!drag} onToggle={() => setTrayOpen((o) => !o)} onPick={pickMini} onLift={liftMini} />
        </>
      )}
      {scars.map((x) => <Scar key={x.id} r={x.r} onBack={() => scarBack(x.id)} />)}   {/* B15 */}
      {!stageWhole() && !saidOn && <Toast words={toast} />}
    </div>
    {saidOn && <SaidLine s={said ? sentence(said, saidTitle) : null} />}
    </>
  );
}

/** the line under the stage (#903, stage.said): what was just done and the way back, in its own strip so it never
 *  covers a block or the talk; the agent's steps marked as the agent's; it leaves by itself (said.ts SAID_STAYS) */
function SaidLine({ s }: { s: { words: string; back: string; agent: boolean } | null }) {
  const last = useRef(s);
  if (s) last.current = s;   // the words stay while the line fades out
  const w = last.current;
  return (
    <div className={`st-said ${s ? "on" : ""} ${w?.agent ? "agent" : ""}`} role="status" aria-live="polite" data-said={s ? "on" : ""}>
      {w && <><span className="st-saidw">{w.agent && <i className="st-saiddot" aria-hidden />}{w.words}</span>{w.back && <span className="st-saidk">{w.back}</span>}</>}
    </div>
  );
}

/** the toast at the stage's foot: the verb in the jelly's bands, then its words ("fold · its chip at the foot puts it
 *  back"); one at a time, gone after two pours */
function Toast({ words }: { words: string | null }) {
  const [verb, ...rest] = (words ?? "").split(" · ");
  return <div className={`st-toast ${words ? "on" : ""}`}>{rest.length ? <><b>{verb}</b>{rest.join(" · ")}</> : verb}</div>;
}
