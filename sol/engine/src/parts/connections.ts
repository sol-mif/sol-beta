// "connections" (#1520, step 1 of #1222): every way in, connected, lapsed, missing or unsure, in one list
// (connections.ts), answered as home.connections to whoever asked by rid. `fresh: true` asks each source again now
// (after the person renewed one). Behind SOL_CONNECTIONS: off, the answer is `off: true` and nothing is read.
// `seats: true` (#1620), only while the new face is on (seatsOn: ui.next): the AI seats' rows (seat:claude, seat:codex),
// one row per site a folder agent reads (site:<folder>:<site>, its fix agent.signin {folder, site}), and tool:gh's
// `expires` where GitHub says it. Then, pushed to every face: connections.changed {ids} when a sign-in window closes or
// a read with seats differs from the last one; the face asks again. Off, or without `seats`, the answer is as before.
import type { Parts } from "../parts.js";
import { connectedServices } from "../connectors.js";
import { checkTool, connections, connectionsOn, onConnectionsChanged, seatsOn, type GrantCheck, type Seat, type SeatCheck, type Service, type SiteCheck } from "../connections.js";
import { seatAccounts, SIGNIN } from "../team/control.js";
import { agentsNow } from "../agent/index.js";
import { siteOfRule } from "../agent/comms.js";
import { blocked as stoppedRun, runsOf, stuckAt } from "../agent/agents.js";
import { readLedger, readPolicy } from "../agent/store.js";
import { nameOf, type Site } from "../agent/sites.js";
import { signingIn } from "../agent/signin.js";
import { profileFor } from "../browser.js";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import * as grant from "../team/grant.js";
import { DRIVE } from "../team/drive.js";
import { grantDeps } from "../team/relay.js";

/** Sol's own grants and the wire message that connects each: one row per provider in grant.ts */
const GRANTS: [grant.Provider, string][] = [[DRIVE, "team.drive.connect"]];

async function grants(fresh: boolean): Promise<GrantCheck[]> {
  return Promise.all(GRANTS.map(async ([p, connect]) => {
    const d = grantDeps(p);
    // asked fresh, a held grant is refreshed now: a refusal leaves the ran-out record (grant.ts), anything else unsure
    const refreshed = fresh && grant.readGrant(d.file) ? ((await grant.token(p, d).catch(() => "")) ? true : "no answer" as const) : undefined;
    const held = grant.readGrant(d.file);
    return { id: p.id, name: p.name, connect, grant: held ? { email: held.email } : null, ranOut: grant.readRanOut(d.file), ...(held && refreshed !== undefined ? { refreshed } : {}) };
  }));
}

/** the seats on this Mac, with the line that signs each in (control.ts keeps it, written in one place) */
async function seats(): Promise<SeatCheck[]> {
  const a = await seatAccounts();
  return (["claude", "codex"] as const).map((seat) => ({ seat, ...a[seat], run: SIGNIN[seat] }));
}

/** each site a folder agent's rules read (not off), and what their last runs found there */
async function sites(): Promise<SiteCheck[]> {
  const a = agentsNow();
  if (!a) return [];
  const out: SiteCheck[] = [];
  for (const f of a.folders()) {
    const folder = relative(a.d.home, f.path).split("\\").join("/"), ledger = readLedger(f.path, 100_000), opening = signingIn(profileFor(f.path));
    const bySite = new Map<Site, { stopped: number | null; ran: boolean }>();
    for (const r of readPolicy(f.path).rules) {
      if (r.mode === "off") continue;
      const site = siteOfRule(r);
      if (!site) continue;
      const runs = runsOf(ledger, r.id), x = bySite.get(site) ?? { stopped: null, ran: false };
      if (stuckAt(runs) === site) x.stopped = Math.min(x.stopped ?? Infinity, runs[0]?.at ?? 0);
      else if (runs.some((l) => !stoppedRun(l))) x.ran = true;
      bySite.set(site, x);
    }
    for (const [site, x] of bySite) out.push({ folder, site, name: nameOf(site), found: opening ? "opening" : x.stopped !== null ? "stopped" : x.ran ? "in" : "unread", ...(x.stopped ? { since: x.stopped } : {}) });
  }
  return out;
}

/** which seats were ever signed in on this Mac: a small file of this Mac's, not the home's (SOL_SEATS_SEEN: the tests') */
const seenFile = () => process.env.SOL_SEATS_SEEN || join(homedir(), ".sol", "seats-seen.json");
const seen = {
  read: (): Seat[] => { try { const j = JSON.parse(readFileSync(seenFile(), "utf8")); return Array.isArray(j.seats) ? j.seats.filter((x: unknown) => x === "claude" || x === "codex") : []; } catch { return []; } },
  write: (xs: Seat[]) => { const f = seenFile(); mkdirSync(dirname(f), { recursive: true }); writeFileSync(`${f}.tmp`, JSON.stringify({ seats: xs }) + "\n"); renameSync(`${f}.tmp`, f); },
};

/** SOL_CONNECTIONS_BIN: the one folder gh and gog are looked for in, for made-up tools (the tests) */
const bin = process.env.SOL_CONNECTIONS_BIN || undefined;

export default function (p: Parts) {
  p.on("connections", async (msg, { HOME, ws, send }) => {
    if (!connectionsOn()) return send(ws, { type: "home.connections", rid: msg.rid, off: true });
    const fresh = msg.fresh === true, withSeats = msg.seats === true && seatsOn();
    const list = await connections({
      services: (f) => connectedServices(HOME, f) as Promise<Service[]>,
      tools: (expiry) => Promise.all([checkTool("gh", { bin, expiry }), checkTool("gog", { bin })]),
      grants, seats, sites, seen,
    }, fresh, withSeats);
    send(ws, { type: "home.connections", rid: msg.rid, v: 1, at: Date.now(), list });
  });
  // pushed only while the new face is on: today's face never hears it
  p.atStart((e) => { onConnectionsChanged((ids) => { if (seatsOn()) e.everyone({ type: "connections.changed", ids }); }); });
}
