// The map's setup grown from what the team already is (#1661): no person, area or word typed in for one team. Behind the
// switch map.grown (settings.ts mapGrown); off, the map reads the project's hand-written setup as before (read.ts).
//   people    the team's members (team/members.ts: the org's, or the logins seen on the relay), the registry's owners and
//             the leads CODEOWNERS names, each with the name GitHub knows them by
//   layer 1   one outcome per person holding parts: the registry's top folders whose parts are mostly theirs; one for the
//             folders nobody holds; a Sol with no parts yet has one place, "Your work", so the map is never blank
//   words     views, Layers and each person's top three from rules that name nobody: their open calls, their PR pairs,
//             and one pin that asks their AI to shape the map with them
// What lays over it, key by key (any key a file has replaces the grown one): the project's own setup
// (.sol/cowork-map.json, a team that wrote one keeps it), then the person's own (~/.sol/map.json, written by their AI when
// they ask; an update never touches it). Pure: read.ts gathers the inputs.
import type { MapToggle, PinRule, Setup } from "./spec.js";

export type GrowInput = {
  /** the registry's parts: their id path and owner (a login) */
  parts: { id: string; owner?: string }[];
  /** the team's members, as logins */
  members: string[];
  /** each label's leads, read off CODEOWNERS (team/leads.ts) */
  leads: Record<string, string[]>;
  /** the login this engine reads as, "" when gh cannot say */
  me: string;
  /** the name GitHub knows a login by, where it has one */
  names?: Record<string, string>;
  /** where the person's own setup is, for the words that ask their AI to shape the map */
  own: string;
};

const LOGIN = /^[A-Za-z0-9-]{1,39}$/;
const low = (s: string) => s.toLowerCase();
/** the two outcomes no person is: an underscore is never in a GitHub login, so neither meets a person's id */
export const START = "_start", NOBODY = "_nobody";

const VIEWS: Setup["views"] = [
  { id: "change", name: "Change", kind: "change", default: true, question: "What moved, how, by whom, under whose ask?", why: "{shared} parts changed by 2+ people in {window} h ({changes} changes)" },
  { id: "court", name: "Your court", kind: "court", question: "What waits on me, and what moved on what I hold?", why: "{prs_day} open PRs and {calls_day} open calls moved in the last 24 h" },
  { id: "calls", name: "Calls", kind: "calls", question: "Which choices are open, whose are they, how long have they sat?", why: "{calls_all} open calls (issues labelled decision)" },
  { id: "clashes", name: "Clashes", kind: "clashes", question: "Where are two of us about to change the same thing?", why: "{pairs} pairs of two people's open PRs touch the same files; {shared} parts changed by 2+ people in {window} h" },
];
const TOGGLES: MapToggle[] = [
  { id: "live", name: "Live", what: "the jelly ring: moved in the last 3 h" },
  { id: "people", name: "People", what: "faces: by hand, their agent, an agent alone" },
  { id: "health", name: "Health", what: "notches: broken" },
  { id: "time", name: "Time", what: "the scrubber" },
];

/** the words a press hands the person's AI: what the map is grown from, and where their own changes go */
export const shapeAsk = (own: string) =>
  `Shape my Cowork map with me. It is grown from the team's members, the registry's owners and GitHub; anything I want different (who holds what, the names, the views, my top three) goes in my own setup, ${own}, as the keys of .sol/cowork-map.json I want to change. Ask me what to change first.`;

/** the setup grown from the team (pure) */
export function growSetup(g: GrowInput): Setup {
  // who: everyone the team's own records name, once each, by login
  const logins = new Map<string, string>();
  const add = (l?: string) => { const x = String(l ?? "").trim(); if (LOGIN.test(x) && !/\[bot\]$/i.test(x) && !logins.has(low(x))) logins.set(low(x), x); };
  [g.me, ...g.members, ...Object.values(g.leads).flat(), ...g.parts.map((p) => p.owner)].forEach(add);
  const ledBy = (id: string) => Object.entries(g.leads).filter(([, ls]) => ls.some((l) => low(l) === id)).map(([label]) => label).sort();
  const people: Setup["people"] = [...logins.values()].map((login, i) => {
    const full = g.names?.[login]?.trim(), led = ledBy(low(login));
    return { id: low(login), name: full ? full.split(/\s+/)[0] : login, set: (i % 5) + 1, logins: [login], ...(full ? { names: [full] } : {}), ...(led.length ? { holds: `Leads ${led.join(", ")}.` } : {}) };
  });
  if (!people.length) people.push({ id: "you", name: "You", set: 1, logins: [] });
  const idOf = (login?: string) => (login && logins.has(low(login)) ? low(login) : null);

  // layer 1: each top folder goes to whoever holds most of its parts; folders nobody holds stand together
  const tops = new Map<string, Map<string, number>>();
  for (const p of g.parts) {
    const top = p.id.split("/")[0], by = tops.get(top) ?? new Map<string, number>(), w = idOf(p.owner) ?? NOBODY;
    by.set(w, (by.get(w) ?? 0) + 1); tops.set(top, by);
  }
  const held = new Map<string, { areas: string[]; parts: number }>();
  for (const [top, by] of tops) {
    const [w] = [...by].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const h = held.get(w) ?? { areas: [], parts: 0 };
    h.areas.push(top); h.parts += [...by.values()].reduce((a, b) => a + b, 0); held.set(w, h);
  }
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const outcomes: Setup["outcomes"] = [...held].sort((a, b) => (a[0] === NOBODY ? 1 : b[0] === NOBODY ? -1 : b[1].parts - a[1].parts))
    .map(([w, h]) => w === NOBODY
      ? { id: NOBODY, name: "Held by nobody yet", holder: "", areas: h.areas.sort(), labels: [], means: "Parts in the registry whose owner is nobody on the team." }
      : { id: w, name: `What ${nameOf(w)} holds`, holder: w, areas: h.areas.sort(), labels: ledBy(w),
        means: `The registry's parts under ${h.areas.sort().join(", ")}, mostly ${nameOf(w)}'s.` });
  if (!outcomes.length) outcomes.push({ id: START, name: "Your work", holder: people[0].id, areas: [], labels: [], means: "Nothing is in this project's registry yet: your AI starts the map with you." });

  // each person's top three: their calls, their PR pairs, and the press that hands the map to their AI
  const home = (id: string) => ["o:" + (outcomes.find((o) => o.holder === id)?.id ?? outcomes[0].id)];
  const empty = outcomes[0].id === START;
  const pins: Record<string, PinRule[]> = {};
  for (const p of people) {
    const shape: PinRule = empty
      ? { kind: "say", at: home(p.id), view: "change", says: "Your map starts here: tell your AI who is on your team and what each of you holds", short: "start your map", press: "Ask your AI", why: "a new project: nothing in its registry yet", act: { talk: shapeAsk(g.own) } }
      : { kind: "say", at: home(p.id), view: "change", says: "This map grew from your team's members and GitHub; your AI changes it when you ask", short: "shape it", press: "Ask your AI", why: "grown, not written: nothing on it was typed for this team", act: { talk: shapeAsk(g.own) } };
    pins[p.id] = empty ? [shape] : [
      { kind: "calls", who: p.id, at: home(p.id), view: "calls", says: "{n} open calls are yours; {untouched} never touched since opened", short: "{n} calls yours", press: "Open #{oldest}", act: { issue: "{oldest}" }, why: "{n} of {calls_all} open calls are yours; {week} sat 7+ days" },
      { kind: "pairs", who: p.id, at: home(p.id), view: "clashes", says: "{n} pairs of your open PRs and a teammate's touch the same files", short: "{n} PR pairs", press: "See the clashes", act: { view: "clashes" }, why: "two people's open PRs on the same files, counted now" },
      shape,
    ];
  }
  return {
    people, outcomes, views: VIEWS, view_order: Object.fromEntries(people.map((p) => [p.id, VIEWS.map((v) => v.id)])), toggles: TOGGLES, pins,
    types: [{ id: "outcomes", name: "Outcomes", hint: "layer 1 by who holds it", roots: [] }, { id: "folders", name: "Folders", hint: "layer 1 as the registry files it", roots: [] }],
    room_skip: ["Clash predicted", "absorbed", "night job", "^Taking this"],
    about: { grown: "from the team's members, the registry's owners, CODEOWNERS and GitHub (team/map/grow.ts)", own: g.own },
  };
}

const str = (v: unknown) => typeof v === "string" && v.length > 0;
const strs = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** what one entry of each list must hold for build.ts to read it */
const FIT: Record<string, (x: unknown) => boolean> = {
  people: (x) => obj(x) && str(x.id) && str(x.name) && strs(x.logins),
  outcomes: (x) => obj(x) && str(x.id) && str(x.name) && typeof x.holder === "string" && strs(x.areas) && strs(x.labels),
  views: (x) => obj(x) && str(x.id) && str(x.name) && str(x.kind),
  toggles: (x) => obj(x) && str(x.id) && str(x.name),
  types: (x) => obj(x) && str(x.id) && str(x.name) && strs(x.roots),
  calls_by: (x) => obj(x) && str(x.who),
  skip: str, room_skip: str,
};
const pinFits = (x: unknown) => obj(x) && str(x.kind) && strs(x.at) && str(x.view) && typeof x.says === "string" && typeof x.press === "string";

/** a setup laid over another, key by key: what `over` has replaces what `base` has (pure). A list whose entries are
 *  not all the shape build.ts reads, an empty list of people, outcomes or views, and a key that is not one of the
 *  setup's are left out, so a hand-edited file cannot take the map down */
export function layOver(base: Setup, over: unknown): Setup {
  if (!obj(over)) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const [k, fits] of Object.entries(FIT)) {
    const v = over[k];
    if (!Array.isArray(v) || !v.every(fits)) continue;
    if (!v.length && (k === "people" || k === "outcomes" || k === "views")) continue;
    out[k] = v;
  }
  for (const k of ["moves", "names", "short", "about"]) if (obj(over[k])) out[k] = over[k];
  if (obj(over.view_order) && Object.values(over.view_order).every(strs)) out.view_order = over.view_order;
  if (obj(over.pins) && Object.values(over.pins).every((l) => Array.isArray(l) && l.every(pinFits))) out.pins = over.pins;
  return out as Setup;
}
