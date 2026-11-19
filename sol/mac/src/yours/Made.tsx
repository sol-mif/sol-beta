// Build becomes yours (#1089): a made version, drawn by the face from its Spec with the kit. No iframe, no colour of
// its own: Card, Field, Row, Button and the kit's type. The sheet shows three of these at the size they will have on
// the stage; the Sol user presses inside one to try it (the box fills, they send), presses its head to pick it.
//   state "ghost"   offered, not picked: dashed hairline, dimmed
//         "picked"  solid hairline, lifted, the pearl dot in its head
//         "kept"    theirs: no hairline of its own (the card's edge); the fold in its head turns it over, in place, to
//                   its back: where it came from, what it may do, undo (kit Peel's back card is not used: see broke.txt)
// `pulse` names the part a change just touched (title, size, look, shape, +<blank>, -<blank>): it pulses once.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button, Card, Field, Pearl, Row, curve } from "../kit";
import { deep, dim, ink, mute, on } from "../kit/paint";
import { CURVE, SHADE, TYPE as T } from "../kit/tokens";
import { Chip, withName } from "./Chip";
import { isChoice, SHAPE_WORDS, type Spec } from "./model";

export type MadeState = "ghost" | "picked" | "kept";
/** a version's width on the stage and in the sheet, by its size */
export const MADE_W: Record<Spec["size"], number> = { s: 232, m: 288, l: 344 };
const PAD = 16;
/** a version not picked is drawn at this share of its width */
export const GHOST_SCALE = 0.86;
/** the ask with its blanks filled (pure; the engine's `fill`, the same rule) */
export const fill = (template: string, values: Record<string, string>) => template.replace(/\{([^{}\n]{1,30})\}/g, (m, n: string) => (n in values ? values[n] : m));
/** the word on the one button of each shape: what the press does, in at most two words */
export const GO: Record<Spec["shape"], string> = { button: "use", rows: "use", brief: "use", checkin: "use", rule: "use", pin: "", layout: "", hide: "" };

/** the back of a kept piece: where it came from, what it may do, in the Sol user's words; undo is on it */
export type MadeBack = { from: string; may: string; undone?: boolean; onUndo?: () => void;
  /** lending (a design only, #1089): the people it can be lent to, who has it already, and the press. What travels is
   *  the design (title, shape, blanks by name), never the values: the back shows that as the piece with its slots empty */
  people?: string[]; lent?: string[]; onLend?: (who: string) => void;
  /** change it by saying so, after it is kept: the press opens the same row of presses and "say…" on this one alone */
  onChange?: () => void };

export function Made({ spec, state = "ghost", index, pulse, onPick, onFill, back, turned: held, onTurn, doubt, onName, solid, style }: {
  spec: Spec; state?: MadeState; index?: number; pulse?: string | null; onPick?: () => void; onFill?: (text: string) => void;
  /** kept only: its back. The fold in its head (or Esc, or "turn back") turns it, in place, at the same size */
  back?: MadeBack; turned?: boolean; onTurn?: (t: boolean) => void;
  /** Jev was not sure of the title (0.45 to 0.7): it is underlined dashed, and a press on it asks for a name */
  doubt?: boolean; onName?: () => void;
  /** it stands over words (the talk, when the stage is folded; a piece opened from the shelf): the kit's pop step, so
   *  nothing under it reads through */
  solid?: boolean; style?: CSSProperties;
}) {
  const [own, setOwn] = useState(false), turned = !!back && (held ?? own);
  const [lending, setLending] = useState(false);
  const turn = (t: boolean) => { setOwn(t); onTurn?.(t); };
  useEffect(() => {
    if (!turned) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); turn(false); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const dashed = state === "ghost", lifted = state === "picked";
  // a ghost is drawn narrower (never scaled: the kit's glass measures itself), so three fit a narrow stage and the pick comes forward
  const w = Math.round(MADE_W[spec.size] * (dashed ? GHOST_SCALE : 1)), inner = w - PAD * 2;
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(spec.fields.map((f) => [f.name, f.value])));
  useEffect(() => { setVals((v) => Object.fromEntries(spec.fields.map((f) => [f.name, v[f.name] ?? f.value]))); }, [spec.fields]);
  const box = useRef<HTMLDivElement>(null), [h, setH] = useState(0);
  useEffect(() => { const e = box.current; if (!e) return; const ro = new ResizeObserver(() => setH(e.offsetHeight)); ro.observe(e); return () => ro.disconnect(); }, []);
  const send = (over: Record<string, string> = {}) => onFill?.(fill(spec.template, { ...vals, ...over }));
  const beat = (part: string): CSSProperties => (pulse === part ? { animation: "yo-beat var(--d-turn) var(--e-arrive) 2 alternate" } : {});
  const plain = spec.accent === "plain";
  const go = GO[spec.shape] && <div style={{ marginTop: 12, display: "flex" }}><Button h={30} acts={!plain} flat={plain} onClick={() => send()}>{GO[spec.shape]}</Button></div>;

  let body: ReactNode = null;
  // a blank as a field: its name (none when its kind is not known), its value to change, its past values to pick
  const fieldOf = (f: Spec["fields"][number]) => (
    <div key={f.name} style={{ marginBottom: 8, ...beat(`+${f.name}`) }}>
      <Field w={inner} h={36}>
        {!f.unnamed && <span style={{ color: mute, fontSize: T.label[0], minWidth: 52, flex: "none" }}>{f.name}</span>}
        <input value={vals[f.name] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.name]: e.target.value }))} list={`yo-${index}-${f.name}`}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }} aria-label={f.unnamed ? f.value : f.name}
          style={{ all: "unset", flex: 1, minWidth: 0, color: ink, fontSize: T.body[0], fontVariantNumeric: "tabular-nums" }} />
        {/* a counter: the value is the next one, and the field says so in one small word */}
        {f.next && <span data-made-next style={{ flex: "none", color: mute, fontSize: T.label[0] }}>next</span>}
        <datalist id={`yo-${index}-${f.name}`}>{f.values.map((v) => <option key={v} value={v} />)}</datalist>
      </Field>
    </div>
  );
  if (spec.shape === "button") body = <>{spec.fields.map(fieldOf)}{go}</>;
  else if (spec.shape === "rows") {
    // the leading blank is a row each; the other blanks stand ABOVE the rows (set once, then press a row), never under
    // a counter is never the row: the row is the first blank that is a choice
    const lead = spec.fields.find(isChoice) ?? spec.fields.find((f) => !f.next) ?? spec.fields[0];   // the engine's rowField, the same rule
    body = <>
      {spec.fields.filter((f) => f !== lead).map(fieldOf)}
      <div style={{ margin: "0 -8px" }}>{(lead?.values.length ? lead.values.slice(0, 5) : [""]).map((v) => (
        <Row key={v} w={inner + 16} h={34} title={(lead ? withName(v, lead.name) : v) || spec.title} aside="use" onClick={() => send(lead ? { [lead.name]: v } : {})} />
      ))}</div>
    </>;
  } else if (spec.shape === "brief") body = <>
    <p style={{ margin: 0, color: dim, fontSize: T.body[0], lineHeight: `${T.body[1]}px`, display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{fill(spec.template, vals)}</p>
    {go}
  </>;
  else if (spec.shape === "rule" || spec.shape === "checkin") body = <>
    <p style={{ margin: 0, color: ink, fontSize: T.read[0], lineHeight: `${T.read[1]}px` }}>{spec.template}</p>
    {go}
  </>;
  else if (spec.shape === "pin") body = (
    // a thing that needs no stage room: it stands as a chip by the box (the shelf); here, the chip above a box drawn small
    <div style={{ display: "grid", gap: 6 }}>
      {/* a counter rides on the pin: the chip says the next one it will fill */}
      <Chip title={spec.title} blanks={spec.fields.filter((f) => f.next).map((f) => ({ name: f.name, value: vals[f.name] ?? f.value }))} kept onPress={() => send()} />
      {/* the box in small, so the chip reads as standing by it (not an empty field): its "+" and its send as two marks */}
      <div aria-hidden style={{ height: 28, borderRadius: CURVE.radius.field, boxShadow: `inset 0 0 0 1px ${on(SHADE.on.edge)}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px" }}>
        <span style={{ width: 12, height: 12, borderRadius: 6, background: on(SHADE.on.flat) }} />
        <span style={{ width: 28, height: 12, borderRadius: 6, background: on(SHADE.on.flat) }} />
      </div>
    </div>
  );
  else body = <Where side={spec.shape === "hide" ? null : /left/.test(spec.title) ? "left" : /middle/.test(spec.title) ? "middle" : "right"} w={inner} />;

  if (turned && back) {
    const bh = Math.max(h, lending ? 180 : 148), quiet: CSSProperties = { all: "unset", cursor: "pointer", fontSize: T.pill[0], padding: "4px 12px", borderRadius: CURVE.radius.row, boxShadow: `inset 0 0 0 1px ${deep(0.18)}`, color: deep() };
    return (
      <div data-made="back" className="k-pop" style={{ width: w, flex: "none", ...style }}>
        <Pearl w={w} h={bh} r={CURVE.radius.card}>
          <div style={{ height: "100%", boxSizing: "border-box", padding: PAD, display: "flex", flexDirection: "column", fontFamily: T.family, color: deep() }}>
            {/* its head: the title, and the same fold in the same place as on the front (a press turns it back) */}
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <b style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: T.read[0], lineHeight: `${T.read[1]}px`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{spec.title}</b>
              <span role="button" tabIndex={0} data-back-act="turn" aria-label="turn it back" title="turn it back" onClick={() => { setLending(false); turn(false); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLending(false); turn(false); } }} style={{ flex: "none", width: 20, height: 20, display: "grid", placeItems: "center", cursor: "pointer" }}>
                <svg width={12} height={12} aria-hidden><path d="M1.5 .5h6l4 4v7h-10z M7.5 .5v4h4" fill={deep(0.12)} stroke={deep(0.6)} strokeLinejoin="round" /></svg>
              </span>
            </span>
            {lending ? <>
              {/* what goes, shown: the tool with its slots empty. Their values fill it; yours stay here */}
              <span data-lend-what style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", fontSize: T.label[0], lineHeight: `${T.label[1]}px`, color: deep(0.6) }}>
                {spec.fields.length ? spec.fields.map((f) => <span key={f.name} style={{ padding: "1px 7px", borderRadius: CURVE.radius.chip - 2, border: `1px dashed ${deep(0.4)}` }}>{f.name}</span>) : <span>as it is</span>}
                <span>{spec.fields.length ? "go empty · your values stay" : ""}</span>
              </span>
              <span style={{ marginTop: 10, marginBottom: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(back.people ?? []).map((who) => { const has = back.lent?.includes(who); return (
                  <button key={who} type="button" data-lend-to={who} disabled={has} onClick={() => { back.onLend?.(who); setLending(false); }} style={{ ...quiet, cursor: has ? "default" : "pointer", opacity: has ? 0.5 : 1, boxShadow: `inset 0 0 0 1px ${deep(has ? 0.18 : 0.6)}` }}>{who}{has ? " has it" : ""}</button>
                ); })}
              </span>
            </> : <>
              <span style={{ marginTop: 8, fontSize: T.body[0], lineHeight: `${T.body[1]}px` }}>{back.from}</span>
              <span style={{ fontSize: T.body[0], lineHeight: `${T.body[1]}px`, color: deep(0.6) }}>{back.lent?.length ? `${back.may} · lent to ${back.lent.join(", ")}` : back.may}</span>
            </>}
            {!lending && spec.said.length > 0 && <span style={{ fontSize: T.label[0], lineHeight: `${T.label[1]}px`, color: deep(0.6), marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>you said: {spec.said.join(" · ")}</span>}
            <span style={{ flex: 1 }} />
            <span style={{ display: "flex", gap: 6 }}>
              {/* in the order they are used: change it, lend it, undo it. Four words never fit a small piece: turning back is the fold above */}
              {back.onChange && !back.undone && !lending && <button type="button" data-back-act="change" onClick={() => { turn(false); back.onChange?.(); }} style={{ ...quiet, boxShadow: `inset 0 0 0 1px ${deep(0.6)}` }}>change</button>}
              {back.onLend && !back.undone && <button type="button" data-back-act="lend" aria-pressed={lending} onClick={() => setLending((l) => !l)} style={{ ...quiet, ...(lending ? { boxShadow: `inset 0 0 0 1px ${deep(0.6)}` } : {}) }}>lend</button>}
              <button type="button" data-back-act="undo" onClick={back.onUndo} style={{ ...quiet, ...(back.onChange && !back.undone ? {} : { boxShadow: `inset 0 0 0 1px ${deep(0.6)}` }) }}>{back.undone ? "bring it back" : "undo"}</button>
            </span>
          </div>
        </Pearl>
      </div>
    );
  }
  return (
    <div data-made={state} data-shape={spec.shape} style={{ position: "relative", width: w, flex: "none", opacity: dashed ? 0.55 : 1,
      transform: lifted ? "translateY(-4px)" : "none", transition: "opacity var(--d-turn) var(--e-move), transform var(--d-turn) var(--e-move)", ...beat("size"), ...style }}>
      <div ref={box}>
        <Card w={w} step={solid ? "pop" : lifted || state === "kept" ? "raised" : "card"}>
          <div style={{ padding: PAD, fontFamily: T.family, fontSize: T.body[0], lineHeight: `${T.body[1]}px` }}>
            <div role={onPick ? "button" : undefined} onClick={onPick} aria-pressed={onPick ? lifted : undefined}
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: onPick ? "pointer" : "default", marginBottom: 12 }}>
              <span style={beat("look")}>{lifted || state === "kept" ? (plain ? <Dot /> : <Pearl w={10} h={10} r={5} />) : <Dot hollow />}</span>
              <b style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: T.read[0], lineHeight: `${T.read[1]}px`, color: ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...beat("title") }}>
                <span onClick={doubt && onName ? (e) => { e.stopPropagation(); onName(); } : undefined} title={doubt ? "name it" : undefined} style={doubt ? { borderBottom: `1px dashed ${on(SHADE.on.dim)}`, cursor: "text" } : undefined}>{spec.title}</span>
              </b>
              {state === "kept" && back && (
                <span role="button" tabIndex={0} aria-label="turn it over: where it came from, undo" title="turn it over" onClick={(e) => { e.stopPropagation(); turn(true); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); turn(true); } }} style={{ flex: "none", width: 20, height: 20, display: "grid", placeItems: "center", cursor: "pointer" }}>
                  <svg width={12} height={12} aria-hidden><path d="M1.5 .5h6l4 4v7h-10z M7.5 .5v4h4" fill="none" stroke={on(SHADE.on.dim)} strokeLinejoin="round" /></svg>
                </span>
              )}
              {index !== undefined && state !== "kept" && <kbd style={{ all: "unset", color: mute, fontSize: T.label[0], fontFamily: "var(--mono, ui-monospace, monospace)" }}>{index + 1}</kbd>}
            </div>
            <div style={beat("shape")}>{body}</div>
            {state !== "kept" && <div style={{ marginTop: 12, color: mute, fontSize: T.label[0], lineHeight: `${T.label[1]}px` }}>{SHAPE_WORDS[spec.shape]}</div>}
          </div>
        </Card>
      </div>
      {state !== "kept" && h > 0 && (
        <svg width={w} height={h} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden>
          <path d={curve(w - 1, h - 1, CURVE.radius.card - 0.5, CURVE.smoothing, 0.5, 0.5)} fill="none" stroke={on(lifted ? 0.5 : 0.3)} strokeWidth={1} strokeDasharray={dashed ? "4 4" : undefined} />
        </svg>
      )}
    </div>
  );
}

const Dot = ({ hollow }: { hollow?: boolean }) => <span style={{ display: "block", width: 10, height: 10, borderRadius: 5, boxSizing: "border-box", background: hollow ? "transparent" : on(SHADE.on.ink), boxShadow: hollow ? `inset 0 0 0 1px ${on(SHADE.on.mute)}` : undefined }} />;

/** an arrangement as a picture, never a sentence: the stage as an outline, the thing where it will stand (or put away
 *  by name at the bottom edge when `side` is null) */
function Where({ side, w }: { side: "left" | "middle" | "right" | null; w: number }) {
  const h = Math.round(w * 0.5), bw = Math.round(w / 3) - 8, x = side === "left" ? 6 : side === "middle" ? (w - bw) / 2 : w - bw - 6;
  return (
    <svg width={w} height={h} aria-hidden style={{ display: "block" }}>
      <path d={curve(w - 1, h - 1, CURVE.radius.field, CURVE.smoothing, 0.5, 0.5)} fill="none" stroke={on(SHADE.on.edge)} />
      {side ? <path d={curve(bw, h - 12, CURVE.radius.chip, CURVE.smoothing, x, 6)} fill={on(SHADE.on.ink)} />
        : <><path d={curve(64, 14, 7, CURVE.smoothing, 10, h - 22)} fill="none" stroke={on(SHADE.on.dim)} strokeDasharray="3 3" /><path d={`M${w / 2 - 20} ${h / 2}h40`} stroke={on(SHADE.on.mute)} /></>}
    </svg>
  );
}
