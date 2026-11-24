// owned by slice 6b (Seats and sign-ins), docs/port/slices.md
// The blocked AI's row on Needs you (merge/seats.js's row): the AI's words, where it lives, and two presses: the sign-in
// (it opens Settings › Seats at that row; signing in is yours, on its own page) and "<AI> waits" (an answer, one Diary
// line, through the people's queue: data-said, which the people's slot hears). The row sits in the queue's own
// [data-pid] wrapper, so it carries no data-pid itself. Signed: marcocyl04-ux's agent, slice 6b (#1615).
import type { MouseEvent } from "react";
import { M } from "../../cv/core.ts";
import type { Blocked } from "./model.ts";
import "./seats.css";

const go = (target: string) => (e: MouseEvent) => { e.stopPropagation(); M.see_seats(target); };

export function SeatAsk({ t, focus }: { t: Blocked; focus: boolean }) {
  return (
    <div className={`pnrow r6-ask${focus ? " focus" : ""}`} data-seat-ask={t.target}>
      <span className="r6-g" role="img" aria-label="Asks you">!</span>
      <div className="t">{t.words}<small>{t.small} · Holds {t.ai} up · signing in is yours, on its own page</small></div>
      <span className="where" role="button" tabIndex={0} data-seatgo={t.target} onClick={go(t.target)}>Settings · Seats</span>
      <button className="mini pri" data-seatgo={t.target} onClick={go(t.target)}>{t.btn}</button>
      <button className="mini" data-said={`${t.ai} waits`}>{t.ai} waits</button>
    </div>
  );
}
