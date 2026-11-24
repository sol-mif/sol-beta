// The moves (#1604, docs/port/slices.md "The contract every slice keeps"): each slice's own file, merged over the
// shared ones in core.ts into the one M. A move whose engine row is "no" (map.md; core.ts NOT_YET) answers
// { ok: false, why: "not yet" } in a real Sol until the engine has it. One file per slice, so no two builders touch one
// file; this one only gathers them. Signed: marcocyl04-ux's agent, the port's prep (#1615).
import { MODE, S, done, isReady, notYet, type Done, type Moves } from "../core.ts";
import plane from "./plane.ts";
import needs from "./needs.ts";
import near from "./near.ts";
import life from "./life.ts";
import ais from "./ais.ts";
import settings from "./settings.ts";
import engine from "./engine.ts";
import people from "./people.ts";
import movein from "./movein.ts";
import pieces from "./pieces.ts";
import seats from "./seats.ts";
import lead from "./lead.ts";   // slice R7 (#1615)

/** the join (requests/lead.md 3): one sign_in. Seats' move keeps the seat's own state; the lead's keeps the lapse's and,
 *  once the sign-in is good, the runs it held pick up again (one Diary line), as lead.js wrapped seats.js's move */
const { sign_in: leadSignIn, see_seat: _leadSeeSeat, ...leadOwn } = lead;
function signIn(id: string, to: string): Done {
  const a = seats.sign_in(id, to) as Done, b = leadSignIn(id, to) as Done;
  if (!a.ok && !b.ok) return a.why ? a : b;
  return done(true, id, () => { b.undo?.(); a.undo?.(); });
}
/** "Open sign-in" (the lead's see_seat) lands on Seats' own page at that row, ringed (requests/lead.md 3) */
function seeSeat(id: string): Done {
  if (MODE === "live") return notYet();   // the lead's contract: live, its moves wait for harmony S13, S14, S22 (#1617)
  const was = S.seat, r = seats.see_seats(id) as Done;
  S.seat = { page: "seats", ring: id === "gh" ? "github" : id, id };
  return done(r.ok, id, () => { S.seat = was; r.undo?.(); });
}
const SLICES: Record<string, Moves> = { plane, needs, near, life, ais, settings, engine, people, movein, pieces, lead: { ...leadOwn, see_seat: seeSeat }, seats: { ...seats, sign_in: signIn } };
import fits from "./fits.ts"; SLICES.fits = fits;   // slice R8 (#1615), last: its diary lines follow the diary's seed
import workspace from "./workspace.ts"; SLICES.workspace = workspace;   // BR1 carry (#1615): Workspace changes
import tabs from "./tabs.ts"; SLICES.tabs = tabs;   // BR1 tabs (#1615): the row on top of the canvas

/** every slice's moves in one object, each held back live while the engine cannot do it; a name two slices both
 *  give is said once in the console (the later slice's wins) */
export function merged(): Moves {
  const out: Moves = {}, by: Record<string, string> = {};
  for (const [slice, ms] of Object.entries(SLICES)) for (const [name, f] of Object.entries(ms)) {
    if (by[name]) console.warn(`next: the move ${name} is given by both ${by[name]} and ${slice}`);
    by[name] = slice;
    out[name] = (...args: unknown[]) => (isReady(name) ? f(...args) : notYet());
  }
  return out;
}
import scope, { relinks } from "./scope.ts"; SLICES.scope = scope; relinks(SLICES);   // slice R9 (#1615), after the fits: its links and folds follow every seed
import notes from "./notes.ts"; SLICES.notes = notes;   // BR1 C: notes and sessions inside a folder (#1615)
import fitmode from "./fitmode.ts"; SLICES.fitmode = fitmode;   // BR1 people: fit mode, the bar's Fit Sol (#1615)
import setup from "./setup.ts"; SLICES.setup = setup;   // BR1 people item 2: a folder's setup and its agent (#1615)
import kept from "./kept.ts"; SLICES.kept = kept;   // BR1 Q1: a piece kept open beside the canvas (#1615)
import talkto from "./talkto.ts"; SLICES.talkto = talkto;   // BR1 inside.html §1: who the one chat bar talks to (#1615)
import table from "./table.ts"; SLICES.table = table;   // BR1 inside.html §2: a session's table, what it uses and made (#1615)
