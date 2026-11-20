// The Seats pieces that live under next/ (#1620, after #1631 and #1632; docs/port/notes/s7a.md). Behind ui.next.
// What is Frank's stays his and is only called: the rows (connections.ts, parts/connections.ts: `connections
// {seats: true}`, `connections.changed`), the AI accounts (team/control.ts), a site's sign-in (agent/comms.ts
// `agent.signin`), and the one rule of what blocks an AI (connections.ts blockedOf). This file reads the kept list and
// never asks a source anew (keptWithSeats: the face's own `connections {seats: true}` read fills it).
//   next.seats            → next.seats {known, seats, ais, at}
//     seats  each seat or site row, and any row whose sign-in runs out (`expires`), with the AIs that use it, the ones
//            it blocks, and `renew`: "ran out" past its end, "this week" within 7 days of it, "not counted" when the
//            service gives no end (#1620 point 4: most do not), absent while it is fine
//     ais    which AI runs on which seat, and what blocks it: absent when not known, null when nothing does (#1620 point 3)
//   pushed: next.seats {…, changed, done} to every window when connections.changed comes; `done` names the rows that
//     are connected now: a sign-in the person started is learned done without a second press
//   next.back {confirm?}  back to the old Sol (#1620 "back to 2.3"; switch.md "the way back"): not goback, which goes
//     one build back and ends the engine. Without confirm: the confirm's words and the state (no write). With
//     confirm: true: SOL_HOME/next/back.json {at, was} written whole (temp + rename), then the setting ui.next off
//     (settings.ts patchSettings, called, not changed). Turning it on again reads back.json and resumes.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { blockedOf, type Connection, type Seat } from "../connections.js";

export const WEEK = 7 * 864e5;
export type Renew = "ran out" | "this week" | "not counted";
export type SeatRow = Pick<Connection, "id" | "name" | "from" | "state" | "why" | "fix" | "expires" | "account"> & { renew?: Renew; usedBy: string[]; blocks: string[] };
export type Ai = { ai: string; seat: Seat; folder?: string };
export type AiRow = Ai & { blocked?: { by: string; why: string } | null };
export type SeatsMsg = { type: "next.seats"; known: boolean; seats: SeatRow[]; ais: AiRow[]; at: number };

/** when a row's sign-in needs renewing (pure) */
export function renewOf(r: Pick<Connection, "from" | "expires" | "state">, now: number): Renew | undefined {
  if (r.expires === undefined) return r.from === "seat" || r.from === "site" || r.state === "lapsed" ? "not counted" : undefined;
  if (r.expires <= now) return "ran out";
  return r.expires - now <= WEEK ? "this week" : undefined;
}

/** the site rows of a folder that stopped (lapsed): what its agent is stuck at, as blockedOf reads stucks */
const stucksOf = (rows: Connection[], folder: string) =>
  rows.filter((r) => r.from === "site" && r.state === "lapsed" && r.id.startsWith(`site:${folder}:`)).map((r) => ({ folder, site: r.id.slice(`site:${folder}:`.length) }));

/** the Seats screen from the kept rows and the AIs (pure). rows null: nothing kept yet, so nothing is known */
export function seatsOf(rows: Connection[] | null, ais: Ai[], now: number): SeatsMsg {
  const aiRows: AiRow[] = ais.map((a) => {
    const b = blockedOf(a.seat, a.folder !== undefined && rows ? stucksOf(rows, a.folder) : [], rows);
    return { ...a, ...(b === undefined ? {} : { blocked: b }) };
  });
  const seats: SeatRow[] = (rows ?? []).filter((r) => r.from === "seat" || r.from === "site" || r.expires !== undefined).map((r) => {
    const renew = renewOf(r, now);
    const uses = (a: AiRow) => (r.from === "seat" ? r.id === `seat:${a.seat}` : a.folder !== undefined && r.id.startsWith(`site:${a.folder}:`));
    return {
      id: r.id, name: r.name, from: r.from, state: r.state, ...(r.why ? { why: r.why } : {}), ...(r.fix ? { fix: r.fix } : {}),
      ...(r.expires !== undefined ? { expires: r.expires } : {}), ...(r.account ? { account: r.account } : {}), ...(renew ? { renew } : {}),
      usedBy: aiRows.filter(uses).map((a) => a.ai), blocks: aiRows.filter((a) => a.blocked?.by === r.id).map((a) => a.ai),
    };
  });
  return { type: "next.seats", known: rows !== null, seats, ais: aiRows, at: now };
}

/** the rows a change made connected: the sign-ins learned done */
export const doneOf = (rows: Connection[] | null, ids: string[]): string[] => (rows ?? []).filter((r) => ids.includes(r.id) && r.state === "connected").map((r) => r.id);

// ── the way back ──────────────────────────────────────────────────────────────────────────────────────────────────
export type Back = { at: number; was: boolean };
export const BACK_WORDS = "Back to the old Sol? Everything you made stays: the new Sol keeps its places and its diary, and turning it on again starts where you left.";
const backFile = (home: string) => join(home, "next", "back.json");
/** back.json, or null (none, or not readable: a broken one is never thrown away, only not read) */
export function readBack(home: string): Back | null {
  try { const j = JSON.parse(readFileSync(backFile(home), "utf8")); return typeof j?.at === "number" ? { at: j.at, was: j.was === true } : null; } catch { return null; }
}
/** the person said yes: back.json written whole (temp + rename), then the switch turned off by `turnOff` */
export function goBack(home: string, now: number, on: boolean, turnOff: () => void): Back {
  const f = backFile(home), b: Back = { at: now, was: on };
  mkdirSync(join(home, "next"), { recursive: true });
  writeFileSync(`${f}.tmp`, JSON.stringify(b) + "\n");
  renameSync(`${f}.tmp`, f);
  turnOff();
  return b;
}
