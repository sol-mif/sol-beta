// The pane beside the canvas (BR1 Q1, mine/look/br1/keep.html §2; the moves are cv/moves/kept.ts): the one piece kept
// open, drawn as Near draws it (near/Beside.tsx One), under a head with its folder's mark, its name, where it lives, ⤢ to
// take it out to a tab and × to close it. The canvas stays live beside it. Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { D, M, regionOf, useNext } from "../cv/index.ts";
import { DIARY_ID, keptNow } from "../cv/moves/kept.ts";
import { Slot } from "../slots.ts";
import { One } from "../near/Beside.tsx";
import { Strip } from "../near/Table.tsx";
import { tintOf, titleOf } from "../plane/layout.ts";
import { tipAt } from "../tips/tips-state.ts";   // the first As a tab shows its tip (BR1, builder P9)
import "./kept.css";

/** the pane's width in px, for the piece's own layout (the css's --kp-w) */
const W = 372;

export default function Kept() {
  const v = useNext((d) => {
    const id = keptNow(), p = id ? d.pieces[id] : undefined;
    if (id === DIARY_ID) return { id, name: "Diary", rid: "", diary: true, session: false };   // the Diary, drawn by its own slot as Near draws it
    return id && p ? { id, name: p.kind === "session" ? titleOf(p) : p.name, rid: String(p.region ?? ""), diary: false, session: p.kind === "session" } : null;
  });
  if (!v) return null;
  const r = regionOf(v.rid), tint = r ? `pl-t${Math.max(0, tintOf(v.rid))}` : "";
  return (
    <aside className="kp" data-kept={v.id} {...(v.session ? { "data-takes": v.id, "data-takes-name": v.name } : {})} aria-label={`${v.name}, kept open beside the canvas`}>
      <div className="kp-h">
        <span className={`nt-fc ${tint}`} aria-hidden="true" />
        <b title={v.name}>{v.name}</b>
        {r ? <small>{r.name}</small> : null}
        <span className="kp-acts">
          {v.diary ? null : <button type="button" className="kp-ic" data-kept-tab={v.id} onClick={() => { M.besideTab(); tipAt("tab"); }} title="Take it out to a tab" aria-label={`Take ${v.name} out to a tab`}>⤢</button>}
          <button type="button" className="kp-ic" data-kept-close={v.id} onClick={() => M.besideDrop()} title="Close (Esc)" aria-label={`Close ${v.name} beside the canvas`}>×</button>
        </span>
      </div>
      {v.session ? <Strip pid={v.id} name={v.name} /> : null}
      <div className="kp-b">{v.diary ? <Slot name="diary" band="middle" part="page" /> : D.pieces[v.id] ? <One pid={v.id} keysHere={false} beside width={W} /> : null}</div>
    </aside>
  );
}
