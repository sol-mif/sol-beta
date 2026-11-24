// The desk's windows are small live demos, not films (2026-10-27: "they should be different demos rather than
// videos ... make it fun"). Each one is a toy of one real thing Sol does, looping on its own clock; hovering speeds it
// up or hands it to your pointer. Clicking still opens what is behind it (desk.js). One rAF for all, asleep off screen.
// Since the jelly (2026-11): each toy shows today's app, its numbers taken from the kit (sol/design/system/tokens.json)
// and its scenes from the app's own stills, not drawn from memory:
//   hello   six bodies fly in and fuse into one, and it asks what to call you    (onboarding/app/1-hatch, 1-ask, 1-named)
//   glass   the window's black at its opacity, the shade steps inside, the nacre thumb   (onboarding/app/4-yours)
//   talk    the chat bar listening: the rim lit, your words as you speak, then sent and done   (chatbar/scenes/speak-*, say-*)
//   stage   what your AI made, as blocks on the stage: the week, then the runs tracker lands warm when asked and they
//           tile; + run fills today's bar (the same two as See it and Your turn)   (system/stage/04, 12)
//   notch   the jelly in the notch: its halo while it works and when it is done, and the card that drops   (onboarding/app/5-notch)
// Every word a visitor reads is in COPY, so the copy can be swapped in one place.
const MINIS = (() => {
  const COPY = {
    hello: { ask: 'what should I call you?', field: 'your name', hi: 'nice to meet you, ', names: ['Ada', 'Leo', 'Sam', 'Noor', 'Jun'] },
    glass: { label: 'opacity' },
    talk: { empty: 'tell Sol what to do', said: 'move my 3pm to friday', effort: 'high', done: 'done', send: 'send',
            card: { title: 'Design review', from: 'Thu 3pm', to: 'Fri 3pm', ok: '✓ moved' } },
    // the same two things See it and Your turn put on the stage (try.js COPY.blocks.week, COPY.blocks.runs; see.js RUNS)
    stage: { ask: 'make me a tracker for my runs', blocks: [{ t: 'the week', k: 'page', body: 'week' }, { t: 'runs', k: 'card', body: 'runs' }],
             runs: { km: [5.2, 0, 3.4, 0, 6.1, 0, 0], today: 5, add: 7.3, unit: 'km this week', press: '+ run' } },
    notch: { title: 'Codex finished', line: '3 tests fixed · 2m', open: 'open' },
  };
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const pop = x => x <= 0 ? 0 : x >= 1 ? 1 : 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);   // a little overshoot
  const out = x => 1 - Math.pow(1 - clamp(x), 3);
  const type = (s, t, a, b) => (s ?? '').slice(0, Math.round((s ?? '').length * seg(t, a, b)));
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const live = typeof SolJelly !== 'undefined';
  /* the jelly where it can be, its still where it cannot */
  const jelly = (el, o) => live ? SolJelly.mount(el, o) : (el.innerHTML = `<img src="media/jelly-mark.png" alt="" style="width:${o.size}px;height:${o.size}px;display:block">`, null);
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const DEF = {
    hello: {
      period: 8000,
      html: `<div class="mh"><span class="jl"></span><p class="ask"></p><p class="fld"><b></b></p></div>`,
      init(el) {
        const root = el.querySelector('.mh');
        el.j = jelly(el.querySelector('.jl'), { size: 40 });
        el.dots = live && !still ? SolJelly.dots(root, { own: false }) : null;
      },
      draw(el, t, n) {
        const q = el.q ??= { jl: el.querySelector('.jl'), ask: el.querySelector('.ask'), fld: el.querySelector('.fld'), b: el.querySelector('.fld b'), at: -1 };
        const name = COPY.hello.names[n % COPY.hello.names.length] ?? COPY.hello.names[0] ?? '', s = t / 1000, w = el.clientWidth;
        // the six fly in from the edges to where the jelly holds them apart, then the jelly takes over and fuses them
        const phase = still ? 2 : s < 1 ? 0 : s < 7.4 ? 1 : 2;
        if (phase !== q.at) {
          if (phase === 0 && el.j) el.j.home(0);
          if (phase === 1 && el.j) { el.j.home(null); el.dots?.clear(); }
          q.at = phase;
        }
        if (phase === 0 && el.dots) {
          const cx = w / 2, cy = 34, R = 40 * 1.75 * .27, now = performance.now() / 1000, k = out(seg(s, .05, .95));
          el.dots.put([0, 1, 2, 3, 4, 5].map(i => {
            const a = i / 6 * 6.28 + now * .25, ex = cx + R * Math.cos(a), ey = cy - 2 + R * Math.sin(a);
            const fa = i / 6 * 6.28 + .6, fx = cx + Math.cos(fa) * w * .75, fy = cy + Math.sin(fa) * 90;
            return [lerp(fx, ex, k), lerp(fy, ey, k)];
          }), 40 * 1.75 * .085);
        }
        q.jl.style.opacity = phase === 0 && el.dots ? 0 : still ? 1 : 1 - seg(s, 7.5, 7.9);
        const hi = s > 4.4, said = type(name, s, 3.1, 3.7);
        q.ask.innerHTML = hi ? `${esc(type(COPY.hello.hi, s, 4.4, 5.1))}${s > 5.1 ? `<em>${esc(type(name, s, 5.1, 5.4))}</em>${s > 5.4 ? '.' : ''}` : ''}` : esc(type(COPY.hello.ask, s, 1.8, 2.8));
        q.ask.style.opacity = s > 1.7 && s < 7.5 ? 1 : 0;
        q.b.textContent = said || COPY.hello.field; q.b.className = said ? '' : 'ph';
        q.fld.style.opacity = s > 2.5 && s < 4.3 ? 1 : 0;
      },
    },
    glass: {
      period: 6400,
      html: `<div class="mg"><i class="desk6"></i><div class="w"><i class="sd"><u></u></i><i class="cd"></i><i class="bx"></i></div>
             <div class="row"><span>${COPY.glass.label}</span><b class="tr"><u></u><em></em></b><span class="v"></span></div></div>`,
      // the window is the one black at `window` (.78 by default) over the desk; inside, the side, a card and the box are
      // that black again at their steps (.1, .25, .55), so as the window clears the desk shows through all of them
      draw(el, t, n, hover) {
        const q = el.q ??= { w: el.querySelector('.w'), u: el.querySelector('.tr u'), k: el.querySelector('.tr em'), v: el.querySelector('.v') };
        const s = t / this.period, ease = x => .5 - .5 * Math.cos(Math.PI * clamp(x));
        let v = hover != null ? hover : s < .18 ? .78 : s < .42 ? lerp(.78, .4, ease((s - .18) / .24)) : s < .72 ? lerp(.4, .96, ease((s - .42) / .3)) : s < .86 ? lerp(.96, .78, ease((s - .72) / .14)) : .78;
        if (still && hover == null) v = .78;
        const x = (v - .3) / .7;
        q.w.style.background = `rgba(0,0,0,${v.toFixed(3)})`;
        q.u.style.width = x * 100 + '%'; q.k.style.transform = `translateX(${x * q.k.parentElement.clientWidth}px)`;
        q.v.textContent = v.toFixed(2);
      },
      hover(el, x) { return Math.round((.3 + .7 * clamp((x - .3) / .52)) * 100) / 100; },
    },
    talk: {
      period: 7600,
      html: `<div class="mt"><p class="you"></p>
             <div class="card"><b>${COPY.talk.card.title}</b><small>${COPY.talk.card.from} <s></s> ${COPY.talk.card.to}</small><em>${COPY.talk.card.ok}</em></div>
             <div class="box"><i class="rim"></i><span class="plus">+</span><p class="words"></p><span class="send">${COPY.talk.send}</span>
               <div class="pills"><span class="eff">${COPY.talk.effort}</span><span class="mic"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="4.2" y="1" width="3.6" height="6" rx="1.8"/><path d="M2.5 5.6a3.5 3.5 0 0 0 7 0M6 9.2V11M4.4 11h3.2"/></svg></span><span class="tm"></span><span class="done">${COPY.talk.done}</span></div></div></div>`,
      draw(el, t) {
        const q = el.q ??= { you: el.querySelector('.you'), card: el.querySelector('.card'), rim: el.querySelector('.rim'), words: el.querySelector('.words'),
                             send: el.querySelector('.send'), mic: el.querySelector('.mic'), tm: el.querySelector('.tm'), done: el.querySelector('.done') };
        const s = t / 1000, said = COPY.talk.said;
        // .6 the mic, 3.2 done (every word plain), 3.9 sent: the box empties, your words go up, the answer lands
        const listening = s > .6 && s < 3.2, typed = s >= 3.2 && s < 3.9, sent = s >= 3.9;
        const words = said.split(' '), heard = words.slice(0, Math.ceil(words.length * seg(s, .8, 2.9))).join(' ');
        q.words.textContent = listening ? heard : typed ? said : COPY.talk.empty;
        q.words.className = 'words' + (listening ? ' hot' : typed ? '' : ' ph');
        q.rim.style.opacity = listening ? .5 + .5 * Math.sin(s * 4) ** 2 : 0;
        q.tm.textContent = '0:0' + Math.min(9, Math.floor(seg(s, .6, 3.2) * 2.6) + 0);
        q.tm.style.opacity = q.done.style.opacity = listening ? 1 : 0;
        q.mic.style.opacity = listening ? 0 : 1;
        q.send.style.opacity = typed ? 1 : 0;
        const up = out(seg(s, 3.9, 4.4)), c = pop(seg(s, 4.5, 5.2)), gone = 1 - seg(s, 6.9, 7.3);
        q.you.textContent = said;
        q.you.style.cssText = `opacity:${sent ? up * gone : 0};transform:translateY(${(1 - up) * 26}px)`;
        q.card.style.cssText = `opacity:${s > 4.5 ? Math.min(1, c * 2) * gone : 0};transform:translateY(${(1 - c) * 10}px) scale(${lerp(.94, 1, c)})`;
      },
    },
    stage: {
      period: 10000,
      html: (() => { const R = COPY.stage.runs, top = Math.max(8, ...R.km, R.add);
        return `<div class="ms"><div class="sg">${COPY.stage.blocks.map(b => `<div class="blk"><i class="warm"></i><p class="hd"><i></i><b>${esc(b.t)}</b><small>${esc(b.k)}</small></p><div class="bd ${b.body}">${
               b.body === 'week'
             ? '<i><u></u><u></u></i><i><u></u><u></u></i><i><u></u><u class="add"></u></i><i class="now"><u class="lead"></u><u></u></i><i><u></u><u></u></i>'
             : `<p class="tot"><b>${R.km.reduce((x, y) => x + y, 0).toFixed(1)}</b><small>${esc(R.unit)}</small><span>${esc(R.press)}</span></p>
                <p class="bars">${R.km.map((v, i) => `<i class="${i === R.today ? 'now' : ''}" style="--v:${(v / top).toFixed(3)}"></i>`).join('')}</p>`}</div></div>`).join('')}</div>
             <p class="ask"><span class="jl"></span><b></b></p></div>`; })(),
      // where each block sits in each beat, as [x, y, w, h] in halves of the stage: the week alone; asked, the runs card
      // lands beside it and the two tile; then they are tiled again the other way round (⌘⇧T)
      LAYOUTS: [
        [[0, 0, 2, 2]],
        [[0, 0, 1, 2], [1, 0, 1, 2]],
        [[0, 0, 2, 1], [0, 1, 2, 1]],
      ],
      BEATS: [0, 2.9, 7.4],              // when each layout starts (s); between them, + run is pressed (4.6)
      init(el) { el.j = jelly(el.querySelector('.ask .jl'), { size: 11 }); },
      draw(el, t) {
        const q = el.q ??= { st: el.querySelector('.sg'), b: [...el.querySelectorAll('.blk')], ask: el.querySelector('.ask b'),
                             add: el.querySelector('.week .add'), tot: el.querySelector('.tot b'), press: el.querySelector('.tot span'), bar: el.querySelector('.bars .now') };
        const s = still ? 6.6 : t / 1000, W = q.st.clientWidth, H = q.st.clientHeight, G = 4, hw = (W - G) / 2, hh = (H - G) / 2;
        const beat = this.BEATS.filter(b => s >= b).length - 1, from = this.LAYOUTS[Math.max(0, beat - 1)], to = this.LAYOUTS[beat];
        const k = beat ? pop(seg(s, this.BEATS[beat], this.BEATS[beat] + .7)) : 1, fade = 1 - seg(s, 9.4, 9.9);
        q.b.forEach((b, i) => {
          const r1 = to[i]; if (!r1) { b.style.opacity = 0; return; }
          const r0 = from[i] || r1, born = !from[i] && beat > 0;
          const r = r1.map((v, j) => born ? v : lerp(r0[j], v, k));
          const x = r[0] * (hw + G), y = r[1] * (hh + G), w = r[2] * hw + (r[2] - 1) * G, h = r[3] * hh + (r[3] - 1) * G;
          b.style.left = x + 'px'; b.style.top = y + 'px'; b.style.width = w + 'px'; b.style.height = h + 'px';
          const land = born ? out(seg(s, this.BEATS[beat], this.BEATS[beat] + .45)) : 1;
          b.style.opacity = land * fade;
          b.style.transform = born ? `translateY(${(1 - land) * 10}px)` : '';
          // born warm: the jelly's bands on its rim, cooling to glass over one pour (850 ms); the week was there already
          b.firstChild.style.opacity = still || i === 0 ? 0 : 1 - seg(s, this.BEATS[1] + .1, this.BEATS[1] + .95);
        });
        // the tracker adds Wednesday's long run to the week; then + run is pressed: today's bar rises, the total follows
        const R = COPY.stage.runs, base = R.km.reduce((x, y) => x + y, 0), run = still ? 1 : out(seg(s, 4.7, 5.4));
        q.add.style.opacity = still ? 1 : seg(s, 3.5, 3.9);
        q.press.classList.toggle('on', !still && s > 4.5 && s < 4.9);
        q.tot.textContent = (base + R.add * run).toFixed(1);
        q.bar.style.setProperty('--v', (R.add * run / Math.max(8, ...R.km, R.add)).toFixed(3));
        const a = s < 1.4 ? '' : s < 2.9 ? type(COPY.stage.ask, s, 1.4, 2.4) : '';
        q.ask.textContent = a; q.ask.parentElement.classList.toggle('on', !!a);
      },
    },
    notch: {
      period: 7200,
      html: `<div class="mn"><div class="slab"><span class="jl"></span><div class="msg"><b>${COPY.notch.title}</b><small>${COPY.notch.line}</small><span>${COPY.notch.open}</span></div></div></div>`,
      init(el) { el.j = jelly(el.querySelector('.jl'), { size: 13, own: true }); },
      // closed and at rest it wears the notch's own small glow; working, its colours close as light; done, it lights the
      // glass under it (looks.halo: rest breath, working close, arriving pool) and the card drops open
      draw(el, t) {
        const q = el.q ??= { slab: el.querySelector('.slab'), jl: el.querySelector('.jl'), msg: el.querySelector('.msg'), at: '' };
        const s = still ? 3.6 : t / 1000, open = s > 2.6 && s < 5.4;
        const halo = s < 1 ? '' : s < 2.6 ? 'close' : s < 5.7 ? 'pool' : '';
        if (halo !== q.at && el.j) { el.j.halo(halo || null); q.at = halo; }
        const o = open ? pop(seg(s, 2.6, 3.2)) : 1 - seg(s, 5.4, 5.7), w = lerp(64, 168, o);
        q.slab.style.width = w + 'px'; q.slab.style.height = lerp(18, 62, open ? pop(seg(s, 2.65, 3.3)) : o) + 'px';
        q.slab.style.borderRadius = `0 0 ${lerp(8, 18, o)}px ${lerp(8, 18, o)}px`;
        q.jl.style.transform = `translate(${lerp(6, w / 2 - 6.5, o)}px, ${lerp(2.5, 5, o)}px)`;
        q.msg.style.opacity = open ? seg(s, 3, 3.3) : 0;
      },
    },
  };

  const minis = [];
  function mount(pane, kind) {
    const d = DEF[kind]; pane.classList.add('mini'); pane.innerHTML = d.html; d.init?.(pane);
    const m = { pane, d, t0: performance.now() - Math.random() * d.period, hover: null, fast: false };
    const win = pane.closest('.win');
    win?.addEventListener('pointermove', e => { const r = pane.getBoundingClientRect(); m.hover = d.hover ? d.hover(pane, (e.clientX - r.left) / r.width) : null; m.fast = !d.hover; });
    win?.addEventListener('pointerleave', () => { m.hover = null; m.fast = false; });
    minis.push(m);
  }
  let awake = true, last = performance.now();
  const desk = document.getElementById('desk');
  if (desk) new IntersectionObserver(([e]) => awake = e.isIntersecting).observe(desk);
  (function tick(now) {
    const dt = Math.min(64, now - last); last = now;
    if (awake) minis.forEach(m => {
      if (m.fast) m.t0 -= dt * .8;                          // hover: a touch faster
      // a frame's time can sit a hair before the moment a mini was mounted: never a negative age
      const age = still ? m.d.period * .7 : Math.max(0, now - m.t0), n = Math.floor(age / m.d.period);
      m.d.draw(m.pane, age % m.d.period, n, m.hover);
    });
    requestAnimationFrame(tick);
  })(last);
  return { mount };
})();
