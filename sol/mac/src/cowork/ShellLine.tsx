// The app's own update (#1824, J1; the shell's side is src-tauri/src/update.rs, the engine's team/shell.ts): one line over
// the composer, beside the release's (StableLine, Composer.tsx mounts both). The shell downloads and verifies a new Sol.app
// by itself and tells the engine, which tells every face `team.shell { event, version?, why? }`; nothing swaps until the
// person presses Restart Sol. The button follows the shell's own state (app_update_state, asked at mount and at every
// word), never the engine's word alone, which any program on this Mac could post. Only the bundled face may ask or press
// (capabilities/default.json): the press installs the bundle the shell already verified, never anything the page names.
//   ready       a new Sol is downloaded: Restart Sol, and the line says macOS may ask for Full Disk Access again (an
//               ad-hoc signed app is a new app to macOS after each update, until Apple signing)
//   downloaded  downloaded, waiting (pause updates, or the engine moving its own files): said, no button
//   failed      the update did not install, the old app is where it was: said once, with why
//   found       downloading: nothing shown, it is quiet work
import { useEffect, useState } from "react";
import { link } from "../socket";
import { ENGINE } from "../useEngine";
import { StateMark } from "./bits";
import { shellView, wordOf, type ShellWord } from "./shellWord";
import "./ship.css";

/** the shell's own verified version, or null (outside the app, or a face not allowed to ask) */
async function readyNow(): Promise<string | null> {
  if (!("__TAURI_INTERNALS__" in window)) return null;
  try { const { invoke } = await import("@tauri-apps/api/core"); return (await invoke<string | null>("app_update_state")) ?? null; } catch { return null; }
}

/** the engine's team.shell, asked once on every link up, and the shell's own state read again at each */
function useShellWord(): [ShellWord, string | null] {
  const [w, setW] = useState<ShellWord>(null);
  const [ready, setReady] = useState<string | null>(null);
  useEffect(() => {
    if (typeof WebSocket === "undefined") return;
    const l = link(ENGINE);
    const off = l.on((m) => {
      if (m?.type !== "team.shell") return;
      setW(wordOf(m));
      void readyNow().then(setReady);
    });
    void readyNow().then(setReady);
    const offLink = l.onLink((up) => { if (up) l.send({ type: "team.shell.get" }); });
    return () => { off?.(); offLink?.(); };
  }, []);
  return [w, ready];
}

export function ShellLine() {
  const [word, ready] = useShellWord();
  const view = shellView(word, ready);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSaid(null); setBusy(false); }, [word, ready]);   // a new word from the shell replaces the press's own
  if (!view) return null;
  const restart = async () => {
    setBusy(true); setSaid(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("app_update_apply");   // Sol restarts a moment later
      setSaid("restarting…");
    } catch (e) { setSaid(String(e)); setBusy(false); }
  };
  return (
    <div className={`sline appup ${view.kind === "fail" ? "failed" : ""}`} role="status">
      <span className="what" title={said ?? view.said}>
        <StateMark kind={view.kind === "fail" ? "failed" : view.kind === "new" ? "needs" : "done"} seed={view.said} />
        {said ?? view.said}
      </span>
      {view.press && <span className="moves"><button className="wbtn" disabled={busy} onClick={() => void restart()} title="swap in the new Sol.app and open it again; a turn under way keeps going in the engine">Restart Sol</button></span>}
      {view.press && view.note && <span className="note">{view.note}</span>}
    </div>
  );
}
