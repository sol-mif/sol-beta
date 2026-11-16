// A part left over from another build (#691). Sol builds the engine with plain tsc when it updates or goes back, and
// tsc never deletes what it wrote; every file in dist/parts/ is loaded (parts.ts). So a part that a release does not
// have, built by a later one, would still load after going back to it, and call an engine that is not there. A part
// that only some releases have asks this first: built, and its source not beside it in src/parts/, it answers nothing.
// It asks itself, not the loader, because an older release's loader would not ask.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** whether the part at this url (its import.meta.url) is left over: dist/parts/<name>.js with src/parts/ beside dist and
 *  no <name>.ts in it. Under tsx, or built with no sources beside it, never */
export function leftover(url: string): boolean {
  const m = /^(.*)[\\/]dist[\\/]parts[\\/]([^\\/]+)\.js$/.exec(fileURLToPath(url));
  if (!m) return false;
  const src = join(m[1], "src", "parts");
  if (!existsSync(src) || existsSync(join(src, `${m[2]}.ts`))) return false;
  console.log(`parts: dist/parts/${m[2]}.js is left from another build (no src/parts/${m[2]}.ts), so it answers nothing`);
  return true;
}
