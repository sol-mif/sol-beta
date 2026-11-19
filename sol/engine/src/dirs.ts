// Folders the engine makes for Home (#1511, #1510): the record's folder under ~/.sol, a place's folder under Sol's home,
// and the parents between. Never through a terminal, and never outside the roots it is given: a path that resolves
// above a root, or through a hidden folder below it (".git", ".agent"), is refused, not made.
import { mkdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

/** the real path of p, also when its last parts are not there yet: the nearest folder that is, made real, and the rest */
export function realish(p: string): string {
  const abs = resolve(p);
  try { return realpathSync(abs); } catch { /* not there yet */ }
  const up = dirname(abs);
  return up === abs ? abs : join(realish(up), abs.slice(up.length + (up.endsWith("/") ? 0 : 1)));
}

/** where p sits under root ("" for the root itself), or null when it is not under it or goes through a hidden folder */
export function under(root: string, p: string): string | null {
  const rel = relative(realish(root), realish(p));
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel.split(/[\\/]/).some((s) => s.startsWith(".")) ? null : rel;
}

/** each path made with its parents, when it is under one of the roots; `refused` names the rest (and a make that failed) */
export function makeDirs(paths: readonly unknown[], roots: readonly string[]): { ok: boolean; made: string[]; refused: string[] } {
  const made: string[] = [], refused: string[] = [];
  for (const x of paths) {
    const p = String(x ?? "").trim();
    if (!p || !isAbsolute(p) || !roots.some((r) => under(r, p) !== null)) { refused.push(p); continue; }
    try { mkdirSync(p, { recursive: true }); made.push(realish(p)); } catch { refused.push(p); }
  }
  return { ok: !refused.length, made, refused };
}
