// The draft's inside (#692 suite step 2, suite.html: "one thing written"): a page you both write in. Its run drafts and
// marks its doubts (the kit's wave under the words, the kit's DoubtCard with its alternatives); it never sends. Drawn
// inside Piece's own card; the run and the moves are the stand-in's suite-draft.mjs, the page a file in the folder's made/.
//   pinch a line      ⌘ or ctrl and the wheel (a trackpad's pinch), or "redo" under the pointer: home.draft.redo
//   write in a line   a click puts the caret in it; leaving it keeps his words (home.draft.edit), empty drops the line
//   unsure            the wave opens what it doubted; an alternative or keep (home.draft.pick)
//   send is yours     copy it, then "I sent it" (home.draft.sent): the block is done
import { useEffect, useRef, useState, type FocusEvent, type WheelEvent } from "react";
import { DoubtCard } from "../../../kit";
import { inkVars } from "../../../kit/Ink";
import type { Metas } from "../../meta";
import { say } from "./lift";
import type { ShapeProps } from "./shapes";
import "./draft.css";

export const meta = {
  Draft: {
    job: "one thing written, a page both write in: its run drafts and marks its doubts; sending is yours",
    flow: "know",
    states: ["its run drafting", "drafted, waiting on you: lines it is unsure of waved", "a doubt open", "a line being redone", "a line in your words", "sent by you: done"],
    keys: [
      { press: "pinch a line (⌘ and the wheel), or redo", does: "redoes that line (home.draft.redo)" },
      { press: "click a line and write", does: "keeps your words in the page and its file (home.draft.edit)" },
      { press: "a waved line's mark", does: "opens what it doubted; pick an alternative or keep (home.draft.pick)" },
      { press: "copy it", does: "copies the page; it never sends" },
      { press: "I sent it", does: "marks it sent by you; the block is done (home.draft.sent)" },
    ],
    listens: ["home.state › blocks (its body: title, to, lines, path)"],
  },
} satisfies Metas;

type Line = { id: string; text: string; by: "it" | "you"; doubt?: { why: string; alts: string[] }; redo?: boolean; was?: string };
type DraftBody = { title: string; to?: string; lines: Line[]; path?: string; by?: string; sent?: string };

/** how much wheel with ⌘ or ctrl is a pinch (Pinch.tsx's measure) */
const WHEEL = 60;

export function Draft({ b, r, h }: ShapeProps) {
  const body = b.body as DraftBody | null;
  const [open, setOpen] = useState<string | null>(null);
  if (!body?.lines) return <p className="pc-step">{r ? `its run: ${r.run}` : "its run is drafting"}…</p>;
  const send = (o: object) => h.send({ id: b.id, ...o });
  const unsure = body.lines.filter((l) => l.doubt).length;
  const text = () => [body.title, "", ...body.lines.map((l) => l.text)].join("\n");
  const copy = () => { void navigator.clipboard?.writeText(text()).catch(() => {}); say("copied: it is yours to send"); };
  return (
    <div className="drf" data-pc-inside="draft" onPointerDown={(e) => e.stopPropagation()}>
      <div className="drf-head"><b>{body.title}</b>{body.to && <span>to {body.to}</span>}</div>
      <div className="drf-page" role="document">
        {body.lines.map((l) => (
          <LineOf key={l.id} l={l} open={open === l.id} setOpen={(v) => setOpen(v ? l.id : null)} sent={!!body.sent}
            onRedo={() => { send({ type: "home.draft.redo", line: l.id }); say("pinched: it redoes that line"); }}
            onEdit={(t) => { send({ type: "home.draft.edit", line: l.id, text: t }); say(t ? "your words, in the page and its file" : "that line is gone"); }}
            onPick={(alt) => { setOpen(null); send({ type: "home.draft.pick", line: l.id, alt }); say(alt ? "its other version, in the page" : "kept as it was"); }} />
        ))}
      </div>
      <div className="drf-foot">
        <span className="drf-said">{body.sent ? "sent by you" : unsure ? `${unsure} line${unsure > 1 ? "s" : ""} it is unsure of · send is yours` : "send is yours"}</span>
        {!body.sent && (
          <span className="drf-acts">
            <button type="button" className="pc-act" data-draft-copy onClick={(e) => { e.stopPropagation(); copy(); }}>copy it</button>
            <button type="button" className="pc-act lit" data-draft-sent onClick={(e) => { e.stopPropagation(); send({ type: "home.draft.sent" }); say("sent by you: the draft is done"); }}>I sent it</button>
          </span>
        )}
      </div>
    </div>
  );
}

function LineOf({ l, open, setOpen, sent, onRedo, onEdit, onPick }: {
  l: Line; open: boolean; setOpen: (v: boolean) => void; sent: boolean;
  onRedo: () => void; onEdit: (t: string) => void; onPick: (alt: string | null) => void;
}) {
  const acc = useRef(0), ed = useRef<HTMLSpanElement>(null);
  // the page's text is his to change; a new version from the run replaces what is drawn only while he is not in it
  useEffect(() => { const el = ed.current; if (el && document.activeElement !== el && el.innerText !== l.text) el.innerText = l.text; }, [l.text]);
  const wheel = (e: WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey) || sent || l.redo) return;
    e.preventDefault(); acc.current += e.deltaY;
    if (Math.abs(acc.current) >= WHEEL) { acc.current = 0; onRedo(); }
  };
  // the card the block sits in can be dragged onto a folder: while a line has the caret it is not, so text selects
  const focus = (e: FocusEvent<HTMLSpanElement>) => { e.currentTarget.closest("[draggable=true]")?.setAttribute("draggable", "false"); };
  const blur = (e: FocusEvent<HTMLSpanElement>) => {
    e.currentTarget.closest("[draggable=false].pc-card")?.setAttribute("draggable", "true");
    const t = e.currentTarget.innerText.trim();
    if (t !== l.text.trim()) onEdit(t);
  };
  return (
    <p className={`drf-line${l.redo ? " redo" : ""}${l.doubt ? " unsure" : ""}`} data-draft-line={l.id} data-by={l.by} data-redo={l.redo ? "" : undefined} onWheel={wheel}>
      <span ref={ed} className={`drf-words${l.doubt ? " ink ink-wave" : ""}${open ? " open" : ""}`} style={l.doubt ? inkVars() : undefined}
        contentEditable={!sent && !l.redo} suppressContentEditableWarning spellCheck={false} onFocus={focus} onBlur={blur}
        onKeyDown={(e) => { if (e.key === "Escape") { e.currentTarget.innerText = l.text; e.currentTarget.blur(); } }}>{l.text}</span>
      {l.redo && <span className="drf-redoing">redoing…</span>}
      {!sent && !l.redo && (
        <span className="drf-line-acts">
          {l.doubt && <button type="button" className="drf-unsure" data-draft-unsure aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>unsure</button>}
          <button type="button" className="pc-act quiet" data-draft-redo title="redo this line (or pinch it)" onClick={(e) => { e.stopPropagation(); onRedo(); }}>redo</button>
        </span>
      )}
      {open && l.doubt && <DoubtCard d={l.doubt} onPick={onPick} style={{ top: "100%" }} />}
    </p>
  );
}
