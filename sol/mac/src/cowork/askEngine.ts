// An ask on the engine's link, answered by rid: for a page with no Cowork team to ask through (Settings, the anchor's
// tabs, Releases). Moved here from the timeline page when Releases replaced it (#1299).
import { link } from "../socket";
import { ENGINE } from "../useEngine";

export type Ask = <R = any>(type: string, body?: object, wait?: number) => Promise<R>;

export const askEngine: Ask = (type, body = {}, wait = 30_000) => new Promise((ok) => {
  const L = link(ENGINE), rid = crypto.randomUUID();
  let done = false;
  const off = L?.on((m) => { if (m?.rid === rid && !done) { done = true; off?.(); ok(m); } });
  if (!L?.send({ type, rid, ...body })) { done = true; off?.(); ok({ error: "not connected" } as any); return; }
  window.setTimeout(() => { if (!done) { done = true; off?.(); ok({ error: "no answer" } as any); } }, wait);
});
