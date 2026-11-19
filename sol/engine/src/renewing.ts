// The engine's renew, wired (#1566): renew.ts goes live between two turns (busy.ts betweenTurns, named by turnLine),
// its cap's clock starting at the release word when the build came from one (team/ship.ts releaseWaitFrom); the
// background work it ends is written down just before the exit, and the next engine tells each session (work/cut.ts).
// Its own file so index.ts does not grow (parts.test.ts).
import { renewOnBuild } from "./renew.js";
import { betweenTurns, turnLine } from "./busy.js";
import { releaseWaitFrom } from "./team/ship.js";
import { allRuns, type WorkSay } from "./work/runs.js";
import { sayWork } from "./work/wire.js";
import { recordCut, resumeCut } from "./work/cut.js";
import { isQuiet } from "./quiet.js";

/** index.ts, once the engine listens: watch `dist`, tell every face; resume what the last renew cut */
export function startRenew(dist: string, everyone: (o: object) => void): void {
  renewOnBuild(dist, betweenTurns, everyone, turnLine, undefined, {
    since: releaseWaitFrom,
    before: () => { const n = recordCut(allRuns()); if (n) console.log(`renew: ${n} session${n > 1 ? "s" : ""} had background work; the next engine tells ${n > 1 ? "them" : "it"}`); },
  });
  if (!process.env.SOL_NO_RENEW && !isQuiet()) resumeCut((c, text) => sayWork({ sessionId: c.sessionId, text, model: c.model, effort: c.effort, mode: c.mode as WorkSay["mode"], fast: c.fast }));
}
