// The deck's inside (#692 suite step 2, suite.html "deck": to learn it): cards, one at a time, spaced by how he did.
// Press the card to turn it; swipe it right (knew) or left (didn't), or use the two pills or ← →; hold it for the source
// slide. A card he knew goes a box up and further back; one he missed comes back two cards later (p2/deck.mjs). The
// frame (Piece.tsx) draws the words, the ring and the shelf; this draws only the cards. The card is a button, so a hold
// on it is the deck's (the source), not the frame's fan.
import { useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import type { Metas } from "../../meta";
import type { ShapeProps } from "./shapes";
import { say } from "./lift";
import "./deck.css";

export const meta = {
  Deck: {
    job: "to learn it: cards from the folder's slides, one at a time, spaced by how he did",
    flow: "know",
    states: ["its run writing the cards", "a question", "its answer, turned", "the source slide, held", "swiping: knew or didn't", "the run failed: the stand-in's cards"],
    keys: [
      { press: "press the card, or space", does: "turns it: question ↔ answer" },
      { press: "swipe right, → or knew it", does: "knew: a box up, further back (home.deck.mark knew)" },
      { press: "swipe left, ← or didn't", does: "didn't: comes back two cards later (home.deck.mark)" },
      { press: "hold the card 450 ms", does: "shows the slide it came from" },
    ],
    listens: ["home.state › blocks"],
  },
} satisfies Metas;

type Card = { id: string; q: string; a: string; src: string; slide?: string; box: number; seen?: number; missed?: number };
type Body = { subject: string; cards: Card[]; queue: string[]; knew: number; missed: number; by?: string; failed?: string };

/** the grammar's hold (Piece.tsx HOLD_MS) */
const HOLD = 450;
/** how far a swipe goes before it counts, in px: the scale's --s12 + --s4 */
const SWIPE = 64;
/** the box a card is learned past (p2/deck.mjs TOP) */
const TOP = 3;

export function Deck({ b, r, h }: ShapeProps) {
  const [turned, setTurned] = useState(false);
  const [source, setSource] = useState(false);
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x: number; y: number; t: number; held: boolean; moved: boolean } | null>(null);
  const body = b.body as Body | null;
  if (!body?.cards?.length) return <p className="pc-step" data-dk-wait>{r ? `its run: ${r.run}` : "its run is writing the cards"}…</p>;
  const card = body.cards.find((c) => c.id === body.queue[0]) ?? body.cards[0];
  const learned = body.cards.filter((c) => c.box > TOP).length;

  const markIt = (knew: boolean) => {
    setTurned(false); setSource(false); setDx(0);
    h.send({ type: "home.deck.mark", id: b.id, card: card.id, knew });
    say(knew ? (card.box + 1 > TOP ? "knew it: learned, it comes back last" : "knew it: it comes back later") : "didn't: it comes back in two cards");
  };
  const down = (e: RPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const t = window.setTimeout(() => { const d = drag.current; if (d && !d.moved) { d.held = true; setSource(true); say(`from ${card.src}`); } }, HOLD);
    drag.current = { x: e.clientX, y: e.clientY, t, held: false, moved: false };
  };
  const move = (e: RPointerEvent<HTMLButtonElement>) => {
    const d = drag.current; if (!d) return;
    const x = e.clientX - d.x;
    // held (the slide showing) and then moved: it is a swipe after all
    if (d.held) { if (Math.abs(x) < SWIPE / 4) return; d.held = false; d.moved = true; setSource(false); }
    if (Math.abs(x) > 4 || Math.abs(e.clientY - d.y) > 4) { d.moved = true; clearTimeout(d.t); }
    if (d.moved) setDx(x);
  };
  const up = (e: RPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const d = drag.current; drag.current = null; if (!d) return;
    clearTimeout(d.t);
    if (d.held) { setSource(false); return; }
    if (!d.moved) { setTurned(!turned); return; }
    const x = e.clientX - d.x;
    if (x >= SWIPE) markIt(true); else if (x <= -SWIPE) markIt(false); else setDx(0);
  };
  const key = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); markIt(true); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); markIt(false); }
    else if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); setTurned(!turned); }
  };
  const lean = dx >= SWIPE ? "knew" : dx <= -SWIPE ? "didnt" : undefined;
  const stop = { onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(), onClick: (e: { stopPropagation: () => void }) => e.stopPropagation() };
  return (
    <div className="dk" data-pc-inside="deck" data-dk-card={card.id} data-dk-side={source ? "source" : turned ? "answer" : "question"}>
      <div className="dk-pile">
        <button type="button" className={`dk-card${dx ? " moving" : ""}`} data-dk-lean={lean}
          style={dx ? { transform: `translateX(${dx}px) rotate(${(dx / SWIPE) * 3}deg)` } : undefined}
          aria-label={`${turned ? "answer" : "question"}: press to turn, swipe right if you knew it, left if not, hold for the slide`}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; setDx(0); setSource(false); }}
          onClick={(e) => e.stopPropagation()} onKeyDown={key} onDragStart={(e) => e.preventDefault()}
          /* the frame's card is draggable (a refile): a mousedown kept from its default starts no native drag */
          onMouseDown={(e) => e.preventDefault()} draggable={false}>
          {source
            ? <span className="dk-source" data-dk-source><small>{card.src}</small><span>{card.slide || "the slide has no line kept"}</span></span>
            : <><small className="dk-side">{turned ? "answer" : "question"}</small><span className="dk-text">{turned ? card.a : card.q}</span></>}
          {lean && <i className="dk-lean">{lean === "knew" ? "knew it" : "didn't"}</i>}
        </button>
      </div>
      <div className="dk-acts" {...stop}>
        <button type="button" className="pc-act" data-dk-mark="didnt" onClick={() => markIt(false)}>didn't</button>
        <button type="button" className="pc-act lit" data-dk-mark="knew" onClick={() => markIt(true)}>knew it</button>
        <span className="dk-boxes" aria-label={`${learned} of ${body.cards.length} learned`}>
          {body.cards.map((c) => <i key={c.id} className={`dk-box b${Math.min(c.box, TOP + 1)}${c.id === card.id ? " now" : ""}`} title={`${c.q} · box ${c.box}`} />)}
        </span>
      </div>
      <p className="dk-by">{body.failed ?? `${body.subject} · ${body.knew} knew · ${body.missed} missed · by ${body.by ?? "its run"}`}</p>
    </div>
  );
}
