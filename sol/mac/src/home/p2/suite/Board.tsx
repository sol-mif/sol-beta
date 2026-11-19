// The board's inside (#692 suite step 2, suite.html: "free: your own arrangement"): things where he put them, kept;
// lines between the ones he related; its run notices what is connected and suggests a line (dashed), never moving a
// thing. Drawn inside Piece's own card; the stand-in's suite-board.mjs keeps it.
//   drag anything in   a sticky or a block (text/sol-sticky), or words (text/plain), dropped where it should sit; or the
//                      field under the board: home.board.add
//   drag a thing       moves it (home.board.place)
//   drag its dot       onto another thing: a line between them, by your hand (home.board.relate)
//   its suggestions    keep one (home.board.keep keep) or wave it off (keep false)
//   × on a thing       takes it off (home.board.remove)
import { useLayoutEffect, useRef, useState, type DragEvent, type PointerEvent as RPointerEvent } from "react";
import type { Metas } from "../../meta";
import { say } from "./lift";
import type { ShapeProps } from "./shapes";
import "./board.css";

export const meta = {
  Board: {
    job: "your own arrangement, kept where you put things; its run suggests what is connected and never moves a thing",
    flow: "know",
    states: ["its run laying it out", "your things and your lines", "a line it suggests, dashed", "a thing being moved", "a line being drawn", "something dragged over it"],
    keys: [
      { press: "drag a sticky or words onto it", does: "puts it where you dropped it (home.board.add)" },
      { press: "drag a thing", does: "moves it (home.board.place)" },
      { press: "drag a thing's dot onto another", does: "draws a line between them (home.board.relate)" },
      { press: "keep · no on a suggestion", does: "keeps its line, or waves it off (home.board.keep)" },
    ],
    listens: ["home.state › blocks (its body: items, lines)"],
  },
} satisfies Metas;

type Item = { id: string; text: string; x: number; y: number; from: "it" | "you" | "sticky"; sticky?: string };
type LineB = { id: string; a: string; b: string; by: "you" | "it"; why?: string; state: "kept" | "suggested" };
type BoardBody = { items: Item[]; lines: LineB[]; by?: string };
type Box = { x: number; y: number; w: number; h: number };

const clamp = (v: number) => Math.max(0, Math.min(0.86, v));

export function Board({ b, r, h }: ShapeProps) {
  const body = b.body as BoardBody | null;
  const canvas = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(0);
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const [moving, setMoving] = useState<{ id: string; x: number; y: number } | null>(null);
  const [drawing, setDrawing] = useState<{ from: string; x: number; y: number } | null>(null);
  const [over, setOver] = useState(false);
  const [add, setAdd] = useState("");
  const grab = useRef<{ id: string; dx: number; dy: number; sx: number; sy: number } | null>(null);
  const items = body?.items ?? [], lines = body?.lines ?? [];
  const key = JSON.stringify(items.map((t) => [t.id, t.x, t.y, t.text])) + (moving ? `${moving.x},${moving.y}` : "");

  // where each thing sits, measured: the lines run between their middles
  useLayoutEffect(() => {
    const c = canvas.current; if (!c) return;
    const out: Record<string, Box> = {};
    c.querySelectorAll<HTMLElement>("[data-board-item]").forEach((el) => { out[el.dataset.boardItem!] = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }; });
    setBoxes(out);
  }, [key, seen]);
  // measured again when the board changes size (the canvas is drawn only once the run filled it, so it is watched here)
  const drawn = !!body?.items;
  useLayoutEffect(() => {
    const c = canvas.current; if (!c) return;
    const ro = new ResizeObserver(() => setSeen((n) => n + 1));
    ro.observe(c);
    return () => ro.disconnect();
  }, [drawn]);

  if (!body?.items) return <p className="pc-step">{r ? `its run: ${r.run}` : "its run is laying it out"}…</p>;
  const send = <T,>(o: object) => h.ask<T & { error?: string }>({ id: b.id, ...o });
  /** a point on the board as its fractions, from the pointer */
  const at = (cx: number, cy: number) => { const q = canvas.current!.getBoundingClientRect(); return { x: (cx - q.left) / q.width, y: (cy - q.top) / q.height }; };
  const mid = (id: string) => { const x = boxes[id]; return x ? { x: x.x + x.w / 2, y: x.y + x.h / 2 } : null; };

  // ---- drag a thing to move it ----
  const down = (e: RPointerEvent<HTMLDivElement>, t: Item) => {
    if (e.button !== 0 || (e.target as Element).closest("button")) return;
    e.stopPropagation(); e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e.clientX, e.clientY);
    grab.current = { id: t.id, dx: p.x - t.x, dy: p.y - t.y, sx: e.clientX, sy: e.clientY };
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const g = grab.current; if (!g) return;
    if (!moving && Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) < 4) return;
    const p = at(e.clientX, e.clientY);
    setMoving({ id: g.id, x: clamp(p.x - g.dx), y: clamp(p.y - g.dy) });
  };
  const up = () => {
    const g = grab.current; grab.current = null;
    if (g && moving) { void send({ type: "home.board.place", item: g.id, x: moving.x, y: moving.y }).then(() => setMoving(null)); say("moved: it stays where you put it"); }
    else setMoving(null);
  };

  // ---- drag a thing's dot onto another: a line ----
  const dotDown = (e: RPointerEvent<HTMLButtonElement>, t: Item) => {
    e.stopPropagation(); e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const q = canvas.current!.getBoundingClientRect();
    setDrawing({ from: t.id, x: e.clientX - q.left, y: e.clientY - q.top });
  };
  const dotMove = (e: RPointerEvent<HTMLButtonElement>) => {
    if (!drawing) return;
    const q = canvas.current!.getBoundingClientRect();
    setDrawing({ ...drawing, x: e.clientX - q.left, y: e.clientY - q.top });
  };
  const dotUp = (e: RPointerEvent<HTMLButtonElement>) => {
    const d = drawing; setDrawing(null); if (!d) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-board-item]");
    const to = el?.dataset.boardItem;
    if (!to || to === d.from) return;
    void send({ type: "home.board.relate", a: d.from, b: to }).then((x) => say(x?.error ?? "related: a line by your hand"));
  };

  // ---- drag anything in ----
  const takes = (e: DragEvent) => e.dataTransfer.types.includes("text/sol-sticky") || e.dataTransfer.types.includes("text/plain");
  const dragOver = (e: DragEvent<HTMLDivElement>) => { if (!takes(e)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; setOver(true); };
  const drop = (e: DragEvent<HTMLDivElement>) => {
    setOver(false);
    if (!takes(e)) return;
    e.preventDefault(); e.stopPropagation();
    const sid = e.dataTransfer.getData("text/sol-sticky"), words = e.dataTransfer.getData("text/plain");
    if (sid === b.id) return;
    const blk = sid ? h.st?.blocks?.find((x) => x.id === sid) : undefined;
    const p = at(e.clientX, e.clientY);
    const text = blk?.words ?? words;
    if (!text && !sid) return;
    void send({ type: "home.board.add", ...(blk?.sticky ? { sticky: blk.sticky } : {}), text, x: clamp(p.x - 0.1), y: clamp(p.y - 0.05) }).then((x) => say(x?.error ?? "on the board, where you dropped it"));
  };
  const addOne = () => {
    const t = add.trim(); if (!t) return; setAdd("");
    const n = items.length;
    void send({ type: "home.board.add", text: t, x: 0.3 + ((n * 0.17) % 0.5), y: 0.3 + ((n * 0.23) % 0.5) }).then((x) => say(x?.error ?? "on the board: move it where it goes"));
  };

  const suggested = lines.filter((l) => l.state === "suggested");
  const name = (id: string) => items.find((t) => t.id === id)?.text ?? "";
  const short = (s: string) => (s.length > 28 ? `${s.slice(0, 27)}…` : s);
  const from = drawing ? mid(drawing.from) : null;
  return (
    <div className="brd" data-pc-inside="board" onPointerDown={(e) => e.stopPropagation()}>
      <div ref={canvas} className={`brd-canvas${over ? " over" : ""}`} data-board-canvas onDragOver={dragOver} onDragLeave={() => setOver(false)} onDrop={drop}>
        <svg className="brd-lines" aria-hidden>
          {lines.map((l) => {
            const a = mid(l.a), c = mid(l.b); if (!a || !c) return null;
            return <line key={l.id} x1={a.x} y1={a.y} x2={c.x} y2={c.y} className={`brd-ln ${l.state} by-${l.by}`} data-board-line={l.id} data-state={l.state} />;
          })}
          {drawing && from && <line x1={from.x} y1={from.y} x2={drawing.x} y2={drawing.y} className="brd-ln drawing" />}
        </svg>
        {items.map((t) => {
          const p = moving?.id === t.id ? moving : t;
          return (
            <div key={t.id} className={`brd-item from-${t.from}${moving?.id === t.id ? " moving" : ""}`} data-board-item={t.id} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              onPointerDown={(e) => down(e, t)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onMouseDown={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()}>
              <span className="brd-text">{t.text}</span>
              <button type="button" className="brd-x" aria-label="take it off the board" onClick={(e) => { e.stopPropagation(); void send({ type: "home.board.remove", item: t.id }); }}>×</button>
              <button type="button" className="brd-dot" data-board-dot aria-label="drag onto another thing to relate them" onPointerDown={(e) => dotDown(e, t)} onPointerMove={dotMove} onPointerUp={dotUp} onPointerCancel={() => setDrawing(null)} />
            </div>
          );
        })}
      </div>
      {suggested.length > 0 && (
        <ul className="brd-sug" aria-label="what it noticed">
          {suggested.map((l) => (
            <li key={l.id} data-board-suggest={l.id}>
              <span className="brd-sug-what" title={`${name(l.a)} — ${name(l.b)}: ${l.why ?? ""}`}>{short(name(l.a))} — {short(name(l.b))}{l.why ? `: ${l.why}` : ""}</span>
              <button type="button" className="pc-act" data-board-keep onClick={(e) => { e.stopPropagation(); void send({ type: "home.board.keep", line: l.id, keep: true }); say("kept: the line is yours now"); }}>keep</button>
              <button type="button" className="pc-act quiet" data-board-wave onClick={(e) => { e.stopPropagation(); void send({ type: "home.board.keep", line: l.id, keep: false }); say("waved off"); }}>no</button>
            </li>
          ))}
        </ul>
      )}
      <input className="brd-add" value={add} placeholder="put something on it, or drag it in" aria-label="put something on the board" data-board-add
        onChange={(e) => setAdd(e.target.value)} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") addOne(); }} />
    </div>
  );
}
