// Cowork v3, slice 4 (fr-30, #557; the PRD path 5): places and routing. A place is where a project's files already
// live (Sol's own record, a GitHub repository, a Drive folder, the project's calendar, a folder on one machine); Sol
// links to it, never copies. Each kind of new thing (code, documents, dates, items) goes to one place: the routing.
// What exists comes from today's record (the room: its provider, its repository or Drive folder, its folder on this
// machine) and the trail adds to it: a `place` event connects, revokes or re-labels a place, a `route` event moves a
// kind. Every write here is one trail event (places-trail.ts) and can be taken back for 8 s.
// A place runs on someone's sign-in (GitHub, Google): when mine expired the place is red with "Sign in again" and keeps
// its routing; nothing is lost, it catches up when I sign in again (F6). A revoked place keeps its routing too, and
// new things of its kinds go to Sol's record until it is connected again. When the record is full new files go to its
// overflow place, which the picture draws.
// Pure but for what Ctx hands in (sign-ins, counts, grants): the tests run with no network and no gh.
import type { Draft, Ev, PlacesRecord, TrailPort } from "./places-trail.js";
import { foldPlaces } from "./places-trail.js";

export type PlaceKind = "record" | "github" | "drive" | "calendar" | "folder";
export const PLACE_KINDS: PlaceKind[] = ["record", "github", "drive", "calendar", "folder"];
/** a place's own name, as the picture says it */
export const PLACE_NAME: Record<PlaceKind, string> = { record: "Sol's record", github: "GitHub", drive: "Google Drive", calendar: "Calendar", folder: "A folder" };
/** whose sign-in a place runs on, or none (Sol's own record, the calendar in it, a folder on a machine) */
export const SIGN_IN: Partial<Record<PlaceKind, "github" | "google">> = { github: "github", drive: "google" };

/** the kinds of new things, and the place each goes to when nobody routed it */
export const THING_KINDS = ["code", "documents", "dates", "items"] as const;
export type ThingKind = (typeof THING_KINDS)[number];
export const THING_LABEL: Record<ThingKind, string> = { code: "code", documents: "documents", dates: "dates", items: "Sol's items" };
/** the place a kind naturally lives in: its count is that place's count */
const NATIVE: Record<ThingKind, PlaceKind> = { code: "github", documents: "drive", dates: "calendar", items: "record" };

/** exactly what Sol reads, what it writes and what it never touches, per place (pure) */
export type Reach = { root: string; reads: string[]; writes: string[]; never: string[] };
export function reachOf(kind: PlaceKind, label: string): Reach {
  switch (kind) {
    case "github": return { root: label, reads: ["issues and pull requests", "commits", "checks"], writes: ["draft PRs", "comments, signed"], never: ["other repositories", "settings and secrets"] };
    case "drive": return { root: label, reads: ["titles and changes in this folder"], writes: ["new documents"], never: ["the rest of your Drive", "files shared with you"] };
    case "calendar": return { root: label, reads: ["the project's dates"], writes: ["new dates"], never: ["your own calendars"] };
    case "folder": return { root: label, reads: ["the files in this folder"], writes: ["new files, when you say so"], never: ["the rest of the machine", "other folders"] };
    default: return { root: label, reads: ["everything in this project"], writes: ["items, notes, the trail"], never: ["your machine", "your sessions"] };
  }
}

export type SignInState = "in" | "expired" | "out";
export type Count = { n: number; unit: string };
export type Fullness = { used: number; of: number; unit: string; frozen?: boolean };
/** a place as the face draws it */
export type Place = {
  id: string; kind: PlaceKind; label: string; name: string; by?: string;
  /** ok; red = its sign-in (mine) expired or is gone; revoked = Sol no longer reads or writes in it */
  state: "ok" | "red" | "revoked";
  line: string; signIn?: "github" | "google"; touched?: number; count?: Count;
  /** the kinds routed to it, each with its count when the place knows it */
  kinds: { kind: string; label: string; n?: number }[];
  reach: Reach;
};
export type View = {
  project: string; name: string; me: string; guest: boolean; places: Place[]; routing: Record<string, string>;
  /** the record's fullness and where files go when it is full; high from 80% */
  record: { used: number; of: number; unit: string; high: boolean; full: boolean; overflow: string; line: string } | null;
  /** where a new thing of each kind goes now (the routing, or the record for a revoked place, the overflow when full) */
  next: Record<string, string>;
  /** places that can still be connected */
  open: PlaceKind[];
};

/** a place today's record already has, before any trail event */
export type Seed = { id: string; kind: PlaceKind; label: string; by?: string };
export type Ctx = {
  project: string; name: string; me: string;
  role?: "owner" | "editor" | "guest";
  /** the places today's record has (placesFromRoom) */
  seed: Seed[];
  /** the project's other people (their logins), who agree before a kind moves for everyone */
  others?: string[];
  signIn: (s: "github" | "google") => SignInState;
  count?: (p: { id: string; kind: PlaceKind; label: string }) => Count | null;
  fullness?: () => Fullness | null;
  now?: () => number;
};

// ---- today's record → places ----
export type RoomLike = { id: string; provider: "github" | "drive" | "cloud"; repos: string[]; folder: string; mine: boolean };
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
/** the places a room already has (pure): Sol's record always, its repository (a GitHub room's record, or one
 *  connected to a cloud group), its Drive folder, the calendar kept in its record, its folder on this machine */
export function placesFromRoom(room: RoomLike, o: { me: string; connected?: string[]; hasRecord: boolean; machine?: string }): Seed[] {
  const out: Seed[] = [{ id: "record", kind: "record", label: PLACE_NAME.record }];
  const repo = room.provider === "github" ? room.repos.find((r) => REPO.test(r)) : (o.connected ?? []).find((r) => REPO.test(r));
  if (repo) out.push({ id: "github", kind: "github", label: repo, ...(room.mine ? { by: o.me } : {}) });
  if (room.provider === "drive" && room.repos[0]) out.push({ id: "drive", kind: "drive", label: "the project's Drive folder", ...(room.mine ? { by: o.me } : {}) });
  if (o.hasRecord) out.push({ id: "calendar", kind: "calendar", label: "the project's calendar" });
  if (room.folder) out.push({ id: "folder", kind: "folder", label: `${room.folder.split("/").filter(Boolean).pop() ?? room.folder}${o.machine ? ` on ${o.machine}` : ""}`, by: o.me });
  return out;
}

// ---- the fold → the view ----
const isKind = (k: unknown): k is PlaceKind => typeof k === "string" && (PLACE_KINDS as string[]).includes(k);
const KIND_ID = /^[a-z][a-z0-9-]{0,30}$/;
const ago = (t: number | undefined, now: number) => {
  if (!t) return "";
  const m = Math.round((now - t) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 60 * 24 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

/** the places of a project, folded from today's record and the trail (pure but for ctx) */
export function placesOf(rec: PlacesRecord, c: Ctx): Place[] {
  const now = (c.now ?? Date.now)();
  const all = new Map<string, Seed & { state?: string; touched?: number }>();
  for (const s of c.seed) all.set(s.id, { ...s });
  for (const [id, o] of Object.entries(rec.places)) {
    const f = o.fields, had = all.get(id);
    const kind = isKind(f.kind) ? f.kind : had?.kind;
    if (!kind) continue;
    all.set(id, { id, kind, label: typeof f.label === "string" && f.label ? f.label : had?.label ?? PLACE_NAME[kind],
      ...(typeof f.by === "string" ? { by: f.by } : had?.by ? { by: had.by } : {}), ...(typeof f.state === "string" ? { state: f.state } : {}), touched: o.updated });
  }
  const routing = routingOf(rec, c);
  return [...all.values()].sort((a, b) => PLACE_KINDS.indexOf(a.kind) - PLACE_KINDS.indexOf(b.kind) || (a.id < b.id ? -1 : 1)).map((p) => {
    const signIn = SIGN_IN[p.kind];
    const mine = !p.by || p.by.toLowerCase() === c.me.toLowerCase();
    const s = signIn && mine ? c.signIn(signIn) : "in";
    const state: Place["state"] = p.state === "revoked" ? "revoked" : s !== "in" ? "red" : "ok";
    const count = c.count?.({ id: p.id, kind: p.kind, label: p.label }) ?? undefined;
    const kinds = Object.entries(routing).filter(([, to]) => to === p.id).map(([k]) => ({
      kind: k, label: THING_LABEL[k as ThingKind] ?? k, ...(count && NATIVE[k as ThingKind] === p.kind ? { n: count.n } : {}) }));
    const line = state === "revoked" ? `revoked · new ${kinds.length ? kinds.map((k) => k.label).join(", ") : "things"} go to Sol's record`
      : state === "red" ? `${s === "expired" ? "sign-in expired" : "signed out"}${p.touched ? ` · stopped ${ago(p.touched, now)}` : ""} · nothing is lost`
      : count ? `${count.n} ${count.unit}` : p.touched ? `touched ${ago(p.touched, now)}` : p.by && !mine ? `on ${p.by}'s sign-in` : "connected";
    return { id: p.id, kind: p.kind, label: p.label, name: PLACE_NAME[p.kind], ...(p.by ? { by: p.by } : {}), state, line,
      ...(signIn ? { signIn } : {}), ...(p.touched ? { touched: p.touched } : {}), ...(count ? { count } : {}), kinds, reach: reachOf(p.kind, p.label) };
  });
}

/** each kind's place: what the trail routed, else its natural place when the project has it, else the record (pure) */
export function routingOf(rec: PlacesRecord, c: Pick<Ctx, "seed">): Record<string, string> {
  const ids = new Set([...c.seed.map((s) => s.id), ...Object.keys(rec.places)]);
  const out: Record<string, string> = {};
  for (const k of THING_KINDS) { const n = NATIVE[k]; out[k] = ids.has(n) ? n : "record"; }
  for (const [k, to] of Object.entries(rec.routing)) if (KIND_ID.test(k) && ids.has(to)) out[k] = to;
  return out;
}

const overflowOf = (rec: PlacesRecord, places: Place[]): string => {
  const set = rec.places.record?.fields.overflow;
  const ok = (id: unknown) => typeof id === "string" && places.some((p) => p.id === id && p.id !== "record" && p.state !== "revoked");
  if (ok(set)) return set as string;
  return ["github", "drive", "folder"].find(ok) ?? "";
};

/** the whole picture for the face (pure but for ctx) */
export function viewOf(events: Ev[], c: Ctx): View {
  const rec = foldPlaces(events);
  const places = placesOf(rec, c), routing = routingOf(rec, c);
  const f = c.fullness?.() ?? null;
  const overflow = overflowOf(rec, places);
  const full = !!f && (f.frozen === true || f.used >= f.of);
  const record = f ? { used: f.used, of: f.of, unit: f.unit, high: f.used / (f.of || 1) >= 0.8, full, overflow,
    line: overflow ? `when full, files go to ${places.find((p) => p.id === overflow)?.name ?? overflow}` : "when full, new files wait until there is room" } : null;
  const next: Record<string, string> = {};
  for (const [k, to] of Object.entries(routing)) {
    const p = places.find((x) => x.id === to);
    let at = p && p.state !== "revoked" ? to : "record";
    if (at === "record" && full && overflow) at = overflow;
    next[k] = at;
  }
  const have = new Set(places.filter((p) => p.state !== "revoked").map((p) => p.kind));
  return { project: c.project, name: c.name, me: c.me, guest: c.role === "guest", places, routing, record, next,
    open: (["github", "drive", "calendar"] as PlaceKind[]).filter((k) => !have.has(k)) };
}

// ---- the writes: one trail event each, Undo for 8 s ----
export const UNDO_MS = 8000;
type Undo = { project: string; draft: Omit<Draft, "by" | "project">; until: number; line: string };
const undos = new Map<string, Undo>();
const GUEST = "a guest sees the places; the members change them";
const byOf = (c: Ctx, machine?: string) => ({ person: c.me, ...(machine ? { machine } : {}) });
const keep = (c: Ctx, e: Ev, back: Undo["draft"], line: string) => {
  const until = (c.now ?? Date.now)() + UNDO_MS;
  undos.set(e.id, { project: c.project, draft: back, until, line });
  return { token: e.id, until };
};

export type Wrote = { event: Ev; token: string; until: number; line: string };
export type Refused = { error: string };

/** a kind moved to another place: one `route` event. With others in the project the move is theirs too, so it waits
 *  for `agreed` and answers who agrees first (nothing written) */
export function reroute(t: TrailPort, c: Ctx, kind: string, to: string, o: { agreed?: boolean } = {}): Wrote | Refused | { ask: string[]; line: string } {
  if (c.role === "guest") return { error: GUEST };
  if (!KIND_ID.test(kind)) return { error: "which kind of thing?" };
  const events = t.since(c.project);
  const v = viewOf(events, c), p = v.places.find((x) => x.id === to);
  if (!p) return { error: "that place is not in this project" };
  if (p.state === "revoked") return { error: `${p.name} is revoked; connect it again first` };
  const prev = v.routing[kind] ?? "record";
  if (prev === to) return { error: `new ${THING_LABEL[kind as ThingKind] ?? kind} already go to ${p.name}` };
  const label = THING_LABEL[kind as ThingKind] ?? kind, was = v.places.find((x) => x.id === prev)?.name ?? prev;
  const line = `New ${label} go to ${p.name} now. What is already in ${was} stays there.`;
  const others = (c.others ?? []).filter((x) => x.toLowerCase() !== c.me.toLowerCase());
  if (others.length && !o.agreed) return { ask: others, line: `New ${label} go to ${p.name} for ${others.join(" and ")} too. Now they go to ${was}; what is already there stays there.` };
  const event = t.append({ project: c.project, by: byOf(c), kind: "route", item: kind, field: "place", value: to });
  return { event, ...keep(c, event, { kind: "route", item: kind, field: "place", value: prev }, `New ${label} go to ${was} again.`), line };
}

/** Sol no longer reads or writes in a place: one `place` event; the files stay where they are, its routing is kept */
export function revoke(t: TrailPort, c: Ctx, id: string): Wrote | Refused {
  if (c.role === "guest") return { error: GUEST };
  if (id === "record") return { error: "Sol's record is the project; it cannot be revoked" };
  const p = viewOf(t.since(c.project), c).places.find((x) => x.id === id);
  if (!p) return { error: "that place is not in this project" };
  if (p.state === "revoked") return { error: `${p.name} is already revoked` };
  const event = t.append({ project: c.project, by: byOf(c), kind: "place", item: id, value: { kind: p.kind, label: p.label, state: "revoked" } });
  return { event, ...keep(c, event, { kind: "place", item: id, value: { kind: p.kind, label: p.label, state: "on" } }, `${p.name} is connected again.`),
    line: `Revoked. Sol no longer reads or writes in ${p.label}. The files stay where they are.` };
}

/** the connect card's two pictures: what Sol will reach before the grant, and, after it, what it reaches now */
export function before(c: Ctx, kind: PlaceKind, label?: string): { place: { kind: PlaceKind; name: string; label: string }; reach: Reach; signIn?: "github" | "google"; signedIn: boolean } {
  const l = label?.trim() || (kind === "calendar" ? "the project's calendar" : kind === "drive" ? "a shared folder" : kind === "github" ? "a repository" : PLACE_NAME[kind]);
  const s = SIGN_IN[kind];
  return { place: { kind, name: PLACE_NAME[kind], label: l }, reach: reachOf(kind, l), ...(s ? { signIn: s } : {}), signedIn: s ? c.signIn(s) === "in" : true };
}

/** the grant: one `place` event once the sign-in is there (a revoked or red place connected again, or a new one) */
export function connect(t: TrailPort, c: Ctx, kind: PlaceKind, label?: string, machine?: string): (Wrote & { reach: Reach; place: Place }) | Refused | { signIn: "github" | "google" } {
  if (c.role === "guest") return { error: GUEST };
  if (!isKind(kind) || kind === "record") return { error: "which place?" };
  const s = SIGN_IN[kind];
  if (s && c.signIn(s) !== "in") return { signIn: s };
  const had = viewOf(t.since(c.project), c).places.find((x) => x.id === kind);
  const l = (label?.trim() || had?.label || before(c, kind).place.label).replace(/[\p{Cc}\p{Cf}]/gu, "").slice(0, 120);
  if (kind === "github" && !REPO.test(l)) return { error: "which repository? its owner/name" };
  const event = t.append({ project: c.project, by: byOf(c, machine), kind: "place", item: kind, value: { kind, label: l, by: c.me, state: "on" } });
  const back: Undo["draft"] = had ? { kind: "place", item: kind, value: { kind, label: had.label, ...(had.by ? { by: had.by } : {}), state: had.state === "revoked" ? "revoked" : "on" } }
    : { kind: "place", item: kind, value: { kind, label: l, state: "revoked" } };
  const place = viewOf(t.since(c.project), c).places.find((x) => x.id === kind)!;
  return { event, ...keep(c, event, back, `${PLACE_NAME[kind]} is as it was.`), line: `Connected ${PLACE_NAME[kind]}: Sol reads ${place.reach.reads[0]}${place.reach.writes.length ? `, writes ${place.reach.writes[0]}` : ", writes nothing"}.`, reach: place.reach, place };
}

/** where files go when the record is full: one `place` event on the record */
export function setOverflow(t: TrailPort, c: Ctx, to: string): Wrote | Refused {
  if (c.role === "guest") return { error: GUEST };
  const v = viewOf(t.since(c.project), c), p = v.places.find((x) => x.id === to);
  if (!p || p.id === "record" || p.state === "revoked") return { error: "files can overflow to a connected place only" };
  const was = foldPlaces(t.since(c.project)).places.record?.fields.overflow;
  const event = t.append({ project: c.project, by: byOf(c), kind: "place", item: "record", field: "overflow", value: to });
  return { event, ...keep(c, event, { kind: "place", item: "record", field: "overflow", value: typeof was === "string" ? was : "" }, "Where files go when full is as it was."),
    line: `When the record is full, new files go to ${p.name}.` };
}

/** an Undo pressed within 8 s: the write before it written again, one event; after that, refused */
export function undo(t: TrailPort, c: Ctx, token: string): { event: Ev; line: string } | Refused {
  const u = undos.get(token);
  if (!u || u.project !== c.project) return { error: "nothing to take back" };
  undos.delete(token);
  if ((c.now ?? Date.now)() > u.until) return { error: "too late to take back; change it again instead" };
  const event = t.append({ project: c.project, by: byOf(c), ...u.draft });
  return { event, line: u.line };
}
export const forgetUndos = () => undos.clear();

// ---- letting someone in: joining is not access, each place says it ----
export type Access = { place: string; name: string; label: string; can: "in" | "grant" | "ask"; ask?: string; line: string };
/** for one person: each place grants it here (I can), says who to ask, or is already theirs (pure but for `may`) */
export function letIn(v: View, person: string, may: (p: Place) => boolean): Access[] {
  return v.places.filter((p) => p.state !== "revoked").map((p) => {
    const base = { place: p.id, name: p.name, label: p.label };
    if (p.kind === "record" || p.kind === "calendar") return { ...base, can: "in" as const, line: `${person} sees it once they join` };
    if (p.kind === "folder") return { ...base, can: "ask" as const, ...(p.by ? { ask: p.by } : {}), line: `only on ${p.by && p.by.toLowerCase() !== v.me.toLowerCase() ? `${p.by}'s` : "your"} machine; nothing to grant` };
    if (p.state === "ok" && may(p)) return { ...base, can: "grant" as const, line: `you can let ${person} into ${p.label}` };
    const who = p.by && p.by.toLowerCase() !== v.me.toLowerCase() ? p.by : "";
    return { ...base, can: "ask" as const, ...(who ? { ask: who } : {}), line: who ? `ask ${who} for access` : p.state === "red" ? "sign in again first" : `ask the owner of ${p.label} for access` };
  });
}

/** a grant pressed: the place's own grant (deps) then one `place` event saying who is in */
export async function grant(t: TrailPort, c: Ctx, id: string, person: string, give: (p: Place, person: string) => Promise<string | null>): Promise<{ event: Ev; line: string } | Refused> {
  if (c.role === "guest") return { error: GUEST };
  if (!/^[A-Za-z0-9-]{1,39}$/.test(person)) return { error: "who? their GitHub name" };
  const p = viewOf(t.since(c.project), c).places.find((x) => x.id === id);
  if (!p || p.state !== "ok") return { error: "that place cannot grant now" };
  const no = await give(p, person);
  if (no) return { error: no };
  const event = t.append({ project: c.project, by: byOf(c), kind: "place", item: id, field: `in.${person.toLowerCase()}`, value: true });
  return { event, line: `${person} is let into ${p.label}.` };
}
