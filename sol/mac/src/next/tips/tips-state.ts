// The first time only (BR1, #1615; the moments mine/look/br1/inside.html names): the first ◧ Keep open, the first ⤢ As a
// tab and the first reply on the bar each show one tip beside what just happened, in inside.html's words, and never again.
// A moment is read the moment it shows (localStorage "sol.tips"); its tip stays until a press, Esc, TIP_MS, or until what
// it points at is gone. With no storage (a test, a refused store) no tip shows, as Mark up's tip does (markup/model.ts).
//   tipAt(m)    the hook: a moment happened; its tip shows if it is the first time
//   tipNow()    the moment whose tip shows now, or null
//   tipGone()   the tip goes (a press, Esc, its time, its anchor gone)
// Signed: marcocyl04-ux's agent (builder P9), BR1 (#1615).

export type Moment = "keep" | "tab" | "esc";
export const TIP_MS = 12000;
/** the esc tip's line when the bar replies to a folder the hand points at (plane/raise.ts): no × there, Esc lets go */
export const TIP_HAND = "Esc and the bar is new again.";
/** each moment's tip: a head in inside.html's words and one line of what to do next */
export const TIP: Record<Moment, { head: string; line: string }> = {
  keep: { head: "Beside the canvas · work with your things", line: "Drag a thing in and it knows it; what it makes lands among your folders. Moving between sizes never stops or restarts it." },
  tab: { head: "As a tab · deep work on what it makes", line: "× on the tab and it stays on the canvas. Moving between sizes never stops or restarts it." },
  esc: { head: "You're talking to that session", line: "× on its name (or Esc) and the bar is new again, while the session stays open." },
};

const KEY = "sol.tips";
const store = (): Storage | null => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const read = (): Moment[] => { try { const v = JSON.parse(store()?.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = (ms: Moment[]) => { try { store()?.setItem(KEY, JSON.stringify(ms)); } catch { /* storage refused: it may show again next time */ } };

let now: Moment | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const subs = new Set<() => void>();
const tell = () => subs.forEach((f) => f());
export const tipSub = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const tipNow = (): Moment | null => now;

/** a moment happened: the first time, its tip shows and the moment is read */
export function tipAt(m: Moment): boolean {
  if (!store() || read().includes(m)) return false;
  write([...read(), m]);
  now = m;
  if (timer) clearTimeout(timer);
  timer = setTimeout(tipGone, TIP_MS);
  tell();
  return true;
}

/** the tip goes */
export function tipGone(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  if (now === null) return;
  now = null;
  tell();
}
