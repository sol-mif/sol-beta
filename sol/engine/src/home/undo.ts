// Undo (#790; R3, R9 of specs home-plan §2): never an edit of the log, always a new, reverse event whose cause is the
// act's id (the receipt's ledgerId) and whose value says undo: true. An act is undone if and only if such an event
// exists; a second undo of it writes nothing and still answers the state.
//   home.undo {ledgerId}   the act is found on the log by its id, and its kind's reverser (a unit's `reverse`, wire.ts
//                          builds the table) undoes it and answers its own family. An id the log does not have, or one
//                          no unit reverses, is answered with Today's plain state
//   today.answer           the Thing goes back to the version it had before the answer, but only while it is still the
//                          version the answer made; otherwise the undo is refused, nothing written, the state answered
//   today.later            today.later {undo: true}: the press no longer counts
//   an undo's own id       nothing, but where the unit that wrote it reverses "undo <kind of the act it undid>" (Home 6)
// Today's undo answers home.today to every window, and no receipt (the face clears its own).
import { UndoAsk } from "../contract/home/today.js";
import { putThing, verOf } from "./items.js";
import { YOU, type HomeEv } from "./log.js";
import { sendToday } from "./today.js";
import type { Ctx, Handler, Reverser } from "./unit.js";

let REVERSE: ReadonlyMap<string, Reverser> = new Map();
/** the reverse table, from every unit's `reverse` (wire.ts) */
export const setReverse = (m: ReadonlyMap<string, Reverser>): void => { REVERSE = m; };

const isUndo = (e: HomeEv): boolean => (e.value as { undo?: unknown } | undefined)?.undo === true;
/** whether the act of this id has its reverse event on the log */
export const isUndone = (ctx: Ctx, id: string): boolean => ctx.log.all().some((e) => e.cause === id && isUndo(e));

/** home.undo {ledgerId}: to the unit that reverses the act's kind. An undo is no act to undo, but where the unit that
 *  undid it says how under "undo <the undone act's kind>" (the ledger's undo of one of Sol's acts, which the face can
 *  undo again: face-wire §8.2, Home 6) */
export const routeUndo: Handler = async (ctx, face, msg) => {
  const m = UndoAsk.safeParse(msg);
  if (!m.success) return sendToday(ctx, face);
  const evs = ctx.log.all(), ev = evs.find((e) => e.id === m.data.ledgerId);
  const rev = !ev ? undefined : !isUndo(ev) ? REVERSE.get(ev.kind) : REVERSE.get(`undo ${evs.find((e) => e.id === ev.cause)?.kind ?? ""}`);
  if (!ev || !rev) return sendToday(ctx, face);
  await rev(ctx, face, ev);
};

/** the undo of an answer: the Thing's change it caused, put back */
export const undoAnswer: Reverser = (ctx, face, ev) => {
  if (isUndone(ctx, ev.id)) return sendToday(ctx, face);
  const change = ctx.log.all().find((e) => e.cause === ev.id && (e.kind === "thing.state" || e.kind === "thing.done") && !isUndo(e));
  const v = change?.value as { ver?: string; from?: string } | undefined;
  const cur = change?.item ? ctx.items.get(change.item) : null;
  const was = cur && v?.from ? ctx.items.version(cur.id, v.from) : null;
  // refused, nothing written: the answer changed nothing of the Thing (a hook took it), or the Thing changed since
  if (!cur || !was || verOf(cur) !== v?.ver) return sendToday(ctx, face);
  putThing(ctx, was, { cause: ev.id, undo: true, by: YOU });
  ctx.pushToday();
};

/** the undo of a later: the press no longer counts */
export const undoLater: Reverser = (ctx, face, ev) => {
  if (isUndone(ctx, ev.id) || !ev.item) return sendToday(ctx, face);
  ctx.log.write({ kind: "today.later", item: ev.item, value: { undo: true }, cause: ev.id, by: YOU });
  ctx.pushToday();
};
