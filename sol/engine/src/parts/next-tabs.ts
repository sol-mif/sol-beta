// next.tabs and its four acts: the tabs on top of the canvas (#1615 BR1; next/tabs.ts, next/protocol/TABS.md). Its own
// part, modelled on next-workspace.ts, so no other slice's file is edited. Behind ui.next (settings.ts uiNext(), read on
// every message): off, nothing here is answered and nothing is read or written. On, only Sol's own windows are answered
// (tabs are the person's own); any other connection hears {ok:false, why} and nothing is read. The asker hears its
// answer with its rid; after a change every window hears next.tabs, so a second window shows the same row.
// Signed: marcocyl04-ux's agent, BR1 tabs (#1615).
import type { Parts } from "../parts.js";
import { uiNext } from "../settings.js";
import { setTabsTool } from "../next/tabs-tool.js";
import { closeTab, frontTab, openTab, quietTabs, readTabs } from "../next/tabs.js";

const REFUSED = "only Sol's own windows";

export default function (p: Parts) {
  p.atStart((e) => setTabsTool(e.everyone));   // open_piece, take_to_tab, put_back (next/tabs-tool.ts) tell these windows
  const hear = (type: string, f: (msg: any, home: string) => { ok: boolean }, tell = true) =>
    p.on(type, async (msg, h) => {
      if (!uiNext()) return;
      const rid = msg?.rid !== undefined ? { rid: msg.rid } : {};
      if (!h.fromSol) return h.face.send({ type, ...rid, ok: false, why: REFUSED });
      const r = f(msg ?? {}, h.HOME);
      h.face.send({ type, ...rid, ...r });
      if (tell && r.ok) { const { ok: _ok, aside: _aside, closed: _closed, ...t } = r as Record<string, unknown>; h.everyone({ type: "next.tabs", ok: true, ...t }); }
    });

  hear("next.tabs", (_m, home) => { const { aside, ...t } = readTabs(home); return { ok: true, ...t, ...(aside ? { aside } : {}) }; }, false);
  hear("next.tab.open", (m, home) => openTab(home, m));
  hear("next.tab.close", (m, home) => closeTab(home, m));
  hear("next.tab.front", (m, home) => frontTab(home, m));
  hear("next.tab.quiet", (m, home) => quietTabs(home, m));
}
