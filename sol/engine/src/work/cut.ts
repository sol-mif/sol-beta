// What a renew ends (#1566). A renew no longer waits for a Work run's background agents (busy.ts, Frank's call on
// #1341), and they do not survive it: the SDK starts its Claude Code process with piped stdio and never detaches it, so
// the engine's exit ends the process and every background Bash, Monitor and agent under it. A session waiting on one
// would wait for good, saying nothing. So the renew writes down, just before it exits, each run that had background
// work (its session, how it ran, the tasks by their descriptions), and the next engine, a few seconds after it is up,
// resumes each of those sessions with one line from Sol naming what was ended, so its agent starts again whatever still
// matters. The file is read once and removed; a record older than an hour is not acted on (the engine was down long).
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STATE_DIR } from "./state.js";

export type Cut = { sessionId: string; model: string; effort: string; mode: string; fast: boolean; tasks: string[]; at: number };
/** what is read of a live run (runs.ts Run) */
export type Cuttable = { id: string; model: string; effort: string; mode: string; fast: boolean; tasks: { description: string }[] };

const STALE_MS = 60 * 60_000;
const file = (dir = STATE_DIR) => join(dir, "cut-by-renew.json");

/** before the renew exits: the runs with background work, written down; returns how many (never throws) */
export function recordCut(runs: Cuttable[], now = Date.now(), dir = STATE_DIR): number {
  const cut: Cut[] = runs.filter((r) => r.tasks.length).map((r) => ({
    sessionId: r.id, model: r.model, effort: r.effort, mode: r.mode, fast: r.fast, tasks: r.tasks.map((t) => t.description || "a background task"), at: now,
  }));
  if (!cut.length) return 0;
  // a record the last engine had no time to read (two renews within seconds) is kept beside this one, never written over
  for (const c of takeCut(now, dir)) {
    const same = cut.find((x) => x.sessionId === c.sessionId);
    if (same) same.tasks = [...new Set([...c.tasks, ...same.tasks])]; else cut.push(c);
  }
  try {
    const tmp = file(dir) + ".tmp";
    writeFileSync(tmp, JSON.stringify(cut, null, 2) + "\n");
    renameSync(tmp, file(dir));
    return cut.length;
  } catch { return 0; }
}

/** at the next start: what the last renew ended, read once (the file goes), fresh records only */
export function takeCut(now = Date.now(), dir = STATE_DIR): Cut[] {
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(file(dir), "utf8")); } catch { return []; }
  rmSync(file(dir), { force: true });
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is Cut => !!c && typeof c.sessionId === "string" && Array.isArray(c.tasks) && typeof c.at === "number" && now - c.at < STALE_MS);
}

/** the line Sol sends the session: what was ended, and that nothing of it runs any more */
export function cutLine(c: Cut): string {
  const list = c.tasks.map((t) => `- ${t.replace(/\s+/g, " ").slice(0, 200)}`).join("\n");
  return `<a word from Sol>\nSol renewed its engine to a new build between your turns, and that ended your background work. None of it is running any more:\n${list}\nStart again whatever of it still matters (a wait, a watch, an agent); if none of it does, say so in a line.`;
}

/** the next engine resumes each session the last renew cut, a few seconds after it is up; returns a stop (tests) */
export function resumeCut(say: (c: Cut, text: string) => Promise<unknown>, delayMs = 5000, dir = STATE_DIR): () => void {
  const t = setTimeout(() => {
    for (const c of takeCut(Date.now(), dir)) {
      void say(c, cutLine(c)).then(
        () => console.log(`renew: told ${c.sessionId.slice(0, 8)} its background work was ended (${c.tasks.length})`),
        (err) => console.log(`renew: could not tell ${c.sessionId.slice(0, 8)} its background work was ended: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`),
      );
    }
  }, delayMs);
  t.unref?.();
  return () => clearTimeout(t);
}
