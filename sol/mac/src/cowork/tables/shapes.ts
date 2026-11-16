// Tables (#434): the shapes both sides read (tables.json, beside this file; the engine reads it in team/tables.ts), and
// the board table's two views the dashboard is drawn through. Apart from views.ts so that stays pure under node --test.
import SHAPES_JSON from "./tables.json";
import { viewOf, type Shapes, type Source, sourceWord } from "./views";

export const SHAPES = SHAPES_JSON as unknown as Shapes;
/** the board table's columns and views: the dashboard's columns and its weeks are drawn through these */
export const BOARD_COLS = SHAPES.sources.board.columns;
export const BOARD_VIEW = viewOf(SHAPES.sources.board.views, "board")!;
export const BOARD_WEEKS = viewOf(SHAPES.sources.board.views, "timeline")!;
export const sourceName = (s: Source) => sourceWord(SHAPES, s);
/** what a source reads, in a line (tables.json `reads`) */
export const sourceReads = (s: Source) => (s === "own" ? "" : SHAPES.sources[s]?.reads ?? "");
