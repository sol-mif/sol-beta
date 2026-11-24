// A split job at Near (#1615, slice 3; the mockup's views/near.js split(), runs.js S6): entering it lays out its parts,
// each a small session face with its own ask; ← → choose, ↩ opens a part as a session's bound panes, ⌘↑ / ⌘[ goes back
// to the job (the keys: cv/moves/near.ts). Split (#9, parts in any piece) is "no" live and draws nothing then; split_run
// (#12) is "partly" live (parts are not under one parent piece), so live a session shows no parts until the engine has them.
// Signed: marcocyl04-ux's agent, slice 3 (#1615).
import { S, useNext, type Piece } from "../cv/index.ts";
import { asksFor, partCols, sentence, stateOf } from "./runs.ts";
import { openPart } from "../cv/moves/near.ts";
import { AskCard } from "./Talk.tsx";
import { talkWords } from "../lead/rules.ts";

const Kbd = ({ t }: { t: string }) => <span className="nr-kbd">{t}</span>;

export function Parts({ p, width }: { p: Piece; width: number }) {
  useNext((_, s) => s.partSel);
  const parts = p.parts || [], sel = (Number(S.partSel) || 0) % Math.max(1, parts.length), cols = partCols(width), own = asksFor(p);
  return (
    <div className="nr-split" data-front data-pane="parts">
      <p className="nr-ssay">{sentence(p)} <span className="nr-keys"><Kbd t="←" /> <Kbd t="→" /> choose · <Kbd t="↩" /> open a part · <Kbd t="⌘↑" /> out</span></p>
      {own.length ? <div className="nr-sown">{own.map((a) => <AskCard key={a.id} a={a} />)}</div> : null}
      <div className={`nr-parts c${cols}`}>
        {parts.map((x, i) => {
          const st = stateOf(x);
          return (
            <section key={x.id} className={`nr-part${i === sel ? " sel" : ""}`} data-part={x.ai} onClick={() => openPart(x.id)}>
              <div className="nr-ph"><span className={`nr-aura${st === "working" ? "" : " still"}`} /><b>Part {i + 1}</b><span className="nr-ps">{x.copy}</span><span className="nr-st">{st}</span></div>
              <h3>{x.name}</h3><p className="nr-psay">{sentence(x)}</p>
              <div className="nr-pface">{`${talkWords(x.files)}\nterminal · ${x.term?.waiting ? "waiting for input" : x.term?.stateWord ?? ""}`}</div>
              {asksFor(x).map((a) => <AskCard key={a.id} a={a} />)}
            </section>
          );
        })}
      </div>
    </div>
  );
}
