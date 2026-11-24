// See what's at work (BR1 item 7), on the wire: next/atwork.ts holds and lets go, over the engine's runs (work/runs.ts
// hold) and automations. Behind the switch ui.next as parts/next-work.ts is; only Sol's own windows are answered.
// Signed: marcocyl04-ux's agent (builder F), BR1 item 7 (#1615).
import type { Heard, Parts } from "../parts.js";
import { uiNext } from "../settings.js";
import { allRuns, getRun } from "../work/runs.js";
import { autosMsg } from "../next/automations.js";
import { atworkMsg, goAll, holdAll } from "../next/atwork.js";
import { NOT_OWN } from "./next.js";

export default function (p: Parts) {
  const refuse = (h: Heard, asked: string, why: string) => h.send(h.ws, { type: "next.refused", asked, why });
  const tell = (h: Heard) => h.everyone(atworkMsg(h.HOME, allRuns()));
  const own = (type: string, f: (m: any, h: Heard) => unknown) => p.on(type, (m, h) => {
    if (!uiNext()) return undefined;
    if (!h.fromSol) return refuse(h, type, NOT_OWN);
    return f(m ?? {}, h);
  });

  own("next.atwork.get", (_m, h) => h.send(h.ws, atworkMsg(h.HOME, allRuns())));
  own("next.atwork.pause", (m, h) => {
    const r = getRun(String(m.sessionId ?? ""));
    if (!r || !r.working) return refuse(h, "next.atwork.pause", "That session is not working now, so there is nothing to pause.");
    r.hold(true);
    tell(h);
  });
  own("next.atwork.hold", (m, h) => {
    const r = holdAll(h.HOME, m, getRun);
    if (!r.ok) return refuse(h, "next.atwork.hold", r.why);
    tell(h);
    if (r.held.autos.length) h.everyone(autosMsg(h.HOME));
  });
  own("next.atwork.go", (m, h) => {
    if (typeof m.sessionId === "string" && m.sessionId) getRun(m.sessionId)?.hold(false);
    else if (goAll(h.HOME, getRun).autos) h.everyone(autosMsg(h.HOME));
    tell(h);
  });
}
