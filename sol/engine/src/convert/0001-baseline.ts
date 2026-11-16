// 0001: the baseline. Changes nothing; the runner writes data-version 1 after it, so every home starts counting here.
import type { Step } from "./run.js";

const step: Step = {
  id: 1,
  name: "baseline",
  touches: () => [],
  run: () => {},
};
export default step;
