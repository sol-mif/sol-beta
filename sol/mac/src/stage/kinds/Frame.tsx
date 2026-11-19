// One block's frame (v4 §4 and rules 10 to 12, #738): one frame for every kind, from the kit's tokens only. The kit's
// Glass at the card step on the continuous curve, 18 (CURVE.radius.block); a 34px head holding the kind's mark and the
// title, and nothing else at rest: the kind, when it was made and its source appear on hover and on focus, with fold and
// pop. There is no state dot: the state is the frame. Working, the jelly's bands sweep the top edge; waits on you, a
// yellow hairline and the yellow words in the head; frozen, a pearl stamp ("frozen · v2 · 21:14") and the body
// desaturated; live, nothing added. The mark opens the block's card: its ledger, the sessions it is in, its versions,
// and the verbs that are not on its head (freeze, close). The kind draws only its inside (kinds/*.tsx).
// Moving (#737): a ghost is the frame alone, dashed, its title in the head and no body, until a press takes it; the
// block that holds the keys wears the pearl's hairline and its body takes the keys (scroll), its content zooms apart.
// Reference (#953): @ in the head, quiet until the block is hovered or focused, attaches the block (or its lit part) to
// the next message; it stays lit while attached. Nothing else in the frame attaches anything (the switched stage passes onRef).
import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type RefObject } from "react";
import { stageWhole } from "../../flag";   // B12
import { Cut, Edges } from "../Edges";   // B12
import type { Edge } from "../resize";   // B12
import { Glass, Pill, Press, curve } from "../../kit";
import { CURVE } from "../../kit/tokens";
import type { Block, Lens, Line, Place } from "../model";
import { named, nameOf } from "../carry";
import { hhmm, metaWords, stampWords } from "./head";
import { KINDS, type Act } from "./index";
import { Mark } from "./Mark";

const R0 = CURVE.radius.block, S = CURVE.smoothing;

/** a ring on the frame's curve, as a mask: the rim's colour shows only where the edge is (a hairline inside it), dashed
 *  for a frozen block */
const ring = (w: number, h: number, dash: boolean, R: number = R0) => `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><path d='${curve(w, h, R, S)}' fill='none' stroke='black' stroke-width='2'${dash ? " stroke-dasharray='4 3'" : ""}/></svg>`)}")`;

export function Frame({ session, b, r, n, made, picked, still, moving, born, coming, dying, dragged, ledger, sessions, shown, act, lines, onLine, onHead, onGrip, onEdge, onFocus, onFold, onFreeze, onClose, onLedger, onVersion, ghost, held, zoom = 1, fading, onTake, onHold, onRef, attached, lens, reading, tabs, onTab, onPress }: {
  /** #954, stage.whole: the lens it is drawn in (whole.html 11, 12): TUI a pane, "▍title [n]" in mono; IDE an editor
   *  group, its head the group's tabs. `reading` is its place in reading order (the [n]) */
  lens?: Lens; reading?: number; tabs?: Block[]; onTab?: (id: string) => void;
  /** #891 (the switched stage passes it): crossing another or one dragged. His window draws every block in the pop
   *  material (#872), so it is heard and not drawn */
  solid?: boolean;
  session: string; b: Block; r: Place; n: number;
  /** when it was made: the ledger's first line */
  made?: number;
  picked: boolean;
  /** another block asks for the eye (#872): this one's rim is drawn still, its state in its words only */
  still?: boolean;
  moving: boolean; born: boolean; coming?: boolean; dying: boolean; dragged: boolean;
  /** its card is open: the ledger's lines */
  ledger: Line[] | null;
  /** the sessions the block is in (#700), this one first */
  sessions: string[]; shown?: number; act: Act;
  /** the TUI lens's terminal (#701): the other blocks, one line each, ⌘1-9 or a click opens one */
  lines?: Block[]; onLine?: (id: string) => void;
  onHead: (e: RPointerEvent<HTMLDivElement>) => void; onGrip: (e: RPointerEvent<HTMLDivElement>) => void;
  /** B12: the whole stage's edges (Edges.tsx), with stage.whole on */
  onEdge?: (e: RPointerEvent<HTMLDivElement>, edge: Edge) => void;
  onFocus: () => void; onFold: () => void; onFreeze: () => void; onClose: () => void; onLedger: () => void; onVersion: (v: number) => void;
  /** #737: offered and not taken (the frame alone, dashed; a press takes it), holding the keys (forward by a hairline),
   *  its content's zoom, fading to the foot */
  ghost?: boolean; held?: boolean; zoom?: number; fading?: boolean; onTake?: () => void; onHold?: () => void;
  /** #953: its reference icon pressed (attach it to the next message); it is attached now */
  onRef?: () => void; attached?: boolean;
  /** #1298: a press at the foot of a block that asks */
  onPress?: (choice: string) => void;
}) {
  const pane = lens === "tui" || lens === "ide", R = lens === "tui" ? CURVE.radius.chip : lens === "ide" ? CURVE.radius.row : R0;
  const { w, h } = r, d = curve(w, h, R, S);
  const Kind = KINDS[b.kind];
  const vs = b.versions.length, frozen = b.state === "frozen", at = frozen ? Math.min(shown ?? vs, vs) : vs + 1;
  const style: CSSProperties = { left: r.x, top: r.y, width: w, height: h, zIndex: r.z };
  const rim = b.state === "waits" || frozen;
  const kind = <Kind b={b} body={b.body} act={act} moving={dragged} session={session} />;
  // its content scrolls (the wheel, the keys while held) and zooms (⌘+ ⌘- ⌘0, #737): the zoom on its own layer, so the
  // frame and its head stay as they are
  const body = zoom === 1 ? kind : <div className="st-zoom" style={{ zoom, height: `${100 / zoom}%` }}>{kind}</div>;
  const words = metaWords(b, made), head = useRef<HTMLDivElement>(null), cut = useCut(head, words, b.title);
  const line = (cls: string) => <svg className={cls} width={w} height={h} aria-hidden><path d={curve(w - 1, h - 1, R - 0.5, S, 0.5, 0.5)} /></svg>;
  if (ghost) return (
    // a ghost (#737): the frame at a hairline, dashed, the title in its head, no body; a press anywhere on it takes it
    <div className={`st-block st-ghosted ${moving ? "moving" : ""} ${held ? "held" : ""} ${fading ? "fading" : ""}`} style={style} data-block={b.id} data-kind={b.kind} data-n={n} data-ghost="">
      {line("st-ghostline")}
      <div className="st-in">
        <div className="st-head" onPointerDown={onHead}><span className="st-t" title={b.title}>{b.title}</span></div>
        <div className="st-body" tabIndex={-1} role="button" aria-label={`take ${b.title}`} onClick={onTake} />
      </div>
    </div>
  );
  return (
    <div data-prints={frozen && vs > 1 ? "" : undefined} className={`st-block ${b.state} ${picked ? "picked" : ""} ${still ? "still" : ""} ${moving ? "moving" : ""} ${born ? "born" : ""} ${coming ? "coming" : ""} ${dying ? "dying" : ""} ${held ? "held" : ""}${pane ? ` st-${lens}pane` : ""}`} style={style} data-block={b.id} data-kind={b.kind} data-n={n} onPointerDownCapture={onHold}>
      {!pane && <div className="st-glass"><Glass w={w} h={h} r={R} step="pop" {...(rim ? { edge: 0 } : {})} /></div>}   {/* #954: a pane or an editor group draws no glass */}
      <div className="st-in" style={{ clipPath: `path('${d}')` }}>
        <div className="st-warm" />
        {rim && <div className="st-rim" style={{ WebkitMaskImage: ring(w, h, frozen && !stageWhole(), R), maskImage: ring(w, h, frozen && !stageWhole(), R) }} />}{/* #954: a print's edge is whole, never dashed */}
        <i className="st-sweep" aria-hidden />
        <div className="st-head" ref={head} onPointerDown={onHead} onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest("button")) onFocus(); }}>
          {tabs && lens === "ide" ? (
            <span className="st-tabs" role="tablist">{tabs.map((t) => (
              <button key={t.id} role="tab" tabIndex={-1} aria-selected={t.id === b.id} className={t.id === b.id ? "on" : ""} onPointerDown={(e) => e.stopPropagation()} onClick={() => onTab?.(t.id)}>
                <Mark kind={t.kind} /><span>{t.title}</span>
              </button>))}</span>
          ) : lens === "tui" ? <span className="st-t st-panet" title={b.title}>▍{b.title}{reading ? `  [${reading}]` : ""}</span> : <>
          <Mark kind={b.kind} onClick={onLedger} label="its ledger and verbs" />
          <span className="st-t" title={b.title}>{b.title}</span></>}
          {lens === "tui" ? <span className="st-meta">{b.bind?.source ?? ""}</span> : <>
          <span className={`st-meta t-label ${cut ? "cut" : ""}`} title={words}>{cut ? "" : words}</span>
          <span className="st-twin" aria-hidden><span>{b.title}</span><span>{words}</span></span></>}
          <span className={`st-acts ${attached ? "attached" : ""}`}>
            {onRef && <button className="st-ref" onClick={onRef} aria-pressed={!!attached} aria-label={attached ? "take it off your next message" : "attach it to your next message"} title={attached ? "attached to your next message: press to take it off" : "attach it to your next message"}>@</button>}
            <button onClick={onFold} aria-label={stageWhole() ? "put away" : "fold"} title={stageWhole() ? "put it away: it stays by name at the stage's bottom edge" : "fold"}>–</button>
            <button onClick={onFocus} aria-label={stageWhole() ? "larger" : "pop"} title={stageWhole() ? "larger: over the whole stage · Esc brings the others back" : "pop: over the whole stage"}>⤢</button>
            {stageWhole() && <button onClick={onClose} aria-label="close" title="close it">×</button>}
          </span>
        </div>
        {lines ? (
          <div className="st-body st-tui" tabIndex={-1}>
            <TuiLines lines={lines} onLine={onLine} />
            <div className="st-tuiterm">{kind}</div>
          </div>
        ) : <div className="st-body" tabIndex={-1}>{body}</div>}
        {b.asks && <Press q={b.asks.q} choices={b.asks.choices} said={askedBy(b, made)} answer={b.asks.answer} later={!!b.asks.later} onPress={onPress} />}
        {frozen && (stageWhole() ? <WholeStamp b={b} at={at} /> : <span className="st-stamp">{stampWords(b, at)}</span>)}
        {onEdge && stageWhole() && <Cut w={w} h={h} />}   {/* B12: "+N lines", clipped to the frame */}
      </div>
      {picked && line("st-pick")}
      {held && line("st-held")}
      {onEdge && stageWhole() ? <Edges onEdge={onEdge} /> : <div className="st-grip" onPointerDown={onGrip} />}   {/* B12 */}
      {ledger && (
        <div className="st-ledger">
          <div className="st-ledger-acts">
            <button onClick={onFreeze}>freeze</button>
            <button onClick={onClose}>close</button>
            {vs > 0 && <span className="st-vers"><Pill words={[...b.versions.map((v) => `v${v.n}`), "live"]} picked={at - 1} h={24} onPick={(i) => onVersion(i + 1)} /></span>}
          </div>
          {ledger.slice(-8).reverse().map((l, i) => <div key={i}>{hhmm(l.at)} {named(l.what)} · {l.by}</div>)}
          <div className="st-in-sessions">in {[session, ...sessions.filter((s) => s !== session)].map((s) => (s === session ? "this session" : `"${nameOf(s)}"`)).join(" · ")}</div>
        </div>
      )}
    </div>
  );
}

/** who asks, since when, the issue: the proof a block that asks lands with (#1298); never the word "block" (an artifact) */
export function askedBy(b: Pick<Block, "asks" | "at">, made?: number): string {
  const a = b.asks, at = b.at ?? made;
  if (!a) return "";
  return [a.from ? `${a.from.login}'s agent asks` : "your agent asks", at ? `since ${hhmm(at)}` : "", a.about ? `#${a.about}` : ""].filter(Boolean).join(" · ");
}

/** #954, stage.whole (whole.md "frozen"): the stamp of a print, its version large and when it was kept beneath */
function WholeStamp({ b, at }: { b: Block; at: number }) {
  const v = b.versions[at - 1];
  if (!v) return <span className="st-stamp st-print">kept</span>;
  const d = new Date(v.at);
  return <span className="st-stamp st-print"><b>v{v.n}</b><small>kept {d.getDate()} {d.toLocaleDateString([], { month: "short" })} · {hhmm(v.at)}</small></span>;
}

/** the TUI's lines (play.html's): the stage's other blocks, one line each, the way a terminal draws a box; ⌘n opens the
 *  nth, a click too */
function TuiLines({ lines, onLine }: { lines: Block[]; onLine?: (id: string) => void }) {
  return (
    <div className="st-tuilines" data-part="the stage">
      <div className="st-tuiedge">╭─ the stage · {lines.length} block{lines.length === 1 ? "" : "s"}</div>
      {lines.map((b, i) => (
        <div key={b.id} role="button" tabIndex={-1} className="st-tuiline" onClick={() => onLine?.(b.id)}>
          <span>│</span><Mark kind={b.kind} /><span className="st-tuit">{b.title}</span><span className="st-tuis">{b.state}</span><b>⌘{i + 1}</b>
        </div>
      ))}
      <div className="st-tuiedge">╰─ the same artifacts, one line each; ⌘1-9 opens one</div>
    </div>
  );
}

/** the head's state words fit beside the title, or they give way to a mark (#872 pass 2: a state is the dot and the
 *  rim when its words do not fit, never two letters). Measured on hidden twins at their natural width, so the answer
 *  does not depend on itself; the title keeps up to 160 px of its own before the words may have the rest. */
function useCut(head: RefObject<HTMLDivElement | null>, words: string, title: string): boolean {
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const h = head.current; if (!h) return;
    const fit = () => {
      const [tw, ww] = [...h.querySelectorAll<HTMLElement>(".st-twin > span")].map((e) => e.offsetWidth);
      const cs = getComputedStyle(h), gap = parseFloat(cs.columnGap) || 0;
      const mark = h.firstElementChild as HTMLElement | null, acts = h.querySelector<HTMLElement>(".st-acts");
      const room = h.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (mark?.offsetWidth ?? 0) - (acts?.offsetWidth ?? 0) - gap * 3;
      setCut(!!words && ww > room - Math.min(tw ?? 0, 160));
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(h);
    return () => ro.disconnect();
  }, [head, words, title]);
  return cut;
}
