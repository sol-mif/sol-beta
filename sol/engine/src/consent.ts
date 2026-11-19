// What the person allowed (#1216): the engine's read of the consent record in the person's record,
// `~/.sol/record/me.json` → `consent` (written by the face: sol/mac/src/onboard/consent.ts, which holds the shape). The
// engine only reads it, at each turn's start, and refuses past it by name:
//   levels   how hands-on per folder, by the folder's id under the record's solHome: record · show · draft · do.
//            record: the folder's agent looks and writes down what it would do; every tool that acts is refused.
//            show and draft: it works up to the send; every tool that sends or presses in a page is refused.
//            do: nothing is refused here (the site guards, watch mode and Home's ceiling still stand).
//   sources  a source by name, "yes" or "no" (#1217): a named one (github, notes …) or `account:<service>`, a service of
//            the Claude account (#1229). A "no" is "not here": sourcesOff reads it for the read turn's guard
//            (connectors.ts) on every switch setting, and setSource writes it on the person's word (reads.ts, #1656).
// A folder the record does not name is not this file's to judge: nothing is refused here. A record from before the
// consent field (no `consent`) is read at its one `hands`, which is what the onboarding wrote into every folder then.
// A record that will not read cannot say which folder is which, so it refuses nothing here; the folder's agent keeps its
// rung from policy.md (written at the same level) and every other guard.
import { randomUUID } from "node:crypto";
import { readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type Level = "record" | "show" | "draft" | "do";
export const LEVELS: readonly Level[] = ["record", "show", "draft", "do"];
/** where the record lives, from the person's home */
export const RECORD = ".sol/record/me.json";
/** the agent harness's rungs (agent/harness.ts RUNGS) for a level: "do" stays at draft, as the onboarding wrote it */
export const rungOfLevel = (l: Level): "read" | "propose" | "draft" => (l === "record" ? "read" : l === "show" ? "propose" : "draft");

/** the tools that only look: allowed at every level */
const LOOKS = new Set(["browser_open", "browser_read", "browser_find", "browser_screenshot", "browser_back", "desk_read", "agents_room"]);
/** the tools that send past the person or press in a page: refused below "do" */
const SENDS = new Set(["talk", "ask_agent", "ask_turn_on", "hand_over", "offer_take", "hand_reply", "browser_click", "browser_type"]);

const say: Record<Level, string> = {
  record: "record only: look and write down what you would do; act on nothing",
  show: "show me first: do the work up to the send; the person presses",
  draft: "draft: make it in the folder; sending is the person's",
  do: "do",
};

/** the reason a tool is refused at a level, naming the record, or null (pure) */
export function consentRefusal(level: Level | null, tool: string, folder = "this folder"): string | null {
  if (!level || level === "do") return null;
  const name = tool.replace(/^mcp__sol__/, "");
  const refused = level === "record" ? !LOOKS.has(name) : SENDS.has(name);
  if (!refused) return null;
  return `refused: ${name}. The person's record (~/${RECORD}, consent.levels) sets ${folder} at ${say[level]}. Write what you would have done into the folder instead; the person raises the level in Home.`;
}

export type Consent = { levels?: Record<string, Level>; sources?: Record<string, "yes" | "no">; at?: string };
type Rec = { hands?: Level; solHome?: string | null; areas?: { id: string }[]; consent?: Consent };
const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
const isLevel = (x: unknown): x is Level => typeof x === "string" && (LEVELS as readonly string[]).includes(x);

/** the record as it is on disk now: the record, "missing", or "broken" (it is there and will not read) */
export function readRecord(home = homedir()): Rec | "missing" | "broken" {
  let text: string;
  try { text = readFileSync(join(home, RECORD), "utf8"); } catch (e) { return (e as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "broken"; }
  try { const j = JSON.parse(text); return j && typeof j === "object" && !Array.isArray(j) ? (j as Rec) : "broken"; } catch { return "broken"; }
}

/** the level the record sets for a folder (a path), or null when the record names no such folder (pure but for realpath) */
export function levelIn(rec: Rec, folder: string): { id: string; level: Level } | null {
  if (typeof rec.solHome !== "string" || !rec.solHome) return null;
  const at = real(folder), base = real(rec.solHome);
  const areas = Array.isArray(rec.areas) ? rec.areas : [];
  const levels = rec.consent?.levels && typeof rec.consent.levels === "object" ? rec.consent.levels : {};
  const ids = new Set([...areas.map((a) => a?.id), ...Object.keys(levels)].filter((x): x is string => typeof x === "string" && !!x));
  for (const id of ids) {
    if (real(join(base, id)) !== at) continue;
    const l = rec.consent?.levels?.[id];
    return { id, level: isLevel(l) ? l : isLevel(rec.hands) ? rec.hands : "show" };
  }
  return null;
}

/** the level for a folder, read now from the person's record; null: the record does not name it (or there is none) */
export function levelFor(folder: string, home = homedir()): { id: string; level: Level } | null {
  const rec = readRecord(home);
  if (rec === "missing") return null;
  if (rec === "broken") return null;   // it cannot say which folder is which: policy.md's rung and the other guards stand
  try { return levelIn(rec, folder); } catch { return null; }   // a record of the wrong shape is a record that will not read
}

/** a turn's refusal for a folder: the record read once at the turn's start, the reason named per tool */
export function refusalIn(folder: string, home = homedir()): ((tool: string) => string | null) | undefined {
  const at = levelFor(folder, home);
  if (!at || at.level === "do") return undefined;
  return (tool) => consentRefusal(at.level, tool, `the folder ${at.id}`);
}

/** two refusals as one: the first that says no */
export const both = (a?: (t: string) => string | null, b?: (t: string) => string | null): ((t: string) => string | null) | undefined =>
  !a ? b : !b ? a : (t) => a(t) ?? b(t);

/** the sources the person said "not here" to, by the record's own ids (`github`, `account:Gmail` …), read now. A record
 *  that is missing says no "no" (none was ever said); one that is there and will not read is ALL_OFF, so a "no" in it is
 *  never lost to a half-written or broken file */
export const ALL_OFF = "*";
export function sourcesOff(home = homedir()): Set<string> {
  const rec = readRecord(home), off = new Set<string>();
  if (rec === "missing") return off;
  if (rec === "broken") return new Set([ALL_OFF]);
  const said = rec.consent?.sources;
  if (said && typeof said === "object") for (const [k, v] of Object.entries(said)) if (v === "no") off.add(k);
  return off;
}

/** the person's "not here" (`no`) or "read it again" (`yes`) for one source, written into the record the way the face
 *  writes it (onboard/consent.ts withSource): everything else kept, the consent's `at` moved, never a half-written file.
 *  The reason when it cannot be written: there is no record yet (Home's setup makes it) or it will not read */
export function setSource(id: string, said: "yes" | "no", home = homedir()): { ok: true } | { why: string } {
  const rec = readRecord(home);
  if (rec === "missing") return { why: "there is no record yet: Home's setup makes it" };
  if (rec === "broken") return { why: `the record (~/${RECORD}) will not read, so nothing was written into it` };
  const at = new Date().toISOString(), c = rec.consent && typeof rec.consent === "object" ? rec.consent : {};
  const next = { ...rec, consent: { ...c, sources: { ...(c.sources ?? {}), [id]: said }, at } };
  const file = join(home, RECORD), tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try { writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", { mode: 0o600, flag: "wx" }); renameSync(tmp, file); }   // a fresh name, never one already there
  catch (e) { try { unlinkSync(tmp); } catch { /* none was made */ } return { why: `the record could not be written (${(e as Error).message})` }; }
  return { ok: true };
}
