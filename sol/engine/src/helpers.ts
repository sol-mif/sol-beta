// Sol's own small programs (the design's fifth section, the second door: a native helper a big room runs, step 7). Each
// is a C file beside the engine (sol/engine/helpers/<name>.c), built by the engine with clang, outside every wall, into
// Sol's folder (<Sol's folder>/helpers/<hash of the source>/<name>), once per source, at its first run (never at a
// block's load: nothing is written for a block nobody pressed); a record names it in
// needs.programs as it names gh, and it runs through sol.run in the same wall of its own. A Mac without clang (the
// Command Line Tools) has no helper: a block that declares one is broken with that reason, as for a program not there.
//   sol-windows   the number of an app's window, for `screencapture -l`: what osascript did for file it, without an
//                 interpreter that can post the mouse and the keys once the screen block is open (RESULT.md 3, step 7)
import { execFile, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "helpers");   // src/ under tsx, dist/ built: both sit beside it
/** sha256: the source as it was read and tried (step 7). A source that differs is never built: a seat that edits the C
 *  file in a checkout does not get a new program run with the screen block, unnoticed. Changing a helper changes this */
export const HELPERS: Record<string, { file: string; frameworks: string[]; sha256: string }> = {
  "sol-windows": { file: "sol-windows.c", frameworks: ["CoreGraphics", "CoreFoundation"], sha256: "b5ca78d8c92018ad757c5c2713aedf31c78bbe0558bb9c9f552116aedec5234e" },
};
/** whether the Command Line Tools are here: /usr/bin/clang is a shim on every Mac, which asks to install them when they are not */
let tools: boolean | null = null;
const haveTools = () => { if (tools === null) { try { execFileSync("/usr/bin/xcode-select", ["-p"], { stdio: "ignore", timeout: 5000 }); tools = true; } catch { tools = false; } } return tools; };
export const isHelper = (name: string) => Object.hasOwn(HELPERS, name);

/** whether a helper can be had here, without building it (a block's load writes nothing): null, or why not */
export function helperHere(name: string, src = SRC): string | null {
  const h = HELPERS[name];
  if (!h) return `${name} is not one of Sol's helpers`;
  if (process.platform !== "darwin") return `Sol's helper ${name} is built on a Mac only`;
  let code: Buffer;
  try { code = readFileSync(join(src, h.file)); } catch { return `Sol's helper ${name} has no source here (${h.file})`; }
  if (createHash("sha256").update(code).digest("hex") !== h.sha256) return `Sol's helper ${name} is not as Sol ships it: its source ${h.file} was changed, so it is not built`;
  if (!haveTools()) return `Sol's helper ${name} could not be built: this Mac has no Command Line Tools (xcode-select --install)`;
  return null;
}
/** the built helper's path, built now if it is not yet (at its first run, once its block's card is pressed); or why there is none */
export async function helperFor(name: string, app: string, src = SRC): Promise<{ exe: string } | { why: string }> {
  const no = helperHere(name, src);
  if (no) return { why: no };
  const h = HELPERS[name];
  const dir = join(app, "helpers", h.sha256.slice(0, 16));
  const exe = join(dir, name);
  try { const st = lstatSync(exe); if (st.isFile() && !st.isSymbolicLink()) return { exe: realpathSync(exe) }; rmSync(exe, { force: true }); } catch { /* not built yet */ }
  const tmp = join(dir, `.${name}-${randomBytes(4).toString("hex")}`);
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    // built off the engine's thread (a minute at most), from a copy read once and checked: never the file as it is a moment later
    const code = readFileSync(join(src, h.file));
    if (createHash("sha256").update(code).digest("hex") !== h.sha256) throw new Error(`its source ${h.file} was changed`);
    const copy = `${tmp}.c`;
    writeFileSync(copy, code, { mode: 0o600, flag: "wx" });
    await new Promise<void>((ok, fail) => execFile("/usr/bin/clang", ["-O2", "-o", tmp, copy, ...h.frameworks.flatMap((f) => ["-framework", f])], { timeout: 60_000 }, (e, _o, err) => { rmSync(copy, { force: true }); if (e) fail(new Error(String(err || e.message).trim().split("\n")[0])); else ok(); }));
    renameSync(tmp, exe);
    return { exe: realpathSync(exe) };
  } catch (e) {
    rmSync(tmp, { force: true });
    return { why: `Sol's helper ${name} could not be built: ${String((e as Error).message).slice(0, 200)}` };
  }
}
