// The whole of Jelly (#1193; the decision: ours/design-jelly-system.md, 2026-11-14; Marco's picture: systems.html): every
// system grouped as a cluster, each cluster a glass island, only the wires between clusters at this layer, heavier the
// more systems they carry. On each island: who works in it now (a person's agents, from the work under way) and its
// newest change; the top line says what the last change reached. A press on an island opens that cluster in its own
// drawing, by its role: design in its five lanes (the System kind itself), the engine and what ships in → inside → out,
// the machines one column each with what runs on them, the rest as a plain grid of their parts. A press on empty ground,
// Escape or "All of Jelly" goes back.
//
// Never drawn by hand: the engine reads the registry, the work under way and git's last days (work.systems.whole) and the
// block asks again when a record changes (work.systems.changed for the root) or the work moves (work.systems.live).
// Motion only for a change: a new newest change lights its islands and draws once along the wires to what it reaches.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as RMouseEvent } from "react";
import { Glass, useSize } from "../../kit";
import { CURVE, SHADE } from "../../kit/tokens";
import { store } from "../engineStore";
import { openSession } from "../../runs/useSessions";
import type { Block } from "../model";
import type { KindProps } from "./types";
import { System } from "./System";
import {
  BANDS, DRAWING_WORDS, FLOW, ISLAND_H, ISLAND_W, MAP_W, agoWords, byWords, cleanSubject, curve, drawingOf, flowLayout, flowOf, flowPath,
  hereOn, islandLine, islandsOf, machinesOf, mapHeight, moved, partsOf, peopleIn, personOf, wireWidth, wiresDrawn, zoomed,
  type Cluster, type Here, type Sys, type Whole, type Zoom,
} from "./systems/model";
import "./systems/systems.css";

export type SystemsBody = { /** open on this cluster */ at?: string };
/** a place that holds the zoom and the pick (#1416, Cowork's place.ts): path [cluster, part]; go moves it; names tells
 *  the place what the clusters and parts are called as they are read. Left out, the block keeps its own zoom */
export type SystemsAt = { path: string[]; go: (path: string[]) => void; names?: (n: Record<string, string>) => void };

/** how long a change's light stays */
const LIGHT_MS = 2400;
/** asks that come close together are one ask */
const SETTLE_MS = 400;
const STATES: [string, string][] = [["live", "var(--c-pearl)"], ["building", "var(--write)"], ["broken", "var(--error)"], ["parked", "rgb(255 255 255 / .3)"], ["legacy", "rgb(255 255 255 / .14)"]];

const Who = ({ people }: { people: { person: string; sessions: Here[] }[] }) => (
  <span className="ss-who">
    {people.slice(0, 4).map((p) => (
      <span key={p.person} className="ss-av" title={p.sessions.map((s) => `${p.person}'s agent · ${short(s.title)} (${s.branch})`).join("\n")}>
        {p.person[0]}<i />
      </span>
    ))}
  </span>
);

function Island({ c, at, whole, lit, reach, open }: {
  c: Cluster; at: [number, number]; whole: Whole; lit: boolean; reach: boolean; open: (id: string) => void;
}) {
  const total = Math.max(1, c.count), last = whole.last;
  const cls = ["ss-is", c.id === "legacy" ? "dim" : "", lit ? "lit" : "", reach ? "reach" : "", last?.reaches.includes(c.id) ? "rch" : ""].filter(Boolean).join(" ");
  return (
    <button className={cls} style={{ left: at[0] - ISLAND_W / 2, top: at[1] - ISLAND_H / 2, width: ISLAND_W, height: ISLAND_H }}
      onClick={(e) => { e.stopPropagation(); open(c.id); }} data-cluster={c.id} data-go={c.id} title={c.about}>
      <Glass r={CURVE.radius.box} fill={`rgb(255 255 255 / ${SHADE.on.flat})`} />
      <span className="ss-is-hd"><b>{c.name}</b><Who people={peopleIn(whole.who, c.id)} /></span>
      <span className="ss-is-ln">{islandLine(c, whole.changes[c.id])}</span>
      <span className="ss-bar">{STATES.map(([s, col]) => c.states[s] ? <i key={s} style={{ width: `${(100 * c.states[s]) / total}%`, background: col }} /> : null)}</span>
    </button>
  );
}

/** a session's title, short enough for a line */
const short = (t: string, n = 60) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/** a system as a tile in a cluster's drawing: its name, its kind and state, who works on it now */
function SysTile({ s, who, style, hot, units, pick, on }: { s: Sys; who: Here[]; style?: CSSProperties; hot?: (id: string | null) => void; units?: boolean; pick?: (id: string) => void; on?: boolean }) {
  const here = hereOn(who, s.id).filter((h, i, all) => all.findIndex((x) => personOf(x.person) === personOf(h.person)) === i);   // one a person
  return (
    <div className={`ss-t s-${s.state}${here.length ? " busy" : ""}${on ? " on" : ""}`} style={style} title={`${s.id}${s.state !== "live" ? ` · ${s.state}` : ""}`}
      onMouseEnter={() => hot?.(s.id)} onMouseLeave={() => hot?.(null)} {...(pick ? { onClick: (e: RMouseEvent) => { e.stopPropagation(); pick(s.id); }, "data-go": s.id } : {})}>
      <span className="ss-t-hd"><span className="ss-t-nm">{s.name}</span>
        {here.slice(0, 3).map((h) => (   // who works on it now: their initial; a press opens that agent's session
          <button key={h.session} className="ss-av" data-layer="session" onClick={(e) => { e.stopPropagation(); openSession(h.session); }}
            title={`${personOf(h.person)}'s agent · ${short(h.title)} (${h.branch}): press to open the session`}>{personOf(h.person)[0]}<i /></button>
        ))}</span>
      <span className="ss-t-k">{s.kind}{s.state !== "live" ? ` · ${s.state}` : ""}</span>
      {units && s.units.length > 0 && <span className="ss-units">{s.units.map((u) => <code key={u}>{u}</code>)}</span>}
    </div>
  );
}

function FlowDrawing({ id, whole, pick, on }: { id: string; whole: Whole; pick?: (id: string) => void; on?: string }) {
  const f = useMemo(() => flowOf(id, whole), [id, whole]);
  const { boxes, w, h } = useMemo(() => flowLayout(f), [f]);
  const [hot, setHot] = useState<string | null>(null);
  const name = (c: string) => whole.clusters.find((x) => x.id === c)?.name ?? c;
  const x0 = FLOW.sideW + FLOW.lane, x1 = x0 + FLOW.cols * (FLOW.tileW + FLOW.gap) - FLOW.gap + FLOW.lane;
  return (
    <div className="ss-flow" style={{ width: w, height: h + 40 }} data-ground>
      <div className="ss-col-h" style={{ left: 0 }}><b>What comes in</b><span>{f.ins.length ? "fed by other clusters" : "nothing from outside"}</span></div>
      <div className="ss-col-h" style={{ left: x0 }}><b>The parts inside</b><span>{f.inside.length} · the most wired first</span></div>
      <div className="ss-col-h" style={{ left: x1 }}><b>What goes out</b><span>{f.outs.length ? "feeds other clusters" : "nothing outside"}</span></div>
      <div className="ss-flow-in" style={{ height: h }}>
        <svg className="ss-fw" width={w} height={h}>
          {f.wires.map(([a, b]) => {
            const A = boxes.get(a), B = boxes.get(b);
            if (!A || !B || A.x >= B.x) return null;
            return <path key={`${a}>${b}`} d={flowPath(A, B)} className={hot && (a === hot || b === hot) ? "hot" : hot ? "faint" : ""} />;
          })}
        </svg>
        {[...f.ins.map((s) => ["in", s] as const), ...f.outs.map((s) => ["out", s] as const)].map(([k, s]) => {
          const b = boxes.get(`${k}:${s.cluster}`)!;
          return (
            <div key={`${k}:${s.cluster}`} className="ss-side" style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
              onMouseEnter={() => setHot(`${k}:${s.cluster}`)} onMouseLeave={() => setHot(null)}>
              <b>{name(s.cluster)} <i>{s.systems.length}</i></b>
              <span>{s.systems.map((x) => x.name).join(" · ")}</span>
            </div>
          );
        })}
        {f.inside.map((s) => { const b = boxes.get(s.id)!; return <SysTile key={s.id} s={s} who={whole.who} hot={setHot} pick={pick} on={on === s.id} style={{ left: b.x, top: b.y, width: b.w, height: b.h, position: "absolute" }} />; })}
      </div>
    </div>
  );
}

function MachinesDrawing({ id, whole, pick, on }: { id: string; whole: Whole; pick?: (id: string) => void; on?: string }) {
  const cols = useMemo(() => machinesOf(id, whole), [id, whole]);
  return (
    <div className="ss-cols" style={{ gridTemplateColumns: `repeat(${Math.max(1, cols.length)}, minmax(190px, 1fr))` }} data-ground>
      {cols.map((c) => (
        <div key={c.machine} className="ss-col" data-ground>
          <div className="ss-col-hh"><b>{c.name}</b><span>{c.systems.length} on it</span></div>
          {c.systems.map((s) => <SysTile key={s.id} s={s} who={whole.who} units pick={pick} on={on === s.id} />)}
          {!c.systems.length && <p className="ss-dim">nothing named on it</p>}
        </div>
      ))}
    </div>
  );
}

function PartsDrawing({ id, whole, pick, on }: { id: string; whole: Whole; pick?: (id: string) => void; on?: string }) {
  const parts = useMemo(() => partsOf(id, whole), [id, whole]);
  return (
    <div className="ss-grid" data-ground>
      {parts.map((s) => <SysTile key={s.id} s={s} who={whole.who} pick={pick} on={on === s.id} />)}
      {!parts.length && <p className="ss-dim">No system in it yet.</p>}
    </div>
  );
}

const DESIGN_BLOCK = { id: "systems-design", kind: "system", title: "Design", state: "live", versions: [], sessions: [] } as unknown as Block;

export function Systems({ body, at: place }: KindProps<SystemsBody> & { at?: SystemsAt }) {
  const link = store.link();
  const [whole, setWhole] = useState<Whole | null>(null);
  const [error, setError] = useState("");
  const [own, setOwn] = useState<Zoom>(body?.at ?? null);
  // held by a place (#1416): the zoom is the path's first step, a move is the place's; else the block's own
  const placeRef = useRef(place); placeRef.current = place;
  const zoom: Zoom = place ? place.path[0] ?? null : own;
  const part = place?.path[1] ?? null;
  const setZoom = useCallback((f: (z: Zoom) => Zoom) => {
    const p = placeRef.current;
    if (!p) { setOwn(f); return; }
    const was = p.path[0] ?? null, z = f(was);
    if (z !== was) p.go(z ? [z] : []);
  }, []);
  const [light, setLight] = useState<{ touched: string[]; reached: string[] }>({ touched: [], reached: [] });
  const wholeRef = useRef<Whole | null>(null), lightT = useRef<number | undefined>(undefined);

  const take = useCallback((w: Whole) => {
    const m = moved(wholeRef.current, w);
    wholeRef.current = w; setWhole(w); setError("");
    if (placeRef.current) placeRef.current.names?.(Object.fromEntries([...w.clusters.map((c) => [c.id, c.name]), ...w.systems.map((x) => [x.id, x.name])]));
    else setZoom((z) => zoomed(z, { known: w.clusters.map((c) => c.id) }));   // a place keeps its address; a cluster gone draws the whole
    if (!m.touched.length) return;
    setLight(m);
    window.clearTimeout(lightT.current);
    lightT.current = window.setTimeout(() => setLight({ touched: [], reached: [] }), LIGHT_MS);
  }, []);

  useEffect(() => {
    if (!link) return;
    let gone = false, soon: number | undefined;
    const ask = () => {
      void link.ask<{ whole?: Whole; error?: string }>("work.systems.whole", {}, 30_000).then((r) => {
        if (gone) return;
        if (r?.whole) take(r.whole); else if (!wholeRef.current) setError(r?.error ?? "the engine sent no map");
      });
    };
    const later = () => { window.clearTimeout(soon); soon = window.setTimeout(ask, SETTLE_MS); };
    ask();
    void link.ask("work.systems.live", {});   // hold the work under way, so the engine says when it moves
    const off = link.listen((m: { type?: string; area?: string }) => {
      if (m?.type === "open") { ask(); void link.ask("work.systems.live", {}); return; }
      if (m?.type === "work.systems.live" || (m?.type === "work.systems.changed" && m.area === "jelly")) later();
    });
    return () => { gone = true; off(); window.clearTimeout(soon); window.clearTimeout(lightT.current); link.send({ type: "work.systems.live", off: true }); };
  }, [link, take]);
  // Escape goes back to the whole; under a place the place's Esc does it, one layer at a time
  useEffect(() => {
    if (place) return;
    const k = (e: KeyboardEvent) => setZoom((z) => zoomed(z, { key: e.key }));
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [!place]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickPart = useCallback((id: string) => { const p = placeRef.current; if (p?.path[0]) p.go(p.path[1] === id ? [p.path[0]] : [p.path[0], id]); }, []);

  const host = useRef<HTMLDivElement>(null), [W, H] = useSize(host);
  const at = useMemo(() => islandsOf(whole?.clusters ?? []), [whole]);
  const mapH = useMemo(() => mapHeight(at), [at]);
  const k = W && H ? Math.min(1.25, (W - 24) / MAP_W, (H - 64) / mapH) : 1;
  const ox = Math.max(12, (W - MAP_W * k) / 2), oy = 52 + Math.max(0, (H - 52 - mapH * k) / 2);
  const wires = useMemo(() => (whole ? wiresDrawn(whole.wires, at) : []), [whole, at]);
  const open = useCallback((id: string) => setZoom((z) => zoomed(z, { press: "cluster", id })), [setZoom]);
  const back = useCallback(() => setZoom((z) => zoomed(z, { press: "ground" })), [setZoom]);
  const ground = (e: RMouseEvent) => { if ((e.target as HTMLElement).closest("[data-ground]") === e.target || e.target === e.currentTarget) back(); };

  // the host is always there, so its size is known before the first reading lands
  if (!link || error || !whole) return <div ref={host} className="ss"><div className="ss-none">{!link ? "The systems are read from the engine; none is connected." : error || "reading the registry…"}</div></div>;

  const cl = zoom ? whole.clusters.find((c) => c.id === zoom) ?? null : null;
  const drawing = cl ? drawingOf(cl) : null;
  const origin = cl && at.get(cl.id) ? `${ox + at.get(cl.id)![0] * k}px ${oy + at.get(cl.id)![1] * k}px` : "50% 50%";
  const last = whole.last, lit = new Set(light.touched), reached = new Set(light.reached);
  const here = cl ? peopleIn(whole.who, cl.id) : [];
  const picked = cl && part && drawing !== "system" ? whole.systems.find((x) => x.id === part) ?? null : null;
  const pickedWork = picked ? hereOn(whole.who, picked.id) : [];

  return (
    <div ref={host} className={`ss${cl ? " zoomed" : ""}`} data-part="the whole of jelly">
      <div className="ss-whole" onClick={back} data-go="the whole" style={{ transformOrigin: origin }}>
        <div className="ss-map" style={{ width: MAP_W, height: mapH, transform: `translate(${ox}px, ${oy}px) scale(${k})` }}>
          {BANDS.map((b) => <div key={b.words} className="ss-band" style={{ left: b.x, top: b.y, width: b.w, height: b.h }}><span>{b.words}</span></div>)}
          <svg className="ss-wires" width={MAP_W} height={mapH}>
            {wires.map((w) => <path key={`${w.from}>${w.to}`} d={curve(at.get(w.from)!, at.get(w.to)!)} strokeWidth={wireWidth(w.n)}><title>{`${w.n} wire${w.n === 1 ? "" : "s"}: ${w.from} → ${w.to}`}</title></path>)}
            {light.touched.flatMap((a) => light.reached.filter((b) => at.has(a) && at.has(b)).map((b) => <path key={`rip ${a}>${b}`} className="rip" d={curve(at.get(a)!, at.get(b)!)} />))}
          </svg>
          {whole.clusters.map((c) => at.has(c.id) && <Island key={c.id} c={c} at={at.get(c.id)!} whole={whole} lit={lit.has(c.id)} reach={reached.has(c.id)} open={open} />)}
        </div>
      </div>

      {cl && drawing && (
        <div className={`ss-zoom d-${drawing}`} style={{ transformOrigin: origin }} onClick={drawing === "system" ? undefined : ground} data-ground data-go="the whole">
          {drawing === "system" ? (
            <div className="ss-sys"><System b={DESIGN_BLOCK} body={{ area: cl.id }} act={() => {}}
              {...(place ? { sel: part, onSel: (id: string | null) => place.go(id ? [cl.id, id] : [cl.id]) } : {})} /></div>
          ) : (
            <div className="ss-zoom-in" data-ground>
              <div className="ss-zh" data-ground>
                <h2>{cl.name}</h2><span className="ss-dim">{DRAWING_WORDS[drawing]}</span>
                {cl.about && <p>{cl.about}</p>}
                {here.length > 0 && <p className="ss-here">Here now: {here.map((p) => (   // one line a person: their agents, the newest one press away
                  <button key={p.person} data-layer="session" onClick={(e) => { e.stopPropagation(); openSession(p.sessions[0].session); }}
                    title={p.sessions.map((s) => `${short(s.title, 90)} (${s.branch})`).join("\n")}>
                    {p.person}'s agent{p.sessions.length > 1 ? `s (${p.sessions.length})` : ""} · {short(p.sessions[0].title, 48)}</button>
                ))}</p>}
                {whole.changes[cl.id] && <p className="ss-dim">Newest change: {byWords(whole.changes[cl.id])} · {agoWords(whole.changes[cl.id].at)} · {cleanSubject(whole.changes[cl.id].subject)}</p>}
              </div>
              {picked && <p className="ss-here" data-part-picked={picked.id}><b>{picked.name}</b> · {picked.kind}{picked.state !== "live" ? ` · ${picked.state}` : ""}
                {pickedWork.length === 0 ? <span className="ss-dim"> · nobody works on it now</span> : pickedWork.map((h) => (
                  <button key={h.session} data-layer="session" onClick={(e) => { e.stopPropagation(); openSession(h.session); }} title={`${short(h.title, 90)} (${h.branch})`}>
                    {personOf(h.person)}'s agent · {short(h.title, 48)}</button>))}</p>}
              {drawing === "flow" && <FlowDrawing id={cl.id} whole={whole} pick={place ? pickPart : undefined} on={part ?? undefined} />}
              {drawing === "machines" && <MachinesDrawing id={cl.id} whole={whole} pick={place ? pickPart : undefined} on={part ?? undefined} />}
              {drawing === "parts" && <PartsDrawing id={cl.id} whole={whole} pick={place ? pickPart : undefined} on={part ?? undefined} />}
            </div>
          )}
        </div>
      )}

      <div className="ss-top">
        {!place && <div className="ss-crumb">{cl ? <><button onClick={back}>All of Jelly</button> › <b>{cl.name}</b></> : <><b>All of Jelly</b> <span className="ss-dim">· {whole.systems.length} systems in {whole.clusters.length} clusters · press one to open it</span></>}</div>}
        {last && (
          <div className="ss-last" title={last.subject}>
            Last change: <b>{byWords(last)}</b> · {agoWords(last.at)} · {cleanSubject(last.subject)}
            {last.reaches.length > 0 && <> · <span className="ss-reach">reaches {last.reaches.map((r) => whole.clusters.find((c) => c.id === r)?.name ?? r).slice(0, 4).join(", ")}{last.reaches.length > 4 ? ` +${last.reaches.length - 4}` : ""}</span></>}
          </div>
        )}
      </div>
    </div>
  );
}
