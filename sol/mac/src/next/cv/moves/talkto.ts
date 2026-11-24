// The one chat bar's addressee (BR1, mine/look/br1/inside.html §1, #1615): there is never a second bar, and it always
// says who it talks to, the way an email shows "To:". A session in front (at Near, as a tab) or kept beside the canvas is
// who it talks to; × on its name, Esc in the bar or a press on the empty canvas makes the bar new again while the
// session stays open, and a press inside the session talks to it again. While a session is open the folder the hand points
// at (plane/raise.ts, quiet.html) takes no To; with none open, the hand's To is the bar's. Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { D, S, done, render, type Done, type Moves } from "../core.ts";
import { MOVE_FN, PERSON_ONLY } from "../../agent/calls.ts";
import { keptNow } from "./kept.ts";

const session = (id: string | null | undefined): string | null => (id && D.pieces[id]?.kind === "session" ? id : null);
/** the session that is open to talk to: the one in front at Near (a tab is one), else the one kept beside the canvas */
export const sessionOpen = (): string | null => session(S.dist === "near" && !S.page ? S.piece : null) ?? session(keptNow());
/** the folder whose setup the bar talks to: its setup line open while that folder is open ("To: <folder> · setup",
 *  setup.html §2, builder F10); its words go to the folder as something every session there knows */
export function setupTo(): string | null {
  const f = (S.fs as { open?: string | null } | undefined)?.open;
  return f && S.page === "folder" && S.folder === f ? f : null;
}
/** who the bar talks to: the open session, unless the person made the bar new since or opened a folder's setup (the
 *  newest thing the hand did; setupTo says which); null is "To: New" or the setup */
export function addressee(): string | null {
  if (setupTo()) return null;
  const id = sessionOpen();
  return id && S.talkNew !== id ? id : null;
}

/** the six moments a first-time tip hooks on (BR1 inside.html; builder P builds the tips): what a drawn one cannot say by a
 *  data-moment attribute (to-chip, drop-places, table-hint) is said as a "sol-moment" event on window, its name in detail */
export function moment(name: string, more: Record<string, unknown> = {}): void {
  if (typeof window !== "undefined" && typeof CustomEvent === "function") window.dispatchEvent(new CustomEvent("sol-moment", { detail: { name, ...more } }));
}

const own: Moves = {
  /** × on the addressee, or Esc in the bar: the bar is new again; the session stays open */
  talkNew(): Done {
    const id = addressee();
    if (!id) return done(false);
    S.talkNew = id;
    render();
    return done(true, id, () => { S.talkNew = null; render(); });
  },
  /** a press inside the open session: the bar talks to it again */
  talkHere(): Done {
    const id = sessionOpen();
    if (!id || S.talkNew !== id) return done(false);
    S.talkNew = null;
    render();
    return done(true, id, () => { S.talkNew = id; render(); });
  },
};
export default own;

// who the bar talks to follows the person's own presses; an AI says its words through talk, never by moving the bar
for (const n of ["talkNew", "talkHere"]) PERSON_ONLY[n] = "camera";
Object.assign(MOVE_FN, { talkNew: "look", talkHere: "look" });
