// Cowork v3 (fr-30): the one door from the slices to slice 0's signed trail (index.ts v3(), trail.ts Trail). Every
// slice's own adapter (crossing.ts, plan.ts, people.ts, places-trail.ts, studio-trail.ts, trailport.ts, port5.ts)
// writes and reads through this, in slice 0's event shape ({ project, by, kind, item?, field?, value? }). Two things
// are done here once, so the slices agree:
//   the project id   the slices and the face speak room ids; the trail holds project ids, the room's cloud code or the
//                    slug of its id (project-id.ts, slice 8's rule). In: room id → project id. Out: back to the room id.
//   who wrote it     the person's login, signed by this machine's key (the machine name is always this Sol's own:
//                    keys.ts refuses another's), or by their agent's key when an agent wrote ("sol" when a slice only
//                    says that an agent did).
// Loaded only with the switch on: everything that imports this is itself imported behind coworkV3().
import { v3 } from "./index.js";
import { projectFor, roomFor } from "./project-id.js";
import type { Draft, TrailEvent } from "./trail.js";

const AGENT = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** slice 0's By from what a slice says: a login, and an agent's name or only that an agent wrote */
export function byOf(person: string, agent?: string | boolean): { person: string; agent?: string } {
  const a = typeof agent === "string" && AGENT.test(agent) ? agent : agent ? "sol" : undefined;
  return { person, ...(a ? { agent: a } : {}) };
}

export type Door = {
  machine: string;
  append(d: Draft): TrailEvent;
  /** a project's events after `seq` (the trail's seq is one count over every project) */
  since(room: string, seq?: number, limit?: number): TrailEvent[];
  /** every project's events after `seq`, in seq order */
  all(seq?: number): TrailEvent[];
  /** a project's trail, checked */
  check(room: string): { ok: TrailEvent[]; bad: unknown[] };
  get(id: string): TrailEvent | null;
  /** the rooms (project ids for a project no room carries) that have a trail */
  projects(): string[];
  waiting(room: string, limit?: number): TrailEvent[];
  isWaiting(id: string): boolean;
};

const out = (e: TrailEvent): TrailEvent => ({ ...e, project: roomFor(e.project) });
/** the door over this Sol's trail (or a given one: the tests) */
export function door(t = v3()): Door {
  const { trail, keys } = t;
  return {
    machine: keys.machineName,
    append(d) {
      const by = d.by.agent ? { person: d.by.person, agent: d.by.agent } : { person: d.by.person, machine: keys.machineName };
      return out(trail.append({ ...d, project: projectFor(d.project), by }));
    },
    since: (room, seq = 0, limit = 100_000) => trail.since(projectFor(room), seq, limit).map(out),
    all(seq = 0) { return trail.projects().flatMap((p) => trail.since(p, seq, 100_000)).sort((a, b) => a.seq - b.seq).map(out); },
    check(room) { const v = trail.check(projectFor(room)); return { ok: v.ok.map(out), bad: v.bad }; },
    get: (id) => { const e = trail.get(id); return e ? out(e) : null; },
    projects: () => trail.projects().map((p) => roomFor(p)),
    waiting: (room, limit = 100_000) => trail.waiting(projectFor(room), limit).map(out),
    isWaiting: (id) => trail.isWaiting(id),
  };
}
