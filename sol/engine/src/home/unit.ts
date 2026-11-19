// Home's engine half (#790 and after; specs home-plan §4.2): the one shape every Home unit has, and the one context
// each handler is given. Types only: every unit imports from here, and from no other unit's file. A unit is a name,
// the messages it answers, what it does once when Home starts, and how an act of its kinds is undone (home.undo is
// routed by the act's kind to the unit that wrote it, R9). wire.ts holds the one list of units.
import type { Face } from "../browser.js";
import type { HomeEv, HomeLog } from "./log.js";
import type { Items, Thing } from "./items.js";

/** a sorter (design §7.8): one segment of Today in, the same ids in its order out. The engine checks the ids */
export type Sorter = { name: string; sort: (segment: Thing[]) => string[] };

export type Ctx = {
  home: string;                       // <HOME>, the engine's home folder
  log: HomeLog;                       // the log, through home/log.ts only
  items: Items;                       // the Thing store, <HOME>/items/
  now: () => number;
  all: (m: object) => void;           // every window (index.ts hands everyone())
  pushToday: () => void;              // Today computed again and sent to every window
  sorter?: Sorter;                    // a sorter other than the default (tests: there is no plugin sorter tonight)
};
export type Handler = (ctx: Ctx, face: Face, msg: any) => void | Promise<void>;
/** the undo of one act of this kind: called for every home.undo naming such an act, one already undone too (undo.ts
 *  isUndone tells), and answers its own family's state */
export type Reverser = (ctx: Ctx, face: Face, ev: HomeEv) => void | Promise<void>;
export type Unit = {
  name: string;
  handlers?: Record<string, Handler>;          // message type -> handler
  start?: (ctx: Ctx) => void;                   // once, when Home starts (reconcile, subscribe)
  reverse?: Record<string, Reverser>;           // event kind -> how its undo is done, and which family answers
};
