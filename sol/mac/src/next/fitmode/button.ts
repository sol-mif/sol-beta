// The brush in the bottom bar (BR1 people, #1615; customize.html "Fit Sol becomes Customize"): the bar (bar/Bar.tsx,
// builder E's) draws the button from these props, as its other verbs: data-bar="customize", aria-pressed={pressed},
// onClick={onPress}, and the icon's paths in its 24-unit box. Customize itself is Customize.tsx.
// Signed: marcocyl04-ux's agent, BR1 people (#1615).
import { M } from "../cv/index.ts";
import { FMs } from "../cv/moves/fitmode.ts";

/** the brush: a bristle head and its handle */
export const BRUSH = ["M13.5 4.5l6 6-7 7-6-6z", "M6.5 11.5c-2.2.3-3.5 2-3.5 4.2 0 1.6-.6 2.6-1.5 3.3 3.4 1 7.6.3 8.5-3.5"];
export function customizeButton() {
  return { id: "customize" as const, label: "Customize", icon: BRUSH, pressed: FMs().cu, onPress: () => { M.cuToggle(); } };
}
