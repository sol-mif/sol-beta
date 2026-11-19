// A system block (#1091; the design Marco approved: scratch/sol/system-stage/brand.html): one area of the systems
// registry (sol/systems/records) drawn in five lanes, left to right: Why · Rules · Source · Machine · Surface. Each
// system is a glass tile with its live face, the ring of five beats its record closes (signal, owner, decision, change,
// check) and its wires; a red dashed wire is a known gap, its reason on hover. A press on a tile lights what feeds it
// (pearl) and what it feeds (yellow), dims the rest, and the trace at the foot says why → this → the surfaces it reaches.
//
// It is never drawn by hand: the engine reads the records (work.systems.area) and tells this block when one changes on
// disk (work.systems.changed). What changed grows in front of you: a new system is born, a new wire draws in with the
// yellow flow, a beat that closed fills. The strip at the top says what grew since you last looked; Replay plays the
// area's growth from git's history of the records, oldest to newest, in about eight seconds. Read-only in this pass.
//
// The work under way (#1156): the engine says which sessions are changing which systems now (work.systems.live). A
// system being changed wears a mark under its tile, one line per session (who, which session, how far its branch is
// from main) and its open PRs; a new change flashes the tile. Pressing a line opens that session. A changed folder no
// record holds is named under the lanes as "no system yet".
//
// The lens (#1220): the agent takes a person through the map by writing a lens into the body beside the area (focus,
// path, say, step, mark, fit, view, show; system/lens.ts). The face lays it over the hand's state: the focus is a click,
// a path is lit and numbered with the rest dimmed, the sentence stands where the since strip is, ← → send the step to
// the session, a mark is a coloured tab, fit eases the camera. A click or a drag of the person's wins until the agent's
// next lens ("yours"). With view "window" the area is drawn on a miniature of the real window, each surface on its region.
import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Button, Glass, useSize } from "../../kit";
import { CURVE, SHADE } from "../../kit/tokens";
import { store } from "../engineStore";
import { openSession } from "../../runs/useSessions";
import type { KindProps } from "./types";
import { FaceOf } from "./system/faces";
import {
  BEATS, BEAT_WORDS, EMPTY, LANE_WORDS, LAYERS, downOf, grew, growWords, grewAny, laneX, layout, sinceWords, traceOf, upOf,
  wirePath, worldOf, TILE_W, REAL_PIECES, movedSystems, tileFor, workOn, workTitle, workWords, windowLayout, windowWire, type Box, type Facts, type Frame, type Gap, type Grew, type Live,
  type Tile, type View,
} from "./system/model";
import { MARK_COLOUR, fitCam, lensIn, lensKey, lensOf, stepWords, tileLook, type Lens, type Mark, type Show } from "./system/lens";
import "./system/system.css";
import { TeamStrip, STRIP_H } from "./system/TeamStrip";   // the team against the iteration, at the top (#1167)

export type SystemBody = { area?: string; /** a person's login: the team strip opens with their detail (#1167) */ person?: string; /** the agent's walk (#1220) */ lens?: Lens };
/** how long the lens's camera takes to ease to what it fits */
const EASE_MS = 700;

const SEEN = (area: string) => `sol.systems.seen.${area}`;
const seenOf = (area: string): number | null => { try { const v = Number(localStorage.getItem(SEEN(area))); return v > 0 ? v : null; } catch { return null; } };
const markSeen = (area: string) => { try { localStorage.setItem(SEEN(area), String(Date.now())); } catch { /* private window */ } };
/** how long a growth is shown (born, flash, the new wire's flow, a beat filling) */
const GROW_MS = 2400;
/** the replay's whole length */
const REPLAY_MS = 8000;

const stopTimers = (r: { current: number[] }) => { for (const t of r.current) clearTimeout(t); r.current = []; };

type Marks = { born: Set<string>; flash: Set<string>; wires: Set<string>; closed: Set<string> };
const NONE: Marks = { born: new Set(), flash: new Set(), wires: new Set(), closed: new Set() };
const marksOf = (g: Grew): Marks => ({
  born: new Set(g.born), flash: new Set([...g.changed, ...g.closed.map((c) => c.split(":")[0]), ...g.mended.map((k) => k.split(">")[1])]),
  wires: new Set(g.wires), closed: new Set(g.closed),
});

/** the ring of five beats; `closed` the beats that just closed, by name, comma-joined (a string, so a tile's props stay
 *  equal while nothing about it changed) */
function RingMark({ t, closed }: { t: Tile; closed: string }) {
  const s = 26, r = 10, seg = (2 * Math.PI) / 5, gap = 0.36, just = closed ? closed.split(",") : [];
  return (
    <svg className="sy-ring" viewBox={`0 0 ${s} ${s}`} width={s} height={s}>
      {BEATS.map((b, i) => {
        const a0 = -Math.PI / 2 + i * seg + gap / 2, a1 = a0 + seg - gap, on = t.ring[b];
        const d = `M${s / 2 + r * Math.cos(a0)},${s / 2 + r * Math.sin(a0)} A${r},${r} 0 0 1 ${s / 2 + r * Math.cos(a1)},${s / 2 + r * Math.sin(a1)}`;
        return <path key={b} d={d} className={`${on ? "on" : "off"}${just.includes(b) ? " closed" : ""}`}><title>{`${b}: ${on ? BEAT_WORDS[b] : `empty (${BEAT_WORDS[b]})`}`}</title></path>;
      })}
    </svg>
  );
}

/** the lens's marks on a tile or a region: its number on the path, and its mark as a coloured tab */
function LensMarks({ num, mark }: { num: number | null; mark: Mark | null }) {
  return (
    <>
      {num !== null && <span className="sy-num" data-num={num}>{num}</span>}
      {mark && <span className={`sy-tab ${mark}`} style={{ background: MARK_COLOUR[mark] }} data-mark={mark}>{mark}</span>}
    </>
  );
}

/** one system's tile; drawn again only when something it shows changed (a pan or a zoom moves the world, not it) */
const SysTile = memo(function SysTile({ t, bx, cls, sel, closed, facts, gaps, pick, num = null, mark = null, show, small }: {
  t: Tile; bx: Box; cls: string; sel: boolean; closed: string; facts: Facts; gaps: Gap[]; pick: (id: string) => void;
  num?: number | null; mark?: Mark | null; show?: Show; /** beside the window: the head only */ small?: boolean;
}) {
  return (
    <div className={cls} style={{ left: bx.x, top: bx.y, width: bx.w, height: bx.h, ...(mark ? { boxShadow: `0 0 0 2px ${MARK_COLOUR[mark]}` } : {}) }} data-id={t.id} data-part={t.name} data-go={t.id}
      onPointerDown={(e) => e.stopPropagation()} onClick={() => pick(t.id)}>
      <Glass r={CURVE.radius.box} surface={sel ? "raised" : "glass"} fill={`rgb(255 255 255 / ${t.inArea ? SHADE.on.flat : SHADE.on.line})`} />
      <div className="sy-hd"><RingMark t={t} closed={closed} /><span className="sy-nm">{t.name}</span></div>
      {!small && <div className="sy-face"><FaceOf t={t} facts={facts} gaps={gaps} show={show} /></div>}
      <LensMarks num={num} mark={mark} />
    </div>
  );
});

/** a region of the miniature window: its word, the record on it, its real piece when it has the room; a region whose
 *  record the area does not draw stays an empty outline, so the window still reads as the window */
const Region = memo(function Region({ word, t, bx, cls, facts, gaps, pick, num, mark, show }: {
  word: string; t: Tile | undefined; bx: Box; cls: string; facts: Facts; gaps: Gap[]; pick: (id: string) => void; num: number | null; mark: Mark | null; show?: Show;
}) {
  const roomy = bx.w >= 140 && bx.h >= 56 && !!t && !!FACE_REAL.has(t.id);
  return (
    <div className={cls} style={{ left: bx.x, top: bx.y, width: bx.w, height: bx.h, ...(mark ? { outline: `2px solid ${MARK_COLOUR[mark]}`, outlineOffset: -1 } : {}) }}
      data-region={word} data-id={t?.id} data-go={t?.id} onPointerDown={(e) => { if (t) e.stopPropagation(); }} onClick={t ? () => pick(t.id) : undefined}>
      <span className="sy-rg-w">{word}{t && <b>{t.name}</b>}</span>
      {roomy && <div className="sy-rg-piece" style={{ zoom: Math.min(0.8, (bx.h - 22) / 150, (bx.w - 8) / 260) }}><FaceOf t={t} facts={facts} gaps={gaps} show={show} /></div>}
      <LensMarks num={num} mark={mark} />
    </div>
  );
});
const FACE_REAL = new Set<string>(REAL_PIECES);

/** `sel` and `onSel` (#1416): a place outside holds the pick (Cowork's address: … › design › a system); the block
 *  follows it and says each pick of its own, and leaves Escape to the place */
export function System({ body, session, sel: held, onSel }: KindProps<SystemBody> & { sel?: string | null; onSel?: (id: string | null) => void }) {
  const area = body?.area ?? "";
  // the agent's lens, read again only when the agent wrote a different one
  const lensRaw = lensIn(body), key = lensKey(lensRaw);
  const lens = useMemo(() => lensRaw, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  const link = store.link();
  const [live, setLive] = useState<View | null>(null);
  const [facts, setFacts] = useState<Facts>({});
  const [shown, setShown] = useState<View>(EMPTY);
  const [frames, setFrames] = useState<Frame[] | null>(null);
  const [error, setError] = useState("");
  const [marks, setMarks] = useState<Marks>(NONE);
  const [lastGrew, setLastGrew] = useState<Grew | null>(null);
  const [sel, setSel] = useState<string | null>(held ?? null);
  const [replay, setReplay] = useState<{ i: number; n: number; subject: string; at: number } | null>(null);
  const [now, setNow] = useState<Live | null>(null);   // the work under way (#1156)
  const [pulse, setPulse] = useState<Set<string>>(() => new Set());
  const looked = useRef<number | null>(area ? seenOf(area) : null);
  const shownRef = useRef<View>(EMPTY);
  /** the live view as it is now (a replay ends on it, whatever came while it played) */
  const liveRef = useRef<View | null>(null);
  const timers = useRef<number[]>([]);
  const replaying = useRef(false);

  // a new view: what grew between the one on screen and it is marked for a moment
  const show = useCallback((next: View, animate = true) => {
    const g = grew(shownRef.current, next);
    shownRef.current = next;
    setShown(next);
    if (!animate || !grewAny(g)) return;
    setMarks(marksOf(g)); setLastGrew(g);
    const t = window.setTimeout(() => { setMarks(NONE); setLastGrew(null); }, GROW_MS);
    timers.current.push(t);
  }, []);
  // a reading of the work under way; one the engine pushed flashes the systems whose work moved since the last
  const nowRef = useRef<Live | null>(null), pulseT = useRef<number | undefined>(undefined);
  const takeNow = useCallback((l: Live, pushed: boolean) => {
    const before = nowRef.current; nowRef.current = l; setNow(l);
    const moved = pushed && before ? movedSystems(before, l) : [];
    if (!moved.length) return;
    setPulse(new Set(moved));
    window.clearTimeout(pulseT.current);   // a newer change: its flash runs its whole length
    pulseT.current = window.setTimeout(() => setPulse(new Set()), GROW_MS);
  }, []);
  const takeLive = useCallback((v: View) => { setError(""); liveRef.current = v; setLive(v); }, []);   // a good view clears what went wrong before

  useEffect(() => {
    // a new area: what was on screen for the last one goes, a replay of it included, and its own last look is read
    stopTimers(timers); replaying.current = false; setReplay(null); setSel(null); setMarks(NONE); setLastGrew(null); setPulse(new Set()); nowRef.current = null;
    setFrames(null); setError(""); liveRef.current = null; setLive(null); shownRef.current = EMPTY; setShown(EMPTY);
    looked.current = area ? seenOf(area) : null;
    if (!link || !area) return;
    let gone = false;
    const ask = () => {
      void link.ask<{ view?: View; facts?: Facts; error?: string }>("work.systems.area", { area }).then((r) => {
        if (gone) return;
        if (r?.error || !r?.view) { setError(r?.error ?? "the engine sent no area"); return; }
        takeLive(r.view); setFacts(r.facts ?? {});
        if (!replaying.current) show(r.view, shownRef.current.tiles.length > 0);
      });
      void link.ask<{ frames?: Frame[] }>("work.systems.history", { area }).then((r) => { if (!gone) setFrames(r?.frames ?? []); });
      void link.ask<{ live?: Live }>("work.systems.live", {}).then((r) => { if (!gone && r?.live) takeNow(r.live, false); });
    };
    ask();
    const off = link.listen((m: { type?: string; area?: string; view?: View; facts?: Facts; live?: Live }) => {
      if (m?.type === "open") { ask(); return; }   // the socket came back: ask again, so the engine holds the area and watches
      if (m?.type === "work.systems.live") { if (m.live) takeNow(m.live, true); return; }
      if (m?.type !== "work.systems.changed" || m.area !== area || !m.view) return;
      takeLive(m.view); if (m.facts) setFacts(m.facts);
      if (!replaying.current) show(m.view);
    });
    const leave = () => markSeen(area);
    addEventListener("pagehide", leave);
    return () => {
      gone = true; off(); leave(); removeEventListener("pagehide", leave); stopTimers(timers); replaying.current = false;
      window.clearTimeout(pulseT.current);
      link.send({ type: "work.systems.live", off: true });   // this block lets go: the engine stops reading when no block holds the view
    };
  }, [link, area, show, takeLive, takeNow]);

  // the replay: the area's growth from its first commit to now, about eight seconds, then back to the live view as it
  // is at the end (a record may have landed while it played)
  const play = useCallback(() => {
    if (!frames?.length || replaying.current) return;
    replaying.current = true; setSel(null);
    const per = Math.max(400, Math.min(1600, REPLAY_MS / frames.length));
    show(EMPTY, false);
    frames.forEach((f, i) => timers.current.push(window.setTimeout(() => { setReplay({ i: i + 1, n: frames.length, subject: f.subject, at: f.at }); show(f.view); }, 300 + i * per)));
    timers.current.push(window.setTimeout(() => { replaying.current = false; setReplay(null); if (liveRef.current) show(liveRef.current); }, 300 + frames.length * per + per * 0.6));
  }, [frames, show]);

  // ---- the camera: fit the five lanes in the block, wheel to zoom, drag the floor to pan ----
  const host = useRef<HTMLDivElement>(null), [W, H] = useSize(host);
  const worldEl = useRef<HTMLDivElement>(null);
  // the lens over what is shown; with view "window" the area stands on the miniature window instead of the lanes
  const ln = useMemo(() => lensOf(shown, lens), [shown, lens]);
  const win = ln.view === "window";
  const winL = useMemo(() => (win ? windowLayout(shown) : null), [win, shown]);
  const boxes = useMemo(() => (winL ? winL.boxes : layout(shown)), [winL, shown]);
  const world = useMemo(() => (winL ? { w: winL.w, h: winL.h } : worldOf(boxes)), [winL, boxes]);
  /** the person moved the camera since the agent's last lens: theirs until the next one */
  const [mine, setMine] = useState(false);
  const [eased, setEased] = useState(false);
  const [asked, setAsked] = useState(false);   // a step press went to the session; the next lens answers it
  const [stripShown, setStripShown] = useState(false);   // the team strip's room, only while it is on screen (#1167)
  const stripH = stripShown && replay === null ? STRIP_H : 0;
  const fitK = useMemo(() => (W && H ? Math.min(1, (W - 40) / world.w, Math.max(80, H - 140 - stripH) / Math.max(320, world.h + 60)) : 1), [W, H, world.w, world.h, stripH]);
  const [cam, setCam] = useState<{ x: number; y: number; k: number } | null>(null);
  const c = cam ?? { k: fitK, x: Math.max(20, (W - world.w * fitK) / 2), y: 92 + stripH };
  const cRef = useRef(c); cRef.current = c;
  // a drag moves the world's one transform as it goes; the camera is kept once, when the pointer lets go
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; x: number; y: number; moved: boolean } | null>(null);
  const onDown = (e: RPointerEvent) => {
    if ((e.target as HTMLElement).closest(".sy-t, .sy-top, .sy-trace, .ts, button")) return;
    drag.current = { sx: e.clientX, sy: e.clientY, ox: c.x, oy: c.y, x: c.x, y: c.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.stopPropagation();
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current; if (!d) return;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true;
    if (!d.moved) return;
    d.x = d.ox + e.clientX - d.sx; d.y = d.oy + e.clientY - d.sy;
    if (worldEl.current) worldEl.current.style.transform = `translate(${d.x}px, ${d.y}px) scale(${cRef.current.k})`;
  };
  const onUp = () => { const d = drag.current; drag.current = null; if (!d) return; if (d.moved) { setCam({ k: cRef.current.k, x: d.x, y: d.y }); setMine(true); } else setSel(null); };
  // a new lens: the person's pick and camera are let go, a change of view starts from its own whole, and fit eases the
  // camera once to what it names (when the tiles are laid out)
  const fitted = useRef(""), lastView = useRef(ln.view), easeT = useRef<number | undefined>(undefined);
  useEffect(() => {
    setSel(null); setMine(false); setAsked(false); fitted.current = "";
    if (lastView.current !== ln.view) { lastView.current = ln.view; setCam(null); }
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!lens || mine || !W || !H || fitted.current === key) return;
    const ids = ln.fit === "area" ? [...boxes.keys()] : ln.fit;
    if (!ids) { fitted.current = key; return; }
    const bs = ids.map((id) => boxes.get(id)).filter((b): b is Box => !!b);
    if (!bs.length) return;   // not laid out yet
    const to = fitCam(bs, W, H, 92 + stripH);
    fitted.current = key;
    if (!to) return;
    setEased(true); setCam(to);
    window.clearTimeout(easeT.current);
    easeT.current = window.setTimeout(() => setEased(false), EASE_MS + 60);
  }, [key, lens, ln.fit, boxes, W, H, mine, stripH]);
  useEffect(() => () => window.clearTimeout(easeT.current), []);
  const backToLens = () => { setSel(null); setMine(false); fitted.current = ""; if (!ln.fit) setCam(null); };
  const stepTo = (dir: -1 | 1) => {
    if (!ln.step || !link || !session || asked) return;
    setAsked(true);
    void Promise.resolve(link.ask("work.say", { sessionId: session, text: stepWords(area, ln.step, dir) }, 1500)).catch(() => setAsked(false));
  };
  const drawn = !!(area && link && !error);
  useEffect(() => {
    const el = host.current; if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaX) + Math.abs(e.deltaY) < 1) return;
      e.preventDefault(); e.stopPropagation();
      const r = el.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      setCam((o) => {
        const cur = o ?? cRef.current, k = Math.min(2, Math.max(0.25, cur.k * Math.exp(-e.deltaY * 0.0015)));
        return { k, x: px - ((px - cur.x) * k) / cur.k, y: py - ((py - cur.y) * k) / cur.k };
      });
      setMine(true);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [drawn]);
  const placed = !!onSel;
  useEffect(() => {
    if (placed) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setSel(null); };
    addEventListener("keydown", esc); return () => removeEventListener("keydown", esc);
  }, [placed]);
  // the pick and the place, both ways: the place moves (back, a crumb) and the pick follows; a pick here moves the place.
  // After the resets above (a new area, a new lens), so a place opened on a system keeps it
  const onSelRef = useRef(onSel); onSelRef.current = onSel;
  const heldRef = useRef(held); heldRef.current = held;
  useEffect(() => { if (onSelRef.current) setSel(held ?? null); }, [held]);
  useEffect(() => { if (onSelRef.current && sel !== (heldRef.current ?? null)) onSelRef.current(sel); }, [sel]);

  const byId = useMemo(() => new Map(shown.tiles.map((t) => [t.id, t])), [shown]);
  // the work under way, by drawn tile; a tile whose work moved flashes for a moment
  const onTile = useMemo(() => workOn(now, new Set(byId.keys())), [now, byId]);
  const drawnIds = useMemo(() => new Set(byId.keys()), [byId]);
  // work on a system of this area that is not drawn (no wire yet): named under the lanes, so no change goes unseen
  const offTile = useMemo(() => (now?.work ?? []).filter((w) => (w.system === area || w.system.startsWith(`${area}/`)) && !tileFor(w.system, drawnIds)), [now, area, drawnIds]);
  // a folder no record holds, in the area it sits nearest (or in every area when it sits nearest none)
  const unheld = useMemo(() => (now?.uncovered ?? []).filter((u) => !u.near || u.near === "jelly" || u.near === area || u.near.startsWith(`${area}/`)), [now, area]);
  const pulsing = useMemo(() => new Set([...pulse].map((s) => tileFor(s, drawnIds)).filter((x): x is string => !!x)), [pulse, drawnIds]);
  const nameOf = useCallback((id: string) => byId.get(id)?.name ?? live?.tiles.find((t) => t.id === id)?.name ?? id, [byId, live]);
  // the pick: the person's click, else the lens's focus (a click's effect)
  const eff = sel ?? ln.focus;
  const up = useMemo(() => (eff ? upOf(eff, shown.wires) : new Set<string>()), [eff, shown]);
  const down = useMemo(() => (eff ? downOf(eff, shown.wires) : new Set<string>()), [eff, shown]);
  const trace = eff && byId.has(eff) ? traceOf(eff, shown) : null;
  const since = useMemo(() => (live && frames ? sinceWords(frames, live, looked.current, nameOf) : ""), [live, frames, nameOf]);
  const pick = useCallback((id: string) => setSel((s) => (s === id ? null : id)), []);
  // dimmed: under a walk (no pick of the person's) what the path does not name; else, as a click, what is not up or down
  const lookDim = (id: string, pathDim: boolean) => (!sel && ln.dims ? pathDim : !!eff && eff !== id && !up.has(id) && !down.has(id));
  const center = (id: string) => {
    const bx = boxes.get(id); if (!bx) return;
    setSel(id); setMine(true); setCam({ k: c.k, x: W / 2 - (bx.x + bx.w / 2) * c.k, y: H / 2 - (bx.y + 60) * c.k });
  };

  // the wires, drawn again only when the view, the selection, the lens or a growth changed (never on a pan or a zoom).
  // Under a path (and no pick of the person's) its legs are lit and the rest faint; a leg with no wire is drawn dashed
  const wires = useMemo(() => {
    const laneOf = (id: string) => byId.get(id)?.layer;
    const onWin = (id: string) => !!winL && !winL.beside.has(id);
    const legs = new Set(ln.legs.filter((l) => !l.missing).flatMap((l) => [`${l.from}>${l.to}`, `${l.to}>${l.from}`]));
    const walking = !sel && ln.dims;
    const wireClass = (a: string, z: string) => {
      let k = "sy-w";
      if (marks.wires.has(`${a}>${z}`)) k += " drawn";
      if (walking) k += legs.has(`${a}>${z}`) ? " lens" : " faint";
      else if (eff) {
        if ((a === eff || down.has(a)) && down.has(z)) k += " down";
        else if ((z === eff || up.has(z)) && up.has(a)) k += " up";
        else k += " faint";
      }
      return k;
    };
    const d = (A: Box, Z: Box, a: string, z: string) => (winL ? windowWire(A, Z) : wirePath(A, Z, laneOf(a) === laneOf(z)));
    // on the window, a wire between two regions is inside it: the window shows that join itself
    const skip = (a: string, z: string) => onWin(a) && onWin(z) && !legs.has(`${a}>${z}`);
    return (
      <svg className="sy-wires" width={world.w} height={Math.max(world.h, 300)}>
        {shown.wires.map(([a, z]) => {
          const A = boxes.get(a), Z = boxes.get(z);
          return A && Z && !skip(a, z) ? <path key={`${a}>${z}`} className={wireClass(a, z)} d={d(A, Z, a, z)} /> : null;
        })}
        {shown.gaps.map((g) => {
          const A = boxes.get(g.from), Z = boxes.get(g.to);
          return A && Z && !skip(g.from, g.to) ? (
            <path key={`gap ${g.from}>${g.to}`} className={`sy-w gap${eff || walking ? " faint" : ""}`} d={d(A, Z, g.from, g.to)}>
              <title>{`A known gap: ${nameOf(g.from)} → ${nameOf(g.to)}. ${g.why}`}</title>
            </path>
          ) : null;
        })}
        {!sel && ln.legs.filter((l) => l.missing).map((l) => {
          const A = boxes.get(l.from), Z = boxes.get(l.to);
          return A && Z ? <path key={`leg ${l.from}>${l.to}`} className="sy-w leg-gap" d={d(A, Z, l.from, l.to)}><title>{`No wire yet: ${nameOf(l.from)} → ${nameOf(l.to)}`}</title></path> : null;
        })}
      </svg>
    );
  }, [shown, boxes, byId, sel, eff, up, down, marks.wires, world.w, world.h, nameOf, ln, winL]);

  if (!area) return <div className="sy-none">This block names no area: its body is {"{ \"area\": \"design\" }"}.</div>;
  if (!link) return <div className="sy-none">The systems are read from the engine; none is connected.</div>;
  if (error) return <div className="sy-none">{error}</div>;

  return (
    <div ref={host} className={`sy${eff ? " has-sel" : ""}${winL ? " window" : ""}${replay ? " replaying" : ""}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} data-part="the systems" data-view={ln.view}>
      <div ref={worldEl} className={`sy-world${eased ? " eased" : ""}`} style={{ transform: `translate(${c.x}px, ${c.y}px) scale(${c.k})`, width: world.w, height: world.h }}>
        {!winL && LAYERS.map((l) => (
          <div key={l} className="sy-lane" style={{ left: laneX(l) - 10, width: TILE_W + 20, height: Math.max(world.h, 300) + 30 }}>
            <div className="sy-lane-h"><b>{LANE_WORDS[l][0]}</b><span>{LANE_WORDS[l][1]}</span></div>
          </div>
        ))}
        {winL && <div className="sy-win-mini" style={{ left: winL.win.x, top: winL.win.y, width: winL.win.w, height: winL.win.h }} data-part="the window" />}
        {winL && winL.regions.map((r) => {
          const t = byId.get(r.id), look = tileLook(r.id, ln, sel);
          const cls = ["sy-rg", t ? "" : "empty", t && look.sel ? "sel" : "", t && lookDim(r.id, look.dim) ? "dim" : ""].filter(Boolean).join(" ");
          return <Region key={r.id} word={r.word} t={t} bx={r.box} cls={cls} facts={facts} gaps={shown.gaps} pick={pick} num={t ? look.num : null} mark={t ? look.mark : null} show={ln.show.get(r.id)} />;
        })}
        {wires}
        {shown.tiles.map((t) => {
          if (winL && !winL.beside.has(t.id)) return null;   // on the window: drawn as its region
          const look = tileLook(t.id, ln, sel);
          const cls = ["sy-t", t.inArea ? "" : "out", winL ? "beside" : "", look.sel ? "sel" : "", lookDim(t.id, look.dim) ? "dim" : "",
            marks.born.has(t.id) ? "born" : "", marks.flash.has(t.id) || pulsing.has(t.id) ? "flash" : ""].filter(Boolean).join(" ");
          const closed = BEATS.filter((b) => marks.closed.has(`${t.id}:${b}`)).join(",");
          return <SysTile key={t.id} t={t} bx={boxes.get(t.id)!} cls={cls} sel={look.sel} closed={closed} facts={facts} gaps={shown.gaps} pick={pick}
            num={look.num} mark={look.mark} show={ln.show.get(t.id)} small={!!winL} />;
        })}
        {replay === null && !winL && [...onTile].map(([id, o]) => {
          const bx = boxes.get(id); if (!bx) return null;
          const more = o.work.length - 2;
          return (
            <div key={`work ${id}`} className="sy-work" style={{ left: bx.x + 12, top: bx.y + bx.h - 11, maxWidth: bx.w - 24 }} data-work={id}>
              {o.work.slice(0, 2).map((w) => (
                <button key={w.session} className="sy-now" title={workTitle(w)} data-layer="session" onClick={() => openSession(w.session)}>{workWords(w)}</button>
              ))}
              {more > 0 && <span title={o.work.slice(2).map((w) => workWords(w)).join("\n")}>+{more}</span>}
              {o.prs.length > 0 && <span title={o.prs.map((n) => `#${n}`).join(" ")}>{o.prs.length} open PR{o.prs.length === 1 ? "" : "s"}</span>}
            </div>
          );
        })}
        {(shown.loose.length > 0 || shown.legacy > 0 || offTile.length > 0 || unheld.length > 0) && (
          <div className="sy-loose" style={{ top: Math.max(world.h, 300) + 44, width: world.w }}>
            {shown.loose.length > 0 && <>Not wired yet ({shown.loose.length}): {shown.loose.map((l) => l.name).join(" · ")}. </>}
            {shown.legacy > 0 && <>{shown.legacy} legacy left out. </>}
            {offTile.length > 0 && <>Changing now, not drawn: {offTile.slice(0, 8).map((w, i) => (
              <span key={`${w.system} ${w.session}`}>{i > 0 && " · "}<button className="sy-now" data-layer="session" title={workTitle(w)} onClick={() => openSession(w.session)}>{shown.loose.find((l) => l.id === w.system)?.name ?? w.system} ({workWords(w)})</button></span>
            ))}{offTile.length > 8 && ` and ${offTile.length - 8} more`}. </>}
            {unheld.length > 0 && <>No system yet: {unheld.slice(0, 8).map((u, i) => (
              <span key={`${u.folder} ${u.session}`}>{i > 0 && " · "}<button className="sy-now" data-layer="session" title={`${u.files.length} changed: ${u.files.slice(0, 8).join(", ")}. Press to open the session.`} onClick={() => openSession(u.session)}>{u.folder} ({u.person} · {u.title})</button></span>
            ))}{unheld.length > 8 && ` and ${unheld.length - 8} more`}.</>}
          </div>
        )}
      </div>

      <div className="sy-top">
        <div className="sy-crumb">The making › <b>{shown.name || live?.name || area}</b></div>
        <div className={`sy-since${ln.say && !replay ? " lens" : ""}`} data-say={ln.say || undefined}>{replay ? <>Replay · {replay.i} of {replay.n} · {new Date(replay.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {replay.subject}</> : ln.say || since}</div>
        {ln.step && !replay && (
          <span className={`sy-step${asked ? " asked" : ""}`} data-step={`${ln.step[0]} of ${ln.step[1]}`}>
            <button aria-label="the step before" data-act="the walk's step" disabled={!session || asked || ln.step[0] <= 1} onClick={() => stepTo(-1)}>←</button>
            <b>{ln.step[0]} of {ln.step[1]}</b>
            <button aria-label="the next step" data-act="the walk's step" disabled={!session || asked || ln.step[0] >= ln.step[1]} onClick={() => stepTo(1)}>→</button>
          </span>
        )}
        {lens && (sel || mine) && !replay && <button className="sy-yours" title="your own look: press to go back to the walk" onClick={backToLens} data-yours data-act="back to the walk">yours</button>}
        {frames && frames.length > 0 && <span className="sy-replay" data-replay data-act="replay"><Button h={28} flat onClick={play}>{replay ? "Playing…" : "▶ Replay"}</Button></span>}
      </div>

      {replay === null && <TeamStrip link={link} live={now} person={body?.person} onShown={setStripShown} />}

      {trace && (
        <div className="sy-trace">
          {trace.up.map((id) => <span key={id}><button className="up" data-go={id} onClick={() => center(id)}>{nameOf(id)}</button><i>→</i></span>)}
          <button className="me">{nameOf(trace.me)}</button>
          {trace.surfaces.length > 0 && <i>→</i>}
          {trace.surfaces.map((id) => <button key={id} className="down" data-go={id} onClick={() => center(id)}>{nameOf(id)}</button>)}
        </div>
      )}
      {replay === null && lastGrew && grewAny(lastGrew) && <div className="sy-grew">{growWords(lastGrew, nameOf)}</div>}
    </div>
  );
}
