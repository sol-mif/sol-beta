// Making a piece by hand (#1092, the design: S/design/design.md "He makes a tool by hand"). A new piece arrives in the
// room turned to its back, on the pearl, and its real front stands beside it. He presses what it reads (the folder's
// own sources, found by the engine, never typed), how often, how far its agent may go; at every press the front reads
// again and fills with the real rows. Its name writes itself from what he pressed; "keep" writes the recipe file, the
// back folds away and the row drops into the folder. No form, no settings page: three notches and a name.
// The parent owns the draft and the read: onSet → (work.pieces.try with recipeOf(draft)) → steps.
import { Fragment, useEffect, useRef } from "react";
import { Glass } from "../kit";
import { deep, pearl } from "../kit/paint";
import { CURVE } from "../kit/tokens";
import { PieceFront } from "./PieceFront";
import { EVERY, everyNotch } from "./PieceBack";
import { TEND, askOf, readable, titleOf, nameOf, type BenchSource, type Draft } from "./bench";
import type { FrontStep } from "./front";
import "./front.css";

const MAY: [Draft["ceiling"], string][] = [["look", "reads"], ["draft", "drafts"], ["act", "acts"], ["spend", "spends"]];
/** one stop per row of pills for Tab (the pressed one, else the first); the arrows walk inside and between the rows */
const stop = (on: boolean, i: number, any: boolean) => (on || (!any && i === 0) ? 0 : -1);
/** ← → walk a row of pills, ↓ ↑ go to the row below or above (its pressed pill, else the one under the hand's place) */
function walk(ev: React.KeyboardEvent, back: HTMLElement | null) {
  const b = (ev.target as HTMLElement).closest<HTMLElement>("[role=radiogroup] button"), d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[ev.key];
  if (!b || !back || d === undefined) return;
  const row = [...b.parentElement!.querySelectorAll<HTMLElement>("button")], i = row.indexOf(b);
  let to: HTMLElement | undefined;
  if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") to = row[i + d];
  else { const rows = [...back.querySelectorAll<HTMLElement>("[role=radiogroup]")], next = rows[rows.indexOf(b.parentElement!) + d]; const bs = next ? [...next.querySelectorAll<HTMLElement>("button")] : []; to = bs.find((x) => x.getAttribute("aria-checked") === "true") ?? bs[Math.min(i, bs.length - 1)]; }
  if (to) { ev.preventDefault(); to.focus(); }
}

export function PieceBench({ sources, draft, maybe, steps, reading, error, kept, session, onSet, onKeep, onAsk, onDrop }: {
  sources: BenchSource[]; draft: Draft;
  /** Jev's half-sure pick of what it reads (design JEV 7): that pill wears a dashed rim; a sure pick is already in the draft */
  maybe?: string;
  /** the last read of the draft's recipe; null before the first */
  steps: FrontStep[] | null; reading?: boolean; error?: string;
  /** set at "keep": the back folds away and the front has the room alone */
  kept?: boolean;
  /** the session he came from, by its short name: where "something else" is asked */
  session?: string;
  onSet: (change: Partial<Draft>) => void; onKeep: () => void; onDrop: () => void;
  /** "something else" with his words: the parent sends them to his session and gives it the room */
  onAsk?: (words: string) => void;
}) {
  const src = sources.find((s) => s.id === draft.reads), ok = readable(draft, sources), title = titleOf(draft, sources);
  const at = everyNotch(draft.every), rung = MAY.findIndex((m) => m[0] === draft.ceiling);
  const wants = (steps ?? []).filter((s) => s.st === "wait").length;
  const ask = askOf(draft, sources), asking = src?.asks === "sentence";
  // the hand starts on the first thing to press: what it reads (Jev's half-sure pill when there is one)
  const back = useRef<HTMLDivElement>(null);
  useEffect(() => { back.current?.querySelector<HTMLElement>(".pb-pills .pb-on, .pb-pills .pb-maybe, .pb-pills button")?.focus({ preventScroll: true }); }, []);
  return (
    <div className={`pbench${kept ? " pbench-kept" : ""}`} data-piece-bench>
      <div ref={back} className="pb pbench-back" style={{ color: deep() }} onKeyDown={(ev) => { if (ev.key === "Escape") onDrop(); else walk(ev, back.current); }}>
        <Glass r={CURVE.radius.card} fill={pearl()} edge={0} />
        <header>
          <input className="pb-name" aria-label="its name" value={draft.title} placeholder={title || "a new piece"} maxLength={40} spellCheck={false}
            onChange={(ev) => onSet({ title: ev.target.value })} onKeyDown={(ev) => ev.key === "Enter" && ok && onKeep()} />
        </header>
        <dl>
          <dt>reads</dt>
          <dd><span className="pb-pills" role="radiogroup" aria-label="what it reads">
            {sources.map((s, i) => <button key={s.id} type="button" role="radio" aria-checked={s.id === draft.reads} tabIndex={stop(s.id === draft.reads, i, !!draft.reads)}
              className={s.id === draft.reads ? "pb-on" : s.id === maybe && !draft.reads ? "pb-maybe" : ""} onClick={() => onSet({ reads: s.id, parts: {}, line: "" })}>{s.word}</button>)}
          </span></dd>
          {src?.parts?.map((p) => <Fragment key={p.label}>
            <dt>{p.label}</dt>
            <dd><span className="pb-pills" role="radiogroup" aria-label={p.label}>
              {p.options.map((o, i) => <button key={o} type="button" role="radio" aria-checked={draft.parts[p.label] === o} tabIndex={stop(draft.parts[p.label] === o, i, !!draft.parts[p.label])} className={draft.parts[p.label] === o ? "pb-on" : ""}
                onClick={() => onSet({ parts: { ...draft.parts, [p.label]: draft.parts[p.label] === o ? "" : o } })}>{o}</button>)}
            </span></dd>
          </Fragment>)}
          {src?.asks && <>
            <dt>{src.asks === "address" ? "at" : src.asks === "sentence" ? "say" : "file"}</dt>
            <dd><input aria-label={src.asks === "address" ? "the address" : asking ? "what it should read, in your words" : "the program's file"} autoFocus value={draft.line ?? ""} spellCheck={false}
              className={asking ? "pb-line pb-say" : "pb-line"} placeholder={src.asks === "address" ? "paste the address" : asking ? "what it should read" : ".sol/pieces/…"} onChange={(ev) => onSet({ line: ev.target.value })}
              onKeyDown={(ev) => ev.key === "Enter" && ask && onAsk?.(ask)} /></dd>
          </>}
          <dt>every</dt>
          <dd><span className="pb-notch" role="radiogroup" aria-label="how often it reads">{EVERY.map(([sec, w], i) => <button key={sec} type="button" role="radio" aria-checked={i === at} tabIndex={stop(i === at, i, at >= 0)} className={i === at ? "pb-on" : ""} onClick={() => onSet({ every: sec })}>{w}</button>)}</span></dd>
          <dt>may</dt>
          <dd><span className="pb-notch pb-ladder" role="radiogroup" aria-label="how far its agent may go">{MAY.map(([c, w], i) => <button key={c} type="button" role="radio" aria-checked={i === rung} tabIndex={stop(i === rung, i, rung >= 0)} className={i <= rung ? "pb-on" : ""} onClick={() => onSet({ ceiling: c })}>{w}</button>)}<small>{rung === 0 ? "it only tells you" : rung < MAY.length - 1 ? `asks before it ${MAY[rung + 1][1]}` : "never asks"}</small></span></dd>
          {rung >= 1 && !asking && <><dt>does</dt><dd><textarea className="pb-does" rows={2} maxLength={200} spellCheck={false} aria-label="what it does for you between your visits"
            defaultValue={draft.tend ?? TEND} onKeyDown={(ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); ev.currentTarget.blur(); } ev.stopPropagation(); }}
            onBlur={(ev) => ev.target.value.trim() !== (draft.tend ?? TEND) && onSet({ tend: ev.target.value.trim() })} /></dd></>}
          {ok && <><dt>file</dt><dd><code>.sol/pieces/{nameOf(title)}.json</code></dd></>}
        </dl>
        <div className="pb-acts">
          {asking
            ? <button type="button" className="pb-first" disabled={!ask} onClick={() => ask && onAsk?.(ask)}>ask {session ?? "the session"}</button>
            : <button type="button" className="pb-first" disabled={!ok || !!error} onClick={onKeep}>keep</button>}
          <button type="button" onClick={onDrop}>not yet</button>
        </div>
      </div>
      {/* the front beside the back is what he will get, to look at: it takes no focus and no press until it is kept */}
      <div className="pbench-front" inert={!kept}>
        {ok
          ? <PieceFront title={title} look={error ? "broken" : reading ? "working" : wants ? "you" : "rest"} wants={wants} steps={steps ?? []} size="page" error={error} onPress={() => {}} onUndo={() => {}} />
          : <div className="pbench-empty" aria-hidden><i /><b /><span /><span /><span /></div>}
      </div>
    </div>
  );
}
