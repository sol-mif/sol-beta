// Near's talk (#1615, slice 3; the mockup's views/near.js askCard): an ask inside the piece it is about. The box under a
// session's talk is gone (BR1 inside.html §1, builder E): there is never a second bar, and the one pill talks to the
// session in front or beside the canvas (Next.tsx Pill, cv/moves/talkto.ts). Signed: marcocyl04-ux's agent, slice 3 (#1615).
import { M, answer, canAnswer, looked, type Ask } from "../cv/index.ts";

const Kbd = ({ t }: { t: string }) => <span className="nr-kbd">{t}</span>;

/** an ask, inside the piece it is about: one sentence, the one choice, the keys */
export function AskCard({ a }: { a: Ask }) {
  const look = !!a.serious && !looked(a), ready = canAnswer(a.id);
  return (
    <div className="nr-ask" data-ask={a.id} data-front>
      {a.serious ? <span className="nr-serious">Serious · cannot be undone</span> : null}
      <p>{a.text}</p>
      <span className="nr-k">{a.source}{look ? " · look at its work beside you first" : ""}</span>
      <div className="nr-acts">
        {look
          ? <button className="nr-btn pri" onClick={() => M.beside()}>Look beside <Kbd t="⌘\" /></button>
          : <button className="nr-btn pri" disabled={!ready} onClick={() => answer(a.id)}>Yes <Kbd t="⌘↩" /></button>}
        <button className="nr-btn" onClick={() => answer(a.id, "later")}>Later <Kbd t="⌘⌫" /></button>
      </div>
    </div>
  );
}
