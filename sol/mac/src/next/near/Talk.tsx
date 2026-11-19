// Near's talk (#1615, slice 3; the mockup's views/near.js askCard and the talk box): an ask inside the piece it is about,
// and the box under a session's talk. At Near on a session the pill hides and this is the one place to talk: a move said
// here runs, as in the pill; anything else goes to the AI, into its thread (M.talk). Redirect (#14) is said here too
// ("redirect Ada to …") or by M.redirect. Signed: marcocyl04-ux's agent, slice 3 (#1615).
import { useState } from "react";
import { M, answer, canAnswer, looked, open, say, snap, S, type Ask } from "../cv/index.ts";

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

/** what the store looks like to "did a move happen" (views/near.js: the place, follow, calm, the line, the asks) */
const state = () => snap() + S.follow + S.calm + S.askLine + open().length;

/** the box under a session's talk: a move said here runs; any other words go to its AI */
export function TalkBox({ pid, ai }: { pid: string; ai: string }) {
  const [v, setV] = useState("");
  return (
    <label className="nr-compose">
      <input className="nr-say" data-pid={pid} value={v} placeholder={`Talk to ${ai}, or say a move`} aria-label={`Talk to ${ai}, or say a move`} autoComplete="off"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.currentTarget.blur(); return; }
          if (e.key !== "Enter") return;
          const w = v.trim();
          if (!w) return;
          e.preventDefault(); setV("");
          const before = state();
          say(w);
          if (state() !== before) return;
          M.talk(pid, w);
        }} />
      <Kbd t="↩" />
    </label>
  );
}
