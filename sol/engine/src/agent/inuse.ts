// Agents in use (#1327): does Agents work right while a person uses it? Counts only, through track.ts, never a word:
// the same file, the same switch (settings.track.usage) and the same trip to Sol's cloud as every count. The moments
// a person uses (an ask answered, a sign-in started, a join kept together or apart, a desk opened, an undo, a pause)
// are the agents.* messages themselves, which track.ts already counts by type (a type not in its IN table is counted
// with no props). This file adds what a message cannot say: whether it worked.
//   agents.seen {what, paintMs?, cards?, ids?, raw?}   the face, once per floor, desk, ask or changes it drew: how long
//                 the floor took to stand (from opening Agents to the list drawn; 10 s when it never came), how many
//                 cards stood open on its fullest shelf (the whole floor without shelves), how many of its rule ids
//                 (`clock-3`, `mail-1`: words the person never wrote) its text said, how many raw markdown lines (a `| a | b |` row, a `## heading`) a desk drew. Numbers
//                 only; never written as they came: what they decide is
//   agents.opened {on}   floor · desk · ask · changes: the place drawn (an ask opened is on: ask)
//   agents.check {check, ok, on}   one per check a moment decides, written here:
//     floor-1s       the floor stood in under a second
//     read-3s        "Reading your agents…" was gone within three seconds
//     cards-7        seven cards or fewer stood open on one shelf (a shelf's limit, shelvesOf)
//     no-ids         no rule id in what the person reads
//     no-raw         no raw markdown on a desk
//     no-stray-chat  no agent's own run shows as a chat in Build (its Codex thread is not in the list of talks)
//     signin-frees   after a sign-in woke an agent, its next run got past that sign-in (decided once a run came)
//   agents.signin.done {freed}   a sign-in finished and woke that many rules (agents.ts signedIn)
//   agents.read.failed   an agents.list answered not ok (parts/agents.ts)
// Errors in agents.* count with Work's (errcount.ts kind "work") until Sol's cloud and the live block know a kind
// "agents" (both drop a kind they do not know). inUseOf reads the counts back as green and red by day and Sol version:
// the Cowork block "agents in use" calls it (proposed to Frank, specs/features/fr-20-cowork/sketch/agents-in-use.md).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { track } from "../track.js";
import { blocked, runsOf, signInSite, type AgentsFile } from "./agents.js";
import type { LedgerLine } from "./harness.js";

export const CHECKS = ["floor-1s", "read-3s", "cards-7", "no-ids", "no-raw", "no-stray-chat", "signin-frees"] as const;
export type Check = typeof CHECKS[number];
export const FLOOR_MS = 1000, READ_MS = 3000, MAX_CARDS = 7, NEVER_MS = 10_000;

const WHAT = new Set(["floor", "desk", "ask", "changes"]);
export type Seen = { what: "floor" | "desk" | "ask" | "changes"; paintMs?: number; cards?: number; ids?: number; raw?: number };
const count = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.round(v)) : undefined);

/** the face's agents.seen kept to its numbers (pure); null when it is not one */
export function seenOf(m: Record<string, unknown>): Seen | null {
  if (typeof m.what !== "string" || !WHAT.has(m.what)) return null;
  const s: Seen = { what: m.what as Seen["what"] };
  const paintMs = count(m.paintMs, NEVER_MS), cards = count(m.cards, 999), ids = count(m.ids, 999), raw = count(m.raw, 999);
  if (paintMs !== undefined) s.paintMs = paintMs;
  if (cards !== undefined) s.cards = cards;
  if (ids !== undefined) s.ids = ids;
  if (raw !== undefined) s.raw = raw;
  return s;
}

/** what one drawn place decides (pure): each check its numbers can answer, in CHECKS order */
export function checksOfSeen(s: Seen): [Check, boolean][] {
  const out: [Check, boolean][] = [];
  if (s.what === "floor" && s.paintMs !== undefined) out.push(["floor-1s", s.paintMs < FLOOR_MS], ["read-3s", s.paintMs < READ_MS]);
  if (s.what === "floor" && s.cards !== undefined) out.push(["cards-7", s.cards <= MAX_CARDS]);
  if (s.ids !== undefined) out.push(["no-ids", s.ids === 0]);
  if (s.what === "desk" && s.raw !== undefined) out.push(["no-raw", s.raw === 0]);
  return out;
}

/** the agents whose own Codex thread is listed as a talk (pure): their runs show as chats in Build */
export const strayChats = (threads: (string | null)[], listed: Set<string>) => threads.filter((t): t is string => !!t && listed.has(t)).length;

/** each sign-in that woke a rule and has had a run since, decided (pure): ok when that first run got past the sign-in.
 *  `done`: the changes already decided (each is decided once); a woken rule with no run yet waits */
export function signinsDecided(f: AgentsFile, ledgerOf: (folder: string) => LedgerLine[], done: Set<string>): { id: string; ok: boolean }[] {
  const out: { id: string; ok: boolean }[] = [];
  for (const c of f.changes) {
    if (c.kind !== "woke" || c.cause !== "through" || c.undone || done.has(c.id)) continue;
    const at = Date.parse(c.at), oks: boolean[] = [];
    for (const r of c.rules ?? []) {
      const after = runsOf(ledgerOf(r.folder), r.rule).filter((l) => l.at > at);
      const first = after[after.length - 1];   // runs are newest first
      if (first) oks.push(!blocked(first) && !signInSite(first));
    }
    if (oks.length && oks.length === (c.rules ?? []).length) out.push({ id: c.id, ok: oks.every(Boolean) });
  }
  return out;
}

// the sign-ins already decided, kept beside the track files so a restart never counts one twice
const doneFile = (trackDir: string) => join(trackDir, "agents-signins.json");
function doneOf(trackDir: string): Set<string> {
  try { const v = JSON.parse(readFileSync(doneFile(trackDir), "utf8")); return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []); } catch { return new Set(); }
}
function saveDone(trackDir: string, done: Set<string>) {
  try { if (!existsSync(trackDir)) mkdirSync(trackDir, { recursive: true }); writeFileSync(doneFile(trackDir), JSON.stringify([...done].slice(-500))); } catch { /* a count, never a failure */ }
}

export type SeenDeps = {
  /** agents.json, null before it exists */
  file: () => AgentsFile | null;
  /** a folder's ledger, newest first */
  ledgerOf: (folder: string) => LedgerLine[];
  /** each agent folder's own Codex thread (null: it has none yet) */
  threads: () => (string | null)[];
  /** the Codex talks Build lists, by id */
  listed: () => Promise<Set<string>>;
  /** where track.ts keeps its files (home/track) */
  trackDir: string;
};

/** a face drew a place: its checks counted; on the floor also the stray chats and the sign-ins that have had a run.
 *  Returns what it counted (for the tests); never throws */
export async function noteSeen(m: Record<string, unknown>, d: SeenDeps): Promise<[Check, boolean][]> {
  const s = seenOf(m);
  if (!s) return [];
  const out = checksOfSeen(s);
  if (s.what === "floor") {
    try { out.push(["no-stray-chat", strayChats(d.threads(), await d.listed()) === 0]); } catch { /* the list could not be read: not decided */ }
    const f = d.file();
    if (f) {
      const done = doneOf(d.trackDir);
      const got = signinsDecided(f, d.ledgerOf, done);
      for (const g of got) { out.push(["signin-frees", g.ok]); done.add(g.id); }
      if (got.length) saveDone(d.trackDir, done);
    }
  }
  track("agents.opened", { on: s.what });
  for (const [check, ok] of out) track("agents.check", { check, ok, on: s.what });
  return out;
}

// ---------------------------------------------------------------- reading the counts back

/** the moments a person used, by the event's name: what each is called on the block */
export const MOMENTS: Record<string, string> = {
  "agents.opened": "opened", "agents.offer": "offer answered", "agents.join": "join answered", "agents.signin": "sign-in started",
  "agents.signin.done": "sign-in finished", "agents.desk": "desk opened", "agents.undo": "undo", "agents.rest": "pause or wake",
  "agents.fix": "line fixed", "agents.change": "step changed", "agents.trust": "how far changed", "agents.run": "run by hand",
};
type Line = { at?: unknown; sol?: unknown; name?: unknown; props?: unknown };
export type CheckCount = { ok: number; bad: number };
export type InUseDay = { day: string; sol: string; checks: Partial<Record<Check, CheckCount>>; moments: Record<string, number>; failed: number };
export type InUse = {
  days: InUseDay[];                                        // newest first, one row per day and Sol version
  checks: { check: Check; ok: number; bad: number; lastBad: string }[];   // the window's, in CHECKS order
  moments: { name: string; n: number }[];                  // the window's, most first
  failed: number;                                          // agents.read.failed and error counts caught on agents.*
};

/** track lines read back (pure): the agents.* counts by day and Sol version, every check green or red. A line that is
 *  not one of these, or a value that is not a word or a number, is passed over */
export function inUseOf(lines: Line[]): InUse {
  const rows = new Map<string, InUseDay>();
  const WORD = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
  for (const l of lines) {
    const name = typeof l.name === "string" ? l.name : "", at = typeof l.at === "string" ? l.at : "";
    const p = l.props && typeof l.props === "object" ? l.props as Record<string, unknown> : {};
    const agentsError = name === "error.count" && typeof p.msg === "string" && p.msg.startsWith("agents.");
    if ((!name.startsWith("agents.") && !agentsError) || !/^\d{4}-\d{2}-\d{2}T/.test(at)) continue;
    const sol = typeof l.sol === "string" && (l.sol === "" || WORD.test(l.sol)) ? l.sol.slice(0, 12) : "";
    const day = at.slice(0, 10), key = `${day}|${sol}`;
    const r = rows.get(key) ?? { day, sol, checks: {}, moments: {}, failed: 0 };
    rows.set(key, r);
    if (name === "agents.check") {
      const c = (CHECKS as readonly string[]).includes(String(p.check)) ? p.check as Check : null;
      if (!c || typeof p.ok !== "boolean") continue;
      const x = r.checks[c] ?? { ok: 0, bad: 0 };
      if (p.ok) x.ok++; else x.bad++;
      r.checks[c] = x;
    } else if (name === "agents.read.failed" || agentsError) r.failed++;
    else if (MOMENTS[name]) r.moments[MOMENTS[name]] = (r.moments[MOMENTS[name]] ?? 0) + 1;
  }
  const days = [...rows.values()].sort((a, b) => b.day.localeCompare(a.day) || a.sol.localeCompare(b.sol));
  const checks = CHECKS.map((check) => {
    let ok = 0, bad = 0, lastBad = "";
    for (const d of days) { const x = d.checks[check]; if (!x) continue; ok += x.ok; bad += x.bad; if (x.bad && d.day > lastBad) lastBad = d.day; }
    return { check, ok, bad, lastBad };
  });
  const m = new Map<string, number>();
  for (const d of days) for (const [k, n] of Object.entries(d.moments)) m.set(k, (m.get(k) ?? 0) + n);
  return { days, checks, moments: [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)), failed: days.reduce((s, d) => s + d.failed, 0) };
}

/** this Mac's own counts of the last `days` days (home/track: each day's file, sent or not; never the other tools'
 *  files), read back; what Sol's cloud keeps for every Mac is the same lines */
export function inUseHere(trackDir: string, days = 14, now = Date.now()): InUse {
  const from = new Date(now - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const lines: Line[] = [];
  let names: string[] = [];
  try { names = readdirSync(trackDir); } catch { names = []; }
  for (const n of names) {
    if (!/^\d{4}-\d{2}-\d{2}(-\d+)?\.(jsonl|sent|refused)$/.test(n) || n.slice(0, 10) < from) continue;
    let text = "";
    try { text = readFileSync(join(trackDir, n), "utf8"); } catch { continue; }
    for (const t of text.split("\n")) {
      if (!t.includes("\"agents.") && !t.includes("\"error.count\"")) continue;
      try { lines.push(JSON.parse(t)); } catch { /* a torn line */ }
    }
  }
  return inUseOf(lines);
}
