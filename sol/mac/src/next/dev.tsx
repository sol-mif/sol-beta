// The new face's dev page (#1604; sol/mac/next.html): the shell on the fixture, never on an engine. ?scen=<id> loads one
// of the mockup's scenarios (cv/fixture.ts; dev-morning when unsaid), &slot=<name>[&region=<id>][&band=far|middle]
// draws that one slot alone, for a slice tried before the others land. It exposes window.CV (D, S, M, load, answer,
// say, …) here only, for the counts (sol/test/e2e/next). Signed: marcocyl04-ux's agent, the port's prep (#1615).
import { createRoot } from "react-dom/client";
import * as CV from "./cv/index.ts";
import { FIXTURE } from "./cv/fixture.ts";
import { Shell } from "./Next.tsx";
import { SLOTS, type SlotName, type SlotProps } from "./slots.ts";

const q = new URLSearchParams(location.search);
const scen = q.get("scen") || "dev-morning";
if (!FIXTURE[scen]) console.error(`next: no scenario "${scen}"; the scenarios are ${Object.keys(FIXTURE).join(", ")}`);
CV.load(FIXTURE[scen] ? scen : "dev-morning");
const slot = q.get("slot") as SlotName | null;
const only = slot && SLOTS.includes(slot)
  ? { name: slot, props: { region: q.get("region") ?? undefined, band: (q.get("band") as SlotProps["band"]) ?? undefined, part: q.get("part") ?? undefined } }
  : undefined;
// the counts' handle on the store, as the mockup's window.CV: live bindings, read at the moment
(window as unknown as { CV: unknown }).CV = Object.defineProperties({ ...CV, scenarios: Object.keys(FIXTURE) }, {
  D: { get: () => CV.D }, S: { get: () => CV.S }, SCN: { get: () => CV.SCN }, MODE: { get: () => CV.MODE },
});
createRoot(document.getElementById("root")!).render(<Shell only={only} />);
