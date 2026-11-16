// The motion module (#763, ui.md "Motion", build/feel.md "Tokens"): each of the five springs settles within its time,
// the 4 px clamp holds, slow ×4 makes a settle four times longer, and the hand (a drag following the finger, the lag
// token) is never slowed. Nothing else in the face imports timing. No DOM: the springs are stepped by `advance`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CFG, CLAMP, Spring, advance, dur, running, setSlow, slowFactor, type Cfg, type SpringName } from "./motion.ts";
import { SPRING, TIMED } from "./kit/tokens.ts";

const FRAME = 1000 / 60;
/** a spring from 0 to `to`, stepped a 60 Hz frame at a time: when it came within 1 % of its move for good (settled,
 *  as feel.md measures it), when it was at rest, its peak and where it ended */
function settleMs(cfg: Cfg, to = 100, o: { vel?: number } = {}) {
  let peak = 0, ms = 0, settled = 0;
  const s = new Spring(0, { ...cfg, eps: 0.01 }, (v) => { peak = Math.max(peak, v); if (Math.abs(v - to) > to * 0.01) settled = ms + FRAME; });
  s.to(to, { vel: o.vel });
  while (!s.resting && ms < 20_000) { advance(FRAME); ms += FRAME; }
  return { ms: settled, rest: ms, peak, end: s.v };
}

// feel.md's measured times as the bound (settle 204, travel 407, glide 544); lift's ~120 and fade's ~200 were read off a
// scale and an opacity by eye: the integrator puts them at about 175 and 335 to 1 %, so their bounds say so
const EXPECT: Record<SpringName, [number, number]> = {
  lift: [120, 200],
  settle: [180, 240],
  travel: [250, 420],
  fade: [280, 380],
  glide: [380, 560],
};

test("the five springs are feel.md's, read from tokens.json, at mass 1", () => {
  assert.equal(SPRING.mass, 1);
  for (const n of Object.keys(EXPECT) as SpringName[]) {
    assert.equal(CFG[n].k, SPRING[n].k, n);
    assert.equal(CFG[n].c, SPRING[n].c, n);
  }
  assert.deepEqual(Object.keys(CFG).sort(), ["fade", "glide", "lift", "settle", "travel"], "the old springs are gone");
});

test("each of the five settles within its expected time, in order of stiffness", () => {
  setSlow(false);
  const got = {} as Record<SpringName, number>;
  for (const n of Object.keys(EXPECT) as SpringName[]) {
    const { ms, end } = settleMs(CFG[n]);
    const [lo, hi] = EXPECT[n];
    assert.ok(ms >= lo && ms <= hi, `${n} settled in ${ms.toFixed(0)} ms, expected ${lo}-${hi}`);
    assert.equal(end, 100, `${n} rests on its target`);
    got[n] = ms;
  }
  assert.ok(got.lift < got.settle && got.settle < got.travel && got.travel < got.glide, JSON.stringify(got));
  assert.ok(Math.abs(got.settle - 204) <= 2 * FRAME, `settle ${got.settle.toFixed(0)} ms, feel.md measured 204`);
  assert.equal(running(), 0);
});

test("the clamp: a spring never passes its target by more than 4 px, even thrown hard", () => {
  setSlow(false);
  assert.equal(CLAMP, 4);
  for (const n of Object.keys(EXPECT) as SpringName[]) {
    const { peak, end } = settleMs(CFG[n], 100, { vel: 20_000 });   // a flick of 20 000 px/s toward the target
    assert.ok(peak <= 100 + CLAMP + 1e-9, `${n} peaked at ${peak.toFixed(2)}`);
    assert.equal(end, 100);
  }
  // and from above: the clamp holds on the near side too
  let low = Infinity;
  const s = new Spring(300, CFG.glide, (v) => { low = Math.min(low, v); });
  s.to(0, { vel: -40_000 });
  for (let i = 0; i < 300 && !s.resting; i++) advance(FRAME);
  assert.ok(low >= -CLAMP - 1e-9, `low ${low}`);
});

test("slow ×4 makes a settle four times longer, and every timed token four times as long", () => {
  setSlow(false);
  const normal = settleMs(CFG.settle).rest;
  setSlow(true);
  try {
    assert.equal(slowFactor(), SPRING.slow);
    const slow = settleMs(CFG.settle).rest;
    assert.ok(Math.abs(slow / normal - 4) < 0.15, `normal ${normal.toFixed(0)} ms, slow ${slow.toFixed(0)} ms`);
    for (const n of ["reveal", "turn", "glass", "pour", "breath"] as const) assert.equal(dur(n), TIMED[n] * 4, n);
  } finally { setSlow(false); }
  assert.equal(dur("turn"), 150);   // main's 150 stays (#993); ui.md's 160 is a separate decision
  assert.equal(dur("reveal"), 120);
  assert.equal(dur("glass"), 220);
  assert.equal(dur("pour"), 850);
  assert.equal(dur("breath"), 4800);
});

test("the hand is never slowed: a drag's follow writes at once, and lag keeps its 140", () => {
  setSlow(true);
  try {
    const seen: number[] = [];
    const s = new Spring(0, CFG.settle, (v) => seen.push(v));
    for (const x of [12, 40, 97]) { s.set(x); assert.equal(s.v, x); assert.equal(seen.at(-1), x, "written the same frame"); }
    assert.ok(s.resting, "a set never runs a spring");
    assert.equal(dur("lag"), 140);
    // released: from where the hand left it, the settle runs slowed
    s.to(0);
    advance(250);
    assert.ok(!s.resting, "slowed, a settle is still moving at 250 ms");
    advance(2000);
    assert.equal(s.v, 0);
  } finally { setSlow(false); }
});

test("a grab stops a running spring where it is: the block does not carry on under the finger", () => {
  setSlow(true);
  try {
    const s = new Spring(60, CFG.settle, () => {});
    s.to(0);
    advance(200);
    const at = s.v;
    assert.ok(at > 0 && at < 60, `mid-settle at ${at}`);
    s.set(s.v);                     // the grab (kit/Motion.tsx's down)
    advance(500);
    assert.equal(s.v, at, "held where the finger took it");
  } finally { setSlow(false); }
});

test("nothing else in the face imports timing: the springs and durations come only from motion.ts", () => {
  const root = new URL(".", import.meta.url).pathname;
  const files: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n)) files.push(p); } };
  walk(root);
  const bad: string[] = [];
  for (const f of files) {
    const rel = f.slice(root.length);
    if (rel === "motion.ts" || rel === "kit/tokens.ts" || rel === "creature/palette.ts") continue;
    const s = readFileSync(f, "utf8");
    if (/\bMOTION\b[^\n]*from "[./]*creature\/palette/.test(s) || /import[^;]*\b(TIMED|EASE|SPRING)\b[^;]*from "[./]*kit\/tokens/.test(s)) bad.push(`${rel}: imports timing`);
    if (/\{\s*k:\s*[\d.]+\s*,\s*z:\s*[\d.]+/.test(s) && /motion/.test(s)) bad.push(`${rel}: a spring typed by hand`);
    if (/\bCFG\.(away|panel|fold|tuck|slide|arrive|snap|pop|grow|press)\b/.test(s)) bad.push(`${rel}: an old spring`);
  }
  assert.deepEqual(bad, []);
});
