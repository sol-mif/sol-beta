// Cowork v3, slice 5 (fr-30, #558): joining a project by link (the prototype's CW.joinLink, CW.letIn, the arrivals).
// An owner makes a link: a secret token per project, expiring (7 days unless said), for a role (editor unless said).
// The trail keeps only the token's hash (`join.link`), never the token. Whoever opens the link asks in (`join.asked`,
// written by them); opening it is not access. The owner lets them in with one press: one `member` event { role, in },
// and from then they count in the project. What they see first is drawn per role: an owner the setup, an editor three
// things (what it is, how things get in and out, what their agent may do), a guest what it is, view only, no agent.
import { createHash, randomBytes } from "node:crypto";
import { ensureOwner, inProject, lastMemberAt, recordOf, roleOf, ROLES, type By, type Ev, type Port, type Rec, type Role } from "./port5.js";
import { dateAfter } from "./standing.js";
import { CORE, PLACE_NAME, ROOM_NAME, shapeOf } from "./setup.js";

export const LINK_TTL = 7 * 24 * 3600_000;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const val = (e: Ev): Record<string, unknown> => (e.value && typeof e.value === "object" && !Array.isArray(e.value) ? e.value as Record<string, unknown> : {});
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const PROJECT = /^[A-Za-z0-9][\w.-]{0,79}$/;
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

/** the link a person is given: sol://join?project=<id>&t=<token> */
export const urlOf = (project: string, token: string) => `sol://join?project=${encodeURIComponent(project)}&t=${token}`;
/** a link read back, or null when it is not one Sol wrote (pure) */
export function parseLink(url: unknown): { project: string; token: string } | null {
  if (typeof url !== "string" || url.length > 300) return null;
  let u: URL;
  try { u = new URL(url.trim()); } catch { return null; }
  if (u.protocol !== "sol:" || u.hostname !== "join") return null;
  const project = u.searchParams.get("project") ?? "", token = u.searchParams.get("t") ?? "";
  return PROJECT.test(project) && TOKEN.test(token) ? { project, token } : null;
}

type Link = { id: string; hash: string; role: Role; until: number; by: string; revoked: boolean };
function linksOf(evs: Ev[]): Link[] {
  const ls = new Map<string, Link>();
  for (const e of evs) {
    const v = val(e);
    if (e.kind === "join.link" && e.item) ls.set(e.item, { id: e.item, hash: str(v.hash), role: ROLES.includes(v.role as Role) ? v.role as Role : "editor", until: Number(v.until) || 0, by: e.by.person, revoked: false });
    else if (e.kind === "join.revoked" && e.item && ls.has(e.item)) ls.get(e.item)!.revoked = true;
  }
  return [...ls.values()];
}

/** an owner's link for a project: the token once (the trail keeps its hash), until when, for which role */
export function makeLink(port: Port, o: { project: string; by: By; role?: Role; ttl?: number; now?: number }): { url: string; token: string; until: number; role: Role; id: string } | { error: string } {
  ensureOwner(port, o.project, o.by);
  if (roleOf(recordOf(port.since(o.project)), o.by.person) !== "owner") return { error: "only an owner makes the join link" };
  const role: Role = o.role && ROLES.includes(o.role) && o.role !== "owner" ? o.role : "editor";
  const token = randomBytes(18).toString("base64url"), hash = sha(token), until = (o.now ?? Date.now()) + Math.max(60_000, Math.min(o.ttl ?? LINK_TTL, 30 * 24 * 3600_000));
  const e = port.append({ project: o.project, by: o.by, kind: "join.link", item: `j-${hash.slice(0, 16)}`, value: { hash, role, until } });
  return { url: urlOf(o.project, token), token, until, role, id: e.item! };
}

/** the link opened by the person it was for: they ask in (one event, theirs), or are told why not */
export function openLink(port: Port, o: { url: string; by: By; name?: string; now?: number }): { asked: true; project: string; role: Role } | { already: Role; project: string } | { error: string } {
  const l = parseLink(o.url);
  if (!l) return { error: "that is not a join link Sol made" };
  const evs = port.since(l.project), rec = recordOf(evs), hash = sha(l.token);
  const link = linksOf(evs).find((x) => x.hash === hash);
  if (!link) return { error: "this link is not for a project this Sol can see yet: ask for it again" };
  const role = roleOf(rec, o.by.person);
  if (role) return { already: role, project: l.project };
  if (link.revoked) return { error: `this link was taken back: ask ${link.by} for a new one` };
  if ((o.now ?? Date.now()) > link.until) return { error: `this link has expired: ask ${link.by} for a new one` };
  if (!waitingOf(evs).some((w) => same(w.who, o.by.person)))
    port.append({ project: l.project, by: o.by, kind: "join.asked", item: `ja-${o.by.person.toLowerCase()}`, value: { link: link.id, role: link.role, ...(o.name ? { name: o.name.slice(0, 80) } : {}) } });
  return { asked: true, project: l.project, role: link.role };
}

/** who opened a link and waits for an owner's press (pure) */
export function waitingOf(evs: Ev[]): { who: string; role: Role; name?: string; at: number }[] {
  const rec = recordOf(evs), out = new Map<string, { who: string; role: Role; name?: string; at: number }>();
  for (const e of evs) if (e.kind === "join.asked") { const v = val(e); out.set(e.by.person.toLowerCase(), { who: e.by.person, role: ROLES.includes(v.role as Role) ? v.role as Role : "editor", ...(v.name ? { name: str(v.name) } : {}), at: e.at }); }
  return [...out.values()].filter((w) => !roleOf(rec, w.who));
}

/** the owner's one press: the person is in, in the role the link said (or the one the card says) */
export function letIn(port: Port, o: { project: string; who: string; by: By; role?: Role }): { member: { who: string; role: Role }; count: number; event: Ev } | { error: string } {
  const evs = port.since(o.project), rec = recordOf(evs);
  if (roleOf(rec, o.by.person) !== "owner") return { error: "only an owner lets someone in" };
  const w = waitingOf(evs).find((x) => same(x.who, o.who));
  if (!w) return roleOf(rec, o.who) ? { error: `${o.who} is in already` } : { error: `${o.who} has not opened the join link` };
  const role: Role = o.role && ROLES.includes(o.role) ? o.role : w.role;
  const event = port.append({ project: o.project, by: o.by, kind: "member", item: w.who, value: { role, in: true, letInBy: o.by.person }, ...dateAfter(lastMemberAt(evs)) });
  return { member: { who: w.who, role }, count: inProject(recordOf(port.since(o.project))).length, event };
}

/** what an editor's agent may do here (the prototype's agentMay) */
export const AGENT_MAY: Record<Role, string[]> = { owner: ["post facts", "hand things in", "ask for a read", "set up"], editor: ["post facts", "hand things in", "ask for a read"], guest: [] };

export type Arrival =
  | { role: "owner"; title: string; rooms: string[]; presses: string[] }
  | { role: "editor"; title: string; three: { k: string; v: string; marks?: string[] }[] }
  | { role: "guest"; title: string; what: string; faces: string[]; line: string }
  | { role: null; title: string; line: string };
/** the first look at a project, per role (pure) */
export function arrivalOf(rec: Rec, role: Role | null, name: string): Arrival {
  const what = str(rec.settings.project.what, `${name}: what it is, in its owners' words, once they say it in Setup.`);
  if (role === "owner") return { role, title: "The setup", rooms: [...CORE, ...shapeOf(rec).rooms.map((r) => ROOM_NAME[r] ?? r)], presses: ["Yes", "Change"] };
  if (role === "editor") {
    const places = shapeOf(rec).places;
    return { role, title: `Welcome to ${name}`, three: [
      { k: "What it is", v: what },
      { k: "How things get in and out", v: places.length ? "on a card; one press undoes" : "on a card, into Sol's record; one press undoes", marks: places.map((p) => p.kind) },
      { k: "What my agent may do", v: AGENT_MAY.editor.join(" · ") },
    ] };
  }
  if (role === "guest") return { role, title: `Welcome to ${name}`, what, faces: inProject(rec).map((m) => m.who), line: "view only, no agent" };
  return { role: null, title: name, line: "waiting for an owner to let you in" };
}
/** a person's own arrival, and the three as stills (the owner's setup page shows them, the reader's own lifted) */
export function arrivals(port: Port, o: { project: string; who: string; name: string }): { you: Arrival; stills: Arrival[]; members: { who: string; role: Role }[] } {
  const rec = recordOf(port.since(o.project));
  return { you: arrivalOf(rec, roleOf(rec, o.who), o.name), stills: ROLES.map((r) => arrivalOf(rec, r, o.name)), members: inProject(rec) };
}
export { PLACE_NAME };
