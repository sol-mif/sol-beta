// What each clean-Home part says about itself, once, beside its code (the design root, sol/design/root.md, #599): the
// only hand-written fact about the face. sol/design/atlas/build.mjs draws the atlas from these; the stills run shoots
// every state; break.mjs makes a nasty path per state. The gate's lint refuses a clean-Home component without one.
// A file's `meta` is keyed by its components' names, written as a plain literal (`export const meta = { … } satisfies
// Metas;`) so the atlas can read it without building the face.

/** the ten flows (sol/design/atlas/flows.json): what a person is trying to do */
export type FlowId = "say" | "pickup" | "call" | "answer" | "know" | "mine" | "show" | "team" | "meet" | "away";

/** one press a part answers: the key or the gesture, what it does, and where it leads */
export type Press = {
  press: string;
  does: string;
  /** the flow's goal this press reaches */
  goal?: FlowId;
  /** the part this press opens (a press on the way to a goal) */
  opens?: string;
  /** the same move as the goal's one required road, only faster; never needed (the root's last constraint) */
  faster?: true;
};

export type Meta = {
  /** the one job it does, in one line */
  job: string;
  /** the flow it serves */
  flow: FlowId;
  /** every state it can be in; each one gets a still and a nasty path */
  states: string[];
  keys: Press[];
  /** what it listens to: the engine's events, the stores, the window */
  listens: string[];
};
export type Metas = Record<string, Meta>;

// ---- the record (#630, freeform #629): what a generated thing says about itself ----
// A thing a person's AI made carries the same Meta a part of ours carries, plus what only a generated thing has: its ask,
// verbatim; the contract it was made under; the data it reads and writes; its versions beside each other. It lives in
// the home, never on main: `sol/home/things/<id>/record.json` (this type without `ask`), `ask.md` (the ask, verbatim),
// `v1.html`, `v2.html`… The frame (frameRules.ts) renders it; the atlas (sol/design/atlas/build.mjs) draws it beside ours.

/** the places of the frame: a thing renders only inside one the face has declared */
export type FramePlace = "pane" | "card" | "sheet" | "notch";
export const FRAME_PLACES: readonly FramePlace[] = ["pane", "card", "sheet", "notch"];
/** the functional colours (#634, the meaning channel): contract names with fixed values in tokens.json; a thing may read
 *  them and never set them */
export const FIXED_COLOURS = ["error", "write", "live"] as const;

/** one version of a thing: its file beside the others, and the contract it was made under; `engine` names its engine
 *  half beside it (#633), else engine.ts or engine.js beside the record is every version's */
export type ThingVersion = { v: number; file: string; at: string; contract: number; engine?: string };

export type ThingRecord = Meta & {
  /** the folder's name under sol/home/things */
  id: string;
  /** the name in its title row */
  title: string;
  /** the place it asks to stand in */
  place: FramePlace;
  /** the ask, verbatim (ask.md) */
  ask: string;
  /** the contract number (sol/design/system/tokens.json) it was made under */
  contract: number;
  /** the data it reads and writes, declared: its engine half's every read and write passes the gate on them (#633),
   *  and a write the frame shows */
  reads: string[];
  writes: string[];
  versions: ThingVersion[];
  /** the version shown */
  current: number;
  /** set at the first start after a release (#634, engine/src/release.ts) when the thing could not be carried to the
   *  contract now: why, and which contract; its last working version stays on screen until it is remade */
  remake?: { why: string; contract: number; at: string };
};
