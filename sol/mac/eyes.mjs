#!/usr/bin/env node
// The seven human checks on the real face, shot and measured (#891; the night brief's "human checks"). Shoots Build with
// one, three and six blocks open, a block being dragged, a block resized, the tray open, and Home's first screen, its
// ribbon and Calm (nothing needs you), at 900×700, 1280×800 and 1512×982, with the run's switches (`stage.whole`,
// `sol.home.whole`) on, off, or both. Then computes what a machine can of the seven, and fails with the place named:
//   (1) text that reads through to what is behind it, or contrast under 4.5:1: the pixels under and around each line
//       of text, sampled from the shot itself (the line's top and bottom edge rows are its ground, the pixel farthest
//       from the ground inside it is its ink); "reads through" is a ground that varies under one line (its darkest and
//       lightest tenth more than 1.6:1 apart);
//   (2) two things overlap, or a thing is cut by the window: the blocks', the talk's and the tray's rectangles, each
//       pair, and each against the window and the stage's own box; a block's title ellipsed is not a cut (rule 4);
//   (3) more than one thing moving for attention at rest: animations still running 3 s after the scene settles, with
//       motion not reduced, counted per element (an infinite one is moving for attention);
//   (7) a wait over 2 s with nothing changing: from the press that opens a stage to its blocks drawn.
// Checks (4) the order of work can be followed and (6) said twice or a label that says nothing are the eye's; the
// review page lists them per shot (eyes.json "eye").
// Played against an engine and a face from this checkout on their own ports (eyes-up.sh up).
//   bash sol/mac/eyes-up.sh up
//   node sol/mac/eyes.mjs --face http://127.0.0.1:1453 --engine ws://127.0.0.1:7813 --out <folder> \
//     [--switch on|off|both] [--size 1280x800,...] [--only build|home] [--tag before]
// Writes <out>/<tag>-<switch>-<size>-<scene>.png and <out>/<tag>.json; exits 1 when a computed check fails, each fault
// printed as "fail  (n) <scene>: <what> at <where>".
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const FIX = join(ROOT, "sol/design/system/fixtures/stage");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) { if (d !== undefined) return d; throw new Error(`${k} is needed`); } return args[i + 1]; };
const FACE = opt("--face"), ENGINE = opt("--engine"), OUT = opt("--out"), TAG = opt("--tag", "eyes");
const DESK = opt("--desk", "on") === "on";
const JSON_AS = opt("--json", TAG);
const SWITCH = opt("--switch", "both"), ONLY = opt("--only", "");
const SIZES = opt("--size", "900x700,1280x800,1512x982").split(",").map((s) => s.split("x").map(Number));
const IDS = { 1: "7a1c0a00-0000-4000-8000-0000000891b1", 3: "7a1c0a00-0000-4000-8000-0000000891b3", 6: "7a1c0a00-0000-4000-8000-0000000891b6" };
const BLOCKS = ["week", "kit-side", "side-diff", "stills", "gate", "legacy"];
const { chromium } = createRequire(join(ROOT, "sol/engine/package.json"))("playwright");
const WAIT = Number(process.env.SHOOT_WAIT ?? 600_000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** the bar every line of text is held to (WCAG AA, body text) and the ground's spread that says "reads through" */
const AA = 4.5, THROUGH = 1.6, WAIT_MAX = 2000;

function wire() {
  const ws = new WebSocket(ENGINE, { headers: { origin: new URL(FACE).origin } });
  const asks = new Map();
  let n = 0;
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.rid && asks.has(m.rid)) { asks.get(m.rid)(m); asks.delete(m.rid); } };
  const open = new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  const ask = async (type, a) => {
    await open;
    const rid = `eyes-${++n}`;
    const r = await new Promise((ok) => { asks.set(rid, ok); ws.send(JSON.stringify({ type, rid, ...a })); });
    if (r.error) throw new Error(`${type}: ${r.error}`);
    return r;
  };
  return { ask, close: () => ws.close() };
}
const fixture = (id) => ({
  b: JSON.parse(readFileSync(join(FIX, "blocks", id, "block.json"), "utf8")),
  body: JSON.parse(readFileSync(join(FIX, "blocks", id, "body.json"), "utf8")),
});

// ── what the page says of itself: every rectangle the checks need, read in the page ─────────────────────────────────
/* eslint-disable no-undef */
function readPage() {
  const vw = innerWidth, vh = innerHeight;
  const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  const shown = (e) => { const s = getComputedStyle(e); if (s.visibility === "hidden" || s.display === "none") return false; for (let p = e; p; p = p.parentElement) if (+getComputedStyle(p).opacity < 0.05) return false; const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const name = (e) => e.getAttribute("data-block") ? `block "${e.getAttribute("data-block")}"` : e.getAttribute("data-part") ?? e.getAttribute("aria-label") ?? (e.className && String(e.className).split(" ")[0]) ?? e.tagName.toLowerCase();
  const things = [];
  for (const e of document.querySelectorAll(".st-block:not(.st-ghosted):not(.dying), .st-talk, .st-tray.open .st-trayshelf, .hw-stack, .hw-touch, .hw-receipt, .hw-line, .hwr, [data-ribbon]")) if (shown(e)) things.push({ what: name(e), r: R(e), stage: !!e.closest(".st-stagebox, .st-stage") && e.classList.contains("st-block") });
  const stage = document.querySelector(".st-stagebox, .st-stage");
  // lines of text: an element whose own text nodes say something, not inside an svg or a canvas
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Map();   // element → its number: words of one element never collide with themselves
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const e = t.parentElement;
    if (!e || !t.textContent.trim() || e.closest("svg, script, style, [aria-hidden=true], .xterm-helpers, .counts")) continue;
    if (!seen.has(e)) seen.set(e, seen.size + 1);
    if (!shown(e)) continue;
    const k = seen.get(e);
    const rg = document.createRange(); rg.selectNodeContents(t);   // this text alone, not the element's children
    for (const r of rg.getClientRects()) {
      if (r.width < 4 || r.height < 6) continue;
      // hidden: wholly outside any box that clips it (a shelf scrolled, a fold), not cut
      let hid = false, vx0 = r.left, vx1 = r.right;
      for (let p = e; p && p !== document.body && !hid; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (ps.overflow === "visible" && ps.overflowX === "visible" && ps.overflowY === "visible") continue;
        const pr = p.getBoundingClientRect();
        hid = r.left >= pr.right - 1 || r.right <= pr.left + 1 || r.top >= pr.bottom - 1 || r.bottom <= pr.top + 1;
        vx0 = Math.max(vx0, pr.left); vx1 = Math.min(vx1, pr.right);   // what shows of a line ellipsed or scrolled
      }
      if (hid || vx1 - vx0 < 4) continue;
      const cut = r.right > vw + 0.5 || r.bottom > vh + 0.5 || r.left < -0.5 || r.top < -0.5;
      const s = getComputedStyle(e);
      // text cut by the box that holds it (not an ellipsis): the box clips and the text runs past it
      let clip = null;
      for (let p = e; p && p !== document.body; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (ps.overflow === "visible" && ps.overflowX === "visible" && ps.overflowY === "visible" && ps.clipPath === "none") continue;
        const pr = p.getBoundingClientRect();
        // wholly outside the box that clips it: hidden, not cut
        if (r.top >= pr.bottom - 1 || r.bottom <= pr.top + 1 || r.left >= pr.right - 1 || r.right <= pr.left + 1) { clip = "hidden"; break; }
        if (r.bottom > pr.bottom + 1 || r.top < pr.top - 1 || (r.right > pr.right + 1 && s.textOverflow !== "ellipsis")) { clip = name(p); }
        break;
      }
      // a sliver of a wrapped line, or a dot that holds a word for the screen reader: no glyph to read
      if (clip === "hidden" || r.height < parseFloat(s.fontSize) * 0.8 || r.width < parseFloat(s.fontSize) * 0.6) continue;
      texts.push({ text: t.textContent.trim().slice(0, 40), where: name(e.closest("[data-block],[data-part],[data-place],.hw-card,.hw-edge,section") ?? e), k, r: { x: vx0, y: r.y, w: vx1 - vx0, h: r.height }, size: parseFloat(s.fontSize), bold: +s.fontWeight >= 600, cut, clip });
    }
  }
  return { vw, vh, things, texts, stage: stage ? R(stage) : null };
}
/** the animations running for attention: those that never end, by the element they move */
function readMotion() {
  const by = new Map();
  for (const a of document.getAnimations()) {
    if (a.playState !== "running") continue;
    const t = a.effect?.getComputedTiming?.();
    if (!t || t.iterations !== Infinity) continue;
    const e = a.effect.target;
    if (!e || !e.isConnected) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue;
    const k = e.getAttribute?.("data-block") ?? e.getAttribute?.("aria-label") ?? String(e.className?.baseVal ?? e.className ?? e.tagName).split(" ")[0];
    by.set(e, `${k} (${a.animationName ?? "anim"})`);
  }
  return [...new Set(by.values())];
}
/** the pixels of a shot, read on a canvas: for each line of text, its ground and its ink and the ratio between them */
function readInk({ png, texts, dpr }) {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0);
      const lum = (r, gg, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b); };
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      ok(texts.map((t) => {
        const x0 = Math.max(0, Math.floor(t.r.x * dpr)), x1 = Math.min(c.width - 1, Math.ceil((t.r.x + t.r.w) * dpr));
        const y0 = Math.max(0, Math.floor(t.r.y * dpr)), y1 = Math.min(c.height - 1, Math.ceil((t.r.y + t.r.h) * dpr));
        if (x1 - x0 < 2 || y1 - y0 < 2) return null;
        const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data, W = x1 - x0, H = y1 - y0;
        const L = (x, y) => { const i = (y * W + x) * 4; return lum(d[i], d[i + 1], d[i + 2]); };
        // the ground: the line box's top and bottom rows (above the ascenders, below the descenders), and its ends
        const ground = [];
        for (const y of [0, 1, H - 2, H - 1]) for (let x = 0; x < W; x += 2) ground.push(L(x, y));
        ground.sort((a, b) => a - b);
        const mid = ground[ground.length >> 1], lo = ground[Math.floor(ground.length * 0.1)], hi = ground[Math.floor(ground.length * 0.9)];
        // the ink: the pixel farthest from the ground inside the line, its glyphs' cores
        let ink = mid, far = 0;
        for (let y = 2; y < H - 2; y++) for (let x = 0; x < W; x++) { const l = L(x, y), f = ratio(l, mid); if (f > far) { far = f; ink = l; } }
        return { ratio: +ratio(ink, mid).toFixed(2), worst: +Math.min(ratio(ink, lo), ratio(ink, hi)).toFixed(2), spread: +ratio(lo, hi).toFixed(2) };
      }));
    };
    img.src = `data:image/png;base64,${png}`;
  });
}
/* eslint-enable no-undef */

const pairOver = (a, b) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 1 && h > 1 ? Math.round(w) * Math.round(h) : 0;
};
const at = (r) => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}×${Math.round(r.h)}`;

/** the computed checks of one scene: faults as { n, what } */
function judge(page, ink, motion, waited) {
  const f = [];
  // (1) contrast and reading through, by line of text
  page.texts.forEach((t, i) => {
    const k = ink[i];
    // under 1.15:1 a line is not drawn at all (wholly under a fade, or the same colour as its ground): nothing to read
    if (!k || t.cut || k.ratio < 1.15) return;
    if (k.ratio < AA) f.push({ n: 1, what: `"${t.text}" in ${t.where} reads ${k.ratio}:1 (under ${AA}:1) at ${at(t.r)}` });
    else if (k.spread > THROUGH && k.worst < AA) f.push({ n: 1, what: `"${t.text}" in ${t.where} sits on a ground that reads through (it varies ${k.spread}:1 under it; ${k.worst}:1 at its worst) at ${at(t.r)}` });
  });
  // (2) overlap, pair by pair; cut by the window or by its own box
  const th = page.things;
  for (let i = 0; i < th.length; i++) for (let j = i + 1; j < th.length; j++) {
    const o = pairOver(th[i].r, th[j].r);
    if (o) f.push({ n: 2, what: `${th[i].what} and ${th[j].what} overlap (${o} px²) at ${at(th[i].r)} / ${at(th[j].r)}` });
  }
  for (const t of th) {
    const r = t.r;
    if (r.x < -0.5 || r.y < -0.5 || r.x + r.w > page.vw + 0.5 || r.y + r.h > page.vh + 0.5) f.push({ n: 2, what: `${t.what} is cut by the window at ${at(r)}` });
    else if (t.stage && page.stage && (r.x < page.stage.x - 0.5 || r.x + r.w > page.stage.x + page.stage.w + 0.5 || r.y + r.h > page.stage.y + page.stage.h + 0.5)) f.push({ n: 2, what: `${t.what} runs past the stage's edge at ${at(r)}` });
  }
  for (const t of page.texts) {
    if (t.cut) f.push({ n: 2, what: `"${t.text}" in ${t.where} is cut by the window at ${at(t.r)}` });
    else if (t.clip) f.push({ n: 2, what: `"${t.text}" in ${t.where} is cut by ${t.clip} at ${at(t.r)}` });
  }
  // words on words: two lines of different elements lying on each other (a label run into a label, a box over a card)
  const tx = page.texts.filter((t) => !t.cut);
  for (let i = 0; i < tx.length; i++) for (let j = i + 1; j < tx.length; j++) {
    const a = tx[i], b = tx[j];
    if (a.k === b.k) continue;
    const o = pairOver(a.r, b.r), small = Math.min(a.r.w * a.r.h, b.r.w * b.r.h);
    if (o > 0.25 * small) f.push({ n: 2, what: `"${a.text}" and "${b.text}" lie on each other (${a.where} / ${b.where}) at ${at(a.r)}` });
  }
  // (3) more than one thing moving at rest
  if (motion.length > 1) f.push({ n: 3, what: `${motion.length} things move at rest: ${motion.join(", ")}` });
  // (7) a wait with nothing changing
  if (waited != null && waited > WAIT_MAX) f.push({ n: 7, what: `${(waited / 1000).toFixed(1)} s from the press to the stage drawn` });
  return f;
}

/** the checks only an eye can judge, asked of every shot in the review page */
const EYE = {
  4: "the order of work: what happened first and what is next, without reading every label",
  5: "sizes and places follow the window and what is open (read across the three sizes)",
  6: "nothing said twice; no label that says nothing",
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const w = wire();
  // the stages: one, three and six blocks, composed once (a stage already holding them is left as it is)
  for (const [n, sid] of Object.entries(IDS)) {
    const g = await w.ask("work.stage.get", { sessionId: sid });
    if (g.stage.blocks.length >= +n) continue;
    for (const id of BLOCKS.slice(0, +n)) {
      const { b, body } = fixture(id);
      await w.ask("work.stage.compose", { sessionId: sid, block: { id: `${id}-${n}`, kind: b.kind, title: b.title, body: JSON.stringify(body), format: "json", waits: false } });
      await sleep(30);
    }
  }
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const reader = await (await browser.newContext()).newPage();
  const scenes = [], faults = [];
  const switches = SWITCH === "both" ? ["on", "off"] : [SWITCH];
  try {
    for (const sw of switches) for (const [vw, vh] of SIZES) {
      const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2 });
      const v = sw === "on" ? "1" : "0";
      await ctx.addInitScript((v) => { if (window !== window.top) return; for (const [k, x] of [["sol.home.clean", "1"], ["sol.welcomed", "1"], ["sol.engine", "next"], ["sol.counts.seen", "1"], ["stage.whole", v], ["sol.home.whole", v]]) localStorage.setItem(k, x); }, v);
      // the Mac's window is the base at 0.78 over the desktop, blurred (tokens.css --base, face.css body): the desktop
      // picture goes on the page's root, so the body's base and its blur are drawn over it as the window's are
      if (DESK) await ctx.addInitScript((src) => {
        if (window !== window.top) return;
        const put = () => { const st = document.createElement("style"); st.textContent = `html{background:url(${src}) center/cover fixed}`; document.head.appendChild(st); };
        if (document.head) put(); else document.addEventListener("DOMContentLoaded", put);
      }, `/@fs${join(ROOT, "sol/design/body/real/desktop.jpg")}`);
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e?.message ?? e)));
      const size = `${vw}x${vh}`;
      const shoot = async (scene, says, waited) => {
        await page.mouse.move(vw - 2, vh - 2).catch(() => {});
        await sleep(3000);
        const motion = await page.evaluate(readMotion);
        const data = await page.evaluate(readPage);
        const file = `${TAG}-${sw}-${size}-${scene}.png`;
        const buf = await page.screenshot({ path: join(OUT, file), caret: "initial", timeout: WAIT });
        const ink = await reader.evaluate(readInk, { png: buf.toString("base64"), texts: data.texts, dpr: 2 });
        const f = judge(data, ink, motion, waited);
        if (errors.length) f.push({ n: 0, what: `the page threw: ${errors.splice(0).join("; ")}` });
        for (const x of f) { faults.push({ ...x, file }); console.log(`fail  (${x.n}) ${file}: ${x.what}`); }
        const worst = ink.filter(Boolean).reduce((m, k) => Math.min(m, k.ratio), Infinity);
        scenes.push({ file, switch: sw, size, scene, says, faults: f, motion, waited, things: data.things, lowest: Number.isFinite(worst) ? worst : null, eye: EYE });
        console.log(`shot  ${file} (${f.length} fault${f.length === 1 ? "" : "s"})`);
        return data;
      };
      await page.goto(`${FACE}/?stage.whole=${sw}&sol.home.whole=${sw}`);
      await page.locator("[data-sid]").first().waitFor({ state: "attached", timeout: 120_000 });
      await sleep(2000);
      if (await page.getByRole("button", { name: "OK" }).count()) await page.getByRole("button", { name: "OK" }).first().click();

      if (ONLY !== "home") for (const n of [1, 3, 6]) {
        const t0 = Date.now();
        await page.locator(`[data-sid="${IDS[n]}"]`).first().evaluate((e) => e.click());
        await page.locator(".st-room").first().waitFor({ state: "attached", timeout: 60_000 });
        let waited = null;
        // drawn: a block on the stage, or, with the talk full (a narrow window), the blocks as chips at its foot
        try { await page.waitForFunction(() => document.querySelectorAll(".st-block:not(.st-ghosted), .st-talkchips > *").length > 0, null, { timeout: 15_000 }); waited = Date.now() - t0; } catch { waited = 15_000; }
        await sleep(2500);
        const d = await shoot(`build-${n}`, `Build with ${n} block${n > 1 ? "s" : ""} open, the talk beside the stage`, waited);
        if (n !== 3) continue;
        // a block being dragged: its head held and carried a third of the stage to the right and down
        const blocks = d.things.filter((t) => t.what.startsWith("block"));
        if (blocks.length) {
          // the last block's head carried over the first block's middle: two in one place, the moment glass shows through
          const mover = page.locator(".st-block:not(.st-ghosted)").last();
          const id = await mover.getAttribute("data-block");
          const head = await mover.locator(".st-head").first().boundingBox();
          const under = (blocks.find((b) => b.what !== `block "${id}"`) ?? blocks[0]).r;
          await page.mouse.move(head.x + 30, head.y + head.height / 2); await page.mouse.down();
          const to = { x: under.x + under.w * 0.4, y: under.y + under.h * 0.4 };
          for (let i = 1; i <= 16; i++) { await page.mouse.move(head.x + 30 + (to.x - head.x - 30) * i / 16, head.y + head.height / 2 + (to.y - head.y - head.height / 2) * i / 16); await sleep(60); }
          await sleep(900);
          const data = await page.evaluate(readPage), file = `${TAG}-${sw}-${size}-build-3-drag.png`;
          const buf = await page.screenshot({ path: join(OUT, file), caret: "initial", timeout: WAIT });
          const ink = await reader.evaluate(readInk, { png: buf.toString("base64"), texts: data.texts, dpr: 2 });
          // in the hand a block may pass over others and past the window's edge (it pops out only when let go there,
          // feel.md), and the words it covers are hidden under it: none is a fault while it is held; the rest is
          const f = judge(data, ink, [], null).filter((x) => x.n !== 2 || !(/overlap|lie on each other/.test(x.what) || x.what.includes(`block "${id}"`)));
          for (const x of f) { faults.push({ ...x, file }); console.log(`fail  (${x.n}) ${file}: ${x.what}`); }
          scenes.push({ file, switch: sw, size, scene: "build-3-drag", says: "a block held by its head and carried across the stage", faults: f, motion: [], things: data.things, eye: EYE });
          console.log(`shot  ${file}`);
          await page.mouse.up(); await sleep(1500);
          await shoot("build-3-dropped", "the dragged block let go: where it landed, and what stepped aside");
        }
        // a block resized: its right edge (the grip, with the switch off) pulled out by a quarter of the stage
        const grip = sw === "on" ? ".st-block:not(.st-ghosted) .st-edge.e, .st-block:not(.st-ghosted) .st-edge.se" : ".st-block:not(.st-ghosted) .st-grip";
        const gb = await page.locator(grip).first().isVisible() ? await page.locator(grip).first().boundingBox() : null;
        if (gb) {
          const s = d.stage ?? { w: vw };
          await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2); await page.mouse.down();
          for (let i = 1; i <= 8; i++) { await page.mouse.move(gb.x + gb.width / 2 + (s.w / 4) * i / 8, gb.y + gb.height / 2 + 40 * i / 8); await sleep(40); }
          await page.mouse.up(); await sleep(1500);
          await shoot("build-3-resized", "a block's edge pulled out by a quarter of the stage: the block grows, the others make room");
        }
        // the tray open
        if (await page.locator(".st-trayline").first().isVisible()) {
          await page.locator(".st-trayline").first().click();
          await sleep(800);
          await shoot("build-3-tray", "the tray open at the stage's foot: the project's other blocks as miniatures");
          await page.locator(".st-trayline").first().click().catch(() => {});
        }
      }
      if (ONLY !== "build") {
        const home = page.locator('.spine [aria-label^="home"]').first();
        if (await home.count()) {
          await home.click();
          await sleep(4000);
          await shoot("home-first", "Home's first screen: the line, the week's ribbon, one card in front");
          const rib = page.locator(".hwr, [data-ribbon]").first();
          if (await rib.count()) {
            const file = `${TAG}-${sw}-${size}-home-ribbon.png`;
            await rib.screenshot({ path: join(OUT, file), timeout: WAIT });
            scenes.push({ file, switch: sw, size, scene: "home-ribbon", says: "the week's ribbon, close", faults: [], motion: [], things: [], eye: EYE });
          }
          // Calm: every card answered, nothing needs you
          for (let i = 0; i < 5 && await page.locator('[data-answer="warm"]').count(); i++) { await page.locator('[data-answer="warm"]').first().click(); await sleep(900); }
          await shoot("home-calm", "Calm: everything answered, nothing needs you");
        }
      }
      await ctx.close();
    }
  } finally { await browser.close().catch(() => {}); w.close(); }
  writeFileSync(join(OUT, `${JSON_AS}.json`), JSON.stringify({ at: new Date().toISOString(), scenes, faults }, null, 2) + "\n");
  const by = faults.reduce((m, x) => ({ ...m, [x.n]: (m[x.n] ?? 0) + 1 }), {});
  console.log(`eyes: ${scenes.length} shots, ${faults.length} faults ${JSON.stringify(by)}; ${OUT}/${JSON_AS}.json`);
  return faults.length ? 1 : 0;
}

main().then((code) => process.exit(code), (e) => { console.error(`eyes: ${e?.stack ?? e}`); process.exit(2); });
