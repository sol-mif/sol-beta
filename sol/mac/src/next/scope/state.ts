// owned by slice R9 (why your AI used that, links, the done fold, Far at 500), docs/port/slices.md
// What the person has open of round 9 (#1615; merge/scope.js's OPEN, FOCUS, NEARLINKS, MOREL, OPENDONE, QUIET, QPAGE):
// the brief, the focused thing's links, the Done list, the quiet places' list. Moves change it; views read it through
// useNext (it is read inside their `sel`, so a change of it draws them). Signed: marcocyl04-ux's agent, port slice R9 (#1615).
import { resetHolds } from "./rules.ts";

export const ui = {
  /** the result whose brief is open (Near) */
  open: null as string | null,
  /** the thing whose links are drawn (Middle) */
  focus: null as string | null,
  /** Near's links card open */
  nearLinks: false,
  /** the links card's first row (a press on "and N more" turns the page) */
  moreL: 0,
  /** the folder whose Done list is open, and its page */
  done: { rid: null as string | null, page: 0 },
  /** the zone whose quiet list is open (Far), and its page */
  quiet: null as string | null,
  qpage: 0,
};
/** what a view's `sel` reads, so a change of any of it draws again */
export const uiKey = () => [ui.open, ui.focus, ui.nearLinks, ui.moreL, ui.done.rid, ui.done.page, ui.quiet, ui.qpage];
/** everything closed (each load; the counts' reset) */
export function closeAll(): void { ui.open = null; ui.focus = null; ui.nearLinks = false; ui.moreL = 0; ui.done.rid = null; ui.done.page = 0; ui.quiet = null; ui.qpage = 0; }
/** the counts' reset (merge/scope.js CV.scope.reset): the holds and everything open */
export function reset(): void { resetHolds(); closeAll(); }
