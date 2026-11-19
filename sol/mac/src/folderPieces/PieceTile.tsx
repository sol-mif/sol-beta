// A piece as a tile on a Home folder's board (#1092, the design: S/design/design.md NOW 1 of 02:30). In Home a class
// folder is a board of stickies; a piece is one more tile on it, the first, a sticky's size. A sticky is his and is done
// once when he presses it; a piece keeps reading between his visits, so it sits straight, on dark glass, with the piece's
// square. One thing in front, one press; the stickies beside it are the names, so it lists none. The square turns it over
// (what it reads, how often, when last; "look again"), as every tile in a set-up folder turns.
// Give it to MadeBoard as `extra`: tile.css orders it first in the board's grid.
import { useState } from "react";
import { Button } from "../kit";
import { frontOf, pressWord, type FrontStep } from "./front";
import { ago, everyWords, type Look, type PieceInfo } from "./model";
import "./pieces.css";   // the square and its breath
import { BORN_GAP } from "./born";
import "./tile.css";

export function PieceTile({ p, look, steps, doing, born, onPress, onNow }: {
  p: Pick<PieceInfo, "name" | "title" | "from" | "every" | "at" | "error">; look: Look; steps: FrontStep[];
  /** the folder's agent is on the front row now: the line it is at ("opening the brief"); the tile breathes, no button */
  doing?: string | null;
  /** its place in the pour the first time this folder shows it (born.ts), else undefined */
  born?: number;
  /** the front's press: the row's index. The parent starts it (the sticky's own press) and ticks it */
  onPress: (i: number) => void;
  /** the back's "look again" */
  onNow: () => void;
}) {
  const [led, setLed] = useState<number | null>(null), [turned, setTurned] = useState(false);
  const { front, rest } = frontOf(steps, led);
  const after = rest.filter((x) => x.s.st === "wait");
  const fig = p.error ? "!" : front ? figOf(front.s) : "";
  return (
    <div className={`ptile fp-${look}${turned ? " pt-turned" : ""}${doing != null ? " pt-doing" : ""}${born !== undefined ? " pt-born" : ""}`} data-piece-tile={p.name}
      style={born !== undefined ? { animationDelay: `${born * BORN_GAP}ms` } : undefined}>
      <div className="pt-side pt-front" aria-hidden={turned}>
        <div className="pt-head">
          <button type="button" className="pt-turn" aria-label={`turn ${p.title} over`} tabIndex={turned ? -1 : 0} onClick={() => setTurned(true)}><i className={`fp-sq fp-${doing != null ? "working" : look}`} /></button>
          <b>{p.title}</b>
          {fig && <span className="pt-fig">{fig}</span>}
        </div>
        {p.error ? <><span className="pt-t">It could not read</span><span className="pt-s">{p.error}</span></>
          : front ? <><span className="pt-t" key={front.i}>{front.s.t}</span>{(doing ?? front.s.note) && <span className="pt-s">{doing ?? front.s.note}</span>}</>
          : <span className="pt-t pt-none">Nothing due</span>}
        <div className="pt-foot">
          {doing != null ? <span className="pt-now"><i />watch it work</span>
            : p.error ? <Button h={28} form="gives" onClick={() => setTurned(true)}>see why</Button>
            : front && <Button h={28} form="gives" onClick={() => onPress(front.i)}>{pressWord(front.s)}</Button>}
          {/* what comes after the front, by count: a press brings the next one forward */}
          {!p.error && doing == null && after.length > 0 && <button type="button" className="pt-next" tabIndex={turned ? -1 : 0} onClick={() => setLed(after[0].i)}>then {after.length} more</button>}
        </div>
      </div>
      <div className="pt-side pt-back" aria-hidden={!turned}>
        <div className="pt-head">
          <button type="button" className="pt-turn" aria-label="turn back" tabIndex={turned ? 0 : -1} onClick={() => setTurned(false)}><i className="fp-sq" /></button>
          <b>{p.title}</b><span className="pt-fig">its back</span>
        </div>
        <dl>
          <dt>reads</dt><dd>{p.from}</dd>
          <dt>every</dt><dd>{everyWords(p.every).replace(/^every /, "")}</dd>
          <dt>last</dt><dd>{ago(p.at)}</dd>
          {p.error && <><dt>broke</dt><dd>{p.error}</dd></>}
        </dl>
        <div className="pt-foot"><button type="button" className="pt-again" tabIndex={turned ? 0 : -1} onClick={onNow}>look again</button></div>
      </div>
    </div>
  );
}

/** the tile's figure, four characters at most: the row's own short note when it is one ("4 d"), else nothing */
export function figOf(s: FrontStep): string {
  if (s.fig) return s.fig.slice(0, 5);
  const m = /(\d+)\s*(d|h|min)\b/.exec(s.note ?? "");
  return m ? `${m[1]} ${m[2] === "min" ? "m" : m[2]}` : "";
}

/** the piece a folder does not have yet: the same tile, dashed; one press writes its recipe and it is there */
export function PieceTileGhost({ name, about, adding, onAdd }: { name: string; about: string; adding?: boolean; onAdd: () => void }) {
  return (
    <button type="button" className="ptile ptile-ghost" data-piece-tile-ghost={name} disabled={adding} onClick={onAdd}>
      <span className="pt-head"><i className="fp-sq" /><b>{name}</b></span>
      <span className="pt-s">{about}</span>
      <span className="pt-foot"><span className="pt-next">{adding ? "adding" : "add it"}</span></span>
    </button>
  );
}
