// Home's socket messages (home/wire.ts; moved from index.ts, #934): each type a Home unit answers (home.*, and thing.open),
// from Sol's own windows only (home.refused to any other), and nothing while home.whole or the frame is off
import type { Parts } from "../parts.js";
import { homeOn, homeSocket, homeTypes } from "../home/wire.js";
import { leftover } from "../leftover.js";

export default function (p: Parts) {
  if (leftover(import.meta.url)) return;   // built by a later release than the one running
  for (const type of homeTypes()) p.on(type, async (msg, { face, fromSol }) => { if (homeOn()) await homeSocket(face, msg, fromSol); });
}
