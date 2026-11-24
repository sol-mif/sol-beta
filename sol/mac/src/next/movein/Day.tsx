// The start-up's first screen (BR1, #1615; mine/look/br1/migration.html A, as drawn; Marco 13:45): "What do you do, day to
// day?", asked before any read is shown, so the person's own words are the only thing on it: no suggestion, no category
// made up in advance, nothing picked from a list. Continue keeps what they wrote, as they wrote it, in their You
// (startup.ts dayDone → next.you.day); Skip keeps nothing. Either way the start-up's beats come next, and the read behind
// them never waits for this. ↩ continues, ⇧↩ breaks the line. --k scales the drawing's 1184-wide window to this one, as
// the beats scale theirs. Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { useEffect, useRef, useState } from "react";
import { dayDone } from "./startup-state.ts";

export default function Day() {
  const box = useRef<HTMLDivElement>(null), field = useRef<HTMLTextAreaElement>(null);
  const [words, setWords] = useState("");
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => el.style.setProperty("--k", String(Math.max(1, Math.min(2.2, el.clientWidth / 1184, el.clientHeight / 600))));
    fit();
    addEventListener("resize", fit);
    field.current?.focus({ preventScroll: true });
    return () => removeEventListener("resize", fit);
  }, []);
  const go = (w: string) => dayDone(w);
  return (
    <div ref={box} className="sup-win sup-day" data-startup="day">
      <div className="sd-col">
        <p className="sd-step">Welcome</p>
        <h2 className="sd-h">What do you do, day to day?</h2>
        <p className="sd-sub">In your own words; a sentence is enough. Sol reads this Mac next, and what you say helps it look wider. It never hides what it finds.</p>
        <textarea ref={field} className="sd-field" data-dayfield="1" rows={3} spellCheck value={words} aria-label="What do you do, day to day?"
          onChange={(e) => setWords(e.currentTarget.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); go(words); } }} />
        <p className="sd-note">Nothing here is a category made up in advance. What you write stays as you wrote it, under <b>You told Sol</b>.</p>
        <div className="sd-foot">
          <button type="button" className="sd-btn" data-day-go="1" onClick={() => go(words)}>Continue</button>
          <button type="button" className="sd-ghost" data-day-skip="1" onClick={() => go("")}>Skip</button>
          <span className="sd-r">Stays on this Mac</span>
        </div>
      </div>
    </div>
  );
}
