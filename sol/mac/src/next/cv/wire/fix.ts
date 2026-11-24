// A person's move of a folder Sol placed, live (BR1 item 5, #1615; sol/PROTOCOL.md "One store"; plane/moved.ts): the
// move sends next.known.fix how "drag", its Undo how "undo". When the move took the folder out and the engine's `same`
// names other folders Sol put inside folders for the same reading, the frame asks once (plane/moved.ts sameOut, scope's
// words 11-22): its yes takes them all out under one Undo, each a fix line as a hand move is; its no closes the line.
// Sent only once the engine holds next.known (wire/because.ts knownEngine): an older engine refuses the message. Replies
// matched by rid. Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { D, hooks, parentOf, regionOf } from "../core.ts";
import { asker } from "../../../agents/model.ts";
import { knownEngine } from "./because.ts";
import { isRegion, unseenNow } from "../../plane/placed.ts";
import { placedOf } from "../../because/place.ts";
import { moveFix, sameOut, undoFix, type Fix, type Other } from "../../plane/moved.ts";
import type { Engine } from "./types.ts";

type Ask = <T>(o: { type: string } & Record<string, unknown>, ms: number) => Promise<T | null>;
type Same = { reason?: string; these?: { k: string }[] } | null;
let ask: Ask | null = null;

async function send(f: Fix, same: ((these: string[]) => void) | null): Promise<void> {
  const a = ask;
  if (!a) return;
  const r = await a<{ ok?: boolean; same?: Same }>({ type: "next.known.fix", ...f }, 8000);
  const these = (r?.ok && Array.isArray(r.same?.these) ? r.same!.these : []).map((x) => x.k).filter((k) => typeof k === "string");
  if (same && these.length) same(these);
}

/** the engine's same keys (placed:<folder>) as the folders still inside another, but the one moved */
export function othersOf(these: readonly string[], moved: string): Other[] {
  const out: Other[] = [];
  for (const k of these) {
    const f = placedOf(k), r = f ? D.regions.find((x) => isRegion(f, x)) : undefined, up = r ? parentOf(r.id) : null;
    if (!r || r.id === moved || !up || out.some((o) => o.id === r.id)) continue;
    out.push({ id: r.id, name: String(r.name), in: String(regionOf(up)?.name ?? up) });
  }
  return out;
}

/** a person moved a folder (dragged it, put it in one, took it out): when Sol placed it, the fix line goes to the engine;
 *  the answer is the Undo's own line, or null when nothing was sent. `take` is how the others come out ("All N"): given,
 *  and the move took the folder out to the canvas, the same-reason line is asked; a move into another folder asks
 *  nothing (scope's line says "take out"; what it asks there waits on scope) */
export function movedByHand(r: { id: string; name: string; path?: unknown }, was: { id: string; name: string } | null, now: { id: string; name: string } | null, take?: (ids: string[]) => void): (() => void) | null {
  const known = knownEngine();
  if (!ask || !known) return null;
  const f = moveFix(r, known, unseenNow(), was, now);
  if (!f) return null;
  const asking = take && was && !now ? (these: string[]) => {
    const l = sameOut(String(r.name), othersOf(these, r.id), take);
    if (l) hooks.flash?.(l.text, l.act, l.no);
  } : null;
  void send(f, asking);
  return () => { void send(undoFix(f), null); };
}

export function attach(e: Engine): () => void {
  const a = asker(e.send, e.subscribe, { prefix: "nx-fix" });
  ask = a.ask;
  return () => { ask = null; a.close(); };
}
