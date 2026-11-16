// The arrangement over the socket (#133, src/arrange.ts; moved from index.ts, #934)
//   arrange.get -> arrange.changed; arrange.set { patch }: a change is told to every face, a refusal only to the one that
//   asked, with its line; arrange.undo: the undo note's press, the agent's last change taken back, every face told;
//   arrange.used { counts }: a minute's presses on the rails, added in, no face told
import type { Parts } from "../parts.js";
import { arrangeMsg, setArrangement, undoArrangement, addUsage } from "../arrange.js";

export default function (p: Parts) {
  p.on("arrange.get", (_m, { ws, send }) => send(ws, arrangeMsg()));
  p.on("arrange.set", (m, { ws, send }) => {
    const r = setArrangement(m.patch);
    if (!r.ok) send(ws, { ...arrangeMsg(), refused: r.why });
  });
  p.on("arrange.undo", () => { undoArrangement(); });
  p.on("arrange.used", (m) => { addUsage(m.counts); });
}
