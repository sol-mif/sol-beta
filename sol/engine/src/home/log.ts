// Home's door to the log (specs home-plan §4.5): the only Home file that touches the kernel's log, built on the event
// format v1 (log.ts, contract/kinds.ts) through the kernel's own append(). Every Home event is one of the kernel's:
// its id is the ledgerId a receipt carries, its kind has its row (an unregistered kind throws), `cause` points at the
// act it follows from, `mode` says record or replay, and free text (`words`) never stands on the line: it goes into
// the value, whose row carries `words` as text, so the value is kept in a value file and the line holds its hash. The
// fsync of "about to do" (run.about, rung.asked) is the row's; a write that asks for it of another kind throws.
//   all()   every Home event, oldest first: read once from the log at start, then kept as the kernel writes them
//   on()    told of each new one
//   words() a value's free text, null when it was erased or there is none
// memoryLog() is the same door over memory, for tests.
import type { By } from "../file-trail.js";
import type { Kernel } from "../kernel.js";
import { idOf, PAGE, type AnyEv, type LogBody } from "../log.js";
import { hashOf } from "../canonical.js";
import { isHomeKind, kindRow } from "../contract/kinds.js";

export type HomeEv = { id: string; seq: number; at: number; kind: string; item?: string; field?: string;
  value?: unknown; cause?: string; mode?: "record" | "replay"; by: By; erased?: true };
export type HomeWrite = { kind: string; item?: string; field?: string;
  value?: Record<string, unknown>;   // inline, no free text
  words?: unknown;      // free text -> the value's `words` field, in a value file; the line carries its hash (design §6.1)
  cause?: string; mode?: "record" | "replay";
  sync?: boolean;       // says it must be on the disk before this returns: only a kind whose row says fsync
  by?: By };
export interface HomeLog {
  write(w: HomeWrite): HomeEv;
  all(): HomeEv[];                         // every Home event, oldest first
  on(f: (e: HomeEv) => void): () => void;
  words(e: HomeEv): unknown | null;        // the value file's content, null if erased or absent
}

/** what the engine does on its own (reconcile, restart marks); a person's press in the face is { person: "you" } */
export const ENGINE: By = { person: "engine" };
export const YOU: By = { person: "you" };

/** a line of the log that is Home's: a Home kind, or a block's trouble said of a Home seam (`where` "home.<seam>") */
export function homeEv(e: { kind: string; value?: unknown }): boolean {
  if (isHomeKind(e.kind)) return true;
  const where = (e.value as { where?: unknown } | undefined)?.where;
  return e.kind === "plugin.trouble" && typeof where === "string" && where.startsWith("home.");
}
/** the value a write puts on the event: its inline value, with the words beside it */
function valueOf(w: HomeWrite): Record<string, unknown> | undefined {
  const row = kindRow(w.kind);
  if (!row) throw new Error(`the log takes no "${w.kind}": a kind is written once it has its row in contract/kinds.ts`);
  if (w.sync && !row.fsync) throw new Error(`${w.kind} is not one the log puts on the disk first: its row says no fsync`);
  if (w.words === undefined) return w.value;
  return { ...(w.value ?? {}), words: w.words };
}
const wordsOf = (e: HomeEv): unknown | null => {
  if (e.erased) return null;
  const v = e.value as { words?: unknown } | undefined;
  return v && typeof v === "object" && v.words !== undefined ? v.words : null;
};

/** Home's door on the engine's one log (the kernel, with the frame on) */
export function homeLog(k: Kernel): HomeLog {
  const evs: HomeEv[] = [];
  const ears = new Set<(e: HomeEv) => void>();
  for (let seq = 0; ;) {
    const page: AnyEv[] = k.since(seq);
    for (const e of page) if (e.v === 1 && homeEv(e)) evs.push(e);
    if (page.length < PAGE) break;
    seq = page[page.length - 1].seq;
  }
  // every event the kernel writes from now on, Home's own and any other door's, in the order written
  k.heard((e) => {
    if (!homeEv(e)) return;
    evs.push(e);
    for (const f of ears) { try { f(e); } catch (err) { console.error("home:", err instanceof Error ? err.message : String(err)); } }
  });
  return {
    write(w) {
      const value = valueOf(w);
      return k.append(w.kind, w.item, value, w.by ?? ENGINE, { ...(w.cause ? { cause: w.cause } : {}), ...(w.mode ? { mode: w.mode } : {}), ...(w.field !== undefined ? { field: w.field } : {}) });
    },
    all: () => evs.slice(),
    on(f) { ears.add(f); return () => { ears.delete(f); }; },
    words: wordsOf,
  };
}

/** the same door over memory (tests): the same rows, ids made the same way (the SHA-256 of the canonical body) */
export function memoryLog(now: () => number = Date.now): HomeLog {
  const evs: HomeEv[] = [];
  const ears = new Set<(e: HomeEv) => void>();
  return {
    write(w) {
      const raw = valueOf(w);
      const value: unknown = raw === undefined ? undefined : JSON.parse(JSON.stringify(raw));
      const before = evs[evs.length - 1];
      const body: LogBody = {
        v: 1, project: "home", by: w.by ?? ENGINE, kind: w.kind, ...(w.item !== undefined ? { item: w.item } : {}), ...(w.field !== undefined ? { field: w.field } : {}),
        hash: hashOf(value), at: Math.floor(now()), prev: before?.id ?? "", ...(w.cause ? { cause: w.cause } : {}), ...(w.mode ? { mode: w.mode } : {}),
      };
      const e: HomeEv = { ...body, id: idOf(body), seq: (before?.seq ?? 0) + 1, ...(value !== undefined ? { value } : {}) };
      evs.push(e);
      for (const f of ears) { try { f(e); } catch { /* a listener's own trouble */ } }
      return e;
    },
    all: () => evs.slice(),
    on(f) { ears.add(f); return () => { ears.delete(f); }; },
    words: wordsOf,
  };
}
