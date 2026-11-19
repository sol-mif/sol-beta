// The way into the runs view (#889): a mark under the spine's four views, drawn only with build.runs on. Pressed, it
// opens the runs view over Build (from another view it goes to Build first); pressed again, back to the sessions.
// `dot` (#906, runs/doorDot.ts): one still dot when "Needs you" is not empty while the view is closed; no number, no motion.
import "./door.css";

export function RunsDoor({ open, onPress, dot = false }: { open: boolean; onPress: () => void; dot?: boolean }) {
  return (
    <button type="button" className={`sp-m ${open ? "runs-on" : ""}`} aria-pressed={open} aria-label={`runs: every project's builders${dot ? "; something needs you" : ""}`} onClick={onPress}>
      <i className="runs-door">
        {dot && <b className="runs-dot" aria-hidden />}
        <svg className="spn-mark" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
          <rect x="3.5" y="4" width="17" height="4.5" rx="2.25" /><rect x="3.5" y="10" width="11" height="4.5" rx="2.25" /><rect x="3.5" y="16" width="14" height="4.5" rx="2.25" />
        </svg>
      </i>
      <span className="sp-tag">runs<em>{dot ? "something needs you" : "every project's builders"}</em></span>
    </button>
  );
}
