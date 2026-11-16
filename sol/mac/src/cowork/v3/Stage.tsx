// The stage (fr-30, slice 1): in a session with a project chip, what the composer makes takes the page's middle and
// the conversation shrinks to a strip under it that still answers (the composer is untouched below). One thing at a
// time in this slice; its crossing is its own lower edge (CrossingFoot). Drawn into the session's talk (.talk-wrap)
// through a portal, so Work's layout is not touched; with nothing made, only the arrived row shows, and with the switch
// off this file is never loaded (hooks.tsx).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { useEngine } from "../../useEngine";
import type { Work } from "../../work/useWork";
import { attach, keep, putAway, retitle, sendThing, settle, undoThing, useV3, type Thing } from "./store";
import { CrossingFoot, SentChip } from "./CrossingFoot";
import { Arrived, Face } from "./Arrived";
import { fly, flyFrom, landingOf, pulse, rise } from "./fly";
import "./v3.css";

const KIND: Record<string, string> = { item: "an item", note: "a note", document: "a document", automation: "an automation" };
const DAY = 86_400_000;
function when(date?: string): string {
  if (!date) return "";
  const d = new Date(date + "T12:00:00");
  const days = Math.round((d.getTime() - new Date(new Date().toDateString()).getTime() - 12 * 3600_000) / DAY);
  const rel = days === 0 ? "today" : days === 1 ? "tomorrow" : days > 1 ? `in ${days} days` : `${-days} days ago`;
  return `by ${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${rel}`;
}
const HomeGlyph = () => <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden><path d="M2.5 7.4 8 2.8l5.5 4.6V13a.6.6 0 0 1-.6.6H9.6V10H6.4v3.6H3.1a.6.6 0 0 1-.6-.6Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>;

function Card({ t, sessionId, topic }: { t: Thing; sessionId: string; topic: string }) {
  const ready = t.state === "ready";
  return (
    <div className="v3-card">
      <div className="v3-kind"><span>{KIND[t.kind] ?? "a thing"}{t.state === "kept" ? ", kept in Home" : ", leaving Home"}</span><i className="v3-tabline" /></div>
      <div className="v3-marks">
        <span className="v3-who">{t.whose ? <><Face who={t.whoseName ?? t.whose} />{t.whoseName ?? t.whose}</> : <><Face who="You" />You</>}</span>
        <span className="v3-where" title="it lives in Home until you send it"><HomeGlyph />Home</span>
      </div>
      <div className="v3-title" contentEditable={ready} suppressContentEditableWarning spellCheck={false} title={ready ? "change the words before you send" : undefined}
        onBlur={(ev) => retitle(sessionId, ev.currentTarget.textContent ?? "")}
        onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); ev.currentTarget.blur(); } }}>{t.title}</div>
      {t.date && <div className="v3-when">{when(t.date)}</div>}
      <div className="v3-ctx">{t.by === "agent" ? "your agent proposed it" : <>from “{topic}”</>}</div>
      {t.state === "kept" && <button className="v3-press ghost v3-away" onClick={() => putAway(sessionId)}>put it away</button>}
    </div>
  );
}

export default function Stage({ w, e }: { w: Work; e: ReturnType<typeof useEngine> }) {
  attach(e);
  const s = useV3();
  const anchor = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<Element | null>(null);
  const [away, setAway] = useState(false);   // "whole conversation": the stage steps aside, the talk is whole again
  const piece = useRef<HTMLDivElement>(null);
  const sid = w.live;
  const ses = sid ? w.sessions.find((x) => x.id === sid) : undefined;
  const room = ses?.roomId ?? "";
  const t = sid ? s.things[sid] ?? null : null;
  // the talk this composer sits under: the stage is drawn over it, the strip is its last lines
  useLayoutEffect(() => { setHost(anchor.current?.closest(".page-in")?.querySelector(".talk-wrap") ?? null); }, [sid]);
  useEffect(() => { setAway(false); }, [t?.id]);
  // a thing arriving on the stage rises into place; one coming back from Undo flies out of the project's row
  const back = useRef(false);
  useLayoutEffect(() => {
    if (!t || t.state === "sent") return;
    const el = piece.current?.querySelector<HTMLElement>(".v3-card") ?? null;
    if (back.current) { back.current = false; void flyFrom(landingOf(t.project), el); } else if (el && !el.dataset.in) { el.dataset.in = "1"; rise(el); }
  }, [t?.id, t?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSend = async () => {
    if (!sid || !t) return;
    const card = piece.current?.querySelector<HTMLElement>(".v3-piece-body") ?? null;
    const flight = fly(card, landingOf(t.project));
    const r = await sendThing(sid);
    await flight;
    if (r.ok) pulse(landingOf(t.project));
    else e.flash?.(`not sent: ${r.why ?? "the engine did not answer"}`);
  };
  const onUndo = async () => { if (!sid) return; back.current = true; const r = await undoThing(sid); if (!r.ok) { back.current = false; e.flash?.(r.why ?? "too late to undo"); } };

  const stage = t && sid ? (
    <div className={`v3-stage${away ? " v3-stage-away" : ""}`} data-kind={t.kind} data-state={t.state}>
      <div className="v3-stage-mid">
        <div ref={piece} className="v3-piece">
          {t.state === "sent" ? <SentChip t={t} onUndo={() => void onUndo()} onSettle={() => settle(sid)} />
            : <div className="v3-piece-body"><Card t={t} sessionId={sid} topic={ses?.title ?? "this session"} />
              {t.state !== "kept" && <CrossingFoot t={t} onSend={() => void onSend()} onKeep={() => keep(sid)} />}</div>}
        </div>
      </div>
      <button className="v3-strip-toggle" onClick={() => setAway((a) => !a)}>{away ? "the stage" : "whole conversation"}</button>
    </div>
  ) : null;
  return (
    <span ref={anchor} className="v3-anchor" hidden>
      {host && sid && room && createPortal(<>{stage}<Arrived sessionId={sid} room={room} roomName={w.roomNames[room] ?? ""} /></>, host)}
    </span>
  );
}
