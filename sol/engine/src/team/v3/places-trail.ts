// Cowork v3, slice 4 (fr-30, #557): the one file that knows the trail, for places and routing.
// A write is slice 0's Draft { project, by, kind, item?, field?, value? }; the record folds `place` events into places
// (one object per place, a field per write) and `route` events into routing (item = the kind of thing, field `place`).
// The engine's trail is slice 0's, through door.ts (`doorTrail` below); the memory and file trails are the tests'.
// foldPlaces does what record.ts's fold does for those two collections (per object, per field, the latest write wins).
import type { By, Ev, Draft, TrailPort } from "../../file-trail.js";
export { memoryTrail, fileTrail, type By, type Ev, type Draft, type TrailPort } from "../../file-trail.js";   // lifted out for the home's log too (#633)

export type PlaceObj = { id: string; by: By; at: number; updated: number; fields: Record<string, unknown> };
export type PlacesRecord = { places: Record<string, PlaceObj>; routing: Record<string, string> };

/** places and routing from a project's events, in any order (pure): record.ts's fold for those two collections */
export function foldPlaces(events: Ev[]): PlacesRecord {
  const sorted = [...new Map(events.map((e) => [e.id, e])).values()].sort((a, b) => a.at - b.at || a.seq - b.seq || (a.id < b.id ? -1 : 1));
  const places: Record<string, PlaceObj> = {}, routes: Record<string, string> = {};
  for (const e of sorted) {
    if (!e.item) continue;
    const writes: [string, unknown][] = e.field !== undefined ? [[e.field, e.value ?? null]]
      : e.value && typeof e.value === "object" && !Array.isArray(e.value) ? Object.entries(e.value as Record<string, unknown>) : [];
    if (e.kind === "place") {
      const o = places[e.item] ??= { id: e.item, by: e.by, at: e.at, updated: e.at, fields: {} };
      o.updated = Math.max(o.updated, e.at);
      for (const [f, v] of writes) if (v !== undefined) o.fields[f] = v;
    } else if (e.kind === "route") {
      for (const [f, v] of writes) if (f === "place" && typeof v === "string") routes[e.item] = v;
    }
  }
  return { places, routing: routes };
}

/** slice 0's trail as this slice's (door.ts: signed, the room id made the project id there) */
export function doorTrail(d: { append(x: Draft): Ev; since(room: string, seq?: number): Ev[] }): TrailPort {
  return { append: (x) => d.append(x), since: (p, seq = 0) => d.since(p, seq) };
}
