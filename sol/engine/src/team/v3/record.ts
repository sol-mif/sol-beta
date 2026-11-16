// Cowork v3's record (fr-30, slice 0): what a project holds, folded from its trail on each Sol, never stored on its own.
// Items, loose things, members, places, routing and the three settings layers (team, project, me) are objects, each
// event writing one field of one object (`field`) or several at once (an object `value`, its names in `fields`).
// The fold is the same whatever order the events come in: per object and per field, the versions no later write has
// seen (its `base`) are the field's heads; the head with the latest (at, writer) wins, and two or more heads holding
// different values are a conflict, kept with every version so the conflict card can show them all and nothing is lost.
// An edit made after seeing a value (append fills `base`) replaces it without a conflict; one that resolves a conflict
// names every head. Erased content folds to null, its field listed under `erased`.
// Undo is one more event, `undo` { of: <the event it takes back> }, by the undone event's own person (the Plan's Undo,
// the crossing's Undo): the fold leaves the undone event's writes out, as if it never happened (it stays on the trail),
// so an object whose every write was undone is not in the record at all. An undo of an undo is not followed.
import { canonical, order, type By, type TrailEvent } from "./trail.js";

export type Collection = "items" | "loose" | "members" | "places" | "routing" | "settings";
const KINDS: Record<string, Collection> = { item: "items", loose: "loose", member: "members", place: "places", route: "routing", setting: "settings" };
/** the collection an event kind writes to, or null for kinds the record does not fold (notes, erases, ...) (pure) */
export const collectionOf = (kind: string): Collection | null => KINDS[kind] ?? null;
/** the event kind that writes a collection (pure) */
export const kindOf = (c: Collection): string => Object.keys(KINDS).find((k) => KINDS[k] === c)!;

/** one version of a field, as the conflict card shows it */
export type Version = { event: string; by: By; at: number; value: unknown; erased?: true };
/** a field two Sols changed without seeing each other's change: every version, the one shown first */
export type Conflict = { collection: Collection; id: string; field: string; versions: Version[]; shown: string };
/** one object of the record */
export type Obj = {
  id: string; by: By; at: number; updated: number; fields: Record<string, unknown>;
  /** fields whose content was erased (they read null) */
  erased?: string[];
  /** fields in conflict: the flag the conflict card reads (conflictOf gives the versions) */
  conflicts?: string[];
  /** one of its events is still waiting to send */
  waiting?: true;
};
export type SettingsLayers = { team: Record<string, unknown>; project: Record<string, unknown>; me: Record<string, Record<string, unknown>> };
export type ProjectRecord = {
  items: Record<string, Obj>; loose: Record<string, Obj>; members: Record<string, Obj>; places: Record<string, Obj>;
  /** a kind of thing → the place it goes to */
  routing: Record<string, string>;
  settings: SettingsLayers;
  conflicts: Conflict[];
  /** events folded, and how many of them are erased */
  count: number; erasedCount: number;
};

type Write = { e: TrailEvent; field: string; value: unknown; erased: boolean };
/** the field writes one event makes (pure) */
function writesOf(e: TrailEvent): Write[] {
  if (!e.item || !collectionOf(e.kind)) return [];
  const erased = e.erased === true;
  if (e.field !== undefined) return [{ e, field: e.field, value: erased ? null : e.value ?? null, erased }];
  const v = e.value && typeof e.value === "object" && !Array.isArray(e.value) ? e.value as Record<string, unknown> : {};
  return (e.fields ?? []).map((f) => ({ e, field: f, value: erased ? null : v[f] ?? null, erased }));
}
/** a version's sameness: its value, or the erased event itself (pure) */
const same = (w: Write) => (w.erased ? `erased:${w.e.id}` : canonical(w.value));

/** the field's heads: its writes no other write of it has seen, in the trail's order (pure) */
function headWrites(ws: Write[]): Write[] {
  const seen = new Set(ws.flatMap((w) => w.e.base ?? []));
  return ws.filter((w) => !seen.has(w.e.id)).sort((a, b) => order(a.e, b.e));
}
/** the events holding the latest versions of one field of one object (pure); append names them as its base */
export function headsOf(events: TrailEvent[], c: Collection, id: string, field: string): TrailEvent[] {
  const ws = events.filter((e) => e.item === id && collectionOf(e.kind) === c).flatMap(writesOf).filter((w) => w.field === field);
  return headWrites(ws).map((w) => w.e);
}

/** the kind of an undo event, whose value { of } names the event it takes back */
export const UNDO = "undo";
/** the events taken back by an undo from their own person (pure): an undo of an undo, or of someone else's, counts nothing */
export function undoneIn(events: Pick<TrailEvent, "id" | "kind" | "by" | "value" | "erased">[]): Set<string> {
  const byId = new Map(events.map((e) => [e.id, e]));
  const out = new Set<string>();
  for (const e of events) {
    if (e.kind !== UNDO || e.erased) continue;
    const of = e.value && typeof e.value === "object" && !Array.isArray(e.value) ? (e.value as { of?: unknown }).of : undefined;
    const t = typeof of === "string" ? byId.get(of) : undefined;
    if (t && t.kind !== UNDO && t.by.person.toLowerCase() === e.by.person.toLowerCase()) out.add(t.id);
  }
  return out;
}

const blank = (): ProjectRecord => ({ items: {}, loose: {}, members: {}, places: {}, routing: {}, settings: { team: {}, project: {}, me: {} }, conflicts: [], count: 0, erasedCount: 0 });

/** a project's record from its (verified) events, in any order (pure but for `waiting`) */
export function fold(events: TrailEvent[], o: { waiting?: (id: string) => boolean } = {}): ProjectRecord {
  const r = blank();
  const objs: Record<Collection, Map<string, { obj: Obj; fields: Map<string, Write[]> }>> = { items: new Map(), loose: new Map(), members: new Map(), places: new Map(), routing: new Map(), settings: new Map() };
  const all = [...new Map(events.map((e) => [e.id, e])).values()].sort(order);
  const undone = undoneIn(all);
  // a write that saw an undone one saw what that one had seen: its base passes through the undone event, so taking
  // back the middle of an edit never makes a conflict of the two around it
  const byId = new Map(all.map((e) => [e.id, e]));
  const through = (base: string[] | undefined, depth = 0): string[] | undefined => !base || !undone.size || depth > 64 ? base
    : base.flatMap((id) => (undone.has(id) ? through(byId.get(id)?.base, depth + 1) ?? [] : [id]));
  for (const e0 of all) {
    r.count++;
    if (e0.erased) r.erasedCount++;
    if (undone.has(e0.id)) continue;   // taken back: as if it never happened
    const e = e0.base && undone.size ? { ...e0, base: through(e0.base) } : e0;
    const c = collectionOf(e.kind);
    if (!c || !e.item) continue;
    let o2 = objs[c].get(e.item);
    if (!o2) { o2 = { obj: { id: e.item, by: e.by, at: e.at, updated: e.at, fields: {} }, fields: new Map() }; objs[c].set(e.item, o2); }
    o2.obj.updated = Math.max(o2.obj.updated, e.at);
    if (o.waiting?.(e.id)) o2.obj.waiting = true;
    for (const w of writesOf(e)) { const l = o2.fields.get(w.field) ?? []; l.push(w); o2.fields.set(w.field, l); }
  }
  for (const c of Object.keys(objs) as Collection[]) {
    for (const [id, { obj, fields }] of [...objs[c]].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      for (const [field, ws] of [...fields].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        const heads = headWrites(ws), win = heads[heads.length - 1];
        obj.fields[field] = win.value;
        if (win.erased) (obj.erased ??= []).push(field);
        if (new Set(heads.map(same)).size > 1) {
          (obj.conflicts ??= []).push(field);
          r.conflicts.push({ collection: c, id, field, shown: win.e.id,
            versions: heads.map((w) => ({ event: w.e.id, by: w.e.by, at: w.e.at, value: w.value, ...(w.erased ? { erased: true as const } : {}) })) });
        }
      }
      if (c === "routing") { if (typeof obj.fields.place === "string") r.routing[id] = obj.fields.place; continue; }
      if (c === "settings") {
        if (id === "team" || id === "project") r.settings[id] = { ...obj.fields };
        else if (id.startsWith("me:")) r.settings.me[id.slice(3).toLowerCase()] = { ...obj.fields };
        continue;
      }
      r[c][id] = obj;
    }
  }
  return r;
}

/** one field's conflict, its versions in the trail's order, or null when it has one version (pure) */
export function conflictOf(r: ProjectRecord, c: Collection, id: string, field: string): Conflict | null {
  return r.conflicts.find((x) => x.collection === c && x.id === id && x.field === field) ?? null;
}

/** a setting as a person gets it: their own (me), else the project's, else the team's default (pure) */
export function settingOf(r: ProjectRecord, key: string, login: string): unknown {
  const me = r.settings.me[login.toLowerCase()];
  if (me && key in me) return me[key];
  if (key in r.settings.project) return r.settings.project[key];
  return r.settings.team[key];
}
