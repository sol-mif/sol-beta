// One file written whole, in one rename, without following a link a seat planted (the design's step 4 refute: a seat
// writes in the home, so a `<file>.tmp` it made a symlink beforehand, or a folder it swapped for one, would carry an
// engine's write into Sol's own folder, a press among them). The temporary file has a name nobody can guess and is
// created new (O_EXCL: never an existing file, never through a link); the file, when there, is not a link; and the
// folder it lands in is, really, inside `root`, looked at before and after (a link swapped in between is caught after
// the rename and the write taken back: a narrow window, not none, since node has no openat).
import { closeSync, fstatSync, lstatSync, mkdirSync, openSync, realpathSync, renameSync, rmSync, writeSync } from "node:fs";
import { dirname, sep } from "node:path";
import { randomBytes } from "node:crypto";

export function writeWhole(file: string, text: string, o: { root: string; mode?: number }): void {
  const dir = dirname(file);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const root = realpathSync(o.root), real = realpathSync(dir);
  if (real !== root && !real.startsWith(root + sep)) throw new Error(`${dir} leads outside ${o.root}: not written`);
  try { if (lstatSync(file).isSymbolicLink()) throw new Error(`${file} is a link: not written`); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  const tmp = `${real}/.${randomBytes(8).toString("hex")}.tmp`, dest = `${real}/${file.slice(dir.length + 1)}`;
  const fd = openSync(tmp, "wx", o.mode ?? 0o600);
  let ino = 0, dev = 0;
  try { writeSync(fd, text); const st = fstatSync(fd); ino = st.ino; dev = st.dev; } finally { closeSync(fd); }
  try { renameSync(tmp, dest); } catch (e) { rmSync(tmp, { force: true }); throw e; }
  // a folder on the way swapped for a link between the look and the rename: the write landed elsewhere. Looked at again
  // after, and taken back when the folder is not where it was or the file there is not the one written
  let st: { ino: number; dev: number; isFile(): boolean } | null = null;
  try { st = lstatSync(dest); } catch { /* gone */ }
  const ours = !!st && st.isFile() && st.ino === ino && st.dev === dev;
  let here = false;
  try { here = realpathSync(dirname(dest)) === real; } catch { /* gone */ }
  if (ours && here) return;
  // only the very file written is ever taken back (its inode), never whatever else a swapped path names now
  if (ours) rmSync(dest, { force: true });
  throw new Error(`${dir} moved while it was written${ours ? ": taken back" : ""}`);
}
/** a file read only when it is a plain file whose folder is, really, inside `root`; null when it is not there */
export function plainIn(file: string, root: string): string | null {
  try {
    if (!lstatSync(file).isFile()) return null;
    const r = realpathSync(root), d = realpathSync(dirname(file));
    return d === r || d.startsWith(r + sep) ? file : null;
  } catch { return null; }
}
