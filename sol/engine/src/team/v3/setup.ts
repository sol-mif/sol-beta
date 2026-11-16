// Cowork v3, slice 5 (fr-30, #558): setup by conversation (the prototype's rooms-people.js "SETUP AND ARRIVAL"). The
// agent at hand, opened large, asks "tell me about your project" with four starts (a family, two founders, a class, a
// bakery); then where the files and dates live; then proposes the project's shape one card at a time, Yes / Not this.
// The conversation is a pure function of what was said, so the face can draw it again at any time; only a Yes writes:
// the project's shape as events — a room is the project's setting `rooms`, a place is a `place` (to connect: Places
// signs in on its own page) with the `route` of the kinds that go to it, an automation an `automation` owned by whoever
// said yes. "Start like X" copies X's shape (rooms, places, routing, automations, the team and project settings) and
// never its items, loose things, artifacts, members or Talk.
import { ensureOwner, recordOf, roleOf, type By, type Ev, type Port, type Rec } from "./port5.js";

export type StartKey = "family" | "founders" | "class" | "bakery" | "dev" | "plain";
export type Proposal = { key: StartKey; rooms: string[]; places: string[]; autos: string[] };
export const PROPOSALS: Record<StartKey, Proposal> = {
  family: { key: "family", rooms: ["places", "artifacts"], places: ["drive", "calendar"], autos: ["Week ahead · Sundays 19:00"] },
  founders: { key: "founders", rooms: ["automations", "places", "artifacts"], places: ["drive", "email", "chat"], autos: ["Investor update · the 1st"] },
  class: { key: "class", rooms: ["places", "artifacts"], places: ["calendar", "drive"], autos: ["Monday letter home · weekdays 8:00"] },
  bakery: { key: "bakery", rooms: ["places", "artifacts"], places: ["figma", "drive"], autos: ["Friday summary"] },
  dev: { key: "dev", rooms: ["automations", "places", "artifacts", "dev"], places: ["github", "drive", "calendar"], autos: ["The dev night · 21:00", "Friday summary"] },
  plain: { key: "plain", rooms: ["places", "artifacts"], places: ["drive"], autos: ["Friday summary"] },
};
/** the four ways in: a press each, its words the answer */
export const STARTS: { key: StartKey; label: string; words: string }[] = [
  { key: "family", label: "A family", words: "A family keeping track of school" },
  { key: "founders", label: "Two founders", words: "Two founders and a launch" },
  { key: "class", label: "A class", words: "A class and its teacher, one term" },
  { key: "bakery", label: "A bakery", words: "A bakery and the studio making its identity" },
];
export const FILES: Record<StartKey, string> = { family: "Google Drive and the family calendar", founders: "Drive, a shared inbox and Discord",
  class: "The class calendar and a shared Drive", bakery: "Figma for the work, Drive for the archive", dev: "GitHub for code, a shared Drive, one calendar", plain: "Google Drive" };
export const ROOM_NAME: Record<string, string> = { automations: "Automations", places: "Places", artifacts: "Artifacts", dev: "The dev bundle" };
export const ROOM_WHY: Record<string, string> = { automations: "things that run on their own, on a rhythm", places: "where your files and dates already live",
  artifacts: "what you make together, in one shelf", dev: "pull requests, versions and the night review" };
export const PLACE_NAME: Record<string, string> = { drive: "Google Drive", calendar: "Calendar", email: "Email", chat: "Discord", figma: "Figma", github: "GitHub", record: "Sol's record" };
/** the kinds of thing that go to a place once it is in (the routing a Yes writes, when nothing routes that kind yet) */
export const ROUTES_TO: Record<string, string[]> = { drive: ["documents"], calendar: ["dates"], email: ["mail"], figma: ["designs"], github: ["code"], chat: [] };
export const CORE = ["Space and Plan", "Talk", "People", "Running"];

/** the shape the words point at (pure) */
export function propose(text: string): Proposal {
  const t = text.toLowerCase();
  const p = /family|kid|parent/.test(t) ? "family" : /class|teacher|term|pupil/.test(t) ? "class" : /bak|studio|identity|shop|client/.test(t) ? "bakery"
    : /launch|founder|startup|invest|company/.test(t) ? "founders" : /app|code|build|dev|github|software/.test(t) ? "dev" : /school/.test(t) ? "family" : "plain";
  return { ...PROPOSALS[p], rooms: [...PROPOSALS[p].rooms], places: [...PROPOSALS[p].places], autos: [...PROPOSALS[p].autos] };
}

/** a project's shape: what start like copies and what the cards show as already in (pure) */
export type Shape = { rooms: string[]; places: { kind: string; label: string }[]; routing: Record<string, string>;
  automations: { name: string; when: string; words: string }[]; settings: { team: Record<string, unknown>; project: Record<string, unknown> } };
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
export function shapeOf(rec: Rec): Shape {
  const rooms = Array.isArray(rec.settings.project.rooms) ? rec.settings.project.rooms.map(String) : [];
  return {
    rooms,
    places: Object.values(rec.places).filter((p) => !p.fields.revoked).map((p) => ({ kind: str(p.fields.kind, p.id), label: str(p.fields.label, PLACE_NAME[p.id] ?? p.id) })),
    routing: { ...rec.routing },
    automations: Object.values(rec.automations).map((a) => ({ name: str(a.fields.name, a.id), when: str(a.fields.when), words: str(a.fields.words) })),
    settings: { team: { ...rec.settings.team }, project: { ...rec.settings.project } },
  };
}

export type Card = { id: string; kind: "room" | "place" | "automation"; name: string; why: string; state?: "in" | "not" };
export type Press = { label: string; words?: string; act?: "yesAll" | "change" };
export type Turn = { step: number; say: string; presses: Press[]; cards?: Card[] };
const autoName = (a: string) => a.split(" · ")[0];
const autoWhen = (a: string) => a.split(" · ")[1] ?? "every Friday 16:00";

/** the conversation after what was said: the agent's next line, its presses, and the cards once it has heard enough
 *  (pure). `like` is the shape of the project it starts like; `now` the project's own shape (what is already in) */
export function converse(said: string[], o: { now?: Shape; like?: { name: string; shape: Shape } } = {}): Turn {
  const words = said.map((s) => s.trim()).filter(Boolean);
  if (words.length === 0) {
    const say = o.like ? `Shaped like ${o.like.name}: where new things go is copied, and its rooms come up as cards. Who is in it, and what are you making together?`
      : "Tell me about your project. Who is in it, and what are you making together?";
    return { step: 0, say, presses: STARTS.map((s) => ({ label: s.label, words: s.words })) };
  }
  const prop = propose(words.join(" "));
  if (words.length === 1) return { step: 1, say: "Where do your files and dates live today?", presses: [{ label: FILES[prop.key], words: FILES[prop.key] }] };
  if (o.like) prop.rooms = [...new Set([...prop.rooms, ...o.like.shape.rooms.filter((r) => ROOM_NAME[r])])];
  // what was said after the cards: a room or a place named is added, or taken off with "no", "without", "not", "drop"
  const not = new Set<string>();
  for (const w of words.slice(2)) {
    const t = w.toLowerCase(), no = /\b(no|without|drop|not)\b/.test(t);
    for (const r of Object.keys(ROOM_NAME)) if (t.includes(ROOM_NAME[r].toLowerCase().replace("the ", ""))) { if (no) not.add(`r:${r}`); else if (!prop.rooms.includes(r)) prop.rooms.push(r); }
    for (const k of Object.keys(PLACE_NAME)) if (k !== "record" && (t.includes(PLACE_NAME[k].toLowerCase().split(" ").pop()!) || t.includes(k))) { if (no) not.add(`p:${k}`); else if (!prop.places.includes(k)) prop.places.push(k); }
  }
  const now = o.now;
  const card = (c: Card): Card => {
    const isIn = c.kind === "room" ? now?.rooms.includes(c.id.slice(2)) : c.kind === "place" ? now?.places.some((p) => p.kind === c.id.slice(2)) : now?.automations.some((a) => a.name === autoName(c.id.slice(2)));
    return isIn ? { ...c, state: "in" } : not.has(c.id) ? { ...c, state: "not" } : c;
  };
  const cards = [
    ...prop.rooms.map((r) => card({ id: `r:${r}`, kind: "room", name: ROOM_NAME[r] ?? r, why: ROOM_WHY[r] ?? "" })),
    ...prop.places.map((k) => card({ id: `p:${k}`, kind: "place", name: PLACE_NAME[k] ?? k, why: now?.places.some((p) => p.kind === k) ? "in · to connect: you sign in on its own page" : "you sign in on its own page" })),
    ...prop.autos.map((a) => card({ id: `a:${a}`, kind: "automation", name: autoName(a), why: `${a.includes(" · ") ? `${autoWhen(a)} · ` : ""}your agent, up to $1 a month` })),
  ];
  const changed = words.length > 2;
  return { step: 2, say: changed ? "Changed, on the cards. Yes to all now?" : "Here is what I would set up, one card each. Yes or Not this on each, or Yes to all.",
    presses: [{ label: "Yes to all", act: "yesAll" }, { label: "Change", act: "change" }], cards };
}

function mayShape(port: Port, project: string, by: By): string {
  ensureOwner(port, project, by);
  const role = roleOf(recordOf(port.since(project)), by.person);
  return role === "owner" ? "" : "only an owner sets up the project";
}

/** one card said yes to: its piece of the shape written as events (none when it is in already) */
export function yes(port: Port, o: { project: string; card: string; by: By }): { events: Ev[] } | { error: string } {
  const no = mayShape(port, o.project, o.by);
  if (no) return { error: no };
  const kind = o.card.slice(0, 2), v = o.card.slice(2);
  const rec = recordOf(port.since(o.project)), now = shapeOf(rec), out: Ev[] = [];
  const P = { project: o.project, by: o.by };
  if (kind === "r:") {
    if (!/^[a-z][a-z-]{0,30}$/.test(v)) return { error: "which room?" };
    if (!now.rooms.includes(v)) out.push(port.append({ ...P, kind: "setting", item: "project", field: "rooms", value: [...now.rooms, v] }));
  } else if (kind === "p:") {
    if (!PLACE_NAME[v] || v === "record") return { error: "which place?" };
    if (!now.places.some((p) => p.kind === v)) out.push(port.append({ ...P, kind: "place", item: v, value: { kind: v, label: PLACE_NAME[v], state: "to connect", by: o.by.person } }));
    for (const what of ROUTES_TO[v] ?? []) if (!rec.routing[what]) out.push(port.append({ ...P, kind: "route", item: what, field: "place", value: v }));
  } else if (kind === "a:") {
    const name = autoName(v).trim().slice(0, 80);
    if (!name) return { error: "which automation?" };
    if (!now.automations.some((a) => a.name === name)) out.push(port.append({ ...P, kind: "automation", item: `au-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}`,
      value: { name, when: autoWhen(v), words: v, owner: o.by.person, on: true, flow: [{ part: "when", label: autoWhen(v) }, { part: "send", label: "Talk › general" }] } }));
  } else return { error: "which card?" };
  return { events: out };
}

/** Yes to all: every card not said Not this to */
export function yesAll(port: Port, o: { project: string; cards: string[]; by: By }): { events: Ev[] } | { error: string } {
  const out: Ev[] = [];
  for (const c of o.cards) { const r = yes(port, { project: o.project, card: c, by: o.by }); if ("error" in r) return r; out.push(...r.events); }
  return { events: out };
}

/** start like X: X's shape copied into the project, never its items, loose things, artifacts, members or Talk. Places
 *  come as links to connect again (a grant is a person's, never copied); automations come off, owned by whoever copies */
export function startLike(port: Port, o: { project: string; like: string; by: By }): { events: Ev[]; shape: Shape } | { error: string } {
  if (o.like === o.project) return { error: "a project cannot start like itself" };
  const no = mayShape(port, o.project, o.by);
  if (no) return { error: no };
  const src = recordOf(port.since(o.like));
  if (!roleOf(src, o.by.person)) return { error: "you are not in that project, so its shape is not yours to copy" };
  const from = shapeOf(src), here = shapeOf(recordOf(port.since(o.project))), P = { project: o.project, by: o.by }, out: Ev[] = [];
  const plain = (s: Record<string, unknown>) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== "name" && k !== "what"));
  if (Object.keys(from.settings.team).length) out.push(port.append({ ...P, kind: "setting", item: "team", value: from.settings.team }));
  const project = { ...plain(from.settings.project), rooms: [...new Set([...here.rooms, ...from.rooms])] };
  if (project.rooms.length || Object.keys(project).length > 1) out.push(port.append({ ...P, kind: "setting", item: "project", value: project }));
  for (const p of from.places) if (!here.places.some((x) => x.kind === p.kind)) out.push(port.append({ ...P, kind: "place", item: p.kind, value: { kind: p.kind, label: p.label, state: "to connect", by: o.by.person, copiedFrom: o.like } }));
  for (const [what, place] of Object.entries(from.routing)) if (here.routing[what] !== place) out.push(port.append({ ...P, kind: "route", item: what, field: "place", value: place }));
  for (const a of from.automations) if (!here.automations.some((x) => x.name === a.name))
    out.push(port.append({ ...P, kind: "automation", item: `au-${a.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "copied"}`,
      value: { name: a.name, when: a.when, words: a.words, owner: o.by.person, on: false, copiedFrom: o.like } }));
  return { events: out, shape: shapeOf(recordOf(port.since(o.project))) };
}
