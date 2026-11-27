// The Diary as a sticker on the canvas (#1879 step 4; decisions.md 2026-11-25, the frame drawing's .dy): the day icon and
// the date with ‹ › in its head, a grey strip of what is waiting, "While you were away" in small grey, the headline in big
// heavy type, then the day's lines as rows (its time, its title in bold, one line of detail, a dot in its folder's colour)
// and "+N more" under a hairline. No time rail, no yellow cards. Pressing it opens the Diary up close: that is the
// canvas's to do (`onOpen`); the arrows and the rows' own presses never open it. Tokens only (kit/parts.css).
import type { ReactNode } from "react";
import { Icon } from "./icons";
import { markOf, type Paint } from "./Signs";
import "./parts.css";

export type DiaryRow = { id: string; time: string; title: string; detail?: string; paint?: Paint | null; ask?: boolean };

export function DiaryCard({ date, day, count, waiting, away, headline, rows, more, onPrev, onNext, onRow, hover, className }: {
  date: string; day: number | string; count: number; waiting: ReactNode; away?: string | null; headline: ReactNode; rows: DiaryRow[]; more?: number;
  onPrev?: (() => void) | null; onNext?: (() => void) | null; onRow?: (id: string) => void; hover?: boolean; className?: string;
}) {
  return (
    <div className={`kp-part kp-diary${hover ? " kp-is-hover" : ""}${className ? ` ${className}` : ""}`} data-part="diary" data-rows={rows.length}>
      <div className="kp-diary-hd">
        <Icon name="diary" day={day} />
        <b className="kp-name kp-diary-date">{date}</b>
        <span className="kp-diary-nv">
          <button type="button" aria-label="The day before" disabled={!onPrev} onClick={(e) => { e.stopPropagation(); onPrev?.(); }}>‹</button>
          <button type="button" aria-label="The next day" disabled={!onNext} onClick={(e) => { e.stopPropagation(); onNext?.(); }}>›</button>
        </span>
      </div>
      <div className={`kp-diary-wait${count ? "" : " kp-diary-none"}`} data-wait><b className="kp-name">{count}</b><span>{waiting}</span></div>
      {away ? <div className="kp-diary-away"><Icon name="moon" small />{away}</div> : null}
      <div className="kp-name kp-diary-head" data-m1="what">{headline}</div>
      {rows.map((r) => (
        <div key={r.id} className={`kp-diary-row${r.ask ? " kp-diary-ask" : ""}`} data-row={r.id} onClick={onRow ? (e) => { e.stopPropagation(); onRow(r.id); } : undefined}>
          <span className="kp-diary-tm">{r.time}</span>
          <div><b>{r.title}</b>{r.detail ? <p>{r.detail}</p> : null}</div>
          {r.paint ? <i className="kp-mark kp-mark-s" style={{ background: markOf(r.paint) }} /> : <i />}
        </div>
      ))}
      {more ? <div className="kp-diary-more">+{more} more</div> : null}
    </div>
  );
}
