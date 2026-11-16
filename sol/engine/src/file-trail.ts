// One append-only trail in a file, one JSON line per event, read back by seq (#633). Lifted unchanged out of Cowork v3's
// team/v3/places-trail.ts (fr-30, slice 4: its stand-in until slice 0's signed trail), which re-exports it, so the home's
// log (kernel.ts) and that stand-in are one implementation and one event shape, and nothing outside team/v3 imports v3.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

export type By = { person: string; machine?: string; agent?: string };
/** what a writer asks to append (slice 0's Draft) */
export type Draft = { project: string; by: By; kind: string; item?: string; field?: string; value?: unknown; at?: number };
/** one event as this slice reads it (the parts of slice 0's TrailEvent it uses) */
export type Ev = { id: string; seq: number; at: number; project: string; by: By; kind: string; item?: string; field?: string; value?: unknown };
export interface TrailPort {
  append(d: Draft): Ev;
  since(project: string, seq?: number): Ev[];
}

/** a trail in memory: the tests', and the body of the file trail */
export function memoryTrail(o: { now?: () => number; seed?: Ev[] } = {}): TrailPort & { all: Ev[] } {
  const all: Ev[] = [...(o.seed ?? [])];
  const now = o.now ?? Date.now;
  return {
    all,
    append(d) {
      if (!d.project || !d.kind || !d.by?.person) throw new Error("an event names its project, its kind and who wrote it");
      const at = Math.floor(d.at ?? now());
      const seq = (all[all.length - 1]?.seq ?? 0) + 1;
      const id = createHash("sha256").update(JSON.stringify([d.project, d.kind, d.item, d.field, d.value, d.by, at, seq])).digest("hex");
      const e: Ev = { id, seq, at, project: d.project, by: d.by, kind: d.kind, ...(d.item !== undefined ? { item: d.item } : {}),
        ...(d.field !== undefined ? { field: d.field } : {}), ...(d.value !== undefined ? { value: d.value } : {}) };
      all.push(e);
      return e;
    },
    since: (project, seq = 0) => all.filter((e) => e.project === project && e.seq > seq),
  };
}

/** until slice 0's trail is here: the same events, one JSON line each */
export function fileTrail(file: string, now?: () => number): TrailPort {
  const seed: Ev[] = [];
  if (existsSync(file)) for (const l of readFileSync(file, "utf8").split("\n")) { try { const e = JSON.parse(l); if (e && typeof e.id === "string") seed.push(e); } catch { /* a torn line */ } }
  const mem = memoryTrail({ now, seed });
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
