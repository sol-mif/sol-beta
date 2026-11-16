// The record's lookup (#510): which repository holds a GitHub room's record (things, goal, owners, who walked the
// project), by GitHub's answer rather than a name in the code. A team whose main is PR-only keeps its record in a
// repository beside it (#507): the code repository's variable SOL_RECORD names it (the same one CI reads), else
// `<owner>/<name>-record` when that repository exists (what `bash sol/github-setup --apply` makes), else the repository
// is its own record, as before. Asked where a GitHub room is made or its repositories change, and once at engine start
// for a team.json written before (wire.ts); the answer is kept on the room (`record`, settings.ts) so it is asked once.
// gh is handed in, so the tests fake it; an answer that is not GitHub's (no network, gh signed out) asks again later.
import { isRepo, needsRecord, withRecord, type Room } from "./settings.js";
import type { Gh } from "./record.js";

/** the record repository's name beside a code repository (pure): `<owner>/<name>-record` */
export const recordName = (repo: string): string => `${repo}-record`;

/** a gh failure that is GitHub's "no" (not there, or not mine to read), as against one that is no answer at all (pure) */
export const saidNo = (e: unknown): boolean => {
  const m = `${(e as { full?: string })?.full ?? ""} ${(e as Error)?.message ?? ""}`;
  return /HTTP 40[34]|Not Found|Could not resolve to a Repository|Resource not accessible/i.test(m);
};

/** the record of code repository `repo` as GitHub says it, or null when GitHub did not answer (ask again later) */
export async function lookupRecord(gh: Gh, repo: string): Promise<string | null> {
  try {
    const v = JSON.parse(await gh(["api", `repos/${repo}/actions/variables/SOL_RECORD`])) as { value?: unknown };
    const named = typeof v?.value === "string" ? v.value.trim() : "";
    if (isRepo(named)) return named;
  } catch (e) { if (!saidNo(e)) return null; }
  const beside = recordName(repo);
  try {
    const r = JSON.parse(await gh(["repo", "view", beside, "--json", "nameWithOwner"])) as { nameWithOwner?: unknown };
    return typeof r?.nameWithOwner === "string" && isRepo(r.nameWithOwner) ? r.nameWithOwner : beside;
  } catch (e) { if (!saidNo(e)) return null; }
  return repo;
}

/** the rooms with the answers put in (pure): each room the answers name (by its first repository, the one asked) gets
 *  its record first and kept. Unchanged rooms are the same objects */
export function placeRecords(rooms: Room[], answers: ReadonlyMap<string, string>): Room[] {
  return rooms.map((r) => {
    if (!needsRecord(r)) return r;
    const rec = answers.get(r.repos[0].toLowerCase());
    return rec ? { ...r, repos: withRecord(r.repos, rec), record: rec } : r;
  });
}

/** every room that waits for its record, asked (each code repository once), as the rooms to write, or null when none
 *  changed. `rooms` is read again after the asks so a change made meanwhile is kept */
export async function findRecords(gh: Gh, rooms: () => Room[]): Promise<Room[] | null> {
  const asks = [...new Set(rooms().filter(needsRecord).map((r) => r.repos[0].toLowerCase()))];
  if (!asks.length) return null;
  const answers = new Map<string, string>();
  for (const repo of asks) {
    const rec = await lookupRecord(gh, repo).catch(() => null);
    if (rec) answers.set(repo, rec);
  }
  if (!answers.size) return null;
  const now = rooms(), next = placeRecords(now, answers);
  return next.some((r, i) => r !== now[i]) ? next : null;
}
