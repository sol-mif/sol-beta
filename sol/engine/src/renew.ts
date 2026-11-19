// Renew (2026-10-16). Marco: "I don't want to have to keep running launchctl kickstart". The engine watches its own
// build (dist/): when a file there changes, it waits for a quiet moment (no Life turn and no Work run busy) and exits
// cleanly; launchd's KeepAlive brings it back within three seconds, and every window reconnects on its own
// (mac/src/socket.ts, within a second or two). A `tsc --watch` under launchd (launchd/com.marco.sol-engine-build.plist) turns an edit to
// src/ into dist/ by itself, so the chain is: edit → build → renew, nothing typed. The windows hear "renewing" first
// so they say so instead of "engine down". Never mid-turn: `idle` is busy.ts's `betweenTurns`, every long job joins the
// counter, and a Work run's background agents join it as background work, which does not hold a renew (#1566, Frank's
// call on #1341: a resting session with a 2 h background Bash held a build for up to 2 h; on Marco's Mac 66 of 119
// renews waited, p90 78 min). A renew ends that background work, so `before` writes it down just before the exit and the
// next engine tells each session (work/cut.ts). Quiet means SETTLE_MS with no turn in flight. A wait is capped at
// CAP_MS (30 min), counted from when the changed build first waited, or from the release word when Ship says (`since`):
// past it, a breath with no turn in flight (CAPPED_SETTLE_MS) is enough, a turn boundary of any session, never mid-turn
// (the cap of 2026-10-16 ended a Work turn mid-answer; this one never does), and `engine.renew.waiting` says `capped`.
// While it waits, the log and the windows name the turns that hold it, once a minute.
// A rewrite that changes nothing (tsc's first pass at login writes every file again, byte for byte) is not a change:
// the build is hashed when the engine starts, and a file counts only when its content differs from that.
// That hash is taken once the engine is listening, after its files were read (#39): a file written from 3 s before the
// process started on may be newer than what it loaded, so it counts as changed and the first quiet moment re-reads it
// (at most one extra renew). The keeper waits for a quiet dist/ before it starts node, so this is rare.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, watch } from "node:fs";
import { join, resolve } from "node:path";
import { isQuiet } from "./quiet.js";

const QUIET_MS = 2500, POLL_MS = 1000, SAY_MS = 60_000, SETTLE_MS = 5000, LANDING_MS = 3000;
export const CAP_MS = 30 * 60_000, CAPPED_SETTLE_MS = 1000;
const BUILT = /\.(js|json)$/;

function digest(file: string): string | null {
  try { return createHash("sha1").update(readFileSync(file)).digest("hex"); } catch { return null; }   // gone, or mid-write
}

function snapshot(dir: string, out = new Map<string, string>()): Map<string, string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    try {
      if (statSync(p).isDirectory()) snapshot(p, out);
      else if (BUILT.test(name)) { const h = digest(p); if (h) out.set(p, h); }
    } catch {}
  }
  return out;
}

// opts: shorter waits and another start time, for tests; `since`: an earlier start for the cap's clock (the release
// word this build came from, team/ship.ts), 0 for none; `before`: run once just before the exit (the cut's record).
// Returns a stop (tests; the engine never stops watching).
type Opts = { quietMs?: number; pollMs?: number; settleMs?: number; startedAt?: number; capMs?: number; cappedSettleMs?: number; since?: () => number; before?: () => void };
export function renewOnBuild(dist: string, idle: () => boolean, tell: (o: object) => void, who: () => string = () => "", exit: () => void = () => process.exit(0), opts: Opts = {}): () => void {
  if (process.env.SOL_NO_RENEW || isQuiet()) return () => {};
  const { quietMs = QUIET_MS, pollMs = POLL_MS, settleMs = SETTLE_MS, startedAt = performance.timeOrigin, capMs = CAP_MS, cappedSettleMs = CAPPED_SETTLE_MS } = opts;
  const root = resolve(dist);
  const known = snapshot(root);
  const touched = new Set<string>();
  let timer: NodeJS.Timeout | null = null, said = 0, calm = 0, waitFrom = 0, saidCapped = false;
  // a build still landing when this process started: maybe not what it loaded, so not part of the baseline
  for (const f of known.keys()) {
    try { if (statSync(f).mtimeMs >= startedAt - LANDING_MS) { known.delete(f); touched.add(f); } } catch {}
  }
  const differs = () => [...touched].some((f) => digest(f) !== (known.get(f) ?? null));
  const go = () => {
    if (!differs()) { touched.clear(); waitFrom = 0; return; }   // the same build written again: nothing to renew
    const now = Date.now();
    waitFrom ||= now;
    const from = Math.min(waitFrom, opts.since?.() || Infinity);
    const capped = now - from >= capMs;
    if (!idle()) {
      calm = 0;
      if (now - said >= SAY_MS || (capped && !saidCapped)) {
        said = now; saidCapped ||= capped;
        const w = who();
        console.log(`renew: a new build waits on ${w || "a job"}${capped ? `; past the ${Math.round(capMs / 60_000)}-minute cap, it goes live at the next turn boundary` : ""}`);
        tell({ type: "engine.renew.waiting", jobs: w, ...(capped ? { capped: true } : {}) });
      }
      timer = setTimeout(go, pollMs); return;
    }
    // idle for one instant is not a quiet moment: a Work run between a result and the turn queued behind it, or a
    // face that just reconnected and is about to say again, reads idle for a breath. Quiet means SETTLE_MS of it (#17);
    // past the cap, a breath of it: the next turn boundary (#1566)
    if (!calm) calm = now;
    if (now - calm < (capped ? cappedSettleMs : settleMs)) { timer = setTimeout(go, pollMs); return; }
    const waited = Math.round((now - from) / 60_000);
    console.log(`renew: the build changed, going live with it${waited ? ` (it waited ${waited} min${capped ? ", capped" : ""})` : ""}`);
    try { opts.before?.(); } catch { /* the record is a courtesy; the renew goes on */ }
    tell({ type: "engine.renewing" });
    setTimeout(exit, 300);   // the word gets out before the socket closes
  };
  const changed = (name: string | null) => {
    if (!name || !BUILT.test(name)) return;
    touched.add(join(root, name));
    if (timer) clearTimeout(timer);
    timer = setTimeout(go, quietMs);   // a build writes many files; wait for the last
  };
  if (touched.size) timer = setTimeout(go, quietMs);
  let watcher: ReturnType<typeof watch> | null = null;
  try {
    watcher = watch(root, { recursive: true }, (_ev, name) => changed(typeof name === "string" ? name : null));
  } catch (err) {
    console.log("renew: cannot watch the build:", err instanceof Error ? err.message : String(err));
  }
  return () => { watcher?.close(); if (timer) clearTimeout(timer); };
}
