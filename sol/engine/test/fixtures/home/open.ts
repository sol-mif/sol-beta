// Copied from origin/marco/product-product-sitting-the-751 (5cc927aa) sol/design/home/whole.md l.92-94 ("The seams") and l.149 (`thing.open {id, mode}`), and from MR (origin/marco/mine-run fa6becaf) sol/mac/src/home/whole/foldRules.ts l.6-11 (missedOf) and sol/mac/src/home/whole/today.ts l.63-70 (order) and l.75-79 (lineOf); not imported: the engine never imports sol/mac.
// What the face expects of one thing in both modes (#830). His design: "Open on the stage" moves the thing, never a copy;
// "back to Home, same thing" returns with what changed; the message is `thing.open {id, mode}`. His evening fold counts as
// missed only a Thing that waited on you, was due since this morning and is not done, and his list's order leaves a done
// Thing out: so a job frozen on the stage, once done, is neither on the list nor missed in the evening.
import type { Thing } from "../../../src/contract/home/today.ts";

/** the ask's fields, as his design names them (whole.md l.149) */
export const OPEN_FIELDS = ["id", "mode"];
/** his evening fold's "missed" (foldRules.ts l.8-11), as written there */
export function missedOf(things: Thing[], now: number): Thing[] {
  const d = new Date(now), from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return things.filter((t) => t.due !== undefined && t.due >= from && t.due < now && t.waitsOn === "you" && t.state !== "done");
}
/** his first scene once its first moving job (t-lab-prep) is frozen on the stage: the three still wait, one moves
 *  (today.ts lineOf, l.75-79, for 3 and 1) */
export const AFTER_FREEZE = {
  needs: ["t-chem-set6", "t-maya-data", "t-shopify-app"],
  moving: ["t-bio-notes"],
  line: "Three things need you. One is moving on its own.",
};
