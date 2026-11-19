// A window's share of the one stage (#1090): the StageStore the stage draws from in this window, over the one the
// face always uses (stage/engineStore.ts). It reads the same blocks and keeps only those drawn here (model.ts share);
// a layout this window writes goes to the engine (the main window, the others' places kept) or to this window's own
// layout in the record (any other window). Everything else (a body, a freeze, a close, the ledger) passes through: it
// is the same block, one ledger, whichever window it is on.
import type { StageStore, Seen } from "../stage/store.ts";
import type { StageJson } from "../stage/model.ts";
import { share, layoutOut, type ScreensState, type Lay } from "./model.ts";

type Memo = { seen: Seen; s: ScreensState; out: Seen };

export function windowStore(base: StageStore, me: string, state: () => ScreensState, subState: ((f: () => void) => () => void) | undefined, lay: (session: string, places: Lay[]) => void, room?: () => { w: number; h: number }, onPoint?: (on: { id: string; title: string }[]) => void): StageStore {
  const memo = new Map<string, Memo>();
  const read = (session: string): Seen => {
    const seen = base.read(session), s = state(), m = memo.get(session);
    if (m && m.seen === seen && m.s === s) return m.out;
    const out = share(seen, s, me, session, room?.());
    memo.set(session, { seen, s, out });
    return out;
  };
  return {
    ...bindAll(base),
    read,
    subscribe(session, f) {
      const a = base.subscribe(session, f), b = subState?.(f);
      return () => { a(); b?.(); };
    },
    point(session, on) {
      base.point?.(session, on);
      if (!onPoint) return;
      const seen = base.read(session);
      onPoint(on.map((o) => ({ id: o.id, title: seen.blocks.find((b) => b.id === o.id)?.title ?? "" })));
    },
    place(session: string, next: StageJson) {
      const o = layoutOut(next, base.read(session).stage, state(), me);
      if (o.engine) base.place(session, o.engine);
      if (o.own) lay(session, o.own);
    },
  };
}
// the base's verbs, bound, so a spread keeps `this`
function bindAll(b: StageStore): StageStore {
  const out: Partial<StageStore> = {};
  for (const k of ["read", "subscribe", "compose", "place", "update", "freeze", "close", "point", "carry", "pull", "reopen"] as const) {
    const f = (b as unknown as Record<string, unknown>)[k];
    if (typeof f === "function") (out as Record<string, unknown>)[k] = f.bind(b);
  }
  return out as StageStore;
}
