// See it, the scroll after the desk (2026-10-27: "the scroll should naturally transition over to visualizing how
// the problem gets solved"). The same dotted desktop goes on; as it comes up, eight AI windows fall onto it.
//   1  Today, you are the glue: the windows pile up, your cursor runs between them carrying copy, paste, explain again.
//   2  With Sol, you talk to one: the AIs leave their windows as six bodies, fly in and fuse into the jelly, and the
//      windows give way to Home (the side, the talk, the stage). The jelly settles in its place, the mark at the top.
//   3  And it makes what you need: what Sol makes lands on the stage as an artifact, and stays.
// Everything is DOM on a scene driven by how far the section has scrolled (p, 0 to 1), both ways; the flight and the
// fuse are the app's own jelly (jelly.js), scrubbed by p. Only the cursor's running, the windows' drift and the jelly's
// own breathing go by the clock. Home here is the same window as Your turn's (try.js): the same session, side, week
// and runs, so the visitor meets one window twice. Where it is wide enough it is a 900 x 680 scene scaled to fit;
// where that would shrink its words below reading size it is laid out for the room it has (no side, the talk and the
// stage side by side or one at a time), at real size. The words a visitor reads are all in WORDS.
(() => {
  const see = document.getElementById('see'); if (!see) return;

  /* every word a visitor reads (the session, side, week and runs match try.js's COPY, the same sample data) */
  const WORDS = {
    steps: [
      ['Work at the executive level.', 'You make the decisions. Sol handles the rest, so you stop copying between tabs and explaining it all again.'],
      ['With Sol, you talk to one.', 'Claude and ChatGPT’s Codex fold into one window, on the plan you already pay for. Sol asks them for you, with your context.'],
      ['And it makes what you need.', 'Ask for something you need every day. Sol makes it, puts it on the stage, and it stays.'],
    ],
    glue: ['copy', 'paste', 'explain it again', 'copy', 'which tab was it', 'paste', 're-upload the file', 'explain it again'],
    count: 'times you explained it again today',
    you: 'you',
    title: 'plan the week', where: 'home · main',
    side: { modes: ['home', 'cowork'], add: 'new', key: '⌘N', all: 'all sessions', settings: 'settings',
      groups: [
        { name: 'home', n: 6, more: '3 more', rows: [['plan the week', '', 'now', 'here'], ['essay draft', 'needs', '1m'], ['trip to lisbon', '', '9h']] },
        { name: 'app', n: 5, more: '2 more', rows: [['fix login bug', 'running', '4m'], ['onboarding copy', 'failed', '2m'], ['pricing page', '', '2d']] },
      ],
      done: ['done today', 1] },
    ask1: 'plan my week with what Claude said yesterday',
    ask2: 'make me a tracker for my runs',
    steps1: [['read', 'reading', 'Notes · 3 notes this week'], ['ask', 'asking', 'Claude · yesterday’s talk “the launch”'], ['write', 'writing', '~/week/the-week.html', '+42', '-0']],
    steps2: [['write', 'building', '~/runs/tracker.html', '+88', '-0'], ['write', 'adding', 'Wednesday’s long run to the week', '+1', '-0']],
    said1: 'Here’s your week, built around what Claude said yesterday: **protect your mornings, keep Thursday clear for the launch.** It’s on the stage.',
    said2: 'Made it. It stays on the stage, and Wednesday’s long run is in your week now.',
    bar: { ph: 'tell Claude what to do', busy: 'say more: it waits for the next step', stop: 'stop', model: 'Opus 5.5', efforts: ['medium', 'high'], mode: 'Manual' },
    onStage: n => n === 1 ? 'the week' : `${n} on the stage`,
    week: { title: 'the week', kind: 'page', live: 'live · the-week.html', today: 3,
      days: [['Mon', [['deep work'], ['gym 18:00']]], ['Tue', [['design review'], ['call mum']]], ['Wed', [['deep work'], ['long run 10k', 'added']]],
             ['Thu', [['launch day', 'big'], ['no meetings']]], ['Fri', [['write-up'], ['off at 4']]]] },
    runs: { title: 'runs', kind: 'card', live: 'live · tracker.html', unit: 'km this week', add: '+ run', goal: 'goal 25 km', days: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] },
  };
  const RUNS = [5.2, 0, 3.4, 0, 6.1, 0, 0], TODAY = 5, GOAL = 25;   // try.js's runs: mon..sun, today saturday

  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const span = (p, a, b) => ease(clamp((p - a) / (b - a)));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  // the app's pour, cubic-bezier(0.3, 1.12, 0.6, 1), as a function of progress, so a scroll can scrub it
  const pour = (() => {
    const X1 = .3, Y1 = 1.12, X2 = .6, Y2 = 1;
    const b = (t, a1, a2) => 3 * a1 * t * (1 - t) * (1 - t) + 3 * a2 * t * t * (1 - t) + t * t * t;
    return x => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 24; i++) { t = (lo + hi) / 2; if (b(t, X1, X2) < x) lo = t; else hi = t; } return b(t, Y1, Y2); };
  })();
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let step = -1, hop = -1, told = 0, last = -1, slide = 0, slideT = 0;

  // see.css carries the scene's look; index.html links it after its own style. Until it does, link it here.
  if (!$('link[href$="see.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'see.css'; document.head.append(l); }

  /* the eight windows, where they lie on the desk (scene px); `ai` is the colour of the body that leaves it */
  const DESK = [
    { n:'ChatGPT', k:'chat', x:28, y:84, w:220, h:150, r:-3, ai:0 },
    { n:'Claude', k:'chat', x:300, y:54, w:210, h:150, r:2, ai:1 },
    { n:'Codex', k:'code', x:572, y:86, w:240, h:150, r:-1.5, ai:2 },
    { n:'Gemini', k:'chat', x:62, y:292, w:200, h:140, r:2.5, ai:3 },
    { n:'Terminal', k:'term', x:326, y:262, w:240, h:150, r:1, ai:4 },
    { n:'Perplexity', k:'chat', x:640, y:302, w:220, h:140, r:-2, ai:5 },
    { n:'Browser', k:'web', x:146, y:464, w:270, h:150, r:-1 },
    { n:'Notes', k:'notes', x:520, y:472, w:220, h:140, r:3 },
  ];
  let APPS = DESK, FROM = [];
  const BODY = {
    chat: () => '<p class="b l" style="width:72%"></p><p class="b r" style="width:46%"></p><p class="b l" style="width:58%"></p><p class="b r" style="width:34%"></p>',
    code: () => '<code>› fix the login bug</code><code class="d">reading src/auth.ts</code><code class="d">3 files changed</code><code>› and the tests?</code>',
    term: () => '<code>$ claude</code><code class="d">› why do the tests fail</code><code>$ npm test</code><code class="x">✗ 2 failing</code>',
    web: () => '<div class="tabs">' + '<i></i>'.repeat(9) + '</div><p class="url"></p><p class="blk"></p>',
    notes: () => '<b class="t">the plan, v3</b><p class="b" style="width:80%"></p><p class="b" style="width:64%"></p><p class="b" style="width:70%"></p>',
  };
  const HOPS = [0, 4, 1, 7, 2, 6, 3, 5, 1, 4];

  /* a session's state as one mark at a row's size (home/Side.tsx Mark) */
  const SIX = ['#ff2e4e', '#ff4888', '#fb7129', '#f89b2a', '#f4c82a', '#70df45'], WARM = ['#ff4888', '#fb7129', '#f89b2a', '#f4c82a'];
  let uid = 0;
  function mark(st) {
    const id = `sem${++uid}`;
    if (st === 'needs') return `<svg viewBox="0 0 16 16"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${
      [...SIX, ...SIX].map((c, j) => `<stop offset="${j / 12}" stop-color="${c}"/><stop offset="${(j + 1) / 12}" stop-color="${c}"/>`).join('')}</linearGradient><clipPath id="${id}c"><circle cx="8" cy="8" r="5"/></clipPath></defs><g clip-path="url(#${id}c)"><rect class="drift" x="3" y="3" width="20" height="10" fill="url(#${id})"/></g></svg>`;
    if (st === 'running') return `<svg viewBox="0 0 16 16"><defs><radialGradient id="${id}">${
      WARM.map((c, j) => `<stop offset="${j / 3}" stop-color="${c}" stop-opacity="${1 - j / 4}"/>`).join('')}</radialGradient></defs><circle class="breathe" cx="8" cy="8" r="6" fill="url(#${id})" opacity=".5"/><circle cx="8" cy="8" r="2.5" fill="#f89b2a"/></svg>`;
    if (st === 'failed') return '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="4" fill="#fd302d"/></svg>';
    return '';
  }
  const P = 'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"';
  const svg = d => `<svg viewBox="0 0 16 16" ${P}>${d}</svg>`;
  const ICON = {   // the same marks try.js draws
    side: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="4.6" height="10" rx="1.4" fill="currentColor"/><rect x="8.6" y="3.5" width="4.8" height="9" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    search: svg('<circle cx="7" cy="7" r="4.2"/><path d="m10.2 10.2 3.3 3.3"/>'),
    layers: svg('<path d="M8 2.5 2.5 5.5 8 8.5l5.5-3z"/><path d="m2.5 8.5 5.5 3 5.5-3"/>'),
    phone: svg('<path d="M5.2 2.5 3.4 3.1c-.6.2-1 .8-.9 1.5.6 4.4 4.5 8.3 8.9 8.9.7.1 1.3-.3 1.5-.9l.6-1.8-2.9-1.5-1.3 1.3c-1.5-.7-2.7-1.9-3.4-3.4l1.3-1.3z"/>'),
    mic: svg('<rect x="6" y="2" width="4" height="7.5" rx="2"/><path d="M3.8 7.8a4.2 4.2 0 0 0 8.4 0M8 12v2"/>'),
    write: svg('<path d="m3 13 1-3.2L10.6 3.2l2.2 2.2L6.2 12z"/><path d="M3 13h10"/>'),
    read: svg('<path d="M4 2h5.5L12 4.5V14H4z"/><path d="M6.3 7.5h3.4M6.3 10h3.4"/>'),
    ask: svg('<path d="M3 3.5h10v7H7.5L4.5 13v-2.5H3z"/>'),
    ok: '<svg viewBox="0 0 12 12"><path d="M2.5 6.3 5 8.6 9.6 3.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    fold: '<svg viewBox="0 0 16 16"><path d="m6 4.5 3.5 3.5L6 11.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  /* build */
  const stage = $('.stage', see), scene = $('.scene', see), story = $('.story', see);
  story.innerHTML = WORDS.steps.map(([h, p], i) => `<div class="st"><span>0${i + 1}</span><h2>${esc(h)}</h2><p>${esc(p)}</p></div>`).join('') + '<div class="rail"><b></b></div>';
  const sts = $$('.st', story), railFill = $('.rail b', story);

  const W = WORDS, B = W.bar, SD = W.side;
  const row = ([t, st, age, here]) => `<div class="hr${here ? ' here' : ''}"><span class="mk">${here ? mark('running') : mark(st)}</span><span class="tt">${esc(t)}</span><span class="ag">${esc(age)}</span></div>`;
  // a step Sol takes, as the demo's talk shows it: its glyph, what it does, the counts, a check once done
  const stepRow = ([g, verb, rest, plus, minus], at, done) => `<div class="hs" data-at="${at}" data-done="${done}"><span class="gl">${ICON[g]}</span><span class="tx"><b>${esc(verb)}</b> ${esc(rest)}</span>${
    plus ? `<span class="ct"><em>${esc(plus)}</em>${esc(minus)}</span>` : ''}<span class="ok">${ICON.ok}</span></div>`;
  const STEP1 = [.505, .52, .535, .58], STEP2 = [.835, .87, .895];
  scene.insertAdjacentHTML('beforeend', `
    <div class="glow"></div>
    <div class="hw">
      <div class="htop">
        <span class="hl"><i></i><i></i><i></i></span><span class="hkey">${ICON.side}</span>
        <span class="hti">${esc(W.title)}</span><span class="hwhere">${esc(W.where)}</span>
        <span class="hgrow"></span><span class="hpill"></span><span class="hmark"></span>
      </div>
      <div class="hbody">
        <div class="hside">
          <div class="htog"><span class="on">${esc(SD.modes[0])}</span><span>${esc(SD.modes[1])}</span></div>
          <div class="hr act"><span class="mk">+</span><span class="tt">${esc(SD.add)}</span><span class="ag">${esc(SD.key)}</span></div>
          <div class="hr act"><span class="mk">${ICON.search}</span><span class="tt">${esc(SD.all)}</span></div>
          ${SD.groups.map(g => `<div class="hg"><span class="mk">${ICON.fold}</span><span class="tt">${esc(g.name)}</span><span class="ag">${g.n}</span></div>${g.rows.map(row).join('')}<div class="hr more"><span class="tt">${esc(g.more)}</span></div>`).join('')}
          <div class="hg"><span class="mk">${ICON.fold}</span><span class="tt">${esc(SD.done[0])}</span><span class="ag">${SD.done[1]}</span></div>
          <div class="hr act set"><span class="mk">${ICON.layers}</span><span class="tt">${esc(SD.settings)}</span></div>
        </div>
        <div class="htalk">
          <div class="hchat">
            <div class="hm u" data-at=".5">${esc(W.ask1)}</div>
            <div class="hm hsteps" data-at="${STEP1[0]}">${W.steps1.map((s, i) => stepRow(s, STEP1[i], STEP1[i + 1])).join('')}</div>
            <div class="hm s" data-at=".58">${md(W.said1)}</div>
            <div class="hm u" data-at=".83">${esc(W.ask2)}</div>
            <div class="hm hsteps" data-at="${STEP2[0]}">${W.steps2.map((s, i) => stepRow(s, STEP2[i], STEP2[i + 1])).join('')}</div>
            <div class="hm s" data-at=".9">${md(W.said2)}</div>
          </div>
          <div class="hbar">
            <div class="hl1"><span class="hplus">+</span><span class="hin"><span class="tx"></span><i class="caret"></i><span class="ph">${esc(B.ph)}</span></span><span class="hstop">${esc(B.stop)}</span></div>
            <div class="hl2"><span class="pl mono">${esc(B.model)}</span><span class="pl heat" data-lv="1"><i></i><span class="ev">${esc(B.efforts[0])}</span></span><span class="pl">${esc(B.mode)}</span>${ICON.phone}${ICON.mic}<i class="ring"></i></div>
          </div>
        </div>
        <div class="hstage">
          <div class="ha week"><div class="hh"><i class="dot"></i><b>${esc(W.week.title)}</b><span class="kd">${esc(W.week.kind)}</span><span class="mt">${esc(W.week.live)}</span></div>
            <div class="days">${W.week.days.map(([d, items], i) => `<div class="${i === W.week.today ? 'now' : ''}"><b>${esc(d)}</b>${items.map(([t, k]) => `<p class="${k === 'big' ? 'lead' : k || ''}">${esc(t)}</p>`).join('')}</div>`).join('')}</div></div>
          <div class="ha runs"><div class="hh"><i class="dot"></i><b>${esc(W.runs.title)}</b><span class="kd">${esc(W.runs.kind)}</span><span class="mt">${esc(W.runs.live)}</span></div>
            <div class="rb">
              <div class="rtop"><span class="tot">${RUNS.reduce((a, c) => a + c, 0).toFixed(1)}<small>${esc(W.runs.unit)}</small></span><span class="add">${esc(W.runs.add)}</span></div>
              <div class="bars">${RUNS.map((v, i) => `<div class="${i === TODAY ? 'now' : ''}${v ? '' : ' zero'}" style="--v:${v / Math.max(8, ...RUNS)}"><em>${v ? v.toFixed(1) : ''}</em><span></span></div>`).join('')}</div>
              <div class="rdl">${W.runs.days.map((d, i) => `<span class="${i === TODAY ? 'now' : ''}">${esc(d)}</span>`).join('')}</div>
              <div class="cells">${Array.from({ length: GOAL }, (_, i) => `<i class="${i < Math.floor(RUNS.reduce((a, c) => a + c, 0)) ? 'got' : ''}"></i>`).join('')}<small>${esc(W.runs.goal)}</small></div>
            </div></div>
        </div>
      </div>
    </div>
    <div class="hdots"></div>
    <div class="hbig"></div>
    <div class="count"><b>0</b> ${esc(W.count)}</div>
    <div class="cur"><svg viewBox="0 0 16 22"><path d="M1 1v17l4.6-4.4 3 6.9 3-1.3-3-6.8H15z" fill="#fff" stroke="#000" stroke-width="1.2"/></svg><span class="you">${esc(W.you)}</span><span class="carry"></span></div>`);
  const hw = $('.hw', scene);
  const wins = DESK.map(a => {
    const el = document.createElement('div'); el.className = 'aw ' + a.k;
    el.innerHTML = `<div class="tb"><i></i><i></i><i></i><b class="nm">${esc(a.n)}</b></div><div class="bd">${BODY[a.k]()}</div>`;
    scene.insertBefore(el, hw.nextSibling); return el;
  });
  const glow = $('.glow', scene), cur = $('.cur', scene), carry = $('.carry', cur), count = $('.count', scene);
  const heat = $('.heat', hw), heatV = $('.heat .ev', hw), tx = $('.hin .tx', hw), ph = $('.hin .ph', hw), bar = $('.hbar', hw), msgs = $$('.hm', hw), steps = $$('.hs', hw);
  const hereMk = $('.hr.here .mk', hw), pill = $('.hpill', hw), talk = $('.htalk', hw), stageEl = $('.hstage', hw), added = $$('.days p.added', hw);
  const week = $('.ha.week', hw), runs = $('.ha.runs', hw), dotsEl = $('.hdots', scene), big = $('.hbig', scene), markEl = $('.hmark', hw);
  const cx = a => a.x + a.w / 2, cy = a => a.y + a.h / 2;

  /* the jelly: the six in flight (dots), the fused body (big), and the mark at the top, where it lives */
  let J = null;
  function withJelly() {
    const J0 = SolJelly;
    J = { mark: J0.mount(markEl, { size:18, halo:'breath' }), big: null, dots: still ? null : J0.dots(dotsEl, { dot:14 }), take: 'breath', put: 0, size: 0 };
    sizeBig(); last = -1;
  }
  // the fused body is mounted at its size for the layout (smaller where the scene is laid out small)
  function sizeBig() {
    if (!J || still) return;
    if (J.size === G.big) return;
    J.big?.destroy(); J.size = G.big;
    big.style.width = big.style.height = G.big + 'px';
    J.big = SolJelly.mount(big, { size:G.big, state:'apart', halo:'pool' }); J.big.home(AT);
  }
  // jelly.js is index.html's to load; if it has not by the time the page is parsed, load it here, once
  function needJelly() {
    if (typeof SolJelly !== 'undefined') return withJelly();
    const tag = $('script[src$="jelly.js"]');
    if (tag) { tag.addEventListener('load', () => typeof SolJelly !== 'undefined' && withJelly()); return; }
    const s = document.createElement('script'); s.src = 'jelly.js'; s.onload = withJelly; document.body.append(s);
  }

  /* the layout. Wide (a desk): the 900 x 680 scene scaled into the room right of the words, when that keeps its words
     at reading size. Otherwise compact: the scene is the room itself at real size (under the words on a phone, beside
     them on a small desk), the windows in a grid, Home without its side; its talk and stage side by side where they
     both fit, else one at a time (the talk while you type, the stage when something lands). */
  const AT = .6;   // the mounted jelly's home(x) when the flying six hand over to it
  let G = { compact:false, twin:false, s:1, x:0, y:0, w:900, h:680, big:96, F:{ x:450, y:340 }, M:{ x:0, y:0 }, I:{ x:0, y:0 }, pane:0 };
  const at = (el, stop) => { let x = 0, y = 0; for (let e = el; e && e !== stop; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; } return { x, y }; };
  function layout() {
    const Wd = stage.clientWidth, H = stage.clientHeight, narrow = Wd < 900;
    // under the words on a narrow screen: they wrap to more lines on a phone, so the scene starts lower there
    const box = narrow ? (t => ({ x:12, y:t, w:Wd - 24, h:H - t - 12 }))(Wd < 560 ? Math.max(H * .36, 280) : 254) : { x:Wd * .37, y:56, w:Wd * .61 - 8, h:H - 80 };
    const s = Math.min(box.w / 900, box.h / 680), compact = narrow || s < .85;
    G = { ...G, compact, twin:compact && box.w >= 560 };
    see.classList.toggle('compact', compact); see.classList.toggle('twin', G.twin);
    if (compact) {
      Object.assign(G, { s:1, x:box.x, y:box.y, w:box.w, h:box.h, big:72 });
      const cols = box.w >= 560 ? 4 : 2, rows = 8 / cols, gap = 12, top = 34;
      const w = (box.w - gap * (cols - 1)) / cols, h = Math.min(150, (box.h - top - gap * (rows - 1) - 24) / rows);
      // the grid sits in the middle of the room under the count (on a tablet it is far shorter than the room)
      const y0 = top + Math.max(0, (box.h - top - (rows * h + gap * (rows - 1))) / 2);
      APPS = DESK.map((a, i) => ({ ...a, x:(i % cols) * (w + gap), y:y0 + Math.floor(i / cols) * (h + gap), w, h, r:a.r * .5 }));
      count.style.top = (y0 - top) + 'px';   // the count stays just above the grid
    } else {
      Object.assign(G, { s, x:box.x + (box.w - 900 * s) / 2, y:box.y + (box.h - 680 * s) / 2, w:900, h:680, big:96 });
      APPS = DESK; count.style.top = '';
    }
    FROM = APPS.filter(a => a.ai != null).sort((a, b) => a.ai - b.ai);
    scene.style.width = G.w + 'px'; scene.style.height = G.h + 'px';
    scene.style.transform = `translate(${G.x}px,${G.y}px) scale(${G.s})`;
    APPS.forEach((a, i) => Object.assign(wins[i].style, { left:a.x + 'px', top:a.y + 'px', width:a.w + 'px', height:a.h + 'px' }));
    if (compact) Object.assign(hw.style, { left:'0px', top:'0px', width:G.w + 'px', height:G.h + 'px' });
    else Object.assign(hw.style, { left:'8px', top:'16px', width:'884px', height:'648px' });
    // where things are inside Home, read off the laid-out window (offsets ignore its rising transform)
    const body = $('.hbody', hw), bo = at(body, scene), mo = at(markEl, scene), io = at($('.hin', hw), scene);
    G.F = { x:bo.x + body.offsetWidth / 2, y:bo.y + body.offsetHeight / 2 };
    G.M = { x:mo.x + markEl.offsetWidth / 2, y:mo.y + markEl.offsetHeight / 2 };
    G.I = { x:io.x, y:io.y + 2 };
    G.pane = talk.offsetWidth + 16;
    sizeBig(); last = -1;
  }
  addEventListener('resize', layout); addEventListener('load', layout); layout();
  $('link[href$="see.css"]')?.addEventListener('load', layout);   // until its look has loaded, the measures are off
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', needJelly) : needJelly();

  function draw(t) {
    const r = see.getBoundingClientRect(), H = innerHeight;
    const enter = still ? 1 : clamp((H - r.top) / H);             // the section rising under the desk, before it pins
    const pr = clamp(-r.top / (r.height - H)), p = still ? 1 : pr; // reduced motion: the scene is its finished end
    const fold = span(p, .24, .44);
    stage.style.setProperty('--glue', 1 - fold); stage.style.setProperty('--fold', fold);

    // 1: the windows falling in and drifting; 2: as the bodies leave them, they sink toward Home and are gone
    APPS.forEach((a, i) => {
      const el = wins[i], fall = ease(clamp(enter * 1.5 - .25 - i * .06));
      const k = span(p, .25 + (i % 4) * .02, .37 + (i % 4) * .02);
      const drift = still ? 0 : Math.sin(t / 1700 + i * 1.3) * 4 * (1 - k);
      const dx = (G.F.x - cx(a)) * .3 * k, dy = (G.F.y - cy(a)) * .3 * k + drift + (1 - fall) * 420;
      el.style.transform = `translate(${dx}px,${dy}px) rotate(${a.r * (1 - k) + (1 - fall) * a.r * 5}deg) scale(${1 - .22 * k})`;
      el.style.opacity = fall * (1 - k);
      el.style.visibility = k > .999 ? 'hidden' : 'visible';
    });
    // Home rises under them
    const sw = span(p, .26, .4);
    hw.style.opacity = sw; hw.style.transform = `translateY(${(1 - sw) * 30}px) scale(${lerp(.94, 1, sw)})`;
    glow.style.opacity = sw * (.6 + .4 * span(p, .86, .92));

    // the cursor: running between windows (the clock), then settling on the chat bar (the scroll)
    if (!still) {
      const seg = t / 950, n = Math.floor(seg), g = ease(Math.min(1, (seg % 1) * 1.6));
      const A = APPS[HOPS[n % HOPS.length]], Bw = APPS[HOPS[(n + 1) % HOPS.length]];
      const hx = lerp(A.x + A.w * .55, Bw.x + Bw.w * .55, g), hy = lerp(A.y + A.h * .55, Bw.y + Bw.h * .55, g) - Math.sin(g * Math.PI) * 40;
      const settle = span(p, .3, .42), ix = G.I.x + Math.min(tx.offsetWidth, talk.offsetWidth - 120);
      cur.style.transform = `translate(${lerp(hx, ix, settle)}px,${lerp(hy, G.I.y, settle)}px)`;
      // you are there while you carry and while you type; once it is sent, Sol has it
      // (and where the talk and the stage take turns, only while the talk is the one in view)
      cur.style.opacity = enter * clamp(1 - span(p, .5, .53) + span(p, .73, .76) - span(p, .83, .86)) * (G.compact && !G.twin ? clamp(1 - pour(slide)) : 1);
      if (n !== hop) {
        hop = n; carry.textContent = W.glue[n % W.glue.length];
        wins.forEach((w, i) => w.classList.toggle('hit', i === HOPS[(n + 1) % HOPS.length] && fold < .2));
        if (W.glue[n % W.glue.length].includes('again')) told++;
      }
      cur.classList.toggle('busy', fold < .3);
      count.firstChild.textContent = 9 + told; count.style.opacity = clamp(enter * 2 - 1) * (1 - fold * 2);
    }

    // what is typed, said and made
    const typed = p < .66 ? W.ask1.slice(0, Math.round(W.ask1.length * clamp((p - .42) / .07))) : W.ask2.slice(0, Math.round(W.ask2.length * clamp((p - .76) / .06)));
    const sent = (p >= .5 && p < .76) || p >= .83, working = (p >= .5 && p < .58) || (p >= .83 && p < .9);
    tx.textContent = sent ? '' : typed;
    ph.textContent = working ? B.busy : B.ph; ph.style.opacity = tx.textContent ? 0 : 1;
    bar.classList.toggle('busy', working);
    const lv = p >= .76 ? 2 : 1;   // as Your turn: medium, then high for the second ask
    if (heat.dataset.lv !== String(lv)) { heat.dataset.lv = lv; heatV.textContent = B.efforts[lv - 1]; }
    msgs.forEach(m => m.classList.toggle('on', p >= +m.dataset.at));
    steps.forEach(s => { s.classList.toggle('on', p >= +s.dataset.at); s.classList.toggle('done', p >= +s.dataset.done); });
    hereMk.classList.toggle('on', working);
    land(week, (p - .545) / .05); land(runs, (p - .845) / .05);
    added.forEach(a => a.classList.toggle('on', p >= .88));
    const made = p >= .86 ? 2 : p >= .56 ? 1 : 0;
    pill.textContent = made ? W.onStage(made) : ''; pill.classList.toggle('on', !!made);
    // one pane at a time where the talk and the stage do not both fit: the stage when something lands, else the talk
    if (G.compact && !G.twin) {
      // the pane goes by the clock toward the one p asks for, so wherever the reader stops, the frame is whole
      const want = still || (p >= .56 && p < .745) || p >= .855 ? 1 : 0, dt = Math.min(.1, Math.max(0, (t - slideT) / 1000));
      slideT = t; slide = still ? want : slide + (want - slide) * (1 - Math.exp(-dt / .09));
      if (Math.abs(want - slide) < .002) slide = want;
      const v = pour(slide);
      talk.style.transform = `translateX(${-v * G.pane}px)`; stageEl.style.transform = `translateX(${(1 - v) * G.pane}px)`;
    } else talk.style.transform = stageEl.style.transform = '';

    // the words: under reduced motion the picture is the end, so its words are the last step's
    const now = still ? 2 : pr < .36 ? 0 : pr < .64 ? 1 : 2;
    if (now !== step) { step = now; sts.forEach((s, i) => { s.classList.toggle('on', i === now); s.classList.toggle('past', i < now); }); }
    railFill.style.height = (still ? 1 : pr) * 100 + '%';
    story.style.opacity = still ? 1 : clamp(enter * 1.6 - .5);

    if (J) body(p, working);
  }
  // an artifact lands on the stage on the app's pour, scrubbed: a little low and small, then in its place
  function land(el, a) {
    const e = pour(clamp(a));
    el.style.opacity = clamp(a * 2.5); el.style.transform = `translateY(${(1 - e) * 16}px) scale(${lerp(.94, 1, e)})`;
    el.style.visibility = a <= 0 ? 'hidden' : 'visible';
  }

  // the jelly, by p: six bodies leave six windows, fly to Home and fuse; the one body takes its face and goes to the mark
  function body(p, working) {
    const take = working ? 'close' : 'breath';
    if (take !== J.take) { J.take = take; J.mark.halo(take); }
    const T = span(p, .46, .5), home = T >= 1;
    markEl.style.opacity = home ? 1 : 0;
    if (still || !J.big) return;
    if (p === last) return; last = p;
    // the flight: each body grows out of its window's middle and arcs in to its place in the six (the mounted jelly's
    // own six at home(AT): ring radius lerp(.27, .13, AT) of its 1.75 frame), the body's radius the jelly's own
    const RING = lerp(.27, .13, AT) * 1.75 * G.big, DOT = .085 * 1.75 * G.big;
    const grow = span(p, .2, .25), X = clamp((p - .4) / .02), F = G.F;
    if (grow > 0 && X < 1) {
      J.dots.put(FROM.map((a, i) => {
        const k = span(p, .25 + i * .01, .35 + i * .01), ang = i / 6 * Math.PI * 2 - Math.PI / 2;
        const tx0 = F.x + Math.cos(ang) * RING, ty0 = F.y + Math.sin(ang) * RING;
        const sx = cx(a), sy = cy(a), mx = (sx + tx0) / 2 + (sy - ty0) * .35, my = (sy + ty0) / 2 - (sx - tx0) * .35;
        const u = 1 - k;
        return [u * u * sx + 2 * u * k * mx + k * k * tx0, u * u * sy + 2 * u * k * my + k * k * ty0];
      }), Math.max(.5, DOT * grow));
      J.put = 1;
    } else if (J.put) { J.dots.clear(); J.put = 0; }
    dotsEl.style.opacity = 1 - X;
    // the fuse, then the trip to the mark (the body scales down to the mark's size on the way)
    J.big.home(lerp(AT, 1, span(p, .41, .46)));
    const s = lerp(1, 18 / G.big, T), x = lerp(F.x, G.M.x, T), y = lerp(F.y, G.M.y, T) - Math.sin(T * Math.PI) * 30;
    big.style.transform = `translate(${x - G.big / 2}px,${y - G.big / 2}px) scale(${s})`;
    big.style.opacity = home ? 0 : X;
    big.style.visibility = home || X <= 0 ? 'hidden' : 'visible';
  }

  if (still) see.classList.add('still');
  (function tick(t) {
    const r = see.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) draw(t);
    requestAnimationFrame(tick);
  })(0);
})();
