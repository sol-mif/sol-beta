// The stickies column (#692, pieces/sticky-life.mjs, moves.mjs mo-doubt and Peel), slice B of the pass 2 build: what
// came out of the dump, newest first, each on the pearl with its two lines (where it went, what it is doing) in the
// states of its life: filed (its first second), running with its step, made with a file mark, needs you in yellow with
// its answers as chips, cannot start in red with the one thing that helps, done in green and then gone to its folder's
// log after 8 seconds, paused or later dimmed, handed to you a plain note. The ring (kit Ring) fills as the run moves; a
// small meter (kit Meter) shows how far through its five stops it is. Click opens it in place: slice A's RunLog, what
// it made (peel a corner for its back, kit BackCard), the doubts as waves (kit Ink: tap one, pick an alternative,
// home.move doubt), and pause · later · drop · hand to me. Drag it onto a folder in the side to refile it.
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { BackCard, FileMark, Ink, Meter, Pearl, Ring, useSize } from "../../kit";
import { CURVE } from "../../kit/tokens";
import type { Metas } from "../meta";
import { Body } from "../../Body";
import { usePick, type Doubt, type Home2Api, type HomeState2, type Made, type Place, type Sticky } from "./pass2";
import { Piece, Said, type Frame } from "./suite/Piece";
import { say } from "./suite/lift";
import { RunLog } from "./RunLog";
import { pullStart, pullEnd } from "./Week"; // a sticky drags onto the week too (Pull, slice D)
import "./dump.css";

export const meta = {
  Stickies: {
    job: "what came out of the dump, newest first: each sticky's where and its step, live, in the states of its life",
    flow: "know",
    states: ["none yet (absent)", "filed: the first second", "running: the ring filling, its step", "made: a file mark inside", "needs you: yellow, its answers as chips", "cannot start: red, the one thing that helps", "done: green, then gone to its folder's log", "paused or later: dimmed", "handed to you: a plain note", "one open in place", "dragged over a folder"],
    keys: [
      { press: "click a sticky", does: "opens it in place: its steps, what it made, its doubts", opens: "StickyCard" },
      { press: "click its first line", does: "opens its folder", opens: "FolderView" },
      { press: "click an answer chip", does: "answers it in place (home.sticky.answer)", goal: "answer" },
      { press: "right-click", does: "opens it with pause · later · drop · hand to me" },
      { press: "drag onto a folder in the side", does: "refiles it; the run starts again there; one filing line is kept (home.sticky.move)" },
      { press: "↑ ↓, Enter, Esc", does: "walk the stickies, open one, close it", faster: true },
    ],
    listens: ["home.state › stickies, folders", "home.step", "home.made"],
  },
  StickyCard: {
    job: "one sticky on the pearl: where it went, what it is doing, what it made, its question; open, its steps and its hands",
    flow: "know",
    states: ["filed", "queued for its day", "running", "made", "needs you", "cannot start", "done, fading", "paused", "later", "handed to you", "open"],
    keys: [
      { press: "pause · resume · later · drop · hand to me", does: "home.sticky.pause / resume / later / drop / hand" },
      { press: "click a made line", does: "opens the folder it lives in", opens: "FolderView" },
    ],
    listens: ["home.step", "home.made"],
  },
  MadeThing: {
    job: "a thing a run made, inside its sticky: its file mark and name; peel the corner for how it was made; its doubts as waves",
    flow: "show",
    states: ["face up", "peeled: the back card", "a wave tapped: why and the alternatives", "an alternative picked"],
    keys: [
      { press: "click the corner, or ⌥-click", does: "Peel: turns it over to its back (made from, under, by, took, doubts, undo)" },
      { press: "tap a wave", does: "Doubt: what it was unsure of and the alternatives" },
      { press: "click an alternative", does: "home.move doubt with the pick" },
    ],
    listens: ["home.made"],
  },
} satisfies Metas;

/** how a sticky reads in one look: its tone (the ring), where it went, what it is doing, how full its ring is */
export type Mark = { tone: "fresh" | "run" | "made" | "you" | "fail" | "done" | "dim" | "note"; where: string; step: string; fill?: number };
const pad = (n: number) => String(n).padStart(2, "0");
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const at = (iso?: string) => { if (!iso) return ""; const d = new Date(iso); return `${DAY[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
type StickyB = Sticky & { start_at?: string; day?: string };

export function markOf(s: StickyB, st: HomeState2): Mark {
  const f = st.folders?.find((x) => x.id === s.folder);
  const where = `${f ? f.crumb.join(" › ") : "…"}${s.when ? ` · ${s.when}` : ""}`;
  const last = s.steps[s.steps.length - 1];
  const fill = last?.of ? Math.min(1, (last.n ?? 0) / last.of) : s.steps.length ? 0.15 : 0.05;
  switch (s.state) {
    case "filed": return { tone: "fresh", where, step: "starting" };
    case "queued": return { tone: "dim", where, step: s.start_at ? `starts ${at(s.start_at)}` : "scheduled" };
    case "running": return { tone: s.made.length ? "made" : "run", where, step: last ? `${last.line}${last.n && last.of ? ` · ${last.n} of ${last.of}` : ""}` : "starting", fill };
    case "asks": return { tone: "you", where, step: "needs you" };
    case "failed": return { tone: "fail", where, step: s.why ?? last?.line ?? "can't start" };
    case "done": return { tone: "done", where, step: `done${s.made[0] ? ` · ${s.made[0].title}` : last && last.line !== "done" ? ` · ${last.line}` : ""}`, fill: 1 };
    case "paused": return { tone: "dim", where, step: "paused", fill };
    case "later": return { tone: "dim", where, step: s.start_at ? `later · back ${at(s.start_at)}` : "later", fill };
    case "note": return { tone: "note", where, step: `yours now${s.made.length ? ` · ${s.made.map((m) => m.title).join(", ")} kept` : ""}` };
    default: return { tone: "dim", where, step: s.state };
  }
}

/** words with the spans Sol was unsure of drawn as waves (kit Ink); tapping one calls `onTap` with its doubt */
export function inked(text: string, doubts: Doubt[], onTap?: (d: Doubt) => void): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text, k = 0;
  for (;;) {
    let best: { i: number; d: Doubt } | null = null;
    for (const d of doubts) { const i = d.span ? rest.indexOf(d.span) : -1; if (i >= 0 && (!best || i < best.i)) best = { i, d }; }
    if (!best) { if (rest) out.push(rest); return out; }
    if (best.i) out.push(rest.slice(0, best.i));
    const d = best.d;
    out.push(<Ink key={k++} k="wave" onTap={onTap && (() => onTap(d))}>{d.span}</Ink>);
    rest = rest.slice(best.i + d.span.length);
  }
}

/** the five stops of a sticky's life, as parts of a meter: written, filed, running, made, done */
const stops = (s: Sticky) => [1, s.state !== "asks" || s.steps.length ? 1 : 0.5, s.steps.length ? 1 : 0, s.made.length ? 1 : 0, s.state === "done" ? 1 : 0].map((x) => x * 0.2);

const STAY = 8000;

export function Stickies({ h, setPlace }: { h: Home2Api; setPlace: (p: Place) => void }) {
  const st = h.st;
  const [open, setOpen] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef(new Map<string, number>());
  const run = usePick("run");
  const list = useMemo(() => (st?.stickies ?? []).filter((s) => s.state !== "dropped"), [st?.stickies]);

  // a done sticky stays 8 seconds after its line turns green, then leaves for its folder's log
  for (const s of list) if (s.state === "done" && !seen.current.has(s.id)) { const t = Date.parse(s.steps[s.steps.length - 1]?.at ?? ""); seen.current.set(s.id, Number.isFinite(t) ? Math.min(t, Date.now()) : Date.now()); }
  const fading = list.some((s) => s.state === "done" && now - (seen.current.get(s.id) ?? now) < STAY + 1000);
  useEffect(() => { if (!fading) return; const t = window.setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [fading]);
  useEffect(() => { setNow(Date.now()); }, [st?.stickies]);
  // one the hand has shaped stays (#692 suite): folded to a line, a tool open, its own shelf, or lifted (Home keeps its
  // chip pointing at the stage or Build); only a plain sticky leaves for its folder's log when done
  const lifted = new Set((st?.blocks ?? []).filter((b) => b.sticky && (b.lifted || b.form !== "sticky" || b.tool || b.own.length)).map((b) => b.id));
  const shown = list.filter((s) => s.state !== "done" || s.id === open || lifted.has(s.id) || now - (seen.current.get(s.id) ?? now) < STAY);

  // a sticky (or a dump line) dropped on a folder in the side refiles it; the side marks the folder it is over
  useEffect(() => {
    let over: Element | null = null;
    const target = (ev: DragEvent) => (ev.dataTransfer?.types.includes("text/sol-sticky") ? (ev.target as Element | null)?.closest?.("[data-folder]") ?? null : null);
    const mark = (el: Element | null) => { if (over === el) return; over?.removeAttribute("data-sticky-over"); over = el; over?.setAttribute("data-sticky-over", ""); };
    const dragover = (ev: DragEvent) => { const f = target(ev); if (f) { ev.preventDefault(); if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move"; } mark(f); };
    const drop = (ev: DragEvent) => {
      const f = target(ev), sid = ev.dataTransfer?.getData("text/sol-sticky");
      mark(null);
      if (!f || !sid) return;
      ev.preventDefault();
      // a refile through the grammar (#692 suite): the same move as home.sticky.move, and the line says what swaps
      void h.ask<{ swap?: string; error?: string }>({ type: "home.block.patch", id: sid, folder: f.getAttribute("data-folder") }).then((r) => { if (r?.swap) say(r.swap); else if (r?.error) say(r.error); });
    };
    const end = () => mark(null);
    document.addEventListener("dragover", dragover); document.addEventListener("drop", drop); document.addEventListener("dragend", end);
    return () => { document.removeEventListener("dragover", dragover); document.removeEventListener("drop", drop); document.removeEventListener("dragend", end); };
  }, [h.ask]); // eslint-disable-line react-hooks/exhaustive-deps

  const cards = useRef(new Map<string, HTMLDivElement>());
  const shownRef = useRef(shown); shownRef.current = shown;
  const openRef = useRef(open); openRef.current = open;
  // the suite's blocks that are not stickies (a tracker, a deck, a made recipe's), beside them (#692 suite step 1)
  const others = (st?.blocks ?? []).filter((b) => !b.sticky && b.state !== "dropped");
  const blockOf = new Map((st?.blocks ?? []).map((b) => [b.id, b]));
  if (!st || (!shown.length && !others.length)) return null;
  // a card keeps the handler it was first drawn with (memo): the walk reads the list and the open one from refs
  const walk = (ev: KeyboardEvent<HTMLDivElement>, s: Sticky) => {
    if (ev.target !== ev.currentTarget) return;
    const list = shownRef.current, i = list.findIndex((x) => x.id === s.id), o = openRef.current;
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); const n = list[Math.max(0, Math.min(list.length - 1, i + (ev.key === "ArrowDown" ? 1 : -1)))]; if (n) cards.current.get(n.id)?.focus(); }
    else if (ev.key === "Enter") { ev.preventDefault(); setOpen(o === s.id ? null : s.id); }
    else if (ev.key === "Escape" && o) { ev.preventDefault(); ev.stopPropagation(); setOpen(null); }
  };

  // the jelly while it works (pass2.ts PICKS.run): a bud on each running or asking sticky, at most BUDS (one canvas each)
  const budded = new Set(run === "bud" ? shown.filter((s) => s.state === "running" || s.state === "asks").slice(0, BUDS).map((s) => s.id) : []);

  return (
    <section className="p2-tile p2-stickies" data-p2="stickies" aria-label="what came out">
      <div className="du-k"><span>what came out</span><span className="du-n">{shown.filter((s) => s.state === "asks").length ? `${shown.filter((s) => s.state === "asks").length} need you` : ""}</span></div>
      <Said />
      <div className="sk-list">
        {others.map((b) => <Piece key={b.id} b={b} st={st} h={h} setPlace={setPlace} />)}
        {shown.map((s) => {
          const one = (frame?: Frame) => (
            <StickyCard key={s.id} s={s} st={st} h={h} bud={budded.has(s.id)} open={open === s.id} fading={s.state === "done" && !lifted.has(s.id) && now - (seen.current.get(s.id) ?? now) > STAY - 2500}
              setOpen={(v) => setOpen(v ? s.id : null)} setPlace={setPlace} frame={frame}
              refEl={(el) => { if (el) cards.current.set(s.id, el); else cards.current.delete(s.id); }} onKeyDown={(ev) => walk(ev, s)} />
          );
          const b = blockOf.get(s.id);
          return b ? <Piece key={s.id} b={b} s={s} st={st} h={h} setPlace={setPlace} card={one} /> : one();
        })}
      </div>
    </section>
  );
}

/** a card draws again only when its own sticky, its folder's name or its open / fading changes: every home.state push
 *  would otherwise draw every pearl again */
const StickyCard = memo(StickyCardOf, (a, b) => a.open === b.open && !a.frame === !b.frame && a.frame?.form === b.frame?.form && a.frame?.below === b.frame?.below && a.fading === b.fading && a.bud === b.bud && JSON.stringify(a.s) === JSON.stringify(b.s)
  && a.st.folders?.find((f) => f.id === a.s.folder)?.crumb.join() === b.st.folders?.find((f) => f.id === b.s.folder)?.crumb.join()
  && JSON.stringify(a.s.made.map((m) => m.folder)) === JSON.stringify(b.s.made.map((m) => m.folder)));

/** the most buds at once: each is a canvas of its own (jelly.md wants one context for the board; until then, few) */
const BUDS = 4;

function StickyCardOf({ s, st, h, bud, open, fading, setOpen, setPlace, refEl, onKeyDown, frame }: {
  s: StickyB; st: HomeState2; h: Home2Api; bud?: boolean; open: boolean; fading: boolean; setOpen: (v: boolean) => void; setPlace: (p: Place) => void;
  /** the suite's frame around it (suite/Piece.tsx): its words editable, its ring pressed for done, its tool and shelf below */
  frame?: Frame;
  refEl: (el: HTMLDivElement | null) => void; onKeyDown: (ev: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const box = useRef<HTMLDivElement | null>(null), [w, hh] = useSize(box);
  const [drag, setDrag] = useState(false);
  const m = markOf(s, st);
  const second = s.state === "asks" && s.ask ? s.ask.q : m.step;
  const act = (type: string, o: object = {}) => h.send({ type, sticky: s.id, ...o });
  return (
    <div ref={(el) => { box.current = el; refEl(el); }} className={`sk-card t-${m.tone}${open ? " open" : ""}${fading ? " fading" : ""}${drag ? " drag" : ""}`}
      data-sticky={s.id} data-state={s.state} data-part={`sticky › ${s.text.slice(0, 40)}`} tabIndex={0} draggable
      onDragStart={(ev) => { ev.dataTransfer.setData("text/sol-sticky", s.id); pullStart(ev, s.id, s.text); ev.dataTransfer.effectAllowed = "move"; setDrag(true); }} onDragEnd={() => { pullEnd(); setDrag(false); }}
      onClick={(ev) => { if ((ev.target as Element).closest("button, [data-ink], a")) return; setOpen(!open); }}
      onContextMenu={(ev) => { ev.preventDefault(); setOpen(true); }} onKeyDown={onKeyDown}>
      <span className="sk-pearl" aria-hidden>{w > 0 && hh > 0 && <Pearl w={w} h={hh} r={CURVE.radius.row} />}</span>
      <div className="sk-head">
        {m.tone !== "note" && <span className={`sk-ring ${m.tone}`} aria-label={s.state} role={frame ? "button" : undefined} data-pc-ring={frame ? s.state : undefined}
          title={frame ? (s.state === "done" ? "press to run again" : "press for done") : undefined} onClick={frame ? (ev) => { ev.stopPropagation(); frame.onRing(); } : undefined}>{(m.tone === "run" || m.tone === "made" || (m.tone === "dim" && (m.fill ?? 0) > 0.1)) && <Ring value={m.fill ?? 0.1} size={16} flat />}</span>}
        <span className="sk-words">{frame ? frame.words : s.text}</span>
        <Meter w={30} h={4} parts={stops(s)} label="how far it is through its five stops" />
        {bud && <span className="sk-bud" data-bud aria-hidden><Body size={16} state="settled" /></span>}
      </div>
      <div className="sk-lines">
        <button className="sk-where" data-st-where onClick={() => setPlace({ at: "folder", id: s.folder })} title={s.filing.why}>{m.where}</button>
        <span className="sk-step" data-st-step>{second}</span>
      </div>
      {s.made.map((x) => <MadeThing key={x.id} m={x} st={st} h={h} open={open} setPlace={setPlace} />)}
      {s.state === "asks" && s.ask && (
        <div className="sk-opts">{s.ask.options.map((o, i) => <button key={o} className={`du-chip${i === 0 ? " first" : ""}`} data-st-answer onClick={() => act("home.sticky.answer", { option: o })}>{o}</button>)}</div>
      )}
      {frame?.below}
      {open && (
        <div className="sk-open" data-st-open>
          <RunLog steps={s.steps} last={8} />
          {!s.steps.length && <span className="sk-quiet">no steps yet{s.state === "queued" ? `: ${m.step}` : ""}</span>}
          <div className="sk-hands">
            {["running", "filed", "queued", "asks"].includes(s.state) && <button className="du-chip" onClick={() => act("home.sticky.pause")}>pause</button>}
            {["paused", "later", "failed"].includes(s.state) && <button className="du-chip" onClick={() => act("home.sticky.resume")}>{s.state === "failed" ? "try again" : "resume"}</button>}
            {!["done", "note", "later"].includes(s.state) && <button className="du-chip" onClick={() => act("home.sticky.later")}>later</button>}
            {s.state !== "done" && <button className="du-chip" onClick={() => { act("home.sticky.drop"); setOpen(false); }}>drop</button>}
            {!["done", "note"].includes(s.state) && <button className="du-chip" data-st-hand onClick={() => act("home.sticky.hand")}>hand to me</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function MadeThing({ m, st, h, open, setPlace }: { m: Made; st: HomeState2; h: Home2Api; open: boolean; setPlace: (p: Place) => void }) {
  const [peeled, setPeeled] = useState(false);
  const [doubt, setDoubt] = useState<Doubt | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const ext = (m.path.match(/\.([a-z0-9]+)$/i)?.[1] ?? "md").toLowerCase();
  const b = m.back, f = st.folders?.find((x) => x.id === m.folder);
  const pick = (d: Doubt, alt: string) => { h.send({ type: "home.move", move: "doubt", folder: m.folder, target: m.id, input: { span: d.span, why: d.why, pick: alt } }); setPicked((p) => ({ ...p, [d.span]: alt })); setDoubt(null); };
  return (
    <div className={`sk-made${peeled ? " peeled" : ""}`} data-made={m.id}>
      <div className="sk-made-face" onClick={(ev) => { if (ev.altKey && b) { ev.stopPropagation(); setPeeled(!peeled); } }}>
        <FileMark ext={ext} h={16} />
        <button className="sk-made-name" onClick={(ev) => { if (ev.altKey) return; setPlace({ at: "folder", id: m.folder }); }}>{m.title}</button>
        <span className="sk-open-word">open</span>
        {b && <button className="sk-corner" data-peel aria-label="peel: how it was made" title="peel: how it was made" onClick={() => setPeeled(!peeled)} />}
      </div>
      {open && !!b?.doubts.length && !peeled && (
        <div className="sk-doubts" data-st-doubts>
          {b.doubts.map((d) => <div key={d.span} className="sk-doubt">{picked[d.span] ? <><s>{d.span}</s> → <Ink k="set">{picked[d.span]}</Ink></> : inked(d.span, [d], setDoubt)}</div>)}
          {doubt && (
            <div className="du-ask" data-st-doubt>
              <span>unsure: {doubt.why}</span>
              <button className="du-chip first" onClick={() => setDoubt(null)}>keep</button>
              {doubt.alts.map((a) => <button key={a} className="du-chip" onClick={() => pick(doubt, a)}>{a}</button>)}
            </div>
          )}
        </div>
      )}
      {peeled && b && (
        <div className="sk-back" data-st-back>
          <BackCard b={{ title: m.title, from: b.made_from, under: `${f ? f.crumb.join(" › ") : m.folder} · ${b.under.dial}`, agent: `${b.agent === "codex" ? "Codex" : "Claude"} · ${b.model}`, took: b.took_ms < 60_000 ? `${Math.max(1, Math.round(b.took_ms / 1000))} s` : `${Math.round(b.took_ms / 60_000)} min`, doubts: b.doubts, undo: !!b.undo }}
            onUndo={b.undo ? () => h.send({ type: "home.since.undo", id: b.undo }) : undefined}
            onRedo={() => h.send({ type: "home.move", move: "peel", folder: m.folder, target: m.id, input: { redo: true } })} />
        </div>
      )}
    </div>
  );
}
