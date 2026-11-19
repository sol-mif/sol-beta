// Our Cowork, one setup of the mechanism (#1416, objective 1): the parts the anchor and a project carry today, each
// registered as any team's part would be (place.ts registerPart, parts.tsx registerView). The shell reads them; it
// names none. For you stands above the projects (an anchor); the rest are a project's. System's children are the map's
// clusters and the parts in them, named by the map as it reads them.
import { registerPart } from "./place";
import { registerView } from "./parts";
import { ForYou, Guardrails, People, Room, SystemPart, useForYouCount } from "./tabs";
import { Releases } from "../Releases";
import { MapPart } from "../map/MapPart";   // the map of the team's work, drawn from the engine's spec (#1433)

registerPart("foryou", { label: "For you", anchor: true });
registerView("foryou", { View: ForYou, useCount: useForYouCount });
registerPart("map", { label: "Map" });
registerView("map", { View: ({ at }) => <MapPart at={at} room="room" /> });
registerPart("system", { label: "System" });
registerView("system", { View: SystemPart });
registerPart("room", { label: "Agents' room" });
registerView("room", { View: Room });
registerPart("people", { label: "People" });
registerView("people", { View: People });
registerPart("releases", { label: "Releases" });
registerView("releases", { View: () => <Releases /> });
registerPart("guard", { label: "Guardrails" });
registerView("guard", { View: Guardrails });
