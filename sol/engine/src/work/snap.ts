// Pieces that snap (#1024, Build behind `build.snap`): the table the person builds on, kept by the engine, and a built
// row run as a real instruction. A row is pieces with typed ends (the face's snap/fit.ts draws and fits them): a time
// (now, each morning), a source (a folder), a job (a session), a check (the tests, a second read), your hand. Pressed,
// the row runs piece by piece, and every step moves on an event of the engine, never a timer: a job is said to its
// session and is done when that session's turn ends; a check is a turn that ends GREEN or RED; your hand stops the row
// and waits for the person's go. The face draws the charge from what this file tells (work.snap.run).
//
//   <STATE_DIR>/snap.json   { sections: [Section], runs: [Run] }   kept across restarts; a row's runs count its wear
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { STATE_DIR } from "./state.js";
import { giveTool } from "./tools.js";

export type Kind = "when" | "source" | "job" | "check" | "hand";
export type Brick = { id: string; kind: Kind; label: string; ref: string; hint?: string; hand?: "proposed" | "mine"; why?: string };
export type Section = { id: string; x: number; y: number; bricks: Brick[]; name?: string; runs?: number; ranAt?: number; madeAt?: number; by?: "me" | "one"; free?: string[]; asked?: number };
export type Charge = "wait" | "live" | "done" | "ask" | "red" | "skip";
export type Run = { id: string; section: string; at: number; states: Record<string, Charge>; step: number; ended?: number; result?: "done" | "red" | "stopped"; lines: string[];
  /** the session a job or check waits on now, and the session the row's work is in (a check reads it) */
  on?: string; work?: string; cwd?: string; red?: string };

const FILE = () => join(STATE_DIR, "snap.json");
type SnapFile = { sections: Section[]; runs: Run[]; told?: string[] };
let file: SnapFile | null = null;
function load(): SnapFile {
  if (file) return file;
  try { const v = JSON.parse(readFileSync(FILE(), "utf8")); file = { sections: Array.isArray(v.sections) ? v.sections : [], runs: Array.isArray(v.runs) ? v.runs : [] }; }
  catch { file = { sections: [], runs: [] }; }
  // a run cut by a restart of the engine is over: it says so, and the row is not left half lit
  for (const r of file!.runs) if (!r.ended) { r.ended = Date.now(); r.result = "stopped"; r.lines.push("the engine restarted; the run stopped"); for (const k of Object.keys(r.states)) if (r.states[k] === "live" || r.states[k] === "ask") r.states[k] = "skip"; }
  return file!;
}
function save() {
  const f = load(); f.runs = f.runs.slice(-30);
  mkdirSync(STATE_DIR, { recursive: true });
  const tmp = FILE() + ".tmp"; writeFileSync(tmp, JSON.stringify(f, null, 1)); renameSync(tmp, FILE());
}
export const _reload = () => { file = null; };

// ---- what the engine gives this file (wire.ts), so nothing here imports wire.ts
export type SnapDeps = {
  say: (sessionId: string, text: string, fresh?: { cwd: string }) => Promise<void>;
  exists: (id: string) => Promise<boolean>;
  lastWords: (id: string) => Promise<string>;
  perm: (id: string) => { answer: (allow: boolean) => void } | null;
  tell: (m: object) => void;
  /** the one session, told one line when a row it can see has run */
  one?: () => string | undefined;
  newId?: () => string;
};
let deps: SnapDeps | null = null;
export const setSnapDeps = (d: SnapDeps) => { deps = d; };
const need = () => { if (!deps) throw new Error("the bench is not wired yet"); return deps; };
const tellTable = () => { try { need().tell({ type: "work.snap.table", sections: load().sections }); } catch { /* not wired */ } };
const tellRun = (r: Run) => { try { need().tell({ type: "work.snap.run", run: r }); } catch { /* not wired */ } };

// ---- the table
const KINDS: Kind[] = ["when", "source", "job", "check", "hand"];
const clean = (b: any): Brick | null => {
  if (!b || typeof b.id !== "string" || !KINDS.includes(b.kind) || typeof b.label !== "string" || typeof b.ref !== "string") return null;
  return { id: b.id.slice(0, 120), kind: b.kind, label: b.label.slice(0, 120), ref: b.ref.slice(0, 400), ...(typeof b.hint === "string" ? { hint: b.hint.slice(0, 200) } : {}),
    ...(b.hand === "proposed" || b.hand === "mine" ? { hand: b.hand } : {}), ...(typeof b.why === "string" ? { why: b.why.slice(0, 60) } : {}) };
};
export const sections = () => load().sections;
/** the table as the face left it: what it built, where; a row's runs, age and asks are the engine's and stay */
export function putTable(raw: unknown): Section[] {
  const f = load(), before = new Map(f.sections.map((s) => [s.id, s]));
  const list = Array.isArray(raw) ? raw.slice(0, 40) : [];
  f.sections = list.flatMap((s: any) => {
    if (!s || typeof s.id !== "string") return [];
    const bricks = (Array.isArray(s.bricks) ? s.bricks : []).slice(0, 14).map(clean).filter((b: Brick | null): b is Brick => !!b);
    if (!bricks.length) return [];
    const was = before.get(s.id);
    return [{ id: s.id.slice(0, 80), x: Math.round(Number(s.x) || 0), y: Math.round(Number(s.y) || 0), bricks,
      ...(typeof s.name === "string" && s.name.trim() ? { name: s.name.trim().slice(0, 60) } : {}),
      runs: was?.runs ?? (Number(s.runs) || 0), ...(was?.ranAt ?? s.ranAt ? { ranAt: was?.ranAt ?? s.ranAt } : {}), madeAt: was?.madeAt ?? (Number(s.madeAt) || Date.now()),
      by: s.by === "one" ? "one" : "me", free: Array.isArray(s.free) ? s.free.map(String).slice(0, 20) : was?.free ?? [], asked: was?.asked ?? (Number(s.asked) || 0) } as Section];
  });
  save(); tellTable();
  // a row newly built with a job in it: the one session is told once, so it can put the person's hand where it matters
  const told = new Set(f.told ?? []), one = deps?.one?.();
  const fresh = f.sections.filter((s) => s.bricks.length >= 3 && s.bricks.some((b) => b.kind === "job") && !told.has(s.id));
  if (one && fresh.length) {
    for (const s of fresh) told.add(s.id);
    f.told = [...told].slice(-200); save();
    void need().say(one, `<a row was built on the bench>\n${fresh.map((s) => `${s.id}: ` + s.bricks.map((b, i) => `${i}. ${b.kind} ${b.label}`).join(" · ")).join("\n")}\nIf a place in it needs the person's word (a taste call, a merge, money, words in their name, a thing only they know), put their hand there with snap_hand, six words why. Otherwise do nothing. Say nothing in the talk.`).catch(() => {});
  }
  // a row taken off the table while it runs: its run stops (what its sessions did stays theirs)
  for (const r of [...live.values()]) if (!f.sections.some((s) => s.id === r.section)) end(r, "stopped", "the row was taken apart");
  return f.sections;
}
export const runs = () => load().runs;
export const runOf = (section: string) => load().runs.filter((r) => r.section === section).pop();

// ---- a row, run
const live = new Map<string, Run>();   // runs going now, by id
/** the row's words for a session: what it is part of, where, and what came before */
function jobWords(s: Section, r: Run, b: Brick, i: number): string {
  const name = s.name ? `“${s.name}”` : "a row the person built";
  return [`<a built row: ${name}, step ${i + 1} of ${s.bricks.length}>`,
    r.cwd ? `Work in ${r.cwd}.` : "",
    r.red ? `A check before you found this, fix it first:\n${r.red.slice(0, 1200)}` : "Go on with your job, as far as it goes in one turn.",
    "When you are done, say in one line what changed."].filter(Boolean).join("\n");
}
const CHECKS: Record<string, (cwd?: string) => string> = {
  tests: (cwd) => `Run this folder's own tests${cwd ? ` in ${cwd}` : ""} (its usual test command; do not change any file). Say in one line what ran. End with one word on its own line: GREEN if they all pass, RED if any fails.`,
  read: (cwd) => `Read the latest change${cwd ? ` in ${cwd}` : ""} (git diff, or the files changed last) as a careful second reader. Do not change anything. Name at most three things that are wrong, or say it is fine. End with one word on its own line: GREEN if it is fine, RED if it must be fixed first.`,
};
/** the words a turn ends on when it never reached the model (a sign-in, an API error): a failed turn, whatever its flag */
export const turnFailed = (t: string) => /^(Failed to authenticate|API Error|Invalid API key|Credit balance is too low|Claude Code process exited)/i.test(t.trim());
export const verdict = (t: string): "green" | "red" | null => { const m = /\b(GREEN|RED)\b[\s.*_`]*$/.exec(t.trim()); return m ? (m[1] === "RED" ? "red" : "green") : /\bRED\b/.test(t) ? "red" : /\bGREEN\b/.test(t) ? "green" : null; };

/** press a row's first piece: the row runs, piece by piece */
export async function runSection(id: string): Promise<Run> {
  const s = load().sections.find((x) => x.id === id);
  if (!s) throw new Error("there is no such row on the table");
  if (s.bricks.length < 2) throw new Error("one piece alone does nothing; snap a second to it");
  const going = [...live.values()].find((r) => r.section === id);
  if (going) return going;
  const r: Run = { id: `run-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, section: id, at: Date.now(), states: Object.fromEntries(s.bricks.map((b) => [b.id, "wait" as Charge])), step: 0, lines: [] };
  live.set(r.id, r); load().runs.push(r); save(); tellRun(r);
  await advance(r);
  return r;
}
async function advance(r: Run): Promise<void> {
  const s = load().sections.find((x) => x.id === r.section);
  if (!s) return end(r, "stopped", "the row was taken apart");
  const d = need();
  while (r.step < s.bricks.length) {
    const b = s.bricks[r.step], i = r.step;
    if (r.states[b.id] === "done" || r.states[b.id] === "red" || r.states[b.id] === "skip") { r.step++; continue; }
    if (b.kind === "when") { r.states[b.id] = "done"; r.lines.push(b.ref === "now" ? "pressed: now" : `${b.label}: started`); r.step++; continue; }
    if (b.kind === "source") { r.cwd = b.ref; r.states[b.id] = "live"; r.step++; save(); tellRun(r); continue; }   // lit until the next job takes it
    if (b.kind === "hand") {
      // a red with no job after it to fix it, or any hand: the row stops and asks the person
      r.states[b.id] = "ask"; s.asked = (s.asked ?? 0) + 1; r.lines.push(`asked you: ${b.why ?? "your hand"}`); save(); tellRun(r); tellTable();
      return;   // the person's go (hand()) moves it on
    }
    if (b.kind === "job") {
      const ok = await d.exists(b.ref);
      const sid = ok ? b.ref : (d.newId ?? randomUUID)();
      for (const k of s.bricks.slice(0, i)) if (r.states[k.id] === "live") r.states[k.id] = "done";   // the folder was taken
      r.states[b.id] = "live"; r.on = sid; r.work = sid; save(); tellRun(r);
      await d.say(sid, jobWords(s, r, b, i), ok ? undefined : { cwd: r.cwd ?? process.cwd() });
      delete r.red;
      return;   // its turn's end (hears) moves it on
    }
    if (b.kind === "check") {
      const ask = (CHECKS[b.ref] ?? CHECKS.tests)(r.cwd);
      const sid = b.ref === "tests" && r.work ? r.work : (d.newId ?? randomUUID)();
      for (const k of s.bricks.slice(0, i)) if (r.states[k.id] === "live") r.states[k.id] = "done";
      r.states[b.id] = "live"; r.on = sid; save(); tellRun(r);
      await d.say(sid, ask, sid === r.work ? undefined : { cwd: r.cwd ?? process.cwd() });
      return;
    }
  }
  for (const k of s.bricks) if (r.states[k.id] === "live") r.states[k.id] = "done";
  end(r, Object.values(r.states).includes("red") ? "red" : "done");
}
function end(r: Run, result: Run["result"], line?: string) {
  r.ended = Date.now(); r.result = result; delete r.on; if (line) r.lines.push(line);
  live.delete(r.id);
  const s = load().sections.find((x) => x.id === r.section);
  if (s && result !== "stopped") { s.runs = (s.runs ?? 0) + 1; s.ranAt = r.ended; }
  save(); tellRun(r); tellTable();
  const one = deps?.one?.();
  if (one && s) void need().say(one, `<a built row ran: ${s.name ? `“${s.name}”` : s.bricks.map((b) => b.label).join(" → ")}>\n${r.lines.join("\n")}\nResult: ${result}. Say it in one line only if the person must know.`).catch(() => {});
}
/** the person answers a piece that asked: a hand's go or stop; a job that waits on an allow, its allow or no */
export async function hand(runId: string, brick: string, go: boolean): Promise<Run> {
  const r = live.get(runId) ?? load().runs.find((x) => x.id === runId);
  if (!r || r.ended) throw new Error("that run is over");
  const s = load().sections.find((x) => x.id === r.section);
  const b = s?.bricks.find((x) => x.id === brick);
  if (!s || !b || r.states[brick] !== "ask") throw new Error("that piece is not asking");
  if (b.kind === "job" || b.kind === "check") {   // a session waiting on an allow
    need().perm(r.on ?? b.ref)?.answer(go); r.states[brick] = "live"; r.lines.push(go ? "you allowed it" : "you said no"); save(); tellRun(r); return r;
  }
  if (!go) { r.states[brick] = "skip"; for (const k of s.bricks.slice(s.bricks.indexOf(b) + 1)) r.states[k.id] = "skip"; r.lines.push("you stopped it here"); end(r, "stopped"); return r; }
  r.states[brick] = "done"; r.lines.push("you said go on"); r.step = s.bricks.indexOf(b) + 1; save(); tellRun(r);
  await advance(r);
  return r;
}
/** stop a run: what waits is let go; the sessions keep what they did */
export function stop(runId: string): Run {
  const r = live.get(runId); if (!r) throw new Error("that run is over");
  for (const k of Object.keys(r.states)) if (r.states[k] !== "done" && r.states[k] !== "red") r.states[k] = "skip";
  end(r, "stopped", "you stopped the row"); return r;
}

/** the engine's events: a session a run waits on ends its turn (done, or a check's verdict), or asks for an allow */
export function hears(m: { type?: string; sessionId?: string; ended?: boolean; waiting?: number; busy?: boolean; failed?: boolean }) {
  if (m.type !== "work.run" || !m.sessionId) return;
  for (const r of live.values()) {
    if (r.on !== m.sessionId) continue;
    const s = load().sections.find((x) => x.id === r.section); if (!s) continue;
    const b = s.bricks[r.step]; if (!b) continue;
    if (m.waiting && m.waiting > 0 && r.states[b.id] === "live") { r.states[b.id] = "ask"; r.lines.push(`${b.label} waits on your allow`); save(); tellRun(r); continue; }
    if (!m.waiting && m.busy && r.states[b.id] === "ask") { r.states[b.id] = "live"; save(); tellRun(r); continue; }
    if (!m.ended) continue;
    void need().lastWords(m.sessionId).then((t) => {
      if (m.failed || turnFailed(t)) {   // a turn that failed is never done: the row stops there, red, and says why in the session's words
        r.states[b.id] = "red"; r.lines.push(`${b.label}: its turn failed: ${t.replace(/\s+/g, " ").slice(0, 160) || "no words"}`);
        for (const k of s.bricks.slice(r.step + 1)) r.states[k.id] = "skip";
        r.step = s.bricks.length; save(); tellRun(r); return end(r, "red");
      }
      if (b.kind === "check") {
        const v = verdict(t);
        r.states[b.id] = v === "green" ? "done" : "red";   // a check that cannot say is not a pass
        r.lines.push(`${b.label}: ${v ?? "no verdict"}`);
        if (v !== "green") {
          r.red = t.slice(-1200);
          const next = s.bricks[r.step + 1];
          if (!next || (next.kind !== "job" && next.kind !== "hand")) { r.step = s.bricks.length; save(); tellRun(r); return end(r, "red"); }
        }
      } else { r.states[b.id] = "done"; r.lines.push(`${b.label}: ${t.replace(/\s+/g, " ").slice(0, 140) || "done"}`); }
      r.step++; delete r.on; save(); tellRun(r);
      return advance(r);
    }).catch(() => {});
  }
}

// ---- a time: a row that starts "each morning" runs once a day, at 9 or the first look after
const MORNING = 9;
export function dueToday(s: Section, now = new Date()): boolean {
  if (s.bricks[0]?.kind !== "when" || s.bricks[0].ref !== "morning" || s.bricks.length < 2) return false;
  if (now.getHours() < MORNING) return false;
  const ran = s.ranAt ? new Date(s.ranAt) : null;
  return !ran || ran.toDateString() !== now.toDateString();
}
let clock: NodeJS.Timeout | undefined;
export function startClock(every = 5 * 60_000) {
  clearInterval(clock);
  clock = setInterval(() => { for (const s of load().sections) if (dueToday(s)) void runSection(s.id).catch(() => {}); }, every);
  clock.unref?.();
}

// ---- the one session's say over your hands (#1024): it reads the rows and puts its hand where your word is worth most
// (a taste call, a merge, money, a thing only you know), six words why. It never puts one where you pulled one out.
/** a hand put in after piece `after` (pure): refused next to a hand, past the end, or at a place the person freed */
export function handAt(s: Section, after: number, why: string, id = `hand:one#${Date.now().toString(36)}`): Section | string {
  const b = s.bricks[after];
  if (!b) return "there is no piece there";
  if (b.kind === "hand" || s.bricks[after + 1]?.kind === "hand") return "a hand is already there";
  if ((s.free ?? []).includes(b.id)) return "the person took your hand out there: decide alone there";
  const words = why.trim().split(/\s+/).slice(0, 6).join(" ");
  return { ...s, bricks: [...s.bricks.slice(0, after + 1), { id, kind: "hand", label: "your hand", ref: "hand", hand: "proposed", why: words }, ...s.bricks.slice(after + 1)] };
}
export const rowsText = () => load().sections.filter((s) => s.bricks.length > 1).map((s) =>
  `${s.id}${s.name ? ` “${s.name}”` : ""} (ran ${s.runs ?? 0}×, asked ${s.asked ?? 0}×):\n` + s.bricks.map((b, i) => `  ${i}. ${b.kind}: ${b.label}${b.why ? ` (${b.why})` : ""}${(s.free ?? []).includes(b.id) ? " [free after: decide alone]" : ""}`).join("\n")).join("\n") || "no built rows";
export function giveSnapTools(oneId: string) {
  giveTool(oneId, {
    name: "snap_rows",
    description: "The rows the person built on the bench (Build's pieces that snap): each piece by index, kind and label, the hands in it and why, and the places they freed (where you decide alone).",
    shape: {},
    run: async () => rowsText(),
  });
  giveTool(oneId, {
    name: "snap_hand",
    description: "Put the person's hand into a built row, after the piece at `after`, where their word is worth most: a taste call, a merge, money, words in their name, a thing only they know. `why` is six words at most, in their words. Never where they took a hand out. To take one of yours out, `remove` its id.",
    shape: { row: z.string(), after: z.number().int().min(0).optional(), why: z.string().optional(), remove: z.string().optional() },
    run: async (a: { row: string; after?: number; why?: string; remove?: string }) => {
      const f = load(), s = f.sections.find((x) => x.id === a.row);
      if (!s) return "no such row";
      if (a.remove) { const b = s.bricks.find((x) => x.id === a.remove); if (!b || b.kind !== "hand" || b.hand !== "proposed") return "only a hand you put in can be taken out by you"; s.bricks = s.bricks.filter((x) => x !== b); save(); tellTable(); return "taken out"; }
      const r = handAt(s, a.after ?? -1, a.why ?? "");
      if (typeof r === "string") return r;
      Object.assign(s, r); save(); tellTable();
      return "put in; it shows on the bench with your words";
    },
  });
}
