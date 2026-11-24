// The sun is still rising (road.css): where Sol is going, as the sun's path.
// 2026-10-27: three pillars. Customizable and convenient are "a first look" today; personalizable is next;
// under all three, "making everything generative on the fly".
//
// The picture: one path rising from the horizon. The jelly is the sun on it. When the section comes into view the
// jelly rises from the horizon along the path, its six fusing as it climbs, lighting each stop it passes (today), and
// stops at "now", short of the top, with the next stop still ahead on a dotted path. It keeps creeping up, very slowly,
// while the section is on screen: the sun is still rising. Under the horizon, the ground all three stand on.
//
// Every word is in index.html's #road (and in road-preview.html); none is here. This file only places and moves.
//   <section id="road" class="road"> ... </section>  +  <script src="jelly.js">  then  <script src="road.js">
//
// Two shapes, from the section's width: "arc" (900 px and wider: one arc across the screen) and "climb" (narrower: the
// path climbs the left edge and the words sit to its right). t is the place on the path, 0 at the horizon.
// Runs only while on screen. Reduced motion: the finished picture, drawn once.
(() => {
  const road = document.getElementById('road');
  if (!road || road.__road) return; road.__road = true;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = s => road.querySelector(s), $$ = s => [...road.querySelectorAll(s)];
  const svg = $('.road-path'), done = $('.road-path .done'), glow = $('.road-path .glow'), ahead = $('.road-path .ahead'), hzl = $('.road-path .hz'), grad = $('#roadWarm');
  const head = $('.road-head'), ground = $('.road-ground'), band = $('.road-band'), floor = $('.road-floor'), sunEl = $('.road-sun');
  const stops = $$('.road-stop').map(el => ({ el, next: el.classList.contains('next'), box: el.querySelector('div') }));
  stops.forEach(s => s.el.style.setProperty('--c', s.el.dataset.c));

  // where the stops and the sun sit on each shape; creep is how far the sun goes on rising after it arrives
  const SHAPE = {
    arc:   { stops: [.12, .28, .63], now: .41, creep: .022 },
    climb: { stops: [.1, .34, .86], now: .58, creep: .03 },
  };
  const RISE = 3;                                         // seconds from the horizon to "now"
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const outC = x => 1 - Math.pow(1 - x, 3);

  const live = typeof SolJelly !== 'undefined';
  let jsz = 120;
  const jelly = live ? SolJelly.mount($('.road-jelly'), { size: jsz, halo: 'breath', material: 'full', own: false }) : null;

  let mode = '', W = 0, H = 0, hz = 0, P = () => [0, 0];
  const pathD = (a, b) => {
    if (b - a < 1e-4) return '';
    let d = ''; const n = Math.max(2, Math.ceil((b - a) * 140));
    for (let i = 0; i <= n; i++) { const [x, y] = P(a + (b - a) * i / n); d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }
    return d;
  };

  function layout() {
    const wide = road.clientWidth >= 900;
    if (mode !== (wide ? 'arc' : 'climb')) { mode = wide ? 'arc' : 'climb'; road.classList.toggle('climb', !wide); road.classList.toggle('arc', wide); }
    W = road.clientWidth; H = road.clientHeight;
    const S = SHAPE[mode], headBottom = head.offsetTop + head.offsetHeight, gh = ground.offsetHeight;
    if (mode === 'arc') {
      jsz = Math.round(clamp(W * .083, 104, 150));
      hz = Math.round(Math.min(H * .8, H - gh - 64));
      // the arc is as tall as it can be with the sun's glow kept clear of the words above it
      const glowR = jsz * 1.75 * 1.6 / 2, cx = W / 2, rx = W * .41;
      const ry = Math.max(160, Math.min(H * .46, (hz - headBottom - glowR - 12) / Math.sin(Math.PI * (1 - S.now))));
      P = t => { const a = Math.PI * (1 - t); return [cx + rx * Math.cos(a), hz - ry * Math.sin(a), a]; };
      grad.setAttribute('x1', cx - rx); grad.setAttribute('y1', 0); grad.setAttribute('x2', P(S.now)[0] + 40); grad.setAttribute('y2', 0);
    } else {
      jsz = W < 520 ? 64 : 92;
      hz = Math.round(H - gh - 64);
      const top = headBottom + 44, x0 = W < 520 ? 34 : Math.round(W * .09), bow = W < 520 ? 18 : Math.round(W * .07);
      P = t => [x0 + bow * Math.sin(Math.PI * t * .9), hz - t * (hz - top), 0];
      grad.setAttribute('x1', 0); grad.setAttribute('y1', hz); grad.setAttribute('x2', 0); grad.setAttribute('y2', P(S.now)[1] - 30);
    }
    road.style.setProperty('--js', jsz + 'px');
    jelly?.size(jsz);
    jelly?.halo(mode === 'arc' ? 'breath' : 'none');      // narrow: no wide breath, it would wash over the words beside it
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    hzl.setAttribute('x1', 0); hzl.setAttribute('x2', W); hzl.setAttribute('y1', hz + .5); hzl.setAttribute('y2', hz + .5);
    band.style.top = hz - 200 + 'px'; floor.style.top = hz + 1 + 'px';
    ground.style.top = hz + 30 + 'px';
    stops.forEach((s, i) => {
      const [x, y, a] = P(S.stops[i]);
      s.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      if (mode === 'arc') {
        // today's stops keep their words inside the arc; the next one, in the open sky above it
        const c = Math.cos(a), sn = Math.sin(a), k = s.next ? 1 : -1, gap = 32;
        s.box.style.left = (c * gap * k) + 'px'; s.box.style.top = (-sn * gap * k) + 'px';
        s.box.style.setProperty('--tx', (-50 + 50 * c * k) + '%'); s.box.style.setProperty('--ty', (-50 - 50 * sn * k) + '%');
        s.box.style.width = '250px';
        s.box.classList.toggle('l', c * k < -.2);
      } else {
        s.box.style.left = '24px'; s.box.style.top = '0px';
        s.box.style.setProperty('--tx', '0%'); s.box.style.setProperty('--ty', '-50%');
        s.box.style.width = Math.max(160, W - x - 24 - 20) + 'px';
        s.box.classList.remove('l');
      }
    });
    draw(cur);
  }

  /* one frame with the sun at tj on the path */
  let cur = 0;
  function draw(tj) {
    cur = tj;
    const S = SHAPE[mode], k = clamp(tj / S.now), [x, y] = P(tj);
    done.setAttribute('d', pathD(0, tj)); glow.setAttribute('d', pathD(0, tj));
    ahead.setAttribute('d', pathD(tj, 1));
    sunEl.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    road.style.setProperty('--jx', x.toFixed(0) + 'px'); road.style.setProperty('--jy', y.toFixed(0) + 'px'); road.style.setProperty('--warm', k.toFixed(3));
    stops.forEach((s, i) => { if (!s.next) s.el.classList.toggle('on', tj >= S.stops[i] - .004); });
  }

  /* the rise, then the creep; time only passes while the section is on screen */
  let s = 0, started = false, arrived = false, visible = false, raf = 0, last = 0;
  function arrive() {
    arrived = true; jelly?.home(null);
    road.classList.add('here');
    stops.forEach(t => t.next && t.el.classList.add('seen'));
  }
  function frame(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    s += Math.min(.1, (now - last) / 1000); last = now;   // a slow frame still moves on; a hidden tab stops the clock (go resets last)
    const S = SHAPE[mode], u = clamp(s / RISE), e = outC(u);
    let tj = S.now * e;
    if (u >= 1) { if (!arrived) arrive(); tj = S.now + S.creep * (1 - Math.exp(-(s - RISE) / 14)); }
    else jelly?.home(Math.pow(e, 1.6) * .92);
    draw(tj);
    if (s < RISE + 60) raf = requestAnimationFrame(frame);
  }
  function go() { if (!raf && started && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  new ResizeObserver(layout).observe(road);
  layout();
  if (still || !live) { draw(SHAPE[mode].now); arrive(); return; }
  jelly.home(0);
  draw(0);
  // starts once a good part of it is on screen; it plays once, and only runs while it can be seen
  new IntersectionObserver(es => es.forEach(e => {
    visible = e.isIntersecting;
    if (e.intersectionRatio >= .35) started = true;
    go();
  }), { threshold: [0, .35] }).observe(road);
  document.addEventListener('visibilitychange', go);
})();
