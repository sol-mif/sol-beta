// The because, the dev page (sol/mac/because.html; BR1, #1615): Ana's things Sol did, each with its because, on the
// fixture person (fixture.ts), never on an engine. A line with no why, and one whose fact was forgotten, draw none.
// The fixer here answers as the engine's next.you.fact.fix will (a preview, then Keep or Back).
//   #open=<id>   unfolds that line's because under it, for a still
//   &ways        its first fact's Edit this fact pressed: the ways to answer, for a still
//   &nofix       no fixer held: the because as a real Sol shows it until the engine has the fix (That's wrong, a forget)
//   &nosame      no "Same for these N?": as a real Sol is until it knows the things shown a fact for the same reason
// "Same for these N?" here counts the page's other lines that name one of the same facts. The two placements (nested,
// shelved) use the page's placer: the shelf is fixture.ts's SHELF, and a take asks "Same for these 2?" of the rest.
//   &noplace     no placer held: a placement says where and why, and offers nothing (a real Sol before the engine)
//   &only        the #open line alone (open=head: the folder head alone), so a check of it is not a scrolled page
// Served by Vite in dev only, never in a build. Signed: marcocyl04-ux's agent (builder F).
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../palette.css";
import "../../kit/next.css";
import { OverlayRoot } from "../Overlay.tsx";
import type { Known } from "../known.ts";
import Because, { type Forget, type Same } from "./Because.tsx";
import type { Fixer } from "./fix.ts";
import { PLACED_W, placedOf, type Placer } from "./place.ts";
import { FrameLine, frame } from "../frame.tsx";
import { hooks } from "../cv/index.ts";
import { ANA, DID, SHELF, previewOf } from "./fixture.ts";
import "./dev.css";
import "../notes/notes.css";
import "../folder/placed.css";

const q = new URLSearchParams(location.hash.slice(1));

/** the page's other lines that name one of this line's facts: the things shown it for the same reason */
const sameAs = (id: string): Same => () => {
  const d = DID.find((x) => x.id === id), n = d?.why ? DID.filter((o) => o.id !== id && o.why?.some((k) => d.why!.includes(k))).length : 0;
  return n ? { n, keep: () => {} } : null;
};

function Page() {
  const [all, setAll] = useState(ANA);
  const pending = useRef(new Map<string, (a: Known[]) => Known[]>());
  const forget: Forget = (k) => { const f = all.find((x) => x.k === k); if (!f) return null; setAll((a) => a.filter((x) => x.k !== k)); return () => setAll((a) => (a.some((x) => x.k === k) ? a : [...a, f])); };
  const fixer: Fixer = {
    async fix({ k, how, now }) {
      if (!all.some((x) => x.k === k)) return null;
      await new Promise((r) => setTimeout(r, 250));   // the engine works it out
      const token = `t${pending.current.size + 1}:${k}`;
      pending.current.set(token, (a) => how === "not-true" ? a.filter((x) => x.k !== k)
        : how === "not-anymore" ? a.map((x) => (x.k === k ? { ...x, fact: `${now}.`, source: "you said", at: new Date().toISOString() } : x)) : a);
      return { changes: previewOf(k, how, now), token };
    },
    async settle(token, keep) { const f = pending.current.get(token); pending.current.delete(token); if (keep && f) setAll(f); },
  };
  const shelf = useRef(new Set(SHELF));
  const placer: Placer = {
    onShelf: (f) => shelf.current.has(f),
    async right() { await new Promise((r) => setTimeout(r, 150)); return true; },
    async sameOf(k, folder) {
      const these = [...shelf.current].filter((f) => f !== folder).map((f) => ({ k: `placed:${f}`, place: f, fact: `Sol archived ${f.split("/").pop()}` }));
      return placedOf(k) && shelf.current.has(folder) && these.length ? { reason: k, n: these.length, these } : null;
    },
    async take(folder, name) { if (!shelf.current.delete(folder)) return null; return () => { shelf.current.add(folder); frame.say(`${name} is archived again`); }; },
    async same({ reach, to }) { if (reach !== "here") for (const k of to) shelf.current.delete(placedOf(k) ?? ""); return true; },
  };
  return (
    <main className="bcd">
      <h1>Why Sol did things</h1>
      {DID.filter((d) => !q.has("only") || d.id === q.get("open")).map((d) => (
        <section key={d.id} className="bcd-did" data-did={d.id}>
          <small>{d.where}</small>
          <p>{d.what} <Because ks={d.why} all={all} forget={forget} fixer={q.has("nofix") ? null : fixer} placer={q.has("noplace") ? null : placer} here={d.here}
            same={q.has("nosame") || d.why?.some((k) => placedOf(k)) ? undefined : sameAs(d.id)} words={d.why?.some((k) => placedOf(k)) ? PLACED_W : undefined} /></p>
        </section>
      ))}
      {/* the opened folder's head, as folder/Placed.tsx mounts it: the fact unfolds on its own line under the row */}
      {q.has("only") && q.get("open") !== "head" ? null : <section className="bcd-did" data-did="head">
        <div className="fv-head"><span className="nt-fc" /><h1>figures</h1><span className="fv-sum">no sessions yet</span>
          <span className="fv-placed"><Because ks={["placed:w:/u/ana/thesis/figures"]} all={all} placer={q.has("noplace") ? null : placer} words={PLACED_W} here="w:/u/ana/thesis/figures" /></span>
          <button>Close this folder</button></div>
      </section>}
      <FrameLine />
      <OverlayRoot />
    </main>
  );
}

document.body.setAttribute("data-face", "next");
hooks.flash = (t) => frame.say(t);   // what was done, said by the frame as in the window
createRoot(document.getElementById("root")!).render(<Page />);
const open = q.get("open");
if (open) setTimeout(() => (document.querySelector(`[data-did="${open}"] .bc`) as HTMLButtonElement | null)?.click(), 300);
if (open && q.has("ways")) setTimeout(() => (document.querySelector(".bc-open [data-fix]") as HTMLButtonElement | null)?.click(), 600);
