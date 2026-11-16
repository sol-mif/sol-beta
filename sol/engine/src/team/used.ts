// The used-Cowork mark (#431, C5 of #413): when a person's agent really used a part of the project, Sol says so three
// ways, and never what it read:
// - the turn: the reply after the read carries `usedCowork: [part…]` (work/items.ts), and the face draws a small mark;
// - the project: one line in `.sol/used/<YYYY-MM>/<login>.md` in the project's record, at most once a part a UTC day
//   a writer, `- <YYYY-MM-DDTHH:mmZ> · <part> · <version>` (the memory.ts pattern: one file per writer per month, a
//   file whose writer the record does not confirm is ignored on a read, one that someone else wrote last starts
//   again). The people strip and the project's page read it back as "who used what" (`team.used`, PROTOCOL round 76);
// - the counts: a `cowork.used` track event { part, project, release } (track.ts), so analytics (E2, #437) counts it
//   on the members-only summary. Words only: the part, the record's name as a word, the release; never a line read.
//
// "Really used": a Cowork-reading tool (USED_TOOLS) answered without an error, in a project that has a record, and
// its answer was not the "no record" line. A write (room_thing_add, goal_set, …) is not a use of what is there; in_thing
// is presence (here.ts), not a read. The agent's leave to write in the project (Control) holds for the line in the
// record as for every agent write (kit.ts agentRefusal); the count is the engine's own, made either way.
import { agentRefusal } from "./kit.js";
import { recordBranch, putFailure, NO_RECORD } from "./things.js";
import { readMemory, readForWrite, monthOf, stampOf, type MemoryDeps } from "./memory.js";

export const USED_DIR = ".sol/used";
/** the tools that read a part of the project, by their name on the "sol" server, and the part each reads */
export const USED_TOOLS = {
  room_things: "things", room_feed: "feed", room_memory: "memory", goal: "goal",
  room_calendar: "calendar", room_decisions: "decisions", room_polls: "polls",
} as const;
export type Part = (typeof USED_TOOLS)[keyof typeof USED_TOOLS];
export const PARTS: readonly Part[] = [...new Set(Object.values(USED_TOOLS))];
export const RECENT_DAYS = 30;
const LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const LINE = /^- (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z) · ([a-z]+)(?: · ([A-Za-z0-9][A-Za-z0-9._:-]{0,63}))?\s*$/;
// answers that read nothing of a project: its record is missing, or a memory that needs another kind of project
const NOTHING = [NO_RECORD, "memory needs a cloud or GitHub room"];

/** the part a tool call used, or null (pure): one of USED_TOOLS, by its bare name or as mcp__sol__<name>, answered
 *  without an error, and not with a line that reads nothing */
export function usedPart(tool: string, ok: boolean, out = ""): Part | null {
  if (!ok) return null;
  const name = String(tool ?? "").replace(/^mcp__sol__/, "");
  const part = (USED_TOOLS as Record<string, Part>)[name];
  if (!part) return null;
  const said = String(out ?? "").trim();
  return NOTHING.some((n) => said.startsWith(n)) ? null : part;
}

/** the release as one word for the line and the count (pure): "dev-20261030-0900", ":mine3" after it for a layer of
 *  my own (a track word has no "+") */
export function releaseWord(v: { release?: string; mine?: number } | null | undefined): string {
  const r = String(v?.release ?? "").replace(/[^A-Za-z0-9._:-]+/g, "-").replace(/^[^A-Za-z0-9]+/, "").slice(0, 56);
  return r ? `${r}${v?.mine ? `:mine${Math.min(999, Math.floor(v.mine))}` : ""}` : "";
}

/** the path of one writer's marks of one month (pure) */
export const usedPath = (month: string, login: string) => `${USED_DIR}/${month}/${login}.md`;
/** one mark as written (pure) */
export const usedLine = (at: number, part: Part, version: string) => `- ${stampOf(at)} · ${part}${version ? ` · ${version}` : ""}`;

export type Use = { who: string; part: Part; at: string; version: string };
/** a marks file's lines as uses (pure); anything that is not a mark line, or names no known part, is left out */
export function parseUsed(text: string, who: string): Use[] {
  const out: Use[] = [];
  for (const line of String(text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const m = LINE.exec(line);
    if (m && (PARTS as readonly string[]).includes(m[2])) out.push({ who, part: m[2] as Part, at: m[1], version: m[3] ?? "" });
  }
  return out;
}

/** the mark appended (pure), or null when this part is marked on this UTC day already */
export function appendUse(text: string, at: number, part: Part, version: string): string | null {
  const day = stampOf(at).slice(0, 10);
  if (parseUsed(text, "").some((u) => u.part === part && u.at.slice(0, 10) === day)) return null;
  const had = text.replace(/\s+$/, "");
  return `${had ? `${had}\n` : ""}${usedLine(at, part, version)}\n`;
}

/** who used what lately (pure): each person's newest use of each part over RECENT_DAYS, newest first; none from the
 *  future past two minutes (a clock, or a forgery) */
export function recentUses(uses: Use[], now = Date.now()): Record<string, Use[]> {
  const from = stampOf(now - RECENT_DAYS * 86_400_000), by = stampOf(now + 2 * 60_000);
  const best = new Map<string, Use>();
  for (const u of uses) {
    if (u.at < from || u.at > by) continue;
    const k = `${u.who.toLowerCase()}|${u.part}`, had = best.get(k);
    if (!had || u.at > had.at) best.set(k, u);
  }
  const out: Record<string, Use[]> = {};
  for (const u of [...best.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))) (out[u.who] ??= []).push(u);
  return out;
}

// ---- writing ----
const marked = new Set<string>();   // repo|login|day|part this engine run marked (or is marking): one write a day each
/** for tests: forget what was marked */
export const forgetMarked = () => marked.clear();

/** my mark for one part, once a UTC day: compare-and-swap, three tries; my file started again when someone else wrote it
 *  last. "again": marked already. A failure is dropped (a mark is not a note) and can be made by the next use */
export async function writeUse(d: MemoryDeps, repo: string, login: string, part: Part, version: string, at = Date.now()): Promise<"written" | "again" | { error: string }> {
  if (!repo) return { error: NO_RECORD };
  if (repo.startsWith("drive:")) return { error: "the used marks need a cloud or GitHub project" };
  if (!LOGIN.test(login)) return { error: "Sol does not know your name in this project yet" };
  const key = `${repo.toLowerCase()}|${login.toLowerCase()}|${stampOf(at).slice(0, 10)}|${part}`;
  if (marked.has(key)) return "again";
  marked.add(key);
  try {
    const branch = await recordBranch(d, repo), path = usedPath(monthOf(at), login);
    for (let i = 0; i < 3; i++) {
      const have = await readForWrite(d, repo, path, branch);
      const mine = !have.sha || have.writer.toLowerCase() === login.toLowerCase();
      const next = appendUse(mine ? have.text : "", at, part, version);
      if (next === null) return "again";
      try {
        await d.record().files.putBody(repo, path, { message: `used: ${part} [skip ci]`, branch, content: Buffer.from(next).toString("base64"), ...(have.sha ? { sha: have.sha } : {}) });
        return "written";
      } catch (e) {
        const why = putFailure(e);
        if (why === "conflict") continue;
        throw new Error(why === "refused" ? "you can't write to this project yet" : why === "limit" ? "the record is rate-limiting you" : why);
      }
    }
    throw new Error("someone else changed it");
  } catch (e) {
    marked.delete(key);
    return { error: String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200) };
  }
}

/** where a use lands and who makes it: the project in use's record, my name there, whether my agent may write there */
export type UseRoom = { repo: string; login: string; may: boolean };
export type UseDeps = MemoryDeps & {
  room: () => Promise<UseRoom | null>;
  version: () => string;
  count: (part: Part, project: string, release: string) => void;   // the `cowork.used` track event
  now?: () => number;
};

/** a Cowork-reading tool answered: counted, and marked in the project's record when my agent may write there.
 *  Nothing when the project has no record (nothing of it was read) */
export async function noteUse(d: UseDeps, part: Part): Promise<"written" | "again" | "counted" | "none" | { error: string }> {
  const r = await d.room().catch(() => null);
  if (!r?.repo) return "none";
  const release = d.version();
  d.count(part, r.repo.replace(/[^A-Za-z0-9._:-]+/g, "-").slice(0, 64), release);
  if (agentRefusal(r.repo, r.may, "kept")) return "counted";
  return writeUse(d, r.repo, r.login, part, release, d.now?.() ?? Date.now());
}

// ---- reading ----
const months = (now: number) => { const a = monthOf(now), b = monthOf(now - RECENT_DAYS * 86_400_000); return a === b ? [a] : [a, b]; };
/** who used what in the project lately: the marks of this month and the last RECENT_DAYS, each file only when the record
 *  says its writer is the login in its name (readMemory's rule) */
export async function readUses(d: MemoryDeps, repo: string, now = Date.now()): Promise<{ people: Record<string, Use[]>; note?: string }> {
  if (!repo) return { people: {}, note: NO_RECORD };
  if (repo.startsWith("drive:")) return { people: {}, note: "the used marks need a cloud or GitHub project" };
  const uses: Use[] = [];
  let note: string | undefined;
  for (const month of months(now)) {
    const r = await readMemory(d, repo, { month, dir: USED_DIR });
    if (r.note) note = r.note;
    for (const f of r.files) uses.push(...parseUsed(f.text, f.login));
  }
  return { people: recentUses(uses, now), ...(note ? { note } : {}) };
}
