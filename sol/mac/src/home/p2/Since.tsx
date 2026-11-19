// Since you looked (#692, pieces/since.mjs), slice E of the pass 2 build: the first tile. Acts Sol took for him, each
// with undo where undo is real; runs that finished, each opening what it made; questions with one-tap answers; Build
// sessions waiting on him (read from his own engine by the stand-in, never written), each opening that session the way
// the side does. Absent when nothing is new and nothing waits. "Since" is his last look at Home: this part tells the
// engine when a look starts (the main view shown with the window's focus) and when it ends (home.since.seen).
import { useEffect, useState } from "react";
import type { Metas } from "../meta";
import type { Home2Api, Place, SinceLine } from "./pass2";
import { Ring } from "../../kit";
import { Lift } from "../Side";
import "./since.css";

export const meta = {
  Since: {
    job: "the first tile: what Sol did (with undo), runs that finished, what needs you, Build's waiting sessions in the same list",
    flow: "answer",
    states: ["absent: nothing new and nothing waits", "lines", "an act undone, struck through", "an undo that can no longer be done, said on its line", "a Build session waiting"],
    keys: [
      { press: "click undo on an act", does: "undoes it; the line strikes through and says what it put back (home.since.undo)", goal: "answer" },
      { press: "click an answer on a question", does: "answers the sticky; the line goes (home.since.answer)", goal: "answer" },
      { press: "click open on a finished run", does: "opens the folder where what it made lives", opens: "FolderView" },
      { press: "click open on a Build line", does: "opens that session in the window, as the side does (sol:open-work)" },
    ],
    listens: ["home.state › since, sinceSeen", "the window's focus and visibility (home.since.seen)"],
  },
} satisfies Metas;

const RING = 16;

function Mark({ l }: { l: SinceLine }) {
  if (l.kind === "act" || l.kind === "run") return <span className={`sy-ring ${l.undone ? "off" : "done"}`} aria-hidden><Ring value={1} size={RING} flat /></span>;
  return <span className="sy-ring you" aria-hidden />;
}

export function Since({ h, setPlace }: { h: Home2Api; setPlace: (p: Place) => void }) {
  // a look starts when the main view is shown with the window's focus, and ends when either goes
  useEffect(() => {
    if (!h.up) return;
    const seen = (leaving: boolean) => h.send({ type: "home.since.seen", at: new Date().toISOString(), ...(leaving ? { leaving: true } : {}) });
    let looking = false;
    const look = () => { const now = document.hasFocus() && document.visibilityState === "visible"; if (now !== looking) { looking = now; seen(!now); } };
    look();
    const vis = () => look();
    window.addEventListener("focus", look); window.addEventListener("blur", look); document.addEventListener("visibilitychange", vis);
    return () => { window.removeEventListener("focus", look); window.removeEventListener("blur", look); document.removeEventListener("visibilitychange", vis); if (looking) seen(true); };
  }, [h.up]); // eslint-disable-line react-hooks/exhaustive-deps

  // what this face already answered (gone at once, before the engine's state comes back) and undo's own words
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [said, setSaid] = useState<Record<string, string>>({});
  const all = h.st?.since ?? [];
  useEffect(() => { setGone((g) => (g.size && ![...g].some((id) => all.some((l) => l.id === id)) ? new Set() : g)); }, [all]);
  const rows = all.filter((l) => !gone.has(l.id));
  const [unfold, setUnfold] = useState(false);
  if (!rows.length) return null;

  const undo = async (l: SinceLine) => {
    const r = await h.ask<{ ok: boolean; why?: string; text?: string }>({ type: "home.since.undo", id: l.id });
    if (!r.ok) setSaid((s) => ({ ...s, [l.id]: r.why ?? "can no longer be undone" }));
  };
  const answer = (l: SinceLine, option: string) => { setGone((g) => new Set(g).add(l.id)); h.send({ type: "home.since.answer", id: l.id, option }); };
  const openBuild = (l: SinceLine) => { if (l.session) window.dispatchEvent(new CustomEvent("sol:open-work", { detail: l.session })); };
  const openRun = (l: SinceLine) => { if (l.folder) setPlace({ at: "folder", id: l.folder }); };
  const n = rows.filter((l) => !l.undone).length;
  // six lines at a time: what waits comes first in the list, so the fold never hides a question; the rest on one press
  const SHOW = 6;
  const shown = unfold || rows.length <= SHOW ? rows : rows.slice(0, SHOW);

  return (
    <section className="p2-tile p2-since sy" data-p2="since" aria-label="since you looked">
      <h3 className="sy-k">since you looked · {n} {n === 1 ? "thing" : "things"}</h3>
      <ul className="sy-list">
        {shown.map((l) => (
          <li key={l.id} className={`sy-line k-${l.kind}${l.undone ? " undone" : ""}`} data-since={l.kind} data-id={l.id} data-part={`since › ${l.text.slice(0, 40)}`}>
            <Mark l={l} />
            <span className="sy-t" title={l.text}>{l.text}</span>
            {(said[l.id] || l.act) && <small className={`sy-act${said[l.id] ? " no" : ""}`}>{said[l.id] ?? l.act}</small>}
            <span className="sy-opts">
              {(l.kind === "act" || l.kind === "run") && l.undo && !said[l.id] && <button className="sy-opt" onClick={() => void undo(l)}>undo<Lift /></button>}
              {l.kind === "run" && l.folder && <button className="sy-opt" onClick={() => openRun(l)}>open<Lift /></button>}
              {l.kind === "ask" && (l.options ?? []).map((o, i) => <button key={o} className={`sy-opt${i === 0 ? " first" : ""}`} onClick={() => answer(l, o)}>{o}<Lift /></button>)}
              {l.kind === "build" && <button className="sy-opt" onClick={() => openBuild(l)}>open<Lift /></button>}
            </span>
          </li>
        ))}
      </ul>
      {rows.length > SHOW && <button className="sy-more" onClick={() => setUnfold((v) => !v)}>{unfold ? "fewer" : `and ${rows.length - SHOW} more`}<Lift /></button>}
    </section>
  );
}
