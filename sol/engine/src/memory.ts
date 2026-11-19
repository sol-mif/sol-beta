// The engine's memory on the log (#1107). Three times the engine ran out of heap after 11 to 28 hours up, and the
// crash says only where the last allocation failed. A line every half hour (every five minutes once the heap is past
// a quarter of its limit) says how big the heap is and how big the parts that can grow are, so the next time the log
// itself names what grew. Counting is cheap: sizes the engine already holds, nothing walked or read from disk.
import { getHeapStatistics } from "node:v8";

const MB = 1048576;
export const EVERY_MS = 30 * 60_000, CLOSE_MS = 5 * 60_000;

/** one line (pure): the heap against its limit, then each part as `name n` */
export function memoryLine(m: { heapUsed: number; rss: number; external: number }, limit: number, parts: Record<string, number>): string {
  const mb = (n: number) => Math.round(n / MB);
  const rest = Object.entries(parts).map(([k, v]) => `${k} ${Math.round(v)}`).join(", ");
  return `memory: heap ${mb(m.heapUsed)} of ${mb(limit)} MB, rss ${mb(m.rss)} MB, external ${mb(m.external)} MB${rest ? `; ${rest}` : ""}`;
}

/** the line on the log now and on, closer together while the heap is big; the timer never holds the engine open */
export function watchMemory(parts: () => Record<string, number>, say: (line: string) => void = console.log): () => void {
  let timer: NodeJS.Timeout | undefined;
  const tick = () => {
    const limit = getHeapStatistics().heap_size_limit, m = process.memoryUsage();
    let p: Record<string, number> = {};
    try { p = parts(); } catch { /* a part that cannot be counted leaves the heap line */ }
    say(memoryLine(m, limit, p));
    timer = setTimeout(tick, m.heapUsed > limit / 4 ? CLOSE_MS : EVERY_MS);
    timer.unref();
  };
  timer = setTimeout(tick, CLOSE_MS);
  timer.unref();
  return () => clearTimeout(timer);
}
