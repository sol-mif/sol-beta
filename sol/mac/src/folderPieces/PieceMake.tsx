// Making a piece by hand, in the room (#1092, the design's NOW 2 of 03:20): the folder's dashed "new piece" row opens
// this. It owns the draft the designer's PieceBench draws: the folder's sources come from the engine (found, never
// typed), every press reads the draft once (work.pieces.try, nothing kept), "keep" writes the recipe (work.pieces.make)
// and the new piece takes the room. "not yet" or Esc: nothing was written, the session is back.
import { useEffect, useRef, useState } from "react";
import type { Metas } from "../home/meta";
import { click, play } from "../snap/click";
import { PieceBench } from "./PieceBench";
import { BLANK, nameOf, recipeOf, titleOf, type BenchSource, type Draft } from "./bench";
import type { FrontStep } from "./front";
import { closePiece, setOpenPiece } from "./open";
import { link, refresh } from "./usePieces";
import { ghostNow, ghostSpent } from "./ghost";
import "./front.css";

export const meta = {
  PieceMake: {
    job: "make a tool for this folder by hand: what it reads, how often, how far its agent may go, and its name; its real front fills beside",
    flow: "mine",
    states: ["no sources yet", "nothing pressed (the front dashed)", "reading", "read", "broke (the reason)", "kept"],
    keys: [
      { press: "click a source pill", does: "it reads that; the front fills with the real rows" },
      { press: "click a notch", does: "how often it reads, how far it may go" },
      { press: "type its name", does: "over the name the presses gave it" },
      { press: "click keep / Enter in the name", does: "writes .sol/pieces/<name>.json; the piece takes the room and its row drops into the folder" },
      { press: "click not yet / Esc", does: "nothing written; back to the session" },
    ],
    listens: ["work.pieces.sources", "work.pieces.try", "work.pieces.make"],
  },
} satisfies Metas;

export function PieceMake({ cwd, from, reads, session, onSession }: { cwd: string; from: string | null; reads?: string; session?: string; onSession: (id: string) => void }) {
  const [sources, setSources] = useState<BenchSource[]>([]);
  // the ghost (ghost.ts): sure, the bench starts with its source (and its area and kind) pressed and its name; half sure, the pill is dashed
  const [ghost] = useState(() => ghostNow(cwd));
  // a starter row (FolderPieces): its source pressed, so the front reads at once and "keep" is one press
  const [draft, setDraft] = useState<Draft>(() => (reads ? { ...BLANK, reads } : ghost?.tier === "acts" ? { ...BLANK, reads: ghost.reads, parts: ghost.parts ?? {}, title: ghost.name } : BLANK));
  const [steps, setSteps] = useState<FrontStep[] | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [kept, setKept] = useState(false);
  const asked = useRef(0);

  useEffect(() => { void link()?.ask<{ sources?: BenchSource[] }>("work.pieces.sources", { cwd }, 8000).then((r) => setSources(r?.sources ?? [])); }, [cwd]);
  // every press reads the draft once, the last press winning (a slow read never paints over a newer one)
  // the read's key leaves out its name: typing a name does not read the folder again
  const recipe = recipeOf(draft, sources), key = JSON.stringify(recipe ? { ...recipe, name: "", title: "" } : null);
  useEffect(() => {
    if (!recipe) { setSteps(null); setError(undefined); return; }
    const n = ++asked.current;
    setReading(true);
    const t = setTimeout(() => {
      void link()?.ask<{ steps?: FrontStep[]; error?: string }>("work.pieces.try", { cwd, recipe }, 30_000).then((r) => {
        if (n !== asked.current) return;
        setReading(false); setError(r?.error); if (!r?.error) setSteps(r?.steps ?? []);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [cwd, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const leave = () => { closePiece(); if (from) onSession(from); };
  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); leave(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const keep = async () => {
    if (!recipe || error) return;
    const r = await link()?.ask<{ error?: string }>("work.pieces.make", { cwd, recipe }, 8000);
    if (r?.error) { setError(r.error); return; }
    click(1); setKept(true);
    if (ghost) ghostSpent(cwd);
    await refresh(cwd);
    // the back folds away (320 ms), then the new piece has the room
    setTimeout(() => setOpenPiece({ cwd, name: nameOf(titleOf(draft, sources)), from }), 320);
  };
  // "something else": his words go to his session as one turn; the session writes the recipe and the row drops in when
  // the file appears (the watch); the session has the room meanwhile
  const askSession = (words: string) => {
    if (!from) { setError("open a session in this folder first: it is the one asked"); return; }
    click(1);
    void Promise.resolve(link()?.ask("work.say", { sessionId: from, text: words }, 1500)).catch(() => {});
    closePiece(); onSession(from);
  };
  return (
    <div className="fp-room fp-make" data-piece-make={cwd} role="region" aria-label="a new piece">
      <PieceBench sources={sources} draft={draft} maybe={ghost?.tier === "ghost" ? ghost.reads : undefined} steps={steps} reading={reading} error={error} kept={kept} session={session}
        onSet={(c) => { const next = { ...draft, ...c }; if (pressed(c)) play("seat", { pitch: 0.9 + 0.06 * notchesOf(next) }); setDraft(next); }} onKeep={() => void keep()} onAsk={askSession} onDrop={leave} />
    </div>
  );
}

/** a press, not typing: what he types (its name, a line, its sentence) makes no sound (the designer's NOW 2 of 04:17) */
const pressed = (c: Partial<Draft>) => !("title" in c || "line" in c || "tend" in c);
/** how many notches he has set: each press sounds a little higher, so the tool audibly comes together */
const notchesOf = (d: Draft) => (d.reads ? 1 : 0) + Object.values(d.parts).filter(Boolean).length + (d.every !== BLANK.every ? 1 : 0) + (d.ceiling !== BLANK.ceiling ? 1 : 0);
