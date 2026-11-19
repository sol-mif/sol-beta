// The ask's inside (#692 suite step 2, suite.html: "what it needs from you"): one question a run stopped at and its two
// likeliest answers. It waits; the run goes on the moment he answers, and it folds away (a line, then gone). Born from
// a run (a stack's gate, a sticky that asks), never from the maker. Drawn inside Piece's own card; the stand-in's
// suite-ask.mjs hands the answer back.
//   tap an answer     home.ask.answer with it
//   say your own      the field under them, Enter: home.ask.answer with his words
import { useState } from "react";
import type { Metas } from "../../meta";
import { say } from "./lift";
import type { ShapeProps } from "./shapes";
import "./ask.css";

export const meta = {
  Ask: {
    job: "the one question a run stopped at, with two answers; the run goes on the moment you answer",
    flow: "answer",
    states: ["asking: the question and two answers", "your own words being written", "answered: it goes on, then folds away"],
    keys: [
      { press: "an answer", does: "hands it back to the run that asked (home.ask.answer)", goal: "answer" },
      { press: "say your own, Enter", does: "hands your words back instead (home.ask.answer)", goal: "answer" },
    ],
    listens: ["home.state › blocks (its body: q, options, from, answer)"],
  },
} satisfies Metas;

type AskBody = { q: string; options: string[]; from?: { block?: string; recipe?: string; sticky?: string }; answer?: string; by?: "tap" | "said" };

export function Ask({ b, h, st }: ShapeProps) {
  const body = b.body as AskBody | null;
  const [own, setOwn] = useState("");
  if (!body?.q) return <p className="pc-step">a run is asking…</p>;
  const from = body.from?.block ? st.blocks?.find((x) => x.id === body.from?.block) : body.from?.sticky ? st.blocks?.find((x) => x.id === body.from?.sticky) : undefined;
  const answer = (a: string) => { const t = a.trim(); if (!t) return; h.send({ type: "home.ask.answer", id: b.id, answer: t }); say(`you said "${t}": it goes on`); };
  if (body.answer) return <p className="qa-done" data-pc-inside="ask" data-ask-answered>you said “{body.answer}” · it goes on{from ? ` in ${from.words}` : ""}</p>;
  return (
    <div className="qa" data-pc-inside="ask" onPointerDown={(e) => e.stopPropagation()}>
      <p className="qa-q">{body.q}</p>
      <div className="qa-two">
        {body.options.map((o) => <button key={o} type="button" className="qa-one" data-ask-answer={o} onClick={(e) => { e.stopPropagation(); answer(o); }}>{o}</button>)}
      </div>
      <input className="qa-own" value={own} placeholder="or say your own" aria-label="say your own answer" data-ask-own
        onChange={(e) => setOwn(e.target.value)} onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { answer(own); setOwn(""); } }} />
      {from && <p className="qa-from">it stopped in {from.recipe === "sticky" ? "the sticky" : `the ${from.recipe}`} “{from.words}”</p>}
    </div>
  );
}
