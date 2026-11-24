// The jelly, Sol's body, on the website. This is the app's own shader and numbers (sol/mac/src/Body.tsx), carried over
// line for line, not a drawing of it: six bodies, one per AI, each its colour, that fly in and fuse into one body with
// one face. It replaces the first site's pixel creature everywhere.
//
//   SolJelly.mount(el, { size, state, birth, hover, follow, halo, material, six, own })
//     size      px of the settled body, the mark's size (default: el's width, else 24)
//     state     'settled' (one body, a face) or 'apart' (the six, circling)                     default 'settled'
//     birth     start apart and fuse the first time it comes on screen
//     hover     comes apart while the pointer is over `el` (or over hover, when it is an element) and follows it
//     follow    while apart, the six lean toward the pointer
//     halo      null (the notch's own small glow) or a take: 'breath' at rest, 'close' working, 'pool' arriving
//     material  'mark' (850 ms, 1.03 overshoot) or 'full', the stage's (760 ms, 1.075)
//     own       its own WebGL canvas. Default: only with a halo take, whose light is additive and has to reach the page
//               untouched. Every other jelly is drawn by one shared context and copied in, so a page can hold dozens.
//               Over a bright ground (the ending's sun) pass own: false: Safari turns that added light teal there,
//               seen 2026-11-16; the likely cause is light brighter than its alpha, which the copy clamps.
//   → { el, set(state), halo(take), home(x), size(px), destroy() }
//     home(x)   hold it at x, 0 apart .. 1 settled, off the spring (for a scroll that drives it); home(null) lets go
//
//   SolJelly.dots(el, { dot }) → { put(points, dot), clear(), destroy() }
//     six free bodies on a canvas laid over `el`: points are six [x, y] in el's px, dot their radius. They fuse where
//     they meet. The caller draws each frame (the app's BodyDots).
//
// 60 frames a second while it moves, 30 at rest, none off screen or in a hidden tab. Reduced motion: drawn settled, once.
// No WebGL2: the still (SolJelly.still).
const SolJelly = (() => {
  const SIX = ['#ff2e4e', '#ff4888', '#fb7129', '#f89b2a', '#f4c82a', '#70df45'];
  const HALO = { lo:.45, fall:2.2, gain:.55, carry:.8, light:0, pool:0, reach:1 };
  const TAKES = {
    breath: { lo:.1,  fall:1.25, gain:.62, carry:.9,  light:.6, pool:0,  reach:1.6 },
    close:  { lo:.42, fall:1.15, gain:.78, carry:1,   light:1,  pool:0,  reach:1.25 },
    pool:   { lo:.32, fall:1.8,  gain:.6,  carry:.85, light:.8, pool:.6, reach:1.45 },
  };
  const MATERIAL = { mark: { moveMs:850, overshoot:1.03 }, full: { moveMs:760, overshoot:1.075 } };
  const FRAME = 1.75;          // the canvas is this many times the slot, so the settled body is the mark's size
  const LAG = .14;             // seconds the six trail the pointer by
  // browsers keep about sixteen WebGL contexts a page on a desk and eight on a phone; past this a jelly shares
  // (the home page asks for nine)
  const MAX_OWN = matchMedia('(pointer: coarse)').matches ? 6 : 12;

  const VERT = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
  const FRAG = `#version 300 es
precision highp float;
uniform vec2 res;          // pixels
uniform vec2 c[6];         // the six centres this frame
uniform vec3 col[6];       // their colours, 0..1
uniform float r, settle, br, blink;
uniform float hlo, hfall, hgain, hcarry, hlight, hpool, zoom;
uniform float asp;
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
  q.x = 0.5 + (q.x - 0.5) * asp;
  float e = 0.004;
  float f = field(q);
  float fx = field(q + vec2(e, 0.0)) - field(q - vec2(e, 0.0)), fy = field(q + vec2(0.0, e)) - field(q - vec2(0.0, e));
  vec3 m = colour(q);
  float slope = length(vec2(fx, fy)) / (2.0 * e) * zoom / res.y;
  float cov = clamp(0.5 + (f - 1.0) / max(slope, 1e-4), 0.0, 1.0);
  float g = clamp((f - hlo) / (1.0 - hlo), 0.0, 1.0), ha = pow(g, hfall) * hgain;
  float pl = hpool * exp(-pow((q.x - 0.5) / 0.3, 2.0) - pow((q.y - 0.8) / 0.05, 2.0));
  float fe = zoom > 1.001 ? smoothstep(0.0, 0.14, min(min(u.x, 1.0 - u.x), min(u.y, 1.0 - u.y))) : 1.0;
  vec3 hc = mix(W, m, hcarry);
  vec4 halo = vec4(hc * ha + m * pl, (ha + pl) * (1.0 - hlight)) * fe;
  float ff = max(f, 1.0 + 1e-4), z = sqrt(1.0 - 1.0 / ff);
  vec2 h = vec2(fx, fy) / (ff * ff), zz = h / (2.0 * z + 1e-3);
  vec3 n = normalize(vec3(-zz * 1.6, 0.55));
  float d = max(0.0, dot(n, L));
  vec3 rf = 2.0 * d * n - L;
  float core = clamp((f - 1.0) / 1.4, 0.0, 1.0);
  vec3 base = mix(mix(m, W, 0.42), m, core * 0.5);
  float rim = pow(max(0.0, 1.0 - n.z), 2.2);
  float b = 0.6 + 0.3 * d + 0.25 * core;
  vec3 inC = min(vec3(1.0), base * b);
  float sp = pow(max(0.0, rf.z), 40.0);
  inC = mix(inC, W, min(1.0, sp * 0.9 + rim * 0.35));
  float s = clamp((settle - 0.5) / 0.5, 0.0, 1.0);
  if (s > 0.001) {
    float pe = sqrt(min(pill(q, vec2(0.47, 0.49), s), pill(q, vec2(0.58, 0.49), s)));
    float w = max(fwidth(pe), 1e-4);
    inC = mix(inC, W, clamp((sqrt(1.6) - pe) / w + 0.5, 0.0, 1.0));
    inC = mix(inC, vec3(20.0, 20.0, 26.0) / 255.0, clamp((1.0 - pe) / w + 0.5, 0.0, 1.0));
  }
  o = mix(halo, vec4(inC, 1.0), cov);
}`;
  const NAMES = ['res', 'c', 'col', 'r', 'settle', 'br', 'blink', 'hlo', 'hfall', 'hgain', 'hcarry', 'hlight', 'hpool', 'zoom', 'asp'];

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rgb = hexes => new Float32Array(hexes.flatMap(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)));
  /* the app's springOf: a spring that takes moveMs to its first peak and passes its mark by `overshoot` */
  function springOf({ moveMs, overshoot }) {
    const l = Math.log(overshoot - 1), z = -l / Math.sqrt(Math.PI * Math.PI + l * l), wd = Math.PI / (moveMs / 1000), wn = wd / Math.sqrt(1 - z * z);
    return { k: wn * wn, c: 2 * z * wn };
  }

  /* one WebGL2 program on a canvas; draw() fills its lower-left pw × ph */
  function gpu(canvas) {
    let gl = null;
    try { gl = canvas.getContext('webgl2', { premultipliedAlpha:true, antialias:false, alpha:true }); } catch (e) {}
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    function build() {
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
      gl.useProgram(p);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const a = gl.getAttribLocation(p, 'p'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      const U = {}; NAMES.forEach(n => U[n] = gl.getUniformLocation(p, n));
      return U;
    }
    let U = build(); if (!U) return null;
    const g = { lost: false, canvas,
      draw(pw, ph, u) {
        if (g.lost) return false;
        const H = u.halo;
        gl.viewport(0, 0, pw, ph); gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, pw, ph);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(U.res, pw, ph); gl.uniform2fv(U.c, u.c); gl.uniform3fv(U.col, u.col);
        gl.uniform1f(U.r, u.r); gl.uniform1f(U.settle, u.settle); gl.uniform1f(U.br, u.br); gl.uniform1f(U.blink, u.blink);
        gl.uniform1f(U.hlo, H.lo); gl.uniform1f(U.hfall, H.fall); gl.uniform1f(U.hgain, H.gain); gl.uniform1f(U.hcarry, H.carry);
        gl.uniform1f(U.hlight, H.light); gl.uniform1f(U.hpool, H.pool); gl.uniform1f(U.zoom, u.zoom); gl.uniform1f(U.asp, u.asp);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        return true;
      },
      free() { gl.getExtension('WEBGL_lose_context')?.loseContext(); },
    };
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); g.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { U = build(); g.lost = !U; });
    return g;
  }

  /* the shared one: drawn off screen, copied into each jelly's own 2D canvas */
  let shared, owned = 0, asked = 0;
  function share() {
    if (shared === undefined) shared = gpu(document.createElement('canvas'));
    return shared;
  }
  function pen(canvas, own) {
    if (own) asked++;
    if (own && owned < MAX_OWN) { const g = gpu(canvas); if (g) { owned++; return { g, own: true }; } }
    const g = share(); if (!g) return null;
    return { g, own: false, ctx: canvas.getContext('2d') };
  }
  function paint(p, canvas, pw, ph, u) {
    if (p.own) return p.g.draw(pw, ph, u);
    const s = p.g.canvas;
    if (s.width < pw || s.height < ph) { s.width = Math.max(s.width, pw); s.height = Math.max(s.height, ph); }
    if (!p.g.draw(pw, ph, u)) return false;
    p.ctx.clearRect(0, 0, pw, ph); p.ctx.drawImage(s, 0, s.height - ph, pw, ph, 0, 0, pw, ph);
    return true;
  }
  const dpr = () => Math.min(3, devicePixelRatio || 1);

  /* ---------- one clock for every jelly on the page ---------- */
  const live = new Set(), seen = new Map();
  const io = new IntersectionObserver(es => es.forEach(e => { const j = seen.get(e.target); if (j) { j.on = e.isIntersecting; if (j.on) { j.born?.(); kick(); } } }), { rootMargin: '80px' });
  let raf = 0, last = 0, n = 0, ptr = null;
  addEventListener('pointermove', e => { ptr = { x: e.clientX, y: e.clientY }; }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  function kick() { if (!raf && !still && !document.hidden) { last = performance.now() / 1000; raf = requestAnimationFrame(tick); } }
  function tick(now) {
    raf = 0; const t = now / 1000, dt = Math.min(.05, Math.max(0, t - last)); last = t; n++;
    let any = false;
    for (const j of live) { if (!j.on) continue; any = true; j.step(t, dt); if (j.moving || n % 2 === 0) j.draw(t); }
    if (any && !document.hidden) raf = requestAnimationFrame(tick);
  }

  function mount(el, o = {}) {
    let size = o.size || el.clientWidth || 24;
    const wrap = document.createElement('span'); wrap.className = 'soljelly'; wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = `position:relative;display:inline-block;flex:none;vertical-align:middle;width:${size}px;height:${size}px`;
    const canvas = document.createElement('canvas'); canvas.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:block;pointer-events:none';
    wrap.append(canvas); el.append(wrap);
    const p = pen(canvas, o.own ?? !!o.halo);
    if (!p) {                                             // no WebGL2: the still
      canvas.remove(); wrap.innerHTML = `<img src="${api.still}" alt="" style="width:100%;height:100%;object-fit:contain;mix-blend-mode:screen">`;
      return { el: wrap, set() {}, halo() {}, home() {}, size(px) { wrap.style.width = wrap.style.height = px + 'px'; }, destroy() { wrap.remove(); } };
    }
    const S = springOf(MATERIAL[o.material] || MATERIAL.mark), col = rgb(o.six || SIX);
    const u = { c: new Float32Array(12), col, r: .11, settle: 1, br: 0, blink: 1, halo: { ...(TAKES[o.halo] || HALO) }, zoom: 1, asp: 1 };
    let want = TAKES[o.halo] || HALO, state = o.state === 'apart' ? 'apart' : 'settled', over = false;
    let home = state === 'apart' || (o.birth && !still) ? 0 : 1, to = o.birth && !still ? 0 : home, v = 0, hold = null;
    let pull = 0, hx = .5, hy = .5, px = 0, laid = 0;
    const rest = () => state === 'apart' ? 0 : 1;
    function lay() {
      // a small one on a 1x screen is drawn at twice its size and scaled down: at a few pixels a body, each of the six
      // shows as a ring (dark middle, pale rim) instead of a soft bead
      const css = size * FRAME * u.halo.reach, d = Math.round(css * Math.max(dpr(), size < 64 ? 2 : 1));
      canvas.style.width = canvas.style.height = css + 'px';
      if (canvas.width !== d) canvas.width = canvas.height = d;
      px = d; laid = u.halo.reach;
    }
    const j = {
      on: false, moving: true,
      born: o.birth ? () => { j.born = null; setTimeout(() => { to = over ? 0 : rest(); kick(); }, 260); } : null,
      step(t, dt) {
        if (hold != null) { v = 0; j.moving = Math.abs(home - hold) > 1e-4; home = hold; }
        else {
          for (let i = 0; i < 4; i++) { const a = -S.k * (home - to) - S.c * v; v += a * dt / 4; home += v * dt / 4; }
          j.moving = Math.abs(home - to) > .002 || Math.abs(v) > .002;
          if (!j.moving) { home = to; v = 0; }
        }
        const follow = (over || o.follow) && ptr, k = 1 - Math.exp(-dt / LAG);
        let tx = .5, ty = .5;
        if (follow && home < .7) { const b = canvas.getBoundingClientRect(); tx = (ptr.x - b.left) / b.width; ty = (ptr.y - b.top) / b.height; }
        hx += (tx - hx) * k; hy += (ty - hy) * k; pull += ((follow ? 1 : 0) - pull) * k;
        if (pull > .01 && home < .7) j.moving = true;
        let turning = false;
        for (const key in want) { const d = want[key] - u.halo[key]; if (Math.abs(d) > .002) { u.halo[key] += d * (1 - Math.exp(-dt / .09)); turning = true; } else u.halo[key] = want[key]; }
        if (turning) j.moving = true;
        if (Math.abs(u.halo.reach - laid) > .004) lay();
      },
      draw(t) {
        const settle = clamp((home - .7) / .3), pl = .35 * pull * clamp((.7 - home) / .1);
        // the app lets the pull reach half a frame past the edge; here a far pointer would drag the six out of the
        // canvas and cut them, so the pull stops at the frame
        const gx = clamp(hx, .04, .96), gy = clamp(hy, .04, .96);
        for (let k = 0; k < 6; k++) {
          const a = k / 6 * 6.28 + t * .25;
          const wx = .5 + .27 * Math.cos(a + .35 * Math.sin(t * .7 + k)), wy = .5 + .26 * Math.sin(a + .3 * Math.cos(t * .5 + k));
          const ox = .5 + .13 * Math.cos(k / 6 * 6.28 + t * .05), oy = .54 + .12 * Math.sin(k / 6 * 6.28 + t * .05);
          u.c[k * 2] = lerp(lerp(wx, ox, home), gx, pl); u.c[k * 2 + 1] = lerp(lerp(wy, oy, home), gy, pl);
        }
        u.r = lerp(.085, .11, settle); u.settle = settle; u.zoom = u.halo.reach;
        u.br = still ? 0 : .01 * Math.sin(t * .9); u.blink = !still && (t * 1.1) % 4.3 > 4.1 ? .15 : 1;
        paint(p, canvas, px, px, u);
      },
    };
    const once = () => { if (still) { home = hold ?? to; u.halo = { ...want }; lay(); } j.draw(still ? 0 : performance.now() / 1000); };
    lay(); once();
    live.add(j); seen.set(wrap, j); io.observe(wrap);
    const hot = o.hover instanceof Element ? o.hover : o.hover ? el : null;
    const enter = () => { over = true; if (hold == null && !still) { to = 0; kick(); } };
    const leave = () => { over = false; if (!j.born) to = rest(); kick(); };
    hot?.addEventListener('pointerenter', enter); hot?.addEventListener('pointerleave', leave);
    return {
      el: wrap,
      set(s) { state = s === 'apart' ? 'apart' : 'settled'; j.born = null; if (!over) to = rest(); still ? once() : kick(); },
      halo(name) { want = TAKES[name] || HALO; still ? once() : kick(); },
      home(x) { hold = x == null ? null : clamp(x); if (hold == null) { to = over ? 0 : rest(); } still ? once() : kick(); },
      size(s) { size = s; wrap.style.width = wrap.style.height = s + 'px'; lay(); once(); },
      destroy() { live.delete(j); seen.delete(wrap); io.unobserve(wrap); hot?.removeEventListener('pointerenter', enter); hot?.removeEventListener('pointerleave', leave);
                  if (p.own) { p.g.free(); owned--; } wrap.remove(); },
    };
  }

  /* six free bodies over `el` (the app's BodyDots): the caller places them each frame */
  function dots(el, o = {}) {
    const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
    el.append(canvas);
    const p = pen(canvas, o.own ?? true);
    const u = { c: new Float32Array(12), col: rgb(o.six || SIX), r: .02, settle: 0, br: 0, blink: 1, halo: { ...HALO, ...(o.halo || {}) }, zoom: 1, asp: 1 };
    return {
      el: canvas,
      put(points, dot = o.dot || 10) {
        if (!p) return;
        const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
        const d = dpr(), pw = Math.round(w * d), ph = Math.round(h * d);
        if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
        u.asp = w / h; u.r = dot / h;
        for (let k = 0; k < 6; k++) { const q = points[k] || [-9999, -9999]; u.c[k * 2] = .5 + (q[0] / w - .5) * u.asp; u.c[k * 2 + 1] = q[1] / h; }
        paint(p, canvas, pw, ph, u);
      },
      clear() { if (!p) return; if (p.own) this.put([], 1); else p.ctx.clearRect(0, 0, canvas.width, canvas.height); },
      destroy() { if (p?.own) { p.g.free(); owned--; } canvas.remove(); },
    };
  }

  const api = { mount, dots, SIX, HALO, TAKES, FRAME, still: 'media/jelly.png', get ok() { return !!share(); }, get owned() { return owned; }, get asked() { return asked; } };
  return api;
})();
