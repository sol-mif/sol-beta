// Cowork v3 (#1049): who may change who is in a project and in which role. One rule, read by both folds of the role
// table (people.ts foldPeople, port5.ts recordOf), so the two never disagree on it, and in one order every Sol agrees on.
// A member event counts only when its writer could make it at its place in that order:
// - while nobody is in, only someone naming themself owner (the first owner, the project's first writer);
// - after that, an owner lets anyone in or out and sets anyone's role, their own too;
// - anyone else only takes themself out;
// - an agent writes no role, not its own person's;
// - a project keeps one owner at least: an event that would leave none counts nothing, so the owners never all go.
// An event that does not count stays on the trail and folds as if it were not there. Its time is its writer's word:
// a writer who was an owner can still date an event back into the time they were one (#1049's PR, "Known holes").
export type Role = "owner" | "editor" | "guest";
const ROLES: string[] = ["owner", "editor", "guest"];
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** a member's role while they are in, else null (pure) */
export const seatOf = (f: { role?: unknown; in?: unknown }): Role | null => (f.in === true && ROLES.includes(f.role as string) ? (f.role as Role) : null);

/** what one member event says of its member's seat, the one shape both folds read (pure): out (`in: false`), in with a
 *  role (`in: true` and a role), or only a new role (a role, no `in`: for someone in already). Anything else, `in` that
 *  is not a boolean among them, says nothing and counts nothing */
export function seatWrite(w: Record<string, unknown>): { role?: Role; in?: boolean } | null {
  const role = ROLES.includes(w.role as string) ? (w.role as Role) : undefined;
  if (w.in === false) return { in: false };
  if (w.in === true) return role ? { role, in: true } : null;
  return w.in === undefined && role ? { role } : null;
}
/** the role a seat write leaves its member in, from the one they had (pure) */
export const seatAfter = (before: Role | null, s: { role?: Role; in?: boolean }): Role | null =>
  s.in === false ? null : s.in === true ? s.role ?? null : before && s.role ? s.role : null;

/** whether one member event counts (pure): `owners` are the owners in just before it (logins in lower case), `before` and `after` the role it
 *  finds and the role it would leave the member it names in (null: not in) */
export function counts(o: { owners: ReadonlySet<string>; writer: string; agent: boolean; who: string; before: Role | null; after: Role | null }): boolean {
  if (o.agent || !o.writer || !o.who) return false;
  if (!o.owners.size) return same(o.writer, o.who) && o.after === "owner";
  if (!o.owners.has(o.writer.toLowerCase())) return same(o.writer, o.who) && o.after === null && o.before !== null;
  return o.owners.size - (o.owners.has(o.who.toLowerCase()) ? 1 : 0) + (o.after === "owner" ? 1 : 0) > 0;
}

/** the order of a project's events every Sol agrees on (pure): time, then writer (its key), then the place in the
 *  writer's own chain (one key's events in one millisecond), then the store's seq (only a trail with no keys and no
 *  chains, the tests' memory ones, reaches it), then id */
export function inOrder<T extends { id: string; seq: number; prev?: string }>(evs: T[], at: (e: T) => number, writer: (e: T) => string): T[] {
  const byId = new Map(evs.map((e) => [e.id, e]));
  const depth = new Map<string, number>();
  const depthOf = (e: T): number => {
    const run: T[] = [];
    let x: T | undefined = e, d = 0;
    while (x && !depth.has(x.id) && run.length <= evs.length) {
      run.push(x);
      const p: T | undefined = x.prev ? byId.get(x.prev) : undefined;
      x = p && writer(p) === writer(x) ? p : undefined;
    }
    if (x && depth.has(x.id)) d = depth.get(x.id)! + 1;
    for (const y of run.reverse()) depth.set(y.id, d++);
    return depth.get(e.id)!;
  };
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const key = new Map(evs.map((e) => [e.id, { at: at(e), w: writer(e), d: depthOf(e) }]));
  return [...evs].sort((a, b) => {
    const x = key.get(a.id)!, y = key.get(b.id)!;
    return x.at - y.at || cmp(x.w, y.w) || x.d - y.d || a.seq - b.seq || cmp(a.id, b.id);
  });
}

/** the time a role event is written at: after the latest member event this Sol has, so a writer whose clock is behind
 *  is not judged before the event that gave them their role (pure) */
export const dateAfter = (lastAt: number, now = Date.now()): { at?: number } => (lastAt >= now ? { at: lastAt + 1 } : {});
