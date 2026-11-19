// owned by slice 2 (Needs), docs/port/slices.md
// The Needs phrases (#1615), tried before the shared ones (say/index.ts): later for the ask on the line, the fix of
// "too much", and the day's offer answered in words. "yes", "needs", "too much" and "undo the fix" are the shared
// chain's already (engine.js say). Signed: marcocyl04-ux's agent, slice 2 of the port (#1615).
import { M, lineAsk, type Phrase } from "../core.ts";
import { offerNow } from "../moves/needs.ts";

const phrases: Phrase[] = [
  { hears: /^(?:later|not yet)$/, run: () => { const id = lineAsk(); return id ? M.answer(id, "later") : null; } },
  { hears: /^(?:fold them|cap at 3|hold peeks|apply the fix)$/, run: () => M.applyFix() },
  { hears: /^(?:yes to the offer|keep the offer)$/, run: () => (offerNow() ? M.offer("yes") : null) },
  { hears: /^(?:not now)$/, run: () => (offerNow() ? M.offer("later") : null) },
  { hears: /^(?:never)$/, run: () => (offerNow() ? M.offer("never") : null) },
];
export default phrases;
