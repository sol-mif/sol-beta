// The team strip (#1167): the top of Cowork's system view, one reading of where the team stands against the iteration
// (#1153). It joins what this engine already keeps and adds nothing to it:
//   the iteration   the newest dev-* tag (iteration.ts), with when it went out
//   each person     docs/people (runs.ts peopleOf), never a list in code. ✓ when every one of their Sols that spoke
//                   within a week runs the iteration (runs.ts whoHas); else which release they run and how many
//                   iterations went out after it (the release word, team/runs.ts, heard on the relay)
//   their drift     the latest `drift` word (drift.ts driftKept): files in their */mine off the iteration and iterations
//                   missed, and their open PRs. The word carries each file and PR when the runner sent them; on the
//                   machine that ran it (the NucBox) drift.json fills them in when the word does not
//   the clock       the next drift run (the rhythm's release + 15 minutes) and integrate run (release − 2 hours), from
//                   .sol/rhythm.json, as the timers are written (drift.ts driftCalendar, integrate.ts integrateCalendar)
// What each person touched last is the face's: it already holds the work under way (work.systems.live, #1156).
// Read-only: nothing here writes, posts or asks GitHub. The pure join is stripOf; readStrip reads the files around it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { releaseTag } from "../version.js";
import { STATE_DIR } from "../work/state.js";
import { DEV_TAG } from "./release.js";
import { whoHas, type Person, type RunsWord } from "./runs.js";
import { driftCalendar, type DriftFile, type DriftWord } from "./drift.js";
import { integrateCalendar } from "./integrate.js";
import { parseRhythm, RHYTHM_PATH } from "./tonight.js";
import type { DevTag, Iteration } from "./iteration.js";

export type StripFile = { path: string; age: number };
export type StripPr = { pr: number; files: number };
export type StripRun = { machine: string; tag: string; behind: number; branch: "dev" | "mine"; at: number };
export type StripPerson = {
  login: string; name: string; prefix: string;
  /** ✓: every Sol of theirs heard within a week runs the iteration */
  on: boolean;
  /** why not, when not: "off" (no Sol heard), "build", "restart", … (runs.ts Why); "no iteration" when this checkout
   *  has no dev-* tag, so nobody can be on it or off it */
  why?: string;
  /** each of their Sols, newest word first: the release it runs and how many iterations went out after it */
  runs: StripRun[];
  /** the drift word for this iteration: null when none was heard for it */
  drift: { off: number; iterations: number; openOff: number; openIterations: number; prs: number | null; files: StripFile[] | null; open: StripPr[] | null } | null;
};
export type Strip = {
  iteration: Iteration | null;
  /** when the drift word was measured, or null */
  driftAt: number | null;
  /** the word was measured against an older iteration than this one */
  driftOld: string | null;
  people: StripPerson[];
  /** the clock lines: "09:15", "07:00", and the zone */
  next: { drift: string; integrate: string; zone: string } | null;
  at: number;
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const clock = (cal: string) => /\b(\d{2}:\d{2}):00\b/.exec(cal)?.[1] ?? "";

/** how many iterations went out after `tag` (pure): dev-* tags newer than it by releaseTag's order; 0 for an unknown */
export function behindOf(tag: string, tags: Pick<DevTag, "name">[]): number {
  if (!DEV_TAG.test(tag)) return 0;
  return tags.filter((t) => t.name !== tag && DEV_TAG.test(t.name) && releaseTag([t.name, tag]) === t.name).length;
}

/** the strip (pure): the people in their order, each with ✓ or their release and drift; the drift file (only on the
 *  machine that ran it) fills a person's files and PRs when the word did not carry them, for the same iteration */
export function stripOf(a: {
  people: Person[]; iteration: Iteration | null; tags: Pick<DevTag, "name">[]; words: RunsWord[]; word: DriftWord | null;
  file?: DriftFile | null; rhythm?: { release: string; zone?: string } | null; now?: number;
}): Strip {
  const now = a.now ?? Date.now(), it = a.iteration?.name ?? "";
  const has = it ? whoHas(a.people, it, a.words, now) : [];
  const word = a.word && it && a.word.iteration === it ? a.word : null;
  const file = a.file && it && a.file.iteration?.name === it ? a.file : null;
  const people = a.people.map((p): StripPerson => {
    const h = has.find((x) => same(x.login, p.login));
    const latest = new Map<string, RunsWord>();
    for (const w of a.words) if (same(w.person, p.login) && now - w.at < 7 * 24 * 3600_000) { const was = latest.get(w.machine); if (!was || w.at >= was.at) latest.set(w.machine, w); }
    const runs = [...latest.values()].sort((x, y) => y.at - x.at).map((w) => ({ machine: w.machine, tag: w.tag, behind: behindOf(w.tag, a.tags), branch: w.branch, at: w.at }));
    const w = word?.people.find((x) => same(x.person, p.login));
    const f = file?.people.find((x) => same(x.login, p.login));
    // the whole lists where this machine measured them (drift.json), else what the word carried (it may be cut short)
    const files = f?.mine.map((m) => ({ path: m.path, age: m.age })) ?? w?.mine ?? null;
    const open = f?.open.map((o) => ({ pr: o.pr, files: o.files.length })) ?? w?.open ?? null;
    const prs = f ? f.open.length : typeof w?.prs === "number" ? w.prs : open ? open.length : null;
    const c = w ?? f;
    const drift = c ? { off: c.off, iterations: c.iterations, openOff: c.openOff, openIterations: c.openIterations, prs, files, open } : null;
    return { login: p.login, name: p.name, prefix: p.prefix ?? "", on: !!h?.has, ...(!it ? { why: "no iteration" } : h && !h.has && h.why ? { why: h.why } : {}), runs, drift };
  });
  const r = a.rhythm;
  const next = r?.release && /^\d{2}:\d{2}$/.test(r.release)
    ? { drift: clock(driftCalendar(r)), integrate: clock(integrateCalendar({ release: r.release, zone: r.zone ?? "" })), zone: r.zone ?? "" } : null;
  const heard = word ?? a.word;
  return {
    iteration: a.iteration, driftAt: word?.at ?? (file ? file.at : null),
    driftOld: !word && !file && heard && heard.iteration !== it ? heard.iteration : null,
    people, next, at: now,
  };
}

/** the drift file this machine wrote, when it ran the measure (the NucBox), else null */
export function driftFileHere(): DriftFile | null {
  try { return JSON.parse(readFileSync(process.env.SOL_DRIFT_FILE ?? join(STATE_DIR, "drift.json"), "utf8")) as DriftFile; } catch { return null; }
}
/** the team's rhythm from the checkout at `top`, or null */
export function rhythmHere(top: string): { release: string; zone?: string } | null {
  try { return parseRhythm(readFileSync(join(top, RHYTHM_PATH), "utf8")); } catch { return null; }
}
