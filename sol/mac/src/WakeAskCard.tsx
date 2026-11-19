// The one question about waking (#1313, Frank 2026-11-16): may my teammates' comments on GitHub wake my agent, and their
// agents ask mine (the engine's team/reach.ts answering)? One yes turns both on; Settings turns each off on its own. Asked
// once, over either mode, on the first window after the first run (a Sol set up before this asks the next time it
// opens), and only while the group in use is a GitHub group with an org (its members are GitHub logins). The answer is
// for that group: another group in use asks again. Yes: their comments wake it the narrow way (the engine's
// team/wake.ts rulesOf), the day I answered kept as the day the terms line was shown. No: as before, nobody. Later:
// asked again another day. Settings › my agent changes it (control/Wake.tsx). The card's spot is the counting card's
// (CountsCard), and App shows it only when that one is not up.
import { useEffect, useState } from "react";
import { useControl } from "./control/useControl";
import { TERMS } from "./control/Wake";
import { groupsOf } from "./cowork/rooms";
import "./counts.css";

export type WakeAsk = { answer: "" | "yes" | "no" | "later"; at: string; room: string; off?: ("wake" | "asks")[] };
const day = () => new Date().toISOString().slice(0, 10);
/** whether the question is due (pure): the engine's wakeAskDue */
export const wakeAskDue = (a: WakeAsk | undefined, room: string, today = day()) => !a || a.room !== room || a.answer === "" || (a.answer === "later" && a.at < today);

export function WakeAskCard() {
  const c = useControl();
  const [gone, setGone] = useState(false);
  // the settings come once the engine answers: asked now, and again until it has
  useEffect(() => {
    if (c.team) return;
    void c.load();
    const t = window.setInterval(() => void c.load(), 5000);
    return () => window.clearInterval(t);
  }, [c.team, c.load]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = c.team;
  const me = t?.me.login ?? "";
  const room = t ? groupsOf(t.rooms).find((r) => r.id === t.room) : undefined;
  if (gone || !t || !me || !room || room.provider !== "github" || !room.org || !room.repos.length || !wakeAskDue(t.wakeAsk, t.room)) return null;
  // off: [] so a line turned off for another group is not kept (team.json merges field by field)
  const answer = (a: "yes" | "no" | "later") => { setGone(true); void c.set({ wakeAsk: { answer: a, at: day(), room: t.room, off: [] } }); };
  return (
    <div className="counts wakeask" role="dialog" aria-label="may your teammates wake your agent?">
      <p className="counts-h">May your teammates wake your agent?</p>
      <p className="counts-p">When a teammate starts a line with <b>@{me}'s agent</b> in a comment on GitHub, in the repositories of {room.name}, your agent wakes up on this Mac and answers on that thread.</p>
      <p className="counts-p">It can only read that thread and the repository and answer there. It cannot touch anything on this Mac. At most 3 times a thread a day.</p>
      <p className="counts-p">Their agents can also ask yours a question in Sol. It answers from what this Sol can read and changes nothing. At most 12 asks a person a day.</p>
      <p className="counts-p">{TERMS}</p>
      <p className="counts-p">You can change it any time in Settings › my agent.</p>
      <div className="wakeask-acts">
        <button className="counts-ok" onClick={() => answer("yes")}>Yes, let them</button>
        <button className="wakeask-no" onClick={() => answer("no")}>No</button>
        <button className="wakeask-no" onClick={() => answer("later")}>Later</button>
      </div>
    </div>
  );
}
