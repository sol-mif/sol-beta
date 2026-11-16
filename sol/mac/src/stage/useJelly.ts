// The jelly's roles on the stage (#697, the stage's sitting 3): the hook the stage calls, ported from the prototype's
// jellyGo, jellyHome, blockSpot, birth and death (scratch/sol/stage/refs/play.html §6; the design page §5). The body is
// Body.tsx's, drawn by JellyLayer (never a CSS blob): this file only says where it goes, how it looks on the way, and
// when its six fly. The stage renders `<JellyLayer {...jelly.layer} />` inside its own box and calls:
//   compose  → birth(box)   six dots leave the jelly for the block's corners; the jelly follows and sits by it, its halo
//                           lighting the glass (arriving). Resolves when the dots land: the frame's warm pour starts then.
//   update   → travelTo(box) it comes apart, travels with its six leaning the way it goes, settles by the block, its
//                           halo close as light (working). Resolves when it has settled.
//   waits    → sitBy(box)   it sits by the block that waits on you, at rest (the breath).
//   freeze   → home()       it leaves: the jelly has no part in a frozen thing.
//   close    → death(box)   the dots fly back from the block's corners to the jelly. Resolves when they are home.
//   idle     → home()       home at the stage's foot (#734), the breath.
// Boxes are the stage's own px, the shape of stage.json's blocks ({ x, y, w, h }, design page §2), from the stage's top
// left. Home is the centre of the element the room hands in (`rest`), so its place is the room's, never a number here.
// Every number is the tokens' or tempo's: the jelly's frame is the space scale's s12, it sits in a block's title row
// (height.row) inside the frame's padding (s1 past its own half), it moves on the body's "between" spring (tempo.json
// body: moveMs, overshoot) and its six fly for the pour (palette.motion: duration and curve), sinking in for a slide.
// Reduced motion: it jumps where it goes, settled, and no dots fly; each call resolves at once.
// stage: joins sitting 2 — StageColumn.tsx owns the box the jelly's layer covers (`stage`: the stage alone, since #734, so
// a block's place is the jelly's box), the home anchor at the stage's foot (`rest`), the blocks' boxes,
// and calls these on compose, update, waits, freeze and close; it renders jelly.layer last in its box, so the jelly is
// over the frames. Only the stage calls it.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import tokens from "../../../design/system/tokens.json";
import { APART_R, BETWEEN, haloDoing, type BodyState, type Flight, type JellyLook } from "../Body";
import { CORNERS, cornersOf, easing, spotIn, type Box, type Pt } from "./jellyPath";
import { Spring, dur, ease, reducedMotion } from "../motion";
export type { Box, Pt } from "./jellyPath";

export type Doing = "rest" | "working" | "arriving";
export type Jelly = {
  /** to the block it works on: apart on the way, settles by it, working */
  travelTo: (b: Box) => Promise<void>;
  /** six dots fly from the jelly to the block; resolves when they land (start the frame's warm pour then) */
  birth: (b: Box) => Promise<void>;
  /** six dots fly back from the block to the jelly; resolves when they are home */
  death: (b: Box) => Promise<void>;
  /** home at the stage's foot, at rest */
  home: () => Promise<void>;
  /** beside the block that waits on you, at rest */
  sitBy: (b: Box) => Promise<void>;
  /** the stage moved or changed size (#734): at once, with no travel, by the block given, else home */
  jump: (b?: Box) => void;
  /** where it is now, in the stage's px (its centre) */
  where: () => Pt;
  /** in the person's hand (#737: dropped on a block, "this one"): it follows the point at once, apart; null lets go */
  hold: (p: Pt | null) => void;
  /** what JellyLayer (Body.tsx) draws: spread it on the layer */
  layer: { look: JellyLook; place: (el: HTMLDivElement | null) => void; onLand: (id: number) => void; onDone: (id: number) => void };
};

const SCALE = tokens.palette.scale;
/** the jelly's frame on the stage: the space scale's largest step (the prototype's 44 px jelly, to the scale) */
export const SIZE = SCALE.space.s12;
/** where it sits by a block: in the frame's title row, its body's half and a step in from the right edge (blockSpot) */
export const spotBy = (b: Box): Pt => spotIn(b, SIZE, SCALE.height.row, SCALE.space.s1);
/** the pour: how long the six fly and on what curve (palette.motion), and how long they take to sink in (the slide) */
export const POUR = { get ms() { return dur("pour"); }, ease: easing(ease("pour")), get sink() { return dur("turn"); } };

/** the stage's jelly. `stage`: the stage's box, the one JellyLayer is laid in. `rest`: the anchor for home (StageColumn.tsx, the stage's foot) */
export function useJelly(stage: RefObject<HTMLElement | null>, rest: RefObject<HTMLElement | null>): Jelly {
  const [state, setState] = useState<BodyState>("settled");
  const [lean, setLean] = useState<readonly [number, number] | null>(null);
  const [doing, setDoing] = useState<Doing>("rest");
  const [flights, setFlights] = useState<Flight[]>([]);
  const el = useRef<HTMLDivElement | null>(null);
  const at = useRef<Pt>({ x: 0, y: 0 });
  const placed = useRef(false);
  // the one move in flight: its target and the promise it owes; a new move retargets the springs and pays the old one
  const move = useRef<{ to: Pt; apart: boolean; done: () => void } | null>(null);
  const waits = useRef(new Map<number, { land: () => void; done: () => void }>());
  const nextId = useRef(1);

  const put = useCallback(() => {
    const e = el.current;
    if (e) e.style.translate = `${at.current.x - SIZE / 2}px ${at.current.y - SIZE / 2}px`;
  }, []);
  // arrived: settled once what is left of the way is less than its own frame (play.html settles on a timer; here the
  // spring says when, so an interrupted move settles where it really ends)
  const near = useCallback(() => {
    const m = move.current;
    if (!m) return;
    const left = Math.hypot(m.to.x - at.current.x, m.to.y - at.current.y);
    if (left >= SIZE && !reducedMotion()) return;
    move.current = null;
    if (m.apart) { setState("settled"); setLean(null); }
    m.done();
  }, []);
  const springs = useMemo(() => ({
    x: new Spring(0, BETWEEN, (v) => { at.current.x = v; put(); near(); }, near),
    y: new Spring(0, BETWEEN, (v) => { at.current.y = v; put(); near(); }, near),
  }), [put, near]);
  useEffect(() => () => { springs.x.stop(); springs.y.stop(); move.current?.done(); waits.current.forEach((w) => { w.land(); w.done(); }); }, [springs]);

  /** the home anchor's centre, in the stage's px; with no anchor yet, the stage's bottom left by one frame */
  const homeSpot = useCallback((): Pt => {
    const s = stage.current?.getBoundingClientRect(), r = rest.current?.getBoundingClientRect();
    if (s && r && r.width + r.height > 0) return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 };
    return { x: SIZE, y: (s?.height ?? SIZE * 2) - SIZE };
  }, [stage, rest]);

  const place = useCallback((e: HTMLDivElement | null) => { el.current = e; put(); }, [put]);
  // the first place: home, at once (play.html's init), once the stage and its home anchor are both laid out (the anchor's
  // ref may not be there while the layer's is being attached)
  useLayoutEffect(() => {
    if (placed.current) return;
    placed.current = true;
    const h = homeSpot();
    springs.x.set(h.x); springs.y.set(h.y);
  }, [homeSpot, springs]);

  /** jellyGo: apart when the way is longer than its frame, its six leaning the way it goes, then settled by the spot */
  const go = useCallback((to: Pt, how: Doing): Promise<void> => {
    setDoing(how);
    move.current?.done();
    const dx = to.x - at.current.x, dy = to.y - at.current.y, apart = Math.hypot(dx, dy) > SIZE && !reducedMotion();
    if (apart) { setState("apart"); setLean([Math.sign(dx), Math.sign(dy)]); }
    return new Promise<void>((done) => {
      move.current = { to, apart, done };
      springs.x.to(to.x); springs.y.to(to.y);
      near();
    });
  }, [springs, near]);

  /** six dots in the air; resolves on landing (`on: "land"`) or once they are gone (`"done"`) */
  const fly = useCallback((from: Pt[], to: Pt[], how: Doing, on: "land" | "done"): Promise<void> => {
    if (reducedMotion()) return Promise.resolve();
    const id = nextId.current++;
    const f: Flight = { id, from, to, t0: performance.now(), ms: POUR.ms, sink: POUR.sink, ease: POUR.ease, dot: APART_R * SIZE, halo: haloDoing(how) };
    return new Promise<void>((res) => {
      waits.current.set(id, { land: on === "land" ? res : () => {}, done: on === "done" ? res : () => {} });
      setFlights((fs) => [...fs, f]);
    });
  }, []);
  const onLand = useCallback((id: number) => { waits.current.get(id)?.land(); }, []);
  const onDone = useCallback((id: number) => {
    waits.current.get(id)?.done();
    waits.current.delete(id);
    setFlights((fs) => fs.filter((f) => f.id !== id));
  }, []);

  const travelTo = useCallback((b: Box) => go(spotBy(b), "working"), [go]);
  const sitBy = useCallback((b: Box) => go(spotBy(b), "rest"), [go]);
  const home = useCallback(() => go(homeSpot(), "rest"), [go, homeSpot]);
  const birth = useCallback((b: Box) => {
    // the dots leave from where the jelly is now; it follows them to the block (play.html: jellyGo, then birth)
    const from = { ...at.current };
    void go(spotBy(b), "arriving");
    return fly(CORNERS.map(() => from), cornersOf(b), "arriving", "land");
  }, [go, fly]);
  const death = useCallback((b: Box) => fly(cornersOf(b), CORNERS.map(() => ({ ...at.current })), "working", "done"), [fly]);

  const jump = useCallback((b?: Box) => {
    const to = b ? spotBy(b) : homeSpot();
    move.current?.done(); move.current = null;
    springs.x.set(to.x); springs.y.set(to.y);
    setState("settled"); setLean(null); setDoing("rest");
  }, [springs, homeSpot]);
  const where = useCallback((): Pt => ({ ...at.current }), []);
  const hold = useCallback((p: Pt | null) => {
    move.current?.done(); move.current = null;
    if (!p) { setState("settled"); setDoing("rest"); return; }
    springs.x.set(p.x); springs.y.set(p.y);
    setState("apart"); setLean(null);
  }, [springs]);
  const look: JellyLook = useMemo(() => ({ size: SIZE, state, lean, halo: haloDoing(doing), flights }), [state, lean, doing, flights]);
  return { travelTo, birth, death, home, sitBy, jump, where, hold, layer: { look, place, onLand, onDone } };
}
