// The clock block's reading (#1177): what the engine says (sol/engine/src/work/clock.ts, told as clock.items) and the
// few pure sums the face draws with: the span of the line, its half-hour ticks, a pin's place, "in N min" or "N min late".
export type ItemState = "building" | "ci" | "green" | "red" | "done" | "waiting";
export type Move = { at: number; from: number; to: number; why: string };
export type Item = {
  id: string; title: string; owner: string; machine: string; eta: number; kind: "pr" | "unit" | "release" | "yes"; ref: string;
  detail: string; state: ItemState; late: boolean; checked?: number; moves: Move[]; url?: string;
};
export type ClockMsg = { type?: string; items?: Item[]; checked?: number | null; rid?: string };

/** the line shows the next hours: from a little before now (or the earliest item) to a little after the last, within 12 h */
export const AHEAD_MS = 12 * 3600_000;
const PAD = 15 * 60_000, HALF = 30 * 60_000;
export function spanOf(items: Item[], now: number): { lo: number; hi: number; pinned: Item[] } {
  const pinned = [...items].sort((a, b) => a.eta - b.eta).filter((i) => i.eta - now < AHEAD_MS && now - i.eta < AHEAD_MS);
  const etas = pinned.map((i) => i.eta);
  const lo = Math.min(now, ...etas) - PAD, hi = Math.max(now + HALF, ...etas) + PAD;
  return { lo, hi, pinned };
}
/** where on the line, 0..1 */
export const at = (t: number, lo: number, hi: number) => Math.max(0, Math.min(1, (t - lo) / (hi - lo)));
export function ticksOf(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let t = Math.ceil(lo / HALF) * HALF; t < hi; t += HALF) out.push(t);
  return out;
}
export const hm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
export const hms = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
/** "in 25 min", "in 1 h 05 min", "12 min late", "tomorrow" */
export function untilWords(eta: number, now: number, done = false): string {
  const m = Math.round((eta - now) / 60_000);
  if (done) return "done";
  if (m >= 600) return new Date(eta).toDateString() === new Date(now).toDateString() ? `in ${Math.floor(m / 60)} h` : "tomorrow";
  if (m >= 60) return `in ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
  if (m >= 0) return m === 0 ? "now" : `in ${m} min`;
  const l = -m;
  return l >= 60 ? `${Math.floor(l / 60)} h ${String(l % 60).padStart(2, "0")} min late` : `${l} min late`;
}
/** late on the face: past its ETA now, by the face's own second, not only by the engine's last check */
export const lateNow = (i: Item, now: number) => i.state !== "done" && i.eta < now;
/** the word on a row's end */
export const STATE_WORD: Record<ItemState, string> = { building: "building", ci: "CI", green: "green", red: "red", done: "done", waiting: "waiting" };
/** what pressing a pin opens: the run or the PR the check found */
export const linkOf = (i: Item) => i.url ?? null;
