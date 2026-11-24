// Mark up in the chat bar (BR1, #1615; mine/look/br1/markup.html, moments 2 and 3): while marking, and after Esc until
// they are sent or taken back, the marks ride in the bar itself: where they go ("To: New" starts a session in the first
// marked folder), one chip per mark with its number and its thing, × taking it back, the attachments, a line for a word
// for all, and Send (↵ there, ⌘↵ anywhere). The bar's own box steps aside meanwhile (markup.css). The talk pill mounts
// it with one line, <MarkBar />. Signed: marcocyl04-ux's agent (builder M), BR1 (#1615).
import { useSyncExternalStore } from "react";
import { D } from "../cv/core.ts";
import { titleOf } from "../plane/layout.ts";
import { detach, endMarking, markUp, mu, removeName, send, setText, subscribe, targetOf, toWords, unmark, versionNow } from "./model.ts";
import { IC } from "./ic.ts";
import "./markup.css";

const Ic = ({ d }: { d: string }) => <svg className="mu-ic" viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;
const X = "M7 7l10 10M17 7L7 17";

export default function MarkBar() {
  useSyncExternalStore(subscribe, versionNow, versionNow);
  if (!mu.on && !mu.marks.length && !mu.files.length) return null;
  const to = targetOf(), p = to.piece ? D.pieces[to.piece] : undefined, any = mu.marks.length > 0 || mu.files.length > 0;
  return <span className="mu-bar" data-marks={mu.marks.length}>
    <span className="mu-to" title={`Goes ${toWords(to)}`}>To: <b>{to.fresh ? "New" : p ? titleOf(p) : "this session"}</b></span>
    {mu.marks.map((m, i) => <span key={m.thing} className="mu-chip" title={m.words.trim() || m.name}>
      <i className="mu-n">{i + 1}</i><span className="mu-cw">{m.name}</span>
      <button type="button" className="mu-x" aria-label={removeName(m)} onClick={() => unmark(i)}><Ic d={X} /></button>
    </span>)}
    {mu.files.map((f) => <span key={f.id} className="mu-chip mu-file" data-att={f.kind}>
      {f.url ? <img className="mu-th" src={f.url} alt="" /> : <Ic d={IC[f.kind]} />}<span className="mu-cw">{f.name}</span>
      <button type="button" className="mu-x" aria-label={`Remove “${f.name}” from your message`} onClick={() => detach(f.id)}><Ic d={X} /></button>
    </span>)}
    <input className="mu-all" aria-label="A word for all the marks" placeholder={any ? "add a word for all…" : "press a thing to pin a note to it"} value={mu.text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && any) { e.preventDefault(); e.stopPropagation(); void send(); }
        else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (mu.on) endMarking(); else markUp(false); }
      }} />
    <button type="button" className="mu-go" aria-label="Send the marks (⌘↵)" title="Send (⌘↵)" disabled={!any || mu.sending} onClick={() => void send()}><Ic d="M12 19V5M6 11l6-6 6 6" /></button>
  </span>;
}
