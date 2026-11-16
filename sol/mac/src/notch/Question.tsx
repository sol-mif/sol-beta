// The question card in the notch (#794, plan Part C slice 31; home/whole.md "The question card", "The seams":
// "Open: the front question card, answerable there"; scene 5), behind sol.home.whole. While a job asks you something,
// the notch drops open once with that question under its slab, 440 wide: where it came from and its folder, "waits on you" in
// the jelly's yellow, the question, one line of why, the warm answer and the plain one, and a word that the same card
// stands on Home. An answer here is Home's `home.answer` (home/whole/store.ts): the list's bus carries it to Home's
// window, where the card goes too, and the job goes on. Drawn from the kit (Card, Button) and Home's own warm answer.
import { useEffect, useRef } from "react";
import { Button, Card } from "../kit";
import { dim, ink, mute } from "../kit/paint";
import { JELLY, TYPE } from "../kit/tokens";
import { Glyph, SOURCE_NAME, Warm } from "../home/whole/First";
import { answer, useToday } from "../home/whole/store";
import { notchAskOf, questionOf, type NotchAsk } from "../home/whole/question";
import { useHomeWhole } from "../flag";
import "./question.css";

export const ASK_W = 440;   // the open notch's card, scene 5 (440 × 160)
const SUN = JELLY.warm[3];

/** the question the notch shows, with the switch on; a new one calls `drop` (the notch opens for it) until its card has
 *  been drawn: a question that came while a drop or the private row held the notch drops again once it closes (#860 R3) */
export function useNotchQuestion(drop: () => void, open: boolean): { q: NotchAsk | null; drawn: (id: string) => void } {
  const on = useHomeWhole();
  const v = useToday();   // the list, as Home reads it (the stub's bus until #790); with the switch off its question is never shown
  const t = on && v.today ? questionOf(v.today.needs, v.things) : null;
  const q = t ? notchAskOf(t) : null;
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (q && shown.current !== q.id && !open) drop();
    if (!q) shown.current = null;
  }, [q?.id, open]); // eslint-disable-line react-hooks/exhaustive-deps
  return { q, drawn: (id: string) => { shown.current = id; } };
}

/** the card under the slab; `onAnswered` lets the notch say so on its line */
export function NotchQuestion({ q, top, boxRef, onAnswered, onDrawn }: { q: NotchAsk; top: number; boxRef?: React.Ref<HTMLDivElement>; onAnswered: (words: string) => void; onDrawn: (id: string) => void }) {
  useEffect(() => { onDrawn(q.id); }, [q.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const say = (words: string) => { answer(q.id, words); onAnswered(words); };
  return (
    <div ref={boxRef} className="nq" data-notch-question={q.id} style={{ top, width: ASK_W }} data-nopress
      onPointerDown={stop} onPointerUp={stop} onMouseDown={stop} onMouseUp={stop} onClick={stop}>
      <Card w={ASK_W} step="pop">
        <div className="nq-in">
          <div className="nq-meta" style={{ color: dim }}><Glyph source={q.source} /><span>{SOURCE_NAME[q.source]}</span><span className="nq-dot">·</span><span className="nq-crumb">{q.meta}</span><span className="nq-when" style={{ color: SUN }}>waits on you</span></div>
          <div className="nq-title" style={{ color: ink, fontSize: TYPE.read[0], lineHeight: `${TYPE.read[1]}px` }}>{q.title}</div>
          <div className="nq-why" style={{ color: dim }}>{q.why}</div>
          <div className="nq-acts">
            <Warm h={32} onClick={() => say(q.answers[0])}>{q.answers[0]}</Warm>
            <Button h={32} onClick={() => say(q.answers[1])}>{q.answers[1]}</Button>
            <span className="nq-space" />
            <span className="nq-home" style={{ color: mute }}>also on Home</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
