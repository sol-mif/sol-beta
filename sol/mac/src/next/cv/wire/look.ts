// A folder's parts, live (BR1, #1615; sol/PROTOCOL.md "A folder's parts", P's engine half, next/look.ts): the looks the
// engine reads of the folders shown, a press that ranks a part higher there, a hide (here, these, everywhere) with the
// "same" it answers, and a part brought back. Every answer is next.folder.look { looks }, merged here by folder; an
// engine without it refuses or never answers, and then no folder draws parts (folder/parts/Parts.tsx). Replies are
// matched by rid (agents/model.ts asker). Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import { D, render } from "../core.ts";
import { asker } from "../../../agents/model.ts";
import type { SameOf } from "../../because/fix.ts";
import type { Look, PartId, Reach } from "../../folder/parts/model.ts";
import type { Engine } from "./types.ts";

type Ask = <T>(o: { type: string } & Record<string, unknown>, ms: number) => Promise<T | null>;
type Ans = { type?: string; looks?: Record<string, Look>; same?: SameOf | null };

let looks: Record<string, Look> = {};
let ask: Ask | null = null;
const asked = new Set<string>();

/** the engine's look of one folder, once it said it; null: not known (yet) */
export const lookLive = (rid: string): Look | null => looks[rid] ?? null;
/** every look the engine said, by folder: what "these" are drawn from */
export const looksLive = (): Readonly<Record<string, Look>> => looks;

/** the folders the face shows: a hide's `folders`, so its same names only those */
const shown = () => (D.regions ?? []).map((r) => r.id);

const take = (r: Ans | null): Ans | null => {
  if (!r || r.type !== "next.folder.look" || !r.looks || typeof r.looks !== "object") return null;
  looks = { ...looks, ...r.looks };
  render();
  return r;
};

/** asked once per folder, when a folder's page first wants its parts */
export function lookAsk(rid: string): void {
  const a = ask;
  if (!a || asked.has(rid)) return;
  asked.add(rid);
  void a<Ans>({ type: "next.folder.look", folder: rid }, 8000).then(take);
}

/** a part used there: it ranks higher in that folder */
export function lookPress(rid: string, part: PartId): void {
  void ask?.<Ans>({ type: "next.folder.press", folder: rid, part }, 8000).then(take);
}

/** a part hidden; "these" needs `to`, the folders the same reading showed it. The answer's same (or null); false: not taken */
export async function lookHide(rid: string, part: PartId, reach: Reach, to?: string[]): Promise<SameOf | null | false> {
  if (!ask) return false;
  const r = take(await ask<Ans>({ type: "next.folder.part.hide", folder: rid, part, reach, folders: shown(), ...(reach === "these" && to ? { to } : {}) }, 8000));
  if (!r) return false;
  const s = r.same;
  return s && typeof s.reason === "string" && Array.isArray(s.these) && s.these.length ? { reason: s.reason, n: s.these.length, these: s.these } : null;
}

/** a hidden part back in that folder only */
export async function lookBack(rid: string, part: PartId): Promise<boolean> {
  if (!ask) return false;
  return !!take(await ask<Ans>({ type: "next.folder.part.back", folder: rid, part }, 8000));
}

export function attach(e: Engine): () => void {
  const a = asker(e.send, e.subscribe, { prefix: "nx-look" });
  ask = a.ask;
  return () => { a.close(); ask = null; looks = {}; asked.clear(); };
}
