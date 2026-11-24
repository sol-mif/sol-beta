// How Sol worked, drawn (#1615; the contract on #1615 issuecomment-7031944218): one day's runs as the engine recorded
// them (next.traces), each with where it came from, the AI and model, its turns, tokens and cost, the tools and how they
// went, how it ended, its waits and permission asks with their answers, what its records do not say, and the way back
// to the work. It draws only worked.ts's view (an allowlist of words), never a field of the answer itself. Live it asks
// the engine when first drawn; the dev page draws the sample, said as one. Signed: franktsai2008-eng's agent, the face
// half of "How Sol worked" (#1615).
import { useEffect } from "react";
import { D, M, MODE, regionOf, spotFor, useNext } from "../cv/index.ts";
import { view, type Worked as W } from "./worked-read.ts";
import type { Work } from "../work/read.ts";
import { titleOf } from "../plane/layout.ts";   // BR1 (#1615): a session reads as its task, never its AI

/** a session's or a folder's name as the window shows it */
const named = (id: string): string | null => (D.pieces[id] ? (D.pieces[id].kind === "session" ? titleOf(D.pieces[id]) : D.pieces[id].name) : null) ?? D.regions.find((r) => r.id === id || r.id === "h:" + id)?.name
  ?? workNamed(id);
/** a work plan's or an automation's name, from the Work page's own lists (BR1 C, #1615) */
const workNamed = (id: string): string | null => {
  const w = D.work as Work | undefined;
  return w?.plans.find((p) => p.id === id)?.title ?? w?.autos.find((a) => a.id === id)?.name ?? null;
};
/** where a way back leads: a piece or folder the window holds, the diary when it is today's; else no move (said as text) */
function goes(kind: string, id: string): string | null {
  if (kind === "session" || kind === "thing") return spotFor(id) ? id : null;
  if (kind === "place") return regionOf(id) ? id : regionOf("h:" + id) ? "h:" + id : null;
  if (kind === "plan" || kind === "automation") return "page:work";
  if (kind === "day") { const t = new Date(), d = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; return d === id && "toDiary" in M ? "diary" : null; }
  return null;
}
const go = (to: string) => (to === "diary" ? (M as unknown as { toDiary: () => unknown }).toDiary() : to === "page:work" ? M.page("work") : M.goto(to));

export function Worked() {
  const w = useNext((d) => d.worked as W | undefined);
  useEffect(() => { if (!D.worked && MODE === "live") M.stWorked(); }, []);
  const v = view(w, { named, goes });
  return (
    <section className="st-worked" id="st-worked" aria-labelledby="st-worked-h" data-st="worked">
      <h2 id="st-worked-h" className="st-gh">How Sol worked <small>what ran, with what, and how it went</small></h2>
      {v.sample ? <p className="st-say st-wk-sample" data-st="worked-sample">A sample, so you can see how it reads. A real Sol shows what it recorded here.</p> : null}
      {v.days.length > 1 ? <span className="st-seg st-wk-days" role="radiogroup" aria-label="Which day">{v.days.map((d) => <button key={d.day} role="radio" aria-checked={d.on} data-day={d.day} onClick={() => M.stWorked(d.day)}>{d.n}</button>)}</span> : null}
      {v.note ? <div className="st-wk-note" data-st="worked-note"><span className="st-t">{v.note}</span>{v.retry ? <button className="st-btn" onClick={() => M.stWorked(v.day || null)}>Try again</button> : null}</div> : null}
      {v.summary ? <div className="st-wk-sum">{v.summary}</div> : null}
      {v.empty ? <div className="st-wk-note" data-st="worked-empty"><span className="st-t">{v.empty}</span></div> : null}
      {v.runs.map((r) => (
        <div key={r.id} className="st-wk-run" data-run={r.id} data-result={r.result}>
          <div className="st-hh"><b className="st-t">{r.from}</b><span className="st-when">{r.when}</span><span className="st-wk-res">{r.say}</span></div>
          {r.part ? <div className="st-wk-line" data-st="worked-part">{r.part}</div> : null}
          {r.provider ? <div className="st-wk-line">{r.provider.join(" · ")}</div> : null}
          {r.tools.length ? <div className="st-wk-list"><span className="st-wk-l">Tools</span>{r.tools.map((t, i) => <span key={i}>{t}</span>)}</div> : null}
          {r.waits.length ? <div className="st-wk-list"><span className="st-wk-l">Waits</span>{r.waits.map((t, i) => <span key={i}>{t}</span>)}</div> : null}
          {r.permissions.length ? <div className="st-wk-list"><span className="st-wk-l">Asked</span>{r.permissions.map((t, i) => <span key={i}>{t}</span>)}</div> : null}
          <div className="st-wk-line st-t3">{r.steps}</div>
          {r.unknown.length ? <div className="st-wk-unk" data-st="worked-unknown">{r.unknown.map((t) => <span key={t}>{t}</span>)}</div> : null}
          {r.back.length ? <div className="st-hacts">{r.back.map((b) => b.go
            ? <button key={b.label} className="st-tx" onClick={() => go(b.go!)}>Go to {b.label}</button>
            : <span key={b.label} className="st-t3">Back to the work: {b.label}</span>)}</div> : null}
        </div>
      ))}
      {v.gaps.length ? <div className="st-wk-gaps"><span className="st-wk-l">What this history does not hold</span>{v.gaps.map((g, i) => <span key={i}>{g}</span>)}</div> : null}
    </section>
  );
}
