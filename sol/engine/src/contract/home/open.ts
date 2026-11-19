// One thing in both modes (#830, Home 7): the one ask the face sends to move a Thing between Home and the stage. No face
// code sends it yet (specs home-plan §8 item 3); the name and its two fields are Marco's design's, `thing.open {id, mode}`
// (origin/marco/product-product-sitting-the-751, sol/design/home/whole.md l.149). The two modes' words are the engine's
// pick, the same as the event's (contract/kinds.ts thing.open { mode }), kept here alone so one edit renames them:
//   build   "Open on the stage": the Thing goes to Build (the default when no mode is sent)
//   home    "Back to Home, same thing" (whole.md l.93-94)
// The answer is the list itself (contract/home/today.ts TodayMsg): no receipt of its own.
import { z } from "zod";

/** the message's type, as Marco's design names it */
export const OPEN = "thing.open" as const;
/** the two modes, "build" first: the default (the engine's pick of words) */
export const MODES = ["build", "home"] as const;
export const Mode = z.enum(MODES);
export const OpenAsk = z.object({ type: z.literal(OPEN), id: z.string().min(1).max(200), mode: Mode.optional() });

export type Mode = z.infer<typeof Mode>;
export type OpenAsk = z.infer<typeof OpenAsk>;
