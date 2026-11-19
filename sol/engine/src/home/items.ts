// The Thing store (#790; specs home-plan §6 Home 1, design §6.3): one folder a Thing, <HOME>/items/<id>/, holding
//   thing.json     the Thing as it is now: the face's fields (contract/home/today.ts) and the engine's own (`gone`,
//                  and from Home 5 `frozen`), which never reach the face (toFace)
//   v/<ver>.json   every version it ever had, never deleted; `ver` is the SHA-256 of the version's canonical JSON
// Each file is written whole (safewrite.ts). Nothing is ever deleted: `gone: true` hides a Thing. Every change is one
// event (R2): thing.new, thing.state or thing.done, carrying the new `ver` and the one before (`from`), with `cause` the
// act it follows from. The order: the version's file, then the event, then thing.json, so the log never names a version
// that is not on the disk; a thing.json left behind, or never written, by a stop between the two is put right at start
// (reconcile), and a newThing for an id the log already made puts it back instead of making it twice.
// Nothing here is made until the first Thing is: with Home's switch off there is no <HOME>/items.
import { readFileSync, readdirSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { canonical } from "../canonical.js";
import { plainIn, writeWhole } from "../safewrite.js";
import type { By } from "../file-trail.js";
import type { Thing as FaceThing } from "../contract/home/today.js";
import { ENGINE, type HomeEv } from "./log.js";
import type { Ctx } from "./unit.js";

/** a Thing as stored: the face's fields and the engine's own */
export type Thing = FaceThing & { gone?: true; frozen?: Record<string, unknown> };
/** a Thing's id: lower case, digits and dashes; one the engine makes is it-<12 hex> */
export const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const newId = (): string => `it-${randomBytes(6).toString("hex")}`;
/** a version's fingerprint (pure) */
export const verOf = (t: Thing): string => createHash("sha256").update(canonical(t)).digest("hex");
/** what the face is sent of a Thing (pure): its own fields only, in one order */
export function toFace(t: Thing): FaceThing {
  return {
    id: t.id, read: t.read, folder: t.folder, words: t.words, state: t.state, waitsOn: t.waitsOn,
    ...(t.due !== undefined ? { due: t.due } : {}), at: t.at, ...(t.blocks !== undefined ? { blocks: t.blocks } : {}),
    links: [...t.links], made: [...t.made], ...(t.card ? { card: t.card } : {}),
  };
}

export interface Items {
  dir: string;
  get(id: string): Thing | null;
  /** every Thing, the gone ones too, oldest first (then by id) */
  all(): Thing[];
  /** one of a Thing's versions, by its fingerprint */
  version(id: string, ver: string): Thing | null;
  /** a version kept under v/ (first), and its fingerprint */
  keep(t: Thing): string;
  /** thing.json written (after its event) */
  set(t: Thing): void;
}

export function openItems(home: string): Items {
  const dir = join(home, "items");
  const read = (file: string): Thing | null => {
    const f = plainIn(file, home);
    if (!f) return null;
    try { const t = JSON.parse(readFileSync(f, "utf8")); return t && typeof t === "object" && typeof t.id === "string" ? (t as Thing) : null; } catch { return null; }
  };
  const write = (file: string, t: Thing) => writeWhole(file, JSON.stringify(t, null, 2) + "\n", { root: home });
  return {
    dir,
    get(id) { if (!ID.test(id)) return null; const t = read(join(dir, id, "thing.json")); return t?.id === id ? t : null; },
    all() {
      let names: string[] = [];
      try { names = readdirSync(dir); } catch { return []; }
      return names.filter((n) => ID.test(n)).flatMap((n) => { const t = read(join(dir, n, "thing.json")); return t?.id === n ? [t] : []; })
        .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    },
    version(id, ver) { if (!ID.test(id) || !/^[0-9a-f]{64}$/.test(ver)) return null; const t = read(join(dir, id, "v", `${ver}.json`)); return t?.id === id && verOf(t) === ver ? t : null; },
    keep(t) { const ver = verOf(t); if (!this.version(t.id, ver)) write(join(dir, t.id, "v", `${ver}.json`), t); return ver; },
    set(t) { write(join(dir, t.id, "thing.json"), t); },
  };
}

type More = { cause?: string; by?: By; undo?: boolean; mode?: "record" | "replay" };
/** a Thing stored the first time: thing.new. null (and no event written) when that id is already there, in the store or
 *  on the log */
export function newThing(ctx: Ctx, t: Thing, more: More = {}): HomeEv | null {
  if (!ID.test(t.id)) throw new Error(`"${t.id}" is no Thing id: lower case, digits and dashes, 64 at most`);
  if (ctx.items.get(t.id)) return null;
  // the log already made it, but its thing.json was never written (a stop, or a failed write, after the event): put it
  // back from the version the log names, and write no second thing.new
  const was = loggedVer(ctx.log.all(), t.id);
  if (was) { const v = ctx.items.version(t.id, was) ?? (verOf(t) === was ? t : null); if (v) ctx.items.set(v); return null; }
  const ver = ctx.items.keep(t);
  const e = ctx.log.write({ kind: "thing.new", item: t.id, value: { ver, read: t.read, waitsOn: t.waitsOn, state: t.state }, by: more.by ?? ENGINE, ...(more.cause ? { cause: more.cause } : {}), ...(more.mode ? { mode: more.mode } : {}) });
  ctx.items.set(t);
  return e;
}
/** a Thing made the given one whole (an undo puts a version back this way): thing.done when it becomes done, else
 *  thing.state. null (and nothing written) when it is not there or nothing changed */
export function putThing(ctx: Ctx, next: Thing, more: More = {}): HomeEv | null {
  const cur = ctx.items.get(next.id);
  if (!cur) return null;
  const from = verOf(cur), ver = verOf(next);
  if (ver === from) return null;
  ctx.items.keep(next);
  const undo = more.undo ? { undo: true } : {};
  const value = next.state === "done" && cur.state !== "done"
    ? { ver, from, ...undo }
    : { ver, from, state: next.state, waitsOn: next.waitsOn, ...(next.gone ? { gone: true } : {}), ...undo };
  const e = ctx.log.write({ kind: next.state === "done" && cur.state !== "done" ? "thing.done" : "thing.state", item: next.id, value, by: more.by ?? ENGINE, ...(more.cause ? { cause: more.cause } : {}), ...(more.mode ? { mode: more.mode } : {}) });
  ctx.items.set(next);
  return e;
}
/** a Thing changed by some of its fields (a field given as undefined is taken away) */
export function changeThing(ctx: Ctx, id: string, patch: Partial<Thing>, more: More = {}): HomeEv | null {
  const cur = ctx.items.get(id);
  if (!cur) return null;
  const next = { ...cur, ...patch } as Record<string, unknown>;
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  return putThing(ctx, next as Thing, more);
}
/** the version of a Thing the log names last (its newest thing.new / thing.state / thing.done), or null */
export function loggedVer(evs: HomeEv[], id: string): string | null {
  for (let i = evs.length - 1; i >= 0; i--) {
    const e = evs[i];
    if (e.item === id && (e.kind === "thing.new" || e.kind === "thing.state" || e.kind === "thing.done")) return String((e.value as { ver?: unknown } | undefined)?.ver ?? "") || null;
  }
  return null;
}
/** at start: every Thing the log names whose thing.json is not the version its last event names (the engine stopped
 *  between the event and thing.json: a change, or a new Thing whose thing.json was never written) is put back to that
 *  version, from v/; no event, the log already says it */
export function reconcileItems(ctx: Ctx): number {
  const last = new Map<string, string>();
  for (const e of ctx.log.all()) {
    if (!e.item || (e.kind !== "thing.new" && e.kind !== "thing.state" && e.kind !== "thing.done")) continue;
    const ver = String((e.value as { ver?: unknown } | undefined)?.ver ?? "");
    if (ver) last.set(e.item, ver);
  }
  let n = 0;
  for (const [id, ver] of last) {
    const t = ctx.items.get(id);
    if (t && verOf(t) === ver) continue;
    const v = ctx.items.version(id, ver);
    if (v) { ctx.items.set(v); n++; }
  }
  return n;
}
