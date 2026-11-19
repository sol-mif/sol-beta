// A page as a layer of a Cowork place (#1416): what a row opened (an issue, a change), drawn in the app over the part it
// was opened from. In the app it is the shell's child web view, the stage's own (stage/kinds/Browser.tsx ChildView, with
// the person's logins); outside it an iframe stands in. The crumbs above say where it sits; Esc or a crumb goes back.
// "open in your browser" is the one way out of the window, and says so (data-out). Only a page opensInApp takes is drawn
// (a history kept from before the check may hold another), and the view keeps to that page's site: the engine side knows
// a Cowork view by its id (out.ts viewId) and sends a link off the site to the note, not into the view (#1464 review).
import { Button } from "../../kit";
import { ChildView } from "../../stage/kinds/Browser";
import { shownUrl } from "../../stage/kinds/view";
import { openUrl } from "../util";
import { viewId } from "./out";
import { opensInApp, type Out } from "./place";

const inApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function OutLayer({ out }: { out: Out }) {
  return (
    <section className="cw-out" data-stage data-layer="page" aria-label={out.label}>
      <div className="cw-out-hd">
        <span className="cw-out-at" title={out.url}>{shownUrl(out.url)}</span>
        <span data-out="your browser"><Button h={24} flat onClick={() => openUrl(out.url)}>open in your browser ↗</Button></span>
      </div>
      <div className="cw-out-page">
        {!opensInApp(out.url) ? <p className="st-note">this page opens in your browser, not inside Sol</p>
          : inApp ? <ChildView key={out.url} id={viewId(out.url)} url={out.url} moving={false} />
          : <iframe className="cw-out-frame" title={out.label} src={out.url} sandbox="allow-scripts allow-forms" />}
      </div>
    </section>
  );
}
