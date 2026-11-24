// The sort offered after the move-in (BR1, #1615; migration.html D, Marco 16:30): next/tidy.ts's offers, live. Behind the
// switch ui.next, and only for Sol's own windows, as parts/next.ts's messages are.
//   tidyNeeds(sol)                 each offer as one need (next/tidy.ts needOf), a candidate builder J's judgment takes
//                                    into the one list (parts/next-calls.ts addNeeds, once at load) like any raise: a
//                                    folder's one raise carries it
//   next.tidy {}                   → next.tidy {offers} to the asker (read only)
//   next.tidy.yes {id}             → next.tidy.done {ok, id, batch, done, what} to the asker; the move made (its folders
//                                    kept, placed under one batch), one answer line ("Sort them")
//   next.tidy.no {id}              → next.tidy.done {ok, id, no: true}; one answer line ("Leave them"), the offer not
//                                    made again
//   next.tidy.undo {id, batch?}    → next.tidy.undone {ok, id, batch, undone}; one undo line (no batch: the offer's last
//                                    yes still placed)
//   next.tidy.run {}               → next.tidy.ran {moves: [{id, batch, done, what}]} ("tidy my folders" in the bar): every
//                                    move to offer made now, those answered no before too, each its own batch and Undo
// A change answers every window with next.movein.kept and next.state (the canvas draws the folders where they went), and
// the asker with next.raises (parts/next-raises.ts raisesMsg: the raise lets go of an offer answered; never next.needs,
// which the face takes as its one list and latches on, builder J). The move-in's read (parts/next.ts readIn) is kept a
// minute: the one list is read often and the read walks the disk. A message that is not what it should be changes
// nothing: next.refused {asked, why} to the asker alone. Each answer to the asker carries the rid it was asked with.
// Signed: marcocyl04-ux's agent (builder T), BR1 (#1615).
import type { Heard, Parts } from "../parts.js";
import { uiNext } from "../settings.js";
import { keptFolders, readMoveIn } from "../next/movein.js";
import type { Judged } from "../next/movein-place.js";
import { stateMsg } from "../next/state.js";
import { declineOffer, needOf, offersOf, runOffer, undoOffer, type Offer } from "../next/tidy.js";
import * as calls from "./next-calls.js";
import { raisesMsg } from "./next-raises.js";
import { NOT_OWN, readIn, whereOf, you } from "./next.js";

const KEEP_MS = 60_000;
let kept: { home: string; at: number; judged: Judged[] } | null = null;
const realRead = (home: string) => readIn(home).judged;
let readJudged = realRead;
/** tests: the move-in's judge a test hands in (an invented disk; null: the real read); gives back the one before */
export function useJudged(f: ((home: string) => Judged[]) | null): () => void {
  const was = readJudged;
  readJudged = f ?? realRead; kept = null;
  return () => { readJudged = was; kept = null; };
}
/** the move-in's judge over the read, kept a minute (fresh: read again now) */
function judgedOf(home: string, fresh = false): Judged[] {
  if (fresh || !kept || kept.home !== home || Date.now() - kept.at > KEEP_MS) kept = { home, at: Date.now(), judged: readJudged(home) };
  return kept.judged;
}
/** the offers now; none before the move-in, and no read of the disk then */
export function offersNow(home: string, o: { all?: boolean; fresh?: boolean } = {}): Offer[] {
  const m = readMoveIn(home);
  return m ? offersOf(you(home), judgedOf(home, o.fresh), m, o) : [];
}

/** the offers as needs, candidates for J's judgment in the one list; a read that fails offers nothing */
export function tidyNeeds(sol: string, after = 0): ReturnType<typeof needOf>[] {
  try { return offersNow(sol).map((o, i) => needOf(o, after + i)); } catch { return []; }
}

/** J's way in for more needs (parts/next-calls.ts addNeeds); a tree without it builds and raises no offer */
const addNeeds = (calls as unknown as { addNeeds?: (f: (sol: string) => unknown[]) => () => void }).addNeeds;

export default function (p: Parts) {
  addNeeds?.((sol) => tidyNeeds(sol));
  const refuse = (h: Heard, asked: string, why: string) => h.send(h.ws, { type: "next.refused", asked, why });
  // every answer to the asker carries its rid back, so the face's asker (agents/model.ts) matches it
  const own = (type: string, f: (m: any, h: Heard) => unknown) => p.on(type, (m, h0) => {
    if (!uiNext()) return undefined;
    const rid = m?.rid !== undefined ? { rid: m.rid } : {};
    const h: Heard = { ...h0, send: (ws, o) => h0.send(ws, ws === h0.ws ? { ...o, ...rid } : o) };
    if (!h.fromSol) return refuse(h, type, NOT_OWN);
    return f(m, h);
  });
  /** after a change: every window draws the folders where they went; the asker hears its needs again */
  const changed = async (h: Heard) => {
    kept = null;
    const m = readMoveIn(h.HOME);
    h.everyone({ type: "next.movein.kept", movein: m, folders: keptFolders(m) });
    h.everyone(await stateMsg(whereOf(h.HOME)));
    h.send(h.ws, (await raisesMsg(h.HOME)).msg);
  };
  const offerOf = (h: Heard, id: unknown, all = false) => (typeof id === "string" ? offersNow(h.HOME, { fresh: true, all }).find((o) => o.id === id) : undefined);

  own("next.tidy", (_m, h) => h.send(h.ws, { type: "next.tidy", offers: offersNow(h.HOME, { fresh: true }) }));
  // a yes from the raise; an offer no longer there (made already, or the folder moved since) changes nothing
  own("next.tidy.yes", async (m, h) => {
    const o = offerOf(h, m.id, true);
    if (!o) return refuse(h, "next.tidy.yes", "that sort is not offered now");
    const r = runOffer(you(h.HOME), judgedOf(h.HOME), o, "raise");
    if (!r.ok) return refuse(h, "next.tidy.yes", r.why);
    h.send(h.ws, { type: "next.tidy.done", ...r, placed: undefined });
    await changed(h);
  });
  own("next.tidy.no", async (m, h) => {
    const o = offerOf(h, m.id);
    if (!o) return refuse(h, "next.tidy.no", "that sort is not offered now");
    h.send(h.ws, { type: "next.tidy.done", ...declineOffer(you(h.HOME), o), no: true });
    kept = null;
    h.send(h.ws, (await raisesMsg(h.HOME)).msg);
  });
  own("next.tidy.undo", async (m, h) => {
    const r = undoOffer(you(h.HOME), m);
    if (!r.ok) return refuse(h, "next.tidy.undo", r.why);
    h.send(h.ws, { type: "next.tidy.undone", ...r });
    await changed(h);
  });
  // "tidy my folders": every move to offer, made now, each its own batch so each has its own Undo
  own("next.tidy.run", async (_m, h) => {
    const judged = judgedOf(h.HOME, true), moves = [];
    for (const o of offersNow(h.HOME, { all: true })) {
      const r = runOffer(you(h.HOME), judged, o, "bar");
      if (r.ok) moves.push({ id: r.id, batch: r.batch, done: r.done, what: r.what });
    }
    h.send(h.ws, { type: "next.tidy.ran", moves });
    if (moves.length) await changed(h);
  });
}
