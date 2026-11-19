// Cowork's map as one file, `cowork-spec.json` (#1433, from the answer key mine/look/cowork/o1): what the face draws and
// nothing else. The face is a renderer of this shape; it names no person, outcome or view of its own. Three kinds of
// thing sit in it: the places (a tree of circles with their counts), the things on them (changes, open PRs, calls, PR
// pairs), and the reading of them (views, each person's order and pins, the Layers). The spec is built by build.ts from
// a team's setup (setup below: today ours, by hand in .sol/cowork-map.json; later the blind rules write it for any
// team) and the team's live records (MapInput).

/** a person or an agent; an agent acts for a person and is drawn in that person's colour, ringed */
export type MapPerson = {
  id: string; kind: "person" | "agent"; name?: string; set?: number; logins?: string[]; holds?: string; decides?: string[]; acts_for?: string; does?: string;
};
/** one circle at any layer: an outcome, an area, a group or a part, with what rolls up into it */
export type Place = {
  id: string; parent: string | null; name: string; short?: string; reg?: string; kids: string[];
  /** how much is there: the parts under it (size; never moves with the view) */
  parts: number;
  state?: string; owner?: string | null; holder?: string | null; about?: string;
  broken: number; prs: number[]; calls: number[];
  /** the night's predicted clash lines between two people, and by pair "a+b" */
  clash: number; pairs: Record<string, number>;
  /** two people's open PRs on the same files, and by pair */
  prClash: number; prPairs: Record<string, number>;
  /** an agent acting with nobody's ask (kept a ping, took an issue, the night) */
  alone: number;
};
/** one change in the window: who, how (by hand, or by their agent), its line, the parts it touched; ago in minutes */
export type MapChange = { h: string; ago: number; by: string; how: "hand" | "agent"; s: string; parts: string[] };
export type MapPr = { n: number; t: string; by: string; draft: boolean; idle: number; parts: string[] };
/** an open choice: whose it is, days idle, never touched since opened, the place it lives */
export type MapCall = { n: number; t: string; who: string; idle: number; untouched: boolean; home: string };
export type MapPair = { a: number; b: number; pair: string; files: number; first: string; parts: string[] };
/** how a view draws: the renderer knows these kinds the way a map knows terrain or transit; the spec picks which
 *  exist, their words and each person's order */
export type ViewKind = "change" | "court" | "calls" | "clashes" | "day" | "route";
export type MapView = {
  id: string; name: string; kind: ViewKind; question: string; why?: string; default?: boolean;
  /** the day: the place it is about, and the day as a clock (at, what, state) */
  focus?: string; clock?: { at: string; what: string; state: string; from?: string }[];
  /** the route: numbered stops through the places that hold them */
  stops?: { place: string; step: string; what: string }[];
};
/** a map type (Outcomes, Folders): which places stand at layer 1 */
export type MapType = { id: string; name: string; hint: string; roots: string[] };
/** a Layer the person turns on and off */
export type MapToggle = { id: "live" | "people" | "health" | "time"; name: string; what: string };
/** a numbered pin: a few words on the map, one press; `count` recounts it for the Time scrubber's window */
export type MapPin = {
  says: string; at: string[]; view: string; press: string; short: string; why: string;
  act?: { issue?: number; view?: string; talk?: string };
  count?: { by: string; under: string };
};
export type RoomLine = { who: string; how: "hand" | "agent"; i: number; t: string; b: string };
export type MapSpec = {
  what: string; made_by: string;
  /** the repository its issues and changes live in (owner/name), for a press that opens one */
  repo?: string;
  /** unix seconds the counts were read at, and the window in hours */
  now: number; window: number;
  /** which reads stopped at their cap (read.ts CAP), so the counts drawn from them may be short; absent when all read in full */
  cut?: { notes?: true; prs?: true; calls?: true };
  people: MapPerson[];
  places: Record<string, Place>;
  types: MapType[];
  /** a hand-laid layer 1 (place id → x, y on the 1000 × 640 map); a place not in it is packed */
  layout?: Record<string, [number, number]>;
  changes: MapChange[]; prs: MapPr[]; calls: MapCall[]; pairs: MapPair[];
  views: MapView[];
  view_order: Record<string, string[]>;
  toggles: MapToggle[];
  surface: Record<string, { default_view: string; top: MapPin[] }>;
  room: { lines: RoomLine[] };
  /** the shared format's words (units, layers, moving, change, not_yet), passed through for whoever reads the spec */
  about?: Record<string, unknown>;
};

// ---- what build.ts reads ----

/** a team's setup: who is who, what layer 1 is, the words, which views exist and what reaches each person's top */
export type Setup = {
  people: { id: string; name: string; set: number; logins: string[]; names?: string[]; holds?: string; decides?: string[] }[];
  outcomes: { id: string; name: string; holder: string; areas: string[]; labels: string[]; means?: string; xy?: [number, number] }[];
  /** a part filed under one area that lives in another outcome */
  moves?: Record<string, string>;
  skip?: string[];
  /** the name a person decides by, where the registry's name is the builder's */
  names?: Record<string, string>;
  short?: Record<string, string>;
  /** who an open call belongs to when its assignee does not say: by number, or a phrase in its title */
  calls_by?: { issues?: number[]; title?: string; who: string }[];
  types?: MapType[];
  views: (Omit<MapView, "clock"> & { clock?: ClockRule[] })[];
  view_order: Record<string, string[]>;
  toggles: MapToggle[];
  /** each person's top three, as kinds the builder counts; words are templates over the count's {vars} */
  pins: Record<string, PinRule[]>;
  /** a note that is a bot's housekeeping, as patterns over its body: never one of the room's lines */
  room_skip?: string[];
  about?: Record<string, unknown>;
};
/** an hour of the day: `hour` names its key in the project's rhythm (.sol/rhythm.json), `from` the registry record whose
 *  state it shows; a row with no record reads "not read"; `after` the record it runs on, so a release after a broken or
 *  unread night reads "unread" */
export type ClockRule = { what: string; hour?: string; at?: string; from?: string; after?: string };
export type PinRule = {
  kind: "calls" | "cross" | "broken" | "pairs" | "stale";
  at: string[]; view: string; says: string; short: string; press: string; why: string;
  who?: string; by?: string; into?: string; under?: string; with?: string; days?: number;
  act?: MapPin["act"];
};
/** the live records: the registry's parts, the changes git saw, the open PRs with their files, open issues, notes */
export type MapInput = {
  now: number;
  parts: { id: string; name: string; owner?: string; state: string; about?: string }[];
  changes: { sha: string; at: number; author: string; agent: boolean; subject: string; systems: string[] }[];
  prs: { number: number; title: string; author: string; draft: boolean; updated?: string; created?: string; body?: string; files?: string[]; parts?: string[] }[];
  issues: { number: number; title: string; labels: string[]; assignees: string[]; created: string; updated?: string; state?: string }[];
  notes: { number: number; at: string; author: string; body: string }[];
  /** the project's hours by name (.sol/rhythm.json), for the day's clock */
  rhythm?: Record<string, unknown>;
};
