// The brush in the bottom bar (BR1 people, #1615; customize.html "Fit Sol becomes Customize"): the bar (bar/Bar.tsx,
// builder E's) draws the button from these props, as its other verbs: data-bar="customize", aria-pressed={pressed},
// onClick={onPress}, and the kit's icon name (the pen). Customize itself is Customize.tsx.
// Signed: marcocyl04-ux's agent, BR1 people (#1615).
import { M } from "../cv/index.ts";
import type { IconName } from "../../kit/icons";   // the pen: drawn by the kit's icon module (#1879 step 5)
import { FMs } from "../cv/moves/fitmode.ts";

export function customizeButton() {
  return { id: "customize" as const, label: "Customize", icon: "customize" as IconName, pressed: FMs().cu, onPress: () => { M.cuToggle(); } };
}
