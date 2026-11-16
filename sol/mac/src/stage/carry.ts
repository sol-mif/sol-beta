// Carry (#700, the design's shot 17 and 18; play.html §10's carry): a block's head dragged over a session row in the side
// lights that row, "carry here"; dropped, the block is referenced in that session too, the same block, one ledger. The
// stage and the side are apart (Stage.tsx, home/Side.tsx), so the row under the pointer is said here, and the side's
// names are kept here for the stage's ledger ("in: the stage · spine + settings"). No React; a value and its listeners.

let over: string | null = null;
const subs = new Set<() => void>();
/** the session row a dragged head is over, or none */
export const carryOver = () => over;
export function setCarryOver(sid: string | null) {
  if (over === sid) return;
  over = sid;
  subs.forEach((f) => f());
}
export const onCarryOver = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** the session row under a point, if it is another session's than this one (the side's rows wear data-sid) */
export function rowAt(x: number, y: number, session: string): string | null {
  if (typeof document === "undefined") return null;
  const row = document.elementFromPoint(x, y)?.closest?.("[data-sid]") as HTMLElement | null;
  const sid = row?.dataset.sid ?? null;
  return sid && sid !== session ? sid : null;
}

// the sessions' names, as the side shows them; the side tells them, the stage's ledger reads them
const names = new Map<string, string>();
export function setNames(list: { id: string; title?: string }[]) { for (const s of list) names.set(s.id, s.title || "untitled"); }
export const nameOf = (sid: string) => names.get(sid) ?? sid.slice(0, 8);

/** what a session row says of the stage it is beside (pure): "n blocks" on this session's own row, "carry here" while a
 *  head is over it, "n carried" for the blocks here that are in it too, else nothing */
export function rowWord(sid: string, live: string | null, blocks: { state: string; sessions: string[] }[], overSid: string | null): string | null {
  const open = blocks.filter((b) => b.state !== "dead");
  if (sid === live) return open.length ? `${open.length} block${open.length > 1 ? "s" : ""}` : null;
  if (sid === overSid) return "carry here";
  const n = open.filter((b) => b.sessions.includes(sid)).length;
  return n ? `${n} carried` : null;
}

/** a ledger line's words with the sessions named as the side names them (a carried line says the session's id) */
export const named = (what: string) => (/^carried\b/.test(what) ? what.replace(/\b(to|from) ([A-Za-z0-9_-]{8,80})$/, (_m, w: string, sid: string) => `${w} "${nameOf(sid)}"`) : what);
