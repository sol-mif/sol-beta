// The frame every Home block renders inside (#692 suite step 1, mine/look/home/sticky.html and suite.html): one object
// the whole way, its words, its ring, its shelf, its form and its moves; only the frame grows. A kind draws only its
// inside, as the stage's kinds do (stage/kinds/types.ts): the sticky's inside is pass 2's StickyCard (Stickies.tsx), a
// suite or made block's is its recipe's shape (Inside below). The grammar's pure half is grammar.ts; lift is lift.ts.
//
//   the four forms   a line (just the words, in the notes) → a sticky (one thing, one folder, one run) → a sticky with
//                    one tool inside (Tools.tsx) → lifted (a block on the stage, or a session in Build; Home keeps a chip)
//   hold 450 ms      the fan: five tools on an arc over the card (kit Pill); one opens inside; a second offers the lift
//   drag the corner  grows or folds it a form at the thresholds (grammar.ts formAfter); past the tool's, it offers the lift
//   press the ring   done, and again: running
//   drag onto a folder in the side   refiles it (Stickies.tsx's drop): the say line names the swap
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { Meter, Pearl, Pill, Ring, useSize } from "../../../kit";
import { CURVE } from "../../../kit/tokens";
import { useStageHere } from "../../../stage/kinds/here";
import type { Block2, Form, Home2Api, HomeState2, Place, Recipe, Sticky, Tool } from "../pass2";
import { FORM_SAYS, FORMS, TOOLS, fanAt, formAfter, growthOf, pastBounds, shelfOf, toneOf } from "./grammar";
import { foldHome, liftToBuild, liftToStage, say, useRunBusy, useSaid } from "./lift";
import { ToolPane } from "./Tools";
import { SHAPES } from "./shapes";
import type { Metas } from "../../meta";
import "./suite.css";

export const meta = {
  Piece: {
    job: "the frame every Home block renders inside: its words, its ring, its shelf, its form, its moves",
    flow: "know",
    states: ["a line", "a sticky", "a sticky with a tool", "the fan open", "the lift offered", "lifted to the stage: a chip", "lifted to Build: a chip with the session's ring", "done", "previewing a form under the corner"],
    keys: [
      { press: "hold 450 ms", does: "opens the fan of five tools; one opens inside it" },
      { press: "drag the corner, or ↑ ↓ on it", does: "grows or folds it a form at the thresholds (home.block.patch form)" },
      { press: "a second tool", does: "offers the lift: to the stage · to Build", opens: "Lifted" },
      { press: "press the ring", does: "done, and again: running (home.block.patch done)" },
      { press: "drag onto a folder in the side", does: "refiles it; the say line names the swap (home.block.patch folder)" },
      { press: "double-click its words", does: "edits them (home.block.patch words)" },
    ],
    listens: ["home.state › blocks, recipes, folders"],
  },
} satisfies Metas;

/** how long a press must be held before the fan opens (sticky.html) */
export const HOLD_MS = 450;
/** how far a press may move and still be a hold */
const STILL = 4;

/** what the frame hands the card that draws the inside: the parts below the inside, and the ring's press */
export type Frame = { below: ReactNode; onRing: () => void; words: ReactNode; form: Form };

type Offer = { why: string };

/** the block's words, its title: a double-click edits them; Enter keeps, Esc leaves them */
export function Words({ b, h, className }: { b: Block2; h: Home2Api; className?: string }) {
  const [edit, setEdit] = useState<string | null>(null);
  if (edit === null) return <span className={className} data-pc-words onDoubleClick={(e) => { e.stopPropagation(); setEdit(b.words); }}>{b.words}</span>;
  const keep = () => { const w = edit.trim(); setEdit(null); if (w && w !== b.words) h.send({ type: "home.block.patch", id: b.id, words: w }); };
  return (
    <input className="pc-words-edit" value={edit} autoFocus aria-label="its words" data-pc-words-edit
      onChange={(e) => setEdit(e.target.value)} onBlur={keep} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") keep(); else if (e.key === "Escape") setEdit(null); }} />
  );
}

/** the shelf's three layers at the block's foot: the folder's (read-only), its own, kept */
export function Shelf({ b, st }: { b: Block2; st: HomeState2 }) {
  const sh = shelfOf(b, st.folders);
  if (!sh.length) return null;
  const said = { folder: "the folder's context: read, never written", own: "its own: what it read and made", kept: "kept: pinched into the folder" };
  return (
    <div className="pc-shelf" data-part="the shelf" data-pc-shelf>
      {sh.map((x, i) => <i key={`${x.layer}-${i}`} className={`pc-sh ${x.layer}`} data-layer={x.layer} title={said[x.layer]}>{x.name}</i>)}
    </div>
  );
}

/** the say line: what the last move did (the swap, the form, the lift) */
export function Said() {
  const s = useSaid();
  return <p className={`pc-said${s ? " now" : ""}`} role="status" aria-live="polite" data-pc-said>{s}</p>;
}

export function Piece({ b, st, h, s, card, setPlace }: {
  b: Block2; st: HomeState2; h: Home2Api; s?: Sticky; setPlace: (p: Place) => void;
  /** the card that draws the inside, for a kind with its own (the sticky's); left out, the frame's own card */
  card?: (f: Frame) => ReactNode;
}) {
  const here = useStageHere();
  const root = useRef<HTMLDivElement>(null);
  const [w, hh] = useSize(root);
  const [preview, setPreview] = useState<Form | null>(null);
  const [grow, setGrow] = useState(0);
  const [fan, setFan] = useState(false);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [busy, setBusy] = useState(false);
  const hold = useRef<{ t: number; x: number; y: number; held: boolean } | null>(null);
  const corner = useRef<{ x: number; y: number; from: Form } | null>(null);
  const form: Form = preview ?? (b.lifted ? "block" : b.form);
  const patch = (o: object) => h.send({ type: "home.block.patch", id: b.id, ...o });

  // the fan closes on a press anywhere else, and on Esc
  useEffect(() => {
    if (!fan) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setFan(false); };
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setFan(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [fan]);

  /** bring it to a form; the block form is past a sticky's bounds, so it offers the lift */
  const toForm = (f: Form) => {
    if (f === b.form && !(f === "block")) return;
    if (f === "block") { setOffer({ why: "past a sticky's bounds: lift it to a block with a session behind it" }); say(FORM_SAYS.block); return; }
    setOffer(null);
    if (f === "tool") patch({ form: "tool", tool: b.tool ?? "browser" });
    else if (f === "sticky") patch({ form: "sticky", tool: null });
    else patch({ form: "line", tool: null });
    say(FORM_SAYS[f]);
  };
  const pick = (t: Tool) => {
    setFan(false);
    if (pastBounds(b, t)) { setOffer({ why: `two tools is past a sticky's bounds: lift it to a block with ${b.tool} and ${t}` }); say(`two tools is past a sticky's bounds: it offers the lift`); patch({ own: [{ name: t, from: t }] }); return; }
    patch({ form: "tool", tool: t });
    say(`${t} opens inside the sticky; what it finds goes on its shelf`);
  };
  const lift = async (to: "stage" | "build") => {
    setOffer(null); setBusy(true);
    try { if (to === "stage") await liftToStage(b, h, here); else await liftToBuild(b, h, here); } finally { setBusy(false); }
  };
  const onRing = () => { const done = b.state !== "done"; patch({ done }); say(done ? "a press: done" : "running again"); };

  // ---- hold: the fan ----
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest("button, input, textarea, iframe, a, [data-pc-grip], [data-pc-tool], .pc-fan")) return;
    const t = window.setTimeout(() => { if (hold.current) { hold.current.held = true; setFan(true); say("hold: pick the tool it needs next"); } }, HOLD_MS);
    hold.current = { t, x: e.clientX, y: e.clientY, held: false };
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const k = hold.current; if (!k || k.held) return;
    if (Math.abs(e.clientX - k.x) + Math.abs(e.clientY - k.y) > STILL) { clearTimeout(k.t); hold.current = null; }
  };
  const up = () => { const k = hold.current; if (k && !k.held) { clearTimeout(k.t); hold.current = null; } };
  /** a hold's release is not a click: the card does not open under the fan */
  const click = (e: RMouseEvent) => { if (hold.current?.held) { e.stopPropagation(); e.preventDefault(); hold.current = null; } };

  // ---- the corner: grow and fold ----
  const gripDown = (e: RPointerEvent<HTMLSpanElement>) => {
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    corner.current = { x: e.clientX, y: e.clientY, from: b.form };
    setFan(false);
  };
  const gripMove = (e: RPointerEvent<HTMLSpanElement>) => {
    const c = corner.current; if (!c) return;
    const g = growthOf(e.clientX - c.x, e.clientY - c.y), f = formAfter(c.from, g);
    setGrow(Math.max(-1, Math.min(1, g / 220)));
    if (f !== (preview ?? c.from)) { setPreview(f === c.from ? null : f); say(FORM_SAYS[f]); }
  };
  const gripUp = () => {
    const c = corner.current; corner.current = null; setGrow(0);
    const f = preview; setPreview(null);
    if (c && f && f !== c.from) toForm(f);
  };
  const gripKey = (e: KeyboardEvent<HTMLSpanElement>) => {
    const at = FORMS.indexOf(b.form);
    if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); toForm(FORMS[Math.min(FORMS.length - 1, at + 1)]); }
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); toForm(FORMS[Math.max(0, at - 1)]); }
  };

  const tool = form === "tool" ? (b.tool ?? "browser") : null;
  const below = (
    <>
      {tool && <ToolPane b={b} s={s} st={st} tool={tool} onHand={(hand) => patch({ hand })} onClose={() => toForm("sticky")} />}
      {offer && (
        <div className="pc-offer" data-pc-offer onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <span className="pc-offer-why">{offer.why}</span>
          <span className="pc-offer-acts">
            <button type="button" className="pc-act lit" data-pc-lift="stage" disabled={busy} onClick={() => void lift("stage")}>to the stage</button>
            <button type="button" className="pc-act" data-pc-lift="build" disabled={busy} onClick={() => void lift("build")}>to Build</button>
            <button type="button" className="pc-act quiet" onClick={() => setOffer(null)}>not yet</button>
          </span>
        </div>
      )}
      <Shelf b={b} st={st} />
    </>
  );
  const ring = <RingOf state={b.state} onPress={onRing} />;
  const words = <Words b={b} h={h} />;

  let body: ReactNode;
  if (b.lifted && !preview) body = <Chip b={b} h={h} ring={ring} />;
  else if (form === "line") body = <Line b={b} st={st} setPlace={setPlace} />;
  else if (card) body = card({ below, onRing, words, form });
  else body = <OwnCard b={b} st={st} h={h} ring={ring} words={words} below={below} setPlace={setPlace} />;

  const fanAt_ = fan ? fanAt(Math.max(w, 240), Math.max(hh, 80)) : [];
  return (
    <div ref={root} className={`pc pc-${form}${preview ? " previewing" : ""}`} data-block={b.id} data-recipe={b.recipe} data-form={form} data-form-was={preview ? b.form : undefined}
      data-tool={b.tool ?? undefined} data-lifted={b.lifted?.to} style={grow > 0 ? { paddingBottom: `calc(var(--s8) * ${grow.toFixed(2)})` } : undefined}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDragStart={up} onClickCapture={click}>
      {body}
      {!b.lifted && (
        <span className="pc-grip" data-pc-grip role="slider" tabIndex={0} aria-label="its form: drag the corner, or ↑ ↓" aria-valuetext={form}
          aria-valuemin={0} aria-valuemax={3} aria-valuenow={FORMS.indexOf(form)} draggable={false}
          onPointerDown={gripDown} onPointerMove={gripMove} onPointerUp={gripUp} onPointerCancel={gripUp} onMouseDown={(e) => e.preventDefault()} onKeyDown={gripKey} />
      )}
      {fan && (
        <div className="pc-fan" data-pc-fan>
          {TOOLS.map((t, i) => (
            <span key={t} className="pc-fan-one" data-pc-fan-tool={t} style={{ left: `calc(50% + ${fanAt_[i].x}px)`, top: `calc(50% + ${fanAt_[i].y}px)` }}>
              <Pill words={[t]} picked={b.tool === t ? 0 : -1} h={24} up onPick={() => pick(t)} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** the ring: the run's state (filed · running · asks · done · failed), pressed for done */
export function RingOf({ state, onPress, value }: { state: string; onPress?: () => void; value?: number }) {
  const tone = toneOf(state);
  return (
    <button type="button" className={`pc-ring ${tone}`} data-pc-ring={state} aria-label={state === "done" ? "done: press to run again" : `${state}: press for done`} onClick={(e) => { e.stopPropagation(); onPress?.(); }}>
      {tone === "run" && <Ring value={value ?? 0.4} size={16} flat />}
    </button>
  );
}

/** the first form: the words as typed, a line in the notes, with where it is */
function Line({ b, st, setPlace }: { b: Block2; st: HomeState2; setPlace: (p: Place) => void }) {
  const f = st.folders?.find((x) => x.id === b.folder);
  return (
    <div className="pc-line-row" data-pc-line>
      <span className="pc-line-words">{b.words}</span>
      {f && <button type="button" className="pc-line-where" onClick={() => setPlace({ at: "folder", id: f.id })}>{f.name}</button>}
    </div>
  );
}

/** lifted: Home keeps a chip pointing at it, with the session's ring when it went to Build */
function Chip({ b, h, ring }: { b: Block2; h: Home2Api; ring: ReactNode }) {
  const build = b.lifted?.to === "build";
  const runs = useRunBusy(build ? b.lifted?.ref : undefined);
  const where = build ? `in Build${b.lifted?.ref ? "" : " · starting"}` : "on the stage";
  return (
    <div className="pc-chip" data-pc-chip={b.lifted?.to}>
      {build ? <span className={`pc-ring ${runs ? "run" : runs === false ? "done" : "fresh"}`} data-pc-session={b.lifted?.ref ?? ""}>{runs && <Ring value={0.5} size={16} flat />}</span> : ring}
      <span className="pc-chip-words">{b.words}</span>
      <span className="pc-chip-where">{where}</span>
      <button type="button" className="pc-act quiet" data-pc-back title="back to a sticky" onClick={(e) => { e.stopPropagation(); foldHome(b, h); }}>back</button>
    </div>
  );
}

/** the frame's own card, for a block whose kind has none of its own (a suite or made recipe): the pearl, its head, its inside */
function OwnCard({ b, st, h, ring, words, below, setPlace }: { b: Block2; st: HomeState2; h: Home2Api; ring: ReactNode; words: ReactNode; below: ReactNode; setPlace: (p: Place) => void }) {
  const box = useRef<HTMLDivElement>(null), [w, hh] = useSize(box);
  const r = st.recipes?.find((x) => x.id === b.recipe && (!x.folder || x.folder === b.folder)) ?? st.recipes?.find((x) => x.id === b.recipe);
  const f = st.folders?.find((x) => x.id === b.folder);
  return (
    <div ref={box} className={`pc-card t-${toneOf(b.state)}`} draggable
      onDragStart={(ev) => { ev.dataTransfer.setData("text/sol-sticky", b.id); ev.dataTransfer.effectAllowed = "move"; }}>
      <span className="pc-pearl" aria-hidden>{w > 0 && hh > 0 && <Pearl w={w} h={hh} r={CURVE.radius.row} />}</span>
      <div className="pc-head">{ring}<span className="pc-words">{words}</span><span className="pc-kind" title={r?.by}>{r?.name ?? b.recipe}</span>
        <button type="button" className="pc-x" aria-label="drop this block" onClick={(e) => { e.stopPropagation(); h.send({ type: "home.block.drop", id: b.id }); }}>×</button>
      </div>
      <button type="button" className="pc-crumb" onClick={() => f && setPlace({ at: "folder", id: f.id })}>{f ? f.crumb.join(" › ") : "Home"}{r ? ` · ${r.by}` : ""}</button>
      <Inside b={b} r={r} h={h} st={st} setPlace={setPlace} />
      {below}
    </div>
  );
}

type TrackerBody = { cols: string[]; rows: string[][] };
type DeckBody = { cards: { q: string; a: string }[] };
type WatchBody = { value: string; line: string; history: number[] };
type LinesBody = { lines: string[] };

/** a recipe's shape, drawn from the block's body (its run fills it; step 2 gives each recipe its own inside) */
export function Inside({ b, r, h, st, setPlace }: { b: Block2; r?: Recipe; h?: Home2Api; st?: HomeState2; setPlace?: (p: Place) => void }) {
  const [flip, setFlip] = useState(false);
  const [at, setAt] = useState(0);
  // step 2 (#692): a recipe with its own shape (shapes.ts) draws its inside, its run's state included
  const Own = SHAPES[b.recipe];
  if (Own && h && st) return <Own b={b} r={r} h={h} st={st} setPlace={setPlace ?? (() => {})} />;
  if (b.state === "running" || !b.body) return <p className="pc-step">{r ? `its run: ${r.run}` : "its run is laying it out"}…</p>;
  const body = b.body as Partial<TrackerBody & DeckBody & WatchBody & LinesBody>;
  if (body.cols && body.rows) return (
    <div className="pc-table" data-pc-inside="tracker" role="table">
      <div className="pc-tr head" role="row">{body.cols.map((c) => <span key={c} role="columnheader">{c}</span>)}</div>
      {body.rows.map((row, i) => <div key={i} className="pc-tr" role="row">{row.map((c, j) => <span key={j} role="cell">{c}</span>)}</div>)}
    </div>
  );
  if (body.cards?.length) {
    const c = body.cards[at % body.cards.length];
    return (
      <div className="pc-deck" data-pc-inside="deck">
        <button type="button" className="pc-deck-card" onClick={(e) => { e.stopPropagation(); setFlip(!flip); }}>{flip ? c.a : c.q}</button>
        <span className="pc-deck-acts">
          <button type="button" className="pc-act" onClick={(e) => { e.stopPropagation(); setFlip(false); setAt(at + 1); }}>knew it</button>
          <button type="button" className="pc-act quiet" onClick={(e) => { e.stopPropagation(); setFlip(false); setAt(at + 1); }}>didn't</button>
          <small>{(at % body.cards.length) + 1} of {body.cards.length}</small>
        </span>
      </div>
    );
  }
  if (body.value !== undefined) {
    const hs = body.history ?? [], max = Math.max(1, ...hs);
    return (
      <div className="pc-watch" data-pc-inside="watch">
        <b>{body.value}</b><span>tells you {body.line}</span>
        <Meter w={96} h={6} value={hs.length ? hs[hs.length - 1] / max : 0} label="where it is against its highest" />
      </div>
    );
  }
  return <ul className="pc-lines" data-pc-inside="lines">{(body.lines ?? []).map((l, i) => <li key={i}>{l}</li>)}</ul>;
}
