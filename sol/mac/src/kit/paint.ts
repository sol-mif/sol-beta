// The kit's paint (#674): the few ways a value from tokens.ts becomes something to draw with, shared by every primitive.
// The one black and the on colour at a strength, a hex at an alpha, the type, a label, a word held over the jelly's
// colours, the jelly's bands. Nothing here is a value of its own: each number is the tokens', or the drawing's geometry.
import { useId, useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";
import { DEEP, JELLY, PEARL, SHADE, TYPE as T } from "./tokens";
import { anyWhole } from "../flag";

const rgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const; };
/** a #rrggbb at an alpha */
export const hex = (h: string, a = 1) => { const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${a})`; };
/** the one black at a strength (a shade step) */
export const black = (a: number) => hex(SHADE.black, a);
/** the on colour at a strength: the black's opposite (face.css's --on, the lch flip), so a lighter base turns it dark */
const [br, bg, bb] = rgb(SHADE.black), ON = 0.2126 * br + 0.7152 * bg + 0.0722 * bb < 128 ? "#ffffff" : "#000000";
export const on = (a: number) => hex(ON, a);
export const pearl = (a = 1) => hex(PEARL, a);
export const deep = (a = 1) => hex(DEEP, a);
// #891: behind the run's switches the quiet words wear the readable strengths (tokens.json shade.read): 4.5:1 or more
const read = anyWhole();
export const ink = on(SHADE.on.ink), dim = on(read ? SHADE.read.dim : SHADE.on.dim), mute = on(read ? SHADE.read.mute : SHADE.on.mute);

/** the type at its body size, the words in ink */
export const TYPE: CSSProperties = { fontFamily: T.family, fontSize: T.body[0], lineHeight: `${T.body[1]}px`, color: ink, WebkitFontSmoothing: "antialiased" };
/** a label: the small size, mute */
export const label: CSSProperties = { fontSize: T.label[0], lineHeight: `${T.label[1]}px`, color: mute, letterSpacing: "0.01em" };
/** a word on the jelly's colours: the on colour, held by a soft shadow of the black (the effort pill's name) */
export const onColour: CSSProperties = { color: on(1), textShadow: `0 0 2px ${black(0.55)}, 0 1px 3px ${black(0.4)}` };

/** the jelly's colours as one gradient, laid the way the effort pill lays its heat: bands at an angle, soft-edged
 *  (palette.css's --jelly is the same at a = 1) */
export function jellyBands(cols: readonly string[] = JELLY.six, angle: number = JELLY.angle, soft: number = JELLY.soft, a = 1) {
  const n = cols.length, pc = (v: number) => `${(Math.max(0, Math.min(1, v)) * 100).toFixed(1)}%`;
  return `linear-gradient(${angle}deg, ${cols.map((c, j) => `${hex(c, a)} ${pc(j / n + soft)}, ${hex(c, a)} ${pc((j + 1) / n - soft)}`).join(", ")})`;
}

/** an id an svg gradient or filter can be named by */
export const useUid = () => useId().replace(/:/g, "");

/** how wide a word is drawn in the kit's type at a size (the canvas measures it, so a pill or a button fits its word) */
let pen: CanvasRenderingContext2D | null = null;
export function textW(s: string, size: number = T.body[0], weight = 400) {
  pen ??= document.createElement("canvas").getContext("2d");
  if (!pen) return s.length * size * 0.55;
  pen.font = `${weight} ${size}px ${T.family}`;
  return Math.ceil(pen.measureText(s).width);
}

/** the size of the box an element is in, kept as it changes: a glass with no size of its own is drawn to it */
export function useSize(el: RefObject<HTMLElement | null>) {
  const [wh, setWh] = useState<[number, number]>([0, 0]);
  useLayoutEffect(() => {
    const t = el.current;
    if (!t) return;
    // the size it is laid at, never the size it shows: read while a move scales it (a piece of Build's one space carried to a
    // new box), the shown size is wrong, and nothing reports again when the move ends
    const take = (es?: ResizeObserverEntry[]) => { const b = es?.[es.length - 1]?.borderBoxSize?.[0], w = b ? b.inlineSize : t.offsetWidth, h = b ? b.blockSize : t.offsetHeight; setWh((o) => (o[0] === w && o[1] === h ? o : [w, h])); };
    take();
    const ro = new ResizeObserver(take);
    ro.observe(t);
    return () => ro.disconnect();
  }, [el]);
  return wh;
}
