// A folder with a .agent/ is sealed: what lives there is the folder's agent's and the person's, and the engine's other
// readers keep out of it unless they work inside it.
//   the desk     desk.ts inHome: a file in a sealed folder is not shown on a talk's desk (step 1: the folder's own
//                agent is in watch mode, where the desk is refused anyway; a do-mode agent's desk needs its folder
//                passed along with the turn, step 2)
//   Work's files work/files.ts: a session's @ list and the show's map skip a sealed folder under its folder
//   memory       there is no indexer in this engine that walks the home's folders (call/gemini.ts reads home/memory
//                only, team/memory.ts is a group's record): nothing to seal there today. A future indexer calls
//                sealedFor() on each path.
//   Codex        a Codex talk whose folder is outside must never get it. The engine has no read gate for Codex: its
//                sandbox is workspace-write (inventory.ts), which limits writes to the talk's folder but reads every
//                file. The gate would go where sayCodex (index.ts) builds the thread's options: a sandbox that denies
//                reads under each sealed folder (Codex's sandbox config would need a read deny list; the SDK has none
//                today). Not built here, on purpose: no second gate. The Claude seat's gate is inventory.ts
//                homeCanUseTool (forbidden()); the brief names only Codex, so it is not changed either.
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

/** a folder is sealed when it holds a .agent folder */
export function isSealed(dir: string): boolean {
  try { return statSync(join(dir, ".agent")).isDirectory(); } catch { return false; }
}
/** the sealed folder a path is in (the path itself, or a folder above it, up to `top`), or null */
export function sealedAt(path: string, top = "/"): string | null {
  let cur = resolve(path);
  const stop = resolve(top);
  try { if (!statSync(cur).isDirectory()) cur = dirname(cur); } catch { cur = dirname(cur); }
  for (;;) {
    if (isSealed(cur)) return cur;
    if (cur === stop || dirname(cur) === cur) return null;
    cur = dirname(cur);
  }
}
/** may a reader working in `cwd` see `path`? No, when the path is in a sealed folder and cwd is not inside that folder */
export function sealedFor(path: string, cwd: string, top = "/"): boolean {
  const s = sealedAt(path, top);
  if (!s) return false;
  const c = resolve(cwd);
  return !(c === s || c.startsWith(s + sep));
}
export const hasAgent = (dir: string) => existsSync(join(dir, "policy.md"));
