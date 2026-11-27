// What the new face's sidebar needs the engine to keep (#1879 step 3; next/protocol/KEEPS.md): four small files in
// SOL_HOME/next/, each written whole and a broken one set aside (file.ts, as tabs.ts keeps its row).
//   present.json { v, at }          the last time the person was present in a Sol window (a ping at most once a minute)
//   seen.json    { v, seen }        { <piece id>: time }: when each session or page was last seen through this face
//   pinned.json  { v, pinned }      { <piece id>: time }: what the person pinned, and when
//   uses.json    { v, folders }     { <folder id>: time }: when each folder was last opened or had a session in front
//   next.keeps   next.present   next.seen { id }   next.pin { id, pinned? }   next.use { folder }
// They feed Check in's Done while away, Back to and Kept, and the Recent group. Signed: marcocyl04-ux's agent, #1879 step 3.
import { join } from "node:path";
import { nextDir, readJson, writeJson } from "./file.js";

export type Times = Record<string, number>;
export type Keeps = { present: number | null; seen: Times; pinned: Times; uses: Times };
export type Answer = ({ ok: true } & Keeps & { aside?: string[] }) | { ok: false; why: string };

/** a ping, a folder's use: kept at most this often (ms) */
export const EVERY = 60_000;
/** at most this many ids in each of the three lists; the oldest time goes first */
export const MOST = { seen: 400, pinned: 100, uses: 200 } as const;
const okId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 300 && !/[\u0000-\u001f]/.test(v);
const okTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

export const keepFile = (home: string, name: "present" | "seen" | "pinned" | "uses") => join(nextDir(home), `${name}.json`);

/** the id → time object a store kept; whatever is not an id with a time is left out, the newest `most` stay */
function times(v: unknown, most: number): Times {
  const out: Times = {};
  if (v && typeof v === "object" && !Array.isArray(v)) for (const [k, t] of Object.entries(v as Record<string, unknown>)) if (okId(k) && okTime(t)) out[k] = t;
  return newest(out, most);
}
function newest(t: Times, most: number): Times {
  const e = Object.entries(t);
  return e.length <= most ? t : Object.fromEntries(e.sort((a, b) => b[1] - a[1]).slice(0, most));
}

/** all four, as kept; aside: the names of the broken files this read set aside */
export function readKeeps(home: string): Keeps & { aside?: string[] } {
  const aside: string[] = [];
  const one = (name: "present" | "seen" | "pinned" | "uses") => { const r = readJson(keepFile(home, name)); if (r.aside) aside.push(r.aside); return r.data; };
  const p = one("present"), s = one("seen"), n = one("pinned"), u = one("uses");
  return { present: okTime(p.at) ? p.at : null, seen: times(s.seen, MOST.seen), pinned: times(n.pinned, MOST.pinned), uses: times(u.folders, MOST.uses), ...(aside.length ? { aside } : {}) };
}

const msgOf = (m: unknown) => (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
const answer = (k: Keeps, aside?: string[]): Answer => ({ ok: true, present: k.present, seen: k.seen, pinned: k.pinned, uses: k.uses, ...(aside?.length ? { aside } : {}) });

/** next.present: the person is here now. Kept at most once a minute; `was` is the time kept before this one (what the
 *  window counts "while you were away" from), `at` the time kept now. */
export function present(home: string, now = Date.now()): { ok: true; at: number; was: number | null; aside?: string[] } {
  const k = readKeeps(home), was = k.present;
  if (was !== null && now - was < EVERY && now >= was) return { ok: true, at: was, was, ...(k.aside ? { aside: k.aside } : {}) };
  writeJson(keepFile(home, "present"), { v: 1, at: now });
  return { ok: true, at: now, was, ...(k.aside ? { aside: k.aside } : {}) };
}

/** next.seen { id }: this piece (a session or a page) was seen now, fronted as a tab or opened on the canvas */
export function seen(home: string, m: unknown, now = Date.now()): Answer {
  const x = msgOf(m);
  if (!okId(x.id)) return { ok: false, why: "say which piece was seen" };
  const k = readKeeps(home);
  k.seen = newest({ ...k.seen, [x.id]: now }, MOST.seen);
  writeJson(keepFile(home, "seen"), { v: 1, seen: k.seen });
  return answer(k, k.aside);
}

/** next.pin { id, pinned? }: the piece pinned (pinned false: unpinned). Pinning again keeps the first time. */
export function pin(home: string, m: unknown, now = Date.now()): Answer {
  const x = msgOf(m);
  if (!okId(x.id)) return { ok: false, why: "say which piece to pin" };
  const k = readKeeps(home), { [x.id]: was, ...rest } = k.pinned;
  k.pinned = x.pinned === false ? rest : newest({ ...rest, [x.id]: was ?? now }, MOST.pinned);
  writeJson(keepFile(home, "pinned"), { v: 1, pinned: k.pinned });
  return answer(k, k.aside);
}

/** next.use { folder }: the folder was opened, or a session of it is in front. At most once a minute per folder. */
export function use(home: string, m: unknown, now = Date.now()): Answer {
  const x = msgOf(m);
  if (!okId(x.folder)) return { ok: false, why: "say which folder was used" };
  const k = readKeeps(home), was = k.uses[x.folder];
  if (was !== undefined && now >= was && now - was < EVERY) return answer(k, k.aside);
  k.uses = newest({ ...k.uses, [x.folder]: now }, MOST.uses);
  writeJson(keepFile(home, "uses"), { v: 1, folders: k.uses });
  return answer(k, k.aside);
}
