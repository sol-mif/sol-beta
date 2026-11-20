// A fresh Home's start (#1686, gate one q3 of home.whole): with no record and no folder, Home has nothing to read and
// nothing to file into. It is not broken: the person's own AI makes the start, on these words, through base A's
// kickoff (src/kickoff.ts registerKickoff("home", homeStartLine), wired once base A is on main). Pure but for the reads.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readOwn, readRecordOf, solHomeOf } from "./rules.js";

/** the opening words for an empty Home (pure) */
export const HOME_START = "Help me set up my Home: ask me a few things about my life, then make its places and tell me how you will file what I write there.";
/** whether a Home is empty (pure over what it is given): no place in its record, no Home folder, no rule of its own, no folder it reads */
export const emptyHome = (o: { areas: number; solHome: string | null; rules: number; reads: number }): boolean =>
  o.areas === 0 && !o.solHome && o.rules === 0 && o.reads === 0;
/** the start's words when this Home is empty, else none */
export function homeStartLine(home: string, reads: number, user: string = homedir()): string | undefined {
  const rec = readRecordOf(user), h = solHomeOf(rec), real = (p: string) => (p === "~" ? user : p.startsWith("~/") ? join(user, p.slice(2)) : p);
  const areas = Array.isArray(rec?.areas) ? rec!.areas.length : 0;
  return emptyHome({ areas, solHome: h && existsSync(real(h)) ? h : null, rules: readOwn(home).file.length, reads }) ? HOME_START : undefined;
}
