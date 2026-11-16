// Cowork v3 (fr-30): one project id for every slice. A room's project id on the trail is its cloud code when it has one
// (the cloud's trail is a room's code), else the slug of its room id (slice 8's rule, today.ts). The face keeps speaking
// room ids; wire.ts turns what it is given into the project id once, here, and the answers carry room ids back.
import { getTeam, slug, CODE, type Room } from "../settings.js";

const PROJECT = /^[A-Za-z0-9][\w.-]{0,79}$/;
/** a room's project id on the trail (pure): its cloud code, else its id's slug */
export function projectOf(r: Pick<Room, "id" | "code">): string {
  if (r.code && CODE.test(r.code)) return r.code;
  const s = slug(r.id) || "group";
  return PROJECT.test(s) ? s : `g-${s}`;
}
/** the project id for a room id, or for what already is a project id (then itself) */
export function projectFor(x: string, rooms: Pick<Room, "id" | "code">[] = getTeam().rooms): string {
  const r = rooms.find((y) => y.id === x) ?? rooms.find((y) => projectOf(y) === x);
  return r ? projectOf(r) : x;
}
/** the room id for a project id, or the project id itself when no room carries it */
export function roomFor(project: string, rooms: Pick<Room, "id" | "code">[] = getTeam().rooms): string {
  return rooms.find((y) => projectOf(y) === project)?.id ?? rooms.find((y) => y.id === project)?.id ?? project;
}
