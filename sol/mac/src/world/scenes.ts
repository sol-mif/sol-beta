// Build world's scenes (mine, 2026-11-12): what the one kept session of Sol holds at five moments of its day and inside
// four of its things, written for the dev page from the record (the orchestration note of 2026-11-11, the memory of
// 2026-11-12). Nothing here is read live: each line is a fact of that record, or says that nothing is set.
import type { Item } from "../work/useWork";
import type { Block, Kind, Place, State } from "../stage/model";
import door_ from "../../../mine/look/home/tour4/a-01-home-door.png";
import places_ from "../../../mine/look/home/tour4/a-03-places.png";
import reading_ from "../../../mine/look/home/tour4/a-05-reading.png";
import signing_ from "../../../mine/look/home/tour4/a-09-signing-in.png";
import tell_ from "../../../mine/look/home/tour4/a-37-tell-week.png";
import after_ from "../../../mine/look/home/tour4/a-45-home-after.png";
import tile_ from "../../../mine/look/home/tour4/a-50-tile-turned.png";
import sticky_ from "../../../mine/look/home/tour4/a-95-sticky-waits.png";

// a still is served by this page, not the engine: the stage reads a bare path as a file on the machine
const here = (s: string) => location.origin + s;
const door = here(door_), places = here(places_), reading = here(reading_), signing = here(signing_), tell = here(tell_), after = here(after_), tile = here(tile_), sticky = here(sticky_);

export type When = "night" | "morning" | "now" | "tonight" | "release";
/** the day's line: where each moment sits on it (0 to 1), its short name, and what it was */
export const STOPS: { id: When; x: number; name: string; say: string }[] = [
  { id: "night", x: 0.08, name: "Nov 11, 02:07", say: "the night started" },
  { id: "morning", x: 0.3, name: "Nov 11, 10:14", say: "you came back" },
  { id: "now", x: 0.6, name: "now", say: "" },
  { id: "tonight", x: 0.8, name: "tonight, 21:00", say: "the review" },
  { id: "release", x: 0.94, name: "tomorrow, 09:00", say: "the release" },
];
/** the five copies a thing of Sol passes through, in order; a thing's path is how many it has reached */
export const COPIES = ["drawn", "built", "in your Sol", "on main", "out"] as const;
export type Path = { reached: number; next: string };

export type Scene = {
  blocks: { b: Block; at?: Partial<Omit<Place, "id">> }[];
  /** the talk at this moment; left out, the talk stays as it was (going in changes the stage, never the talk) */
  items?: Item[];
  path?: Path;
  /** a block here that opens a level further in: its id, and the scene it opens */
  doors?: Record<string, string>;
  /** the name this scene has in the trail */
  name?: string;
};

const NOW = Date.now(), H = 3_600_000;
let n = 0;
const blk = (id: string, kind: Kind, title: string, body: unknown, state: State = "live"): Block => ({ id, kind, title, state, body, versions: [], sessions: ["sol"] });
const away = { folded: true }, ghost = { ghost: true };
const me = (text: string, ago: number): Item => ({ id: `m${++n}`, kind: "me", at: NOW - ago, text });
const you = (text: string): Item => ({ id: `y${++n}`, kind: "you", text });
const step = (description: string): Item => ({ id: `t${++n}`, kind: "tool", name: "Bash", input: { description, command: "" }, done: true, ok: true, at: NOW });

export const SCENES: Record<string, Scene> = {
  // ── now: one thing asks for the eye; the others are alive and put away by name ──
  now: {
    items: [
      me("let me know when home onboarding is ready for me again and then whats being built right now for build mode", 9 * 60_000),
      you("**Home's one look is ready for your try.** It is in your own Sol, not committed, and nobody has seen it in your window yet.\n\nThree other things are alive and none of them needs you: Build as one space, Build's sidebar, Cowork from nothing."),
    ],
    blocks: [
      { b: blk("home", "shots", "Home's one look", { stills: [{ name: "the door", src: door }, { name: "your places", src: places }, { name: "told back, the week", src: tell }, { name: "a sticky that waits", src: sticky }], ask: "try it in your window, then say how it felt" }, "waits") },
      { b: blk("space", "card", "Build as one space", { big: "in your Sol", sub: "the engine half is not built" }), at: away },
      { b: blk("side", "card", "Build's sidebar: hold it", { big: "in your Sol", sub: "not pushed" }), at: away },
      { b: blk("cowork", "card", "Cowork from nothing", { big: "drawn", sub: "PR #725" }), at: away },
    ],
    doors: { home: "now/home", space: "now/space", side: "now/side", cowork: "now/cowork" },
  },
  "now/home": {
    name: "Home's one look", path: { reached: 3, next: "your try" },
    blocks: [
      { b: blk("home.seen", "card", "seen where", { big: "not in your window yet", ok: false, sub: "walked on a made-up home with real turns on the NucBox · on this Mac only without a screen · LA245 is mid set-up, so it still shows the old one" }) },
      { b: blk("home.parts", "list", "what it is made of", { steps: [
        { t: "the door opens the finder", st: "done" }, { t: "a pick opens a real browser tab per place, a turn driving it", st: "done" },
        { t: "sign-in, wheel, file, app, then it tells back", st: "done" }, { t: "tiles in a folder that is set up", st: "done" },
        { t: "show me once becomes a sticky with \"do it\"", st: "done" }, { t: "the old Homes deleted", st: "done" },
        { t: "your try in your window", st: "wait" }, { t: "committed on your branch", st: "" }] }) },
      { b: blk("home.stills", "shots", "the tour, as it was walked", { stills: [{ name: "the door", src: door }, { name: "your places", src: places }, { name: "reading a place", src: reading }, { name: "signing in", src: signing }, { name: "told back, the week", src: tell }, { name: "Home after", src: after }, { name: "a tile turned", src: tile }, { name: "a sticky that waits", src: sticky }] }) },
      { b: blk("home.makers", "table", "who made it", { cols: ["maker", "where", "ended"], rows: [["builder a", "NucBox", "done"], ["builder b", "NucBox", "done"], ["builder c", "NucBox", "done"], ["builder d", "NucBox", "done"], ["the join", "NucBox, then this Mac", "one patch"]] }) },
    ],
    doors: { "home.makers": "now/home/join" },
  },
  "now/home/join": {
    name: "the join", path: { reached: 3, next: "your try" },
    items: [
      you("The join's own talk, as it ran on the NucBox. You read it here; a word you say goes to it through Sol's session."),
      step("Take builders a to d as one patch"), step("Apply it to your Sol's face"), step("Delete the old Homes and their links"), step("Load Home without a screen on this Mac"),
      you("Joined into your Sol, not committed. Home shows the door. LA245 is at step 3 of 6 of the old set-up, so it shows that, not tiles."),
    ],
    blocks: [
      { b: blk("join.left", "list", "what the join left open", { steps: [{ t: "downloads are not shown", st: "" }, { t: "\"every week\" cannot run by itself", st: "" }, { t: "the stage's Home artifact still keeps about 50 old files", st: "" }] }) },
      { b: blk("join.shot", "shots", "Home, after the join", { stills: [{ name: "the door", src: door }, { name: "Home after", src: after }] }) },
    ],
  },
  "now/space": {
    name: "Build as one space", path: { reached: 3, next: "your read in your window" },
    blocks: [
      { b: blk("space.parts", "list", "what it is made of", { steps: [
        { t: "a new session is the chat alone", st: "done" }, { t: "the stage comes with the first artifact, goes with the last", st: "done" },
        { t: "a run of steps is one plain line", st: "done" }, { t: "artifacts put away are written by name", st: "done" },
        { t: "the chat has three sizes", st: "done" }, { t: "Sol sets the stage each turn", st: "" }, { t: "the session list's sizes", st: "" }] }) },
      { b: blk("space.open", "card", "what waits", { big: "the engine half needs a builder", ok: false, sub: "on your word · Sol sets the stage each turn, one artifact sent per change" }) },
    ],
  },
  "now/side": {
    name: "Build's sidebar", path: { reached: 3, next: "the cowork mark" },
    blocks: [
      { b: blk("side.parts", "list", "what it is made of", { steps: [
        { t: "at rest: what needs you, pinned, active", st: "done" }, { t: "folders are chips with a count", st: "done" },
        { t: "artifacts and every session at its foot", st: "done" }, { t: "the rail: two trays of glass", st: "done" },
        { t: "the cowork mark reads weakest", st: "" }, { t: "a stored one-line recap per session (#1066)", st: "" }] }) },
    ],
  },
  "now/cowork": {
    name: "Cowork from nothing", path: { reached: 1, next: "your read of the team page" },
    blocks: [
      { b: blk("cowork.parts", "list", "what is drawn", { steps: [
        { t: "one playable page, three concepts", st: "done" }, { t: "what Notion, Linear, Slack, Basecamp and Asana got right", st: "done" },
        { t: "49 team moments as three windows", st: "done" }, { t: "your read and pick", st: "wait" }, { t: "Frank, on hold (#724)", st: "" }] }) },
    ],
  },
  // ── the past: the stage as it stood, with the talk of that hour ──
  night: {
    items: [me("go as planned, start the night", 31 * H), you("Started at 02:03. Six builders, four on the Legion and two on the NucBox. Merges go one by one, each on the head that was checked. When you wake it is in your own Sol to try.")],
    blocks: [
      { b: blk("n.parts", "list", "the night, six builders", { steps: [
        { t: "the one session · NucBox", st: "half" }, { t: "Home's walk · NucBox", st: "half" }, { t: "the walk's fixes · Legion", st: "half" },
        { t: "the new feel, its own draft · Legion", st: "half" }, { t: "#974 fitted onto main · Legion", st: "half" }, { t: "four random reds · Legion", st: "half" }] }, "working") },
      { b: blk("n.merge", "table", "merging, on checked heads", { cols: ["PR", "state"], rows: [["#945 the new Build", "merged 01:41"], ["#998 eight fixes", "checks running"], ["#991 a random red", "checks running"], ["#974 Build follows its design", "being fitted"]] }) },
    ],
  },
  morning: {
    items: [me("what is everything that happened over night, what got done, what's still left", 23 * H), you("**16 merged, and four things are in your own Sol to try.** Three things broke in the night and were gone around; none of them is yours to fix.")],
    blocks: [
      { b: blk("m.try", "list", "to try in your own Sol", { steps: [{ t: "the one session", st: "wait" }, { t: "Home's walk", st: "wait" }, { t: "the sorted sidebar", st: "wait" }, { t: "pieces that snap", st: "wait" }] }, "waits") },
      { b: blk("m.done", "card", "merged", { big: "16 merged", ok: true, sub: "each on its checked head · your Sol renewed at 10:09" }) },
      { b: blk("m.broke", "table", "what broke, and the way around", { cols: ["when", "what", "the way around"], rows: [["02:43", "the NucBox's sign-in ended", "its two builders went on, on the Legion"], ["04:40", "the NucBox's /tmp was full", "cleaned, the checks ran again"], ["05:06", "the Legion refused for 3 min", "came back by itself"]] }) },
    ],
  },
  // ── what is to come: only what is set; nothing is written that nobody asked for ──
  tonight: {
    items: [you("Nothing is set for tonight yet. Say what should exist when you are back, and it stands here before you leave.")],
    blocks: [
      { b: blk("t.hand", "card", "hand in, by 20:00", { big: "nothing handed in yet", sub: "Home's one look is not committed" }), at: ghost },
      { b: blk("t.review", "card", "the review, 21:00", { big: "reads what was handed in" }), at: ghost },
    ],
  },
  release: {
    items: [you("The 09:00 release carries main as it stands tonight. Nothing of today's four things is on main.")],
    blocks: [
      { b: blk("r.rel", "card", "the release, 09:00", { big: "main, as it stands", sub: "to the NucBox, then your Update on this Mac" }), at: ghost },
    ],
  },
};
