// The generator's one door (#1245, item 1): the engine's block composer calls `compose` with whatever its agent wrote
// for a block, and gets back an element to draw on the person's stage and the notes of what the lint changed (to log, or
// to hand back to the agent so its next spec needs fewer). Never throws: anything at all comes back as something drawn.
import { createElement, type ReactElement } from "react";
import { lint } from "./lint.ts";
import { Draw } from "./render.tsx";
import type { Spec } from "./spec.ts";

export type Composed = { element: ReactElement; notes: string[]; spec: Spec };

export function compose(spec: unknown): Composed {
  const r = lint(spec);
  return { element: createElement(Draw, { spec: r.spec }), notes: r.notes, spec: r.spec };
}

export { lint } from "./lint.ts";
export { PIECES, type Spec, type PieceName } from "./spec.ts";
