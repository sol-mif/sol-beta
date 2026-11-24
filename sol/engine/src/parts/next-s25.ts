// Harmony slice S25 (#1617): replay readings over the Diary (next/reading.ts), read only. Its own part, exact type only
// (next.replay), as #1617's contract has it, so no slice edits parts/next.ts. The places' ranks are slice 7a's needs
// (parts/next-calls.ts needsList). Behind ui.next: off, nothing here is answered and nothing is read.
// Signed: franktsai2008-eng's agent, Harmony slice S25 (#1617).
import type { Parts } from "../parts.js";
import { uiNext } from "../settings.js";
import { wireReading } from "../next/reading.js";
import { needsList } from "./next-calls.js";

export default function (p: Parts) {
  wireReading(p, (f) => (m, h) => (uiNext() ? f(m, h) : undefined), needsList);
}
