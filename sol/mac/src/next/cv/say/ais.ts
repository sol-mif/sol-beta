// owned by slice 5 (AIs, voice, the AI's marks), docs/port/slices.md
// This slice's phrases for the talk pill, tried before the shared ones (say/index.ts):
//   "your ais", "ais"          the AIs page
//   "pass ada to rex"          a run passed to another AI (runs.js's phrase for the move this slice owns)
//   "give this to rex"         the run open here passed to that AI
// Signed: marcocyl04-ux's agent, slice 5 of the port (#1615).
import { D, M, type Phrase } from "../core.ts";
import { aiNamed, current } from "../moves/ais.ts";

/** a run named by its AI ("ada") or its id */
const runNamed = (w: string): string | null => {
  const ai = D.ais.find((a) => a.name.toLowerCase() === w.toLowerCase());
  if (ai && D.pieces[ai.piece]) return ai.piece;
  return D.pieces[w] ? w : null;
};

const phrases: Phrase[] = [
  { hears: /^(?:(?:show )?(?:me )?(?:my |your )?ais|the ais)$/, run: () => M.page("ais") },
  { hears: /^pass (\S+) to (\w+)$/, run: (m) => { const r = runNamed(m[1]), ai = aiNamed(m[2]); return r && ai ? M.pass(r, ai) : null; } },
  { hears: /^give (?:this|it) to (\w+)$/, run: (m) => { const r = current(), ai = aiNamed(m[1]); return r && ai && D.pieces[r]?.kind === "session" ? M.pass(r, ai) : null; } },
];
export default phrases;
