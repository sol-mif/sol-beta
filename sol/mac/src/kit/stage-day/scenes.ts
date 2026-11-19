// The day's scenes, in order (#1245, item 1): one playable Sol, every surface in the order of a day, one window, one
// system. Pure data (its one import a type, the jelly's act names from body/role.ts), so stage-day.tsx draws from it
// and sol/design/system/day.mjs and pack.html read it under plain node. `rules` are rules.md's numbers each scene
// stands on; `role` the jelly's acts in it (body/role.ts), in the order they play; `beats` how long it plays to its
// end state, in pours (850 ms, frame.tsx's beat); `still` a middle step worth its own shot, beside the end state every
// scene is shot at.
import type { Act } from "../../body/role.ts";

export type SceneName = "arrival" | "home" | "build" | "call" | "cowork" | "customize" | "evening";
/** the moments nobody plans, that any day in Sol also holds (#1245, the second run): the strip's "also", after the seven */
export type AlsoName = "broke" | "waiting" | "dropped" | "empty" | "first" | "small";
export type SceneInfo = { name: SceneName | AlsoName; title: string; what: string; rules: readonly number[]; role: readonly Act[]; beats: number; still?: number };

export const SCENES: readonly SceneInfo[] = [
  { name: "arrival", beats: 3.6, still: 0, title: "Arrival", role: ["arrive", "point"], rules: [1, 2, 26, 31, 34, 38],
    what: "The jelly arrives in the notch; the window opens on the desk with the person's name, their three folders and their last pick as the default, and the jelly drops to the greeting and points at the folder they left off in." },
  { name: "home", beats: 9.6, still: 4, title: "Home", role: ["sit", "carry", "land", "sit"], rules: [1, 17, 20, 26, 35],
    what: "Three folders as cards; one folder's stickies get done while you watch, each coin landing as it finishes, and the jelly carries the finished thing into the folder." },
  { name: "build", beats: 6, still: 4, title: "Build", role: ["sit", "carry", "work", "land", "sit"], rules: [7, 16, 20, 25, 27],
    what: "The stage with a list, a page and a run running; your words in the bar, send; a block arrives empty, the jelly carries the spec to it and works beside it while the generator lands its pieces one by one." },
  { name: "call", beats: 7, still: 1, title: "Your call", role: ["sit", "point", "sit"], rules: [8, 11, 17, 26, 33, 36],
    what: "The run stops on a question: its block lifts with the yellow sticker and the jelly points at it; one pill press answers, the sticker goes, the run resumes and the done stamp lands." },
  { name: "cowork", beats: 5.6, still: 4, title: "Cowork", role: ["sit", "carry", "work", "land", "sit"], rules: [14, 17, 21, 26, 37],
    what: "A team thread as a session list with one active row; another person's agent hands over: the jelly carries its spec in, the generator composes the block piece by piece, and a decision lands as a coin." },
  { name: "customize", beats: 7, still: 2, title: "Customize", role: ["sit", "carry", "sit"], rules: [15, 16, 23, 14],
    what: "A side panel of the person's picks: the palette sets, the type cut, the ground; each pick re-lights the whole window live; the jelly sits on the card, carries a new set's band from its swatch to the window, and keeps its pure six." },
  { name: "evening", beats: 4.6, still: 3, title: "Evening", role: ["carry", "land", "sit", "mark"], rules: [21, 23, 34, 35],
    what: "What landed today in big numbers in the display cut; the jelly brings the count and sets it down, then the window closes to the notch and the jelly rests there as the mark." },
];

/** what a day also holds: each the same frame, the same set, the same type, the jelly doing one act (role.ts) */
export const ALSO: readonly SceneInfo[] = [
  { name: "broke", beats: 3, title: "Broke", role: ["sit", "point"], rules: [5, 17, 26, 28, 33, 37],
    what: "A run in Build failed: the printer's quote came back empty. The block keeps its shape; its mark is notched, its row stamped stopped, one plain line says what happened and the one thing to press, while the jelly points at it." },
  { name: "waiting", beats: 2.4, title: "Waiting", role: ["sit", "wait"], rules: [5, 20, 37],
    what: "Cowork, the other person is away: the thread's last row is yours, the handover row says who has it and since when, and the jelly waits; nothing pulses, nothing glows." },
  { name: "dropped", beats: 5, still: 2, title: "Dropped", role: ["carry", "land", "sit"], rules: [8, 18, 26, 36],
    what: "A file dragged into a folder: it lifts over the folder, the folder rises one step, the file lands in its foot, and the jelly carries in the sticky it made from it." },
  { name: "empty", beats: 2.4, title: "Empty", role: ["arrive", "sit"], rules: [1, 31, 38],
    what: "A new folder with nothing in it yet: one sentence from the jelly in the person's words, and the one way to start, drop a file or ask; no grey picture." },
  { name: "first", beats: 3, title: "First", role: ["arrive", "sit"], rules: [2, 26, 31, 38],
    what: "The very first minute, no folders at all: the notch greets without a name, three suggested folders wait as dashed ghosts to take, and the bar says what to type." },
  { name: "small", beats: 1, title: "Small", role: ["sit"], rules: [1, 12, 14],
    what: "The whole Home at 1024 × 640: the side folds to the rail's glyphs, two folders not three, the bar's mode words become glyphs." },
];
/** the seven and then the also, in the strip's order */
export const ALL: readonly SceneInfo[] = [...SCENES, ...ALSO];
export const sceneIndex = (name: string | null) => Math.max(0, ALL.findIndex((s) => s.name === name));
