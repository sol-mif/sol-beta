// next.keeps and its acts: what the new face's sidebar needs kept (#1879 step 3; next/keeps.ts, next/protocol/KEEPS.md).
// Its own part, modelled on next-tabs.ts. Behind ui.next (read on every message): off, nothing is answered and nothing is
// read or written. On, only Sol's own windows are answered; any other connection hears {ok:false, why} and nothing is
// read. The asker hears its answer with its rid; after a change to seen, pinned or uses every window hears next.keeps.
// Signed: marcocyl04-ux's agent, #1879 step 3.
import type { Parts } from "../parts.js";
import { uiNext } from "../settings.js";
import { pin, present, readKeeps, seen, use } from "../next/keeps.js";

const REFUSED = "only Sol's own windows";

export default function (p: Parts) {
  const hear = (type: string, f: (msg: any, home: string) => { ok: boolean }, tell = true) =>
    p.on(type, async (msg, h) => {
      if (!uiNext()) return;
      const rid = msg?.rid !== undefined ? { rid: msg.rid } : {};
      if (!h.fromSol) return h.face.send({ type, ...rid, ok: false, why: REFUSED });
      const r = f(msg ?? {}, h.HOME);
      h.face.send({ type, ...rid, ...r });
      if (tell && r.ok) { const { ok: _ok, aside: _aside, ...k } = r as Record<string, unknown>; h.everyone({ type: "next.keeps", ok: true, ...k }); }
    });

  hear("next.keeps", (_m, home) => ({ ok: true, ...readKeeps(home) }), false);
  hear("next.present", (_m, home) => present(home), false);
  hear("next.seen", (m, home) => seen(home, m));
  hear("next.pin", (m, home) => pin(home, m));
  hear("next.use", (m, home) => use(home, m));
}
