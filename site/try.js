// Your turn: Sol's window with only the stage (sol/design/system/stage/04-three-live.png, 10-frozen.png, 12-tiled.png).
// No side and no transcript: the title bar, the stage, two lines of talk (you, sol) and the chat bar. Each ask sends the
// jelly's six to a block that pours in and stays; the blocks tile as more land (the stage's full spring). One waits on
// you, its rim yellow, until it is answered; the week freezes as v1. Then the stage clears and it goes again. On a
// narrow stage the older blocks fold into chips at its top, as the stage's fold does, and a press brings one back.
//   SolTry.mount(el) builds it inside el. It starts when it scrolls into view and its clock stops off screen.
//   Typing takes the window; ~12 s idle and the script takes it back. Reduced motion: the finished stage, still.
// Every word a visitor reads is in COPY. The jelly is jelly.js (SolJelly, a plain script loaded before this one).
// Nothing here calls a network or stores anything.
const STILL = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CANCEL = Symbol('cancel');
const IDLE_MS = 12000;

/* ---------- every word a visitor reads ---------- */
const COPY = {
  label: 'Sol’s window, playing on its own; type in its box to take over',
  title: 'plan the week', where: 'home · main',
  stage: 'the stage', you: 'you', sol: 'sol',
  placeholder: 'tell Claude what to do', placeholderWorking: 'say more: it waits for the next step',
  inputLabel: 'tell Claude what to do',
  send: 'send', stop: 'stop', model: 'Opus 5.5', effort: 'high', mode: 'Manual',
  onStage: (n) => `${n} on the stage`,
  folded: 'folded: press to bring it back',
  asks: [
    { key: 'week', ask: 'plan my week with what Claude said yesterday', working: 'working on the week', done: 'the week is on the stage' },
    { key: 'runs', ask: 'make me a tracker for my runs', working: 'making runs', done: 'runs is on the stage; + run adds today’s' },
    { key: 'essay', ask: 'tighten the opening of my essay', working: 'reading the essay draft', done: 'the essay’s changes are on the stage' },
    { key: 'trip', ask: 'what’s left for the Lisbon trip?', working: 'checking the trip', done: 'the trip’s list is up; one thing waits on you' },
  ],
  answered: 'booked: the train to Sintra · nothing on the trip waits on you',
  freezeAsk: 'freeze the week as it is',
  frozen: 'the week frozen as v1; what changes next is live beside it',
  thawed: 'the week is live again',
  again: 'that one is on the stage already',
  // anything the window does not know: say plainly what it can show here
  unknown: 'Here I can show your week, your runs, the essay or the Lisbon trip. In Sol, Claude would answer this one.',
  blocks: {
    week: { title: 'the week', kind: 'page', live: 'live · the-week.html', frozen: 'frozen · v1', v1: 'v1', liveWord: 'live',
      days: [['Mon', ['deep work', 'gym 18:00']], ['Tue', ['design review', 'call mum']], ['Wed', ['deep work', 'long run 10k']], ['Thu', ['launch day', 'no meetings']], ['Fri', ['write-up', 'off at 4']]], today: 3, big: 'launch day' },
    runs: { title: 'runs', kind: 'card', live: 'live · tracker.html', unit: 'km this week', add: '+ run', days: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], vals: [5.2, 0, 3.4, 0, 6.1, 0, 0], today: 5, goal: 'goal 25 km', adds: [4.2, 3.1, 5.0, 2.6] },
    essay: { title: 'essay draft', kind: 'diff', live: 'live · essay.md',
      lines: [['-', 'I have always wanted to write about mornings.'], ['+', 'Mornings are the only hours that are mine.'], [' ', 'Everything after nine belongs to someone else.'], ['+', 'So I keep them.']] },
    trip: { title: 'trip to lisbon', kind: 'list', live: 'live · trip.md', waits: 'waits on you',
      items: [['flights booked', 'done'], ['the flat, four nights', 'done'], ['the train to Sintra on Saturday?', 'ask'], ['a table for Friday night', '']], yes: 'yes' },
  },
};

/* ---------- small things ---------- */
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const P = 'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"';
const ICON = {
  side: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="4.6" height="10" rx="1.4" fill="currentColor"/><rect x="8.6" y="3.5" width="4.8" height="9" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  phone: `<svg viewBox="0 0 16 16" ${P} aria-hidden="true"><path d="M5.2 2.5 3.4 3.1c-.6.2-1 .8-.9 1.5.6 4.4 4.5 8.3 8.9 8.9.7.1 1.3-.3 1.5-.9l.6-1.8-2.9-1.5-1.3 1.3c-1.5-.7-2.7-1.9-3.4-3.4l1.3-1.3z"/></svg>`,
  mic: `<svg viewBox="0 0 16 16" ${P} aria-hidden="true"><rect x="6" y="2" width="4" height="7.5" rx="2"/><path d="M3.8 7.8a4.2 4.2 0 0 0 8.4 0M8 12v2"/></svg>`,
  ring: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke="rgb(239 234 226 / .22)" stroke-width="1.3"/><path d="M6 1.4a4.6 4.6 0 0 1 4.1 2.5" fill="none" stroke="rgb(239 234 226 / .7)" stroke-width="1.3" stroke-linecap="round"/></svg>',
  cursor: '<svg viewBox="0 0 20 22" aria-hidden="true"><path d="M3 2v15.5l4-3.8 2.6 6 2.6-1.1-2.6-5.9 5.6-.2z" fill="#fff" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/></svg>',
};
// the pour, cubic-bezier(.3, 1.12, .6, 1), solved for x
function bez(x1, y1, x2, y2) {
  const A = (a, b) => 1 - 3 * b + 3 * a, B = (a, b) => 3 * b - 6 * a, C = (a) => 3 * a;
  const at = (t, a, b) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t, sl = (t, a, b) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);
  return (x) => { if (x <= 0) return 0; if (x >= 1) return 1; let t = x; for (let i = 0; i < 8; i++) { const s = sl(t, x1, x2); if (Math.abs(s) < 1e-6) break; t -= (at(t, x1, x2) - x) / s; } return at(t, y1, y2); };
}
const POUR = bez(0.3, 1.12, 0.6, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const JL = () => (typeof SolJelly !== 'undefined' ? SolJelly : null);
const jellyOf = (el, o) => { try { return JL()?.mount(el, o) || null; } catch (e) { return null; } };

// where the blocks sit on a wide stage, 1..4 of them: fractions of the block area, in the order they arrived
const TILE = {
  1: [[0.18, 0, 0.64, 0.74]],
  2: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]],
  3: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5]],
  4: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
};
const GAP = 12, PAD = 12, JELLY = 40, WIDE = 860, TRAY = 42, OPEN = 2;

function mount(el) {
  if (!el) return null;
  el.classList.add('soltry');
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', COPY.label);
  el.innerHTML = `
    <div class="ty-desk" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="ty-win">
      <div class="ty-bar">
        <div class="ty-lights" aria-hidden="true"><i></i><i></i><i></i></div>
        <span class="ty-sidekey" aria-hidden="true">${ICON.side}</span>
        <div class="ty-title"><span class="ty-tt"></span><span class="ty-where"></span></div>
        <div class="ty-spacer"></div>
        <span class="ty-count"></span>
        <span class="ty-barmark" aria-hidden="true"></span>
      </div>
      <section class="ty-stage"><div class="ty-tray"></div><div class="ty-jel" aria-hidden="true"></div></section>
      <div class="ty-talk" aria-live="polite"><p class="ty-l ty-you"><i></i><span></span></p><p class="ty-l ty-sol"><i></i><span></span></p></div>
      <div class="ty-ask"><div class="ty-box">
        <div class="ty-line">
          <span class="ty-plus" aria-hidden="true">+</span>
          <div class="ty-field"><textarea class="ty-input" rows="1" spellcheck="false"></textarea><div class="ty-typed" aria-hidden="true"></div></div>
          <button type="button" class="ty-send"></button>
        </div>
        <div class="ty-pick">
          <span class="ty-pill ty-model"></span>
          <span class="ty-pill ty-effort"><span class="ty-heat" aria-hidden="true"></span><span class="ty-drop" aria-hidden="true"></span><b></b></span>
          <span class="ty-pill ty-sys ty-mode"></span>
          <span class="ty-icon ty-call" aria-hidden="true">${ICON.phone}</span><span class="ty-icon" aria-hidden="true">${ICON.mic}</span><span class="ty-icon ty-ring" aria-hidden="true">${ICON.ring}</span>
        </div>
      </div></div>
    </div>
    <div class="ty-cursor" aria-hidden="true">${ICON.cursor}</div>`;
  const $ = (s) => el.querySelector(s);
  const stage = $('.ty-stage'), tray = $('.ty-tray'), jel = $('.ty-jel'), count = $('.ty-count'), box = $('.ty-box'), field = $('.ty-field');
  const input = $('.ty-input'), typed = $('.ty-typed'), send = $('.ty-send'), cursor = $('.ty-cursor');
  const youL = $('.ty-you span'), solL = $('.ty-sol span');
  $('.ty-tt').textContent = COPY.title; $('.ty-where').textContent = COPY.where;
  stage.setAttribute('aria-label', COPY.stage);
  $('.ty-you i').textContent = COPY.you; $('.ty-sol i').textContent = COPY.sol;
  $('.ty-model').textContent = COPY.model; $('.ty-effort b').textContent = COPY.effort; $('.ty-mode').textContent = COPY.mode;
  input.placeholder = COPY.placeholder; input.setAttribute('aria-label', COPY.inputLabel);
  send.textContent = COPY.send;

  /* the jellies: the stage's (a halo take, drawn by the page's shared context), its six for the flights (their own
     canvas: the one context this section takes), the title bar's mark */
  const SJ = jellyOf(jel, { size: JELLY, state: STILL ? 'settled' : 'apart', halo: 'breath', material: 'full', own: false });
  let DOTS = null;
  try { DOTS = JL()?.dots(stage, { dot: 5 }) || null; } catch (e) { DOTS = null; }
  if (DOTS) DOTS.el.style.zIndex = '7';
  jellyOf($('.ty-barmark'), { size: 18, own: false });

  /* ---------- the clock: waits that run only while the window is on screen, and die with their run ---------- */
  let visible = false, last = performance.now();
  const waits = new Set(), ticks = new Set();
  const newRun = () => ({ alive: true, ws: new Set() });
  const kill = (r) => { if (!r || !r.alive) return; r.alive = false; r.ws.forEach((w) => { waits.delete(w); w.rej(CANCEL); }); r.ws.clear(); };
  const sleep = (ms, r) => new Promise((res, rej) => {
    if (!r.alive) return rej(CANCEL);
    if (STILL || ms <= 0) { queueMicrotask(res); return; }
    const w = { left: ms, rej, done: () => { r.ws.delete(w); res(); } };
    waits.add(w); r.ws.add(w); kick();
  });
  // frames are asked for only while there is something to move and the window is on screen; never under reduced motion
  let raf = 0;
  const wanted = () => !STILL && visible && !document.hidden && (waits.size > 0 || ticks.size > 0);
  function kick() { if (!raf && wanted()) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function frame(t) {
    raf = 0;
    const dt = Math.min(250, Math.max(0, t - last)); last = t;
    for (const w of [...waits]) { w.left -= dt; if (w.left <= 0) { waits.delete(w); w.done(); } }
    for (const f of [...ticks]) f(dt);
    if (wanted()) raf = requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', kick);

  /* ---------- the stage ---------- */
  const S = { items: [], blocks: {}, order: [], landed: 0, jAt: 'home', working: false, born: false };
  const wide = () => stage.clientWidth >= WIDE;
  // on a narrow stage only the last OPEN touched blocks stand; the rest are folded into chips at the top
  const openKeys = () => (wide() ? S.items.slice() : S.order.filter((k) => S.items.includes(k)).slice(-OPEN));
  const folded = () => S.items.filter((k) => !openKeys().includes(k));
  const foot = () => (wide() ? 64 : 56);
  function area() {
    const top = PAD + (!wide() && folded().length ? TRAY : 0);
    return { x: PAD, y: top, w: stage.clientWidth - 2 * PAD, h: stage.clientHeight - top - foot() };
  }
  function slot(k) {
    const a = area();
    if (wide()) {
      const n = S.items.length, i = S.items.indexOf(k), f = TILE[Math.max(1, Math.min(4, n))][Math.max(0, i)];
      return { x: a.x + f[0] * a.w + (f[0] ? GAP / 2 : 0), y: a.y + f[1] * a.h + (f[1] ? GAP / 2 : 0), w: f[2] * a.w - (n > 1 ? GAP / 2 : 0), h: f[3] * a.h - (n > 2 ? GAP / 2 : 0) };
    }
    // narrow: the open ones stacked, each half the area, the newest last
    const open = openKeys(), i = Math.max(0, open.indexOf(k)), hh = (a.h - GAP) / OPEN;
    return { x: a.x, y: a.y + i * (hh + GAP), w: a.w, h: hh };
  }
  const home = () => (S.items.length ? { x: stage.clientWidth / 2, y: stage.clientHeight - foot() / 2 } : { x: stage.clientWidth / 2, y: stage.clientHeight / 2 - 10 });
  const spotBy = (b) => ({ x: b.x + b.w - JELLY / 2 - 6, y: b.y + 17 });
  const jpos = { x: 0, y: 0 };
  function jellyTo(p, take, jump) {
    jpos.x = p.x; jpos.y = p.y;
    jel.style.transition = jump || STILL ? 'none' : '';
    jel.style.transform = `translate(${p.x - JELLY / 2}px, ${p.y - JELLY / 2}px)`;
    if (jump) void jel.offsetWidth;
    jel.style.transition = '';
    if (take) SJ?.halo(take);
  }
  function lay() {
    const open = openKeys();
    S.items.forEach((k) => {
      const it = S.blocks[k], s = slot(k);
      it.el.classList.toggle('ty-folded', !open.includes(k));
      Object.assign(it.el.style, { left: `${s.x}px`, top: `${s.y}px`, width: `${s.w}px`, height: `${s.h}px` });
    });
    // the folded ones as chips, the oldest first
    tray.textContent = '';
    folded().forEach((k) => {
      const it = S.blocks[k];
      const c = h('button', `ty-chip${it.el.classList.contains('ty-frozen') ? ' ty-frozen' : ''}${it.el.classList.contains('ty-waits') ? ' ty-waits' : ''}`);
      c.type = 'button'; c.title = COPY.folded;
      c.append(h('i'), document.createTextNode(COPY.blocks[k].title));
      c.querySelector('i').setAttribute('aria-hidden', 'true');
      c.addEventListener('click', () => { touch(k); lay(); flash(it.el); });
      tray.append(c);
    });
    if (S.jAt === 'home' || !S.items.includes(S.jAt) || !open.includes(S.jAt)) jellyTo(home()); else jellyTo(spotBy(slot(S.jAt)));
    count.textContent = S.landed ? COPY.onStage(S.landed) : '';
    count.classList.toggle('ty-has', S.landed > 0);
  }
  const touch = (k) => { S.order = S.order.filter((x) => x !== k); S.order.push(k); };
  new ResizeObserver(() => lay()).observe(stage);

  // six dots on the pour, from one set of places to another; resolves when they land
  function fly(from, to, ms = 850) {
    if (!DOTS || STILL) return Promise.resolve();
    return new Promise((res) => {
      let t = 0;
      const f = (dt) => {
        t += dt;
        let all = true;
        const pts = from.map((a, k) => { const u = Math.min(1, Math.max(0, (t - k * 55) / ms)); if (u < 1) all = false; const e = POUR(u); return [lerp(a[0], to[k][0], e), lerp(a[1], to[k][1], e)]; });
        DOTS.put(pts, 5);
        if (all) { ticks.delete(f); DOTS.clear(); res(); }
      };
      ticks.add(f); kick();
    });
  }
  const ring = (p, r) => Array.from({ length: 6 }, (_, k) => [p.x + r * Math.cos(k / 6 * 6.283 + 0.4), p.y + r * Math.sin(k / 6 * 6.283 + 0.4)]);
  const corners = (b) => [[b.x + 14, b.y + 14], [b.x + b.w / 2, b.y + 6], [b.x + b.w - 14, b.y + 14], [b.x + b.w - 14, b.y + b.h - 14], [b.x + b.w / 2, b.y + b.h - 6], [b.x + 14, b.y + b.h - 14]];
  // the first time it is seen: six fly in from the stage's edges and fuse into one body in its middle
  function birth() {
    if (S.born) return;
    S.born = true;
    const p = home();
    jellyTo(p, 'pool', true);
    if (STILL || !SJ || !DOTS) { jel.style.opacity = '1'; SJ?.set('settled'); SJ?.halo('breath'); return; }
    const W = stage.clientWidth, H = stage.clientHeight;
    fly([[-8, H * 0.3], [W * 0.5, -8], [W + 8, H * 0.22], [W + 8, H * 0.78], [W * 0.5, H + 8], [-8, H * 0.82]], ring(p, JELLY * 0.72), 1100).then(() => {
      jel.style.opacity = '1'; SJ.set('settled');
      setTimeout(() => { if (!S.working) SJ.halo('breath'); }, 1400);
    });
  }

  /* ---------- the blocks, each its kind as the stage draws it ---------- */
  function blockFrame(k, kind, cls) {
    const B = COPY.blocks[k];
    const b = h('div', `ty-blk ${cls || ''}`);
    b.setAttribute('role', 'group'); b.setAttribute('aria-label', B.title);
    const sweep = h('span', 'ty-sweep'); sweep.setAttribute('aria-hidden', 'true');
    const hd = h('div', 'ty-bh'), dot = h('i', 'ty-dot'); dot.setAttribute('aria-hidden', 'true');
    hd.append(dot, h('span', 'ty-bt', B.title), h('span', 'ty-kind', kind), h('span', 'ty-bm', B.live), h('span', 'ty-grow'));
    const body = h('div', 'ty-bb');
    b.append(sweep, hd, body);
    stage.insertBefore(b, jel);
    return { el: b, head: hd, body, meta: hd.querySelector('.ty-bm') };
  }
  const MAKE = {
    week() {
      const B = COPY.blocks.week, it = blockFrame('week', B.kind, 'ty-week');
      const days = h('div', 'ty-days');
      B.days.forEach(([d, xs], i) => { const c = h('div', `ty-day${i === B.today ? ' ty-today' : ''}`); c.append(h('h4', '', d)); xs.forEach((t) => c.append(h('p', t === B.big ? 'ty-big' : '', t))); days.append(c); });
      it.body.append(days);
      // v1 | live: in the head once the week is frozen
      const sw = h('div', 'ty-vsw'); sw.dataset.v = 'v1';
      const th = h('span', 'ty-thumb'); th.setAttribute('aria-hidden', 'true'); sw.append(th);
      [['v1', B.v1], ['live', B.liveWord]].forEach(([v, t]) => { const x = h('button', v === 'v1' ? 'ty-on' : '', t); x.type = 'button'; x.dataset.v = v; x.setAttribute('aria-pressed', String(v === 'v1')); sw.append(x); });
      const show = (v) => {
        sw.dataset.v = v;
        sw.querySelectorAll('button').forEach((y) => { y.classList.toggle('ty-on', y.dataset.v === v); y.setAttribute('aria-pressed', String(y.dataset.v === v)); });
        it.el.classList.toggle('ty-frozen', v === 'v1'); it.meta.textContent = v === 'v1' ? B.frozen : B.live;
      };
      sw.addEventListener('click', (e) => { const x = e.target.closest('button'); if (x) show(x.dataset.v); });
      it.head.append(sw);
      it.freeze = () => { sw.classList.add('ty-has'); show('v1'); };
      it.thaw = () => show('live');
      return it;
    },
    runs() {
      const B = COPY.blocks.runs, it = blockFrame('runs', B.kind, 'ty-runs');
      const vals = B.vals.slice(); let add = 0;
      const top = h('div', 'ty-top'), tot = h('div', 'ty-tot'), n = h('span', '', '');
      tot.append(n, h('small', '', B.unit));
      const plus = h('button', 'ty-add', B.add); plus.type = 'button';
      top.append(tot, h('span', 'ty-grow'), plus);
      const bars = h('div', 'ty-bars'), dl = h('div', 'ty-dl');
      bars.setAttribute('aria-hidden', 'true');
      const cols = vals.map((_, i) => { const c = h('div', `ty-b${i === B.today ? ' ty-today' : ''}`); c.append(h('em'), h('span')); bars.append(c); dl.append(h('span', i === B.today ? 'ty-today' : '', B.days[i])); return c; });
      const cells = h('div', 'ty-cells'); const cs = Array.from({ length: 25 }, () => { const x = h('i'); cells.append(x); return x; });
      cs.forEach((x) => x.setAttribute('aria-hidden', 'true'));
      cells.append(h('small', '', B.goal));
      const draw = () => {
        const max = Math.max(8, ...vals), sum = vals.reduce((a, b) => a + b, 0);
        cols.forEach((c, i) => { const pc = `${Math.max(3, (vals[i] / max) * 82)}%`; c.querySelector('span').style.height = pc; c.style.setProperty('--h', pc); c.classList.toggle('ty-zero', !vals[i]); c.querySelector('em').textContent = vals[i] ? vals[i].toFixed(1) : ''; });
        n.textContent = sum.toFixed(1);
        cs.forEach((x, i) => x.classList.toggle('ty-got', i < Math.floor(sum)));
      };
      // + run: a run lands on today, as the tracker's button does
      plus.addEventListener('click', () => { vals[B.today] = +(vals[B.today] + B.adds[add++ % B.adds.length]).toFixed(1); if (vals[B.today] > 16) vals[B.today] = B.adds[0]; draw(); });
      it.body.append(top, bars, dl, cells);
      draw();
      return it;
    },
    essay() {
      const B = COPY.blocks.essay, it = blockFrame('essay', B.kind, 'ty-diff');
      B.lines.forEach(([m, t]) => { const p = h('p', m === '+' ? 'ty-ins' : m === '-' ? 'ty-del' : ''); p.append(h('b', '', m), h('span', '', t)); it.body.append(p); });
      return it;
    },
    trip() {
      const B = COPY.blocks.trip, it = blockFrame('trip', B.kind, 'ty-list ty-waits');
      it.meta.textContent = B.waits;
      B.items.forEach(([t, st]) => {
        const p = h('p', st === 'done' ? 'ty-done' : st === 'ask' ? 'ty-asks' : '');
        p.append(h('span', '', t));
        if (st === 'ask') { const y = h('button', 'ty-yes', B.yes); y.type = 'button'; y.addEventListener('click', () => { takeOver(); answer(); }); p.append(y); it.yes = y; }
        it.body.append(p);
      });
      return it;
    },
  };
  // a block arrives: the tiles make room, the six fly from the jelly to its corners, it pours in and stays
  async function arrive(r, k) {
    S.items.push(k); touch(k);
    const it = MAKE[k](); S.blocks[k] = it;
    it.el.style.visibility = 'hidden';
    const from = ring(jpos, JELLY * 0.3);
    S.jAt = k; lay(); SJ?.halo('pool');
    await sleep(380, r);   // the tiles move first
    await fly(from, corners(slot(k)));
    S.landed = S.items.length; lay();
    it.el.style.visibility = '';
    if (!STILL) it.el.classList.add('ty-born');
    it.el.classList.add('ty-working'); SJ?.halo('close');
    return it;
  }
  function answer() {
    const it = S.blocks.trip; if (!it || !it.yes) return;
    it.yes.parentElement.className = 'ty-done'; it.yes.remove(); it.yes = null;
    it.el.classList.remove('ty-waits'); it.meta.textContent = COPY.blocks.trip.live;
    lay(); say(null, COPY.answered);
  }
  function clearStage() {
    S.items.forEach((k) => { const b = S.blocks[k].el; b.classList.remove('ty-born'); b.classList.add('ty-dying'); setTimeout(() => b.remove(), STILL ? 0 : 520); });
    S.items = []; S.blocks = {}; S.order = []; S.jAt = 'home'; S.landed = 0; lay();
  }
  function flash(b) { b.classList.add('ty-flash'); setTimeout(() => b.classList.remove('ty-flash'), 1200); }

  /* ---------- the two lines of talk and the bar ---------- */
  function say(you, sol) {
    if (you != null) youL.textContent = you;
    solL.textContent = sol || '';
    if (!STILL) [youL, solL].forEach((x) => { x.classList.remove('ty-in'); void x.offsetWidth; x.classList.add('ty-in'); });
  }
  function working(on, words) {
    S.working = on;
    send.textContent = on ? COPY.stop : COPY.send;
    send.classList.toggle('ty-stop', on); send.classList.toggle('ty-on', on || !!input.value.trim());
    input.placeholder = on ? COPY.placeholderWorking : COPY.placeholder;
    if (on) say(null, words);
  }
  async function typeIn(r, text) {
    box.classList.add('ty-focus');
    try {
      for (let i = 1; i <= text.length; i++) { typed.textContent = text.slice(0, i); field.classList.add('ty-typing'); send.classList.add('ty-on'); await sleep(16 + Math.random() * 22, r); }
      await sleep(300, r);
    } finally { typed.textContent = ''; field.classList.remove('ty-typing'); send.classList.toggle('ty-on', S.working); box.classList.remove('ty-focus'); }
  }
  async function make(r, a, words) {
    if (S.blocks[a.key]) { say(words || a.ask, COPY.again); touch(a.key); lay(); flash(S.blocks[a.key].el); return; }
    say(words || a.ask, '');
    working(true, a.working);
    try {
      await sleep(300, r);
      await arrive(r, a.key);
      await sleep(800, r);
    } finally {
      const it = S.blocks[a.key];
      if (it) { it.el.style.visibility = ''; it.el.classList.remove('ty-working'); }
      if (S.landed < S.items.length) { S.landed = S.items.length; }
      S.jAt = 'home'; lay(); SJ?.halo('breath'); working(false);
    }
    say(null, a.done);
  }

  /* ---------- the pointer the script presses with ---------- */
  async function press(r, target) {
    if (!target || !target.isConnected) return;
    const t = target.getBoundingClientRect(), c = el.getBoundingClientRect();
    const x = t.left - c.left + t.width * 0.55, y = t.top - c.top + t.height * 0.6;
    cursor.style.transition = 'none'; cursor.style.transform = `translate(${x + 120}px, ${y + 80}px)`; cursor.style.opacity = '1';
    void cursor.offsetWidth;
    cursor.style.transition = ''; cursor.style.transform = `translate(${x}px, ${y}px)`;
    await sleep(760, r);
    target.click();
    await sleep(500, r);
    cursor.style.opacity = '0';
  }

  /* ---------- the script ---------- */
  async function script(r) {
    clearStage(); say('', '');
    await sleep(700, r);
    for (;;) {
      for (const a of COPY.asks) { await typeIn(r, a.ask); await make(r, a); await sleep(1000, r); }
      if (!wide()) { touch('trip'); lay(); }
      if (S.blocks.runs && !S.blocks.runs.el.classList.contains('ty-folded')) await press(r, S.blocks.runs.el.querySelector('.ty-add'));
      await press(r, S.blocks.trip?.yes);
      await sleep(1400, r);
      await typeIn(r, COPY.freezeAsk);
      say(COPY.freezeAsk, ''); working(true, '');
      await sleep(700, r); working(false);
      if (!wide()) { touch('week'); }
      S.blocks.week?.freeze(); lay(); say(null, COPY.frozen);
      await sleep(5200, r);
      clearStage(); say('', '');
      await sleep(1600, r);
    }
  }
  // reduced motion: the stage as the story ends, every block standing, the week frozen
  function finished() {
    COPY.asks.forEach((a) => { S.items.push(a.key); touch(a.key); S.blocks[a.key] = MAKE[a.key](); });
    S.landed = S.items.length;
    touch('trip'); answer();     // the loop presses "yes" on the trip before it freezes the week
    touch('week'); S.blocks.week.freeze();
    lay(); say(COPY.freezeAsk, COPY.frozen);
  }

  /* ---------- the visitor ---------- */
  let run = null, idle = 0, user = newRun(), started = false;
  const play = () => { kill(run); run = newRun(); script(run).catch((e) => { if (e !== CANCEL) console.error(e); }); };
  function takeOver() {
    clearTimeout(idle);
    if (!STILL) idle = setTimeout(function back() { if (input.value.trim() || document.activeElement === input) { idle = setTimeout(back, IDLE_MS); return; } kill(user); user = newRun(); play(); }, IDLE_MS);
    if (!run) return;
    kill(run); run = null;
    typed.textContent = ''; field.classList.remove('ty-typing'); cursor.style.opacity = '0';
    S.items.forEach((k) => { S.blocks[k].el.style.visibility = ''; S.blocks[k].el.classList.remove('ty-working'); });
    S.landed = S.items.length;
    if (S.working) working(false);
    S.jAt = 'home'; lay(); SJ?.halo('breath');
  }
  function reply(text) {
    const t = text.toLowerCase();
    if (/\bunfreeze|\bthaw|\blive again/.test(t) && S.blocks.week) { S.blocks.week.thaw(); say(text, COPY.thawed); return; }
    if (/freeze|frozen|\bv1\b/.test(t) && S.blocks.week) { S.blocks.week.freeze(); touch('week'); lay(); say(text, COPY.frozen); return; }
    if (/\byes\b|\bbook|\btrain|sintra/.test(t) && S.blocks.trip?.yes) { youL.textContent = text; answer(); return; }
    const a = COPY.asks.find((x) => (x.key === 'week' && /\bweek|\bplan|calendar|schedule/.test(t)) || (x.key === 'runs' && /\bruns?\b|track|running|\bkm\b/.test(t))
      || (x.key === 'essay' && /essay|draft|tighten|opening/.test(t)) || (x.key === 'trip' && /trip|lisbon|travel|holiday/.test(t)));
    if (!a) { say(text, COPY.unknown); return; }
    make(user, a, text).catch((e) => { if (e !== CANCEL) console.error(e); });
  }
  function submit() { const v = input.value.trim(); if (!v || S.working) return; input.value = ''; fit(); send.classList.remove('ty-on'); reply(v); }
  function fit() { input.style.height = 'auto'; input.style.height = `${Math.min(72, Math.max(24, input.scrollHeight))}px`; }
  el.addEventListener('pointerdown', (e) => { if (e.target.closest('.ty-win')) takeOver(); }, true);
  input.addEventListener('focus', () => { takeOver(); box.classList.add('ty-focus'); });
  input.addEventListener('blur', () => box.classList.remove('ty-focus'));
  input.addEventListener('input', () => { takeOver(); input.value = input.value.replace(/\n/g, ''); fit(); send.classList.toggle('ty-on', S.working || !!input.value.trim()); });
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  send.addEventListener('click', () => { if (S.working) { kill(user); user = newRun(); takeOver(); } else submit(); });
  el.addEventListener('focusin', (e) => { if (e.target !== input && e.target.closest('button')) takeOver(); });

  // it starts the first time it comes into view; its clock runs only while it is on screen
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      visible = e.isIntersecting; kick();
      if (visible && !started) { started = true; lay(); birth(); if (STILL) finished(); else play(); }
    }
  }, { threshold: 0.2 });
  io.observe(el);
  requestAnimationFrame(() => { lay(); jellyTo(home(), null, true); });
  return { el };
}

window.SolTry = { mount };
export { mount };
