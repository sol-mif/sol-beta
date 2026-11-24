// See what's at work (BR1 item 7, picked 04:45 as drawn: mine/look/br1/at-work.html): one axis, time. Now is every session
// working or asking and every automation running; Next is the automations due today, soonest first, the rest one count;
// What your AI did is today's Diary lines by Sol. Scoped like the Diary: a folder's own (within), or everything (null). Pure: the
// view (AtWork.tsx) reads it, the tests too (src/next-atwork.test.ts). A connection in use has no field in the engine
// yet, so none is drawn (br1-update.md). Signed: marcocyl04-ux's agent (builder F), BR1 item 7 (#1615).
import type { Data, Piece } from "../cv/types.ts";
import type { Auto } from "../work/read.ts";
import type { Line } from "../diary/book.ts";
import { standOf } from "../place.ts";
import { taskOf } from "../diary/book.ts";
import { where } from "../auto/model.ts";

/** what the engine's work.run says of a session that the store does not keep: its helpers, since when, held */
export type RunBits = { tasks: string[]; since: number; paused: boolean };
/** Pause everything, as the engine keeps it (next/atwork.ts) */
export type Held = { at: number; folder: string | null; sessions: string[]; autos: string[] };
export type Row = {
  id: string; kind: "session" | "auto"; name: string; folder: string | null; line: string; since: number | null;
  stand: "asks" | "working" | "held"; helpers: string[];
  /** the session to stop (an automation's run is a session too); the automation to pause */
  sessionId: string | null; autoId: string | null; because: string[];
};
export type NextRow = { id: string; name: string; folder: string | null; when: string; at: number };
export type View = { now: Row[]; next: NextRow[]; later: number; did: Line[]; running: number; needs: number; held: Held | null };

const sidOf = (p: Piece) => (typeof p.sessionId === "string" && p.sessionId ? p.sessionId : p.id);
const inScope = (folder: string | null | undefined, scope: string | null) => scope == null || folder === scope;
const HOW: Record<string, string> = { clock: "on its time", event: "a new file came in", now: "you ran it" };

/** "today at 17:00" → minutes into the day; an event ("when a new file comes in") → after every time; else null */
export function dueToday(next: string): number | null {
  const t = /^today at (\d{1,2}):(\d{2})/.exec(next);
  if (t) return Number(t[1]) * 60 + Number(t[2]);
  return /^when\b/.test(next) ? 24 * 60 : null;
}

/** asked: the words of the open ask from this piece or one of its parts, or "" when none */
function sessionRow(p: Piece, asked: (id: string) => string, run: RunBits | undefined): Row | null {
  const st = standOf(p, (id) => !!asked(id));
  if (st !== "asks" && st !== "working") return null;
  const held = !!run?.paused, helpers = run?.tasks ?? [];
  const waiting = p.term?.waiting || asked(p.id) || (p.parts || []).map((x) => asked(x.id)).find(Boolean);
  const line = st === "asks" ? (waiting ? `Asks you: ${waiting}` : p.state === "failed" ? "Stopped on a failure" : p.term?.stateWord ? `Waiting on you: ${p.term.stateWord}` : "Waiting on you")
    : held ? "Finishes this step, then waits"
    : `${p.term?.stateWord || "Working"}${helpers.length ? `, with ${helpers.length === 1 ? "1 helper" : `${helpers.length} helpers`}` : ""}`;
  return { id: p.id, kind: "session", name: taskOf(p), folder: p.region ?? null, line, since: run?.since || (typeof p.born === "number" ? p.born : null), stand: st === "asks" ? "asks" : held ? "held" : "working",
    helpers, sessionId: sidOf(p), autoId: null, because: Array.isArray(p.because) ? (p.because as string[]) : [] };
}

function autoRow(a: Auto, folder: string | null): Row | null {
  const l = a.last;
  if (!l || (l.state !== "working" && l.state !== "needs you")) return null;
  const asks = l.state === "needs you", held = !asks && !a.on;   // paused while a run works: the run finishes, the next ones skip
  return { id: `auto:${a.id}`, kind: "auto", name: a.name, folder, line: asks ? "Waiting on you" : held ? "Finishes this run, then skips until you resume" : `Running, ${HOW[l.how] ?? "on its time"}`, since: l.at,
    stand: asks ? "asks" : held ? "held" : "working", helpers: [], sessionId: l.sessionId || null, autoId: a.id, because: [] };
}

/** what is at work in `scope` (a folder's id, or null for everything) */
export function atWork(d: Pick<Data, "pieces" | "regions"> & { work?: { autos?: Auto[] } }, scope: string | null,
  o: { runs: Record<string, RunBits>; held: Held | null; asked: (id: string) => string; lines: Line[] }): View {
  const now: Row[] = [];
  const autoIds = new Set<string>();
  for (const a of d.work?.autos ?? []) {
    const f = where(a, d.regions);
    if (!inScope(f, scope)) continue;
    autoIds.add(a.id);
    const r = autoRow(a, f);
    if (r) now.push(r);
  }
  const runOf = new Set(now.map((r) => r.sessionId));   // an automation's run is drawn as the automation, not twice
  for (const p of Object.values(d.pieces)) {
    if (p.kind !== "session" || p.inside || !inScope(p.region, scope) || runOf.has(sidOf(p))) continue;
    const r = sessionRow(p, o.asked, o.runs[sidOf(p)]);
    if (r) now.push(r);
  }
  const rank = { asks: 0, working: 1, held: 2 } as const;
  now.sort((x, y) => rank[x.stand] - rank[y.stand] || (y.since ?? 0) - (x.since ?? 0));
  const next: NextRow[] = [];
  let later = 0;
  for (const a of d.work?.autos ?? []) {
    if (!autoIds.has(a.id) || !a.on || now.some((r) => r.autoId === a.id)) continue;
    const at = dueToday(a.next);
    if (at == null) { later++; continue; }
    next.push({ id: a.id, name: a.name, folder: where(a, d.regions), when: at >= 24 * 60 ? a.next.replace(/^when /, "when ") : a.next.replace(/^today at /, ""), at });
  }
  next.sort((x, y) => x.at - y.at);
  const did = o.lines.filter((l) => !l.mine && !l.removed && (l.kind === "ai" || l.kind === "arrived") && inScope(l.region, scope)).sort((x, y) => y.t - x.t);
  const held = o.held && (scope == null || o.held.folder == null || o.held.folder === scope) ? o.held : null;
  return { now, next, later, did, running: now.filter((r) => r.stand === "working").length, needs: now.filter((r) => r.stand === "asks").length, held };
}

/** the sidebar's words and the folder's line: "3 running · 1 needs you", "No AI is working right now" (BR1 words pass) */
export function countWords(v: Pick<View, "running" | "needs" | "held">): string {
  if (v.held) return "Everything holds";
  const parts = [v.running ? `${v.running} running` : "", v.needs ? `${v.needs} need${v.needs === 1 ? "s" : ""} you` : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No AI is working right now";
}
