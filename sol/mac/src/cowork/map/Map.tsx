// Cowork's map (#1433): the spec drawn as one map with views, Layers, a person's pins, Street View, the Time scrubber and
// the rail (for you, this view, the room). Map draws; it keeps no place of its own: the state comes in and every press
// goes out (onState), so the Cowork shell holds the place (#1422's history: crumbs, back, Esc) and a still is an address.
// The shapes are scene.ts's; the words are the spec's.
import { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { MapSpec, MapPin } from "./spec";
import { MAP_VARS } from "./vars";
import { THUMB, W, ago, defs, drawClock, drawMap, face, modelOf, personName, ticksOf, type Act, type MapState, type Model, type VNode } from "./scene";
import "./map.css";

// ---- a VNode as React ----
const camel = (k: string) => (k.startsWith("--") || k.startsWith("data-") ? k : k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()));
const styleOf = (s: string) => Object.fromEntries(s.split(";").filter(Boolean).map((d) => { const i = d.indexOf(":"); return [camel(d.slice(0, i).trim()), d.slice(i + 1).trim()]; }));
function Node({ n, act }: { n: VNode; act?: (a: Act) => void }): ReactNode {
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(n.a)) props[k === "class" ? "className" : k === "style" ? "style" : camel(k)] = k === "style" ? styleOf(String(v)) : v;
  if (n.on && act) { const a = n.on; props["data-go"] = "zoom" in a ? a.zoom : a.street; props.onClick = (e: { stopPropagation(): void }) => { e.stopPropagation(); act(a); }; }
  return createElement(n.t, props, ...(n.x != null ? [n.x] : []), ...n.k.map((k, i) => <Node key={i} n={k} act={act} />));
}
/** a face in words (Street View, the rail): the same mark as on the map */
function Face({ m, p, how, size = 20 }: { m: Model; p: string | null; how: string; size?: number }) {
  return <svg className="cm-face" width={size} height={size} viewBox={`0 0 ${size} ${size}`}><Node n={face(m, size / 2, size / 2, p, how, size / 2 - 1)} /></svg>;
}
function PinMark({ n }: { n: number }) {
  return <svg width="24" height="24" className="cm-pinmark"><rect x="1" y="1" width="22" height="22" rx="4" transform="rotate(-3 12 12)" style={{ fill: "var(--m-ask)" }} /><text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="600" style={{ fill: "var(--m-deep)" }}>{n}</text></svg>;
}
const LABEL = 11;   // the label size of the scale (--t-label), in px: the smallest a word on the map is drawn
const NUMBER = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

export type MapPress = {
  /** a pin's press, or Street View's: open an issue, a change, or the room, where each person's agent answers */
  issue?: (n: number) => void; change?: (sha: string) => void; room?: () => void;
};

export function CoworkMap({ spec, st, onState, press = {}, crumbs }: { spec: MapSpec; st: MapState; onState: (s: MapState) => void; press?: MapPress; crumbs?: boolean }) {
  const m = useMemo(() => modelOf(spec, st), [spec, st]);
  // the box keeps the sheet's shape across the width, so its scale is its width over the sheet's; no word on it reads
  // under the label size (11 px), however narrow the box
  const box = useRef<HTMLDivElement>(null), [wide, setWide] = useState(W);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => el.clientWidth && setWide(el.clientWidth)); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const min = Math.max(LABEL, Math.ceil((LABEL * W * 10) / wide) / 10);
  const scene = useMemo(() => drawMap(m, min), [m, min]);
  // Street View is a panel over the map's right: the map slides left so the place and the rest of its layer sit in the
  // space beside it, never past the left edge unless the place itself needs it; a slide, never a smaller word
  const [slide, setSlide] = useState(0), drawn = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    const panel = box.current?.querySelector<HTMLElement>(".cm-street"), g = drawn.current;
    if (!st.open || !panel || !g) return setSlide(0);
    // in the sheet's units: the drawing's own box (badges and pins with the circles), the panel's left edge
    const k = wide / W, gap = 12, room = panel.offsetLeft / k - gap, b = g.getBBox();
    if (!b.width) return setSlide(0);
    const at = scene.pos[m.chainOf(st.open).find((x) => scene.pos[x]) ?? ""];
    let dx = Math.max(Math.min(0, room - (b.x + b.width)), gap - b.x);
    if (at) dx = Math.min(dx, room - (at.x + at.r));
    setSlide(Math.min(0, Math.round(dx)));
  }, [st.open, scene, wide, m]);
  const set = (p: Partial<MapState>) => onState({ ...st, ...p });
  const act = (a: Act) => ("zoom" in a ? set({ at: a.zoom, open: null }) : set({ open: a.street }));
  const [find, setFind] = useState("");
  // the views and the scrubber take one row or two (a narrow box): Street View stops above whichever it is
  const foot = useRef<HTMLDivElement>(null), [footH, setFootH] = useState(0);
  useEffect(() => {
    const el = foot.current; if (!el) return;
    const ro = new ResizeObserver(() => setFootH(el.offsetHeight)); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Replay: the Time window walks from one hour to the whole, the map redrawing as it goes
  const replay = useRef<number | null>(null);
  useEffect(() => () => { if (replay.current) window.clearInterval(replay.current); }, []);
  const play = () => {
    if (replay.current) window.clearInterval(replay.current);
    let h = 1; const base = { ...st, view: m.order.find((v) => spec.views.find((x) => x.id === v)?.kind === "change") ?? st.view };
    replay.current = window.setInterval(() => { onState({ ...base, hours: h }); h += 3; if (h > spec.window) { window.clearInterval(replay.current!); replay.current = null; onState({ ...base, hours: spec.window }); } }, 60);
  };
  const go = (t: MapPin) => {
    if (t.act?.issue && press.issue) return press.issue(t.act.issue);
    if (t.act?.talk && press.room) return press.room();
    set({ view: t.act?.view ?? t.view, at: "root", open: null });
  };
  // a pin's own words only when its press can do them: with no way to open an issue or reach the room it opens its view
  const viewName = (id: string) => spec.views.find((v) => v.id === id)?.name ?? id;
  const marks = (t: MapPin) => (t.act?.issue && press.issue ? { "data-layer": "page" } : t.act?.talk && press.room ? { "data-go": "room" } : { "data-act": "the pin's view" });
  const said = (t: MapPin) => ((t.act?.issue && !press.issue) || (t.act?.talk && !press.room) ? `See ${viewName(t.act?.view ?? t.view)}` : t.press);
  const search = () => {
    const q = find.trim().toLowerCase(); if (!q) return;
    const hit = Object.values(spec.places).find((p) => p.id !== "root" && (p.name.toLowerCase().includes(q) || p.id.toLowerCase() === q))
      ?? Object.values(spec.places).find((p) => p.id !== "root" && p.id.toLowerCase().includes(q));
    if (hit) set(hit.kids.length ? { at: hit.id, open: null } : { at: hit.parent ?? "root", open: hit.id });
  };
  const other = [...m.persons.keys()].find((p) => p !== m.who) ?? m.who;
  const changeOn = m.kind === "change";

  return (
    <div className="cmap" style={MAP_VARS as CSSProperties} data-map-view={m.view.id} data-map-who={m.who}>
      <svg className="cm-paint" width="0" height="0" aria-hidden><Node n={defs()} /></svg>
      <div className="cm-bar">
        {crumbs ? <Crumbs m={m} set={set} /> : <div className="cm-grow" />}
        <div className="cm-layers" data-map-layers>
          {spec.types.map((t) => <button key={t.id} className={`cm-pill ${t.id === m.type?.id ? "on" : ""}`} title={t.hint} data-act="the map type" onClick={() => set({ type: t.id, at: "root", open: null })}>{t.name}</button>)}
          <span className="cm-sep" />
          {changeOn ? spec.toggles.map((t) => <button key={t.id} className={`cm-pill ${m.on(t.id) ? "" : "off"}`} title={t.what} data-toggle={t.id} data-act="a Layer on or off"
            onClick={() => set({ off: m.on(t.id) ? [...st.off, t.id] : st.off.filter((x) => x !== t.id) })}>{t.name}</button>)
            : <span className="cm-note">{spec.toggles.map((t) => t.name).join(", ")} switch in {spec.views.find((v) => v.kind === "change")?.name ?? "the first view"}</span>}
        </div>
        <div className="cm-seen">seen by {[...m.persons.values()].map((p) => <button key={p.id} className={`cm-pill ${p.id === m.who ? "on" : ""}`} data-act="whose seat"
          onClick={() => { const order = spec.view_order[p.id] ?? []; set({ who: p.id, view: order.includes(st.view) ? st.view : spec.surface[p.id]?.default_view ?? order[0] ?? st.view }); }}>{p.name}</button>)}</div>
      </div>
      <div className="cm-cw">
        <div className="cm-main">
          <Strip m={m} />
          <div className={`cm-mapbox ${st.open ? "open" : ""}`} ref={box} style={{ "--cm-foot": `${footH}px` } as CSSProperties}>
            <svg className="cm-svg" viewBox="0 0 1000 640" data-map-svg data-act="closes Street View" onClick={() => st.open && set({ open: null })}><g className="cm-slide" ref={drawn} style={{ transform: `translateX(${slide}px)` }} data-map-slide={slide}><Node n={scene.root} act={act} /></g></svg>
            <form className="cm-float cm-search" onSubmit={(e) => { e.preventDefault(); search(); }}>
              <span>⌕</span><input value={find} onChange={(e) => setFind(e.target.value)} placeholder="a part or a person" aria-label="find a part" />
            </form>
            <div className="cm-float cm-zoom">
              <button title="in" data-go="in" onClick={() => { const k = scene.shown[0]; if (k && spec.places[k]?.kids.length) set({ at: k, open: null }); }}>+</button>
              <button title="up one layer (Esc)" data-go="up" onClick={() => st.open ? set({ open: null }) : st.at !== "root" && set({ at: spec.places[st.at]?.parent ?? "root" })}>−</button>
            </div>
            <div className="cm-float cm-bottom" ref={foot}>
              <div className="cm-views" data-map-views>
                {m.order.map((id) => { const v = spec.views.find((x) => x.id === id); if (!v) return null; return (
                  <button key={id} className={`cm-pill ${id === m.view.id ? "on" : ""}`} data-view={id} data-act="the view" onClick={() => set({ view: id })}><i className="cm-th" style={{ background: THUMB[v.kind] }} />{v.name}</button>); })}
              </div>
              {changeOn && m.on("time") ? <div className="cm-time" data-map-time>
                <span>{spec.window} h ago</span>
                <div className="cm-track">
                  <div className="cm-ticks">{ticksOf(m).map((t) => <i key={t.h} style={{ left: `${t.left}%`, ...(t.hand ? { background: t.colour } : { boxShadow: `inset 0 0 0 1.5px ${t.colour}` }) }} />)}</div>
                  <input type="range" min={1} max={spec.window} value={st.hours} onChange={(e) => set({ hours: +e.target.value })} aria-label="the time window" />
                </div>
                <b>the last {st.hours} h</b>
              </div> : null}
            </div>
            {st.open ? <Street m={m} id={st.open} folded={scene.folded} set={set} press={press} play={play} /> : null}
          </div>
          <Key m={m} other={other} />
        </div>
        <div className="cm-rail">
          <div className="cm-card">
            <h4>For {personName(m, m.who)}, now</h4>
            {m.top.map((t, i) => (
              <div key={i} className="cm-topi" data-pin-row={i + 1} data-act="the pin's view" onClick={() => set({ view: t.view, at: "root", open: null })}>
                <span className="cm-pin"><PinMark n={i + 1} /></span>
                <div><div className="cm-s">{t.says.split(/(\d+)/).map((x, j) => (/^\d+$/.test(x) && j === 1 ? <span key={j} className="cm-num">{x}</span> : x))}</div>
                  <div className="cm-p"><button className="cm-go" {...marks(t)} onClick={(e) => { e.stopPropagation(); go(t); }}>{said(t)}</button><span className="cm-w">{viewName(t.view)}</span></div></div>
              </div>))}
          </div>
          <div className="cm-card">
            <h4>This view answers</h4>
            <div className="cm-q">{m.view.question}</div>
            {m.view.why ? <div className="cm-why">exists because: {m.view.why}</div> : null}
            {m.kind === "route" ? <div className="cm-panel">{m.stops.map((s, i) => { const n = spec.places[s.place], w = m.ws(s.place); return (
              <div key={i} className="cm-row"><span className="cm-sticker mine flat">{i + 1}</span><span className="cm-t"><b>{s.step}</b> · {s.what}</span><span className="cm-ago">{n?.broken ? "broken" : w.ch ? `${w.ch} moved` : "quiet"}</span></div>); })}</div> : null}
            {m.kind === "day" ? <div className="cm-panel"><Node n={drawClock(m)} /></div> : null}
          </div>
          <div className="cm-card cm-room">
            <h4>The room: {NUMBER[spec.people.length] ?? spec.people.length}, @ to wake</h4>
            <div className="cm-mem">{[...m.persons.keys()].map((p) => <Face key={p} m={m} p={p} how="hand" size={24} />)}{[...m.persons.keys()].map((p) => <Face key={p + "a"} m={m} p={p} how="agent" size={24} />)}</div>
            {spec.room.lines.map((l) => <div key={l.who + l.i} className="cm-ln"><Face m={m} p={l.who} how={l.how} size={16} /><span title={l.b}>#{l.i} · {l.b}</span></div>)}
            {press.room ? <div className="cm-presses"><button className="cm-go q" data-go="room" onClick={press.room}>Open the room</button></div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** the view's own answer in one row over the map, while the rail (where it is drawn in full) sits under the map, below
 * the fold: the day's hours with their state, the route's steps with what moved */
function Strip({ m }: { m: Model }) {
  const cells = m.kind === "day" ? (m.view.clock ?? []).map((r) => ({ k: r.at, t: r.what, s: r.state, bad: r.state === "broken" }))
    : m.kind === "route" ? m.stops.map((s, i) => { const n = m.spec.places[s.place], w = m.ws(s.place); return { k: String(i + 1), t: `${s.step} · ${s.what}`, s: n?.broken ? "broken" : w.ch ? `${w.ch} moved` : "quiet", bad: !!n?.broken }; })
    : [];
  if (!cells.length) return null;
  return (
    <div className="cm-strip cm-cardish" data-map-strip={m.kind}>
      {cells.map((c, i) => <span key={i} className="cm-cell"><b>{c.k}</b><span className="cm-t">{c.t}</span><span className={c.bad ? "cm-bad" : "cm-ago"}>{c.s}</span></span>)}
    </div>
  );
}

function Crumbs({ m, set }: { m: Model; set: (p: Partial<MapState>) => void }) {
  const chain = m.chainOf(m.st.at).reverse().filter((x) => x !== "root");
  return (
    <div className="cm-crumbs cm-cardish">
      <span className="cm-c" data-go="root" onClick={() => set({ at: "root", open: null })}>Cowork</span>
      {chain.map((id) => <span key={id} className="cm-cr"><span className="cm-csep">›</span><span className={`cm-c ${id === m.st.at && !m.st.open ? "here" : ""}`} data-go={id} onClick={() => set({ at: id, open: null })}>{m.N[id].name}</span></span>)}
      {m.st.open && m.st.open !== "~fold" ? <span className="cm-cr"><span className="cm-csep">›</span><span className="cm-c here">{m.N[m.st.open]?.name}</span></span> : null}
    </div>
  );
}

function Street({ m, id, folded, set, press, play }: { m: Model; id: string; folded: string[]; set: (p: Partial<MapState>) => void; press: MapPress; play: () => void }) {
  const close = <span className="cm-x" data-go="up" onClick={() => set({ open: null })}>✕</span>;
  if (id === "~fold") return (
    <div className="cm-float cm-street" data-street="~fold">{close}<h3>{folded.length} quiet</h3>
      <div className="cm-sub">folded at this layer: nothing moved here in {m.st.hours} h and nothing waits</div>
      {folded.slice(0, 30).map((k) => <div key={k} className="cm-row"><span className="cm-t">{m.N[k].name}</span><span className="cm-ago">{m.N[k].parts}</span></div>)}
    </div>);
  const n = m.N[id]; if (!n) return null;
  const w = m.ws(id), ch = w.list.slice(0, 3);
  const prs = n.prs.map((k) => m.prs.get(k)).filter(Boolean).slice(0, 4);
  const allCalls = n.calls.map((k) => m.calls.get(k)).filter(Boolean), calls = allCalls.slice(0, 3);
  const holder = n.owner ?? m.holderOf(id);   // one holder: the registry's owner, else whoever holds the place it sits in
  const pairs = m.spec.pairs.filter((c) => c.parts.some((x) => m.chainOf(x).includes(id))).slice(0, 2);
  return (
    <div className="cm-float cm-street" data-street={id}>
      {close}<h3>{n.name}</h3>
      <div className="cm-sub">{n.reg && n.reg !== n.name ? `the registry calls it ${n.reg} · ` : ""}{id} · {n.parts} part{n.parts > 1 ? "s" : ""} · {n.state || "a group"}{holder ? ` · held by ${personName(m, holder)}` : ""}</div>
      {n.about ? <div className="cm-about">{n.about}</div> : null}
      <div className="cm-lab">what moved, newest first · who, and on whose ask</div>
      {ch.length ? ch.map((c) => <div key={c.h} className="cm-row"><Face m={m} p={c.by} how={c.how} /><span className="cm-t" title={c.s}>{c.s}</span><span className="cm-ago">{ago(c.ago)}</span></div>)
        : <div className="cm-row cm-mute">nothing in {m.st.hours} h</div>}
      {ch.length ? <div className="cm-foot">whose ask: {personName(m, ch[0].by)}{ch[0].how === "agent" ? "'s agent" : ""}, read from the author until the event book carries an Asked-by line; before → after comes with it</div> : null}
      {prs.length ? <><div className="cm-lab">open work on it</div><div className="cm-chips">{prs.map((p) => <span key={p!.n} className="cm-chip"><Face m={m} p={p!.by} how="agent" size={16} />#{p!.n}{p!.draft ? " draft" : ""}{p!.idle >= 7 ? ` · ${p!.idle} d idle` : ""}</span>)}</div></> : null}
      {pairs.length ? <><div className="cm-lab">two people's open PRs on the same files</div>{pairs.map((c) => <div key={c.a + "-" + c.b} className="cm-row">{c.pair.split("+").map((p) => <Face key={p} m={m} p={p} how="agent" size={16} />)}<span className="cm-t">#{c.a} and #{c.b}: {c.files} file{c.files > 1 ? "s" : ""}, {c.first.split("/").pop()}</span></div>)}</> : null}
      {calls.length ? <><div className="cm-lab">calls that touch it</div>{calls.map((d) => <div key={d!.n} className="cm-row"><span className="cm-sticker cm-call">#{d!.n}</span><span className="cm-t">{d!.t}</span><Face m={m} p={d!.who} how="hand" size={18} /></div>)}
        {allCalls.length > 3 ? <div className="cm-row cm-mute">and {allCalls.length - 3} more in {m.spec.views.find((v) => v.kind === "calls")?.name ?? "the calls"}</div> : null}</> : null}
      <div className="cm-presses">
        <button className="cm-go" data-layer="page" disabled={!ch.length || !press.change} onClick={() => ch[0] && press.change?.(ch[0].h)}>Open the change</button>
        <button className="cm-go q" data-act="replays the window" onClick={play}>Replay this part</button>
        {holder && holder !== m.who && press.room ? <button className="cm-go q" data-go="room" title={`${personName(m, holder)}'s agent answers in the room`} onClick={press.room}>Open the room</button> : null}
      </div>
    </div>
  );
}

function Key({ m, other }: { m: Model; other: string }) {
  const k = m.kind, items: ReactNode[] = [];
  if ((k === "change" || k === "court") && m.on("people")) items.push(
    <span key="h"><Face m={m} p={other} how="hand" size={16} /> a person by hand</span>,
    <span key="a"><Face m={m} p={other} how="agent" size={16} /> their agent, on their ask</span>,
    <span key="al"><Face m={m} p={null} how="alone" size={16} /> an agent alone (kept a ping, took an issue, the night)</span>,
    <span key="y"><Face m={m} p={m.who} how="agent" size={16} /> you are pearl</span>);
  if (k === "change" && m.on("live")) items.push(<span key="l"><svg width="16" height="16"><circle cx="8" cy="8" r="6" fill="none" stroke="url(#cm-jelly)" strokeWidth="2" /></svg> moved in the last 3 h</span>);
  if (k === "day" || (k === "change" && m.on("health"))) items.push(<span key="b"><svg width="16" height="16"><path d="M 2 8 A 6 6 0 1 0 8 2 L 8 8 Z" style={{ fill: "var(--m-wrong)" }} /></svg> broken</span>);
  if (k === "calls" || k === "court") items.push(<span key="c"><span className="cm-sticker cm-call">call</span> a choice waiting, on whose it is</span>);
  if (k === "clashes") items.push(<span key="p">two ringed faces and a number: two people's open PRs on the same files; under the name, the night's clash lines too</span>);
  items.push(<span key="pin"><svg width="76" height="20"><rect x="1" y="1" width="74" height="18" rx="3" style={{ fill: "var(--m-ask)" }} /><text x="7" y="15" fontSize="12" fontWeight="700" style={{ fill: "var(--m-deep)" }}>1</text><text x="18" y="14" fontSize="11" fontWeight="600" fontFamily="ui-monospace,Menlo,monospace" style={{ fill: "var(--m-deep)" }}>WORDS</text></svg> your top three, a few words of the decision</span>);
  items.push(<span key="sz">size = how much is there (never moves) · shade = this view's weight · circles inside = the layer under</span>);
  return <div className="cm-key">{items}</div>;
}

