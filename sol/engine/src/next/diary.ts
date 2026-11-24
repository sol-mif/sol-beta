// The diary (#1604, map.md rows 25 "write", 26 "remove_line", "Pausing the diary"): a page a day, one
// SOL_HOME/next/diary/<day>.jsonl per day (the Mac's local day), appended to the way dictations.ts kept its days. Nothing
// in a day file is ever rewritten: a line written is a `write` event, a removal is a `remove` event appended after it, and
// its undo appends the reverse (`back`), so every step can be taken back and the file is the whole story. Reading a day
// folds its events into the lines that stand. A line in the file that cannot be read is skipped, never a crash.
// The words never reach track.ts: this file does not import it, and the wire's counting keeps a next.* message's type
// only (track.ts "counted by its type alone").
//   next.diary.get    { day? }                            → next.diary { day, lines, paused }
//   next.diary.write  { words, region?, embed?, via? }    via ("island", "voice", "keys"…) kept as given, for the island's line
//   next.diary.remove { lineId, back? }                   back: true is the removal's undo
//   next.diary.pause  { on }                              while paused, a line said elsewhere (via island or voice) is
//                                                         not written, only counted; a line typed on the page still is
// Signed: marcocyl04-ux's agent, slice 7b of the port (#1615).
import { appendFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { nextDir, readJson, writeJson } from "./file.js";

/** a line the person wrote, or one Sol wrote for a session (who "sol"), which carries its because: the keys of the facts
 *  in next.known it acted on (one store, #1615); a line Sol writes without one is refused */
export type Line = { id: string; at: number; who: "person" | "sol"; words: string; region: string | null; embed: unknown; via: string | null; session?: string; because?: string[] };
export type Pause = { from: number; to?: number; skipped: number };
type Ev =
  | { ev: "write"; id: string; at: number; words: string; region?: string; embed?: unknown; via?: string; who?: "sol"; session?: string; because?: string[] }
  | { ev: "remove" | "back"; line: string; at: number };

export const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_WORDS = 4000;
/** the vias that are said somewhere other than the page, and so wait while the diary is paused */
const ELSEWHERE = new Set(["island", "voice"]);

export const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const diaryDir = (home: string) => join(nextDir(home), "diary");
export const dayFile = (home: string, day: string) => join(diaryDir(home), `${day}.jsonl`);
const pauseFile = (home: string) => join(diaryDir(home), "pause.json");

function events(home: string, day: string): Ev[] {
  let text = "";
  try { text = readFileSync(dayFile(home, day), "utf8"); } catch { return []; }
  const out: Ev[] = [];
  for (const l of text.split("\n")) {
    if (!l.trim()) continue;
    try { const e = JSON.parse(l); if (e && (e.ev === "write" ? typeof e.id === "string" && typeof e.words === "string" : (e.ev === "remove" || e.ev === "back") && typeof e.line === "string")) out.push(e); }
    catch { /* a broken line (a stop mid-append): skipped */ }
  }
  return out;
}

/** a day's lines that stand, in the order they were written (pure over the file) */
export function readDay(home: string, day: string): Line[] {
  const lines = new Map<string, Line>(), gone = new Set<string>();
  for (const e of events(home, day)) {
    if (e.ev === "write") lines.set(e.id, { id: e.id, at: e.at, who: e.who === "sol" ? "sol" : "person", words: e.words, region: e.region ?? null, embed: e.embed ?? null, via: e.via ?? null,
      ...(e.who === "sol" && e.session ? { session: e.session } : {}), ...(e.who === "sol" && e.because?.length ? { because: e.because } : {}) });
    else if (e.ev === "remove") gone.add(e.line);
    else gone.delete(e.line);
  }
  return [...lines.values()].filter((l) => !gone.has(l.id));
}

export function readPause(home: string): Pause | null {
  const p = readJson(pauseFile(home)).data;
  return typeof p.from === "number" && typeof p.to !== "number" ? { from: p.from, skipped: typeof p.skipped === "number" ? p.skipped : 0 } : null;
}

export const diaryMsg = (home: string, day: string) => ({ type: "next.diary", day, lines: readDay(home, day), paused: readPause(home) });

function append(home: string, day: string, e: Ev) {
  mkdirSync(diaryDir(home), { recursive: true });
  appendFileSync(dayFile(home, day), JSON.stringify(e) + "\n");
}

const small = (v: unknown, max: number) => { try { const s = JSON.stringify(v); return s !== undefined && s.length <= max; } catch { return false; } };

export type Done = { ok: true; day: string; id?: string; skipped?: true } | { ok: false; why: string };

export const NO_LINE_BECAUSE = "a line Sol writes for a session carries its because: the keys of the facts it acted on";
/** next.diary.write: one line appended to today's page; `sol` (the engine's, never the window's): a line Sol writes for a
 *  session, with the because the caller checked against what Sol knows (you-known.ts becauseFor) */
export function writeLine(home: string, m: unknown, now = new Date(), sol?: { session: string; because: string[] | null }): Done {
  const x = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
  if (sol && !sol.because?.length) return { ok: false, why: NO_LINE_BECAUSE };
  const words = typeof x.words === "string" ? x.words.trim() : "";
  if (!words) return { ok: false, why: "a line needs its words" };
  if (words.length > MAX_WORDS) return { ok: false, why: "a line of the diary holds 4000 characters" };
  const via = typeof x.via === "string" && /^[a-z][a-z0-9-]{0,19}$/.test(x.via) ? x.via : undefined;
  const day = dayOf(now);
  const pause = readPause(home);
  if (pause && via && ELSEWHERE.has(via)) {
    writeJson(pauseFile(home), { ...pause, skipped: pause.skipped + 1 });
    return { ok: true, day, skipped: true };
  }
  const id = `dl-${randomBytes(6).toString("hex")}`;
  append(home, day, {
    ev: "write", id, at: now.getTime(), words,
    ...(typeof x.region === "string" && x.region && x.region.length <= 300 ? { region: x.region } : {}),
    ...(x.embed !== undefined && x.embed !== null && small(x.embed, 2000) ? { embed: x.embed } : {}),
    ...(via ? { via } : {}),
    ...(sol ? { who: "sol" as const, session: sol.session.slice(0, 120), because: sol.because!.slice(0, 40) } : {}),
  });
  return { ok: true, day, id };
}

/** next.diary.remove: the reverse event appended to the line's own day (back: true, the removal's undo) */
export function removeLine(home: string, m: unknown, now = new Date()): Done {
  const x = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
  const id = typeof x.lineId === "string" ? x.lineId : "";
  if (!/^dl-[0-9a-f]{12}$/.test(id)) return { ok: false, why: "which line?" };
  // the line's day: today's page first, then the days before, newest first
  const days = [dayOf(now), ...daysKept(home).reverse()].filter((d, i, a) => a.indexOf(d) === i);
  const day = days.find((d) => events(home, d).some((e) => e.ev === "write" && e.id === id));
  if (!day) return { ok: false, why: "that line is not in the diary" };
  const back = x.back === true, stands = readDay(home, day).some((l) => l.id === id);
  if (back === stands) return { ok: true, day, id };   // already so: nothing appended
  append(home, day, { ev: back ? "back" : "remove", line: id, at: now.getTime() });
  return { ok: true, day, id };
}

/** next.diary.pause { on }: SOL_HOME/next/diary/pause.json, written whole */
export function pauseDiary(home: string, on: boolean, now = Date.now()): Pause | null {
  const was = readPause(home);
  if (on && !was) writeJson(pauseFile(home), { from: now, skipped: 0 });
  else if (!on && was) writeJson(pauseFile(home), { ...was, to: now });
  return readPause(home);
}

/** the days that have a page, oldest first */
export function daysKept(home: string): string[] {
  try {
    return readdirSync(diaryDir(home)).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).map((f) => f.slice(0, 10)).sort();
  } catch { return []; }
}
