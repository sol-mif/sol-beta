// Cowork v3 (fr-30): the engine's door to the new Cowork. Loaded only when the switch is on (settings.ts coworkV3, env
// SOL_COWORK_V3): team/wire.ts imports this file on the first team.v3.* message it is allowed to answer, never before,
// so with the switch off no trail is opened and no key is made. Slice 0 answers three messages:
//   team.v3.append { project, kind, item?, field?, value?, agent? } → { event }   (signed as me, on this machine)
//   team.v3.since  { project, seq? }                                → { events, seq }
//   team.v3.record { project }                                      → { record, bad, waiting }
// The trail and keys live under the engine's state dir, `<state>/cowork-v3/` (trail.db, keys/), never in sol/home.
import { join } from "node:path";
import { STATE_DIR } from "../../work/state.js";
import { Keys } from "./keys.js";
import { Trail, PROJECT } from "./trail.js";
import { fold } from "./record.js";
import { pointTo } from "./pointer.js";

export { Keys, machineName, verifySig, certOk, writerOf, type By, type Cert, type Signer, type KeyKind } from "./keys.js";
export { Trail, verify, canonical, hashOf, eventId, bodyOf, order, ERASE, type Draft, type Body, type TrailEvent, type Bad, type Verified, type VerifyOpts } from "./trail.js";
export { fold, conflictOf, settingOf, headsOf, collectionOf, kindOf, type ProjectRecord, type Obj, type Conflict, type Version, type Collection, type SettingsLayers } from "./record.js";
export { Sync, httpCloud, type Cloud, type SyncState, type PushResult, type PullResult } from "./sync.js";

/** where Cowork v3 keeps its files */
export const V3_DIR = join(STATE_DIR, "cowork-v3");
let opened: { trail: Trail; keys: Keys } | null = null;
/** this Sol's trail and keys, opened once */
export function v3(): { trail: Trail; keys: Keys } {
  if (opened) return opened;
  const keys = new Keys(join(V3_DIR, "keys"));
  opened = { trail: new Trail({ file: join(V3_DIR, "trail.db"), keys }), keys };
  return opened;
}
/** what /health says of the trail: its projects and events */
export function v3Health(): { projects: number } { return { projects: v3().trail.projects().length }; }

const AGENT = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** one team.v3.* message answered: same type and rid, and what was asked or an error */
export async function answerV3(m: Record<string, unknown>, me: string): Promise<Record<string, unknown>> {
  const out = { type: String(m.type), ...(m.rid !== undefined ? { rid: m.rid } : {}) };
  const project = typeof m.project === "string" ? m.project : "";
  if (!PROJECT.test(project)) return { ...out, error: "which project?" };
  const { trail, keys } = v3();
  try {
    switch (m.type) {
      case "team.v3.append": {
        if (!me) return { ...out, error: "sign in to GitHub first: an event is signed as you" };
        const agent = typeof m.agent === "string" && AGENT.test(m.agent) ? m.agent : undefined;
        const event = trail.append({
          project, by: { person: me, machine: keys.machineName, ...(agent ? { agent } : {}) }, kind: String(m.kind ?? ""),
          ...(typeof m.item === "string" ? { item: m.item } : {}), ...(typeof m.field === "string" ? { field: m.field } : {}), ...("value" in m ? { value: m.value } : {}),
        });
        pointTo(event);   // one line on the local log that points at it (pointer.ts; off unless its switch is on)
        return { ...out, event };
      }
      case "team.v3.since": {
        const seq = typeof m.seq === "number" && Number.isFinite(m.seq) ? m.seq : 0;
        const events = trail.since(project, seq, 1000);
        return { ...out, events, seq: events.length ? events[events.length - 1].seq : seq };
      }
      case "team.v3.record": {
        const v = trail.check(project);
        return { ...out, record: fold(v.ok, { waiting: (id) => trail.isWaiting(id) }), bad: v.bad, waiting: trail.waiting(project, 100_000).length };
      }
      default: return { ...out, error: "no such call" };
    }
  } catch (e) { return { ...out, error: String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200) }; }
}
