// The because, live (BR1, #1615; mine/look/br1/because.html; sol/PROTOCOL.md "next.known"): what the people builder's
// engine holds, agreed with it: next.known (the one list of what Sol knows), next.you.fact.fix (a fix's preview, then
// its token kept or given back), next.you.source (a source off now, on from the next read, Back by fact.fix's token).
// An engine without them refuses an unknown message, so nothing is sent until next.you says it has them: they came
// with read.off, so a next.you whose read carries read.off holds all three. Then the because's fixer is held
// (because/fix.ts), next.known is read again after every change, and Settings › Privacy may switch a source. Replies
// are matched by rid (agents/model.ts asker). The placer (because/place.ts) is held with them: a folder Sol placed is
// answered by next.placed.seen, next.known.same.of, P's shelf (next.shelf.take, its Back next.shelf.put) and
// next.known.same. Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import { render } from "../core.ts";
import { asker } from "../../../agents/model.ts";
import { setFixer, type Fixer, type How, type Preview, type SameOf } from "../../because/fix.ts";
import { placedOf, setPlacer, type Placer } from "../../because/place.ts";
import { shelfNow, takeBack } from "../../shelf/model.ts";
import { forgotten, type Known } from "../../known.ts";
import type { Source } from "../../movein/you/types.ts";
import type { Engine } from "./types.ts";

type Ask = <T>(o: { type: string } & Record<string, unknown>, ms: number) => Promise<T | null>;
type FixAns = { ok?: boolean; saved?: boolean; preview?: Preview; same?: SameOf | null; token?: string; kept?: boolean; back?: boolean; why?: string };

let facts: Known[] | null = null;
/** next.known's list once the engine holds it (known.ts Sources.engine); null: the face's adapters say it */
export const knownEngine = (): Known[] | null => facts;
/** the keys the person forgot and has not brought back, from next.known's own fix lines (known.ts forgotten); null: no list */
export const forgotNow = (): Set<string> | null => forgotten(facts);

let live: { ask: Ask; refresh: () => void } | null = null;
/** a source off now (read false) or on from the next read; the answer gives Back (off only), or null: not taken */
export async function sourceSet(source: Source, read: boolean): Promise<{ when?: string; back: (() => Promise<void>) | null } | null> {
  const l = live;
  if (!l) return null;
  const r = await l.ask<{ ok?: boolean; token?: string; when?: string }>({ type: "next.you.source", source, read }, 8000);
  if (!r?.ok) return null;
  l.refresh();
  const tk = r.token;
  return { ...(r.when ? { when: r.when } : {}), back: !read && tk ? async () => { await l.ask<FixAns>({ type: "next.you.fact.fix", token: tk, back: true }, 8000); l.refresh(); } : null };
}

/** the fixer the because uses: a preview (right: saved at once, nothing to preview), then the token kept or given back */
export function fixerOf(ask: Ask, refresh: () => void): Fixer {
  return {
    async fix(a: { k: string; how: How; now?: string; place?: string }) {
      const r = await ask<FixAns>({ type: "next.you.fact.fix", k: a.k, how: a.how, ...(a.now ? { now: a.now } : {}), ...(a.place ? { place: a.place } : {}) }, 8000);
      if (!r?.ok) return null;
      if (r.saved && r.token) { refresh(); return { changes: [], token: r.token }; }
      return r.preview && Array.isArray(r.preview.changes) && typeof r.preview.token === "string" ? { ...r.preview, same: sameOk(r.same) } : null;
    },
    async settle(token: string, keep: boolean) {
      await ask<FixAns>({ type: "next.you.fact.fix", token, ...(keep ? { keep: true } : { back: true }) }, 8000);
      refresh();
    },
    async same(a: { reason: string; how: How; reach: "here" | "these" | "everywhere"; to?: string[] }) {
      const r = await ask<{ ok?: boolean }>({ type: "next.known.same", reason: a.reason, how: a.how, reach: a.reach, ...(a.to ? { to: a.to } : {}) }, 8000);
      refresh();
      return !!r?.ok;
    },
  };
}

/** the placer the because uses for a folder Sol placed: seen, the things placed alike, off the shelf (Back: onto it again,
 *  the person's own then), and "Same for these?" kept, the ones on the shelf taken off with it */
export function placerOf(ask: Ask, send: (m: Record<string, unknown>) => void, refresh: () => void): Placer {
  const shelved = (folder: string) => shelfNow().shelf.some((x) => x.folder === folder && x.by === "sol");
  return {
    onShelf: shelved,
    async right(folder) {
      const r = await ask<{ ok?: boolean }>({ type: "next.placed.seen", folder }, 8000);
      refresh();
      return !!r?.ok;
    },
    async sameOf(k, folder) {
      const r = await ask<{ ok?: boolean; same?: unknown }>({ type: "next.known.same.of", reason: k, place: folder }, 8000);
      return r?.ok ? sameOk(r.same) : null;
    },
    async take(folder, name) {
      if (!shelved(folder)) return null;
      takeBack(folder);   // the shelf's own wire: the engine's next.shelf answers and redraws it
      refresh();
      return () => { send({ type: "next.shelf.put", folder, name }); refresh(); };
    },
    async same({ reason, reach, to }) {
      const r = await ask<{ ok?: boolean }>({ type: "next.known.same", reason, how: "put-back", reach, ...(reach === "here" ? {} : { to }) }, 8000);
      if (r?.ok && reach !== "here") for (const k of to) { const f = placedOf(k); if (f && shelved(f)) takeBack(f); }
      refresh();
      return !!r?.ok;
    },
  };
}

/** the engine's same, only as the because can say it: a reason, a count and the places, else null */
const sameOk = (s: unknown): SameOf | null => {
  const o = s as SameOf | null | undefined;
  return o && typeof o.reason === "string" && Array.isArray(o.these) && o.these.length ? { reason: o.reason, n: o.these.length, these: o.these } : null;
};

export function attach(e: Engine): () => void {
  const a = asker(e.send, e.subscribe, { prefix: "nx-because" });
  let held = false;
  const readKnown = () => { void a.ask<{ ok?: boolean; facts?: Known[] }>({ type: "next.known", at: "you" }, 8000).then((r) => { if (r?.ok && Array.isArray(r.facts)) { facts = r.facts; render(); } }); };
  const refresh = () => { e.send({ type: "next.you" }); };
  const off = e.subscribe((m: { type?: string; ok?: boolean; you?: { read?: { off?: unknown } } }) => {
    if (m?.type !== "next.you" || m.ok === false || !m.you) return;
    const has = Array.isArray(m.you.read?.off);
    if (has && !held) { held = true; live = { ask: a.ask, refresh }; setFixer(fixerOf(a.ask, refresh)); setPlacer(placerOf(a.ask, (o) => e.send(o as never), refresh)); }
    else if (!has && held) { held = false; live = null; facts = null; setFixer(null); setPlacer(null); render(); }
    if (has) readKnown();
  });
  return () => { off(); a.close(); if (held) { live = null; facts = null; setFixer(null); setPlacer(null); } };
}
