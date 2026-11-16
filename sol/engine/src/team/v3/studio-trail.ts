// Cowork v3, slice 6 (fr-30, #559): the studio's one coupling to the trail. Everything else in the studio talks to
// `StudioTrail` only; the engine's is slice 0's trail through door.ts (`fromV3(door())`, studio-wire.ts). The memory
// and file trails below are the tests'.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

/** who wrote an event: a person, on a machine or as their agent (slice 0's By) */
export type By = { person: string; machine?: string; agent?: string };
/** what the studio hands the trail (slice 0's Draft, without base/fields) */
export type Draft = { project: string; kind: string; item?: string; field?: string; value?: unknown; by: By; at?: number };
/** what the trail hands back */
export type Ev = Draft & { id: string; seq: number; at: number };
export type StudioTrail = {
  append(d: Draft): Ev;
  /** every event of a project after `seq`, in order */
  since(project: string, seq?: number): Ev[];
};

/** a trail in memory (tests, and a Sol whose state dir cannot be written) */
export function memoryTrail(now: () => number = Date.now): StudioTrail & { all: Ev[] } {
  const all: Ev[] = [];
  return {
    all,
    append(d) { const e: Ev = { ...d, id: randomUUID(), seq: all.length + 1, at: d.at ?? now() }; all.push(e); return e; },
    since(project, seq = 0) { return all.filter((e) => e.project === project && e.seq > seq); },
  };
}

/** the stand-in on disk: one JSON line per event, read once, appended after */
export function fileTrail(file: string, now: () => number = Date.now): StudioTrail {
  const mem = memoryTrail(now);
  if (existsSync(file)) for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line) as Ev; if (e && typeof e.id === "string" && typeof e.project === "string") mem.all.push({ ...e, seq: mem.all.length + 1 }); } catch { /* a torn last line */ }
  }
  return {
    append(d) {
      const e = mem.append(d);
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      appendFileSync(file, JSON.stringify(e) + "\n", { mode: 0o600 });
      return e;
    },
    since: (p, s) => mem.since(p, s),
  };
}

/** slice 0's Trail seen as the studio's (structural, so this file imports nothing of it until it lands) */
export function fromV3(t: { append(d: Draft): { id: string; seq: number; at: number; value?: unknown } & Partial<Draft>; since(project: string, seq: number, limit?: number): ({ id: string; seq: number; at: number; project: string; kind: string; by: By; item?: string; field?: string; value?: unknown })[] }): StudioTrail {
  return {
    append(d) { const e = t.append(d); return { ...d, id: e.id, seq: e.seq, at: e.at }; },
    since(project, seq = 0) { return t.since(project, seq, 100_000).map((e) => ({ project: e.project, kind: e.kind, by: e.by, id: e.id, seq: e.seq, at: e.at, ...(e.item ? { item: e.item } : {}), ...(e.field ? { field: e.field } : {}), ...("value" in e ? { value: e.value } : {}) })); },
  };
}
