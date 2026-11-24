// The move-in's small parts in the other slices' views (round 6 · M1, #1615; merge/movein.js): its ask on Needs you, the
// Moved-in card under the Diary's headline, and "Add your files and AI chats" in Settings › How your AIs work. Each reads the move-in's
// state and presses M; movein/extra.ts hands them to their views' seams. Signed: marcocyl04-ux's agent, port slice 11 (#1615).
import { M, MODE, useNext } from "../cv/core.ts";
import { tally, tallyWords, type Unsure } from "./data.ts";
import { DONE, here, personOf } from "./state.ts";
import { askRead, keptN } from "./live.ts";
import "./movein.css";

/** the ask's glyph (merge/movein.js ASK_G) */
export function AskGlyph() {
  return <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 5.8v5.2" /><circle cx="10" cy="14" r=".6" fill="currentColor" /></svg>;
}

/** an unsure row left for later, on Needs you: its question and its two answers (the people's press answers it, data-said) */
export function AskRow({ u, focus }: { u: Unsure; focus: boolean }) {
  return (
    <div className={`pnrow r6-ask mv-ask${focus ? " pfocus" : ""}`} data-mvask={u.id}>
      <span className="mv-askg" role="img" aria-label="Asks you"><AskGlyph /></span>
      <div className="t">{u.q}<small>From your move-in · kept as it is until you answer</small></div>
      <span className="where">Moving in</span>
      {u.opts.map(([l], i) => <button key={l} className={`mini${i ? "" : " pri"}`} data-said={l}>{l}</button>)}
    </div>
  );
}

/** the Moved-in card on the canvas, under the headline, once the person has moved in */
export function Seen(_p: { band: string }) {
  useNext(() => 0);
  const c = DONE[here()], p = personOf(here());
  if (!c || !c.seen || !p) return null;
  const t = tally(p, c);
  return (
    <div className="mv-seen" data-r6seen="movein">
      <span className="mv-aura" />
      <span>{c.skipped
        ? <><b>Moved in as it was.</b> {t.kept} things came along untouched. Look them over whenever you like.</>
        : <><b>{p.moved ? "Moved in" : "Home made"}</b> · just now. {tallyWords(t)}. Each one is a line in the Diary, with its undo.</>}</span>
      <button className="mv-btn ghost" data-mvagain="1" onClick={(e) => { e.stopPropagation(); M.move_in(); }}>{c.skipped ? "Look them over" : "Change any of it"}</button>
    </div>
  );
}

/** "Add your files and AI chats" in Settings › How your AIs work: live, Claude Code, Codex and Sol's folders read again and the
 *  screen opened on the answer; on the fixture the screen again, with the choices as they stand */
export function Again() {
  useNext(() => 0);
  const p = personOf(here()), c = DONE[here()];
  if (!p && MODE !== "live") return null;
  const n = keptN(p, c);   // one number: the kept folders, as the canvas and the sidebar count them (BR1 hold H4)
  const sub = n != null ? `${n} ${n === 1 ? "folder" : "folders"} kept · read Claude Code, Codex and your folders again` : "Read what Claude Code, Codex and your folders hold on this Mac";
  // Settings stays open under the screen (it hides the shell while up), so its Back without saving and Esc go back one
  // step, to Settings; Keep these closes Settings with it, onto the canvas (BR1 hold, try 5: Back closed Settings too)
  const go = () => { if (MODE === "live") askRead(true); else M.move_in(); };
  return (
    <div className="st-knob st-go">
      <button className="st-head" data-p="movein" aria-label="Add your files and AI chats" aria-description={sub} onClick={go}>
        <span className="st-ht"><b>Add your files and AI chats</b><small className="st-who">{sub}</small></span><span className="st-cur">›</span>
      </button>
    </div>
  );
}
