// An ask on the engine's link, answered by rid: for a page with no Cowork team to ask through (Settings, the anchor's
// tabs, Releases). Moved here from the timeline page when Releases replaced it (#1299).
import { link } from "../socket";
import { ENGINE } from "../useEngine";

export type Ask = <R = any>(type: string, body?: object, wait?: number) => Promise<R>;

/** the reads: asked again, with the same rid, when the link comes back up (#1415). A press is never asked twice. */
const READS = new Set(["cowork.shell.read", "team.people", "team.releases", "team.room"]);

export const askEngine: Ask = (type, body = {}, wait = 30_000) => new Promise((ok) => {
  const L = link(ENGINE), rid = crypto.randomUUID(), msg = { type, rid, ...body };
  let done = false, offLink: (() => void) | undefined;
  const end = (m: any) => { if (done) return; done = true; off?.(); offLink?.(); ok(m); };
  const off = L?.on((m) => { if (m?.rid === rid) end(m); });
  if (!L?.send(msg)) { end({ error: "not connected" }); return; }
  // #1415: the engine answers on the socket that asked. When the link swaps while the answer is in flight (a wake after
  // the engine paused, or the Mac slept), that answer goes to the dead socket; a read is asked again on the new link,
  // same rid, so whichever answer comes first is the one. onLink says the state at once, which is not a change.
  if (READS.has(type)) { let first = true; offLink = L.onLink((up) => { if (first) { first = false; return; } if (up && !done) L.send(msg); }); }
  window.setTimeout(() => end({ error: "no answer" }), wait);
});
