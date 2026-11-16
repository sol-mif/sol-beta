// The action board's own actions (Together, See #31): anyone on the team adds one as one file in this folder, its
// declaration in blocks/blocks.json (a team block of kind "action", #429: id, name, what it does) and one line in the
// list below, landed on a branch like any change (README.md here says how). An action shows in a card's menu when it is
// live in the project in use and `when(card)` says so, after the built-in items; `run` does it. The built-in items
// (open in Work, try it, ask for a review, mark ready, comment, hand to) live in ActionBoard.tsx.
import type { Card, Team } from "../useTeam";
import { blocksOf } from "../blocks";
import copyLink from "./copy-link";

export type ActionDef = {
  when: (card: Card) => boolean;                  // shown for this card?
  run: (card: Card, team: Team) => void | Promise<void>;
};

const DRAWN: Record<string, ActionDef> = { "copy-link": copyLink };
/** every action Sol ships, in blocks.json's order; `name` (the menu's words, lower case, a verb first) from there */
export const ACTIONS: (ActionDef & { id: string; name: string })[] = blocksOf("action").flatMap((b) => (DRAWN[b.id] ? [{ ...DRAWN[b.id], id: b.id, name: b.name }] : []));
