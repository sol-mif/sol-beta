// A Home folder's pieces (#1092, Home; behind home.pieces): tiles on the class's own board, the first in its grid
// (MadeBoard's `extra`; the designer's NOW 1 of 02:22). A sticky is his and is done once; a piece keeps reading between
// visits, so it sits straight on dark glass with the piece's square (PieceTile). "start" is a sticky's press: the
// folder's agent does it while he watches (onStart, FolderHome's own press; a row with no sticky yet gets its sticky
// first). A folder with no "due" yet shows it dashed: one press writes its recipe and it is there.
import { useEffect, useState } from "react";
import type { Metas } from "../home/meta";
import { useHomePieces } from "./flag";
import { usePieces, piecesAct, link, refresh } from "./usePieces";
import { PieceTile, PieceTileGhost } from "./PieceTile";
import { useBorn } from "./born";
import { lookOf, stepsIn, type PieceInfo, type Step } from "./model";
import "./pieces.css";

export const meta = {
  HomePieces: {
    job: "a Home class folder's pieces as the first tiles on its board: the next due thing with one press, start",
    flow: "know",
    states: ["off", "none yet (the dashed due)", "reading", "front", "nothing due", "its agent working (watch it work)", "turned over"],
    keys: [
      { press: "click start", does: "puts the sticky up when there is none, then the folder's agent does it while you watch" },
      { press: "click then N more", does: "brings the next due thing forward" },
      { press: "click the square", does: "turns the tile over: what it reads, how often, when last" },
      { press: "click the dashed due", does: "writes the folder's due recipe; the tile appears" },
    ],
    listens: ["home.pieces (folderPieces/flag.ts)", "work.pieces.changed"],
  },
} satisfies Metas;

/** the recipe the dashed "due" writes into a class folder */
export const DUE_RECIPE = { name: "due", title: "due", about: "What this class asks of you next, from what the folder knows and your stickies", view: "list", source: { from: "builtin", name: "due" }, pulse: { every: 60 }, verbs: ["look", "draft"], ceiling: "draft" };

/** the school's due: every class's due, nearest first, by class (a piece that reads pieces; one level down) */
export const SCHOOL_DUE = { name: "due", title: "due", about: "The nearest thing any class asks of you, from each class's own due", view: "list", source: { from: "pieces", name: "due" }, pulse: { every: 60 }, verbs: ["look"], ceiling: "look" };

/** the tiles, no wrapper: give them to the board (`<MadeBoard extra={<HomePieces …/>}>`). `working`: the sticky the
 *  folder's agent is on now (the tile breathes and says so while that is its front) */
export function HomePieces({ cwd, onStart, working = null, workingLine, recipe = DUE_RECIPE, about = "what this class asks of you next", opens = false }: { cwd: string; onStart: (t: string, row: Step) => void; working?: string | null; workingLine?: string;
  /** what the dashed tile writes when the folder has no due yet (a class: its stickies; the school: its classes') */
  recipe?: object; about?: string;
  /** a tile of rows that live in another folder (the school's due): its press only opens that folder ("open"); the
   *  row is put away there, by its own press, never here (one state) */
  opens?: boolean }) {
  const on = useHomePieces();
  if (!on) return null;
  return <Pieces cwd={cwd} onStart={onStart} working={working} workingLine={workingLine} recipe={recipe} about={about} opens={opens} />;
}

/** the presses that are a sticky's own (the folder's agent does it while he watches): the word follows the thing */
export const STICKY_PRESS = ["start", "prepare", "read"];

/** the class's row in Home's side carries due's figure ("2 d"), in sun only while something there is new to him */
export function DueFigure({ cwd }: { cwd: string | null }) {
  const on = useHomePieces();
  if (!on || !cwd) return null;
  return <DueFig cwd={cwd} />;
}
function DueFig({ cwd }: { cwd: string }) {
  const d = usePieces(cwd).pieces.find((p) => p.name === "due");
  if (!d?.line) return null;
  return <span className={`n fp-duefig${(d.fresh ?? 0) > 0 ? " fp-sun" : ""}`} data-due-fig>{d.line}</span>;
}

function Pieces({ cwd, onStart, working, workingLine, recipe, about, opens }: { cwd: string; onStart: (t: string, row: Step) => void; working: string | null; workingLine?: string; recipe: object; about: string; opens: boolean }) {
  const { pieces, error } = usePieces(cwd);
  const born = useBorn(cwd, pieces.map((p) => p.name));
  const [adding, setAdding] = useState(false);
  const add = async () => {
    setAdding(true);
    await link()?.ask("work.pieces.make", { cwd, recipe }, 8000);
    await refresh(cwd);
    setAdding(false);
  };
  return (
    <>
      {pieces.map((p) => <HomeTile key={p.name} cwd={cwd} p={p} opens={opens} working={working} workingLine={workingLine} born={born.get(p.name)} onStart={onStart} />)}
      {!error && !pieces.some((p) => p.name === "due") && <PieceTileGhost name="due" about={about} adding={adding} onAdd={() => void add()} />}
    </>
  );
}

function HomeTile({ cwd, p, opens, working, workingLine, born, onStart }: { cwd: string; p: PieceInfo; opens?: boolean; working: string | null; workingLine?: string; born?: number; onStart: (t: string, row: Step) => void }) {
  const [steps, setSteps] = useState<Step[]>([]);
  useEffect(() => { void piecesAct.open(cwd, p.name).then((r) => { const got = stepsIn(r.seen?.body?.text).steps; setSteps(opens ? got.map((x) => ({ ...x, press: "open" })) : got); }); }, [cwd, p.name, p.at, p.wants]);
  const press = (i: number) => {
    const s = steps[i];
    if (!s) return;
    if (opens) { onStart(s.t, s); return; }   // the row is its own folder's: go there, put nothing away here
    // only the built-in due puts a sticky up for its folder's agent: another piece's row is never sent as a turn
    const sticky = p.builtin === "due" && STICKY_PRESS.includes(s.press ?? "");
    if (sticky) onStart(s.t, s); else if (s.href) window.open(s.href, "_blank", "noopener");
    // put away either way: a sticky's press puts the sticky up and its agent has it, so the tile moves to the next thing
    // (the sticky wears the tile's square and figure meanwhile: dueMarks); the row stays away while it is the same
    void piecesAct.tick(cwd, p.name, i, s);
  };
  // while the folder's agent is on the front's sticky: that sticky's own last line, else that it is on it
  const doing = working && steps.some((s) => s.t === working && s.st !== "done") ? workingLine?.trim() || "the folder's agent is on it" : null;
  return <PieceTile p={p} look={lookOf(p)} steps={steps} doing={doing} born={born} onPress={press} onNow={() => void piecesAct.now(cwd, p.name)} />;
}

/** the due things this folder's tile knows, by title: its figure ("2 d"), so a sticky the tile put up wears the tile's
 *  square and when, where "yours" is (the designer's NOW 2 of 04:10) */
export function useDueMarks(cwd: string | null): Map<string, string> {
  const on = useHomePieces();
  const due = usePieces(on ? cwd : null).pieces.find((p) => p.name === "due");
  const [marks, setMarks] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    if (!cwd || !due) { setMarks(new Map()); return; }
    void piecesAct.open(cwd, "due").then((r) => setMarks(new Map(stepsIn(r.seen?.body?.text).steps.filter((s) => s.fig).map((s) => [s.t, s.fig!]))));
  }, [cwd, due?.at, due?.wants]); // eslint-disable-line react-hooks/exhaustive-deps
  return marks;
}
/** a sticky's mark when the due tile knows it: the piece's square and its figure */
export const DueMark = ({ fig }: { fig: string }) => <span className="fp-duemark"><i className="fp-sq" aria-hidden />{fig}</span>;
