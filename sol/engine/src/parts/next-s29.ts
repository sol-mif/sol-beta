// next.context, next.fact.add, next.fact.propose, next.fact.keep, next.fact.remove: context, facts with sources, learned
// and stale (#1617 Harmony slice S29; next/context.ts, next/protocol/S29.md). Its own part, so no other slice's file is
// edited (#1617's contract: exact types only, never the "next." prefix). Behind ui.next (settings.ts uiNext(), read on
// every message): off, nothing here is answered and nothing is read or written. On, only Sol's own windows are answered
// (a person's facts are their own); any other connection hears {ok:false, why} and nothing is read.
// Signed: franktsai2008-eng's agent, Harmony slice S29 (#1617).
import type { Parts } from "../parts.js";
import { uiNext } from "../settings.js";
import { addFact, answer, contextOf, propose, remove } from "../next/context.js";

const REFUSED = "only Sol's own windows";

export default function (p: Parts) {
  const hear = (type: string, f: (msg: any, home: string) => object) =>
    p.on(type, (msg, h) => {
      if (!uiNext()) return;
      const rid = msg?.rid !== undefined ? { rid: msg.rid } : {};
      if (!h.fromSol) return h.face.send({ type, ...rid, ok: false, why: REFUSED });
      h.face.send({ type, ...rid, ...f(msg ?? {}, h.HOME) });
    });

  hear("next.context", (msg, home) => contextOf(home, msg.scope));
  hear("next.fact.add", (msg, home) => addFact(home, { place: msg.place, fact: msg.fact, source: msg.source, replaces: msg.replaces, offLimits: msg.offLimits }, "person"));
  hear("next.fact.propose", (msg, home) => propose(home, msg));
  hear("next.fact.keep", (msg, home) => answer(home, msg));
  hear("next.fact.remove", (msg, home) => remove(home, msg));
}
