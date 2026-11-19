// The anchor window's front (#1090, design NOW 01:30 #1, 02:24 #1): beside the side (docked, as in Build), the session
// that has waited longest in front and what runs under it (Front.tsx, lifted as designed). The rows come from what
// Build's side already has. The card in front says what is asked: that one session's thread is read (work.peek) and its
// pending ask shown in its own words: a permission ask with allow and no as the answers, answered from here with the
// session's own answer; no ask to read: the session's last line. A run is listed only with a line of its own.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { scoped, type useWork, type WorkSession, type Item } from "../work/useWork";
import type { St } from "../home/sideRows";
import { toolAsk } from "../work/WorkSteps";
import { Front, type Waiting, type Running } from "./Front";
import { Away } from "./Away";
import { ME, useScreens, forgetFollow, talkTo } from "./store";

type Work = ReturnType<typeof useWork>;
const live = (s: WorkSession) => !s.archived && !s.gone;
const ALLOW = "allow", NO = "no";

/** the pending ask in a thread, in its own words (pure): a permission ask and its two answers, else the last line said */
export function askOf(items: Item[] | undefined): { ask: string; options?: string[]; perm?: string } | null {
  if (!items?.length) return null;
  const p = [...items].reverse().find((it) => it.kind === "perm" && it.state === "ask");
  if (p) {
    const tool = String(p.tool ?? ""), input = p.input ?? {};
    const what = p.title ? String(p.title) : `It wants to ${toolAsk(tool, input)}`;
    const cmd = tool === "Bash" && input.command ? `: ${String(input.command)}` : "";
    return { ask: `${what}${cmd}`.slice(0, 300), options: [ALLOW, NO], perm: p.id };
  }
  const last = [...items].reverse().find((it) => typeof it.text === "string" && it.text.trim() && it.kind !== "user");
  return last ? { ask: String(last.text).replace(/\s+/g, " ").trim().slice(0, 300) } : null;
}

/** the front's rows from the side's sessions: the ones that need you, longest waiting first; the ones that run, each
 *  with its own line only (pure) */
export function frontRows(sessions: WorkSession[], st: (s: WorkSession) => St): { waits: WorkSession[]; runs: Running[] } {
  const waits = sessions.filter((s) => live(s) && st(s) === "needs").sort((a, b) => a.updatedAt - b.updatedAt);
  const runs = sessions.filter((s) => live(s) && st(s) === "running").sort((a, b) => b.updatedAt - a.updatedAt)
    .map((s) => ({ id: s.id, title: s.title || "untitled", doing: s.card?.trim() ?? "" })).filter((r) => r.doing);
  return { waits, runs };
}

export function AnchorFront({ w, st, room, onOpen }: { w: Work; st: (s: WorkSession) => St; room: number; onOpen: (id: string) => void }) {
  const { waits: rows, runs } = frontRows(w.sessions, st);
  const first = rows[0]?.id;
  // the card in front: its session's thread is read here, that one only
  useEffect(() => { if (!first) return; w.peek(first); return () => w.unpeek(first); }, [first]); // eslint-disable-line react-hooks/exhaustive-deps
  const front = first ? askOf(scoped(w, first).thread?.items) : null;
  const waits: Waiting[] = rows.map((s, i) => ({ id: s.id, title: s.title || "untitled",
    ask: i === 0 && front ? front.ask : s.card?.trim() || "", ...(i === 0 && front?.options ? { options: front.options } : {}) }));
  const answer = (id: string, o: string) => { if (id === first && front?.perm) scoped(w, id).perm(front.perm, { allow: o === ALLOW }); };
  // the words written in the card go to that session as its next message, as its own box would send them
  // design NOW 05:08 #3: under the front, always, the box's outline: where the talk went and the way it comes back.
  // Follow-me (Jev 6) on an anchor is this outline offered (solid), not a second ghost
  const { follow } = useScreens();
  // the room as it stands (design NOW 06:19 #2a): measured, not the window less the side (that counts the rail too)
  const box = useRef<HTMLDivElement>(null);
  const [mine, setMine] = useState(room);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const take = () => setMine(el.clientWidth);
    take();
    const ro = new ResizeObserver(take);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fits = mine >= 240;
  return (
    <div ref={box} className="sf-room sc-anchorroom">
      {fits && <Front w={mine} waits={waits} runs={runs} keys={false} onOpen={onOpen} onAnswer={answer} onSay={(id, words) => { scoped(w, id).say(words); }} />}
      {fits && <Away w={mine} offered={!!follow} onBring={() => { forgetFollow(); talkTo(ME); }} />}
    </div>
  );
}
