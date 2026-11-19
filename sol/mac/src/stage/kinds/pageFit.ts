// A page in a block of any size (#872, second pass): the page is laid out at a comfortable width and the whole frame is
// scaled down to the block, so it looks the same at every block size, only smaller, and never overlaps itself the way a
// page squeezed to a quarter of the stage does. Under a readable scale the block shows a still of it with its title over
// it, and opens big on a click. Pure, so the face's tests pin it (src/stage-pagefit.test.ts).

/** the narrowest a page is laid out at (first pass), and the smallest scale its words still read at (first pass) */
export const PAGE_FLOOR = 720, PAGE_READ = 0.5;

/** the box's w × h → the page's own layout size, the scale it is drawn at, and whether it is only a still */
export function pageFit(w: number, h: number, floor = PAGE_FLOOR, read = PAGE_READ, max = 1): { w: number; h: number; scale: number; still: boolean } {
  if (w <= 0 || h <= 0) return { w: floor, h: 0, scale: 1, still: false };
  // max over 1 (#1090: a page alone on a wall, read from a chair): it grows, its layout never narrower than the floor
  const scale = Math.min(max, w / floor);
  return { w: Math.round(w / scale), h: Math.round(h / scale), scale, still: scale < read };
}

/** #1089: a page may say the width it is made at (`<meta name="sol-width" content="288">`, a kept piece of Build
 *  becomes yours): it is laid out at that width, never wider, so it shows at its own size in any block it fits (pure) */
export function floorOf(html?: string): number | undefined {
  const m = html ? /<meta\s+name="sol-width"\s+content="(\d{3,4})"/i.exec(html.slice(0, 2000)) : null;
  const w = m ? Number(m[1]) : NaN;
  return w >= 160 && w <= 1600 ? w : undefined;
}
