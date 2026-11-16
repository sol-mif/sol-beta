// Sources and the policy paragraph (#796, plan Part C slice 33; home/whole.md "Sources, the policy, record-only";
// the still home/shots/7.png), behind sol.home.whole. Face half; the engine half is #828. One place for what Sol reads
// and how far it may go:
// - the one line ("Five sources. Canvas needs you: it signed out.");
// - on the left, your policy as your own paragraph, each sentence underlined, one that names no rung with a red wavy
//   line, editable in place (a press on it; ⌘↵ or leaving it saves, `home.policy.write`, Esc keeps it as it was); the
//   read under it; "what Sol learned about you", each line a rule only on "make it a rule";
// - on the right, a row per source: its glyph and name, health (a dot and the last read; broken, "sign in again" in
//   the row), scope in one line, the ladder read · propose · draft · act (`home.source.set`), what the rung above
//   would have done, and the folders under it, never above it.
// A sentence and its row light each other on hover. A rung change rewrites its sentence, which flashes once. What was
// just done stands at the foot with its undo (⌘Z too). Drawn from the kit (Glass, Pill, Button); whole-sources.css lays
// it out.
import { useEffect, useRef, useState } from "react";
import { Button, Glass, Pill } from "../../kit";
import { dim, ink, mute, on } from "../../kit/paint";
import { CURVE, JELLY, TYPE } from "../../kit/tokens";
import { Glyph } from "./First";
import { RUNGS, healthLine, readLine, scopeLine, sourcesLine, wouldLine, type Folder, type Sentence, type Source, type SourceId } from "./policy";
import { dropLearned, goTo, keepLearned, repair, setRung, undoSources, useSources, writePolicy } from "./sourcesStore";
import { useBrowserShared } from "../../flag";   // C42
import "../whole-sources.css";

const DISPLAY = ((TYPE as unknown as { display?: readonly [number, number] }).display ?? [28, 34]) as readonly [number, number];
const SUN = JELLY.warm[3], RED = JELLY.six[0], OK = JELLY.six[5];

function Ladder({ s }: { s: Source }) {
  return (
    <div className="hsrc-ladder" data-ladder={s.id} data-rung={s.rung}>
      <Pill words={RUNGS} picked={RUNGS.indexOf(s.rung)} h={28} onPick={(i) => setRung(s.id, RUNGS[i])} />
    </div>
  );
}

function Row({ s, folders, lit, onLight, now }: { s: Source; folders: Folder[]; lit: boolean; onLight: (id: SourceId | null) => void; now: number }) {
  const broken = s.health.state === "broken";
  return (
    <div className="hsrc-row" data-source={s.id} data-lit={lit || undefined} onMouseEnter={() => onLight(s.id)} onMouseLeave={() => onLight(null)}>
      <Glass r={CURVE.radius.card} step={lit ? "raised" : "card"} />
      <span className="hsrc-glyph" style={{ color: dim }}><Glyph source={s.id} size={16} /></span>
      <div className="hsrc-main">
        <div className="hsrc-name">
          <b style={{ color: ink }}>{s.name}</b>
          <span className="hsrc-health" style={{ color: dim }}><i style={{ background: broken ? RED : OK }} />{healthLine(s, now)}</span>
          {broken && <Button h={24} onClick={() => repair(s.id)}>sign in again</Button>}
        </div>
        <div className="hsrc-scope" style={{ color: mute }}>{scopeLine(s)}</div>
        {folders.length > 0 && (
          <div className="hsrc-folders" style={{ color: mute }}>
            {folders.map((f) => <span key={f.name} data-folder={f.name} data-held={f.rung !== f.asked || undefined}>{f.name} at {f.rung}{f.rung !== f.asked ? ` (asked ${f.asked}; never above ${s.name})` : ""}</span>)}
          </div>
        )}
        <div className="hsrc-side">
          <Ladder s={s} />
          <span className="hsrc-would" style={{ color: mute }}>{s.rung !== "act" && <span className="hsrc-dash" style={{ borderColor: on(0.4) }} />}{wouldLine(s)}</span>
        </div>
      </div>
    </div>
  );
}

/** the paragraph: each sentence underlined (red and wavy when it sets nothing), lit with its row, flashing once when a
 *  rung rewrote it; a press opens it for writing */
function Paragraph({ sentences, folders, lit, onLight, fresh, onEdit }: { sentences: Sentence[]; folders: Folder[]; lit: SourceId | null; onLight: (id: SourceId | null) => void; fresh: Set<string>; onEdit: () => void }) {
  return (
    <div className="hpol-text" data-policy role="button" tabIndex={0} aria-label="your policy: press to write it" onClick={onEdit} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEdit(); } }}
      style={{ fontSize: TYPE.read[0], lineHeight: `${TYPE.read[1]}px`, color: ink }}>
      {sentences.map((x, i) => {
        // a sentence that names a folder lights the row its folder sits under (#869 R2)
        const src = x.source ?? folders.find((f) => f.name === x.folder)?.source ?? null;
        const none = !x.rung && !x.rule, isLit = !!src && src === lit;
        return (
          <span key={`${i}-${x.span}`}><span className="hpol-s" data-sentence={x.source ?? x.folder ?? "rule"} data-sets={x.rung ?? (x.rule ? "rule" : "nothing")} data-new={fresh.has(x.span) || undefined}
            onMouseEnter={() => src && onLight(src)} onMouseLeave={() => src && onLight(null)}
            style={{ textDecorationColor: none ? RED : x.rule ? "transparent" : isLit ? ink : on(0.35), textDecorationStyle: none ? "wavy" : "solid", color: isLit ? ink : undefined,
              ["--flash" as string]: SUN }}>
            {x.span}</span>{i < sentences.length - 1 ? " " : ""}
          </span>
        );
      })}
    </div>
  );
}

export function Sources() {
  const browserOn = useBrowserShared();   // C42
  const v = useSources();
  const [lit, setLit] = useState<SourceId | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(i); }, []);
  // the sentences a rung change just rewrote: new spans that were not there before flash once
  const before = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const spans = v?.policy.sentences.map((x) => x.span).join("\u0000") ?? "";
  useEffect(() => {
    const have = new Set(v?.policy.sentences.map((x) => x.span) ?? []);
    if (before.current) setFresh(new Set([...have].filter((x) => !before.current!.has(x))));
    before.current = have;
  }, [spans]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = v?.done ?? null;
  useEffect(() => {
    if (!done) return;
    const k = (ev: KeyboardEvent) => { if ((ev.metaKey || ev.ctrlKey) && !ev.shiftKey && ev.key.toLowerCase() === "z" && !(ev.target as HTMLElement)?.closest?.("textarea")) { ev.preventDefault(); undoSources(done.ledgerId); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [done]);
  if (!v) return null;
  const [first, second] = sourcesLine(v.sources);
  const save = () => { if (editing !== null && editing.trim() !== v.policy.text) writePolicy(editing); setEditing(null); };
  return (
    <section className="hw hsrc" data-place="talk" data-home-whole data-sources>
      <div className="hw-date" style={{ color: mute }}>
        <button type="button" className="hsrc-back" style={{ color: dim }} onClick={() => goTo("today")}>‹ today</button> · Sources · what Sol reads, and how far it may go{/* C40 (#803): Jev, all day, lives under Sources */} · <button type="button" className="hsrc-back" data-go="jev" style={{ color: dim }} onClick={() => goTo("jev")}>Jev, the judge ›</button>{/* C42 (#805): your browser lives under Sources, behind its own switch */}{browserOn && <> · <button type="button" className="hsrc-back" data-go="browser" style={{ color: dim }} onClick={() => goTo("browser")}>your browser ›</button></>}
      </div>
      <h1 className="hw-line" data-line style={{ fontSize: DISPLAY[0], lineHeight: `${DISPLAY[1]}px` }}>
        <span style={{ color: ink }}>{first}</span> <span style={{ color: dim }}>{second}</span>
      </h1>
      <div className="hsrc-cols">
        <div className="hsrc-left">
          <div className="hsrc-label" style={{ color: mute }}>your policy, in your words · Sol reads it into the rungs on the right</div>
          <div className="hpol" data-editing={editing !== null || undefined}>
            <Glass r={CURVE.radius.card} step={editing !== null ? "box" : "card"} />
            {editing !== null
              ? <textarea className="hpol-edit" autoFocus value={editing} aria-label="your policy" style={{ fontSize: TYPE.read[0], lineHeight: `${TYPE.read[1]}px`, color: ink }}
                  onChange={(e) => setEditing(e.target.value)} onBlur={save}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); } if (e.key === "Escape") { e.preventDefault(); setEditing(null); } }} />
              : <Paragraph sentences={v.policy.sentences} folders={v.folders} lit={lit} onLight={setLit} fresh={fresh} onEdit={() => setEditing(v.policy.text)} />}
            <div className="hpol-read" style={{ color: mute }}>{readLine(v.policy)}</div>
          </div>
          <div className="hsrc-label" style={{ color: mute }}>what Sol learned about you · a rule only when you press</div>
          <div className="hlrn" data-learned={v.learned.length}>
            {v.learned.length === 0 && <div className="hlrn-row" style={{ color: mute }}>nothing new</div>}
            {v.learned.map((l) => (
              <div key={l.id} className="hlrn-row" data-line={l.id}>
                <span style={{ color: ink }}>{l.text}</span>
                <span className="hlrn-seen" style={{ color: mute }}>seen {l.seen} times</span>
                <Button h={24} onClick={() => keepLearned(l.id)}>make it a rule</Button>
                <Button h={24} onClick={() => dropLearned(l.id)}>wrong</Button>
              </div>
            ))}
          </div>
        </div>
        <div className="hsrc-right">
          {v.sources.map((s) => <Row key={s.id} s={s} folders={v.folders.filter((f) => f.source === s.id)} lit={lit === s.id} onLight={setLit} now={now} />)}
          <div className="hsrc-foot" style={{ color: mute }}>Every rung above the one you set is record-only: Sol writes what it would have done there, in the quiet ledger on Home. A new source starts at read.</div>
        </div>
      </div>
      {done && (
        <div className="hsrc-receipt" data-receipt="sources" role="status">
          <Glass r={CURVE.radius.row} step="pop" />
          <span style={{ color: dim }}>{done.line}</span>
          <button type="button" className="hw-undo" style={{ color: ink }} onClick={() => undoSources(done.ledgerId)}>undo</button>
        </div>
      )}
    </section>
  );
}
