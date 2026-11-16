// The continuous curve (#674, brand.md, the material: "continuous-curvature corners, macOS 26's curve, for every card,
// field, button and the notch"). A corner whose curvature grows from zero into a circular arc and back, so the straight
// edge flows into the bend with no kink; drawn as an SVG path, since border-radius is a plain arc and the webview has
// no corner-shape. The construction is the published one for Apple's squircle (Figma's corner smoothing): a cubic in,
// an arc of 90·(1 − s) degrees, a cubic out, with smoothing s; s = 0 is border-radius, 0.6 is iOS.
const rad = (d: number) => (d * Math.PI) / 180;

function corner(r: number, s: number, budget: number) {
  let p = (1 + s) * r;
  const maxS = budget / r - 1;
  s = Math.max(0, Math.min(s, maxS));
  p = Math.min(p, budget);
  const arc = 90 * (1 - s);
  const L = Math.sin(rad(arc / 2)) * r * Math.SQRT2;
  const alpha = (90 - arc) / 2;
  const p34 = r * Math.tan(rad(alpha / 2));
  const beta = 45 * s;
  const c = p34 * Math.cos(rad(beta));
  const d = c * Math.tan(rad(beta));
  const b = (p - L - c - d) / 3;
  return { a: 2 * b, b, c, d, p, L, r };
}

const n = (v: number) => +v.toFixed(3);

/** The path of a w × h rectangle with continuous corners of radius r, from (x, y). */
export function curve(w: number, h: number, r: number, s = 0.6, x = 0, y = 0): string {
  if (w <= 0 || h <= 0) return "";
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  if (r === 0) return `M${x} ${y}h${w}v${h}h${-w}Z`;
  const { a, b, c, d, p, L, r: R } = corner(r, s, Math.min(w, h) / 2);
  const A = n(a), AB = n(a + b), ABC = n(a + b + c), BC = n(b + c), C = n(c), D = n(d), LL = n(L), RR = n(R);
  return [
    `M${n(x + w - p)} ${n(y)}`,
    `c${A} 0 ${AB} 0 ${ABC} ${D}`, `a${RR} ${RR} 0 0 1 ${LL} ${LL}`, `c${D} ${C} ${D} ${BC} ${D} ${ABC}`,
    `L${n(x + w)} ${n(y + h - p)}`,
    `c0 ${A} 0 ${AB} ${-D} ${ABC}`, `a${RR} ${RR} 0 0 1 ${-LL} ${LL}`, `c${-C} ${D} ${-BC} ${D} ${-ABC} ${D}`,
    `L${n(x + p)} ${n(y + h)}`,
    `c${-A} 0 ${-AB} 0 ${-ABC} ${-D}`, `a${RR} ${RR} 0 0 1 ${-LL} ${-LL}`, `c${-D} ${-C} ${-D} ${-BC} ${-D} ${-ABC}`,
    `L${n(x)} ${n(y + p)}`,
    `c0 ${-A} 0 ${-AB} ${D} ${-ABC}`, `a${RR} ${RR} 0 0 1 ${LL} ${-LL}`, `c${C} ${-D} ${BC} ${-D} ${ABC} ${-D}`,
    "Z",
  ].join("");
}
