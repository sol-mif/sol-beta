// Say where, in the box (#1090, design NOW 06:33 #1c): a short line that names an open block and a screen moves that
// block there and is not sent to the session; ⌘Z takes the move back and puts the words back in the box. Read on this
// machine only (what the person types is a prompt: it never leaves it). The same rule as the engine's sayHere.
import type { ScreensState } from "./model.ts";

const STOP = new Set(["the", "and", "for", "with", "this", "that", "from", "into", "onto", "over", "file", "files", "one", "two", "its", "put", "move", "bring", "show", "take", "send", "throw", "please", "can", "you"]);
const TO_BIG = /\b(big one|bigger one|large screen|larger screen|the big screen|monitor|over there|other screen|other window|across)\b/;
const TO_HERE = /\b(back here|here|this screen|this window|laptop|small one|smaller one|by the keyboard)\b/;
const words = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));

/** the block and the window a short line names, or null (pure). `me` is the window typed in; the bigger of the live
 *  windows is the monitor, and with screens of one size the one not typed in */
export function saidWhere(said: string, blocks: { id: string; title: string }[], s: ScreensState, me: string, drawnOn: (id: string) => string): { block: string; to: string } | null {
  const text = said.toLowerCase().trim();
  if (!text || text.split(/\s+/).length > 8) return null;
  const big = TO_BIG.test(text), here = TO_HERE.test(text);
  if (big === here) return null;
  const live = s.windows.filter((w) => w.live);
  const mine = live.find((w) => w.win === me);
  if (live.length < 2 || !mine) return null;
  const area = (w: { screen?: { w: number; h: number } }) => (w.screen ? w.screen.w * w.screen.h : 0);
  const biggest = live.filter((w) => w.win !== me).sort((a, b) => area(b) - area(a))[0];
  const to = here ? me : area(biggest) >= area(mine) ? biggest.win : null;
  if (!to) return null;
  const said_ = new Set(words(text));
  const scored = blocks.map((b) => ({ b, n: words(b.title).filter((w) => said_.has(w)).length })).filter((x) => x.n > 0).sort((a, z) => z.n - a.n);
  if (!scored.length || (scored[1] && scored[1].n === scored[0].n)) return null;
  const b = scored[0].b;
  return drawnOn(b.id) === to ? null : { block: b.id, to };
}
