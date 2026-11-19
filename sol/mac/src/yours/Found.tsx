// Build becomes yours (#1089): the first minute. Build settings › yours, right after the switch goes on: what the
// first read of this machine's sessions found, as up to three rows the Sol user can press. A row is the tool itself
// (the dashed chip), how often and since when, and the ask's opening words (which repeat it is: a title is a rule's
// guess; the words are read on this machine and shown only here). The WHOLE ROW is the press: the caller closes
// settings and stands the offer's versions over the session at once. While the read runs: the pearl and three words.
// Kit only (Pearl, tokens) and the part's Chip.
import { useState, type ReactNode } from "react";
import { Pearl } from "../kit";
import { dim, mute, on } from "../kit/paint";
import { CURVE, SHADE, TYPE as T } from "../kit/tokens";
import { Chip, type ChipBlank } from "./Chip";

/** `count` 1 is an ask sent once ("you asked"): `since` is then the whole middle text, "once · today" */
export type FoundRow = { id: string; title: string; blanks?: ChipBlank[]; count: number; since: string; opening?: string; lead?: ReactNode };
/** the most rows said at once: three is a glance, more is a list to read */
export const FOUND_MAX = 3;
const CSS = `.yo-rise{animation:yo-rise var(--d-reveal) var(--e-reveal) both}@keyframes yo-rise{from{opacity:0;transform:translateY(4px)}}@keyframes yo-breathe{to{opacity:.45;transform:scale(.88)}}@media (prefers-reduced-motion:reduce){.yo-rise,.yo-breathe{animation:none!important}}`;

/** the first read, running: the pearl breathing and "reading 30 days"; after 5 s the caller passes how many asks so far */
export function Reading({ read }: { read?: number }) {
  return (
    <div data-yours-reading style={{ display: "flex", alignItems: "center", gap: 12, height: 48 }}>
      <style>{CSS}</style>
      <span className="yo-breathe" style={{ animation: "yo-breathe 900ms var(--e-move) infinite alternate" }}><Pearl w={18} h={18} r={9} /></span>
      <span style={{ color: dim, fontSize: T.label[0], fontVariantNumeric: "tabular-nums" }}>reading 30 days{read ? ` · ${read} asks` : ""}</span>
    </div>
  );
}

/** what they repeat, most repeated first; `faded` for the offers passed (the same rows, dimmer) */
export function FoundRows({ rows, onOpen, faded }: { rows: FoundRow[]; onOpen: (id: string) => void; faded?: boolean }) {
  const [over, setOver] = useState(-1);
  return (
    <div data-yours-found-rows style={{ opacity: faded ? 0.6 : 1 }}>
      <style>{CSS}</style>
      {rows.slice(0, FOUND_MAX).map((r, i) => (
        <div key={r.id} role="button" tabIndex={0} data-yours-found-row={r.id} className="yo-rise" aria-label={r.count < 2 ? `${r.title}, asked ${r.since}: see it made` : `${r.title}, ${r.count} times since ${r.since}: see it made`}
          onPointerEnter={() => setOver(i)} onPointerLeave={() => setOver(-1)} onFocus={() => setOver(i)} onBlur={() => setOver(-1)}
          onClick={() => onOpen(r.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onOpen(r.id); } }}
          style={{ display: "flex", alignItems: "center", gap: 12, height: 48, margin: "0 -8px", padding: "0 8px", borderRadius: CURVE.radius.row, cursor: "pointer", outline: "none",
            background: over === i ? on(SHADE.on.line) : undefined, animationDelay: `${i * 80}ms` }}>
          {/* the chip is a picture here, not a second press: the row is the press */}
          <span style={{ pointerEvents: "none", flex: "none", display: "inline-flex" }}><Chip title={r.title} blanks={r.blanks} lead={r.lead} /></span>
          <span style={{ flex: "none", color: dim, fontSize: T.label[0], fontVariantNumeric: "tabular-nums" }}>{r.count < 2 ? r.since : `${r.count > 99 ? "99+" : r.count}× · since ${r.since}`}</span>
          <span style={{ flex: 1, minWidth: 0, color: mute, fontSize: T.label[0], overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.opening}</span>
          <svg width={8} height={12} aria-hidden style={{ flex: "none" }}><path d="M1.5 1.5l5 4.5-5 4.5" fill="none" stroke={on(SHADE.on.mute)} strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      ))}
    </div>
  );
}
