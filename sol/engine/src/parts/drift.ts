// The iteration and drift (#1153, team/iteration.ts, team/drift.ts): the iteration read from this checkout's dev-* tags,
// and the latest `drift` word the runner on the NucBox said, kept on disk and added to #1150's count (runs.ts countMsg).
// GET /iteration → { name, sha, at } or { name: null }; GET /drift → the kept word, or { iteration: null }. Read-only.
// The word is kept only from a team person's login (docs/people) and only when newer than the one kept
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Parts } from "../parts.js";
import { iterationNow } from "../team/iteration.js";
import { startDrift, driftKept } from "../team/drift.js";
import { countMsg, peopleOf } from "../team/runs.js";

// the repository: sol/ is three up from src/parts/ under tsx, dist/parts/ when built
const TOP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
/** how often the iteration is read again, so the count names a new release's soon after it is fetched */
const READ_MS = 10 * 60_000;

export default function (p: Parts) {
  p.atStart(({ everyone }) => {
    let was: string | undefined;
    // the faces hear the count again when a word comes, or when the iteration read is a new one
    const again = (always: boolean) => { void iterationNow(TOP).then((it) => { if (always || it?.name !== was) everyone(countMsg()); was = it?.name; }); };
    startDrift(() => again(true), () => peopleOf(TOP).map((x) => x.login));   // a word only from a team person
    again(false);
    setInterval(() => again(false), READ_MS).unref();
  });
  p.route("GET", "/iteration", async ({ res }) => {
    const it = await iterationNow(TOP);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(it ?? { name: null }));
  });
  p.route("GET", "/drift", ({ res }) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(driftKept() ?? { iteration: null }));
  });
}
