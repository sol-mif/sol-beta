// The memory line (#1107, memory.ts): the heap, and the parts that can grow with time, on the log, so a growth names
// itself there. Started once the parts are loaded.
import type { Parts } from "../parts.js";
import { watchMemory } from "../memory.js";
import { largestBacklog } from "../backlog.js";
import { allRuns } from "../work/runs.js";

export default function (p: Parts) {
  p.atStart(() => {
    watchMemory(() => {
      const runs = allRuns();
      return { "largest backlog MB": largestBacklog() / 1048576, "work runs": runs.length, "their items": runs.reduce((n, r) => n + r.items.list.length, 0) };
    });
  });
}
