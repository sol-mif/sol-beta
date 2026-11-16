// Cowork v3, slice 3 (fr-30, #556): People, my window and handing. Every write here is one event on the project's trail;
// what a face sees is folded from those events, never kept beside them. This file is also slice 3's one adapter to
// slice 0's trail (team/v3/trail.ts, through door.ts): the rest of the slice talks to `TrailPort` and nothing else. The coupling is the four calls the plan names: append, since, verify
// and (optionally) fold; this file folds its own kinds itself.
//
// The model (the PRD's path 4, the design brief "Roles" and "my window"):
// - members: owner (many), editor, guest; every non-guest has one agent, always shown with its person, never alone.
// - settings in three layers, team -> project -> me: set at the layer it belongs to, inherited down, overridden below;
//   a layer that sets nothing passes the one before it through.
// - my window: three rings, Mine (never, unless I hand it), My way (when I approve, each time), Work facts (shown).
//   A chip moves only by its own person's drag: one event, one undo token. The core never moves by itself.
// - handing an item: a crossing card addressed to a face; whose changes only on Send, with Undo after.
// - a guest looks: no composer, no presses, no agent. The engine refuses their writes; the face only follows.
// - someone leaves: one card naming what ran on them (places, files on their machine, their agent's key and
//   automations), one press a line; nobody else's part of the project changes.
import { createHash, randomUUID } from "node:crypto";
import { door, byOf, type Door } from "./door.js";
import type { TrailEvent } from "./trail.js";

// ---------------------------------------------------------------- the trail port (slice 0's API, as plan.html names it)
export type Actor = { who: string; agent?: boolean; machine?: string };
export type Draft = { project: string; actor: Actor; kind: string; item?: string; where?: string; data?: Record<string, unknown> };
export type Event = Draft & { id: string; seq: number; at: string; hash: string; prev: string };
export type TrailPort = {
  append(e: Draft): Event;
  since(project: string, seq?: number): Event[];
  verify?(project?: string): { ok: boolean; bad?: string[] };
  fold?: unknown;
};

/** a trail in memory, the same four calls, hash-chained per writer: what the tests and a Sol before slice 0 use */
export function memoryTrail(now: () => Date = () => new Date()): TrailPort & { all: Event[] } {
  const all: Event[] = [];
  const heads = new Map<string, string>();
  const digest = (e: Omit<Event, "hash">) => createHash("sha256").update(JSON.stringify([e.project, e.actor, e.kind, e.item ?? null, e.where ?? null, e.data ?? null, e.at, e.prev])).digest("hex");
  return {
    all,
    append(d) {
      const writer = `${d.actor.who}${d.actor.agent ? "'s agent" : ""}@${d.actor.machine ?? ""}`;
      const base = { ...d, id: randomUUID(), seq: all.length + 1, at: now().toISOString(), prev: heads.get(writer) ?? "" };
      const e: Event = { ...base, hash: digest(base) };
      heads.set(writer, e.hash);
      all.push(e);
      return e;
    },
    since: (project, seq = 0) => all.filter((e) => e.project === project && e.seq > seq),
    verify(project) {
      const bad = all.filter((e) => (!project || e.project === project) && digest(e) !== e.hash).map((e) => e.id);
      return { ok: bad.length === 0, bad };
    },
  };
}

/** slice 0's trail as this slice's port (door.ts: signed as the person on this machine, or as their agent; the room id
 *  made the project id there). Members and settings are written as slice 0's own collections, so the record, joining
 *  (slice 5) and the import (slice 8) see the same people: member.in / member.role → `member` { role, in: true },
 *  member.out → `member` { in: false }, setting.set → `setting` (item team, project or me:<login>, field the key).
 *  Read back they are this slice's kinds again. Its other kinds stay its own, `data` and `where` riding in the value */
export function doorPort(d: Pick<Door, "append" | "since" | "check">): TrailPort {
  const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {});
  const back = (e: TrailEvent): Event[] => {
    const v = obj(e.value);
    const where = typeof v.where === "string" ? v.where : undefined;
    delete v.where;
    const ev = (kind: string, data: Record<string, unknown>, item = e.item): Event => ({ project: e.project,
      actor: { who: e.by.person, ...(e.by.agent ? { agent: true } : {}), ...(e.by.machine ? { machine: e.by.machine } : {}) }, kind,
      ...(item ? { item } : {}), ...(where ? { where } : {}), data, id: e.id, seq: e.seq, at: new Date(e.at).toISOString(), hash: e.hash, prev: e.prev });
    if (e.kind === "member" && e.item) {
      const f = e.field !== undefined ? { [e.field]: e.value } : v;
      if (f.in === false) return [ev("member.out", { who: e.item }, undefined)];
      return typeof f.role === "string" ? [ev("member.in", { who: e.item, role: f.role }, undefined)] : [];
    }
    if (e.kind === "setting" && e.item) {
      const layer = e.item.startsWith("me:") ? "me" : e.item;
      const f = e.field !== undefined ? { [e.field]: e.value } : v;
      return Object.entries(f).map(([key, value]) => ev("setting.set", { layer, key, value }, undefined));
    }
    return [ev(e.kind, v)];
  };
  const draft = (x: Draft) => {
    const by = byOf(x.actor.who, x.actor.agent), dd = x.data ?? {};
    if ((x.kind === "member.in" || x.kind === "member.role") && typeof dd.who === "string") return { project: x.project, by, kind: "member", item: dd.who, value: { role: dd.role, in: true } };
    if (x.kind === "member.out" && typeof dd.who === "string") return { project: x.project, by, kind: "member", item: dd.who, value: { in: false } };
    if (x.kind === "setting.set" && typeof dd.layer === "string" && typeof dd.key === "string")
      return { project: x.project, by, kind: "setting", item: dd.layer === "me" ? `me:${x.actor.who.toLowerCase()}` : dd.layer, field: dd.key, value: dd.value ?? null };
    return { project: x.project, by, kind: x.kind, ...(x.item ? { item: x.item } : {}), value: { ...dd, ...(x.where ? { where: x.where } : {}) } };
  };
  return {
    append: (x) => back(d.append(draft(x)))[0] ?? ({ ...x, id: "", seq: 0, at: new Date().toISOString(), hash: "", prev: "" }),
    since: (project, seq = 0) => d.since(project, seq).flatMap(back),
    verify(project) { if (!project) return { ok: true }; const v = d.check(project); return { ok: v.bad.length === 0, bad: v.bad.map((b) => (b as { id: string }).id) }; },
  };
}

let port: TrailPort | null = null;
/** the trail slice 3 writes to: slice 0's, through the door (the memory trail above is the tests') */
export const trail = (): TrailPort => (port ??= doorPort(door()));
export const useTrail = (t: TrailPort | null) => { port = t; };

// ---------------------------------------------------------------- roles
export type Role = "owner" | "editor" | "guest";
export const ROLES: Role[] = ["owner", "editor", "guest"];
export type Abilities = { composer: boolean; presses: boolean; agent: boolean };
/** what a role may do (F5): a guest looks, nothing else */
export const abilities = (role: Role | null | undefined): Abilities =>
  role === "owner" || role === "editor" ? { composer: true, presses: true, agent: true } : { composer: false, presses: false, agent: false };
export const GUEST_NO = "a guest looks here; making, pressing and agents are the members'";

export type Member = { who: string; role: Role; agent: { whose: string } | null; since: string };

// ---------------------------------------------------------------- settings layers
export type Layer = "team" | "project" | "me";
export const LAYERS: Layer[] = ["team", "project", "me"];
export const SETS = [
  { k: "agents", name: "Agents in Talk", opts: ["facts only", "may answer", "silent"] },
  { k: "read", name: "A read before it lands", opts: ["always", "for big changes", "never"] },
  { k: "pings", name: "Pings", opts: ["any time", "not after 22:00", "reds only"] },
] as const;
export type SetKey = (typeof SETS)[number]["k"];
export const DEFAULT_SET: Record<SetKey, string> = { agents: "facts only", read: "always", pings: "any time" };
export type LayerRow = { k: SetKey; name: string; opts: readonly string[]; team?: string; project?: string; me?: string; value: string; from: Layer | "default" };

// ---------------------------------------------------------------- my window
export type Ring = "mine" | "myWay" | "workFacts";
export const RINGS: Ring[] = ["mine", "myWay", "workFacts"];
export const RING_WORDS: Record<Ring, { name: string; rule: string }> = {
  mine: { name: "Mine", rule: "never, unless I hand it" },
  myWay: { name: "My way", rule: "when I approve, each time" },
  workFacts: { name: "Work facts", rule: "shown to the project" },
};
export const CHIPS: Record<string, { label: string; full: string }> = {
  sessions: { label: "sessions", full: "my sessions" },
  transcripts: { label: "transcripts", full: "my transcripts" },
  memory: { label: "memory", full: "my memory" },
  files: { label: "my files", full: "my files on this machine" },
  raw: { label: "raw learnings", full: "what my Sol learned, raw" },
  how: { label: "how I work", full: "summaries of how I work" },
  patterns: { label: "my patterns", full: "my patterns" },
  say: { label: "what my agent says", full: "what my agent may say for me" },
  handed: { label: "a handed session", full: "a session I hand over" },
  on: { label: "what I am on", full: "what I am on" },
  items: { label: "my items", full: "my items" },
  presence: { label: "here or away", full: "here or away" },
  version: { label: "my version", full: "my version" },
  handins: { label: "what I handed in", full: "what I handed in" },
};
export const defaultWindow = (): Record<Ring, string[]> => ({
  mine: ["sessions", "transcripts", "memory", "files", "raw"],
  myWay: ["how", "patterns", "say", "handed"],
  workFacts: ["on", "items", "presence", "version", "handins"],
});
/** what my agent may pass of a chip: work facts yes, my way only on my yes each time, mine never */
export const passOf = (ring: Ring): "yes" | "ask" | "never" => (ring === "workFacts" ? "yes" : ring === "myWay" ? "ask" : "never");

// ---------------------------------------------------------------- the fold of slice 3's own kinds
export type Hand = { id: string; item: string; title: string; from: string; to: string; at: string; undone?: true };
export type People = {
  members: Map<string, Member>;
  left: Map<string, { at: string; by: string }>;
  layers: { team: Record<string, string>; project: Record<string, string>; me: Map<string, Record<string, string>> };
  windows: Map<string, Record<Ring, string[]>>;
  moves: Map<string, { who: string; chip: string; from: Ring; to: Ring; undone?: true }>;   // by undo token
  hands: Map<string, Hand>;                                                                // by undo token
};
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const str = (v: unknown) => (typeof v === "string" ? v : "");

export function foldPeople(events: Event[]): People {
  const p: People = { members: new Map(), left: new Map(), layers: { team: {}, project: {}, me: new Map() }, windows: new Map(), moves: new Map(), hands: new Map() };
  const win = (who: string) => { let w = p.windows.get(who); if (!w) { w = defaultWindow(); p.windows.set(who, w); } return w; };
  const ringOf = (w: Record<Ring, string[]>, chip: string) => RINGS.find((r) => w[r].includes(chip));
  const put = (who: string, chip: string, to: Ring) => { const w = win(who); for (const r of RINGS) w[r] = w[r].filter((c) => c !== chip); w[to].push(chip); };
  for (const e of events) {
    const d = e.data ?? {};
    switch (e.kind) {
      case "member.in": case "member.role": {
        const who = str(d.who), role = str(d.role) as Role;
        if (!who || !ROLES.includes(role)) break;
        p.left.delete(who);
        const had = p.members.get(who);
        p.members.set(who, { who, role, agent: role === "guest" ? null : { whose: who }, since: had?.since ?? e.at });
        break;
      }
      case "member.out": {
        const who = str(d.who); if (!who) break;
        p.members.delete(who); p.left.set(who, { at: e.at, by: e.actor.who });
        break;
      }
      case "setting.set": {
        const layer = str(d.layer) as Layer, k = str(d.key), v = d.value;
        if (!LAYERS.includes(layer) || !SETS.some((s) => s.k === k)) break;
        const box = layer === "me" ? (p.layers.me.get(e.actor.who) ?? (p.layers.me.set(e.actor.who, {}), p.layers.me.get(e.actor.who)!)) : p.layers[layer];
        if (typeof v === "string" && v) box[k] = v; else delete box[k];
        break;
      }
      case "window.move": {
        const chip = str(d.chip), to = str(d.to) as Ring, token = str(d.undo);
        if (!CHIPS[chip] || !RINGS.includes(to) || e.actor.agent) break;   // only the person themself, never an agent
        const from = ringOf(win(e.actor.who), chip); if (!from || from === to) break;
        put(e.actor.who, chip, to);
        if (token) p.moves.set(token, { who: e.actor.who, chip, from, to });
        break;
      }
      case "window.undo": {
        const m = p.moves.get(str(d.undo));
        if (!m || m.undone || !same(m.who, e.actor.who) || e.actor.agent) break;
        put(m.who, m.chip, m.from); m.undone = true;
        break;
      }
      case "crossing.sent": {
        if (str(d.to) === "" || str(d.kind) !== "hand") break;
        const token = str(d.undo);
        p.hands.set(token, { id: token, item: e.item ?? "", title: str(d.title), from: e.actor.who, to: str(d.to), at: e.at });
        break;
      }
      case "crossing.undone": {
        const h = p.hands.get(str(d.undo));
        if (h && same(h.from, e.actor.who)) h.undone = true;
        break;
      }
    }
  }
  return p;
}

// ---------------------------------------------------------------- reading a project
/** a project's people as the trail says; a project whose trail names nobody yet is seeded from today's room (`seed`),
 *  written once as member.in events by its first owner, so every reading after that is the trail's alone */
export function peopleOf(project: string, seed?: { owners: string[]; editors: string[]; by: string }): People {
  const t = trail();
  let evs = t.since(project, 0);
  if (seed && !evs.some((e) => e.kind === "member.in")) {
    const seen = new Set<string>();
    for (const [list, role] of [[seed.owners, "owner"], [seed.editors, "editor"]] as const)
      for (const who of list) { if (!who || seen.has(who.toLowerCase())) continue; seen.add(who.toLowerCase()); t.append({ project, actor: { who: seed.by }, kind: "member.in", where: "record", data: { who, role } }); }
    evs = t.since(project, 0);
  }
  return foldPeople(evs);
}
export const roleOf = (p: People, who: string): Role | null => [...p.members.values()].find((m) => same(m.who, who))?.role ?? null;

/** the three layers as one picture: per setting, each layer's own value and the one in effect, and where it came from */
export function layersOf(p: People, me: string): LayerRow[] {
  const mine = [...p.layers.me.entries()].find(([w]) => same(w, me))?.[1] ?? {};
  return SETS.map((s) => {
    const team = p.layers.team[s.k], project = p.layers.project[s.k], my = mine[s.k];
    const from: LayerRow["from"] = my ? "me" : project ? "project" : team ? "team" : "default";
    return { k: s.k, name: s.name, opts: s.opts, ...(team ? { team } : {}), ...(project ? { project } : {}), ...(my ? { me: my } : {}), value: my ?? project ?? team ?? DEFAULT_SET[s.k], from };
  });
}
export const settingOf = (p: People, me: string, k: SetKey) => layersOf(p, me).find((r) => r.k === k)!.value;

// ---------------------------------------------------------------- the answers
export type Roster = { who: string; agent?: boolean; state?: string; since?: number; session?: { title?: string } | null; thing?: { name?: string } | null };
export type Station = {
  who: string; role: Role; you: boolean; here: "here" | "away"; on: string | null;
  agent: { whose: string; busy: boolean; may: string[] } | null;
};
export type PeopleAnswer = {
  project: string; me: string; role: Role | null; can: Abilities;
  groups: { on: string; people: Station[] }[];   // by what each is on now; "nothing open" last
  roles: Record<Role, string[]>; agents: string[];
  layers: LayerRow[];
};
const AGENT_MAY = ["post facts", "hand in", "ask for a read"];

/** People (E9's room, F5): stations grouped by what each person is on now, their agent beside them */
export function people(project: string, me: string, roster: Roster[] = [], seed?: Parameters<typeof peopleOf>[1]): PeopleAnswer {
  const p = peopleOf(project, seed);
  const role = roleOf(p, me);
  const ord: Record<Role, number> = { owner: 0, editor: 1, guest: 2 };
  const stations: Station[] = [...p.members.values()].sort((a, b) => ord[a.role] - ord[b.role] || a.who.localeCompare(b.who)).map((m) => {
    const r = roster.filter((x) => same(x.who, m.who));
    const person = r.find((x) => !x.agent), agent = r.find((x) => x.agent);
    const on = person?.session?.title || person?.thing?.name || agent?.session?.title || null;
    return {
      who: m.who, role: m.role, you: same(m.who, me), here: person && person.state !== "away" ? "here" : same(m.who, me) ? "here" : "away",
      on: m.role === "guest" ? null : on,
      agent: m.agent ? { whose: m.who, busy: agent?.state === "working", may: AGENT_MAY } : null,
    };
  });
  const groups = new Map<string, Station[]>();
  for (const s of stations) { const k = s.on ?? (s.role === "guest" ? "looking in" : "nothing open"); groups.set(k, [...(groups.get(k) ?? []), s]); }
  const quiet = (k: string) => k === "nothing open" || k === "looking in";
  const by = (r: Role) => stations.filter((s) => s.role === r).map((s) => s.who);
  return {
    project, me, role, can: abilities(role),
    groups: [...groups.entries()].sort(([a], [b]) => Number(quiet(a)) - Number(quiet(b))).map(([on, people]) => ({ on, people })),
    roles: { owner: by("owner"), editor: by("editor"), guest: by("guest") },
    agents: stations.filter((s) => s.agent).map((s) => s.who),
    layers: layersOf(p, me),
  };
}

export type ChipView = { id: string; ring: Ring; label: string; full: string; pass: "yes" | "ask" | "never"; shut?: true };
export type WindowAnswer = { project: string; whose: string; viewer: string; mine: boolean; rings: Record<Ring, ChipView[]>; words: typeof RING_WORDS; can: { move: boolean } };
/** a person's window, as `viewer` sees it: their own with every chip named; someone else's with the core shut,
 *  "my way" as an ask, and the facts as what they show */
export function window(project: string, whose: string, viewer: string, facts: Record<string, string> = {}): WindowAnswer {
  const p = peopleOf(project);
  const w = [...p.windows.entries()].find(([x]) => same(x, whose))?.[1] ?? defaultWindow();
  const mine = same(whose, viewer);
  const rings = Object.fromEntries(RINGS.map((r) => [r, w[r].map((id): ChipView => {
    const c = CHIPS[id];
    if (mine) return { id, ring: r, label: c.label, full: c.full, pass: passOf(r) };
    if (r === "mine") return { id, ring: r, label: "", full: `${whose}'s own. Never shown unless handed.`, pass: "never", shut: true };
    if (r === "myWay") return { id, ring: r, label: c.label.replace(/\bmy\b/, `${whose}'s`).replace(/\bI\b/, whose), full: c.full, pass: "ask" };
    return { id, ring: r, label: facts[id] ?? c.label, full: c.full, pass: "yes" };
  })])) as Record<Ring, ChipView[]>;
  const role = roleOf(p, viewer);
  return { project, whose, viewer, mine, rings, words: RING_WORDS, can: { move: mine && abilities(role).presses } };
}

export type Refusal = { error: string };
export type Moved = { ok: true; undo: string; line: string; event: string; window: WindowAnswer };
const names = (ws: string[]) => ws.length <= 1 ? (ws[0] ?? "Nobody") : `${ws.slice(0, -1).join(", ")} and ${ws[ws.length - 1]}`;

/** E9: a chip dragged to another ring of my own window: one event, an undo token and the Undo line's words. Only the
 *  window's own person moves it, never their agent and never anyone else; nothing else in Sol calls this */
export function moveChip(project: string, actor: Actor, chip: string, to: Ring): Moved | Refusal {
  if (actor.agent) return { error: "an agent never moves its person's window" };
  if (!CHIPS[chip]) return { error: "no such chip" };
  if (!RINGS.includes(to)) return { error: "no such ring" };
  const p = peopleOf(project);
  const role = roleOf(p, actor.who);
  if (!role) return { error: "only a member has a window here" };
  if (!abilities(role).presses) return { error: GUEST_NO };
  const w = [...p.windows.entries()].find(([x]) => same(x, actor.who))?.[1] ?? defaultWindow();
  const from = RINGS.find((r) => w[r].includes(chip))!;
  if (from === to) return { error: "it is in that ring already" };
  const undo = randomUUID();
  const e = trail().append({ project, actor: { who: actor.who, ...(actor.machine ? { machine: actor.machine } : {}) }, kind: "window.move", where: "record", data: { chip, from, to, undo } });
  const others = [...p.members.values()].filter((m) => !same(m.who, actor.who) && m.role !== "guest").map((m) => m.who);
  const c = CHIPS[chip];
  const line = to === "workFacts" ? `${names(others)} now see ${c.full.replace(/^my /, "your ")}.`
    : to === "myWay" ? `“${c.label}” shows only when you approve, each time.`
    : `“${c.label}” is yours alone now. It never leaves this machine unless you hand it.`;
  return { ok: true, undo, line, event: e.id, window: window(project, actor.who, actor.who) };
}
/** Undo on the line: the move taken back, as one more event (nothing is ever removed from the trail) */
export function undoMove(project: string, actor: Actor, token: string): { ok: true; window: WindowAnswer } | Refusal {
  if (actor.agent) return { error: "an agent never moves its person's window" };
  const p = peopleOf(project);
  const m = p.moves.get(token);
  if (!m || !same(m.who, actor.who)) return { error: "nothing of yours to undo" };
  if (m.undone) return { error: "already taken back" };
  trail().append({ project, actor: { who: actor.who }, kind: "window.undo", where: "record", data: { undo: token } });
  return { ok: true, window: window(project, actor.who, actor.who) };
}

/** a setting set at one layer (null: pulled back to the layer before). The team layer touches everyone, so it is an
 *  owner's; the project's is a member's; the me layer is anyone's own but a guest's */
export function setLayer(project: string, actor: Actor, layer: Layer, key: string, value: string | null): { ok: true; layers: LayerRow[] } | Refusal {
  if (actor.agent) return { error: "settings are their person's own press" };
  const s = SETS.find((x) => x.k === key); if (!s) return { error: "no such setting" };
  if (!LAYERS.includes(layer)) return { error: "no such layer" };
  if (value !== null && !(s.opts as readonly string[]).includes(value)) return { error: "not one of its values" };
  const p = peopleOf(project), role = roleOf(p, actor.who);
  if (!abilities(role).presses) return { error: role ? GUEST_NO : "only a member sets things here" };
  if (layer === "team" && role !== "owner") return { error: "the team's default is an owner's" };
  trail().append({ project, actor: { who: actor.who }, kind: "setting.set", where: "record", data: { layer, key, value } });
  return { ok: true, layers: layersOf(peopleOf(project), actor.who) };
}

/** a member's role set by an owner (an owner is never left with none) */
export function setRole(project: string, actor: Actor, who: string, role: Role): { ok: true } | Refusal {
  if (actor.agent) return { error: "roles are an owner's press" };
  const p = peopleOf(project);
  if (roleOf(p, actor.who) !== "owner") return { error: "roles are an owner's press" };
  if (!ROLES.includes(role)) return { error: "no such role" };
  const owners = [...p.members.values()].filter((m) => m.role === "owner");
  if (role !== "owner" && owners.length === 1 && same(owners[0].who, who)) return { error: "a project keeps at least one owner" };
  trail().append({ project, actor: { who: actor.who }, kind: roleOf(p, who) ? "member.role" : "member.in", where: "record", data: { who, role } });
  return { ok: true };
}

// ---------------------------------------------------------------- handing: a crossing addressed to a face
export type HandCard = { kind: "hand"; project: string; item: string; title: string; from: string; to: string; foot: string; presses: ["Send", "Keep"] };
/** the card drawn when an item is dropped on a face: nothing is written until Send */
export function hand(project: string, actor: Actor, item: { id: string; title: string }, to: string): HandCard | Refusal {
  const p = peopleOf(project), role = roleOf(p, actor.who);
  if (!abilities(role).presses) return { error: role ? GUEST_NO : "only a member hands things here" };
  const target = roleOf(p, to);
  if (!target) return { error: `${to} is not in this project` };
  if (target === "guest") return { error: `${to} is a guest here and looks only` };
  return { kind: "hand", project, item: item.id, title: item.title, from: actor.who, to, foot: `→ ${to} · whose changes on Send`, presses: ["Send", "Keep"] };
}
/** Send on the card: one crossing event addressed to the face; whose is theirs from here, Undo for 8 seconds */
export function handSend(card: HandCard, actor: Actor): { ok: true; undo: string; event: string } | Refusal {
  const ok = hand(card.project, actor, { id: card.item, title: card.title }, card.to);
  if ("error" in ok) return ok;
  const undo = randomUUID();
  const e = trail().append({ project: card.project, actor: { who: actor.who, ...(actor.agent ? { agent: true } : {}) }, kind: "crossing.sent", item: card.item, where: "record",
    data: { kind: "hand", to: card.to, title: card.title, undo } });
  return { ok: true, undo, event: e.id };
}
export function handUndo(project: string, actor: Actor, token: string): { ok: true } | Refusal {
  const h = peopleOf(project).hands.get(token);
  if (!h || !same(h.from, actor.who)) return { error: "nothing of yours to undo" };
  if (h.undone) return { error: "already taken back" };
  trail().append({ project, actor: { who: actor.who }, kind: "crossing.undone", item: h.item, where: "record", data: { undo: token } });
  return { ok: true };
}
/** whose an item is now, by the hands on the trail (the newest one not undone) */
export function whoseNow(project: string, item: string, was: string): string {
  const hs = [...peopleOf(project).hands.values()].filter((h) => h.item === item && !h.undone);
  return hs.length ? hs[hs.length - 1].to : was;
}

// ---------------------------------------------------------------- someone leaves (F8)
// The card of what leaving would leave behind is one, slice 7's (floor.ts leaves / pressLeave, from the record: places,
// items, files on their machine, their agent's key), asked as team.v3.floor.get { who }; People draws it (Leave.tsx).
/** they go: one member.out event; everyone else, the layers and every window stay as they were */
export function leave(project: string, actor: Actor, who: string): { ok: true } | Refusal {
  if (actor.agent) return { error: "leaving is a person's own press, or an owner's" };
  const p = peopleOf(project), role = roleOf(p, actor.who);
  if (!same(actor.who, who) && role !== "owner") return { error: "only an owner lets someone go" };
  if (!roleOf(p, who)) return { error: `${who} is not in this project` };
  const owners = [...p.members.values()].filter((m) => m.role === "owner");
  if (owners.length === 1 && same(owners[0].who, who)) return { error: "the last owner names another before leaving" };
  trail().append({ project, actor: { who: actor.who }, kind: "member.out", where: "record", data: { who } });
  return { ok: true };
}
