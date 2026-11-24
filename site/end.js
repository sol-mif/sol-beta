// The ending, "Good morning." (end.css has the layers). The pick of 2026-11-17: the six come home (options D), then
// the jelly is the sun (options B). One sequence, played once the first time the section is well in view, on its own
// clock that only runs while the section is on screen, so it waits for the visitor if they scroll away mid-way:
//   0.0 s   the night. The six, one per AI and each in its colour, come in one by one from the edges of the band above
//           the words (380 ms apart, 1.7 s each, bending upward so they never cross the words). They travel on one
//           layer (SolJelly.dots, the app's BodyDots), so two that pass close fuse a little, as the jelly does.
//   3.6 s   all six are in their places, circling: the places the jelly's six keep when apart (jelly.js, draw)
//   4.05 s  handed to the jelly itself, at the same places, so the hand-off does not show; 0.3 s later it fuses into
//           one body with its face, lighting the ground under it (pool), then settles into its breath
//   4.7 s   its light grows out of it, from a spark to the whole ground (5.2 s); from 5.5 s the ground behind it goes
//           from the night to the pearl through a sunrise's colours (4.6 s), so it never passes through grey.
//           Each line of words turns from pearl to deep at the moment the ground behind it passes the middle (it is
//           worked out here from the same colours the layers are drawn with).
//  10.1 s   at rest: the morning. The frame loop stops. Over the jelly it comes apart and follows the pointer; pressing
//           the download plays its working light once while the browser opens the install guide (never held back).
// Every jelly here is drawn through the shared WebGL context (own: false): the ground ends bright, and Safari turns an
// own canvas's light teal over a bright ground (jelly.js header). Reduced motion, or no WebGL: the morning, at once.
// The words are all in index.html (#end); nothing here is read by a visitor.
(() => {
  const end = document.getElementById('end'); if (!end) return;
  const $ = s => end.querySelector(s);
  const box = $('.endjelly'), el = $('.rise'), field = $('.end-field'), day = $('.end-day'), light = $('.end-light'), dusk = $('.end-dusk');
  const LINES = [$('h2'), $('p'), $('footer.foot')];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T = { gap: 380, trip: 1700, orbit: 450, fuse: 300, light: 4700, lightFor: 5200, breath: 6200, day: 5500, dayFor: 4600 };
  T.handoff = 5 * T.gap + T.trip + T.orbit; T.rest = Math.max(T.light + T.lightFor, T.day + T.dayFor);

  /* the colours of the sky, one source for drawing it and for reading it behind the words */
  const GROW = 8;                                       // end.css draws the glow at 1/8 of its full size
  const FADE = 260;                                     // px at the top where the sky fades to the night above
  // the day: the whole ground goes from the night to the pearl through a sunrise's colours (A's), never through grey
  const DAY = [[0, [3, 3, 3]], [.22, [42, 15, 12]], [.45, [128, 56, 48]], [.66, [214, 130, 104]], [.84, [242, 200, 174]], [1, [239, 234, 226]]];
  // the glow: the jelly's warm colours from the hot middle out, coral at the rim (never mauve over the night), to nothing
  const GLOW = [[0, [255, 244, 222, 1]], [.04, [255, 220, 164, 1]], [.1, [248, 184, 92, 1]], [.19, [243, 164, 115, .92]],
                [.32, [236, 132, 98, .55]], [.46, [222, 118, 88, .2]], [.62, [222, 118, 88, 0]]];
  const css = (s, f) => s.map(([at, c]) => `${f(c)} ${(at * 100).toFixed(1)}%`).join(', ');
  end.style.setProperty('--fade', FADE + 'px');
  light.style.background = `radial-gradient(closest-side, ${css(GLOW, c => `rgba(${c})`)})`;

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const at = (stops, x) => { for (let i = 1; i < stops.length; i++) if (x <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i]; return mix(ca, cb, (x - a) / (b - a || 1)); } return stops[stops.length - 1][1]; };
  const lum = c => { const f = v => (v /= 255) <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const ratio = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  const PEARL = lum([239, 234, 226]), DEEP = lum([20, 20, 22]);
  const sky = { d: 0, s: .03, o: 0 };                   // how far the day has come, the glow's scale and strength
  const vmax = () => Math.max(innerWidth, innerHeight) / 100;
  function ground(x, y) {
    const m = Math.pow(clamp(y / FADE), 1.6), cx = parseFloat(end.style.getPropertyValue('--cx')), cy = parseFloat(end.style.getPropertyValue('--cy')), r = Math.hypot(x - cx, y - cy);
    const g = at(GLOW, clamp(r / (85 * vmax() * sky.s))), c = mix([3, 3, 3], at(DAY, sky.d), m);
    return mix(c, g.slice(0, 3), g[3] * sky.o * m);
  }
  function read() {                                     // which colour reads better on each line's ground, right now
    const s = end.getBoundingClientRect();
    LINES.forEach(n => { const r = n.getBoundingClientRect(), L = lum(ground(r.left - s.left + r.width / 2, r.top - s.top + r.height / 2));
      n.classList.toggle('lit', ratio(DEEP, L) > ratio(PEARL, L)); });
  }
  function paint() {
    day.style.background = `rgb(${at(DAY, sky.d).map(Math.round)})`; dusk.style.opacity = sky.d; light.style.opacity = sky.o; light.style.transform = `scale(${sky.s * GROW})`; read();
  }

  /* where things are: the jelly's centre (the glow's too), the band above the words the six fly in */
  const size = () => Math.round(Math.max(64, box.clientWidth * .22));
  function lay() {
    const s = end.getBoundingClientRect(), b = box.getBoundingClientRect(), h = LINES[0].getBoundingClientRect();
    end.style.setProperty('--cx', (b.left - s.left + b.width / 2) + 'px');
    end.style.setProperty('--cy', (b.top - s.top + b.height * .47) + 'px');
    end.style.setProperty('--field', Math.max(80, h.top - s.top - 4) + 'px');
  }
  lay();

  const has = typeof SolJelly !== 'undefined';
  if (!has) el.innerHTML = `<img src="media/jelly.png" alt="" style="width:${size()}px;display:block">`;
  const j = has ? SolJelly.mount(el, { size: size(), state: still ? 'settled' : 'apart', halo: still ? 'breath' : null, material: 'full', own: false, hover: true }) : null;
  // the page above it settles as its sections load and the window can change: keep the centre, the band and the size true
  let rz = 0; new ResizeObserver(() => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { j?.size(size()); lay(); paint(); }); }).observe(end);

  function morning() {                                  // the finished state
    sky.d = 1; sky.s = 1; sky.o = 1; end.classList.remove('away'); end.classList.add('rest'); paint();
  }
  if (still || !has || !SolJelly.ok) { j?.set('settled'); j?.halo('breath'); morning(); return; }

  /* the six on their way: from the band's edges to their places around the jelly */
  end.classList.add('away');
  let dots = SolJelly.dots(field, { own: false, dot: .085 * 1.75 * size() });
  function places(t) {                                  // jelly.js, draw: where its six sit when apart, in field px
    const f = field.getBoundingClientRect(), w = j.el.getBoundingClientRect(), cx = w.left - f.left + w.width / 2, cy = w.top - f.top + w.height / 2, R = 1.75 * size();
    return Array.from({ length: 6 }, (_, k) => {
      const a = k / 6 * 6.28 + t * .25;
      return [cx + .27 * Math.cos(a + .35 * Math.sin(t * .7 + k)) * R, cy + .26 * Math.sin(a + .3 * Math.cos(t * .5 + k)) * R];
    });
  }
  // where each comes from, as fractions of the band: the left and right edges and the top, so they arrive from all round
  const FROM = [[-.08, .38], [.34, -.2], [1.08, .3], [1.08, .74], [.68, -.2], [-.08, .78]];
  const ORDER = [0, 2, 4, 5, 3, 1];
  const ease = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  function fly(e, now) {
    const W = field.clientWidth, H = field.clientHeight, s = places(now / 1000), r = .085 * 1.75 * size();
    const pts = Array.from({ length: 6 }, () => [-9999, -9999]);
    ORDER.forEach((k, i) => {
      const p = clamp((e - i * T.gap) / T.trip); if (p <= 0) return;
      const a = [FROM[k][0] * W, FROM[k][1] * H], b = s[k];
      const c = [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - .18 * H];           // the bend is upward: away from the words
      const q = ease(p), u = 1 - q;
      pts[k] = [u * u * a[0] + 2 * u * q * c[0] + q * q * b[0], Math.min(H - r, u * u * a[1] + 2 * u * q * c[1] + q * q * b[1])];
    });
    dots.put(pts);
  }

  /* the beats, on the section's own clock */
  const BEATS = [
    [T.handoff,          () => end.classList.remove('away')],
    [T.handoff + 130,    () => { dots.destroy(); dots = null; }],
    [T.handoff + T.fuse, () => { j.set('settled'); j.halo('pool'); }],
    [T.breath,           () => j.halo('breath')],
  ];
  let clock = 0, last = 0, raf = 0, next = 0, started = false, seen = false, done = false;
  const inout = p => p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  function frame(now) {
    raf = 0; clock += Math.max(0, Math.min(64, now - last)); last = now;
    while (next < BEATS.length && clock >= BEATS[next][0]) BEATS[next++][1]();
    if (dots) fly(clock, now);
    if (clock >= T.light) {
      const lp = clamp((clock - T.light) / T.lightFor);
      sky.s = .03 + .97 * inout(lp); sky.o = clamp((clock - T.light) / 900); sky.d = inout(clamp((clock - T.day) / T.dayFor)); paint();
    }
    if (clock >= T.rest) { done = true; morning(); return; }
    run();
  }
  function run() { if (!raf && started && seen && !done && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; run(); }).observe(end);
  // it starts once it is well in view: a third of the section, or half the screen when the section is taller than that
  new IntersectionObserver(([e], o) => { if (e.intersectionRatio >= .3 || e.intersectionRect.height >= innerHeight * .5) { o.disconnect(); started = true; run(); } },
    { threshold: [0, .1, .2, .3, .4, .5] }).observe(end);
  document.addEventListener('visibilitychange', run);
  paint();

  /* at rest, the download: its working light once, while the browser goes on to the install guide */
  $('.dl').addEventListener('click', () => {
    if (!done) return;
    j.set('apart'); setTimeout(() => { j.set('settled'); j.halo('close'); }, 300); setTimeout(() => j.halo('breath'), 2100);
  });
})();
