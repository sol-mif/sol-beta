// An orchestration session's renewal as the side shows it (2026-11-14, Marco: "smoothly transition over to a new
// orchestration session and bring existing sessions over, ... reflect through our ux and ui in the sidebar properly with
// the correct hierarchies ... done mechanically"). The engine does the move itself (one.ts finishOrch: the fresh copy
// takes the title, the pin, its place under its own orchestrator, the stage, and every session under the old one; the
// old copy is archived as "<title>, until <date>"). This file is the face's part: hear work.one.kept, say which rows are
// handing over, and tell the side each renewal once so the view follows and the open fold stays open.
import { useEffect, useRef, useState } from "react";
import { link } from "../socket";
import { ENGINE } from "../engine";

import { freshRenewals, handingOver, type OrchKept } from "./sideRenewals";
export type { OrchKept };

const L = typeof WebSocket === "undefined" ? null : link(ENGINE);
let rid = 0;
/** ask the engine for a fresh copy of an orchestration session now (work.one.renew, "asked") */
export function renewNow(sessionId: string) { L?.send({ type: "work.one.renew", sessionId, rid: `side-renew-${++rid}` }); }

/** the rows handing over, and `onRenewed(from, to)` once per renewal heard after the side opened (the first word the
 *  engine sends marks what came before as seen, so an old renewal never moves the view) */
export function useOrchKept(onRenewed: (from: string, to: string) => void): Set<string> {
  const [hand, setHand] = useState<Set<string>>(() => new Set());
  const cb = useRef(onRenewed); cb.current = onRenewed;
  useEffect(() => {
    const seen = new Set<string>();
    let first = true;
    const off = L?.on((m: any) => {
      if (m?.type !== "work.one.kept" || !Array.isArray(m.orchestrators)) return;
      const list = m.orchestrators as OrchKept[];
      const fresh = freshRenewals(list, seen);
      if (!first) for (const r of fresh) cb.current(r.from, r.to);
      first = false;
      const h = handingOver(list);
      setHand((was) => (was.size === h.size && [...h].every((x) => was.has(x)) ? was : h));
    });
    L?.send({ type: "work.one.kept", rid: `side-kept-${++rid}` });
    return () => off?.();
  }, []);
  return hand;
}
