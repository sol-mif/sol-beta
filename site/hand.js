// Bring your people, as a hand-off between two Macs (option B of 2026-11-17). Sam's Sol and Jun's,
// both in Cowork's group "sol build" (the page's Cowork sample data). Sam hands his session to Jun from its row's
// menu; his jelly carries the brief over; it arrives in Jun's notch as "sam hands you #41" with Take, Pass and
// Later; Jun takes it, and the session opens on his Mac with the brief in its box and his Claude starting from
// sam's branch. What it shows is the Hand design (sol/design/together/4-hand: "hand to <member>" in a session row's menu,
// the notch card, the brief travels and the transcript never); the jelly flying between the two Macs is a picture of
// that message going across, not something on either screen.
//
//   SolHand.mount(el) builds it inside `el`: a fixed design canvas, scaled to el's width, in one of three layouts:
//     wide    (el ≥ 1100 px) the two Macs side by side, each Sol's whole window: the side, the talk, the stage
//     mid     (el ≥ 700 px)  two smaller Macs side by side: the window without its side and stage
//     narrow  (below)        the smaller Macs one above the other; the jelly crosses downward
//   It starts when it comes into view, pauses off screen, and loops. Reduced motion: the hand-off done, drawn once.
//   The scene is one described picture (role img): nothing in it is pressable.
//
// Every word a visitor reads is in COPY. The look is the kit's (sol/design/system/tokens.json), see hand.css.

const COPY = {
  label: 'Sam hands his session to Jun. It arrives in the notch on Jun\'s Mac as "sam hands you #41" with Take, Pass and Later; Jun takes it, and his Sol starts from Sam\'s draft with the brief.',
  sam: { mac: "sam's Mac", title: '#41 the beta page', where: "our site · sam's draft", row: '#41 beta page',
           you: 'make the beta page wear the mark', step: ['writing', 'the beta page', '42 lines'],
           said: "Done. The page wears the mark, in sam's draft.", block: 'beta page', kind: 'page' },
  jun: { mac: "jun's Mac", title: 'the launch plan', where: 'our site', row: 'the launch plan',
           you: 'three steps, beta first', said: 'Done. The plan is on the stage.', saidNarrow: 'Done. Three steps, beta first.',
           block: 'plan', kind: 'page' },
  menu: ['hand to jun', 'hand to noor', 'copy the link'],
  handed: 'handed', taken: 'taken',
  notch: { say: 'sam hands you #41', meta: "Beta page: wear the mark · sam's draft", take: 'Take', pass: 'Pass', later: 'Later' },
  chip: '#41 the beta page',
  brief: '#41 Beta page: wear the mark. From sam, in his draft: the page wears the mark; the wordmark stays in the footer.',
  after: { row: '#41 beta page', title: '#41 the beta page', where: "our site · sam's draft", from: 'from sam',
           step: ['opening', "sam's draft", '3 changes'], said: "I have sam's draft. The page is on the stage.",
           saidNarrow: "I have sam's draft. Picking up from there." },
  placeholder: 'tell Claude what to do', model: 'Opus 5.5', effort: 'high', modes: ['home', 'cowork'], groups: 'groups',
  group: 'sol build', code: 'K7QX2M', other: 'book club', newSession: 'new session', empty: 'what Claude makes lands here',
};

const SIXES = {   // each person's jelly in their own six (jun wears the standard six)
  sam: ['#f08ab6', '#f29f7b', '#c95442', '#8a3fc8', '#3327e8', '#e0609c'],
  noor: ['#f0b46a', '#e0945a', '#b8845f', '#8d6b5b', '#6d5d93', '#9a7fd0'],
};
const MARK = new URL('./media/jelly-mark.png', import.meta.url).href;
const ICON = {
  check: '<svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.3l2.3 2.3L9.5 3.6"/></svg>',
  pen: '<svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.5l2 2L5 11H3V9z"/></svg>',
  down: '<svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2v8M3.5 6.5L7 10l3.5-3.5M3 12h8"/></svg>',
  cursor: '<svg viewBox="0 0 20 24" width="18" height="22"><path d="M2 1.5v18.2l4.6-4.4 3 6.8 3.1-1.4-3-6.6 6.4-.2z" fill="#fff" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/></svg>',
};
// the three layouts: the canvas, and where each Mac stands on it
const LAYOUT = {
  wide: { W: 1392, H: 524, mac: { w: 680, h: 524 }, sam: [0, 0], jun: [712, 0] },
  mid: { W: 752, H: 380, mac: { w: 360, h: 380 }, sam: [0, 0], jun: [392, 0] },
  narrow: { W: 360, H: 812, mac: { w: 360, h: 380 }, sam: [0, 0], jun: [0, 432] },
};
const modeFor = (w) => (w >= 1100 ? 'wide' : w >= 700 ? 'mid' : 'narrow');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function mount(el) {
  if (!el) throw new Error('SolHand.mount: no element');
  const RM = reduced();
  el.classList.add('solhand');
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', COPY.label);

  let mode = '', scale = 1, canvas = null, run = 0, visible = false, started = false, wake = [];
  const jellies = [];
  const $ = (s, r = canvas) => r.querySelector(s), $$ = (s, r = canvas) => [...r.querySelectorAll(s)];
  const text = (n, s) => { n.textContent = s; return n; };
  const make = (tag, cls, parent) => { const n = document.createElement(tag); if (cls) n.className = cls; parent?.append(n); return n; };

  /* a person's jelly (their six), one shared WebGL context, no halo; the still where jelly.js or WebGL is missing */
  function jelly(n, size, who, state = 'settled') {
    if (typeof SolJelly === 'undefined') { n.innerHTML = `<img src="${MARK}" alt="" style="width:${size}px;height:${size}px;display:block">`; return null; }
    try { const j = SolJelly.mount(n, { size, six: SIXES[who], state: RM ? 'settled' : state }); jellies.push(j); return j; } catch (e) { return null; }
  }
  const dropJellies = () => { jellies.splice(0).forEach((j) => j?.destroy()); };

  /* ---- one Mac: its desk, its notch, Sol's window on it ---- */
  function macHtml(who) {
    return `<div class="hd-mac" data-mac="${who}">
      <div class="hd-desk"><i></i><i></i><i></i></div>
      <span class="hd-label"><span class="hd-lj" data-j="${who}" data-s="14"></span><span class="hd-lt"></span></span>
      <div class="hd-notch"><span class="hd-nm" data-j="${who}" data-s="16"></span>
        <div class="hd-say"><span class="hd-sj" data-j="sam" data-s="22"></span><div class="hd-sx"><p class="hd-s1"></p><p class="hd-s2"></p></div>
          <div class="hd-btns"><span class="hd-nb first" data-take></span><span class="hd-nb"></span><span class="hd-nb"></span></div></div></div>
      <div class="hd-glass">
        <div class="hd-bar"><div class="hd-lights"><i></i><i></i><i></i></div><span class="hd-tt"></span><span class="hd-where"></span></div>
        <div class="hd-body">
          <aside class="hd-side">
            <div class="hd-modes"><span></span><span class="on"></span></div>
            <div class="hd-ghead"><span></span><small>2</small></div>
            <div class="hd-row room"><i class="hd-caret"></i><span class="t"></span><code></code></div>
            <div class="hd-rows"><div class="hd-row sess on"><span class="t"></span><small class="st"></small></div></div>
            <div class="hd-row sess new"><i>+</i><span class="t"></span></div>
            <div class="hd-row room shut"><i class="hd-caret"></i><span class="t"></span><code>R2D8VN</code></div>
          </aside>
          <main class="hd-talk"><div class="hd-col"></div>
            <div class="hd-box"><div class="hd-line"><span class="hd-plus">+</span><p class="hd-field"></p></div>
              <div class="hd-pills"><span class="hd-pill"></span><span class="hd-pill eff"><i></i><b></b></span></div></div></main>
          <section class="hd-stage"><p class="hd-empty"></p><div class="hd-foot" data-j="${who}" data-s="30"></div></section>
        </div>
      </div>
    </div>`;
  }

  function build() {
    run++; dropJellies();
    const L = LAYOUT[mode];
    el.innerHTML = '';
    canvas = make('div', `hd-canvas ${mode}`, el);
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.width = `${L.W}px`; canvas.style.height = `${L.H}px`;
    canvas.innerHTML = `${macHtml('sam')}${macHtml('jun')}
      <div class="hd-menu"><span class="it"></span><span class="it"></span><hr><span class="it"></span></div>
      <div class="hd-carry"><span class="hd-cj" data-j="sam" data-s="30"></span><span class="hd-chip"></span></div>
      <div class="hd-cursor">${ICON.cursor}</div>`;
    for (const who of ['sam', 'jun']) {
      const m = $(`[data-mac="${who}"]`), c = COPY[who];
      m.style.left = `${L[who][0]}px`; m.style.top = `${L[who][1]}px`; m.style.width = `${L.mac.w}px`; m.style.height = `${L.mac.h}px`;
      text($('.hd-lt', m), c.mac);
      const [h, cw] = $$('.hd-modes span', m); text(h, COPY.modes[0]); text(cw, COPY.modes[1]);
      text($('.hd-ghead span', m), COPY.groups);
      const rooms = $$('.hd-row.room .t', m); text(rooms[0], COPY.group); text(rooms[1], COPY.other); text($('.hd-row.room code', m), COPY.code);
      text($('.hd-row.new .t', m), COPY.newSession);
      text($('.hd-pill', m), COPY.model); text($('.eff b', m), COPY.effort); text($('.hd-empty', m), COPY.empty);
    }
    const M = $('[data-mac="jun"]');
    text($('.hd-s1', M), COPY.notch.say); text($('.hd-s2', M), COPY.notch.meta);
    $$('.hd-btns .hd-nb', M).forEach((b, i) => text(b, [COPY.notch.take, COPY.notch.pass, COPY.notch.later][i]));
    text($('.hd-chip'), COPY.chip);
    $$('.hd-menu .it').forEach((b, i) => text(b, COPY.menu[i]));
    $$('[data-j]').forEach((n) => jelly(n, +n.dataset.s, n.dataset.j));
    fit();
  }
  function fit() {
    const L = LAYOUT[mode];
    scale = (el.clientWidth || L.W) / L.W;
    canvas.style.transform = `scale(${scale})`;
    el.style.height = `${Math.round(L.H * scale)}px`;
  }

  /* where `node` sits on the canvas, in the canvas's own (unscaled) px */
  function spot(node, ax = 0.5, ay = 0.5) {
    const a = canvas.getBoundingClientRect(), b = node.getBoundingClientRect();
    return { x: (b.left - a.left + b.width * ax) / scale, y: (b.top - a.top + b.height * ay) / scale };
  }
  /* carry `node` from one point to another along an arc that bows away from the straight line */
  function fly(node, from, to, ms, bow) {
    const w = node.offsetWidth / 2, h = node.offsetHeight / 2, at = (p, s = 1) => `translate(${p.x - w}px, ${p.y - h}px) scale(${s})`;
    node.style.transform = at(to);
    if (RM) return Promise.resolve();
    const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1;
    const mid = { x: (from.x + to.x) / 2 + (dy / len) * bow, y: (from.y + to.y) / 2 - (dx / len) * bow };
    return node.animate([{ transform: at(from, 0.9) }, { transform: at(mid, 1.06), offset: 0.5 }, { transform: at(to) }],
      { duration: ms, easing: 'cubic-bezier(.45,0,.25,1)' }).finished.catch(() => {});
  }
  const cur = {
    to(node, ax = 0.5, ay = 0.55) { const c = $('.hd-cursor'), p = spot(node, ax, ay); c.classList.add('on'); c.style.transform = `translate(${p.x}px, ${p.y}px)`; },
    hide() { $('.hd-cursor').classList.remove('on'); },
    press(node) { if (!node || RM) return; node.classList.add('press'); setTimeout(() => node.classList.remove('press'), 160); },
  };

  /* a talk line: your words on the right, a step, the answer plain */
  function msg(col, kind, s, step) {
    const d = document.createElement('div');
    if (kind === 'me') { d.className = 'hd-me'; text(make('p', '', d), s); }
    else if (kind === 'step') {
      d.className = 'hd-step';
      d.innerHTML = `<span class="gl">${s === 'writing' ? ICON.pen : ICON.down}</span><span class="tx"><b></b> <span></span></span><span class="ct"></span><span class="ok">${ICON.check}</span>`;
      text($('b', d), step[0]); text($('.tx span', d), step[1]); text($('.ct', d), step[2]);
    } else { d.className = 'hd-you'; text(d, s); }
    col.append(d);
    return d;
  }
  function block(m, c, from) {
    const b = document.createElement('div'); b.className = `hd-blk ${c.block === 'plan' ? 'tiers' : 'page'}`;
    b.innerHTML = `<div class="bh"><i class="dot"></i><b></b><small></small><span class="grow"></span>${from ? '<em></em>' : ''}</div>
      <div class="bb">${c.block === 'plan' ? '<i></i><i class="hi"></i><i></i>' : '<span class="pj"></span><u></u><u class="s"></u><s></s>'}</div>`;
    text($('b', b), c.block); text($('small', b), c.kind); if (from) text($('em', b), from);
    $('.hd-stage', m).prepend(b);
    const pj = $('.pj', b); if (pj) jelly(pj, 18, 'jun');
    $('.hd-empty', m).hidden = true;
    return b;
  }

  /* ---- the state both Macs start from ---- */
  function reset() {
    for (const who of ['sam', 'jun']) {
      const m = $(`[data-mac="${who}"]`), c = COPY[who];
      text($('.hd-tt', m), c.title); text($('.hd-where', m), c.where);
      $$('.hd-rows .hd-row', m).forEach((r, i) => { if (i) r.remove(); });
      const r0 = $('.hd-rows .hd-row', m); r0.className = 'hd-row sess on'; text($('.t', r0), c.row); text($('.st', r0), '');
      const col = $('.hd-col', m); col.innerHTML = ''; col.classList.remove('gone');
      msg(col, 'me', c.you); if (c.step) msg(col, 'step', 'writing', c.step); msg(col, 'you', mode !== 'wide' && c.saidNarrow ? c.saidNarrow : c.said);
      $$('.hd-blk', m).forEach((b) => b.remove());
      block(m, c);
      text($('.hd-field', m), COPY.placeholder); $('.hd-field', m).classList.remove('brief'); $('.hd-box', m).classList.remove('lit');
    }
    $('[data-mac="jun"] .hd-notch').classList.remove('open');
    $('.hd-menu').classList.remove('on');
    $('.hd-carry').classList.remove('on');
    cur.hide();
  }
  const footJelly = (m) => jellies.find((j) => j?.el?.parentElement === $('.hd-foot', m));

  /* ---- the story; waits count only while it is on screen ---- */
  function at(ms, me) {
    const ok = () => { if (me !== run) throw new Error('stale'); };
    if (RM) return Promise.resolve().then(ok);
    return new Promise((r) => setTimeout(r, ms)).then(() => (visible ? null : new Promise((r) => wake.push(r)))).then(ok);
  }
  async function story(me) {
    const F = $('[data-mac="sam"]'), M = $('[data-mac="jun"]'), menu = $('.hd-menu'), narrow = mode !== 'wide';
    const rowF = $('.hd-rows .hd-row', F);
    // 1. sam opens his session's menu and hands it to jun
    await at(900, me); cur.to(rowF, 0.35);
    await at(900, me); cur.press(rowF);
    const p = spot(rowF, 0, 1); menu.style.left = `${p.x + 24}px`; menu.style.top = `${p.y + 4}px`; menu.classList.add('on');
    await at(700, me); cur.to($('.it', menu), 0.4);
    await at(900, me); cur.press($('.it', menu)); $('.it', menu).classList.add('hot');
    await at(220, me); menu.classList.remove('on'); $('.it', menu).classList.remove('hot'); cur.hide();
    text($('.st', rowF), COPY.handed); rowF.classList.add('handed');
    // 2. his jelly carries the brief over to jun's notch (across, or down on a phone)
    const carry = $('.hd-carry');
    carry.classList.add('on');
    await fly(carry, spot(rowF), spot($('.hd-notch', M), 0.5, 0.6), 1500, mode === 'narrow' ? 70 : 24);
    carry.classList.remove('on');
    // 3. it arrives: "sam hands you #41", Take / Pass / Later
    $('.hd-notch', M).classList.add('open');
    await at(1500, me); cur.to($('[data-take]', M));
    await at(1000, me); cur.press($('[data-take]', M));
    // 4. Take: the notch closes; the session opens on jun's Mac with the brief in its box
    await at(260, me); $('.hd-notch', M).classList.remove('open'); cur.hide();
    text($('.st', rowF), COPY.taken);
    $('.hd-rows .hd-row', M).classList.remove('on');
    const r = document.createElement('div'); r.className = 'hd-row sess on arrive';
    text(make('span', 't', r), COPY.after.row); text(make('small', 'st from', r), COPY.after.from);
    $('.hd-rows', M).prepend(r);
    text($('.hd-tt', M), COPY.after.title); text($('.hd-where', M), COPY.after.where);
    $('.hd-col', M).classList.add('gone');
    await at(500, me);
    const colM = $('.hd-col', M); colM.innerHTML = ''; colM.classList.remove('gone');
    text($('.hd-field', M), COPY.brief); $('.hd-field', M).classList.add('brief'); $('.hd-box', M).classList.add('lit');
    // 5. it goes: his Claude starts from sam's branch, and the page lands on his stage
    await at(1500, me);
    text($('.hd-field', M), COPY.placeholder); $('.hd-field', M).classList.remove('brief'); $('.hd-box', M).classList.remove('lit');
    msg(colM, 'me', COPY.brief).classList.add('in');
    footJelly(M)?.set('apart');
    await at(700, me); msg(colM, 'step', 'fetching', COPY.after.step).classList.add('in');
    await at(1300, me); msg(colM, 'you', narrow ? COPY.after.saidNarrow : COPY.after.said).classList.add('in');
    if (!narrow) block(M, COPY.sam, COPY.after.from).classList.add('born');
    footJelly(M)?.set('settled');
    await at(3600, me);
  }
  async function loop() {
    const me = ++run;
    try {
      do { reset(); await story(me); await at(400, me); } while (!RM);
    } catch (e) { if (e.message !== 'stale') console.warn('[SolHand]', e); }
  }

  /* ---- size, view, start ---- */
  function layout() {
    const want = modeFor(el.clientWidth || LAYOUT.wide.W);
    if (want !== mode) { mode = want; build(); if (started) loop(); else reset(); }   // reduced motion: started from the first layout
    else fit();
  }
  const ro = new ResizeObserver(() => layout());
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !started) { started = true; loop(); }
    if (visible) wake.splice(0).forEach((f) => f());
  }, { threshold: 0.3 });
  if (RM) started = true;   // nothing moves, so the finished hand-off is drawn at once
  layout();
  ro.observe(el); io.observe(el);

  return {
    destroy() { run++; ro.disconnect(); io.disconnect(); dropJellies(); el.innerHTML = ''; el.classList.remove('solhand'); el.style.height = ''; },
  };
}

window.SolHand = { mount };
export { mount };
