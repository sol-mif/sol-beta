// owned by slice 2 (Needs), docs/port/slices.md
// One ask, drawn the same wherever it stands (#1615; the mockup's views/needs.js row and acts): its mark, what it is, from
// whom and where, the yes worded as what it does and "Later", and its why one press down. A serious ask offers its
// evidence before its yes: "Look beside" on the line at Near, else "Open its session" (next ask when it is first, go to
// when not). Views read and press: the yes and later press M.answer; the rest are the shell's data-act moves.
// Signed: marcocyl04-ux's agent, slice 2 of the port (#1615).
import type { ReactNode } from "react";
import { D, M, S, looked, open, type Ask } from "../cv/index.ts";
import { cap, glyph, reason, who, yesWords } from "./rank.ts";

const PATHS: Record<string, ReactNode> = {
  ask: <><path d="M10 5.8v5.2" /><circle cx="10" cy="14" r=".6" fill="currentColor" /></>,
  broke: <path d="M7.2 7.2l5.6 5.6M12.8 7.2l-5.6 5.6" />,
  serious: <><path d="M10 4.5l6 10.5H4z" /><path d="M10 9v2.6" /></>,
  offer: <path d="M10 4v12M4 10h12" />,
};
export function Glyph({ g, label }: { g: string; label: string }) {
  return (
    <span className={`nd-g ${g}`} role="img" aria-label={label}>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{PATHS[g]}</svg>
    </span>
  );
}
export const Kbd = ({ k }: { k: string }) => <span className="nd-kbd">{k}</span>;

/** the presses for one ask */
export function Acts({ a, line = false }: { a: Ask; line?: boolean }) {
  if (a.serious && !looked(a)) {
    const beside = S.dist === "near" && line, first = open()[0]?.id === a.id;
    const act = beside ? "beside" : first ? "next" : "goto:" + a.id, k = beside ? "⌘\\" : first ? "⌘J" : "";
    return <span className="nd-acts"><button type="button" className="nd-btn pri" data-act={act}>{beside ? "Look beside" : "Open its session"}{k ? <Kbd k={k} /> : null}</button></span>;
  }
  return (
    <span className="nd-acts">
      <button type="button" className="nd-btn pri" data-yes={a.id} data-do={"yes:" + a.id} onClick={() => M.answer(a.id)}>{yesWords(a)}{line ? <Kbd k="⌘↩" /> : null}</button>
      <button type="button" className="nd-btn ghost" data-later={a.id} data-do={"later:" + a.id} onClick={() => M.answer(a.id, "later")}>Later{line ? <Kbd k="⌘⌫" /> : null}</button>
    </span>
  );
}

/** one ask row: mark · words · presses; its why one press down */
export function Row({ a, n, total, line = false, hideWhy = false }: { a: Ask; n?: number; total?: number; line?: boolean; hideWhy?: boolean }) {
  const p = D.pieces[a.piece], r = reason(D, a), [g, gl] = glyph(D, a), w = who(D, a);
  const kind = String(a.source).split(" · ").slice(1).join(" · ");
  const src = kind && p?.name && p.name.startsWith(w) ? kind : a.source;
  const wait = a.serious && !looked(a) ? ` · “${yesWords(a)}” after you look` : "";
  return (
    <div className="nd-line" data-row={a.id}>
      <Glyph g={g} label={gl} />
      <span className="nd-t">{cap(a.text)}<small>{src}{p?.name ? " · " + p.name : ""}{wait}</small></span>
      <Acts a={a} line={line} />
      {hideWhy ? null : (
        <details className="nd-why">
          <summary>Why {n ? "#" + n : "here"}</summary>
          <p>{n ? `${n} of ${total}, because: ` : ""}{r.long} Ranked {a.rank > 100 ? "after the rest (you said later)" : `by ${w}’s own weight against the others`}.</p>
        </details>
      )}
    </div>
  );
}
