// Cowork v3, slice 4 (fr-30, #557): the face's team.v3.places.* messages, answered as work.v3.places.* from places.ts.
// wire.ts loads this file only with the switch on (settings.ts coworkV3), so with it off nothing here is loaded (F7).
// Everything it reaches is today's: the room (team.json), GitHub's sign-in (control.ts githubAccount) and gh, Google's
// (grant.ts readGrant / token, Drive's row), the cloud's quota (take.ts usageOf, handed in by wire.ts). Signing in again is
// today's own flows, which the face asks for (team.github.connect, team.drive.connect); this file never holds a token
// and never writes one to the trail.
import { readdirSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { STATE_DIR } from "../../work/state.js";
import { getTeam, recordOf, type Room } from "../settings.js";
import { githubAccount } from "../control.js";
import * as grant from "../grant.js";
import { DRIVE } from "../drive.js";
import { grantDeps, DRIVE_FILE } from "../relay.js";
import { folderOfRecord, DRIVE_API } from "../record/drive.js";
import { runGh } from "../record/github.js";
import { doorTrail, type TrailPort } from "./places-trail.js";
import { door } from "./door.js";
import * as P from "./places.js";

export type WireDeps = { usage?: (room: string) => Promise<{ used: number; max: number; frozen: boolean } | null | { error: string }> };

let trail: TrailPort | null = null;
const trailNow = () => (trail ??= doorTrail(door()));   // slice 0's trail
const machine = () => hostname().replace(/\.local$/, "").replace(/[^\w.-]/g, "-").slice(0, 40);

// what each place holds, read in the background and kept 5 minutes: the picture never waits on the network
const counts = new Map<string, { at: number; c: P.Count | null; busy?: boolean }>();
const TTL = 5 * 60_000;
function countOf(room: Room, p: { id: string; kind: P.PlaceKind; label: string }): P.Count | null {
  const key = `${room.id}\n${p.id}\n${p.label}`, had = counts.get(key);
  if (!had || (Date.now() - had.at > TTL && !had.busy)) {
    counts.set(key, { at: had?.at ?? 0, c: had?.c ?? null, busy: true });
    void readCount(room, p).catch(() => null).then((c) => counts.set(key, { at: Date.now(), c }));
  }
  return had?.c ?? null;
}
async function readCount(room: Room, p: { kind: P.PlaceKind; label: string }): Promise<P.Count | null> {
  if (p.kind === "github") { const n = Number((await runGh(["api", `repos/${p.label}`, "--jq", ".open_issues_count"])).trim()); return Number.isFinite(n) ? { n, unit: "issues and PRs" } : null; }
  if (p.kind === "folder" && room.folder) return { n: readdirSync(room.folder).filter((f) => !f.startsWith(".")).length, unit: "files" };
  if (p.kind === "drive") {
    const folder = folderOfRecord(recordOf(room)); if (!folder) return null;
    const token = await grant.token(DRIVE, grantDeps(DRIVE));
    const r = await fetch(`${DRIVE_API}/drive/v3/files?q=${encodeURIComponent(`'${folder}' in parents and trashed=false`)}&pageSize=1000&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    const v = await r.json().catch(() => null) as { files?: unknown[] } | null;
    return r.ok && Array.isArray(v?.files) ? { n: v.files.length, unit: "files" } : null;
  }
  return null;
}

// my sign-ins, read once per message: GitHub's word (cached by control.ts), and Google's account and whether its token
// still renews (an account whose refresh Google refused is expired, not gone: its ran-out record, grant.ts readRanOut)
async function signIns(): Promise<Record<"github" | "google", P.SignInState>> {
  const [gh, google] = await Promise.all([
    githubAccount().then((a) => (a.in ? "in" : "out") as P.SignInState).catch(() => "out" as P.SignInState),
    grant.readGrant(DRIVE_FILE)
      ? grant.token(DRIVE, grantDeps(DRIVE)).then((t) => (!t && !grant.readGrant(DRIVE_FILE) && grant.readRanOut(DRIVE_FILE) ? "expired" : "in") as P.SignInState, () => "expired" as P.SignInState)
      : Promise.resolve((grant.readRanOut(DRIVE_FILE) ? "expired" : "out") as P.SignInState),
  ]);
  return { github: gh, google };
}

async function ctxOf(project: string, d: WireDeps): Promise<P.Ctx | null> {
  const team = getTeam(), room = team.rooms.find((r) => r.id === project);
  if (!room) return null;
  const me = team.me.login || "me";
  const s = await signIns();
  let full: P.Fullness | null = null;
  if (room.provider === "cloud" && d.usage) {
    const u = await d.usage(room.id).catch(() => null);
    if (u && !("error" in u)) full = { used: Math.round(u.used / 1e5) / 10, of: Math.round(u.max / 1e5) / 10, unit: "MB", frozen: u.frozen };
  }
  return {
    project, name: room.name || room.id, me, role: "owner",
    seed: P.placesFromRoom(room, { me, connected: room.provider === "cloud" ? room.repos : [], hasRecord: !!recordOf(room), machine: machine() }),
    signIn: (k) => s[k], count: (p) => countOf(room, p), fullness: () => full,
  };
}

/** the project's red places, as Running's red line names them (running.ts Red): its press opens that place's own
 *  sign-in (the face's Connect, again), never the group page */
export async function redsOf(project: string, d: WireDeps = {}): Promise<{ title: string; whose: string; place: string; line: string }[]> {
  const c = await ctxOf(project, d);
  if (!c) return [];
  return P.viewOf(trailNow().since(project), c).places.filter((p) => p.state === "red")
    .map((p) => ({ title: p.label || p.name, whose: p.by ?? c.me, place: p.kind, line: p.line }));
}

/** one team.v3.places.* message, answered as work.v3.places.* with the picture after it */
export async function handleV3Places(m: Record<string, any>, d: WireDeps = {}): Promise<object> {
  const type = String(m.type).replace(/^team\./, "work."), rid = m.rid;
  const project = typeof m.project === "string" ? m.project : "";
  const c = await ctxOf(project, d);
  if (!c) return { type, rid, error: "which project?" };
  const t = trailNow();
  const view = () => P.viewOf(t.since(project), c);
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  let r: object = {};
  switch (m.type) {
    case "team.v3.places.read": break;
    case "team.v3.places.reach": r = P.before(c, s(m.kind) as P.PlaceKind, s(m.label)); break;
    case "team.v3.places.connect": r = P.connect(t, c, s(m.kind) as P.PlaceKind, s(m.label), machine()); break;
    case "team.v3.places.revoke": r = P.revoke(t, c, s(m.place)); break;
    case "team.v3.places.reroute": r = P.reroute(t, c, s(m.kind), s(m.place), { agreed: m.agreed === true }); break;
    case "team.v3.places.overflow": r = P.setOverflow(t, c, s(m.place)); break;
    case "team.v3.places.undo": r = P.undo(t, c, s(m.token)); break;
    case "team.v3.places.letin": {
      const person = s(m.person).trim();
      if (!/^[A-Za-z0-9-]{1,39}$/.test(person)) { r = { error: "who? their GitHub name" }; break; }
      const v = view(), admin = new Set<string>();
      const gh = v.places.find((p) => p.kind === "github" && p.state === "ok");
      if (gh) { const a = await runGh(["api", `repos/${gh.label}`, "--jq", ".permissions.admin"]).catch(() => ""); if (a.trim() === "true") admin.add(gh.id); }
      r = { person, access: P.letIn(v, person, (p) => admin.has(p.id)) };
      break;
    }
    case "team.v3.places.grant":
      r = await P.grant(t, c, s(m.place), s(m.person), async (p, person) => {
        if (p.kind !== "github") return `${p.name} is shared from ${p.name} itself; ask its owner`;
        try { await runGh(["api", "-X", "PUT", `repos/${p.label}/collaborators/${person}`, "-f", "permission=push"]); return null; }
        catch (e) { return `GitHub said no: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 160)}`; }
      });
      break;
    default: return { type, rid, error: "no such call" };
  }
  return { type, rid, ...r, view: view() };
}
