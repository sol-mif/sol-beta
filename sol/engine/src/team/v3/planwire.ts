// Cowork v3, slice 2 (fr-30, #555): the face's team.v3.front, team.v3.plan and team.v3.needsme, answered from plan.ts.
// wire.ts loads this file only with the switch on (settings.ts coworkV3), so with it off nothing here is loaded (F7).
// Every answer that can change the count also tells the notch the one number (ping.ts needsMeCount).
import { join } from "node:path";
import { getTeam } from "../settings.js";
import { STATE_DIR } from "../../work/state.js";
import { needsMeCount } from "../../ping.js";
import * as P from "./plan.js";

const FILE = () => process.env.SOL_COWORK_V3_TRAIL || join(STATE_DIR, "cowork-v3", "plan-trail.jsonl");
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// the made-up room a fresh Sol starts with is no project (face cowork/rooms.ts madeUp)
const madeUp = (r: { id: string; repos: string[]; hub?: string; code?: string; mine?: boolean; joined?: boolean }) =>
  r.id === "team" && !r.mine && !r.joined && !r.code && !r.hub && (r.repos.length === 0 || (r.repos.length === 1 && r.repos[0] === "marcocyl04-ux/sol-dev"));
export const projectsNow = (): P.Project[] => getTeam().rooms.filter((r) => !madeUp(r)).map((r) => ({ id: r.id, name: r.name || r.id }));
const meNow = () => getTeam().me.login || "me";

/** the one count, told to the notch; the front and the stage chip read the same fold */
async function tell(rec?: P.PlanRecord) {
  const t = await P.trailNow(FILE());
  const n = P.needsMe(rec ?? await P.readAll(t), meNow());
  needsMeCount(n);
  return n;
}
export const tellNotch = () => tell().catch(() => 0);

export async function handleV3Plan(m: any): Promise<object> {
  const rid = m.rid, me = meNow(), actor: P.Actor = { who: me };
  const t = await P.trailNow(FILE());
  const answer = async (extra: object, project?: string) => {
    const rec = await P.readAll(t);
    const count = await tell(rec);
    if (m.type === "team.v3.front") {
      const tiles = P.front(rec, me, projectsNow(), today());
      // the rooms each project holds something in: the sidebar shows a room only once it does
      return { type: m.type, rid, me, today: today(), count, tiles, held: Object.fromEntries(tiles.map((x) => [x.project, P.roomsOf(rec, x.project)])), ...extra };
    }
    if (m.type === "team.v3.needsme") return { type: m.type, rid, me, count, needs: P.needsList(rec, me), ...extra };
    const pid = project ?? "";
    const items = P.sortItems(rec.items.filter((i) => i.project === pid));
    return { type: m.type, rid, me, today: today(), count, project: pid, name: projectsNow().find((p) => p.id === pid)?.name ?? pid,
      items, loose: rec.loose.filter((l) => l.project === pid), views: P.views(items), rooms: P.roomsOf(rec, pid),
      roomsHeld: Object.fromEntries([...new Set([...projectsNow().map((p) => p.id), ...rec.items.map((i) => i.project), ...rec.loose.map((l) => l.project)])].map((p) => [p, P.roomsOf(rec, p)])),
      needs: P.needsList(rec, me, pid), ...extra };
  };
  if (m.type === "team.v3.front" || m.type === "team.v3.needsme") return answer({});
  // team.v3.plan: a read, or one write named by `op`
  const project = typeof m.project === "string" ? m.project : "";
  if (!project) return { type: m.type, rid, error: "which project?" };
  let r: { error?: string } & Record<string, unknown> = {};
  switch (m.op) {
    case undefined: case "": case "read": break;
    case "drop": r = await P.drop(t, { project, actor, title: String(m.title ?? ""), kind: typeof m.kind === "string" ? m.kind : undefined, place: typeof m.place === "string" ? m.place : undefined, meta: typeof m.meta === "string" ? m.meta : undefined }); break;
    case "toItem": r = await P.toItem(t, { project, actor, loose: Array.isArray(m.loose) ? m.loose.map(String) : String(m.loose ?? ""), today: today(), target: m.target && typeof m.target === "object" ? m.target : undefined }); break;
    case "undo": r = await P.undo(t, { project, actor, token: String(m.token ?? "") }); break;
    case "move": r = await P.move(t, { project, actor, item: String(m.item ?? ""), state: m.state, date: m.date, title: m.title, whose: m.whose }); break;
    default: return { type: m.type, rid, error: `no such write: ${String(m.op)}` };
  }
  if (r.error) return { type: m.type, rid, error: r.error };
  return answer({ op: m.op ?? "read", result: r }, project);
}
