// A piece open in the room (#1092, the design's NOW 1 and 2): a press on a piece row does what a press on a session row
// does, the piece takes the room right of the sidebars. One column on the room's own ground: the designer's PieceFront at
// page size (the one thing that wants you, its press, the rest by name, the undo line), and its back (PieceBack) when
// the square turns it over. The same block a session holds; a press here is the session's too. Esc goes back.
import { useCallback, useEffect, useState } from "react";
import { click } from "../snap/click";
import { nameOf } from "../stage/carry";
import type { Metas } from "../home/meta";
import { usePieces, piecesAct, bump, link, type Opened } from "./usePieces";
import { PieceMake } from "./PieceMake";
import { closePiece, NEW_PIECE, type OpenPiece } from "./open";
import { keepsOnly, lookOf, stepsIn } from "./model";
import { PieceFront } from "./PieceFront";
import { PieceBack } from "./PieceBack";
import { plainLines } from "./front";

export const meta = {
  PieceRoom: {
    job: "one piece in the room right of the sidebars: the one thing that wants you in front with its press, the rest by name, its facts on its back",
    flow: "pickup",
    states: ["front", "a name brought forward", "put away, undo for 6 s", "nothing waits on you", "working (the last known rows stay)", "broken", "turned over", "in a session"],
    keys: [
      { press: "Enter, or the front's button", does: "does what the button says (opens its link) and puts the row away; the next comes forward" },
      { press: "↓ ↑", does: "walks the names" },
      { press: "⌘Z within 6 s", does: "brings the last row back" },
      { press: "Space, or the square", does: "turns the piece over: where it reads, how often, what it may do, its ledger" },
      { press: "Esc", does: "back to the session it came from" },
      { press: "into this session", does: "seats the piece on that session's stage as a block" },
    ],
    listens: ["the open piece (folderPieces/open.ts)", "work.pieces.changed", "work.stage.changed (this piece's block)"],
  },
} satisfies Metas;

/** a session's name as a button can carry it */
const short = (t: string) => (t.length > 28 ? `${t.slice(0, 27).trimEnd()}…` : t);

/** the room: a piece, or a new one being made by hand (the folder's dashed "new piece") */
export function PieceRoom({ at, onSession }: { at: NonNullable<OpenPiece>; onSession: (id: string) => void }) {
  return at.name === NEW_PIECE ? <PieceMake key={at.reads ?? ""} cwd={at.cwd} from={at.from} reads={at.reads} session={at.from ? short(nameOf(at.from)) : undefined} onSession={onSession} /> : <Room at={at} onSession={onSession} />;
}

function Room({ at, onSession }: { at: NonNullable<OpenPiece>; onSession: (id: string) => void }) {
  const { cwd, name, from } = at;
  const { pieces } = usePieces(cwd);
  const p = pieces.find((x) => x.name === name);
  const [got, setGot] = useState<Opened | null>(null);
  const [back, setBack] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);   // why the engine would not seat it here, in words
  const load = useCallback(() => { void piecesAct.open(cwd, name).then((r) => { if (!r.error) setGot(r); }); }, [cwd, name]);
  useEffect(load, [load, p?.at, p?.state, p?.wants, p?.sessions.length]);
  useEffect(() => { setBack(false); void piecesAct.seen(cwd, name); }, [cwd, name]);   // he had it open: what was new is not new now
  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      ev.preventDefault(); ev.stopPropagation();
      if (back) { setBack(false); return; }
      closePiece(); if (from) onSession(from);
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [from, onSession, back]);

  const { steps } = stepsIn(got?.seen?.body?.text);
  const look = p ? lookOf(p) : "working";
  const here = !!from && !!p?.sessions.includes(from);
  const press = (i: number) => {
    const s = steps[i];
    if (!s) return;
    if (s.href && !keepsOnly(s)) window.open(s.href, "_blank", "noopener");
    click(0.6);
    if (s.st === "wait") bump(cwd, name, -1);   // the folder row's figure drops at the press
    void piecesAct.tick(cwd, name, i, s);
  };
  const undo = (i: number) => { const s = steps[i]; if (s) { void piecesAct.tick(cwd, name, i, s); bump(cwd, name, 1); } };
  const aside = from ? (here
    ? <button type="button" className="fp-aside" onClick={() => { closePiece(); onSession(from); }}>in {short(nameOf(from))}</button>
    : <button type="button" className="fp-aside" title={refused ?? undefined} onClick={() => { click(1); void piecesAct.drop(cwd, name, from).then((r) => setRefused(r?.error ?? null)); }}>{refused ? "not into this session" : "into this session"}</button>) : undefined;

  return (
    <div className={`fp-room fp-${look}`} data-piece-room={name} role="region" aria-label={p?.title ?? name}>
      <div className="fp-col">
        {back && p
          ? <PieceBack p={p} file={got?.file ?? `.sol/pieces/${name}.json`} lines={plainLines(got?.seen?.lines ?? [])} busy={busy}
              onNow={() => { setBusy(true); void Promise.resolve(piecesAct.now(cwd, name)).finally(() => setBusy(false)); }} onTurn={() => setBack(false)}
              onSet={(c) => { click(0.4); void link()?.ask("work.pieces.set", { cwd, name, ...c }); }} />
          : <PieceFront title={p?.title ?? name} look={look} wants={p?.wants ?? 0} doubt={p?.doubt ?? 0} steps={steps} size="page" error={p?.error} aside={aside}
              onLet={p?.asks !== undefined ? () => { if (!p.asks) { setRefused("only Sol's own window lets a folder's scripts run"); return; } click(0.6); void Promise.resolve(piecesAct.trust(cwd, p.asks)).then((r) => setRefused(r?.error ?? null)); } : undefined}
              letWhy={refused ?? undefined} scope={p?.scope}
              program={p?.asks !== undefined ? programOf(got?.recipe) : undefined} line={p?.line}
              may={p?.may} mayBy={p?.mayBy} onMay={p?.may ? () => { click(1); void piecesAct.letMay(cwd, p); } : undefined}
              onPress={press} onUndo={undo} onTurn={() => setBack(true)} />}
      </div>
    </div>
  );
}

/** a script recipe's program, as the folder holds it (".sol/pieces/today.mjs") */
const programOf = (r: unknown) => { const s = (r as { source?: { from?: string; path?: string } } | undefined)?.source; return s?.from === "script" && s.path ? `.sol/pieces/${s.path}` : undefined; };
