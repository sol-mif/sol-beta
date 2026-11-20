// The new face's beside-state (#1604, slice 7b of the port, #1615; docs/port/switch.md, slices.md "The contract between
// face and engine"): places on the plane, folders' zones, the diary, the move-in read, and next.state. Behind the switch
// ui.next (settings.ts uiNext(), read on every message): off, no next.* message here is answered, and nothing is written
// or read. Everything it writes is under SOL_HOME/next/ (src/next/). Each message type is its own (no "next." prefix),
// so slice 7a's part answers its own next.* beside this one.
//   next.state                      → next.state to the asker (the face's wire asks on attach)
//   next.pos.set {id,x,y,w,h,by,touched} → next.pos {id, ...} and next.state to every window
//   next.zones.set {folder, zone}   → next.state to every window
//   next.diary.get {day?}           → next.diary {day, lines, paused} to the asker
//   next.diary.write / .remove / .pause → next.diary to every window (and next.state, today's page being in it)
//   next.movein.read                → next.movein (carry.ts, read only) to the asker
//   next.movein.keep {keep, fix, drop} → next.movein.kept {movein} to the asker
//   next.traces {day?}              → next.traces {day, days, runs, coverage} to the asker, only one of Sol's own windows
//                                     (next/traces.ts, read only; signed: franktsai2008-eng's agent)
// A message that is not what it should be changes nothing: next.refused {asked, why} to the asker alone.
// Signed: marcocyl04-ux's agent, slice 7b of the port (#1615).
import { join } from "node:path";
import type { Engine, Heard, Parts } from "../parts.js";
import { getSettings, onUiNext, uiNext } from "../settings.js";
import { STATE_DIR } from "../work/state.js";
import { logDir } from "../log.js";
import { carry, type Where } from "../next/carry.js";
import { setPos } from "../next/pos.js";
import { setZone } from "../next/zones.js";
import { DAY, dayOf, diaryMsg, pauseDiary, removeLine, writeLine } from "../next/diary.js";
import { keepMoveIn } from "../next/movein.js";
import { stateMsg } from "../next/state.js";
import { tracesMsg } from "../next/traces.js";
import { needsList } from "./next-calls.js";

/** where the move-in and the state read today's stores (work.json beside SOL_STATE, the log outside the home) */
export const whereOf = (home: string): Where => ({
  home,
  state: process.env.SOL_STATE || join(STATE_DIR, "work.json"),
  logDir: logDir(home),
  settings: getSettings() as unknown as Record<string, unknown>,
});

type H = (m: any, h: Heard) => unknown;
/** a handler that does nothing at all while the switch is off */
const behind = (f: H): H => (m, h) => (uiNext() ? f(m, h) : undefined);

export default function (p: Parts) {
  const refuse = (h: Heard, asked: string, why: string) => h.send(h.ws, { type: "next.refused", asked, why });
  const tellState = async (e: Engine) => e.everyone(await stateMsg(whereOf(e.HOME)));

  p.on("next.state", behind(async (_m, h) => h.send(h.ws, await stateMsg(whereOf(h.HOME), h.fromSol ? needsList : undefined))));
  p.on("next.pos.set", behind(async (m, h) => {
    const r = setPos(h.HOME, m);
    if (!r.ok) return refuse(h, "next.pos.set", r.why);
    h.everyone({ type: "next.pos", id: r.id, ...r.pos });
    await tellState(h);
  }));
  p.on("next.zones.set", behind(async (m, h) => {
    const r = setZone(h.HOME, m);
    if (!r.ok) return refuse(h, "next.zones.set", r.why);
    await tellState(h);
  }));
  p.on("next.diary.get", behind((m, h) => {
    const day = typeof m.day === "string" && DAY.test(m.day) ? m.day : dayOf(new Date());
    h.send(h.ws, diaryMsg(h.HOME, day));
  }));
  const diaryChanged = async (h: Heard, day: string) => {
    h.everyone(diaryMsg(h.HOME, day));
    if (day === dayOf(new Date())) await tellState(h);
  };
  p.on("next.diary.write", behind(async (m, h) => {
    const r = writeLine(h.HOME, m);
    if (!r.ok) return refuse(h, "next.diary.write", r.why);
    await diaryChanged(h, r.day);
  }));
  p.on("next.diary.remove", behind(async (m, h) => {
    const r = removeLine(h.HOME, m);
    if (!r.ok) return refuse(h, "next.diary.remove", r.why);
    await diaryChanged(h, r.day);
  }));
  p.on("next.diary.pause", behind((m, h) => {
    pauseDiary(h.HOME, m.on !== false);
    h.everyone(diaryMsg(h.HOME, dayOf(new Date())));
  }));
  p.on("next.movein.read", behind((_m, h) => h.send(h.ws, carry(whereOf(h.HOME)))));
  // How Sol worked (#1615): a person's own history, so only Sol's own windows hear it, as needs are
  p.on("next.traces", behind((m, h) => {
    if (!h.fromSol) return refuse(h, "next.traces", "only Sol's own windows");
    const w = whereOf(h.HOME);
    h.send(h.ws, tracesMsg({ home: w.home, logDir: w.logDir }, m.day));
  }));
  p.on("next.movein.keep", behind((m, h) => h.send(h.ws, { type: "next.movein.kept", movein: keepMoveIn(h.HOME, m) })));

  // the switch turned on while the engine runs: every window hears the state (off: nothing is said)
  p.atStart((e) => { onUiNext((on) => { if (on) void tellState(e).catch(() => {}); }); });
}
