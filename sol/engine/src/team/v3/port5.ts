// Cowork v3, slice 5 (fr-30, #558): the one file that knows slice 0's trail. Talk, setup and joining write and read only
// through `Port` (append, since), in slice 0's own event shape: { project, by, kind, item?, field?, value? }. The kinds
// slice 0's record folds (item, loose, member, place, route, setting) are written exactly as its fold reads them (one
// field, or an object of fields), so `recordOf` below and slice 0's `fold` agree on them; the kinds it does not fold
// (talk, ask, ask.answered, automation, join.link, join.asked) stay on the trail for the folds of this slice and slice 2.
// The engine's port is slice 0's signed trail, through door.ts (`portNow`); the memory and file ports are the tests'.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { STATE_DIR } from "../../work/state.js";
import { undoneIn } from "./record.js";
import { counts, dateAfter, inOrder, seatAfter, seatOf, seatWrite } from "./standing.js";

export type By = { person: string; machine?: string; agent?: string };
/** one event, as this slice reads it (slice 0's TrailEvent carries these and more) */
export type Ev = { id: string; seq: number; at: number; project: string; by: By; kind: string; item?: string; field?: string; value?: unknown; key?: string; prev?: string };
export type Draft = { project: string; by: By; kind: string; item?: string; field?: string; value?: unknown; at?: number };
export interface Port {
  append(d: Draft): Ev;
  since(project: string, seq?: number): Ev[];
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
/** a short id for something this slice makes (talk lines, asks, links) */
export const newId = (prefix: string) => `${prefix}-${randomBytes(6).toString("hex")}`;
export const hashOf = sha;

/** a trail in memory: the tests', and the shape of the file one below */
export function memoryPort(seed: Ev[] = [], now: () => number = Date.now): Port & { all: Ev[] } {
  const all = [...seed];
  return {
    all,
    append(d) {
      const last = all[all.length - 1];
      const at = Math.max(Math.floor(d.at ?? now()), last?.at ?? 0);
      const ev: Ev = { id: sha(JSON.stringify([d, at, all.length])), seq: all.length + 1, at, project: d.project, by: d.by, kind: d.kind,
        ...(d.item !== undefined ? { item: d.item } : {}), ...(d.field !== undefined ? { field: d.field } : {}), ...(d.value !== undefined ? { value: d.value } : {}) };
      all.push(ev);
      return ev;
    },
    since: (project, seq = 0) => all.filter((e) => e.project === project && e.seq > seq),
  };
}

/** until slice 0's trail is here: the same events, one JSON line each */
export function filePort(file: string): Port {
  const read = (): Ev[] => {
    if (!existsSync(file)) return [];
    return readFileSync(file, "utf8").split("\n").flatMap((l) => { try { const e = JSON.parse(l); return e && typeof e.kind === "string" ? [e as Ev] : []; } catch { return []; } });
  };
  const mem = memoryPort(read());
  return {
    append(d) {
      const ev = mem.append(d);
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      appendFileSync(file, JSON.stringify(ev) + "\n", { mode: 0o600 });
      return ev;
    },
    since: (project, seq) => mem.since(project, seq),
  };
}

let shared: Port | null = null;
/** this engine's port: slice 0's signed trail, through door.ts (signed on this machine; the room id made the project id) */
export async function portNow(): Promise<Port> {
  if (shared) return shared;
  const d = (await import("./door.js")).door();
  shared = { append: (x) => d.append(x), since: (project, seq = 0) => d.since(project, seq) };
  return shared;
}
/** tests */
export const _setPort = (p: Port | null) => { shared = p; };

// ---------------------------------------------------------------- the record, as far as this slice reads it
/** one object of the record: who made it, and its fields, the latest write of each winning */
export type Obj = { id: string; by: By; at: number; fields: Record<string, unknown> };
export type Rec = {
  items: Record<string, Obj>; loose: Record<string, Obj>; members: Record<string, Obj>; places: Record<string, Obj>;
  routing: Record<string, string>; settings: { team: Record<string, unknown>; project: Record<string, unknown> };
  /** what slices 6 and 7 write, read here only for their ids and titles (a thread each, a copied shape) */
  artifacts: Record<string, Obj>; automations: Record<string, Obj>;
};
const COLL: Record<string, keyof Rec> = { item: "items", loose: "loose", member: "members", place: "places", route: "routing", setting: "settings", artifact: "artifacts", automation: "automations" };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** a project's record from its events (in the trail's order, the latest write of a field wins; slice 0's fold decides
 *  between two writes made without seeing each other, which this slice never makes). A member event counts only when
 *  its writer could make it then (standing.ts, #1049); a member's object is one whatever the case of its login */
export function recordOf(evs: Ev[]): Rec {
  const r: Rec = { items: {}, loose: {}, members: {}, places: {}, routing: {}, settings: { team: {}, project: {} }, artifacts: {}, automations: {} };
  const objs = new Map<string, Obj>();
  const undone = undoneIn(evs);   // slice 0's rule: an undone event folds as if it never happened
  const owners = new Set<string>();   // logins in lower case, kept as the fold goes
  for (const e of inOrder(evs, (x) => Math.trunc(x.at), (x) => x.key ?? x.by.person)) {
    if (undone.has(e.id) && e.kind !== "member") continue;   // a role is changed by another role event, never taken back into the past
    const c = COLL[e.kind];
    if (!c || !e.item) continue;
    const k = `${c}\n${c === "members" ? e.item.toLowerCase() : e.item}`;
    let o = objs.get(k);
    let write = e.field !== undefined ? { [e.field]: e.value ?? null } : isObj(e.value) ? e.value : {};
    if (c === "members") {
      // a member event says the whole seat, role and in (people.ts reads the same shape); one that does not counts nothing
      const seat = seatWrite(write);
      const before = o ? seatOf(o.fields) : null, after = seat ? seatAfter(before, seat) : null;
      if (!seat || (seat.in === undefined && !before) || !counts({ owners, writer: e.by.person, agent: !!e.by.agent, who: e.item, before, after })) continue;
      if (after === null && !owners.has(e.by.person.toLowerCase())) write = { in: false };   // someone leaving writes only that they left
      const who = e.item.toLowerCase();
      if (after === "owner") owners.add(who); else owners.delete(who);
    }
    if (!o) { o = { id: e.item, by: e.by, at: e.at, fields: {} }; objs.set(k, o); }
    Object.assign(o.fields, write);
  }
  for (const [k, o] of objs) {
    const c = k.split("\n")[0] as keyof Rec;
    if (c === "routing") { if (typeof o.fields.place === "string") r.routing[o.id] = o.fields.place; continue; }
    if (c === "settings") { if (o.id === "team" || o.id === "project") r.settings[o.id] = { ...o.fields }; continue; }
    (r[c] as Record<string, Obj>)[o.id] = o;
  }
  return r;
}

/** the people in a project and their role (owner, editor, guest): members let in and not out */
export type Role = "owner" | "editor" | "guest";
export const ROLES: Role[] = ["owner", "editor", "guest"];
export const roleOf = (rec: Rec, who: string): Role | null => {
  const m = Object.values(rec.members).find((x) => x.id.toLowerCase() === who.toLowerCase());
  return m && m.fields.in === true && ROLES.includes(m.fields.role as Role) ? (m.fields.role as Role) : null;
};
export const inProject = (rec: Rec) => Object.values(rec.members).filter((m) => m.fields.in === true && ROLES.includes(m.fields.role as Role))
  .map((m) => ({ who: m.id, role: m.fields.role as Role }));

/** a project nobody is a member of yet (today's groups, before the switch imports them): its first writer becomes its
 *  first owner, with one event that says so */
export function ensureOwner(port: Port, project: string, by: By): Ev | null {
  const evs = port.since(project), rec = recordOf(evs);
  if (inProject(rec).length) return null;
  return port.append({ project, by, kind: "member", item: by.person, value: { role: "owner", in: true, letInBy: by.person, first: true }, ...dateAfter(lastMemberAt(evs)) });
}

/** the time of the latest member event in a project's events (ms), 0 when none: a role event is written after it */
export const lastMemberAt = (evs: Ev[]): number => evs.reduce((n, e) => (e.kind === "member" ? Math.max(n, e.at) : n), 0);
