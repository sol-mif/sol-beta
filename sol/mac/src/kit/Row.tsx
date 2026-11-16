// A row (#674, look.md: the pearl): a line in a list. At rest it is the glass itself with dim words; on hover the on
// colour's wash; picked, the pearl with deep words (row a, Marco's pick; raised and dot are round 1's alternates, not
// drawn yet). `hover` sets it for a picture; left out, the pointer sets it. `note` is a second, smaller line under the
// title (what a mode does, where a folder is); `lead` a mark before the words, in a 16 px column (#647).
import { useState, type ReactNode } from "react";
import { Glass } from "./Glass";
import { Pearl, type PearlLook } from "./Pearl";
import { deep, dim, ink, mute, on } from "./paint";
import { CURVE, SHADE, TYPE } from "./tokens";

export function Row({ w, h = 36, title, note, lead, aside, picked = false, hover, pearl, onClick }: {
  w: number; h?: number; title: ReactNode; note?: ReactNode; lead?: ReactNode; aside?: ReactNode; picked?: boolean; hover?: boolean; pearl?: PearlLook; onClick?: () => void;
}) {
  const [felt, setFelt] = useState(false), lit = hover ?? felt, r = CURVE.radius.row;
  const words = (
    <div style={{ height: "100%", display: "flex", alignItems: "center", padding: "0 12px", gap: 10 }}>
      {lead != null && <span style={{ flex: "none", width: 16, display: "grid", placeItems: "center" }}>{lead}</span>}
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <span style={{ color: picked ? deep() : lit ? ink : dim, fontWeight: picked ? 500 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
        {note != null && <span style={{ color: picked ? deep(0.6) : lit ? dim : mute, fontSize: TYPE.label[0], lineHeight: `${TYPE.label[1]}px`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{note}</span>}
      </span>
      {aside != null && <span style={{ flex: "none", color: picked ? deep(0.55) : mute, fontSize: TYPE.label[0] }}>{aside}</span>}
    </div>
  );
  return (
    <div onClick={onClick} onPointerEnter={hover === undefined ? () => setFelt(true) : undefined} onPointerLeave={hover === undefined ? () => setFelt(false) : undefined}>
      {picked ? <Pearl w={w} h={h} r={r} look={pearl}>{words}</Pearl>
        : <Glass w={w} h={h} r={r} edge={0} fill={lit ? on(SHADE.on.hover) : "transparent"}>{words}</Glass>}
    </div>
  );
}
