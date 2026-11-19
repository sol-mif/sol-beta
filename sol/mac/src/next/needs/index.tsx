// owned by slice 2 (Needs), docs/port/slices.md
// The Needs slot's entry (#1615; slots.ts loads it lazily). The shell mounts it three ways (part): "view" at dist needs
// (the ranked list), "line" in #line (the ask or peek line) and "toomuch" while S.calm. Two more parts draw a piece of it
// alone, for the dev page's ?slot=needs&part=… and for the plane at the join: "arrivals" (in `region`, or all) and
// "offer". Signed: marcocyl04-ux's agent, slice 2 of the port (#1615).
import type { SlotProps } from "../slots.ts";
import { Needs as List } from "./Needs.tsx";
import { Line } from "./Line.tsx";
import { TooMuch } from "./TooMuch.tsx";
import { Arrivals } from "./Arrivals.tsx";
import { Offer } from "./Offer.tsx";
import "./needs.css";

export default function Needs(p: SlotProps) {
  switch (p.part) {
    case "line": return <Line />;
    case "toomuch": return <TooMuch />;
    case "arrivals": return <div className="nd-page"><Arrivals region={p.region} piece={typeof p.piece === "string" ? p.piece : undefined} /></div>;
    case "offer": return <Offer />;
    default: return <List />;
  }
}
