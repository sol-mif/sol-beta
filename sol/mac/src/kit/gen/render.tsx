// The frame for a generated thing (#1245, item 1; brand.md, "How the system is worked on": every generated thing renders
// in a place with the tokens as its only variables). `Gen` lints what an agent composed (lint.ts) and draws it with the
// kit's own pieces (kit/Accent.tsx: the same parts the whole window, stage-whole.tsx, is built from), so it reads as the
// same Sol: the same depths (rule 1), the same set (useLit, from whoever draws it), the same type. A spec names no
// colour, size, font or motion of its own; each piece here takes them from the tokens by its role and state.
// Widths: a piece with `w` holds it; without, a card stretches across a column and shares a row; a bar or a row measures
// the box it is in. The root sits in a card at the card depth unless it is a card already (the frame's default).
import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import tokens from "../../../../design/system/tokens.json";
import { BodyOne } from "../../body/Bodies";
import {
  Coin, FileTile, HaloDial, HoldStill, MEANING, MeterBar, Num, PillControl, Ping, RunMark, SessionRow, Sign, Sticker,
  deep, dim, ink, inner, mute, on, picked, surface, useLit, well, type FileState, type HaloState, type Meaning, type PingState, type Press, type RowState, type RunState,
} from "../Accent";
import { textW } from "../paint";
import { CURVE, SYSTEM, TYPE as T } from "../tokens";
import { lint } from "./lint";
import { KINDS, MAX_W, type Spec } from "./spec";

const R = CURVE.radius.block, DP = SYSTEM.depth;
/** the display cut (tokens.json palette.font.display): headings and big numbers, SF Pro Display Black, tight (rule 23) */
const DISPLAY = tokens.palette.font.display;
const display = (size: readonly number[]): CSSProperties => ({
  fontFamily: DISPLAY.value, fontWeight: DISPLAY.weight, letterSpacing: `${DISPLAY.tracking}em`, fontSize: size[0], lineHeight: `${size[1]}px`,
});
const TONE = { ink, dim, mute } as const;
const toneOf = (t: unknown, d: string) => (typeof t === "string" && t in TONE ? TONE[t as keyof typeof TONE] : d);
/** the frame's widths when a card stands alone with none of its own */
const ALONE: Record<string, number> = { Block: 400, Card: 340, List: 300, Stack: 400 };
/** the gap inside a card: the card's 18 padding (stage-whole's), its pieces 12 apart (the scale's s3) */
const PAD = 18, GAP = 12;

/** the direction of the box a piece is in: a card in a row shares it, in a column stretches */
const InRow = createContext(false);
/** a row straight in a block or a card bleeds by its own inset (the scale's s3), so its words start on the card's edge
 *  with the title and every other line (layout rule 2: one edge per place); in a list the list's own inset does it */
const ROW_IN = 12, Bleed = createContext(false);
const bleed = (on: boolean): CSSProperties => (on ? { marginLeft: -ROW_IN, marginRight: -ROW_IN, width: `calc(100% + ${ROW_IN * 2}px)` } : {});
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(+v) ? +v : d);

/** the width of the box it is in, kept as it changes: a bar or a row needs its number */
function Measured({ h, style, children }: { h?: number; style?: CSSProperties; children: (w: number) => ReactNode }) {
  const at = useRef<HTMLDivElement>(null), [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = at.current;
    if (!el) return;
    const take = () => setW((o) => (o === el.clientWidth ? o : el.clientWidth));
    take();
    const ro = new ResizeObserver(take);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <div ref={at} style={{ width: "100%", minWidth: 0, height: h, ...style }}>{w > 0 && children(w)}</div>;
}

/** how a card-like box sits in what holds it: its own width, or stretched across a column, or a share of a row */
function useBox(w: unknown): CSSProperties {
  const row = useContext(InRow);
  if (typeof w === "number") return { width: w, flex: "none" };
  return row ? { flex: "1 1 0", minWidth: 0 } : { alignSelf: "stretch" };
}

/** a sticker Sol puts on a card: at its top edge, over it (rule 36), or in its corner below what it holds */
const edgeOf = (c: Spec) => (c.piece === "Sticker" ? str(c.props.at) || "inline" : "inline");
function Stickers({ of }: { of: Spec[] }) {
  if (!of.length) return null;
  return <div style={{ position: "absolute", left: 16, top: -11, display: "flex", gap: 6, zIndex: 1 }}>{of.map((c, i) => <Piece key={i} s={c} />)}</div>;
}
function Held({ kids, gap = GAP }: { kids: Spec[]; gap?: number }) {
  const corner = kids.filter((c) => edgeOf(c) === "corner"), flow = kids.filter((c) => edgeOf(c) === "inline");
  return (
    <Bleed.Provider value><InRow.Provider value={false}>
      {flow.length > 0 && <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap }}>{flow.map((c, i) => <Piece key={i} s={c} />)}</div>}
      {corner.length > 0 && <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: flow.length ? gap : 0 }}>{corner.map((c, i) => <Piece key={i} s={c} />)}</div>}
    </InRow.Provider></Bleed.Provider>
  );
}

// ---- the pieces --------------------------------------------------------------------------------------------------
/** the frame's block (stage-whole.tsx's card): its title in the head, its state's mark at the right, what it holds below.
 *  A state is its shape (rule 17): working the run mark, done the green coin, broken the red one, waiting lifted (rule 8)
 *  with the ask sticker on its edge */
function Block({ s }: { s: Spec }) {
  const p = s.props, st = s.state ?? "resting", kids = s.children ?? [];
  const lifted = p.depth === "lifted" || (st === "waiting" && p.depth !== "card");
  const edge = kids.filter((c) => edgeOf(c) === "edge");
  if (st === "waiting" && !edge.some((c) => c.props.role === "ask")) edge.unshift({ piece: "Sticker", props: { words: "needs you", role: "ask" } });
  const rest = kids.filter((c) => edgeOf(c) !== "edge");
  const mark = st === "working" ? <HoldStill value={!!p.still}><RunMark s="running" w={24} /></HoldStill>
    : st === "done" ? <Coin role="done" d={22}><Sign d="tick" s={13} w={2} /></Coin>
    : st === "broken" ? <Coin role="wrong" d={22}><Sign d="wrong" s={13} w={2} /></Coin>
    : p.mark ? <Num c={dim} style={{ fontSize: T.body[0] }}>{str(p.mark)}</Num> : null;
  return (
    <div data-gen="Block" data-state={st} style={{ position: "relative", boxSizing: "border-box", borderRadius: R, ...surface(lifted ? "lifted" : "card"), ...useBox(p.w),
      transform: lifted ? `translateY(-4px) scale(${DP.lifted.scale})` : undefined, paddingBottom: PAD }}>
      <Stickers of={edge} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 20, padding: `16px ${PAD}px ${rest.length ? 10 : 0}px` }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: T.head[0], lineHeight: `${T.head[1]}px`, fontWeight: 500, color: st === "broken" ? dim : ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{str(p.title)}</span>
        {mark}
      </div>
      {rest.length > 0 && <div style={{ padding: `0 ${PAD}px` }}><Held kids={rest} /></div>}
    </div>
  );
}

/** a card with no title: solid at its depth (rules 1 to 3), or a well sunk into what holds it (rule 7) */
function Card({ s }: { s: Spec }) {
  const p = s.props, d = str(p.depth) || "card", kids = s.children ?? [];
  const look: CSSProperties = d === "well" ? well() : surface(d === "control" ? "control" : d === "lifted" ? "lifted" : "card");
  return (
    <div data-gen="Card" style={{ position: "relative", boxSizing: "border-box", borderRadius: d === "well" ? inner(R, 6) : R, padding: PAD, ...look, ...useBox(p.w),
      transform: d === "lifted" ? `translateY(-4px) scale(${DP.lifted.scale})` : undefined }}>
      <Stickers of={kids.filter((c) => edgeOf(c) === "edge")} />
      <Held kids={kids.filter((c) => edgeOf(c) !== "edge")} gap={n(p.gap, GAP)} />
    </div>
  );
}

function Stack({ s }: { s: Spec }) {
  const p = s.props, row = p.direction === "row", a = str(p.align), kids = s.children ?? [];
  // a row of cards stands them at one height, as the whole window's do; a row of marks shares a centre line (layout rule 5)
  const cards = kids.length > 0 && kids.every(framed);
  const align = a === "start" ? "flex-start" : a === "end" ? "flex-end" : a === "center" || a === "between" ? "center" : a === "stretch" || !row || cards ? "stretch" : "center";
  return (
    <div data-gen="Stack" style={{ display: "flex", flexDirection: row ? "row" : "column", gap: n(p.gap, row ? GAP : 16), alignItems: align, justifyContent: a === "between" ? "space-between" : undefined,
      ...(useContext(InRow) ? { flex: "1 1 0", minWidth: 0 } : { alignSelf: "stretch" }) }}>
      <Bleed.Provider value={false}><InRow.Provider value={row}>{kids.map((c, i) => <Piece key={i} s={c} />)}</InRow.Provider></Bleed.Provider>
    </div>
  );
}

/** a card of rows (stage-whole's side): its title and count in the head, the rows 2 apart */
function List({ s }: { s: Spec }) {
  const p = s.props, kids = s.children ?? [];
  return (
    <div data-gen="List" style={{ position: "relative", boxSizing: "border-box", borderRadius: R, padding: 8, ...surface("card"), ...useBox(p.w) }}>
      {(p.title || p.count) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px 10px" }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: T.body[0], lineHeight: `${T.body[1]}px`, fontWeight: 500, color: ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{str(p.title)}</span>
          {p.count && <Num c={mute} style={{ fontSize: T.label[0] }}>{str(p.count)}</Num>}
        </div>
      )}
      <Bleed.Provider value={false}><InRow.Provider value={false}><div style={{ display: "grid", gap: 2 }}>{kids.map((c, i) => <Piece key={i} s={c} />)}</div></InRow.Provider></Bleed.Provider>
    </div>
  );
}

/** a coin a row carries at its end */
const asideOf = (s: Spec) => {
  const c = s.children?.find((k) => k.piece === "Coin");
  return c ? <Piece s={{ ...c, props: { ...c.props, d: Math.min(n(c.props.d, 10), 12), glyph: "none" } }} /> : s.props.aside ? str(s.props.aside) : undefined;
};
/** a row in a list (the kit's Row, drawn in the one system: words dim at rest, picked in the pearl with deep words) */
function Row({ s }: { s: Spec }) {
  const l = useLit(), p = s.props, pick = !!p.picked, note = str(p.note), h = note ? 48 : 36, r = inner(R, 8), aside = asideOf(s), out = useContext(Bleed);
  return (
    <div data-gen="Row" style={{ position: "relative", alignSelf: "stretch", height: h, display: "flex", alignItems: "center", gap: 10, padding: `0 ${ROW_IN}px`, borderRadius: r, boxSizing: "border-box", ...(typeof p.w === "number" ? { width: p.w } : bleed(out)) }}>
      {pick && <span style={{ position: "absolute", inset: 0, borderRadius: r, backgroundImage: picked(l), boxShadow: `inset 0 1px 0 ${on(DP.control.rim * 2)}, 0 ${DP.control.shadow[1]}px ${DP.control.shadow[2]}px rgba(0,0,0,${DP.control.shadow[0]})` }} />}
      <span style={{ position: "relative", flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: T.body[0], lineHeight: `${T.body[1]}px`, fontWeight: pick ? SYSTEM.type.picked.weight : 400, color: pick ? deep(0.88) : dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{str(p.title)}</span>
        {note && <span style={{ fontSize: T.label[0], lineHeight: `${T.label[1]}px`, color: pick ? deep(0.6) : mute, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{note}</span>}
      </span>
      {aside != null && <span style={{ position: "relative", display: "inline-flex", fontSize: T.label[0], fontVariantNumeric: "tabular-nums", color: pick ? deep(0.6) : mute }}>{aside}</span>}
    </div>
  );
}

function Pill({ s }: { s: Spec }) {
  const p = s.props, words = (Array.isArray(p.words) ? p.words : [str(p.words) || "ok"]) as readonly string[], h = n(p.h, 32);
  const coin = s.children?.find((k) => k.piece === "Coin");
  const wOf = (w: string) => Math.ceil((textW(w, T.body[0], 500) + 2 * Math.max(14, h / 2.5) + (coin ? 22 : 0)) / 2) * 2;
  const st = (s.state ?? "rest") as Press;
  const at = typeof p.picked === "number" && p.picked >= 0 ? p.picked : words.length > 1 ? 0 : -1;
  return (
    <span data-gen="Pill" style={{ display: "inline-flex", gap: 2, flex: "none" }}>
      <HoldStill value={!!p.still}>
        {words.map((w, i) => (
          <PillControl key={`${w}${i}`} w={wOf(w)} h={h} s={words.length === 1 ? st : i === at ? (st === "sol" || st === "sol-working" ? st : "picked") : "rest"}>
            {coin && i === 0 && <Piece s={{ ...coin, props: { ...coin.props, d: 12, glyph: "none" } }} />}{w}
          </PillControl>
        ))}
      </HoldStill>
    </span>
  );
}

/** a place to write: a well, round as a pill (rules 7, 9) */
function Field({ s }: { s: Spec }) {
  const p = s.props, words = str(p.words);
  return (
    <div data-gen="Field" style={{ height: 44, borderRadius: 22, display: "flex", alignItems: "center", padding: "0 16px", boxSizing: "border-box", ...well(), ...useBox(p.w) }}>
      <span style={{ fontSize: T.body[0], lineHeight: `${T.body[1]}px`, color: words ? ink : mute, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{words || str(p.placeholder) || "write here"}</span>
    </div>
  );
}

/** how full: the caption and its percent above the bar (stage-whole's side foot) */
function Meter({ s }: { s: Spec }) {
  const p = s.props, v = Math.max(0, Math.min(1, n(p.value, 0)));
  return (
    <div data-gen="Meter" style={{ display: "grid", gap: 8, ...useBox(p.w) }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: T.label[0], lineHeight: `${T.label[1]}px` }}>
        <span style={{ color: mute, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{str(p.label)}</span>
        <Num c={dim} style={{ fontSize: T.label[0], lineHeight: `${T.label[1]}px` }}>{Math.round(v * 100)}%</Num>
      </div>
      <Measured h={10}>{(w) => <MeterBar v={v} w={w} h={10} />}</Measured>
    </div>
  );
}

const GLYPH_OF: Record<string, "tick" | "ask" | "wrong" | "said"> = { done: "tick", ask: "ask", wrong: "wrong", sol: "said" };
function CoinPiece({ s }: { s: Spec }) {
  const p = s.props, role = (str(p.role) || "done") as Meaning | "sol", d = n(p.d, 22), g = str(p.glyph) || "auto";
  const glyph = g === "none" || d < 14 ? null : g === "auto" ? GLYPH_OF[role] : (g as "tick" | "ask" | "wrong" | "said");
  return <Coin role={role} d={d}>{glyph && <Sign d={glyph} s={Math.round(d * 0.6)} w={2} />}</Coin>;
}

/** words: a heading or a big number in the display cut (rule 23), words dim, a caption mute (rule 13) */
function Text({ s }: { s: Spec }) {
  const p = s.props, role = str(p.role) || "words", words = str(p.words);
  const look: CSSProperties = role === "heading" ? { ...display(T.title), color: toneOf(p.tone, ink) }
    : role === "number" ? { ...display(T.display), fontVariantNumeric: "tabular-nums", color: toneOf(p.tone, ink) }
    : role === "caption" ? { fontSize: T.label[0], lineHeight: `${T.label[1]}px`, color: toneOf(p.tone, mute) }
    : { fontSize: T.body[0], lineHeight: `${T.body[1] + 2}px`, color: toneOf(p.tone, dim) };
  return <div data-gen="Text" data-role={role} style={{ margin: 0, minWidth: 0, overflowWrap: "anywhere", ...(useContext(InRow) ? { flex: "0 1 auto" } : {}), ...look }}>{words}</div>;
}

export function Piece({ s }: { s: Spec }): ReactNode {
  const p = s.props, out = useContext(Bleed);
  switch (s.piece) {
    case "Block": return <Block s={s} />;
    case "Card": return <Card s={s} />;
    case "Stack": return <Stack s={s} />;
    case "List": return <List s={s} />;
    case "Row": return <Row s={s} />;
    case "SessionRow": return (
      <HoldStill value={!!p.still}>
        {typeof p.w === "number" ? <SessionRow title={str(p.title)} s={(s.state ?? "rest") as RowState} aside={asideOf(s)} w={p.w} />
          : <Measured style={bleed(out)}>{(w) => <SessionRow title={str(p.title)} s={(s.state ?? "rest") as RowState} aside={asideOf(s)} w={w} />}</Measured>}
      </HoldStill>
    );
    case "Pill": return <Pill s={s} />;
    case "Field": return <Field s={s} />;
    case "Meter": return <Meter s={s} />;
    case "MeterBar": return typeof p.w === "number" ? <MeterBar v={n(p.value, 0)} w={p.w} h={n(p.h, 10)} />
      : <Measured h={n(p.h, 10)}>{(w) => <MeterBar v={n(p.value, 0)} w={w} h={n(p.h, 10)} />}</Measured>;
    case "RunMark": return <HoldStill value={!!p.still}><RunMark s={(s.state ?? "queued") as RunState} w={n(p.w, 28)} /></HoldStill>;
    case "Sticker": return <Sticker fill={p.role && p.role !== "picked" ? MEANING[p.role as Meaning] : undefined} tilt={typeof p.tilt === "number" ? p.tilt : undefined}>{str(p.words) || "note"}</Sticker>;
    case "Coin": return <CoinPiece s={s} />;
    case "Num": return <Num c={toneOf(p.tone, ink)}>{str(p.value)}</Num>;
    case "Text": return <Text s={s} />;
    case "FileTile": return <FileTile s={(s.state ?? "rest") as FileState} kind={Math.max(0, KINDS.indexOf(str(p.kind) || "md"))} name={str(p.name) || undefined} />;
    case "HaloDial": {
      const d = n(p.d, 64), working = s.state === "working";
      return <HoldStill value={!!p.still}><HaloDial s={(s.state ?? "rest") as HaloState} d={d} body={<BodyOne size={Math.round(d * 0.92)} doing={working && !p.still ? "work" : "rest"} />} /></HoldStill>;
    }
    case "Ping": return <Ping s={(s.state ?? "seen") as PingState} />;
  }
}

/** whether a spec is a card already, or a stack of them: then it needs no frame of its own */
const framed = (s: Spec): boolean => s.piece === "Block" || s.piece === "Card" || s.piece === "List" || (s.piece === "Stack" && !!s.children?.length && s.children.every(framed));

/** a linted spec, drawn: the root in a card at the card depth unless it is a card already */
export function Draw({ spec }: { spec: Spec }) {
  const root = framed(spec) ? spec : { piece: "Card" as const, props: {}, children: [spec] };
  const across = root.piece === "Stack" && root.props.direction === "row" ? root.children?.length ?? 1 : 1;
  const w = typeof root.props.w === "number" ? root.props.w : across > 1 ? Math.min(MAX_W, across * 248 + (across - 1) * n(root.props.gap, GAP)) : ALONE[root.piece] ?? 400;
  return (
    <div data-gen-root style={{ fontFamily: T.family, WebkitFontSmoothing: "antialiased", fontSize: T.body[0], lineHeight: `${T.body[1]}px`, color: ink, width: w, display: "flex", flexDirection: "column" }}>
      <Piece s={root} />
    </div>
  );
}

/** what an agent composed, linted into the one system and drawn; `onNotes` hears what the lint changed */
export function Gen({ spec, onNotes }: { spec: unknown; onNotes?: (notes: string[]) => void }) {
  const r = lint(spec);
  useLayoutEffect(() => { onNotes?.(r.notes); });   // eslint-disable-line react-hooks/exhaustive-deps
  return <Draw spec={r.spec} />;
}
