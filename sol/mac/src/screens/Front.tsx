// The front (#1090, design round 1): what a window shows beside its side when the talk and the blocks are on the other
// window (the role `anchor`). It replaces the "all sessions" table there. Not a list to read: the one thing that waits
// on the Sol user, in front, answerable right here, and under it what runs, alive. With nothing waiting and nothing
// running it draws nothing: the side alone.
//   in front    the session that has waited longest: its name, what it asks (reading size, three lines at most), its
//               answers as buttons. Behind it the edges of the next two; a count past that.
//   answer      a press on an answer answers it here (onAnswer); the card lifts off, the next comes forward
//   say         every card carries one line to write in: Return sends those words to that session as its next message
//               (onSay) and the card lifts off the same way. An ask with no choices is answered here too, not only opened.
//               `keys`: this window has no talk, so the keyboard rests in that line whenever a card is in front
//   open        a press on the card's body opens that session on the other window (onOpen): the same as its row
//   the runs    one line per running session that says what it is doing now, five at most; a press opens it there.
//               A run with nothing to say is not listed: the side's own rows already show that it runs
// Presentational and pure: the wiring (which sessions wait, what they ask) is the builder's, from what Build's side has.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button, Card, Field, Row } from "../kit";
import { RunMark } from "./ScreenMap";
import { dim, ink, mute } from "../kit/paint";
import { TYPE } from "../kit/tokens";
import "./front.css";

export const meta = {
  Front: {
    job: "on the window that holds only the side: what waits on me, in front and answerable, and what runs",
    flow: "mine",
    states: ["nothing waits, nothing runs: not drawn", "one waits", "several wait: one in front, edges behind", "writing an answer in the card's line", "answered: the card lifts off", "only runs"],
    keys: [
      { press: "click an answer", does: "that session is answered from here" },
      { press: "click the card", does: "that session opens on the other window" },
      { press: "write in the card's line, Return", does: "those words go to that session as its next message" },
      { press: "1, 2, 3 (the line empty)", does: "the first, second, third answer of the card in front" },
      { press: "Return (the line empty)", does: "opens the card's session on the other window and moves the keyboard to its box" },
    ],
    listens: ["the session rows' states and asks (Build's side)", "screens.state: which session the other window shows"],
  },
};

export type Waiting = { id: string; title: string; ask: string; options?: string[] };
export type Running = { id: string; title: string; doing: string };
export const FRONT_W = 520, RUNS_MAX = 5, BEHIND = 2;

/** the card's width in a window's free room: 520 at most, 24 px kept each side (pure) */
export const frontW = (room: number) => Math.max(240, Math.min(FRONT_W, room - 48));

export function Front({ w, waits, runs, keys = false, onAnswer, onSay, onOpen }: {
  w: number; waits: Waiting[]; runs: Running[]; keys?: boolean;
  onAnswer?: (id: string, option: string) => void; onSay?: (id: string, words: string) => void; onOpen?: (id: string) => void;
}) {
  const [gone, setGone] = useState<string | null>(null);
  const [own, setOwn] = useState("");
  const line = useRef<HTMLInputElement>(null);
  const firstId = waits[0]?.id;
  // a new card in front starts with an empty line; with `keys` the keyboard rests in it
  useEffect(() => { setOwn(""); if (keys && firstId) line.current?.focus({ preventScroll: true }); }, [firstId, keys]);
  // a run is listed only when it has a line of its own to say: the side's rows already show that it runs
  const said = runs.filter((r) => r.doing.trim());
  if (!waits.length && !said.length) return null;
  const cw = frontW(w), first = waits[0], behind = Math.min(BEHIND, waits.length - 1), more = waits.length - 1 - behind;
  const lift = (id: string, then: () => void) => { setGone(id); window.setTimeout(() => { setGone(null); then(); }, 220); };
  const answer = (id: string, o: string) => lift(id, () => onAnswer?.(id, o));
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!first || e.nativeEvent.isComposing) return;
    const words = own.trim(), n = "123".indexOf(e.key);
    if (e.key === "Enter") { e.preventDefault(); if (words) lift(first.id, () => onSay?.(first.id, words)); else onOpen?.(first.id); }
    // reviewer: never a digit for a permission ask (a stray "1" would allow a command)
    else if (!own && n >= 0 && first.options?.[n] && !first.options.includes("allow")) { e.preventDefault(); answer(first.id, first.options[n]); }
    else if (e.key === "Escape") { setOwn(""); line.current?.blur(); }
  };
  const read = TYPE.read, lab = TYPE.label;
  return (
    <div className="sf" data-part="the front" style={{ width: cw }}>
      {first && (
        <div className={`sf-stack ${gone === first.id ? "gone" : ""}`} style={{ paddingBottom: behind * 8 }}>
          {Array.from({ length: behind }, (_, i) => (
            <div key={i} className="sf-behind" style={{ left: (i + 1) * 10, right: (i + 1) * 10, bottom: (behind - 1 - i) * 8, opacity: 0.7 - i * 0.25 }}>
              <Card w={cw - (i + 1) * 20} h={28} step="card" />
            </div>
          ))}
          <div className="sf-card" key={first.id} onClick={() => onOpen?.(first.id)} role="button" aria-label={`open ${first.title} on the other window`}>
            <Card w={cw} step="raised">
              <div className="sf-in">
                <div style={{ color: dim, fontSize: lab[0], lineHeight: `${lab[1]}px` }}>{first.title}</div>
                <div className="sf-ask" style={{ color: ink, fontSize: read[0], lineHeight: `${read[1]}px` }}>{first.ask}</div>
                {!!first.options?.length && (
                  <div className="sf-answers" data-no-drag onClick={(ev) => ev.stopPropagation()}>
                    {first.options.slice(0, 3).map((o) => <Button key={o} h={32} acts flat onClick={() => answer(first.id, o)}>{o}</Button>)}
                  </div>
                )}
                {onSay && (
                  <div className="sf-say" data-no-drag onClick={(ev) => ev.stopPropagation()}>
                    <Field w={cw - 48} h={32}>
                      <input ref={line} className="sf-line" value={own} placeholder="say it here" aria-label={`answer ${first.title} in your own words`}
                        onChange={(e) => setOwn(e.target.value)} onKeyDown={onKey} style={{ fontSize: lab[0] }} />
                    </Field>
                  </div>
                )}
              </div>
            </Card>
          </div>
          {more > 0 && <div className="sf-more" style={{ color: mute, fontSize: lab[0] }}>+{more}</div>}
        </div>
      )}
      {!!said.length && (
        <div className="sf-runs">
          {said.slice(0, RUNS_MAX).map((r) => (
            <Row key={r.id} w={cw} h={44} title={r.title} note={r.doing} lead={<RunMark />} onClick={() => onOpen?.(r.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
