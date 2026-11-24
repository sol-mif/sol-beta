// A piece kept open beside the canvas (BR1 Q1, mine/look/br1/keep.html and inside.html; #1615): '◧ Keep open' on a
// session, a note or the Diary closes an opened folder and draws that piece in a pane at the canvas's right, one at a
// time; keeping a second sends the first to the tab row. The pane's ⤢ takes it out to a tab, its × closes it, and from a
// tab '◧ Beside the canvas' brings it back here. Esc steps back one at a time: a tab in front → beside → closed. The
// state is S.kept (a piece's id); the pane is kept/Kept.tsx. Not Near's own two-up (S.beside, ⌘\), which is a view of
// Near. Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { D, M, S, done, render, type Done, type Moves } from "../core.ts";
import { MOVE_FN, PERSON_ONLY } from "../../agent/calls.ts";
import { TB, tabShown } from "./tabs.ts";

/** the Diary's id (plane/layout.ts DIARY): not a piece of the store, but kept beside the canvas the same way */
export const DIARY_ID = "diary";
const here = (id: string) => !!D.pieces[id] || id === DIARY_ID;
/** the piece kept beside the canvas, while it is still here */
export const keptNow = (): string | null => (typeof S.kept === "string" && here(S.kept) ? S.kept : null);

const own: Moves = {
  /** keep a piece open beside the canvas: an opened folder closes, its tab (if it had one) closes, and the one kept
   *  before goes to the tab row behind */
  besideKeep(id: string): Done {
    if (!here(id)) return done(false);
    const prev = keptNow(), was = { page: S.page, folder: S.folder, folderAs: S.folderAs, kept: S.kept };
    const hadTab = TB().tabs.some((t) => t.id === id);
    if (S.page === "folder") S.page = null;
    if (hadTab) M.tabClose(id);
    if (prev && prev !== id && D.pieces[prev]) M.tabOpen(prev, false);   // the Diary has no tab: it just closes here
    S.kept = id;
    render();
    return done(true, id, () => {
      if (prev && prev !== id && D.pieces[prev]) M.tabClose(prev);
      if (hadTab) M.tabOpen(id, false);
      S.page = was.page; S.folder = was.folder; S.folderAs = was.folderAs; S.kept = was.kept; render();
    });
  },
  /** close the pane: the piece is where it always was */
  besideDrop(): Done {
    const id = keptNow();
    if (!id) return done(false);
    S.kept = null;
    render();
    return done(true, id, () => { S.kept = id; render(); });
  },
  /** the pane's ⤢: the kept piece out to a tab, in front */
  besideTab(): Done {
    const id = keptNow();
    if (!id || !D.pieces[id]) return done(false);
    S.kept = null;
    M.tabOpen(id, true);
    return done(true, id, () => { M.tabClose(id); S.kept = id; render(); });
  },
  /** a tab's '◧ Beside the canvas': the piece in front goes back beside the canvas (and its tab closes) */
  besideFromTab(id?: string): Done {
    const pid = id || tabShown();
    return pid ? own.besideKeep(pid) : done(false);
  },
};
export default own;

// what is kept open is the person's own view; an AI points at things, it does not rearrange the window
for (const n of ["besideKeep", "besideDrop", "besideTab", "besideFromTab"]) PERSON_ONLY[n] = "camera";
Object.assign(MOVE_FN, { besideKeep: "look", besideDrop: "look", besideTab: "look", besideFromTab: "look" });
