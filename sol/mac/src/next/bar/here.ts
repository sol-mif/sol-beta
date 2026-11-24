// Where the bottom bar is drawn (BR1 conform 2, #1615): one test the bar (Bar.tsx) and the shell's has-bar (Next.tsx) both
// read, so the room a page leaves at its foot and the bar itself never disagree. Its own file so a test can read it
// without the bar's styles. Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { D, S } from "../cv/index.ts";

/** a code session at Near has its own talk and no pill to float above: the bar steps aside there, as the pill does */
const atSession = () => S.dist === "near" && !S.page && !!S.piece && D.pieces[S.piece]?.kind === "session";

/** the bar is drawn in the three bands, and over an opened folder, which opens over the canvas with the bar kept
 *  (bar-folder.html #open); never over another page, "too much" or a code session */
export const barHere = (): boolean =>
  (S.dist === "far" || S.dist === "middle" || S.dist === "near") && (!S.page || S.page === "folder") && !S.calm && !atSession();
