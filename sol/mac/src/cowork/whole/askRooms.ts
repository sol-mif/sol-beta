// Cowork asks the engine for the rooms (team.hello → team.state) on every up, not once (gate one q7, #1717): a page opened
// before the engine answers (cold start, a restart) asks again when it does, and says so when it is down or silent.
import type { Link } from "../../socket";

export type Rooms = { org?: string }[];
export const QUIET_MS = 8_000;
type Timer = { set: (f: () => void, ms: number) => unknown; clear: (t: unknown) => void };
// wrapped, not passed bare: a browser's setTimeout called as another object's method throws "Illegal invocation"
const WINDOW_TIMER: Timer = { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) };

/** keep asking for the rooms; `got` on each answer, `quiet` true while the engine is down or has not answered in `ms` */
export function askRooms(L: Pick<Link, "on" | "onLink" | "send">, got: (r: Rooms) => void, quiet: (q: boolean) => void,
  has: () => boolean, ms = QUIET_MS, timer: Timer = WINDOW_TIMER): () => void {
  let t: unknown;
  const stop = () => { if (t !== undefined) timer.clear(t); t = undefined; };
  const off = L.on((m: any) => {   // eslint-disable-line @typescript-eslint/no-explicit-any
    if (m?.type !== "team.state" || !Array.isArray(m.settings?.rooms)) return;
    stop(); quiet(false); got(m.settings.rooms);
  });
  const offLink = L.onLink((up) => {
    stop();
    if (!up) { quiet(true); return; }
    quiet(false);
    L.send({ type: "team.hello" });
    if (!has()) t = timer.set(() => quiet(true), ms);
  });
  return () => { stop(); off(); offLink(); };
}
