// Say it and Settings moves (#1031): while you type in Build's talk, the engine reads the words for the look's rows
// (engine/src/cross.ts lookFromWords). If they name some, an offer sits over the box: each row, from → to. Pressed, the
// settings change through the engine, Settings opens on look and the rows move while you watch (Settings.tsx under
// cross); the pill's ring puts them back. Not pressed, nothing changes, and the words are still a message.
import { useEffect } from "react";
import { clearSaid, did, markMoving, sayWords, useCrossState, type Moved } from "./store";

const show = (m: Moved) => (typeof m.to === "number" && m.row === "opacity" ? `${Number(m.from).toFixed(2)} → ${Number(m.to).toFixed(2)}` : `${m.from}${m.row === "text" || m.row === "blur" ? " px" : ""} → ${m.to}${m.row === "text" || m.row === "blur" ? " px" : ""}`);

export function Say({ text, onSet, clear }: { text: string; onSet: (patch: object) => void; clear: () => void }) {
  const { said } = useCrossState();
  useEffect(() => { sayWords(text); }, [text]);
  useEffect(() => () => clearSaid(), []);
  if (!said?.patch) return null;
  const go = () => {
    const back = { look: Object.fromEntries(said.moved.map((m) => [{ text: "text", opacity: "alpha", blur: "blur", base: "color", bubble: "bubble", skin: "skin" }[m.row], m.from])) };
    window.dispatchEvent(new CustomEvent("sol:settings", { detail: "look" }));
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("sol:settings", { detail: "look" })), 120);
    window.setTimeout(() => { markMoving(said.moved); onSet(said.patch!); }, 380);
    clear();
    did(`Settings moved: ${said.moved.map((m) => m.row).join(", ")}`, () => { markMoving(said.moved.map((m) => ({ ...m, from: m.to, to: m.from }))); onSet(back); });
  };
  return (
    <div className="cross-say" data-cross-say>
      <span className="cross-say-h">this moves Settings</span>
      {said.moved.map((m) => <span key={m.row} className="cross-say-row" data-row={m.row}><b>{m.row}</b>{show(m)}</span>)}
      <button type="button" className="cross-say-go" onClick={go}>move them</button>
    </div>
  );
}
