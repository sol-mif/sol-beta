// World as a Home block (#692 suite step 2, suite.html "world · every stream, as one map"): pass 2's World drawn inside
// the frame. A small map: the jelly a pearl at its middle, each stream a line to it from its node (his top folders,
// calendar, mail, Build in; the phone out), as thick as its weight, dashed when off. Under it a row per
// stream: its name, its weight in the frame's move pills (off · light · normal · heavy), how much this week's jobs read it (kit
// Meter, from its run's body: shape-world.mjs) and what they read. The weights are pass 2's own (home.state › world),
// so a move here is World's move: home.world.weight. Moves: press a node on the map to turn its stream off, and again to
// turn it back on at the weight it had; pick a weight to tune what it carries (the say line says what changes, World's
// own words); "again" runs it again.
import { useRef, useState } from "react";
import { Meter, Pearl, useSize } from "../../../kit";
import type { Metas } from "../../meta";
import type { Stream, WorldNode } from "../pass2";
import { sayWeight } from "../World";
import { say } from "./lift";
import type { ShapeProps } from "./shapes";
import "./shape-world.css";

export const meta = {
  WorldShape: {
    job: "world inside a Home block: every stream as one map, its weight, and how much this week's jobs read it",
    flow: "mine",
    states: ["its run counting", "the map and the streams", "a stream off (dashed)", "narrow: the map above, the rows under"],
    keys: [
      { press: "press a node on the map", does: "turns its stream off, and on again at its weight (home.world.weight)" },
      { press: "pick a weight on a stream's row", does: "tunes what it carries: off · light · normal · heavy (home.world.weight)" },
      { press: "again", does: "its run counts the week again (home.block.run)" },
    ],
    listens: ["home.state › world, blocks (its body)"],
  },
} satisfies Metas;

export type WorldUse = { node: string; name: string; runs: number; read: string };
export type WorldBody = { week: string; uses: WorldUse[]; line: string; by?: string };
const WORDS = ["off", "light", "normal", "heavy"] as const;
/** a stream's node: the source it flows from, or the outlet it flows to */
const nodeOf = (s: Stream) => (s.from === "jelly" ? s.to : s.from);
/** where each node sits on the map: an ellipse around the middle, sources on top and sides, outlets at the foot */
export function mapAt(n: number, w: number, h: number) {
  const cx = w / 2, cy = h / 2, rx = Math.max(0, w / 2 - 56), ry = Math.max(0, h / 2 - 16);
  return Array.from({ length: n }, (_, i) => { const a = Math.PI + (Math.PI * 2 * (i + 0.5)) / n; return { x: Math.round(cx + Math.cos(a) * rx), y: Math.round(cy + Math.sin(a) * ry) }; });
}

export function WorldShape({ b, r, st, h }: ShapeProps) {
  const body = b.body as WorldBody | null;
  const was = useRef(new Map<string, number>());
  const [busy, setBusy] = useState<string | null>(null);
  const w = st.world;
  if (!w) return <p className="pc-step">world is not read yet…</p>;
  if (!body?.uses) return <p className="pc-step" data-ww-running>its run: {r?.run ?? "counting the week"}…</p>;

  const nodeById = new Map<string, WorldNode>(w.nodes.map((n) => [n.id, n]));
  const streams = w.streams;
  const max = Math.max(1, ...body.uses.map((u) => u.runs));
  const weigh = async (s: Stream, weight: number) => {
    if (weight === s.weight) return;
    if (weight === 0) was.current.set(s.id, s.weight);
    setBusy(s.id);
    await h.ask({ type: "home.world.weight", stream: s.id, weight });
    setBusy(null);
    say(sayWeight(nodeById.get(nodeOf(s)), weight, st));
  };
  const toggle = (s: Stream) => void weigh(s, s.weight === 0 ? (was.current.get(s.id) ?? 2) : 0);

  return (
    <div className="ww" data-pc-inside="world" onPointerDown={(e) => { if ((e.target as Element).closest(".ww-map, .ww-row")) e.stopPropagation(); }}>
      <div className="ww-head">
        <span className="ww-week">{body.week}</span>
        <span className="ww-what" title={body.line}>{body.line}{body.by ? ` · by ${body.by}` : ""}</span>
        <button type="button" className="pc-act quiet" data-ww-again disabled={b.state === "running"} onClick={(e) => { e.stopPropagation(); h.send({ type: "home.block.run", id: b.id }); say("its run counts the week again"); }}>{b.state === "running" ? "counting…" : "again"}</button>
      </div>
      <WorldMap streams={streams} nodeById={nodeById} busy={busy} onToggle={toggle} />
      <div className="ww-rows">
        {streams.map((s) => {
          const u = body.uses.find((x) => x.node === nodeOf(s)), n = nodeById.get(nodeOf(s));
          return (
            <div key={s.id} className={`ww-row${s.weight === 0 ? " off" : ""}`} data-ww-row={nodeOf(s)} data-weight={s.weight}>
              <span className="ww-name">{n?.name ?? nodeOf(s)}<small>{s.from === "jelly" ? "out" : "in"}</small></span>
              <span className="ww-weight" data-ww-weight>
                {WORDS.map((word, i) => (
                  <button key={word} type="button" className={`pc-act${i === s.weight ? " lit" : " quiet"}`} aria-pressed={i === s.weight} data-ww-w={i}
                    onClick={(e) => { e.stopPropagation(); void weigh(s, i); }}>{word}</button>
                ))}
              </span>
              <span className="ww-use" title={`${u?.runs ?? 0} jobs read it this week`}>
                <Meter w={64} h={6} value={(u?.runs ?? 0) / max} label={`${u?.runs ?? 0} jobs this week`} />
                <b>{u?.runs ?? 0}</b>
              </span>
              <span className="ww-read" title={u?.read}>{s.weight === 0 ? "off: nothing read" : u?.read ?? ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** the map: the pearl in the middle, a line per stream to it as thick as its weight, its node pressed to turn it off or on */
function WorldMap({ streams, nodeById, busy, onToggle }: { streams: Stream[]; nodeById: Map<string, WorldNode>; busy: string | null; onToggle: (s: Stream) => void }) {
  const map = useRef<HTMLDivElement>(null);
  const [W, H] = useSize(map);
  const at = mapAt(streams.length, W, H);
  const pearl = Math.max(0, Math.min(W, H) / 5);
  return (
    <div className="ww-map" ref={map} data-ww-map>
      {W > 0 && H > 0 && (
        <svg className="ww-lines" width={W} height={H} aria-hidden>
          {streams.map((s, i) => <line key={s.id} x1={at[i].x} y1={at[i].y} x2={W / 2} y2={H / 2} className={`ww-ln w${s.weight}`} data-ww-line={s.id} />)}
        </svg>
      )}
      {pearl > 0 && <span className="ww-jelly" style={{ width: pearl, height: pearl }} aria-label="Sol"><Pearl w={pearl} h={pearl} r={pearl / 2} /></span>}
      {W > 0 && streams.map((s, i) => (
        <button key={s.id} type="button" className={`ww-node${s.weight === 0 ? " off" : ""}`} data-ww-node={nodeOf(s)} disabled={busy === s.id}
          style={{ left: at[i].x, top: at[i].y }} title={s.weight === 0 ? "off: press to turn it on" : `${WORDS[s.weight]}: press to turn it off`}
          onClick={(e) => { e.stopPropagation(); onToggle(s); }}>{nodeById.get(nodeOf(s))?.name ?? nodeOf(s)}</button>
      ))}
    </div>
  );
}
