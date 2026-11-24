// The first run's one line (#94, Sol ticket #96; setup-state.ts says when): while the shell installs Sol, the window is the
// start-up's paper (startup.css) with one line, 「正在幫你安裝 Sol…」, and a thin line of its progress, never a page of
// steps; the one thing it waits on the person for (Apple's developer tools) said under it. Stopped: why, as the install
// said it, and Try again (the shell's first_run_again). Done, the shell loads "/".
import { askOf, progressOf, type FirstRun } from "./setup-state.ts";
import "./startup.css";

export default function Setup({ f, onAgain }: { f: FirstRun; onAgain: () => void }) {
  const stopped = !!f.error;
  return (
    <div className="sup" data-face="next" data-setup={stopped ? "stopped" : "installing"}>
      <div className="sup-win sup-day">
        <div className="sd-col">
          {stopped ? <>
            <h2 className="sd-h" role="alert">安裝停下來了</h2>
            <p className="sd-sub" data-setup-why>{f.error}</p>
            <div className="sd-foot"><button type="button" className="sd-btn" data-setup-again onClick={onAgain}>再試一次</button></div>
          </> : <>
            <h2 className="sd-h" aria-live="polite">正在幫你安裝 Sol…</h2>
            <div className="sd-bar" role="progressbar" aria-label="安裝進度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressOf(f.lines) * 100)}>
              <i style={{ transform: `scaleX(${progressOf(f.lines)})` }} />
            </div>
            {askOf(f.lines) && <p className="sd-note" data-setup-ask role="status">{askOf(f.lines)}</p>}
          </>}
        </div>
      </div>
    </div>
  );
}
