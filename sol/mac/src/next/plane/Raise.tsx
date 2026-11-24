// A folder's one raise (BR1 quiet canvas, #1615; mine/look/br1/quiet.html round 2): the slot under its card that grows
// and shrinks, drawn as the drawing draws it. At rest a decision is compressed to fit the folder's gap: the question
// clamped to two lines, the choices one segmented pill with short labels (data-s), Later and because… hidden; pointed at
// or focused it opens to the whole card (Later, because…, what comes next) with the same motion. The raise's design
// itself waits for the BR1 update (br1-update.md 15:58); this ships it as drawn. Logic: raise.ts.
// Signed: marcocyl04-ux's agent (builder Q), BR1 (#1615).
import { useState, type CSSProperties } from "react";
import { D, M, asksInRegion, useNext } from "../cv/index.ts";
import { who, yesWords } from "../needs/rank.ts";
import Because from "../because/Because.tsx";
import { answered, besideIn, fitRoom, isLater, judged, levelOf, opened, putOff, raiseOf, restOf, shortOf, toOf, useHand, whoOf, whyOf, type Dist } from "./raise-state.ts";
import { isOffer, offerNo, offerYes } from "../cv/wire/tidy.ts";   // the sort offered after the move-in: its presses reach the engine (builder T)
import "./raise.css";

/** `said`: the folder's contents card is open under the hand and already says a quiet folder has nothing, so its line is not said twice;
 *  `room`: px free under the card (raise.ts roomUnder), the most it may take */
export default function Raise({ rid, dist, h, said, room = Infinity }: { rid: string; dist: Dist; h?: number; said?: boolean; room?: number }) {
  const { focus } = useHand();
  // what it carries, read again when the data changes
  const key = useNext(() => { const r = raiseOf(rid); return r.k === "ask" ? `a${r.a.id}:${r.a.text}` : r.k === "run" ? `r${r.p.id}` : ""; });
  const [why, setWhy] = useState(false);
  const r = raiseOf(rid), rank = judged().indexOf(rid);
  const lv = fitRoom(levelOf(r, restOf(r, rank, dist, r.k === "ask" && isLater(r.a), besideIn(rid)), focus, rid), room);
  if (r.k === "none" && (focus !== rid || said)) return null;
  const tone = r.k === "ask" ? "asks" : r.k === "run" ? "run" : "quiet";
  return (
    <div className={`rz-slot rz-${tone}`} data-raise={rid} data-lv={lv} data-key={key} style={h ? ({ "--fo-h": `${Math.round(h)}px` } as CSSProperties) : undefined}>
      {r.k !== "none" ? <span className="rz-pip" aria-hidden="true" /> : null}
      <div className={`rz${why ? " rz-why-on" : ""}`} aria-hidden={lv < 2 ? true : undefined}>
        {r.k === "none" ? <div className="rz-ln rz-calm">Nothing here needs you</div> : null}
        {r.k === "run" ? <>
          <div className="rz-ln"><span className="rz-d" /><b>{whoOf(r)}</b></div>
          <div className="rz-q">Working. Nothing needed from you.</div>
        </> : null}
        {r.k === "ask" ? <>
          <div className="rz-ln"><span className="rz-d" /><b>{whoOf(r)}</b></div>
          <div className="rz-q">{r.a.text}</div>
          <div className="rz-why">
            {r.a.because?.length ? <Because ks={r.a.because} here={rid} />
              : <><button type="button" className="rz-wb" aria-expanded={why} onClick={() => setWhy((o) => !o)}>because… ⌄</button>{why ? <div className="rz-wx">{whyOf(r.a)}</div> : null}</>}
          </div>
          <div className="rz-acts">
            {r.a.how === "near" || r.a.serious
              ? <button type="button" className="rz-y" data-act={`goto:${r.a.piece}`} onClick={() => opened(rid, r.a)}>Open it</button>
              : <button type="button" className="rz-y" data-act={`answer:${r.a.id}`} onClick={() => { answered(rid, r.a, yesWords(r.a)); if (isOffer(r.a)) void offerYes(r.a.id); }}>{yesWords(r.a)}</button>}
            {typeof r.a.no === "string" && r.a.no ? <button type="button" data-s={shortOf(r.a.no)} onClick={() => { answered(rid, r.a, String(r.a.no)); M.answer(r.a.id); if (isOffer(r.a)) void offerNo(r.a.id); }}>{r.a.no}</button> : null}
            <button type="button" className="rz-later" data-act={`later:${r.a.id}`} onClick={() => putOff(rid, r.a)}>Later</button>
          </div>
          <Next rid={rid} />
        </> : null}
      </div>
    </div>
  );
}

/** the decision's foot: what comes next in this folder once this is answered */
function Next({ rid }: { rid: string }) {
  const r = raiseOf(rid);
  if (r.k !== "ask") return null;
  const more = judged().includes(rid) ? nextIn(rid, r.a.id) : null;
  return <div className="rz-more">{more ? <>Next here: <b>{more}</b></> : "Nothing else here waits on you"}</div>;
}
const nextIn = (rid: string, id: string): string | null => { const a = asksInRegion(rid).find((x) => x.id !== id); return a ? who(D, a) : null; };

/** the bar's To (quiet.html): what the hand points at, "New" when it points at nothing that asks or works */
export function To() {
  const { to } = useHand();
  const t = toOf(to);
  return <span className={`nx-to${t ? " nx-to-on" : ""}`} aria-live="polite">To: <b>{t ? t.name : "New"}</b></span>;
}
