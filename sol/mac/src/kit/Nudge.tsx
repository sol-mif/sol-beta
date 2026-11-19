// Nudge (#692, tactile.html): don't rewrite, push. Three pushes, always the same three: shorter, warmer, like this.
// "like this" takes an example: pasted into the box it opens, picked from the ones offered (a letter he liked), or
// dropped onto the pushes as text. What is pushed becomes a preference in the folder; the one who mounts it says so.
import { useState } from "react";
import { Glass } from "./Glass";
import { inkVars } from "./Ink";
import { Pill } from "./Pill";
import { dim, ink, label, TYPE } from "./paint";
import { CURVE, TYPE as T } from "./tokens";
import "./moves.css";

export type Push = "shorter" | "warmer" | "like this";
export const PUSHES: Push[] = ["shorter", "warmer", "like this"];
export type Example = { name: string; text: string };

export function Nudge({ onPush, busy = null, examples = [], said, liking = false }: {
  onPush: (p: Push, example?: string) => void;
  /** the push being worked (its run is writing the new version) */
  busy?: Push | null;
  /** examples to pick for "like this" (a letter he liked, a note he wrote) */
  examples?: Example[];
  /** a line under the pushes: what the last push left (the preference it wrote) */
  said?: string;
  /** "like this" starts open (a sheet; a draft he dropped an example near) */
  liking?: boolean;
}) {
  const [like, setLike] = useState(liking), [text, setText] = useState(""), [over, setOver] = useState(false);
  const pick = (i: number) => { const p = PUSHES[i]; if (busy) return; if (p === "like this") { setLike((v) => !v); return; } setLike(false); onPush(p); };
  const give = (ex: string) => { if (!ex.trim() || busy) return; onPush("like this", ex.trim()); setLike(false); setText(""); };
  return (
    <div className="nudge" data-nudge data-busy={busy ?? undefined} style={{ ...inkVars(), display: "flex", flexDirection: "column", gap: 8, outline: over ? `1px dashed ${dim}` : undefined, outlineOffset: 4, borderRadius: CURVE.radius.row }}
      onDragOver={(ev) => { ev.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(ev) => { ev.preventDefault(); setOver(false); give(ev.dataTransfer.getData("text/plain")); }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Pill words={PUSHES} picked={busy ? PUSHES.indexOf(busy) : like ? 2 : -1} h={28} onPick={pick} />
        {busy && <span style={{ ...label }} data-nudge-busy>writing it {busy === "like this" ? "like the example" : busy}…</span>}
      </div>
      {like && !busy && (
        <div className="k-pop" data-like style={{ position: "relative", isolation: "isolate", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <Glass r={CURVE.radius.field} step="box" />
          <textarea data-like-text value={text} rows={3} placeholder="paste an example you liked, or drop one here" onChange={(ev) => setText(ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); give(text); } if (ev.key === "Escape") setLike(false); }}
            style={{ ...TYPE, background: "transparent", border: 0, outline: "none", resize: "none", color: ink, padding: "2px 4px" }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {examples.map((e) => <button key={e.name} data-example={e.name} onClick={() => give(e.text)} style={{ position: "relative", isolation: "isolate", border: 0, background: "transparent", color: ink, font: "inherit", fontSize: T.pill[0], padding: "4px 10px", cursor: "pointer" }}><Glass r={CURVE.radius.row} step="raised" surface="raised" />{e.name}</button>)}
            <button data-like-go disabled={!text.trim()} onClick={() => give(text)} style={{ marginLeft: "auto", border: 0, background: "transparent", color: text.trim() ? ink : dim, font: "inherit", fontSize: T.pill[0], cursor: text.trim() ? "pointer" : "default" }}>like this ⌘↵</button>
          </div>
        </div>
      )}
      {said && <div style={{ ...label }} data-nudge-said>{said}</div>}
    </div>
  );
}
