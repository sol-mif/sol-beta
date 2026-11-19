// A block, as a card (#766, the board 11-14, the folders & cards pins; tokens.json palette.looks.block). What the pins
// do: the card is one solid thing, one step off the ground, never see-through; one continuous corner; its weight a
// wide soft shadow on paper and a lit top rim on black; the name in a tab that steps up from the body (the folder's
// lip); every state a small mark inside, the frame never recolours; several of a thing a stack of sheets peeking above;
// lifted, it overlaps with a bigger shadow and stays solid. `take` names the lip (tab, band, plain); `state` one of the
// eight; `light` on a light ground; `behind` how many sheets the stack shows. The words and the thing go inside.
import type { CSSProperties, ReactNode } from "react";
import { corners, curve } from "./curve";
import { Glyph } from "./Glyph";
import { Halo } from "./Halo";
import { deep, dim, hex, ink, mute, on, textW, useUid } from "./paint";
import { CURVE, JELLY, LOOKS, TYPE as T } from "./tokens";

export type BlockState = "resting" | "working" | "waiting" | "done" | "pinned" | "broken" | "stale" | "carried";
export const BLOCK_STATES: BlockState[] = ["resting", "working", "waiting", "done", "pinned", "broken", "stale", "carried"];
export type BlockTake = keyof typeof LOOKS.block.takes;
const B = LOOKS.block;

const shadowOf = ([a, y, blur]: readonly [number, number, number]) => `drop-shadow(0 ${y}px ${blur}px rgba(0,0,0,${a}))`;

/** the outline: one silhouette, the body and the tab stepping up from it joined by one curve; the left edge runs
 *  straight up into the tab, as a folder's does */
function outline(w: number, h: number, take: BlockTake, tabW: number, x = 0, y = 0) {
  const R = CURVE.radius.card, S = CURVE.smoothing, head = B.takes[take].head;
  if (take !== "tab") return curve(w, h, R, S, x, y);
  const t = B.takes.tab, j = t.join, n = (v: number) => +v.toFixed(3);
  const body = corners(R, S, Math.min(w, h - head) / 2), tab = corners(t.corner, S, Math.min(tabW, head) / 2);
  const P = body.p, p = tab.p;
  return [
    `M${n(x + w - P)} ${n(y + head)}`, body.tr, `L${n(x + w)} ${n(y + h - P)}`, body.br, `L${n(x + P)} ${n(y + h)}`, body.bl,
    `L${n(x)} ${n(y + p)}`, tab.tl, `L${n(x + tabW - p)} ${n(y)}`, tab.tr,
    `L${n(x + tabW)} ${n(y + Math.max(p, head * 0.3))}`, `C${n(x + tabW)} ${n(y + head * 0.95)} ${n(x + tabW + j)} ${n(y + head * 0.25)} ${n(x + tabW + j)} ${n(y + head)}`, "Z",
  ].join("");
}

export function Block({ w, h, title, state = "resting", take = B.pick as BlockTake, light = false, behind = 0, note, style, children }: {
  w: number; h: number; title: string; state?: BlockState; take?: BlockTake; light?: boolean; behind?: number; note?: string; style?: CSSProperties; children?: ReactNode;
}) {
  const id = useUid(), head = B.takes[take].head, skin = light ? "light" : "dark";
  const fill = B.fill[skin], lifted = state === "carried";
  const shadow = shadowOf(lifted ? B.lift.shadow[skin] : B.shadow[skin]);
  const word = light ? deep(0.9) : ink, quiet = light ? deep(0.5) : dim, faint = light ? deep(0.34) : mute;
  const mark = state === "working" ? 26 : state === "pinned" || state === "done" ? 22 : 0;
  const tabW = Math.min(w - 72, Math.max(120, textW(title, T.body[0], 500) + 32 + mark));
  const d = outline(w, h, take, tabW);
  const edge = light ? deep(0.07) : on(B.rim);
  const sheet = (i: number) => {
    const k = i + 1, inset = 10 * k, dy = 9 * k, sw = w - inset * 2, sh = h - head;
    return <g key={i}><path d={curve(sw, sh, CURVE.radius.card, CURVE.smoothing, inset, head - dy)} fill={B.sheet[skin]} /><path d={curve(sw - 1, sh - 1, CURVE.radius.card, CURVE.smoothing, inset + 0.5, head - dy + 0.5)} fill="none" stroke={edge} strokeWidth={1} /></g>;
  };
  return (
    <div data-block={state} style={{ position: "relative", width: w, height: h, flex: "none", filter: shadow, transform: lifted ? `scale(${B.lift.scale}) rotate(${B.lift.tilt}deg)` : undefined, zIndex: lifted ? 2 : undefined, ...style }}>
      <svg width={w} height={h} style={{ position: "absolute", inset: 0, overflow: "visible" }} aria-hidden>
        <defs><linearGradient id={`e${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={edge} /><stop offset="0.5" stopColor={edge} stopOpacity={light ? 1 : 0.35} /><stop offset="1" stopColor={edge} stopOpacity={light ? 1 : 0.2} /></linearGradient></defs>
        {behind > 0 && Array.from({ length: behind }, (_, i) => sheet(behind - 1 - i))}
        <path d={d} fill={fill} />
        {take === "band" && <path d={curve(w, head, CURVE.radius.card, CURVE.smoothing)} fill={light ? deep(0.035) : on(0.04)} />}
        {/* the edge: a hairline on the silhouette, lit at the top on dark */}
        <path d={outline(w - 1, h - 1, take, tabW, 0.5, 0.5)} fill="none" stroke={`url(#e${id})`} strokeWidth={1} />
      </svg>
      <div style={{ position: "absolute", left: 16, top: 0, height: head, display: "flex", alignItems: "center", gap: 8, maxWidth: take === "tab" ? tabW - 24 : w - 32 }}>
        <span style={{ fontSize: T.body[0], lineHeight: `${T.body[1]}px`, fontWeight: 500, color: state === "stale" ? faint : word, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
        {state === "stale" && <span style={{ fontSize: T.label[0], lineHeight: `${T.label[1]}px`, color: faint, whiteSpace: "nowrap" }}>older build</span>}
        {state === "working" && <span style={{ display: "inline-flex", width: 18, height: 18, flex: "none" }}><Halo size={18} doing="working" /></span>}
        {state === "pinned" && <span style={{ color: quiet, display: "inline-flex", transform: "scale(0.7)", flex: "none" }}><Glyph name="pin" /></span>}
        {state === "done" && <Stamp light={light} />}
      </div>
      {state === "waiting" && <Note light={light} colour={JELLY.six[4]} at={w - 96}>needs you</Note>}
      {state === "broken" && <Note light={light} colour={JELLY.six[0]} at={w - 118}>could not draw</Note>}
      <div style={{ position: "absolute", left: 0, right: 0, top: head, bottom: 0, color: word }}>
        {state === "broken"
          ? <div style={{ padding: "14px 16px", fontSize: T.body[0], lineHeight: `${T.body[1]}px`, color: quiet }}>{note ?? "the thing did not render"}<div style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: T.label[0], lineHeight: `${T.label[1]}px`, color: faint, marginTop: 6 }}>TypeError: rows is undefined</div></div>
          : children}
      </div>
    </div>
  );
}

/** a stamp (a step done): a round pearl paper with the check in lime, pressed a little askew. A first sight of the
 *  Sticker (#1184), drawn here until that piece exists; then this is it. */
function Stamp({ light }: { light: boolean }) {
  return (
    <span style={{ width: 20, height: 20, borderRadius: 10, background: light ? "#fff" : "#e6e1d8", display: "inline-flex", alignItems: "center", justifyContent: "center", transform: "rotate(8deg)", boxShadow: `0 1px 2px ${hex("#000000", 0.25)}`, flex: "none" }}>
      <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6.5l2.5 2.5 4.5-5" fill="none" stroke={JELLY.six[5]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}
/** a note (needs you; failed): a paper slip stuck on the block's edge, tilted, one of the six as its ink band. Also the
 *  Sticker's first sight. */
function Note({ light, colour, at, children }: { light: boolean; colour: string; at: number; children: ReactNode }) {
  return (
    <span style={{ position: "absolute", left: at, top: 10, padding: "4px 10px 4px 12px", background: light ? "#fff" : "#e6e1d8", color: deep(0.85), fontSize: T.label[0], lineHeight: `${T.label[1]}px`, fontWeight: 500, whiteSpace: "nowrap", transform: "rotate(-2deg)", boxShadow: `0 2px 6px ${hex("#000000", 0.3)}`, borderLeft: `3px solid ${colour}` }}>{children}</span>
  );
}
