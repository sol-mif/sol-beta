// The dashboard's tiles (Together, See #31): what the team added to the view, under the columns and the gantt. A tile
// is a team block of kind "tile" (#429, blocks/): declared once in blocks/blocks.json (its id, name, what it shows),
// drawn by one file here exporting `{ Tile }`, named by its id in the list below. The dashboard draws the tiles live in
// the project in use. A tile is read-only: nothing on the dashboard is a button.
import type { Board, Team } from "../useTeam";
import { blocksOf } from "../blocks";
import whosOn from "./whos-on";
import eyes from "./eyes";
import leads from "./leads";

export type TileProps = { team: Team; board: Board };
export type TileDef = { Tile: (p: TileProps) => React.ReactNode };

const DRAWN: Record<string, TileDef> = { "whos-on": whosOn, eyes, leads };
/** every tile Sol ships, in blocks.json's order, with its name from there */
export const TILES: (TileDef & { id: string; name: string })[] = blocksOf("tile").flatMap((b) => (DRAWN[b.id] ? [{ ...DRAWN[b.id], id: b.id, name: b.name }] : []));
