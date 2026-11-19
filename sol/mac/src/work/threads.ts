// What the window keeps of each session's talk (#75). Pure: useWork holds the state, these say how it changes.
import type { Item, Thread } from "./useWork";

export type Threads = Record<string, Thread>;
// streamed words not yet shown: session -> item -> the text that came since the last paint
export type Pending = Map<string, Map<string, string>>;

// Only the sessions in keep hold their items; the others keep their folder, branch and title and drop the items
// (opening one again reads them from the engine). The same object comes back when nothing was dropped.
export function trim(threads: Threads, keep: Set<string>): Threads {
  let n: Threads | null = null;
  for (const id in threads) {
    if (keep.has(id) || !threads[id].items.length) continue;
    n ??= { ...threads };
    n[id] = { ...threads[id], items: [] };
  }
  return n ?? threads;
}

export function upsert(items: Item[], it: Item): Item[] {
  const i = items.findIndex((x) => x.id === it.id);
  if (i < 0) return [...items, it];
  const n = items.slice();
  n[i] = { ...n[i], ...it };
  return n;
}

// A line the face put up on the press (`sending`, #917: a message, an answered question) is replaced whole by the
// engine's own when it lands, so nothing of the guess stays on it
export const landed = (items: Item[], it: Item): Item[] => upsert(items.map((x) => (x.id === it.id && x.sending ? { id: x.id, kind: x.kind } : x)), it);
// a thread read again keeps the lines still on their way: the engine has not written them yet
export const withSending = (fresh: Item[], before: Item[] = []): Item[] => {
  const have = new Set(fresh.map((x) => x.id));
  const on = before.filter((x) => x.sending && x.kind === "me" && !have.has(x.id));   // an answer on its way is the engine's card
  return on.length ? [...fresh, ...on] : fresh;
};

// a word streamed into an item, buffered: nothing is copied until the next paint
export function buffer(p: Pending, sessionId: string, id: string, text: string) {
  let s = p.get(sessionId);
  if (!s) p.set(sessionId, (s = new Map()));
  s.set(id, (s.get(id) ?? "") + text);
}

// the buffered words, added to their items: one copy of a session's list per paint, not one per word.
// An item the window does not hold (a session it dropped) takes nothing; its words come whole on the next open.
export function applyDeltas(threads: Threads, p: Pending): Threads {
  let n: Threads | null = null;
  for (const [sid, byItem] of p) {
    const th = threads[sid];
    if (!th || !th.items.length) continue;
    let items: Item[] | null = null;
    // the streaming item is the last one or near it: look from the end
    for (let i = th.items.length - 1, left = byItem.size; i >= 0 && left > 0; i--) {
      const add = byItem.get(th.items[i].id);
      if (add === undefined) continue;
      left--;
      items ??= th.items.slice();
      items[i] = { ...items[i], text: String(items[i].text ?? "") + add };
    }
    if (!items) continue;
    n ??= { ...threads };
    n[sid] = { ...th, items };
  }
  return n ?? threads;
}

// the trim, with the words still buffered added first: a run that ends right after its last word keeps that word
// until the trim, and a session dropped then is read whole again on open
export function settle(threads: Threads, p: Pending, keep: Set<string>): Threads {
  return trim(applyDeltas(threads, p), keep);
}
