// owned by slice 4 (Life and Diary), docs/port/slices.md
// Life's wire (#1604, map.md rows 27–31: "yes"): in a real Sol each life folder's stickies are read from the engine,
// which keeps them in the folder's stickies.md (agent.stickies, the same list the old face's Home draws), and a sticky
// made, run, finished, dropped or dated is the old face's own message with the same meaning (agent.sticky {op}, agent.press,
// undo by the engine's id). The diary's next.diary.* are slice 7's: until a wire calls ready("write") the diary is
// "not yet" and its view draws nothing. The fixture never runs this.
// Signed: marcocyl04-ux's agent, slice 4 (#1615).
import { D, change, done, notYet, regionOf, subscribe, type Done, type Piece } from "../core.ts";
import { parseWhen } from "../../life/rules.ts";
import { asker } from "../../../agents/model.ts";
import type { Engine } from "./types.ts";

/** an item of a folder's stickies.md, as the engine answers it (home/folders/stickies.ts Made) */
type Item = { done: boolean; t: string; s: string; notes: string[] };
type Ans = { ok?: boolean; why?: string; items?: Item[]; undo?: string };
type Ask = <T>(o: { type: string } & Record<string, unknown>, ms: number) => Promise<T | null>;

/** a folder's path for the engine: the place's own path when the wire that filled the regions gave one, else its id */
const folderOf = (rid: string) => { const r = regionOf(rid) as { path?: unknown } | undefined; return typeof r?.path === "string" ? r.path : rid; };
const idOf = (rid: string, key: string) => `sk:${rid}:${key}`;
/** "due: 2026-11-20 18:00" → minutes from today's midnight, as the board's clock counts (rules.ts nowMin) */
function dueOf(notes: string[]): { due: number | null; allDay: boolean } {
  const n = notes.map((x) => /^due:\s*(\d{4})-(\d\d)-(\d\d)(?:\s+(\d\d):(\d\d))?/i.exec(x)).find(Boolean);
  if (!n) return { due: null, allDay: false };
  const day = new Date(+n[1], +n[2] - 1, +n[3]), t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const days = Math.round((day.getTime() - t0.getTime()) / 864e5);
  return { due: days * 1440 + (n[4] ? +n[4] * 60 + +n[5] : 23 * 60 + 59), allDay: !n[4] };
}
/** one item as a sticky piece: what its folder's agent did ("did: …") is kept under it, newest first */
export function toSticky(rid: string, it: Item): Piece {
  const did = it.notes.filter((x) => /^did\b/i.test(x)).map((x, i) => ({ id: `${idOf(rid, it.t)}.m${i + 1}`, kind: /draft/i.test(x) ? "draft" : "doc", title: x.replace(/^did:?\s*/i, ""), text: "", at: 0, by: "Your AI", state: /draft/i.test(x) ? "waits" : "kept" })).reverse();
  return { id: idOf(rid, it.t), region: rid, kind: "sticky", name: it.t, words: it.t, by: "person", state: it.done ? "done" : "open", at: 0, made: did, key: it.t, ...dueOf(it.notes) };
}
function take(rid: string, items: Item[] | undefined): void {
  if (!items) return;
  change((d) => {
    for (const p of Object.values(d.pieces)) if (p.kind === "sticky" && p.region === rid) delete d.pieces[p.id];
    for (const it of items) { const p = toSticky(rid, it); d.pieces[p.id] = p; }
  });
}
const pad = (n: number) => String(n).padStart(2, "0");
/** minutes from today's midnight → the engine's "2026-11-20 18:00" */
function stamp(at: number, allDay: boolean): string {
  const t = new Date(); t.setHours(0, 0, 0, 0); t.setMinutes(at);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}${allDay ? "" : ` ${pad(t.getHours())}:${pad(t.getMinutes())}`}`;
}

type Ops = { sticky: (...a: any[]) => Done; run_sticky: (...a: any[]) => Done; finish: (...a: any[]) => Done; drop: (...a: any[]) => Done; due: (...a: any[]) => Done };
let ops: Ops | null = null;
/** the life moves live, once the wire is attached (moves/life.ts reads this) */
export const live = (): Ops | null => ops;

function make(ask: Ask): Ops {
  const keyOf = (id?: string) => { const p = id ? D.pieces[id] : undefined; return p && p.kind === "sticky" ? { rid: p.region, key: String(p.key ?? p.name) } : null; };
  const op = (rid: string, o: Record<string, unknown>) => ask<Ans>({ type: "agent.sticky", folder: folderOf(rid), ...o }, 8000).then((r) => { if (r?.ok) take(rid, r.items); return r; });
  return {
    sticky(region?: string, words?: string) {
      const rid = region && regionOf(region) ? region : D.regions.find((r) => r.kind !== "code")?.id;
      const line = String(words ?? "").trim();
      if (!rid || !line) return { ok: false, why: "nothing to write", undo: () => {} };
      void op(rid, { op: "make", line });
      return done(true, idOf(rid, line), () => { void op(rid, { op: "remove", key: line }); });
    },
    run_sticky(id?: string) {
      const k = keyOf(id);
      if (!k) return done(false);
      void ask<Ans>({ type: "agent.press", folder: folderOf(k.rid), key: k.key }, 20 * 60_000).then(() => reload(ask, k.rid));
      return done(true, id);
    },
    finish(id?: string) {
      const k = keyOf(id);
      if (!k) return done(false);
      void op(k.rid, { op: "done", key: k.key, done: true });
      return done(true, id, () => { void op(k.rid, { op: "done", key: k.key, done: false }); });
    },
    drop(id?: string) {
      const k = keyOf(id);
      if (!k) return done(false);
      let back: string | undefined;
      void op(k.rid, { op: "remove", key: k.key }).then((r) => { back = r?.undo; });
      return done(true, id, () => { if (back) void op(k.rid, { op: "undo", id: back }); });
    },
    due(id?: string, when?: string | number | null) {
      const k = keyOf(id), p = id ? D.pieces[id] : undefined;
      if (!k || !p) return done(false);
      const was = typeof p.due === "number" ? stamp(p.due, !!p.allDay) : null;
      const none = when == null || when === "" || /^(none|never|no time)$/i.test(String(when)), t = none ? null : parseWhen(when);
      if (!none && !t) return notYet();
      const due = t ? stamp(t.at, t.allDay) : null;
      void op(k.rid, { op: "due", key: k.key, due });
      return done(true, id, () => { void op(k.rid, { op: "due", key: k.key, due: was }); });
    },
  };
}
async function reload(ask: Ask, rid: string): Promise<void> {
  const r = await ask<Ans>({ type: "agent.stickies", folder: folderOf(rid) }, 8000);
  if (r?.ok) take(rid, r.items);
}

/** live: every life folder's stickies read once, again when the engine says a folder changed */
export function attach(e: Engine): () => void {
  const a = asker(e.send, e.subscribe, { prefix: "nx-life" });
  ops = make(a.ask);
  const lifeFolders = () => D.regions.filter((r) => r.kind !== "code").map((r) => r.id);
  // a folder is read the first time it is there (the regions are another wire's, filled when the engine answers)
  const read = new Set<string>();
  const fresh = () => { for (const rid of lifeFolders()) if (!read.has(rid)) { read.add(rid); void reload(a.ask, rid); } };
  fresh();
  const offStore = subscribe(fresh);
  const off = e.subscribe((m: { type?: string; folder?: string }) => {
    if (m?.type !== "agent.changed" || !m.folder) return;
    const rid = lifeFolders().find((x) => folderOf(x) === m.folder || folderOf(x).endsWith("/" + m.folder));
    if (rid) void reload(a.ask, rid);
  });
  return () => { off(); offStore(); a.close(); ops = null; };
}
