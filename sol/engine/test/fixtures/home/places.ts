// Copied from MR (origin/marco/mine-run fa6becaf) sol/mac/src/home/whole/places.ts l.25-26 (disk, yours), l.32, l.40-44 (his seed's folders on disk and places you made), l.59 (inPlace), and sol/mac/src/home-side.test.ts l.22, l.28, l.43 (the values his tests expect); not imported: the engine never imports sol/mac.
// The side as his face's stub has it, for the half the engine can send tonight: folders on disk and places you made. His
// Canvas courses (bio 201, chem 110, stats 140 "from Canvas") and his people are not here: the engine has no Canvas
// source and no source of people.
import type { PlaceItem } from "../../../src/contract/home/places.ts";

/** the things in a place and below it (his inPlace, l.59; Thing narrowed to its folder) */
export const inPlace = <T extends { folder: string }>(p: PlaceItem, things: T[]): T[] => things.filter((t) => t.folder === p.path || t.folder.startsWith(`${p.path} › `));

/** the empty view's example rows the side must never show (home-side.test.ts l.28) */
export const EXAMPLES = ["your areas", "pinned tools", "calendar", "browser", "whiteboard"];

/** "school is your folder on disk" (home-side.test.ts l.22): the label of ~/School */
export const SCHOOL_LABEL = "~/School";
/** his folders on disk (places.ts l.32, l.40-41): [path, label] */
export const ON_DISK: [string, string][] = [["school", "~/School"], ["jobs", "~/Jobs"], ["jobs › applications", "~/Jobs/applications"]];
/** what a place you made says of itself (places.ts l.26) */
export const YOURS = { source: "you", ref: "you", label: "a place you made" } as const;
/** the Things under school in his first scene (home-side.test.ts l.43), all three on disk under ~/School */
export const UNDER_SCHOOL = ["t-bio-notes", "t-chem-set6", "t-lab-prep"];
