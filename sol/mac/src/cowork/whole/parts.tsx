// What a Cowork part draws (#1416): place.ts names a part (its words, its children); this is its face. A team's own part
// registers both, and the shell's rail, crumbs and keys take it with no change to the shell. `useCount` is the small
// number its rail row may carry (what waits on you in it).
import type { ComponentType } from "react";
import type { Place } from "./place";

export type PartView = { View: ComponentType<{ at: Place }>; useCount?: () => number };
const views = new Map<string, PartView>();
export function registerView(part: string, v: PartView) { views.set(part, v); }
export const viewOf = (part: string): PartView | undefined => views.get(part);
