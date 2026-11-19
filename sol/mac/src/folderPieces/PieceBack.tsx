// A piece's back (#1092, the design: S/design/design.md NOW 1): what it is made of, on the pearl, as every made thing's
// back is (kit/BackCard.tsx): what it reads, how often, what the agent may do, the file that makes it, and its last
// ledger lines. "read now" lives here, not on the front. Space or "turn back" turns it again.
// The back is also where he shapes the tool by hand (design.md AFTER NOW 2): how often it reads and how far its agent
// may go are notches; a press moves one, the recipe file is rewritten, the piece reads again. No form, no settings page.
import { Glass } from "../kit";
import { deep, pearl } from "../kit/paint";
import { CURVE } from "../kit/tokens";
import { CEILING_WORDS, ago, everyWords, type PieceInfo } from "./model";
import "./front.css";

export type LedgerLine = { at: number; by: string; ev: string; note?: string };

/** the notches of "every": seconds, and the word on each */
export const EVERY: [number, string][] = [[60, "1 min"], [300, "5 min"], [3600, "1 h"], [86400, "1 day"]];
/** the nearest notch to a recipe's own number (pure) */
export const everyNotch = (s: number) => EVERY.reduce((b, n, i) => (Math.abs(Math.log(n[0] / s)) < Math.abs(Math.log(EVERY[b][0] / s)) ? i : b), 0);
const MAY: [PieceInfo["ceiling"], string][] = [["look", "reads"], ["draft", "drafts"], ["act", "acts"], ["spend", "spends"]];

export function PieceBack({ p, file, lines, busy, onNow, onTurn, onSet }: {
  p: Pick<PieceInfo, "title" | "from" | "every" | "at" | "ceiling" | "error"> & {
    /** the recipe's `tend`: what its agent does for a row that newly wants him, in one sentence. His to rewrite */
    tend?: string }; file: string; lines: LedgerLine[]; busy?: boolean; onNow: () => void; onTurn: () => void;
  /** a notch pressed: the parent rewrites the recipe (`work.pieces.set`). Without it the two rows are words, as before */
  onSet?: (change: { every: number } | { ceiling: PieceInfo["ceiling"] } | { tend: string }) => void;
}) {
  const at = everyNotch(p.every), rung = MAY.findIndex((m) => m[0] === p.ceiling);
  return (
    <div className="pb" data-piece-back style={{ color: deep() }}>
      <Glass r={CURVE.radius.card} fill={pearl()} edge={0} />
      <header><b>{p.title}</b><span>what it is made of</span></header>
      <dl>
        <dt>reads</dt><dd>{p.from}</dd>
        <dt>every</dt>
        <dd>{onSet
          ? <span className="pb-notch" role="radiogroup" aria-label="how often it reads">{EVERY.map(([sec, w], i) => <button key={sec} type="button" role="radio" aria-checked={i === at} className={i === at ? "pb-on" : ""} onClick={() => i !== at && onSet({ every: sec })}>{w}</button>)}<small>last {ago(p.at)}</small></span>
          : <>{everyWords(p.every).replace(/^every /, "")} · last {ago(p.at)}</>}</dd>
        <dt>may</dt>
        <dd>{onSet
          // a ladder: the rung he sets and every rung under it are filled; past it the piece asks him
          ? <span className="pb-notch pb-ladder" role="radiogroup" aria-label="how far its agent may go">{MAY.map(([c, w], i) => <button key={c} type="button" role="radio" aria-checked={i === rung} className={i <= rung ? "pb-on" : ""} onClick={() => i !== rung && onSet({ ceiling: c })}>{w}</button>)}<small>{rung < MAY.length - 1 ? `asks before it ${MAY[rung + 1][1].replace(/s$/, "")}s` : "never asks"}</small></span>
          : CEILING_WORDS[p.ceiling]}</dd>
        {/* what it does between his visits, in his words: the one sentence on the back he may rewrite (Enter keeps it) */}
        {rung >= 1 && (onSet || p.tend) && <><dt>does</dt><dd>{onSet
          ? <textarea className="pb-does" rows={2} maxLength={200} spellCheck={false} aria-label="what it does for you between your visits" defaultValue={p.tend ?? ""} key={p.tend ?? ""}
              placeholder="what it does for you between your visits, in one sentence"
              onKeyDown={(ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); ev.currentTarget.blur(); } ev.stopPropagation(); }}
              onBlur={(ev) => { const t = ev.target.value.trim(); if (t !== (p.tend ?? "")) onSet({ tend: t }); }} />
          : p.tend}</dd></>}
        <dt>file</dt><dd><code>{file}</code></dd>
        {p.error && <><dt>broke</dt><dd>{p.error}</dd></>}
      </dl>
      {lines.length > 0 && (
        <ol aria-label="the piece's ledger">
          {lines.slice(-5).reverse().map((l, i) => <li key={i}><span>{l.by} · {l.note ?? l.ev}</span><small>{ago(l.at)}</small></li>)}
        </ol>
      )}
      <div className="pb-acts">
        <button type="button" className="pb-first" disabled={busy} onClick={onNow}>{busy ? "reading" : "read now"}</button>
        <button type="button" onClick={onTurn}>turn back</button>
      </div>
    </div>
  );
}
