// The hand-in card (#476, engine team/handin.ts): once a change's checks are green, the session that worked on it asks
// "fr-12 is ready. Bring it into sol-dev tonight so Sol developers can try it?". Bring it in marks the PR ready on
// GitHub (handed in); Not tonight leaves it a draft and the card does not ask again for that commit that night. Only this
// press hands a change in, never an agent: each press goes to the engine with the card's key, which only Sol's own
// window gets, and the engine sends the card back changed. Drawn like the review's card (Tonight.tsx).
import { useState } from "react";
import type { Item, Work } from "./useWork";
import { asking, cardHead, cardSaid, type HandInCardView } from "./handinWords";

// a change's page opens in the browser, never in this window (as the review's card)
const openOut = (e: React.MouseEvent, href: string) => {
  e.preventDefault(); e.stopPropagation();
  if (!/^https:\/\//.test(href)) return;
  import("@tauri-apps/plugin-opener").then((o) => o.openUrl(href)).catch(() => window.open(href, "_blank"));
};

export function HandInCard({ it, w }: { it: Item; w: Work }) {
  const c = it as unknown as HandInCardView;
  const [err, setErr] = useState("");
  const busy = c.state === "busy";
  const press = async (choice: "in" | "not") => {
    setErr("");
    const r = await w.handIn(c.id, choice);
    if (r?.error) setErr(String(r.error));
  };
  return (
    <div className={`wcard wtonight whandin ${c.state ?? "open"}`}>
      <div className="whead"><span>{cardHead(c)}</span></div>
      <p className="hi-ask">{String(c.ask ?? "")}</p>
      <div className="tn-top">
        {c.url ? <a className="tn-n" href={c.url} onClick={(e) => openOut(e, c.url!)} title="open the change on GitHub">#{c.number}</a> : <span className="tn-n">#{c.number}</span>}
        <span className="tn-t">{String(c.title ?? "")}</span>
      </div>
      {asking(c)
        ? <div className="choices">
            <button className="first" disabled={busy} onClick={() => void press("in")} title="mark it ready on GitHub: it is handed in for the dev review">{busy ? "…" : "Bring it in"}</button>
            <button disabled={busy} onClick={() => void press("not")} title="it stays a draft; the card asks again on a new commit, or for the next night">Not tonight</button>
          </div>
        : <span className="tn-was">{cardSaid(c)}</span>}
      {(c.error || err) && <em className="tn-err">{err || c.error}</em>}
    </div>
  );
}
