// What each Sol runs (#1150, team/runs.ts): mine said on the relay, everyone's kept and counted for the release word.
// GET /runs is every Sol's latest word, read by the release runner on this machine an hour after a release to ping who
// is behind. Read-only
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Parts } from "../parts.js";
import { startRuns, runsNow } from "../team/runs.js";
import { offerNow, channelNow } from "../team/ship.js";

// sol/: from src/parts/ under tsx, dist/parts/ when built
const SOL = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export default function (p: Parts) {
  p.atStart(({ everyone }) => startRuns(SOL, everyone, () => offerNow()?.tag ?? "", channelNow));
  p.route("GET", "/runs", ({ res }) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ words: runsNow() }));
  });
}
