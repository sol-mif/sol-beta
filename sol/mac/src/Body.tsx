// The body (#625), rendering A, the lit jelly (ours/design 2026-11-04, Marco's pick): six bodies, one per AI, each in
// its colour, fly in and fuse into one body with one face. Ported from the sketch that decided it,
// scratch/sol/atlas-today/body/one.html (mergeField, geo, V.A.shade, face, halo), to one WebGL2 fragment shader at
// the device's pixel ratio: the same field and the same numbers, with two things the sketch could not do at 120 px on
// a 2D canvas, an antialiased edge (the field's own slope gives the pixel's coverage) and antialiased eyes. No dither.
//   state: apart (the six orbit, and follow the pointer when `follow`) | settled (one body, the face, it blinks)
//   you: the seat's colour, or null for the six; the body takes it over the same spring
// Motion is the travel spring (motion.ts): the fly-in and the fuse are one interruptible
// spring (so reduced motion jumps, and slow ×4 slows it); the followed pointer lags by lag (140, the hand's: never
// slowed). gooBlur is the CSS goo's number and is not read here: the shader's field is the goo. Under
// prefers-reduced-motion it is drawn settled once, still, and never flies in.
// BodyMark is the switch's door (body/flag.ts, `sol.body.a`): off, it is Mark exactly; on, the body in Mark's place.
import { useEffect, useRef, useState } from "react";
import { Mark } from "./Mark";
import { CFG, Spring, clock, dur, reducedMotion, type Cfg } from "./motion";
import { pointer } from "./creature/loop";
import { CREATURE, GRADIENTS, type RGB } from "./creature/palette";
import { useCreature } from "./creature/state";
import { useBodyA } from "./body/flag";
import { LOOKS } from "./kit/tokens";
import type { Pt } from "./stage/jellyPath";

export type BodyState = "apart" | "settled";
/** the six, one per AI, in the sketch's order (SIX in one.html) */
const SIX: readonly RGB[] = [CREATURE.heart, CREATURE.pink, CREATURE.orange, CREATURE.amber, CREATURE.sun, CREATURE.green];

// the jelly between two places: travel, one of the five (motion.ts, ui.md "Motion"; tempo.json's own spring retired, #763)
export const BETWEEN: Cfg = { ...CFG.travel, eps: 0.002 };

// Dev only (the stills): ?bodystate=apart|settled|you holds the body in one state (BodyMark); ?bodyat=<ms> draws every
// body still, at that moment after its mount (the merge, frame by frame).
const devQ = import.meta.env.DEV && typeof location !== "undefined" ? new URLSearchParams(location.search) : null;
const devState = devQ?.get("bodystate") ?? null;
const devAt = devQ?.get("bodyat") ? Number(devQ.get("bodyat")) : null;

const VERT = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
// one.html's A, line for line where it can be; y runs down as on the sketch's canvas
const FRAG = `#version 300 es
precision highp float;
uniform vec2 res;          // pixels
uniform vec2 c[6];         // the six centres this frame (the sketch's mergeField, done on the CPU)
uniform vec3 col[6];       // their colours, 0..1, already moved toward you
uniform float r, settle, br, blink;
uniform float hlo, hfall, hgain, hcarry, hlight, hpool, zoom;   // the halo (HaloLook) and how much more than the frame the canvas shows
uniform float asp;         // width over height: 1 for the body's square; the dots' flight is drawn on the stage's whole layer (#697)
out vec4 o;
const vec3 L = normalize(vec3(-0.55, -0.7, 0.6));
const vec3 W = vec3(1.0);
float blob(vec2 q, vec2 k, float rr, float g) { float dx = (q.x - k.x) / g, dy = q.y - k.y; return rr * rr / (dx * dx + dy * dy + 1e-5); }
float body(vec2 q) {
  float g = 1.0 + 0.3 * max(0.0, q.y - 0.56) * 2.0;
  vec2 y = vec2(q.x, q.y > 0.74 ? 0.74 + (q.y - 0.74) * 2.2 : q.y);
  return blob(y, vec2(0.5, 0.56), 0.23 + br, g) + 0.8 * blob(y, vec2(0.66, 0.37), 0.11 + br * 0.5, 1.0) + 0.5 * blob(y, vec2(0.36, 0.42), 0.07, 1.0);
}
float field(vec2 q) { float f = 0.0; for (int k = 0; k < 6; k++) f += blob(q, c[k], r, 1.0); return mix(f, body(q) * 1.05, settle); }
vec3 colour(vec2 q) { vec3 s = vec3(0.0); float w = 1e-6; for (int k = 0; k < 6; k++) { float v = blob(q, c[k], r, 1.0); s += col[k] * v; w += v; } return s / w; }
float pill(vec2 q, vec2 k, float s) { float dx = (q.x - k.x) / 0.028, dy = (q.y - k.y) / (0.052 * blink * s); return dx * dx + dy * dy; }
void main() {
  vec2 u = vec2(gl_FragCoord.x / res.x, 1.0 - gl_FragCoord.y / res.y), q = 0.5 + (u - 0.5) * zoom;
  q.x = 0.5 + (q.x - 0.5) * asp;   // one unit of q is the height on both axes, so a blob stays round on a wide layer
  float e = 0.004;
  float f = field(q);
  float fx = field(q + vec2(e, 0.0)) - field(q - vec2(e, 0.0)), fy = field(q + vec2(0.0, e)) - field(q - vec2(0.0, e));
  vec3 m = colour(q);
  // the edge: how far past f = 1 this pixel is, in pixels, from the field's slope
  float slope = length(vec2(fx, fy)) / (2.0 * e) * zoom / res.y;
  float cov = clamp(0.5 + (f - 1.0) / max(slope, 1e-4), 0.0, 1.0);
  // outside: aura's light, soft, no grain (halo, k 0.55); light > 0 lets it add to what is behind instead of covering it,
  // pool > 0 lays its light on the glass under it; a canvas wider than the frame fades it out before its own edge
  float g = clamp((f - hlo) / (1.0 - hlo), 0.0, 1.0), ha = pow(g, hfall) * hgain;
  float pl = hpool * exp(-pow((q.x - 0.5) / 0.3, 2.0) - pow((q.y - 0.8) / 0.05, 2.0));
  float fe = zoom > 1.001 ? smoothstep(0.0, 0.14, min(min(u.x, 1.0 - u.x), min(u.y, 1.0 - u.y))) : 1.0;
  vec3 hc = mix(W, m, hcarry);
  vec4 halo = vec4(hc * ha + m * pl, (ha + pl) * (1.0 - hlight)) * fe;
  // inside: geo, then A's shade
  float ff = max(f, 1.0 + 1e-4), z = sqrt(1.0 - 1.0 / ff);
  vec2 h = vec2(fx, fy) / (ff * ff), zz = h / (2.0 * z + 1e-3);
  vec3 n = normalize(vec3(-zz * 1.6, 0.55));
  float d = max(0.0, dot(n, L));
  vec3 rf = 2.0 * d * n - L;
  float core = clamp((f - 1.0) / 1.4, 0.0, 1.0);
  vec3 base = mix(mix(m, W, 0.42), m, core * 0.5);
  float rim = pow(max(0.0, 1.0 - n.z), 2.2);   // n.z rounds past 1 at a blob's centre: pow of a negative is NaN, a black dot
  float b = 0.6 + 0.3 * d + 0.25 * core;
  vec3 inC = min(vec3(1.0), base * b);
  float sp = pow(max(0.0, rf.z), 40.0);
  inC = mix(inC, W, min(1.0, sp * 0.9 + rim * 0.35));
  // the face: pill eyes, open only when settled; each edge antialiased on its own slope
  float s = clamp((settle - 0.5) / 0.5, 0.0, 1.0);
  if (s > 0.001) {
    float pe = sqrt(min(pill(q, vec2(0.47, 0.49), s), pill(q, vec2(0.58, 0.49), s)));
    float w = max(fwidth(pe), 1e-4);
    inC = mix(inC, W, clamp((sqrt(1.6) - pe) / w + 0.5, 0.0, 1.0));
    inC = mix(inC, vec3(20.0, 20.0, 26.0) / 255.0, clamp((1.0 - pe) / w + 0.5, 0.0, 1.0));
  }
  o = mix(halo, vec4(inC, 1.0), cov);
}`;

type GL = { gl: WebGL2RenderingContext; u: Record<string, WebGLUniformLocation | null> };
function setup(cv: HTMLCanvasElement): GL | null {
  const gl = cv.getContext("webgl2", { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) return null;
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : (console.warn("body:", gl.getShaderInfoLog(s)), null); };
  const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const pr = gl.createProgram()!;
  gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(pr, "p");
  gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  const u: GL["u"] = {};
  for (const n of ["res", "c", "col", "r", "settle", "br", "blink", "hlo", "hfall", "hgain", "hcarry", "hlight", "hpool", "zoom", "asp"]) u[n] = gl.getUniformLocation(pr, n);
  return { gl, u };
}

const cl = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** the halo outside the edge: where it starts in the field (lo, lower reaches further), how it falls (fall), how strong
 *  (gain), how much of the jelly's colour it carries against white (carry), how much it adds as light rather than covers
 *  (light), the light it lays on the glass under the jelly (pool), and how much wider than the frame the canvas is drawn
 *  so a far halo is not cut by its square (reach). HALO is the one the notch wears today. */
export type HaloLook = { lo: number; fall: number; gain: number; carry: number; light: number; pool: number; reach: number };
export const HALO: HaloLook = { lo: 0.45, fall: 2.2, gain: 0.55, carry: 0.8, light: 0, pool: 0, reach: 1 };

/** the six's radius apart, in the frame (the sketch's r while apart): the dots that fly on the stage are this size too */
export const APART_R = 0.085;
/** how far the six lean toward where the body travels (play.html's jellyGo, lean = 0.5 ± 0.3) */
const LEAN = 0.3;

/** `lean`: the body travels (#697): while apart its six lean that way, [sign x, sign y], as the pointer leans them when
 *  `follow`; null when it is not travelling. The halo may change every render (what the body is doing): the frame reads
 *  it, so a new halo is a new look on the next frame, never a new canvas. */
export function Body({ size = 24, state, you = null, follow = false, lean = null, halo = HALO, className }: {
  size?: number; state: BodyState; you?: RGB | null; follow?: boolean; lean?: readonly [number, number] | null; halo?: HaloLook; className?: string;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  // what the frame reads; the springs write here (motion.ts runs them, so they are interruptible and honour reduced motion)
  const st = useRef({ home: null as Spring | null, youK: null as Spring | null, you: (you ?? SIX[0]) as RGB, follow, lean, halo, hv: [0.5, 0.5], pull: 0, dirty: true });
  st.current.follow = follow; st.current.lean = lean;
  if (st.current.halo !== halo) { st.current.halo = halo; st.current.dirty = true; }
  useEffect(() => {
    const s = st.current;
    if (!s.home) {
      // the fly-in: a new body starts apart and fuses, unless motion is reduced
      s.home = new Spring(reducedMotion() ? 1 : 0, BETWEEN, () => { s.dirty = true; });
      s.youK = new Spring(you ? 1 : 0, BETWEEN, () => { s.dirty = true; });
    }
    const to = reducedMotion() || state === "settled" ? 1 : 0;
    // dev, the stills: the frame at devAt ms after the mount, the spring stepped there by its own solver
    if (devAt !== null) { s.home.set(reducedMotion() ? 1 : 0); s.home.target = to; s.home.step(devAt / 1000); s.dirty = true; return; }
    s.home.to(to);
  }, [state]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const s = st.current;
    if (you) s.you = you;
    s.youK?.to(you ? 1 : 0);
    s.dirty = true;
  }, [you?.[0], you?.[1], you?.[2]]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = cv.current;
    if (!el) return;
    const g = setup(el);
    if (!g) { setFailed(true); return; }
    const { gl, u } = g;
    const s = st.current, still = reducedMotion() || devAt !== null;
    const t0 = clock();   // the breath, the drift, the blink run on the motion clock: slow ×4 slows them too
    let raf = 0, last = t0, drawn = 0;
    const c = new Float32Array(12), col = new Float32Array(18);
    const draw = (now: number) => {
      const t = devAt !== null ? devAt / 1000 : still ? 0 : (clock() - t0) / 1000, dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const halo = s.halo, dpr = window.devicePixelRatio || 1, px = Math.round(size * halo.reach * dpr);
      if (el.width !== px || el.height !== px) { el.width = px; el.height = px; }
      const home = s.home?.v ?? 1, settle = cl((home - 0.7) / 0.3), yk = cl(s.youK?.v ?? 0);
      // the pointer, in this canvas's square, with the drag's lag; apart bodies lean 35% of the way to it
      let want = 0;
      if (s.lean && !still) { s.hv = [0.5 + s.lean[0] * LEAN, 0.5 + s.lean[1] * LEAN]; want = 1; }
      else if (s.follow && !still && pointer.inside && now - pointer.at < 4000) {
        const r0 = el.getBoundingClientRect(), k0 = (halo.reach - 1) / 2, b = { left: r0.left + r0.width * k0 / halo.reach, top: r0.top + r0.height * k0 / halo.reach, width: r0.width / halo.reach, height: r0.height / halo.reach };
        if (b.width) { s.hv = s.hv.map((v, i) => lerp(v, i ? (pointer.y - b.top) / b.height : (pointer.x - b.left) / b.width, 1 - Math.exp(-dt / (dur("lag") / 1000)))); want = 1; }
      }
      s.pull = lerp(s.pull, want, 1 - Math.exp(-dt / (dur("lag") / 1000)));
      const pull = 0.35 * s.pull * cl((0.7 - home) / 0.1);
      const hx = cl(s.hv[0] * 0.5 + 0.25) * 2 - 0.5, hy = cl(s.hv[1] * 0.5 + 0.25) * 2 - 0.5;   // held to a box twice the canvas
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * 6.28 + t * 0.25;
        const wx = 0.5 + 0.27 * Math.cos(a + 0.35 * Math.sin(t * 0.7 + k)), wy = 0.5 + 0.26 * Math.sin(a + 0.3 * Math.cos(t * 0.5 + k));
        const ox = 0.5 + 0.13 * Math.cos((k / 6) * 6.28 + t * 0.05), oy = 0.54 + 0.12 * Math.sin((k / 6) * 6.28 + t * 0.05);
        c[k * 2] = lerp(lerp(wx, ox, home), hx, pull);
        c[k * 2 + 1] = lerp(lerp(wy, oy, home), hy, pull);
        for (let j = 0; j < 3; j++) col[k * 3 + j] = lerp(SIX[k][j], s.you[j], yk) / 255;
      }
      gl.viewport(0, 0, px, px);
      gl.uniform2f(u.res, px, px);
      gl.uniform2fv(u.c, c);
      gl.uniform3fv(u.col, col);
      gl.uniform1f(u.r, lerp(APART_R, 0.11, settle));
      gl.uniform1f(u.settle, settle);
      gl.uniform1f(u.br, 0.01 * Math.sin(t * 0.9));
      gl.uniform1f(u.blink, still ? 1 : ((t * 1.1) % 4.3) > 4.1 ? 0.15 : 1);
      gl.uniform1f(u.hlo, halo.lo); gl.uniform1f(u.hfall, halo.fall); gl.uniform1f(u.hgain, halo.gain); gl.uniform1f(u.hcarry, halo.carry);
      gl.uniform1f(u.hlight, halo.light); gl.uniform1f(u.hpool, halo.pool); gl.uniform1f(u.zoom, halo.reach); gl.uniform1f(u.asp, 1);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      s.dirty = false; drawn = now;
    };
    // still: one frame, and again only when a spring or the size asks; alive: 60 fps while it moves (a spring, apart,
    // following), 30 at rest (the breath, the drift, the blink); nothing while the page is hidden
    const loop = (now: number) => {
      raf = 0;
      if (document.hidden) return;
      const moving = !!(s.home?.on || s.youK?.on) || (s.home?.v ?? 1) < 1 || s.pull > 0.01;
      if (still ? s.dirty : now - drawn >= (moving ? 0 : 1000 / 30) - 2) draw(now);
      raf = requestAnimationFrame(loop);
    };
    const wake = () => { if (!raf && !document.hidden) raf = requestAnimationFrame(loop); };
    draw(performance.now());
    wake();
    document.addEventListener("visibilitychange", wake);
    const lost = (e: Event) => { e.preventDefault(); setFailed(true); };
    el.addEventListener("webglcontextlost", lost);
    return () => { cancelAnimationFrame(raf); raf = 0; document.removeEventListener("visibilitychange", wake); el.removeEventListener("webglcontextlost", lost); };
  }, [size, halo.reach === 1]);   // eslint-disable-line react-hooks/exhaustive-deps -- the canvas is remounted only when its wrapper comes or goes

  useEffect(() => () => { st.current.home?.stop(); st.current.youK?.stop(); }, []);
  // no WebGL2 (or the context was lost): the flat mark, so the place is never empty
  if (failed) return <Mark size={size} />;
  // a halo that reaches past the frame: the canvas grows round it, the frame's place in the layout stays `size`
  const big = size * halo.reach, off = (size - big) / 2;
  const canvas = <canvas ref={cv} className={`body-a ${className ?? ""}`} style={{ width: big, height: big, display: "block", ...(halo.reach !== 1 ? { position: "absolute", left: off, top: off } : {}) }} aria-hidden />;
  return halo.reach === 1 ? canvas : <span style={{ display: "block", position: "relative", width: size, height: size }}>{canvas}</span>;
}

// ── the jelly on the stage (#697): the takes the stage drives (stage/useJelly.ts), ported from the prototype's Jelly,
// jellyGo, birth and death (scratch/sol/stage/refs/play.html). Travel is the body above, moved, apart on the way with its
// six leaning where it goes (`lean`); birth and death are its six as dots in flight over the stage's layer, drawn by the
// same shader (never a CSS blob), the stage's layer as one wide canvas while they fly and no canvas otherwise.

/** six dots in flight: each from a point to a point, started at t0 (performance.now) and running ms on its curve; for
 *  the last `sink` ms they sink into where they land, their radius going to nothing (they slide in, they never fade);
 *  `dot` is their radius in px, the six's own apart (APART_R of the body's frame) */
export type Flight = { id: number; from: readonly Pt[]; to: readonly Pt[]; t0: number; ms: number; sink: number; ease: (p: number) => number; dot: number; halo: HaloLook };

/** one flight of the six, drawn on a canvas as wide as its parent. `onLand` when they start sinking in (the frame's warm
 *  pour starts then), `onDone` when they are gone; both come even with no WebGL2 or a page out of sight */
export function BodyDots({ flight, onLand, onDone }: { flight: Flight; onLand?: (id: number) => void; onDone?: (id: number) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const cb = useRef({ onLand, onDone }); cb.current = { onLand, onDone };
  useEffect(() => {
    const el = cv.current, fl = flight;
    let landed = false, done = false, raf = 0;
    const land = () => { if (!landed) { landed = true; cb.current.onLand?.(fl.id); } };
    const finish = () => { land(); if (!done) { done = true; cb.current.onDone?.(fl.id); } };
    // a page out of sight draws no frames: the flight still ends on time
    const left = Math.max(0, fl.t0 + fl.ms - performance.now());
    const tl = window.setTimeout(land, Math.max(0, left - fl.sink)), td = window.setTimeout(finish, left);
    const g = el ? setup(el) : null;
    if (!el || !g) { finish(); return () => { window.clearTimeout(tl); window.clearTimeout(td); }; }
    const { gl, u } = g;
    const c = new Float32Array(12), col = new Float32Array(18);
    for (let k = 0; k < 6; k++) for (let j = 0; j < 3; j++) col[k * 3 + j] = SIX[k][j] / 255;
    const h0 = fl.halo;
    const draw = (now: number) => {
      const t = now - fl.t0, p = cl(t / fl.ms), e = fl.ease(p);
      const w = el.clientWidth, h = el.clientHeight, dpr = window.devicePixelRatio || 1;
      if (!w || !h) return p < 1;
      const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
      if (el.width !== pw || el.height !== ph) { el.width = pw; el.height = ph; }
      const asp = w / h;
      for (let k = 0; k < 6; k++) {
        const a = fl.from[k] ?? fl.from[0], b = fl.to[k] ?? fl.to[0];
        c[k * 2] = 0.5 + (lerp(a.x, b.x, e) / w - 0.5) * asp;
        c[k * 2 + 1] = lerp(a.y, b.y, e) / h;
      }
      const sink = fl.sink > 0 ? cl((t - (fl.ms - fl.sink)) / fl.sink) : p;
      if (sink > 0) land();
      gl.viewport(0, 0, pw, ph);
      gl.uniform2f(u.res, pw, ph);
      gl.uniform2fv(u.c, c);
      gl.uniform3fv(u.col, col);
      gl.uniform1f(u.r, (fl.dot / h) * (1 - sink));
      gl.uniform1f(u.settle, 0); gl.uniform1f(u.br, 0); gl.uniform1f(u.blink, 1);
      // the halo the body wears while it does this, without its pool: the pool is a light under one body, not a stripe
      // across the stage
      gl.uniform1f(u.hlo, h0.lo); gl.uniform1f(u.hfall, h0.fall); gl.uniform1f(u.hgain, h0.gain); gl.uniform1f(u.hcarry, h0.carry);
      gl.uniform1f(u.hlight, h0.light); gl.uniform1f(u.hpool, 0); gl.uniform1f(u.zoom, 1); gl.uniform1f(u.asp, asp);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      // only the pixels round each dot are drawn: a box as far as its halo reaches (the field falls to the halo's lo at
      // r / √lo), the field of all six evaluated in each, so where two meet the goo is whole. The stage's other
      // pixels cost nothing, which is what lets the layer be the whole stage
      const reach = Math.ceil(((fl.dot * (1 - sink)) / Math.sqrt(Math.max(h0.lo, 0.01)) + 2) * dpr);
      if (reach > 2 * dpr) {
        gl.enable(gl.SCISSOR_TEST);
        for (let k = 0; k < 6; k++) {
          const x = Math.round(((c[k * 2] - 0.5) / asp + 0.5) * pw), y = Math.round(ph - c[k * 2 + 1] * ph);
          gl.scissor(x - reach, y - reach, 2 * reach, 2 * reach);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        gl.disable(gl.SCISSOR_TEST);
      }
      return p < 1;
    };
    const loop = (now: number) => { raf = 0; if (draw(now)) raf = requestAnimationFrame(loop); else finish(); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(tl); window.clearTimeout(td); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps -- a flight is drawn as it was launched; a new one is a new key
  return <canvas ref={cv} aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", pointerEvents: "none" }} />;
}

/** what the stage's jelly looks like this moment: its frame's size, apart or settled, the lean while it travels, the
 *  halo of what it is doing, and the flights of its six in the air */
export type JellyLook = { size: number; state: BodyState; lean: readonly [number, number] | null; halo: HaloLook; flights: readonly Flight[] };

/** the stage's jelly layer: laid over the stage (inset 0, never in the way of a press), the dots' flights under the body.
 *  `place` is the body's box, which the hook's springs move (translate), so a move draws no React */
export function JellyLayer({ look, place, onLand, onDone }: {
  look: JellyLook; place: (el: HTMLDivElement | null) => void; onLand?: (id: number) => void; onDone?: (id: number) => void;
}) {
  return (
    <div className="jelly-layer" aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {look.flights.map((f) => <BodyDots key={f.id} flight={f} onLand={onLand} onDone={onDone} />)}
      <div ref={place} style={{ position: "absolute", left: 0, top: 0, width: look.size, height: look.size }}>
        <Body size={look.size} state={look.state} lean={look.lean} halo={look.halo} />
      </div>
    </div>
  );
}

/** the halo the jelly wears while it does this (tokens.json, palette.looks.halo.states; kit/Halo.tsx's haloOf, read here
 *  from the tokens so the kit and the body do not import each other) */
export const haloDoing = (doing: keyof typeof LOOKS.halo.states): HaloLook => LOOKS.halo.takes[LOOKS.halo.states[doing]];

/** Mark, or the body in its place when `sol.body.a` is on. `notch`: the notch window, whose hover the app tells it
 *  (notch-hover; the webview's own hover sleeps while the window is not key). The body comes apart while hovered and
 *  its six follow the pointer; it wears the seat's colour while Sol is with you (the creature's here). */
export function BodyMark({ size, live: alive, notch }: { size: number; live?: boolean; notch?: boolean }) {
  const on = useBodyA();
  if (!on) return <Mark size={size} live={alive} />;
  return <BodyHere size={size} notch={!!notch} />;
}

/** the body itself, whatever the switch says: for a place that is the jelly's by design (the spine, behind sol.spine).
 *  `six`: always its six colours, never the seat's (Marco 2026-11-08: "where's the original beautiful colors") */
export const BodyLive = BodyHere;
const FRAME = 1.75;
function BodyHere({ size, notch, six }: { size: number; notch: boolean; six?: boolean }) {
  const cr = useCreature();
  const [hov, setHov] = useState(false);
  useEffect(() => {
    if (!notch || !(window as any).__TAURI_INTERNALS__) return;
    let off: (() => void) | null = null, gone = false;
    import("@tauri-apps/api/event").then((ev) => ev.listen<boolean>("notch-hover", (e) => setHov(!!e.payload)))
      .then((f) => { if (gone) f(); else off = f; }).catch(() => {});
    return () => { gone = true; off?.(); };
  }, [notch]);
  const state: BodyState = devState ? (devState === "apart" ? "apart" : "settled") : hov ? "apart" : "settled";
  const you = devState ? (devState === "you" ? GRADIENTS.home[0] : null) : !six && cr.state === "here" ? GRADIENTS[cr.seat][0] : null;
  // the sketch's frame keeps half its width for the six apart, so the settled body is about half the frame: the frame is
  // drawn FRAME times the slot, centred on it, so the settled body is the mark's size and the six reach past the slot
  const f = Math.round(size * FRAME), off = (size - f) / 2;
  return (
    <span style={{ display: "inline-block", position: "relative", width: size, height: size, verticalAlign: "top", pointerEvents: notch ? undefined : "auto" }}
      onPointerEnter={notch ? undefined : () => setHov(true)} onPointerLeave={notch ? undefined : () => setHov(false)}>
      <span style={{ position: "absolute", left: off, top: off }}><Body size={f} state={state} you={you} follow /></span>
    </span>
  );
}
