// The jelly's material for things that are not the jelly (#674, the ring's takes): the same field, the same light and
// the same shade as Body.tsx's shader (its geo, its A shade: the key light from the upper left, the white mixed in at the
// rim, the tight specular, the soft halo outside), drawn for any set of blobs, a liquid floor that can rise with a
// meniscus, and a disc it can be held in. No face: this is the jelly's goo, never the jelly. Still, one frame: the kit
// is shot at rest. Dev only, the kit stage's.
import { useEffect, useRef } from "react";

export type Blob = { x: number; y: number; r: number };
export type Tint = { x: number; y: number; c: string };
/** blobs: the field's sources (0..1 of the canvas); tints: where each colour sits (the colour of a pixel is its nearest
 *  tints, blended); level: a liquid floor's surface (y, 0..1; none when absent) and its meniscus up the disc's wall; disc:
 *  the radius of the glass disc it is held in, centred (none when absent); halo: the light outside, as Body's HALO */
export type Pour = { blobs: Blob[]; tints: Tint[]; level?: number; meniscus?: number; disc?: number; halo?: number };

const VERT = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `#version 300 es
precision highp float;
uniform vec2 res;
uniform vec3 b[8]; uniform int nb;
uniform vec2 tp[8]; uniform vec3 tc[8]; uniform int nt;
uniform float level, men, disc, hgain;
out vec4 o;
const vec3 L = normalize(vec3(-0.55, -0.7, 0.6));
const vec3 W = vec3(1.0);
float field(vec2 q) {
  float f = 0.0;
  for (int k = 0; k < 8; k++) { if (k >= nb) break; vec2 d = q - b[k].xy; f += b[k].z * b[k].z / (dot(d, d) + 1e-5); }
  if (level > -1.0) {
    // the floor: a field that passes 1 at its surface; up the wall (inside the disc) the surface climbs, the meniscus
    float wd = disc > 0.0 ? max(0.0, disc - length(q - 0.5)) : 1.0;
    float s = level - men * exp(-wd / 0.07);
    f += exp((q.y - s) * 24.0);
  }
  return f;
}
vec3 colour(vec2 q) {
  vec3 s = vec3(0.0); float w = 1e-6;
  for (int k = 0; k < 8; k++) { if (k >= nt) break; vec2 d = q - tp[k]; float v = 1.0 / pow(dot(d, d) + 0.004, 1.5); s += tc[k] * v; w += v; }
  return s / w;
}
void main() {
  vec2 q = vec2(gl_FragCoord.x / res.x, 1.0 - gl_FragCoord.y / res.y);
  float e = 0.004, f = field(q);
  float fx = field(q + vec2(e, 0.0)) - field(q - vec2(e, 0.0)), fy = field(q + vec2(0.0, e)) - field(q - vec2(0.0, e));
  vec3 m = colour(q);
  float slope = length(vec2(fx, fy)) / (2.0 * e) / res.x;
  float cov = clamp(0.5 + (f - 1.0) / max(slope, 1e-4), 0.0, 1.0);
  float g = clamp((f - 0.42) / 0.58, 0.0, 1.0), ha = pow(g, 1.4) * hgain;
  vec2 u = gl_FragCoord.xy / res;
  vec4 halo = vec4(m * ha, 0.0) * smoothstep(0.0, 0.16, min(min(u.x, 1.0 - u.x), min(u.y, 1.0 - u.y)));
  float ff = max(f, 1.0 + 1e-4), z = sqrt(1.0 - 1.0 / ff);
  vec2 h = vec2(fx, fy) / (ff * ff), zz = h / (2.0 * z + 1e-3);
  vec3 n = normalize(vec3(-zz * 1.6, 0.55));
  float d = max(0.0, dot(n, L));
  vec3 rf = 2.0 * d * n - L;
  float core = clamp((f - 1.0) / 1.4, 0.0, 1.0);
  vec3 base = mix(mix(m, W, 0.42), m, core * 0.5);
  float rim = pow(max(0.0, 1.0 - n.z), 2.2);
  vec3 inC = min(vec3(1.0), base * (0.6 + 0.3 * d + 0.25 * core));
  inC = mix(inC, W, min(1.0, pow(max(0.0, rf.z), 40.0) * 0.9 + rim * 0.35));
  o = mix(halo, vec4(inC, 1.0), cov);
  if (disc > 0.0) { float px = 1.0 / res.x; o *= clamp((disc - length(q - 0.5)) / px + 0.5, 0.0, 1.0); }
}`;

const rgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

export function Liquid({ size, pour }: { size: number; pour: Pour }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = cv.current;
    const gl = el?.getContext("webgl2", { premultipliedAlpha: true, antialias: false, alpha: true });
    if (!el || !gl) return;
    const sh = (t: number, src: string) => { const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn("liquid:", gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(pr); gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(pr, "p");
    gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(pr, n);
    const px = Math.round(size * (window.devicePixelRatio || 1));
    el.width = px; el.height = px;
    gl.viewport(0, 0, px, px);
    gl.uniform2f(u("res"), px, px);
    const B = pour.blobs.slice(0, 8), T = pour.tints.slice(0, 8);
    if (B.length) gl.uniform3fv(u("b"), new Float32Array(B.flatMap((k) => [k.x, k.y, k.r])));
    gl.uniform1i(u("nb"), B.length);
    gl.uniform2fv(u("tp"), new Float32Array(T.flatMap((k) => [k.x, k.y])));
    gl.uniform3fv(u("tc"), new Float32Array(T.flatMap((k) => rgb(k.c))));
    gl.uniform1i(u("nt"), T.length);
    gl.uniform1f(u("level"), pour.level ?? -2);
    gl.uniform1f(u("men"), pour.meniscus ?? 0);
    gl.uniform1f(u("disc"), pour.disc ?? 0);
    gl.uniform1f(u("hgain"), pour.halo ?? 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }, [size, pour]);
  return <canvas ref={cv} style={{ width: size, height: size, display: "block" }} aria-hidden />;
}
