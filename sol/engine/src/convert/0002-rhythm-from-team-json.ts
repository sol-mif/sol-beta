// 0002: the night job's hour and still-claim days leave team.json (#428). They were `night: { hour, staleDays }` there,
// one person's file; they are the project's rhythm now (`.sol/project.json` in the project's record, team/project.ts).
// A step runs before the engine and cannot reach a record, so the numbers go to `night.json` beside team.json, where
// the night job reads them and where the project's settings take them as their starting values until the record has
// its own. night.json is written first and team.json after, so a stop between the two runs again to the same end.
// What it can and cannot see: data-version counts the home (SOL_HOME), but team.json is the engine folder's, so the step
// converts the team.json of the engine that runs it, `<engine>/team.json`. A home already at 2 that meets another
// team.json still holding `night` (an engine run with SOL_TEAM elsewhere, a new folder given an old file, a file put back
// by hand) is not converted again; nightfile.ts reads that left-over `night` instead (leftNight), so nothing is lost.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Step } from "./run.js";
import { cleanNight, NIGHT_DEFAULT, NIGHT_FILE_NAME, writeNightFile } from "../team/nightfile.js";

function hasNight(f: string): boolean {
  try { const raw: unknown = JSON.parse(readFileSync(f, "utf8")); return !!raw && typeof raw === "object" && !Array.isArray(raw) && "night" in raw; }
  catch { return false; }
}

const step: Step = {
  id: 2,
  name: "rhythm-from-team-json",
  // nothing to move (a fresh install, a team.json without night): nothing to copy either
  touches: (c) => (hasNight(join(c.engine, "team.json")) ? [join(c.engine, "team.json"), join(c.engine, NIGHT_FILE_NAME)] : []),
  run: (c) => {
    const f = join(c.engine, "team.json");
    if (!existsSync(f)) return;   // a fresh install: nothing to move
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(f, "utf8")); } catch { return; }   // a file that is not JSON is read as none by settings.ts; left as it is
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || !("night" in raw)) return;
    const { night, ...rest } = raw as Record<string, unknown>;
    writeNightFile(join(c.engine, NIGHT_FILE_NAME), cleanNight(night) ?? { ...NIGHT_DEFAULT }, "team.json");
    writeFileSync(f + ".tmp", JSON.stringify(rest, null, 2) + "\n", { mode: 0o600 });
    renameSync(f + ".tmp", f);
  },
};
export default step;
