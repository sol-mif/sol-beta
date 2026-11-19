// Marks for show, don't say (#1020): a thing said in a word, drawn instead. Each mark keeps its word for the eye on
// hover and focus (title) and for a screen reader (aria-label), so nothing a person needs is lost.

/** what Claude may do without asking, as a mark: Manual a hand held up (it asks first), Auto a spark, Accept edits a
 *  pen, Plan three lines, Bypass a ring lit by the jelly */
const MODE_PATHS: Record<string, string[]> = {
  default: ["M8 13V6.5a1.2 1.2 0 0 1 2.4 0V11", "M10.4 10V5.2a1.2 1.2 0 0 1 2.4 0V11", "M12.8 10.5V6.2a1.2 1.2 0 0 1 2.4 0V13a5 5 0 0 1-5 5h-.6a5 5 0 0 1-4-2l-1.9-2.6a1.2 1.2 0 0 1 1.9-1.5L8 13"],
  auto: ["M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z"],
  acceptEdits: ["M5 19l1-4L15.5 5.5a1.8 1.8 0 0 1 2.5 2.5L8.5 17.5z", "M13.5 7.5l3 3"],
  plan: ["M6 7h12", "M6 12h9", "M6 17h6"],
  bypassPermissions: ["M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16"],
};

export function ModeMark({ mode, label, lit }: { mode: string; label: string; lit?: boolean }) {
  const d = MODE_PATHS[mode] ?? MODE_PATHS.default;
  return (
    <span className={`sh-mark sh-mode ${mode}${lit ? " lit" : ""}`} role="img" aria-label={`mode: ${label}`} title={`mode: ${label}`} data-word={label}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {d.map((p) => <path key={p} d={p} />)}
      </svg>
    </span>
  );
}
