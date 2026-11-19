// Home's engine half on the socket (#790 and after; specs home-plan §3, §4.2): the one list of units, the one table of
// the messages they answer, and the one switch. parts/home.ts hands a message here when homeOn() and homeHandles(its type)
// (by its whole type, so thing.open and later flow.* join without another line there), through homeSocket: only from
// one of Sol's own windows, and Home's pushes go only to those (homeWindow).
//   the switch   settings.ts homeWhole() (env SOL_HOME_WHOLE, else the setting home.whole), off by default; and the frame,
//                since Home writes the kernel's one log. With the switch on and the frame off Home stays silent, and
//                says so once in the engine's own log. Read on every message: no restart
//   start        lazily, at the first message or when the kernel starts with the switch on; once a kernel: a new kernel
//                (the frame turned off and on) is a new Home over it. Each unit's start runs once a context
//   the table    built the first time it is asked, from UNITS: a message type two units answer, or an event kind two
//                units reverse, throws there. home.today, home.answer, home.later and home.undo are Home 1's: another
//                unit reaches them through its `reverse` (undo.ts) and hooks.ts, never by a handler of its own
// handleHome takes a context so tests run every handler with a fake face and a log of their own; the socket loop is
// never needed to reach any of it.
import type { Face } from "../browser.js";
import { kernelNow, whenKernel, type Kernel } from "../kernel.js";
import { homeWhole, onHomeWhole } from "../settings.js";
import { setLive } from "./hooks.js";
import { openItems, reconcileItems } from "./items.js";
import { homeLog, type HomeLog } from "./log.js";
import { sendToday, TODAY_HANDLERS, todayMsg } from "./today.js";
import { routeUndo, setReverse, undoAnswer, undoLater } from "./undo.js";
import type { Ctx, Handler, Reverser, Sorter, Unit } from "./unit.js";
import { waits } from "./waits.js";
import { reads } from "./reads.js";
import { sources } from "./sources.js";
import { ceiling } from "./ceiling.js";
import { ledger } from "./ledger.js";
import { open } from "./open.js";
import { places } from "./places.js";

/** Home 1: the Thing and Today */
export const today: Unit = {
  name: "today",
  handlers: { ...TODAY_HANDLERS, "home.undo": routeUndo },
  start: (ctx) => { reconcileItems(ctx); },
  reverse: { "today.answer": undoAnswer, "today.later": undoLater },
};
export const UNITS: Unit[] = [today, waits, reads, sources, ceiling, ledger, open, places];

export type Table = { handlers: Map<string, Handler>; reverse: Map<string, Reverser> };
/** the table of a list of units (pure but for throwing): a message or a kind claimed twice throws */
export function buildTable(units: Unit[]): Table {
  const handlers = new Map<string, Handler>(), reverse = new Map<string, Reverser>(), by = new Map<string, string>();
  for (const u of units) {
    for (const [type, h] of Object.entries(u.handlers ?? {})) {
      if (handlers.has(type)) throw new Error(`home: ${u.name} and ${by.get(type)} both answer ${type}`);
      handlers.set(type, h); by.set(type, u.name);
    }
    for (const [kind, r] of Object.entries(u.reverse ?? {})) {
      if (reverse.has(kind)) throw new Error(`home: ${u.name} and ${by.get("undo " + kind)} both undo ${kind}`);
      reverse.set(kind, r); by.set("undo " + kind, u.name);
    }
  }
  return { handlers, reverse };
}
let TABLE: Table | null = null;
function table(): Table {
  if (!TABLE) { TABLE = buildTable(UNITS); setReverse(TABLE.reverse); }
  return TABLE;
}

let told = false;
/** whether Home runs now: its switch on, and the kernel there (the frame on) */
export function homeOn(): boolean {
  if (!homeWhole()) return false;
  if (kernelNow()) return true;
  if (!told) { told = true; console.error("home: home.whole is on but the frame is off: Home writes the kernel's log, so it stays silent until the frame is on"); }
  return false;
}
export const homeHandles = (type: unknown): boolean => typeof type === "string" && table().handlers.has(type);
/** every socket type a Home unit answers (parts/home.ts listens for each) */
export const homeTypes = (): string[] => [...table().handlers.keys()];
export { ceilingGuard, ceilingHooks, solChecked } from "./ceiling.js";   // Home 5, as index.ts wires it into every Claude seat

// Sol's own windows (index.ts fromSol, the door's own test, as the run and go-back lines use): Home reads and writes a
// person's own things, so it answers only them, and its pushes (home.today after a change) go only to them, never to
// every socket the engine holds
const windows = new Set<Face>();
const send = (m: object) => { for (const w of windows) w.send(m); };
/** a socket opened (index.ts): one of Sol's own windows is told Home's pushes until it closes; any other is never told
 *  anything. Returns what to call when it closes */
export function homeWindow(face: Face, fromSol: boolean): () => void {
  if (!fromSol) return () => {};
  windows.add(face);
  return () => { windows.delete(face); };
}
const REFUSED = "only Sol's own windows talk to Home";
/** one socket message of Home's (parts/home.ts, when homeOn() and homeHandles(its type)): from one of Sol's own windows,
 *  handled; from any other connection, reads included, `home.refused` and nothing is read or written */
export async function homeSocket(face: Face, msg: any, fromSol: boolean, ctx?: Ctx): Promise<void> {
  if (!fromSol) { face.send({ type: "home.refused", why: REFUSED }); return; }
  await handleHome(face, msg, ctx);
}

/** a Home over a home folder and a log (the live one, or a test's) */
export function makeCtx(o: { home: string; log: HomeLog; now?: () => number; all?: (m: object) => void; sorter?: Sorter }): Ctx {
  const ctx: Ctx = {
    home: o.home, log: o.log, items: openItems(o.home), now: o.now ?? Date.now,
    all: o.all ?? ((m) => send(m)),
    pushToday: () => { const m = todayMsg(ctx); ctx.all(m); },
    ...(o.sorter ? { sorter: o.sorter } : {}),
  };
  return ctx;
}
const started = new WeakSet<Ctx>();
/** each unit's start, once a context */
export function startHome(ctx: Ctx): void {
  if (started.has(ctx)) return;
  started.add(ctx);
  table();
  for (const u of UNITS) { try { u.start?.(ctx); } catch (err) { console.error(`home: ${u.name} did not start:`, err instanceof Error ? err.message : String(err)); } }
}

let live: { k: Kernel; ctx: Ctx } | null = null;
/** the live Home, made and started over the kernel there now; null while Home is off */
export function homeNow(): Ctx | null {
  if (!homeOn()) return null;
  const k = kernelNow()!;
  if (live?.k !== k) live = { k, ctx: makeCtx({ home: k.home, log: homeLog(k) }) };
  startHome(live.ctx);
  return live.ctx;
}
setLive(homeNow);
whenKernel(() => { if (homeWhole()) homeNow(); });
onHomeWhole((on) => { if (on) homeNow(); });   // its switch came on while the kernel runs: a setting, or the version (versions.ts)

/** one message to Home: its handler, with the given context (tests) or the live one. A handler that throws is said in
 *  the engine's log; an ask of Home 1's is still answered with Today's plain state */
export async function handleHome(face: Face, msg: any, ctx?: Ctx): Promise<void> {
  const c = ctx ?? homeNow();
  if (!c) return;
  startHome(c);
  const type = msg?.type;
  const h = typeof type === "string" ? table().handlers.get(type) : undefined;
  if (!h) return;
  try { await h(c, face, msg); }
  catch (err) {
    console.error(`home: ${type}:`, err instanceof Error ? err.message : String(err));
    if (type in TODAY_HANDLERS || type === "home.undo") { try { sendToday(c, face); } catch { /* said above */ } }
  }
}
