// The inbox's inside (#692 suite step 2, suite.html "inbox": what arrives): two piles, needs you · it handled. Flick one
// right to done (or its "done"), pull one into a sticky (its "→ sticky": its ask, in the folder it belongs to). What it
// handled says what it did, honestly: drafted, never sent. The frame (Piece.tsx) draws the words, the ring and the
// shelf; this draws only the piles. Stand-in: p2/inbox.mjs.
import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { Sticky } from "../pass2";
import type { Metas } from "../../meta";
import type { ShapeProps } from "./shapes";
import { say } from "./lift";
import "./inbox.css";

export const meta = {
  Inbox: {
    job: "what arrives (mail, Canvas), in two piles: needs you · it handled",
    flow: "know",
    states: ["its run sorting", "the two piles", "flicking one", "one pulled into a sticky", "the handled pile open", "the run failed: the stand-in's sort"],
    keys: [
      { press: "flick an item right, or its done", does: "done by you: it moves to handled (home.inbox.done)" },
      { press: "→ sticky", does: "pulls it into a sticky in its folder (home.inbox.pull)" },
      { press: "it handled", does: "opens or folds the handled pile" },
    ],
    listens: ["home.state › blocks"],
  },
} satisfies Metas;

type Item = { id: string; from: string; via: "mail" | "canvas"; subject: string; line: string; folder: string; at: string; pile: "you" | "it"; did?: string; ask?: string; sticky?: string };
type Body = { items: Item[]; by?: string; failed?: string };

/** how far a flick goes before it counts, in px (deck.tsx's swipe) */
const FLICK = 64;

export function Inbox({ b, r, h }: ShapeProps) {
  const [handled, setHandled] = useState(false);
  const [fl, setFl] = useState<{ id: string; dx: number } | null>(null);
  const start = useRef<{ id: string; x: number } | null>(null);
  const body = b.body as Body | null;
  if (!body?.items) return <p className="pc-step" data-ib-wait>{r ? `its run: ${r.run}` : "its run is sorting what arrived"}…</p>;
  const you = body.items.filter((x) => x.pile === "you"), it = body.items.filter((x) => x.pile === "it");

  const done = (x: Item) => { setFl(null); h.send({ type: "home.inbox.done", id: b.id, item: x.id }); say(`done by you: ${x.subject}`); };
  const pull = async (x: Item) => {
    const m = await h.ask<{ sticky?: Sticky }>({ type: "home.inbox.pull", id: b.id, item: x.id });
    if (m?.sticky) say(`pulled into a sticky: ${m.sticky.text}`);
  };
  const down = (e: RPointerEvent<HTMLLIElement>, x: Item) => {
    if (e.button !== 0 || (e.target as Element).closest("button")) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { id: x.id, x: e.clientX };
  };
  const move = (e: RPointerEvent<HTMLLIElement>) => { const s = start.current; if (s) setFl({ id: s.id, dx: Math.max(0, e.clientX - s.x) }); };
  const up = (e: RPointerEvent<HTMLLIElement>, x: Item) => {
    const s = start.current; start.current = null;
    if (!s) return;
    e.stopPropagation();
    if (e.clientX - s.x >= FLICK) done(x); else setFl(null);
  };
  const stop = { onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(), onClick: (e: { stopPropagation: () => void }) => e.stopPropagation() };

  return (
    <div className="ib-box" data-pc-inside="inbox"><div className="ib">
      <section className="ib-pile" data-ib-pile="you" aria-label="needs you">
        <h4 className="ib-k">needs you <span>{you.length}</span></h4>
        {you.length === 0 && <p className="ib-none">nothing needs you</p>}
        <ul>
          {you.map((x) => {
            const dx = fl?.id === x.id ? fl.dx : 0;
            return (
              <li key={x.id} className={`ib-item${dx ? " moving" : ""}${dx >= FLICK ? " go" : ""}`} data-ib-item={x.id} data-ib-sticky={x.sticky ?? undefined}
                style={dx ? { transform: `translateX(${dx}px)` } : undefined} title="flick right: done"
                onPointerDown={(e) => down(e, x)} onPointerMove={move} onPointerUp={(e) => up(e, x)} onPointerCancel={() => { start.current = null; setFl(null); }} onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => { if (!(e.target as Element).closest("button")) e.preventDefault(); }} draggable={false} onDragStart={(e) => e.preventDefault()}>
                <span className="ib-head"><b>{x.from}</b><small>{x.via === "canvas" ? "Canvas" : "mail"} · {x.folder}</small></span>
                <span className="ib-subj">{x.subject}</span>
                <span className="ib-line">{x.line}</span>
                <span className="ib-acts" {...stop}>
                  {x.ask && <span className="ib-ask">{x.ask}</span>}
                  <button type="button" className="pc-act" data-ib-pull onClick={() => void pull(x)}>{x.sticky ? "a sticky ✓" : "→ sticky"}</button>
                  <button type="button" className="pc-act lit" data-ib-done onClick={() => done(x)}>done</button>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="ib-pile it" data-ib-pile="it" aria-label="it handled">
        <button type="button" className="ib-k ib-fold" data-ib-handled aria-expanded={handled} {...stop} onClick={(e) => { e.stopPropagation(); setHandled(!handled); }}>
          it handled <span>{it.length}</span><i aria-hidden>{handled ? "−" : "+"}</i>
        </button>
        <ul>
          {(handled ? it : it.slice(0, 2)).map((x) => (
            <li key={x.id} className="ib-done" data-ib-item={x.id}>
              <span className="ib-head"><b>{x.from}</b><small>{x.subject}</small></span>
              <span className="ib-did">{x.did ?? "handled"}</span>
            </li>
          ))}
          {!handled && it.length > 2 && <li className="ib-more">and {it.length - 2} more</li>}
        </ul>
      </section>
      <p className="ib-by">{body.failed ?? `${body.items.length} arrived · by ${body.by ?? "its run"} · it sends nothing`}</p>
    </div></div>
  );
}
