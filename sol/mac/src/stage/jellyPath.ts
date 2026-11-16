// The jelly's way on the stage (#697), the plain arithmetic of useJelly.ts with nothing to draw, so the node tests reach
// it (src/jelly.test.ts): where it sits by a block, where its six land on one, and the pour's curve as a function.

/** a point on the stage's layer, in px from its top left */
export type Pt = { x: number; y: number };
/** a block's box on the stage, in px (stage.json's x, y, w, h) */
export type Box = { x: number; y: number; w: number; h: number };

/** where the jelly sits by a block (play.html's blockSpot): in the frame's title row (its height `row`), its own half
 *  (`size`) and a step in from the right edge */
export const spotIn = (b: Box, size: number, row: number, step: number): Pt => ({ x: b.x + b.w - size / 2 - step, y: b.y + row / 2 });

/** where the six land on a block and leave it from: its four corners, then its top and bottom middles (play.html) */
export const CORNERS: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0], [0.5, 1]];
export const cornersOf = (b: Box): Pt[] => CORNERS.map(([u, v]) => ({ x: b.x + u * b.w, y: b.y + v * b.h }));

/** a CSS cubic-bezier as a function of progress (x solved by Newton, then by halving where its slope is flat) */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (p: number) => number {
  const bz = (t: number, a: number, b: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  const dx = (t: number) => 3 * x1 * (1 - t) ** 2 + 6 * (x2 - x1) * t * (1 - t) + 3 * (1 - x2) * t * t;
  return (p: number) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let t = p;
    for (let i = 0; i < 8; i++) {
      const e = bz(t, x1, x2) - p, d = dx(t);
      if (Math.abs(e) < 1e-6) return bz(t, y1, y2);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1;
    t = p;
    for (let i = 0; i < 40; i++) {
      const e = bz(t, x1, x2) - p;
      if (Math.abs(e) < 1e-6) break;
      if (e > 0) hi = t; else lo = t;
      t = (lo + hi) / 2;
    }
    return bz(t, y1, y2);
  };
}

/** the CSS spec's named curves */
const NAMED: Record<string, readonly [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1], "ease-in": [0.42, 0, 1, 1], "ease-out": [0, 0, 0.58, 1], "ease-in-out": [0.42, 0, 0.58, 1], linear: [0, 0, 1, 1],
};
/** a CSS easing as the tokens name it: a cubic-bezier(…), else a keyword's own curve; anything else is linear */
export function easing(css: string): (p: number) => number {
  const m = /cubic-bezier\(([^)]+)\)/.exec(css);
  const k = m ? m[1].split(",").map(Number) : NAMED[css.trim()] ?? NAMED.linear;
  return k.length === 4 && k.every(Number.isFinite) ? cubicBezier(k[0], k[1], k[2], k[3]) : (p: number) => Math.max(0, Math.min(1, p));
}
