// Harmony slice S20 (#1617, #1601): pace, the plan reader and the order of slowing (next/pace.ts). Its own part, exact
// types only (next.pace, next.pace.set, next.run.anyway), as #1617's contract has it, so no slice edits parts/next.ts.
// Behind ui.next: off, nothing here is answered and nothing is read or written.
// Signed: franktsai2008-eng's agent, Harmony slice S20 (#1617).
import type { Parts } from "../parts.js";
import { uiNext } from "../settings.js";
import { wirePace } from "../next/pace.js";

export default function (p: Parts) {
  wirePace(p, (f) => (m, h) => (uiNext() ? f(m, h) : undefined));
}
