// A folder of this Mac, chosen in macOS's own folder picker (#1615, BR1 welcome card: "A project on this Mac"). The
// picker is osascript's `choose folder`, brought to the front; nothing is read but the folder's names (carry-apps.ts
// holdsOf, read only) and nothing is written. Cancelled is an answer, not an error. Off macOS: an error in words.
//   next.folder.pick {prompt?} → next.folder.picked { path, name, kind, repo, rules } | { cancelled: true } | { error }
// Signed: marcocyl04-ux's agent, BR1 move-in (#1615).
import { execFile } from "node:child_process";
import { basename } from "node:path";
import { holdsOf } from "./carry-apps.js";
import { fsReader } from "./carry.js";

export type Picked = { path: string; name: string; kind: "build" | null; repo: boolean; rules: string[] } | { cancelled: true } | { error: string };

/** the AppleScript string literal of s */
const lit = (s: string) => '"' + s.replace(/[\\"]/g, (c) => "\\" + c).replace(/[\r\n]+/g, " ") + '"';

export function pickFolder(prompt = "Choose a project folder", run = execFile): Promise<Picked> {
  if (process.platform !== "darwin") return Promise.resolve({ error: "The folder picker is on macOS only." });
  const script = `tell application "System Events" to activate\nPOSIX path of (choose folder with prompt ${lit(prompt.slice(0, 200))})`;
  return new Promise((done) => {
    run("osascript", ["-e", script], { timeout: 10 * 60_000 }, (err, stdout, stderr) => {
      if (err) {
        const why = String(stderr ?? "") + String(err.message ?? "");
        return done(/-128|User canceled/i.test(why) ? { cancelled: true } : { error: "The folder picker didn't open." });
      }
      const path = String(stdout).trim().replace(/\/+$/, "") || "/";
      const h = holdsOf(fsReader, path);
      done({ path, name: basename(path) || path, kind: h.kind, repo: h.repo, rules: h.rules });
    });
  });
}
