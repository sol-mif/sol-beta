// The words of the app's own update line (#1824, ShellLine.tsx), pure so the tests read them without a window.
export type ShellWord = { event: "found" | "downloaded" | "failed" | "ready"; version?: string; why?: string } | null;
export type ShellView = { said: string; press: boolean; note?: string; kind: "new" | "done" | "fail" } | null;

/** what the line shows (pure, for the tests): `ready` is the version the shell itself holds verified (app_update_state),
 *  the only source of the button; the engine's word, which any program on this Mac could post, only ever says text */
export function shellView(w: ShellWord, ready: string | null = null): ShellView {
  if (ready) return { said: `a new Sol.app ${ready} is downloaded and checked`, press: true, note: "macOS may ask for Full Disk Access again after the restart: press Allow", kind: "new" };
  if (!w) return null;
  const v = w.version ? ` ${w.version}` : "";
  if (w.event === "downloaded") return { said: `a new Sol.app${v} is downloaded; it waits${w.why ? ` (${w.why})` : ""}`, press: false, kind: "done" };
  if (w.event === "failed") return { said: `Sol.app${v} did not update; this one stays${w.why ? `: ${w.why}` : ""}`, press: false, kind: "fail" };
  return null;   // found (quiet work), and a ready the shell does not hold
}

/** the engine's team.shell message, read: a known event with string version and why, else no word */
export function wordOf(m: any): ShellWord {
  if (!m || !["found", "downloaded", "failed", "ready"].includes(m.event)) return null;
  return { event: m.event, ...(typeof m.version === "string" ? { version: m.version } : {}), ...(typeof m.why === "string" ? { why: m.why } : {}) };
}
