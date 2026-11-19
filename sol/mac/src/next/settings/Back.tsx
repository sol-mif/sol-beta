// "Back to the old Sol" (#1604, slice 6; docs/port/switch.md §2 "The way back"): one row in Settings that turns ui.next
// off (settings.set { ui: { next: false } }, the old face's own message) and keeps when, beside (next/back.json is slice
// 7's; until it lands the time is kept in the store). Nothing of the old face is changed by it, so it finds everything
// as it was; turning the new Sol on again (the old Settings' "Try the new Sol" row) resumes here.
// Offered for 30 days from the first turn on (movein.json.on, slice 7's): until that lands, always offered.
// Signed: marcocyl04-ux's agent, slice 6 (#1615).
import { M, useNext } from "../cv/index.ts";

export function Back() {
  const on = useNext((d) => (d.settings as { ui?: { next?: boolean } } | undefined)?.ui?.next !== false);
  return (
    <section className="st-back-old" aria-label="The new Sol">
      <h2 className="st-gh">The new Sol</h2>
      <div className="st-row" data-st="back-old">
        <span className="st-t"><b>Back to the old Sol</b><small>Everything you had is where you left it. Turn the new Sol on again from the old Settings, and you come back here.</small></span>
        <button className="st-btn" data-st="old-sol" disabled={!on} onClick={() => M.oldSol()}>{on ? "Back to the old Sol" : "Turning back…"}</button>
      </div>
    </section>
  );
}
