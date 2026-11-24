// owned by slice 6b (Seats and sign-ins), docs/port/slices.md
// Seats' wire (round 6 · M2, #1615; map.md, the Settings rows): in a real Sol, Accounts I read are home.connections'
// rows as they are (connected, lapsed, missing, unsure; PROTOCOL.md round 118), kept in D.seatConns. Settings' own wire
// asks for them ("connections"), so this one only reads. Seats (a plan per AI) are not in the engine's answers yet, so
// none is drawn live; sign-in, renew and the snooze answer "not yet" (cv/moves/seats.ts), and a lapsed row blocks no AI
// on Needs you live. Signed: marcocyl04-ux's agent, slice 6b (#1615).
import { change } from "../core.ts";
import type { Engine } from "./types.ts";

type Row = { id: string; name: string; from?: string; state: string; since?: string; account?: string };

export function attach(e: Engine): void | (() => void) {
  return e.subscribe((m: { type?: string; list?: Row[]; off?: boolean }) => {
    if (m?.type !== "home.connections") return;
    const list = Array.isArray(m.list) && !m.off ? m.list : [];
    change((d) => { d.seatConns = list.map((r) => ({ id: r.id, name: r.name, from: r.from, state: r.state, since: r.since, account: r.account })); });
  });
}
