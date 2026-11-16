// dictated (#110; moved from index.ts, #934): the notch typed a dictation into an app; one line in
// home/voice/dictations/<day>.jsonl (src/dictations.ts). No answer
import type { Parts } from "../parts.js";
import { storeDictation } from "../dictations.js";

export default function (p: Parts) {
  p.on("dictated", (msg, { HOME }) => {
    try { storeDictation(HOME, msg); } catch (err) { console.log(`dictated: not stored: ${err instanceof Error ? err.message : err}`); }
  });
}
