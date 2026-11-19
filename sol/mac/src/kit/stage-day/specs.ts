// The two blocks the day composes on the fly (#1245, items 2 and 3): what the agent says, a sentence, made a spec by
// gen/say.ts (the second run: the source of the spec is the sentence now). As the generator's specs
// (kit/gen/spec.ts, PIECES only, no colour, size, font or motion of their own). Pure data with no React, so the test
// checks under plain node that the lint leaves both as written (no notes): a spec with notes is a spec to fix, never
// one to ship. Build's is a run card, Cowork's a handover; render.tsx's Gen draws them with the kit's own pieces.
import { say } from "../gen/say.ts";
import type { Spec } from "../gen/spec.ts";

/** Build (scene 3): what the agent says for the run that drew two covers from the photo essay; gen/say.ts composes it,
 *  and its pieces land in this order */
export const RUN_SAID = "a run drawing two covers from the photo essay, two steps called the front and the back, 2 of 2, with a done stamp at 9:04";
export const RUN_CARD: Spec = say(RUN_SAID);

/** the other person on the café's team, in the day's story (never sample content, rule 38) */
export const SAM = "Sam";

/** Cowork (scene 5): what another person's agent says as it hands an order over: who it is from, the two sessions it
 *  holds (the one you are in pearl, rule 14), and the decision left to you as a coin (rule 17: a meaning is a coin) */
export const HANDOVER_SAID = `a handover of the oat milk order from ${SAM}'s agent: two sessions called the dairy's price and delivery days, one active, a decision to pay on delivery friday, yours now`;
export const HANDOVER: Spec = say(HANDOVER_SAID);

/** the agent's line in the notch for the beat before its block lands: "composing: a run drawing two covers…", cut at a
 *  word to the notch's words (frame.tsx NotchStrip, 207 wide at the label size: about 38 letters) */
export const composing = (said: string, max = 26) => `composing: ${said.length > max ? `${said.slice(0, max).replace(/\s+\S*$/, "").replace(/[,:]$/, "")}…` : said}`;

/** the spec as it stands after its first `n` pieces have landed: the block arrives empty, then one piece at a time */
export const upTo = (s: Spec, n?: number): Spec => (n == null ? s : { ...s, children: (s.children ?? []).slice(0, Math.max(0, n)) });
export const piecesOf = (s: Spec) => s.children?.length ?? 0;
