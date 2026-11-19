// A block the agent composes on the stage while you watch (#1245, item 2): the generator's own `Gen` (kit/gen/render.tsx)
// draws the spec, cut to the pieces that have landed so far (specs.ts upTo). The block arrives empty, its title only;
// each piece lands as it is added, on the system's land move (motion.ts, rule 26), and only the new one moves (rule 20).
// Under reduced motion the scene is at its last step, every piece in at once (rule 30). What the lint changed stays out of
// the window: the dev console hears it, the person never does.
import { dur, ease } from "../../motion";
import { Gen } from "../gen/render";
import type { Spec } from "../gen/spec";
import { SYSTEM } from "../tokens";
import { upTo } from "./specs";

const LAND = SYSTEM.move.land.from;
/** each piece the agent adds lands: up from a little below, a little small. Through the individual transform properties,
 *  so a sticker's own tilt (its `transform`) stays its own. Only a node that is new animates; the drawn ones stay still */
const PIECE_LANDS = `
@keyframes gen-piece { from { translate: 0 ${LAND[1]}px; scale: ${LAND[0]}; opacity: 0 } to { translate: 0 0; scale: 1; opacity: 1 } }
[data-composing] [data-gen="Block"] > div > div > * { animation: gen-piece ${dur("land")}ms ${ease("pour")} both }
@media (prefers-reduced-motion: reduce) { [data-composing] [data-gen="Block"] > div > div > * { animation: none } }
`;

/** the lint's notes, for whoever builds the page: never drawn */
const hear = (what: string) => (notes: string[]) => {
  if (notes.length && import.meta.env.DEV) console.warn(`gen · ${what}: the lint rewrote the spec`, notes);
};

/** the generated block at `x, y` on the stage, `w` wide, with its first `n` pieces landed (all when n is left out); `id`
 *  is what the jelly looks at while it works beside it. `land`: the empty block itself arrives (rule 26) */
export function GenBlock({ spec, x, y, w, n, id, land }: { spec: Spec; x: number; y: number; w: number; n?: number; id?: string; land?: boolean }) {
  const s = upTo({ ...spec, props: { ...spec.props, w } }, n);
  return (
    <div id={id} data-composing={n != null || undefined} data-gen-of={String(spec.props.title)}
      style={{ position: "absolute", left: x, top: y, width: w, animation: land ? `ac-land ${dur("land")}ms ${ease("pour")} both` : undefined }}>
      <style>{PIECE_LANDS}</style>
      <Gen spec={s} onNotes={hear(String(spec.props.title))} />
    </div>
  );
}
