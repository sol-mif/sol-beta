// A later mode's first visit, drawn (#1088, the designer's): what the person sees when they open Build or Cowork for
// the first time after the one onboarding. No paragraph and no "got it": the jelly's one line, then the things this
// mode already has from their Home, each one a piece to press. Pressing a thing starts there; that is the one press.
//   build   the projects found (newest first): press one and Build opens on it
//   cowork  the teams they already push to: press one and the first project is made with it
//   under them, quiet, what comes along from Home: the screens to scale, the AI tools, and the level (it can be
//   dragged right here; it is the same level as Home's)
//   `likely` is the thing Jev would start with: whole pearl when it is sure (≥ 0.7; ↵ starts it), a dashed hairline
//   when it half-believes (≥ 0.45), nothing under that.
// Visit.tsx (the builder's) reads the record and passes it in; this file only draws and reports the press.
// The card wears Home's token scope (`.fh`, folders.css): Build and Cowork do not define --on as "r,g,b", --pearl,
// --dim or --pour, and without them the tiles have no shape (seen in the builder's stills of 02:23).
import { useEffect, useRef, useState } from "react";
import { Glyph } from "../kit";
import { Body } from "../Body";
import { Screens, type Scr } from "./Folder";
import { Level } from "./Yours";
import type { Hands } from "./record";
import "./visit.css";

export type VisitThing = { id: string; name: string; under?: string };
const N = ["No", "One", "Two", "Three", "Four", "Five", "Six"];
const two = (s: string) => { const cut = /[a-z][-\s]?([A-Z])|[-\s]([a-z])/.exec(s); return (s[0]?.toUpperCase() ?? "·") + (cut?.[1] ?? cut?.[2] ?? s[1] ?? "").toLowerCase(); };

export function VisitCard({ where, name, things, likely, sure, screens, ai, hands, onHands, onStart, onLater, w = 620, jelly = true }: {
  where: "build" | "cowork"; name: string; things: readonly VisitThing[]; likely?: string | null; sure?: boolean;
  screens: readonly Scr[]; ai: readonly { name: string; signed: boolean }[]; hands: Hands; onHands: (h: Hands) => void;
  onStart: (id: string | null) => void; onLater: () => void; w?: number; jelly?: boolean;   // false when the mode's own jelly is on screen: one jelly says the line, not two
}) {
  const [went, setWent] = useState<string | null | undefined>(undefined);   // the thing pressed; the card folds away after it
  const first = name.split(/\s+/)[0], n = things.length, card = useRef<HTMLDivElement>(null);
  const say = (t: string, name = false) => (first ? `${first}, ${t}` : name ? t : t[0].toUpperCase() + t.slice(1));
  const count = (N[n] ?? String(n)).toLowerCase();
  const line = where === "build"
    ? (n === 0 ? say("your tools are already here.") : n === 1 ? say(`${things[0].name} is already here.`, true) : say(`${count} projects are already here.`))
    : (n === 0 ? say("your agent is already here.") : say(`you already work with ${n === 1 ? things[0].name : `${count} teams`}.`));
  const start = (id: string | null) => { if (went !== undefined) return; setWent(id); window.setTimeout(() => onStart(id), 260); };
  useEffect(() => { (card.current?.querySelector(".obv-thing.sure, .obv-go") as HTMLElement | null)?.focus({ preventScroll: true }); }, []);
  return (
    <div ref={card} className={`fh obv ${went !== undefined ? "went" : ""}`} data-visit={where} style={{ width: w }} onKeyDown={(e) => { if (e.key === "Escape") onLater(); }}>
      <div className="obv-head">
        {jelly && <Body size={28} state="settled" />}
        <div className="t-title">{line.replace(/-/g, "\u2011")}</div>
        <button type="button" className="obv-later" onClick={onLater}>not now</button>
      </div>
      {n > 0 ? (
        <div className="obv-things">
          {things.slice(0, 4).map((t, i) => (
            <button key={t.id} type="button" className={`obv-thing ${t.id === likely ? (sure ? "sure" : "ghost") : ""} ${went === t.id ? "on" : ""}`} data-thing={t.id} style={{ animationDelay: `${80 + i * 60}ms` }} onClick={() => start(t.id)}>
              {where === "build" ? <span className="mark"><Glyph name="github" hover /></span> : <span className="mark round">{two(t.name)}</span>}
              <b>{t.name}</b>
              {t.under && <span>{t.under}</span>}
            </button>
          ))}
          {n > 4 && <span className="obv-more">+{n - 4}</span>}
        </div>
      ) : (
        <button type="button" className="obv-thing sure obv-go" onClick={() => start(null)}><b>{where === "build" ? "start something" : "make a project"}</b></button>
      )}
      <div className="obv-with" aria-label="from your Home">
        <span className="t-label">from your Home</span>
        {screens.length > 0 && <Screens screens={screens} h={20} />}
        {ai.length > 0 && <div className="obv-ai">{ai.slice(0, 4).map((a) => <i key={a.name} className={a.signed ? "" : "obv-ask"} title={a.signed ? a.name : `${a.name}: not signed in`}>{two(a.name)}</i>)}</div>}
        <Level value={hands} onChange={onHands} w={Math.max(120, Math.min(220, w - 420))} />
      </div>
    </div>
  );
}
