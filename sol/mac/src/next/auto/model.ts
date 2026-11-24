// An automation is a piece (BR1 item 2, three.html "Automation is a piece", #1615): each of the engine's automations
// (D.work.autos, cv/wire/work.ts over next.autos) is a piece of kind "row" (place.ts's word: "automation") in the folder it
// works in, so it sits beside what it touches and is watched there. Pure, but for `sync`, which writes D's pieces.
//   where   the folder it sits in: the one it was made in (its region), else the folder whose path it works in (its
//           cwd, the deepest such folder), else none: then it is on the Work page only, never put in a folder by guess
//   sync    the pieces "auto:<id>" put, moved and removed to match the list (from: "autos"; no other wire touches them)
//   words   when it runs (a time or an event), how each run went and why it ran, in the Work page's words (work/read.ts)
// Signed: marcocyl04-ux's agent (builder F), BR1 item 2 (#1615).
import type { Piece, Region } from "../cv/types.ts";
import type { Ranking } from "../collection-state.ts";
import { hm, LAST_SAYS, sayFiles, type Auto, type Last, type Work } from "../work/read.ts";

export const PREFIX = "auto:";
export const pieceId = (id: string) => PREFIX + id;
/** how a session's table ranks what it made (the one list, collection.ts): one on, or made and never turned on, is drawn,
 *  newest first; one paused after it ran folds into the count line, its history by its last run's day */
export const TABLE: Ranking<Auto> = { rank: (a) => (a.on || !a.runs ? -a.made : null), at: (a) => a.last?.at ?? a.made };
/** the automation a piece stands for, from the page's list */
export const autoOf = (w: Work | undefined, pid: string): Auto | null => (pid.startsWith(PREFIX) ? (w?.autos ?? []).find((a) => pieceId(a.id) === pid) ?? null : null);

/** the folder on the disk a folder stands for, or "" (a life place has none) */
export const pathOf = (r: Region) => (typeof r.path === "string" ? r.path : r.id.startsWith("w:") ? r.id.slice(2) : "");
/** an event needs a folder on the disk to watch: one with a path (a life place has none) */
export const canWatch = (r: Region | undefined | null) => !!r && !!pathOf(r);
/** the folder an automation sits in: where it was made, else the deepest folder it works in, else null */
export function where(a: Pick<Auto, "region" | "cwd">, regions: Region[]): string | null {
  if (a.region && regions.some((r) => r.id === a.region)) return a.region;
  if (!a.cwd) return null;
  let best: Region | null = null;
  for (const r of regions) {
    const p = pathOf(r).replace(/\/+$/, "");
    if (p && (a.cwd === p || a.cwd.startsWith(p + "/")) && (!best || p.length > pathOf(best).length)) best = r;
  }
  return best?.id ?? null;
}

/** D's pieces made to match the automations: one per automation with a folder; whether any changed */
export function sync(d: { regions: Region[]; pieces: Record<string, Piece> }, autos: Auto[]): boolean {
  let changed = false;
  const want = new Map<string, { a: Auto; rid: string }>();
  for (const a of autos) { if (a.in) continue; const rid = where(a, d.regions); if (rid) want.set(pieceId(a.id), { a, rid }); }   // one made in a session lives on its table
  for (const [id, p] of Object.entries(d.pieces)) if (p.from === "autos" && !want.has(id)) { delete d.pieces[id]; changed = true; }
  for (const [id, { a, rid }] of want) {
    const p = d.pieces[id];
    if (p && p.region === rid && p.name === a.name) continue;
    d.pieces[id] = { ...(p ?? {}), id, region: rid, kind: "row", name: a.name, auto: a.id, from: "autos" };
    changed = true;
  }
  return changed;
}

// ---------------------------------------------------------------- the words

/** a time or an event (the engine's automations.ts eventOf, in short: words that start "when" and speak of a file) */
export const isEvent = (when: string) => /^\s*(when|whenever|each time|every time)\b/i.test(when) && /\bfiles?\b/i.test(when);
/** when it runs, as a sentence: its own words, a capital first */
export const sayWhen = (a: Pick<Auto, "when">) => (a.when ? a.when[0].toUpperCase() + a.when.slice(1) : "");
/** its state in two words: off, waiting for its time or its event, or working */
export function stateOf(a: Auto): { k: "paused" | "waits" | "working" | "needs you"; say: string } {
  if (a.last?.state === "working") return { k: "working", say: "Working now" };
  if (a.last?.state === "needs you") return { k: "needs you", say: "Waiting on you" };
  if (!a.on) return { k: "paused", say: "Paused" };
  return { k: "waits", say: isEvent(a.when) ? "Watching for new files" : a.next ? `Next run ${a.next}` : "On" };
}
const DAY = 86400000;
/** a run's time: its hour today, "Yesterday 08:00", else the weekday and hour */
export function sayAt(at: number, now = Date.now()): string {
  const d = new Date(at), n = new Date(now), start = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  if (at >= start) return hm(at);
  if (at >= start - DAY) return `Yesterday ${hm(at)}`;
  return `${d.toLocaleDateString("en", { weekday: "short" })} ${hm(at)}`;
}
/** why a run ran */
export const sayWhy = (r: Last) => (r.how === "now" ? "you pressed Run now" : r.how === "event" ? `${sayFiles(r.files)} came in` : "on its time");
/** one run, in a line: when, how it went, why */
export const sayRun = (r: Last, now = Date.now()) => `${sayAt(r.at, now)} · ${LAST_SAYS[r.state]} · ${sayWhy(r)}`;


/** when it last ran, then how many times in all (Jev: 0.33, as clear as "This automation ran 14 times", with the time
 *  the orchestrator asked for; BR1 item 2, #1615) */
export function sayRan(a: Pick<Auto, "runs" | "last">, now = Date.now()): string {
  const all = a.runs === 1 ? "1 run in all" : `${a.runs} runs in all`;
  if (!a.last) return `This automation ran ${a.runs === 1 ? "once" : `${a.runs} times`}`;
  const at = sayAt(a.last.at, now).replace(/^Yesterday/, "yesterday").replace(/^(\D+) (\d)/, "$1 at $2");   // today: the time alone
  return `This automation last ran ${/^\d/.test(at) ? `at ${at}` : at} · ${all}`;
}
