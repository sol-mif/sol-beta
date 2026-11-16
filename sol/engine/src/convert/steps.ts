// Every conversion step, in order (src/convert/run.ts). A new step is a new file `NNNN-name.ts` beside this one and one
// line here; test/convert.test.ts checks this list against the folder.
import type { Step } from "./run.js";
import s0001 from "./0001-baseline.js";
import s0002 from "./0002-rhythm-from-team-json.js";

export const STEPS: Step[] = [s0001, s0002];
