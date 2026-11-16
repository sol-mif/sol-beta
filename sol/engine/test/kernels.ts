// A kernel a test made and did not stop keeps its file's process from ending: a worker's output, once read, holds the
// process until the worker ends. A check that fails before the test's own stop() would then hang the file, and the
// whole run with it, where it should be one red test (on a runner with no time limit that is hours).
// So a test file takes its Kernel from here: the same class, and every one the file made is stopped when the file ends,
// whatever a check said before.
import { after } from "node:test";
import { Kernel as Real } from "../src/kernel.ts";

const made: Real[] = [];
export class Kernel extends Real {
  constructor(...a: ConstructorParameters<typeof Real>) { super(...a); made.push(this); }
}
after(async () => {
  // stopped twice is stopped once; five seconds at most each, so a kernel that will not stop is not a hang of its own
  for (const k of made) await Promise.race([k.stop().catch(() => {}), new Promise((r) => setTimeout(r, 5000).unref())]);
});
