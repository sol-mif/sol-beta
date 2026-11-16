// Build mode's feel as tokens (#773, #751 B10): build/feel.md's springs and the hand's numbers, in the kit so nothing
// in the stage types its own. Springs are mass 1 (k stiffness, c damping), Part A's motion module's (motion.ts SPRINGS, the
// same five by name, from tokens.json); this file points at them.
import { SPRINGS, type Cfg } from "../motion.ts";

// the join (#843 landed Part A's motion module): the five springs are motion.ts's (k, c from tokens.json, the same
// numbers feel.md writes); this file keeps only how finely each comes to rest. Before, it built { k, z }, which motion's
// Spring no longer reads (it reads c), so no stage spring ever rested and nothing the hand did was committed
const of = (name: keyof typeof SPRINGS, eps = 0.05): Cfg => ({ ...SPRINGS[name], eps });
/** feel.md "Tokens": spring.settle · travel · glide · lift · fade (k, c) */
export const SPRING = {
  settle: of("settle"),   // release, resize, nudge, reopen
  travel: of("travel"),   // trade, unfold, step aside, fold flight
  glide: of("glide"),    // a flick's landing
  lift: of("lift", 0.0005),   // lift on grab (scale), stamp press: a scale, so its rest is finer
  fade: of("fade", 0.002),    // opacity, step back, close
} as const;
/** motion.clamp: a position spring never passes its target by more than this (px) */
export const CLAMP = 4;
/** the hand: lift scale about the grab point; drag threshold per pointer (px); the hold past the window's edge before a
 *  block may pop out (ms) */
export const LIFT = 1.012;
export const THRESHOLD = { mouse: 3, pen: 4, touch: 6 } as const;
export const POP_HOLD = 400;
/** the release speed is read from the last 100 ms of the hand's track */
export const TRACK_MS = 100;

// B12 (#775): resize. A band 10 wide astride every edge, corners 18 (feel.md "hit.min" row); the fit detent pulls the
// south edge to the content's height inside snap.reach; a pinch commits 180 ms after the fingers stop; cut content
// counts its lines at the body's line height (20) when it has no rows of its own
export const EDGE = { band: 10, corner: 18 } as const;
export const PINCH = { rest: 180, rate: 0.008 } as const;
export const LINE = 20;

// B15 (#778): undo. A close's outline lives 6 s (life.scar) with a 44 px ring that drains; the ring holds the undo glyph
// (a counter-clockwise arrow, 18 px, from feel.html) until the kit's glyph set lands with Part A
export const LIFE = { scar: 6000 } as const;
export const RING = { size: 44, r: 21 } as const;
export const GLYPH_UNDO = ["M5.2 7A5 5 0 1 1 4.6 11", "M4.6 3.8V7h3.2"] as const;

// B11 (#774): the drop preview in pearl (feel.md rules 1 and 4, feel.html's .gd, .pv and .target). A guide fades in with
// the pull, .2 at the reach's edge to .55 on capture; what the drop will move shows as dashed pearl-line outlines (1.5,
// dash 6 7); a trade's target dims to .62. The z-order table (feel.md "Z-order"): blocks by last touch stay under waits
export const GUIDE = { from: 0.2, to: 0.55, over: 10 } as const;   // over: past the blocks it joins, each end
export const OUTLINE = { line: 1.5, dash: "6 7" } as const;
export const TARGET_DIM = 0.62;
export const Z = { touched: 199, waits: 200, outline: 240, guide: 250, hand: 300, flight: 400, tray: 500, jelly: 600 } as const;

// B16 (#779): the tray and the fold flight (feel.md "fold", "unfold"; feel.html's .tray, .tq, .mini). The strip: a
// hairline at the stage's foot, 32 tall; up to 14 squares of 16 × 11 (corner 3), 4 apart, the first 6 in, 10 down; the
// count bumps 300 ms and the new square lands from 1.6 in 420 ms. A fold flies on spring.travel and fades from 140 ms.
// Open, small copies 132 × 92 (the block scaled into 132 × 70), grouped by session, on a shelf 156 tall. #954: a copy
// draws its block live, as whole.html's .mini: the content laid at 330 × 220 and scaled into the copy, 8 in, 22 over its title
export const TRAY = { h: 32, inset: 6, top: 10, sq: { w: 16, h: 11, r: 3, gap: 4 }, max: 14, fadeFrom: 140, bump: 300, land: 420, landFrom: 1.6, mini: { w: 132, h: 92, body: 70, pad: 8, foot: 22, at: { w: 330, h: 220 } }, shelf: 156, stagger: 30, from: 0.2 } as const;

// B25 (#788): the talk full (feel.html setFull): the talk's column 720; the blocks as a foot row of 120 × 72 copies, 10
// apart, centred, 96 up from the floor; the box rises 112 over them
export const FOOT = { w: 120, h: 72, gap: 10, up: 96, talk: 720, pad: 112 } as const;

// B17 (#780): born at the content's size (whole.md "arrival", "Engine changes"): a reading block is the measure wide,
// 412 for its words plus the body's sides (12 each); a run is the stage wide. Its first height is guessed from the
// content (a list: its rows at the chip's 24 and a hairline; its foot 35 = the list's top 4, the gap 8, the meter and count 24, less
// the last row's hairline; the head 34, the body's foot 12), then fitted to the content as it renders
export const BORN = { measure: 412, list: 300, side: 12, head: 34, row: 25, listFoot: 35, foot: 12, line: 20, ch: 7.4 } as const;
