// The icon module (#1879 step 0): every icon of the new face, and the only place an <svg> is written for it (the gate
// refuses an inline <svg> under sol/mac/src/next). The set is the frame drawing's (decisions.md, 2026-11-25: "Icons"):
// on a 24 grid (the square 17.6 at 3.2, radius 5.6, stroke 2.1, round ends): the Canvas is four squares, a folder an
// actual folder (Marco, 2026-11-25, drawing: tabs); a rounded square with a heavy top band for what holds things
// (diary, waiting, done); a plain shell for one thing (a session, a page, a note, a new session not started); solid
// glyphs for actions. Allo's own symbols (arrows, ⌘, ✓) stay text. On a tab the shell is filled with its folder's
// colour (FOLDER_PATH and the shells below), which is step 2's Tab, not this module. Colour is
// currentColor; a cut-out inside a solid glyph is var(--icon-cut), the surface it sits on (the card's by default).
//   <Icon name="folder" />            18px, the size token --icon
//   <Icon name="done" small />        15px, --icon-s
//   <BoxGlyph inside="kept" />        the check-in box: its body, its lid (class kp-lid) and the glyph under it (kp-glyph); BoxIcon moves them
//   <Progress p={0.4} />              a running session's ring, p from 0 to 1
import type { ReactNode } from "react";

const CUT = "var(--icon-cut, var(--card))";
const SQ = <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.6" fill="none" stroke="currentColor" strokeWidth="2.1" />;
const BAND = <path d="M3.2 9.4V8.8a5.6 5.6 0 0 1 5.6-5.6h6.4a5.6 5.6 0 0 1 5.6 5.6v.6Z" fill="currentColor" />;
const star = (s: number, cx = 12, cy = 12) => (
  <path transform={`translate(${cx} ${cy}) scale(${s})`} d="M0-7.2c.7 4.2 2.9 6.4 7.2 7.2-4.3.8-6.5 3-7.2 7.2-.7-4.2-2.9-6.4-7.2-7.2 4.3-.8 6.5-3 7.2-7.2Z" fill="currentColor" />
);
/** the folder's outline, also the fill under it when a tab paints it in the folder's colour */
export const FOLDER_PATH = "M2.8 8.4V7a2.8 2.8 0 0 1 2.8-2.8h3.6a2.4 2.4 0 0 1 1.9.9l1.1 1.4a2 2 0 0 0 1.6.8h4.6a2.8 2.8 0 0 1 2.8 2.8v6.3a3.4 3.4 0 0 1-3.4 3.4H6.2a3.4 3.4 0 0 1-3.4-3.4Z";
const NOTE_PATH = "M14.6 20.8H8.8a5.6 5.6 0 0 1-5.6-5.6V8.8a5.6 5.6 0 0 1 5.6-5.6h6.4a5.6 5.6 0 0 1 5.6 5.6v5.8Z";
const TICK = <path d="M8.6 14.6l2.4 2.3 4.6-4.8" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />;

/** the glyphs, each the inside of a 24×24 viewBox */
export const ICONS = {
  canvas: <g fill="none" stroke="currentColor" strokeWidth="2.1"><rect x="3.4" y="3.4" width="7.4" height="7.4" rx="2.4" /><rect x="13.2" y="3.4" width="7.4" height="7.4" rx="2.4" /><rect x="3.4" y="13.2" width="7.4" height="7.4" rx="2.4" /><rect x="13.2" y="13.2" width="7.4" height="7.4" rx="2.4" /></g>,
  folder: <path d={FOLDER_PATH} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />,
  diary: <>{SQ}{BAND}</>,
  waiting: <>{SQ}{BAND}<g fill="currentColor"><circle cx="8.6" cy="15.2" r="1.45" /><circle cx="12" cy="15.2" r="1.45" /><circle cx="15.4" cy="15.2" r="1.45" /></g></>,
  done: <>{SQ}{BAND}{TICK}</>,
  ai: star(1.18),
  session: <>{SQ}{star(0.66, 12, 12.4)}</>,
  note: <><path d={NOTE_PATH} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" /><path d="M20.8 14.6h-3.4a2.8 2.8 0 0 0-2.8 2.8v3.4Z" fill="currentColor" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" /><path d="M7.8 9.2h8.4M7.8 12.6h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  starter: <><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.6" fill="none" stroke="currentColor" strokeWidth="2.1" strokeDasharray="3.4 2.6" /><path d="M12 8.6v6.8M8.6 12h6.8" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" /></>,
  find: <><circle cx="10.8" cy="10.8" r="6.4" fill="none" stroke="currentColor" strokeWidth="2.3" /><path d="M15.6 15.6l4.6 4.6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></>,
  plus: <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />,
  open: <><rect x="3" y="3" width="18" height="18" rx="5.6" fill="currentColor" /><rect x="6.6" y="3.9" width="13.5" height="16.2" rx="4.2" fill={CUT} /><path d="M10.4 14.8l5.2-5.2M11.4 9.4h4.4v4.4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" /></>,
  close: <><path d="M8.6 5.4h9.2a3.4 3.4 0 0 1 3.4 3.4v6.4a3.4 3.4 0 0 1-3.4 3.4H8.6a2 2 0 0 1-1.5-.7L3.4 13.3a2 2 0 0 1 0-2.6l3.7-4.6a2 2 0 0 1 1.5-.7Z" fill="currentColor" /><path d="M11.4 9.6l4.8 4.8M16.2 9.6l-4.8 4.8" stroke={CUT} strokeWidth="2" strokeLinecap="round" /></>,
  settings: <><path d="M8.2 4.2h7.6l3.9 6.6-3.9 7-7.6 0-3.9-7Z" fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" /><circle cx="12" cy="11" r="3" fill={CUT} /></>,
  where: <><path d="M12 21.2s-6.8-6.1-6.8-11.2a6.8 6.8 0 0 1 13.6 0c0 5.1-6.8 11.2-6.8 11.2Z" fill="currentColor" /><circle cx="12" cy="10" r="2.6" fill={CUT} /></>,
  arrange: <><g fill="currentColor"><circle cx="5.2" cy="6.4" r="2" /><circle cx="5.2" cy="12" r="2" /><circle cx="5.2" cy="17.6" r="2" /></g><path d="M10 6.4h9.4M10 12h9.4M10 17.6h9.4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></>,
  customize: <><path d="M13.6 17.8l6-6a2.1 2.1 0 0 0-3-3l-6 6-1.1 4.1Z" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M3.4 8.2h6M3.4 11.6h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  cowork: <><rect x="4.6" y="3.4" width="14.8" height="17.6" rx="4.6" fill="none" stroke="currentColor" strokeWidth="2.1" /><rect x="9.4" y="2.2" width="5.2" height="3" rx="1.5" fill="currentColor" /><circle cx="12" cy="11.4" r="2.6" fill="currentColor" /><path d="M7.6 18.4a4.4 4.4 0 0 1 8.8 0Z" fill="currentColor" /></>,
  social: <><path d="M9.4 19.4S2.8 15.4 2.8 10.4a3.6 3.6 0 0 1 6.6-2 3.6 3.6 0 0 1 6.6 2c0 5-6.6 9-6.6 9Z" fill="currentColor" /><path d="M18.6 13.6l2.4 2.4-2.4 2.4-2.4-2.4Z" fill="currentColor" /><circle cx="19.4" cy="9.6" r="1.6" fill="currentColor" /></>,
  page: <><rect x="5" y="3.2" width="14" height="17.6" rx="4.4" fill="none" stroke="currentColor" strokeWidth="2.1" /><path d="M8.8 9h6.4M8.8 12.4h6.4M8.8 15.8h3.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  loop: <><path d="M8.4 8.2h7.2a3.8 3.8 0 0 1 0 7.6H8.4a3.8 3.8 0 0 1 0-7.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><circle cx="8.4" cy="8.2" r="2.2" fill="currentColor" /></>,
  archive: <><path d="M5.6 6.4h12.8l-1.2 12.2a2.6 2.6 0 0 1-2.6 2.4H9.4a2.6 2.6 0 0 1-2.6-2.4Z" fill="currentColor" /><rect x="4.2" y="3.6" width="15.6" height="3.6" rx="1.8" fill="currentColor" /><path d="M10.2 11.6l3.6 3.6M13.8 11.6l-3.6 3.6" stroke={CUT} strokeWidth="1.9" strokeLinecap="round" /></>,
  sun: <><circle cx="12" cy="12" r="4.4" fill="currentColor" /><g fill="currentColor">{[[12, 3.6], [12, 20.4], [3.6, 12], [20.4, 12], [6.1, 6.1], [17.9, 17.9], [6.1, 17.9], [17.9, 6.1]].map(([x, y]) => <circle key={`${x} ${y}`} cx={x} cy={y} r="1.2" />)}</g></>,
  moon: <path d="M19.4 14.6A7.8 7.8 0 0 1 9.4 4.6a7.8 7.8 0 1 0 10 10Z" fill="currentColor" />,
  back: <path d="M14.6 6.2L8.8 12l5.8 5.8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />,
  more: <g fill="currentColor"><circle cx="6" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="18" cy="12" r="1.9" /></g>,
  mic: <><rect x="8.6" y="3" width="6.8" height="11.4" rx="3.4" fill="currentColor" /><path d="M5.8 11.4a6.2 6.2 0 0 0 12.4 0M12 17.6v3.2" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" /></>,
  // the chatbar's attach, after the orb (#1857): the paperclip redrawn to the set, 2.1 stroke, round ends (drawing: tabs)
  attach: <path d="M16.4 8.2l-6.2 6.2a1.9 1.9 0 0 0 2.7 2.7l6.3-6.3a4 4 0 0 0-5.7-5.7l-6.6 6.6a6 6 0 0 0 8.5 8.5l4.8-4.8" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />,
} satisfies Record<string, ReactNode>;
export type IconName = keyof typeof ICONS;

/** what each icon stands for, one line (the drawing's icon sheet) */
export const ICON_USE: Record<IconName, string> = {
  canvas: "the Canvas", folder: "a folder", note: "a note", starter: "a new session, not started", diary: "the Diary (the day's number inside)", waiting: "waiting on you", done: "done", ai: "an AI", session: "a session",
  find: "find", plus: "new, add", open: "keep as a tab", close: "close, back in place", settings: "Settings", where: "where", arrange: "arrange", customize: "customize",
  cowork: "Cowork", social: "Social", page: "a made page", loop: "an automation, a routine, a plan", archive: "archive", sun: "day", moon: "night", back: "back", more: "more", mic: "talk", attach: "attach",
};

/** one icon; `day` is the Diary's number, drawn in the type's display weight */
export function Icon({ name, small, day, className }: { name: IconName; small?: boolean; day?: number | string; className?: string }) {
  return (
    <svg className={`kp-icon${small ? " kp-icon-s" : ""}${className ? ` ${className}` : ""}`} viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name]}
      {name === "diary" && day != null && <text x="12" y="18.6" textAnchor="middle" className="kp-icon-day">{day}</text>}
    </svg>
  );
}

// ---- the check-in box: a banded square whose band is a lid hinged at its left corner (decisions.md 2026-11-25) ----
const BODY = <path d="M3.2 9.4v5.8a5.6 5.6 0 0 0 5.6 5.6h6.4a5.6 5.6 0 0 0 5.6-5.6V9.4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />;
const LID = <path d="M3.2 9.4V8.8a5.6 5.6 0 0 1 5.6-5.6h6.4a5.6 5.6 0 0 1 5.6 5.6v.6Z" fill="currentColor" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />;
/** what lies in each box: Back to, Kept, Done (while away), Made */
export const BOX_INSIDE = {
  back: <path d="M13.4 11.6l-3 3 3 3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  kept: <path d="M9.4 11.4h5.2v6.4l-2.6-1.8-2.6 1.8Z" fill="currentColor" />,
  done: TICK,
  made: <path d="M8.6 12.6h6.8M8.6 16h4.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
} satisfies Record<string, ReactNode>;
export type BoxInside = keyof typeof BOX_INSIDE;
/** the box drawn: the glyph first so the lid covers it, then the body, then the lid */
export function BoxGlyph({ inside }: { inside: BoxInside }) {
  return (
    <svg className="kp-icon kp-box" viewBox="0 0 24 24" aria-hidden="true">
      <g className="kp-glyph">{BOX_INSIDE[inside]}</g>{BODY}<g className="kp-lid">{LID}</g>
    </svg>
  );
}

/** a running session's ring: the track in the hairline, the run in the good signal, p from 0 to 1 */
export function Progress({ p, small }: { p: number; small?: boolean }) {
  const r = 6, c = 2 * Math.PI * r, run = Math.max(0, Math.min(1, p)) * c;
  return (
    <svg className={`kp-ring${small ? " kp-ring-s" : ""}`} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r={r} fill="none" className="kp-ring-track" strokeWidth="2.4" />
      <circle cx="8" cy="8" r={r} fill="none" className="kp-ring-run" strokeWidth="2.4" strokeLinecap="round" strokeDasharray={`${run.toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 8 8)" />
    </svg>
  );
}
