// Shots (#696; v4 §4, #738): stills at their real ratio on black, each with keep / cut / later on hover; a kept one wears
// the pearl, a cut one fades. The question they are shown for sits under them, with how many are picked. The block waits
// on you until every still is picked; then it is live again.
import { useState, type ReactNode } from "react";
import type { KindProps, Pick, StillsBody } from "./types";
import { ENGINE_HTTP } from "../../engine";

/** a still kept on the engine's machine (a browser block's shot, #699) comes by the engine's image door */
const srcOf = (s: string) => (s.startsWith("/") ? `${ENGINE_HTTP}/pane-image?path=${encodeURIComponent(s)}` : s);

const PICKS: Pick[] = ["keep", "cut", "later"];

export function Stills({ b, body, act }: KindProps<StillsBody>) {
  const stills = body?.stills ?? [];
  const pick = (i: number, p: Pick) => {
    const next = stills.map((s, j) => (j === i ? { ...s, pick: p } : s));
    const all = next.every((s) => s.pick);
    act({ body: { ...body, stills: next }, ...(all && b.state === "waits" ? { state: "live" as const } : {}) }, `${stills[i].name}: ${p} · you${all ? " · all picked" : ""}`);
  };
  const picked = stills.filter((s) => s.pick).length;
  return (
    <div className="st-shots">
      <div className="st-stills">
        {stills.map((s, i) => (
          <div key={i} className={`st-still ${s.pick ?? ""}`} data-part={`still ${i + 1}`}>
            <Still src={s.src} name={s.name}>
              <span className="st-picks">{PICKS.map((p) => <button key={p} className={s.pick === p ? "on" : ""} onClick={(ev) => { ev.stopPropagation(); pick(i, p); }}>{p}</button>)}</span>
            </Still>
            <span>{s.name}</span>
          </div>
        ))}
      </div>
      {(body?.ask || b.state === "waits") && stills.length > 0 && (
        <div className="st-ask" data-part="the question">{body?.ask ?? "keep, cut or later, each"}<small>{picked} of {stills.length} picked</small></div>
      )}
    </div>
  );
}

/** a still on black at its own ratio: the frame takes the picture's shape once it has loaded (4 : 3 until then) */
function Still({ src, name, children }: { src?: string; name: string; children: ReactNode }) {
  const [ratio, setRatio] = useState<string | undefined>(undefined);
  return (
    <div className="st-frame" style={ratio ? { aspectRatio: ratio } : undefined}>
      {src ? <img src={srcOf(src)} alt={name} onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth && i.naturalHeight) setRatio(`${i.naturalWidth} / ${i.naturalHeight}`); }} /> : <i className="st-stillmark" aria-hidden />}
      {children}
    </div>
  );
}
