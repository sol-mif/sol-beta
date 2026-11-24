// Share a setup (BR1 meta part 5, #1615; social/setup.ts; sol/PROTOCOL.md "Social: share a setup"):
//   next.social.setup.draft {}                      → { ok, card: { from, parts[] } }  every part this Sol could give
//   next.social.setup.send { code, picks[] }        → { ok, sent, to } | { ok:false, why }  into that friend room
//   next.social.setup.cards {}                      → { ok, cards[] (code, sha, from, at, parts) } | { ok:false, why }
//   next.social.setup.take { code, sha, picks[]? }  → { ok, plan?, fits[], made, from } | { ok:false, why }; then the
//                                                     windows hear agent.changed for each Home folder, and next.workspace.changed
//   next.social.setup.back { plan?, fits[] }        → { ok } | { ok:false, why }; the same tells
// Behind ui.next, like the rest of BR1's window: off, nothing here answers. Only Sol's own windows are answered.
// Signed: marcocyl04-ux's agent, BR1 people (#1615).
import type { Parts } from "../parts.js";
import { uiNext } from "../settings.js";
import { friendsDeps } from "../social/friends.js";
import { backTake, cards, draft, send, take } from "../social/setup.js";
import { foldersOf, plansOf } from "../next/workspace.js";

const REFUSED = "only Sol's own windows";

export default function (p: Parts) {
  const d = friendsDeps();
  const hear = (type: string, f: (msg: any, home: string) => Promise<object> | object, tells = false) =>
    p.on(type, async (msg, h) => {
      if (!uiNext()) return;
      const rid = msg?.rid !== undefined ? { rid: msg.rid } : {};
      if (!h.fromSol) return h.face.send({ type, ...rid, ok: false, why: REFUSED });
      try {
        const out = await f(msg ?? {}, h.HOME) as { ok?: boolean; plan?: string };
        h.face.send({ type, ...rid, ...out });
        if (!tells || !out.ok) return;
        // the Home folders the change made or took back are told as agent.sticky's own writes tell them
        const plan = plansOf(h.HOME).find((x) => x.id === (out.plan ?? msg?.plan));
        for (const folder of plan ? foldersOf(plan) : []) { h.everyone({ type: "agent.changed", folder }); h.everyone({ type: "agents.changed", folder }); }
        h.everyone({ type: "next.workspace.changed", id: plan?.id ?? "" });
      } catch (e) { h.face.send({ type, ...rid, ok: false, why: (e as Error).message }); }
    });
  hear("next.social.setup.draft", (_m, home) => { const hub = d.hub(); return { ok: true, card: draft(home, (hub && d.login(hub)) || "") }; });
  hear("next.social.setup.send", (m, home) => send(d, home, m.code, m.picks));
  hear("next.social.setup.cards", () => cards(d));
  hear("next.social.setup.take", (m, home) => take(d, home, m.code, m.sha, m.picks), true);
  hear("next.social.setup.back", (m, home) => backTake(home, m.plan, m.fits), true);
}
