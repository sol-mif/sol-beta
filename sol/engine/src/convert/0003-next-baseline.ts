// 0003: the new face's baseline (#1615). Changes nothing; after it, data-version 3 says "the new face's stores are
// counted from here", so the first step that changes one of them is 0004 and copies the files it touches first.
// The stores, all under SOL_HOME/next/ (their owners in SHAPES.next): pos.json, zones.json, context.json, fits.json,
// movein.json, back.json, pace/{claude,take,anyway,waits}.json, diary/<day>.jsonl and diary/pause.json.
// It copies nothing on purpose: going back over a step puts back the copy taken before it, and a copy here would only
// throw away what was saved since, for no change to undo.
import type { Step } from "./run.js";

const step: Step = {
  id: 3,
  name: "next-baseline",
  touches: () => [],
  run: () => {},
};
export default step;
