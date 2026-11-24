// next.fits, next.fit.set, next.fit.back: fits with an author, a reason and a hold (#1617 Harmony slice S15;
// next/fits.ts, next/protocol/S15.md). Its own part, so no other slice's file is edited (#1617's contract: exact types
// only, never the "next." prefix). Behind ui.next (settings.ts uiNext(), read on every message): off, nothing here is
// answered and nothing is read or written. On, only Sol's own windows are answered (a fit is the person's own); any
// other connection hears {ok:false, why} and nothing is read. Every write is the person's: Sol's own writes and offers
// go through next/fits.ts solSet and offer, never over the wire.
// Signed: franktsai2008-eng's agent, Harmony slice S15 (#1617).
import type { Parts } from "../parts.js";
import { uiNext } from "../settings.js";
import { back, fitsOf, personSet } from "../next/fits.js";

const REFUSED = "only Sol's own windows";

export default function (p: Parts) {
  const hear = (type: string, f: (msg: any, home: string) => object) =>
    p.on(type, (msg, h) => {
      if (!uiNext()) return;
      const rid = msg?.rid !== undefined ? { rid: msg.rid } : {};
      if (!h.fromSol) return h.face.send({ type, ...rid, ok: false, why: REFUSED });
      h.face.send({ type, ...rid, ...f(msg, h.HOME) });
    });

  hear("next.fits", (msg, home) => fitsOf(home, msg?.scope, msg?.folder));
  hear("next.fit.set", (msg, home) => personSet(home, msg ?? {}));
  hear("next.fit.back", (msg, home) => back(home, msg ?? {}));
}
