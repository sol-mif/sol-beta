// Automations ("Sol works for you", BR1, #1615; carried from the lab's create_automation and its pump): something the
// person's AI does again and again on a clock. A person makes one (what it does, and when, in words), sees it, pauses it,
// runs it now and removes it (Undo puts it back). A new one starts paused: nothing runs until the person turns it on.
// When it is due it starts one fresh session of the person's AI that asks before each change (free: "ask"), the same
// hands work plans use (parts/next-work.ts). The time words are the clock's own (agent/sources/clock.ts whenOf, dueNow):
// "every day at 08:00", "on Mon and Thu at 09:30", "every 30 min 09:00–17:00". A time fires once a day, in the hour after
// it (an engine that was off at 08:00 and is back by 08:59 still runs it). One still working is never started twice.
// Or an event (BR1 item 2): "when a new file comes in" (or "… into inbox/") watches the folder it works in (its cwd), the
// folder source's own listing (agent/sources/folder.ts): what is there when it is made, changed or turned on is not news;
// at each look after it, files not seen before run it once, named in its words. It sits where it works: `region` is the
// window's folder it was made in, kept as given. The last five runs are kept (`ran`), so its piece can be watched.
//   SOL_HOME/next/automations.json   { autos: [Auto] }   written whole (file.ts)
// Signed: marcocyl04-ux's agent, BR1 "Sol works for you" (#1615).
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { dueNow, whenOf } from "../agent/sources/clock.js";
import { listFiles, newFiles, subOf } from "../agent/sources/folder.js";
import type { Rule } from "../agent/harness.js";
import { nextDir, readJson, writeJson } from "./file.js";
import type { Hands } from "./plans.js";

export type Last = { at: number; sessionId: string; state: "working" | "needs you" | "done" | "failed"; how: "clock" | "now" | "event"; files?: string[] };
export type Auto = {
  id: string; name: string; does: string; when: string; on: boolean; made: number;
  model: string | null; cwd: string | null;
  /** the window's folder it sits in, as the window named it, or null */
  region?: string | null;
  last?: Last; runs: number;
  /** the last five runs, newest first (the first is `last`) */
  ran?: Last[];
  /** the times already fired (clock.ts keys), the last few */
  fired: string[];
  /** an event's files already seen in its folder */
  seen?: string[];
  /** the session it was made in (make_automation, birth.html row 5): it lives on that session's table */
  in?: string;
};
export type R = { ok: true; auto: Auto } | { ok: false; why: string };

export const WHEN_HELP = "Say when with a time, like “every day at 08:00”, “on Mon at 09:30” or “every 30 min 09:00–17:00”, or an event: “when a new file comes in”.";
const NEEDS_FOLDER = "An event watches a folder on this Mac: make it in a folder that has one.";
const text = (x: unknown, max: number) => String(x ?? "").replace(/\r/g, "").trim().slice(0, max);
export const autosFile = (home: string) => join(nextDir(home), "automations.json");

/** the event it runs on, from its words (pure): a new file in its folder, or in a folder inside it ("… into inbox/") */
export function eventOf(when: string): { kind: "file"; sub: string } | null {
  const s = when.toLowerCase();
  if (!/^\s*(when|whenever|each time|every time)\b/.test(s) || !/\bfiles?\b/.test(s) || !/\b(new|comes?|lands?|arrives?|appears?|added|dropped)\b/.test(s)) return null;
  const into = /\binto\s+([a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*)\/?/i.exec(when);
  return { kind: "file", sub: into && !into[1].startsWith(".") ? into[1] : subOf(when.replace(/\bin\s+(this|its|the|my|your)\s+folder\b/gi, "")) };
}
const okWhen = (w: string) => !!(whenOf(w) || eventOf(w));
const SEEN = 2000;
/** what is in an event's folder now */
const look = (a: Pick<Auto, "cwd" | "when">) => { const e = eventOf(a.when); return e && a.cwd ? listFiles(a.cwd, e.sub).slice(-SEEN) : []; };

export function readAutos(home: string): Auto[] {
  const d = readJson(autosFile(home)).data;
  return Array.isArray(d.autos) ? (d.autos as Auto[]).filter((a) => a && typeof a.id === "string" && typeof a.when === "string") : [];
}
const writeAutos = (home: string, autos: Auto[]) => writeJson(autosFile(home), { autos });
export const autosMsg = (home: string) => ({ type: "next.autos", autos: readAutos(home).map(({ fired: _f, seen: _s, ...a }) => ({ ...a, next: nextOf(a) })) });

/** when it runs next, in words a person reads (pure): "paused", the event, or the next time today or later */
export function nextOf(a: Pick<Auto, "on" | "when">, now = new Date()): string {
  if (!a.on) return "paused";
  const e = eventOf(a.when);
  if (e) return `when a new file comes in${e.sub ? ` to ${e.sub}/` : ""}`;
  const w = whenOf(a.when);
  if (!w) return "never: its time cannot be read";
  const mins = now.getHours() * 60 + now.getMinutes();
  const pad = (n: number) => String(n).padStart(2, "0");
  const at = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const today = !w.days || w.days.includes(now.getDay());
  const times = [...w.times.map((t) => t.h * 60 + t.m)];
  if (w.every) for (let m = w.every.from; m <= w.every.to; m += w.every.mins) times.push(m);
  const later = times.filter((m) => m > mins).sort((x, y) => x - y)[0];
  if (today && later !== undefined && w.examMinus === null) return `today at ${at(later)}`;
  return w.examMinus !== null ? "on its day" : "on its next day";
}

/** Add's "When it runs" read back as it is typed (pure, nothing kept): when it would run next once on, said the way its
 *  piece says it, or why the words cannot be read; an event wants a folder on this Mac (cwd) */
export function whenRead(m: { when?: unknown; cwd?: unknown }, now = new Date()): { ok: true; next: string; event: boolean } | { ok: false; why: string } {
  const when = text(m.when, 200);
  if (!okWhen(when)) return { ok: false, why: WHEN_HELP };
  const event = !!eventOf(when);
  if (event && !(typeof m.cwd === "string" && m.cwd.startsWith("/"))) return { ok: false, why: NEEDS_FOLDER };
  return { ok: true, next: nextOf({ on: true, when }, now), event };
}

const rule = (a: Auto): Rule => ({ id: a.id, sentence: a.when, source: "clock", mode: a.on ? "on" : "off", rung: "ask" } as unknown as Rule);

export function make(home: string, m: { name?: unknown; does?: unknown; when?: unknown; model?: unknown; cwd?: unknown; region?: unknown; in?: unknown }, now = Date.now()): R {
  const does = text(m.does, 8000), when = text(m.when, 200);
  if (!does) return { ok: false, why: "Say what it should do." };
  if (!okWhen(when)) return { ok: false, why: WHEN_HELP };
  const cwd = typeof m.cwd === "string" && m.cwd.startsWith("/") ? m.cwd : null;
  if (eventOf(when) && !cwd) return { ok: false, why: NEEDS_FOLDER };
  const a: Auto = {
    id: `auto-${randomUUID().slice(0, 8)}`, name: text(m.name, 120) || does.split(/[.\n]/)[0].slice(0, 60), does, when, on: false, made: now,
    model: typeof m.model === "string" && m.model.trim() ? m.model.trim().slice(0, 80) : null,
    cwd, region: typeof m.region === "string" && m.region.trim() ? m.region.trim().slice(0, 300) : null, runs: 0, fired: [],
    ...(typeof m.in === "string" && m.in.trim() ? { in: m.in.trim().slice(0, 80) } : {}),
  };
  if (eventOf(when)) a.seen = look(a);
  writeAutos(home, [...readAutos(home), a]);
  return { ok: true, auto: a };
}

function change(home: string, id: unknown, f: (a: Auto) => string | null): R {
  const autos = readAutos(home), a = autos.find((x) => x.id === id);
  if (!a) return { ok: false, why: "That automation is not here any more." };
  const why = f(a);
  if (why) return { ok: false, why };
  writeAutos(home, autos);
  return { ok: true, auto: a };
}

/** turn it on or pause it; change what it does or when. Pausing never stops a run already working */
export function set(home: string, m: { id?: unknown; on?: unknown; does?: unknown; when?: unknown; name?: unknown }, now = new Date()): R {
  return change(home, m.id, (a) => {
    if (m.when !== undefined) {
      const w = text(m.when, 200);
      if (!okWhen(w)) return WHEN_HELP;
      if (eventOf(w) && !a.cwd) return NEEDS_FOLDER;
      if (eventOf(w) && w !== a.when) a.seen = look({ ...a, when: w });
      a.when = w;
    }
    if (m.does !== undefined) { const d = text(m.does, 8000); if (!d) return "Say what it should do."; a.does = d; }
    if (m.name !== undefined) a.name = text(m.name, 120) || a.name;
    if (typeof m.on === "boolean") {
      // turned on: what is already due today is counted as fired, so turning on at noon does not run the 08:00 at once,
      // and an event's files already there are not news
      if (m.on && !a.on) { a.fired = [...a.fired, ...dueNow(rule({ ...a, on: true }), now, a.fired)].slice(-50); if (eventOf(a.when)) a.seen = look(a); }
      a.on = m.on;
    }
    return null;
  });
}

export function remove(home: string, m: { id?: unknown }): R {
  const autos = readAutos(home), a = autos.find((x) => x.id === m.id);
  if (!a) return { ok: false, why: "That automation is not here any more." };
  writeAutos(home, autos.filter((x) => x !== a));
  return { ok: true, auto: a };
}
export function restore(home: string, auto: unknown): R {
  const a = auto as Auto;
  if (!a || typeof a.id !== "string" || typeof a.when !== "string") return { ok: false, why: "There is nothing to put back." };
  const autos = readAutos(home);
  if (!autos.some((x) => x.id === a.id)) writeAutos(home, [...autos, { ...a, fired: Array.isArray(a.fired) ? a.fired : [], ...(eventOf(a.when) ? { seen: look(a) } : {}) }]);
  return { ok: true, auto: a };
}

const busy = (a: Auto) => a.last?.state === "working" || a.last?.state === "needs you";
const RAN = 5;
/** a run's state, in `last` and in the newest of `ran` (the same run) */
const mark = (a: Auto, state: Last["state"]) => { if (!a.last) return; a.last.state = state; if (a.ran?.[0]?.sessionId === a.last.sessionId) a.ran[0].state = state; };

async function run(a: Auto, hands: Hands, how: Last["how"], cwd: string, now: number, files: string[] = []) {
  const sessionId = randomUUID();
  a.last = { at: now, sessionId, state: "working", how, ...(files.length ? { files: files.slice(0, 20) } : {}) };
  a.ran = [{ ...a.last }, ...(a.ran ?? [])].slice(0, RAN);
  a.runs++;
  const why = how === "now" ? "now, on the person's press" : how === "event" ? `because new files came in: ${files.slice(0, 20).join(", ")}` : `on its clock: ${a.when}`;
  try {
    await hands.start(sessionId, `${a.does}\n\n(This is the automation "${a.name}", run ${why}. When it is done, say in a few lines what you did or found.)`,
      { cwd: a.cwd ?? cwd, model: a.model, title: a.name });
  } catch { mark(a, "failed"); }
}

/** run it now, on the person's press (on or paused: the press is theirs); never while a run of it is still working */
export async function runNow(home: string, m: { id?: unknown }, hands: Hands, cwd: string, now = Date.now()): Promise<R> {
  const autos = readAutos(home), a = autos.find((x) => x.id === m.id);
  if (!a) return { ok: false, why: "That automation is not here any more." };
  if (busy(a)) return { ok: false, why: "It is still working on its last run." };
  await run(a, hands, "now", cwd, now);
  writeAutos(home, autos);
  return { ok: true, auto: a };
}

/** one pass: each last run's state read from its session, then each due automation started. Whether anything changed */
export async function tick(home: string, hands: Hands, cwd: string, now = new Date()): Promise<boolean> {
  const autos = readAutos(home);
  let changed = false;
  for (const a of autos) {
    if (a.last && busy(a)) {
      const st = hands.status(a.last.sessionId);
      const next = st === "working" ? "working" : st === "asks" ? "needs you" : st === "failed" ? "failed" : now.getTime() - a.last.at < 20000 ? a.last.state : "done";
      if (next !== a.last.state) { mark(a, next); changed = true; }
    }
    if (!a.on) continue;
    if (eventOf(a.when)) {
      // the event: files not seen before in its folder, seen once whether or not they ran it (a run still working takes none)
      const files = look(a), fresh = newFiles(a.seen ?? [], files);
      if (!fresh.length) continue;
      a.seen = files;
      changed = true;
      if (!busy(a)) await run(a, hands, "event", cwd, now.getTime(), fresh);
      continue;
    }
    const due = dueNow(rule(a), now, a.fired);
    if (!due.length) continue;
    a.fired = [...a.fired, ...due].slice(-50);
    changed = true;
    if (!busy(a)) await run(a, hands, "clock", cwd, now.getTime());
  }
  if (changed) writeAutos(home, autos);
  return changed;
}
