// Pieces that snap (#1024, behind `build.snap`): the bench. A table where built rows lie, and a bin of loose pieces at
// its side. The hand is the whole interface: pick a piece up (it lifts and lags the pointer a little, heavier ones
// more), carry it near an end that fits and the last few pixels pull it in, let go and it seats with a click. Pull a
// piece out of a row and it holds a moment, then lets go with a softer sound; everything after it comes along as one
// lump. Throw a lump at the bin and it is put away. Press a row's first piece and it runs: a charge goes piece to piece
// as the engine says the work moves; a hand of yours lifts out toward you and waits.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as RKey, type PointerEvent as RPointer } from "react";
import { SPRINGS, clock, spring, reducedMotion, type Cfg, type Spring } from "../motion";
import { FEEL, GIVES, H, W, givesOf, insert, jointOf, nearestJoint, pull, pullApart, pullHand, rowWidth, seats, wear, weightOf, withHands, type Brick, type Flow, type Kind, type Section } from "./fit";
import { click, play, rattle } from "./click";
import "./snap.css";

export type Charge = "wait" | "live" | "done" | "ask" | "red" | "skip";
export type RunView = { section: string; states: Record<string, Charge>; ended?: boolean };

type Props = {
  catalog: Brick[];
  table: Section[];
  setTable: (t: Section[]) => void;
  run?: RunView | null;
  onRun?: (sectionId: string) => void;
  onHand?: (sectionId: string, brickId: string, go: boolean) => void;
  /** a word about a piece the hand just did, for the screen reader */
  say?: (s: string) => void;
  /** Home's priority (#1024, home.snap): the pieces are not a heap but lie seated on base plates, one per folder of the
   *  person's life, side by side; a piece taken off leaves its place on the plate */
  plates?: { name: string; ids: string[] }[];
  /** what the empty table says */
  empty?: string;
};

const BIN_H = 132;   // the bin: a strip along the bench's foot, the table's whole width above it free for long rows
const THRESH = 3;
let seq = 0;
const fresh = (b: Brick) => ({ ...b, id: `${b.id.split("#")[0]}#${Date.now().toString(36)}${(++seq).toString(36)}` });
const rootOf = (id: string) => id.split("#")[0];
/** pieces that are one of a kind (a session, a folder) leave the bin while on the table; times, checks and hands never run out */
const unique = (k: Kind) => k === "job" || k === "source";
/** the carry's spring: the kit's travel spring, its mass the lump's weight, so a heavy lump lags more */
// In his Sol a spring is named, mass 1 (motion.ts): the same motion as mass m at damping ratio 0.8 is k/m and
// 2·0.8·√(k·m)/m; unclamped, as an unnamed spring moves on main
const carryCfg = (w: number): Cfg => { const m = Math.max(0.8, w), k = SPRINGS.travel.k; return { name: "travel", k: k / m, c: (2 * 0.8 * Math.sqrt(k * m)) / m, clamp: Infinity }; };
const tilt = (vx: number) => Math.max(-7, Math.min(7, vx * 5));

type Carry = {
  lump: Brick[]; from?: { section: Section; index: number };   // where it came from (put back on a cancelled tear)
  gx: number; gy: number;   // where the hand holds it, from its origin
  ox: number; oy: number;   // where it rests (its home, while tearing)
  phase: "tear" | "carry" | "land";
  track: { t: number; x: number; y: number }[];
};

export function Bench({ catalog, table, setTable, run, onRun, onHand, say, plates, empty }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const carryEl = useRef<HTMLDivElement>(null);
  const [carry, setCarry] = useState<Carry | null>(null);
  const cur = useRef<Carry | null>(null);
  const sp = useRef<{ x: Spring; y: Spring; r: Spring; s: Spring } | null>(null);
  const pos = useRef({ x: 0, y: 0, r: 0, s: 1 });
  const press = useRef<{ x: number; y: number; section?: Section; index?: number; brick?: Brick; alt: boolean; id: number } | null>(null);
  const [hot, setHot] = useState<{ to: string; at: number; fit: boolean; w: number } | null>(null);
  const [pulse, setPulse] = useState<{ id: string; n: number } | null>(null);
  const [tumble, setTumble] = useState(1);
  const tableRef = useRef(table); tableRef.current = table;

  const write = () => { const el = carryEl.current, p = pos.current; if (el) el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.r}deg) scale(${p.s})`; };
  const springs = () => {
    if (!sp.current) sp.current = {
      x: spring(0, SPRINGS.travel, (v) => { pos.current.x = v; write(); }),
      y: spring(0, SPRINGS.travel, (v) => { pos.current.y = v; write(); }),
      r: spring(0, SPRINGS.travel, (v) => { pos.current.r = v; write(); }),
      s: spring(1, SPRINGS.lift, (v) => { pos.current.s = v; write(); }),
    };
    return sp.current;
  };
  const local = (e: { clientX: number; clientY: number }) => { const r = box.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }; };
  const binTop = () => (box.current?.getBoundingClientRect().height ?? 400) - BIN_H;

  // ---- pick up
  const begin = (lump: Brick[], ox: number, oy: number, gx: number, gy: number, phase: Carry["phase"], from?: Carry["from"]) => {
    const c: Carry = { lump, from, gx, gy, ox, oy, phase, track: [] };
    cur.current = c; setCarry(c);
    const s = springs(), w = weightOf(lump);
    s.x.cfg = carryCfg(w); s.y.cfg = carryCfg(w);
    s.x.set(ox); s.y.set(oy); s.r.set(0); s.s.set(1);
    s.s.to(1 + Math.min(0.05, 0.02 + 0.008 * lump.length));   // it lifts; a big lump lifts less far
    play("tick", { pitch: 1.4 - Math.min(0.5, w * 0.08), level: 0.8 });
  };
  const onDownPiece = (e: RPointer, section: Section, index: number) => {
    if (landing.current) { landing.current(); return; }   // the row it would come from is still changing: land first
    if (e.button !== 0 || cur.current) return;
    e.stopPropagation(); try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* a pointer the page did not make */ }
    press.current = { x: e.clientX, y: e.clientY, section, index, alt: e.altKey, id: e.pointerId };
  };
  const onDownBin = (e: RPointer, b: Brick) => {
    landing.current?.();
    if (e.button !== 0 || cur.current) return;
    e.stopPropagation(); try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* a pointer the page did not make */ }
    const p = local(e), r = (e.currentTarget as HTMLElement).getBoundingClientRect(), o = box.current!.getBoundingClientRect();
    const nb = fresh(b), gx = Math.min(W[b.kind] - 10, e.clientX - r.left), gy = Math.min(H - 8, e.clientY - r.top);
    begin([nb], r.left - o.left, r.top - o.top, gx, gy, "carry");
    move(p.x, p.y);
  };

  // ---- carry
  const move = (x: number, y: number) => {
    const c = cur.current, s = sp.current; if (!c || !s || c.phase === "land") return;
    const now = clock(); c.track.push({ t: now, x, y }); while (c.track.length > 2 && now - c.track[0].t > 100) c.track.shift();
    let tx = x - c.gx, ty = y - c.gy;
    if (c.phase === "tear") {
      const d = Math.hypot(tx - c.ox, ty - c.oy);
      if (d < FEEL.tear) { const k = 0.22; s.x.to(c.ox + (tx - c.ox) * k); s.y.to(c.oy + (ty - c.oy) * k); return; }
      c.phase = "carry"; play("part", { pitch: 1 - Math.min(0.3, weightOf(c.lump) * 0.04) });
      say?.(`pulled apart: ${c.lump.length} piece${c.lump.length > 1 ? "s" : ""} in your hand`);
    }
    const n = nearestJoint(tableRef.current, c.lump, tx, ty);
    if (n.to) {
      const e = jointOf(n.to, n.at);
      if (n.fit) { const f = pull(n.d); tx += (e.x - tx) * f; ty += (e.y - ty) * f; }
      else { const d = Math.max(1, n.d), k = (1 - n.d / FEEL.reach) * 10; tx += ((tx - e.x) / d) * k; ty += ((ty - e.y) / d) * k; }   // a wrong end leans away
    }
    const lw = rowWidth(c.lump);
    setHot((h) => (n.to ? (h?.to === n.to!.id && h.fit === n.fit && h.at === n.at ? h : { to: n.to.id, at: n.at, fit: n.fit, w: lw }) : h ? null : h));
    const vx = velocity(c).vx;
    s.x.to(tx); s.y.to(ty); s.r.to(reducedMotion() ? 0 : tilt(vx));
  };
  const velocity = (c: Carry) => { const a = c.track[0], b = c.track[c.track.length - 1]; if (!a || !b || b.t === a.t) return { vx: 0, vy: 0 }; return { vx: (b.x - a.x) / (b.t - a.t), vy: (b.y - a.y) / (b.t - a.t) }; };

  // ---- let go
  const end = (x: number, y: number) => {
    const c = cur.current, s = sp.current; if (!c || !s || c.phase === "land") return;
    setHot(null);
    const w = weightOf(c.lump);
    if (c.phase === "tear" && c.from) {   // let go before it tore: it goes back in its place
      c.phase = "land";
      s.x.to(c.ox, { cfg: SPRINGS.settle }); s.y.to(c.oy, { cfg: SPRINGS.settle }); s.r.to(0); s.s.to(1);
      settle(() => { put([...tableRef.current.filter((t) => t.id !== c.from!.section.id), c.from!.section]); });
      return;
    }
    const v = velocity(c), tx = x - c.gx, ty = y - c.gy;
    c.phase = "land"; s.r.to(0); s.s.to(1);
    // thrown at the bin, or let go over it: put away, every piece of it, in one throw
    if (y > binTop() + 8 || (v.vy > 1.1 && y > binTop() - 150)) {
      const r = box.current!.getBoundingClientRect();
      s.x.to(Math.max(0, Math.min(r.width - 120, tx + v.vx * 120)), { cfg: SPRINGS.glide }); s.y.to(r.height - BIN_H / 2 - 20, { cfg: SPRINGS.glide, vel: v.vy * 400 }); s.s.to(0.7);
      rattle(Math.min(10, 3 + c.lump.length * 2));
      say?.(`put away: ${c.lump.map((b) => b.label).join(", ")}`);
      settle(() => { setTumble((t) => t + 1); }, 160);
      return;
    }
    const n = nearestJoint(tableRef.current, c.lump, tx, ty);
    if (n.to && n.fit) {
      const e = jointOf(n.to, n.at), into = n.to, at = n.at;
      // a hand the person puts in is theirs: the agent will always ask there
      const lump = c.lump.map((b) => (b.kind === "hand" ? { ...b, hand: "mine" as const, why: b.why ?? "you put your hand here" } : b));
      s.x.to(e.x, { cfg: SPRINGS.settle }); s.y.to(e.y + FEEL.seat, { cfg: SPRINGS.settle });
      settle(() => {
        click(w);
        const merged = insert(into, at, lump);
        put(tableRef.current.map((t) => (t.id === into.id ? merged : t)));
        setPulse({ id: into.id, n: into.bricks.length });
        say?.(`seated: ${lump[0].label} after ${into.bricks[at - 1].label}`);
      }, 0, 1.2);
      return;
    }
    let lx = tx, ly = ty;
    if (n.to && !n.fit) {   // an end that does not fit pushes it off: it slides away, no red, no message
      const e = jointOf(n.to, n.at), d = Math.max(1, n.d), ux = (tx - e.x) / d || 0.6, uy = (ty - e.y) / d || 0.8;
      lx = e.x + ux * (FEEL.reach + FEEL.push); ly = e.y + uy * (FEEL.reach + FEEL.push) + (Math.abs(uy) < 0.3 ? H * 0.6 : 0);
      play("push");
      say?.(`does not fit there`);
    }
    const r = box.current!.getBoundingClientRect();
    lx = Math.max(4, Math.min(r.width - rowWidth(c.lump) - 16, lx)); ly = Math.max(22, Math.min(binTop() - H - 14, ly));
    s.x.to(lx, { cfg: SPRINGS.settle, vel: v.vx * 120 }); s.y.to(ly, { cfg: SPRINGS.settle, vel: v.vy * 120 });
    const keep = c.from && c.from.index === 0 ? c.from.section : null;   // a whole section carried keeps its name, runs and age
    settle(() => {
      if (!(n.to && !n.fit)) play("tick", { pitch: 0.8, level: 0.7 });
      put([...tableRef.current, keep ? { ...keep, x: lx, y: ly, bricks: c.lump } : { id: `s-${Date.now().toString(36)}${(++seq).toString(36)}`, x: lx, y: ly, bricks: c.lump, madeAt: Date.now(), by: "me" }]);
    });
  };
  /** when the carried lump has come to rest (or near enough to land), do `then` and let go of it. A new pick-up while it
   *  lands finishes the landing at once: the hand is never kept waiting on a spring */
  const landing = useRef<(() => void) | null>(null);
  const settle = (then: () => void, minMs = 0, near = 0.8) => {
    const t0 = clock();
    let done = false;
    const finish = () => { if (done) return; done = true; landing.current = null; try { then(); } finally { cur.current = null; setCarry(null); } };
    landing.current = finish;
    const tick = () => {
      if (done) return;
      const s = sp.current; if (!s) return finish();
      const close = Math.abs(s.x.v - s.x.target) < near && Math.abs(s.y.v - s.y.target) < near;
      if ((close && clock() - t0 >= minMs) || clock() - t0 > 900) return finish();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const put = (t: Section[]) => setTable(t.filter((s) => s.bricks.length));

  // the pointer, on the window while a press or a carry is on
  useEffect(() => {
    const mv = (e: PointerEvent) => {
      const p = press.current;
      if (p && !cur.current && Math.hypot(e.clientX - p.x, e.clientY - p.y) > THRESH && p.section) {
        const sec = p.section, i = p.index ?? 0, pt = local(e), start = local({ clientX: p.x, clientY: p.y });
        const offset = rowWidth(sec.bricks.slice(0, i)), ox = sec.x + offset, oy = sec.y;
        if (p.alt) {   // a key held: the piece and what follows it are copied; the row stays whole
          begin(sec.bricks.slice(i).map(fresh), ox, oy, start.x - ox, start.y - oy, "carry");
        } else if (sec.bricks[i].kind === "hand" && i > 0) {   // a hand comes out alone; the row closes up behind it
          const { stays, hand } = pullHand(sec, i);
          put(tableRef.current.map((t) => (t.id === sec.id ? stays : t)));
          begin([hand], ox, oy, start.x - ox, start.y - oy, "tear", { section: sec, index: i });
          if (sec.bricks[i].hand === "proposed") say?.("you took the agent's hand out: it decides alone there");
        } else {
          const { stays, lump } = pullApart(sec, i);
          put(stays ? tableRef.current.map((t) => (t.id === sec.id ? stays : t)) : tableRef.current.filter((t) => t.id !== sec.id));
          begin(lump, ox, oy, start.x - ox, start.y - oy, i > 0 ? "tear" : "carry", { section: sec, index: i });
        }
        press.current = null;
        move(pt.x, pt.y);
        return;
      }
      if (cur.current) { const pt = local(e); move(pt.x, pt.y); }
    };
    const up = (e: PointerEvent) => {
      const p = press.current; press.current = null;
      if (p && !cur.current) {   // a press without a carry: a row's first piece runs it
        // a row's first piece pressed runs it, unless a second press follows (a double press writes its name)
        if (p.section && p.index === 0 && p.section.bricks.length > 1) { const id = p.section.id; clearTimeout(runSoon.current); runSoon.current = setTimeout(() => onRun?.(id), 280); }
        return;
      }
      if (cur.current) { const pt = local(e); end(pt.x, pt.y); }
    };
    const cancel = () => { press.current = null; if (cur.current) { const c = cur.current; end(c.ox + c.gx, c.oy + c.gy); } };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel);
    return () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); };
  });

  // the charge heard: a piece that starts working ticks; a piece that waited on you and was answered drops back with
  // the click; a piece that went red taps dully. Heard from the engine's word, as the charge is drawn
  const was = useRef<Record<string, Charge>>({});
  // the charge travels: when the working piece moves on, a spark runs along the row from where it was to where it is,
  // on the travel spring, through the joints between
  const spark = useRef<HTMLElement | null>(null);
  const sparkAt = useRef<{ sec: string; x: number } | null>(null);
  const sparkSp = useRef<Spring | null>(null);
  useLayoutEffect(() => {
    if (!run) { sparkAt.current = null; return; }
    const sec = tableRef.current.find((t) => t.id === run.section); if (!sec) return;
    const i = sec.bricks.findIndex((b) => run.states[b.id] === "live" || run.states[b.id] === "ask");
    const last = sec.bricks.reduce((k, b, j) => (run.states[b.id] === "done" || run.states[b.id] === "red" ? j : k), -1);
    const at = i >= 0 ? i : last; if (at < 0) return;
    const x = rowWidth(sec.bricks.slice(0, at)) + W[sec.bricks[at].kind] / 2;
    const same = sparkAt.current?.sec === sec.id;
    sparkAt.current = { sec: sec.id, x };
    const el = spark.current; if (!el) return;
    // one spring for the spark, retargeted as the work moves (a new word from the engine bends it, never restarts it)
    if (!sparkSp.current || !same) sparkSp.current = spring(0, SPRINGS.travel, (v) => { const e = spark.current; if (e) { e.style.translate = `${v}px 0`; e.style.opacity = "1"; } }, () => { const e = spark.current; if (e) e.style.opacity = ""; });
    sparkSp.current.to(x);
  }, [run]);
  useEffect(() => {
    const now = run?.states ?? {}, before = was.current;
    for (const [id, c] of Object.entries(now)) {
      const b = before[id]; if (b === c) continue;
      if (c === "live" && b !== "ask") play("tick", { pitch: 1.1, level: 0.8 });
      if (b === "ask" && (c === "done" || c === "live")) { click(0.6); setPulse({ id: run!.section, n: Date.now() }); }
      if (c === "red") play("push");
    }
    was.current = { ...now };
  }, [run]);

  // the seat: a row that took a lump goes down 2 px and comes back on the settle spring
  useLayoutEffect(() => {
    if (!pulse) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-sec="${pulse.id}"]`); if (!el) return;
    const s = spring(FEEL.seat, SPRINGS.settle, (v) => { el.style.translate = `0 ${v}px`; }, () => { el.style.translate = ""; });
    s.to(0);
    return () => s.stop();
  }, [pulse]);

  // ---- the agent's hands: where a row has a place your word is worth most (a merge, money, a taste call, words in your
  // name), the agent puts its hand in by itself, a moment after the row settles, and it drops in with the click. Pull it
  // out and the agent decides alone there (the place is kept free); it never comes back to a free place.
  const [arrive, setArrive] = useState<string | null>(null);
  useEffect(() => {
    if (carry) return;
    const t = setTimeout(() => {
      let first: string | null = null;
      const next = tableRef.current.map((s) => {
        if (s.bricks.length < 2) return s;
        const w = withHands(s.bricks, s.free ?? [], (i) => `hand:agent#${s.bricks[i].id}`.slice(0, 110));
        if (w.length === s.bricks.length) return s;
        first ??= w.find((b) => !s.bricks.includes(b))?.id ?? null;
        return { ...s, bricks: w };
      });
      if (first) { put(next); setArrive(first); say?.("the agent put its hand in where your word is worth most"); }
    }, 1100);
    return () => clearTimeout(t);
  }, [table, carry]);
  useLayoutEffect(() => {
    if (!arrive) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-brick="${CSS.escape(arrive)}"]`); if (!el) return;
    el.classList.add("arriving");
    const s = spring(-58, SPRINGS.travel, (v) => { el.style.translate = `0 ${v}px`; }, () => { el.style.translate = ""; el.classList.remove("arriving"); click(0.6); setArrive(null); });
    s.to(0);
    return () => s.stop();
  }, [arrive]);

  // ---- the bin: what is not on the table, tumbled; a quick drag across it tumbles it again
  const used = useMemo(() => new Set([...table.flatMap((s) => s.bricks), ...(carry?.lump ?? [])].map((b) => rootOf(b.id))), [table, carry]);
  const loose = catalog.filter((b) => !(unique(b.kind) && used.has(rootOf(b.id))));
  // each piece keeps its place in the heap while it lies there (the roster's order changes; the heap must not), a new
  // piece takes the first free place; a shake lays them all again
  const slotsRef = useRef<{ n: number; m: Map<string, number> }>({ n: -1, m: new Map() });
  const slots = useMemo(() => {
    const k = slotsRef.current;
    if (k.n !== tumble) { k.n = tumble; k.m = new Map(); }
    for (const id of [...k.m.keys()]) if (!catalog.some((b) => b.id === id)) k.m.delete(id);
    const taken = new Set(k.m.values());
    for (const b of catalog) if (!k.m.has(b.id)) { let i = 0; while (taken.has(i)) i++; k.m.set(b.id, i); taken.add(i); }
    return k.m;
  }, [catalog, tumble]);
  const shake = useRef<{ x: number; t: number; dist: number } | null>(null);
  const onBinDown = (e: RPointer) => { shake.current = { x: e.clientX, t: performance.now(), dist: 0 }; };
  const onBinMove = (e: RPointer) => {
    const s = shake.current; if (!s || cur.current) return;
    s.dist += Math.abs(e.clientX - s.x); s.x = e.clientX;
    const dt = performance.now() - s.t;
    if (s.dist > 120 && s.dist / Math.max(1, dt) > FEEL.shake) { shake.current = null; setTumble((t) => t + 1); rattle(10); say?.("the bin tumbled"); }
  };

  // ---- keys: everything the hand does. Space picks a piece up (from the bin, or out of a row with what follows it; a
  // hand alone); the arrows move it from one end that fits to the next, the row making room; Enter seats it with the
  // click; Escape puts it back where it was; Delete puts it in the bin. Enter on a row's first piece runs the row.
  const kb = useRef<{ targets: { to: Section; at: number }[]; k: number } | null>(null);
  const targetsFor = (lump: Brick[]) => {
    const out: { to: Section; at: number }[] = [];
    for (const t of tableRef.current) for (let i = 1; i <= t.bricks.length; i++) { const j = jointOf(t, i);
      const n = nearestJoint([t], lump, j.x, j.y); if (n.fit && n.at === i) out.push({ to: t, at: i }); }
    return out.sort((a, b) => a.to.y - b.to.y || a.to.x - b.to.x || a.at - b.at);
  };
  const aimAt = (k: number) => {
    const c = cur.current, s = sp.current, K = kb.current; if (!c || !s || !K) return;
    K.k = (k + K.targets.length + 1) % (K.targets.length + 1);   // the last stop is a free place on the table
    const t = K.targets[K.k];
    const at = t ? jointOf(t.to, t.at) : { x: 24, y: Math.max(22, binTop() - H - 30) };
    s.x.to(at.x); s.y.to(at.y);
    setHot(t ? { to: t.to.id, at: t.at, fit: true, w: rowWidth(c.lump) } : null);
    if (t) { play("tick", { pitch: 1.2, level: 0.7 }); say?.(`over the end after ${t.to.bricks[t.at - 1].label}: Enter seats it`); }
    else say?.("over a free place on the table: Enter puts it down");
  };
  const kbPick = (lump: Brick[], ox: number, oy: number, from?: Carry["from"]) => {
    begin(lump, ox, oy, 0, 0, "carry", from);
    kb.current = { targets: targetsFor(lump), k: -1 };
    say?.(`picked up ${lump.map((b) => b.label).join(", ")}. ${kb.current.targets.length} end${kb.current.targets.length === 1 ? "" : "s"} it fits. Arrows move it, Enter seats it, Escape puts it back`);
    aimAt(0);
  };
  const kbKey = (e: RKey | KeyboardEvent) => {
    const K = kb.current, c = cur.current; if (!K || !c) return false;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { aimAt(K.k + 1); return true; }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { aimAt(K.k - 1); return true; }
    if (e.key === "Enter" || e.key === " ") {
      const t = K.targets[K.k]; kb.current = null; setHot(null);
      const lump = c.lump.map((b) => (b.kind === "hand" ? { ...b, hand: "mine" as const, why: b.why ?? "you put your hand here" } : b));
      c.phase = "land";
      if (t) { const j = jointOf(t.to, t.at); sp.current!.y.to(j.y + FEEL.seat, { cfg: SPRINGS.settle });
        settle(() => { click(weightOf(lump)); put(tableRef.current.map((x) => (x.id === t.to.id ? insert(x, t.at, lump) : x))); setPulse({ id: t.to.id, n: t.at }); say?.(`seated after ${t.to.bricks[t.at - 1].label}`); }); }
      else { const at = { x: sp.current!.x.target, y: sp.current!.y.target };
        settle(() => { play("tick", { pitch: 0.8 }); put([...tableRef.current, c.from?.index === 0 ? { ...c.from.section, ...at, bricks: lump } : { id: `s-${Date.now().toString(36)}${(++seq).toString(36)}`, ...at, bricks: lump, madeAt: Date.now(), by: "me" }]); say?.("put down on the table"); }); }
      return true;
    }
    if (e.key === "Escape") {
      kb.current = null; setHot(null); c.phase = "land";
      if (c.from) { const f = c.from; sp.current!.x.to(c.ox, { cfg: SPRINGS.settle }); sp.current!.y.to(c.oy, { cfg: SPRINGS.settle }); settle(() => { put([...tableRef.current.filter((t) => t.id !== f.section.id), f.section]); click(0.5); say?.("put back"); }); }
      else { settle(() => { say?.("back in the bin"); }); }
      return true;
    }
    if (e.key === "Delete" || e.key === "Backspace") { kb.current = null; setHot(null); c.phase = "land"; rattle(4); settle(() => { setTumble((t) => t + 1); say?.("put in the bin"); }); return true; }
    return false;
  };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (kb.current && kbKey(e)) { e.preventDefault(); e.stopPropagation(); } }; window.addEventListener("keydown", k, true); return () => window.removeEventListener("keydown", k, true); });
  const onKeyPiece = (e: RKey, section: Section, index: number) => {
    if (kb.current) return;
    if (e.key === "Enter" && index === 0 && section.bricks.length > 1) { e.preventDefault(); onRun?.(section.id); return; }
    if (e.key === " " || (e.key === "Enter" && section.bricks.length === 1)) {
      e.preventDefault(); landing.current?.();
      const ox = section.x + rowWidth(section.bricks.slice(0, index)), oy = section.y;
      if (section.bricks[index].kind === "hand" && index > 0) { const { stays, hand } = pullHand(section, index); put(tableRef.current.map((t) => (t.id === section.id ? stays : t))); play("part"); kbPick([hand], ox, oy, { section, index }); return; }
      const { stays, lump } = pullApart(section, index);
      put(stays ? tableRef.current.map((t) => (t.id === section.id ? stays : t)) : tableRef.current.filter((t) => t.id !== section.id));
      if (index > 0) play("part");
      kbPick(lump, ox, oy, { section, index });
    }
    if ((e.key === "Delete" || e.key === "Backspace") && index === 0) {   // a whole row to the bin, one key
      e.preventDefault(); put(tableRef.current.filter((t) => t.id !== section.id)); rattle(Math.min(10, 3 + section.bricks.length * 2)); setTumble((t) => t + 1); say?.("the row is back in the bin");
    }
  };
  const onKeyBin = (e: RKey, b: Brick) => {
    if (kb.current || (e.key !== " " && e.key !== "Enter")) return;
    e.preventDefault(); landing.current?.();
    const el = e.currentTarget as HTMLElement, r = el.getBoundingClientRect(), o = box.current!.getBoundingClientRect();
    kbPick([fresh(b)], r.left - o.left, r.top - o.top);
  };

  // ---- writing on a row: a double click on its first piece and you write its name on it
  const [naming, setNaming] = useState<string | null>(null);
  const runSoon = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const nameIt = (id: string, name: string) => { put(tableRef.current.map((t) => (t.id === id ? { ...t, name: name.trim() || undefined } : t))); setNaming(null); if (name.trim()) { play("tick", { pitch: 0.9 }); say?.(`the row is called ${name.trim()}`); } };
  // ---- two rows that would work together lean toward each other: one row's end takes another's head, and they lie
  // near; the second leans a few pixels toward the first's end, an invitation, never a move
  const lean = useMemo(() => {
    const out = new Map<string, { dx: number; dy: number }>();
    for (const a of table) for (const b of table) {
      if (a === b || out.has(b.id) || a.bricks.length < 2 || b.bricks[0]?.kind === "when") continue;
      const e = { x: a.x + rowWidth(a.bricks), y: a.y }, d = Math.hypot(b.x - e.x, b.y - e.y);
      if (d < 40 || d > 220 || !seats(a.bricks, b.bricks)) continue;
      const k = 6 / d; out.set(b.id, { dx: (e.x - b.x) * k, dy: (e.y - b.y) * k });
    }
    return out;
  }, [table]);
  const r = run && run.section;
  const binW = box.current?.getBoundingClientRect().width ?? 860;
  return (
    <div className={`snap-bench ${carry ? "carrying" : ""}`} ref={box} data-snap>
      <div className="snap-table" aria-label="the table: your built rows">
        {table.length === 0 && !carry && <p className="snap-empty">{empty ?? "Take a piece from the bin and put it here. Pieces whose ends fit pull together."}</p>}
        {table.map((s) => (
          <div key={s.id} data-sec={s.id} className={`snap-sec ${s.runs ? "" : "fresh"} ${hot?.to === s.id ? (hot.fit ? "near" : "wrong") : ""} ${r === s.id ? "running" : ""}`}
            style={{ left: s.x, top: s.y, ["--wear" as any]: wear(s.runs), ...(lean.get(s.id) && !carry ? { transform: `translate(${lean.get(s.id)!.dx}px, ${lean.get(s.id)!.dy}px) rotate(${lean.get(s.id)!.dx > 0 ? -1.2 : 1.2}deg)` } : {}) }}
            onDoubleClick={(e) => { clearTimeout(runSoon.current); if ((e.target as HTMLElement).closest("[data-brick]") === e.currentTarget.querySelector("[data-brick]")) setNaming(s.id); }}>
            {naming === s.id ? <input className="snap-title edit" autoFocus defaultValue={s.name ?? ""} placeholder="write its name" aria-label="the row's name"
              onKeyDown={(e) => { if (e.key === "Enter") nameIt(s.id, e.currentTarget.value); if (e.key === "Escape") setNaming(null); e.stopPropagation(); }} onBlur={(e) => nameIt(s.id, e.currentTarget.value)} onPointerDown={(e) => e.stopPropagation()} />
              : s.name ? <span className="snap-title">{s.name}</span> : null}
            {s.bricks.map((b, i) => (
              <Piece key={b.id} b={b} row={s.bricks} i={i} charge={r === s.id ? run!.states[b.id] : undefined} room={hot?.to === s.id && hot.fit && i >= hot.at ? hot.w : 0} worn={wear(s.runs)}
                onPointerDown={(e) => onDownPiece(e, s, i)} onKeyDown={(e) => onKeyPiece(e, s, i)}
                onHand={onHand && ((go) => onHand(s.id, b.id, go))} />
            ))}
            {hot?.to === s.id && hot.fit && <i className="snap-socket" style={{ left: rowWidth(s.bricks.slice(0, hot.at)) }} aria-hidden />}
            {r === s.id && <i className="snap-spark" ref={(e) => { spark.current = e; }} aria-hidden />}
            <span className={`snap-ran ${(s.runs ?? 0) ? "" : "fresh"}`} style={{ left: rowWidth(s.bricks) + 22 + (hot?.to === s.id && hot.fit ? hot.w : 0) }}>{ageLine(s, Date.now())}</span>
          </div>
        ))}
      </div>
      <div className="snap-bin" style={{ height: BIN_H }} onPointerDown={onBinDown} onPointerMove={onBinMove} onPointerUp={() => (shake.current = null)} aria-label="the bin: pieces not in use">
        {plates ? <div className="snap-plates">
          <div className="snap-plate loose"><span className="snap-plate-name">to build with</span><div className="snap-plate-top">{loose.filter((b) => !plates.some((pl) => pl.ids.includes(b.id))).map((b) => <span key={b.id} className="snap-stud"><BinPiece b={b} i={0} n={0} count={1} w={0} seated onPointerDown={(e) => onDownBin(e, b)} onKeyDown={(e) => onKeyBin(e, b)} /></span>)}</div></div>
          {plates.map((pl) => (
          <div key={pl.name} className="snap-plate" aria-label={`the plate ${pl.name}`}><span className="snap-plate-name">{pl.name}</span>
            <div className="snap-plate-top">{pl.ids.map((id) => { const b = catalog.find((x) => x.id === id); const on = b && loose.includes(b);
              return <span key={id} className="snap-stud">{b && on && <BinPiece b={b} i={0} n={0} count={1} w={0} seated onPointerDown={(e) => onDownBin(e, b)} onKeyDown={(e) => onKeyBin(e, b)} />}</span>; })}</div>
          </div>))}
        </div> : <div className="snap-bin-floor">
          {loose.map((b) => <BinPiece key={b.id} b={b} i={slots.get(b.id) ?? 0} n={tumble} count={Math.max(catalog.length, slots.size)} w={binW} onPointerDown={(e) => onDownBin(e, b)} onKeyDown={(e) => onKeyBin(e, b)} />)}
        </div>}
      </div>
      {carry && (
        <div ref={carryEl} className="snap-carry" style={{ transform: `translate(${pos.current.x}px, ${pos.current.y}px)` }} aria-hidden>
          {carry.lump.map((b, i) => <Piece key={b.id} b={b} row={carry.lump} i={i} />)}
        </div>
      )}
    </div>
  );
}

// ---- a piece: its body with its ends cut to its type, its mark, its word
const SOCKET: Record<Kind, Flow | "none" | "slot"> = { when: "none", source: "go", job: "slot", check: "work", hand: "slot" };
/** what a piece's two ends look like where it lies: seated, its socket is the plug before it; a hand's plug is what it was given */
export function endsOf(row: Brick[], i: number): { left: Flow | "none" | "slot"; right: Flow | "slot" } {
  const b = row[i], up = i > 0 ? givesOf(row.slice(0, i)) : null;
  const left = up && up !== "any" ? up : SOCKET[b.kind];
  const right = b.kind === "hand" ? (up && up !== "any" ? up : "slot") : GIVES[b.kind];
  return { left: b.kind === "when" ? "none" : left, right };
}
const M = H / 2;
function plug(f: Flow | "slot", x: number, dir: 1 | -1): string {
  // drawn from the top of the end to its bottom when dir is 1 (the right side, outward); bottom to top when -1 (the left, inward)
  const a = dir === 1 ? M - 11 : M + 11, b = dir === 1 ? M + 11 : M - 11, sw = dir === 1 ? 1 : 0;
  if (f === "go") return `L${x} ${a} A11 11 0 0 ${sw} ${x} ${b}`;
  if (f === "stuff") return `L${x} ${a} L${x + 10 * dir} ${a} L${x + 10 * dir} ${b} L${x} ${b}`;
  if (f === "work") return `L${x} ${a} L${x + 12 * dir} ${M} L${x} ${b}`;
  if (f === "proof") { const m = M; return `L${x} ${a} A5.5 5.5 0 0 ${sw} ${x} ${m} A5.5 5.5 0 0 ${sw} ${x} ${b}`; }
  const a2 = dir === 1 ? M - 13 : M + 13, b2 = dir === 1 ? M + 13 : M - 13;
  return `L${x} ${a2} Q${x + 8 * dir} ${a2} ${x + 8 * dir} ${M} Q${x + 8 * dir} ${b2} ${x} ${b2}`;
}
export function outline(w: number, left: Flow | "none" | "slot", right: Flow | "slot", r = 9): string {
  return [`M${r} 0`, `L${w - r} 0`, `Q${w} 0 ${w} ${r}`, plug(right, w, 1), `L${w} ${H - r}`, `Q${w} ${H} ${w - r} ${H}`, `L${r} ${H}`, `Q0 ${H} 0 ${H - r}`,
    left === "none" ? "" : plug(left, 0, -1), `L0 ${r}`, `Q0 0 ${r} 0`, "Z"].filter(Boolean).join(" ");
}
const MARK: Record<Kind, string> = {
  when: "M8 1.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M8 4.5V8l2.5 1.6",
  source: "M2 4.5h4l1.4 1.6H14v6.4H2z",
  job: "M8 2.2l1.7 3.5 3.8.5-2.8 2.6.7 3.8L8 10.8l-3.4 1.8.7-3.8-2.8-2.6 3.8-.5z",
  check: "M2.5 8.5l3.4 3.2L13.5 4",
  hand: "M5 14V6.5a1 1 0 0 1 2 0V3a1 1 0 0 1 2 0v3.5V2.6a1 1 0 0 1 2 0v4.6a1 1 0 0 1 2 0V10a4 4 0 0 1-4 4z",
};
function Piece({ b, row, i, charge, room = 0, worn = 0, onPointerDown, onKeyDown, onHand }: { b: Brick; row: Brick[]; i: number; charge?: Charge; room?: number; worn?: number; onPointerDown?: (e: RPointer) => void; onKeyDown?: (e: RKey) => void; onHand?: (go: boolean) => void }) {
  const w = W[b.kind], { left, right } = endsOf(row, i), x = rowWidth(row.slice(0, i));
  const first = i === 0 && row.length > 1;
  return (
    <div className={`snap-piece k-${b.kind} ${b.hand ? `h-${b.hand}` : ""} ${charge ? `c-${charge}` : ""} ${room ? "room" : ""}`} style={{ left: x, width: w, ...(room ? { translate: `${room}px 0` } : {}) }}
      data-brick={b.id} tabIndex={onPointerDown ? 0 : -1} role="button"
      aria-label={`${b.kind === "hand" ? "your hand" : b.label}${first ? ", first piece: press to run the row" : ""}${b.why ? `: ${b.why}` : ""}`}
      onPointerDown={onPointerDown} onKeyDown={onKeyDown}>
      <svg className="snap-body" width={w + 14} height={H} viewBox={`0 0 ${w + 14} ${H}`} aria-hidden>
        <path d={outline(w, left, right, 9 + worn * 6)} />
      </svg>
      <span className="snap-in">
        <svg className="snap-mark" width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d={MARK[b.kind]} /></svg>
        <span className="snap-label">{b.kind === "hand" ? "you" : b.label}</span>
      </span>
      {first && <span className="snap-go" aria-hidden />}
      {b.kind === "hand" && b.why && charge !== "ask" && <span className="snap-why" aria-hidden>{b.why}</span>}
      <span className="snap-word" aria-hidden>{b.why ?? b.hint ?? b.label}</span>
      {charge === "ask" && onHand && (
        <span className="snap-ask" onPointerDown={(e) => e.stopPropagation()}>
          <button onClick={() => onHand(true)}>go on</button><button onClick={() => onHand(false)}>stop here</button>
        </span>
      )}
    </div>
  );
}
function BinPiece({ b, i, n, count, w: binW, seated, onPointerDown, onKeyDown }: { b: Brick; i: number; n: number; count: number; w: number; seated?: boolean; onPointerDown: (e: RPointer) => void; onKeyDown: (e: RKey) => void }) {
  // tumbled: a heap in two loose columns, each at its own angle and a little off its place, laid again each shake
  // (seeded by the shake's count), its order shuffled too
  const h = hash(`${b.id}:${n}`), rot = ((h % 25) - 12), dx = ((h >> 5) % 17) - 8, dy = ((h >> 9) % 11) - 5;
  // a heap along the foot: two loose rows, the second offset half a step, so each piece shows its mark
  const slot = order(count, n)[i] ?? i, cols = Math.ceil(count / 2), step = Math.min(118, (binW - 120) / Math.max(1, cols - 0.5));
  const left = 10 + Math.floor(slot / 2) * step + (slot % 2) * step * 0.5 + dx, top = 12 + (slot % 2) * 52 + dy;
  const w = W[b.kind], { left: le, right } = endsOf([b], 0);
  return (
    <div className={`snap-piece in-bin ${seated ? "on-plate" : ""} k-${b.kind}`} style={seated ? { width: w } : { width: w, left, top, rotate: `${rot}deg`, zIndex: (h >> 3) % 7 + slot }}
      data-bin={b.id} tabIndex={0} role="button" aria-label={`${b.label}, in the bin${b.hint ? `: ${b.hint}` : ""}. Space picks it up`} onPointerDown={onPointerDown} onKeyDown={onKeyDown}>
      <svg className="snap-body" width={w + 14} height={H} viewBox={`0 0 ${w + 14} ${H}`} aria-hidden><path d={outline(w, le, right)} /></svg>
      <span className="snap-in">
        <svg className="snap-mark" width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d={MARK[b.kind]} /></svg>
        <span className="snap-label">{b.kind === "hand" ? "you" : b.label}</span>
      </span>
      <span className="snap-word" aria-hidden>{b.hint ?? b.label}</span>
    </div>
  );
}
/** the heap's order after the n-th shake: a shuffle seeded by n */
const order = (count: number, n: number) => { const o = [...Array(count).keys()]; let s = n * 9301 + 49297; for (let i = count - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor((s / 233280) * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
/** a row's age in a few words: never run is new; else how often, how long ago, how often it asked you */
export function ageLine(s: Section, now: number): string {
  if (s.bricks.length < 2) return "";
  if (!s.runs) return s.madeAt && now - s.madeAt > 86_400_000 ? `built ${since(now - s.madeAt)} · never run` : "new · press its first piece to run it";
  return [`ran ${s.runs}×`, s.ranAt ? `last ${since(now - s.ranAt)}` : "", s.asked ? `asked you ${s.asked}×` : ""].filter(Boolean).join(" · ");
}
const since = (ms: number) => { const m = Math.round(ms / 60_000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
export const _forTests = { seats };
