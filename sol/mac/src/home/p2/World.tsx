// World (#692, pieces/streams.mjs), slice G of the pass 2 build: the context streams around the kit's jelly. The jelly in
// the middle is Body.tsx, the one body: Home's window shows no other body (the talk's Orb and Sol mark are not drawn
// while pass 2 holds the talk), so World mounts the one Body while it is open. The streams
// between each node and the jelly are kit/Liquid's goo: a tube of eight blobs in its field and shade, laid along the
// stream, thicker for a heavier weight; it pulses while something moves on it (a run in that folder, an answer that used
// it). Off is a dashed grey line. Nodes are the kit's Pills: his top folders, calendar, mail, Build, the phone.
// Hover a node or stream: what it is, its weight, the jobs that read it this week. Drag along a stream toward the jelly
// to weight it more, away to weight it less (off · light · normal · heavy, said in words under the jelly); double-click
// turns it off or on. The right column: what it knows about him, the voice, the hours, each line edited in place, keep ·
// forget (a learned line not yet kept is yellow, with where it came from); under it ask world.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPE } from "react";
import type { Metas } from "../meta";
import { usePick, type Home2Api, type Stream, type WorldLine, type WorldNode, type HomeState2 } from "./pass2";
import { Body, type BodyState, type HaloLook } from "../../Body";
import { Liquid, type Pour } from "../../kit/Liquid";
import { Pill } from "../../kit/Pill";
import { useSize, ink, dim, mute, on, black } from "../../kit/paint";
import { JELLY, LOOKS, SHADE } from "../../kit/tokens";
import "./world.css";

export const meta = {
  World: {
    job: "the context streams through the jelly: see where context flows, weight or turn off a stream, change or forget a line, ask in words",
    flow: "mine",
    states: ["the streams", "a stream hovered", "a stream dragged (listening)", "a stream off", "a line edited", "a learned line, yellow", "asking (the streams it used pulse)", "narrow: the weights as a list"],
    keys: [
      { press: "hover a node or a stream", does: "says what it is, its weight, the jobs that read it this week" },
      { press: "drag along a stream", does: "toward the jelly weights it more, away less; said under the jelly; let go to keep (home.world.weight)" },
      { press: "double-click a stream", does: "turns it off or on (home.world.weight)" },
      { press: "click a line", does: "edits it in place; Enter keeps the change, Esc leaves it (home.world.line)" },
      { press: "keep · forget on a line", does: "keeps it, or forgets it for good (home.world.line)" },
      { press: "type in ask world, Enter", does: "an answer from the record naming its sources (home.world.ask)" },
    ],
    listens: ["home.state › world", "home.world.say"],
  },
} satisfies Metas;

const WORDS = ["off", "light", "normal", "heavy"] as const;
const SAY_STEP = 36;   // px of drag along a stream for one step of weight
const halo = (t: keyof typeof LOOKS.halo.takes): HaloLook => { const k = LOOKS.halo.takes[t]; return { lo: k.lo, fall: k.fall, gain: k.gain, carry: k.carry, light: k.light, pool: k.pool, reach: k.reach }; };
const REST_HALO = halo(LOOKS.halo.states.rest as keyof typeof LOOKS.halo.takes), WORK_HALO = halo(LOOKS.halo.states.working as keyof typeof LOOKS.halo.takes);

/** what a weight changes, in words, for the line under the jelly */
export function sayWeight(n: WorldNode | undefined, w: number, st: HomeState2 | null): string {
  if (!n) return "";
  const name = n.name, its = /s$/.test(name) ? `${name}'` : `${name}'s`;
  if (n.kind === "folder") {
    const f = (st?.folders ?? []).find((x) => x.id === n.id);
    const ids = new Set((st?.folders ?? []).filter((x) => x.crumb[0] === f?.name).map((x) => x.id));
    const nS = (st?.stickies ?? []).filter((s) => ids.has(s.folder)).length, nM = (st?.made ?? []).filter((m) => ids.has(m.folder)).length;
    return [
      `off: no job outside ${name} reads it; its own jobs still start from it`,
      `light: jobs outside ${name} carry its name and rule only`,
      `normal: jobs outside ${name} carry its index`,
      `heavy: every job carries ${its} index (${nS} stickies, ${nM} made)`,
    ][w];
  }
  if (n.kind === "mail") return ["off: no job reads mail; acts from mail stop", "light: jobs carry mail subjects only", "normal: jobs carry this week's mail that names their folder", "heavy: every job carries this week's mail"][w];
  if (n.kind === "calendar") return ["off: no job reads your calendar; ahead stops proposing (your events stay as they are)", "light: jobs carry today's events only", "normal: jobs carry the next 7 days", "heavy: every job carries the next 14 days"][w];
  if (n.kind === "build") return ["off: Home stops reading your Build sessions", "light: jobs carry the names of the sessions that wait on you", "normal: jobs carry what your Build sessions wait on", "heavy: jobs carry your Build sessions' last steps"][w];
  return [`off: nothing goes out to ${name}`, `light: only what needs you goes to ${name}`, `normal: what needs you and what was made go to ${name}`, `heavy: every step goes out to ${name}`][w];
}

type Spot = { x: number; y: number };
type Talk = { id: string; q: string; a: string; sources: { kind: string; name: string }[]; done: boolean };

export function World({ h }: { h: Home2Api }) {
  const w = h.st?.world;
  // the jelly's two open picks (pass2.ts PICKS): the black around it lit from inside or plain; its skin smooth or grain
  const back = usePick("back"), skin = usePick("skin");
  const field = useRef<HTMLDivElement>(null);
  const [W, H] = useSize(field);
  const [hover, setHover] = useState<{ node: string; at: Spot } | null>(null);
  const [drag, setDrag] = useState<{ stream: string; from: number; to: number } | null>(null);
  const [said, setSaid] = useState("");
  const [lit, setLit] = useState<Set<string>>(new Set());
  const [talk, setTalk] = useState<Talk[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const was = useRef(new Map<string, number>());   // a stream's weight before it was turned off, for the double-click back on

  // the answer streams in; when it is done, the streams it used pulse for a while
  useEffect(() => h.on("home.world.say", (m) => {
    setTalk((ts) => ts.map((t) => (t.id === m.ask ? { ...t, a: t.a + (m.words ?? ""), done: !!m.done, sources: m.done ? m.sources ?? [] : t.sources } : t)));
    if (m.done) {
      setSpeaking(false);
      const used: string[] = m.used ?? [];
      setLit(new Set(used));
      setTimeout(() => setLit(new Set()), 4000);
    } else setSpeaking(true);
  }), [h.on]);   // eslint-disable-line react-hooks/exhaustive-deps

  const nodes = w?.nodes ?? [];
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const nodeOf = (s: Stream) => (s.from === "jelly" ? s.to : s.from);
  const weightOf = (s: Stream) => (drag?.stream === s.id ? drag.to : s.weight);

  // moving now: a run in that folder (or any run, for the outlets), or an answer that used it
  const moving = useMemo(() => {
    const st = h.st, out = new Set<string>(lit);
    const live = (st?.stickies ?? []).filter((s) => s.state === "running" || s.state === "queued");
    const topOf = new Map((st?.folders ?? []).map((f) => [f.id, (st?.folders ?? []).find((x) => !x.parent && x.name === f.crumb[0])?.id]));
    for (const s of live) { const t = topOf.get(s.folder); if (t) out.add(t); }
    return out;
  }, [h.st, lit]);

  // the geometry: the jelly in the middle, sources on an arc from bottom-left over the top, outlets on the right
  const J = Math.round(Math.max(110, Math.min(190, Math.min(W, H) * 0.26)));
  const cx = W / 2, cy = H * 0.46, rx = W * 0.38, ry = H * 0.36;
  const at = useMemo(() => {
    const m = new Map<string, Spot>();
    const ins = (w?.streams ?? []).filter((s) => s.to === "jelly").map(nodeOf), outs = (w?.streams ?? []).filter((s) => s.from === "jelly").map(nodeOf);
    const put = (ids: string[], a0: number, a1: number) => ids.forEach((id, i) => { const a = ((ids.length === 1 ? (a0 + a1) / 2 : a0 + ((a1 - a0) * i) / (ids.length - 1)) * Math.PI) / 180; m.set(id, { x: cx + rx * Math.cos(a), y: cy - ry * Math.sin(a) }); });
    put(ins, 235, 65); put(outs, 18, -28);
    return m;
  }, [w?.streams, cx, cy, rx, ry]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!w) return null;
  /** a stream's two ends: the jelly's centre, and the node's edge (no word sits on liquid) */
  const ends = (s: Stream): [Spot, Spot] | null => {
    const a = s.from === "jelly" ? { x: cx, y: cy } : at.get(s.from), b = s.to === "jelly" ? { x: cx, y: cy } : at.get(s.to);
    if (!a || !b) return null;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    const edge = (n: string) => { const t = byId.get(n)?.name ?? ""; const hw = (t.length * 3.6 + 18), hh = 16; return Math.min(hw / Math.max(Math.abs(ux), 1e-3), hh / Math.max(Math.abs(uy), 1e-3)) + 4; };
    return [s.from === "jelly" ? a : { x: a.x + ux * edge(s.from), y: a.y + uy * edge(s.from) }, s.to === "jelly" ? b : { x: b.x - ux * edge(s.to), y: b.y - uy * edge(s.to) }];
  };
  const sayFor = (s: Stream, wt: number) => sayWeight(byId.get(nodeOf(s)), wt, h.st);
  const setWeight = (s: Stream, wt: number) => { if (wt === s.weight) return; if (wt === 0) was.current.set(s.id, s.weight); h.send({ type: "home.world.weight", stream: s.id, weight: wt }); setSaid(sayFor(s, wt)); };

  // drag along a stream: the pointer's travel along it, toward the jelly is more
  const down = (s: Stream, ev: RPE<SVGLineElement>) => {
    if (ev.button !== 0) return;
    const a = s.from === "jelly" ? { x: cx, y: cy } : at.get(s.from)!, b = s.to === "jelly" ? { x: cx, y: cy } : at.get(s.to)!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    const toward = s.to === "jelly" ? 1 : -1;   // an outlet's stream runs out of the jelly: toward it is backwards
    const x0 = ev.clientX, y0 = ev.clientY, w0 = s.weight;
    let moved = false;
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    const move = (e: PointerEvent) => {
      const d = ((e.clientX - x0) * ux + (e.clientY - y0) * uy) * toward;
      if (Math.abs(d) > 4) moved = true;
      if (!moved) return;
      const to = Math.max(0, Math.min(3, w0 + Math.round(d / SAY_STEP)));
      setDrag({ stream: s.id, from: w0, to });
      setSaid(sayFor(s, to));
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      if (moved) { const d = ((e.clientX - x0) * ux + (e.clientY - y0) * uy) * toward; setWeight(s, Math.max(0, Math.min(3, w0 + Math.round(d / SAY_STEP)))); }
      setDrag(null);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const flip = (s: Stream) => setWeight(s, s.weight > 0 ? 0 : was.current.get(s.id) ?? 2);

  const hv = hover && byId.get(hover.node);
  const hvStream = hover ? w.streams.find((s) => nodeOf(s) === hover.node) : undefined;
  const jobs = (ids: string[]) => ids.map((id) => (h.st?.stickies ?? []).find((s) => s.id === id)?.text).filter(Boolean) as string[];
  const vars = { "--p2w-ink": ink, "--p2w-dim": dim, "--p2w-mute": mute, "--p2w-line": on(SHADE.on.line), "--p2w-edge": on(SHADE.on.edge), "--p2w-hover": on(SHADE.on.hover), "--p2w-card": black(SHADE.steps.card), "--p2w-pop": black(SHADE.steps.pop), "--p2w-yellow": JELLY.six[4], "--p2w-green": JELLY.six[5] } as CSSProperties;
  const bodyState: BodyState = drag ? "apart" : "settled";

  return (
    <section className="p2-tile p2w" data-p2="world-view" style={vars}>
      <div className="p2w-in">
      {/* grain and a hard edge (PICKS.skin): the jelly's edge broken by noise, its alpha cut to a step */}
      <svg className="p2w-defs" aria-hidden><filter id="p2w-grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" /><feDisplacementMap in="SourceGraphic" scale="3" xChannelSelector="R" yChannelSelector="G" result="d" /><feComponentTransfer in="d"><feFuncA type="discrete" tableValues="0 1" /></feComponentTransfer></filter></svg>
      <div className="p2w-field" ref={field} data-p2w="field">
        {W > 0 && w.streams.map((s, i) => {
          const e = ends(s); if (!e) return null;
          const [a, b] = e;
          return <Goo key={s.id} s={s} i={i} a={a} b={b} weight={weightOf(s)} live={moving.has(nodeOf(s))} picked={hover?.node === nodeOf(s) || drag?.stream === s.id} />;
        })}
        {W > 0 && (
          <svg className="p2w-hits" width={W} height={H} aria-hidden>
            {w.streams.map((s) => {
              const e = ends(s); if (!e) return null;
              const [a, b] = e;
              const n = nodeOf(s);
              return <line key={s.id} data-stream={s.id} data-part={`stream › ${byId.get(n)?.name ?? n}`} data-weight={weightOf(s)} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                onPointerDown={(ev) => down(s, ev)} onDoubleClick={() => flip(s)}
                onPointerEnter={(ev) => setHover({ node: n, at: { x: ev.clientX, y: ev.clientY } })} onPointerLeave={() => setHover((o) => (o?.node === n ? null : o))} />;
            })}
          </svg>
        )}
        {W > 0 && <div className="p2w-jelly" data-p2w="jelly" data-part="world › the jelly" data-back={back} data-skin={skin} style={{ left: cx - J / 2, top: cy - J / 2, width: J, height: J }}><Body size={J} state={bodyState} halo={drag || speaking ? WORK_HALO : REST_HALO} /></div>}
        {W > 0 && nodes.map((n) => {
          const p = at.get(n.id); if (!p) return null;
          const s = w.streams.find((x) => nodeOf(x) === n.id);
          return (
            <div key={n.id} className={`p2w-node${s && weightOf(s) === 0 ? " off" : ""}`} data-node={n.id} data-part={`world › ${n.name}`} style={{ left: p.x, top: p.y }}
              onPointerEnter={(ev) => setHover({ node: n.id, at: { x: ev.clientX, y: ev.clientY } })} onPointerLeave={() => setHover((o) => (o?.node === n.id ? null : o))}
              onDoubleClick={() => s && flip(s)}>
              <Pill words={[n.name]} picked={-1} h={28} up={hover?.node === n.id} />
            </div>
          );
        })}
        {W > 0 && <p className="p2w-say" data-p2w="say" style={{ top: Math.min(H - 28, cy + ry + 30) }}>{drag ? said : said || (hvStream ? sayFor(hvStream, hvStream.weight) : "")}</p>}
        {hv && hvStream && (() => {
          const r = field.current?.getBoundingClientRect();
          const js = jobs(hvStream.used);
          return (
            <div className="p2w-tip" data-p2w="tip" style={{ left: hover!.at.x - (r?.left ?? 0) + 14, top: hover!.at.y - (r?.top ?? 0) + 14 }}>
              <b>{hv.name}</b> · {WORDS[weightOf(hvStream)]} · {js.length ? `read by ${js.length} job${js.length > 1 ? "s" : ""} this week` : "no job read it this week"}
              {js.slice(0, 3).map((t) => <div key={t} className="p2w-tipjob">{t}</div>)}
            </div>
          );
        })()}
      </div>
      <div className="p2w-list" data-p2w="weights">
        {w.streams.map((s) => { const n = byId.get(nodeOf(s)); return n && (
          <div key={s.id} className="p2w-wrow" data-weights={s.id}><span>{n.name}</span><Pill words={WORDS} picked={s.weight} h={26} onPick={(i) => setWeight(s, i)} /></div>
        ); })}
      </div>
      <Knows h={h} lines={w.lines} talk={talk} setTalk={setTalk} />
      </div>
    </section>
  );
}

/** one stream: a tube of goo in Liquid's field and shade, laid from a to b; its thickness the weight; off, a dashed line */
function Goo({ s, i, a, b, weight, live, picked }: { s: Stream; i: number; a: Spot; b: Spot; weight: number; live: boolean; picked: boolean }) {
  const L = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
  const S = 256, T = [0, 5, 9, 14][weight];   // the tube's thickness in px, by weight
  const c1 = JELLY.six[i % 6], c2 = JELLY.six[(i + 2) % 6];
  // eight blobs along the middle of a square, close enough to merge into one tube; the square is then laid along the stream
  const pour = useMemo<Pour>(() => ({ blobs: Array.from({ length: 8 }, (_, k) => ({ x: 0.06 + (0.88 * k) / 7, y: 0.5, r: 0.085 })), tints: [{ x: 0.08, y: 0.5, c: c1 }, { x: 0.92, y: 0.5, c: c2 }], halo: 0.35 }), [c1, c2]);
  const Hd = Math.max(T, 5) / 0.2;   // the tube is about 0.2 of the square's height: shown that tall, it is T thick
  const box: CSSProperties = { left: a.x, top: a.y, width: L, height: Hd, marginTop: -Hd / 2, transform: `rotate(${ang}rad)` };
  // off: a dashed grey line; the goo's canvas stays mounted, hidden, so turning a stream on and off never makes new
  // WebGL contexts (enough of them and the browser drops the oldest, which can be the body's)
  const off = weight === 0;
  return (
    <div className={`p2w-stream${off ? " off" : ""}${live && !off ? " live" : ""}${picked ? " pick" : ""}`} data-goo={s.id} data-live={live && !off ? 1 : 0} style={box}>
      <div style={{ width: S, height: S, transform: `scale(${L / S}, ${Hd / S})`, transformOrigin: "0 0", visibility: off ? "hidden" : undefined }}><Liquid size={S} pour={pour} /></div>
      {off && <b className="p2w-dash" />}
      {live && !off && <i className="p2w-drop" style={{ width: T * 1.6, height: T * 1.6, marginTop: -T * 0.8 }} />}
    </div>
  );
}

const SECTIONS: { h: string; kinds: WorldLine["kind"][] }[] = [
  { h: "what it knows about you", kinds: ["preference", "learned"] },
  { h: "the voice", kinds: ["voice"] },
  { h: "the hours", kinds: ["hours"] },
];

/** the right column: the lines, edited in place, keep · forget; then ask world */
function Knows({ h, lines, talk, setTalk }: { h: Home2Api; lines: WorldLine[]; talk: Talk[]; setTalk: (f: (t: Talk[]) => Talk[]) => void }) {
  const [edit, setEdit] = useState<{ id: string; text: string } | null>(null);
  const [q, setQ] = useState("");
  const n = useRef(0);
  const ask = () => {
    const words = q.trim(); if (!words) return;
    const id = `ask-${Date.now()}-${++n.current}`;
    setTalk((ts) => [...ts.slice(-3), { id, q: words, a: "", sources: [], done: false }]);
    h.send({ type: "home.world.ask", words, ask: id });
    setQ("");
  };
  const row = (l: WorldLine) => (
    <div key={l.id} className={`p2w-line${l.kept === null ? " new" : ""}`} data-line={l.id} data-kept={String(l.kept)}>
      {edit?.id === l.id
        ? <input className="p2w-edit" autoFocus value={edit.text} onChange={(e) => setEdit({ id: l.id, text: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter" && edit.text.trim()) { h.send({ type: "home.world.line", id: l.id, text: edit.text.trim() }); setEdit(null); } if (e.key === "Escape") { e.stopPropagation(); setEdit(null); } }}
            onBlur={() => setEdit(null)} />
        : <span className="p2w-t" role="button" tabIndex={-1} onClick={() => setEdit({ id: l.id, text: l.text })}>{l.text}</span>}
      {l.kept === null && <span className="p2w-from">{l.from}</span>}
      <span className="p2w-opts">
        {l.kept !== true && <button tabIndex={-1} data-opt="keep" onClick={() => h.send({ type: "home.world.line", id: l.id, keep: true })}>keep</button>}
        <button tabIndex={-1} data-opt="forget" onClick={() => h.send({ type: "home.world.line", id: l.id, forget: true })}>forget</button>
      </span>
    </div>
  );
  return (
    <div className="p2w-col" data-p2w="knows">
      {SECTIONS.map((sec) => { const ls = lines.filter((l) => sec.kinds.includes(l.kind)); return ls.length ? (
        <div key={sec.h} className="p2w-sec"><h4>{sec.h}</h4>{ls.map(row)}</div>
      ) : null; })}
      <div className="p2w-sec p2w-ask" data-p2w="ask">
        <h4>ask world</h4>
        <input className="p2w-q" placeholder="what did I promise…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(); }} />
        {talk.map((t) => (
          <div key={t.id} className="p2w-turn" data-ask={t.id} data-done={t.done ? 1 : 0}>
            <div className="p2w-me">{t.q}</div>
            <div className="p2w-a">{t.a || "…"}</div>
            {t.done && t.sources.length > 0 && <div className="p2w-src">{t.sources.map((s) => <span key={s.name}>{s.name}</span>)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
