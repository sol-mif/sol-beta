// Settings › Privacy (BR1, #1615; mine/look/br1/because.html scene 4): the ledger, only for trust. What Sol may read,
// then everything Sol has learned, found by words, each line with where it came from and Forget when the engine holds
// it (with Back). The rules are privacy.ts; the facts are known.ts, the same lines every screen says. Nothing on the
// canvas or in the sidebar leads here. Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import { useState } from "react";
import { M } from "../cv/index.ts";
import { knownEngine, sourceSet } from "../cv/wire/because.ts";
import { youNow } from "../cv/wire/you.ts";
import Circle, { Gone } from "../movein/you/Circle.tsx";
import { known, type Known } from "../known.ts";
import type { Source } from "../movein/you/types.ts";
import { READS, byPlace, forgot, ledger, placeName, reads } from "./privacy-state.ts";
import type { Ui, World } from "./model.ts";

const FADE = 1000;   // ms a forgotten line takes to fade and fold (settings.css pv-leave)

export function Privacy({ w, u }: { w: World; u: Ui }) {
  const P = w.prefs, you = youNow();
  const all = known("you", { you, engine: knownEngine(), learned: P.learned });
  const [q, setQ] = useState("");
  // a line just forgotten, with its Back: what is forgotten is the one store's (known() holds it out by its fix line),
  // this only says the one line and its Back here, which writes the show line
  const [gone, setGone] = useState<{ f: Known; back: () => void } | null>(null);
  // a source just turned off, with what Sol forgot from it (taken before the switch: its lines fade out of the ledger and
  // the count drops) and its Back, which brings them in again; the ones turned on, read from the next look (the engine
  // names them in no list until then, so the row stays here)
  const [offed, setOffed] = useState<{ source: Source; left: Known[]; back: (() => Promise<void>) | null } | null>(null);
  const [returned, setReturned] = useState<ReadonlySet<string>>(new Set());
  const [held, setHeld] = useState<Known[] | null>(null);
  const [onNext, setOnNext] = useState<Source[]>([]);
  const [busy, setBusy] = useState<Source | null>(null);
  const listed = reads(you), rows = [...listed, ...onNext.filter((s) => !listed.some((r) => r.source === s)).map((s) => ({ source: s, name: READS[s], on: true, can: true }))]
    .map((r) => (onNext.includes(r.source) ? { ...r, on: true } : r));
  const flip = async (s: Source, on: boolean) => {
    setBusy(s);
    // the ledger as it stood, held while the switch is answered and its lines fade (the engine's fresh list comes first)
    const left = on ? all.filter((f) => f.from === s) : [];
    if (on) setHeld(all);
    const r = await sourceSet(s, !on);
    setBusy(null);
    if (!r) { setHeld(null); return; }
    if (on) { setOnNext((xs) => xs.filter((x) => x !== s)); setReturned(new Set()); setOffed({ source: s, left, back: r.back }); setTimeout(() => setHeld(null), FADE); }
    else { setOnNext((xs) => [...new Set([...xs, s])]); setOffed(null); }
  };
  const name = (p: string) => placeName(you, p);
  const leaving = new Set(offed?.left.map((f) => f.k)), now = new Set(all.map((f) => f.k));
  const shown = held ? [...held.filter((f) => now.has(f.k) || leaving.has(f.k)), ...all.filter((f) => !held.some((h) => h.k === f.k))] : all;
  const kept = shown.filter((f) => f.k !== gone?.f.k), n = kept.filter((f) => !leaving.has(f.k)).length, list = ledger(kept, q, name);
  const back = () => { const b = offed?.back; if (!offed || !b) return; setReturned(new Set(offed.left.map((f) => f.k))); setOffed(null); void b(); };
  const line = (f: Known) => u.edit != null && u.edit === f.k
    ? <div key={f.k} className="st-fact"><div className="st-edit"><input id="st-edit-i" defaultValue={f.fact} aria-label="Edit this line" autoFocus onKeyDown={(e) => { if (e.key === "Enter") M.stAct("l-save", f.k, e.currentTarget.value); }} /><button className="st-btn pri" onClick={() => M.stAct("l-save", f.k, (document.getElementById("st-edit-i") as HTMLInputElement | null)?.value ?? "")}>Save</button><button className="st-btn" onClick={() => M.stAct("l-x")}>Cancel</button></div></div>
    : <div key={f.k} className={`st-fact${leaving.has(f.k) ? " pv-leave" : returned.has(f.k) ? " pv-back" : ""}`} data-learned={f.k} aria-hidden={leaving.has(f.k) || undefined}>
      <Circle size="line" fact={f} where={f.place ? name(f.place) : "about you, everywhere"} onForget={(x) => { const r = M.stAct("k-rm", x.k); if (r.ok) setGone({ f: x, back: r.undo }); }}>
        {/* a home.sources line: live it can become a sentence of the person's rules; on the fixture, edited */}
        {f.k.startsWith("learned:") ? <span className="st-do">{w.live ? <button className="st-tx" onClick={() => M.stAct("l-keep", f.k)}>Make it a rule</button> : <button className="st-tx" onClick={() => M.stAct("l-edit", f.k)}>Edit</button>}</span> : null}
      </Circle></div>;
  return (
    <div className="st-page" data-st="privacy">
      <h1>Privacy</h1>
      {rows.length ? <>
        <h2 className="st-gh" id="st-reads">What Sol may read <small>{rows.some((r) => r.can) ? "Off means Sol stops reading it and forgets what it learned from it." : "what Sol read the last time it looked"}</small></h2>
        <div className="st-learn">
          {offed ? <div className="st-fact" role="status" data-forgot={offed.left.length}><span className="st-t">{forgot(READS[offed.source], offed.left)}</span>{offed.back ? <span className="st-do"><button className="st-tx" onClick={back}>Back</button></span> : null}</div> : null}
          {rows.map((r) => r.can
            ? <div key={r.source} className="st-toggle" data-read={r.source}><span className="st-t"><b>{r.name}</b>{onNext.includes(r.source) ? <span className="st-why">From the next time Sol looks</span> : null}</span><button className="st-switch" role="switch" aria-checked={r.on} aria-label={r.name} disabled={busy === r.source} onClick={() => void flip(r.source, r.on)} /></div>
            : <div key={r.source} className="st-row" data-read={r.source}><span className="st-t"><b>{r.name}</b></span><span className={`st-state${r.on ? "" : " off"}`}>{r.on ? "Read" : "Not read, as you said"}</span></div>)}
        </div>
      </> : null}
      <h2 className="st-gh" id="st-learned">Everything Sol has learned · <span key={n} className="pv-n">{n}</span></h2>
      {kept.length || gone ? <div className="st-row2"><input type="search" value={q} placeholder="Find what Sol learned" aria-label="Find what Sol learned" onChange={(e) => setQ(e.currentTarget.value)} /></div> : null}
      <div className="st-page" data-ledger>
        {gone ? <div className="st-learn"><div className="st-fact"><Gone fact={gone.f} onBack={() => { gone.back(); setGone(null); }} /></div></div> : null}
        {!all.length && !gone ? <div className="st-learn"><div className="st-fact"><span className="st-t st-t3">Nothing yet. A line comes here when Sol learns something, and you can forget it.</span></div></div> : null}
        {kept.length && !list.length ? <div className="st-learn"><div className="st-fact"><span className="st-t st-t3">Nothing Sol learned says “{q.trim()}”.</span></div></div> : null}
        {byPlace(list, name).map((g) => <section key={g.place ?? "you"} className="st-page" data-ledger-place={g.place ?? "you"}>
          <div className="st-l">{g.name}</div>
          <div className="st-learn">{g.lines.map(line)}</div>
        </section>)}
      </div>
      <div className="st-toggle"><span className="st-t"><b>Learn from what I do</b><span className="st-why">I learn only from what you pick and how you work, never from whether you praised me. Turn it off and I keep what I know and add nothing.</span></span><button className="st-switch" role="switch" aria-checked={P.learn} aria-label="Learn from what I do" onClick={() => M.stAct("learn")} /></div>
    </div>
  );
}
