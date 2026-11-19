// Tickets (build.tickets, off by default; Build settings › switches): an orchestration session hands each piece of work
// to its own session (a ticket, with its own executor) and keeps only their summary (engine work/one.ts, setTickets).
// This file is the face's whole part: the switch, and the engine told of it on open and on every turn of it.
import { useEffect, useSyncExternalStore } from "react";
import { link } from "../socket";
import { ENGINE } from "../engine";
import { buildSwitch } from "../flag";

/** the switch: off by default, never in MINE_ON; the engine keeps what it was last told (orch.json `tickets`) */
export const TICKETS_FLAG = "build.tickets";
const tsw = buildSwitch(TICKETS_FLAG);
export const ticketsOn = () => tsw.get();
export const setTicketsOn = (v: boolean) => tsw.set(v);
export const useTicketsOn = () => useSyncExternalStore(tsw.sub, tsw.get);

const L = typeof WebSocket === "undefined" ? null : link(ENGINE);
let rid = 0;
/** the engine hears the switch when the window opens and each time it turns (work.tickets.on); the same again is nothing */
export function useTicketsToEngine() {
  const on = useTicketsOn();
  useEffect(() => { L?.send({ type: "work.tickets.on", on, rid: `tickets-${++rid}` }); }, [on]);
}
